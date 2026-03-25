import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;

    const where = sessionId
      ? { id: sessionId, clerkUserId: userId }
      : { clerkUserId: userId };

    const result = await prisma.revitAgentSession.deleteMany({ where });

    return NextResponse.json({
      ok: true,
      disconnectedSessions: result.count,
      message: result.count > 0 ? "Revit agent disconnected" : "No active session found",
    });
  } catch (error) {
    console.error("Revit disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect Revit agent" }, { status: 500 });
  }
}
