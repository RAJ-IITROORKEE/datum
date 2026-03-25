import { prisma } from "@/lib/prisma";
import { getBearerToken, hashToken } from "@/lib/revit-agent/auth";

export async function requireAgentSessionFromRequest(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return { error: "Missing bearer token", status: 401 as const };
  }

  const tokenHash = hashToken(token);
  const session = await prisma.revitAgentSession.findUnique({
    where: { tokenHash },
  });

  if (!session) {
    return { error: "Invalid agent token", status: 401 as const };
  }

  return { session };
}
