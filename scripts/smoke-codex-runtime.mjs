import {
  assertWebSocketAvailable,
  archiveThreadIfStarted,
  connectAppServer,
  initializeAppServer,
  spawnAppServer,
  waitForExit,
} from "./lib/codex-app-server.mjs";

assertWebSocketAvailable("smoke");

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
    mcp_servers: Object.fromEntries(
      disabledPetMcpServers.map((server) => [server, { enabled: false }]),
    ),
  };
}

function assertPetThreadDefaults(thread) {
  const failures = [];
  if (thread.thread?.ephemeral !== true)
    failures.push(
      `expected ephemeral public-default thread, got ephemeral=${thread.thread?.ephemeral}`,
    );
  if (thread.thread?.path) failures.push("expected no persistent thread path for public default");
  if (thread.reasoningEffort !== "medium")
    failures.push(`expected medium reasoning, got ${thread.reasoningEffort}`);
  if (thread.approvalPolicy !== "on-request")
    failures.push(`expected safe approval policy on-request, got ${thread.approvalPolicy}`);
  const sandboxType = thread.sandbox?.type ?? thread.sandbox;
  if (!["workspaceWrite", "workspace-write"].includes(sandboxType))
    failures.push(`expected workspace-write sandbox, got ${JSON.stringify(thread.sandbox)}`);
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
const client = connectAppServer(url);
let threadId;
try {
  await client.opened;
  const initialize = await initializeAppServer(client, {
    name: "codex-pet-sidecar-smoke",
    title: "Codex Pet Sidecar Smoke",
    version: "0.1.0",
  });
  const account = await client.call("account/read", { refreshToken: true });
  const authStatus = await client.call("getAuthStatus", {
    includeToken: false,
    refreshToken: true,
  });
  const authSummary = assertCodexOauthSubscription(account, authStatus);
  const thread = await client.call("thread/start", {
    cwd: process.cwd(),
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
    config: petThreadConfigOverrides(),
    baseInstructions: "You are Smoke, a tiny test pet.\n\nCurrent memory.md contents:\n# Memory",
    developerInstructions: `Your memory file is at ${process.cwd()}/.tmp-smoke-memory.md. Keep messages short.`,
    ephemeral: true,
    experimentalRawEvents: false,
    persistExtendedHistory: false,
  });
  assertPetThreadDefaults(thread);
  threadId = thread.thread.id;
  console.log(
    JSON.stringify(
      {
        ok: true,
        badPathResult,
        authSummary,
        url,
        initialize,
        thread,
        notificationMethods: client.notifications.map((item) => item.method),
      },
      null,
      2,
    ),
  );
} finally {
  await archiveThreadIfStarted(client, threadId);
  client.ws.close();
  child.kill();
  await waitForExit(child);
}
