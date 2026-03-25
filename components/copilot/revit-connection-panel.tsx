"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

export function RevitConnectionPanel() {
  const [status, setStatus] = useState<RevitStatusResponse | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairCodeExpiresAt, setPairCodeExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const createPairCode = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/revit/pair", { method: "POST" });
      if (!response.ok) return;
      const data = (await response.json()) as { code: string; expiresAt: string };
      setPairCode(data.code);
      setPairCodeExpiresAt(data.expiresAt);
    } finally {
      setLoading(false);
    }
  };

  const expiryText = useMemo(() => {
    if (!pairCodeExpiresAt) return null;
    const d = new Date(pairCodeExpiresAt);
    return d.toLocaleTimeString();
  }, [pairCodeExpiresAt]);

  return (
    <div className="rounded-xl border border-blue-100 bg-card p-3 text-sm dark:border-blue-900/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-medium text-foreground">Revit Connection</p>
        <Badge variant={status?.connected ? "default" : "secondary"}>
          {status?.connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {status?.activeSession ? (
        <p className="text-muted-foreground">
          Device: {status.activeSession.deviceName || "Unnamed"}
          {status.activeSession.os ? ` (${status.activeSession.os})` : ""}
        </p>
      ) : (
        <p className="text-muted-foreground">
          Install and run Datum Revit Agent on the same machine as Revit, then pair using a code.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={createPairCode} disabled={loading}>
          {loading ? "Generating..." : "Generate Pair Code"}
        </Button>
        <Button size="sm" variant="outline" onClick={refreshStatus}>
          Refresh
        </Button>
      </div>

      {pairCode ? (
        <div className="mt-3 rounded-lg border border-dashed p-2">
          <p className="text-xs text-muted-foreground">Use this code in Datum Revit Agent</p>
          <p className="text-lg font-semibold tracking-wider">{pairCode}</p>
          {expiryText ? (
            <p className="text-xs text-muted-foreground">Expires at {expiryText}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
