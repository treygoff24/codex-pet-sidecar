#!/usr/bin/env python3
"""Stage a focused Olive row-7 repair run without generating images."""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw

CELL_WIDTH = 192
CELL_HEIGHT = 208
ATLAS_COLUMNS = 8
ATLAS_ROWS = 9
RUNNING_ROW_INDEX = 7
RUNNING_FRAME_COUNT = 6
DEFAULT_CHROMA_KEY = "#00FF00"


def default_output_dir() -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return Path.cwd() / "output" / "hatch-pet" / f"olive-row7-repair-{timestamp}"


def crop_row(atlas_path: Path, output_path: Path, row_index: int, frame_count: int) -> None:
    with Image.open(atlas_path) as opened:
        atlas = opened.convert("RGBA")
    expected_size = (CELL_WIDTH * ATLAS_COLUMNS, CELL_HEIGHT * ATLAS_ROWS)
    if atlas.size != expected_size:
        raise SystemExit(f"{atlas_path} is {atlas.width}x{atlas.height}; expected {expected_size}")
    row = atlas.crop(
        (
            0,
            row_index * CELL_HEIGHT,
            frame_count * CELL_WIDTH,
            (row_index + 1) * CELL_HEIGHT,
        )
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    row.save(output_path)


def create_running_layout_guide(output_path: Path) -> None:
    width = RUNNING_FRAME_COUNT * CELL_WIDTH
    image = Image.new("RGB", (width, CELL_HEIGHT), "#f7f7f7")
    draw = ImageDraw.Draw(image)
    safe_margin_x = 18
    safe_margin_y = 16
    for index in range(RUNNING_FRAME_COUNT):
        left = index * CELL_WIDTH
        right = left + CELL_WIDTH - 1
        draw.rectangle((left, 0, right, CELL_HEIGHT - 1), outline="#111111", width=2)
        draw.rectangle(
            (
                left + safe_margin_x,
                safe_margin_y,
                right - safe_margin_x,
                CELL_HEIGHT - 1 - safe_margin_y,
            ),
            outline="#2f80ed",
            width=2,
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def repair_prompt(has_codex_reference: bool) -> str:
    codex_reference = (
        "- Use `references/codex-row7-reference.png` only for semantic comparison: it shows that Codex row 7 reads as active work/thinking with a small computer-like prop. Do not copy the Codex mascot design.\n"
        if has_codex_reference
        else ""
    )
    return f"""Create a replacement row 7 `running` strip for Olive, the bundled Codex Pet Sidecar sample pet.

Use the attached Olive atlas and current row-7 strip as identity references. Preserve Olive exactly: golden dog, same face, ears, scarf, body proportions, palette, thick dark pixel-style outline, limited flat cel shading, compact chibi pet sprite readability.
{codex_reference}- Use `references/running-layout-guide.png` only for frame count, slot spacing, centering, and safe padding. Do not copy guide lines into the output.

The row is named `running` because Codex is running, not because Olive should literally sprint. Replace the current dog-locomotion row with an active work/thinking loop like the Codex Mac app row 7.

Output exactly 6 separate animation frames arranged left-to-right in one single horizontal row. Each frame must fit a 192x208 sprite cell and show Olive doing focused work: tiny typing/tapping motion, focused eyes, small head/ear movement, and optionally a tiny laptop, terminal tile, notebook, or tablet physically attached to or overlapping Olive's pose. The prop must be small, inside each frame slot, unreadable, and consistent across all frames.

Use a perfectly flat pure green {DEFAULT_CHROMA_KEY} chroma-key background. Do not add readable code, text, UI panels, floating icons, speech bubbles, thought bubbles, speed lines, dust, shadows, detached effects, scenery, visible frame boxes, labels, or background. Do not redesign Olive. Do not crop any part of Olive or the prop.

The final animation should read at pet size as "Olive is actively working while Codex is running" and should settle cleanly into idle when the state finishes."""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--olive-atlas", default="assets/pets/olive/spritesheet.webp")
    parser.add_argument("--codex-atlas", default="/tmp/codex-asar-pet/codex-spritesheet-v4-Bl6P89d_.webp")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    repo_root = Path.cwd()
    olive_atlas = Path(args.olive_atlas).expanduser()
    if not olive_atlas.is_absolute():
        olive_atlas = repo_root / olive_atlas
    olive_atlas = olive_atlas.resolve()
    if not olive_atlas.is_file():
        raise SystemExit(f"Olive atlas not found: {olive_atlas}")

    run_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else default_output_dir().resolve()
    if run_dir.exists() and any(run_dir.iterdir()) and not args.force:
        raise SystemExit(f"{run_dir} already exists and is not empty; pass --force")
    run_dir.mkdir(parents=True, exist_ok=True)

    references_dir = run_dir / "references"
    prompt_dir = run_dir / "prompts" / "rows"
    decoded_dir = run_dir / "decoded"
    for directory in [references_dir, prompt_dir, decoded_dir, run_dir / "qa", run_dir / "final"]:
        directory.mkdir(parents=True, exist_ok=True)

    copied_olive_atlas = references_dir / "olive-atlas.webp"
    shutil.copy2(olive_atlas, copied_olive_atlas)
    crop_row(olive_atlas, references_dir / "olive-row7-current.png", RUNNING_ROW_INDEX, RUNNING_FRAME_COUNT)
    create_running_layout_guide(references_dir / "running-layout-guide.png")

    codex_atlas = Path(args.codex_atlas).expanduser().resolve()
    has_codex_reference = codex_atlas.is_file()
    if has_codex_reference:
        crop_row(codex_atlas, references_dir / "codex-row7-reference.png", RUNNING_ROW_INDEX, RUNNING_FRAME_COUNT)

    write_text(prompt_dir / "running.md", repair_prompt(has_codex_reference))

    created_at = datetime.now(timezone.utc).isoformat()
    request = {
        "pet_id": "olive",
        "display_name": "Olive",
        "description": "Focused row-7 repair for the bundled Olive sample pet.",
        "created_at": created_at,
        "atlas": {
            "columns": ATLAS_COLUMNS,
            "rows": ATLAS_ROWS,
            "cell_width": CELL_WIDTH,
            "cell_height": CELL_HEIGHT,
        },
        "repair": {
            "state": "running",
            "row": RUNNING_ROW_INDEX,
            "frames": RUNNING_FRAME_COUNT,
            "reason": "Current bundled Olive row 7 reads as literal locomotion; Codex row 7 reads as active work/thinking.",
        },
        "chroma_key": {"hex": DEFAULT_CHROMA_KEY, "rgb": [0, 255, 0], "name": "green"},
        "primary_generation_skill": "$imagegen",
    }
    (run_dir / "pet_request.json").write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")

    input_images = [
        {"path": "references/olive-atlas.webp", "role": "full Olive atlas identity reference"},
        {"path": "references/olive-row7-current.png", "role": "current row to replace; preserve identity, change action"},
        {"path": "references/running-layout-guide.png", "role": "6-frame layout guide; do not copy guide lines"},
    ]
    if has_codex_reference:
        input_images.append(
            {
                "path": "references/codex-row7-reference.png",
                "role": "Codex semantic reference for active work/thinking only; do not copy mascot",
            }
        )

    jobs = {
        "schema_version": 1,
        "created_at": created_at,
        "run_dir": str(run_dir),
        "primary_generation_skill": "$imagegen",
        "jobs": [
            {
                "id": "running",
                "kind": "row-strip-repair",
                "status": "pending",
                "prompt_file": "prompts/rows/running.md",
                "input_images": input_images,
                "output_path": "decoded/running.png",
                "depends_on": [],
                "generation_skill": "$imagegen",
                "requires_grounded_generation": True,
                "allow_prompt_only_generation": False,
                "recording_owner": "parent",
            }
        ],
    }
    (run_dir / "imagegen-jobs.json").write_text(json.dumps(jobs, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "ok": True,
                "run_dir": str(run_dir),
                "prompt": str(prompt_dir / "running.md"),
                "jobs": str(run_dir / "imagegen-jobs.json"),
                "ready_jobs": ["running"],
                "codex_reference_included": has_codex_reference,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
