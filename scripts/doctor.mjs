#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error?.message,
  };
}

function commandVersion(name, args) {
  const result = run(name, args);
  return {
    name,
    ok: result.ok,
    detail: result.ok ? result.stdout.split("\n")[0] : result.error || result.stderr,
  };
}

const checks = [];
checks.push(commandVersion("node", ["--version"]));
checks.push(commandVersion("npm", ["--version"]));
checks.push(commandVersion("cargo", ["--version"]));
checks.push(commandVersion("rustc", ["--version"]));
checks.push(commandVersion("codex", ["--version"]));

const codexAuth = run("codex", ["--version"]);
checks.push({
  name: "codex-auth-smoke",
  ok: codexAuth.ok,
  detail: codexAuth.ok
    ? "Codex CLI responds; no model call made."
    : codexAuth.error || codexAuth.stderr,
});

const validateScript = "tools/pet-hatching/scripts/validate_atlas.py";
checks.push({
  name: "pet-hatching-validate-help",
  ok: existsSync(validateScript) && run("python3", [validateScript, "--help"]).ok,
  detail: existsSync(validateScript)
    ? "validate_atlas.py is runnable"
    : "missing validate_atlas.py",
});

const imageGeneration =
  process.env.OPENAI_API_KEY || process.env.IMAGEGEN_API_KEY || process.env.CODEX_IMAGEGEN_ENABLED;
checks.push({
  name: "image-generation-detect",
  ok: Boolean(imageGeneration),
  optional: true,
  detail: imageGeneration
    ? "Possible image-generation configuration detected."
    : "Not detected; hatching can still prepare prompts but image generation may need setup.",
});

const failedRequired = checks.filter((check) => !check.ok && !check.optional);
console.log(JSON.stringify({ ok: failedRequired.length === 0, checks }, null, 2));
if (failedRequired.length) process.exit(1);
