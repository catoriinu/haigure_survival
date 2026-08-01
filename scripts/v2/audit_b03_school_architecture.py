from __future__ import annotations

import hashlib
import json
import math
import re
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from optimize_b03_school_glb import (
    GlbDocument,
    accessor_payload,
    collect_used_accessor_indices,
    material_uses_texture,
    read_glb,
)
from build_b03_school_interiors import (
    ATLAS_DEFINITIONS,
    FIRST_FLOOR_WEST_DOOR_OPENINGS,
    INFIRMARY_CURTAIN_MATERIAL_NAME,
    NORTH_CLASSROOM_DOOR_OPENINGS,
    TOILET_COMMON_OPENING,
    TOILET_FRONT_DOOR_HEIGHT,
    TOILET_FRONT_DOOR_OPENINGS,
    TOILET_FRONT_WALL_DEPTH,
    TOILET_FRONT_WALL_SPANS,
    TOILET_FRONT_WALL_Y,
    UPPER_WEST_CLASSROOM_DOOR_OPENINGS,
    swatch_uv,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
NAVMESH_PATH = (
    REPOSITORY_ROOT
    / "public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin"
)
PROP_LIBRARY_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B03/b03_school_prop_library.blend"
)

EXPECTED_NAVMESH_SHA256 = (
    "A6E41AA0FDE1522C5B100BF023BD8C8636A8998A14256183583627119952F8E3"
)
EXPECTED_PROP_LIBRARY_SHA256 = (
    "560974D7FABAAE9D7FC89FB563F4EEB3964866D8B33EE2C138FF1020C414514C"
)
EXPECTED_PACKED_ATLAS_PATHS = {
    image_name: REPOSITORY_ROOT / "assets/textures/v2/B03" / image_name
    for image_name in (
        "b03_architecture_atlas.png",
        "b03_furniture_props_atlas.png",
        "b03_signs_paper_atlas.png",
    )
}
EXPECTED_CONSOLIDATED_MATERIAL_NAMES = {
    *(str(definition["material"]) for definition in ATLAS_DEFINITIONS.values()),
    INFIRMARY_CURTAIN_MATERIAL_NAME,
    "MAT_B03_WindowGlass",
    "MAT_Pool_Water",
}
LINK_PATTERN = re.compile(r"^LNK_(.+)_([AB])$")
TOLERANCE = 1e-5
DOOR_OPENING_MARGIN = 0.01
EXPECTED_GENERATOR_VERSION = "b03-3c-interactive-assets-v3"
EXPECTED_T04_CORRECTION_VERSION = "t04-2b-nav-connectivity-v11"
EXPECTED_SCHEMA_VERSION = 2
EXPECTED_STAGE_ID = "school"
EXPECTED_HUMAN_NAV_PROFILE = "school-humanoid-room-variants-v2"
EXPECTED_BIT_NAV_PROFILE = "bit-flight-body-0.44-margin-0.10-v1"
BIT_FLIGHT_PHYSICAL_RADIUS_METERS = 0.44
BIT_FLIGHT_SAFETY_MARGIN_METERS = 0.10
BIT_FLIGHT_SAFETY_ENVELOPE_METERS = (
    BIT_FLIGHT_PHYSICAL_RADIUS_METERS + BIT_FLIGHT_SAFETY_MARGIN_METERS
)
BIT_FLIGHT_LINK_RADIUS_METERS = BIT_FLIGHT_SAFETY_ENVELOPE_METERS
WINDOW_LINK_ENDPOINT_OFFSET_METERS = 1.0
GYM_WINDOW_LINK_ENDPOINT_OFFSET_METERS = 2.30
BIT_FLIGHT_BLOCKER_HALF_HEIGHT_METERS = (
    BIT_FLIGHT_SAFETY_ENVELOPE_METERS + 0.05
)
BIT_FLIGHT_PROJECTION_DISTANCE_METERS = 3.0
EXPECTED_APERTURE_AFFORDANCES = (
    "search-vantage",
    "indoor-access",
    "outdoor-access",
    "window-access",
)

ASSEMBLY_GUIDE_NAMES = (
    "VIS_CourtyardCapacityGrid_10x10",
    "VIS_GymCapacityGrid_10x10",
    "VIS_GymExecutionAudience_94",
    "VIS_GymExecutionTargets_06",
)

ASSEMBLY_VENUE_SPECS = (
    (
        "Courtyard",
        "assembly-courtyard",
        "assembly-volume-courtyard",
        (16.7, 14.5, -0.30),
        (9.95, 7.75, 1.50),
        ((6.7, 4.5, -0.30), (26.7, 24.5, 1.70)),
    ),
    (
        "Gym",
        "assembly-gym",
        "assembly-volume-gym",
        (46.4, 9.5, 0.0),
        (40.325, 3.425, 1.35),
        ((36.4, -0.5, 0.0), (56.4, 19.5, 2.0)),
    ),
)

EXPECTED_BIT_FLIGHT_BANDS = (
    (
        "NAV_BitFlight_ExteriorF1",
        "school-exterior",
        "outdoor-f1",
        "outdoor",
        1.0,
        1.8,
    ),
    (
        "NAV_BitFlight_ExteriorF2",
        "school-exterior",
        "outdoor-f2",
        "outdoor",
        4.6,
        5.4,
    ),
    (
        "NAV_BitFlight_ExteriorF3",
        "school-exterior",
        "outdoor-f3",
        "outdoor",
        8.2,
        9.0,
    ),
    (
        "NAV_BitFlight_ExteriorF4",
        "school-exterior",
        "outdoor-f4",
        "outdoor",
        11.8,
        12.6,
    ),
    (
        "NAV_BitFlight_InteriorF1",
        "school-interior",
        "interior-f1",
        "indoor",
        1.0,
        1.8,
    ),
    (
        "NAV_BitFlight_InteriorF2",
        "school-interior",
        "interior-f2",
        "indoor",
        4.6,
        5.4,
    ),
    (
        "NAV_BitFlight_InteriorF3",
        "school-interior",
        "interior-f3",
        "indoor",
        8.2,
        9.0,
    ),
    (
        "NAV_BitFlight_InteriorF4",
        "school-interior",
        "interior-f4",
        "indoor",
        11.8,
        12.6,
    ),
    (
        "NAV_BitFlight_GymLow",
        "school-gym",
        "gym-low",
        "indoor",
        1.0,
        1.8,
    ),
    (
        "NAV_BitFlight_GymUpper",
        "school-gym",
        "gym-upper",
        "indoor",
        4.6,
        5.4,
    ),
    (
        "NAV_BitFlight_Rooftop",
        "school-rooftop",
        "roof-flight",
        "outdoor",
        15.4,
        18.0,
    ),
)

GATE_VISUAL_SPECS = (
    ("VIS_Gate_MainClosed", "X", 19.4, 25.4, -14.5),
    ("VIS_Gate_UtilityClosed", "Y", 44.5, 50.5, 63.4),
)
GATE_COLLIDER_BOUNDS = {
    "COL_Gate_MainClosed": ((19.4, -14.625, -0.3), (25.4, -14.375, 1.7)),
    "COL_Gate_UtilityClosed": ((63.275, 44.5, -0.3), (63.525, 50.5, 1.7)),
}
PERIMETER_WALL_SPECS = (
    ("Perimeter_East", "Y", -14.5, 44.5, 63.2, 63.6),
    ("Perimeter_EastNorth", "Y", 50.5, 51.5, 63.2, 63.6),
    ("Perimeter_NorthEast", "X", 22.4, 63.4, 51.3, 51.7),
    ("Perimeter_NorthWest", "X", -18.6, 22.4, 51.3, 51.7),
    ("Perimeter_SouthEast", "X", 25.4, 63.4, -14.7, -14.3),
    ("Perimeter_SouthWest", "X", -18.6, 19.4, -14.7, -14.3),
    ("Perimeter_West", "Y", -14.5, 51.5, -18.8, -18.4),
)
PERIMETER_WALL_Z = (-0.3, 1.7)
PERIMETER_BLOCK_WIDTH = 0.8
PERIMETER_BLOCK_HEIGHT = 0.4
PERIMETER_JOINT_WIDTH = 0.02
PERIMETER_JOINT_DEPTH = 0.006

ROOF_GUARD_SEGMENTS = (
    (
        "CourtyardNorth",
        (-0.1, 32.6, 14.5),
        (47.3, 32.6, 14.5),
        False,
        True,
    ),
    (
        "CourtyardWest",
        (-0.1, -6.9, 14.5),
        (-0.1, 32.6, 14.5),
        False,
        True,
    ),
    (
        "EastOuter",
        (47.3, 32.6, 14.5),
        (47.3, 45.4, 14.5),
        False,
        True,
    ),
    (
        "NorthOuter",
        (2.4, 45.4, 14.5),
        (47.3, 45.4, 14.5),
        True,
        False,
    ),
    (
        "SouthOuter",
        (-12.5, -6.9, 14.5),
        (-0.1, -6.9, 14.5),
        False,
        True,
    ),
    (
        "WestOuter",
        (-12.5, -6.9, 14.5),
        (-12.5, 38.9, 14.5),
        True,
        True,
    ),
)

EXPECTED_OPEN_UNITS: dict[str, tuple[int, ...]] = {
    "F01_CourtyardNorth_Corridor_02": (3,),
    "F01_CourtyardWest_Corridor_02": (2,),
    "F01_CourtyardWest_Corridor_04": (2,),
    "F01_CourtyardWest_Corridor_05": (2,),
    "F01_North_Special_Room01_Set02": (1,),
    "F01_North_Special_Room02_Set01": (1,),
    "F01_North_Special_Room02_Set03": (2,),
    "F01_West_Ordinary_Room01": (4,),
    "F01_West_Special_01": (1,),
    "F02_CourtyardNorth_Corridor_01": (2,),
    "F02_CourtyardNorth_Corridor_02": (1,),
    "F02_CourtyardNorth_Corridor_03": (1,),
    "F02_CourtyardWest_Corridor_04": (2,),
    "F02_North_Broadcast_Set01": (2,),
    "F02_North_Special_Room03_Set02": (2,),
    "F02_North_Special_Room03_Set03": (1,),
    "F02_West_Ordinary_Room01": (2,),
    "F02_West_Ordinary_Room02": (1, 2, 3, 4),
    "F02_West_Ordinary_Room03": (1,),
    "F03_CourtyardNorth_Corridor_01": (3,),
    "F03_CourtyardNorth_Corridor_02": (4,),
    "F03_CourtyardNorth_Corridor_03": (3,),
    "F03_CourtyardWest_Corridor_01": (2,),
    "F03_CourtyardWest_Corridor_02": (2,),
    "F03_CourtyardWest_Corridor_04": (1,),
    "F03_North_Special_Room01_Set01": (1,),
    "F03_North_Special_Room02_Set01": (1, 2),
    "F03_North_Special_Room02_Set02": (1, 2),
    "F03_North_Special_Room02_Set03": (1, 2),
    "F03_West_Ordinary_Room01": (3,),
    "F03_West_Ordinary_Room02": (1,),
    "F04_CourtyardNorth_Corridor_01": (3,),
    "F04_CourtyardNorth_Corridor_02": (1,),
    "F04_CourtyardNorth_Corridor_03": (3,),
    "F04_CourtyardWest_Corridor_01": (2,),
    "F04_CourtyardWest_Corridor_03": (2,),
    "F04_CourtyardWest_Corridor_05": (1,),
    "F04_North_Special_Room02_Set01": (2,),
    "F04_North_Special_Room02_Set02": (1,),
    "F04_West_Ordinary_Room01": (4,),
    "F04_West_Ordinary_Room02": (2,),
    "F04_West_Ordinary_Room03": (1, 2, 3, 4),
    "Gym_East_01": (3,),
    "Gym_East_02": (1,),
    "Gym_East_03": (4,),
    "Gym_West_01": (4,),
    "Gym_West_02": (2,),
    "Gym_West_03": (1,),
}

SHORTENED_CONNECTION_WINDOW_SUFFIXES = {
    "F02_CourtyardNorth_Corridor_03",
    "F03_CourtyardNorth_Corridor_03",
}
SHORTENED_CONNECTION_WINDOW_PORTALS = {
    "F02_CourtyardNorth_Corridor_03": (
        ((39.4, 32.4, 3.6), (43.4, 32.6, 6.6)),
        "COL_HumanOnly_Window_F02_CourtyardNorth_Corridor_03_U01",
    ),
    "F03_CourtyardNorth_Corridor_03": (
        ((39.4, 32.4, 7.2), (43.4, 32.6, 9.6)),
        "COL_HumanOnly_Window_F03_CourtyardNorth_Corridor_03_U03",
    ),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def hs_properties(source: object) -> dict[str, object]:
    if isinstance(source, dict):
        return {
            key: value
            for key, value in source.items()
            if key.startswith("hs_")
        }
    return {
        key: source[key]
        for key in source.keys()
        if key.startswith("hs_")
    }


def properties_match(actual: object, expected: object) -> bool:
    if (
        isinstance(expected, (int, float))
        and not isinstance(expected, bool)
        and isinstance(actual, (int, float))
        and not isinstance(actual, bool)
    ):
        return abs(float(actual) - float(expected)) <= 1e-9
    return actual == expected


def require_exact_hs_properties(
    object_name: str,
    source: object,
    expected: dict[str, object],
) -> None:
    actual = hs_properties(source)
    require(
        set(actual) == set(expected),
        f"hs_* extrasのkeyが不正です: {object_name} / "
        f"actual={sorted(actual)} / expected={sorted(expected)}",
    )
    for key, expected_value in expected.items():
        require(
            properties_match(actual[key], expected_value),
            f"hs_* extrasの値が不正です: {object_name}.{key} / "
            f"actual={actual[key]!r} / expected={expected_value!r}",
        )


def rounded_position(
    x: float,
    y: float,
    z: float,
) -> tuple[float, float, float]:
    return (round(x, 9), round(y, 9), round(z, 9))


def expected_assembly_grid_positions(
    origin_x: float,
    origin_y: float,
    spacing: float,
    floor_z: float,
) -> list[tuple[float, float, float]]:
    return [
        rounded_position(
            origin_x + spacing * column,
            origin_y + spacing * row,
            floor_z,
        )
        for row in range(10)
        for column in range(10)
    ]


def expected_execution_audience_positions(
    center_x: float,
    center_y: float,
    floor_z: float,
) -> list[tuple[float, float, float]]:
    return [
        rounded_position(
            center_x + 9.0 * math.cos(math.tau * index / 94),
            center_y + 9.0 * math.sin(math.tau * index / 94),
            floor_z,
        )
        for index in range(94)
    ]


def expected_execution_target_positions(
    center_x: float,
    center_y: float,
    floor_z: float,
) -> list[tuple[float, float, float]]:
    return [
        rounded_position(
            center_x + x_offset,
            center_y + y_offset,
            floor_z,
        )
        for y_offset in (-0.45, 0.45)
        for x_offset in (-0.9, 0.0, 0.9)
    ]


def expected_assembly_anchor_properties(
    anchor_id: str,
    anchor_position: tuple[float, float, float],
    grid_spec: tuple[float, float, float],
) -> dict[str, object]:
    center_x, center_y, floor_z = anchor_position
    origin_x, origin_y, spacing = grid_spec
    return {
        "hs_id": anchor_id,
        "hs_role": "assembly_anchor",
        "hs_selection_weight": 1,
        "hs_assembly_positions_json": json.dumps(
            expected_assembly_grid_positions(
                origin_x,
                origin_y,
                spacing,
                floor_z,
            ),
            allow_nan=False,
            separators=(",", ":"),
        ),
        "hs_execution_audience_positions_json": json.dumps(
            expected_execution_audience_positions(
                center_x,
                center_y,
                floor_z,
            ),
            allow_nan=False,
            separators=(",", ":"),
        ),
        "hs_execution_target_positions_json": json.dumps(
            expected_execution_target_positions(
                center_x,
                center_y,
                floor_z,
            ),
            allow_nan=False,
            separators=(",", ":"),
        ),
    }


def require_finite_position_array_json(
    object_name: str,
    encoded: object,
    expected_length: int,
) -> list[list[float]]:
    require(isinstance(encoded, str), f"座標JSONが文字列ではありません: {object_name}")
    try:
        positions = json.loads(encoded)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"座標JSONを解析できません: {object_name}") from error
    actual_length = len(positions) if isinstance(positions, list) else -1
    require(
        isinstance(positions, list) and len(positions) == expected_length,
        f"座標JSONの要素数が不正です: {object_name} / {actual_length}",
    )
    require(
        all(
            isinstance(position, list)
            and len(position) == 3
            and all(
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and math.isfinite(value)
                for value in position
            )
            for position in positions
        ),
        f"座標JSONに有限値3要素以外があります: {object_name}",
    )
    return positions


def bit_flight_nav_properties(
    zone_id: str,
    band_id: str,
    space_kind: str,
    minimum_center_height: float,
    maximum_center_height: float,
    nav_role: str,
) -> dict[str, object]:
    return {
        "hs_nav_set": "bit-flight",
        "hs_nav_role": nav_role,
        "hs_zone_id": zone_id,
        "hs_band_id": band_id,
        "hs_space_kind": space_kind,
        "hs_center_height_min_m": minimum_center_height,
        "hs_center_height_max_m": maximum_center_height,
    }


def bit_flight_obstacle_name(zone_id: str, band_id: str) -> str:
    suffix = re.sub(r"[^A-Za-z0-9]+", "_", f"{zone_id}_{band_id}")
    return f"NAV_BitFlight_Obstacle_{suffix}"


def expected_aperture_endpoint_properties(
    link_id: str,
    endpoint: str,
) -> dict[str, object]:
    if link_id.startswith("bit-window-gym-"):
        outside_zone_id = "school-exterior"
        outside_band_id = "outdoor-f3"
        inside_zone_id = "school-gym"
        inside_band_id = "gym-upper"
    else:
        match = re.match(r"^bit-window-f0([1-4])-", link_id)
        require(match is not None, f"窓接続IDから階を特定できません: {link_id}")
        floor = int(match.group(1))
        outside_zone_id = "school-exterior"
        outside_band_id = f"outdoor-f{floor}"
        inside_zone_id = "school-interior"
        inside_band_id = f"interior-f{floor}"
    zone_id, band_id = (
        (outside_zone_id, outside_band_id)
        if endpoint == "A"
        else (inside_zone_id, inside_band_id)
    )
    return {
        "hs_id": link_id,
        "hs_transition_kind": "aperture",
        "hs_bidirectional": True,
        "hs_link_radius_m": BIT_FLIGHT_LINK_RADIUS_METERS,
        "hs_projection_distance_m": BIT_FLIGHT_PROJECTION_DISTANCE_METERS,
        "hs_affordances_json": json.dumps(
            EXPECTED_APERTURE_AFFORDANCES,
            separators=(",", ":"),
        ),
        "hs_zone_id": zone_id,
        "hs_band_id": band_id,
        "hs_endpoint": endpoint,
    }


def expected_stair_route_points(
    stair: str,
    base_z: float,
) -> list[tuple[float, float, float]]:
    points = [
        (-11.4, 39.8, base_z + 1.4),
        (-11.4, 43.1, base_z + 3.8),
        (-11.4, 44.0, base_z + 3.8),
        (-7.8, 44.0, base_z + 3.8),
        (-7.8, 43.1, base_z + 3.8),
        (-7.8, 40.0, base_z + 5.0),
    ]
    if stair == "NW":
        return points
    if stair == "NE":
        return [(x + 54.0, y, z) for x, y, z in points]
    if stair == "SW":
        return [(32.9 - y, x + 9.1, z) for x, y, z in points]
    raise RuntimeError(f"未定義の階段です: {stair}")


def expected_transition_properties(
    transition_id: str,
    transition_kind: str,
    from_zone_id: str,
    from_band_id: str,
    to_zone_id: str,
    to_band_id: str,
    affordances: tuple[str, ...],
    route_points: list[tuple[float, float, float]] | None = None,
) -> dict[str, object]:
    result: dict[str, object] = {
        "hs_id": transition_id,
        "hs_role": "bit_flight_transition",
        "hs_transition_kind": transition_kind,
        "hs_from_zone_id": from_zone_id,
        "hs_from_band_id": from_band_id,
        "hs_to_zone_id": to_zone_id,
        "hs_to_band_id": to_band_id,
        "hs_bidirectional": True,
        "hs_affordances_json": json.dumps(affordances, separators=(",", ":")),
        "hs_projection_distance_m": BIT_FLIGHT_PROJECTION_DISTANCE_METERS,
    }
    if route_points is not None:
        result["hs_route_points_json"] = json.dumps(
            route_points,
            separators=(",", ":"),
        )
    return result


def expected_bit_flight_transitions() -> dict[
    str,
    tuple[
        dict[str, object],
        tuple[tuple[float, float, float], tuple[float, float, float]],
    ],
]:
    result = {}
    for lower_floor, lower_center_minimum, upper_center_maximum in (
        (1, 1.0, 5.4),
        (2, 4.6, 9.0),
        (3, 8.2, 12.6),
    ):
        upper_floor = lower_floor + 1
        result[f"VOL_BitFlight_ExteriorF{lower_floor}ToF{upper_floor}"] = (
            expected_transition_properties(
                f"school-exterior-f{lower_floor}-f{upper_floor}",
                "vertical",
                "school-exterior",
                f"outdoor-f{lower_floor}",
                "school-exterior",
                f"outdoor-f{upper_floor}",
                ("search-vantage",),
            ),
            (
                (14.0, 12.0, lower_center_minimum),
                (22.0, 20.0, upper_center_maximum),
            ),
        )
    result["VOL_BitFlight_GymLowToUpper"] = (
        expected_transition_properties(
            "school-gym-low-upper",
            "vertical",
            "school-gym",
            "gym-low",
            "school-gym",
            "gym-upper",
            ("search-vantage",),
        ),
        ((41.0, 5.0, 1.0), (49.0, 12.0, 5.4)),
    )
    transitions_by_stair = {
        "NW": (
            (1, "school-interior", "interior-f2"),
            (2, "school-interior", "interior-f3"),
            (3, "school-interior", "interior-f4"),
            (4, "school-rooftop", "roof-flight"),
        ),
        "NE": (
            (1, "school-interior", "interior-f2"),
            (2, "school-interior", "interior-f3"),
            (3, "school-interior", "interior-f4"),
        ),
        "SW": (
            (1, "school-interior", "interior-f2"),
            (2, "school-interior", "interior-f3"),
            (3, "school-interior", "interior-f4"),
        ),
    }
    for stair, transitions in transitions_by_stair.items():
        for lower_floor, to_zone_id, to_band_id in transitions:
            base_z = (lower_floor - 1) * 3.6
            route_points = expected_stair_route_points(stair, base_z)
            object_name = (
                f"VOL_BitFlight_Stair{stair}F{lower_floor}To"
                + (
                    "Roof"
                    if to_zone_id == "school-rooftop"
                    else f"F{lower_floor + 1}"
                )
            )
            transition_id = (
                f"school-stair-{stair.lower()}-f{lower_floor}-"
                + (
                    "roof"
                    if to_zone_id == "school-rooftop"
                    else f"f{lower_floor + 1}"
                )
            )
            minimum_x = (
                min(point[0] for point in route_points)
                - BIT_FLIGHT_PROJECTION_DISTANCE_METERS
            )
            maximum_x = (
                max(point[0] for point in route_points)
                + BIT_FLIGHT_PROJECTION_DISTANCE_METERS
            )
            minimum_y = (
                min(point[1] for point in route_points)
                - BIT_FLIGHT_PROJECTION_DISTANCE_METERS
            )
            maximum_y = (
                max(point[1] for point in route_points)
                + BIT_FLIGHT_PROJECTION_DISTANCE_METERS
            )
            result[object_name] = (
                expected_transition_properties(
                    transition_id,
                    "surface-route",
                    "school-interior",
                    f"interior-f{lower_floor}",
                    to_zone_id,
                    to_band_id,
                    ("stair-route",),
                    route_points,
                ),
                (
                    (minimum_x, minimum_y, base_z + 0.2),
                    (maximum_x, maximum_y, base_z + 5.2),
                ),
            )
    rooftop_route_points = [
        (48.4, 34.8, 12.2),
        (48.4, 34.8, 16.25),
        (46.1, 34.8, 16.25),
        (46.1, 34.8, 15.4),
    ]
    result["VOL_BitFlight_ExteriorF4ToRooftop"] = (
        expected_transition_properties(
            "school-exterior-f4-rooftop",
            "boundary",
            "school-exterior",
            "outdoor-f4",
            "school-rooftop",
            "roof-flight",
            ("search-vantage", "outdoor-access"),
            rooftop_route_points,
        ),
        ((45.8, 33.8, 11.8), (48.7, 35.8, 16.8)),
    )
    return result


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def audit_box_components(
    object_name: str,
    expected: list[tuple[tuple[float, float, float], tuple[float, float, float]]],
) -> int:
    obj = bpy.data.objects.get(object_name)
    require(obj is not None and obj.type == "MESH", f"箱形状監査対象がありません: {object_name}")
    actual = box_component_bounds(obj)
    require(
        len(actual) == len(expected),
        f"箱形状監査対象の部品数が不正です: {object_name}/{len(actual)}",
    )
    unmatched_actual = list(actual)
    for expected_bounds in expected:
        matching_index = next(
            (
                index
                for index, actual_bounds in enumerate(unmatched_actual)
                if bounds_match(actual_bounds, expected_bounds)
            ),
            None,
        )
        require(
            matching_index is not None,
            f"箱形状監査対象の位置が不正です: {object_name}/{expected_bounds}",
        )
        unmatched_actual.pop(matching_index)
    require(
        not unmatched_actual,
        f"箱形状監査対象に未照合部品があります: {object_name}/{unmatched_actual}",
    )
    return len(actual)


def box_component_bounds(
    obj: bpy.types.Object,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    require(
        len(obj.data.vertices) % 8 == 0,
        f"箱形状監査対象の頂点数が8の倍数ではありません: {obj.name}/{len(obj.data.vertices)}",
    )
    actual = []
    for offset in range(0, len(obj.data.vertices), 8):
        points = [
            obj.matrix_world @ obj.data.vertices[offset + index].co
            for index in range(8)
        ]
        actual.append(
            (
                tuple(min(point[axis] for point in points) for axis in range(3)),
                tuple(max(point[axis] for point in points) for axis in range(3)),
            )
        )
    return actual


def mesh_component_world_bounds(
    obj: bpy.types.Object,
) -> list[tuple[Vector, Vector]]:
    vertex_count = len(obj.data.vertices)
    parents = list(range(vertex_count))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(first: int, second: int) -> None:
        first_root = find(first)
        second_root = find(second)
        if first_root != second_root:
            parents[second_root] = first_root

    for edge in obj.data.edges:
        union(edge.vertices[0], edge.vertices[1])

    vertices_by_root: dict[int, list[int]] = {}
    for index in range(vertex_count):
        vertices_by_root.setdefault(find(index), []).append(index)

    result = []
    for indices in vertices_by_root.values():
        points = [
            obj.matrix_world @ obj.data.vertices[index].co
            for index in indices
        ]
        result.append(
            (
                Vector(
                    tuple(
                        min(point[axis] for point in points)
                        for axis in range(3)
                    )
                ),
                Vector(
                    tuple(
                        max(point[axis] for point in points)
                        for axis in range(3)
                    )
                ),
            )
        )
    return result


def is_broad_horizontal_support(
    minimum: Vector,
    maximum: Vector,
) -> bool:
    extent = maximum - minimum
    return extent.z <= 0.5 and extent.x >= 2.0 and extent.y >= 2.0


def is_bit_flight_support_collider_name(name: str) -> bool:
    return (
        "Floor" in name
        or "Ceiling" in name
        or "Ground" in name
        or "Ramp" in name
        or "Landing" in name
        or "RaisedDeck" in name
        or name.startswith("COL_Roof_")
    )


def is_bit_flight_obstacle_exempt_collider_name(name: str) -> bool:
    return name == "COL_B03_GymGalleryGuards"


def has_dynamic_spatial_ancestor(obj: bpy.types.Object) -> bool:
    ancestor = obj.parent
    while ancestor is not None:
        if ancestor.get("hs_role") in {
            "room_variant",
            "door_panel",
            "elevator_car",
        }:
            return True
        ancestor = ancestor.parent
    return False


def expected_bit_flight_obstacle_bounds(
    objects_by_name: dict[str, bpy.types.Object],
    zone_id: str,
    band_id: str,
    center_height: float,
) -> list[
    tuple[tuple[float, float, float], tuple[float, float, float]]
]:
    colliders = tuple(
        sorted(
            (
                obj
                for obj in objects_by_name.values()
                if obj.type == "MESH"
                and obj.name.startswith("COL_")
                and not obj.name.startswith("COL_HumanOnly_")
                and not obj.name.startswith("COL_BeamSightOnly_")
                and not has_dynamic_spatial_ancestor(obj)
                and not is_bit_flight_support_collider_name(obj.name)
                and not is_bit_flight_obstacle_exempt_collider_name(obj.name)
            ),
            key=lambda obj: obj.name,
        )
    )
    obstacle_boxes = []
    for collider in colliders:
        for minimum, maximum in mesh_component_world_bounds(collider):
            if (
                minimum.z - BIT_FLIGHT_SAFETY_ENVELOPE_METERS
                > center_height
                or maximum.z + BIT_FLIGHT_SAFETY_ENVELOPE_METERS
                < center_height
                or is_broad_horizontal_support(minimum, maximum)
            ):
                continue
            minimum_x = minimum.x
            maximum_x = maximum.x
            minimum_y = minimum.y
            maximum_y = maximum.y
            if maximum_x - minimum_x < 0.02:
                center_x = (minimum_x + maximum_x) / 2.0
                minimum_x = center_x - 0.01
                maximum_x = center_x + 0.01
            if maximum_y - minimum_y < 0.02:
                center_y = (minimum_y + maximum_y) / 2.0
                minimum_y = center_y - 0.01
                maximum_y = center_y + 0.01
            obstacle_boxes.append(
                (
                    (
                        minimum_x,
                        minimum_y,
                        center_height
                        - BIT_FLIGHT_BLOCKER_HALF_HEIGHT_METERS,
                    ),
                    (
                        maximum_x,
                        maximum_y,
                        center_height
                        + BIT_FLIGHT_BLOCKER_HALF_HEIGHT_METERS,
                    ),
                )
            )
    if zone_id == "school-exterior":
        for object_name in (
            "COL_Floor_WestWing",
            "COL_Floor_NorthWing",
            "COL_Floor_Gym",
            "COL_Floor_GymStorage",
        ):
            if band_id == "outdoor-f4" and object_name == "COL_Floor_Gym":
                continue
            exclusion_source = objects_by_name.get(object_name)
            require(
                exclusion_source is not None
                and exclusion_source.type == "MESH",
                f"外部飛行ゾーン除外元がありません: {object_name}",
            )
            for minimum, maximum in mesh_component_world_bounds(
                exclusion_source
            ):
                obstacle_boxes.append(
                    (
                        (
                            minimum.x,
                            minimum.y,
                            center_height
                            - BIT_FLIGHT_BLOCKER_HALF_HEIGHT_METERS,
                        ),
                        (
                            maximum.x,
                            maximum.y,
                            center_height
                            + BIT_FLIGHT_BLOCKER_HALF_HEIGHT_METERS,
                        ),
                    )
                )
    return obstacle_boxes


def audit_bit_flight_obstacle_geometry(
    object_name: str,
    expected: list[
        tuple[tuple[float, float, float], tuple[float, float, float]]
    ],
) -> int:
    obj = bpy.data.objects.get(object_name)
    require(
        obj is not None and obj.type == "MESH",
        f"ビット用blocker形状監査対象がありません: {object_name}",
    )
    actual = box_component_bounds(obj)
    require(
        len(actual) == len(expected),
        f"ビット用blocker部品数が不正です: "
        f"{object_name}/{len(actual)} != {len(expected)}",
    )
    for component_index, (actual_bounds, expected_bounds) in enumerate(
        zip(actual, expected)
    ):
        require(
            bounds_match(actual_bounds, expected_bounds),
            f"ビット用blocker形状が基準面の0.54m包絡と不一致です: "
            f"{object_name}/component={component_index}",
        )
    return len(actual)


def bounds_match(
    actual: tuple[tuple[float, float, float], tuple[float, float, float]],
    expected: tuple[tuple[float, float, float], tuple[float, float, float]],
) -> bool:
    return all(
        abs(actual[bound][axis] - expected[bound][axis]) <= 1e-5
        for bound in range(2)
        for axis in range(3)
    )


def surface_signature(
    points: tuple[tuple[float, float, float], ...] | list[Vector],
) -> tuple[tuple[float, float, float], ...]:
    return tuple(
        sorted(
            tuple(
                round(float(point[axis]) / TOLERANCE) * TOLERANCE
                for axis in range(3)
            )
            for point in points
        )
    )


def sloped_surface_signatures(
    obj: bpy.types.Object,
) -> set[tuple[tuple[float, float, float], ...]]:
    signatures = set()
    for polygon in obj.data.polygons:
        if len(polygon.vertices) != 4:
            continue
        points = [
            obj.matrix_world @ obj.data.vertices[index].co
            for index in polygon.vertices
        ]
        if max(point.z for point in points) - min(point.z for point in points) <= TOLERANCE:
            continue
        normal = obj.matrix_world.to_3x3() @ polygon.normal
        if abs(normal.z) <= 0.1:
            continue
        signatures.add(surface_signature(points))
    return signatures


def expected_linear_guard_component_bounds(
    start_coordinates: tuple[float, float, float],
    end_coordinates: tuple[float, float, float],
    include_start_post: bool,
    include_end_post: bool,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    start = Vector(start_coordinates)
    end = Vector(end_coordinates)
    direction = end - start
    horizontal_length = math.hypot(direction.x, direction.y)
    require(horizontal_length > 0.3, "屋上柵線分が短すぎます")
    side = Vector(
        (-direction.y / horizontal_length, direction.x / horizontal_length, 0.0)
    ) * 0.05
    result = []
    for rail_height in (0.55, 1.0):
        vertical = Vector((0.0, 0.0, rail_height))
        half_height = Vector((0.0, 0.0, 0.05))
        points = [
            point + offset + vertical + z_offset
            for point in (start, end)
            for offset in (side, -side)
            for z_offset in (half_height, -half_height)
        ]
        result.append(
            (
                tuple(min(point[axis] for point in points) for axis in range(3)),
                tuple(max(point[axis] for point in points) for axis in range(3)),
            )
        )

    post_count = max(1, math.ceil(horizontal_length / 1.1))
    for index in range(post_count + 1):
        if index == 0 and not include_start_post:
            continue
        if index == post_count and not include_end_post:
            continue
        base = start + direction * (index / post_count)
        result.append(
            (
                (base.x - 0.05, base.y - 0.05, base.z),
                (base.x + 0.05, base.y + 0.05, base.z + 1.05),
            )
        )
    return result


def require_box_component(
    object_name: str,
    expected: tuple[tuple[float, float, float], tuple[float, float, float]],
) -> None:
    obj = bpy.data.objects.get(object_name)
    require(obj is not None and obj.type == "MESH", f"箱形状監査対象がありません: {object_name}")
    require(
        any(bounds_match(actual, expected) for actual in box_component_bounds(obj)),
        f"必要な箱形状がありません: {object_name}/{expected}",
    )


def require_point_in_box_component(
    object_name: str,
    point: tuple[float, float, float],
) -> None:
    obj = bpy.data.objects.get(object_name)
    require(obj is not None and obj.type == "MESH", f"箱形状監査対象がありません: {object_name}")
    require(
        any(
            all(minimum[axis] - 1e-5 <= point[axis] <= maximum[axis] + 1e-5 for axis in range(3))
            for minimum, maximum in box_component_bounds(obj)
        ),
        f"指定点を覆う箱形状がありません: {object_name}/{point}",
    )


def require_architecture_swatch(object_name: str, swatch: str) -> None:
    obj = bpy.data.objects.get(object_name)
    require(obj is not None and obj.type == "MESH", f"配色監査対象がありません: {object_name}")
    uv_layer = obj.data.uv_layers.get("UVMap")
    require(uv_layer is not None, f"配色監査対象にUVがありません: {object_name}")
    expected_coordinates = swatch_uv("Architecture", swatch)
    minimum_u = min(coordinate[0] for coordinate in expected_coordinates)
    maximum_u = max(coordinate[0] for coordinate in expected_coordinates)
    minimum_v = min(coordinate[1] for coordinate in expected_coordinates)
    maximum_v = max(coordinate[1] for coordinate in expected_coordinates)
    require(
        all(
            minimum_u - 1e-6 <= loop.uv.x <= maximum_u + 1e-6
            and minimum_v - 1e-6 <= loop.uv.y <= maximum_v + 1e-6
            for loop in uv_layer.data
        ),
        f"Architecture Atlasの配色が不正です: {object_name}/{swatch}",
    )


def require_furniture_swatch(object_name: str, swatch: str) -> None:
    obj = bpy.data.objects.get(object_name)
    require(obj is not None and obj.type == "MESH", f"配色監査対象がありません: {object_name}")
    material_names = [
        material.name
        for material in obj.data.materials
        if material is not None
    ]
    expected_material = str(ATLAS_DEFINITIONS["FurnitureProps"]["material"])
    require(
        material_names == [expected_material],
        f"FurnitureProps Atlasの材質参照が不正です: "
        f"{object_name}/{material_names}",
    )
    uv_layer = obj.data.uv_layers.get("UVMap")
    require(uv_layer is not None, f"配色監査対象にUVがありません: {object_name}")
    expected_coordinates = swatch_uv("FurnitureProps", swatch)
    minimum_u = min(coordinate[0] for coordinate in expected_coordinates)
    maximum_u = max(coordinate[0] for coordinate in expected_coordinates)
    minimum_v = min(coordinate[1] for coordinate in expected_coordinates)
    maximum_v = max(coordinate[1] for coordinate in expected_coordinates)
    require(
        all(
            minimum_u - 1e-6 <= loop.uv.x <= maximum_u + 1e-6
            and minimum_v - 1e-6 <= loop.uv.y <= maximum_v + 1e-6
            for loop in uv_layer.data
        ),
        f"FurnitureProps Atlasの配色が不正です: {object_name}/{swatch}",
    )


def audit_architecture_atlas_rgb() -> int:
    image = bpy.data.images.get("b03_architecture_atlas.png")
    require(image is not None, "Architecture Atlas画像がBlender正本にありません")
    require(tuple(image.size) == (512, 512), "Architecture Atlas画像寸法が不正です")
    expected_cells = {
        (0, 0): (214, 210, 197),
        (1, 0): (232, 231, 221),
        (3, 0): (176, 145, 101),
        (1, 1): (120, 76, 42),
        (2, 2): (51, 107, 51),
        (3, 2): (46, 97, 173),
        (0, 3): (117, 38, 26),
        (1, 3): (92, 117, 98),
        (2, 3): (72, 78, 79),
    }
    width, height = image.size
    for (column, row_from_top), expected in expected_cells.items():
        x = column * width // 4 + width // 8
        y = (3 - row_from_top) * height // 4 + height // 8
        pixel_offset = (y * width + x) * 4
        actual = tuple(
            round(float(image.pixels[pixel_offset + channel]) * 255)
            for channel in range(3)
        )
        require(
            all(actual[channel] in {expected[channel], expected[channel] + 1} for channel in range(3)),
            f"Architecture AtlasのRGBが不正です: cell=({column},{row_from_top}), actual={actual}, expected={expected}",
        )
    return len(expected_cells)


def audit_door_hardware_atlas_rgb() -> int:
    swatch_names = list(ATLAS_DEFINITIONS["FurnitureProps"]["swatches"])
    require(
        swatch_names.index("door_hardware_yellow") == 12,
        "扉金物色がFurnitureProps Atlasの未使用13番セルではありません",
    )
    image = bpy.data.images.get("b03_furniture_props_atlas.png")
    require(image is not None, "FurnitureProps Atlas画像がBlender正本にありません")
    require(tuple(image.size) == (512, 512), "FurnitureProps Atlas画像寸法が不正です")
    column = 0
    row_from_top = 3
    expected = (181, 153, 74)
    width, height = image.size
    x = column * width // 4 + width // 8
    y = (3 - row_from_top) * height // 4 + height // 8
    pixel_offset = (y * width + x) * 4
    actual = tuple(
        round(float(image.pixels[pixel_offset + channel]) * 255)
        for channel in range(3)
    )
    require(
        all(
            actual[channel] in {expected[channel], expected[channel] + 1}
            for channel in range(3)
        ),
        f"扉金物用FurnitureProps AtlasのRGBが不正です: "
        f"cell=({column},{row_from_top}), actual={actual}, expected={expected}",
    )
    return 1


def audit_consolidated_materials() -> int:
    actual_material_names = {material.name for material in bpy.data.materials}
    require(
        actual_material_names == EXPECTED_CONSOLIDATED_MATERIAL_NAMES,
        f"最終材質が6種類へ統合されていません: "
        f"{sorted(actual_material_names)}",
    )
    return len(actual_material_names)


def audit_packed_atlas_paths() -> int:
    for image_name, expected_path in EXPECTED_PACKED_ATLAS_PATHS.items():
        image = bpy.data.images.get(image_name)
        require(image is not None, f"Atlas Imageがありません: {image_name}")
        require(image.packed_file is not None, f"Atlasがpackされていません: {image_name}")
        require(
            image.filepath.startswith("//"),
            f"Atlas filepathがリポジトリ相対ではありません: {image_name}",
        )
        require(
            image.filepath_raw.startswith("//"),
            f"Atlas filepath_rawがリポジトリ相対ではありません: {image_name}",
        )
        require(
            Path(bpy.path.abspath(image.filepath)).resolve()
            == expected_path.resolve(),
            f"Atlas filepathの参照先が不正です: {image_name}",
        )
        require(
            Path(bpy.path.abspath(image.filepath_raw)).resolve()
            == expected_path.resolve(),
            f"Atlas filepath_rawの参照先が不正です: {image_name}",
        )
    return len(EXPECTED_PACKED_ATLAS_PATHS)


def expected_band_segments(
    minimum: float,
    maximum: float,
    openings: tuple[tuple[float, float], ...],
) -> list[tuple[float, float]]:
    segments = []
    cursor = minimum
    for opening_minimum, opening_maximum in sorted(openings):
        clipped_minimum = max(minimum, opening_minimum)
        clipped_maximum = min(maximum, opening_maximum)
        if clipped_minimum > cursor:
            segments.append((cursor, clipped_minimum))
        cursor = max(cursor, clipped_maximum)
    if cursor < maximum:
        segments.append((cursor, maximum))
    return segments


def expanded_openings(
    openings: tuple[tuple[float, float], ...],
) -> tuple[tuple[float, float], ...]:
    return tuple(
        (
            minimum - DOOR_OPENING_MARGIN,
            maximum + DOOR_OPENING_MARGIN,
        )
        for minimum, maximum in openings
    )


def expected_storey_band_boxes(
    floor: int,
    base_z: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    west_classroom_openings = expanded_openings(
        FIRST_FLOOR_WEST_DOOR_OPENINGS
        if floor == 1
        else UPPER_WEST_CLASSROOM_DOOR_OPENINGS
    )
    west_entry_openings = (
        expanded_openings(((-2.5, 2.5),)) if floor == 1 else ()
    )
    north_classroom_openings = expanded_openings(
        (TOILET_COMMON_OPENING,) + NORTH_CLASSROOM_DOOR_OPENINGS
    )
    if floor == 1:
        north_entry_openings = expanded_openings(((0.15, 5.4), (39.4, 43.4)))
    elif floor in (2, 3):
        north_entry_openings = expanded_openings(((39.4, 43.4),))
    else:
        north_entry_openings = ()
    z0, z1 = base_z + 0.15, base_z + 0.25
    boxes = [
        ((-3.351, start, z0), (-3.347, end, z1))
        for start, end in expected_band_segments(2.5, 32.5, west_classroom_openings)
    ]
    boxes.extend(
        ((-0.153, start, z0), (-0.149, end, z1))
        for start, end in expected_band_segments(-3.5, 32.5, west_entry_openings)
    )
    boxes.extend(
        ((start, 36.347, z0), (end, 36.351, z1))
        for start, end in expected_band_segments(-6.6, 41.4, north_classroom_openings)
    )
    boxes.extend(
        ((start, 32.649, z0), (end, 32.653, z1))
        for start, end in expected_band_segments(0.0, 47.4, north_entry_openings)
    )
    boxes.extend(
        (
            ((-6.6, 38.347, z0), (-5.41, 38.351, z1)),
            ((-4.19, 38.347, z0), (-0.91, 38.351, z1)),
            ((0.31, 38.347, z0), (2.4, 38.351, z1)),
            ((2.549, 38.5, z0), (2.553, 45.5, z1)),
            ((5.247, 36.5, z0), (5.251, 45.5, z1)),
            ((-6.753, 38.5, z0), (-6.749, 45.5, z1)),
            ((41.549, 36.5, z0), (41.553, 45.5, z1)),
            ((-12.6, 2.347, z0), (-3.5, 2.351, z1)),
            ((-12.6, 32.649, z0), (-6.6, 32.653, z1)),
        )
    )
    return boxes


def expected_oriented_box(
    axis: str,
    primary_minimum: float,
    primary_maximum: float,
    cross_minimum: float,
    cross_maximum: float,
    z_minimum: float,
    z_maximum: float,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    if axis == "X":
        return (
            (primary_minimum, cross_minimum, z_minimum),
            (primary_maximum, cross_maximum, z_maximum),
        )
    if axis == "Y":
        return (
            (cross_minimum, primary_minimum, z_minimum),
            (cross_maximum, primary_maximum, z_maximum),
        )
    raise RuntimeError(f"未定義の水平軸です: {axis}")


def expected_gate_fence_boxes(
    axis: str,
    primary_minimum: float,
    primary_maximum: float,
    fixed: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    center = (primary_minimum + primary_maximum) / 2.0
    boxes = [
        expected_oriented_box(
            axis,
            post_center - 0.05,
            post_center + 0.05,
            fixed - 0.05,
            fixed + 0.05,
            -0.3,
            1.7,
        )
        for post_center in (primary_minimum + 0.05, center, primary_maximum - 0.05)
    ]
    leaves = (
        (primary_minimum + 0.10, center - 0.05),
        (center + 0.05, primary_maximum - 0.10),
    )
    for leaf_minimum, leaf_maximum in leaves:
        for z_minimum, z_maximum in (
            (-0.28, -0.20),
            (0.66, 0.74),
            (1.62, 1.70),
        ):
            boxes.append(
                expected_oriented_box(
                    axis,
                    leaf_minimum,
                    leaf_maximum,
                    fixed - 0.04,
                    fixed + 0.04,
                    z_minimum,
                    z_maximum,
                )
            )
        interval_count = math.ceil((leaf_maximum - leaf_minimum) / 0.5)
        for index in range(1, interval_count):
            position = (
                leaf_minimum
                + (leaf_maximum - leaf_minimum) * index / interval_count
            )
            boxes.append(
                expected_oriented_box(
                    axis,
                    position - 0.04,
                    position + 0.04,
                    fixed - 0.04,
                    fixed + 0.04,
                    -0.20,
                    1.62,
                )
            )
    boxes.append(
        expected_oriented_box(
            axis,
            center - 0.12,
            center + 0.12,
            fixed - 0.06,
            fixed + 0.06,
            0.62,
            0.78,
        )
    )
    return boxes


def point_in_bounds(
    point: tuple[float, float, float],
    bounds: tuple[tuple[float, float, float], tuple[float, float, float]],
) -> bool:
    minimum, maximum = bounds
    return all(
        minimum[axis] - TOLERANCE <= point[axis] <= maximum[axis] + TOLERANCE
        for axis in range(3)
    )


def interval_overlaps(
    left: tuple[float, float],
    right: tuple[float, float],
) -> bool:
    return max(left[0], right[0]) < min(left[1], right[1]) - TOLERANCE


def interval_union_covers(
    target: tuple[float, float],
    intervals: list[tuple[float, float]],
) -> bool:
    cursor = target[0]
    for minimum, maximum in sorted(intervals):
        clipped_minimum = max(target[0], minimum)
        clipped_maximum = min(target[1], maximum)
        if clipped_maximum <= cursor + TOLERANCE:
            continue
        if clipped_minimum > cursor + TOLERANCE:
            return False
        cursor = max(cursor, clipped_maximum)
        if cursor >= target[1] - TOLERANCE:
            return True
    return cursor >= target[1] - TOLERANCE


def audit_storey_band_relationships(
    objects: list[bpy.types.Object],
) -> dict[str, int]:
    wall_components = [
        bounds
        for obj in objects
        if obj.type == "MESH"
        and obj.name.startswith("VIS_")
        and (
            "Wall" in obj.name
            or "_InteriorWalls_" in obj.name
            or "_ExteriorWalls_" in obj.name
            or (
                obj.name.startswith("VIS_B03_Interior_")
                and obj.name.endswith("_Architecture")
            )
        )
        and len(obj.data.vertices) % 8 == 0
        for bounds in box_component_bounds(obj)
    ]
    backing_checks = 0
    opening_checks = 0
    band_depth_checks = 0
    depth_checks = 0
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        band_name = f"VIS_B03_StoreyBand_F{floor:02d}"
        band = bpy.data.objects.get(band_name)
        require(band is not None and band.type == "MESH", f"階色帯がありません: {band_name}")
        components = box_component_bounds(band)
        expected_component_count = 24 if floor in (1, 2, 3) else 23
        require(
            len(components) == expected_component_count,
            f"階色帯の成分数が不正です: {band_name}/{len(components)}",
        )
        for minimum, maximum in components:
            if abs(minimum[0] + 3.351) <= TOLERANCE:
                normal_axis, projected_axis = 0, 1
                wall_face, outward_sign = -3.35, 1
                projected_interval = (minimum[1], maximum[1])
                openings = (
                    FIRST_FLOOR_WEST_DOOR_OPENINGS
                    if floor == 1
                    else UPPER_WEST_CLASSROOM_DOOR_OPENINGS
                )
            elif abs(minimum[0] + 0.153) <= TOLERANCE:
                normal_axis, projected_axis = 0, 1
                wall_face, outward_sign = -0.15, -1
                projected_interval = (minimum[1], maximum[1])
                openings = ((-2.5, 2.5),) if floor == 1 else ()
            elif abs(minimum[1] - 36.347) <= TOLERANCE:
                normal_axis, projected_axis = 1, 0
                wall_face, outward_sign = 36.35, -1
                projected_interval = (minimum[0], maximum[0])
                openings = (TOILET_COMMON_OPENING,) + NORTH_CLASSROOM_DOOR_OPENINGS
            elif abs(minimum[1] - 32.649) <= TOLERANCE:
                normal_axis, projected_axis = 1, 0
                wall_face, outward_sign = 32.65, 1
                projected_interval = (minimum[0], maximum[0])
                openings = ((0.15, 5.4), (39.4, 43.4)) if floor == 1 else ()
            elif abs(minimum[1] - 38.347) <= TOLERANCE:
                normal_axis, projected_axis = 1, 0
                wall_face, outward_sign = 38.35, -1
                projected_interval = (minimum[0], maximum[0])
                openings = TOILET_FRONT_DOOR_OPENINGS
            elif abs(minimum[0] - 2.549) <= TOLERANCE:
                normal_axis, projected_axis = 0, 1
                wall_face, outward_sign = 2.55, 1
                projected_interval = (minimum[1], maximum[1])
                openings = ()
            elif abs(minimum[0] - 5.247) <= TOLERANCE:
                normal_axis, projected_axis = 0, 1
                wall_face, outward_sign = 5.25, -1
                projected_interval = (minimum[1], maximum[1])
                openings = ()
            elif abs(minimum[0] + 6.753) <= TOLERANCE:
                normal_axis, projected_axis = 0, 1
                wall_face, outward_sign = -6.75, -1
                projected_interval = (minimum[1], maximum[1])
                openings = ()
            elif abs(minimum[0] - 41.549) <= TOLERANCE:
                normal_axis, projected_axis = 0, 1
                wall_face, outward_sign = 41.55, 1
                projected_interval = (minimum[1], maximum[1])
                openings = ()
            elif abs(minimum[1] - 2.347) <= TOLERANCE:
                normal_axis, projected_axis = 1, 0
                wall_face, outward_sign = 2.35, -1
                projected_interval = (minimum[0], maximum[0])
                openings = ()
            else:
                raise RuntimeError(f"階色帯の壁面位置が不正です: {band_name}/{minimum}/{maximum}")

            supporting_walls = []
            for wall_minimum, wall_maximum in wall_components:
                candidate_face = (
                    wall_minimum[normal_axis]
                    if outward_sign < 0
                    else wall_maximum[normal_axis]
                )
                if abs(candidate_face - wall_face) > TOLERANCE:
                    continue
                if (
                    wall_minimum[2] > minimum[2] + TOLERANCE
                    or wall_maximum[2] < maximum[2] - TOLERANCE
                ):
                    continue
                supporting_walls.append(
                    (
                        wall_minimum[projected_axis],
                        wall_maximum[projected_axis],
                        candidate_face,
                    )
                )
            require(
                interval_union_covers(
                    projected_interval,
                    [
                        (wall_minimum, wall_maximum)
                        for wall_minimum, wall_maximum, _ in supporting_walls
                    ],
                ),
                f"階色帯の全区間を同一壁面が支持していません: {band_name}/{wall_face}/{projected_interval}/{supporting_walls}",
            )
            backing_checks += 1

            actual_wall_face = supporting_walls[0][2]
            require(
                all(
                    abs(candidate_face - actual_wall_face) <= TOLERANCE
                    for _, _, candidate_face in supporting_walls
                ),
                f"階色帯の支持壁面が共面ではありません: {band_name}/{supporting_walls}",
            )
            if outward_sign < 0:
                embedded_depth = maximum[normal_axis] - actual_wall_face
                protruding_depth = actual_wall_face - minimum[normal_axis]
            else:
                embedded_depth = actual_wall_face - minimum[normal_axis]
                protruding_depth = maximum[normal_axis] - actual_wall_face
            require(
                abs(embedded_depth - 0.001) <= TOLERANCE
                and abs(protruding_depth - 0.003) <= TOLERANCE,
                f"階色帯の壁埋込みまたは廊下突出量が不正です: {band_name}/{embedded_depth}/{protruding_depth}",
            )
            band_depth_checks += 1
            for opening_minimum, opening_maximum in expanded_openings(openings):
                require(
                    not interval_overlaps(
                        projected_interval,
                        (opening_minimum, opening_maximum),
                    ),
                    f"階色帯が出入口へ重なっています: {band_name}/{projected_interval}/{(opening_minimum, opening_maximum)}",
                )
                opening_checks += 1

        expected_door_count = 8 if floor == 1 else 10
        floor_room_doors = [
            obj
            for obj in objects
            if obj.get("hs_role") == "door"
            and obj.get("hs_door_class") == "room"
            and abs(obj.matrix_world.translation.z - base_z) <= TOLERANCE
        ]
        require(
            len(floor_room_doors) == expected_door_count,
            f"{floor}階のB03-3C室内引き戸数が不正です: {len(floor_room_doors)}",
        )
        depth_checks += len(floor_room_doors)

    return {
        "backing_checks": backing_checks,
        "opening_checks": opening_checks,
        "band_depth_checks": band_depth_checks,
        "door_depth_checks": depth_checks,
    }


def audit_classroom_openings_and_boundaries() -> dict[str, int]:
    opening_checks = 0
    divider_checks = 0
    special_door_checks = 0
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        wall_names = (
            f"VIS_B03_InteriorWalls_F{floor:02d}",
            f"COL_B03_InteriorWalls_F{floor:02d}",
        )
        wall_top = base_z + 3.0
        for wall_name in wall_names:
            wall = bpy.data.objects.get(wall_name)
            require(wall is not None and wall.type == "MESH", f"上階内壁がありません: {wall_name}")
            components = box_component_bounds(wall)
            for sample_x in (-5.5, -3.0, 0.0, 3.0, 5.0):
                require(
                    not any(
                        point_in_bounds((sample_x, 36.5, base_z + 1.5), bounds)
                        for bounds in components
                    ),
                    f"トイレ正面の全面開放部に壁があります: {wall_name}/{sample_x}",
                )
                opening_checks += 1
            for opening_minimum, opening_maximum in UPPER_WEST_CLASSROOM_DOOR_OPENINGS:
                opening_center = (opening_minimum + opening_maximum) / 2
                require(
                    not any(
                        point_in_bounds((-3.5, opening_center, base_z + 1.15), bounds)
                        for bounds in components
                    ),
                    f"普通教室の正規開口が壁で塞がっています: {wall_name}/{(opening_minimum, opening_maximum)}",
                )
                for adjacent_y in (opening_minimum - 0.02, opening_maximum + 0.02):
                    require(
                        any(
                            point_in_bounds((-3.5, adjacent_y, base_z + 1.15), bounds)
                            for bounds in components
                        ),
                        f"普通教室開口脇の壁が欠けています: {wall_name}/{adjacent_y}",
                    )
                require(
                    any(
                        point_in_bounds((-3.5, opening_center, base_z + 2.65), bounds)
                        for bounds in components
                    ),
                    f"普通教室開口上の壁が欠けています: {wall_name}/{opening_center}",
                )
                opening_checks += 4
            for divider_y in (12.5, 22.5):
                require_box_component(
                    wall_name,
                    (
                        (-12.6, divider_y - 0.15, base_z),
                        (-3.5, divider_y + 0.15, wall_top),
                    ),
                )
                divider_checks += 1

        floor_room_doors = [
            obj
            for obj in bpy.data.objects
            if obj.get("hs_role") == "door"
            and obj.get("hs_door_class") == "room"
            and abs(obj.matrix_world.translation.z - base_z) <= TOLERANCE
        ]
        require(
            len(floor_room_doors) == 10,
            f"{floor}階のB03-3C室内引き戸が10件ではありません",
        )
        special_door_checks += 1

    first_floor_special_door = next(
        (
            obj
            for obj in bpy.data.objects
            if obj.get("hs_id") == "room-door-f01-pc-room-02"
            and obj.get("hs_role") == "door"
        ),
        None,
    )
    require(first_floor_special_door is not None, "1階特別教室東端の引き戸がありません")
    require(
        (
            first_floor_special_door.matrix_world.translation
            - Vector((40.2, 36.66, 0.0))
        ).length
        <= TOLERANCE,
        "1階特別教室東端の引き戸基準位置が不正です",
    )
    special_door_checks += 1
    return {
        "ordinary_opening_checks": opening_checks,
        "ordinary_divider_checks": divider_checks,
        "special_east_door_checks": special_door_checks,
    }


def audit_stair_boundary_walls() -> dict[str, int]:
    expected_boundaries = (
        ((-12.6, 2.35), (-3.5, 2.65)),
        ((-12.6, 32.35), (-3.5, 32.65)),
        ((41.25, 36.5), (41.55, 45.5)),
        ((-6.75, 38.5), (-6.45, 45.5)),
    )
    checks = 0
    for prefix in ("VIS", "COL"):
        cap_name = f"{prefix}_B03_StairBoundaryCaps_F01"
        audit_box_components(
            cap_name,
            [
                ((minimum[0], minimum[1], 3.0), (maximum[0], maximum[1], 3.6))
                for minimum, maximum in expected_boundaries
            ],
        )
        checks += len(expected_boundaries)
        require_box_component(
            f"{prefix}_Wall_Toilet_West",
            ((-6.75, 38.5, 0.0), (-6.45, 45.5, 3.0)),
        )
        checks += 1

    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        for prefix in ("VIS", "COL"):
            wall_name = f"{prefix}_B03_InteriorWalls_F{floor:02d}"
            expected_full_height_bounds = [
                (
                    (minimum[0], minimum[1], base_z),
                    (maximum[0], maximum[1], base_z + 3.6),
                )
                for minimum, maximum in expected_boundaries
            ]
            for minimum, maximum in expected_boundaries:
                require_box_component(
                    wall_name,
                    (
                        (minimum[0], minimum[1], base_z),
                        (maximum[0], maximum[1], base_z + 3.6),
                    ),
                )
                checks += 1
            if floor in (2, 3, 4):
                wall = bpy.data.objects[wall_name]
                unexpected_ceiling_overlaps = [
                    bounds
                    for bounds in box_component_bounds(wall)
                    if bounds[1][2] > base_z + 3.0 + TOLERANCE
                    and not any(
                        bounds_match(bounds, expected)
                        for expected in expected_full_height_bounds
                    )
                ]
                require(
                    not unexpected_ceiling_overlaps,
                    f"一般内壁が天井構造へ重複しています: {wall_name}/{unexpected_ceiling_overlaps}",
                )
                checks += 1
    return {"continuous_boundary_components": checks}


def audit_perimeter_block_joint_mesh() -> dict[str, int]:
    object_name = "VIS_B03_PerimeterBlockJoints"
    obj = bpy.data.objects.get(object_name)
    require(obj is not None and obj.type == "MESH", f"塀目地がありません: {object_name}")
    require(
        len(obj.data.vertices) == 14320,
        f"塀目地の頂点数が不正です: {len(obj.data.vertices)}",
    )
    require(
        len(obj.data.polygons) == 3580,
        f"塀目地のquad数が不正です: {len(obj.data.polygons)}",
    )
    require(
        all(len(polygon.vertices) == 4 for polygon in obj.data.polygons),
        "塀目地にquad以外の面があります",
    )
    require(
        bounds_match(
            tuple(tuple(value for value in bound) for bound in world_bounds(obj)),
            ((-18.806, -14.706, -0.3), (63.606, 51.706, 1.7)),
        ),
        f"塀目地のAABBが不正です: {world_bounds(obj)}",
    )

    horizontal_levels: dict[tuple[str, int], list[float]] = defaultdict(list)
    vertical_centers: dict[tuple[str, int, int], list[float]] = defaultdict(list)
    outward_normal_checks = 0
    for polygon in obj.data.polygons:
        points = [
            obj.matrix_world @ obj.data.vertices[vertex_index].co
            for vertex_index in polygon.vertices
        ]
        minimum = tuple(min(point[axis] for point in points) for axis in range(3))
        maximum = tuple(max(point[axis] for point in points) for axis in range(3))
        axis = (
            "X"
            if maximum[1] - minimum[1] <= TOLERANCE
            else "Y"
            if maximum[0] - minimum[0] <= TOLERANCE
            else ""
        )
        require(axis, f"塀目地が外周面上のquadではありません: {minimum}/{maximum}")
        primary_axis = 0 if axis == "X" else 1
        cross_axis = 1 if axis == "X" else 0
        primary_interval = (minimum[primary_axis], maximum[primary_axis])
        cross_coordinate = minimum[cross_axis]

        matches = []
        for (
            suffix,
            expected_axis,
            primary_minimum,
            primary_maximum,
            cross_minimum,
            cross_maximum,
        ) in PERIMETER_WALL_SPECS:
            if expected_axis != axis:
                continue
            for outward_sign, expected_cross in (
                (-1, cross_minimum - PERIMETER_JOINT_DEPTH),
                (1, cross_maximum + PERIMETER_JOINT_DEPTH),
            ):
                if (
                    abs(cross_coordinate - expected_cross) <= TOLERANCE
                    and primary_interval[0] >= primary_minimum - TOLERANCE
                    and primary_interval[1] <= primary_maximum + TOLERANCE
                ):
                    matches.append(
                        (
                            suffix,
                            outward_sign,
                            primary_minimum,
                            primary_maximum,
                        )
                    )
        require(
            len(matches) == 1,
            f"塀目地の所属外周面が一意ではありません: {minimum}/{maximum}/{matches}",
        )
        suffix, outward_sign, wall_minimum, wall_maximum = matches[0]

        normal = (points[1] - points[0]).cross(points[2] - points[0]).normalized()
        expected_normal = (
            Vector((0.0, float(outward_sign), 0.0))
            if axis == "X"
            else Vector((float(outward_sign), 0.0, 0.0))
        )
        require(
            normal.dot(expected_normal) >= 1.0 - TOLERANCE,
            f"塀目地の法線が外向きではありません: {suffix}/{outward_sign}/{normal}",
        )
        outward_normal_checks += 1

        primary_length = primary_interval[1] - primary_interval[0]
        z_interval = (minimum[2], maximum[2])
        z_length = z_interval[1] - z_interval[0]
        if (
            abs(primary_interval[0] - wall_minimum) <= TOLERANCE
            and abs(primary_interval[1] - wall_maximum) <= TOLERANCE
            and abs(z_length - PERIMETER_JOINT_WIDTH) <= TOLERANCE
        ):
            horizontal_levels[(suffix, outward_sign)].append(
                (z_interval[0] + z_interval[1]) / 2.0
            )
            continue

        require(
            abs(primary_length - PERIMETER_JOINT_WIDTH) <= TOLERANCE,
            f"塀の縦目地幅が2cmではありません: {suffix}/{primary_interval}",
        )
        course_index = next(
            (
                index
                for index in range(5)
                if abs(
                    z_interval[0]
                    - (
                        PERIMETER_WALL_Z[0]
                        + index * PERIMETER_BLOCK_HEIGHT
                        + (PERIMETER_JOINT_WIDTH / 2.0 if index > 0 else 0.0)
                    )
                )
                <= TOLERANCE
                and abs(
                    z_interval[1]
                    - (
                        PERIMETER_WALL_Z[0]
                        + (index + 1) * PERIMETER_BLOCK_HEIGHT
                        - (
                            PERIMETER_JOINT_WIDTH / 2.0
                            if index < 4
                            else 0.0
                        )
                    )
                )
                <= TOLERANCE
            ),
            None,
        )
        require(
            course_index is not None,
            f"塀の縦目地が5段の範囲にありません: {suffix}/{z_interval}",
        )
        vertical_centers[(suffix, outward_sign, course_index)].append(
            (primary_interval[0] + primary_interval[1]) / 2.0
        )

    expected_horizontal_levels = [
        PERIMETER_WALL_Z[0] + index * PERIMETER_BLOCK_HEIGHT
        for index in range(1, 5)
    ]
    phase_checks = 0
    for (
        suffix,
        _,
        wall_minimum,
        wall_maximum,
        _,
        _,
    ) in PERIMETER_WALL_SPECS:
        for outward_sign in (-1, 1):
            actual_horizontal_levels = sorted(
                horizontal_levels[(suffix, outward_sign)]
            )
            require(
                len(actual_horizontal_levels) == len(expected_horizontal_levels)
                and all(
                    abs(actual - expected) <= TOLERANCE
                    for actual, expected in zip(
                        actual_horizontal_levels,
                        expected_horizontal_levels,
                    )
                ),
                f"塀の水平目地が0.4m間隔の5段ではありません: {suffix}/{outward_sign}",
            )
            phase_checks += 1
            for course_index in range(5):
                first_offset = (
                    PERIMETER_BLOCK_WIDTH / 2.0
                    if course_index % 2
                    else PERIMETER_BLOCK_WIDTH
                )
                expected_centers = []
                position = wall_minimum + first_offset
                while position < wall_maximum - 1e-8:
                    expected_centers.append(position)
                    position += PERIMETER_BLOCK_WIDTH
                actual_centers = sorted(
                    vertical_centers[(suffix, outward_sign, course_index)]
                )
                require(
                    len(actual_centers) == len(expected_centers)
                    and all(
                        abs(actual - expected) <= TOLERANCE
                        for actual, expected in zip(
                            actual_centers,
                            expected_centers,
                            strict=True,
                        )
                    ),
                    f"塀の縦目地位相が不正です: {suffix}/{outward_sign}/{course_index}/{actual_centers}",
                )
                phase_checks += 1

    return {
        "vertices": len(obj.data.vertices),
        "quads": len(obj.data.polygons),
        "outward_normal_checks": outward_normal_checks,
        "course_and_phase_checks": phase_checks,
    }


def audit_site_boundary_visuals() -> dict[str, int]:
    site_ground = bpy.data.objects.get("VIS_SiteGround")
    require(
        site_ground is not None and site_ground.type == "MESH",
        "校門下桟の高さ基準となるSiteGroundがありません",
    )
    site_ground_minimum, site_ground_maximum = world_bounds(site_ground)
    require(
        abs(site_ground_minimum.x + 18.8) <= TOLERANCE
        and abs(site_ground_minimum.y + 14.7) <= TOLERANCE
        and abs(site_ground_maximum.x - 63.6) <= TOLERANCE
        and abs(site_ground_maximum.y - 51.7) <= TOLERANCE
        and
        abs(site_ground_maximum.z + 0.3) <= TOLERANCE,
        "SiteGroundが外周塀外面まで連続していません: "
        f"{tuple(site_ground_minimum)}->{tuple(site_ground_maximum)}",
    )
    gate_components = 0
    for object_name, axis, minimum, maximum, fixed in GATE_VISUAL_SPECS:
        expected = expected_gate_fence_boxes(
            axis,
            minimum,
            maximum,
            fixed,
        )
        require(len(expected) == 20, f"校門の部品数定義が不正です: {object_name}")
        gate_components += audit_box_components(object_name, expected)
        require_architecture_swatch(object_name, "gate")
        lower_rails = [
            bounds
            for bounds in box_component_bounds(bpy.data.objects[object_name])
            if abs(bounds[0][2] + 0.28) <= TOLERANCE
            and abs(bounds[1][2] + 0.20) <= TOLERANCE
        ]
        require(
            len(lower_rails) == 2
            and all(
                abs(bounds[0][2] - site_ground_maximum.z - 0.02)
                <= TOLERANCE
                for bounds in lower_rails
            ),
            f"校門下桟とSiteGround上面の隙間が2cmではありません: {object_name}/{lower_rails}",
        )

    gate_collider_components = 0
    for object_name, expected_bounds in GATE_COLLIDER_BOUNDS.items():
        gate_collider_components += audit_box_components(
            object_name,
            [expected_bounds],
        )

    perimeter_core_components = 0
    for suffix, axis, minimum, maximum, cross_minimum, cross_maximum in (
        PERIMETER_WALL_SPECS
    ):
        expected_bounds = expected_oriented_box(
            axis,
            minimum,
            maximum,
            cross_minimum,
            cross_maximum,
            PERIMETER_WALL_Z[0],
            PERIMETER_WALL_Z[1],
        )
        perimeter_core_components += audit_box_components(
            f"VIS_{suffix}",
            [expected_bounds],
        )
        perimeter_core_components += audit_box_components(
            f"COL_{suffix}",
            [expected_bounds],
        )
        require_architecture_swatch(f"VIS_{suffix}", "wall")

    joint_mesh = audit_perimeter_block_joint_mesh()
    require_architecture_swatch("VIS_B03_PerimeterBlockJoints", "trim")
    require(
        bpy.data.objects.get("COL_B03_PerimeterBlockJoints") is None,
        "塀目地へColliderが追加されています",
    )
    require(
        bpy.data.objects.get("NAV_Blocker_Perimeter") is not None,
        "既存の外周Nav blockerがありません",
    )
    return {
        "gate_components": gate_components,
        "gate_collider_components": gate_collider_components,
        "perimeter_core_components": perimeter_core_components,
        "perimeter_joint_mesh": joint_mesh,
        "perimeter_courses": round(
            (PERIMETER_WALL_Z[1] - PERIMETER_WALL_Z[0])
            / PERIMETER_BLOCK_HEIGHT
        ),
    }


def audit_upper_nav_blocker_boundaries() -> dict[str, int]:
    object_name = "NAV_Blocker_SchoolUpper"
    obj = bpy.data.objects.get(object_name)
    require(
        obj is not None and obj.type == "MESH",
        f"上階Nav blockerがありません: {object_name}",
    )
    actual_components = box_component_bounds(obj)
    expected_boundary_walls = (
        ((5.25, 36.5, 3.6), (5.55, 45.5, 6.6)),
        ((5.25, 36.5, 7.2), (5.55, 45.5, 10.2)),
        ((5.25, 36.5, 10.8), (5.55, 45.5, 13.8)),
    )
    for expected_bounds in expected_boundary_walls:
        matches = [
            actual_bounds
            for actual_bounds in actual_components
            if bounds_match(actual_bounds, expected_bounds)
        ]
        require(
            len(matches) == 1,
            f"上階Nav blockerの通路・特別教室境界壁が一意に存在しません: {expected_bounds}/{len(matches)}",
        )

    bridge_ceiling_bounds = (
        (39.3, 26.65, 6.60),
        (43.5, 32.35, 7.05),
    )
    bridge_ceiling = bpy.data.objects.get("COL_B03_GymBridgeCeiling")
    require(
        bridge_ceiling is not None
        and len(box_component_bounds(bridge_ceiling)) == 1
        and bounds_match(
            box_component_bounds(bridge_ceiling)[0],
            bridge_ceiling_bounds,
        ),
        "渡り廊下天井Colliderの物理形状がv10契約と一致しません",
    )
    bridge_ceiling_blockers = [
        actual_bounds
        for actual_bounds in actual_components
        if bounds_match(actual_bounds, bridge_ceiling_bounds)
    ]
    require(
        not bridge_ceiling_blockers,
        "2階渡り廊下の天井上面が人間用Nav blockerへ混入しています",
    )

    facility_shell = bpy.data.objects.get("COL_RooftopFacilityShell")
    require(
        facility_shell is not None and facility_shell.type == "MESH",
        "屋上階段室・更衣室の物理Colliderがありません",
    )
    facility_components = box_component_bounds(facility_shell)
    facility_roof_bounds = (
        ((-12.6, 38.9, 16.9), (-6.6, 45.5, 17.0)),
        ((-6.6, 38.5, 16.9), (-2.1, 45.5, 17.0)),
        ((-2.1, 38.5, 16.9), (2.4, 45.5, 17.0)),
    )
    require(
        len(facility_components) == 19,
        f"屋上施設Shellが壁16枚・屋根3枚ではありません: "
        f"{len(facility_components)}",
    )
    for expected_bounds in facility_roof_bounds:
        physical_matches = [
            actual_bounds
            for actual_bounds in facility_components
            if bounds_match(actual_bounds, expected_bounds)
        ]
        blocker_matches = [
            actual_bounds
            for actual_bounds in actual_components
            if bounds_match(actual_bounds, expected_bounds)
        ]
        require(
            len(physical_matches) == 1,
            f"屋上施設の物理屋根が一意に存在しません: "
            f"{expected_bounds}/{len(physical_matches)}",
        )
        require(
            not blocker_matches,
            f"初期生成禁止の屋上施設屋根が人間用Nav blockerへ混入しています: "
            f"{expected_bounds}",
        )
    facility_wall_components = [
        actual_bounds
        for actual_bounds in facility_components
        if not any(
            bounds_match(actual_bounds, roof_bounds)
            for roof_bounds in facility_roof_bounds
        )
    ]
    require(
        len(facility_wall_components) == 16,
        f"屋上施設Shellから抽出した壁が16枚ではありません: "
        f"{len(facility_wall_components)}",
    )
    for expected_bounds in facility_wall_components:
        matches = [
            actual_bounds
            for actual_bounds in actual_components
            if bounds_match(actual_bounds, expected_bounds)
        ]
        require(
            len(matches) == 1,
            f"屋上施設の壁だけを人間用Nav blockerへ保持できていません: "
            f"{expected_bounds}/{len(matches)}",
        )
    return {
        "special_room_boundary_walls": len(expected_boundary_walls),
        "excluded_bridge_ceiling_surfaces": 1,
        "excluded_rooftop_facility_roofs": len(facility_roof_bounds),
        "included_rooftop_facility_walls": len(facility_wall_components),
    }


def audit_first_floor_nav_blocker_deduplication() -> dict[str, int]:
    half_depth = TOILET_FRONT_WALL_DEPTH / 2.0
    expected_bounds = tuple(
        (
            (minimum_x, TOILET_FRONT_WALL_Y - half_depth, 0.0),
            (maximum_x, TOILET_FRONT_WALL_Y + half_depth, 3.0),
        )
        for minimum_x, maximum_x in TOILET_FRONT_WALL_SPANS
    ) + tuple(
        (
            (
                minimum_x,
                TOILET_FRONT_WALL_Y - half_depth,
                TOILET_FRONT_DOOR_HEIGHT,
            ),
            (maximum_x, TOILET_FRONT_WALL_Y + half_depth, 3.0),
        )
        for minimum_x, maximum_x in TOILET_FRONT_DOOR_OPENINGS
    )
    school_components = box_component_bounds(
        bpy.data.objects["NAV_Blocker_School1F"]
    )
    interior_components = box_component_bounds(
        bpy.data.objects["NAV_Blocker_Interiors"]
    )
    for expected in expected_bounds:
        require(
            not any(bounds_match(component, expected) for component in school_components),
            f"旧1階Nav blockerに重複トイレ壁が残っています: {expected}",
        )
        require(
            sum(
                bounds_match(component, expected)
                for component in interior_components
            )
            == 1,
            f"内装Nav blockerのトイレ壁が一意ではありません: {expected}",
        )
    return {"removed_school1f_boxes": len(expected_bounds)}


def audit_acceptance_visuals(objects: list[bpy.types.Object]) -> dict[str, int]:
    atlas_rgb_cells = audit_architecture_atlas_rgb()
    door_hardware_rgb_cells = audit_door_hardware_atlas_rgb()
    consolidated_materials = audit_consolidated_materials()
    packed_atlases = audit_packed_atlas_paths()
    expected_swatches = {
        "VIS_SiteGround": "grass",
        "VIS_CourtyardSurface": "grass",
        "VIS_Gate_MainClosed": "gate",
        "VIS_Gate_UtilityClosed": "gate",
        "VIS_Floor_Gym": "gym_floor",
        "VIS_GymStage": "gym_stage",
        "VIS_B03_GymExteriorWalls": "wall",
        "VIS_B03_GymWainscot": "gym_wainscot",
        "VIS_B03_GymTrim": "trim",
    }
    for floor in range(1, 5):
        expected_swatches[f"VIS_B03_StoreyTrim_F{floor:02d}"] = "trim"
        expected_swatches[f"VIS_B03_StoreyBand_F{floor:02d}"] = f"floor_{floor}"
    for floor in range(2, 5):
        expected_swatches[f"VIS_B03_Ceiling_F{floor:02d}"] = "ceiling"
    for object_name, swatch in expected_swatches.items():
        require_architecture_swatch(object_name, swatch)
    room_handle_names = sorted(
        obj.name
        for obj in objects
        if obj.name.startswith("VIS_DoorPanel_Handle_")
    )
    toilet_knob_names = sorted(
        obj.name
        for obj in objects
        if obj.name.startswith("VIS_DoorPanel_Knob_")
    )
    require(
        len(room_handle_names) == 40,
        f"室内・屋上更衣室引き戸の両面取っ手Objectが40件ではありません: "
        f"{len(room_handle_names)}",
    )
    require(
        len(toilet_knob_names) == 24,
        f"トイレ個室扉の外側ノブObjectが24件ではありません: "
        f"{len(toilet_knob_names)}",
    )
    for object_name in (*room_handle_names, *toilet_knob_names):
        require_furniture_swatch(object_name, "door_hardware_yellow")

    trim_components = audit_box_components(
        "VIS_B03_GymTrim",
        [
            ((33.59, -11.35, 0.02), (33.63, 4.95, 0.14)),
            ((33.59, 8.05, 0.02), (33.63, 26.35, 0.14)),
            ((59.17, -11.35, 0.02), (59.21, 26.35, 0.14)),
            ((33.55, 26.27, 0.02), (39.35, 26.31, 0.14)),
            ((43.45, 26.27, 0.02), (53.60, 26.31, 0.14)),
            ((55.20, 26.27, 0.02), (59.25, 26.31, 0.14)),
            ((33.59, -11.35, 0.02), (33.67, -11.27, 9.00)),
            ((33.59, 26.27, 0.02), (33.67, 26.35, 9.00)),
            ((59.13, -11.35, 0.02), (59.21, -11.27, 9.00)),
            ((59.13, 26.27, 0.02), (59.21, 26.35, 9.00)),
        ],
    )
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        trim_components += audit_box_components(
            f"VIS_B03_StoreyBand_F{floor:02d}",
            expected_storey_band_boxes(floor, base_z),
        )
        trim_components += audit_box_components(
            f"VIS_B03_StoreyTrim_F{floor:02d}",
            [
                ((41.32, 36.41, base_z + 0.02), (41.40, 36.45, base_z + 3.50)),
            ],
        )
    storey_band_relationships = audit_storey_band_relationships(objects)
    classroom_openings = audit_classroom_openings_and_boundaries()
    stair_boundary_walls = audit_stair_boundary_walls()
    site_boundaries = audit_site_boundary_visuals()
    upper_nav_blocker_boundaries = audit_upper_nav_blocker_boundaries()
    first_floor_nav_deduplication = (
        audit_first_floor_nav_blocker_deduplication()
    )

    floor_panels = (
        ((-6.0, -3.5), (0.0, 32.5)),
        ((-12.6, 2.5), (-6.0, 32.5)),
        ((-6.6, 32.5), (41.4, 45.5)),
        ((-12.6, 32.5), (-6.6, 38.9)),
        ((41.4, 32.5), (47.4, 38.9)),
        ((-12.6, -7.0), (-11.5, -3.5)),
        ((-9.1, -7.0), (0.0, -3.5)),
        ((-11.5, -7.0), (-9.1, -6.4)),
        ((-11.5, -4.0), (-9.1, -3.5)),
    )
    floor_component_count = 0
    for floor, upper_floor_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        expected_floor = [
            (
                (minimum[0], minimum[1], upper_floor_z - 0.15),
                (maximum[0], maximum[1], upper_floor_z),
            )
            for minimum, maximum in floor_panels
        ]
        expected_visual_floor = expected_floor
        if floor == 2:
            f02_visual_floor_panels = (
                ((-6.0, -3.5), (0.0, 32.5)),
                ((-12.6, 2.5), (-6.0, 32.5)),
                ((-6.6, 32.5), (39.3, 45.5)),
                ((39.3, 32.65), (41.4, 45.5)),
                ((-12.6, 32.5), (-6.6, 38.9)),
                ((41.4, 32.65), (43.5, 38.9)),
                ((43.5, 32.5), (47.4, 38.9)),
                ((-12.6, -7.0), (-11.5, -3.5)),
                ((-9.1, -7.0), (0.0, -3.5)),
                ((-11.5, -7.0), (-9.1, -6.4)),
                ((-11.5, -4.0), (-9.1, -3.5)),
            )
            expected_visual_floor = [
                (
                    (minimum[0], minimum[1], upper_floor_z - 0.15),
                    (maximum[0], maximum[1], upper_floor_z),
                )
                for minimum, maximum in f02_visual_floor_panels
            ]
        floor_component_count += audit_box_components(
            f"VIS_B03_Floor_F{floor:02d}",
            list(expected_visual_floor),
        )
        floor_component_count += audit_box_components(
            f"COL_B03_Floor_F{floor:02d}",
            list(expected_floor),
        )

    first_floor_groups = {
        "West": tuple(floor_panels[index] for index in (0, 1, 3, 5, 6, 7, 8)),
        "North": tuple(floor_panels[index] for index in (2, 4)),
    }
    structure_component_count = 0
    for wing, panels in first_floor_groups.items():
        expected_structure = [
            (
                (minimum[0], minimum[1], 3.0),
                (maximum[0], maximum[1], 3.45),
            )
            for minimum, maximum in panels
        ]
        for prefix in ("VIS", "COL"):
            structure_component_count += audit_box_components(
                f"{prefix}_B03_InterfloorStructure_F01_{wing}",
                list(expected_structure),
            )
    for lower_floor, upper_floor_z in ((2, 7.2), (3, 10.8)):
        expected_structure = [
            (
                (minimum[0], minimum[1], upper_floor_z - 0.60),
                (maximum[0], maximum[1], upper_floor_z - 0.15),
            )
            for minimum, maximum in floor_panels
        ]
        for prefix in ("VIS", "COL"):
            structure_component_count += audit_box_components(
                f"{prefix}_B03_Ceiling_F{lower_floor:02d}",
                list(expected_structure),
            )
    expected_roof_ceiling = [
        (
            (minimum[0], minimum[1], 13.8),
            (maximum[0], maximum[1], 14.4),
        )
        for minimum, maximum in (
            *floor_panels,
            ((-12.6, -3.5), (-6.0, 2.5)),
            ((41.4, 38.9), (47.4, 45.5)),
        )
    ]
    for prefix in ("VIS", "COL"):
        structure_component_count += audit_box_components(
            f"{prefix}_B03_Ceiling_F04",
            list(expected_roof_ceiling),
        )

    lintels = [
        obj.name
        for obj in objects
        if obj.type == "MESH"
        and obj.name.startswith("VIS_")
        and "Lintel" in obj.name
    ]
    for object_name in lintels:
        require_architecture_swatch(object_name, "wall")

    removed_objects = {
        "COL_StairClosure_NE",
        "COL_StairClosure_SW",
        "VIS_Ceiling1F_North",
        "VIS_Ceiling1F_West",
        "COL_Ceiling1F_North",
        "COL_Ceiling1F_West",
        "VIS_B03_FloorAccent_F02",
        "VIS_B03_FloorAccent_F03",
        "VIS_B03_FloorAccent_F04",
        "VIS_B03_HandrailTops",
        "VIS_WindowFrame_F01_CourtyardNorth_Corridor_01",
        "VIS_WindowGlass_F01_CourtyardNorth_Corridor_01",
        "COL_ActorOnly_Window_F01_CourtyardNorth_Corridor_01",
        "VIS_Floor_ToiletFront",
        "VIS_Floor_ToiletZone",
    }
    for prefix in ("VIS_", "COL_"):
        removed_objects.update(
            {
                f"{prefix}Wall_Lintel_Toilet_F",
                f"{prefix}Wall_Lintel_Toilet_M",
                f"{prefix}Wall_Toilet_South_A",
                f"{prefix}Wall_Toilet_South_B",
                f"{prefix}Wall_Toilet_South_C",
                f"{prefix}Wall_Toilet_South_D",
            }
        )
    present_removed = sorted(removed_objects & {obj.name for obj in objects})
    require(not present_removed, f"閉鎖または重複表示面が残っています: {present_removed}")
    present_floor_accents = sorted(
        obj.name
        for obj in objects
        if obj.name.startswith("VIS_B03_FloorAccent_")
    )
    require(
        not present_floor_accents,
        f"旧床アクセントが残っています: {present_floor_accents}",
    )
    legacy_changing_lockers = sorted(
        obj.name
        for obj in objects
        if obj.name.startswith(
            (
                "VIS_B03_Prop_Locker_Changing_",
                "COL_B03_Prop_Locker_Changing_",
            )
        )
    )
    require(
        not legacy_changing_lockers,
        f"建築側の重複更衣室ロッカーが残っています: {legacy_changing_lockers}",
    )

    for name in ("VIS_MainEntryDoor_Open_North", "VIS_MainEntryDoor_Open_South"):
        door = bpy.data.objects.get(name)
        require(door is not None, f"主玄関扉がありません: {name}")
        minimum, _ = world_bounds(door)
        require(minimum.x >= 0.17 - 1e-6, f"主玄関扉が壁へ重なっています: {name}")
        require_architecture_swatch(name, "door")

    for name in ("VIS_Wall_ClassroomCross_2", "COL_Wall_ClassroomCross_2"):
        corner = bpy.data.objects.get(name)
        require(corner is not None, f"保健室角がありません: {name}")
        _, maximum = world_bounds(corner)
        require(abs(maximum.x + 3.35) <= 1e-5, f"保健室角が廊下壁へ揃っていません: {name}")

    f01_boundary_checks = 0
    f01_stair_classroom_boundaries = {
        "South": (
            "Wall_ClassroomCross_1",
            ((-12.6, 2.35, 0.0), (-3.5, 2.65, 3.0)),
        ),
        "North": (
            "Wall_Classroom3_North",
            ((-12.6, 32.35, 0.0), (-3.5, 32.65, 3.0)),
        ),
    }
    for side, (name_suffix, expected_bounds) in f01_stair_classroom_boundaries.items():
        boundary_y = (expected_bounds[0][1] + expected_bounds[1][1]) / 2
        for prefix in ("VIS", "COL"):
            object_name = f"{prefix}_{name_suffix}"
            audit_box_components(object_name, [expected_bounds])
            boundary = bpy.data.objects[object_name]
            components = box_component_bounds(boundary)
            for sample_x in (-12.45, -9.0, -6.0, -3.65):
                require(
                    any(
                        all(
                            minimum[axis] - 1e-5
                            <= (sample_x, boundary_y, 1.5)[axis]
                            <= maximum[axis] + 1e-5
                            for axis in range(3)
                        )
                        for minimum, maximum in components
                    ),
                    f"1階{side}側の階段・普通教室境界が連続していません: {object_name}/{sample_x}",
                )
                f01_boundary_checks += 1
            require(
                not any(
                    all(
                        minimum[axis] - 1e-5
                        <= (-3.2, boundary_y, 1.5)[axis]
                        <= maximum[axis] + 1e-5
                        for axis in range(3)
                    )
                    for minimum, maximum in components
                ),
                f"1階{side}側の正規廊下出口を境界壁が塞いでいます: {object_name}",
            )
            f01_boundary_checks += 1

    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        for prefix in ("VIS", "COL"):
            wall_name = f"{prefix}_B03_InteriorWalls_F{floor:02d}"
            require_box_component(
                wall_name,
                ((-12.6, 2.35, base_z), (-3.5, 2.65, base_z + 3.6)),
            )
            require_box_component(
                wall_name,
                ((-12.6, 32.35, base_z), (-3.5, 32.65, base_z + 3.6)),
            )
            require_box_component(
                wall_name,
                ((5.25, 36.5, base_z), (5.55, 45.5, base_z + 3.0)),
            )
        floor_room_doors = [
            obj
            for obj in bpy.data.objects
            if obj.get("hs_role") == "door"
            and obj.get("hs_door_class") == "room"
            and abs(obj.matrix_world.translation.z - base_z) <= TOLERANCE
        ]
        require(
            len(floor_room_doors) == 10,
            f"{floor}階のB03-3C室内引き戸が10件ではありません",
        )

    for prefix in ("VIS", "COL"):
        require_point_in_box_component(
            f"{prefix}_B03_ExteriorWalls_F01",
            (9.55, 32.5, 1.7),
        )

    return {
        "atlas_rgb_cells": atlas_rgb_cells,
        "door_hardware_rgb_cells": door_hardware_rgb_cells,
        "consolidated_materials": consolidated_materials,
        "packed_atlases": packed_atlases,
        "swatches": (
            len(expected_swatches)
            + len(lintels)
            + len(room_handle_names)
            + len(toilet_knob_names)
            + 2
        ),
        "room_door_handles": len(room_handle_names),
        "toilet_door_knobs": len(toilet_knob_names),
        "trim_components": trim_components,
        "floor_components": floor_component_count,
        "f01_stair_classroom_boundary_checks": f01_boundary_checks,
        "interfloor_structure_components": structure_component_count,
        "removed_overlap_objects": len(removed_objects) + 1,
        "storey_band_relationships": storey_band_relationships,
        "classroom_openings": classroom_openings,
        "stair_boundary_walls": stair_boundary_walls,
        "site_boundaries": site_boundaries,
        "upper_nav_blocker_boundaries": upper_nav_blocker_boundaries,
        "first_floor_nav_deduplication": first_floor_nav_deduplication,
    }


def audit_rooftop_escape_crate_mounds() -> dict[str, int | float]:
    visual_components = []
    for color in ("Dark", "Light", "Gray"):
        obj = bpy.data.objects.get(f"VIS_B03_RooftopEscapeCrates_{color}")
        require(obj is not None and obj.type == "MESH", f"箱山D1表示がありません: {color}")
        visual_components.extend(mesh_component_world_bounds(obj))
    require(
        len(visual_components) == 28,
        f"箱山D1の表示木箱が2基14個ずつではありません: {len(visual_components)}",
    )

    expected_ramps = {
        "COL_B03_GymRoofEscapeCrateRamp": (
            (34.30, -11.85, 9.45),
            (36.50, -8.45, 10.80),
        ),
        "COL_B03_SchoolRoofEscapeCrateRamp": (
            (-3.05, 11.40, 14.35),
            (0.35, 13.60, 15.70),
        ),
    }
    for object_name, expected_bounds in expected_ramps.items():
        obj = bpy.data.objects.get(object_name)
        require(obj is not None and obj.type == "MESH", f"箱山D1斜面がありません: {object_name}")
        require(
            bounds_match(world_bounds(obj), expected_bounds),
            f"箱山D1斜面のAABBが不正です: {object_name}/{world_bounds(obj)}",
        )

    for object_name in (
        "VIS_PoolRaisedDeck_West",
        "VIS_PoolRaisedDeck_East",
        "VIS_PoolRaisedDeck_North",
        "VIS_PoolRaisedDeck_South",
    ):
        require_architecture_swatch(object_name, "wall")

    for object_name in (
        "VIS_RooftopFacilityWalls",
        "COL_RooftopFacilityShell",
    ):
        components = mesh_component_world_bounds(bpy.data.objects[object_name])
        for expected_bounds in (
            ((-5.4, 38.5, 16.8), (-4.2, 38.8, 16.9)),
            ((-0.9, 38.5, 16.8), (0.3, 38.8, 16.9)),
        ):
            require(
                any(bounds_match(component, expected_bounds) for component in components),
                f"屋上更衣室の2.30m引き戸開口がありません: {object_name}/{expected_bounds}",
            )
    return {
        "mounds": 2,
        "visual_crates": len(visual_components),
        "walkable_ramps": len(expected_ramps),
        "gym_top_above_guard_m": 0.10,
        "school_top_above_guard_m": 0.15,
        "ivory_pool_structures": 4,
        "changing_door_lintels": 2,
    }


def audit_roof_guards() -> dict[str, int]:
    component_count = 0
    post_spacing_checks = 0
    component_bounds_by_name: dict[
        str,
        list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    ] = {}
    for (
        suffix,
        start,
        end,
        include_start_post,
        include_end_post,
    ) in ROOF_GUARD_SEGMENTS:
        expected_components = expected_linear_guard_component_bounds(
            start,
            end,
            include_start_post,
            include_end_post,
        )
        for prefix in ("VIS", "COL"):
            object_name = f"{prefix}_RoofGuard_{suffix}"
            component_count += audit_box_components(
                object_name,
                list(expected_components),
            )
            component_bounds_by_name[object_name] = box_component_bounds(
                bpy.data.objects[object_name]
            )
        require_architecture_swatch(f"VIS_RoofGuard_{suffix}", "trim")
        horizontal_length = math.hypot(end[0] - start[0], end[1] - start[1])
        require(
            horizontal_length / math.ceil(horizontal_length / 1.1)
            <= 1.1 + TOLERANCE,
            f"屋上柵の支柱間隔が1.1mを超えています: {suffix}",
        )
        post_spacing_checks += 1

    shared_junctions = (
        (
            (-12.5, -6.9, 14.5),
            ("WestOuter", "SouthOuter"),
        ),
        (
            (-0.1, -6.9, 14.5),
            ("SouthOuter", "CourtyardWest"),
        ),
        (
            (-0.1, 32.6, 14.5),
            ("CourtyardWest", "CourtyardNorth"),
        ),
        (
            (47.3, 32.6, 14.5),
            ("CourtyardNorth", "EastOuter"),
        ),
        (
            (47.3, 45.4, 14.5),
            ("EastOuter", "NorthOuter"),
        ),
    )
    junction_checks = 0
    for point, suffixes in shared_junctions:
        top_rail_point = (point[0], point[1], point[2] + 1.0)
        expected_post = (
            (point[0] - 0.05, point[1] - 0.05, point[2]),
            (point[0] + 0.05, point[1] + 0.05, point[2] + 1.05),
        )
        for prefix in ("VIS", "COL"):
            for suffix in suffixes:
                require_point_in_box_component(
                    f"{prefix}_RoofGuard_{suffix}",
                    top_rail_point,
                )
                junction_checks += 1
            owning_posts = sum(
                any(
                    bounds_match(component, expected_post)
                    for component in component_bounds_by_name[
                        f"{prefix}_RoofGuard_{suffix}"
                    ]
                )
                for suffix in suffixes
            )
            require(
                owning_posts == 1,
                f"屋上柵共有角の支柱が欠落または重複しています: {prefix}/{point}/{owning_posts}",
            )
            junction_checks += 1

    facility_connections = (
        ((-12.5, 38.9, 15.0), "WestOuter"),
        ((2.4, 45.4, 15.0), "NorthOuter"),
    )
    for point, suffix in facility_connections:
        for prefix, facility_name in (
            ("VIS", "VIS_RooftopFacilityWalls"),
            ("COL", "COL_RooftopFacilityShell"),
        ):
            require_point_in_box_component(
                f"{prefix}_RoofGuard_{suffix}",
                point,
            )
            require_point_in_box_component(facility_name, point)
            junction_checks += 2

    require(
        bpy.data.objects.get("VIS_B03_Interior_RoofPoolSafety_Architecture")
        is None,
        "撤去対象の屋上救命浮き輪ブラケットが残っています",
    )

    return {
        "objects": len(ROOF_GUARD_SEGMENTS) * 2,
        "components": component_count,
        "post_spacing_checks": post_spacing_checks,
        "junction_checks": junction_checks,
    }


def audit_mesh_contract(export_objects: list[bpy.types.Object]) -> None:
    for obj in export_objects:
        if obj.type != "MESH":
            continue
        require(obj.data.name == obj.name, f"Object名とMesh Data名が不一致です: {obj.name}")
        require(obj.data.users == 1, f"Mesh Dataがsingle-userではありません: {obj.name}")
        require(
            all(abs(value) <= 1e-7 for value in obj.location),
            f"Mesh Objectのlocationが未適用です: {obj.name}",
        )
        require(
            all(abs(value) <= 1e-7 for value in obj.rotation_euler),
            f"Mesh Objectのrotationが未適用です: {obj.name}",
        )
        require(
            all(abs(value - 1.0) <= 1e-7 for value in obj.scale),
            f"Mesh Objectのscaleが未適用です: {obj.name}",
        )
        for vertex in obj.data.vertices:
            require(
                all(math.isfinite(value) for value in vertex.co),
                f"頂点に非有限値があります: {obj.name}",
            )
        for polygon in obj.data.polygons:
            require(
                all(math.isfinite(value) for value in polygon.normal)
                and polygon.normal.length >= 0.999,
                f"面法線が不正です: {obj.name}",
            )
        if obj.name.startswith(("COL_", "VOL_", "BND_")):
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            non_manifold = [edge for edge in mesh.edges if len(edge.link_faces) != 2]
            mesh.free()
            require(
                not non_manifold,
                f"必須閉形状がnon-manifoldです: {obj.name} ({len(non_manifold)} edges)",
            )


def audit_links(objects: list[bpy.types.Object]) -> dict[str, int]:
    pairs: dict[str, dict[str, bpy.types.Object]] = defaultdict(dict)
    for obj in objects:
        match = LINK_PATTERN.match(obj.name)
        if match is None or obj.get("hs_transition_kind") != "aperture":
            continue
        link_id, endpoint = match.groups()
        pairs[link_id][endpoint] = obj
        require(obj.type == "EMPTY", f"LNK_*がEmptyではありません: {obj.name}")
        require_exact_hs_properties(
            obj.name,
            obj,
            expected_aperture_endpoint_properties(link_id, endpoint),
        )
    expected_pairs = 57
    require(len(pairs) == expected_pairs, f"特殊接続が{expected_pairs}組ではありません: {len(pairs)}")
    window_colliders = {
        "bit-window-"
        + obj.name.removeprefix("COL_HumanOnly_Window_").lower().replace("_", "-"): obj
        for obj in objects
        if obj.name.startswith("COL_HumanOnly_Window_")
    }
    require(
        set(pairs) == set(window_colliders),
        "aperture接続IDと承認済み57窓Colliderが一致しません",
    )
    for link_id, endpoints in pairs.items():
        require(set(endpoints) == {"A", "B"}, f"LNK pairが不完全です: {link_id}")
        a = endpoints["A"]
        b = endpoints["B"]
        segment = b.location - a.location
        require(
            abs(segment.z) <= 1e-7,
            f"LNK直線が端点最高高度を越える傾斜を持ちます: {link_id}",
        )
        require(
            segment.length / 2 >= BIT_FLIGHT_LINK_RADIUS_METERS,
            f"aperture端点余裕が0.54m未満です: {link_id}",
        )
        expected_endpoint_offset = (
            GYM_WINDOW_LINK_ENDPOINT_OFFSET_METERS
            if link_id.startswith("bit-window-gym-")
            else WINDOW_LINK_ENDPOINT_OFFSET_METERS
        )
        require(
            abs(segment.length / 2 - expected_endpoint_offset) <= TOLERANCE,
            f"aperture端点距離が規定値ではありません: {link_id}",
        )
        collider = window_colliders[link_id]
        minimum, maximum = world_bounds(collider)
        center = (minimum + maximum) / 2
        midpoint = (a.location + b.location) / 2
        expected_midpoint = center.copy()
        require(
            (midpoint - expected_midpoint).length <= 1e-5,
            f"apertureが承認済み開口中心を通りません: {link_id}",
        )
        dimensions = maximum - minimum
        thin_axis = min(range(3), key=lambda axis: dimensions[axis])
        direction = segment.normalized()
        require(
            abs(direction[thin_axis]) >= 1.0 - 1e-7,
            f"apertureが壁法線方向ではありません: {link_id}",
        )
    legacy_roof_links = [
        obj.name
        for obj in objects
        if obj.name.startswith("LNK_bit-roof-")
        or obj.get("hs_link_kind") == "bit_roof"
    ]
    require(
        not legacy_roof_links,
        f"廃止済みbit_roof接続が残っています: {legacy_roof_links}",
    )
    return {
        "aperture_pairs": len(pairs),
        "aperture_endpoints": len(pairs) * 2,
        "legacy_bit_roof": len(legacy_roof_links),
    }


def audit_bit_flight_navigation(
    objects: list[bpy.types.Object],
) -> dict[str, object]:
    objects_by_name = {obj.name: obj for obj in objects}
    metadata = objects_by_name.get("META_Stage")
    require(
        metadata is not None and metadata.type == "EMPTY",
        "META_StageがEmptyとして存在しません",
    )
    require(
        metadata.get("hs_schema_version") == EXPECTED_SCHEMA_VERSION,
        "META_Stage.hs_schema_versionが2ではありません",
    )
    require(
        metadata.get("hs_stage_id") == EXPECTED_STAGE_ID,
        "META_Stage.hs_stage_idがschoolではありません",
    )
    require(
        metadata.get("hs_nav_profile") == EXPECTED_HUMAN_NAV_PROFILE,
        "META_Stage.hs_nav_profileが学校人間用profileと一致しません",
    )
    require(
        metadata.get("hs_bit_nav_profile") == EXPECTED_BIT_NAV_PROFILE,
        "META_Stage.hs_bit_nav_profileがビット用profileと一致しません",
    )

    human_nav = [
        obj
        for obj in objects
        if obj.name.startswith("NAV_")
        and not obj.name.startswith("NAV_BitFlight_")
    ]
    require(human_nav, "人間用NAV生成元がありません")
    bit_only_keys = {
        "hs_zone_id",
        "hs_band_id",
        "hs_space_kind",
        "hs_center_height_min_m",
        "hs_center_height_max_m",
    }
    for obj in human_nav:
        require(
            obj.get("hs_nav_set") == "human",
            f"人間用NAVのhs_nav_setがhumanではありません: {obj.name}",
        )
        require(
            not bit_only_keys.intersection(hs_properties(obj)),
            f"人間用NAVへビット飛行帯extrasが混入しています: {obj.name}",
        )

    expected_bit_names = set()
    band_keys = set()
    for (
        walkable_name,
        zone_id,
        band_id,
        space_kind,
        minimum_center_height,
        maximum_center_height,
    ) in EXPECTED_BIT_FLIGHT_BANDS:
        band_key = (zone_id, band_id)
        require(band_key not in band_keys, f"飛行帯IDが重複しています: {band_key}")
        band_keys.add(band_key)
        blocker_name = bit_flight_obstacle_name(zone_id, band_id)
        expected_bit_names.add(walkable_name)
        expected_bit_names.add(blocker_name)
        nav_sources = [
            (walkable_name, "walkable"),
            (blocker_name, "blocker"),
        ]
        center_height = (
            minimum_center_height + maximum_center_height
        ) / 2.0
        for object_name, nav_role in nav_sources:
            obj = objects_by_name.get(object_name)
            require(
                obj is not None and obj.type == "MESH",
                f"ビット用NAV生成元がありません: {object_name}",
            )
            require_exact_hs_properties(
                object_name,
                obj,
                bit_flight_nav_properties(
                    zone_id,
                    band_id,
                    space_kind,
                    minimum_center_height,
                    maximum_center_height,
                    nav_role,
                ),
            )
            minimum, maximum = world_bounds(obj)
            if nav_role == "walkable":
                require(
                    minimum.z >= minimum_center_height - 1e-5
                    and maximum.z <= maximum_center_height + 1e-5
                    and minimum.z <= center_height + 1e-5
                    and maximum.z >= center_height - 1e-5,
                    f"ビット用walkableが許可高度内で帯中心と交差しません: "
                    f"{object_name}/{minimum.z}..{maximum.z}",
                )
            else:
                require(
                    minimum.z < center_height < maximum.z,
                    f"ビット用blockerが帯中心高度を横断しません: "
                    f"{object_name}/{minimum.z}..{maximum.z}",
                )
                require(
                    len(obj.data.vertices) >= 8,
                    f"ビット用blockerが空です: {object_name}",
                )
                audit_bit_flight_obstacle_geometry(
                    object_name,
                    expected_bit_flight_obstacle_bounds(
                        objects_by_name,
                        zone_id,
                        band_id,
                        center_height,
                    ),
                )
    actual_bit_names = {
        obj.name for obj in objects if obj.name.startswith("NAV_BitFlight_")
    }
    require(
        actual_bit_names == expected_bit_names,
        "ビット用NAV生成元が学校11帯walkable＋11帯blockerと一致しません: "
        f"missing={sorted(expected_bit_names - actual_bit_names)} / "
        f"unexpected={sorted(actual_bit_names - expected_bit_names)}",
    )

    expected_transitions = expected_bit_flight_transitions()
    actual_transition_names = {
        obj.name for obj in objects if obj.name.startswith("VOL_BitFlight_")
    }
    require(
        actual_transition_names == set(expected_transitions),
        "ビット遷移Volumeが承認済み15件と一致しません: "
        f"missing={sorted(set(expected_transitions) - actual_transition_names)} / "
        f"unexpected={sorted(actual_transition_names - set(expected_transitions))}",
    )
    transition_kind_counts = Counter()
    transition_ids = set()
    for object_name, (expected_properties, expected_bounds) in expected_transitions.items():
        obj = objects_by_name[object_name]
        require(obj.type == "MESH", f"ビット遷移VolumeがMeshではありません: {object_name}")
        require_exact_hs_properties(object_name, obj, expected_properties)
        transition_id = expected_properties["hs_id"]
        require(
            transition_id not in transition_ids,
            f"ビット遷移IDが重複しています: {transition_id}",
        )
        transition_ids.add(transition_id)
        transition_kind_counts[expected_properties["hs_transition_kind"]] += 1
        actual_minimum, actual_maximum = world_bounds(obj)
        expected_minimum = Vector(expected_bounds[0])
        expected_maximum = Vector(expected_bounds[1])
        require(
            (actual_minimum - expected_minimum).length <= 1e-5
            and (actual_maximum - expected_maximum).length <= 1e-5,
            f"ビット遷移Volume境界が不正です: {object_name}",
        )
        route_points_json = expected_properties.get("hs_route_points_json")
        if route_points_json is not None:
            for route_point in json.loads(route_points_json):
                point = Vector(route_point)
                require(
                    all(
                        actual_minimum[axis] - 1e-5
                        <= point[axis]
                        <= actual_maximum[axis] + 1e-5
                        for axis in range(3)
                    ),
                    f"遷移route pointがVolume外です: {object_name}/{route_point}",
                )
    require(
        transition_kind_counts
        == Counter({"surface-route": 10, "vertical": 4, "boundary": 1}),
        f"ビット遷移方式の件数が不正です: {transition_kind_counts}",
    )

    bit_spawn = objects_by_name.get("VOL_BitSpawn_Courtyard")
    require(
        bit_spawn is not None
        and bit_spawn.get("hs_role") == "bit_spawn"
        and bit_spawn.get("hs_zone_id") == "school-exterior"
        and bit_spawn.get("hs_band_id") == "outdoor-f1",
        "ビットspawnが学校屋外F1飛行帯へ結び付いていません",
    )

    boundary = objects_by_name.get("BND_Stage")
    require(boundary is not None, "BND_Stageがありません")
    boundary_minimum, boundary_maximum = world_bounds(boundary)
    require(
        abs(boundary_minimum.y + 14.3) <= 1e-5
        and abs(boundary_maximum.z - 19.0) <= 1e-5,
        "BND_Stage南端がY=-14.3mまたは上端が19.0mではありません",
    )
    rooftop_band = next(
        band
        for band in EXPECTED_BIT_FLIGHT_BANDS
        if band[2] == "roof-flight"
    )
    rooftop_center_maximum = rooftop_band[5]
    require(
        abs(rooftop_center_maximum - 18.0) <= 1e-9,
        "屋上帯の中心高度上限が18.0mではありません",
    )
    require(
        rooftop_center_maximum + BIT_FLIGHT_SAFETY_ENVELOPE_METERS
        <= boundary_maximum.z + 1e-9,
        "屋上帯中心上限と0.54m安全包絡がBND_Stage上端を越えています",
    )

    return {
        "human_nav_sources": len(human_nav),
        "zones": len({zone_id for _, zone_id, *_ in EXPECTED_BIT_FLIGHT_BANDS}),
        "bands": len(EXPECTED_BIT_FLIGHT_BANDS),
        "walkable_sources": len(EXPECTED_BIT_FLIGHT_BANDS),
        "blocker_sources": len(EXPECTED_BIT_FLIGHT_BANDS),
        "rooftop_blocker_sources": 1,
        "transitions": len(expected_transitions),
        "transition_kinds": dict(sorted(transition_kind_counts.items())),
        "rooftop_center_maximum_m": rooftop_center_maximum,
        "stage_boundary_maximum_m": boundary_maximum.z,
        "safety_envelope_m": BIT_FLIGHT_SAFETY_ENVELOPE_METERS,
    }


def audit_windows(objects: list[bpy.types.Object]) -> dict[str, int]:
    names = [obj.name for obj in objects]
    frames = [obj for obj in objects if obj.name.startswith("VIS_WindowFrame_")]
    glass = [obj for obj in objects if obj.name.startswith("VIS_WindowGlass_")]
    actor = [obj for obj in objects if obj.name.startswith("COL_ActorOnly_Window_")]
    fixed_actor = [
        obj for obj in objects if obj.name.startswith("COL_ActorOnly_WindowFixed_")
    ]
    human = [obj for obj in objects if obj.name.startswith("COL_HumanOnly_Window_")]
    expected_frames = 81
    expected_actor = 33
    expected_fixed = 48
    expected_human = 57
    require(len(frames) == expected_frames, f"窓枠が{expected_frames}件ではありません: {len(frames)}")
    require(len(glass) == expected_frames, f"窓ガラスが{expected_frames}件ではありません: {len(glass)}")
    require(len(actor) == expected_actor, f"ActorOnly窓が{expected_actor}件ではありません: {len(actor)}")
    require(
        len(fixed_actor) == expected_fixed,
        f"開放窓帯の固定ガラスColliderが{expected_fixed}件ではありません: {len(fixed_actor)}",
    )
    require(len(human) == expected_human, f"HumanOnly窓が{expected_human}件ではありません: {len(human)}")
    expected_human_names = {
        f"COL_HumanOnly_Window_{suffix}_U{unit_index:02d}"
        for suffix, unit_indices in EXPECTED_OPEN_UNITS.items()
        for unit_index in unit_indices
    }
    require(
        {obj.name for obj in human} == expected_human_names,
        "HumanOnly窓の開放ユニットが承認済み57か所と一致しません",
    )
    expected_fixed_names = {
        f"COL_ActorOnly_WindowFixed_{suffix}" for suffix in EXPECTED_OPEN_UNITS
    }
    require(
        {obj.name for obj in fixed_actor} == expected_fixed_names,
        "開放窓帯の固定ガラスColliderが承認済み48窓帯と一致しません",
    )
    frame_suffixes = {
        frame.name.removeprefix("VIS_WindowFrame_") for frame in frames
    }
    expected_actor_names = {
        f"COL_ActorOnly_Window_{suffix}"
        for suffix in frame_suffixes - set(EXPECTED_OPEN_UNITS)
    }
    require(
        {obj.name for obj in actor} == expected_actor_names,
        "全閉窓帯のActorOnly Colliderが承認内容と一致しません",
    )
    require(
        not any("Gym_South" in name for name in names),
        "体育館南面に窓関連Objectがあります",
    )
    require(
        not any("Broken" in name or "Damaged" in name for name in names),
        "破損窓が存在します",
    )
    for collider in human:
        minimum, maximum = world_bounds(collider)
        dimensions = sorted((maximum - minimum))
        require(
            dimensions[1] >= 1.20 - 1e-5 and dimensions[2] >= 1.80 - 1e-5,
            f"通過窓の有効開口が1.20m×1.80m未満です: {collider.name}",
        )
        require(
            dimensions[1] / 2 >= 0.54 and dimensions[2] / 2 >= 0.54,
            f"通過窓が半径0.54m包絡を満たしません: {collider.name}",
        )
    open_leaf_sides = Counter()
    for frame in frames:
        require(frame.get("hs_window_layout_status") == "final", f"窓の最終配置状態が不正です: {frame.name}")
        if frame.name == "VIS_WindowFrame_GymStorage_North_01":
            require(frame.get("hs_window_style") == "small_fixed", "体育倉庫小窓の様式が不正です")
            require(frame.get("hs_window_panes") == 1, "体育倉庫小窓が1枚ではありません")
            continue
        is_stair_window = "_Stair" in frame.name
        suffix = frame.name.removeprefix("VIS_WindowFrame_")
        units = frame.get("hs_window_units")
        expected_unit_counts = (
            {3}
            if suffix in SHORTENED_CONNECTION_WINDOW_SUFFIXES
            else {1, 2, 4}
        )
        require(
            units in expected_unit_counts,
            f"窓帯の2枚ユニット数が不正です: "
            f"{frame.name}={units}/expected={sorted(expected_unit_counts)}",
        )
        require(
            frame.get("hs_window_style")
            == ("paired_stair_transom" if is_stair_window else "paired_sliding_band"),
            f"窓帯の様式が不正です: {frame.name}",
        )
        expected_unit_width = 1.80 if is_stair_window else 2.40
        require(
            abs(frame.get("hs_window_unit_width_m") - expected_unit_width) <= 1e-5,
            f"窓の2枚ユニット幅が用途別規格と一致しません: {frame.name}",
        )
        expected_clear_height = 0.70 if is_stair_window else 1.80
        require(
            abs(frame.get("hs_window_clear_height_m") - expected_clear_height) <= 1e-5,
            f"窓1枚の高さが用途別規格と一致しません: {frame.name}",
        )
        if "_Stair" in frame.name:
            expected_panes = 2
        elif frame.name == "VIS_WindowFrame_F01_CourtyardNorth_Corridor_03":
            expected_panes = 2
        elif suffix in SHORTENED_CONNECTION_WINDOW_SUFFIXES:
            expected_panes = 6
        elif any(token in frame.name for token in ("_Ordinary_", "_West_Special_", "_CourtyardNorth_Corridor_", "Gym_")):
            expected_panes = 8
        else:
            expected_panes = 4
        require(frame.get("hs_window_panes") == expected_panes, f"用途別の窓枚数が不正です: {frame.name}")
        open_leaf_text = frame.get("hs_window_open_leaves")
        open_leaf_numbers = tuple(
            int(value) for value in open_leaf_text.split(",") if value
        )
        open_leaf_sides.update("L" if leaf_number % 2 else "R" for leaf_number in open_leaf_numbers)
        open_unit_numbers = tuple((leaf_number - 1) // 2 + 1 for leaf_number in open_leaf_numbers)
        require(
            open_unit_numbers == EXPECTED_OPEN_UNITS.get(suffix, ()),
            f"窓帯の開放ユニットが承認内容と一致しません: {frame.name}={open_unit_numbers}",
        )
        minimum, maximum = world_bounds(frame)
        dimensions = sorted(maximum - minimum)
        require(
            dimensions[1] >= expected_clear_height - 1e-5,
            f"窓帯高さが不足しています: {frame.name}",
        )
    total_window_panes = sum(int(frame.get("hs_window_panes")) for frame in frames)
    require(
        total_window_panes == 403,
        f"2階・3階接続窓の短縮後pane総数が403枚ではありません: "
        f"{total_window_panes}",
    )
    connection_portal_intersections = 0
    for suffix, (portal_bounds, human_name) in (
        SHORTENED_CONNECTION_WINDOW_PORTALS.items()
    ):
        frame_name = f"VIS_WindowFrame_{suffix}"
        glass_name = f"VIS_WindowGlass_{suffix}"
        fixed_name = f"COL_ActorOnly_WindowFixed_{suffix}"
        frame = bpy.data.objects.get(frame_name)
        glass_object = bpy.data.objects.get(glass_name)
        fixed_object = bpy.data.objects.get(fixed_name)
        human_object = bpy.data.objects.get(human_name)
        require(
            all(
                obj is not None
                for obj in (frame, glass_object, fixed_object, human_object)
            ),
            f"2階・3階接続窓の構成Objectが不足しています: {suffix}",
        )
        frame_minimum, frame_maximum = world_bounds(frame)
        glass_minimum, glass_maximum = world_bounds(glass_object)
        fixed_minimum, fixed_maximum = world_bounds(fixed_object)
        require(
            abs((frame_minimum.x + frame_maximum.x) / 2 - 35.75)
            <= TOLERANCE
            and abs(frame_minimum.x - 32.10) <= TOLERANCE
            and abs(frame_maximum.x - 39.40) <= TOLERANCE,
            f"接続窓の3連外枠位置が不正です: "
            f"{frame_name}/{frame_minimum.x}..{frame_maximum.x}",
        )
        require(
            abs(glass_minimum.x - 32.15) <= TOLERANCE
            and abs(glass_maximum.x - 39.35) <= TOLERANCE
            and abs(fixed_minimum.x - 32.15) <= TOLERANCE
            and abs(fixed_maximum.x - 39.35) <= TOLERANCE,
            f"接続窓のガラスまたは固定Colliderが開口端X=39.4mを越えています: "
            f"{suffix}",
        )
        for obj in (frame, glass_object, fixed_object, human_object):
            minimum, maximum = world_bounds(obj)
            intersects_portal = all(
                interval_overlaps(
                    (minimum[axis], maximum[axis]),
                    (portal_bounds[0][axis], portal_bounds[1][axis]),
                )
                for axis in range(3)
            )
            connection_portal_intersections += int(intersects_portal)
            require(
                not intersects_portal,
                f"接続窓Objectが固定開放portalと交差しています: "
                f"{obj.name}/{portal_bounds}",
            )
    require(
        connection_portal_intersections == 0,
        f"2階・3階接続portalとの窓交差が0件ではありません: "
        f"{connection_portal_intersections}",
    )
    require(open_leaf_sides == Counter({"R": 30, "L": 27}), f"開放羽の左右数が不正です: {open_leaf_sides}")
    if bpy.context.scene.get("b03_window_layout_status") == "final":
        frame_names = {frame.name for frame in frames}
        required_stairs = {
            "VIS_WindowFrame_F01_West_StairSW",
            "VIS_WindowFrame_F02_West_StairSW",
            "VIS_WindowFrame_F03_West_StairSW",
            "VIS_WindowFrame_F01_North_StairNE",
            "VIS_WindowFrame_F02_North_StairNE",
            "VIS_WindowFrame_F03_North_StairNE",
            "VIS_WindowFrame_F01_North_StairNW",
            "VIS_WindowFrame_F02_North_StairNW",
            "VIS_WindowFrame_F03_North_StairNW",
            "VIS_WindowFrame_F04_North_StairNW",
        }
        require(required_stairs.issubset(frame_names), "階段踊り場正面の2枚窓が不足しています")
        require(not any("_South_" in name or "WestSouth" in name for name in frame_names), "西側校舎南壁に窓があります")
        require(not any("WestNorth" in name or "_East_01" in name and name.startswith("VIS_WindowFrame_F") for name in frame_names), "階段段の横壁に窓があります")
        require(sum("_Ordinary_" in name for name in frame_names) == 10, "普通教室の8枚連続窓帯が10室分ではありません")
        require(sum("_West_Special_" in name for name in frame_names) == 1, "西側1階特別区画の8枚窓が不正です")
        require(sum("F01_North_Special_" in name for name in frame_names) == 6, "1階北側特別教室の4枚窓3組が不正です")
        require(sum("F02_North_Special_" in name for name in frame_names) == 3, "2階理科室の4枚窓3組が不正です")
        require(sum("F02_North_StudentCouncil_" in name for name in frame_names) == 1, "2階生徒会室の4枚窓が不正です")
        require(sum("F02_North_Broadcast_" in name for name in frame_names) == 1, "2階放送室の4枚窓が不正です")
        require(sum("F03_North_Special_" in name for name in frame_names) == 6, "3階特別教室の4枚窓3組が不正です")
        require(sum("F04_North_Special_" in name for name in frame_names) == 6, "4階特別教室の4枚窓3組が不正です")
        require(sum("_CourtyardWest_Corridor_" in name for name in frame_names) == 19, "西側校舎廊下の4枚窓帯数が不正です")
        require(sum("_CourtyardNorth_Corridor_" in name for name in frame_names) == 11, "北側校舎廊下の窓帯数が不正です")
        require(sum(name.startswith("VIS_WindowFrame_Gym_") for name in frame_names) == 6, "体育館8枚窓帯の配置数が不正です")
        require("VIS_WindowFrame_Gym_North_01" not in frame_names, "体育館北面西側の6m壁区画に窓があります")
        require("VIS_WindowFrame_Gym_North_02" not in frame_names, "撤去指定の体育館北面窓が残っています")
        require("VIS_WindowFrame_GymStorage_North_01" in frame_names, "体育倉庫の閉小窓がありません")
        require(not any("_Toilet" in name for name in frame_names), "トイレに窓があります")
        ordinary_frames = sorted(
            (frame for frame in frames if "_West_Ordinary_Room" in frame.name),
            key=lambda frame: frame.name,
        )
        require(len(ordinary_frames) == 10, "普通教室の8枚窓帯が10室ではありません")
        require(
            all(frame.get("hs_window_units") == 4 for frame in ordinary_frames),
            "普通教室窓が4ユニットの連続8枚窓帯ではありません",
        )
        for floor in (2, 3, 4):
            floor_frames = [
                frame for frame in ordinary_frames if f"F{floor:02d}_" in frame.name
            ]
            intervals = sorted(
                (world_bounds(frame)[0].y, world_bounds(frame)[1].y)
                for frame in floor_frames
            )
            require(
                all(abs(right[0] - left[1] - 0.30) <= 1e-5 for left, right in zip(intervals, intervals[1:])),
                f"{floor}階普通教室間の構造柱幅が0.30mではありません: {intervals}",
            )
        expected_stair_heights = {
            "F01": 4.20,
            "F02": 7.80,
            "F03": 11.40,
            "F04": 15.00,
        }
        landing_floor_heights = {
            "F01": 2.4,
            "F02": 6.0,
            "F03": 9.6,
            "F04": 13.2,
        }
        expected_sill_heights = {
            "F01": 1.45,
            "F02": 1.45,
            "F03": 1.45,
            "F04": 1.45,
        }
        upper_slabs = {
            "F01": "COL_B03_Floor_F02",
            "F02": "COL_B03_Floor_F03",
            "F03": "COL_B03_Floor_F04",
            "F04": "COL_Roof_North",
        }
        for frame in frames:
            if "_Stair" not in frame.name:
                continue
            floor_key = frame.name.split("_", 3)[2]
            minimum, maximum = world_bounds(frame)
            require(abs((minimum.z + maximum.z) / 2 - expected_stair_heights[floor_key]) <= 1e-5, f"階段踊り場窓が半階高さではありません: {frame.name}")
            glass_name = frame.name.replace("VIS_WindowFrame_", "VIS_WindowGlass_", 1)
            stair_glass = bpy.data.objects.get(glass_name)
            require(stair_glass is not None, f"階段踊り場窓のガラスがありません: {frame.name}")
            glass_minimum, glass_maximum = world_bounds(stair_glass)
            sill_height = glass_minimum.z - landing_floor_heights[floor_key]
            require(abs(sill_height - expected_sill_heights[floor_key]) <= 1e-5, f"階段踊り場窓の腰壁高が不正です: {frame.name}={sill_height}")
            slab = bpy.data.objects.get(upper_slabs[floor_key])
            require(slab is not None, f"階段窓の上階床スラブがありません: {frame.name}")
            slab_minimum, slab_maximum = world_bounds(slab)
            separated_below = glass_maximum.z <= slab_minimum.z - 0.049
            separated_above = glass_minimum.z >= slab_maximum.z + 0.149
            require(separated_below or separated_above, f"階段窓から床スラブ側面が見えます: {frame.name}")
        stair_window_centers = sorted(expected_stair_heights.values())
        stair_window_gaps = [
            round(right - left, 2)
            for left, right in zip(stair_window_centers, stair_window_centers[1:])
        ]
        require(stair_window_gaps == [3.6, 3.6, 3.6], f"踊り場窓の中心間隔が3.6mではありません: {stair_window_gaps}")
        gym_west_centers = []
        gym_east_centers = []
        for side, centers in (("West", gym_west_centers), ("East", gym_east_centers)):
            for index in (1, 2, 3):
                frame = bpy.data.objects.get(f"VIS_WindowFrame_Gym_{side}_{index:02d}")
                require(frame is not None, f"体育館{side}面の窓が不足しています")
                minimum, maximum = world_bounds(frame)
                centers.append(round((minimum.y + maximum.y) / 2, 3))
        require(gym_west_centers == [-4.425, 7.5, 19.425], f"体育館西面の窓が壁面均等配置ではありません: {gym_west_centers}")
        require(gym_east_centers == gym_west_centers, f"体育館東西面の窓位置が一致しません: east={gym_east_centers}, west={gym_west_centers}")
        gym_intervals = []
        for index in (1, 2, 3):
            frame = bpy.data.objects[f"VIS_WindowFrame_Gym_West_{index:02d}"]
            minimum, maximum = world_bounds(frame)
            gym_intervals.append((minimum.y, maximum.y))
        gym_gaps = [
            gym_intervals[0][0] - (-11.5),
            gym_intervals[1][0] - gym_intervals[0][1],
            gym_intervals[2][0] - gym_intervals[1][1],
            26.5 - gym_intervals[2][1],
        ]
        require(max(gym_gaps) - min(gym_gaps) <= 1e-5, f"体育館窓の端部余白と組間隔が均等ではありません: {gym_gaps}")
        expected_storeys = {
            1: (0.0, 3.6),
            2: (3.6, 7.2),
            3: (7.2, 10.8),
            4: (10.8, 15.7),
        }
        for floor, (expected_minimum_z, expected_maximum_z) in expected_storeys.items():
            exterior = bpy.data.objects.get(f"VIS_B03_ExteriorWalls_F{floor:02d}")
            require(exterior is not None, f"{floor}階校舎外壁がありません")
            minimum, maximum = world_bounds(exterior)
            require(abs(minimum.z - expected_minimum_z) <= 1e-5, f"{floor}階外壁の開始高が不正です")
            require(abs(maximum.z - expected_maximum_z) <= 1e-5, f"{floor}階外壁の終了高が不正です")
        expected_floor_tops = {2: 3.6, 3: 7.2, 4: 10.8}
        for floor, expected_top in expected_floor_tops.items():
            floor_object = bpy.data.objects.get(f"COL_B03_Floor_F{floor:02d}")
            require(floor_object is not None, f"{floor}階床がありません")
            _, maximum = world_bounds(floor_object)
            require(abs(maximum.z - expected_top) <= 1e-5, f"{floor}階床高が3.6m階高規則と一致しません")
        for stair in ("NW", "NE", "SW"):
            transitions = [("2FTo3F", 3.6), ("3FTo4F", 7.2)]
            if stair == "NW":
                transitions.append(("4FToRooftop", 10.8))
            for suffix, base_z in transitions:
                stairs = bpy.data.objects.get(f"VIS_StairSystem_{stair}_{suffix}")
                require(stairs is not None, f"上階階段がありません: {stair}/{suffix}")
                horizontal_levels = set()
                for polygon in stairs.data.polygons:
                    normal = stairs.matrix_world.to_3x3() @ polygon.normal
                    if normal.z < 0.98:
                        continue
                    points = [stairs.matrix_world @ stairs.data.vertices[index].co for index in polygon.vertices]
                    horizontal_levels.add(round(max(point.z for point in points), 2))
                expected_steps = {round(base_z + 0.15 * index, 2) for index in range(1, 25)}
                require(expected_steps.issubset(horizontal_levels), f"上階階段が24段・蹴上0.15mではありません: {stair}/{suffix}")
                require(round(base_z + 2.4, 2) in horizontal_levels, f"上階階段の16段目に踊り場がありません: {stair}/{suffix}")
        storage_bounds = {
            "VIS_StairStorageShell_NW": ((-9.0, 38.9, 0.0), (-6.75, 43.1, 3.5)),
            "COL_StairStorageShell_NW": ((-9.0, 38.9, 0.0), (-6.75, 43.1, 3.5)),
            "VIS_StairLanding_NW": ((-12.6, 43.1, 2.3), (-6.6, 45.5, 2.4)),
            "COL_StairLanding_NW": ((-12.6, 43.1, 2.3), (-6.6, 45.5, 2.4)),
        }
        for object_name, (expected_minimum, expected_maximum) in storage_bounds.items():
            storage_object = bpy.data.objects.get(object_name)
            require(storage_object is not None, f"北西階段下倉庫の確定形状がありません: {object_name}")
            minimum, maximum = world_bounds(storage_object)
            require(
                all(abs(minimum[index] - expected_minimum[index]) <= 1e-5 for index in range(3))
                and all(abs(maximum[index] - expected_maximum[index]) <= 1e-5 for index in range(3)),
                f"北西階段下倉庫または1階踊り場の確定範囲が変わっています: {object_name}",
            )
        student_council = bpy.data.objects.get("VIS_WindowFrame_F02_North_StudentCouncil_Set01")
        require(student_council is not None, "2階生徒会室窓がありません")
        student_minimum, student_maximum = world_bounds(student_council)
        require(abs((student_minimum.x + student_maximum.x) / 2 - 9.9) <= 1e-5, "2階生徒会室窓が正しい区画中心にありません")
        for floor in (3, 4):
            centers = []
            for set_index in (1, 2, 3):
                frame = bpy.data.objects.get(f"VIS_WindowFrame_F{floor:02d}_North_Special_Room01_Set{set_index:02d}")
                require(frame is not None, f"{floor}階西側特別教室窓が不足しています")
                minimum, maximum = world_bounds(frame)
                centers.append(round((minimum.x + maximum.x) / 2, 1))
            require(centers == [8.8, 14.4, 20.0], f"{floor}階西側特別教室窓が正しい区画にありません: {centers}")
        expected_courtyard_west_centers = {
            1: [7.683, 14.5, 21.317, 28.133],
            2: [0.867, 7.683, 14.5, 21.317, 28.133],
            3: [0.867, 7.683, 14.5, 21.317, 28.133],
            4: [0.867, 7.683, 14.5, 21.317, 28.133],
        }
        for floor in (1, 2, 3, 4):
            corridor_frames = [
                frame
                for frame in frames
                if f"F{floor:02d}_CourtyardWest_Corridor_" in frame.name
            ]
            intervals = sorted((world_bounds(frame)[0].y, world_bounds(frame)[1].y) for frame in corridor_frames)
            centers = [round((minimum + maximum) / 2, 3) for minimum, maximum in intervals]
            require(
                centers == expected_courtyard_west_centers[floor],
                f"{floor}階西側廊下窓が上階基準の中心線と一致しません: {centers}",
            )
            require(all(right[0] - left[1] >= 1.90 - 1e-5 for left, right in zip(intervals, intervals[1:])), f"{floor}階西側廊下窓間の柱幅が不足しています")
        for floor in (1, 2, 3, 4):
            centers = []
            indices = (2, 3) if floor == 1 else (1, 2, 3)
            for index in indices:
                frame = bpy.data.objects.get(f"VIS_WindowFrame_F{floor:02d}_CourtyardNorth_Corridor_{index:02d}")
                require(frame is not None, f"{floor}階北側廊下窓が不足しています: {index}")
                minimum, maximum = world_bounds(frame)
                centers.append(round((minimum.x + maximum.x) / 2, 3))
            if floor == 1:
                expected_centers = [23.7, 37.85]
            elif floor in (2, 3):
                expected_centers = [9.55, 23.7, 35.75]
            else:
                expected_centers = [9.55, 23.7, 37.85]
            require(centers == expected_centers, f"{floor}階北側廊下窓が上階基準の中心線と一致しません: {centers}")
        door_intervals = {
            "F01_North_": ((2.4, 5.4, 0.0, 2.4),),
            "F01_CourtyardNorth_": ((0.15, 5.4, 0.0, 2.4), (39.4, 43.4, 0.0, 2.4)),
            "F01_CourtyardWest_": ((-2.5, 2.5, 0.0, 2.4),),
            "Gym_West_": ((5.0, 8.0, 0.0, 2.4),),
            "Gym_North_": ((39.4, 43.4, 0.0, 2.4), (51.4, 57.4, 0.0, 2.3)),
        }
        for frame in frames:
            key = next((candidate for candidate in door_intervals if candidate in frame.name), None)
            if key is None:
                continue
            minimum, maximum = world_bounds(frame)
            window_interval = (minimum.x, maximum.x) if "North_" in key else (minimum.y, maximum.y)
            for door_interval in door_intervals[key]:
                horizontal_overlap = max(window_interval[0], door_interval[0]) < min(window_interval[1], door_interval[1]) - 1e-5
                vertical_overlap = max(minimum.z, door_interval[2]) < min(maximum.z, door_interval[3]) - 1e-5
                require(
                    not (horizontal_overlap and vertical_overlap),
                    f"窓が出入口へ干渉しています: {frame.name}",
                )
    return {
        "frames": len(frames),
        "glass": len(glass),
        "actor_only": len(actor),
        "actor_only_fixed": len(fixed_actor),
        "human_only": len(human),
        "panes": total_window_panes,
        "connection_portal_intersections": connection_portal_intersections,
    }


def audit_assembly_venues(objects: list[bpy.types.Object]) -> None:
    object_by_name = {obj.name: obj for obj in objects}
    require(
        not any(name in bpy.data.objects for name in ASSEMBLY_GUIDE_NAMES),
        "集合会場の旧VIS_*ガイドが残っています",
    )
    expected_anchor_names = {
        f"MRK_AssemblyAnchor_{suffix}"
        for suffix, *_ in ASSEMBLY_VENUE_SPECS
    }
    expected_volume_names = {
        f"VOL_Assembly_{suffix}"
        for suffix, *_ in ASSEMBLY_VENUE_SPECS
    }
    actual_anchor_names = {
        obj.name
        for obj in objects
        if obj.get("hs_role") == "assembly_anchor"
    }
    actual_volume_names = {
        obj.name
        for obj in objects
        if obj.get("hs_role") == "assembly"
    }
    require(
        actual_anchor_names == expected_anchor_names,
        f"集合会場anchor構成が不正です: {sorted(actual_anchor_names)}",
    )
    require(
        actual_volume_names == expected_volume_names,
        f"集合会場Volume構成が不正です: {sorted(actual_volume_names)}",
    )

    for (
        suffix,
        anchor_id,
        volume_id,
        anchor_position,
        grid_spec,
        volume_bounds,
    ) in ASSEMBLY_VENUE_SPECS:
        anchor_name = f"MRK_AssemblyAnchor_{suffix}"
        volume_name = f"VOL_Assembly_{suffix}"
        anchor = object_by_name[anchor_name]
        volume = object_by_name[volume_name]
        require(anchor.type == "EMPTY", f"集合会場anchorがEmptyではありません: {anchor_name}")
        require(volume.type == "MESH", f"集合会場VolumeがMeshではありません: {volume_name}")
        require(
            (anchor.matrix_world.translation - Vector(anchor_position)).length
            <= TOLERANCE,
            f"集合会場anchor位置が不正です: {anchor_name}",
        )
        require(
            sum(abs(value) for value in anchor.rotation_euler) <= TOLERANCE,
            f"集合会場anchor回転がidentityではありません: {anchor_name}",
        )
        require(
            (anchor.scale - Vector((1.0, 1.0, 1.0))).length <= TOLERANCE,
            f"集合会場anchor scaleが1ではありません: {anchor_name}",
        )
        expected_anchor_properties = expected_assembly_anchor_properties(
            anchor_id,
            anchor_position,
            grid_spec,
        )
        require_exact_hs_properties(
            anchor_name,
            anchor,
            expected_anchor_properties,
        )
        require_exact_hs_properties(
            volume_name,
            volume,
            {
                "hs_id": volume_id,
                "hs_role": "assembly",
                "hs_anchor_id": anchor_id,
            },
        )
        actual_minimum, actual_maximum = world_bounds(volume)
        expected_minimum, expected_maximum = map(Vector, volume_bounds)
        require(
            (actual_minimum - expected_minimum).length <= TOLERANCE
            and (actual_maximum - expected_maximum).length <= TOLERANCE,
            f"集合会場Volume境界が不正です: {volume_name}",
        )

        position_groups = (
            (
                "hs_assembly_positions_json",
                100,
            ),
            (
                "hs_execution_audience_positions_json",
                94,
            ),
            (
                "hs_execution_target_positions_json",
                6,
            ),
        )
        for property_name, expected_length in position_groups:
            positions = require_finite_position_array_json(
                f"{anchor_name}.{property_name}",
                anchor.get(property_name),
                expected_length,
            )
            for position in positions:
                point = Vector(position)
                require(
                    all(
                        expected_minimum[axis] - TOLERANCE
                        <= point[axis]
                        <= expected_maximum[axis] + TOLERANCE
                        for axis in range(3)
                    ),
                    f"作者座標が集合会場Volumeの外側です: {anchor_name}.{property_name}",
                )


def audit_b03_3b_structure(
    objects: list[bpy.types.Object],
) -> dict[str, float | int]:
    object_by_name = {obj.name: obj for obj in objects}

    bridge_floor_components = audit_box_components(
        "COL_B03_GymBridgeFloor",
        [((39.3, 26.6, 3.45), (43.5, 32.5, 3.60))],
    )
    bridge_ceiling_components = audit_box_components(
        "COL_B03_GymBridgeCeiling",
        [((39.3, 26.65, 6.60), (43.5, 32.35, 7.05))],
    )
    bridge_envelope_components = audit_box_components(
        "COL_B03_GymBridgeEnvelope",
        [
            ((39.3, 26.70, 3.60), (39.4, 32.30, 6.60)),
            ((43.4, 26.70, 3.60), (43.5, 32.30, 6.60)),
            ((39.30, 32.30, 3.60), (39.40, 32.35, 4.35)),
            ((39.30, 32.30, 4.35), (39.40, 32.40, 6.25)),
            ((39.30, 32.30, 6.25), (39.40, 32.35, 6.60)),
            ((43.40, 32.30, 3.60), (43.50, 32.35, 6.60)),
        ],
    )
    bridge_frame_expected = [
        ((39.3, 26.70, 3.60), (39.4, 32.30, 4.40)),
        ((39.3, 26.70, 6.10), (39.4, 32.30, 6.60)),
        ((39.3, 28.50, 4.40), (39.4, 28.60, 6.10)),
        ((39.3, 30.40, 4.40), (39.4, 30.50, 6.10)),
        ((43.4, 26.70, 3.60), (43.5, 32.30, 4.40)),
        ((43.4, 26.70, 6.10), (43.5, 32.30, 6.60)),
        ((43.4, 28.50, 4.40), (43.5, 28.60, 6.10)),
        ((43.4, 30.40, 4.40), (43.5, 30.50, 6.10)),
        ((39.30, 32.30, 3.60), (39.40, 32.35, 4.35)),
        ((39.30, 32.30, 4.35), (39.40, 32.40, 6.25)),
        ((39.30, 32.30, 6.25), (39.40, 32.35, 6.60)),
        ((43.40, 32.30, 3.60), (43.50, 32.35, 6.60)),
    ]
    audit_box_components(
        "VIS_B03_GymBridgeWindowFrames",
        bridge_frame_expected,
    )
    bridge_glass_expected = [
        ((39.3375, 26.75, 4.40), (39.3625, 28.50, 6.10)),
        ((39.3375, 28.60, 4.40), (39.3625, 30.40, 6.10)),
        ((39.3375, 30.50, 4.40), (39.3625, 32.25, 6.10)),
        ((43.4375, 26.75, 4.40), (43.4625, 28.50, 6.10)),
        ((43.4375, 28.60, 4.40), (43.4625, 30.40, 6.10)),
        ((43.4375, 30.50, 4.40), (43.4625, 32.25, 6.10)),
    ]
    audit_box_components(
        "VIS_B03_GymBridgeWindowGlass",
        bridge_glass_expected,
    )
    visual_bridge_floor = object_by_name.get("VIS_B03_GymBridgeFloor")
    require(
        visual_bridge_floor is not None
        and visual_bridge_floor.type == "MESH"
        and len(visual_bridge_floor.data.vertices) == 8
        and len(visual_bridge_floor.data.polygons) == 4,
        "渡り廊下床VISがY端面を除いた4面の単一Meshではありません",
    )
    bridge_floor_end_faces = [
        polygon.index
        for polygon in visual_bridge_floor.data.polygons
        if any(
            all(
                abs(
                    (
                        visual_bridge_floor.matrix_world
                        @ visual_bridge_floor.data.vertices[index].co
                    ).y
                    - endpoint_y
                )
                <= TOLERANCE
                for index in polygon.vertices
            )
            for endpoint_y in (26.6, 32.5)
        )
    ]
    require(
        not bridge_floor_end_faces,
        f"渡り廊下床VISの接続端に重複面があります: {bridge_floor_end_faces}",
    )
    bridge_clear_width = 43.4 - 39.4
    require(
        abs(bridge_clear_width - 4.0) <= TOLERANCE,
        f"渡り廊下の有効幅が4.0mではありません: {bridge_clear_width:.3f}m",
    )
    require_architecture_swatch("VIS_B03_GymBridgeFloor", "gym_floor")
    bridge_school_floor_joint = audit_box_components(
        "VIS_B03_GymBridgeSchoolFloorJoint",
        [((39.3, 32.5, 3.45), (43.5, 32.65, 3.60))],
    )
    require(
        len(bpy.data.objects["VIS_B03_GymBridgeSchoolFloorJoint"].data.polygons)
        == 4,
        "校舎側の茶色床接続帯に不要な端面があります",
    )
    require_architecture_swatch(
        "VIS_B03_GymBridgeSchoolFloorJoint",
        "gym_floor",
    )
    for object_name in (
        "VIS_B03_GymBridgeCeiling",
        "VIS_B03_GymBridgeWindowFrames",
    ):
        require_architecture_swatch(object_name, "wall")
    for wall_name, expected_supports in (
        (
            "COL_B03_ExteriorWalls_F01",
            (
                ((39.4, 32.35, 2.4), (43.4, 32.65, 2.65)),
                ((39.4, 32.35, 2.65), (43.4, 32.65, 3.45)),
            ),
        ),
        (
            "COL_B03_GymExteriorWalls",
            (
                ((39.4, 26.35, 2.4), (43.4, 26.65, 3.45)),
            ),
        ),
    ):
        for expected_support in expected_supports:
            require_box_component(wall_name, expected_support)
        wall_components = box_component_bounds(bpy.data.objects[wall_name])
        sample_y = (
            expected_supports[0][0][1] + expected_supports[0][1][1]
        ) / 2.0
        require(
            not any(
                point_in_bounds((41.4, sample_y, 3.525), bounds)
                for bounds in wall_components
            ),
            f"2階渡り廊下接続の白い支持壁上面が茶色床と重複しています: "
            f"{wall_name}",
        )

    gallery_floor_expected = [
        ((33.6, -2.0, 5.10), (34.8, 26.4, 5.25)),
        ((58.0, -2.0, 5.10), (59.2, 26.4, 5.25)),
        ((34.8, 25.0, 5.10), (35.8, 26.6, 5.25)),
        ((39.1, 25.0, 3.45), (43.7, 26.6, 3.60)),
        ((47.0, 25.0, 5.10), (58.0, 26.6, 5.25)),
    ]
    gallery_floor_components = audit_box_components(
        "COL_B03_GymGalleryFloor",
        gallery_floor_expected,
    )
    gallery_widths = (
        34.8 - 33.6,
        59.2 - 58.0,
        26.2 - 25.0,
        26.2 - 25.0,
        26.2 - 25.0,
    )
    require(
        all(abs(width - 1.2) <= TOLERANCE for width in gallery_widths),
        f"体育館ギャラリーの有効幅が1.2mではありません: {gallery_widths}",
    )
    require(
        abs(gallery_floor_expected[3][1][2] - 3.60) <= TOLERANCE
        and all(
            abs(bounds[1][2] - 5.25) <= TOLERANCE
            for index, bounds in enumerate(gallery_floor_expected)
            if index != 3
        ),
        "体育館ギャラリーの北側中央Z=3.6mまたは東西Z=5.25mが不正です",
    )
    require(
        all(minimum[1] >= -2.0 - TOLERANCE for minimum, _ in gallery_floor_expected),
        "体育館南辺にギャラリー床が残っています",
    )

    visual_stair_object = object_by_name.get("VIS_B03_GymGalleryStairs")
    collider_stair_object = object_by_name.get("COL_B03_GymGalleryStairs")
    nav_stair_object = object_by_name.get(
        "NAV_B03_Walkable_GymGalleryStairs"
    )
    require(
        visual_stair_object is not None
        and collider_stair_object is not None
        and nav_stair_object is not None,
        "体育館ギャラリー階段のVIS/COL/NAVが不足しています",
    )
    visual_stair_components = box_component_bounds(visual_stair_object)
    collider_stair_components = box_component_bounds(collider_stair_object)
    require(
        len(visual_stair_components) == 194,
        f"体育館ギャラリー階段VISの部品数が194ではありません: "
        f"{len(visual_stair_components)}",
    )
    require(
        len(collider_stair_components) == 14,
        f"体育館ギャラリー階段COLの部品数が14ではありません: "
        f"{len(collider_stair_components)}",
    )
    visual_stair_triangles = sum(
        len(polygon.vertices) == 3
        for polygon in visual_stair_object.data.polygons
    )
    require(
        visual_stair_triangles == 0,
        f"体育館ギャラリー階段VISに三角形面があります: "
        f"{visual_stair_triangles}",
    )
    stage_stair_run_components = [
        bounds
        for bounds in visual_stair_components
        if abs(bounds[1][0] - bounds[0][0] - 1.2) <= TOLERANCE
        and abs(bounds[1][1] - bounds[0][1] - 0.40) <= TOLERANCE
        and abs(bounds[1][2] - bounds[0][2] - 0.05) <= TOLERANCE
    ]
    require(
        len(stage_stair_run_components) == 70,
        f"舞台袖内の幅1.2m階段踏面が左右35段ずつではありません: {len(stage_stair_run_components)}",
    )
    stage_stair_tops = sorted(
        {
            round(bounds[1][2], 6)
            for bounds in stage_stair_run_components
        }
    )
    require(
        len(stage_stair_tops) == 35
        and all(
            abs(stage_stair_tops[index + 1] - stage_stair_tops[index] - 0.15)
            <= TOLERANCE
            for index in range(len(stage_stair_tops) - 1)
        ),
        f"舞台袖内階段の蹴上げが0.15mではありません: {stage_stair_tops}",
    )
    north_stair_run_components = [
        bounds
        for bounds in visual_stair_components
        if abs(bounds[1][0] - bounds[0][0] - 0.3) <= TOLERANCE
        and abs(bounds[1][1] - bounds[0][1] - 1.6) <= TOLERANCE
        and abs(bounds[1][2] - bounds[0][2] - 0.05) <= TOLERANCE
    ]
    require(
        len(north_stair_run_components) == 22,
        f"北側ギャラリー昇段が左右11段ずつではありません: {len(north_stair_run_components)}",
    )
    expected_ramp_top_surfaces = {
        surface_signature(points)
        for points in (
            (
                (39.1, 25.0, 3.60),
                (39.1, 26.6, 3.60),
                (35.8, 26.6, 5.25),
                (35.8, 25.0, 5.25),
            ),
            (
                (43.7, 25.0, 3.60),
                (47.0, 25.0, 5.25),
                (47.0, 26.6, 5.25),
                (43.7, 26.6, 3.60),
            ),
            (
                (34.8, -3.80, 0.15),
                (34.8, -10.20, 2.55),
                (36.0, -10.20, 2.55),
                (36.0, -3.80, 0.15),
            ),
            (
                (33.6, -10.20, 2.55),
                (33.6, -3.00, 5.25),
                (34.8, -3.00, 5.25),
                (34.8, -10.20, 2.55),
            ),
            (
                (56.8, -3.80, 0.15),
                (56.8, -10.20, 2.55),
                (58.0, -10.20, 2.55),
                (58.0, -3.80, 0.15),
            ),
            (
                (58.0, -10.20, 2.55),
                (58.0, -3.00, 5.25),
                (59.2, -3.00, 5.25),
                (59.2, -10.20, 2.55),
            ),
        )
    }
    expected_ramp_bottom_surfaces = {
        surface_signature(
            tuple(
                (x, y, z - 0.15)
                for x, y, z in surface
            )
        )
        for surface in expected_ramp_top_surfaces
    }
    require(
        sloped_surface_signatures(visual_stair_object)
        == expected_ramp_top_surfaces | expected_ramp_bottom_surfaces,
        "体育館ギャラリー階段VISの6傾斜面がv10契約と一致しません",
    )
    require(
        sloped_surface_signatures(collider_stair_object)
        == expected_ramp_top_surfaces | expected_ramp_bottom_surfaces,
        "体育館ギャラリー階段COLの6傾斜面がVISと一致しません",
    )
    require(
        sloped_surface_signatures(nav_stair_object)
        == expected_ramp_top_surfaces,
        "体育館ギャラリー階段NAVの6歩行面がCOL上面と一致しません",
    )

    expected_turn_landings = [
        ((33.6, -11.35, 2.40), (36.0, -10.20, 2.55)),
        ((56.8, -11.35, 2.40), (59.2, -10.20, 2.55)),
    ]
    turn_landing_components = sum(
        any(
            bounds_match(component, expected)
            for component in collider_stair_components
        )
        for expected in expected_turn_landings
    )
    require(
        turn_landing_components == len(expected_turn_landings),
        f"体育館袖階段の左右折り返し踊り場が不足しています: "
        f"{turn_landing_components}",
    )
    expected_upper_landings = [
        ((33.6, -3.00, 5.10), (34.8, -2.00, 5.25)),
        ((58.0, -3.00, 5.10), (59.2, -2.00, 5.25)),
    ]
    upper_landing_components = sum(
        any(
            bounds_match(component, expected)
            for component in collider_stair_components
        )
        for expected in expected_upper_landings
    )
    require(
        upper_landing_components == len(expected_upper_landings),
        f"体育館袖階段の上部踊り場が階段列幅へ揃っていません: "
        f"{upper_landing_components}",
    )

    gallery_guard = object_by_name.get("COL_B03_GymGalleryGuards")
    require(gallery_guard is not None, "体育館ギャラリー手すりColliderがありません")
    gallery_guard_bounds = box_component_bounds(gallery_guard)
    require(
        abs(max(bounds[1][2] for bounds in gallery_guard_bounds) - 6.35)
        <= TOLERANCE,
        "体育館ギャラリーの内側手すり上端が床面+1.1mではありません",
    )
    require(
        len(gallery_guard_bounds) == 38
        and len(gallery_guard.data.vertices) == 304
        and len(gallery_guard.data.polygons) == 228,
        "体育館ギャラリー手すりColliderが38本の単純連続レールではありません: "
        f"components={len(gallery_guard_bounds)} / "
        f"vertices={len(gallery_guard.data.vertices)} / "
        f"polygons={len(gallery_guard.data.polygons)}",
    )
    require_architecture_swatch("VIS_B03_GymGalleryGuards", "trim")

    expected_guard_base_segments = [
        ((34.84, -2.0, 5.25), (34.84, 25.0, 5.25)),
        ((57.96, -2.0, 5.25), (57.96, 25.0, 5.25)),
        ((34.84, 25.0, 5.25), (35.8, 25.0, 5.25)),
        ((39.1, 25.0, 3.60), (43.7, 25.0, 3.60)),
        ((47.0, 25.0, 5.25), (57.96, 25.0, 5.25)),
        ((39.1, 25.0, 3.60), (35.8, 25.0, 5.25)),
        ((43.7, 25.0, 3.60), (47.0, 25.0, 5.25)),
        ((34.76, -2.15, 0.15), (34.76, -3.80, 0.15)),
        ((36.04, -3.80, 0.15), (36.04, -10.20, 2.55)),
        ((34.76, -3.80, 0.15), (34.76, -10.20, 2.55)),
        ((36.04, -10.20, 2.55), (36.04, -11.30, 2.55)),
        ((34.84, -10.20, 2.55), (34.84, -3.00, 5.25)),
        ((34.84, -3.00, 5.25), (34.84, -2.00, 5.25)),
        ((58.04, -2.15, 0.15), (58.04, -3.80, 0.15)),
        ((56.76, -3.80, 0.15), (56.76, -10.20, 2.55)),
        ((58.04, -3.80, 0.15), (58.04, -10.20, 2.55)),
        ((56.76, -10.20, 2.55), (56.76, -11.30, 2.55)),
        ((57.96, -10.20, 2.55), (57.96, -3.00, 5.25)),
        ((57.96, -3.00, 5.25), (57.96, -2.00, 5.25)),
    ]
    visual_gallery_guard = object_by_name.get("VIS_B03_GymGalleryGuards")
    require(
        visual_gallery_guard is not None,
        "体育館ギャラリー手すりの実形状VISがありません",
    )
    guard_rail_segments = rail_centerline_segments((visual_gallery_guard,))
    collider_guard_rail_segments = rail_centerline_segments((gallery_guard,))
    require(
        len(guard_rail_segments) == len(expected_guard_base_segments) * 2,
        f"体育館ギャラリー手すりの上下レール数が不正です: "
        f"{len(guard_rail_segments)}",
    )
    require(
        len(collider_guard_rail_segments)
        == len(expected_guard_base_segments) * 2,
        f"体育館ギャラリー手すりColliderの上下レール数が不正です: "
        f"{len(collider_guard_rail_segments)}",
    )
    for segment_index, (start, end) in enumerate(
        expected_guard_base_segments
    ):
        for rail_height in (0.55, 1.05):
            rail_start = (
                start[0],
                start[1],
                start[2] + rail_height,
            )
            rail_end = (
                end[0],
                end[1],
                end[2] + rail_height,
            )
            require_rail_segment(
                guard_rail_segments,
                rail_start,
                rail_end,
                f"体育館ギャラリー落下防止VIS/{segment_index}",
            )
            require_rail_segment(
                collider_guard_rail_segments,
                rail_start,
                rail_end,
                f"体育館ギャラリー落下防止COL/{segment_index}",
            )
    for old_near_segment in (
        ((36.04, -3.40, 0.70), (36.04, -3.80, 0.70)),
        ((36.04, -3.40, 1.20), (36.04, -3.80, 1.20)),
        ((56.76, -3.40, 0.70), (56.76, -3.80, 0.70)),
        ((56.76, -3.40, 1.20), (56.76, -3.80, 1.20)),
    ):
        old_start = Vector(old_near_segment[0])
        old_end = Vector(old_near_segment[1])
        require(
            not any(
                (
                    (actual_start - old_start).length <= TOLERANCE
                    and (actual_end - old_end).length <= TOLERANCE
                )
                or (
                    (actual_start - old_end).length <= TOLERANCE
                    and (actual_end - old_start).length <= TOLERANCE
                )
                for actual_start, actual_end in guard_rail_segments
            ),
            f"体育館袖階段入口の手前側短い手すりが残っています: "
            f"{old_near_segment}",
        )
    stage_side_walls = object_by_name.get("COL_B03_GymStageSideWalls")
    require(
        stage_side_walls is not None,
        "体育館舞台袖の壁Colliderがありません",
    )
    stage_side_wall_components = box_component_bounds(stage_side_walls)
    for side, guard_x in (("西", 34.76), ("東", 58.04)):
        matching_walls = [
            bounds
            for bounds in stage_side_wall_components
            if bounds[0][0] - TOLERANCE <= guard_x <= bounds[1][0] + TOLERANCE
            and abs(bounds[0][1] + 2.15) <= TOLERANCE
            and abs(bounds[0][2]) <= TOLERANCE
            and abs(bounds[1][2] - 5.10) <= TOLERANCE
        ]
        require(
            len(matching_walls) == 1,
            f"体育館{side}袖階段の奥側手すりに接する壁が一意ではありません: "
            f"{matching_walls}",
        )
        wall_gap = abs(matching_walls[0][0][1] - (-2.15))
        entrance_width = (
            36.6 - 34.84
            if side == "西"
            else 57.96 - 56.2
        )
        require(
            wall_gap <= TOLERANCE,
            f"体育館{side}袖階段の奥側手すりが壁面へ接していません: "
            f"X={guard_x}/gap={wall_gap}",
        )
        require(
            entrance_width >= 1.2 - TOLERANCE,
            f"体育館{side}袖階段の入口有効幅が1.2m未満です: "
            f"{entrance_width:.3f}m",
        )
    require(
        any(
            start == (39.1, 25.0, 3.60)
            and end == (43.7, 25.0, 3.60)
            for start, end in expected_guard_base_segments
        ),
        "体育館北側中央低床の落下防止手すり契約がありません",
    )

    stage_side_wall_components = audit_box_components(
        "COL_B03_GymStageSideWalls",
        [
            ((33.4, -2.15, 0.0), (33.6, -1.85, 9.0)),
            ((33.6, -2.15, 0.0), (35.0, -1.85, 5.10)),
            ((33.6, -2.15, 7.25), (35.0, -1.85, 9.0)),
            ((35.0, -2.15, 0.0), (36.8, -1.85, 9.0)),
            ((36.8, -2.15, 2.4), (39.2, -1.85, 9.0)),
            ((39.2, -2.15, 0.0), (40.6, -1.85, 9.0)),
            ((52.2, -2.15, 0.0), (53.6, -1.85, 9.0)),
            ((53.6, -2.15, 2.4), (56.0, -1.85, 9.0)),
            ((56.0, -2.15, 0.0), (57.8, -1.85, 9.0)),
            ((57.8, -2.15, 0.0), (59.2, -1.85, 5.10)),
            ((57.8, -2.15, 7.25), (59.2, -1.85, 9.0)),
            ((59.2, -2.15, 0.0), (59.4, -1.85, 9.0)),
        ],
    )
    stage_side_door_names = {
        "VIS_GymStageSideDoor_Open_West",
        "VIS_GymStageSideDoor_Open_East",
    }
    require(
        stage_side_door_names.isdisjoint(object_by_name),
        f"開放状態をMesh扉で表した旧Objectが残っています: "
        f"{stage_side_door_names & set(object_by_name)}",
    )
    stage_side_openings = (
        ((36.8, -2.16, 0.0), (39.2, -1.84, 2.4)),
        ((53.6, -2.16, 0.0), (56.0, -1.84, 2.4)),
    )
    stage_side_wall_object = object_by_name["COL_B03_GymStageSideWalls"]
    stage_opening_intersections = sum(
        all(
            interval_overlaps(
                (component[0][axis], component[1][axis]),
                (opening[0][axis], opening[1][axis]),
            )
            for axis in range(3)
        )
        for component in box_component_bounds(stage_side_wall_object)
        for opening in stage_side_openings
    )
    require(
        stage_opening_intersections == 0,
        f"舞台袖の固定開放部に壁Colliderが残っています: "
        f"{stage_opening_intersections}",
    )

    gym_roof_components = audit_box_components(
        "COL_B03_GymRoofWalkable",
        [((33.4, -11.5, 9.45), (59.4, 26.5, 9.60))],
    )
    gym_roof_gap_components = audit_box_components(
        "COL_B03_GymRoofGapWall",
        [((33.4, -11.5, 9.10), (59.4, 26.5, 9.45))],
    )
    audit_box_components(
        "VIS_B03_GymRoofGapWall",
        [((33.4, -11.5, 9.10), (59.4, 26.5, 9.45))],
    )
    require_architecture_swatch("VIS_B03_GymRoofGapWall", "wall")
    gym_roof_guard = object_by_name.get("COL_B03_GymRoofGuards")
    require(gym_roof_guard is not None, "体育館屋上柵Colliderがありません")
    gym_roof_guard_bounds = box_component_bounds(gym_roof_guard)
    require(
        abs(min(bounds[0][2] for bounds in gym_roof_guard_bounds) - 9.60)
        <= TOLERANCE
        and abs(max(bounds[1][2] for bounds in gym_roof_guard_bounds) - 10.70)
        <= TOLERANCE,
        "体育館屋上の実形状柵が歩行面から約1.1mではありません",
    )

    roof_ramp = object_by_name.get("COL_B03_GymRoofRamp")
    visual_roof_ramp = object_by_name.get("VIS_B03_GymRoofRamp")
    require(
        roof_ramp is not None
        and roof_ramp.type == "MESH"
        and visual_roof_ramp is not None
        and visual_roof_ramp.type == "MESH",
        "体育館屋上接続RampのVIS/COLが不足しています",
    )
    ramp_minimum, ramp_maximum = world_bounds(roof_ramp)
    require(
        (ramp_minimum - Vector((39.4, 26.5, 7.05))).length <= TOLERANCE
        and (ramp_maximum - Vector((43.4, 32.5, 9.60))).length <= TOLERANCE,
        f"体育館屋上接続Ramp境界が不正です: {ramp_minimum}/{ramp_maximum}",
    )
    roof_ramp_profile = (
        (26.5, 9.45),
        (32.5, 7.05),
        (32.5, 7.20),
        (26.5, 9.60),
    )
    expected_collider_ramp_vertices = [
        (x, y, z)
        for x in (39.4, 43.4)
        for y, z in roof_ramp_profile
    ]
    expected_visual_ramp_vertices = [
        (x, y, z)
        for x in (39.401, 43.399)
        for y, z in roof_ramp_profile
    ]
    collider_ramp_vertices = [
        roof_ramp.matrix_world @ vertex.co
        for vertex in roof_ramp.data.vertices
    ]
    visual_ramp_vertices = [
        visual_roof_ramp.matrix_world @ vertex.co
        for vertex in visual_roof_ramp.data.vertices
    ]
    require(
        surface_signature(collider_ramp_vertices)
        == surface_signature(expected_collider_ramp_vertices)
        and len(roof_ramp.data.polygons) == 6,
        "体育館屋上接続Ramp Colliderが閉じた既定断面ではありません",
    )
    require(
        surface_signature(visual_ramp_vertices)
        == surface_signature(expected_visual_ramp_vertices)
        and len(visual_roof_ramp.data.polygons) == 4,
        "体育館屋上接続Ramp VISが接続端面を除いた既定断面ではありません",
    )
    ramp_visual_end_faces = [
        polygon.index
        for polygon in visual_roof_ramp.data.polygons
        if any(
            all(
                abs(
                    (
                        visual_roof_ramp.matrix_world
                        @ visual_roof_ramp.data.vertices[index].co
                    ).y
                    - endpoint_y
                )
                <= TOLERANCE
                for index in polygon.vertices
            )
            for endpoint_y in (26.5, 32.5)
        )
    ]
    require(
        not ramp_visual_end_faces,
        f"体育館屋上接続Ramp VISの接続端に重複面があります: "
        f"{ramp_visual_end_faces}",
    )

    underfill_profile = (
        (26.5, 7.05),
        (32.5, 7.05),
        (26.5, 9.45),
    )
    visual_underfill = object_by_name.get("VIS_B03_GymRoofRampUnderfill")
    collider_underfill = object_by_name.get("COL_B03_GymRoofRampUnderfill")
    require(
        visual_underfill is not None
        and visual_underfill.type == "MESH"
        and collider_underfill is not None
        and collider_underfill.type == "MESH",
        "体育館屋上接続Ramp下の進入防止充填VIS/COLが不足しています",
    )
    expected_visual_underfill_vertices = [
        (x, y, z)
        for x in (39.401, 43.399)
        for y, z in underfill_profile
    ]
    expected_collider_underfill_vertices = [
        (x, y, z)
        for x in (39.4, 43.4)
        for y, z in underfill_profile
    ]
    require(
        surface_signature(
            [
                visual_underfill.matrix_world @ vertex.co
                for vertex in visual_underfill.data.vertices
            ]
        )
        == surface_signature(expected_visual_underfill_vertices)
        and len(visual_underfill.data.polygons) == 3,
        "体育館屋上接続Ramp下のVISが内部重複面なしの直角三角形充填ではありません",
    )
    require(
        surface_signature(
            [
                collider_underfill.matrix_world @ vertex.co
                for vertex in collider_underfill.data.vertices
            ]
        )
        == surface_signature(expected_collider_underfill_vertices)
        and len(collider_underfill.data.polygons) == 5,
        "体育館屋上接続Ramp下のColliderが直角三角形充填ではありません",
    )
    require_architecture_swatch("VIS_B03_GymRoofRampUnderfill", "wall")

    visual_connection_guards = object_by_name.get(
        "VIS_B03_GymRoofConnectionGuards"
    )
    collider_connection_guards = object_by_name.get(
        "COL_B03_GymRoofConnectionGuards"
    )
    require(
        visual_connection_guards is not None
        and visual_connection_guards.type == "MESH"
        and collider_connection_guards is not None
        and collider_connection_guards.type == "MESH",
        "体育館屋上接続Ramp両側の転落防止手すりVIS/COLが不足しています",
    )
    require(
        len(visual_connection_guards.data.vertices) == 144
        and len(visual_connection_guards.data.polygons) == 108,
        "体育館屋上接続Rampの実形状手すり部品数が不正です",
    )
    require(
        len(collider_connection_guards.data.vertices) == 32
        and len(collider_connection_guards.data.polygons) == 24,
        "体育館屋上接続Rampの手すりCollider部品数が不正です",
    )
    connection_guard_segments = (
        ((39.52, 32.5, 7.20), (39.52, 26.5, 9.60)),
        ((43.28, 32.5, 7.20), (43.28, 26.5, 9.60)),
    )
    visual_connection_guard_rails = rail_centerline_segments(
        (visual_connection_guards,)
    )
    collider_connection_guard_rails = rail_centerline_segments(
        (collider_connection_guards,)
    )
    require(
        len(visual_connection_guard_rails) == 4
        and len(collider_connection_guard_rails) == 4,
        "体育館屋上接続Ramp両側の上下レールが4本ずつではありません",
    )
    for segment_index, (start, end) in enumerate(
        connection_guard_segments
    ):
        for rail_height in (0.55, 1.05):
            rail_start = (
                start[0],
                start[1],
                start[2] + rail_height,
            )
            rail_end = (
                end[0],
                end[1],
                end[2] + rail_height,
            )
            require_rail_segment(
                visual_connection_guard_rails,
                rail_start,
                rail_end,
                f"体育館屋上接続Ramp手すりVIS/{segment_index}",
            )
            require_rail_segment(
                collider_connection_guard_rails,
                rail_start,
                rail_end,
                f"体育館屋上接続Ramp手すりCOL/{segment_index}",
            )
    require_architecture_swatch(
        "VIS_B03_GymRoofConnectionGuards",
        "trim",
    )
    roof_ramp_angle = math.degrees(math.atan2(2.4, 6.0))
    require(
        abs(roof_ramp_angle - 21.80140948635181) <= TOLERANCE,
        f"体育館屋上接続Ramp勾配が約21.8度ではありません: {roof_ramp_angle:.3f}",
    )
    gym_floor_components = audit_box_components(
        "COL_Floor_Gym",
        [((33.4, -11.5, -0.2), (59.4, 26.5, 0.0))],
    )
    gym_south_wall_components = audit_box_components(
        "COL_GymWall_South",
        [((33.4, -11.65, 0.0), (59.4, -11.35, 9.0))],
    )
    gym_envelope_roof_components = audit_box_components(
        "COL_GymRoof",
        [((33.4, -11.5, 9.0), (59.4, 26.5, 9.1))],
    )
    gym_stage_components = audit_box_components(
        "COL_GymStage",
        [((40.6, -11.0, 0.0), (52.2, -2.0, 1.0))],
    )
    stage_stair_components = 0
    for side, first_edge, direction in (
        ("West", 39.1, 1.0),
        ("East", 53.7, -1.0),
    ):
        for step_index in range(1, 6):
            if direction > 0:
                minimum_x = first_edge + (step_index - 1) * 0.3
                maximum_x = minimum_x + 0.3
            else:
                maximum_x = first_edge - (step_index - 1) * 0.3
                minimum_x = maximum_x - 0.3
            stage_stair_components += audit_box_components(
                f"VIS_GymStageStair_{side}_{step_index:02d}",
                [
                    (
                        (minimum_x, -11.0, 0.0),
                        (maximum_x, -8.6, step_index * 0.2),
                    )
                ],
            )
    stage_stair_ramp_components = 0
    for side, expected_bounds in (
        ("West", ((39.1, -11.0, 0.0), (40.6, -8.6, 1.0))),
        ("East", ((52.2, -11.0, 0.0), (53.7, -8.6, 1.0))),
    ):
        ramp_object = object_by_name.get(f"COL_GymStageStairRamp_{side}")
        require(
            ramp_object is not None and ramp_object.type == "MESH",
            f"体育館舞台{side}側Ramp Colliderがありません",
        )
        actual_minimum, actual_maximum = world_bounds(ramp_object)
        require(
            (actual_minimum - Vector(expected_bounds[0])).length
            <= TOLERANCE
            and (actual_maximum - Vector(expected_bounds[1])).length
            <= TOLERANCE,
            f"体育館舞台{side}側Ramp境界が不正です: "
            f"{actual_minimum}/{actual_maximum}",
        )
        stage_stair_ramp_components += 1
    stage_stair_head_wall_components = 0
    for side, expected_bounds in (
        ("West", ((40.45, -11.0, 3.4), (40.75, -2.0, 9.0))),
        ("East", ((52.05, -11.0, 3.4), (52.35, -2.0, 9.0))),
    ):
        for prefix in ("VIS", "COL"):
            stage_stair_head_wall_components += audit_box_components(
                f"{prefix}_GymStageStairHeadWall_{side}",
                [expected_bounds],
            )
    gym_width = 59.4 - 33.4
    gym_stage_width = 52.2 - 40.6
    gym_stage_center_x = (40.6 + 52.2) / 2.0
    require(
        abs(gym_width - 26.0) <= TOLERANCE
        and abs(gym_stage_width - 11.6) <= TOLERANCE
        and abs(gym_stage_center_x - 46.4) <= TOLERANCE,
        "体育館舞台の左右0.8m拡幅または中心維持の寸法が不正です",
    )

    west_extension_components = audit_box_components(
        "COL_B03_WestExtensionFloor_F01",
        [
            ((-12.6, -7.0, -0.15), (-11.5, -3.5, 0.0)),
            ((-9.1, -7.0, -0.15), (0.0, -3.5, 0.0)),
            ((-11.5, -7.0, -0.15), (-9.1, -6.4, 0.0)),
            ((-11.5, -4.0, -0.15), (-9.1, -3.5, 0.0)),
        ],
    )
    shaft_components = audit_box_components(
        "COL_B03_ElevatorShaftShell",
        [
            ((-11.8, -6.7, 0.0), (-11.5, -3.7, 14.4)),
            ((-11.5, -6.7, 0.0), (-8.8, -6.4, 14.4)),
            ((-11.5, -4.0, 0.0), (-8.8, -3.7, 14.4)),
            ((-9.1, -6.7, 0.0), (-8.88, -5.9, 14.4)),
            ((-9.1, -4.5, 0.0), (-8.88, -3.7, 14.4)),
            ((-8.78, -6.7, 0.0), (-8.72, -5.9, 14.4)),
            ((-8.78, -4.5, 0.0), (-8.72, -3.7, 14.4)),
            ((-9.1, -5.9, 2.4), (-8.8, -4.5, 3.6)),
            ((-9.1, -5.9, 6.0), (-8.8, -4.5, 7.2)),
            ((-9.1, -5.9, 9.6), (-8.8, -4.5, 10.8)),
            ((-9.1, -5.9, 13.2), (-8.8, -4.5, 14.4)),
            ((-11.8, -6.7, 14.25), (-8.8, -3.7, 14.4)),
        ],
    )
    require(
        "COL_B03_ElevatorStairPartition" not in object_by_name
        and "VIS_B03_ElevatorStairPartition" not in object_by_name,
        "誤った長いエレベーター階段間仕切りが残っています",
    )
    stair_wall_components = audit_box_components(
        "COL_B03_ElevatorStairWall",
        [
            (
                (-8.8, -3.7, floor_base_z),
                (-6.0, -3.5, floor_base_z + 3.45),
            )
            for floor_base_z in (0.0, 3.6, 7.2, 10.8)
        ],
    )
    elevator_hall_opening_width = 0.0 - -6.0
    require(
        elevator_hall_opening_width >= 6.0 - TOLERANCE,
        f"エレベーターホールへの東側開口幅が6.0m未満です: "
        f"{elevator_hall_opening_width:.3f}m",
    )
    fixed_door_components = audit_box_components(
        "COL_B03_ElevatorClosedDoor_F02_F03",
        [
            (
                (-8.8, -5.9, floor_base_z),
                (-8.68, -4.5, floor_base_z + 2.4),
            )
            for floor_base_z in (3.6, 7.2)
        ],
    )
    require(
        "VIS_B03_ElevatorWaitingMat_F01_F04" not in object_by_name,
        "旧共用エレベーター待機マットが残っています",
    )
    waiting_mat_components = 0
    adjustment_sign_components = audit_box_components(
        "VIS_B03_ElevatorAdjustmentSign_F02_F03",
        [
            (
                (-8.61, -5.72, floor_base_z + 1.02),
                (-8.57, -4.68, floor_base_z + 1.50),
            )
            for floor_base_z in (3.6, 7.2)
        ],
    )
    adjustment_tape = object_by_name.get(
        "VIS_B03_ElevatorAdjustmentTape_F02_F03"
    )
    adjustment_texts = [
        object_by_name.get(f"VIS_B03_ElevatorAdjustmentText_F{floor:02d}")
        for floor in (2, 3)
    ]
    require(adjustment_tape is not None, "2階・3階エレベーターの×印テープがありません")
    require(
        adjustment_tape.type == "MESH"
        and len(adjustment_tape.data.polygons) == 24,
        "2階・3階エレベーターの×印テープが4本の実Meshではありません",
    )
    require(
        all(
            text is not None
            and text.type == "MESH"
            and len(text.data.polygons) > 0
            for text in adjustment_texts
        ),
        "2階・3階エレベーターの「調整中」表示が実Meshではありません",
    )
    require(
        "COL_B03_ElevatorShaftSafety" not in object_by_name,
        "動的エレベーター扉と競合する旧昇降路Safety Colliderが残っています",
    )
    shaft_outer_size = 3.0
    shaft_inner_size = 2.4
    require(
        abs(shaft_outer_size - 3.0) <= TOLERANCE
        and 2.2 <= shaft_inner_size <= 2.4,
        "エレベーター昇降路の外寸または内寸が不正です",
    )

    required_nav_sources = {
        "NAV_Walkable_Interior1F",
        "NAV_B03_Walkable_GymGallery",
        "NAV_B03_Walkable_GymGalleryStairs",
        "NAV_B03_Walkable_GymRooftop",
        "NAV_B03_Walkable_GymRoofRamp",
    }
    require(
        required_nav_sources <= set(object_by_name),
        f"B03-3B人間用Nav sourceが不足しています: {required_nav_sources - set(object_by_name)}",
    )
    outdoor_nav = object_by_name.get("NAV_Walkable_Outdoor")
    require(
        outdoor_nav is not None
        and len(outdoor_nav.data.vertices) == 8
        and len(outdoor_nav.data.polygons) == 2
        and all(polygon.normal.z > 0.0 for polygon in outdoor_nav.data.polygons)
        and bounds_match(
            tuple(
                tuple(value for value in bound)
                for bound in world_bounds(outdoor_nav)
            ),
            ((-18.6, -14.5, -0.3), (63.4, 51.5, 0.0)),
        ),
        "人物用屋外Nav sourceの2面または南側塀中心Y=-14.5mまでの延長が不正です",
    )
    entry_transition_nav = object_by_name.get("NAV_Walkable_EntryTransitions")
    require(
        entry_transition_nav is not None
        and entry_transition_nav.type == "MESH"
        and len(entry_transition_nav.data.vertices) == 24
        and len(entry_transition_nav.data.polygons) == 6,
        "人物用玄関Nav sourceの6 Ramp契約が不正です",
    )
    entry_transition_normal_matrix = (
        entry_transition_nav.matrix_world.to_3x3().inverted().transposed()
    )
    invalid_entry_transition_normals = [
        polygon.index
        for polygon in entry_transition_nav.data.polygons
        if (
            entry_transition_normal_matrix @ polygon.normal
        ).normalized().z
        < math.cos(math.radians(45.0))
    ]
    require(
        not invalid_entry_transition_normals,
        f"人物用玄関Nav sourceに下向きRampがあります: "
        f"{invalid_entry_transition_normals}",
    )
    entry_transition_bounds = mesh_component_world_bounds(entry_transition_nav)
    require(
        len(entry_transition_bounds) == 6,
        f"人物用玄関Nav sourceの連結成分数が不正です: "
        f"{len(entry_transition_bounds)}",
    )
    main_entry_nav_components = [
        (minimum, maximum)
        for minimum, maximum in entry_transition_bounds
        if abs(minimum.x - 0.0) <= TOLERANCE
        and abs(maximum.x - 2.10) <= TOLERANCE
        and abs(minimum.y + 2.5) <= TOLERANCE
        and abs(maximum.y - 2.5) <= TOLERANCE
        and abs(minimum.z + 0.30) <= TOLERANCE
        and abs(maximum.z - 0.0) <= TOLERANCE
    ]
    require(
        len(main_entry_nav_components) == 1,
        "主玄関Human Nav Rampの低端X=2.10契約が不正です",
    )
    main_entry_collider = object_by_name.get("COL_EntryRamp")
    require(
        main_entry_collider is not None
        and abs(world_bounds(main_entry_collider)[1].x - 2.0) <= TOLERANCE,
        "主玄関の物理ColliderをHuman Nav低端と一緒に変更しています",
    )
    dynamic_roles = {
        "door",
        "elevator",
        "elevator_car",
        "elevator_gate",
        "elevator_marker",
    }
    dynamic_elevator_objects = [
        obj.name
        for obj in objects
        if "elevator" in obj.name.lower()
        and (
            obj.name.startswith(("MRK_", "VOL_", "LNK_"))
            or obj.get("hs_role") in dynamic_roles
        )
    ]
    require(
        len(dynamic_elevator_objects) > 0,
        "B03-3Cの動的エレベーターObjectがありません",
    )

    b03_structure_prefixes = (
        "VIS_B03_GymBridge",
        "COL_B03_GymBridge",
        "VIS_B03_GymGallery",
        "COL_B03_GymGallery",
        "VIS_B03_GymRoof",
        "COL_B03_GymRoof",
        "VIS_B03_WestExtension",
        "COL_B03_WestExtension",
        "VIS_B03_Elevator",
        "COL_B03_Elevator",
    )
    b03_structure_objects = [
        obj for obj in objects if obj.name.startswith(b03_structure_prefixes)
    ]
    southernmost_b03_y = min(world_bounds(obj)[0].y for obj in b03_structure_objects)
    require(
        southernmost_b03_y >= -11.85 - TOLERANCE,
        f"B03-3B構造が箱山D1の許容南端を越えています: Y={southernmost_b03_y:.3f}",
    )
    south_perimeter = object_by_name.get("VIS_Perimeter_SouthWest")
    require(south_perimeter is not None, "南西側の既存塀がありません")
    _, south_perimeter_maximum = world_bounds(south_perimeter)
    south_remaining_distance = -7.0 - south_perimeter_maximum.y
    require(
        abs(south_remaining_distance - 7.3) <= TOLERANCE,
        f"西側校舎南端から移設後の塀までの距離が7.3mではありません: {south_remaining_distance:.3f}m",
    )
    gym_south_remaining_distance = -11.5 - south_perimeter_maximum.y
    require(
        abs(gym_south_remaining_distance - 2.8) <= TOLERANCE,
        f"体育館南端から移設後の塀までの距離が2.8mではありません: "
        f"{gym_south_remaining_distance:.3f}m",
    )
    gym_south_wall = object_by_name.get("COL_GymWall_South")
    require(gym_south_wall is not None, "体育館南壁Colliderがありません")
    gym_south_wall_minimum, _ = world_bounds(gym_south_wall)
    physical_south_passage_width = (
        gym_south_wall_minimum.y - south_perimeter_maximum.y
    )
    require(
        abs(physical_south_passage_width - 2.65) <= TOLERANCE,
        f"体育館南壁外面と塀内面の実通路幅が2.65mではありません: "
        f"{physical_south_passage_width:.3f}m",
    )

    return {
        "bridge_floor_components": bridge_floor_components,
        "bridge_school_floor_joint_components": bridge_school_floor_joint,
        "bridge_ceiling_components": bridge_ceiling_components,
        "bridge_envelope_components": bridge_envelope_components,
        "bridge_clear_width_m": bridge_clear_width,
        "gallery_floor_components": gallery_floor_components,
        "gallery_width_m": min(gallery_widths),
        "gallery_north_transition_steps": len(north_stair_run_components),
        "gallery_stage_stair_steps": len(stage_stair_run_components),
        "gallery_stair_rise_m": 0.15,
        "gallery_low_height_m": 3.6,
        "gallery_high_height_m": 5.25,
        "gallery_guard_height_m": 1.1,
        "gallery_landing_components": turn_landing_components,
        "gallery_upper_landing_components": upper_landing_components,
        "gym_stage_side_wall_components": stage_side_wall_components,
        "gym_stage_side_door_components": 0,
        "gym_stage_opening_intersections": stage_opening_intersections,
        "gym_floor_components": gym_floor_components,
        "gym_south_wall_components": gym_south_wall_components,
        "gym_envelope_roof_components": gym_envelope_roof_components,
        "gym_stage_components": gym_stage_components,
        "gym_stage_stair_components": stage_stair_components,
        "gym_stage_stair_ramp_components": stage_stair_ramp_components,
        "gym_stage_stair_head_wall_components": (
            stage_stair_head_wall_components
        ),
        "gym_width_m": gym_width,
        "gym_stage_width_m": gym_stage_width,
        "gym_stage_center_x_m": gym_stage_center_x,
        "gym_roof_components": gym_roof_components,
        "gym_roof_gap_components": gym_roof_gap_components,
        "gym_roof_height_m": 9.6,
        "gym_roof_guard_height_m": 1.1,
        "gym_roof_connection_guard_segments": len(
            connection_guard_segments
        ),
        "gym_roof_ramp_underfill_components": 1,
        "gym_roof_ramp_angle_degrees": roof_ramp_angle,
        "west_extension_floor_components": west_extension_components,
        "elevator_shaft_components": shaft_components,
        "elevator_stair_wall_components": stair_wall_components,
        "elevator_hall_opening_width_m": elevator_hall_opening_width,
        "elevator_fixed_door_components": fixed_door_components,
        "elevator_waiting_mat_components": waiting_mat_components,
        "elevator_adjustment_sign_components": adjustment_sign_components,
        "elevator_safety_components": 0,
        "elevator_shaft_outer_m": shaft_outer_size,
        "elevator_shaft_inner_m": shaft_inner_size,
        "dynamic_elevator_objects": len(dynamic_elevator_objects),
        "south_remaining_distance_m": south_remaining_distance,
        "gym_south_remaining_distance_m": gym_south_remaining_distance,
        "b04_required_extension_m": 0.0,
    }


def audit_semantics(objects: list[bpy.types.Object]) -> None:
    require(not any(obj.name.startswith("PRT_") for obj in objects), "PRT_*が存在します")
    audit_assembly_venues(objects)
    water = bpy.data.objects.get("VOL_PoolWater")
    require(water is not None, "VOL_PoolWaterがありません")
    require(water.get("hs_id") == "pool-water", "VOL_PoolWaterのhs_idが不正です")
    require(water.get("hs_role") == "water", "VOL_PoolWaterのhs_roleがwaterではありません")
    minimum, maximum = world_bounds(water)
    expected_min = Vector((14.6, 36.2, 14.66))
    expected_max = Vector((34.2, 41.8, 15.35))
    require((minimum - expected_min).length <= 1e-5, f"水Volume下限が不正です: {minimum}")
    require((maximum - expected_max).length <= 1e-5, f"水Volume上限が不正です: {maximum}")
    roof = bpy.data.objects.get("COL_Roof_North")
    require(roof is not None, "校舎屋上Colliderがありません")
    roof_minimum, _ = world_bounds(roof)
    require(abs(roof_minimum.z - 14.4) <= 1e-5, "屋上高が14.4mではありません")
    boundary = bpy.data.objects.get("BND_Stage")
    require(boundary is not None, "BND_Stageがありません")
    _, boundary_maximum = world_bounds(boundary)
    require(
        abs(boundary_maximum.z - 19.0) <= 1e-5,
        "BND_Stage上端がT05-1A契約の19.0mではありません",
    )
    required_nav = {
        "NAV_Walkable_Interior2F",
        "NAV_Walkable_Interior3F",
        "NAV_Walkable_Interior4F",
        "NAV_Walkable_StairsNWUpper",
        "NAV_Walkable_Rooftop",
        "NAV_Blocker_SchoolUpper",
    }
    missing = sorted(required_nav - {obj.name for obj in objects})
    require(not missing, f"B03-1 NAV生成元が不足しています: {missing}")
    require(
        not any(obj.name.startswith("VIS_WindowGuide_") for obj in bpy.data.objects),
        "仮窓ガイドが残っています",
    )
    required_ceilings = {
        "VIS_B03_InterfloorStructure_F01_North",
        "VIS_B03_InterfloorStructure_F01_West",
        "COL_B03_InterfloorStructure_F01_North",
        "COL_B03_InterfloorStructure_F01_West",
        "VIS_B03_Ceiling_F02",
        "VIS_B03_Ceiling_F03",
        "VIS_B03_Ceiling_F04",
        "COL_B03_Ceiling_F02",
        "COL_B03_Ceiling_F03",
        "COL_B03_Ceiling_F04",
        "COL_Roof_North",
        "COL_Roof_West",
        "COL_GymRoof",
        "COL_RooftopFacilityShell",
    }
    missing_ceilings = sorted(required_ceilings - {obj.name for obj in objects})
    require(not missing_ceilings, f"天井Colliderが不足しています: {missing_ceilings}")
    require(
        not any(obj.name.startswith("NAV_") and "Window" in obj.name for obj in objects),
        "通常NavMesh用の窓越し接続が存在します",
    )
    toilets = [
        obj
        for obj in objects
        if obj.name.startswith("VIS_B03_Prop_Toilet_") and "_Part" not in obj.name
    ]
    toilet_parts = [
        obj
        for obj in objects
        if obj.name.startswith("VIS_B03_Prop_Toilet_") and "_Part" in obj.name
    ]
    urinals = sorted(
        (
            obj
            for obj in objects
            if obj.name.startswith("VIS_B03_Prop_Urinal_")
            and "_Part" not in obj.name
        ),
        key=lambda obj: obj.name,
    )
    urinal_parts = [
        obj
        for obj in objects
        if obj.name.startswith("VIS_B03_Prop_Urinal_") and "_Part" in obj.name
    ]
    require(len(toilets) == 6, f"便器が男女各3基ではありません: {len(toilets)}")
    require(len(toilet_parts) == 6, f"便器金物partが6件ではありません: {len(toilet_parts)}")
    require(len(urinals) == 3, f"男子小便器が3基ではありません: {len(urinals)}")
    require(len(urinal_parts) == 3, f"男子小便器金物partが3件ではありません: {len(urinal_parts)}")
    for urinal, expected_y in zip(urinals, (39.6, 40.6, 41.6), strict=True):
        minimum, maximum = world_bounds(urinal)
        require(
            abs(minimum.x + 2.75) <= 1e-5 and abs(maximum.x + 2.40) <= 1e-5,
            f"男子小便器が180度反転後の向きではありません: {urinal.name}",
        )
        require(abs((minimum.y + maximum.y) / 2 - expected_y) <= 1e-5, f"男子小便器の中心Yが不正です: {urinal.name}")


def audit_hs_ids(objects: list[bpy.types.Object]) -> None:
    grouped: dict[str, list[bpy.types.Object]] = defaultdict(list)
    for obj in objects:
        hs_id = obj.get("hs_id")
        if hs_id is None:
            continue
        require(isinstance(hs_id, str) and bool(hs_id), f"hs_idの型または値が不正です: {obj.name}")
        grouped[hs_id].append(obj)
    for hs_id, grouped_objects in grouped.items():
        if len(grouped_objects) == 1:
            continue
        require(
            len(grouped_objects) == 2
            and {obj.get("hs_endpoint") for obj in grouped_objects} == {"A", "B"}
            and all(obj.name.startswith(f"LNK_{hs_id}_") for obj in grouped_objects),
            f"hs_idが論理Object間で重複しています: {hs_id}",
        )


def has_horizontal_surface(
    obj: bpy.types.Object,
    point: tuple[float, float, float],
) -> bool:
    x, y, z = point
    for polygon in obj.data.polygons:
        normal = obj.matrix_world.to_3x3() @ polygon.normal
        if abs(normal.z) < 0.98:
            continue
        points = [obj.matrix_world @ obj.data.vertices[index].co for index in polygon.vertices]
        if abs(sum(vertex.z for vertex in points) / len(points) - z) > 1e-5:
            continue
        if (
            min(vertex.x for vertex in points) - 1e-5 <= x <= max(vertex.x for vertex in points) + 1e-5
            and min(vertex.y for vertex in points) - 1e-5 <= y <= max(vertex.y for vertex in points) + 1e-5
        ):
            return True
    return False


def has_upward_horizontal_surface_overlap(
    obj: bpy.types.Object,
    minimum: tuple[float, float],
    maximum: tuple[float, float],
    z: float,
) -> bool:
    for polygon in obj.data.polygons:
        normal = obj.matrix_world.to_3x3() @ polygon.normal
        if normal.z < 0.98:
            continue
        points = [obj.matrix_world @ obj.data.vertices[index].co for index in polygon.vertices]
        if abs(sum(vertex.z for vertex in points) / len(points) - z) > TOLERANCE:
            continue
        polygon_x = (min(vertex.x for vertex in points), max(vertex.x for vertex in points))
        polygon_y = (min(vertex.y for vertex in points), max(vertex.y for vertex in points))
        if interval_overlaps(polygon_x, (minimum[0], maximum[0])) and interval_overlaps(
            polygon_y,
            (minimum[1], maximum[1]),
        ):
            return True
    return False


def rail_centerline_segments(
    objects: tuple[bpy.types.Object, ...],
) -> list[tuple[Vector, Vector]]:
    segments = []
    for obj in objects:
        require(
            obj.type == "MESH" and len(obj.data.vertices) % 8 == 0,
            f"手すりMeshの頂点数が8の倍数ではありません: {obj.name}",
        )
        for offset in range(0, len(obj.data.vertices), 8):
            points = [
                obj.matrix_world @ obj.data.vertices[offset + index].co
                for index in range(8)
            ]
            start = sum(points[:4], Vector((0.0, 0.0, 0.0))) / 4
            end = sum(points[4:], Vector((0.0, 0.0, 0.0))) / 4
            if math.hypot(end.x - start.x, end.y - start.y) <= 0.3:
                continue
            segments.append((start, end))
    return segments


def require_rail_junction(
    segments: list[tuple[Vector, Vector]],
    point: tuple[float, float, float],
    label: str,
) -> None:
    expected = Vector(point)
    matching_endpoints = sum(
        (start - expected).length <= TOLERANCE
        or (end - expected).length <= TOLERANCE
        for start, end in segments
    )
    require(
        matching_endpoints >= 2,
        f"手すりが共有端点で接続されていません: {label}/{point}/{matching_endpoints}",
    )


def require_rail_segment(
    segments: list[tuple[Vector, Vector]],
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    label: str,
) -> None:
    expected_start = Vector(start)
    expected_end = Vector(end)
    require(
        any(
            (
                (actual_start - expected_start).length <= TOLERANCE
                and (actual_end - expected_end).length <= TOLERANCE
            )
            or (
                (actual_start - expected_end).length <= TOLERANCE
                and (actual_end - expected_start).length <= TOLERANCE
            )
            for actual_start, actual_end in segments
        ),
        f"必要な手すり線分がありません: {label}/{start}/{end}",
    )


def transform_stair_point(
    stair: str,
    point: tuple[float, float, float],
) -> tuple[float, float, float]:
    x, y, z = point
    if stair == "NW":
        return point
    if stair == "NE":
        return x + 54.0, y, z
    if stair == "SW":
        return 32.9 - y, x + 9.1, z
    raise RuntimeError(f"未定義の階段です: {stair}")


def transform_stair_rectangle(
    stair: str,
    minimum: tuple[float, float],
    maximum: tuple[float, float],
    z: float,
) -> tuple[tuple[float, float], tuple[float, float]]:
    corners = [
        transform_stair_point(stair, (x, y, z))
        for x in (minimum[0], maximum[0])
        for y in (minimum[1], maximum[1])
    ]
    return (
        (
            min(point[0] for point in corners),
            min(point[1] for point in corners),
        ),
        (
            max(point[0] for point in corners),
            max(point[1] for point in corners),
        ),
    )


def transform_stair_bounds(
    stair: str,
    bounds: tuple[tuple[float, float, float], tuple[float, float, float]],
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    minimum, maximum = bounds
    corners = [
        transform_stair_point(stair, (x, y, z))
        for x in (minimum[0], maximum[0])
        for y in (minimum[1], maximum[1])
        for z in (minimum[2], maximum[2])
    ]
    return (
        tuple(min(point[axis] for point in corners) for axis in range(3)),
        tuple(max(point[axis] for point in corners) for axis in range(3)),
    )


def audit_stair_guards(objects: list[bpy.types.Object]) -> dict[str, int]:
    names = {obj.name for obj in objects}
    central_well_checks = 0
    for floor, floor_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        for stair in ("NW", "NE", "SW"):
            well_minimum, well_maximum = transform_stair_rectangle(
                stair,
                (-10.2, 38.9),
                (-9.0, 43.1),
                floor_z,
            )
            for prefix in ("VIS_", "COL_", "NAV_"):
                overlapping_objects = [
                    obj.name
                    for obj in objects
                    if obj.type == "MESH"
                    and obj.name.startswith(prefix)
                    and has_upward_horizontal_surface_overlap(
                        obj,
                        well_minimum,
                        well_maximum,
                        floor_z,
                    )
                ]
                require(
                    not overlapping_objects,
                    f"階段中央1.2m×4.2m吹抜けに上向き面があります: {floor}階/{stair}/{prefix}/{overlapping_objects}",
                )
                central_well_checks += 1

    first_part_vertices = {"Lower": (88, 16), "Landing": (32, 8), "Upper": (72, 16)}
    visual_components = 0
    collider_components = 0
    rail_junction_checks = 0
    for stair in ("NW", "NE", "SW"):
        first_visuals = []
        for part, default_counts in first_part_vertices.items():
            expected_visual_vertices, expected_collider_vertices = (
                (56, 8) if stair == "NW" and part == "Lower" else default_counts
            )
            visual_name = f"VIS_StairGuard_{stair}_{part}"
            collider_name = f"COL_StairGuard_{stair}_{part}"
            require(visual_name in names and collider_name in names, f"1～2階階段柵が不足しています: {stair}/{part}")
            visual = bpy.data.objects[visual_name]
            collider = bpy.data.objects[collider_name]
            first_visuals.append(visual)
            require(len(visual.data.vertices) == expected_visual_vertices, f"開放型階段柵の部品数が不正です: {visual_name}")
            require(len(collider.data.vertices) == expected_collider_vertices, f"連続階段柵Colliderが不正です: {collider_name}")
            if stair == "NW" and part == "Lower":
                for guard in (visual, collider):
                    world_vertices = [guard.matrix_world @ vertex.co for vertex in guard.data.vertices]
                    require(
                        not any(
                            point.x > -10.2 + 1e-5
                            and 38.9 - 1e-5 <= point.y <= 39.06 + 1e-5
                            and -1e-5 <= point.z <= 1.05 + 1e-5
                            for point in world_vertices
                        ),
                        f"北西階段下倉庫の入口を階段柵が塞いでいます: {guard.name}",
                    )
            require_architecture_swatch(visual_name, "trim")
            visual_components += expected_visual_vertices // 8
            collider_components += expected_collider_vertices // 8

        first_segments = rail_centerline_segments(tuple(first_visuals))
        first_junctions = (
            (-10.28, 43.1, 2.4),
            (-8.92, 43.1, 2.4),
            (-8.92, 40.7, 3.6),
        )
        if stair != "NW":
            first_junctions += ((-10.28, 38.9, 0.0),)
        for junction in first_junctions:
            for rail_height in (0.55, 1.0):
                world_junction = transform_stair_point(
                    stair,
                    (junction[0], junction[1], junction[2] + rail_height),
                )
                require_rail_junction(
                    first_segments,
                    world_junction,
                    f"1FTo2F/{stair}",
                )
                rail_junction_checks += 1
        for rail_height in (0.55, 1.0):
            require_rail_segment(
                first_segments,
                transform_stair_point(
                    stair,
                    (-8.92, 40.7, 3.6 + rail_height),
                ),
                transform_stair_point(
                    stair,
                    (-8.92, 38.9, 3.6 + rail_height),
                ),
                f"1FTo2F到達柵/{stair}",
            )
            rail_junction_checks += 1

    connector_surface_count = 0
    terminal_guard_checks = 0
    unique_post_checks = 0
    for stair in ("NW", "NE", "SW"):
        transitions = (("2FTo3F", 3.6), ("3FTo4F", 7.2))
        if stair == "NW":
            transitions += (("4FToRooftop", 10.8),)
        for suffix, base_z in transitions:
            visual_name = f"VIS_StairGuardSystem_{stair}_{suffix}"
            collider_name = f"COL_StairGuardSystem_{stair}_{suffix}"
            require(visual_name in names and collider_name in names, f"上階階段柵が不足しています: {stair}/{suffix}")
            visual = bpy.data.objects[visual_name]
            collider = bpy.data.objects[collider_name]
            has_terminal = stair in ("NE", "SW") and suffix == "3FTo4F"
            expected_visual_vertices = 232 if has_terminal else 184
            expected_collider_vertices = 48 if has_terminal else 40
            require(len(visual.data.vertices) == expected_visual_vertices, f"上階の開放型階段柵が不正です: {visual_name}")
            require(len(collider.data.vertices) == expected_collider_vertices, f"上階の連続階段柵Colliderが不正です: {collider_name}")
            require_architecture_swatch(visual_name, "trim")
            visual_components += expected_visual_vertices // 8
            collider_components += expected_collider_vertices // 8

            segments = rail_centerline_segments((visual,))
            for junction in (
                (-10.28, 38.9, base_z),
                (-10.28, 43.1, base_z + 2.4),
                (-8.92, 43.1, base_z + 2.4),
                (-8.92, 40.7, base_z + 3.6),
            ):
                for rail_height in (0.55, 1.0):
                    world_junction = transform_stair_point(
                        stair,
                        (junction[0], junction[1], junction[2] + rail_height),
                    )
                    require_rail_junction(
                        segments,
                        world_junction,
                        f"{suffix}/{stair}",
                    )
                    rail_junction_checks += 1
            for rail_height in (0.55, 1.0):
                require_rail_segment(
                    segments,
                    transform_stair_point(
                        stair,
                        (-8.92, 40.7, base_z + 3.6 + rail_height),
                    ),
                    transform_stair_point(
                        stair,
                        (-8.92, 38.9, base_z + 3.6 + rail_height),
                    ),
                    f"{suffix}到達柵/{stair}",
                )
                rail_junction_checks += 1

            if has_terminal:
                terminal_start = (-12.6, 38.9, base_z + 3.6)
                terminal_end = (-8.92, 38.9, base_z + 3.6)
                for rail_height in (0.55, 1.0):
                    world_start = transform_stair_point(
                        stair,
                        (
                            terminal_start[0],
                            terminal_start[1],
                            terminal_start[2] + rail_height,
                        ),
                    )
                    world_end = transform_stair_point(
                        stair,
                        (
                            terminal_end[0],
                            terminal_end[1],
                            terminal_end[2] + rail_height,
                        ),
                    )
                    require_rail_segment(
                        segments,
                        world_start,
                        world_end,
                        f"Terminal/{stair}",
                    )
                    terminal_guard_checks += 1
                terminal_collider_bounds = transform_stair_bounds(
                    stair,
                    (
                        (-12.6, 38.82, base_z + 3.6),
                        (-8.92, 38.98, base_z + 4.65),
                    ),
                )
                require_box_component(collider_name, terminal_collider_bounds)
                require_box_component(
                    "NAV_Blocker_SchoolUpper",
                    terminal_collider_bounds,
                )
                terminal_guard_checks += 2

            stair_object = bpy.data.objects.get(f"VIS_StairSystem_{stair}_{suffix}")
            require(stair_object is not None, f"上階階段本体がありません: {stair}/{suffix}")
            connector = transform_stair_point(stair, (-7.8, 39.8, base_z + 3.6))
            require(has_horizontal_surface(stair_object, connector), f"階段上端の接続床がありません: {stair}/{suffix}")
            connector_surface_count += 1

    for stair in ("NW", "NE", "SW"):
        guard_objects = tuple(
            obj
            for obj in objects
            if obj.name.startswith(
                (
                    f"VIS_StairGuard_{stair}_",
                    f"VIS_StairGuardSystem_{stair}_",
                )
            )
        )
        post_bounds = [
            bounds
            for guard in guard_objects
            for bounds in box_component_bounds(guard)
            if all(
                abs(
                    (bounds[1][axis] - bounds[0][axis])
                    - expected_dimension
                )
                <= 1.0e-5
                for axis, expected_dimension in enumerate((0.1, 0.1, 1.05))
            )
        ]
        post_keys = {
            tuple(
                round(value, 5)
                for bound in bounds
                for value in bound
            )
            for bounds in post_bounds
        }
        expected_post_count = 51 if stair == "NW" else 44
        require(
            len(post_bounds) == expected_post_count
            and len(post_keys) == expected_post_count,
            "階段手すり支柱が全Object横断で一意ではありません: "
            f"{stair}/{len(post_bounds)}/{len(post_keys)}/{expected_post_count}",
        )
        unique_post_checks += expected_post_count
        all_segments = rail_centerline_segments(guard_objects)
        for arrival_z in (3.6, 7.2, 10.8):
            for rail_height in (0.55, 1.0):
                require_rail_junction(
                    all_segments,
                    transform_stair_point(
                        stair,
                        (-8.92, 38.9, arrival_z + rail_height),
                    ),
                    f"階段到達柵/{stair}/{arrival_z}",
                )
                rail_junction_checks += 1

    first_transition_objects = {
        "NW": "VIS_StairsUpper_NW",
        "NE": "VIS_StairsUpper_NE",
        "SW": "VIS_StairsUpper_SW",
    }
    for stair, object_name in first_transition_objects.items():
        stairs = bpy.data.objects.get(object_name)
        require(stairs is not None, f"1～2階階段本体がありません: {stair}")
        connector = transform_stair_point(stair, (-7.8, 39.8, 3.6))
        require(has_horizontal_surface(stairs, connector), f"2階への接続床がありません: {stair}")
        connector_surface_count += 1

    forbidden_rooftop_stairs = sorted(
        name
        for name in names
        if name.startswith(
            (
                "VIS_StairSystem_NE_4FToRooftop",
                "COL_StairSystem_NE_4FToRooftop",
                "VIS_StairGuardSystem_NE_4FToRooftop",
                "COL_StairGuardSystem_NE_4FToRooftop",
                "VIS_StairSystem_SW_4FToRooftop",
                "COL_StairSystem_SW_4FToRooftop",
                "VIS_StairGuardSystem_SW_4FToRooftop",
                "COL_StairGuardSystem_SW_4FToRooftop",
            )
        )
    )
    require(
        not forbidden_rooftop_stairs,
        f"北東・南西階段に屋上接続が追加されています: {forbidden_rooftop_stairs}",
    )

    stair_swatch_names = sorted(
        name
        for name in names
        if name.startswith(("VIS_Stairs_", "VIS_StairsUpper_", "VIS_StairSystem_", "VIS_StairLanding_"))
    )
    require(len(stair_swatch_names) == 16, f"階段本体の配色監査対象件数が不正です: {stair_swatch_names}")
    for object_name in stair_swatch_names:
        require_architecture_swatch(object_name, "floor")

    return {
        "visual_objects": 16,
        "collider_objects": 16,
        "visual_components": visual_components,
        "collider_components": collider_components,
        "connector_surfaces": connector_surface_count,
        "central_well_checks": central_well_checks,
        "rail_junction_checks": rail_junction_checks,
        "terminal_guard_checks": terminal_guard_checks,
        "stair_floor_swatch_checks": len(stair_swatch_names),
        "unique_post_checks": unique_post_checks,
    }


def audit_glb_bit_flight_contract(
    nodes: list[dict[str, object]],
) -> dict[str, int]:
    nodes_by_name = {
        node["name"]: node
        for node in nodes
        if isinstance(node.get("name"), str)
    }
    metadata = nodes_by_name.get("META_Stage")
    require(metadata is not None, "GLBにMETA_Stageがありません")
    metadata_extras = metadata.get("extras", {})
    require(
        metadata_extras.get("hs_schema_version") == EXPECTED_SCHEMA_VERSION,
        "GLB META_Stage.hs_schema_versionが2ではありません",
    )
    require(
        metadata_extras.get("hs_stage_id") == EXPECTED_STAGE_ID,
        "GLB META_Stage.hs_stage_idがschoolではありません",
    )
    require(
        metadata_extras.get("hs_nav_profile") == EXPECTED_HUMAN_NAV_PROFILE,
        "GLB META_Stage.hs_nav_profileが学校人間用profileと一致しません",
    )
    require(
        metadata_extras.get("hs_bit_nav_profile") == EXPECTED_BIT_NAV_PROFILE,
        "GLB META_Stage.hs_bit_nav_profileがビット用profileと一致しません",
    )

    human_nav_nodes = [
        node
        for node in nodes
        if node.get("name", "").startswith("NAV_")
        and not node.get("name", "").startswith("NAV_BitFlight_")
    ]
    require(human_nav_nodes, "GLBに人間用NAV生成元がありません")
    bit_only_keys = {
        "hs_zone_id",
        "hs_band_id",
        "hs_space_kind",
        "hs_center_height_min_m",
        "hs_center_height_max_m",
    }
    for node in human_nav_nodes:
        extras = node.get("extras", {})
        require(
            extras.get("hs_nav_set") == "human",
            f"GLB人間用NAVのhs_nav_setがhumanではありません: {node['name']}",
        )
        require(
            not bit_only_keys.intersection(hs_properties(extras)),
            f"GLB人間用NAVへビット飛行帯extrasが混入しています: {node['name']}",
        )

    expected_bit_names = set()
    for (
        walkable_name,
        zone_id,
        band_id,
        space_kind,
        minimum_center_height,
        maximum_center_height,
    ) in EXPECTED_BIT_FLIGHT_BANDS:
        blocker_name = bit_flight_obstacle_name(zone_id, band_id)
        nav_sources = [
            (walkable_name, "walkable"),
            (blocker_name, "blocker"),
        ]
        for object_name, nav_role in nav_sources:
            expected_bit_names.add(object_name)
            node = nodes_by_name.get(object_name)
            require(node is not None, f"GLBにビット用NAV生成元がありません: {object_name}")
            require_exact_hs_properties(
                object_name,
                node.get("extras", {}),
                bit_flight_nav_properties(
                    zone_id,
                    band_id,
                    space_kind,
                    minimum_center_height,
                    maximum_center_height,
                    nav_role,
                ),
            )
    actual_bit_names = {
        node["name"]
        for node in nodes
        if node.get("name", "").startswith("NAV_BitFlight_")
    }
    require(
        actual_bit_names == expected_bit_names,
        "GLBビット用NAV生成元が学校11帯walkable＋11帯blockerと一致しません",
    )

    expected_transitions = expected_bit_flight_transitions()
    actual_transition_names = {
        node["name"]
        for node in nodes
        if node.get("name", "").startswith("VOL_BitFlight_")
    }
    require(
        actual_transition_names == set(expected_transitions),
        "GLBビット遷移Volumeが承認済み15件と一致しません",
    )
    for object_name, (expected_properties, _) in expected_transitions.items():
        require_exact_hs_properties(
            object_name,
            nodes_by_name[object_name].get("extras", {}),
            expected_properties,
        )

    aperture_nodes = [
        node
        for node in nodes
        if node.get("name", "").startswith("LNK_bit-window-")
    ]
    require(
        len(aperture_nodes) == 114,
        f"GLB aperture端点が114件ではありません: {len(aperture_nodes)}",
    )
    aperture_ids = Counter()
    for node in aperture_nodes:
        match = LINK_PATTERN.match(node["name"])
        require(match is not None, f"GLB aperture名が契約外です: {node['name']}")
        link_id, endpoint = match.groups()
        aperture_ids[link_id] += 1
        require_exact_hs_properties(
            node["name"],
            node.get("extras", {}),
            expected_aperture_endpoint_properties(link_id, endpoint),
        )
    require(
        len(aperture_ids) == 57 and set(aperture_ids.values()) == {2},
        "GLB apertureが57組のA/B端点ではありません",
    )
    legacy_roof_nodes = [
        node["name"]
        for node in nodes
        if node.get("name", "").startswith("LNK_bit-roof-")
        or node.get("extras", {}).get("hs_link_kind") == "bit_roof"
    ]
    require(
        not legacy_roof_nodes,
        f"GLBに廃止済みbit_roof接続が残っています: {legacy_roof_nodes}",
    )
    return {
        "human_nav_sources": len(human_nav_nodes),
        "bit_nav_sources": len(expected_bit_names),
        "bit_nav_walkable_sources": len(EXPECTED_BIT_FLIGHT_BANDS),
        "bit_nav_blocker_sources": len(EXPECTED_BIT_FLIGHT_BANDS),
        "rooftop_blocker_sources": 1,
        "bit_flight_transitions": len(expected_transitions),
        "aperture_endpoints": len(aperture_nodes),
        "legacy_bit_roof": len(legacy_roof_nodes),
    }


def audit_glb_assembly_contract(
    nodes: list[dict[str, object]],
) -> dict[str, int]:
    nodes_by_name = {
        node.get("name"): node
        for node in nodes
        if isinstance(node.get("name"), str)
    }
    require(
        not any(name in nodes_by_name for name in ASSEMBLY_GUIDE_NAMES),
        "GLBに集合会場の旧VIS_*ガイドが残っています",
    )
    expected_anchor_names = {
        f"MRK_AssemblyAnchor_{suffix}"
        for suffix, *_ in ASSEMBLY_VENUE_SPECS
    }
    expected_volume_names = {
        f"VOL_Assembly_{suffix}"
        for suffix, *_ in ASSEMBLY_VENUE_SPECS
    }
    actual_anchor_names = {
        node["name"]
        for node in nodes
        if node.get("extras", {}).get("hs_role") == "assembly_anchor"
    }
    actual_volume_names = {
        node["name"]
        for node in nodes
        if node.get("extras", {}).get("hs_role") == "assembly"
    }
    require(
        actual_anchor_names == expected_anchor_names,
        f"GLB集合会場anchor構成が不正です: {sorted(actual_anchor_names)}",
    )
    require(
        actual_volume_names == expected_volume_names,
        f"GLB集合会場Volume構成が不正です: {sorted(actual_volume_names)}",
    )

    for (
        suffix,
        anchor_id,
        volume_id,
        anchor_position,
        grid_spec,
        _volume_bounds,
    ) in ASSEMBLY_VENUE_SPECS:
        anchor_name = f"MRK_AssemblyAnchor_{suffix}"
        volume_name = f"VOL_Assembly_{suffix}"
        anchor = nodes_by_name[anchor_name]
        volume = nodes_by_name[volume_name]
        require("mesh" not in anchor, f"GLB集合会場anchorがEmptyではありません: {anchor_name}")
        require(
            isinstance(volume.get("mesh"), int),
            f"GLB集合会場VolumeがMeshではありません: {volume_name}",
        )
        expected_anchor_properties = expected_assembly_anchor_properties(
            anchor_id,
            anchor_position,
            grid_spec,
        )
        require_exact_hs_properties(
            anchor_name,
            anchor.get("extras", {}),
            expected_anchor_properties,
        )
        require_exact_hs_properties(
            volume_name,
            volume.get("extras", {}),
            {
                "hs_id": volume_id,
                "hs_role": "assembly",
                "hs_anchor_id": anchor_id,
            },
        )
        for property_name, expected_length in (
            ("hs_assembly_positions_json", 100),
            ("hs_execution_audience_positions_json", 94),
            ("hs_execution_target_positions_json", 6),
        ):
            require_finite_position_array_json(
                f"{anchor_name}.{property_name}",
                anchor.get("extras", {}).get(property_name),
                expected_length,
            )
    return {
        "anchors": len(actual_anchor_names),
        "volumes": len(actual_volume_names),
        "assembly_positions": 200,
        "execution_audience_positions": 188,
        "execution_target_positions": 12,
    }


def audit_glb(document: GlbDocument) -> dict[str, object]:
    gltf = document.json_data
    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    accessors = gltf.get("accessors", [])
    buffer_views = gltf.get("bufferViews", [])
    materials = gltf.get("materials", [])
    animations = gltf.get("animations", [])
    cameras = gltf.get("cameras", [])
    require(not animations, "GLBにAnimationがあります")
    require(not cameras, "GLBにCameraがあります")
    extensions = gltf.get("extensions", {})
    require("KHR_lights_punctual" not in extensions, "GLBにLightがあります")
    node_names = [node.get("name") for node in nodes if node.get("name")]
    require(len(node_names) == len(set(node_names)), "GLB Node名が重複しています")
    expected_hardware_material = str(
        ATLAS_DEFINITIONS["FurnitureProps"]["material"]
    )
    room_handle_nodes = [
        node
        for node in nodes
        if node.get("name", "").startswith("VIS_DoorPanel_Handle_")
    ]
    toilet_knob_nodes = [
        node
        for node in nodes
        if node.get("name", "").startswith("VIS_DoorPanel_Knob_")
    ]
    require(
        len(room_handle_nodes) == 40,
        f"GLB室内・屋上更衣室引き戸の両面取っ手Nodeが40件ではありません: "
        f"{len(room_handle_nodes)}",
    )
    require(
        len(toilet_knob_nodes) == 24,
        f"GLBトイレ個室扉の外側ノブNodeが24件ではありません: "
        f"{len(toilet_knob_nodes)}",
    )
    for node in (*room_handle_nodes, *toilet_knob_nodes):
        node_name = node.get("name", "")
        mesh_index = node.get("mesh")
        require(
            isinstance(mesh_index, int) and 0 <= mesh_index < len(meshes),
            f"GLB扉金物のMesh参照が不正です: {node_name}/{mesh_index}",
        )
        primitives = meshes[mesh_index].get("primitives", [])
        require(
            len(primitives) == 1,
            f"GLB扉金物のPrimitiveが1件ではありません: "
            f"{node_name}/{len(primitives)}",
        )
        primitive = primitives[0]
        material_index = primitive.get("material")
        require(
            isinstance(material_index, int)
            and 0 <= material_index < len(materials)
            and materials[material_index].get("name") == expected_hardware_material,
            f"GLB扉金物の材質参照が不正です: {node_name}/{material_index}",
        )
        texcoord_accessor_index = primitive.get("attributes", {}).get("TEXCOORD_0")
        require(
            isinstance(texcoord_accessor_index, int)
            and 0 <= texcoord_accessor_index < len(accessors),
            f"GLB扉金物にTEXCOORD_0がありません: "
            f"{node_name}/{texcoord_accessor_index}",
        )
        texcoord_accessor = accessors[texcoord_accessor_index]
        require(
            texcoord_accessor.get("componentType") == 5126
            and texcoord_accessor.get("type") == "VEC2",
            f"GLB扉金物のTEXCOORD_0形式が不正です: "
            f"{node_name}/{texcoord_accessor}",
        )
        payload, _ = accessor_payload(
            texcoord_accessor,
            buffer_views,
            document.binary_data,
        )
        texcoords = list(struct.iter_unpack("<ff", payload))
        require(
            len(texcoords) == texcoord_accessor.get("count"),
            f"GLB扉金物のTEXCOORD_0件数が不正です: "
            f"{node_name}/{len(texcoords)}",
        )
        expected_coordinates = swatch_uv(
            "FurnitureProps",
            "door_hardware_yellow",
        )
        minimum_u = min(coordinate[0] for coordinate in expected_coordinates)
        maximum_u = max(coordinate[0] for coordinate in expected_coordinates)
        minimum_v = 1.0 - max(
            coordinate[1] for coordinate in expected_coordinates
        )
        maximum_v = 1.0 - min(
            coordinate[1] for coordinate in expected_coordinates
        )
        require(
            all(
                minimum_u - 1e-6 <= coordinate[0] <= maximum_u + 1e-6
                and minimum_v - 1e-6 <= coordinate[1] <= maximum_v + 1e-6
                for coordinate in texcoords
            ),
            f"GLB扉金物のUVがdoor_hardware_yellowセル外です: "
            f"{node_name}",
        )
    expected_frames = 81
    expected_actor = 33
    expected_fixed = 48
    expected_human = 57
    require(sum(name.startswith("VIS_WindowFrame_") for name in node_names) == expected_frames, f"GLB窓枠が{expected_frames}件ではありません")
    require(sum(name.startswith("VIS_WindowGlass_") for name in node_names) == expected_frames, f"GLB窓ガラスが{expected_frames}件ではありません")
    require(sum(name.startswith("COL_ActorOnly_Window_") for name in node_names) == expected_actor, f"GLB ActorOnly窓が{expected_actor}件ではありません")
    require(sum(name.startswith("COL_ActorOnly_WindowFixed_") for name in node_names) == expected_fixed, f"GLB開放窓帯固定Colliderが{expected_fixed}件ではありません")
    require(sum(name.startswith("COL_HumanOnly_Window_") for name in node_names) == expected_human, f"GLB HumanOnly窓が{expected_human}件ではありません")
    bit_flight_counts = audit_glb_bit_flight_contract(nodes)
    assembly_counts = audit_glb_assembly_contract(nodes)
    require("VOL_PoolWater" in node_names, "GLBにVOL_PoolWaterがありません")
    require(not any("Gym_South" in name for name in node_names), "GLB体育館南面に窓があります")
    require(not any(name.startswith("PRT_") for name in node_names), "GLBにPRT_*があります")
    perimeter_joint_nodes = [
        node
        for node in nodes
        if node.get("name") == "VIS_B03_PerimeterBlockJoints"
    ]
    require(
        len(perimeter_joint_nodes) == 1,
        f"GLBの塀目地Nodeが1件ではありません: {len(perimeter_joint_nodes)}",
    )
    perimeter_joint_mesh_index = perimeter_joint_nodes[0].get("mesh")
    require(
        isinstance(perimeter_joint_mesh_index, int)
        and 0 <= perimeter_joint_mesh_index < len(meshes),
        f"GLBの塀目地Mesh参照が不正です: {perimeter_joint_mesh_index}",
    )
    perimeter_joint_primitives = meshes[perimeter_joint_mesh_index].get(
        "primitives",
        [],
    )
    require(
        len(perimeter_joint_primitives) == 1,
        f"GLBの塀目地Primitiveが1件ではありません: {len(perimeter_joint_primitives)}",
    )
    perimeter_joint_primitive = perimeter_joint_primitives[0]
    require(
        perimeter_joint_primitive.get("mode", 4) == 4,
        "GLBの塀目地PrimitiveがTRIANGLESではありません",
    )
    position_accessor_index = perimeter_joint_primitive.get(
        "attributes",
        {},
    ).get("POSITION")
    index_accessor_index = perimeter_joint_primitive.get("indices")
    require(
        isinstance(position_accessor_index, int)
        and 0 <= position_accessor_index < len(accessors),
        f"GLBの塀目地POSITION参照が不正です: {position_accessor_index}",
    )
    require(
        isinstance(index_accessor_index, int)
        and 0 <= index_accessor_index < len(accessors),
        f"GLBの塀目地indices参照が不正です: {index_accessor_index}",
    )
    perimeter_joint_vertex_count = accessors[position_accessor_index].get("count")
    perimeter_joint_index_count = accessors[index_accessor_index].get("count")
    require(
        perimeter_joint_vertex_count == 14320,
        f"GLBの塀目地頂点数が14320ではありません: {perimeter_joint_vertex_count}",
    )
    require(
        perimeter_joint_index_count == 21480,
        f"GLBの塀目地index数が21480ではありません: {perimeter_joint_index_count}",
    )
    for node in nodes:
        name = node.get("name", "")
        extras = node.get("extras", {})
        require(
            not any(key.startswith("hs_window_") for key in extras),
            f"GLBへ窓配置検討用propertyが出力されています: {name}",
        )
        if name == "VOL_PoolWater":
            require(extras.get("hs_id") == "pool-water", "GLB水Volumeのhs_idが不正です")
            require(extras.get("hs_role") == "water", "GLB水Volumeのhs_roleが不正です")
    return {
        "nodes": len(nodes),
        "meshes": len(meshes),
        "materials": len(materials),
        "perimeter_joint_vertices": perimeter_joint_vertex_count,
        "perimeter_joint_triangles": perimeter_joint_index_count // 3,
        "room_door_handles": len(room_handle_nodes),
        "toilet_door_knobs": len(toilet_knob_nodes),
        "bit_flight": bit_flight_counts,
        "assembly": assembly_counts,
    }


def audit_glb_optimization() -> dict[str, int]:
    document = read_glb(GLB_PATH)
    gltf = document.json_data
    accessors = gltf.get("accessors", [])
    buffer_views = gltf.get("bufferViews", [])
    used_indices = collect_used_accessor_indices(gltf)
    require(len(used_indices) == len(accessors), "GLBに未使用Accessorがあります")
    image_view_indices = {
        image["bufferView"]
        for image in gltf.get("images", [])
        if "bufferView" in image
    }
    require(
        len(buffer_views) == len(accessors) + len(image_view_indices),
        "GLBのAccessor用bufferViewと埋め込みImage用bufferViewの件数が不正です",
    )

    mesh_node_names: dict[int, list[str]] = defaultdict(list)
    for node in gltf.get("nodes", []):
        mesh_index = node.get("mesh")
        if mesh_index is not None:
            mesh_node_names[mesh_index].append(node.get("name", ""))
    materials = gltf.get("materials", [])
    for mesh_index, mesh in enumerate(gltf.get("meshes", [])):
        node_names = mesh_node_names.get(mesh_index, [])
        normals_are_runtime_required = bool(node_names) and all(
            name.startswith(("VIS_", "COL_")) for name in node_names
        )
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            require(
                ("NORMAL" in attributes) == normals_are_runtime_required,
                f"Runtime用途とNormal有無が一致しません: {node_names}",
            )
            material_index = primitive.get("material")
            uses_texture = (
                material_index is not None
                and material_uses_texture(materials[material_index])
            )
            if not uses_texture:
                require(
                    not any(name.startswith("TEXCOORD_") for name in attributes),
                    f"Texture未使用MeshにUVがあります: {node_names}",
                )

    canonical_accessors: set[tuple[str, int | None, bytes]] = set()
    for accessor_index in sorted(used_indices):
        accessor = accessors[accessor_index]
        payload, target = accessor_payload(accessor, buffer_views, document.binary_data)
        metadata = {
            key: value
            for key, value in accessor.items()
            if key not in {"bufferView", "byteOffset", "name"}
        }
        key = (
            json.dumps(metadata, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            target,
            payload,
        )
        require(key not in canonical_accessors, "GLBに重複Accessorがあります")
        canonical_accessors.add(key)
    return {
        "bytes": GLB_PATH.stat().st_size,
        "accessors": len(accessors),
        "buffer_views": len(buffer_views),
        "binary_bytes": len(document.binary_data),
    }


def main() -> None:
    require(Path(bpy.data.filepath).resolve() == BLEND_PATH.resolve(), "監査対象.blendが不正です")
    require(
        bpy.context.scene.get("b03_architecture_generator_version")
        == EXPECTED_GENERATOR_VERSION,
        "建築生成版がB03-3Cインタラクティブ資産版ではありません",
    )
    require(
        bpy.context.scene.get("t04_2b_nav_connectivity_version")
        == EXPECTED_T04_CORRECTION_VERSION,
        "T04補正版がv11ではありません",
    )
    require(bpy.context.scene.get("b03_window_layout_status") == "final", "窓配置が最終状態ではありません")
    require(sha256(NAVMESH_PATH) == EXPECTED_NAVMESH_SHA256, "NavMesh SHA-256が変化しています")
    require(sha256(PROP_LIBRARY_PATH) == EXPECTED_PROP_LIBRARY_SHA256, "B03-PライブラリSHA-256が変化しています")
    export_collection = bpy.data.collections.get("EXP_Stage_school")
    require(export_collection is not None, "EXP_Stage_schoolがありません")
    require(bpy.data.collections.get("B02_GUIDES") is None, "最終.blendにB02_GUIDESが残っています")
    require(not any(obj.name.startswith("GUIDE_") for obj in bpy.data.objects), "最終.blendにGUIDE_*が残っています")
    require(not bpy.data.cameras, "最終.blendにCamera datablockが残っています")
    require(not bpy.data.lights, "最終.blendにLight datablockが残っています")
    require(not bpy.data.curves, "最終.blendにText/Curve datablockが残っています")
    orphan_datablocks = [
        datablock.name
        for datablocks in (
            bpy.data.meshes,
            bpy.data.materials,
            bpy.data.node_groups,
            bpy.data.actions,
        )
        for datablock in datablocks
        if datablock.users == 0
    ]
    require(not orphan_datablocks, f"最終.blendに未使用datablockがあります: {orphan_datablocks}")
    export_objects = list(export_collection.all_objects)
    names = [obj.name for obj in export_objects]
    require(len(names) == len(set(names)), "Blender Object名が重複しています")
    audit_mesh_contract(export_objects)
    audit_hs_ids(export_objects)
    window_counts = audit_windows(export_objects)
    link_counts = audit_links(export_objects)
    bit_flight_counts = audit_bit_flight_navigation(export_objects)
    stair_guard_counts = audit_stair_guards(export_objects)
    roof_guard_counts = audit_roof_guards()
    rooftop_escape_crates = audit_rooftop_escape_crate_mounds()
    acceptance_visuals = audit_acceptance_visuals(export_objects)
    b03_3b_structure = audit_b03_3b_structure(export_objects)
    audit_semantics(export_objects)
    glb_counts = audit_glb(read_glb(GLB_PATH))
    glb_optimization = audit_glb_optimization()
    prefixes = Counter(name.split("_", 1)[0] for name in names)
    result = {
        "blend_sha256": sha256(BLEND_PATH),
        "glb_sha256": sha256(GLB_PATH),
        "navmesh_sha256": sha256(NAVMESH_PATH),
        "prop_library_sha256": sha256(PROP_LIBRARY_PATH),
        "blender_objects": len(bpy.data.objects),
        "blender_meshes": len(bpy.data.meshes),
        "blender_materials": len(bpy.data.materials),
        "orphan_datablocks": len(orphan_datablocks),
        "export_objects": len(export_objects),
        "prefixes": dict(sorted(prefixes.items())),
        "windows": window_counts,
        "links": link_counts,
        "bit_flight": bit_flight_counts,
        "stair_guards": stair_guard_counts,
        "roof_guards": roof_guard_counts,
        "rooftop_escape_crates": rooftop_escape_crates,
        "acceptance_visuals": acceptance_visuals,
        "b03_3b_structure": b03_3b_structure,
        "glb": glb_counts,
        "glb_optimization": glb_optimization,
    }
    print("B03_AUDIT_RESULT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
