#!/usr/bin/env node
/**
 * Empirically pins Codex app-server image_generation_call semantics for hatching.
 *
 * The script starts an isolated Codex runtime home, launches app-server with the
 * user's auth linked in, asks for one tiny throwaway sprite via $imagegen, then
 * writes redacted fixtures under src-tauri/fixtures/hatching-imagegen/.
 */

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveThreadIfStarted,
  connectAppServer,
  initializeAppServer,
  spawnAppServer,
  waitForExit,
} from "../../../scripts/lib/codex-app-server.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixturesDir = join(repoRoot, "src-tauri/fixtures/hatching-imagegen");
const timeoutMs = Number.parseInt(process.env.HATCHING_IMAGEGEN_SPIKE_TIMEOUT_MS ?? "300000", 10);

function assertAuthExists() {
  const authPath = join(process.env.HOME ?? "", ".codex/auth.json");
  try {
    readFileSync(authPath);
  } catch {
    throw new Error(`Codex auth not found at ${authPath}`);
  }
  return authPath;
}

function prepareRuntimeHome() {
  const runtimeHome = mkdtempSync(join(tmpdir(), "codex-pet-hatching-imagegen-"));
  writeFileSync(join(runtimeHome, "config.toml"), "[analytics]\nenabled = false\n");
  symlinkSync(assertAuthExists(), join(runtimeHome, "auth.json"));
  mkdirSync(join(runtimeHome, "generated_images"), { recursive: true });
  return runtimeHome;
}

function isolatedEnv(runtimeHome) {
  return {
    CODEX_HOME: runtimeHome,
    HOME: process.env.HOME,
    USER: process.env.USER,
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    TERM: "xterm-256color",
    SHELL: "/bin/zsh",
  };
}

function walkGeneratedImages(root) {
  const generatedRoot = join(root, "generated_images");
  const found = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.startsWith("ig_") && entry.name.endsWith(".png")) {
        found.push(path);
      }
    }
  }
  walk(generatedRoot);
  return found.toSorted();
}

function waitFor(predicate, label) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      try {
        const result = predicate();
        if (result) {
          clearInterval(interval);
          resolve(result);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`timed out waiting for ${label}`));
        }
      } catch (error) {
        clearInterval(interval);
        reject(error);
      }
    }, 500);
  });
}

function redactNotification(notification, runtimeHome) {
  const cloned = JSON.parse(JSON.stringify(notification.params));
  cloned.threadId = "fixture-thread";
  cloned.turnId = "fixture-turn";
  if (cloned.item && typeof cloned.item === "object") {
    cloned.item.id = "fixture-image-generation-call";
    const result = cloned.item.result;
    if (typeof result === "string" && result.includes(runtimeHome)) {
      cloned.item.result = result.replace(runtimeHome, "$RUNTIME_HOME");
    }
  }
  return cloned;
}

function writeFixtures({ notification, runtimeHome, imagePath }) {
  mkdirSync(fixturesDir, { recursive: true });
  const redacted = redactNotification(notification, runtimeHome);
  const observedPath = relative(runtimeHome, imagePath);
  writeFileSync(
    join(fixturesDir, "raw-notification.json"),
    `${JSON.stringify(redacted, null, 2)}\n`,
  );
  writeFileSync(join(fixturesDir, "observed-path.txt"), `${observedPath}\n`);
  writeFileSync(
    join(fixturesDir, "README.md"),
    "Redacted empirical fixtures from a real Codex app-server `$imagegen` spike for hatching image ingestion.\n",
  );
}

async function main() {
  const runtimeHome = prepareRuntimeHome();
  const { child, url } = await spawnAppServer(undefined, undefined, {
    env: isolatedEnv(runtimeHome),
  });
  const client = connectAppServer(url, {
    formatRpcError: (method, error) => `${method}: ${JSON.stringify(error)}`,
  });
  let threadId;

  try {
    await client.opened;
    await initializeAppServer(client, {
      name: "codex-pet-sidecar-imagegen-pin",
      title: "Codex Pet Sidecar Imagegen Pin",
      version: "0.1.0",
    });

    const thread = await client.call("thread/start", {
      cwd: repoRoot,
      approvalPolicy: "never",
      approvalsReviewer: "auto_review",
      sandbox: "read-only",
      config: {},
      baseInstructions:
        "You are running an empirical hatching image-generation spike. Keep output minimal.",
      developerInstructions:
        "Invoke $imagegen exactly once for the user's sprite prompt. Do not browse, do not edit files.",
      ephemeral: true,
      experimentalRawEvents: true,
      persistExtendedHistory: false,
    });
    threadId = thread.thread.id;

    await client.call("turn/start", {
      threadId,
      input: [
        {
          type: "text",
          text: "$imagegen: a single tiny transparent-background 192x208 pixel-art sprite of a blue test blob, centered, clean silhouette. This is an empirical fixture spike.",
          text_elements: [],
        },
      ],
      cwd: repoRoot,
      approvalPolicy: "never",
      approvalsReviewer: "auto_review",
      sandboxPolicy: { type: "readOnly", networkAccess: true },
    });

    const rawNotification = await waitFor(
      () =>
        client.notifications.find(
          (msg) =>
            msg.method === "rawResponseItem/completed" &&
            msg.params?.item?.type === "image_generation_call",
        ),
      "rawResponseItem/completed image_generation_call notification",
    );

    const generatedImage = await waitFor(
      () => walkGeneratedImages(runtimeHome)[0],
      "generated ig_*.png",
    );
    writeFixtures({ notification: rawNotification, runtimeHome, imagePath: generatedImage });

    const result = rawNotification.params.item.result;
    const branch =
      typeof result === "string" && result.trim() !== "" && result.includes("generated_images")
        ? "A"
        : "B";
    console.log(
      JSON.stringify(
        {
          ok: true,
          branch,
          rawResultType: typeof result,
          rawResultLength: typeof result === "string" ? result.length : null,
          observedPath: relative(runtimeHome, generatedImage),
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
    if (process.env.HATCHING_KEEP_SPIKE_HOME !== "1") {
      rmSync(runtimeHome, { recursive: true, force: true });
    } else {
      console.error(`Kept runtime home: ${runtimeHome}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
