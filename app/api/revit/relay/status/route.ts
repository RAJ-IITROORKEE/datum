import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// Relay is now integrated into the MCP server on the same port
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "https://revit-mcp-datum-production.up.railway.app";
const MCP_API_KEY = process.env.MCP_API_KEY || "";

/**
 * GET /api/revit/relay/status?token=XXXXXXXX
 * Check the status of a pairing token (is Revit connected?)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Token parameter required" }, { status: 400 });
    }

    // Call the MCP server's relay token status endpoint
    const response = await fetch(`${MCP_SERVER_URL}/api/relay/token/${token}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MCP_API_KEY}`,
      },
    });

    if (response.status === 404) {
      return NextResponse.json({
        valid: false,
        error: "Token not found or expired",
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Relay token status check failed:", errorText);
      return NextResponse.json(
        { error: "Failed to check relay token status" },
        { status: 502 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      valid: true,
      token: data.token,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      used: data.used,
      revitConnected: data.revitClientId ? true : false,
      mcpConnected: data.mcpClientId ? true : false,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Relay status error:", error);
    return NextResponse.json(
      { error: "Failed to connect to relay server" },
      { status: 502 }
    );
  }
}
