import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function devInstallPlan(args: string[] = []) {
  return JSON.parse(
    execFileSync("node", ["scripts/dev-install.mjs", "--print-plan", ...args], {
      encoding: "utf8",
    }),
  ) as {
    buildFirst: boolean;
    installPath: string;
    otherInstallPath: string;
    cleanOtherInstalls: boolean;
    resetAppData: boolean;
    resetTargets: string[];
    replaceTargetsAfterBuild: string[];
  };
}

describe("dev install packaging", () => {
  it("keeps dev install on app-only packaging", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const devInstallConfig = JSON.parse(
      readFileSync("src-tauri/tauri.dev-install.conf.json", "utf8"),
    ) as {
      bundle: { targets: string[]; createUpdaterArtifacts: boolean };
    };

    expect(packageJson.scripts["install:dev"]).toBe("node scripts/dev-install.mjs");
    expect(devInstallConfig.bundle.targets).toEqual(["app"]);
    expect(devInstallConfig.bundle.createUpdaterArtifacts).toBe(false);

    const installer = readFileSync("scripts/dev-install.mjs", "utf8");
    expect(installer).toContain("--bundles");
    expect(installer).toContain("app");
    expect(installer).not.toMatch(/\bdmg\b/);
    expect(installer).not.toContain("release:create-manifest");
    expect(installer).not.toContain("release:verify-artifacts");
  });

  it("replaces only the selected install after a successful build by default", () => {
    const plan = devInstallPlan(["--no-launch"]);

    expect(plan.buildFirst).toBe(true);
    expect(plan.installPath).toContain("/Applications/Codex Pet Sidecar.app");
    expect(plan.installPath).not.toBe(plan.otherInstallPath);
    expect(plan.cleanOtherInstalls).toBe(false);
    expect(plan.replaceTargetsAfterBuild).toEqual([plan.installPath]);
    expect(plan.resetTargets).toEqual([]);
  });

  it("keeps system install cleanup and app-data reset explicit", () => {
    const systemPlan = devInstallPlan(["--system", "--clean-other-installs", "--reset-app-data"]);

    expect(systemPlan.buildFirst).toBe(true);
    expect(systemPlan.installPath).toBe("/Applications/Codex Pet Sidecar.app");
    expect(systemPlan.cleanOtherInstalls).toBe(true);
    expect(systemPlan.replaceTargetsAfterBuild).toEqual([
      systemPlan.installPath,
      systemPlan.otherInstallPath,
    ]);
    expect(systemPlan.resetAppData).toBe(true);
    expect(systemPlan.resetTargets).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Library/Application Support/Codex Pet Sidecar"),
        expect.stringContaining("Library/Preferences/dev.codexpet.sidecar.plist"),
        expect.stringContaining("Library/Saved Application State/dev.codexpet.sidecar.savedState"),
      ]),
    );
  });

  it("keeps release workflow responsible for dmg and updater artifacts", () => {
    const release = readFileSync(".github/workflows/release.yml", "utf8");

    expect(release).toContain("--bundles app,dmg");
    expect(release).toContain("release:create-manifest");
    expect(release).toContain("release:verify-artifacts");
    expect(release).toContain("*.dmg");
    expect(release).toContain("*.app.tar.gz");
    expect(release).toContain("*.app.tar.gz.sig");
    expect(release).toContain("latest.json");
  });
});
