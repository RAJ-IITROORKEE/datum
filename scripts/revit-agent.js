#!/usr/bin/env node

const net = require("node:net");
const readline = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const APP_DIR = path.join(os.homedir(), "AppData", "Roaming", "DatumRevitAgent");
const CONFIG_PATH = process.env.DATUM_AGENT_CONFIG || path.join(APP_DIR, "config.json");

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

let token = args.token || process.env.REVIT_AGENT_TOKEN || config.token || "";

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
      } catch (_) {
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
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${DATUM_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

async function pairFlow() {
  const prefilledCode = typeof args["pair-code"] === "string" ? args["pair-code"].trim().toUpperCase() : "";
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code =
    prefilledCode ||
    (await new Promise((resolve) => {
      rl.question("Enter pairing code from Copilot UI: ", (answer) => resolve(answer.trim().toUpperCase()));
    }));
  rl.close();

  const pairResult = await api("/api/revit/agent/pair", {
    method: "POST",
    body: JSON.stringify({
      code,
      deviceName: process.env.COMPUTERNAME || "Windows-PC",
      os: process.platform,
      agentVersion: "1.0.0",
    }),
  });

  token = pairResult.token;

  const nextConfig = {
    datumUrl: DATUM_URL,
    revitHost: REVIT_HOST,
    revitPort: REVIT_PORT,
    pollMs: POLL_MS,
    heartbeatMs: HEARTBEAT_MS,
    token,
  };
  saveConfig(nextConfig);

  console.log("Paired successfully. Token saved to config.");
  console.log(`Config file: ${CONFIG_PATH}`);
}

async function heartbeatLoop() {
  while (true) {
    try {
      await api("/api/revit/agent/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          deviceName: process.env.COMPUTERNAME || "Windows-PC",
          os: process.platform,
          agentVersion: "1.0.0",
        }),
      });
    } catch (error) {
      console.error("Heartbeat error:", error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_MS));
  }
}

async function commandLoop() {
  while (true) {
    try {
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
      console.error("Command poll error:", error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function main() {
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
    console.log("  --help");
    return;
  }

  if (!token) {
    await pairFlow();
  }

  console.log(`Datum URL: ${DATUM_URL}`);
  console.log(`Revit plugin socket: ${REVIT_HOST}:${REVIT_PORT}`);
  console.log(`Config: ${CONFIG_PATH}`);
  console.log("Agent running. Press Ctrl+C to stop.");

  heartbeatLoop();
  await commandLoop();
}

main().catch((error) => {
  console.error("Agent fatal error:", error);
  process.exit(1);
});
