import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const ONLINE_WINDOW_MS = 30_000;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour session validity
const LATEST_AGENT_VERSION = process.env.REVIT_AGENT_LATEST_VERSION || "1.3.0";

function toVersionParts(version: string): number[] {
  return version
    .split(".")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part >= 0);
}

function isVersionOlder(currentVersion: string, latestVersion: string): boolean {
  const current = toVersionParts(currentVersion);
  const latest = toVersionParts(latestVersion);
  const maxLength = Math.max(current.length, latest.length);

  for (let index = 0; index < maxLength; index += 1) {
    const left = current[index] ?? 0;
    const right = latest[index] ?? 0;

    if (left < right) return true;
    if (left > right) return false;
  }

  return false;
}

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
    const versionSession = active || sessions[0] || null;
    const currentAgentVersion = versionSession?.agentVersion || null;
    const updateAvailable =
      typeof currentAgentVersion === "string" && currentAgentVersion.length > 0
        ? isVersionOlder(currentAgentVersion, LATEST_AGENT_VERSION)
        : false;

    // Calculate session expiry time (1 hour from creation or last pairing)
    let sessionExpiresAt: string | null = null;
    if (active) {
      // Session expires 1 hour from when it was created
      const createdAt = new Date(active.createdAt).getTime();
      const expiresAt = createdAt + SESSION_TTL_MS;
      sessionExpiresAt = new Date(expiresAt).toISOString();
    }

    return NextResponse.json({
      connected: Boolean(active),
      latestAgentVersion: LATEST_AGENT_VERSION,
      currentAgentVersion,
      updateAvailable,
      sessionExpiresAt,
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
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Revit status error:", error);
    return NextResponse.json({ error: "Failed to fetch Revit status" }, {
      status: 500,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  }
}
