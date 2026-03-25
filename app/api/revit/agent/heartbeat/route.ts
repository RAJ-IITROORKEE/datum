import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentSessionFromRequest } from "@/lib/revit-agent/session";

export async function POST(req: Request) {
  try {
    const sessionResult = await requireAgentSessionFromRequest(req);
    if ("error" in sessionResult) {
      return NextResponse.json({ error: sessionResult.error }, { status: sessionResult.status });
    }

    const body = await req.json().catch(() => ({}));

    await prisma.revitAgentSession.update({
      where: { id: sessionResult.session.id },
      data: {
        status: "ONLINE",
        lastSeenAt: new Date(),
        deviceName: typeof body.deviceName === "string" ? body.deviceName : sessionResult.session.deviceName,
        os: typeof body.os === "string" ? body.os : sessionResult.session.os,
        agentVersion:
          typeof body.agentVersion === "string" ? body.agentVersion : sessionResult.session.agentVersion,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Agent heartbeat error:", error);
    return NextResponse.json({ error: "Failed to update heartbeat" }, { status: 500 });
  }
}
