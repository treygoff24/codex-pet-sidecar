#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function findFiles(dir, predicate) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findFiles(path, predicate));
    } else if (entry.isFile() && predicate(path, entry.name)) {
      found.push(path);
    }
  }
  return found;
}

function firstFile(dir, predicate, label) {
  if (!existsSync(dir)) fail(`${label} directory does not exist: ${dir}`);
  const file = readdirSync(dir).find(predicate);
  if (!file) fail(`Missing ${label} in ${dir}`);
  return join(dir, file);
}

const bundleRoot = arg("bundle-root", "src-tauri/target/universal-apple-darwin/release/bundle");
const macosDir = join(bundleRoot, "macos");
const dmgDir = join(bundleRoot, "dmg");
const app = firstFile(macosDir, (file) => file.endsWith(".app"), ".app bundle");
const updateArchive = firstFile(
  macosDir,
  (file) => file.endsWith(".app.tar.gz"),
  "updater archive",
);
const signature = `${updateArchive}.sig`;
if (!existsSync(signature)) fail(`Missing updater signature: ${signature}`);
const dmg = firstFile(dmgDir, (file) => file.endsWith(".dmg"), "DMG");
const sidecars = findFiles(app, (_path, name) => name === "pet-hatching");
if (sidecars.length !== 1) {
  fail(
    "Expected exactly one bundled pet-hatching sidecar in " + app + ", found " + sidecars.length,
  );
}
const sidecar = sidecars[0];
const sidecarHeader = readFileSync(sidecar).subarray(0, 2);
if (sidecarHeader[0] === 0x23 && sidecarHeader[1] === 0x21) {
  fail("Bundled pet-hatching sidecar is a script, not the packaged binary: " + sidecar);
}
if ((statSync(sidecar).mode & 0o111) === 0) {
  fail("Bundled pet-hatching sidecar is not executable: " + sidecar);
}

if (process.platform !== "darwin") {
  console.log("Release artifacts exist; skipping macOS signing checks on non-macOS.");
  process.exit(0);
}

run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
run("xcrun", ["stapler", "validate", app]);
run("xcrun", ["stapler", "validate", dmg]);
run("spctl", [
  "--assess",
  "--type",
  "open",
  "--context",
  "context:primary-signature",
  "--verbose=4",
  dmg,
]);
console.log("Release artifacts passed signing, notarization, and existence checks.");
