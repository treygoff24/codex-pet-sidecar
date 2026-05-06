#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const python =
  process.env.PYTHON || (existsSync(".venv/bin/python") ? ".venv/bin/python" : "python3");

const required = [
  ".codex/skills/pet-hatching/SKILL.md",
  ".codex/skills/pet-personality/SKILL.md",
  "tools/pet-hatching/scripts/validate_atlas.py",
  "tools/pet-hatching/scripts/prepare_pet_run.py",
  "tools/pet-hatching/LICENSE.txt",
  "docs/skills/pet-hatching.md",
  "docs/skills/pet-personality.md",
];
const missing = required.filter((file) => !existsSync(file));
if (missing.length) {
  console.error(`Missing skill workflow files:\n${missing.join("\n")}`);
  process.exit(1);
}
const validate = spawnSync(python, ["tools/pet-hatching/scripts/validate_atlas.py", "--help"], {
  encoding: "utf8",
});
const prepare = spawnSync(python, ["tools/pet-hatching/scripts/prepare_pet_run.py", "--help"], {
  encoding: "utf8",
});
if (validate.status !== 0 || prepare.status !== 0) {
  console.error(JSON.stringify({ validate: validate.stderr, prepare: prepare.stderr }, null, 2));
  process.exit(1);
}
const hatchPrompt =
  "Use the repo-local pet-hatching skill to create a new pet, stage output under hatch-runs/<slug>, then import after validation.";
const personalityPrompt =
  "Use the repo-local pet-personality skill to draft or revise the selected pet personality.md.";
console.log(JSON.stringify({ ok: true, hatchPrompt, personalityPrompt }, null, 2));
