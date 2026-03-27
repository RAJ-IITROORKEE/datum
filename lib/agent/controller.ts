/**
 * Agent Controller
 * 
 * The main orchestration loop for the agentic system.
 * Implements the ReAct (Reason + Act) pattern with tool execution.
 */

import { OpenRouter } from "@openrouter/sdk";
import {
  AgentState,
  AgentTool,
  AgentConfig,
  DEFAULT_AGENT_CONFIG,
  AgentProgressEvent,
  ParsedAgentOutput,
  PlannedStep,
  AgentPlan,
} from "./types";
import {
  createAgentState,
  startStep,
  completeStep,
  completeAgent,
  failAgent,
  updateStage,
  buildObservationsContext,
  getStepsSummary,
} from "./state";
import { createAgentPrompt, createContinuationPrompt, createPlanningPrompt } from "./prompts";
import { parseAgentOutput, parsePlanOutput, formatObservation, resolveToolAlias, AgentParseError } from "./parser";
import { executeToolNormalized, resolveDefaultLevelId } from "./executor";
import { AgentLogger, createLogger } from "./logger";

/**
 * Create OpenRouter client
 */
function getOpenRouterClient(): OpenRouter {
  return new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY!,
  });
}

/**
 * Options for agent execution
 */
export interface AgentRunOptions {
  /** User ID for tool execution */
  userId: string;
  
  /** User's goal/request */
  goal: string;
  
  /** Available tools */
  tools: AgentTool[];
  
  /** Conversation context */
  context?: string;
  
  /** Configuration overrides */
  config?: Partial<AgentConfig>;
  
  /** Progress callback for streaming updates */
  onProgress?: (event: AgentProgressEvent) => void;
  
  /** Logger instance */
  logger?: AgentLogger;
}

/**
 * Result of agent execution
 */
export interface AgentResult {
  success: boolean;
  finalAnswer?: string;
  error?: string;
  state: AgentState;
  executionTimeMs: number;
}

/**
 * Call LLM with retries
 */
async function callLLM(
  prompt: string,
  config: AgentConfig,
  logger: AgentLogger
): Promise<string> {
  const client = getOpenRouterClient();
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= config.retry.maxRetries; attempt++) {
    try {
      logger.debug("Calling LLM", { model: config.model, attempt: attempt + 1 });
      
      const response = await client.chat.send({
        chatGenerationParams: {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          maxTokens: config.maxTokens,
          temperature: config.temperature,
        },
      });
      
      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from LLM");
      }
      
      logger.debug("LLM response received", { length: content.length });
      return content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn("LLM call failed", { attempt: attempt + 1, error: lastError.message });
      
      if (attempt < config.retry.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, config.retry.backoffMs * (attempt + 1)));
      }
    }
  }
  
  throw lastError || new Error("LLM call failed after retries");
}

/**
 * Create a progress event
 */
function createProgressEvent(
  type: AgentProgressEvent["type"],
  state: AgentState,
  message: string,
  extra: Partial<AgentProgressEvent> = {}
): AgentProgressEvent {
  const summary = getStepsSummary(state);
  
  return {
    type,
    stage: state.stage,
    message,
    step: state.currentStepNumber > 0 ? {
      number: state.currentStepNumber,
      total: Math.max(state.steps.length, state.currentStepNumber),
      thought: state.steps[state.currentStepNumber - 1]?.thought,
      action: state.steps[state.currentStepNumber - 1]?.action,
      toolName: state.steps[state.currentStepNumber - 1]?.action !== "final_answer" 
        ? state.steps[state.currentStepNumber - 1]?.action 
        : undefined,
    } : undefined,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Generate initial plan (optional planning phase)
 */
export async function generatePlan(
  goal: string,
  tools: AgentTool[],
  context: string | undefined,
  config: AgentConfig,
  logger: AgentLogger
): Promise<AgentPlan> {
  const prompt = createPlanningPrompt(tools, goal, context);
  
  logger.info("Generating execution plan");
  const response = await callLLM(prompt, config, logger);
  
  const toolNames = new Set(tools.map((t) => t.name));
  const plan = parsePlanOutput(response, toolNames);
  
  logger.info("Plan generated", { 
    steps: plan.steps.length, 
    needsMoreInfo: plan.needsMoreInfo 
  });
  
  return plan;
}

/**
 * Run the agent loop
 * 
 * This is the main ReAct loop that:
 * 1. Calls LLM to get thought + action
 * 2. Executes the action (tool call)
 * 3. Observes the result
 * 4. Feeds observation back to LLM
 * 5. Repeats until goal achieved or max iterations
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentResult> {
  const config = { ...DEFAULT_AGENT_CONFIG, ...options.config };
  const logger = options.logger || createLogger(config.debug);
  const startTime = Date.now();
  
  logger.info("Starting agent", { goal: options.goal, toolCount: options.tools.length });
  
  // Initialize state
  let state = createAgentState(options.goal, options.tools, config);
  state = updateStage(state, "planning");
  
  const emitProgress = (event: AgentProgressEvent) => {
    logger.debug("Progress event", { type: event.type, message: event.message });
    options.onProgress?.(event);
  };
  
  // Emit initial planning event
  emitProgress(createProgressEvent("planning", state, "Analyzing request and preparing execution..."));
  
  try {
    // Main agent loop
    while (!state.isComplete && state.currentStepNumber < config.maxIterations) {
      state = updateStage(state, "thinking");
      
      // Build prompt with context and observations
      const observations = buildObservationsContext(state);
      const prompt = state.currentStepNumber === 0
        ? createAgentPrompt(options.tools, options.goal, options.context, observations)
        : createContinuationPrompt(
            options.tools,
            options.goal,
            state.steps
              .filter((s) => s.completedAt)
              .map((s) => ({
                step: { toolName: s.action, args: s.input, description: s.action },
                result: s.observation,
                success: s.success,
              })),
            state.steps[state.currentStepNumber - 1]?.observation || "No observation"
          );
      
      // Get LLM response
      emitProgress(createProgressEvent("thinking", state, "Reasoning about next action..."));
      
      let agentOutput: ParsedAgentOutput;
      try {
        const llmResponse = await callLLM(prompt, config, logger);
        agentOutput = parseAgentOutput(llmResponse);
        logger.info("Agent decided", { action: agentOutput.action, thought: agentOutput.thought.slice(0, 100) });
      } catch (error) {
        if (error instanceof AgentParseError && error.recoverable) {
          logger.warn("Parse error, attempting recovery", { error: error.message });
          // Try one more time with explicit instruction
          const retryPrompt = prompt + "\n\nIMPORTANT: Your last response was not valid JSON. Please respond with ONLY a JSON object in the exact format specified.";
          const retryResponse = await callLLM(retryPrompt, config, logger);
          agentOutput = parseAgentOutput(retryResponse);
        } else {
          throw error;
        }
      }
      
      // Check for terminal action
      if (agentOutput.isTerminal) {
        logger.info("Agent reached terminal state", { finalAnswer: agentOutput.final_answer?.slice(0, 100) });
        state = completeAgent(state, agentOutput.final_answer || "Goal achieved.");
        emitProgress(createProgressEvent("completed", state, "Execution complete", {
          finalAnswer: state.finalAnswer,
        }));
        break;
      }
      
      // Start executing the action
      state = startStep(state, agentOutput.thought, agentOutput.action, agentOutput.input);
      state = updateStage(state, "executing");
      
      emitProgress(createProgressEvent("executing", state, `Executing ${agentOutput.action}...`, {
        step: {
          number: state.currentStepNumber,
          total: state.currentStepNumber,
          thought: agentOutput.thought,
          action: agentOutput.action,
          toolName: agentOutput.action,
        },
      }));
      
      // Execute the tool
      const resolvedToolName = resolveToolAlias(agentOutput.action, state.availableToolNames);
      
      if (!state.availableToolNames.has(resolvedToolName)) {
        // Tool not available - complete step with error
        const errorMsg = `Tool "${agentOutput.action}" is not available. Available tools: ${Array.from(state.availableToolNames).join(", ")}`;
        state = completeStep(state, errorMsg, false, errorMsg);
        logger.warn("Tool not available", { requested: agentOutput.action, resolved: resolvedToolName });
        
        emitProgress(createProgressEvent("error", state, errorMsg, {
          error: errorMsg,
        }));
        continue; // Let agent try again with correct tool
      }
      
      // Execute with level resolver for create_wall
      const levelResolver = () => resolveDefaultLevelId(options.userId);
      const result = await executeToolNormalized(
        options.userId,
        resolvedToolName,
        agentOutput.input,
        levelResolver
      );
      
      // Format observation
      const observation = formatObservation(resolvedToolName, result.result ?? result.error, result.success);
      state = completeStep(state, observation, result.success, result.error);
      state = updateStage(state, "observing");
      
      logger.info("Tool executed", {
        tool: resolvedToolName,
        success: result.success,
        transport: result.transport,
        durationMs: result.executionTimeMs,
      });
      
      emitProgress(createProgressEvent("observation", state, 
        result.success ? `${resolvedToolName} completed successfully` : `${resolvedToolName} failed: ${result.error}`,
        {
          observation: observation.slice(0, 500),
        }
      ));
    }
    
    // Check if we hit max iterations without completing
    if (!state.isComplete) {
      const errorMsg = `Agent reached maximum iterations (${config.maxIterations}) without completing the goal.`;
      state = failAgent(state, errorMsg);
      logger.error("Max iterations reached", { iterations: state.currentStepNumber });
      
      emitProgress(createProgressEvent("error", state, errorMsg, { error: errorMsg }));
    }
    
    const executionTimeMs = Date.now() - startTime;
    logger.info("Agent finished", {
      success: !state.error,
      steps: state.currentStepNumber,
      executionTimeMs,
    });
    
    return {
      success: !state.error,
      finalAnswer: state.finalAnswer,
      error: state.error,
      state,
      executionTimeMs,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown agent error";
    state = failAgent(state, errorMsg);
    
    logger.error("Agent error", { error: errorMsg });
    emitProgress(createProgressEvent("error", state, errorMsg, { error: errorMsg }));
    
    return {
      success: false,
      error: errorMsg,
      state,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Run agent with optional planning phase
 * 
 * This version first generates a plan, then executes it.
 * Useful for complex multi-step tasks.
 */
export async function runAgentWithPlanning(options: AgentRunOptions): Promise<AgentResult> {
  const config = { ...DEFAULT_AGENT_CONFIG, ...options.config };
  const logger = options.logger || createLogger(config.debug);
  
  // Generate plan first
  const plan = await generatePlan(options.goal, options.tools, options.context, config, logger);
  
  // If plan needs more info, return early
  if (plan.needsMoreInfo) {
    const state = createAgentState(options.goal, options.tools, config);
    return {
      success: false,
      error: plan.clarificationQuestion || "Need more information to proceed.",
      state: failAgent(state, "Clarification needed"),
      executionTimeMs: 0,
    };
  }
  
  // Run the agent with the planned context
  const planContext = `
EXECUTION PLAN:
${plan.analysis}

PLANNED STEPS:
${plan.steps.map((s, i) => `${i + 1}. ${s.toolName}: ${s.description}`).join("\n")}

Execute these steps in order, adapting as needed based on results.
`;
  
  return runAgent({
    ...options,
    context: options.context ? `${options.context}\n\n${planContext}` : planContext,
  });
}
