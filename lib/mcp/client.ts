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

class MCPClient {
  private baseUrl: string;
  private apiKey: string;
  private tools: MCPTool[] | null = null;

  constructor() {
    this.baseUrl = process.env.MCP_SERVER_URL || "";
    this.apiKey = process.env.MCP_API_KEY || "";
  }

  /**
   * Test connection to MCP server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
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
      const response = await fetch(`${this.baseUrl}/status`, {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
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
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to list tools: ${response.statusText}`);
      }

      const data = await response.json();
      const tools = data.result?.tools || [];
      this.tools = tools;
      return tools;
    } catch (error) {
      console.error("Failed to list MCP tools:", error);
      throw error;
    }
  }

  /**
   * Call a specific MCP tool
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<MCPToolResult> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: toolName,
            arguments: args,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Tool call failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        return {
          success: false,
          error: data.error.message || "Tool execution failed",
        };
      }

      return {
        success: true,
        result: data.result,
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
   */
  async executeToolCalls(toolCalls: MCPToolCall[]): Promise<MCPToolResult[]> {
    const results: MCPToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.callTool(toolCall.name, toolCall.arguments);
      results.push(result);
    }

    return results;
  }
}

// Singleton instance
let mcpClient: MCPClient | null = null;

export function getMCPClient(): MCPClient {
  if (!mcpClient) {
    mcpClient = new MCPClient();
  }
  return mcpClient;
}

export default MCPClient;
