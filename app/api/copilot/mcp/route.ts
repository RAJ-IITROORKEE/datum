import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getMCPClient } from "@/lib/mcp/client";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mcpClient = getMCPClient();
    const tools = await mcpClient.listTools();

    return NextResponse.json({ tools });
  } catch (error) {
    console.error("Failed to list MCP tools:", error);
    return NextResponse.json(
      { error: "Failed to fetch MCP tools" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { toolName, arguments: args } = await req.json();

    if (!toolName) {
      return NextResponse.json(
        { error: "Tool name is required" },
        { status: 400 }
      );
    }

    const mcpClient = getMCPClient();
    const result = await mcpClient.callTool(toolName, args || {});

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to execute MCP tool:", error);
    return NextResponse.json(
      { error: "Failed to execute tool" },
      { status: 500 }
    );
  }
}
