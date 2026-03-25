import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { generatePairingCode } from "@/lib/revit-agent/auth";

const PAIRING_TTL_MINUTES = 10;

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.revitAgentPairing.deleteMany({
      where: {
        clerkUserId: userId,
        usedAt: null,
      },
    });

    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60 * 1000);

    const pairing = await prisma.revitAgentPairing.create({
      data: {
        clerkUserId: userId,
        code,
        expiresAt,
      },
    });

    return NextResponse.json({
      code: pairing.code,
      expiresAt: pairing.expiresAt,
    });
  } catch (error) {
    console.error("Create pairing code error:", error);
    return NextResponse.json({ error: "Failed to create pairing code" }, { status: 500 });
  }
}
