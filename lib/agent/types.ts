/**
 * Core Types for Agentic System
 * 
 * This module defines all the interfaces and types used throughout
 * the agentic workflow system.
 */

// ============================================================================
// AGENT OUTPUT SCHEMA - The LLM MUST respond with this exact structure
// ============================================================================

/**
 * The strict output format that the LLM must produce for every response.
 * This is the heart of the ReAct pattern - Thought, Action, Observation loop.
 */
export interface AgentOutput {
  /** The agent's reasoning process - what it's thinking */
  thought: string;
  
  /** The action to take - either a tool name or "final_answer" */
  action: string;
  
  /** Input parameters for the tool (empty object if action is "final_answer") */
  input: Record<string, unknown>;
  
  /** Only present when action is "final_answer" */
  final_answer?: string;
  
  /** Optional confidence score (0-1) */
  confidence?: number;
}

/**
 * Validated and parsed agent output with additional metadata
 */
export interface ParsedAgentOutput extends AgentOutput {
  /** Whether this output terminates the agent loop */
  isTerminal: boolean;
  
  /** Raw LLM response for debugging */
  rawResponse?: string;
  
  /** Parsing timestamp */
  parsedAt: string;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Standard tool interface following MCP schema conventions
 */
export interface AgentTool {
  /** Unique tool identifier */
  name: string;
  
  /** Human-readable description for LLM context */
  description: string;
  
  /** JSON Schema for input parameters */
  inputSchema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      items?: Record<string, unknown>;
      default?: unknown;
    }>;
    required?: string[];
  };
  
  /** Whether this tool modifies state (vs read-only) */
  isMutation?: boolean;
  
  /** Aliases for this tool */
  aliases?: string[];
}

/**
 * Result of executing a tool
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTimeMs?: number;
  transport?: "mcp" | "legacy";
}

// ============================================================================
// AGENT STATE MANAGEMENT
// ============================================================================

/**
 * Current stage of the agent's execution
 */
export type AgentStage = 
  | "idle"
  | "planning"
  | "thinking"
  | "executing"
  | "observing"
  | "completed"
  | "error";

/**
 * A single step in the agent's execution history
 */
export interface AgentStep {
  /** Unique step identifier */
  id: string;
  
  /** Step number (1-indexed) */
  stepNumber: number;
  
  /** The agent's thought at this step */
  thought: string;
  
  /** Action taken (tool name or "final_answer") */
  action: string;
  
  /** Input provided to the tool */
  input: Record<string, unknown>;
  
  /** Result/observation from the tool execution */
  observation?: string;
  
  /** Whether this step succeeded */
  success: boolean;
  
  /** Error message if step failed */
  error?: string;
  
  /** Timestamp when step started */
  startedAt: string;
  
  /** Timestamp when step completed */
  completedAt?: string;
  
  /** Execution time in milliseconds */
  durationMs?: number;
}

/**
 * Complete state of an agent execution session
 */
export interface AgentState {
  /** Unique session identifier */
  sessionId: string;
  
  /** Current stage */
  stage: AgentStage;
  
  /** Original user goal/request */
  originalGoal: string;
  
  /** Execution history */
  steps: AgentStep[];
  
  /** Current step being executed */
  currentStepNumber: number;
  
  /** Available tools for this session */
  availableTools: AgentTool[];
  
  /** Tool names as a set for quick lookup */
  availableToolNames: Set<string>;
  
  /** Maximum iterations allowed */
  maxIterations: number;
  
  /** Whether the agent has completed its goal */
  isComplete: boolean;
  
  /** Final answer if completed */
  finalAnswer?: string;
  
  /** Error if agent failed */
  error?: string;
  
  /** Context from previous conversation */
  conversationContext?: string;
  
  /** Session start time */
  startedAt: string;
  
  /** Session end time */
  completedAt?: string;
  
  /** Total execution time */
  totalDurationMs?: number;
  
  /** Metadata for observability */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PLAN TYPES
// ============================================================================

/**
 * A planned step before execution
 */
export interface PlannedStep {
  /** Tool to execute */
  toolName: string;
  
  /** Arguments for the tool */
  args: Record<string, unknown>;
  
  /** Human-readable description */
  description: string;
  
  /** Expected outcome */
  expectedOutcome?: string;
  
  /** Dependencies on other step IDs */
  dependsOn?: string[];
}

/**
 * A complete execution plan
 */
export interface AgentPlan {
  /** Analysis of what needs to be done */
  analysis: string;
  
  /** Whether the plan needs more info from user */
  needsMoreInfo: boolean;
  
  /** Question to ask user if needsMoreInfo is true */
  clarificationQuestion?: string;
  
  /** Ordered list of steps to execute */
  steps: PlannedStep[];
  
  /** Estimated total time */
  estimatedTimeMs?: number;
  
  /** Confidence in the plan (0-1) */
  confidence?: number;
}

// ============================================================================
// STREAMING / PROGRESS EVENTS
// ============================================================================

/**
 * Event types for streaming progress updates
 */
export type AgentEventType = 
  | "planning"
  | "thinking"
  | "executing"
  | "observation"
  | "completed"
  | "error";

/**
 * Progress event sent to the client
 */
export interface AgentProgressEvent {
  type: AgentEventType;
  stage: AgentStage;
  message: string;
  step?: {
    number: number;
    total: number;
    thought?: string;
    action?: string;
    toolName?: string;
  };
  observation?: string;
  plan?: {
    id: string;
    title: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    toolName?: string;
    error?: string;
  }[];
  finalAnswer?: string;
  error?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// MEMORY / CONTEXT
// ============================================================================

/**
 * Short-term memory for the current session
 */
export interface AgentMemory {
  /** Conversation history (role + content) */
  conversationHistory: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    name?: string;
    timestamp: string;
  }>;
  
  /** Key facts extracted during execution */
  extractedFacts: Record<string, unknown>;
  
  /** Tool results cache (for reference) */
  toolResultsCache: Map<string, ToolExecutionResult>;
  
  /** Working state that persists across steps */
  workingState: Record<string, unknown>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Agent configuration options
 */
export interface AgentConfig {
  /** Maximum number of iterations in the agent loop */
  maxIterations: number;
  
  /** Timeout for individual tool executions (ms) */
  toolTimeoutMs: number;
  
  /** Timeout for LLM calls (ms) */
  llmTimeoutMs: number;
  
  /** Model to use for the agent */
  model: string;
  
  /** Temperature for LLM responses */
  temperature: number;
  
  /** Maximum tokens for LLM responses */
  maxTokens: number;
  
  /** Whether to enable verbose logging */
  debug: boolean;
  
  /** Whether to allow tool fallback */
  allowToolFallback: boolean;
  
  /** Retry configuration */
  retry: {
    maxRetries: number;
    backoffMs: number;
  };
}

/**
 * Default agent configuration
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 15,
  toolTimeoutMs: 60000,
  llmTimeoutMs: 30000,
  model: "anthropic/claude-sonnet-4",
  temperature: 0.1,
  maxTokens: 4000,
  debug: false,
  allowToolFallback: true,
  retry: {
    maxRetries: 2,
    backoffMs: 1000,
  },
};
