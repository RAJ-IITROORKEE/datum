import { NextResponse } from "next/server";

export async function GET() {
  const configuredUrl = process.env.REVIT_AGENT_DOWNLOAD_URL;

  if (!configuredUrl) {
    return NextResponse.json(
      {
        error:
          "Revit agent download is not configured. Set REVIT_AGENT_DOWNLOAD_URL in server environment.",
      },
      { status: 404 }
    );
  }

  return NextResponse.redirect(configuredUrl, { status: 302 });
}
