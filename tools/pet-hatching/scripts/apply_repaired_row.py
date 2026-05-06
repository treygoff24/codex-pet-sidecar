#!/usr/bin/env python3
"""Apply one repaired horizontal row strip to a Codex pet spritesheet atlas."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

from PIL import Image

COLUMNS = 8
ROWS = 9
CELL_WIDTH = 192
CELL_HEIGHT = 208
ATLAS_WIDTH = COLUMNS * CELL_WIDTH
ATLAS_HEIGHT = ROWS * CELL_HEIGHT
ROW_SPECS = {
    "idle": (0, 6),
    "running-right": (1, 8),
    "running-left": (2, 8),
    "waving": (3, 4),
    "jumping": (4, 5),
    "failed": (5, 8),
    "waiting": (6, 6),
    "running": (7, 6),
    "review": (8, 6),
}


def parse_hex_color(value: str) -> tuple[int, int, int]:
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise SystemExit(f"invalid chroma key color: {value}; expected #RRGGBB")
    return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))


def color_distance(
    red: int,
    green: int,
    blue: int,
    key: tuple[int, int, int],
) -> float:
    return math.sqrt((red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2)


def remove_chroma_background(
    image: Image.Image,
    chroma_key: tuple[int, int, int],
    threshold: float,
) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if color_distance(red, green, blue, chroma_key) <= threshold:
                pixels[x, y] = (red, green, blue, 0)
    return rgba


def fit_to_cell(image: Image.Image) -> Image.Image:
    frame = image.convert("RGBA")
    target = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    if frame.size == (CELL_WIDTH, CELL_HEIGHT):
        target.alpha_composite(frame, (0, 0))
        return target

    bbox = frame.getbbox()
    if bbox is None:
        return target
    sprite = frame.crop(bbox)
    max_width = CELL_WIDTH - 10
    max_height = CELL_HEIGHT - 10
    scale = min(max_width / sprite.width, max_height / sprite.height, 1.0)
    if scale != 1.0:
        sprite = sprite.resize(
            (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
            Image.Resampling.LANCZOS,
        )
    target.alpha_composite(sprite, ((CELL_WIDTH - sprite.width) // 2, (CELL_HEIGHT - sprite.height) // 2))
    return target


def split_strip(strip: Image.Image, frame_count: int) -> list[Image.Image]:
    frames = []
    slot_width = strip.width / frame_count
    for index in range(frame_count):
        left = round(index * slot_width)
        right = round((index + 1) * slot_width)
        frames.append(fit_to_cell(strip.crop((left, 0, right, strip.height))))
    return frames


def load_chroma_key(run_dir: Path | None, override: str) -> tuple[int, int, int]:
    if override:
        return parse_hex_color(override)
    if run_dir is not None:
        request_path = run_dir / "pet_request.json"
        if request_path.is_file():
            request = json.loads(request_path.read_text(encoding="utf-8"))
            chroma_key = request.get("chroma_key")
            if isinstance(chroma_key, dict) and isinstance(chroma_key.get("hex"), str):
                return parse_hex_color(chroma_key["hex"])
    return parse_hex_color("#00FF00")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-atlas", required=True)
    parser.add_argument("--row-strip", required=True)
    parser.add_argument("--state", default="running", choices=sorted(ROW_SPECS))
    parser.add_argument("--output", required=True)
    parser.add_argument("--run-dir", default="")
    parser.add_argument("--chroma-key", default="")
    parser.add_argument("--key-threshold", type=float, default=96.0)
    args = parser.parse_args()

    source_atlas = Path(args.source_atlas).expanduser().resolve()
    row_strip = Path(args.row_strip).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    run_dir = Path(args.run_dir).expanduser().resolve() if args.run_dir else None
    row_index, frame_count = ROW_SPECS[args.state]

    with Image.open(source_atlas) as opened:
        atlas = opened.convert("RGBA")
    if atlas.size != (ATLAS_WIDTH, ATLAS_HEIGHT):
        raise SystemExit(f"source atlas is {atlas.width}x{atlas.height}; expected {ATLAS_WIDTH}x{ATLAS_HEIGHT}")

    chroma_key = load_chroma_key(run_dir, args.chroma_key)
    with Image.open(row_strip) as opened:
        strip = remove_chroma_background(opened, chroma_key, args.key_threshold)

    frames = split_strip(strip, frame_count)
    row_top = row_index * CELL_HEIGHT
    clear = Image.new("RGBA", (ATLAS_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    atlas.paste(clear, (0, row_top))
    for column, frame in enumerate(frames):
        atlas.alpha_composite(frame, (column * CELL_WIDTH, row_top))

    output.parent.mkdir(parents=True, exist_ok=True)
    if output.suffix.lower() == ".webp":
        atlas.save(output, format="WEBP", lossless=True, quality=100, method=6)
    else:
        atlas.save(output)
    print(json.dumps({"ok": True, "output": str(output), "state": args.state}, indent=2))


if __name__ == "__main__":
    main()
