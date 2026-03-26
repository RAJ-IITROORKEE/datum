import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET(req: Request) {
  const noCacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  const configuredUrl = process.env.REVIT_AGENT_DOWNLOAD_URL;

  if (configuredUrl) {
    return NextResponse.redirect(configuredUrl, {
      status: 302,
      headers: noCacheHeaders,
    });
  }

  const downloadsDir = path.join(process.cwd(), "public", "downloads");
  if (fs.existsSync(downloadsDir)) {
    const installerExeCandidates = fs
      .readdirSync(downloadsDir)
      .filter((file) => /^DatumRevitAgent-Installer-v.+\.exe$/i.test(file))
      .map((file) => {
        const fullPath = path.join(downloadsDir, file);
        const stats = fs.statSync(fullPath);
        return { file, mtimeMs: stats.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (installerExeCandidates.length > 0) {
      const latestInstaller = installerExeCandidates[0];
      const target = new URL(`/downloads/${latestInstaller.file}`, req.url);
      target.searchParams.set("v", String(Math.floor(latestInstaller.mtimeMs)));

      return NextResponse.redirect(target, {
        status: 302,
        headers: noCacheHeaders,
      });
    }

    const installerZipCandidates = fs
      .readdirSync(downloadsDir)
      .filter((file) => /^DatumRevitAgent-Installer-v.+\.zip$/i.test(file))
      .map((file) => {
        const fullPath = path.join(downloadsDir, file);
        const stats = fs.statSync(fullPath);
        return { file, mtimeMs: stats.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (installerZipCandidates.length > 0) {
      const latestInstallerZip = installerZipCandidates[0];
      const target = new URL(`/downloads/${latestInstallerZip.file}`, req.url);
      target.searchParams.set("v", String(Math.floor(latestInstallerZip.mtimeMs)));

      return NextResponse.redirect(target, {
        status: 302,
        headers: noCacheHeaders,
      });
    }

    const exeCandidates = fs
      .readdirSync(downloadsDir)
      .filter((file) => /^DatumRevitAgent(?!-Installer).*\.exe$/i.test(file))
      .map((file) => {
        const fullPath = path.join(downloadsDir, file);
        const stats = fs.statSync(fullPath);
        return { file, mtimeMs: stats.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (exeCandidates.length > 0) {
      const latestExe = exeCandidates[0];
      const target = new URL(`/downloads/${latestExe.file}`, req.url);
      target.searchParams.set("v", String(Math.floor(latestExe.mtimeMs)));

      return NextResponse.redirect(target, {
        status: 302,
        headers: noCacheHeaders,
      });
    }
  }

  return NextResponse.redirect(new URL("/revit-agent-setup.md", req.url), {
    status: 302,
    headers: noCacheHeaders,
  });
}
