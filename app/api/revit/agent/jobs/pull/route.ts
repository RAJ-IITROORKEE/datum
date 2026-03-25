import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentSessionFromRequest } from "@/lib/revit-agent/session";

export async function POST(req: Request) {
  try {
    const sessionResult = await requireAgentSessionFromRequest(req);
    if ("error" in sessionResult) {
      return NextResponse.json({ error: sessionResult.error }, { status: sessionResult.status });
    }

    await prisma.revitAgentSession.update({
      where: { id: sessionResult.session.id },
      data: { status: "ONLINE", lastSeenAt: new Date() },
    });

    const jobs = await prisma.revitCommandJob.findMany({
      where: {
        clerkUserId: sessionResult.session.clerkUserId,
        status: "PENDING",
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    if (jobs.length > 0) {
      await prisma.revitCommandJob.updateMany({
        where: { id: { in: jobs.map((job) => job.id) } },
        data: {
          status: "SENT",
          agentSessionId: sessionResult.session.id,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        commandName: job.commandName,
        payload: job.payload,
        createdAt: job.createdAt,
      })),
    });
  } catch (error) {
    console.error("Pull jobs error:", error);
    return NextResponse.json({ error: "Failed to pull jobs" }, { status: 500 });
  }
}
