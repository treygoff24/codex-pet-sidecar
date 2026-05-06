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
const python =
  process.env.PYTHON || (existsSync(".venv/bin/python") ? ".venv/bin/python" : "python3");
const validateCheck = existsSync(validateScript) ? run(python, [validateScript, "--help"]) : null;
checks.push({
  name: "pet-hatching-validate-help",
  ok: Boolean(validateCheck?.ok),
  detail: !existsSync(validateScript)
    ? "missing validate_atlas.py"
    : validateCheck?.ok
      ? "validate_atlas.py is runnable"
      : `validate_atlas.py failed; run npm run setup:python, or set PYTHON to an environment with Pillow. ${validateCheck?.stderr || validateCheck?.error}`,
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
