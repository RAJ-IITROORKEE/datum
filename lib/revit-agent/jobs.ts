import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const COMMAND_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;

export async function enqueueCommandForUser(
  clerkUserId: string,
  commandName: string,
  payload: Record<string, unknown>
) {
  const jsonPayload = payload as Prisma.InputJsonValue;

  return prisma.revitCommandJob.create({
    data: {
      clerkUserId,
      commandName,
      payload: jsonPayload,
      status: "PENDING",
    },
  });
}

export async function waitForCommandResult(jobId: string) {
  const start = Date.now();

  while (Date.now() - start < COMMAND_TIMEOUT_MS) {
    const job = await prisma.revitCommandJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error("Command job disappeared");
    }

    if (job.status === "SUCCEEDED") {
      return { success: true as const, result: job.result };
    }

    if (job.status === "FAILED") {
      return { success: false as const, error: job.error || "Command failed" };
    }

    if (job.status === "TIMEOUT") {
      return { success: false as const, error: "Command timed out" };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  await prisma.revitCommandJob.update({
    where: { id: jobId },
    data: { status: "TIMEOUT", error: "Timed out waiting for local Revit agent" },
  });

  return {
    success: false as const,
    error: "Timed out waiting for local Revit agent. Ensure Revit + Datum Agent are running.",
  };
}
