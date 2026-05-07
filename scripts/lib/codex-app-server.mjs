import { spawn } from "node:child_process";

export function assertWebSocketAvailable(label) {
  if (typeof WebSocket === "undefined") {
    throw new Error(
      `This ${label} requires a Node.js version with a global WebSocket implementation.`,
    );
  }
}

export function waitForExit(child, ms = 2_000) {
  return Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

export async function spawnAppServer(
  command = "codex",
  args = ["app-server", "--listen", "ws://127.0.0.1:0"],
  options = {},
) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
  let stderr = "";
  const url = await new Promise((resolve, reject) => {
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

export function connectAppServer(url, options = {}) {
  const formatRpcError =
    options.formatRpcError ?? ((method, error) => `${method}: ${JSON.stringify(error)}`);
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const notifications = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { method, resolve, reject, timeout } = pending.get(msg.id);
      clearTimeout(timeout);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(formatRpcError(method, msg.error)));
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
      pending.set(id, { method, resolve, reject, timeout });
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

export function initializeAppServer(client, clientInfo) {
  return client.call("initialize", {
    clientInfo,
    capabilities: { experimentalApi: true },
  });
}

export async function archiveThreadIfStarted(client, threadId) {
  if (!threadId) return;
  try {
    await client.call("thread/archive", { threadId });
  } catch {}
}
