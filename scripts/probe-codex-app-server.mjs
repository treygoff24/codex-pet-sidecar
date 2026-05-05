import { spawn } from "node:child_process";

if (typeof WebSocket === "undefined") {
  throw new Error("This probe requires a Node.js version with a global WebSocket implementation.");
}

const child = spawn("codex", ["app-server", "--listen", "ws://127.0.0.1:0"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
const url = await new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error(`timed out waiting for app-server URL: ${stderr}`)),
    10_000,
  );
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    const match = stderr.match(/listening on:\s+(ws:\/\/127\.0\.0\.1:\d+)/);
    if (match) {
      clearTimeout(timeout);
      resolve(match[1]);
    }
  });
  child.on("exit", (code) => reject(new Error(`app-server exited early with ${code}: ${stderr}`)));
});

const ws = new WebSocket(url);
let nextId = 1;
const pending = new Map();
const notifications = [];

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data.toString());
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id).resolve(msg);
    pending.delete(msg.id);
    return;
  }
  notifications.push(msg);
});

ws.addEventListener("error", (event) => {
  for (const { reject, timeout } of pending.values()) {
    clearTimeout(timeout);
    reject(new Error(`websocket error: ${event.message ?? "unknown"}`));
  }
  pending.clear();
});

function call(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timed out waiting for ${method}`));
    }, 10_000);
    pending.set(id, {
      resolve: (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      },
      reject,
      timeout,
    });
  });
}

try {
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  const initialize = await call("initialize", {
    clientInfo: {
      name: "codex-pet-sidecar-probe",
      title: "Codex Pet Sidecar Probe",
      version: "0.1.0",
    },
    capabilities: { experimentalApi: true },
  });
  const models = await call("model/list", {});
  console.log(
    JSON.stringify(
      { url, initialize, models, notificationMethods: notifications.map((n) => n.method) },
      null,
      2,
    ),
  );
} finally {
  ws.close();
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}
