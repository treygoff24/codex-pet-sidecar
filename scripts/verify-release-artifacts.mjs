#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
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
