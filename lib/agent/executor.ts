/**
 * Tool Executor
 * 
 * Handles the execution of tools via MCP protocol.
 * Provides standardized interface, retry logic, and error handling.
 */

import { getMCPClient, MCPTool } from "@/lib/mcp/client";
import { enqueueCommandForUser, waitForCommandResult } from "@/lib/revit-agent/jobs";
import { AgentTool, ToolExecutionResult, AgentConfig, DEFAULT_AGENT_CONFIG } from "./types";
import { extractToolError } from "./parser";

/**
 * Options for tool execution
 */
export interface ExecuteToolOptions {
  /** Prefer MCP transport */
  preferMcp?: boolean;
  
  /** Allow fallback to legacy transport */
  allowLegacyFallback?: boolean;
  
  /** Custom timeout (ms) */
  timeoutMs?: number;
  
  /** Number of retries on failure */
  maxRetries?: number;
}

const DEFAULT_EXECUTE_OPTIONS: ExecuteToolOptions = {
  preferMcp: true,
  allowLegacyFallback: true,
  timeoutMs: 60000,
  maxRetries: 1,
};

/**
 * Convert MCP tools to AgentTool format
 */
export function mcpToolsToAgentTools(mcpTools: MCPTool[]): AgentTool[] {
  return mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: "object" as const,
      properties: tool.inputSchema?.properties || {},
      required: tool.inputSchema?.required,
    },
  }));
}

/**
 * Fetch available tools from MCP server
 */
export async function fetchAvailableTools(): Promise<{
  tools: AgentTool[];
  connected: boolean;
  error?: string;
}> {
  try {
    const mcpClient = getMCPClient();
    const connected = await mcpClient.testConnection();
    
    if (!connected) {
      return { tools: [], connected: false, error: "MCP server not connected" };
    }
    
    const mcpTools = await mcpClient.listTools();
    const tools = mcpToolsToAgentTools(mcpTools);
    
    return { tools, connected: true };
  } catch (error) {
    return {
      tools: [],
      connected: false,
      error: error instanceof Error ? error.message : "Failed to fetch tools",
    };
  }
}

/**
 * Normalize create_wall arguments to match expected schema
 */
function normalizeCreateWallArgs(args: Record<string, unknown>): Record<string, unknown> {
  const walls = args.walls;
  if (!Array.isArray(walls)) return args;

  const normalizedWalls = walls.map((wall) => {
    if (!wall || typeof wall !== "object") return wall;
    const typedWall = wall as Record<string, unknown>;

    // Already normalized
    if (typedWall.locationLine || !typedWall.startPoint || !typedWall.endPoint) {
      return wall;
    }

    const baseLevelIdRaw = typedWall.baseLevelId ?? typedWall.levelId;
    let baseLevelId: number | undefined;
    if (typeof baseLevelIdRaw === "number") {
      baseLevelId = baseLevelIdRaw;
    } else if (typeof baseLevelIdRaw === "string" && /^\d+$/.test(baseLevelIdRaw)) {
      baseLevelId = Number(baseLevelIdRaw);
    }

    const heightRaw = typedWall.height;
    let unconnectedHeight = 3000;
    if (typeof heightRaw === "number") {
      unconnectedHeight = heightRaw;
    } else if (typeof heightRaw === "string" && /^\d+$/.test(heightRaw)) {
      unconnectedHeight = Number(heightRaw);
    }

    return {
      locationLine: {
        startPoint: typedWall.startPoint,
        endPoint: typedWall.endPoint,
      },
      baseLevelId,
      unconnectedHeight,
      isStructural: typeof typedWall.isStructural === "boolean" ? typedWall.isStructural : false,
      wallTypeName: typeof typedWall.wallTypeName === "string" ? typedWall.wallTypeName : undefined,
    };
  });

  return { ...args, walls: normalizedWalls };
}

/**
 * Check if walls are missing baseLevelId
 */
function hasMissingBaseLevelId(args: Record<string, unknown>): boolean {
  const walls = args.walls;
  if (!Array.isArray(walls)) return false;

  return walls.some((wall) => {
    if (!wall || typeof wall !== "object") return false;
    const typedWall = wall as Record<string, unknown>;
    return typeof typedWall.baseLevelId !== "number";
  });
}

/**
 * Apply baseLevelId to walls that are missing it
 */
function applyBaseLevelIdToWalls(
  args: Record<string, unknown>,
  baseLevelId: number
): Record<string, unknown> {
  const walls = args.walls;
  if (!Array.isArray(walls)) return args;

  return {
    ...args,
    walls: walls.map((wall) => {
      if (!wall || typeof wall !== "object") return wall;
      const typedWall = wall as Record<string, unknown>;
      if (typeof typedWall.baseLevelId === "number") return wall;
      return { ...typedWall, baseLevelId };
    }),
  };
}

/**
 * Execute a tool via MCP or legacy transport
 */
export async function executeTool(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
  options: ExecuteToolOptions = {}
): Promise<ToolExecutionResult> {
  const opts = { ...DEFAULT_EXECUTE_OPTIONS, ...options };
  const startTime = Date.now();
  
  let lastError: string | undefined;
  let attempts = 0;
  
  while (attempts <= (opts.maxRetries || 0)) {
    attempts++;
    
    // Try MCP first
    if (opts.preferMcp) {
      try {
        const mcpClient = getMCPClient();
        const mcpResult = await mcpClient.callTool(toolName, args);
        
        if (mcpResult.success) {
          // Check for tool-level errors in result
          const toolError = extractToolError(mcpResult.result);
          if (toolError) {
            lastError = toolError;
            if (!opts.allowLegacyFallback) {
              return {
                success: false,
                error: toolError,
                executionTimeMs: Date.now() - startTime,
                transport: "mcp",
              };
            }
            // Fall through to legacy
          } else {
            return {
              success: true,
              result: mcpResult.result,
              executionTimeMs: Date.now() - startTime,
              transport: "mcp",
            };
          }
        } else {
          lastError = mcpResult.error || "MCP call failed";
          if (!opts.allowLegacyFallback) {
            continue; // Retry with MCP
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "MCP execution error";
        if (!opts.allowLegacyFallback) {
          continue; // Retry with MCP
        }
      }
    }
    
    // Try legacy fallback
    if (opts.allowLegacyFallback) {
      try {
        const job = await enqueueCommandForUser(userId, toolName, args);
        const result = await waitForCommandResult(job.id);
        
        if (result.success) {
          const toolError = extractToolError(result.result);
          if (toolError) {
            lastError = toolError;
            continue; // Retry
          }
          
          return {
            success: true,
            result: result.result,
            executionTimeMs: Date.now() - startTime,
            transport: "legacy",
          };
        } else {
          lastError = result.error || "Legacy execution failed";
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Legacy execution error";
      }
    }
  }
  
  return {
    success: false,
    error: lastError || "All execution attempts failed",
    executionTimeMs: Date.now() - startTime,
    transport: opts.preferMcp ? "mcp" : "legacy",
  };
}

/**
 * Execute tool with argument normalization for specific tools
 */
export async function executeToolNormalized(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
  levelResolver?: () => Promise<number | null>,
  options?: ExecuteToolOptions
): Promise<ToolExecutionResult> {
  let normalizedArgs = args;
  
  // Normalize create_wall arguments
  if (toolName === "create_wall") {
    normalizedArgs = normalizeCreateWallArgs(normalizedArgs);
    
    // Resolve missing baseLevelId
    if (hasMissingBaseLevelId(normalizedArgs) && levelResolver) {
      const levelId = await levelResolver();
      if (levelId !== null) {
        normalizedArgs = applyBaseLevelIdToWalls(normalizedArgs, levelId);
      }
    }
  }
  
  return executeTool(userId, toolName, normalizedArgs, options);
}

/**
 * Get default level ID by calling get_levels_list
 */
export async function resolveDefaultLevelId(userId: string): Promise<number | null> {
  const result = await executeTool(userId, "get_levels_list", {});
  if (!result.success) return null;
  
  // Extract first level ID from result
  const raw = JSON.stringify(result.result ?? "");
  const levelRegex = /"(?:levelId|id)"\s*:\s*(\d+)/i;
  const match = levelRegex.exec(raw);
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * Check connection status
 */
export async function checkConnections(): Promise<{
  mcpConnected: boolean;
  legacyConnected: boolean;
  revitAvailable: boolean;
}> {
  const mcpClient = getMCPClient();
  let mcpConnected = false;
  
  try {
    mcpConnected = await mcpClient.testConnection();
  } catch {
    mcpConnected = false;
  }
  
  // Legacy check would require database query for recent heartbeat
  // For now, assume it follows MCP
  const legacyConnected = false; // Will be updated by caller
  
  return {
    mcpConnected,
    legacyConnected,
    revitAvailable: mcpConnected || legacyConnected,
  };
}
