from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass


ATLAS_DIMENSIONS = (2048, 1024)
ATLAS_GRID = (8, 8)
ATLAS_TILE_SIZE = (
    ATLAS_DIMENSIONS[0] // ATLAS_GRID[0],
    ATLAS_DIMENSIONS[1] // ATLAS_GRID[1],
)
EXPECTED_ATLAS_BYTES = 63_890
EXPECTED_ATLAS_SHA256 = (
    "04d2e138c7b2c65a9f2987bc4f3115ef61dfc39f3f9228496e5df7bef3af9351"
)
EXPECTED_MANIFEST_SHA256 = (
    "5dcc0e7eec3999796d69d5f0a163345a5f13245216a3b36e1bd320b886b15f59"
)
SIGNAGE_FONT_RELATIVE_PATH = "assets/fonts/v2/B06/HaigureSignageSubset-Bold.ttf"
EXPECTED_FONT_BYTES = 10_580
EXPECTED_FONT_SHA256 = (
    "d41e2ab55b3f3267d915adae14b94f8c4adea3025e8c29d30c90b0d1e8218419"
)
SIGN_SIZE = (0.45, 0.04, 0.18)
SIGN_BACKGROUND_SAMPLE_OFFSET = (16, 16)
ADJUSTMENT_TEXT = "調整中"

FLOOR_SIGN_COLORS = {
    "f01": (194, 145, 40),
    "f02": (55, 130, 91),
    "f03": (178, 78, 55),
    "f04": (55, 93, 149),
}


@dataclass(frozen=True)
class AtlasTile:
    tile_id: str
    tile: int
    background: tuple[int, int, int]
    text: str | None = None
    pictogram_id: str | None = None
    foreground: tuple[int, int, int] = (30, 31, 34)


@dataclass(frozen=True)
class SignPlacement:
    placement_id: str
    sign_id: str
    target_room_id: str
    owner_room: str
    position: tuple[float, float, float]
    rotation_z: float


BASE_TILES = (
    AtlasTile("paper", 0, (235, 229, 205)),
    AtlasTile("paper_white", 1, (242, 242, 234)),
    AtlasTile("book_blue", 2, (47, 87, 131)),
    AtlasTile("book_red", 3, (151, 56, 49)),
    AtlasTile("book_green", 4, (52, 112, 77)),
    AtlasTile("screen", 5, (42, 92, 115)),
    AtlasTile("safety", 6, (228, 101, 25)),
    AtlasTile("clock", 7, (235, 232, 216)),
    AtlasTile("notice_accent", 8, (178, 78, 55)),
)


def text_tile(
    tile_id: str,
    tile: int,
    text: str,
    floor_id: str,
) -> AtlasTile:
    background = FLOOR_SIGN_COLORS[floor_id]
    luminance = sum(background) / 3.0
    foreground = (24, 25, 27) if luminance >= 125.0 else (246, 245, 238)
    return AtlasTile(tile_id, tile, background, text=text, foreground=foreground)


SIGN_TILES = (
    text_tile("classroom-f02-01", 9, "3-1", "f02"),
    text_tile("classroom-f02-02", 10, "3-2", "f02"),
    text_tile("classroom-f02-03", 11, "3-3", "f02"),
    text_tile("classroom-f03-01", 12, "2-1", "f03"),
    text_tile("classroom-f03-02", 13, "2-2", "f03"),
    text_tile("classroom-f03-03", 14, "2-3", "f03"),
    text_tile("classroom-f04-01", 15, "1-1", "f04"),
    text_tile("classroom-f04-02", 16, "1-2", "f04"),
    text_tile("classroom-f04-03", 17, "1-3", "f04"),
    text_tile("f01-infirmary", 18, "保健室", "f01"),
    text_tile("f01-library", 19, "図書室", "f01"),
    text_tile("f01-staff-room", 20, "職員室", "f01"),
    text_tile("f01-pc-room", 21, "PC室", "f01"),
    text_tile("f02-council", 22, "生徒会室", "f02"),
    text_tile("f02-broadcast", 23, "放送室", "f02"),
    text_tile("f02-science", 24, "理科室", "f02"),
    text_tile("f03-art", 25, "美術室", "f03"),
    text_tile("f03-home-ec", 26, "家庭科室", "f03"),
    text_tile("f04-ll", 27, "LL教室", "f04"),
    text_tile("f04-music", 28, "音楽室", "f04"),
    AtlasTile(
        "pictogram-male",
        32,
        (238, 239, 235),
        pictogram_id="male",
        foreground=(45, 95, 168),
    ),
    AtlasTile(
        "pictogram-female",
        33,
        (238, 239, 235),
        pictogram_id="female",
        foreground=(181, 62, 83),
    ),
)

ATLAS_TILES = BASE_TILES + SIGN_TILES
SIGN_TILE_IDS = frozenset(tile.tile_id for tile in SIGN_TILES)


def placement(
    placement_id: str,
    sign_id: str,
    target_room_id: str,
    owner_room: str,
    x: float,
    y: float,
    base_z: float,
    rotation_z: float = 0.0,
) -> SignPlacement:
    return SignPlacement(
        placement_id,
        sign_id,
        target_room_id,
        owner_room,
        (x, y, base_z + 1.7),
        rotation_z,
    )


SIGN_PLACEMENTS = (
    placement(
        "f01-infirmary-south",
        "f01-infirmary",
        "f01-infirmary",
        "F01_Corridors",
        -3.34,
        5.125,
        0.0,
        math.pi / 2,
    ),
    placement(
        "f01-infirmary-north",
        "f01-infirmary",
        "f01-infirmary",
        "F01_Infirmary",
        -3.34,
        10.275,
        0.0,
        math.pi / 2,
    ),
    placement(
        "f01-library-south",
        "f01-library",
        "f01-library",
        "F01_Corridors",
        -3.34,
        14.725,
        0.0,
        math.pi / 2,
    ),
    placement(
        "f01-library-north",
        "f01-library",
        "f01-library",
        "F01_Corridors",
        -3.34,
        30.275,
        0.0,
        math.pi / 2,
    ),
    placement(
        "f01-staff-room",
        "f01-staff-room",
        "f01-staff-room",
        "F01_Corridors",
        9.0,
        36.34,
        0.0,
    ),
    placement(
        "f01-pc-room",
        "f01-pc-room",
        "f01-pc-room",
        "F01_Corridors",
        27.0,
        36.34,
        0.0,
    ),
    placement(
        "f02-classroom-01",
        "classroom-f02-01",
        "f02-classroom-01",
        "F02_Corridors",
        -3.34,
        5.725,
        3.6,
        math.pi / 2,
    ),
    placement(
        "f02-classroom-02",
        "classroom-f02-02",
        "f02-classroom-02",
        "F02_Corridors",
        -3.34,
        15.725,
        3.6,
        math.pi / 2,
    ),
    placement(
        "f02-classroom-03",
        "classroom-f02-03",
        "f02-classroom-03",
        "F02_Corridors",
        -3.34,
        25.725,
        3.6,
        math.pi / 2,
    ),
    placement(
        "f02-council",
        "f02-council",
        "f02-council",
        "F02_Corridors",
        9.0,
        36.34,
        3.6,
    ),
    placement(
        "f02-broadcast",
        "f02-broadcast",
        "f02-broadcast",
        "F02_Corridors",
        19.8,
        36.34,
        3.6,
    ),
    placement(
        "f02-science",
        "f02-science",
        "f02-science",
        "F02_Corridors",
        27.0,
        36.34,
        3.6,
    ),
    placement(
        "f03-classroom-01",
        "classroom-f03-01",
        "f03-classroom-01",
        "F03_Corridors",
        -3.34,
        5.725,
        7.2,
        math.pi / 2,
    ),
    placement(
        "f03-classroom-02",
        "classroom-f03-02",
        "f03-classroom-02",
        "F03_Corridors",
        -3.34,
        15.725,
        7.2,
        math.pi / 2,
    ),
    placement(
        "f03-classroom-03",
        "classroom-f03-03",
        "f03-classroom-03",
        "F03_Corridors",
        -3.34,
        25.725,
        7.2,
        math.pi / 2,
    ),
    placement(
        "f03-art",
        "f03-art",
        "f03-art",
        "F03_Corridors",
        9.0,
        36.34,
        7.2,
    ),
    placement(
        "f03-home-ec",
        "f03-home-ec",
        "f03-home-ec",
        "F03_Corridors",
        27.0,
        36.34,
        7.2,
    ),
    placement(
        "f04-classroom-01",
        "classroom-f04-01",
        "f04-classroom-01",
        "F04_Corridors",
        -3.34,
        5.725,
        10.8,
        math.pi / 2,
    ),
    placement(
        "f04-classroom-02",
        "classroom-f04-02",
        "f04-classroom-02",
        "F04_Corridors",
        -3.34,
        15.725,
        10.8,
        math.pi / 2,
    ),
    placement(
        "f04-classroom-03",
        "classroom-f04-03",
        "f04-classroom-03",
        "F04_Corridors",
        -3.34,
        25.725,
        10.8,
        math.pi / 2,
    ),
    placement(
        "f04-ll",
        "f04-ll",
        "f04-ll",
        "F04_Corridors",
        9.0,
        36.34,
        10.8,
    ),
    placement(
        "f04-music",
        "f04-music",
        "f04-music",
        "F04_Corridors",
        27.0,
        36.34,
        10.8,
    ),
    *(
        placement(
            f"f{floor:02d}-toilet-male",
            "pictogram-male",
            f"f{floor:02d}-toilet-male",
            f"F{floor:02d}_Toilets",
            -5.825,
            38.34,
            base_z,
            math.pi,
        )
        for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8))
    ),
    *(
        placement(
            f"f{floor:02d}-toilet-female",
            "pictogram-female",
            f"f{floor:02d}-toilet-female",
            f"F{floor:02d}_Toilets",
            0.725,
            38.34,
            base_z,
            math.pi,
        )
        for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8))
    ),
    placement(
        "roof-changing-male",
        "pictogram-male",
        "roof-changing-male",
        "RoofChanging",
        -3.775,
        38.48,
        14.5,
    ),
    placement(
        "roof-changing-female",
        "pictogram-female",
        "roof-changing-female",
        "RoofChanging",
        0.725,
        38.48,
        14.5,
    ),
)

ROOM_VARIANT_IDS = frozenset(
    {
        "f01-infirmary",
        "f01-library",
        "f01-staff-room",
        "f01-pc-room",
        "f02-classroom-01",
        "f02-classroom-02",
        "f02-classroom-03",
        "f02-council",
        "f02-broadcast",
        "f02-science",
        "f03-classroom-01",
        "f03-classroom-02",
        "f03-classroom-03",
        "f03-art",
        "f03-home-ec",
        "f04-classroom-01",
        "f04-classroom-02",
        "f04-classroom-03",
        "f04-ll",
        "f04-music",
    }
)

EXPECTED_FONT_CODEPOINTS = frozenset(
    {
        0x002D,
        0x0031,
        0x0032,
        0x0033,
        0x0043,
        0x004C,
        0x0050,
        0x4E2D,
        0x4F1A,
        0x4FDD,
        0x5065,
        0x54E1,
        0x56F3,
        0x5BA4,
        0x5BB6,
        0x5EAD,
        0x5F92,
        0x653E,
        0x6559,
        0x6574,
        0x66F8,
        0x697D,
        0x7406,
        0x751F,
        0x79D1,
        0x7F8E,
        0x8077,
        0x8853,
        0x8ABF,
        0x9001,
        0x97F3,
    }
)


def tile_by_id() -> dict[str, AtlasTile]:
    return {tile.tile_id: tile for tile in ATLAS_TILES}


def sign_background_sample_uv(sign_id: str) -> tuple[float, float]:
    if sign_id not in SIGN_TILE_IDS:
        raise RuntimeError(f"未知のsign IDです: {sign_id}")
    tile = tile_by_id()[sign_id].tile
    column = tile % ATLAS_GRID[0]
    row = tile // ATLAS_GRID[0]
    pixel_x = (
        column * ATLAS_TILE_SIZE[0] + SIGN_BACKGROUND_SAMPLE_OFFSET[0] + 0.5
    )
    pixel_y = row * ATLAS_TILE_SIZE[1] + SIGN_BACKGROUND_SAMPLE_OFFSET[1] + 0.5
    return (
        pixel_x / ATLAS_DIMENSIONS[0],
        1.0 - pixel_y / ATLAS_DIMENSIONS[1],
    )


def required_font_codepoints() -> frozenset[int]:
    characters = {
        character
        for tile in SIGN_TILES
        for character in (tile.text or "")
    }
    characters.update(ADJUSTMENT_TEXT)
    return frozenset(ord(character) for character in characters)


def atlas_swatch_colors() -> dict[str, tuple[int, int, int]]:
    return {tile.tile_id: tile.background for tile in ATLAS_TILES}


def manifest_payload() -> dict[str, object]:
    return {
        "atlas_dimensions": list(ATLAS_DIMENSIONS),
        "atlas_grid": list(ATLAS_GRID),
        "tiles": [asdict(tile) for tile in ATLAS_TILES],
        "placements": [asdict(item) for item in SIGN_PLACEMENTS],
    }


def manifest_json() -> str:
    return json.dumps(
        manifest_payload(),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def validate_manifest() -> None:
    tile_ids = [tile.tile_id for tile in ATLAS_TILES]
    tile_indices = [tile.tile for tile in ATLAS_TILES]
    if len(tile_ids) != len(set(tile_ids)):
        raise RuntimeError("SignsPaper Atlasに重複tile IDがあります")
    if len(tile_indices) != len(set(tile_indices)):
        raise RuntimeError("SignsPaper Atlasに重複tile番号があります")
    if any(index < 0 or index >= ATLAS_GRID[0] * ATLAS_GRID[1] for index in tile_indices):
        raise RuntimeError("SignsPaper Atlasのtile番号が8x8範囲外です")
    if required_font_codepoints() != EXPECTED_FONT_CODEPOINTS:
        raise RuntimeError(
            "表札manifestから算出した必要glyphが固定31文字と一致しません"
        )
    for tile in SIGN_TILES:
        if (tile.text is None) == (tile.pictogram_id is None):
            raise RuntimeError(
                f"表札tileは文字かpictogramの一方だけを持つ必要があります: {tile.tile_id}"
            )
        sign_background_sample_uv(tile.tile_id)
    placement_ids = [item.placement_id for item in SIGN_PLACEMENTS]
    if len(placement_ids) != len(set(placement_ids)):
        raise RuntimeError("表札manifestに重複placement IDがあります")
    if len(SIGN_PLACEMENTS) != 32:
        raise RuntimeError(f"表札配置が32件ではありません: {len(SIGN_PLACEMENTS)}")
    unknown_sign_ids = sorted(
        {item.sign_id for item in SIGN_PLACEMENTS} - SIGN_TILE_IDS
    )
    if unknown_sign_ids:
        raise RuntimeError(f"未知のsign IDがあります: {unknown_sign_ids}")
    transforms = [
        (item.position, round(item.rotation_z, 12)) for item in SIGN_PLACEMENTS
    ]
    if len(transforms) != len(set(transforms)):
        raise RuntimeError("同一Transformの重複表札があります")
    covered_room_variants = {
        item.target_room_id
        for item in SIGN_PLACEMENTS
        if item.target_room_id in ROOM_VARIANT_IDS
    }
    if covered_room_variants != ROOM_VARIANT_IDS:
        raise RuntimeError(
            "20室の表札被覆が不正です: "
            f"missing={sorted(ROOM_VARIANT_IDS - covered_room_variants)}"
        )
    if any("gym-storage" in item.target_room_id for item in SIGN_PLACEMENTS):
        raise RuntimeError("体育倉庫へ表札を配置してはいけません")
    forbidden_sign_ids = {"main-entry", "north-entry", "rooftop-pool"}
    if forbidden_sign_ids & {
        item.sign_id for item in SIGN_PLACEMENTS
    }:
        raise RuntimeError("主玄関・北通用口・プールへ表札を配置してはいけません")


validate_manifest()
