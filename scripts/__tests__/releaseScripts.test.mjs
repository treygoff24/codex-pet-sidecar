import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), `codex-pet-sidecar-${prefix}-`));
}

function runScript(script, args, options = {}) {
  return execFileSync(node, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function expectScriptFailure(script, args) {
  try {
    runScript(script, args);
    throw new Error(`${script} unexpectedly passed`);
  } catch (error) {
    if (!error.status) throw error;
    return String(error.stderr ?? error.stdout ?? error.message);
  }
}

function prepareReleaseBundle(root) {
  const macosDir = join(root, "macos");
  const dmgDir = join(root, "dmg");
  const appDir = join(macosDir, "Codex Pet Sidecar.app");
  const appMacosDir = join(appDir, "Contents", "MacOS");
  mkdirSync(appMacosDir, { recursive: true });
  writeFileSync(join(appMacosDir, "pet-hatching"), "packaged-sidecar", { mode: 0o755 });
  mkdirSync(dmgDir, { recursive: true });
  const archive = "Codex Pet Sidecar.app.tar.gz";
  writeFileSync(join(macosDir, archive), "archive");
  writeFileSync(join(macosDir, `${archive}.sig`), "signature-abc\n");
  writeFileSync(join(dmgDir, "Codex Pet Sidecar_0.1.0_aarch64.dmg"), "dmg");
  return { archive, dmgDir, macosDir };
}

describe("release scripts", () => {
  it("creates a Tauri updater manifest from the real archive/signature layout", () => {
    const root = tempDir("manifest");
    const { archive, macosDir } = prepareReleaseBundle(root);
    const notesFile = join(root, "notes.md");
    const output = join(root, "latest.json");
    writeFileSync(notesFile, "Release notes\n");

    const stdout = runScript("scripts/create-update-manifest.mjs", [
      "--tag",
      "v1.2.3",
      "--repository",
      "open-source-pets/codex-pet-sidecar",
      "--bundle-dir",
      macosDir,
      "--notes-file",
      notesFile,
      "--output",
      output,
    ]);

    expect(stdout).toContain(`Wrote ${output} for ${archive}.`);
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    expect(manifest.version).toBe("1.2.3");
    expect(manifest.notes).toBe("Release notes");
    expect(Date.parse(manifest.pub_date)).not.toBeNaN();
    expect(manifest.platforms["darwin-aarch64"]).toEqual({
      signature: "signature-abc",
      url: "https://github.com/open-source-pets/codex-pet-sidecar/releases/download/v1.2.3/Codex%20Pet%20Sidecar.app.tar.gz",
    });
    expect(manifest.platforms["darwin-x86_64"]).toEqual(manifest.platforms["darwin-aarch64"]);
  });

  it("refuses invalid release tags before writing an updater manifest", () => {
    const root = tempDir("bad-manifest");
    const { macosDir } = prepareReleaseBundle(root);
    const output = join(root, "latest.json");

    const stderr = expectScriptFailure("scripts/create-update-manifest.mjs", [
      "--tag",
      "1.2.3",
      "--repository",
      "open-source-pets/codex-pet-sidecar",
      "--bundle-dir",
      macosDir,
      "--output",
      output,
    ]);

    expect(stderr).toContain("Invalid release tag 1.2.3");
  });

  it("asserts release tag version sync across package, Tauri, and Cargo files", () => {
    const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;

    expect(runScript("scripts/assert-release-version.mjs", [`v${version}`])).toContain(
      `Release version ${version} is synchronized`,
    );
    expect(expectScriptFailure("scripts/assert-release-version.mjs", ["v999.0.0"])).toContain(
      "does not match",
    );
  });

  it("verifies release artifact layout and invokes signing checks through the platform tools", () => {
    const root = tempDir("verify-release");
    prepareReleaseBundle(root);
    const fakeBin = join(root, "bin");
    mkdirSync(fakeBin, { recursive: true });
    const logPath = join(root, "tool-calls.log");
    for (const command of ["codesign", "xcrun", "spctl"]) {
      writeFileSync(
        join(fakeBin, command),
        `#!/bin/sh\nprintf '%s %s\\n' ${command} "$*" >> ${JSON.stringify(logPath)}\nexit 0\n`,
        { mode: 0o755 },
      );
    }

    const stdout = runScript("scripts/verify-release-artifacts.mjs", ["--bundle-root", root], {
      env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
    });

    if (process.platform === "darwin") {
      expect(stdout).toContain("Release artifacts passed signing");
      const log = readFileSync(logPath, "utf8");
      expect(log).toContain("codesign --verify --deep --strict --verbose=2");
      expect(log).toContain("xcrun stapler validate");
      expect(log).toContain("spctl --assess --type open");
    } else {
      expect(stdout).toContain("skipping macOS signing checks");
    }
  });

  it("fails release artifact verification when the updater signature is missing", () => {
    const root = tempDir("missing-sig");
    const macosDir = join(root, "macos");
    mkdirSync(join(macosDir, "Codex Pet Sidecar.app"), { recursive: true });
    writeFileSync(join(macosDir, "Codex Pet Sidecar.app.tar.gz"), "archive");

    const stderr = expectScriptFailure("scripts/verify-release-artifacts.mjs", [
      "--bundle-root",
      root,
    ]);

    expect(stderr).toContain("Missing updater signature");
  });
});
