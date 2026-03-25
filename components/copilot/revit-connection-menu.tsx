"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Copy, Download, ExternalLink, Link2, RefreshCw } from "lucide-react";

type RevitStatusResponse = {
  connected: boolean;
  activeSession: {
    id: string;
    deviceName?: string | null;
    os?: string | null;
    agentVersion?: string | null;
    lastSeenAt: string;
  } | null;
};

export function RevitConnectionMenu() {
  const [status, setStatus] = useState<RevitStatusResponse | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairCodeExpiresAt, setPairCodeExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const downloadUrl = "/downloads/DatumRevitAgent.exe";

  const refreshStatus = async () => {
    const response = await fetch("/api/revit/status", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as RevitStatusResponse;
    setStatus(data);
  };

  useEffect(() => {
    refreshStatus();
    const timer = setInterval(refreshStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const generatePairCode = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/revit/pair", { method: "POST" });
      if (!response.ok) return;
      const data = (await response.json()) as { code: string; expiresAt: string };
      setPairCode(data.code);
      setPairCodeExpiresAt(data.expiresAt);
      setCopied(false);
    } finally {
      setLoading(false);
    }
  };

  const copyPairCode = async () => {
    if (!pairCode) return;
    await navigator.clipboard.writeText(pairCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const expiryText = useMemo(() => {
    if (!pairCodeExpiresAt) return null;
    return new Date(pairCodeExpiresAt).toLocaleTimeString();
  }, [pairCodeExpiresAt]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Link2 className="h-4 w-4" />
          <span className="hidden sm:inline">Revit</span>
          <Badge variant={status?.connected ? "default" : "secondary"}>
            {status?.connected ? "Connected" : "Disconnected"}
          </Badge>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Revit Agent</DropdownMenuLabel>
        <DropdownMenuItem onClick={refreshStatus}>
          <RefreshCw className="h-4 w-4" />
          Refresh status
        </DropdownMenuItem>
        <DropdownMenuItem onClick={generatePairCode} disabled={loading}>
          <Link2 className="h-4 w-4" />
          {loading ? "Generating..." : "Generate pair code"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={downloadUrl} target="_blank" rel="noreferrer">
            <Download className="h-4 w-4" />
            Download Windows agent (.exe)
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {status?.connected
            ? `Connected to ${status.activeSession?.deviceName || "device"}`
            : "No active local Revit agent"}
        </div>
        <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">
          Flow: Download agent, run on Revit machine, paste pairing code, keep Revit plugin ON.
        </div>

        {pairCode ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={copyPairCode}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Code copied" : "Copy pairing code"}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/revit-agent-setup.md" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open setup guide
              </a>
            </DropdownMenuItem>
            <div className="px-2 py-1.5">
              <div className="mb-1 text-[11px] text-muted-foreground">Pairing code</div>
              <div className="flex items-center justify-between rounded-md border px-2 py-1">
                <span className="font-semibold tracking-wider">{pairCode}</span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={copyPairCode}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              {expiryText ? <div className="mt-1 text-[11px] text-muted-foreground">Expires at {expiryText}</div> : null}
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
