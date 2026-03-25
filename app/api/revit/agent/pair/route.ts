import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateAgentToken, hashToken } from "@/lib/revit-agent/auth";

const pairSchema = z.object({
  code: z.string().min(6).max(12).transform((v) => v.trim().toUpperCase()),
  deviceName: z.string().optional(),
  os: z.string().optional(),
  agentVersion: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = pairSchema.parse(await req.json());

    const pairing = await prisma.revitAgentPairing.findUnique({
      where: { code: body.code },
    });

    if (!pairing) {
      return NextResponse.json({ error: "Invalid pairing code" }, { status: 404 });
    }

    if (pairing.usedAt) {
      return NextResponse.json({ error: "Pairing code already used" }, { status: 409 });
    }

    if (new Date(pairing.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: "Pairing code expired" }, { status: 410 });
    }

    const rawToken = generateAgentToken();
    const tokenHash = hashToken(rawToken);

    const session = await prisma.revitAgentSession.create({
      data: {
        clerkUserId: pairing.clerkUserId,
        tokenHash,
        deviceName: body.deviceName,
        os: body.os,
        agentVersion: body.agentVersion,
      },
    });

    await prisma.revitAgentPairing.update({
      where: { id: pairing.id },
      data: { usedAt: new Date() },
    });

    return NextResponse.json({
      token: rawToken,
      sessionId: session.id,
      clerkUserId: session.clerkUserId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid payload" }, { status: 400 });
    }

    console.error("Agent pair error:", error);
    return NextResponse.json({ error: "Failed to pair agent" }, { status: 500 });
  }
}
