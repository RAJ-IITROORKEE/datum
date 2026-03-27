import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Relay is now integrated into the MCP server on the same port
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "https://revit-mcp-datum-production.up.railway.app";
const MCP_API_KEY = process.env.MCP_API_KEY || "";

/**
 * POST /api/revit/relay/token
 * Generate a new pairing token from the cloud relay server and store it
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call the MCP server's relay token endpoint
    const response = await fetch(`${MCP_SERVER_URL}/api/relay/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MCP_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Relay token generation failed:", errorText);
      return NextResponse.json(
        { error: "Failed to generate relay token" },
        { status: 502 }
      );
    }

    const data = await response.json();
    
    // Convert HTTP URL to WSS for the WebSocket connection
    const wsUrl = data.websocketUrl?.replace(/^ws:/, "wss:") || 
                  MCP_SERVER_URL.replace(/^https?:\/\//, "wss://") + "/relay";
    
    // Store the relay token in database (upsert to replace any existing token for this user)
    await prisma.revitRelayToken.upsert({
      where: { clerkUserId: userId },
      update: {
        token: data.token,
        relayUrl: wsUrl,
        expiresAt: new Date(data.expiresAt),
        updatedAt: new Date(),
      },
      create: {
        clerkUserId: userId,
        token: data.token,
        relayUrl: wsUrl,
        expiresAt: new Date(data.expiresAt),
      },
    });
    
    return NextResponse.json({
      token: data.token,
      expiresAt: data.expiresAt,
      relayUrl: wsUrl,
    });
  } catch (error) {
    console.error("Relay token error:", error);
    return NextResponse.json(
      { error: "Failed to connect to relay server" },
      { status: 502 }
    );
  }
}

/**
 * GET /api/revit/relay/token
 * Get the active relay token for the current user
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const relayToken = await prisma.revitRelayToken.findUnique({
      where: { clerkUserId: userId },
    });

    if (!relayToken) {
      return NextResponse.json({ token: null });
    }

    // Check if expired
    if (new Date() > relayToken.expiresAt) {
      // Delete expired token
      await prisma.revitRelayToken.delete({
        where: { id: relayToken.id },
      });
      return NextResponse.json({ token: null, expired: true });
    }

    return NextResponse.json({
      token: relayToken.token,
      relayUrl: relayToken.relayUrl,
      expiresAt: relayToken.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Get relay token error:", error);
    return NextResponse.json(
      { error: "Failed to get relay token" },
      { status: 500 }
    );
  }
}
