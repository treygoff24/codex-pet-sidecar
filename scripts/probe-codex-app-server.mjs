#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

if (typeof WebSocket === "undefined") {
  throw new Error("This probe requires a Node.js version with a global WebSocket implementation.");
}

const schema = JSON.parse(
  readFileSync("protocol/app-server/schema/v2/ThreadStartParams.json", "utf8"),
);
const approvalEnums = schema.definitions.AskForApproval.oneOf.flatMap((entry) => entry.enum ?? []);
const sandboxEnums = schema.definitions.SandboxMode.enum;
const safeApprovalPolicy = approvalEnums.includes("on-request")
  ? "on-request"
  : approvalEnums.includes("untrusted")
    ? "untrusted"
    : null;
const supportsWorkspaceWrite = sandboxEnums.includes("workspace-write");

function spawnAppServer() {
  const child = spawn("codex", ["app-server", "--listen", "ws://127.0.0.1:0"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  const url = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timed out waiting for app-server URL: ${stderr}`)),
      10_000,
    );
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/listening on:\s+(ws:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`app-server exited early with ${code}: ${stderr}`));
    });
  });
  return { child, url };
}

function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const notifications = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject, timeout } = pending.get(msg.id);
      clearTimeout(timeout);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    notifications.push(msg);
  });
  function call(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for ${method}`));
      }, 15_000);
      pending.set(id, { resolve, reject, timeout });
    });
  }
  return {
    ws,
    notifications,
    opened: new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    }),
    call,
  };
}

if (!safeApprovalPolicy || !supportsWorkspaceWrite) {
  console.log(
    JSON.stringify(
      { ok: false, safeModeAvailable: false, safeApprovalPolicy, supportsWorkspaceWrite },
      null,
      2,
    ),
  );
  process.exit(1);
}

const { child, url: urlPromise } = spawnAppServer();
const url = await urlPromise;
const client = connect(url);
let threadId;
try {
  await client.opened;
  const initialize = await client.call("initialize", {
    clientInfo: {
      name: "codex-pet-sidecar-probe",
      title: "Codex Pet Sidecar Probe",
      version: "0.1.0",
    },
    capabilities: { experimentalApi: true },
  });
  const safeThread = await client.call("thread/start", {
    cwd: process.cwd(),
    approvalPolicy: safeApprovalPolicy,
    approvalsReviewer: "user",
    sandbox: "workspace-write",
    baseInstructions: "You are a protocol probe pet.",
    developerInstructions: "Keep this probe short.",
    ephemeral: true,
    experimentalRawEvents: false,
    persistExtendedHistory: false,
  });
  threadId = safeThread.thread?.id;
  const powerThread = await client.call("thread/start", {
    cwd: process.cwd(),
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: "danger-full-access",
    baseInstructions: "You are a protocol probe pet.",
    developerInstructions: "Keep this probe short.",
    ephemeral: true,
    experimentalRawEvents: false,
    persistExtendedHistory: false,
  });
  console.log(
    JSON.stringify(
      { ok: true, safeApprovalPolicy, supportsWorkspaceWrite, initialize, safeThread, powerThread },
      null,
      2,
    ),
  );
} finally {
  if (threadId) {
    try {
      await client.call("thread/archive", { threadId });
    } catch {}
  }
  client.ws.close();
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}
