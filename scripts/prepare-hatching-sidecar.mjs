#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2] ?? "dev";

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf("--" + name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes("--" + name);
}

function run(command, args, options = {}) {
  console.log("Running: " + command + " " + args.join(" "));
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
}

function hostTargetTriple() {
  const output = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const hostLine = output.split("\n").find((line) => line.startsWith("host: "));
  if (!hostLine) throw new Error("could not determine rustc host target triple");
  return hostLine.slice("host: ".length).trim();
}

function targetTriples() {
  const explicit =
    arg("target-triples") ?? process.env.CODEX_PET_SIDECAR_TARGET_TRIPLES ?? hostTargetTriple();
  return explicit
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);
}

function pyinstallerArchFor(triples) {
  if (process.env.PYINSTALLER_TARGET_ARCH) return process.env.PYINSTALLER_TARGET_ARCH;
  if (triples.includes("aarch64-apple-darwin") && triples.includes("x86_64-apple-darwin")) {
    return "universal2";
  }
  if (triples.length === 1 && triples[0] === "aarch64-apple-darwin") return "arm64";
  if (triples.length === 1 && triples[0] === "x86_64-apple-darwin") return "x86_64";
  return "";
}

function assertPackagedBinary(path) {
  if (!existsSync(path)) {
    throw new Error("pet-hatching binary does not exist: " + path);
  }
  const header = readFileSync(path).subarray(0, 2);
  if (header[0] === 0x23 && header[1] === 0x21) {
    throw new Error("pet-hatching sidecar is a script, not a packaged binary: " + path);
  }
}

function sidecarPathFor(targetTriple) {
  return join(repoRoot, "src-tauri", "binaries", "pet-hatching-" + targetTriple);
}

function prepareRelease() {
  const triples = targetTriples();
  const skipBuild = hasFlag("skip-build") || process.env.CODEX_PET_SIDECAR_SKIP_BUILD === "1";
  if (!skipBuild) {
    const pyinstallerTargetArch = pyinstallerArchFor(triples);
    const env = { ...process.env };
    if (pyinstallerTargetArch) env.PYINSTALLER_TARGET_ARCH = pyinstallerTargetArch;
    run(join("tools", "pet-hatching", "build", "build-bundle.sh"), [], { env });
  }

  const binary = join(repoRoot, "dist", "pet-hatching");
  assertPackagedBinary(binary);
  const binariesDir = join(repoRoot, "src-tauri", "binaries");
  mkdirSync(binariesDir, { recursive: true });
  for (const triple of triples) {
    const target = sidecarPathFor(triple);
    copyFileSync(binary, target);
    chmodSync(target, 0o755);
    console.log("Installed packaged hatching sidecar: " + target);
  }
}

function prepareDev() {
  const dispatchPath = join(repoRoot, "tools", "pet-hatching", "build", "dispatch.py");
  const binariesDir = join(repoRoot, "src-tauri", "binaries");
  mkdirSync(binariesDir, { recursive: true });
  for (const triple of targetTriples()) {
    const target = sidecarPathFor(triple);
    writeFileSync(
      target,
      "#!/usr/bin/env sh\nset -eu\nexec python3 " + JSON.stringify(dispatchPath) + ' "$@"\n',
    );
    chmodSync(target, 0o755);
    console.log("Installed development hatching sidecar: " + target);
  }
}

if (mode === "release") {
  prepareRelease();
} else if (mode === "dev") {
  prepareDev();
} else {
  throw new Error("unknown hatching sidecar mode: " + mode);
}
