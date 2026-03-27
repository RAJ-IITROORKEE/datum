/**
 * Agent State Manager
 * 
 * Manages the state of an agent execution session,
 * including history, memory, and progress tracking.
 */

import {
  AgentState,
  AgentStage,
  AgentStep,
  AgentTool,
  AgentMemory,
  ToolExecutionResult,
  AgentConfig,
  DEFAULT_AGENT_CONFIG,
} from "./types";
/**
 * Generate a UUID without external dependency
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a unique step ID
 */
function generateStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new agent state
 */
export function createAgentState(
  goal: string,
  tools: AgentTool[],
  config: Partial<AgentConfig> = {}
): AgentState {
  const mergedConfig = { ...DEFAULT_AGENT_CONFIG, ...config };
  
  return {
    sessionId: generateUUID(),
    stage: "idle",
    originalGoal: goal,
    steps: [],
    currentStepNumber: 0,
    availableTools: tools,
    availableToolNames: new Set(tools.map((t) => t.name)),
    maxIterations: mergedConfig.maxIterations,
    isComplete: false,
    startedAt: new Date().toISOString(),
    metadata: {},
  };
}

/**
 * Create a new agent memory
 */
export function createAgentMemory(): AgentMemory {
  return {
    conversationHistory: [],
    extractedFacts: {},
    toolResultsCache: new Map(),
    workingState: {},
  };
}

/**
 * Start a new step in the agent state
 */
export function startStep(
  state: AgentState,
  thought: string,
  action: string,
  input: Record<string, unknown>
): AgentState {
  const stepNumber = state.currentStepNumber + 1;
  
  const newStep: AgentStep = {
    id: generateStepId(),
    stepNumber,
    thought,
    action,
    input,
    success: false, // Will be updated on completion
    startedAt: new Date().toISOString(),
  };
  
  return {
    ...state,
    stage: "executing",
    steps: [...state.steps, newStep],
    currentStepNumber: stepNumber,
  };
}

/**
 * Complete a step with an observation
 */
export function completeStep(
  state: AgentState,
  observation: string,
  success: boolean,
  error?: string
): AgentState {
  const completedAt = new Date().toISOString();
  
  const updatedSteps = state.steps.map((step) => {
    if (step.stepNumber === state.currentStepNumber) {
      const startTime = new Date(step.startedAt).getTime();
      const endTime = new Date(completedAt).getTime();
      
      return {
        ...step,
        observation,
        success,
        error,
        completedAt,
        durationMs: endTime - startTime,
      };
    }
    return step;
  });
  
  return {
    ...state,
    stage: success ? "observing" : "error",
    steps: updatedSteps,
  };
}

/**
 * Mark agent as complete
 */
export function completeAgent(
  state: AgentState,
  finalAnswer: string
): AgentState {
  const completedAt = new Date().toISOString();
  const startTime = new Date(state.startedAt).getTime();
  const endTime = new Date(completedAt).getTime();
  
  return {
    ...state,
    stage: "completed",
    isComplete: true,
    finalAnswer,
    completedAt,
    totalDurationMs: endTime - startTime,
  };
}

/**
 * Mark agent as failed
 */
export function failAgent(state: AgentState, error: string): AgentState {
  const completedAt = new Date().toISOString();
  const startTime = new Date(state.startedAt).getTime();
  const endTime = new Date(completedAt).getTime();
  
  return {
    ...state,
    stage: "error",
    isComplete: true,
    error,
    completedAt,
    totalDurationMs: endTime - startTime,
  };
}

/**
 * Update agent stage
 */
export function updateStage(state: AgentState, stage: AgentStage): AgentState {
  return { ...state, stage };
}

/**
 * Add message to memory
 */
export function addToMemory(
  memory: AgentMemory,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  name?: string
): AgentMemory {
  return {
    ...memory,
    conversationHistory: [
      ...memory.conversationHistory,
      {
        role,
        content,
        name,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Cache a tool result
 */
export function cacheToolResult(
  memory: AgentMemory,
  toolName: string,
  result: ToolExecutionResult
): AgentMemory {
  const newCache = new Map(memory.toolResultsCache);
  newCache.set(`${toolName}-${Date.now()}`, result);
  
  return {
    ...memory,
    toolResultsCache: newCache,
  };
}

/**
 * Update working state
 */
export function updateWorkingState(
  memory: AgentMemory,
  key: string,
  value: unknown
): AgentMemory {
  return {
    ...memory,
    workingState: {
      ...memory.workingState,
      [key]: value,
    },
  };
}

/**
 * Extract facts from tool result and store in memory
 */
export function extractAndStoreFacts(
  memory: AgentMemory,
  toolName: string,
  result: unknown
): AgentMemory {
  const facts: Record<string, unknown> = { ...memory.extractedFacts };
  
  // Extract level IDs from get_levels_list
  if (toolName === "get_levels_list" && result && typeof result === "object") {
    const levelId = extractFirstLevelId(result);
    if (levelId !== null) {
      facts.defaultLevelId = levelId;
    }
    facts.levelsResult = result;
  }
  
  // Extract created element IDs
  if (toolName === "create_wall" && result && typeof result === "object") {
    const created = (result as Record<string, unknown>).createdWallIds;
    if (Array.isArray(created)) {
      facts.createdWallIds = [
        ...((facts.createdWallIds as number[]) || []),
        ...created,
      ];
    }
  }
  
  return {
    ...memory,
    extractedFacts: facts,
  };
}

/**
 * Helper to extract first level ID from levels result
 */
function extractFirstLevelId(result: unknown): number | null {
  const raw = JSON.stringify(result ?? "");
  const levelRegex = /"(?:levelId|id)"\s*:\s*(\d+)/i;
  const match = levelRegex.exec(raw);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

/**
 * Build observations string from completed steps
 */
export function buildObservationsContext(state: AgentState): string {
  return state.steps
    .filter((step) => step.observation)
    .map((step) => 
      `Step ${step.stepNumber} (${step.action}): ${step.success ? "SUCCESS" : "FAILED"}\n${step.observation}`
    )
    .join("\n\n");
}

/**
 * Get summary of completed steps
 */
export function getStepsSummary(state: AgentState): {
  total: number;
  completed: number;
  failed: number;
  successful: number;
} {
  const completed = state.steps.filter((s) => s.completedAt);
  const successful = completed.filter((s) => s.success);
  const failed = completed.filter((s) => !s.success);
  
  return {
    total: state.steps.length,
    completed: completed.length,
    failed: failed.length,
    successful: successful.length,
  };
}
