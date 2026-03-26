#!/usr/bin/env node

const net = require("node:net");
const readline = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const https = require("node:https");

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const APP_DIR = path.join(os.homedir(), "AppData", "Roaming", "DatumRevitAgent");
const CONFIG_PATH = process.env.DATUM_AGENT_CONFIG || path.join(APP_DIR, "config.json");
const LOG_PATH = path.join(APP_DIR, "agent.log");
const LOCK_PATH = path.join(APP_DIR, "agent.lock");
const AGENT_VERSION = "1.4.0";

// ═══════════════════════════════════════════════════════════════════════════════
// TERMINAL COLORS & STYLING
// ═══════════════════════════════════════════════════════════════════════════════

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  // Foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  // Background
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

const c = {
  success: (text) => `${colors.green}${text}${colors.reset}`,
  error: (text) => `${colors.red}${text}${colors.reset}`,
  warning: (text) => `${colors.yellow}${text}${colors.reset}`,
  info: (text) => `${colors.cyan}${text}${colors.reset}`,
  dim: (text) => `${colors.dim}${text}${colors.reset}`,
  bright: (text) => `${colors.bright}${text}${colors.reset}`,
  highlight: (text) => `${colors.bgBlue}${colors.white}${text}${colors.reset}`,
  tool: (text) => `${colors.magenta}${text}${colors.reset}`,
  status: (connected) => connected 
    ? `${colors.bgGreen}${colors.black} CONNECTED ${colors.reset}`
    : `${colors.bgRed}${colors.white} DISCONNECTED ${colors.reset}`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// BANNER & UI
// ═══════════════════════════════════════════════════════════════════════════════

function printBanner() {
  console.log("");
  console.log(c.info("╔═══════════════════════════════════════════════════════════════════╗"));
  console.log(c.info("║") + c.bright("                    DATUM REVIT AGENT                            ") + c.info("║"));
  console.log(c.info("║") + c.dim(`                       Version ${AGENT_VERSION}                              `) + c.info("║"));
  console.log(c.info("╠═══════════════════════════════════════════════════════════════════╣"));
  console.log(c.info("║") + " Bridge between Datum Copilot (cloud) and local Revit             " + c.info("║"));
  console.log(c.info("╚═══════════════════════════════════════════════════════════════════╝"));
  console.log("");
}

function printSection(title) {
  console.log("");
  console.log(c.bright(`┌─ ${title} ${"─".repeat(Math.max(0, 60 - title.length))}┐`));
}

function printSectionEnd() {
  console.log(c.dim("└" + "─".repeat(64) + "┘"));
  console.log("");
}

function printKeyValue(key, value, color = null) {
  const formattedValue = color ? color(value) : value;
  console.log(`  ${c.dim("•")} ${key}: ${formattedValue}`);
}

function printStatus(revitConnected, datumConnected, heartbeatOk) {
  console.log("");
  console.log(c.bright("  Status Dashboard:"));
  console.log(`    Revit Plugin:  ${c.status(revitConnected)}`);
  console.log(`    Datum Server:  ${c.status(datumConnected)}`);
  console.log(`    Heartbeat:     ${heartbeatOk ? c.success("OK") : c.error("FAILED")}`);
  console.log("");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

class ApiRequestError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARGUMENT PARSING
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// FILE SYSTEM HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function ensureConfigDir() {
  if (!fs.existsSync(APP_DIR)) {
    fs.mkdirSync(APP_DIR, { recursive: true });
  }
}

function log(message, level = "info") {
  const timestamp = new Date().toISOString();
  let coloredMessage;
  let prefix;
  
  switch (level) {
    case "success":
      prefix = c.success("[SUCCESS]");
      coloredMessage = c.success(message);
      break;
    case "error":
      prefix = c.error("[ERROR]");
      coloredMessage = c.error(message);
      break;
    case "warning":
      prefix = c.warning("[WARNING]");
      coloredMessage = c.warning(message);
      break;
    case "tool":
      prefix = c.tool("[TOOL]");
      coloredMessage = c.tool(message);
      break;
    case "debug":
      prefix = c.dim("[DEBUG]");
      coloredMessage = c.dim(message);
      break;
    default:
      prefix = c.info("[INFO]");
      coloredMessage = message;
  }
  
  const line = `[${timestamp}] ${message}`;
  console.log(`${c.dim(timestamp)} ${prefix} ${coloredMessage}`);
  
  try {
    ensureConfigDir();
    fs.appendFileSync(LOG_PATH, `${line}\n`, "utf8");
  } catch {
    // ignore file logging failures
  }
}

function promptLine(question, isPassword = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(c.bright(question), (answer) => {
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
      log("Migrating config: Updating localhost URL to production URL", "warning");
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

// ═══════════════════════════════════════════════════════════════════════════════
// URL & PORT PARSING
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const args = parseArgs(process.argv.slice(2));
const config = loadConfig();

// Default to production URL for packaged builds
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

let token = args.token || process.env.REVIT_AGENT_TOKEN || config.token || "";
let lockFd = null;
let lastRevitOfflineLogAt = 0;
let activeRevitPort = REVIT_PORTS[0];
let activeDatumUrl = DATUM_URLS[0];

// Statistics tracking
let stats = {
  commandsExecuted: 0,
  commandsFailed: 0,
  heartbeats: 0,
  startTime: Date.now(),
  lastCommandAt: null,
  lastHeartbeatAt: null,
  revitConnectionLost: 0,
};

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

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function isUnauthorizedError(error) {
  return error instanceof ApiRequestError && error.statusCode === 401;
}

async function clearTokenAndRepair(reason) {
  log(reason, "warning");
  token = "";
  saveRuntimeConfig();
  await pairWithRetry();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE INSTANCE LOCK
// ═══════════════════════════════════════════════════════════════════════════════

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

function killExistingAgent() {
  try {
    if (!fs.existsSync(LOCK_PATH)) {
      log("No existing agent process found", "info");
      return false;
    }

    const lockRaw = fs.readFileSync(LOCK_PATH, "utf8");
    const lockData = JSON.parse(lockRaw);
    const pid = Number(lockData?.pid);

    if (!isPidRunning(pid)) {
      log("Lock file exists but process is not running, cleaning up", "info");
      fs.unlinkSync(LOCK_PATH);
      return false;
    }

    log(`Killing existing agent process (PID: ${pid})`, "warning");
    process.kill(pid, "SIGTERM");
    
    // Wait for process to die
    let attempts = 0;
    while (isPidRunning(pid) && attempts < 10) {
      attempts++;
      const sleepMs = 500;
      const sleepUntil = Date.now() + sleepMs;
      while (Date.now() < sleepUntil) {
        // busy wait
      }
    }

    if (isPidRunning(pid)) {
      log("Process still running, forcing kill", "warning");
      process.kill(pid, "SIGKILL");
    }

    fs.unlinkSync(LOCK_PATH);
    log("Existing agent process terminated", "success");
    return true;
  } catch (error) {
    log(`Failed to kill existing agent: ${error.message}`, "error");
    return false;
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
      throw new Error("Datum Revit Agent is already running. Use --kill to stop it, or close the existing agent terminal first.");
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
    console.log("");
    log("Shutting down gracefully (SIGINT)...", "warning");
    releaseSingleInstanceLock();
    printSection("Session Statistics");
    printKeyValue("Commands executed", stats.commandsExecuted.toString(), c.success);
    printKeyValue("Commands failed", stats.commandsFailed.toString(), stats.commandsFailed > 0 ? c.error : c.dim);
    printKeyValue("Heartbeats sent", stats.heartbeats.toString());
    printKeyValue("Uptime", formatUptime(Date.now() - stats.startTime));
    printSectionEnd();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log("Shutting down gracefully (SIGTERM)...", "warning");
    releaseSingleInstanceLock();
    process.exit(0);
  });

  process.on("exit", () => {
    releaseSingleInstanceLock();
  });
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON-RPC COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════════

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
      reject(new Error("Timed out waiting for Revit plugin response (120s)"));
    }, 120000);

    socket.connect(activeRevitPort, REVIT_HOST, () => {
      const request = jsonRpcRequest(commandName, payload);
      log(`Sending to Revit: ${c.tool(commandName)} on port ${activeRevitPort}`, "tool");
      log(`  Request ID: ${request.id}`, "dim");
      log(`  Payload keys: ${Object.keys(payload || {}).join(", ") || "(empty)"}`, "dim");
      socket.write(JSON.stringify(request));
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      try {
        const response = JSON.parse(buffer);
        clearTimeout(timer);
        socket.end();
        
        // Log response details
        if (response.error) {
          log(`  Revit returned error: ${response.error.message || JSON.stringify(response.error)}`, "error");
          reject(new Error(response.error.message || "Revit command failed"));
          return;
        }
        
        // Log success details
        const resultType = typeof response.result;
        const resultPreview = resultType === "object" 
          ? `Object with keys: ${Object.keys(response.result || {}).slice(0, 5).join(", ")}`
          : String(response.result).substring(0, 100);
        log(`  Revit response: ${c.success("OK")} - ${resultPreview}`, "success");
        
        resolve(response.result);
      } catch {
        // wait for complete response
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timer);
      stats.revitConnectionLost++;
      reject(error);
    });

    socket.on("close", () => {
      clearTimeout(timer);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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
        log(`Switched Datum URL to: ${activeDatumUrl}`, "warning");
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

// ═══════════════════════════════════════════════════════════════════════════════
// REVIT CONNECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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
        `Revit plugin not reachable on ${REVIT_HOST} ports [${REVIT_PORTS.join(", ")}] (${reasonLabel}). Retrying...`,
        "warning"
      );
    }
    await new Promise((resolve) => setTimeout(resolve, REVIT_RETRY_MS));
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAIRING FLOW
// ═══════════════════════════════════════════════════════════════════════════════

async function pairFlow() {
  printSection("Pairing Setup");
  console.log(c.info("  To pair this agent with your Datum account:"));
  console.log(c.dim("  1. Go to Datum Copilot (/copilot)"));
  console.log(c.dim("  2. Click 'Revit' button in the chat header"));
  console.log(c.dim("  3. Click 'Generate pair code'"));
  console.log(c.dim("  4. Enter the 6-character code below"));
  console.log("");

  const prefilledCode = typeof args["pair-code"] === "string" ? args["pair-code"].trim().toUpperCase() : "";
  const code = prefilledCode || (await promptLine("  Enter pairing code: ")).trim().toUpperCase();

  if (!code || code.length !== 6) {
    throw new Error("Invalid pairing code. Must be 6 characters.");
  }

  console.log("");
  log("Validating pairing code...", "info");

  const pairResult = await api("/api/revit/agent/pair", {
    method: "POST",
    body: JSON.stringify({
      code,
      deviceName: process.env.COMPUTERNAME || os.hostname() || "Windows-PC",
      os: process.platform,
      agentVersion: AGENT_VERSION,
    }),
  });

  token = pairResult.token;
  saveRuntimeConfig();

  log("Pairing successful! Agent is now connected to your Datum account.", "success");
  printSectionEnd();
}

async function pairWithRetry() {
  while (!token) {
    try {
      await pairFlow();
      break;
    } catch (error) {
      log(`Pairing failed: ${error.message || String(error)}`, "error");
      const retry = (await promptLine("  Try again? (y/n): ")).trim().toLowerCase();
      if (retry !== "y" && retry !== "yes") {
        throw new Error("Pairing cancelled by user");
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LOOPS
// ═══════════════════════════════════════════════════════════════════════════════

async function heartbeatLoop() {
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 5;

  while (true) {
    try {
      await api("/api/revit/agent/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          deviceName: process.env.COMPUTERNAME || os.hostname() || "Windows-PC",
          os: process.platform,
          agentVersion: AGENT_VERSION,
        }),
      });
      stats.heartbeats++;
      stats.lastHeartbeatAt = Date.now();
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures++;
      if (isUnauthorizedError(error)) {
        await clearTokenAndRepair("Heartbeat unauthorized. Pairing token expired/revoked; re-pairing required.");
        continue;
      }
      if (consecutiveFailures >= maxConsecutiveFailures) {
        log(`Heartbeat failed ${consecutiveFailures} times: ${error.message}`, "error");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_MS));
  }
}

async function commandLoop() {
  let consecutiveRevitFailures = 0;
  const maxRevitFailures = 3;

  while (true) {
    try {
      const revitReady = await waitForRevitPluginReady(REVIT_RETRY_MS, "before polling commands");
      if (!revitReady) {
        consecutiveRevitFailures++;
        if (consecutiveRevitFailures % 10 === 1) {
          log(`Waiting for Revit plugin connection... (attempt ${consecutiveRevitFailures})`, "warning");
        }
        await new Promise((resolve) => setTimeout(resolve, REVIT_RETRY_MS));
        continue;
      }
      
      if (consecutiveRevitFailures > 0) {
        log(`Revit plugin reconnected on port ${activeRevitPort}`, "success");
        consecutiveRevitFailures = 0;
      }

      const pull = await api("/api/revit/agent/jobs/pull", { method: "POST", body: "{}" });
      const jobs = pull?.jobs || [];

      for (const job of jobs) {
        console.log(""); // Visual separator
        log(`${"═".repeat(50)}`, "info");
        log(`Executing command: ${c.tool(job.commandName)}`, "tool");
        log(`  Job ID: ${job.id}`, "dim");
        const startTime = Date.now();
        
        try {
          const result = await sendToLocalRevit(job.commandName, job.payload);
          const duration = Date.now() - startTime;
          
          await api("/api/revit/agent/jobs/result", {
            method: "POST",
            body: JSON.stringify({
              jobId: job.id,
              success: true,
              result,
            }),
          });
          
          stats.commandsExecuted++;
          stats.lastCommandAt = Date.now();
          log(`Command ${c.tool(job.commandName)} ${c.success("COMPLETED")} in ${duration}ms`, "success");
          log(`${"═".repeat(50)}`, "info");
          
        } catch (error) {
          const duration = Date.now() - startTime;
          
          await api("/api/revit/agent/jobs/result", {
            method: "POST",
            body: JSON.stringify({
              jobId: job.id,
              success: false,
              error: error.message,
            }),
          });
          
          stats.commandsFailed++;
          log(`Command ${c.tool(job.commandName)} ${c.error("FAILED")} after ${duration}ms`, "error");
          log(`  Error: ${error.message}`, "error");
          log(`${"═".repeat(50)}`, "info");
        }
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearTokenAndRepair("Agent token unauthorized while polling commands. Re-pairing required.");
        continue;
      }
      log(`Command poll error: ${error.message}`, "error");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  if (args.help) {
    printBanner();
    printSection("Usage");
    console.log("  datum-revit-agent [options]");
    console.log("");
    console.log("  Options:");
    console.log("    --url <https://domain>        Datum server URL");
    console.log("    --urlFallbacks <url1,url2>    Fallback URLs");
    console.log("    --token <agent-token>         Pre-set agent token");
    console.log("    --pair-code <code>            Pre-fill pairing code");
    console.log("    --revitHost <host>            Revit plugin host (default: 127.0.0.1)");
    console.log("    --revitPort <port>            Revit plugin port (default: 8080)");
    console.log("    --revitPorts <port1,port2>    Additional ports to try");
    console.log("    --pollMs <ms>                 Command poll interval (default: 1200)");
    console.log("    --heartbeatMs <ms>            Heartbeat interval (default: 5000)");
    console.log("    --re-pair                     Clear saved token and re-pair");
    console.log("    --kill                        Kill existing agent process");
    console.log("    --help                        Show this help");
    printSectionEnd();
    return;
  }

  // Handle --kill flag
  if (args.kill) {
    printBanner();
    const killed = killExistingAgent();
    if (!killed) {
      console.log("");
      console.log(c.info("  No agent process to kill."));
    }
    console.log("");
    return;
  }

  printBanner();

  try {
    acquireSingleInstanceLock();
  } catch (error) {
    log(error.message, "error");
    console.log("");
    await promptLine("Press Enter to exit...");
    process.exit(1);
  }
  
  setupSignalHandlers();

  if (args["re-pair"] || args["force-pair"]) {
    token = "";
    saveRuntimeConfig();
    log("Re-pair requested. Existing token cleared.", "warning");
  }

  if (!token) {
    await pairWithRetry();
  } else {
    log("Found existing pairing token, validating...", "info");
    try {
      await api("/api/revit/agent/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          deviceName: process.env.COMPUTERNAME || os.hostname() || "Windows-PC",
          os: process.platform,
          agentVersion: AGENT_VERSION,
        }),
      });
      log("Token validated successfully", "success");
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearTokenAndRepair("Saved token is no longer valid. Please enter a new pairing code.");
      } else {
        log(`Initial token check warning: ${error.message}`, "warning");
      }
    }
  }

  printSection("Configuration");
  printKeyValue("Datum URL", activeDatumUrl, c.info);
  if (DATUM_URLS.length > 1) {
    printKeyValue("Fallback URLs", DATUM_URLS.slice(1).join(", "), c.dim);
  }
  printKeyValue("Revit plugin host", REVIT_HOST);
  printKeyValue("Revit plugin ports", REVIT_PORTS.join(", "));
  printKeyValue("Config file", CONFIG_PATH, c.dim);
  printKeyValue("Log file", LOG_PATH, c.dim);
  printSectionEnd();

  log("Waiting for Revit plugin connection...", "info");
  const startupReady = await waitForRevitPluginReady(REVIT_STARTUP_WAIT_MS, "startup check");
  
  if (!startupReady) {
    log(
      `Revit plugin is not reachable on ${REVIT_HOST} ports [${REVIT_PORTS.join(", ")}]. Agent will continue and retry automatically.`,
      "warning"
    );
    console.log("");
    console.log(c.warning("  Make sure:"));
    console.log(c.dim("  1. Revit is running"));
    console.log(c.dim("  2. The Datum MCP plugin is loaded in Revit"));
    console.log(c.dim("  3. The plugin socket server is listening on port 8080"));
    console.log("");
  } else {
    log(`Revit plugin connected on ${REVIT_HOST}:${activeRevitPort}`, "success");
  }

  printSection("Agent Running");
  console.log(c.success("  Agent is now running and listening for commands."));
  console.log(c.dim("  Commands from Datum Copilot will be forwarded to Revit."));
  console.log("");
  console.log(c.dim("  Press Ctrl+C to stop the agent."));
  printSectionEnd();

  heartbeatLoop();
  await commandLoop();
}

main().catch(async (error) => {
  log(`Agent fatal error: ${error?.message || String(error)}`, "error");
  releaseSingleInstanceLock();
  if (process.stdin.isTTY) {
    console.log("");
    await promptLine("Press Enter to exit...");
  }
  process.exit(1);
});
