# Pet Hatching Skill

Repo-local skill: `.codex/skills/pet-hatching`.

It stages pet generation runs, delegates visual generation to `$imagegen`, validates the Codex Pet Sidecar atlas contract, and packages `pet.json` plus `spritesheet.webp` for import.

The deterministic scripts are vendored under `tools/pet-hatching/scripts` with provenance in `NOTICE` and `tools/pet-hatching/LICENSE.txt`.
