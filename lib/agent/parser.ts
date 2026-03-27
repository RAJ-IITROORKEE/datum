/**
 * Agent Output Parser
 * 
 * Responsible for parsing and validating LLM responses
 * to ensure they conform to the strict agent output schema.
 */

import { AgentOutput, ParsedAgentOutput, AgentPlan, PlannedStep } from "./types";

/**
 * Error thrown when parsing fails
 */
export class AgentParseError extends Error {
  constructor(
    message: string,
    public rawResponse: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = "AgentParseError";
  }
}

/**
 * Extract JSON from a potentially wrapped response
 */
function extractJson(text: string): string | null {
  // Try to find JSON in code fences first
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  
  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  return null;
}

/**
 * Validate that an object conforms to AgentOutput schema
 */
function validateAgentOutput(obj: unknown): obj is AgentOutput {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  
  const candidate = obj as Record<string, unknown>;
  
  // Required fields
  if (typeof candidate.thought !== "string" || !candidate.thought.trim()) {
    return false;
  }
  if (typeof candidate.action !== "string" || !candidate.action.trim()) {
    return false;
  }
  if (typeof candidate.input !== "object" || candidate.input === null || Array.isArray(candidate.input)) {
    // Allow undefined input, default to empty object
    if (candidate.input !== undefined) {
      return false;
    }
  }
  
  // If action is final_answer, final_answer field should be present
  if (candidate.action === "final_answer" && typeof candidate.final_answer !== "string") {
    // Not strictly required, but warn
    console.warn("Agent output has action='final_answer' but no final_answer field");
  }
  
  return true;
}

/**
 * Parse LLM response into structured AgentOutput
 */
export function parseAgentOutput(rawResponse: string): ParsedAgentOutput {
  const trimmed = rawResponse.trim();
  
  if (!trimmed) {
    throw new AgentParseError(
      "Empty response from LLM",
      rawResponse,
      true
    );
  }
  
  // Extract JSON from response
  const jsonStr = extractJson(trimmed);
  if (!jsonStr) {
    throw new AgentParseError(
      "No valid JSON found in LLM response",
      rawResponse,
      true
    );
  }
  
  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new AgentParseError(
      `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`,
      rawResponse,
      true
    );
  }
  
  // Validate structure
  if (!validateAgentOutput(parsed)) {
    throw new AgentParseError(
      "Response does not match AgentOutput schema. Required: thought (string), action (string), input (object)",
      rawResponse,
      true
    );
  }
  
  const output = parsed as AgentOutput;
  
  // Normalize input to empty object if undefined
  if (!output.input) {
    output.input = {};
  }
  
  const isTerminal = output.action === "final_answer";
  
  return {
    ...output,
    isTerminal,
    rawResponse,
    parsedAt: new Date().toISOString(),
  };
}

/**
 * Parse planning output from LLM
 */
export function parsePlanOutput(rawResponse: string, availableToolNames: Set<string>): AgentPlan {
  const trimmed = rawResponse.trim();
  
  if (!trimmed) {
    throw new AgentParseError("Empty planning response", rawResponse, true);
  }
  
  const jsonStr = extractJson(trimmed);
  if (!jsonStr) {
    throw new AgentParseError("No valid JSON in planning response", rawResponse, true);
  }
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new AgentParseError(
      `Invalid JSON in planning response: ${e instanceof Error ? e.message : "parse error"}`,
      rawResponse,
      true
    );
  }
  
  const obj = parsed as Record<string, unknown>;
  
  // Validate basic structure
  const plan: AgentPlan = {
    analysis: typeof obj.analysis === "string" ? obj.analysis : "Unable to analyze request",
    needsMoreInfo: Boolean(obj.needsMoreInfo),
    clarificationQuestion: typeof obj.clarificationQuestion === "string" ? obj.clarificationQuestion : undefined,
    steps: [],
    confidence: typeof obj.confidence === "number" ? obj.confidence : undefined,
  };
  
  // Parse and validate steps
  if (Array.isArray(obj.steps)) {
    plan.steps = obj.steps
      .filter((step): step is Record<string, unknown> => {
        if (!step || typeof step !== "object") return false;
        if (typeof (step as Record<string, unknown>).toolName !== "string") return false;
        return true;
      })
      .map((step): PlannedStep => {
        const toolName = resolveToolAlias(step.toolName as string, availableToolNames);
        return {
          toolName,
          args: (step.args && typeof step.args === "object" && !Array.isArray(step.args))
            ? step.args as Record<string, unknown>
            : {},
          description: typeof step.description === "string" 
            ? step.description 
            : `Execute ${toolName}`,
        };
      })
      .filter((step) => availableToolNames.has(step.toolName));
  }
  
  return plan;
}

/**
 * Tool name alias resolution
 */
const TOOL_ALIASES: Record<string, string> = {
  layout_analysis: "analyze_layout_design",
  analyse_layout_design: "analyze_layout_design",
  analyze_layout: "analyze_layout_design",
  get_levels: "get_levels_list",
  create_walls: "create_wall",
};

/**
 * Resolve tool alias to canonical name
 */
export function resolveToolAlias(toolName: string, availableTools: Set<string>): string {
  const normalized = toolName.trim().toLowerCase();
  
  // Check direct match first
  if (availableTools.has(toolName)) {
    return toolName;
  }
  
  // Check normalized match - convert Set to Array for iteration
  const toolsArray = Array.from(availableTools);
  for (const name of toolsArray) {
    if (name.toLowerCase() === normalized) {
      return name;
    }
  }
  
  // Check aliases
  const aliased = TOOL_ALIASES[normalized];
  if (aliased && availableTools.has(aliased)) {
    return aliased;
  }
  
  // Return original if no match found
  return toolName;
}

/**
 * Format an observation for inclusion in the next prompt
 */
export function formatObservation(
  toolName: string,
  result: unknown,
  success: boolean
): string {
  if (!success) {
    return `Tool "${toolName}" FAILED with error: ${
      typeof result === "string" ? result : JSON.stringify(result)
    }`;
  }
  
  const resultStr = JSON.stringify(result, null, 2);
  const truncated = resultStr.length > 2000
    ? resultStr.slice(0, 2000) + "\n... (truncated)"
    : resultStr;
  
  return `Tool "${toolName}" executed successfully.\nResult:\n${truncated}`;
}

/**
 * Extract error message from tool result
 */
export function extractToolError(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  
  const typed = result as Record<string, unknown>;
  
  // Check various error formats
  if (typed.success === false && typeof typed.error === "string") {
    return typed.error;
  }
  if (typed.Success === false && typeof typed.Message === "string") {
    return typed.Message;
  }
  if (typeof typed.error === "string") {
    return typed.error;
  }
  
  return null;
}
