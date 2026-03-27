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
 * Uses bracket matching to find valid JSON boundaries
 */
function extractJson(text: string): string | null {
  // Try to find JSON in code fences first
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const content = fencedMatch[1].trim();
    // Validate it starts with { or [
    if (content.startsWith("{") || content.startsWith("[")) {
      return content;
    }
  }
  
  // Find the first { and try to match brackets to find valid JSON
  const startIndex = text.indexOf("{");
  if (startIndex === -1) {
    return null;
  }
  
  // Use bracket matching to find the correct end
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let endIndex = -1;
  
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) {
      continue;
    }
    
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }
  
  if (endIndex === -1) {
    // Fallback: try simple regex but only for smaller chunks
    const simpleMatch = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    return simpleMatch ? simpleMatch[0] : null;
  }
  
  return text.slice(startIndex, endIndex + 1);
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
    // Fallback: extract what we can without strict JSON parsing
    return extractPlanFromText(trimmed, availableToolNames);
  }
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // Try to fix common JSON issues
    const fixed = tryFixJson(jsonStr);
    if (fixed) {
      try {
        parsed = JSON.parse(fixed);
      } catch {
        // Fall back to text extraction
        return extractPlanFromText(trimmed, availableToolNames);
      }
    } else {
      // Fall back to text extraction
      return extractPlanFromText(trimmed, availableToolNames);
    }
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
 * Try to fix common JSON issues
 */
function tryFixJson(json: string): string | null {
  let fixed = json;
  
  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, "$1");
  
  // Fix truncated arrays - add closing bracket
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    // Find where to truncate - last complete element
    const lastCompleteIndex = fixed.lastIndexOf("},");
    if (lastCompleteIndex > 0) {
      fixed = fixed.slice(0, lastCompleteIndex + 1) + "]" + "}".repeat(openBrackets - closeBrackets - 1);
    } else {
      fixed += "]".repeat(openBrackets - closeBrackets);
    }
  }
  
  // Fix truncated objects - add closing brace
  const openBraces = (fixed.match(/\{/g) || []).length;
  const closeBraces = (fixed.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    fixed += "}".repeat(openBraces - closeBraces);
  }
  
  try {
    JSON.parse(fixed);
    return fixed;
  } catch {
    return null;
  }
}

/**
 * Extract plan information from text when JSON parsing fails
 */
function extractPlanFromText(text: string, availableToolNames: Set<string>): AgentPlan {
  const plan: AgentPlan = {
    analysis: "Plan extracted from text response",
    needsMoreInfo: false,
    steps: [],
  };
  
  // Try to find tool names mentioned in the text
  const toolsArray = Array.from(availableToolNames);
  const foundTools: PlannedStep[] = [];
  
  for (const toolName of toolsArray) {
    // Check if tool is mentioned
    const regex = new RegExp(`\\b${toolName.replace(/_/g, "[_\\s]")}\\b`, "gi");
    if (regex.test(text)) {
      foundTools.push({
        toolName,
        args: {},
        description: `Execute ${toolName}`,
      });
    }
  }
  
  // Look for common patterns like "1. create_wall" or "- get_levels_list"
  const stepPattern = /(?:^|\n)\s*(?:\d+[.)]\s*|-\s*|\*\s*)([a-z_]+)/gim;
  let match;
  while ((match = stepPattern.exec(text)) !== null) {
    const potentialTool = match[1].toLowerCase();
    const resolvedTool = resolveToolAlias(potentialTool, availableToolNames);
    if (availableToolNames.has(resolvedTool) && !foundTools.some(t => t.toolName === resolvedTool)) {
      foundTools.push({
        toolName: resolvedTool,
        args: {},
        description: `Execute ${resolvedTool}`,
      });
    }
  }
  
  plan.steps = foundTools;
  
  // If no steps found, check if it needs clarification
  if (plan.steps.length === 0) {
    const questionIndicators = ["?", "could you", "would you", "please provide", "what", "which", "how"];
    const hasQuestion = questionIndicators.some(q => text.toLowerCase().includes(q));
    if (hasQuestion) {
      plan.needsMoreInfo = true;
      // Extract the question
      const questionMatch = text.match(/[^.!]*\?/);
      plan.clarificationQuestion = questionMatch ? questionMatch[0].trim() : "Please provide more details.";
    }
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
