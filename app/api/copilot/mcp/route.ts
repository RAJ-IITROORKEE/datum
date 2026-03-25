import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getMCPClient } from "@/lib/mcp/client";
import { enqueueCommandForUser, waitForCommandResult } from "@/lib/revit-agent/jobs";
import { prisma } from "@/lib/prisma";

function indicatesReachableCatalogError(message: string): boolean {
  return message.includes("MCP RPC failed (tools/list):");
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mcpClient = getMCPClient();
    let connected = await mcpClient.testConnection();

    let tools: Array<{ name: string; description: string }> = [];
    let catalogAvailable = false;
    let reason = "";
    try {
      tools = await mcpClient.listTools();
      catalogAvailable = true;
    } catch (error) {
      catalogAvailable = false;
      reason = error instanceof Error ? error.message : "MCP tools list failed";
      if (!connected && indicatesReachableCatalogError(reason)) {
        connected = true;
      }
    }

    const recentSession = await prisma.revitAgentSession.findFirst({
      where: { clerkUserId: userId },
      orderBy: { lastSeenAt: "desc" },
    });

    const revitConnected =
      !!recentSession && Date.now() - new Date(recentSession.lastSeenAt).getTime() <= 30_000;

    return NextResponse.json({
      connected,
      catalogAvailable,
      tools,
      toolCount: tools.length,
      revitConnected,
      activeDevice: recentSession?.deviceName || null,
      reason,
    });
  } catch (error) {
    console.error("Failed to list MCP tools:", error);
    return NextResponse.json({
      connected: false,
      tools: [],
      toolCount: 0,
      revitConnected: false,
      activeDevice: null,
      reason: error instanceof Error ? error.message : "Unknown MCP error",
    });
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
    try {
      const tools = await mcpClient.listTools();
      const toolExists = tools.some((tool) => tool.name === toolName);
      if (!toolExists) {
        return NextResponse.json({ error: `Unknown tool: ${toolName}` }, { status: 400 });
      }
    } catch (error) {
      console.warn("MCP catalog unavailable, proceeding with direct execution:", error);
    }

    const job = await enqueueCommandForUser(userId, toolName, args || {});
    const result = await waitForCommandResult(job.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to execute MCP tool:", error);
    return NextResponse.json(
      { error: "Failed to execute tool" },
      { status: 500 }
    );
  }
}
