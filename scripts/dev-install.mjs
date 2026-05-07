#!/usr/bin/env node
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const productName = "Codex Pet Sidecar";
const appName = `${productName}.app`;
const bundleId = "dev.codexpet.sidecar";
const appSource = join(repoRoot, "src-tauri", "target", "release", "bundle", "macos", appName);
const userInstall = join(homedir(), "Applications", appName);
const systemInstall = join("/Applications", appName);
const appSupport = join(homedir(), "Library", "Application Support", productName);
const prefs = join(homedir(), "Library", "Preferences", `${bundleId}.plist`);
const savedState = join(homedir(), "Library", "Saved Application State", `${bundleId}.savedState`);

const args = new Set(process.argv.slice(2));
const installPath = args.has("--system") ? systemInstall : userInstall;
const otherInstallPath = args.has("--system") ? userInstall : systemInstall;
const launch = !args.has("--no-launch");
const resetAppData = args.has("--reset-app-data");
const cleanOtherInstalls = args.has("--clean-other-installs");
const printPlan = args.has("--print-plan");

const plan = {
  buildFirst: true,
  installPath,
  otherInstallPath,
  cleanOtherInstalls,
  resetAppData,
  resetTargets: resetAppData ? [appSupport, prefs, savedState] : [],
  replaceTargetsAfterBuild: cleanOtherInstalls ? [installPath, otherInstallPath] : [installPath],
};

if (printPlan) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} exited ${result.status}`);
  }
}

function read(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(" ")} exited ${result.status}: ${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function remove(path) {
  if (existsSync(path)) {
    console.log(`Removing ${path}`);
    rmSync(path, { recursive: true, force: true });
  }
}

function bundleIdentifier(appPath) {
  return read("plutil", [
    "-extract",
    "CFBundleIdentifier",
    "raw",
    "-o",
    "-",
    join(appPath, "Contents", "Info.plist"),
  ]);
}

function removeInstall(path) {
  if (!existsSync(path)) return;
  const actual = bundleIdentifier(path);
  if (actual !== bundleId) {
    throw new Error(`Refusing to remove ${path}: expected bundle id ${bundleId}, got ${actual}`);
  }
  remove(path);
}

try {
  run("pkill", ["-x", productName], { stdio: "ignore" });
} catch {
  // No running dev install.
}

run("npm", [
  "run",
  "tauri:build",
  "--",
  "--ci",
  "--bundles",
  "app",
  "--config",
  "src-tauri/tauri.dev-install.conf.json",
]);

if (!existsSync(appSource)) {
  throw new Error(`Expected built app at ${appSource}`);
}

for (const path of plan.replaceTargetsAfterBuild) removeInstall(path);

if (resetAppData) {
  for (const path of plan.resetTargets) remove(path);
}

mkdirSync(dirname(installPath), { recursive: true });
run("ditto", [appSource, installPath]);
run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", installPath]);
run("/usr/bin/codesign", ["--verify", "--deep", "--strict", installPath]);

const actualBundleId = bundleIdentifier(installPath);
if (actualBundleId !== bundleId) {
  throw new Error(`Expected bundle id ${bundleId}, got ${actualBundleId}`);
}

const bundledOlive = join(
  installPath,
  "Contents",
  "Resources",
  "_up_",
  "assets",
  "pets",
  "olive",
  "pet.json",
);
if (!existsSync(bundledOlive)) {
  throw new Error(`Bundled Olive manifest missing at ${bundledOlive}`);
}

console.log(`Installed ${installPath}`);
console.log(resetAppData ? "App data was reset." : "App data was preserved.");

if (launch) run("open", [installPath]);
