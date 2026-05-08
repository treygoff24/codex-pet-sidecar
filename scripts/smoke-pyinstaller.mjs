#!/usr/bin/env node
/**
 * Smoke test for PyInstaller bundling.
 * Builds the pet-hatching binary and validates it can execute.
 */

import { execFileSync, execSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
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

function runFile(cmd, args, options = {}) {
  console.log(`Running: ${cmd} ${args.join(" ")}`);
  return execFileSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
}

function assertSameBytes(left, right, label) {
  const leftBytes = readFileSync(left);
  const rightBytes = readFileSync(right);
  if (!leftBytes.equals(rightBytes)) {
    throw new Error(`${label} differs: ${left} vs ${right}`);
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

  // Step 5: Run the binary against a real fixture and compare to the unbundled script.
  console.log("\nStep 5: Testing bundled compose/validate/package against fixture...");
  const tmp = mkdtempSync(join(tmpdir(), "pet-hatching-pyinstaller-"));
  try {
    const sourceAtlas = join(repoRoot, "assets/pets/olive/spritesheet.webp");
    const pythonAtlas = join(tmp, "python-atlas.png");
    const bundledAtlas = join(tmp, "bundled-atlas.png");
    const pythonPackage = join(tmp, "python-package");
    const bundledPackage = join(tmp, "bundled-package");

    runFile("python3", [
      "tools/pet-hatching/scripts/compose_atlas.py",
      "--source-atlas",
      sourceAtlas,
      "--output",
      pythonAtlas,
    ]);
    runFile(binaryPath, [
      "--cmd",
      "compose",
      "--source-atlas",
      sourceAtlas,
      "--output",
      bundledAtlas,
    ]);
    assertSameBytes(pythonAtlas, bundledAtlas, "bundled compose output");

    runFile(binaryPath, ["--cmd", "validate", bundledAtlas]);

    runFile("python3", [
      "tools/pet-hatching/scripts/package_custom_pet.py",
      "--pet-name",
      "pyinstaller-smoke",
      "--display-name",
      "PyInstaller Smoke",
      "--description",
      "Smoke fixture",
      "--spritesheet",
      pythonAtlas,
      "--output-dir",
      pythonPackage,
      "--force",
    ]);
    runFile(binaryPath, [
      "--cmd",
      "package",
      "--pet-name",
      "pyinstaller-smoke",
      "--display-name",
      "PyInstaller Smoke",
      "--description",
      "Smoke fixture",
      "--spritesheet",
      bundledAtlas,
      "--output-dir",
      bundledPackage,
      "--force",
    ]);
    assertSameBytes(
      join(pythonPackage, "pet.json"),
      join(bundledPackage, "pet.json"),
      "bundled package manifest",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // Step 6: Record bundle size
  console.log("\nStep 6: Recording bundle size...");
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
