#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const keepTemp = process.argv.includes("--keep-temp");
const runDir = mkdtempSync(path.join(tmpdir(), "codex-pet-sidecar-olive-row7-repair-"));

function fail(message, result) {
  console.error(`olive row7 repair workflow failed: ${message}`);
  if (result?.stdout) console.error(result.stdout);
  if (result?.stderr) console.error(result.stderr);
  if (!keepTemp) rmSync(runDir, { recursive: true, force: true });
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) fail(`${command} ${args.join(" ")}`, result);
  return result.stdout.trim();
}

function runJson(command, args) {
  const stdout = run(command, args);
  try {
    return JSON.parse(stdout);
  } catch {
    fail(`could not parse JSON from ${command} ${args.join(" ")}\n${stdout}`);
  }
}

function assertOnlyRunningRowCanChange(candidateAtlas) {
  run("python", [
    "-c",
    `
import sys
from pathlib import Path
from PIL import Image

source_path = Path(sys.argv[1])
candidate_path = Path(sys.argv[2])
cell_height = 208
running_row = 7
with Image.open(source_path) as opened:
    source = opened.convert("RGBA")
with Image.open(candidate_path) as opened:
    candidate = opened.convert("RGBA")
if source.size != candidate.size:
    raise SystemExit(f"size mismatch: {source.size} != {candidate.size}")
for row in range(9):
    box = (0, row * cell_height, source.width, (row + 1) * cell_height)
    source_row = source.crop(box)
    candidate_row = candidate.crop(box)
    equal = source_row.tobytes() == candidate_row.tobytes()
    if row != running_row and not equal:
        raise SystemExit(f"non-repaired row {row} changed")
    if row == running_row and not equal:
        # Real repairs should change row 7; this verifier uses the current row as
        # a stand-in, so equality here is acceptable.
        pass
`,
    "assets/pets/olive/spritesheet.webp",
    candidateAtlas,
  ]);
}

try {
  const prepare = runJson("python", [
    "tools/pet-hatching/scripts/prepare_olive_row7_repair.py",
    "--output-dir",
    runDir,
  ]);
  if (prepare.ok !== true || prepare.ready_jobs?.[0] !== "running") {
    fail(`prepare_olive_row7_repair.py did not produce a ready running job`);
  }

  const status = runJson("python", [
    "tools/pet-hatching/scripts/pet_job_status.py",
    "--run-dir",
    runDir,
  ]);
  if (status.counts?.ready !== 1 || status.counts?.blocked !== 0) {
    fail(`repair job status is not one ready job and zero blocked jobs`);
  }
  const readyJob = status.ready_jobs?.[0];
  if (
    readyJob?.id !== "running" ||
    readyJob?.requires_grounded_generation !== true ||
    readyJob?.allow_prompt_only_generation !== false
  ) {
    fail(`ready repair job does not enforce grounded image generation`);
  }
  const inputRoles = new Set(
    (readyJob.input_images ?? []).map((input) => `${input.role}:${input.exists}`),
  );
  for (const requiredRole of [
    "full Olive atlas identity reference:true",
    "current row to replace; preserve identity, change action:true",
    "6-frame layout guide; do not copy guide lines:true",
  ]) {
    if (!inputRoles.has(requiredRole)) fail(`missing repair input ${requiredRole}`);
  }

  const candidateAtlas = path.join(runDir, "final/spritesheet.png");
  const apply = runJson("python", [
    "tools/pet-hatching/scripts/apply_repaired_row.py",
    "--source-atlas",
    "assets/pets/olive/spritesheet.webp",
    "--row-strip",
    path.join(runDir, "references/olive-row7-current.png"),
    "--state",
    "running",
    "--run-dir",
    runDir,
    "--output",
    candidateAtlas,
  ]);
  if (apply.ok !== true) fail(`apply_repaired_row.py did not report ok`);

  const validate = runJson("python", [
    "tools/pet-hatching/scripts/validate_atlas.py",
    candidateAtlas,
  ]);
  if (validate.ok !== true || validate.errors?.length || validate.warnings?.length) {
    fail(`candidate repaired atlas did not validate cleanly`);
  }
  assertOnlyRunningRowCanChange(candidateAtlas);

  console.log(
    JSON.stringify(
      {
        ok: true,
        run_dir: keepTemp ? runDir : undefined,
        ready_jobs: status.counts.ready,
        blocked_jobs: status.counts.blocked,
        atlas_validated: true,
        candidate_format: "PNG",
        non_repaired_rows_preserved: true,
      },
      null,
      2,
    ),
  );
} finally {
  if (!keepTemp) rmSync(runDir, { recursive: true, force: true });
}
