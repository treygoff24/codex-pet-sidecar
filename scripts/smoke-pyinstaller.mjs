#!/usr/bin/env node
/**
 * Smoke test for PyInstaller bundling.
 * Builds the pet-hatching binary and validates it can execute.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const filename = fileURLToPath(import.meta.url);
const dirName = dirname(filename);
const repoRoot = join(dirName, "..");

function run(cmd, options = {}) {
  console.log(`Running: ${cmd}`);
  return execSync(cmd, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
}

function assertFileExists(path) {
  if (!existsSync(path)) {
    throw new Error(`File does not exist: ${path}`);
  }
}

try {
  console.log("=== PyInstaller Smoke Test ===\n");

  // Step 1: Check if pyinstaller is available
  console.log("Step 1: Checking pyinstaller availability...");
  try {
    run("./.venv/bin/python -m PyInstaller --version");
  } catch {
    console.error("pyinstaller not found. Run: npm run setup:python");
    process.exit(1);
  }

  // Step 2: Build the binary
  console.log("\nStep 2: Building PyInstaller bundle...");
  const buildDir = join(repoRoot, "tools/pet-hatching/build");
  run(`${join(buildDir, "build-bundle.sh")}`, { cwd: repoRoot });

  // Step 3: Verify binary exists
  console.log("\nStep 3: Verifying binary exists...");
  const binaryPath = join(repoRoot, "dist", "pet-hatching");
  assertFileExists(binaryPath);

  // Step 4: Test --help command
  console.log("\nStep 4: Testing --help command...");
  run(`${binaryPath} --help`, { stdio: "pipe" });

  // Step 5: Record bundle size
  console.log("\nStep 5: Recording bundle size...");
  const stats = readFileSync(binaryPath);
  const sizeBytes = stats.length;
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
  const sizePath = join(buildDir, "last-bundle-size.txt");
  writeFileSync(sizePath, `${sizeBytes}`);
  console.log(`Bundle size: ${sizeBytes} bytes (${sizeMB} MB)`);
  console.log(`Size recorded to: ${sizePath}`);

  console.log("\n=== PyInstaller Smoke Test PASSED ===");
} catch (e) {
  console.error("\n=== PyInstaller Smoke Test FAILED ===");
  console.error(e);
  process.exit(1);
}
