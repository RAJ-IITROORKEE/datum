import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET(req: Request) {
  const configuredUrl = process.env.REVIT_AGENT_DOWNLOAD_URL;

  if (configuredUrl) {
    return NextResponse.redirect(configuredUrl, { status: 302 });
  }

  const localExe = path.join(process.cwd(), "public", "downloads", "DatumRevitAgent.exe");
  if (fs.existsSync(localExe)) {
    return NextResponse.redirect(new URL("/downloads/DatumRevitAgent.exe", req.url), {
      status: 302,
    });
  }

  return NextResponse.redirect(new URL("/revit-agent-setup.md", req.url), {
    status: 302,
  });
}
