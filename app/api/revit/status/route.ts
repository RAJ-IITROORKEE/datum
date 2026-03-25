import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const ONLINE_WINDOW_MS = 30_000;

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await prisma.revitAgentSession.findMany({
      where: { clerkUserId: userId },
      orderBy: { lastSeenAt: "desc" },
      take: 5,
    });

    const now = Date.now();
    const active = sessions.find(
      (session) => now - new Date(session.lastSeenAt).getTime() <= ONLINE_WINDOW_MS
    );

    return NextResponse.json({
      connected: Boolean(active),
      activeSession: active
        ? {
            id: active.id,
            deviceName: active.deviceName,
            os: active.os,
            agentVersion: active.agentVersion,
            lastSeenAt: active.lastSeenAt,
          }
        : null,
      recentSessions: sessions.map((session) => ({
        id: session.id,
        deviceName: session.deviceName,
        os: session.os,
        agentVersion: session.agentVersion,
        lastSeenAt: session.lastSeenAt,
      })),
    });
  } catch (error) {
    console.error("Revit status error:", error);
    return NextResponse.json({ error: "Failed to fetch Revit status" }, { status: 500 });
  }
}
