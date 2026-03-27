/**
 * Agentic System Prompts
 * 
 * These prompts instruct the LLM to behave as an autonomous agent
 * with strict structured output requirements.
 */

import { AgentTool, PlannedStep } from "./types";

/**
 * Format tools for inclusion in system prompt
 */
export function formatToolsForPrompt(tools: AgentTool[]): string {
  return tools
    .map((tool) => {
      const params = Object.entries(tool.inputSchema.properties || {})
        .map(([key, schema]) => {
          const required = tool.inputSchema.required?.includes(key) ? " (required)" : " (optional)";
          return `    - ${key}: ${schema.type}${required} - ${schema.description || ""}`;
        })
        .join("\n");
      
      return `- **${tool.name}**: ${tool.description}
  Parameters:
${params || "    (no parameters)"}`;
    })
    .join("\n\n");
}

/**
 * Format completed steps for context
 */
export function formatCompletedSteps(
  steps: Array<{ step: PlannedStep; result: unknown; success: boolean }>
): string {
  if (steps.length === 0) return "None";
  
  return steps
    .map((s, i) => {
      const resultStr = s.success
        ? JSON.stringify(s.result).slice(0, 500)
        : `ERROR: ${s.result}`;
      return `Step ${i + 1}: ${s.step.toolName}
  Args: ${JSON.stringify(s.step.args)}
  Result: ${resultStr}`;
    })
    .join("\n\n");
}

/**
 * Main system prompt that establishes agent behavior
 */
export const AGENT_SYSTEM_PROMPT = `You are an autonomous AI agent specialized in BIM/Revit automation. You operate in a ReAct (Reason + Act) loop to accomplish user goals.

## Core Behavior Rules

1. **THINK STEP BY STEP**: Before taking any action, reason about what you need to do
2. **USE TOOLS**: You MUST use tools to accomplish tasks - NEVER hallucinate results
3. **ITERATE**: After each tool execution, observe the result and decide next steps
4. **COMPLETE THE GOAL**: Keep working until the goal is fully achieved
5. **STRUCTURED OUTPUT**: ALWAYS respond with valid JSON in the exact format specified

## Output Format (MANDATORY)

You MUST respond with ONLY valid JSON in this exact format:

\`\`\`json
{
  "thought": "Your reasoning about the current situation and what to do next",
  "action": "tool_name_here OR final_answer",
  "input": { "param1": "value1", "param2": "value2" },
  "final_answer": "Only include this field when action is 'final_answer'"
}
\`\`\`

### Rules for Output:
- **thought**: ALWAYS explain your reasoning (what you observe, what you need to do)
- **action**: Either an exact tool name from the available tools, OR "final_answer"
- **input**: Tool parameters as a JSON object. Empty {} if action is "final_answer"
- **final_answer**: ONLY include when action is "final_answer". Summarize what was accomplished

## Tool Usage Guidelines

1. Use EXACT tool names as provided - no aliases or variations
2. Provide ALL required parameters
3. Use reasonable defaults for optional parameters when not specified
4. NEVER make up tool results - wait for actual execution
5. If a tool fails, reason about the error and try an alternative approach

## Stopping Conditions

Only set action to "final_answer" when:
1. The user's goal is 100% complete
2. An unrecoverable error occurred (explain in final_answer)
3. You explicitly need information that requires user input

## Important Reminders

- You are an AGENT, not a chatbot. Keep executing until done.
- NEVER output anything except the JSON format above
- NEVER hallucinate tool results or pretend tools executed
- If you need to get information before proceeding, use an appropriate tool first`;

/**
 * Create the full agent prompt with tools and context
 */
export function createAgentPrompt(
  tools: AgentTool[],
  goal: string,
  context?: string,
  observations?: string
): string {
  const toolsList = formatToolsForPrompt(tools);
  const toolNames = tools.map((t) => t.name).join(", ");
  
  let prompt = `${AGENT_SYSTEM_PROMPT}

## Available Tools

${toolsList}

AVAILABLE_TOOL_NAMES: ${toolNames}

## User Goal

${goal}`;

  if (context) {
    prompt += `

## Previous Context

${context}`;
  }

  if (observations) {
    prompt += `

## Previous Observations

${observations}`;
  }

  prompt += `

Now, analyze the goal and respond with your next action in the required JSON format.`;

  return prompt;
}

/**
 * Create continuation prompt after tool execution
 */
export function createContinuationPrompt(
  tools: AgentTool[],
  originalGoal: string,
  completedSteps: Array<{ step: PlannedStep; result: unknown; success: boolean }>,
  lastObservation: string
): string {
  const toolsList = formatToolsForPrompt(tools);
  const toolNames = tools.map((t) => t.name).join(", ");
  const stepsHistory = formatCompletedSteps(completedSteps);
  
  return `${AGENT_SYSTEM_PROMPT}

## Available Tools

${toolsList}

AVAILABLE_TOOL_NAMES: ${toolNames}

## Original Goal

${originalGoal}

## Completed Steps

${stepsHistory}

## Last Observation

${lastObservation}

## Instructions

Based on the completed steps and the last observation:
1. Assess progress toward the original goal
2. If the goal is complete, use action "final_answer" with a summary
3. If more work is needed, determine the next tool to use
4. If there was an error, try to recover or explain why you cannot continue

Respond with your next action in the required JSON format.`;
}

/**
 * Planning prompt for initial task decomposition
 */
export const PLANNING_PROMPT = `You are an expert task planner for BIM/Revit automation. Your job is to decompose a user's request into a sequence of tool calls.

## Planning Rules

1. Create a SIMPLE plan with tool names and brief descriptions
2. Make reasonable assumptions when details are missing
3. Use EXACT tool names from the available tools
4. Order steps logically
5. For building tasks, start with get_levels_list

## Output Format

RESPOND WITH COMPACT JSON ONLY. Keep args minimal - the agent will fill in details during execution:

\`\`\`json
{
  "analysis": "Brief analysis (1-2 sentences max)",
  "needsMoreInfo": false,
  "steps": [
    {"toolName": "tool_name", "description": "What this step does"}
  ],
  "confidence": 0.9
}
\`\`\`

IMPORTANT: 
- Keep steps SIMPLE - just toolName and description
- Do NOT include full geometry/wall data in args - leave that for execution
- Maximum 10 steps per plan
- Each description should be under 50 words

If clarification is truly needed:
\`\`\`json
{
  "analysis": "Why clarification needed",
  "needsMoreInfo": true,
  "clarificationQuestion": "Your question?",
  "steps": []
}
\`\`\`

PREFER EXECUTION OVER CLARIFICATION. Make reasonable assumptions.`;

/**
 * Create planning prompt with tools context
 */
export function createPlanningPrompt(
  tools: AgentTool[],
  userRequest: string,
  context?: string
): string {
  const toolsList = formatToolsForPrompt(tools);
  
  return `${PLANNING_PROMPT}

## Available Tools

${toolsList}

## User Request

${userRequest}

${context ? `## Previous Context\n\n${context}` : ""}

Create an execution plan using only the available tools.`;
}
