/**
 * MCP (Model Context Protocol) Client for Revit MCP Server
 * Connects to the Railway-hosted MCP server to access Revit tools
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

export interface MCPDebugInfo {
  initialized: boolean;
  hasSession: boolean;
  sessionIdSuffix: string | null;
  lastInitializeAt: string | null;
  lastRpcMethod: string | null;
  lastRpcStatus: number | null;
  lastError: string | null;
  lastRecoveryAt: string | null;
  sessionResetCount: number;
}

class MCPClient {
  private baseUrl: string;
  private apiKey: string;
  private tools: MCPTool[] | null = null;
  private sessionId: string | null = null;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;
  private sendInitializedNotification =
    (process.env.MCP_SEND_INITIALIZED_NOTIFICATION || "false").toLowerCase() === "true";
  private debugInfo: MCPDebugInfo = {
    initialized: false,
    hasSession: false,
    sessionIdSuffix: null,
    lastInitializeAt: null,
    lastRpcMethod: null,
    lastRpcStatus: null,
    lastError: null,
    lastRecoveryAt: null,
    sessionResetCount: 0,
  };

  constructor() {
    this.baseUrl = process.env.MCP_SERVER_URL || "";
    this.apiKey = process.env.MCP_API_KEY || "";
  }

  private refreshConfig(): void {
    const nextBaseUrl = process.env.MCP_SERVER_URL || "";
    const nextApiKey = process.env.MCP_API_KEY || "";

    if (nextBaseUrl !== this.baseUrl || nextApiKey !== this.apiKey) {
      this.baseUrl = nextBaseUrl;
      this.apiKey = nextApiKey;
      this.resetSession();
    }
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "X-API-Key": this.apiKey,
    };
  }

  private getSessionHeaders(): Record<string, string> {
    if (!this.sessionId) return {};
    return {
      "Mcp-Session-Id": this.sessionId,
      "mcp-session-id": this.sessionId,
    };
  }

  private resetSession(): void {
    this.sessionId = null;
    this.initialized = false;
    this.tools = null;
    this.initializePromise = null;
    this.debugInfo.initialized = false;
    this.debugInfo.hasSession = false;
    this.debugInfo.sessionIdSuffix = null;
    this.debugInfo.sessionResetCount += 1;
  }

  getDebugInfo(): MCPDebugInfo {
    return {
      ...this.debugInfo,
      initialized: this.initialized,
      hasSession: Boolean(this.sessionId),
      sessionIdSuffix: this.sessionId ? this.sessionId.slice(-8) : null,
    };
  }

  private shouldRetrySession(responseStatus: number, responseBody: string): boolean {
    const normalized = responseBody.toLowerCase();
    if (responseStatus === 400 || responseStatus === 404 || responseStatus === 409) {
      return true;
    }
    return (
      normalized.includes("server not initialized") ||
      normalized.includes("invalid or missing session") ||
      normalized.includes("no valid session")
    );
  }

  private async parseRpcResponse(response: Response): Promise<any> {
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();

    if (!raw) {
      return null;
    }

    if (contentType.includes("application/json")) {
      return JSON.parse(raw);
    }

    if (contentType.includes("text/event-stream")) {
      const lines = raw.split(/\r?\n/);
      const eventPayloads: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        eventPayloads.push(trimmed.slice(5).trim());
      }

      for (const payload of eventPayloads) {
        if (!payload || payload === "[DONE]") continue;
        try {
          return JSON.parse(payload);
        } catch {
          continue;
        }
      }

      throw new Error("MCP server returned event-stream without JSON payload");
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("MCP server returned unsupported response format");
    }
  }

  private async ensureInitialized(): Promise<void> {
    this.refreshConfig();

    if (this.initialized && this.sessionId) {
      return;
    }

    if (this.initializePromise) {
      await this.initializePromise;
      return;
    }

    this.initializePromise = this.performInitialize();
    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  private async performInitialize(): Promise<void> {
    this.refreshConfig();

    if (!this.baseUrl || !this.apiKey) {
      throw new Error("MCP server URL or API key is not configured");
    }

    const initializeResponse = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "datum-copilot",
            version: "1.0.0",
          },
        },
      }),
    });

    if (!initializeResponse.ok) {
      throw new Error(`MCP initialize failed: ${initializeResponse.status}`);
    }

    const sessionIdHeader =
      initializeResponse.headers.get("mcp-session-id") ||
      initializeResponse.headers.get("Mcp-Session-Id");

    if (!sessionIdHeader) {
      throw new Error("MCP initialize succeeded but no session ID was returned");
    }

    this.sessionId = sessionIdHeader;
    this.debugInfo.lastInitializeAt = new Date().toISOString();
    this.debugInfo.initialized = true;
    this.debugInfo.hasSession = true;
    this.debugInfo.sessionIdSuffix = this.sessionId.slice(-8);
    this.debugInfo.lastError = null;

    if (this.sendInitializedNotification) {
      await fetch(`${this.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...this.getAuthHeaders(),
          ...this.getSessionHeaders(),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        }),
      }).catch(() => {
        // Some servers may not require this notification; ignore failures.
      });
    }

    this.initialized = true;
  }

  private async callRpc(
    method: string, 
    params: Record<string, unknown>, 
    relayToken?: string,
    retriesLeft = 2,
    timeoutMs = 30000  // 30 second timeout
  ): Promise<any> {
    await this.ensureInitialized();
    this.debugInfo.lastRpcMethod = method;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...this.getAuthHeaders(),
      ...this.getSessionHeaders(),
    };

    // Add relay token header if provided
    if (relayToken) {
      headers["X-Relay-Token"] = relayToken;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const raw = await response.text();
        this.debugInfo.lastRpcStatus = response.status;
        this.debugInfo.lastError = `HTTP ${response.status}${raw ? `: ${raw.slice(0, 240)}` : ""}`;
        if (retriesLeft > 0 && this.shouldRetrySession(response.status, raw)) {
          this.resetSession();
          this.debugInfo.lastRecoveryAt = new Date().toISOString();
          return this.callRpc(method, params, relayToken, retriesLeft - 1, timeoutMs);
        }
        throw new Error(`MCP RPC failed (${method}): ${response.status}`);
      }

      const data = await this.parseRpcResponse(response);
      this.debugInfo.lastRpcStatus = 200;
      if (data?.error) {
        const message = String(data.error.message || `MCP RPC error: ${method}`);
        this.debugInfo.lastError = message;
        const normalized = message.toLowerCase();
        if (
          retriesLeft > 0 &&
          (normalized.includes("server not initialized") ||
            normalized.includes("invalid or missing session") ||
            normalized.includes("no valid session"))
        ) {
          this.resetSession();
          this.debugInfo.lastRecoveryAt = new Date().toISOString();
          return this.callRpc(method, params, relayToken, retriesLeft - 1, timeoutMs);
        }
        throw new Error(data.error.message || `MCP RPC error: ${method}`);
      }

      this.debugInfo.lastError = null;

      return data?.result;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        this.debugInfo.lastError = `MCP RPC timeout after ${timeoutMs}ms`;
        throw new Error(`MCP tool call timed out after ${timeoutMs / 1000}s. The Revit plugin may not be responding. Check if Revit is running and the plugin is connected.`);
      }
      
      throw error;
    }
  }

  /**
   * Test connection to MCP server
   */
  async testConnection(): Promise<boolean> {
    try {
      this.refreshConfig();

      if (!this.baseUrl || !this.apiKey) {
        return false;
      }

      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: {
          ...this.getAuthHeaders(),
        },
      });
      return response.ok;
    } catch (error) {
      console.error("MCP connection test failed:", error);
      return false;
    }
  }

  /**
   * Get server status (requires authentication)
   */
  async getStatus(): Promise<any> {
    try {
      this.refreshConfig();

      const response = await fetch(`${this.baseUrl}/status`, {
        method: "GET",
        headers: {
          ...this.getAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to get MCP status:", error);
      throw error;
    }
  }

  /**
   * List available tools from MCP server
   */
  async listTools(): Promise<MCPTool[]> {
    if (this.tools) {
      return this.tools;
    }

    try {
      const result = await this.callRpc("tools/list", {});
      const tools = result?.tools || [];
      this.tools = tools;
      return tools;
    } catch (error) {
      console.error("Failed to list MCP tools:", error);
      throw error;
    }
  }

  /**
   * Call a specific MCP tool
   * @param relayToken Optional relay token for routing to specific Revit instance
   * @param timeoutMs Optional timeout in milliseconds (default 30000)
   */
  async callTool(
    toolName: string, 
    args: Record<string, any>,
    relayToken?: string,
    timeoutMs = 30000
  ): Promise<MCPToolResult> {
    try {
      const result = await this.callRpc("tools/call", {
        name: toolName,
        arguments: args,
      }, relayToken, 2, timeoutMs);

      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error(`Failed to call MCP tool ${toolName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Parse tool calls from LLM response and execute them
   * @param relayToken Optional relay token for routing
   */
  async executeToolCalls(
    toolCalls: MCPToolCall[],
    relayToken?: string
  ): Promise<MCPToolResult[]> {
    const results: MCPToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.callTool(toolCall.name, toolCall.arguments, relayToken);
      results.push(result);
    }

    return results;
  }
}

// Singleton instance
let mcpClient: MCPClient | null = null;

export function getMCPClient(): MCPClient {
  mcpClient ??= new MCPClient();
  return mcpClient;
}

export default MCPClient;
