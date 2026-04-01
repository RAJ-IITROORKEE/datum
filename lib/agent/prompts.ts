/**
 * Agentic System Prompts
 * 
 * These prompts instruct the LLM to behave as an autonomous agent
 * with strict structured output requirements for BIM/Revit automation.
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
          const required = tool.inputSchema.required?.includes(key) ? " (REQUIRED)" : " (optional)";
          const typeInfo = schema.type + (schema.items ? `[${(schema.items as { type?: string }).type || 'object'}]` : '');
          return `    - ${key}: ${typeInfo}${required} - ${schema.description || ""}`;
        })
        .join("\n");
      
      return `### ${tool.name}
${tool.description}
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
  if (steps.length === 0) return "None yet.";
  
  return steps
    .map((s, i) => {
      const status = s.success ? "SUCCESS" : "FAILED";
      const resultStr = s.success
        ? JSON.stringify(s.result).slice(0, 800)
        : `ERROR: ${s.result}`;
      return `Step ${i + 1} [${status}]: ${s.step.toolName}
  Arguments: ${JSON.stringify(s.step.args)}
  Result: ${resultStr}`;
    })
    .join("\n\n");
}

/**
 * Main system prompt that establishes agent behavior
 * Optimized for BIM/Revit tool execution with strict output format
 */
export const AGENT_SYSTEM_PROMPT = `You are an expert BIM/Revit automation agent. You execute tasks autonomously using available tools in a structured ReAct (Reason + Act) loop.

## CRITICAL EXECUTION RULES

1. **ALWAYS USE TOOLS** - Never hallucinate or pretend to execute. Use the actual tools provided.
2. **FOLLOW THE DATA FLOW** - For building tasks:
   - FIRST call \`get_levels_list\` to get valid level IDs
   - THEN use those IDs in subsequent tool calls
3. **PRECISE ARGUMENTS** - Match the exact parameter schema for each tool
4. **ONE ACTION PER RESPONSE** - Execute one tool at a time, observe the result, then proceed
5. **ITERATE UNTIL DONE** - Keep working until the goal is 100% achieved

## OUTPUT FORMAT (MANDATORY)

You MUST respond with ONLY a valid JSON object in this exact structure:

\`\`\`json
{
  "thought": "Your detailed reasoning about the current state and what to do next",
  "action": "exact_tool_name_here OR final_answer",
  "input": {
    "param1": "value1",
    "param2": "value2"
  },
  "final_answer": "Only include when action is 'final_answer' - summarize what was accomplished"
}
\`\`\`

## ARGUMENT FORMATTING RULES

### For create_wall tool:
The walls array must have this EXACT structure:
\`\`\`json
{
  "walls": [
    {
      "locationLine": {
        "startPoint": { "x": 0, "y": 0, "z": 0 },
        "endPoint": { "x": 5000, "y": 0, "z": 0 }
      },
      "baseLevelId": 12345,
      "unconnectedHeight": 3000,
      "isStructural": false
    }
  ]
}
\`\`\`
- **baseLevelId** MUST be a numeric ID from get_levels_list (e.g., 311)
- **Coordinates** are in millimeters (1 meter = 1000mm)
- **unconnectedHeight** is wall height in mm (default: 3000mm = 3m)

### For analyze_layout_design tool:
\`\`\`json
{
  "includeStructural": true,
  "includeArchitectural": true,
  "includeMEP": false,
  "includeAnnotations": false,
  "checkCodeCompliance": true
}
\`\`\`

### For get_levels_list tool:
\`\`\`json
{}
\`\`\`

## STOPPING CONDITIONS

Set action to "final_answer" ONLY when:
1. The user's goal is 100% complete (all elements created/modified)
2. An unrecoverable error occurred that cannot be fixed with available tools
3. You need information that requires user input

## IMPORTANT REMINDERS

- You are an AUTONOMOUS AGENT - execute until the task is done
- NEVER output anything except the JSON format above
- NEVER make up tool results - wait for actual execution
- If a tool fails, analyze the error and try an alternative approach
- Always use exact tool names from the available tools list`;

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

## AVAILABLE TOOLS

${toolsList}

**Tool Names for Reference:** ${toolNames}

## USER'S GOAL

${goal}`;

  if (context) {
    prompt += `

## PREVIOUS CONTEXT

${context}`;
  }

  if (observations) {
    prompt += `

## OBSERVATIONS FROM PREVIOUS STEPS

${observations}`;
  }

  prompt += `

---
Now analyze the goal and respond with your next action in the required JSON format. Remember:
1. If building anything, start with get_levels_list to get valid level IDs
2. Use exact parameter structures shown above
3. Output ONLY valid JSON`;

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
  
  // Extract level IDs from previous results for reference
  let levelContext = "";
  for (const step of completedSteps) {
    if (step.step.toolName === "get_levels_list" && step.success) {
      const resultStr = JSON.stringify(step.result);
      const levelMatch = resultStr.match(/"(?:levelId|id|Id)"\s*:\s*(\d+)/i);
      if (levelMatch) {
        levelContext = `\n\n**Available Level ID from get_levels_list:** ${levelMatch[1]} (use this for baseLevelId in wall creation)`;
      }
    }
  }
  
  return `${AGENT_SYSTEM_PROMPT}

## AVAILABLE TOOLS

${toolsList}

**Tool Names for Reference:** ${toolNames}

## ORIGINAL GOAL

${originalGoal}

## COMPLETED STEPS

${stepsHistory}${levelContext}

## LAST OBSERVATION

${lastObservation}

## NEXT ACTION

Based on what has been accomplished:
1. If the goal is 100% complete, use action "final_answer"
2. If more steps are needed, determine the next tool to call
3. If there was an error, analyze it and try to recover

Respond with your next action in the required JSON format.`;
}

/**
 * Planning prompt for initial task decomposition
 */
export const PLANNING_PROMPT = `You are an expert BIM/Revit task planner. Decompose the user's request into a sequence of executable tool calls.

## PLANNING PRINCIPLES

1. **START WITH LEVELS** - Any building task MUST begin with get_levels_list
2. **MINIMAL STEPS** - Keep plans simple and actionable
3. **EXACT TOOL NAMES** - Use only tools from the available list
4. **REASONABLE DEFAULTS** - Make assumptions when details are missing:
   - Default wall height: 3000mm (3 meters)
   - Default room size: 4000mm x 4000mm
   - Default layout: rectangular footprint

## OUTPUT FORMAT

Respond with ONLY this JSON structure:

\`\`\`json
{
  "analysis": "Brief analysis of what needs to be done (1-2 sentences)",
  "needsMoreInfo": false,
  "steps": [
    {
      "toolName": "get_levels_list",
      "description": "Get available levels to determine baseLevelId"
    },
    {
      "toolName": "create_wall",
      "description": "Create exterior walls for the layout"
    }
  ],
  "confidence": 0.9
}
\`\`\`

## IMPORTANT

- **needsMoreInfo** should almost always be false - make reasonable assumptions
- Each step only needs toolName and description - the agent will fill in parameters during execution
- Maximum 10 steps per plan
- For building tasks, ALWAYS include get_levels_list as step 1`;

/**
 * Create planning prompt with tools context
 */
export function createPlanningPrompt(
  tools: AgentTool[],
  userRequest: string,
  context?: string
): string {
  const toolsList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  
  return `${PLANNING_PROMPT}

## AVAILABLE TOOLS

${toolsList}

## USER REQUEST

${userRequest}

${context ? `## PREVIOUS CONTEXT\n\n${context}` : ""}

Create an execution plan using only the available tools. Remember to start with get_levels_list for any building task.`;
}
