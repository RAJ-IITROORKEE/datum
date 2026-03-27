/**
 * Agentic System Module
 * 
 * This module provides a production-grade agentic workflow system
 * for autonomous task execution with tool calling via MCP.
 * 
 * Architecture:
 * - Agent Controller: Main ReAct loop orchestration
 * - Planner: Task decomposition and planning
 * - Executor: Tool execution via MCP
 * - State Manager: Agent state and memory
 * - Parser: Structured output parsing
 * - Logger: Observability and debugging
 * - Streaming: SSE progress updates
 */

// Core types
export * from "./types";

// State management
export {
  createAgentState,
  createAgentMemory,
  startStep,
  completeStep,
  completeAgent,
  failAgent,
  updateStage,
  addToMemory,
  cacheToolResult,
  updateWorkingState,
  extractAndStoreFacts,
  buildObservationsContext,
  getStepsSummary,
} from "./state";

// Prompts
export {
  AGENT_SYSTEM_PROMPT,
  PLANNING_PROMPT,
  createAgentPrompt,
  createContinuationPrompt,
  createPlanningPrompt,
  formatToolsForPrompt,
  formatCompletedSteps,
} from "./prompts";

// Parser
export {
  parseAgentOutput,
  parsePlanOutput,
  resolveToolAlias,
  formatObservation,
  extractToolError,
  AgentParseError,
} from "./parser";

// Executor
export {
  executeTool,
  executeToolNormalized,
  fetchAvailableTools,
  resolveDefaultLevelId,
  checkConnections,
  mcpToolsToAgentTools,
} from "./executor";

// Controller
export {
  runAgent,
  runAgentWithPlanning,
  generatePlan,
} from "./controller";
export type { AgentRunOptions, AgentResult } from "./controller";

// Logger
export {
  createLogger,
  createSilentLogger,
  formatLogEntries,
} from "./logger";
export type { AgentLogger, LogEntry, LogLevel } from "./logger";

// Streaming
export {
  createSseStream,
  createSseData,
  progressToPlanSteps,
  SSE_HEADERS,
} from "./streaming";
export type { SseController } from "./streaming";
