"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cloud, Monitor, Copy, Check } from "lucide-react";

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

type RelayTokenResponse = {
  token: string;
  expiresAt: string;
  relayUrl: string;
};

type RelayStatusResponse = {
  valid: boolean;
  revitConnected?: boolean;
  mcpConnected?: boolean;
  error?: string;
};

export function RevitConnectionPanel() {
  // Local Agent state (DB-based pairing)
  const [status, setStatus] = useState<RevitStatusResponse | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairCodeExpiresAt, setPairCodeExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Cloud Relay state
  const [relayToken, setRelayToken] = useState<string | null>(null);
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [relayExpiresAt, setRelayExpiresAt] = useState<string | null>(null);
  const [relayStatus, setRelayStatus] = useState<RelayStatusResponse | null>(null);
  const [relayLoading, setRelayLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Refresh local agent status
  const refreshStatus = async () => {
    const response = await fetch("/api/revit/status", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as RevitStatusResponse;
    setStatus(data);
  };

  // Refresh relay status
  const refreshRelayStatus = async () => {
    if (!relayToken) return;
    const response = await fetch(`/api/revit/relay/status?token=${relayToken}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = (await response.json()) as RelayStatusResponse;
    setRelayStatus(data);
  };

  useEffect(() => {
    refreshStatus();
    const timer = setInterval(refreshStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!relayToken) return;
    refreshRelayStatus();
    const timer = setInterval(refreshRelayStatus, 3000);
    return () => clearInterval(timer);
  }, [relayToken]);

  // Generate local pair code
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

  // Generate relay token
  const createRelayToken = async () => {
    setRelayLoading(true);
    try {
      const response = await fetch("/api/revit/relay/token", { method: "POST" });
      if (!response.ok) return;
      const data = (await response.json()) as RelayTokenResponse;
      setRelayToken(data.token);
      setRelayUrl(data.relayUrl);
      setRelayExpiresAt(data.expiresAt);
      setRelayStatus(null);
    } finally {
      setRelayLoading(false);
    }
  };

  const copyRelayInfo = async () => {
    if (!relayToken || !relayUrl) return;
    const text = `Relay URL: ${relayUrl}\nPairing Token: ${relayToken}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiryText = useMemo(() => {
    if (!pairCodeExpiresAt) return null;
    const d = new Date(pairCodeExpiresAt);
    return d.toLocaleTimeString();
  }, [pairCodeExpiresAt]);

  const relayExpiryText = useMemo(() => {
    if (!relayExpiresAt) return null;
    const d = new Date(relayExpiresAt);
    return d.toLocaleTimeString();
  }, [relayExpiresAt]);

  const isRelayConnected = relayStatus?.revitConnected === true;

  return (
    <div className="rounded-xl border border-blue-100 bg-card p-3 text-sm dark:border-blue-900/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-medium text-foreground">Revit Connection</p>
        <Badge variant={status?.connected || isRelayConnected ? "default" : "secondary"}>
          {status?.connected || isRelayConnected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      <Tabs defaultValue="local" className="w-full">
        <TabsList className="mb-3 grid w-full grid-cols-2">
          <TabsTrigger value="local" className="gap-1.5 text-xs">
            <Monitor className="h-3 w-3" />
            Local Agent
          </TabsTrigger>
          <TabsTrigger value="relay" className="gap-1.5 text-xs">
            <Cloud className="h-3 w-3" />
            Cloud Relay
          </TabsTrigger>
        </TabsList>

        {/* Local Agent Tab (DB-based pairing) */}
        <TabsContent value="local" className="mt-0">
          {status?.activeSession ? (
            <p className="text-muted-foreground">
              Device: {status.activeSession.deviceName || "Unnamed"}
              {status.activeSession.os ? ` (${status.activeSession.os})` : ""}
            </p>
          ) : (
            <p className="text-muted-foreground">
              Install and run Datum Revit Agent on the same machine as Revit, then pair using a
              code.
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
        </TabsContent>

        {/* Cloud Relay Tab (WebSocket-based) */}
        <TabsContent value="relay" className="mt-0">
          {isRelayConnected ? (
            <p className="text-muted-foreground">
              Revit plugin connected via cloud relay
            </p>
          ) : (
            <p className="text-muted-foreground">
              Connect your Revit plugin through the cloud relay. Works across firewalls and NAT.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={createRelayToken} disabled={relayLoading}>
              {relayLoading ? "Generating..." : "Generate Relay Token"}
            </Button>
            {relayToken && (
              <Button size="sm" variant="outline" onClick={copyRelayInfo}>
                {copied ? (
                  <>
                    <Check className="mr-1 h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </>
                )}
              </Button>
            )}
          </div>

          {relayToken ? (
            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-dashed p-2">
                <p className="text-xs text-muted-foreground">Pairing Token</p>
                <p className="font-mono text-lg font-semibold tracking-wider">{relayToken}</p>
                {relayExpiryText ? (
                  <p className="text-xs text-muted-foreground">Expires at {relayExpiryText}</p>
                ) : null}
              </div>

              {relayUrl && (
                <div className="rounded-lg border border-dashed p-2">
                  <p className="text-xs text-muted-foreground">Relay URL</p>
                  <p className="break-all font-mono text-xs">{relayUrl}</p>
                </div>
              )}

              {relayStatus && (
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`h-2 w-2 rounded-full ${isRelayConnected ? "bg-green-500" : "bg-yellow-500"}`}
                  />
                  <span className="text-muted-foreground">
                    {isRelayConnected
                      ? "Revit plugin connected"
                      : "Waiting for Revit plugin to connect..."}
                  </span>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                In Revit plugin Settings &gt; Cloud Relay, enter this token and URL.
              </p>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
