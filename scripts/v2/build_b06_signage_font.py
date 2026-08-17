from __future__ import annotations

import argparse
import hashlib
import json
from importlib.metadata import version
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

from b06_signage_manifest import EXPECTED_FONT_CODEPOINTS, validate_manifest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = (
    REPOSITORY_ROOT
    / "assets/fonts/v2/B06/HaigureSignageSubset-Bold.ttf"
)
UPSTREAM_COMMIT = "f8d157532fbfaeda587e826d4cd5b21a49186f7c"
UPSTREAM_PATH = "Sans/Variable/TTF/Subset/NotoSansJP-VF.ttf"
UPSTREAM_URL = (
    "https://raw.githubusercontent.com/notofonts/noto-cjk/"
    f"{UPSTREAM_COMMIT}/{UPSTREAM_PATH}"
)
EXPECTED_SOURCE_SHA256 = (
    "f4b373b226668ee33a6e54b02823dcd2d1209f17159f777421ae8c2275160369"
)
EXPECTED_SOURCE_BYTES = 9_590_732
EXPECTED_OUTPUT_SHA256 = (
    "a0818c2e215739934a23872a481772befcc5224b65442725d1eb05387cb6a29a"
)
EXPECTED_OUTPUT_BYTES = 12_520
PINNED_FONTTOOLS_VERSION = "4.63.0"
FONT_FAMILY = "Haigure Signage Subset"
FONT_SUBFAMILY = "Bold"
FONT_FULL_NAME = f"{FONT_FAMILY} {FONT_SUBFAMILY}"
FONT_POSTSCRIPT_NAME = "HaigureSignageSubset-Bold"
FONT_UNIQUE_ID = f"{FONT_POSTSCRIPT_NAME};Version 1.000;B06-3"
FONT_VERSION = "Version 1.000"
PRESERVED_NAME_IDS = (0, 7, 8, 9, 10, 11, 12, 13, 14)
VARIABLE_TABLES = frozenset(
    {"avar", "cvar", "fvar", "gvar", "HVAR", "MVAR", "VVAR"}
)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="公式Noto Sans JPからB06-3表札用Bold subsetを生成する"
    )
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def name_values(font: TTFont, name_id: int) -> tuple[str, ...]:
    values = {
        record.toUnicode()
        for record in font["name"].names
        if record.nameID == name_id
    }
    return tuple(sorted(values))


def preserved_metadata(font: TTFont) -> dict[int, tuple[str, ...]]:
    return {name_id: name_values(font, name_id) for name_id in PRESERVED_NAME_IDS}


def set_name(font: TTFont, name_id: int, value: str) -> None:
    name_table = font["name"]
    name_table.removeNames(nameID=name_id)
    name_table.setName(value, name_id, 3, 1, 0x0409)
    name_table.setName(value, name_id, 1, 0, 0)


def rename_modified_font(font: TTFont) -> None:
    replacements = {
        1: FONT_FAMILY,
        2: FONT_SUBFAMILY,
        3: FONT_UNIQUE_ID,
        4: FONT_FULL_NAME,
        5: FONT_VERSION,
        6: FONT_POSTSCRIPT_NAME,
        16: FONT_FAMILY,
        17: FONT_SUBFAMILY,
        18: FONT_FULL_NAME,
        21: FONT_FAMILY,
        22: FONT_SUBFAMILY,
        25: "HaigureSignageSubset",
    }
    for name_id, value in replacements.items():
        set_name(font, name_id, value)


def source_cmap(font: TTFont) -> frozenset[int]:
    return frozenset(
        codepoint
        for table in font["cmap"].tables
        if table.isUnicode()
        for codepoint in table.cmap
    )


def validate_source(source_path: Path, font: TTFont) -> None:
    if source_path.stat().st_size != EXPECTED_SOURCE_BYTES:
        raise RuntimeError(
            "Noto Sans JP原本bytesが固定値と一致しません: "
            f"{source_path.stat().st_size}/{EXPECTED_SOURCE_BYTES}"
        )
    actual_sha256 = file_sha256(source_path)
    if actual_sha256 != EXPECTED_SOURCE_SHA256:
        raise RuntimeError(
            "Noto Sans JP原本SHA-256が固定値と一致しません: "
            f"{actual_sha256}/{EXPECTED_SOURCE_SHA256}"
        )
    if "fvar" not in font:
        raise RuntimeError("Noto Sans JP原本がvariable fontではありません")
    axes = tuple(
        (axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue)
        for axis in font["fvar"].axes
    )
    if axes != (("wght", 100.0, 100.0, 900.0),):
        raise RuntimeError(f"Noto Sans JP原本のaxis契約が不正です: {axes}")
    missing = sorted(EXPECTED_FONT_CODEPOINTS - source_cmap(font))
    if missing:
        raise RuntimeError(
            "Noto Sans JP原本に必要glyphがありません: "
            + ",".join(f"U+{value:04X}" for value in missing)
        )
    if not name_values(font, 0) or not name_values(font, 13) or not name_values(font, 14):
        raise RuntimeError("Noto Sans JP原本の著作権またはOFL metadataがありません")


def subset_font(source_font: TTFont) -> TTFont:
    static_font = instantiateVariableFont(
        source_font,
        {"wght": 700},
        inplace=False,
        optimize=True,
        updateFontNames=True,
        static=True,
    )
    options = subset.Options()
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.layout_features = []
    options.layout_closure = False
    options.ignore_missing_unicodes = False
    options.glyph_names = True
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = False
    options.recalc_timestamp = False
    options.harfbuzz_repacker = False
    options.canonical_order = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=sorted(EXPECTED_FONT_CODEPOINTS))
    subsetter.subset(static_font)
    rename_modified_font(static_font)
    static_font["OS/2"].usWeightClass = 700
    static_font["head"].created = source_font["head"].created
    static_font["head"].modified = source_font["head"].modified
    static_font.recalcTimestamp = False
    return static_font


def validate_output(
    output_path: Path,
    original_metadata: dict[int, tuple[str, ...]],
) -> dict[str, object]:
    font = TTFont(
        output_path,
        recalcBBoxes=False,
        recalcTimestamp=False,
        lazy=False,
    )
    actual_codepoints = source_cmap(font)
    if actual_codepoints != EXPECTED_FONT_CODEPOINTS:
        raise RuntimeError(
            "subsetのUnicode集合が固定41文字と一致しません: "
            f"actual={len(actual_codepoints)} expected={len(EXPECTED_FONT_CODEPOINTS)}"
        )
    remaining_variable_tables = sorted(VARIABLE_TABLES & set(font.keys()))
    if remaining_variable_tables:
        raise RuntimeError(
            f"subsetにvariable font tableが残っています: {remaining_variable_tables}"
        )
    if font["OS/2"].usWeightClass != 700 or font["OS/2"].fsType != 0:
        raise RuntimeError(
            "subsetのBoldまたはembedding契約が不正です: "
            f"weight={font['OS/2'].usWeightClass}, fsType={font['OS/2'].fsType}"
        )
    for name_id, expected_values in original_metadata.items():
        if name_values(font, name_id) != expected_values:
            raise RuntimeError(
                f"subsetのnameID {name_id} metadataが原本から変化しました"
            )
    expected_names = {
        1: (FONT_FAMILY,),
        2: (FONT_SUBFAMILY,),
        3: (FONT_UNIQUE_ID,),
        4: (FONT_FULL_NAME,),
        5: (FONT_VERSION,),
        6: (FONT_POSTSCRIPT_NAME,),
        16: (FONT_FAMILY,),
        17: (FONT_SUBFAMILY,),
        18: (FONT_FULL_NAME,),
        21: (FONT_FAMILY,),
        22: (FONT_SUBFAMILY,),
        25: ("HaigureSignageSubset",),
    }
    for name_id, expected_values in expected_names.items():
        if name_values(font, name_id) != expected_values:
            raise RuntimeError(
                f"subsetの内部名nameID {name_id}が不正です: {name_values(font, name_id)}"
            )
    actual_sha256 = file_sha256(output_path)
    actual_bytes = output_path.stat().st_size
    if actual_sha256 != EXPECTED_OUTPUT_SHA256 or actual_bytes != EXPECTED_OUTPUT_BYTES:
        raise RuntimeError(
            "subsetのbytesまたはSHA-256が固定値と一致しません: "
            f"bytes={actual_bytes}/{EXPECTED_OUTPUT_BYTES}, "
            f"sha256={actual_sha256}/{EXPECTED_OUTPUT_SHA256}"
        )
    return {
        "bytes": actual_bytes,
        "sha256": actual_sha256,
        "fontTools": version("fonttools"),
        "sourceCommit": UPSTREAM_COMMIT,
        "sourceSha256": EXPECTED_SOURCE_SHA256,
        "unicodeCount": len(actual_codepoints),
        "glyphCount": len(font.getGlyphOrder()),
        "family": FONT_FAMILY,
        "subfamily": FONT_SUBFAMILY,
        "weight": font["OS/2"].usWeightClass,
        "fsType": font["OS/2"].fsType,
    }


def main() -> None:
    validate_manifest()
    if version("fonttools") != PINNED_FONTTOOLS_VERSION:
        raise RuntimeError(
            "fontTools版が固定値と一致しません: "
            f"{version('fonttools')}/{PINNED_FONTTOOLS_VERSION}"
        )
    arguments = parse_arguments()
    source_path = arguments.source.resolve()
    output_path = arguments.output.resolve()
    source_font = TTFont(
        source_path,
        recalcBBoxes=False,
        recalcTimestamp=False,
        lazy=False,
    )
    validate_source(source_path, source_font)
    original_metadata = preserved_metadata(source_font)
    generated_font = subset_font(source_font)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    generated_font.save(output_path, reorderTables=True)
    result = validate_output(output_path, original_metadata)
    print("B06_SIGNAGE_FONT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
