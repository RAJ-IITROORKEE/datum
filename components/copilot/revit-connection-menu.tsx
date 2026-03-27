"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
import { AlertTriangle, Check, Copy, Download, ExternalLink, Link2, PlugZap, RefreshCw, Timer } from "lucide-react";

type RevitStatusResponse = {
  connected: boolean;
  latestAgentVersion?: string;
  currentAgentVersion?: string | null;
  updateAvailable?: boolean;
  sessionExpiresAt?: string | null;
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

export function RevitConnectionMenu() {
  const showLegacyLocalPairing = false;
  const [status, setStatus] = useState<RevitStatusResponse | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairCodeExpiresAt, setPairCodeExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<string | null>(null);
  const [relayToken, setRelayToken] = useState<string | null>(null);
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [relayExpiresAt, setRelayExpiresAt] = useState<string | null>(null);
  const [relayStatus, setRelayStatus] = useState<RelayStatusResponse | null>(null);
  const [relayLoading, setRelayLoading] = useState(false);
  const [relayCopied, setRelayCopied] = useState(false);
  const [relayTimeLeft, setRelayTimeLeft] = useState<string | null>(null);
  const downloadUrl = "/api/revit/agent/download";

  const refreshStatus = async () => {
    const response = await fetch(`/api/revit/status?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as RevitStatusResponse;
    setStatus(data);
    
    // Check session expiry
    if (data.sessionExpiresAt) {
      const expiresAt = new Date(data.sessionExpiresAt).getTime();
      const now = Date.now();
      if (expiresAt <= now) {
        setSessionExpired(true);
        setSessionTimeLeft(null);
      } else {
        setSessionExpired(false);
      }
    } else if (!data.connected) {
      setSessionExpired(false);
      setSessionTimeLeft(null);
    }
  };

  // Update session time left every second
  const updateTimeLeft = useCallback(() => {
    if (!status?.sessionExpiresAt) {
      setSessionTimeLeft(null);
      return;
    }
    
    const expiresAt = new Date(status.sessionExpiresAt).getTime();
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) {
      setSessionExpired(true);
      setSessionTimeLeft(null);
      return;
    }
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
      setSessionTimeLeft(`${minutes}m ${seconds}s`);
    } else {
      setSessionTimeLeft(`${seconds}s`);
    }
  }, [status?.sessionExpiresAt]);

  useEffect(() => {
    refreshStatus();
    const statusTimer = setInterval(refreshStatus, 5000);
    return () => clearInterval(statusTimer);
  }, []);

  // Load persisted relay token on mount
  useEffect(() => {
    const loadPersistedToken = async () => {
      try {
        const response = await fetch("/api/revit/relay/token", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (data.token) {
          setRelayToken(data.token);
          setRelayUrl(data.relayUrl);
          setRelayExpiresAt(data.expiresAt);
        }
      } catch (error) {
        console.error("Failed to load persisted relay token:", error);
      }
    };
    
    loadPersistedToken();
  }, []);

  useEffect(() => {
    if (!relayToken) return;

    const refreshRelayStatus = async () => {
      try {
        const response = await fetch(`/api/revit/relay/status?token=${relayToken}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as RelayStatusResponse;
        setRelayStatus(data);
      } catch {
        // ignore transient polling errors
      }
    };

    refreshRelayStatus();
    const timer = setInterval(refreshRelayStatus, 3000);
    return () => clearInterval(timer);
  }, [relayToken]);

  useEffect(() => {
    updateTimeLeft();
    const timer = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [updateTimeLeft]);

  // Update relay token time left
  const updateRelayTimeLeft = useCallback(() => {
    if (!relayExpiresAt) {
      setRelayTimeLeft(null);
      return;
    }
    
    const expiresAt = new Date(relayExpiresAt).getTime();
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) {
      setRelayTimeLeft("Expired");
      return;
    }
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
      setRelayTimeLeft(`${minutes}m ${seconds}s`);
    } else {
      setRelayTimeLeft(`${seconds}s`);
    }
  }, [relayExpiresAt]);

  useEffect(() => {
    updateRelayTimeLeft();
    const timer = setInterval(updateRelayTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [updateRelayTimeLeft]);

  const generatePairCode = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/revit/pair", { method: "POST" });
      if (!response.ok) return;
      const data = (await response.json()) as { code: string; expiresAt: string };
      setPairCode(data.code);
      setPairCodeExpiresAt(data.expiresAt);
      setCopied(false);
      setSessionExpired(false);
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

  const generateRelayToken = async () => {
    setRelayLoading(true);
    try {
      const response = await fetch("/api/revit/relay/token", { method: "POST" });
      if (!response.ok) return;
      const data = (await response.json()) as RelayTokenResponse;
      setRelayToken(data.token);
      setRelayUrl(data.relayUrl);
      setRelayExpiresAt(data.expiresAt);
      setRelayStatus(null);
      setRelayCopied(false);
    } finally {
      setRelayLoading(false);
    }
  };

  const copyRelayInfo = async () => {
    if (!relayToken || !relayUrl) return;
    const text = `Relay URL: ${relayUrl}\nPairing Token: ${relayToken}`;
    await navigator.clipboard.writeText(text);
    setRelayCopied(true);
    setTimeout(() => setRelayCopied(false), 1500);
  };

  const keepMenuOpen = (event: Event) => {
    event.preventDefault();
  };

  const disconnectRevitAgent = async () => {
    if (!status?.activeSession?.id) return;
    setDisconnecting(true);
    try {
      await fetch("/api/revit/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: status.activeSession.id }),
      });
      setPairCode(null);
      setPairCodeExpiresAt(null);
      await refreshStatus();
    } finally {
      setDisconnecting(false);
    }
  };

  const pairCodeExpiryText = useMemo(() => {
    if (!pairCodeExpiresAt) return null;
    const expiresAt = new Date(pairCodeExpiresAt);
    const now = new Date();
    if (expiresAt <= now) return "Expired";
    return expiresAt.toLocaleTimeString();
  }, [pairCodeExpiresAt]);

  const isPairCodeExpired = useMemo(() => {
    if (!pairCodeExpiresAt) return false;
    return new Date(pairCodeExpiresAt) <= new Date();
  }, [pairCodeExpiresAt]);

  const isRelayTokenExpired = useMemo(() => {
    return relayTimeLeft === "Expired";
  }, [relayTimeLeft]);

  // Determine badge state (Cloud Relay first, local legacy fallback)
  const getBadgeContent = () => {
    if (relayStatus?.revitConnected) {
      return { variant: "default" as const, text: "Plugin connected" };
    }
    if (relayToken && !isRelayTokenExpired) {
      return { variant: "secondary" as const, text: "Waiting pairing" };
    }
    if (sessionExpired) {
      return { variant: "destructive" as const, text: "Session Expired" };
    }
    if (status?.connected) {
      return { variant: "default" as const, text: sessionTimeLeft ? `${sessionTimeLeft}` : "Connected" };
    }
    return { variant: "secondary" as const, text: "Disconnected" };
  };

  const badgeState = getBadgeContent();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {sessionExpired ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Revit</span>
          <Badge variant={badgeState.variant} className={sessionExpired ? "animate-pulse" : ""}>
            {sessionExpired && <Timer className="mr-1 h-3 w-3" />}
            {badgeState.text}
          </Badge>
        </Button>
      </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80">
          {showLegacyLocalPairing ? (
          <>
          <DropdownMenuLabel className="flex items-center justify-between">
            Revit Agent
          {sessionExpired && (
            <Badge variant="destructive" className="text-[10px]">
              Session Expired
            </Badge>
          )}
        </DropdownMenuLabel>
        
        {sessionExpired && (
          <>
            <div className="mx-2 mb-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Connection Expired
              </div>
              <p className="mt-1 text-[11px] opacity-80">
                Generate a new pairing code to reconnect.
              </p>
            </div>
          </>
        )}
        
        <DropdownMenuItem onClick={refreshStatus}>
          <RefreshCw className="h-4 w-4" />
          Refresh status
        </DropdownMenuItem>
        <DropdownMenuItem onClick={generatePairCode} disabled={loading}>
          <Link2 className="h-4 w-4" />
          {loading ? "Generating..." : sessionExpired ? "Reconnect (New Code)" : "Generate pair code"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={disconnectRevitAgent} disabled={!status?.connected || disconnecting}>
          <PlugZap className="h-4 w-4" />
          {disconnecting ? "Disconnecting..." : "Disconnect Revit agent"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={downloadUrl} target="_blank" rel="noreferrer">
            <Download className="h-4 w-4" />
            Download Windows agent (.exe)
          </a>
        </DropdownMenuItem>
        {showLegacyLocalPairing ? <DropdownMenuSeparator /> : null}
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {status?.connected
            ? `Connected to ${status.activeSession?.deviceName || "device"}`
            : "No active local Revit agent"}
        </div>
        {status?.updateAvailable ? (
          <>
            <div className="px-2 pb-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              New agent version available ({status.currentAgentVersion || "unknown"} → {status.latestAgentVersion || "latest"}).
            </div>
            <DropdownMenuItem asChild>
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                Update agent now
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
        <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">
          Agent version: {status?.currentAgentVersion || "unknown"}
          {status?.latestAgentVersion ? ` • Latest: ${status.latestAgentVersion}` : ""}
        </div>
        <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">
          Flow: Download agent, run on Revit machine, paste pairing code, keep Revit plugin ON.
        </div>

        {pairCode ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={copyPairCode} disabled={isPairCodeExpired}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Code copied" : isPairCodeExpired ? "Code expired" : "Copy pairing code"}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/revit-agent-setup.md" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open setup guide
              </a>
            </DropdownMenuItem>
            <div className="px-2 py-1.5">
              <div className="mb-1 text-[11px] text-muted-foreground">Pairing code</div>
              <div className={`flex items-center justify-between rounded-md border px-2 py-1 ${isPairCodeExpired ? "border-destructive/50 bg-destructive/10" : ""}`}>
                <span className={`font-semibold tracking-wider ${isPairCodeExpired ? "text-muted-foreground line-through" : ""}`}>
                  {pairCode}
                </span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={copyPairCode} disabled={isPairCodeExpired}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              {pairCodeExpiryText ? (
                <div className={`mt-1 text-[11px] ${isPairCodeExpired ? "text-destructive" : "text-muted-foreground"}`}>
                  {isPairCodeExpired ? "Code expired - generate a new one" : `Expires at ${pairCodeExpiryText}`}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
          </>
          ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Cloud Relay (Revit Plugin)</DropdownMenuLabel>
        <DropdownMenuItem onSelect={keepMenuOpen} onClick={generateRelayToken} disabled={relayLoading}>
          <Link2 className="h-4 w-4" />
          {relayLoading ? "Generating..." : "Generate relay token"}
        </DropdownMenuItem>
        <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">
          Use in Revit plugin: Settings {'>'} Cloud Relay
        </div>

        {relayToken ? (
          <>
            <DropdownMenuItem onSelect={keepMenuOpen} onClick={copyRelayInfo} disabled={isRelayTokenExpired}>
              {relayCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {relayCopied ? "Relay info copied" : isRelayTokenExpired ? "Token expired" : "Copy URL + token"}
            </DropdownMenuItem>
            <div className="px-2 py-1.5">
              <div className="mb-1 text-[11px] text-muted-foreground">Relay URL</div>
              <div className="rounded-md border px-2 py-1 text-[11px] break-all">
                {relayUrl}
              </div>
            </div>
            <div className="px-2 py-1.5">
              <div className="mb-1 text-[11px] text-muted-foreground">Pairing token</div>
              <div className={`rounded-md border px-2 py-1 text-sm font-semibold tracking-wider ${isRelayTokenExpired ? "border-destructive/50 bg-destructive/10 text-muted-foreground line-through" : ""}`}>
                {relayToken}
              </div>
              {relayTimeLeft ? (
                <div className={`mt-1 text-[11px] ${isRelayTokenExpired ? "text-destructive" : "text-muted-foreground"}`}>
                  {isRelayTokenExpired ? "Token expired - generate a new one" : `Expires in ${relayTimeLeft}`}
                </div>
              ) : null}
            </div>
            <div className="px-2 pb-2 text-[11px]">
              <span className={relayStatus?.revitConnected ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>
                {relayStatus?.revitConnected ? "Plugin connected" : "Waiting for plugin connection..."}
              </span>
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
