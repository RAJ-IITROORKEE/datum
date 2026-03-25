import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgentSessionFromRequest } from "@/lib/revit-agent/session";

const resultSchema = z.object({
  jobId: z.string().min(1),
  success: z.boolean(),
  result: z.any().optional(),
  error: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const sessionResult = await requireAgentSessionFromRequest(req);
    if ("error" in sessionResult) {
      return NextResponse.json({ error: sessionResult.error }, { status: sessionResult.status });
    }

    const body = resultSchema.parse(await req.json());

    const job = await prisma.revitCommandJob.findUnique({
      where: { id: body.jobId },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.clerkUserId !== sessionResult.session.clerkUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.revitCommandJob.update({
      where: { id: body.jobId },
      data: {
        status: body.success ? "SUCCEEDED" : "FAILED",
        result: body.result ?? null,
        error: body.error ?? null,
        completedAt: new Date(),
      },
    });

    await prisma.revitAgentSession.update({
      where: { id: sessionResult.session.id },
      data: { status: "ONLINE", lastSeenAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid payload" }, { status: 400 });
    }

    console.error("Submit job result error:", error);
    return NextResponse.json({ error: "Failed to submit result" }, { status: 500 });
  }
}
