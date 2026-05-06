# Pet hatching

Tools for turning a generated set of pet images into an installable pet package. This is the cold path; if you're working through Codex, the assistant-driven flow at `.codex/skills/pet-hatching/SKILL.md` is friendlier.

## What hatching actually is

A pet for this app is a directory containing four things: a `pet.json` manifest, a `spritesheet.webp` atlas at exactly 1536x1872 with 192x208 cells in an 8x9 grid, an optional `personality.md`, and some QA artifacts the validator inspects. Hatching is the process of going from "I have a pet idea" to a directory shaped like that, ready to import.

The atlas geometry is non-negotiable. The runtime expects a specific frame layout for idle, talk, walk, sleep, and a few other states; `tools/pet-hatching/references/animation-rows.md` documents the row contract. If your atlas doesn't match, the validator rejects it before the app ever sees it.

## Prerequisites

Image generation. The scripts here do all the deterministic stitching, frame extraction, atlas composition, and validation, but they don't create the source images. You need either Codex with image-generation access (the path the SKILL.md walks you through) or your own pre-generated frames laid out in the directory the scripts expect. Without one of those, you can't get past step 3 below.

Python with Pillow. The scripts run on system Python and require Pillow for image manipulation. `pip install pillow` if you don't have it.

## The flow

The scripts run in roughly this order. Each writes to the run directory you pass via `--run-dir`, so you can pause between any two steps and resume later.

1. `prepare_pet_run.py` builds a fresh run directory, writes the imagegen job manifests for each required animation row, and seeds the QA scaffolding. This is where you give the pet its name, description, and personality seed.

2. `pet_job_status.py` lists the jobs in a run, with their state (pending, ready-for-imagegen, satisfied, failed). Use this whenever you've lost track of what's left.

3. Generate the images. With Codex, this is the `$imagegen` flow described in the SKILL. Without Codex, generate the frames yourself and drop them at the paths the run manifest expects.

4. `record_imagegen_result.py` registers a generated image against a job. Pass the job ID from step 2 and the absolute path to the image you want to use; the script copies it into the run, marks the job satisfied, and updates the manifest. Repeat for every required job.

5. `finalize_pet_run.py` composes the per-row images into the 1536x1872 atlas, writes `spritesheet.webp`, and assembles the final pet package directory with `pet.json` and the optional `personality.md`.

6. `validate_atlas.py` runs the geometry, transparency, and frame-completeness checks. The runtime won't import a package that fails this; better to know now.

7. Import. Either through the app's "Import pet" button or via the `import_pet` Tauri command directly. The importer revalidates package paths and rejects anything with absolute paths, traversal, or symlink escapes.

## When something goes wrong

`queue_pet_repairs.py` looks at the validator output and queues regeneration jobs for the broken rows. Useful when one or two animations came out wrong; you don't need to redo the whole pet.

`inspect_frames.py` and `make_contact_sheet.py` are diagnostic. The first dumps individual frame stats; the second composes a contact sheet you can eyeball. Read them when the validator complains and you don't yet know which row is bad.

`derive_running_left_from_running_right.py` is a niche helper for pets where left and right running animations should mirror each other; saves a generation pass.

## Reference material

- `references/codex-pet-contract.md`: the runtime's expectations for `pet.json`.
- `references/animation-rows.md`: the row layout in the atlas.
- `references/qa-rubric.md`: what the validator actually checks and the bar for "good enough".

If you're going through this for the first time, read all three before you start a real run. They're short, and they're the only documents that say authoritatively what a valid pet looks like.

## License

The scripts in this directory carry their own LICENSE.txt (Apache 2.0). They were adapted from the local `hatch-pet` Codex skill and kept here as a self-contained tool tree.
