#!/usr/bin/env node

const net = require("node:net");
const readline = require("node:readline");

const DATUM_URL = process.env.DATUM_URL || "http://localhost:3000";
const POLL_MS = Number(process.env.AGENT_POLL_MS || 1200);
const HEARTBEAT_MS = Number(process.env.AGENT_HEARTBEAT_MS || 5000);
const REVIT_HOST = process.env.REVIT_HOST || "127.0.0.1";
const REVIT_PORT = Number(process.env.REVIT_PORT || 8080);

let token = process.env.REVIT_AGENT_TOKEN || "";

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
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) => {
    rl.question("Enter pairing code from Copilot UI: ", (answer) => resolve(answer.trim().toUpperCase()));
  });
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
  console.log("Paired successfully. Save this token securely:");
  console.log(token);
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
  if (!token) {
    await pairFlow();
  }

  console.log(`Datum URL: ${DATUM_URL}`);
  console.log(`Revit plugin socket: ${REVIT_HOST}:${REVIT_PORT}`);
  console.log("Agent running. Press Ctrl+C to stop.");

  heartbeatLoop();
  await commandLoop();
}

main().catch((error) => {
  console.error("Agent fatal error:", error);
  process.exit(1);
});
