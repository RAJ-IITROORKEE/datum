#!/usr/bin/env node

const net = require("node:net");
const readline = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const https = require("node:https");

const APP_DIR = path.join(os.homedir(), "AppData", "Roaming", "DatumRevitAgent");
const CONFIG_PATH = process.env.DATUM_AGENT_CONFIG || path.join(APP_DIR, "config.json");
const LOG_PATH = path.join(APP_DIR, "agent.log");
const LOCK_PATH = path.join(APP_DIR, "agent.lock");

class ApiRequestError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function ensureConfigDir() {
  if (!fs.existsSync(APP_DIR)) {
    fs.mkdirSync(APP_DIR, { recursive: true });
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    ensureConfigDir();
    fs.appendFileSync(LOG_PATH, `${line}\n`, "utf8");
  } catch {
    // ignore file logging failures
  }
}

function promptLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || ""));
    });
  });
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const config = JSON.parse(raw);
    
    // Migrate old localhost URLs to production
    if (config.datumUrl === "http://localhost:3000" || config.datumUrl === "http://127.0.0.1:3000") {
      log("Migrating config: Updating localhost URL to production URL");
      config.datumUrl = "https://datumcopilot.vercel.app";
      saveConfig(config);
    }
    
    return config;
  } catch {
    return {};
  }
}

function saveConfig(nextConfig) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2), "utf8");
}

function parsePortList(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((port) => Number.isInteger(port) && port > 0 && port < 65536);
}

function parseUrlList(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeBaseUrl(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

const args = parseArgs(process.argv.slice(2));
const config = loadConfig();

// Default to production URL for packaged builds, use IPv4 127.0.0.1 for local dev to avoid IPv6 issues
const DEFAULT_DATUM_URL = "https://datumcopilot.vercel.app";
const configuredDatumUrl = normalizeBaseUrl(args.url || process.env.DATUM_URL || config.datumUrl || DEFAULT_DATUM_URL);
const configuredDatumFallbacks = parseUrlList(
  args.urlFallbacks || process.env.DATUM_URL_FALLBACKS || config.datumUrlFallbacks || ""
).map((url) => normalizeBaseUrl(url));
const DATUM_URLS = Array.from(new Set([configuredDatumUrl, ...configuredDatumFallbacks, DEFAULT_DATUM_URL].filter(Boolean)));
const POLL_MS = Number(args.pollMs || process.env.AGENT_POLL_MS || config.pollMs || 1200);
const HEARTBEAT_MS = Number(args.heartbeatMs || process.env.AGENT_HEARTBEAT_MS || config.heartbeatMs || 5000);
const REVIT_HOST = args.revitHost || process.env.REVIT_HOST || config.revitHost || "127.0.0.1";
const configuredRevitPort = Number(args.revitPort || process.env.REVIT_PORT || config.revitPort || 8080);
const configuredRevitPorts = parsePortList(
  args.revitPorts || process.env.REVIT_PORTS || config.revitPorts || ""
);
const REVIT_PORTS = Array.from(
  new Set([configuredRevitPort, ...configuredRevitPorts, 8080, 8000].filter((port) => Number.isInteger(port)))
);
const REVIT_CONNECT_TIMEOUT_MS = Number(
  args.revitConnectTimeoutMs || process.env.REVIT_CONNECT_TIMEOUT_MS || config.revitConnectTimeoutMs || 3000
);
const REVIT_STARTUP_WAIT_MS = Number(
  args.revitStartupWaitMs || process.env.REVIT_STARTUP_WAIT_MS || config.revitStartupWaitMs || 120000
);
const REVIT_RETRY_MS = Number(args.revitRetryMs || process.env.REVIT_RETRY_MS || config.revitRetryMs || 2000);
const AGENT_VERSION = "1.1.0";

let token = args.token || process.env.REVIT_AGENT_TOKEN || config.token || "";
let lockFd = null;
let lastRevitOfflineLogAt = 0;
let activeRevitPort = REVIT_PORTS[0];
let activeDatumUrl = DATUM_URLS[0];

function saveRuntimeConfig() {
  saveConfig({
    datumUrl: activeDatumUrl,
    datumUrlFallbacks: DATUM_URLS.slice(1).join(","),
    revitHost: REVIT_HOST,
    revitPort: activeRevitPort,
    revitPorts: REVIT_PORTS.join(","),
    pollMs: POLL_MS,
    heartbeatMs: HEARTBEAT_MS,
    revitConnectTimeoutMs: REVIT_CONNECT_TIMEOUT_MS,
    revitStartupWaitMs: REVIT_STARTUP_WAIT_MS,
    revitRetryMs: REVIT_RETRY_MS,
    token,
  });
}

function isUnauthorizedError(error) {
  return error instanceof ApiRequestError && error.statusCode === 401;
}

async function clearTokenAndRepair(reason) {
  log(reason);
  token = "";
  saveRuntimeConfig();
  await pairWithRetry();
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function releaseSingleInstanceLock() {
  try {
    if (lockFd !== null) {
      fs.closeSync(lockFd);
      lockFd = null;
    }
  } catch {
    // ignore close errors
  }

  try {
    if (fs.existsSync(LOCK_PATH)) {
      fs.unlinkSync(LOCK_PATH);
    }
  } catch {
    // ignore unlink errors
  }
}

function acquireSingleInstanceLock() {
  ensureConfigDir();

  try {
    lockFd = fs.openSync(LOCK_PATH, "wx");
    fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), "utf8");
    return;
  } catch (error) {
    if (error && error.code !== "EEXIST") {
      throw error;
    }
  }

  try {
    const lockRaw = fs.readFileSync(LOCK_PATH, "utf8");
    const lockData = JSON.parse(lockRaw);
    if (isPidRunning(Number(lockData?.pid))) {
      throw new Error("Datum Revit Agent is already running. Close the existing agent terminal first.");
    }
    fs.unlinkSync(LOCK_PATH);
  } catch (error) {
    if (error instanceof Error && error.message.includes("already running")) {
      throw error;
    }
  }

  lockFd = fs.openSync(LOCK_PATH, "wx");
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), "utf8");
}

function setupSignalHandlers() {
  process.on("SIGINT", () => {
    releaseSingleInstanceLock();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    releaseSingleInstanceLock();
    process.exit(0);
  });

  process.on("exit", () => {
    releaseSingleInstanceLock();
  });
}

function jsonRpcRequest(commandName, payload) {
  return {
    jsonrpc: "2.0",
    method: commandName,
    params: payload || {},
    id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
  };
}

function sendToLocalRevit(commandName, payload) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Timed out waiting for Revit plugin response"));
    }, 120000);

    socket.connect(activeRevitPort, REVIT_HOST, () => {
      const request = jsonRpcRequest(commandName, payload);
      socket.write(JSON.stringify(request));
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      try {
        const response = JSON.parse(buffer);
        clearTimeout(timer);
        socket.end();
        if (response.error) {
          reject(new Error(response.error.message || "Revit command failed"));
          return;
        }
        resolve(response.result);
      } catch {
        // wait for complete response
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    socket.on("close", () => {
      clearTimeout(timer);
    });
  });
}

function isNetworkRetryableError(error) {
  const code = error && typeof error === "object" ? error.code : "";
  return code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
}

function apiRequest(baseUrl, requestPath, options = {}) {
  const url = new URL(requestPath, baseUrl);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const body = options.body;
  const method = options.method || "GET";

  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method,
        headers,
        timeout: 30000,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = { raw };
          }

          if ((res.statusCode || 500) >= 400) {
            reject(new ApiRequestError(data?.error || `HTTP ${res.statusCode || 500}`, res.statusCode || 500));
            return;
          }

          resolve(data);
        });
      }
    );

    req.on("timeout", () => {
      const timeoutError = new Error("Request timed out");
      timeoutError.code = "ETIMEDOUT";
      req.destroy(timeoutError);
    });
    req.on("error", reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function api(requestPath, options = {}) {
  let lastError = null;

  for (const baseUrl of DATUM_URLS) {
    try {
      const response = await apiRequest(baseUrl, requestPath, options);
      if (activeDatumUrl !== baseUrl) {
        activeDatumUrl = baseUrl;
        saveRuntimeConfig();
        log(`Switched Datum URL to: ${activeDatumUrl}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!isNetworkRetryableError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Failed to reach Datum API");
}

function canConnectToRevitPort(port, timeoutMs = REVIT_CONNECT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));

    socket.connect(port, REVIT_HOST);
  });
}

async function findReachableRevitPort(timeoutMs = REVIT_CONNECT_TIMEOUT_MS) {
  for (const port of REVIT_PORTS) {
    const ok = await canConnectToRevitPort(port, timeoutMs);
    if (ok) {
      return port;
    }
  }
  return null;
}

async function waitForRevitPluginReady(maxWaitMs, reasonLabel) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    const reachablePort = await findReachableRevitPort();
    if (reachablePort !== null) {
      activeRevitPort = reachablePort;
      return true;
    }

    const now = Date.now();
    if (now - lastRevitOfflineLogAt >= 10000) {
      lastRevitOfflineLogAt = now;
      log(
        `Revit plugin not reachable on ${REVIT_HOST} ports [${REVIT_PORTS.join(", ")}] (${reasonLabel}). Retrying in ${REVIT_RETRY_MS}ms...`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, REVIT_RETRY_MS));
  }

  return false;
}

async function pairFlow() {
  const prefilledCode = typeof args["pair-code"] === "string" ? args["pair-code"].trim().toUpperCase() : "";
  const code = prefilledCode || (await promptLine("Enter pairing code from Copilot UI: ")).trim().toUpperCase();

  const pairResult = await api("/api/revit/agent/pair", {
    method: "POST",
    body: JSON.stringify({
      code,
      deviceName: process.env.COMPUTERNAME || "Windows-PC",
      os: process.platform,
      agentVersion: AGENT_VERSION,
    }),
  });

  token = pairResult.token;
  saveRuntimeConfig();

  log("Paired successfully. Token saved to config.");
  log(`Config file: ${CONFIG_PATH}`);
}

async function pairWithRetry() {
  while (!token) {
    try {
      await pairFlow();
      break;
    } catch (error) {
      log(`Pairing failed: ${error.message || String(error)}`);
      const retry = (await promptLine("Pairing failed. Try again? (y/n): ")).trim().toLowerCase();
      if (retry !== "y" && retry !== "yes") {
        throw new Error("Pairing cancelled by user");
      }
    }
  }
}

async function heartbeatLoop() {
  while (true) {
    try {
      await api("/api/revit/agent/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          deviceName: process.env.COMPUTERNAME || "Windows-PC",
          os: process.platform,
          agentVersion: AGENT_VERSION,
        }),
      });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearTokenAndRepair("Heartbeat unauthorized. Pairing token expired/revoked; re-pairing required.");
        continue;
      }
      log(`Heartbeat error: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_MS));
  }
}

async function commandLoop() {
  while (true) {
    try {
      const revitReady = await waitForRevitPluginReady(REVIT_RETRY_MS, "before polling commands");
      if (!revitReady) {
        await new Promise((resolve) => setTimeout(resolve, REVIT_RETRY_MS));
        continue;
      }

      const pull = await api("/api/revit/agent/jobs/pull", { method: "POST", body: "{}" });
      const jobs = pull?.jobs || [];

      for (const job of jobs) {
        try {
          const result = await sendToLocalRevit(job.commandName, job.payload);
          await api("/api/revit/agent/jobs/result", {
            method: "POST",
            body: JSON.stringify({
              jobId: job.id,
              success: true,
              result,
            }),
          });
        } catch (error) {
          await api("/api/revit/agent/jobs/result", {
            method: "POST",
            body: JSON.stringify({
              jobId: job.id,
              success: false,
              error: error.message,
            }),
          });
        }
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearTokenAndRepair("Agent token unauthorized while polling commands. Re-pairing required.");
        continue;
      }
      log(`Command poll error: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function main() {
  if (args.help) {
    console.log("Datum Revit Agent");
    console.log("Options:");
    console.log("  --url <https://domain>");
    console.log("  --urlFallbacks <https://a,https://b>");
    console.log("  --token <agent-token>");
    console.log("  --pair-code <code>");
    console.log("  --revitHost <host>");
    console.log("  --revitPort <port>");
    console.log("  --revitPorts <csv>");
    console.log("  --pollMs <ms>");
    console.log("  --heartbeatMs <ms>");
    console.log("  --revitConnectTimeoutMs <ms>");
    console.log("  --revitStartupWaitMs <ms>");
    console.log("  --revitRetryMs <ms>");
    console.log("  --re-pair");
    console.log("  --help");
    return;
  }

  acquireSingleInstanceLock();
  setupSignalHandlers();

  if (args["re-pair"] || args["force-pair"]) {
    token = "";
    saveRuntimeConfig();
    log("Re-pair requested. Existing token cleared.");
  }

  if (!token) {
    await pairWithRetry();
  } else {
    try {
      await api("/api/revit/agent/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          deviceName: process.env.COMPUTERNAME || "Windows-PC",
          os: process.platform,
          agentVersion: AGENT_VERSION,
        }),
      });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearTokenAndRepair("Saved token is no longer valid. Please enter a new pairing code.");
      } else {
        log(`Initial token check warning: ${error.message}`);
      }
    }
  }

  log(`Datum URL: ${activeDatumUrl}`);
  if (DATUM_URLS.length > 1) {
    log(`Datum URL fallbacks: ${DATUM_URLS.slice(1).join(", ")}`);
  }
  log(`Revit plugin sockets: ${REVIT_HOST} on [${REVIT_PORTS.join(", ")}]`);
  log(`Config: ${CONFIG_PATH}`);
  log(`Log file: ${LOG_PATH}`);

  const startupReady = await waitForRevitPluginReady(REVIT_STARTUP_WAIT_MS, "startup check");
  if (!startupReady) {
    log(
      `Revit plugin is still not reachable on ${REVIT_HOST} ports [${REVIT_PORTS.join(", ")}]. Agent will continue and retry automatically.`
    );
  } else {
    log(`Revit plugin connection established on ${REVIT_HOST}:${activeRevitPort}.`);
  }

  log("Agent running. Press Ctrl+C to stop.");

  heartbeatLoop();
  await commandLoop();
}

main().catch(async (error) => {
  log(`Agent fatal error: ${error?.message || String(error)}`);
  releaseSingleInstanceLock();
  if (process.stdin.isTTY) {
    await promptLine("Press Enter to exit...");
  }
  process.exit(1);
});
