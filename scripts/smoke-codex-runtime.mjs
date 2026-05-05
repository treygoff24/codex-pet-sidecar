import { spawn } from "node:child_process";

if (typeof WebSocket === "undefined") {
  throw new Error("This smoke requires a Node.js version with a global WebSocket implementation.");
}

function waitForExit(child, ms = 2_000) {
  return Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

async function spawnAppServer(command = "codex", args = ["app-server", "--listen", "ws://127.0.0.1:0"]) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timed out waiting for app-server URL: ${stderr}`)), 10_000);
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
      pending.get(msg.id).resolve(msg);
      pending.delete(msg.id);
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
      pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timeout);
          if (msg.error) reject(new Error(`${method}: ${JSON.stringify(msg.error)}`));
          else resolve(msg.result);
        },
      });
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

function assertCodexOauthSubscription(account, authStatus) {
  const actualAccount = account.account;
  if (!actualAccount || actualAccount.type !== "chatgpt") {
    throw new Error(`expected Codex OAuth ChatGPT account, got ${JSON.stringify(actualAccount)}`);
  }

  const paidPlans = new Set([
    "go",
    "plus",
    "pro",
    "prolite",
    "team",
    "self_serve_business_usage_based",
    "business",
    "enterprise_cbp_usage_based",
    "enterprise",
    "edu",
  ]);
  if (!paidPlans.has(actualAccount.planType)) {
    throw new Error(`expected paid Codex OAuth subscription, got plan ${actualAccount.planType}`);
  }

  if (!["chatgpt", "chatgptAuthTokens"].includes(authStatus.authMethod)) {
    throw new Error(`expected ChatGPT OAuth auth method, got ${authStatus.authMethod}`);
  }

  return {
    accountType: actualAccount.type,
    email: actualAccount.email,
    planType: actualAccount.planType,
    authMethod: authStatus.authMethod,
  };
}

const disabledPetMcpServers = ["pencil", "porkbun", "resend", "serena"];

function petThreadConfigOverrides() {
  return {
    model_reasoning_effort: "medium",
    mcp_servers: Object.fromEntries(disabledPetMcpServers.map((server) => [server, { enabled: false }])),
  };
}

function assertPetThreadDefaults(thread) {
  const failures = [];
  if (thread.thread?.ephemeral !== false) failures.push(`expected persistent thread, got ephemeral=${thread.thread?.ephemeral}`);
  if (!thread.thread?.path) failures.push("expected persistent thread path");
  if (thread.reasoningEffort !== "medium") failures.push(`expected medium reasoning, got ${thread.reasoningEffort}`);
  if (thread.approvalPolicy !== "never") failures.push(`expected YOLO approval policy never, got ${thread.approvalPolicy}`);
  if (thread.sandbox?.type !== "dangerFullAccess") failures.push(`expected dangerFullAccess sandbox, got ${thread.sandbox?.type}`);
  if (failures.length > 0) throw new Error(failures.join("; "));
}

async function assertBadPathIsRecoverable() {
  try {
    await spawnAppServer("/definitely/missing/codex-for-pet-sidecar");
    throw new Error("missing codex path unexpectedly launched");
  } catch (error) {
    if (error?.code !== "ENOENT" && !String(error?.message ?? error).includes("ENOENT")) {
      throw error;
    }
    return "bad codex path produced ENOENT setup failure";
  }
}

const badPathResult = await assertBadPathIsRecoverable();
const { child, url } = await spawnAppServer();
const client = connect(url);
let threadId;
try {
  await client.opened;
  const initialize = await client.call("initialize", {
    clientInfo: { name: "codex-pet-sidecar-smoke", title: "Codex Pet Sidecar Smoke", version: "0.1.0" },
    capabilities: { experimentalApi: true },
  });
  const account = await client.call("account/read", { refreshToken: true });
  const authStatus = await client.call("getAuthStatus", { includeToken: false, refreshToken: true });
  const authSummary = assertCodexOauthSubscription(account, authStatus);
  const thread = await client.call("thread/start", {
    cwd: process.cwd(),
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: "danger-full-access",
    config: petThreadConfigOverrides(),
    baseInstructions: "You are Smoke, a tiny test pet.\n\nCurrent memory.md contents:\n# Memory",
    developerInstructions: `Your memory file is at ${process.cwd()}/.tmp-smoke-memory.md. Keep messages short.`,
    ephemeral: false,
    experimentalRawEvents: false,
    persistExtendedHistory: true,
  });
  assertPetThreadDefaults(thread);
  threadId = thread.thread.id;
  console.log(JSON.stringify({ ok: true, badPathResult, authSummary, url, initialize, thread, notificationMethods: client.notifications.map((item) => item.method) }, null, 2));
} finally {
  if (threadId) {
    try {
      await client.call("thread/archive", { threadId });
    } catch {}
  }
  client.ws.close();
  child.kill();
  await waitForExit(child);
}
