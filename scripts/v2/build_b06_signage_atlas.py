from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from importlib.metadata import version
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont, features

from b06_signage_manifest import (
    ATLAS_DIMENSIONS,
    ATLAS_GRID,
    ATLAS_TILE_SIZE,
    ATLAS_TILES,
    EXPECTED_ATLAS_BYTES,
    EXPECTED_ATLAS_SHA256,
    EXPECTED_FONT_CODEPOINTS,
    EXPECTED_MANIFEST_SHA256,
    SIGN_TILES,
    AtlasTile,
    manifest_json,
    validate_manifest,
)
from build_b06_signage_font import (
    EXPECTED_OUTPUT_BYTES as EXPECTED_FONT_BYTES,
    EXPECTED_OUTPUT_SHA256 as EXPECTED_FONT_SHA256,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FONT = (
    REPOSITORY_ROOT
    / "assets/fonts/v2/B06/HaigureSignageSubset-Bold.ttf"
)
DEFAULT_OUTPUT = (
    REPOSITORY_ROOT / "assets/textures/v2/B03/b03_signs_paper_atlas.png"
)
DEFAULT_PUBLIC_OUTPUT = (
    REPOSITORY_ROOT
    / "public/stage-assets/v2/B02/b03_signs_paper_atlas.png"
)
PINNED_FONTTOOLS_VERSION = "4.63.0"
PINNED_PILLOW_VERSION = "12.3.0"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="B06-3表札manifestとsubset fontからSignsPaper Atlasを生成する"
    )
    parser.add_argument("--font", type=Path, default=DEFAULT_FONT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--public-output", type=Path)
    return parser.parse_args()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def font_codepoints(path: Path) -> frozenset[int]:
    font = TTFont(path, recalcBBoxes=False, recalcTimestamp=False, lazy=False)
    return frozenset(
        codepoint
        for table in font["cmap"].tables
        if table.isUnicode()
        for codepoint in table.cmap
    )


def validate_font(path: Path) -> None:
    actual_bytes = path.stat().st_size
    actual_sha256 = file_sha256(path)
    if actual_bytes != EXPECTED_FONT_BYTES or actual_sha256 != EXPECTED_FONT_SHA256:
        raise RuntimeError(
            "SignsPaper生成用fontが固定subsetと一致しません: "
            f"bytes={actual_bytes}/{EXPECTED_FONT_BYTES}, "
            f"sha256={actual_sha256}/{EXPECTED_FONT_SHA256}"
        )
    if font_codepoints(path) != EXPECTED_FONT_CODEPOINTS:
        raise RuntimeError("SignsPaper生成用fontのUnicode集合が固定41文字と一致しません")


def tile_bounds(tile_index: int) -> tuple[int, int, int, int]:
    column = tile_index % ATLAS_GRID[0]
    row = tile_index // ATLAS_GRID[0]
    left = column * ATLAS_TILE_SIZE[0]
    top = row * ATLAS_TILE_SIZE[1]
    return (
        left,
        top,
        left + ATLAS_TILE_SIZE[0],
        top + ATLAS_TILE_SIZE[1],
    )


def draw_text_tile(
    draw: ImageDraw.ImageDraw,
    tile: AtlasTile,
    font_path: Path,
) -> None:
    if tile.text is None:
        raise RuntimeError(f"文字tileに表示内容がありません: {tile.tile_id}")
    left, top, right, bottom = tile_bounds(tile.tile)
    border = (22, 23, 26)
    draw.rectangle((left, top, right - 1, bottom - 1), fill=border)
    draw.rectangle(
        (left + 5, top + 5, right - 6, bottom - 6),
        fill=tile.background,
        outline=(246, 243, 230),
        width=2,
    )
    font = None
    for size in range(72, 23, -1):
        candidate = ImageFont.truetype(
            str(font_path),
            size=size,
            layout_engine=ImageFont.Layout.BASIC,
        )
        bounds = draw.textbbox(
            (0, 0),
            tile.text,
            font=candidate,
            anchor="lt",
            stroke_width=1,
        )
        if bounds[2] - bounds[0] <= 220 and bounds[3] - bounds[1] <= 88:
            font = candidate
            break
    if font is None:
        raise RuntimeError(f"表札文字をtileへ収められません: {tile.tile_id}")
    draw.text(
        ((left + right) / 2.0, (top + bottom) / 2.0 - 1.0),
        tile.text,
        font=font,
        fill=tile.foreground,
        anchor="mm",
        stroke_width=1,
        stroke_fill=tile.foreground,
    )


def draw_pictogram_tile(draw: ImageDraw.ImageDraw, tile: AtlasTile) -> None:
    if tile.pictogram_id not in {"male", "female"}:
        raise RuntimeError(f"未知のpictogram IDです: {tile.pictogram_id}")
    left, top, right, bottom = tile_bounds(tile.tile)
    border = (22, 23, 26)
    draw.rectangle((left, top, right - 1, bottom - 1), fill=border)
    draw.rectangle(
        (left + 5, top + 5, right - 6, bottom - 6),
        fill=tile.background,
        outline=(246, 243, 230),
        width=2,
    )
    center_x = (left + right) // 2
    color = tile.foreground
    draw.ellipse(
        (center_x - 13, top + 18, center_x + 13, top + 44),
        fill=color,
    )
    if tile.pictogram_id == "male":
        draw.rounded_rectangle(
            (center_x - 18, top + 48, center_x + 18, top + 89),
            radius=7,
            fill=color,
        )
        draw.rectangle(
            (center_x - 15, top + 82, center_x - 4, top + 110),
            fill=color,
        )
        draw.rectangle(
            (center_x + 4, top + 82, center_x + 15, top + 110),
            fill=color,
        )
    else:
        draw.polygon(
            (
                (center_x, top + 46),
                (center_x - 27, top + 94),
                (center_x + 27, top + 94),
            ),
            fill=color,
        )
        draw.rectangle(
            (center_x - 14, top + 88, center_x - 4, top + 110),
            fill=color,
        )
        draw.rectangle(
            (center_x + 4, top + 88, center_x + 14, top + 110),
            fill=color,
        )


def build_atlas(font_path: Path) -> Image.Image:
    image = Image.new("RGB", ATLAS_DIMENSIONS, (31, 32, 35))
    draw = ImageDraw.Draw(image)
    for tile in ATLAS_TILES:
        left, top, right, bottom = tile_bounds(tile.tile)
        draw.rectangle(
            (left, top, right - 1, bottom - 1),
            fill=tile.background,
        )
    for tile in SIGN_TILES:
        if tile.text is not None:
            draw_text_tile(draw, tile, font_path)
        else:
            draw_pictogram_tile(draw, tile)
    return image


def save_atlas(image: Image.Image, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        output_path,
        format="PNG",
        optimize=False,
        compress_level=9,
    )


def main() -> None:
    validate_manifest()
    if version("fonttools") != PINNED_FONTTOOLS_VERSION:
        raise RuntimeError("fontTools版がrequirements固定値と一致しません")
    if version("Pillow") != PINNED_PILLOW_VERSION:
        raise RuntimeError("Pillow版がrequirements固定値と一致しません")
    arguments = parse_arguments()
    font_path = arguments.font.resolve()
    output_path = arguments.output.resolve()
    validate_font(font_path)
    image = build_atlas(font_path)
    save_atlas(image, output_path)
    actual_bytes = output_path.stat().st_size
    actual_sha256 = file_sha256(output_path)
    if actual_bytes != EXPECTED_ATLAS_BYTES or actual_sha256 != EXPECTED_ATLAS_SHA256:
        raise RuntimeError(
            "SignsPaper AtlasのbytesまたはSHA-256が固定値と一致しません: "
            f"bytes={actual_bytes}/{EXPECTED_ATLAS_BYTES}, "
            f"sha256={actual_sha256}/{EXPECTED_ATLAS_SHA256}"
        )
    public_output = (
        arguments.public_output.resolve()
        if arguments.public_output is not None
        else None
    )
    if public_output is None and output_path == DEFAULT_OUTPUT.resolve():
        public_output = DEFAULT_PUBLIC_OUTPUT.resolve()
    if public_output is not None:
        public_output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output_path, public_output)
        if file_sha256(public_output) != file_sha256(output_path):
            raise RuntimeError("authoring/public SignsPaper Atlasのbytesが一致しません")
    actual_manifest_sha256 = hashlib.sha256(
        manifest_json().encode("utf-8")
    ).hexdigest()
    if actual_manifest_sha256 != EXPECTED_MANIFEST_SHA256:
        raise RuntimeError(
            "表札manifest SHA-256が固定値と一致しません: "
            f"{actual_manifest_sha256}/{EXPECTED_MANIFEST_SHA256}"
        )
    result = {
        "atlasBytes": actual_bytes,
        "atlasSha256": actual_sha256,
        "dimensions": list(image.size),
        "fontSha256": file_sha256(font_path),
        "fontTools": version("fonttools"),
        "freeType": features.version("freetype2"),
        "grid": list(ATLAS_GRID),
        "manifestSha256": actual_manifest_sha256,
        "pictogramTiles": sum(tile.pictogram_id is not None for tile in SIGN_TILES),
        "Pillow": version("Pillow"),
        "publicOutput": str(public_output) if public_output is not None else None,
        "signTiles": len(SIGN_TILES),
    }
    print("B06_SIGNAGE_ATLAS=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
