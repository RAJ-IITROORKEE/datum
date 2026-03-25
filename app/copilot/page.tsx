import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CopilotClient } from "@/components/copilot/copilot-client";

export default async function CopilotPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in?redirect_url=/copilot");
  }

  return <CopilotClient />;
}
