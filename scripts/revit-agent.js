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
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveConfig(nextConfig) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2), "utf8");
}

const args = parseArgs(process.argv.slice(2));
const config = loadConfig();

const DATUM_URL = args.url || process.env.DATUM_URL || config.datumUrl || "http://localhost:3000";
const POLL_MS = Number(args.pollMs || process.env.AGENT_POLL_MS || config.pollMs || 1200);
const HEARTBEAT_MS = Number(args.heartbeatMs || process.env.AGENT_HEARTBEAT_MS || config.heartbeatMs || 5000);
const REVIT_HOST = args.revitHost || process.env.REVIT_HOST || config.revitHost || "127.0.0.1";
const REVIT_PORT = Number(args.revitPort || process.env.REVIT_PORT || config.revitPort || 8080);
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

    socket.connect(REVIT_PORT, REVIT_HOST, () => {
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

async function api(path, options = {}) {
  const url = new URL(path, DATUM_URL);
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
            reject(new Error(data?.error || `HTTP ${res.statusCode || 500}`));
            return;
          }

          resolve(data);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });
    req.on("error", reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function canConnectToRevit(timeoutMs = REVIT_CONNECT_TIMEOUT_MS) {
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

    socket.connect(REVIT_PORT, REVIT_HOST);
  });
}

async function waitForRevitPluginReady(maxWaitMs, reasonLabel) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    const ok = await canConnectToRevit();
    if (ok) {
      return true;
    }

    const now = Date.now();
    if (now - lastRevitOfflineLogAt >= 10000) {
      lastRevitOfflineLogAt = now;
      log(
        `Revit plugin not reachable on ${REVIT_HOST}:${REVIT_PORT} (${reasonLabel}). Retrying in ${REVIT_RETRY_MS}ms...`
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

  const nextConfig = {
    datumUrl: DATUM_URL,
    revitHost: REVIT_HOST,
    revitPort: REVIT_PORT,
    pollMs: POLL_MS,
    heartbeatMs: HEARTBEAT_MS,
    revitConnectTimeoutMs: REVIT_CONNECT_TIMEOUT_MS,
    revitStartupWaitMs: REVIT_STARTUP_WAIT_MS,
    revitRetryMs: REVIT_RETRY_MS,
    token,
  };
  saveConfig(nextConfig);

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
      log(`Command poll error: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function main() {
  acquireSingleInstanceLock();
  setupSignalHandlers();

  if (args.help) {
    console.log("Datum Revit Agent");
    console.log("Options:");
    console.log("  --url <https://domain>");
    console.log("  --token <agent-token>");
    console.log("  --pair-code <code>");
    console.log("  --revitHost <host>");
    console.log("  --revitPort <port>");
    console.log("  --pollMs <ms>");
    console.log("  --heartbeatMs <ms>");
    console.log("  --revitConnectTimeoutMs <ms>");
    console.log("  --revitStartupWaitMs <ms>");
    console.log("  --revitRetryMs <ms>");
    console.log("  --help");
    releaseSingleInstanceLock();
    return;
  }

  if (!token) {
    await pairWithRetry();
  }

  log(`Datum URL: ${DATUM_URL}`);
  log(`Revit plugin socket: ${REVIT_HOST}:${REVIT_PORT}`);
  log(`Config: ${CONFIG_PATH}`);
  log(`Log file: ${LOG_PATH}`);

  const startupReady = await waitForRevitPluginReady(REVIT_STARTUP_WAIT_MS, "startup check");
  if (!startupReady) {
    log(
      `Revit plugin is still not reachable on ${REVIT_HOST}:${REVIT_PORT}. Agent will continue and retry automatically.`
    );
  } else {
    log("Revit plugin connection established.");
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
