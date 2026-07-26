from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from optimize_b03_school_glb import optimize_glb
from build_b03_school_interiors import (
    FIRST_FLOOR_WEST_DOOR_OPENINGS,
    NORTH_CLASSROOM_DOOR_OPENINGS,
    TOILET_COMMON_OPENING,
    TOILET_FRONT_DOOR_HEIGHT,
    TOILET_FRONT_DOOR_OPENINGS,
    TOILET_FRONT_WALL_DEPTH,
    TOILET_FRONT_WALL_SPANS,
    TOILET_FRONT_WALL_Y,
    UPPER_WEST_CLASSROOM_DOOR_OPENINGS,
    build_school_interiors,
    consolidate_school_materials,
    swatch_uv,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
PROP_LIBRARY_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B03/b03_school_prop_library.blend"
)

VIS_COLLECTION_NAME = "B02_VIS"
COL_COLLECTION_NAME = "B02_COL"
NAV_COLLECTION_NAME = "B02_NAV"
SEMANTIC_COLLECTION_NAME = "B02_SEMANTIC"
EXPORT_COLLECTION_NAME = "EXP_Stage_school"
LEGACY_GUIDE_COLLECTION_NAME = "B02_GUIDES"

WINDOW_UNIT_CLEAR_WIDTH = 2.40
STAIR_WINDOW_UNIT_CLEAR_WIDTH = 1.80
SCHOOL_WINDOW_CLEAR_HEIGHT = 1.80
GYM_WINDOW_CLEAR_HEIGHT = 1.80
STAIR_WINDOW_CLEAR_HEIGHT = 0.70
WINDOW_FRAME_BORDER = 0.05
WINDOW_MEETING_STILE_WIDTH = 0.06
WALL_THICKNESS = 0.30
BIT_FLIGHT_PHYSICAL_RADIUS_METERS = 0.44
BIT_FLIGHT_SAFETY_MARGIN_METERS = 0.10
BIT_FLIGHT_SAFETY_ENVELOPE_METERS = (
    BIT_FLIGHT_PHYSICAL_RADIUS_METERS + BIT_FLIGHT_SAFETY_MARGIN_METERS
)
LINK_RADIUS_METERS = BIT_FLIGHT_SAFETY_ENVELOPE_METERS
BIT_FLIGHT_BLOCKER_HALF_HEIGHT_METERS = (
    BIT_FLIGHT_SAFETY_ENVELOPE_METERS + 0.05
)
BIT_FLIGHT_PROJECTION_DISTANCE_METERS = 3.0
BIT_FLIGHT_NAV_PROFILE = "bit-flight-body-0.44-margin-0.10-v1"
GENERATOR_VERSION = "t05-2-assembly-execution-v01"
GENERATOR_VERSION_PROPERTY = "b03_architecture_generator_version"
GENERATOR_SIGNATURE_PROPERTY = "b03_architecture_generator_signature"
T04_CORRECTION_VERSION_PROPERTY = "t04_2b_nav_connectivity_version"
T04_CORRECTION_VERSION = "t04-2b-nav-connectivity-v09"

ASSEMBLY_GUIDE_NAMES = (
    "VIS_CourtyardCapacityGrid_10x10",
    "VIS_GymCapacityGrid_10x10",
    "VIS_GymExecutionAudience_94",
    "VIS_GymExecutionTargets_06",
)

GATE_VISUAL_SPECS = (
    ("VIS_Gate_MainClosed", "X", 19.4, 25.4, -12.5),
    ("VIS_Gate_UtilityClosed", "Y", 44.5, 50.5, 63.4),
)
PERIMETER_WALL_SPECS = (
    ("VIS_Perimeter_East", "Y", -12.5, 44.5, 63.2, 63.6),
    ("VIS_Perimeter_EastNorth", "Y", 50.5, 51.5, 63.2, 63.6),
    ("VIS_Perimeter_NorthEast", "X", 22.4, 63.4, 51.3, 51.7),
    ("VIS_Perimeter_NorthWest", "X", -18.6, 22.4, 51.3, 51.7),
    ("VIS_Perimeter_SouthEast", "X", 25.4, 63.4, -12.7, -12.3),
    ("VIS_Perimeter_SouthWest", "X", -18.6, 19.4, -12.7, -12.3),
    ("VIS_Perimeter_West", "Y", -12.5, 51.5, -18.8, -18.4),
)
PERIMETER_WALL_Z = (-0.3, 1.7)
PERIMETER_BLOCK_WIDTH = 0.8
PERIMETER_BLOCK_HEIGHT = 0.4
PERIMETER_JOINT_WIDTH = 0.02
PERIMETER_JOINT_DEPTH = 0.006

STAIR_NAV_BLOCKER_SOURCE_NAMES = (
    "COL_StairGuard_NE_Landing",
    "COL_StairGuard_NE_Lower",
    "COL_StairGuard_NE_Upper",
    "COL_StairGuard_NW_Landing",
    "COL_StairGuard_NW_Lower",
    "COL_StairGuard_NW_Upper",
    "COL_StairStorageShell_NW",
    "COL_StairGuard_SW_Landing",
    "COL_StairGuard_SW_Lower",
    "COL_StairGuard_SW_Upper",
)
UPPER_STAIR_NAV_BLOCKER_SOURCE_NAMES = (
    "COL_StairGuardSystem_NW_2FTo3F",
    "COL_StairGuardSystem_NW_3FTo4F",
    "COL_StairGuardSystem_NW_4FToRooftop",
    "COL_StairGuardSystem_NE_2FTo3F",
    "COL_StairGuardSystem_NE_3FTo4F",
    "COL_StairGuardSystem_SW_2FTo3F",
    "COL_StairGuardSystem_SW_3FTo4F",
)
UPPER_STAIR_NAV_SOURCE_NAMES = (
    "COL_StairRampUpper_NW",
    "COL_StairRampUpper_NE",
    "COL_StairRampUpper_SW",
    "COL_StairSystem_NW_2FTo3F",
    "COL_StairSystem_NW_3FTo4F",
    "COL_StairSystem_NW_4FToRooftop",
    "COL_StairSystem_NE_2FTo3F",
    "COL_StairSystem_NE_3FTo4F",
    "COL_StairSystem_SW_2FTo3F",
    "COL_StairSystem_SW_3FTo4F",
)

UPPER_FLOOR_PANELS_XY = (
    ((-6.0, -3.5), (0.0, 32.5)),
    ((-12.6, 2.5), (-6.0, 32.5)),
    ((-6.6, 32.5), (41.4, 45.5)),
    ((-12.6, 32.5), (-6.6, 38.9)),
    ((41.4, 32.5), (47.4, 38.9)),
)
F4_CEILING_PANELS_XY = (
    *UPPER_FLOOR_PANELS_XY,
    ((-12.6, -3.5), (-6.0, 2.5)),
    ((41.4, 38.9), (47.4, 45.5)),
)

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
        (-0.1, -3.4, 14.5),
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
        (-12.5, -3.4, 14.5),
        (-0.1, -3.4, 14.5),
        False,
        True,
    ),
    (
        "WestOuter",
        (-12.5, -3.4, 14.5),
        (-12.5, 38.9, 14.5),
        True,
        True,
    ),
)

WINDOW_AUTHORING_PROPERTY_NAMES = (
    "hs_window_clear_height_m",
    "hs_window_layout_status",
    "hs_window_open_leaves",
    "hs_window_panes",
    "hs_window_style",
    "hs_window_unit_width_m",
    "hs_window_units",
)

GENERATED_PREFIXES = (
    "VIS_B03_",
    "COL_B03_",
    "NAV_B03_",
    "NAV_BitFlight_",
    "VIS_WindowFrame_",
    "VIS_WindowGlass_",
    "COL_ActorOnly_Window_",
    "COL_ActorOnly_WindowFixed_",
    "COL_HumanOnly_Window_",
    "LNK_bit-window-",
    "LNK_bit-roof-",
    "VOL_BitFlight_",
    "VOL_PoolWater",
    "VIS_StairSystem_NE_",
    "COL_StairSystem_NE_",
    "VIS_StairGuardSystem_NE_",
    "COL_StairGuardSystem_NE_",
    "VIS_StairSystem_SW_",
    "COL_StairSystem_SW_",
    "VIS_StairGuardSystem_SW_",
    "COL_StairGuardSystem_SW_",
    "VIS_RoofGuard_",
    "COL_RoofGuard_",
)

GENERATED_EXACT_NAMES = {
    "MRK_AssemblyAnchor_Courtyard",
    "MRK_AssemblyAnchor_Gym",
    "VOL_Assembly_Courtyard",
    "VOL_Assembly_Gym",
    "VIS_Gate_MainClosed",
    "VIS_Gate_UtilityClosed",
    "NAV_Walkable_Interior2F",
    "NAV_Walkable_Interior3F",
    "NAV_Walkable_Interior4F",
    "NAV_Walkable_StairsNWUpper",
    "NAV_Walkable_Rooftop",
    "NAV_Blocker_SchoolUpper",
    "NAV_Blocker_Interiors",
}

BIT_FLIGHT_BANDS = (
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

SOURCE_OBJECTS_TO_REMOVE = {
    *ASSEMBLY_GUIDE_NAMES,
    "VIS_WindowGuide_1F_Courtyard_1",
    "VIS_WindowGuide_1F_Courtyard_2",
    "VIS_WindowGuide_1F_Courtyard_3",
    "VIS_WindowGuide_1F_North_1",
    "VIS_WindowGuide_1F_North_2",
    "VIS_WindowGuide_1F_North_3",
    "VIS_WindowGuide_1F_North_4",
    "VIS_WindowGuide_1F_North_5",
    "VIS_WindowGuide_1F_NorthWingEast",
    "VIS_WindowGuide_1F_NorthWingWest",
    "VIS_WindowGuide_1F_WestCourtyard_1",
    "VIS_WindowGuide_1F_WestCourtyard_2",
    "VIS_WindowGuide_1F_WestCourtyard_3",
    "VIS_WindowGuide_1F_WestOuter_1",
    "VIS_WindowGuide_1F_WestOuter_2",
    "VIS_WindowGuide_1F_WestOuter_3",
    "VIS_WindowGuide_1F_WestSouth_1",
    "VIS_WindowGuide_1F_WestSouth_2",
    "VIS_PoolWaterPlaceholder",
    "VIS_Ceiling1F_North",
    "VIS_Ceiling1F_West",
    "COL_Ceiling1F_North",
    "COL_Ceiling1F_West",
    "COL_StairClosure_NE",
    "COL_StairClosure_SW",
    "VIS_Floor_ToiletFront",
    "VIS_Floor_ToiletZone",
}

for prefix in ("VIS_", "COL_"):
    SOURCE_OBJECTS_TO_REMOVE.update(
        {
            f"{prefix}Wall_Lintel_Toilet_F",
            f"{prefix}Wall_Lintel_Toilet_M",
            f"{prefix}Wall_Toilet_South_A",
            f"{prefix}Wall_Toilet_South_B",
            f"{prefix}Wall_Toilet_South_C",
            f"{prefix}Wall_Toilet_South_D",
        }
    )

for floor in (2, 3, 4):
    SOURCE_OBJECTS_TO_REMOVE.update(
        {
            f"VIS_{floor}F_NorthVolume",
            f"VIS_{floor}F_WestVolume",
            f"COL_{floor}F_NorthVolume",
            f"COL_{floor}F_WestVolume",
        }
    )
    for band, count in (
        ("Courtyard", 3),
        ("North", 5),
        ("West", 5),
        ("WestCourtyard", 3),
        ("WestSouth", 2),
    ):
        for index in range(1, count + 1):
            SOURCE_OBJECTS_TO_REMOVE.add(
                f"VIS_WindowGuide_{floor}F_{band}_{index}"
            )

for side in ("East", "North", "South", "West"):
    for index in range(1, 4):
        SOURCE_OBJECTS_TO_REMOVE.add(f"VIS_WindowGuide_GymUpper_{side}_{index}")

for prefix in ("VIS_", "COL_"):
    SOURCE_OBJECTS_TO_REMOVE.update(
        {
            f"{prefix}Wall1F_CourtyardNorth_Left",
            f"{prefix}Wall1F_CourtyardNorth_Right",
            f"{prefix}Wall1F_CourtyardWest_North",
            f"{prefix}Wall1F_CourtyardWest_South",
            f"{prefix}Wall1F_EastNorth",
            f"{prefix}Wall1F_NorthLeft",
            f"{prefix}Wall1F_NorthRight",
            f"{prefix}Wall1F_NorthWingWestOuter",
            f"{prefix}Wall1F_SouthFull",
            f"{prefix}Wall1F_WestOuter",
            f"{prefix}Wall_Lintel_MainEntry",
            f"{prefix}Wall_Lintel_NorthEntry",
            f"{prefix}Wall_Lintel_NorthWingBridge",
            f"{prefix}Wall_Lintel_NorthWingSouthEntry",
            f"{prefix}GymWall_East",
            f"{prefix}GymWall_Lintel_Bridge",
            f"{prefix}GymWall_Lintel_Courtyard",
            f"{prefix}GymWall_Lintel_StorageDoor",
            f"{prefix}GymWall_North_Left",
            f"{prefix}GymWall_North_RightA",
            f"{prefix}GymWall_North_RightB",
            f"{prefix}GymWall_WestMiddle",
            f"{prefix}GymWall_WestSouth",
            f"{prefix}GymStorage_North",
        }
    )


@dataclass(frozen=True)
class WindowSpec:
    suffix: str
    floor: int
    wall_key: str
    axis: str
    fixed: float
    horizontal_center: float
    z_center: float
    outward: tuple[float, float, float]
    open_leaf_indices: tuple[int, ...]
    unit_count: int
    clear_height: float
    unit_clear_width: float


OPEN_WINDOW_UNITS: dict[str, tuple[tuple[int, str], ...]] = {
    "F01_CourtyardNorth_Corridor_02": ((3, "R"),),
    "F01_CourtyardWest_Corridor_02": ((2, "L"),),
    "F01_CourtyardWest_Corridor_04": ((2, "L"),),
    "F01_CourtyardWest_Corridor_05": ((2, "L"),),
    "F01_North_Special_Room01_Set02": ((1, "L"),),
    "F01_North_Special_Room02_Set01": ((1, "R"),),
    "F01_North_Special_Room02_Set03": ((2, "R"),),
    "F01_West_Ordinary_Room01": ((4, "L"),),
    "F01_West_Special_01": ((1, "R"),),
    "F02_CourtyardNorth_Corridor_01": ((2, "R"),),
    "F02_CourtyardNorth_Corridor_02": ((1, "R"),),
    "F02_CourtyardNorth_Corridor_03": ((1, "R"),),
    "F02_CourtyardWest_Corridor_04": ((2, "L"),),
    "F02_North_Broadcast_Set01": ((2, "L"),),
    "F02_North_Special_Room03_Set02": ((2, "L"),),
    "F02_North_Special_Room03_Set03": ((1, "R"),),
    "F02_West_Ordinary_Room01": ((2, "R"),),
    "F02_West_Ordinary_Room02": ((1, "R"), (2, "L"), (3, "R"), (4, "L")),
    "F02_West_Ordinary_Room03": ((1, "R"),),
    "F03_CourtyardNorth_Corridor_01": ((3, "L"),),
    "F03_CourtyardNorth_Corridor_02": ((4, "R"),),
    "F03_CourtyardNorth_Corridor_03": ((3, "L"),),
    "F03_CourtyardWest_Corridor_01": ((2, "R"),),
    "F03_CourtyardWest_Corridor_02": ((2, "R"),),
    "F03_CourtyardWest_Corridor_04": ((1, "R"),),
    "F03_North_Special_Room01_Set01": ((1, "L"),),
    "F03_North_Special_Room02_Set01": ((1, "L"), (2, "R")),
    "F03_North_Special_Room02_Set02": ((1, "R"), (2, "L")),
    "F03_North_Special_Room02_Set03": ((1, "L"), (2, "R")),
    "F03_West_Ordinary_Room01": ((3, "L"),),
    "F03_West_Ordinary_Room02": ((1, "R"),),
    "F04_CourtyardNorth_Corridor_01": ((3, "L"),),
    "F04_CourtyardNorth_Corridor_02": ((1, "R"),),
    "F04_CourtyardNorth_Corridor_03": ((3, "R"),),
    "F04_CourtyardWest_Corridor_01": ((2, "L"),),
    "F04_CourtyardWest_Corridor_03": ((2, "L"),),
    "F04_CourtyardWest_Corridor_05": ((1, "R"),),
    "F04_North_Special_Room02_Set01": ((2, "L"),),
    "F04_North_Special_Room02_Set02": ((1, "R"),),
    "F04_West_Ordinary_Room01": ((4, "L"),),
    "F04_West_Ordinary_Room02": ((2, "R"),),
    "F04_West_Ordinary_Room03": ((1, "L"), (2, "R"), (3, "L"), (4, "R")),
    "Gym_East_01": ((3, "L"),),
    "Gym_East_02": ((1, "L"),),
    "Gym_East_03": ((4, "R"),),
    "Gym_North_02": ((1, "L"),),
    "Gym_West_01": ((4, "R"),),
    "Gym_West_02": ((2, "R"),),
    "Gym_West_03": ((1, "L"),),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def require_source_file() -> None:
    actual = Path(bpy.data.filepath).resolve()
    expected = BLEND_PATH.resolve()
    if actual != expected:
        raise RuntimeError(f"B03-1対象外のBlenderファイルです: {actual}")
    if not PROP_LIBRARY_PATH.exists():
        raise RuntimeError(f"B03-P小物ライブラリがありません: {PROP_LIBRARY_PATH}")


def collection(name: str) -> bpy.types.Collection:
    result = bpy.data.collections.get(name)
    if result is None:
        raise RuntimeError(f"必須Collectionがありません: {name}")
    return result


def unlink_and_remove_object(obj: bpy.types.Object) -> None:
    data = obj.data if obj.type == "MESH" else None
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is not None and data.users == 0:
        bpy.data.meshes.remove(data)


def clear_generated_objects() -> None:
    for obj in list(bpy.data.objects):
        if (
            obj.name in SOURCE_OBJECTS_TO_REMOVE
            or obj.name in GENERATED_EXACT_NAMES
            or obj.name.startswith(GENERATED_PREFIXES)
        ):
            unlink_and_remove_object(obj)
    remove_unused_prop_material_duplicates()


def remove_unused_prop_material_duplicates() -> None:
    duplicate_material_pattern = re.compile(r"^MAT_Prop_.+\.\d{3}$")
    for material in list(bpy.data.materials):
        if material.users == 0 and duplicate_material_pattern.match(material.name):
            bpy.data.materials.remove(material)


def remove_final_unused_authoring_data() -> bool:
    changed = False
    guide_collection = bpy.data.collections.get(LEGACY_GUIDE_COLLECTION_NAME)
    if guide_collection is not None:
        for obj in list(guide_collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(guide_collection)
        changed = True
    for datablocks in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.node_groups,
        bpy.data.actions,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)
                changed = True
    return changed


def move_to_collection(
    obj: bpy.types.Object, target: bpy.types.Collection
) -> bpy.types.Object:
    for source in list(obj.users_collection):
        source.objects.unlink(obj)
    target.objects.link(obj)
    return obj


def append_box(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int, int]],
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
) -> None:
    x0, y0, z0 = minimum
    x1, y1, z1 = maximum
    if x1 <= x0 or y1 <= y0 or z1 <= z0:
        raise RuntimeError(f"不正なbox境界です: {minimum} -> {maximum}")
    offset = len(vertices)
    vertices.extend(
        [
            (x0, y0, z0),
            (x1, y0, z0),
            (x1, y1, z0),
            (x0, y1, z0),
            (x0, y0, z1),
            (x1, y0, z1),
            (x1, y1, z1),
            (x0, y1, z1),
        ]
    )
    faces.extend(
        [
            (offset + 0, offset + 3, offset + 2, offset + 1),
            (offset + 4, offset + 5, offset + 6, offset + 7),
            (offset + 0, offset + 1, offset + 5, offset + 4),
            (offset + 1, offset + 2, offset + 6, offset + 5),
            (offset + 2, offset + 3, offset + 7, offset + 6),
            (offset + 3, offset + 0, offset + 4, offset + 7),
        ]
    )


def oriented_box(
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


def gate_fence_boxes(
    axis: str,
    primary_minimum: float,
    primary_maximum: float,
    fixed: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    center = (primary_minimum + primary_maximum) / 2.0
    boxes = [
        oriented_box(
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
                oriented_box(
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
                oriented_box(
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
        oriented_box(
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


def perimeter_block_joint_quads(
) -> list[tuple[str, float, float, float, float, float, int]]:
    quads: list[tuple[str, float, float, float, float, float, int]] = []
    z_minimum, z_maximum = PERIMETER_WALL_Z
    course_count = round((z_maximum - z_minimum) / PERIMETER_BLOCK_HEIGHT)
    for (
        _,
        axis,
        primary_minimum,
        primary_maximum,
        cross_minimum,
        cross_maximum,
    ) in PERIMETER_WALL_SPECS:
        surfaces = (
            (cross_minimum - PERIMETER_JOINT_DEPTH, -1),
            (cross_maximum + PERIMETER_JOINT_DEPTH, 1),
        )
        for surface_coordinate, outward_sign in surfaces:
            for boundary_index in range(1, course_count):
                boundary_z = (
                    z_minimum + boundary_index * PERIMETER_BLOCK_HEIGHT
                )
                quads.append(
                    (
                        axis,
                        primary_minimum,
                        primary_maximum,
                        surface_coordinate,
                        boundary_z - PERIMETER_JOINT_WIDTH / 2.0,
                        boundary_z + PERIMETER_JOINT_WIDTH / 2.0,
                        outward_sign,
                    )
                )
            for course_index in range(course_count):
                course_z_minimum = (
                    z_minimum + course_index * PERIMETER_BLOCK_HEIGHT
                )
                course_z_maximum = course_z_minimum + PERIMETER_BLOCK_HEIGHT
                vertical_z_minimum = course_z_minimum + (
                    PERIMETER_JOINT_WIDTH / 2.0 if course_index > 0 else 0.0
                )
                vertical_z_maximum = course_z_maximum - (
                    PERIMETER_JOINT_WIDTH / 2.0
                    if course_index < course_count - 1
                    else 0.0
                )
                first_offset = (
                    PERIMETER_BLOCK_WIDTH / 2.0
                    if course_index % 2
                    else PERIMETER_BLOCK_WIDTH
                )
                joint_index = 0
                while True:
                    position = (
                        primary_minimum
                        + first_offset
                        + joint_index * PERIMETER_BLOCK_WIDTH
                    )
                    if position >= primary_maximum - 1e-8:
                        break
                    quads.append(
                        (
                            axis,
                            position - PERIMETER_JOINT_WIDTH / 2.0,
                            position + PERIMETER_JOINT_WIDTH / 2.0,
                            surface_coordinate,
                            vertical_z_minimum,
                            vertical_z_maximum,
                            outward_sign,
                        )
                    )
                    joint_index += 1
    return quads


def append_outward_surface_quad(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    axis: str,
    primary_minimum: float,
    primary_maximum: float,
    cross_coordinate: float,
    z_minimum: float,
    z_maximum: float,
    outward_sign: int,
) -> None:
    offset = len(vertices)
    if axis == "X":
        vertices.extend(
            (
                (primary_minimum, cross_coordinate, z_minimum),
                (primary_maximum, cross_coordinate, z_minimum),
                (primary_maximum, cross_coordinate, z_maximum),
                (primary_minimum, cross_coordinate, z_maximum),
            )
        )
    elif axis == "Y":
        vertices.extend(
            (
                (cross_coordinate, primary_minimum, z_minimum),
                (cross_coordinate, primary_maximum, z_minimum),
                (cross_coordinate, primary_maximum, z_maximum),
                (cross_coordinate, primary_minimum, z_maximum),
            )
        )
    else:
        raise RuntimeError(f"未定義の水平軸です: {axis}")
    face = (offset, offset + 1, offset + 2, offset + 3)
    if (axis == "X" and outward_sign > 0) or (
        axis == "Y" and outward_sign < 0
    ):
        face = tuple(reversed(face))
    faces.append(face)


def rebuild_site_boundary_visuals() -> None:
    visual_collection = collection(VIS_COLLECTION_NAME)
    for object_name, axis, minimum, maximum, fixed in GATE_VISUAL_SPECS:
        boxes = gate_fence_boxes(axis, minimum, maximum, fixed)
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, ...]] = []
        for box_minimum, box_maximum in boxes:
            append_box(vertices, faces, box_minimum, box_maximum)
        upsert_mesh_geometry(
            object_name,
            vertices,
            faces,
            visual_collection,
        )

    joint_vertices: list[tuple[float, float, float]] = []
    joint_faces: list[tuple[int, ...]] = []
    for joint in perimeter_block_joint_quads():
        append_outward_surface_quad(joint_vertices, joint_faces, *joint)
    upsert_surface_geometry(
        "VIS_B03_PerimeterBlockJoints",
        joint_vertices,
        joint_faces,
        visual_collection,
    )


def create_mesh_object(
    name: str,
    boxes: list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material | None = None,
    properties: dict[str, object] | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for minimum, maximum in boxes:
        append_box(vertices, faces, minimum, maximum)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    for key, value in (properties or {}).items():
        obj[key] = value
    return obj


def append_profile_prism(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    width: tuple[float, float],
    profile: tuple[tuple[float, float], ...],
) -> None:
    offset = len(vertices)
    for x in width:
        vertices.extend((x, y, z) for y, z in profile)
    profile_size = len(profile)
    faces.extend(
        [
            tuple(offset + index for index in reversed(range(profile_size))),
            tuple(offset + profile_size + index for index in range(profile_size)),
        ]
    )
    for index in range(profile_size):
        next_index = (index + 1) % profile_size
        faces.append(
            (
                offset + index,
                offset + next_index,
                offset + profile_size + next_index,
                offset + profile_size + index,
            )
        )


def replace_mesh_geometry(
    object_name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
) -> bpy.types.Object:
    obj = bpy.data.objects.get(object_name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError(f"再構築対象Meshがありません: {object_name}")
    if obj.data.users != 1:
        obj.data = obj.data.copy()
    obj.matrix_world = Matrix.Identity(4)
    obj.data.clear_geometry()
    obj.data.from_pydata(vertices, [], faces)
    obj.data.name = object_name
    obj.data.update(calc_edges=True)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.normal_update()
    if mesh.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(mesh, faces=list(mesh.faces))
        mesh.normal_update()
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update(calc_edges=True)
    return obj


def upsert_mesh_geometry(
    object_name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    target_collection: bpy.types.Collection,
) -> bpy.types.Object:
    obj = bpy.data.objects.get(object_name)
    if obj is None:
        mesh = bpy.data.meshes.new(object_name)
        obj = bpy.data.objects.new(object_name, mesh)
        target_collection.objects.link(obj)
        return replace_mesh_geometry(object_name, vertices, faces)
    return replace_mesh_geometry(object_name, vertices, faces)


def upsert_surface_geometry(
    object_name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    target_collection: bpy.types.Collection,
) -> bpy.types.Object:
    obj = bpy.data.objects.get(object_name)
    if obj is None:
        mesh = bpy.data.meshes.new(object_name)
        obj = bpy.data.objects.new(object_name, mesh)
        target_collection.objects.link(obj)
    elif obj.type != "MESH":
        raise RuntimeError(f"再構築対象Meshではありません: {object_name}")
    if obj.data.users != 1:
        obj.data = obj.data.copy()
    obj.matrix_world = Matrix.Identity(4)
    obj.data.clear_geometry()
    obj.data.from_pydata(vertices, [], faces)
    obj.data.name = object_name
    obj.data.update(calc_edges=True)
    return obj


def append_thin_steps(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    width: tuple[float, float],
    start_y: float,
    end_y: float,
    base_z: float,
    step_count: int,
) -> None:
    rise = 0.15
    for index in range(step_count):
        y0 = start_y + (end_y - start_y) * index / step_count
        y1 = start_y + (end_y - start_y) * (index + 1) / step_count
        top = base_z + rise * (index + 1)
        append_box(
            vertices,
            faces,
            (width[0], min(y0, y1), top - rise),
            (width[1], max(y0, y1), top),
        )


def create_upper_stair_visual_geometry(
    base_z: float,
) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    append_box(vertices, faces, (-12.6, 38.9, base_z - 0.1), (-10.2, 40.7, base_z))
    append_thin_steps(vertices, faces, (-12.6, -10.2), 38.9, 43.1, base_z, 16)
    append_profile_prism(
        vertices,
        faces,
        (-12.6, -10.2),
        ((38.9, base_z - 0.1), (43.1, base_z + 2.3), (43.1, base_z + 2.4), (38.9, base_z)),
    )
    append_box(vertices, faces, (-12.6, 43.1, base_z + 2.3), (-6.6, 45.5, base_z + 2.4))
    append_thin_steps(vertices, faces, (-9.0, -6.6), 43.1, 40.7, base_z + 2.4, 8)
    append_profile_prism(
        vertices,
        faces,
        (-9.0, -6.6),
        ((43.1, base_z + 2.3), (40.7, base_z + 3.5), (40.7, base_z + 3.6), (43.1, base_z + 2.4)),
    )
    append_box(vertices, faces, (-9.0, 38.9, base_z + 3.5), (-6.6, 40.7, base_z + 3.6))
    return vertices, faces


def create_upper_stair_collider_geometry(
    base_z: float,
) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    append_box(vertices, faces, (-12.6, 38.9, base_z - 0.1), (-10.2, 40.7, base_z))
    append_profile_prism(
        vertices,
        faces,
        (-12.6, -10.2),
        ((38.9, base_z - 0.1), (43.1, base_z + 2.3), (43.1, base_z + 2.4), (38.9, base_z)),
    )
    append_box(vertices, faces, (-12.6, 43.1, base_z + 2.3), (-6.6, 45.5, base_z + 2.4))
    append_profile_prism(
        vertices,
        faces,
        (-9.0, -6.6),
        ((43.1, base_z + 2.3), (40.7, base_z + 3.5), (40.7, base_z + 3.6), (43.1, base_z + 2.4)),
    )
    append_box(vertices, faces, (-9.0, 38.9, base_z + 3.5), (-6.6, 40.7, base_z + 3.6))
    return vertices, faces


def upper_stair_guard_base_segments(
    base_z: float,
    parts: tuple[str, ...] = ("Lower", "Landing", "Upper"),
    *,
    include_lower_end_cap: bool = True,
) -> list[tuple[Vector, Vector]]:
    lower_start = Vector((-10.28, 38.9, base_z))
    lower_end = Vector((-10.28, 43.1, base_z + 2.4))
    landing_end = Vector((-8.92, 43.1, base_z + 2.4))
    upper_end = Vector((-8.92, 40.7, base_z + 3.6))
    top_end = Vector((-8.92, 38.9, base_z + 3.6))
    lower_segments = [
        (lower_start, lower_end),
    ]
    if include_lower_end_cap:
        lower_segments.append(
            (lower_start, Vector((-8.92, 38.9, base_z)))
        )
    segment_groups = {
        "Lower": tuple(lower_segments),
        "Landing": (
            (lower_end, landing_end),
        ),
        "Upper": (
            (landing_end, upper_end),
            (upper_end, top_end),
        ),
        "Terminal": (
            (
                Vector((-12.6, 38.9, base_z + 3.6)),
                Vector((-8.92, 38.9, base_z + 3.6)),
            ),
        ),
    }
    unknown = set(parts) - set(segment_groups)
    if unknown:
        raise RuntimeError(f"未定義の階段手すり区分です: {sorted(unknown)}")
    return [segment for part in parts for segment in segment_groups[part]]


def create_upper_stair_guard_visual_geometry(
    base_z: float,
    parts: tuple[str, ...] = ("Lower", "Landing", "Upper"),
    *,
    include_lower_end_cap: bool = True,
    claimed_post_positions: set[tuple[float, float, float]],
) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for start, end in upper_stair_guard_base_segments(
        base_z,
        parts,
        include_lower_end_cap=include_lower_end_cap,
    ):
        for rail_height in (0.55, 1.0):
            vertical = Vector((0.0, 0.0, rail_height))
            append_sloped_rail_prism(
                vertices,
                faces,
                start + vertical,
                end + vertical,
            )
        segment = end - start
        horizontal_length = math.hypot(segment.x, segment.y)
        post_count = max(1, math.ceil(horizontal_length / 1.1))
        for index in range(post_count + 1):
            ratio = index / post_count
            base = start + segment * ratio
            post_key = tuple(round(float(value), 6) for value in base)
            if post_key in claimed_post_positions:
                continue
            claimed_post_positions.add(post_key)
            append_box(
                vertices,
                faces,
                (base.x - 0.05, base.y - 0.05, base.z),
                (base.x + 0.05, base.y + 0.05, base.z + 1.05),
            )
    return vertices, faces


def create_upper_stair_guard_collider_geometry(
    base_z: float,
    parts: tuple[str, ...] = ("Lower", "Landing", "Upper"),
    *,
    include_lower_end_cap: bool = True,
) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for start, end in upper_stair_guard_base_segments(
        base_z,
        parts,
        include_lower_end_cap=include_lower_end_cap,
    ):
        direction = end - start
        horizontal_length = math.hypot(direction.x, direction.y)
        side = Vector(
            (-direction.y / horizontal_length, direction.x / horizontal_length, 0.0)
        ) * 0.08
        vertical = Vector((0.0, 0.0, 1.05))
        offset = len(vertices)
        vertices.extend(
            tuple(point)
            for point in (
                start + side,
                start - side,
                end - side,
                end + side,
                start + side + vertical,
                start - side + vertical,
                end - side + vertical,
                end + side + vertical,
            )
        )
        faces.extend(
            (
                (offset + 0, offset + 3, offset + 2, offset + 1),
                (offset + 4, offset + 5, offset + 6, offset + 7),
                (offset + 0, offset + 1, offset + 5, offset + 4),
                (offset + 1, offset + 2, offset + 6, offset + 5),
                (offset + 2, offset + 3, offset + 7, offset + 6),
                (offset + 3, offset + 0, offset + 4, offset + 7),
            )
        )
    return vertices, faces


def rebuild_first_transition_stair_guards(
) -> dict[str, set[tuple[float, float, float]]]:
    visual_collection = collection(VIS_COLLECTION_NAME)
    collider_collection = collection(COL_COLLECTION_NAME)
    claimed_post_positions_by_stair: dict[
        str, set[tuple[float, float, float]]
    ] = {}
    for stair in ("NW", "NE", "SW"):
        claimed_post_positions: set[tuple[float, float, float]] = set()
        claimed_post_positions_by_stair[stair] = claimed_post_positions
        for part in ("Lower", "Landing", "Upper"):
            include_lower_end_cap = stair != "NW" or part != "Lower"
            vertices, faces = create_upper_stair_guard_visual_geometry(
                0.0,
                (part,),
                include_lower_end_cap=include_lower_end_cap,
                claimed_post_positions=claimed_post_positions,
            )
            upsert_mesh_geometry(
                f"VIS_StairGuard_{stair}_{part}",
                transform_stair_vertices(vertices, stair),
                faces,
                visual_collection,
            )
            vertices, faces = create_upper_stair_guard_collider_geometry(
                0.0,
                (part,),
                include_lower_end_cap=include_lower_end_cap,
            )
            upsert_mesh_geometry(
                f"COL_StairGuard_{stair}_{part}",
                transform_stair_vertices(vertices, stair),
                faces,
                collider_collection,
            )
    return claimed_post_positions_by_stair


def create_roof_guard_geometry(
    start_coordinates: tuple[float, float, float],
    end_coordinates: tuple[float, float, float],
    include_start_post: bool,
    include_end_post: bool,
) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    start = Vector(start_coordinates)
    end = Vector(end_coordinates)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for rail_height in (0.55, 1.0):
        vertical = Vector((0.0, 0.0, rail_height))
        append_sloped_rail_prism(
            vertices,
            faces,
            start + vertical,
            end + vertical,
        )

    direction = end - start
    horizontal_length = math.hypot(direction.x, direction.y)
    post_count = max(1, math.ceil(horizontal_length / 1.1))
    for index in range(post_count + 1):
        if index == 0 and not include_start_post:
            continue
        if index == post_count and not include_end_post:
            continue
        base = start + direction * (index / post_count)
        append_box(
            vertices,
            faces,
            (base.x - 0.05, base.y - 0.05, base.z),
            (base.x + 0.05, base.y + 0.05, base.z + 1.05),
        )
    return vertices, faces


def rebuild_roof_guards() -> None:
    visual_collection = collection(VIS_COLLECTION_NAME)
    collider_collection = collection(COL_COLLECTION_NAME)
    for (
        suffix,
        start,
        end,
        include_start_post,
        include_end_post,
    ) in ROOF_GUARD_SEGMENTS:
        vertices, faces = create_roof_guard_geometry(
            start,
            end,
            include_start_post,
            include_end_post,
        )
        upsert_mesh_geometry(
            f"VIS_RoofGuard_{suffix}",
            vertices,
            faces,
            visual_collection,
        )
        upsert_mesh_geometry(
            f"COL_RoofGuard_{suffix}",
            vertices,
            faces,
            collider_collection,
        )


def transform_stair_vertices(
    vertices: list[tuple[float, float, float]],
    stair: str,
) -> list[tuple[float, float, float]]:
    if stair == "NW":
        return vertices
    if stair == "NE":
        return [(x + 54.0, y, z) for x, y, z in vertices]
    if stair == "SW":
        return [(32.9 - y, x + 9.1, z) for x, y, z in vertices]
    raise RuntimeError(f"未定義の階段です: {stair}")


def rebuild_upper_stairs(
    claimed_post_positions_by_stair: dict[
        str, set[tuple[float, float, float]]
    ],
) -> None:
    visual_collection = collection(VIS_COLLECTION_NAME)
    collider_collection = collection(COL_COLLECTION_NAME)
    for stair in ("NW", "NE", "SW"):
        transitions = [
            ("2FTo3F", 3.6),
            ("3FTo4F", 7.2),
        ]
        if stair == "NW":
            transitions.append(("4FToRooftop", 10.8))
        for suffix, base_z in transitions:
            guard_parts = (
                ("Lower", "Landing", "Upper", "Terminal")
                if stair in ("NE", "SW") and suffix == "3FTo4F"
                else ("Lower", "Landing", "Upper")
            )
            vertices, faces = create_upper_stair_visual_geometry(base_z)
            upsert_mesh_geometry(
                f"VIS_StairSystem_{stair}_{suffix}",
                transform_stair_vertices(vertices, stair),
                faces,
                visual_collection,
            )
            vertices, faces = create_upper_stair_collider_geometry(base_z)
            upsert_mesh_geometry(
                f"COL_StairSystem_{stair}_{suffix}",
                transform_stair_vertices(vertices, stair),
                faces,
                collider_collection,
            )
            vertices, faces = create_upper_stair_guard_visual_geometry(
                base_z,
                guard_parts,
                claimed_post_positions=claimed_post_positions_by_stair[stair],
            )
            upsert_mesh_geometry(
                f"VIS_StairGuardSystem_{stair}_{suffix}",
                transform_stair_vertices(vertices, stair),
                faces,
                visual_collection,
            )
            vertices, faces = create_upper_stair_guard_collider_geometry(
                base_z, guard_parts
            )
            upsert_mesh_geometry(
                f"COL_StairGuardSystem_{stair}_{suffix}",
                transform_stair_vertices(vertices, stair),
                faces,
                collider_collection,
            )


def shift_object_geometry_z(obj: bpy.types.Object, amount: float) -> None:
    if abs(amount) <= 1e-8:
        return
    if obj.type == "MESH":
        if obj.data.users != 1:
            obj.data = obj.data.copy()
        obj.data.transform(Matrix.Translation(Vector((0.0, 0.0, amount))))
        obj.data.name = obj.name
        obj.data.update()
    else:
        obj.location.z += amount


def align_existing_storey_sources() -> None:
    roof = bpy.data.objects.get("COL_Roof_North")
    if roof is None:
        raise RuntimeError("屋上高さ基準がありません: COL_Roof_North")
    roof_minimum, _ = world_bounds(roof)
    rooftop_shift = 14.4 - roof_minimum.z
    rooftop_prefixes = (
        "VIS_Roof_",
        "COL_Roof_",
        "VIS_RoofGuard_",
        "COL_RoofGuard_",
        "VIS_Rooftop",
        "COL_Rooftop",
        "VIS_Pool",
        "COL_Pool",
        "VIS_Floor_Rooftop",
        "VIS_DoorLeaf_Rooftop",
        "GUIDE_Pool",
    )
    for obj in bpy.data.objects:
        if obj.name.startswith(rooftop_prefixes):
            shift_object_geometry_z(obj, rooftop_shift)
    rebuild_roof_guards()
    claimed_post_positions_by_stair = rebuild_first_transition_stair_guards()
    rebuild_upper_stairs(claimed_post_positions_by_stair)
    rebuild_site_boundary_visuals()
    align_acceptance_geometry()
    boundary = bpy.data.objects.get("BND_Stage")
    if boundary is None:
        raise RuntimeError("BND_Stageがありません")
    minimum, maximum = world_bounds(boundary)
    boundary_vertices: list[tuple[float, float, float]] = []
    boundary_faces: list[tuple[int, ...]] = []
    append_box(boundary_vertices, boundary_faces, tuple(minimum), (maximum.x, maximum.y, 19.0))
    replace_mesh_geometry("BND_Stage", boundary_vertices, boundary_faces)


def align_acceptance_geometry() -> None:
    for name in ("VIS_MainEntryDoor_Open_North", "VIS_MainEntryDoor_Open_South"):
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            raise RuntimeError(f"主玄関扉がありません: {name}")
        minimum, _ = world_bounds(obj)
        shift_object_geometry_x(obj, 0.17 - minimum.x)

    for name in ("VIS_Wall_ClassroomCross_2", "COL_Wall_ClassroomCross_2"):
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            raise RuntimeError(f"保健室角の壁がありません: {name}")
        minimum, maximum = world_bounds(obj)
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, ...]] = []
        append_box(
            vertices,
            faces,
            tuple(minimum),
            (-3.35, maximum.y, maximum.z),
        )
        replace_mesh_geometry(name, vertices, faces)


def shift_object_geometry_x(obj: bpy.types.Object, target_shift: float) -> None:
    if abs(target_shift) <= 1e-8:
        return
    if obj.data.users != 1:
        obj.data = obj.data.copy()
    obj.data.transform(Matrix.Translation(Vector((target_shift, 0.0, 0.0))))
    obj.data.name = obj.name
    obj.data.update()


def create_empty(
    name: str,
    position: tuple[float, float, float],
    target_collection: bpy.types.Collection,
    properties: dict[str, object],
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.18
    obj.location = position
    target_collection.objects.link(obj)
    for key, value in properties.items():
        obj[key] = value
    return obj


def rounded_position(
    x: float,
    y: float,
    z: float,
) -> tuple[float, float, float]:
    return (round(x, 9), round(y, 9), round(z, 9))


def assembly_grid_positions(
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


def execution_audience_positions(
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


def execution_target_positions(
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


def assembly_anchor_properties(
    anchor_id: str,
    assembly_positions: list[tuple[float, float, float]],
    audience_positions: list[tuple[float, float, float]],
    target_positions: list[tuple[float, float, float]],
) -> dict[str, object]:
    return {
        "hs_id": anchor_id,
        "hs_role": "assembly_anchor",
        "hs_selection_weight": 1,
        "hs_assembly_positions_json": json.dumps(
            assembly_positions,
            allow_nan=False,
            separators=(",", ":"),
        ),
        "hs_execution_audience_positions_json": json.dumps(
            audience_positions,
            allow_nan=False,
            separators=(",", ":"),
        ),
        "hs_execution_target_positions_json": json.dumps(
            target_positions,
            allow_nan=False,
            separators=(",", ":"),
        ),
    }


def build_assembly_venues(
    semantic_collection: bpy.types.Collection,
) -> None:
    venue_specs = (
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
            (45.4, 9.5, 0.0),
            (39.325, 3.425, 1.35),
            ((35.4, -0.5, 0.0), (55.4, 19.5, 2.0)),
        ),
    )
    for (
        suffix,
        anchor_id,
        volume_id,
        anchor_position,
        grid_spec,
        volume_bounds,
    ) in venue_specs:
        center_x, center_y, floor_z = anchor_position
        origin_x, origin_y, spacing = grid_spec
        assembly_positions = assembly_grid_positions(
            origin_x,
            origin_y,
            spacing,
            floor_z,
        )
        audience_positions = execution_audience_positions(
            center_x,
            center_y,
            floor_z,
        )
        target_positions = execution_target_positions(
            center_x,
            center_y,
            floor_z,
        )
        create_empty(
            f"MRK_AssemblyAnchor_{suffix}",
            anchor_position,
            semantic_collection,
            assembly_anchor_properties(
                anchor_id,
                assembly_positions,
                audience_positions,
                target_positions,
            ),
        )
        create_mesh_object(
            f"VOL_Assembly_{suffix}",
            [volume_bounds],
            semantic_collection,
            properties={
                "hs_id": volume_id,
                "hs_role": "assembly",
                "hs_anchor_id": anchor_id,
            },
        )


def existing_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        raise RuntimeError(f"既存Materialがありません: {name}")
    return material


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.55,
    alpha_blend: bool = False,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    node = material.node_tree.nodes.get("Principled BSDF")
    if node is not None:
        node.inputs["Base Color"].default_value = color
        node.inputs["Metallic"].default_value = metallic
        node.inputs["Roughness"].default_value = roughness
        node.inputs["Alpha"].default_value = color[3]
    if alpha_blend and hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    return material


def build_window_specs() -> list[WindowSpec]:
    specs: list[WindowSpec] = []

    def append(
        floor: int,
        base_z: float,
        label: str,
        wall: str,
        axis: str,
        fixed: float,
        horizontal: float,
        outward: tuple[float, float, float],
        unit_count: int,
        clear_height: float = SCHOOL_WINDOW_CLEAR_HEIGHT,
        unit_clear_width: float = WINDOW_UNIT_CLEAR_WIDTH,
        z_offset: float = 1.7,
    ) -> None:
        suffix = label if floor == 0 else f"F{floor:02d}_{label}"
        open_leaf_indices = tuple(
            (unit_index - 1) * 2 + (0 if side == "L" else 1)
            for unit_index, side in OPEN_WINDOW_UNITS.get(suffix, ())
        )
        if any(index < 0 or index >= unit_count * 2 for index in open_leaf_indices):
            raise RuntimeError(f"開放羽指定が窓帯の範囲外です: {suffix}={open_leaf_indices}")
        specs.append(
            WindowSpec(
                suffix=suffix,
                floor=floor,
                wall_key=wall,
                axis=axis,
                fixed=fixed,
                horizontal_center=horizontal,
                z_center=base_z + z_offset,
                outward=outward,
                open_leaf_indices=open_leaf_indices,
                unit_count=unit_count,
                clear_height=clear_height,
                unit_clear_width=unit_clear_width,
            )
        )

    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        ordinary_room_centers = (7.5,) if floor == 1 else (7.5, 17.5, 27.5)
        for room_index, room_center in enumerate(ordinary_room_centers, start=1):
            append(
                floor,
                base_z,
                f"West_Ordinary_Room{room_index:02d}",
                "WestOuter",
                "Y",
                -12.6,
                room_center,
                (-1, 0, 0),
                4,
            )
        if floor == 1:
            append(floor, base_z, "West_Special_01", "WestOuter", "Y", -12.6, 22.5, (-1, 0, 0), 4)

        courtyard_west_centers = (0.867, 7.683, 14.500, 21.317, 28.133)
        for index, center in enumerate(courtyard_west_centers, start=1):
            if floor == 1 and index == 1:
                continue
            append(
                floor,
                base_z,
                f"CourtyardWest_Corridor_{index:02d}",
                "CourtyardWest",
                "Y",
                0.0,
                center,
                (1, 0, 0),
                2,
            )

        courtyard_north_units = (2, 4, 1) if floor == 1 else (4, 4, 4)
        for index, (center, unit_count) in enumerate(
            zip((9.550, 23.700, 37.850), courtyard_north_units), start=1
        ):
            if floor == 1 and index == 1:
                continue
            append(
                floor,
                base_z,
                f"CourtyardNorth_Corridor_{index:02d}",
                "CourtyardNorth",
                "X",
                32.5,
                center,
                (0, -1, 0),
                unit_count,
            )

        stair_center_z = {1: 4.20, 2: 7.80, 3: 11.40, 4: 15.00}[floor]
        append(floor, base_z, "North_StairNW", "North", "X", 45.5, -9.6, (0, 1, 0), 1, STAIR_WINDOW_CLEAR_HEIGHT, STAIR_WINDOW_UNIT_CLEAR_WIDTH, stair_center_z - base_z)
        if floor == 1:
            north_sets = (
                ("North_Special_Room01", (8.8, 14.4, 20.0)),
                ("North_Special_Room02", (26.8, 32.4, 38.0)),
            )
        elif floor == 2:
            north_sets = (
                ("North_StudentCouncil", (9.9,)),
                ("North_Broadcast", (18.9,)),
                ("North_Special_Room03", (26.8, 32.4, 38.0)),
            )
        else:
            north_sets = (
                ("North_Special_Room01", (8.8, 14.4, 20.0)),
                ("North_Special_Room02", (26.8, 32.4, 38.0)),
            )
        for room_label, centers in north_sets:
            for set_index, center in enumerate(centers, start=1):
                append(floor, base_z, f"{room_label}_Set{set_index:02d}", "North", "X", 45.5, center, (0, 1, 0), 2)
        if floor in (1, 2, 3):
            append(floor, base_z, "North_StairNE", "North", "X", 45.5, 44.4, (0, 1, 0), 1, STAIR_WINDOW_CLEAR_HEIGHT, STAIR_WINDOW_UNIT_CLEAR_WIDTH, stair_center_z - base_z)

    for floor, base_z, stair_center_z in ((1, 0.0, 4.20), (2, 3.6, 7.80), (3, 7.2, 11.40)):
        append(floor, base_z, "West_StairSW", "WestOuter", "Y", -12.6, -0.5, (-1, 0, 0), 1, STAIR_WINDOW_CLEAR_HEIGHT, STAIR_WINDOW_UNIT_CLEAR_WIDTH, stair_center_z - base_z)

    gym_entries = (
        ("Gym_East_01", "GymEast", "Y", 57.4, -2.925, (1, 0, 0)),
        ("Gym_East_02", "GymEast", "Y", 57.4, 8.500, (1, 0, 0)),
        ("Gym_East_03", "GymEast", "Y", 57.4, 19.925, (1, 0, 0)),
        ("Gym_West_01", "GymWest", "Y", 33.4, -2.925, (-1, 0, 0)),
        ("Gym_West_02", "GymWest", "Y", 33.4, 8.500, (-1, 0, 0)),
        ("Gym_West_03", "GymWest", "Y", 33.4, 19.925, (-1, 0, 0)),
        ("Gym_North_02", "GymNorth", "X", 26.5, 47.4, (0, 1, 0)),
    )
    for label, wall, axis, fixed, horizontal, outward in gym_entries:
        append(0, 0.0, label, wall, axis, fixed, horizontal, outward, 4, GYM_WINDOW_CLEAR_HEIGHT, WINDOW_UNIT_CLEAR_WIDTH, 7.1)
    unknown_open_windows = set(OPEN_WINDOW_UNITS) - {spec.suffix for spec in specs}
    if unknown_open_windows:
        raise RuntimeError(f"存在しない窓帯へ開放指定があります: {sorted(unknown_open_windows)}")
    return specs


def wall_boxes(
    axis: str,
    fixed: float,
    horizontal_min: float,
    horizontal_max: float,
    z_min: float,
    z_max: float,
    openings: list[tuple[float, float, float, float]],
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    h_edges = {horizontal_min, horizontal_max}
    z_edges = {z_min, z_max}
    clipped: list[tuple[float, float, float, float]] = []
    for h0, h1, o_z0, o_z1 in openings:
        h0 = max(horizontal_min, h0)
        h1 = min(horizontal_max, h1)
        o_z0 = max(z_min, o_z0)
        o_z1 = min(z_max, o_z1)
        if h0 < h1 and o_z0 < o_z1:
            clipped.append((h0, h1, o_z0, o_z1))
            h_edges.update((h0, h1))
            z_edges.update((o_z0, o_z1))
    sorted_h = sorted(h_edges)
    sorted_z = sorted(z_edges)
    boxes = []
    half = WALL_THICKNESS / 2.0
    for h0, h1 in zip(sorted_h, sorted_h[1:]):
        for cell_z0, cell_z1 in zip(sorted_z, sorted_z[1:]):
            h_mid = (h0 + h1) / 2.0
            z_mid = (cell_z0 + cell_z1) / 2.0
            if any(
                o_h0 < h_mid < o_h1 and o_z0 < z_mid < o_z1
                for o_h0, o_h1, o_z0, o_z1 in clipped
            ):
                continue
            if axis == "X":
                boxes.append(((h0, fixed - half, cell_z0), (h1, fixed + half, cell_z1)))
            else:
                boxes.append(((fixed - half, h0, cell_z0), (fixed + half, h1, cell_z1)))
    return boxes


def floor_finish_boxes(
    upper_floor_z: float,
    panels_xy: tuple[
        tuple[tuple[float, float], tuple[float, float]], ...
    ] = UPPER_FLOOR_PANELS_XY,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    return [
        (
            (minimum[0], minimum[1], upper_floor_z - 0.15),
            (maximum[0], maximum[1], upper_floor_z),
        )
        for minimum, maximum in panels_xy
    ]


def interfloor_structure_boxes(
    upper_floor_z: float,
    panels_xy: tuple[
        tuple[tuple[float, float], tuple[float, float]], ...
    ] = UPPER_FLOOR_PANELS_XY,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    return [
        (
            (minimum[0], minimum[1], upper_floor_z - 0.60),
            (maximum[0], maximum[1], upper_floor_z - 0.15),
        )
        for minimum, maximum in panels_xy
    ]


def upper_interior_wall_boxes(
    floor: int,
    base_z: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    z0 = base_z
    z1 = base_z + 3.0
    boundary_z1 = base_z + 3.6
    west_doors = [
        (minimum, maximum, z0, z0 + 2.3)
        for minimum, maximum in UPPER_WEST_CLASSROOM_DOOR_OPENINGS
    ]
    north_doors = [
        (TOILET_COMMON_OPENING[0], TOILET_COMMON_OPENING[1], z0, z1),
        *(
            (minimum, maximum, z0, z0 + 2.3)
            for minimum, maximum in NORTH_CLASSROOM_DOOR_OPENINGS
        ),
    ]
    boxes = wall_boxes("Y", -3.5, 2.5, 32.5, z0, z1, west_doors)
    boxes.extend(wall_boxes("X", 36.5, -6.6, 41.4, z0, z1, north_doors))

    for divider_y in (12.5, 22.5):
        boxes.append(
            ((-12.6, divider_y - 0.15, z0), (-3.5, divider_y + 0.15, z1))
        )

    # 各端部の階段室と普通教室を壁で分離する。廊下側の出入口だけを残す。
    boxes.extend(
        (
            ((-12.6, 2.35, z0), (-3.5, 2.65, boundary_z1)),
            ((-12.6, 32.35, z0), (-3.5, 32.65, boundary_z1)),
            ((-6.75, 38.5, z0), (-6.45, 45.5, boundary_z1)),
        )
    )

    north_dividers = (14.4, 23.4) if floor == 2 else (23.4,)
    for divider_x in north_dividers:
        boxes.append(
            ((divider_x - 0.15, 36.5, z0), (divider_x + 0.15, 45.5, z1))
        )

    # トイレ側通路と特別教室を全上階で同じ閉じた区画へ分離する。
    boxes.append(((5.25, 36.5, z0), (5.55, 45.5, z1)))

    boxes.append(((41.25, 36.5, z0), (41.55, 45.5, boundary_z1)))
    return boxes


def upper_door_leaf_boxes(
    floor: int,
    base_z: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    del floor
    boxes = []
    for index, (start, end) in enumerate(UPPER_WEST_CLASSROOM_DOOR_OPENINGS):
        if index % 2 == 0:
            boxes.append(
                ((-3.42, end + 0.05, base_z), (-3.34, end + 1.15, base_z + 2.3))
            )
        else:
            boxes.append(
                ((-3.42, start - 1.15, base_z), (-3.34, start - 0.05, base_z + 2.3))
            )
    for index, (start, end) in enumerate(NORTH_CLASSROOM_DOOR_OPENINGS):
        if index == 1:
            # 西側特別教室の前扉は東端を蝶番として南へ90度開く。
            boxes.append(
                ((end - 0.09, 35.35, base_z), (end - 0.01, 36.45, base_z + 2.3))
            )
        elif index == 3:
            # 東側特別教室の東端扉は、1階と同じく開口の西側へ寄せる。
            boxes.append(
                ((start - 1.15, 36.30, base_z), (start - 0.05, 36.38, base_z + 2.3))
            )
        else:
            boxes.append(
                ((end + 0.05, 36.30, base_z), (end + 1.15, 36.38, base_z + 2.3))
            )
    return boxes


def subtract_intervals(
    minimum: float,
    maximum: float,
    openings: tuple[tuple[float, float], ...],
) -> list[tuple[float, float]]:
    segments: list[tuple[float, float]] = []
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


def storey_band_boxes(
    floor: int,
    base_z: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    west_classroom_openings = tuple(
        (minimum - 0.01, maximum + 0.01)
        for minimum, maximum in (
            FIRST_FLOOR_WEST_DOOR_OPENINGS
            if floor == 1
            else UPPER_WEST_CLASSROOM_DOOR_OPENINGS
        )
    )
    west_floor_openings = ((-2.51, 2.51),) if floor == 1 else ()
    north_classroom_openings = tuple(
        (minimum - 0.01, maximum + 0.01)
        for minimum, maximum in (
            TOILET_COMMON_OPENING,
            *NORTH_CLASSROOM_DOOR_OPENINGS,
        )
    )
    north_floor_openings = ((0.14, 5.41), (39.39, 43.41)) if floor == 1 else ()
    z0, z1 = base_z + 0.15, base_z + 0.25
    boxes = [
        ((-3.351, start, z0), (-3.347, end, z1))
        for start, end in subtract_intervals(2.5, 32.5, west_classroom_openings)
    ]
    boxes.extend(
        ((-0.153, start, z0), (-0.149, end, z1))
        for start, end in subtract_intervals(-3.5, 32.5, west_floor_openings)
    )
    boxes.extend(
        ((start, 36.347, z0), (end, 36.351, z1))
        for start, end in subtract_intervals(-6.6, 41.4, north_classroom_openings)
    )
    boxes.extend(
        ((start, 32.649, z0), (end, 32.653, z1))
        for start, end in subtract_intervals(0.0, 47.4, north_floor_openings)
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


def window_opening(spec: WindowSpec) -> tuple[float, float, float, float]:
    outer_half_width = window_clear_width(spec) / 2 + WINDOW_FRAME_BORDER
    outer_half_height = spec.clear_height / 2 + WINDOW_FRAME_BORDER
    return (
        spec.horizontal_center - outer_half_width,
        spec.horizontal_center + outer_half_width,
        spec.z_center - outer_half_height,
        spec.z_center + outer_half_height,
    )


def window_clear_width(spec: WindowSpec) -> float:
    return spec.unit_count * spec.unit_clear_width


def window_link_id(spec: WindowSpec, leaf_index: int) -> str:
    unit_index = leaf_index // 2 + 1
    return f"bit-window-{spec.suffix.lower().replace('_', '-')}-u{unit_index:02d}"


def window_leaf_center(spec: WindowSpec, leaf_index: int) -> float:
    left = spec.horizontal_center - window_clear_width(spec) / 2
    leaf_width = spec.unit_clear_width / 2
    return left + (leaf_index + 0.5) * leaf_width


def window_frame_boxes(
    spec: WindowSpec,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    half_w = window_clear_width(spec) / 2
    half_h = spec.clear_height / 2
    border = WINDOW_FRAME_BORDER
    depth = 0.20
    h = spec.horizontal_center
    z = spec.z_center
    boxes = []
    if spec.axis == "X":
        boxes.extend(
            [
            ((h - half_w - border, spec.fixed - depth / 2, z - half_h - border), (h + half_w + border, spec.fixed + depth / 2, z - half_h)),
            ((h - half_w - border, spec.fixed - depth / 2, z + half_h), (h + half_w + border, spec.fixed + depth / 2, z + half_h + border)),
            ((h - half_w - border, spec.fixed - depth / 2, z - half_h), (h - half_w, spec.fixed + depth / 2, z + half_h)),
            ((h + half_w, spec.fixed - depth / 2, z - half_h), (h + half_w + border, spec.fixed + depth / 2, z + half_h)),
            ]
        )
    else:
        boxes.extend(
            [
                ((spec.fixed - depth / 2, h - half_w - border, z - half_h - border), (spec.fixed + depth / 2, h + half_w + border, z - half_h)),
                ((spec.fixed - depth / 2, h - half_w - border, z + half_h), (spec.fixed + depth / 2, h + half_w + border, z + half_h + border)),
                ((spec.fixed - depth / 2, h - half_w - border, z - half_h), (spec.fixed + depth / 2, h - half_w, z + half_h)),
                ((spec.fixed - depth / 2, h + half_w, z - half_h), (spec.fixed + depth / 2, h + half_w + border, z + half_h)),
            ]
        )
    leaf_width = spec.unit_clear_width / 2
    for divider_index in range(1, spec.unit_count * 2):
        divider = h - half_w + divider_index * leaf_width
        divider_width = (
            WINDOW_MEETING_STILE_WIDTH if divider_index % 2 else WINDOW_FRAME_BORDER
        )
        if spec.axis == "X":
            boxes.append(
                ((divider - divider_width / 2, spec.fixed - depth / 2, z - half_h), (divider + divider_width / 2, spec.fixed + depth / 2, z + half_h))
            )
        else:
            boxes.append(
                ((spec.fixed - depth / 2, divider - divider_width / 2, z - half_h), (spec.fixed + depth / 2, divider + divider_width / 2, z + half_h))
            )
    return boxes


def window_panel_box(
    spec: WindowSpec,
    horizontal_center: float,
    width: float,
    height: float,
    depth: float,
    normal_offset: float = 0.0,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    half_w = width / 2
    half_h = height / 2
    h = horizontal_center
    z = spec.z_center
    if spec.axis == "X":
        return (
            (h - half_w, spec.fixed + normal_offset - depth / 2, z - half_h),
            (h + half_w, spec.fixed + normal_offset + depth / 2, z + half_h),
        )
    return (
        (spec.fixed + normal_offset - depth / 2, h - half_w, z - half_h),
        (spec.fixed + normal_offset + depth / 2, h + half_w, z + half_h),
    )


def window_full_plane_box(
    spec: WindowSpec, depth: float
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    return window_panel_box(
        spec,
        spec.horizontal_center,
        window_clear_width(spec),
        spec.clear_height,
        depth,
    )


def closed_leaf_boxes(
    spec: WindowSpec, depth: float
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    leaf_width = spec.unit_clear_width / 2
    skipped_leaves = set(spec.open_leaf_indices)
    return [
        window_panel_box(
            spec,
            window_leaf_center(spec, leaf_index),
            leaf_width,
            spec.clear_height,
            depth,
        )
        for leaf_index in range(spec.unit_count * 2)
        if leaf_index not in skipped_leaves
    ]


def window_glass_boxes(
    spec: WindowSpec,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    boxes = closed_leaf_boxes(spec, 0.025)
    for moved_leaf in spec.open_leaf_indices:
        stacked_leaf = moved_leaf + 1 if moved_leaf % 2 == 0 else moved_leaf - 1
        boxes.append(
            window_panel_box(
                spec,
                window_leaf_center(spec, stacked_leaf),
                spec.unit_clear_width / 2,
                spec.clear_height,
                0.025,
                normal_offset=0.035,
            )
        )
    return boxes


def build_school_exterior(
    specs: list[WindowSpec],
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    wall_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    generated_colliders: list[bpy.types.Object] = []
    walls = {
        "WestOuter": ("Y", -12.6, -3.5, 45.5),
        "North": ("X", 45.5, -12.6, 47.4),
        "East": ("Y", 47.4, 32.5, 45.5),
        "CourtyardNorth": ("X", 32.5, 0.0, 47.4),
        "CourtyardWest": ("Y", 0.0, -3.5, 32.5),
        "South": ("X", -3.5, -12.6, 0.0),
    }
    floor_ranges = {1: (0.0, 3.6), 2: (3.6, 7.2), 3: (7.2, 10.8), 4: (10.8, 14.4)}
    door_openings = {
        (1, "North"): [(2.4, 5.4, 0.0, 2.4)],
        (1, "CourtyardNorth"): [
            (0.15, 5.4, 0.0, 2.4),
            (39.4, 43.4, 0.0, 2.4),
        ],
        (1, "CourtyardWest"): [(-2.5, 2.5, 0.0, 2.4)],
    }
    for floor, (z0, z1) in floor_ranges.items():
        visual_boxes = []
        collider_boxes = []
        for wall_key, (axis, fixed, h0, h1) in walls.items():
            openings = [
                window_opening(spec)
                for spec in specs
                if spec.wall_key == wall_key
                and window_opening(spec)[3] > z0
                and window_opening(spec)[2] < z1
            ]
            openings.extend(door_openings.get((floor, wall_key), []))
            boxes = wall_boxes(axis, fixed, h0, h1, z0, z1, openings)
            visual_boxes.extend(boxes)
            collider_boxes.extend(boxes)
        if floor == 4:
            rooftop_stair_openings = [
                window_opening(spec)
                for spec in specs
                if spec.suffix == "F04_North_StairNW"
            ]
            rooftop_stair_boxes = wall_boxes(
                "X", 45.5, -12.6, -6.6, 14.4, 15.7, rooftop_stair_openings
            )
            visual_boxes.extend(rooftop_stair_boxes)
            collider_boxes.extend(rooftop_stair_boxes)
        create_mesh_object(
            f"VIS_B03_ExteriorWalls_F{floor:02d}",
            visual_boxes,
            visual_collection,
            wall_material,
        )
        collider = create_mesh_object(
            f"COL_B03_ExteriorWalls_F{floor:02d}",
            collider_boxes,
            collider_collection,
        )
        generated_colliders.append(collider)
    return generated_colliders


def build_gym_exterior(
    specs: list[WindowSpec],
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    wall_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    definitions = {
        "GymEast": ("Y", 57.4, -9.5, 26.5, []),
        "GymWest": ("Y", 33.4, -9.5, 26.5, [(5.0, 8.0, 0.0, 2.4)]),
        "GymNorth": (
            "X",
            26.5,
            33.4,
            57.4,
            [(39.4, 43.4, 0.0, 2.4), (53.65, 55.15, 0.0, 2.3)],
        ),
    }
    visual_boxes = []
    collider_boxes = []
    for wall_key, (axis, fixed, h0, h1, doors) in definitions.items():
        openings = [
            window_opening(spec) for spec in specs if spec.wall_key == wall_key
        ]
        openings.extend(doors)
        boxes = wall_boxes(axis, fixed, h0, h1, 0.0, 9.0, openings)
        visual_boxes.extend(boxes)
        collider_boxes.extend(boxes)
    create_mesh_object(
        "VIS_B03_GymExteriorWalls",
        visual_boxes,
        visual_collection,
        wall_material,
    )
    return [
        create_mesh_object(
            "COL_B03_GymExteriorWalls", collider_boxes, collider_collection
        )
    ]


def build_gym_storage_window(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    wall_material: bpy.types.Material,
    frame_material: bpy.types.Material,
    glass_material: bpy.types.Material,
) -> tuple[list[bpy.types.Object], list[bpy.types.Object]]:
    center_x = 54.4
    center_z = 1.8
    clear_width = 1.20
    clear_height = 1.20
    border = WINDOW_FRAME_BORDER
    wall_boxes_result = wall_boxes(
        "X",
        30.5,
        51.4,
        57.4,
        0.0,
        3.0,
        [
            (
                center_x - clear_width / 2 - border,
                center_x + clear_width / 2 + border,
                center_z - clear_height / 2 - border,
                center_z + clear_height / 2 + border,
            )
        ],
    )
    create_mesh_object(
        "VIS_B03_GymStorageNorthWall",
        wall_boxes_result,
        visual_collection,
        wall_material,
    )
    wall_collider = create_mesh_object(
        "COL_B03_GymStorageNorthWall",
        wall_boxes_result,
        collider_collection,
    )
    frame_boxes = [
        ((center_x - clear_width / 2 - border, 30.4, center_z - clear_height / 2 - border), (center_x + clear_width / 2 + border, 30.6, center_z - clear_height / 2)),
        ((center_x - clear_width / 2 - border, 30.4, center_z + clear_height / 2), (center_x + clear_width / 2 + border, 30.6, center_z + clear_height / 2 + border)),
        ((center_x - clear_width / 2 - border, 30.4, center_z - clear_height / 2), (center_x - clear_width / 2, 30.6, center_z + clear_height / 2)),
        ((center_x + clear_width / 2, 30.4, center_z - clear_height / 2), (center_x + clear_width / 2 + border, 30.6, center_z + clear_height / 2)),
    ]
    properties = {
        "hs_window_style": "small_fixed",
        "hs_window_panes": 1,
        "hs_window_open_leaves": "",
        "hs_window_clear_height_m": clear_height,
        "hs_window_layout_status": "final",
    }
    create_mesh_object(
        "VIS_WindowFrame_GymStorage_North_01",
        frame_boxes,
        visual_collection,
        frame_material,
        properties,
    )
    create_mesh_object(
        "VIS_WindowGlass_GymStorage_North_01",
        [((center_x - clear_width / 2, 30.4875, center_z - clear_height / 2), (center_x + clear_width / 2, 30.5125, center_z + clear_height / 2))],
        visual_collection,
        glass_material,
        properties,
    )
    window_collider = create_mesh_object(
        "COL_ActorOnly_Window_GymStorage_North_01",
        [((center_x - clear_width / 2, 30.45, center_z - clear_height / 2), (center_x + clear_width / 2, 30.55, center_z + clear_height / 2))],
        collider_collection,
    )
    return [wall_collider], [window_collider]


def build_upper_floors_and_rooms(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    floor_material: bpy.types.Material,
    wall_material: bpy.types.Material,
    door_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    generated_colliders: list[bpy.types.Object] = []
    first_floor_stair_boundary_caps = [
        ((-12.6, 2.35, 3.0), (-3.5, 2.65, 3.6)),
        ((-12.6, 32.35, 3.0), (-3.5, 32.65, 3.6)),
        ((41.25, 36.5, 3.0), (41.55, 45.5, 3.6)),
        ((-6.75, 38.5, 3.0), (-6.45, 45.5, 3.6)),
    ]
    create_mesh_object(
        "VIS_B03_StairBoundaryCaps_F01",
        first_floor_stair_boundary_caps,
        visual_collection,
        wall_material,
    )
    generated_colliders.append(
        create_mesh_object(
            "COL_B03_StairBoundaryCaps_F01",
            first_floor_stair_boundary_caps,
            collider_collection,
        )
    )
    first_floor_structure_groups = {
        "West": tuple(UPPER_FLOOR_PANELS_XY[index] for index in (0, 1, 3)),
        "North": tuple(UPPER_FLOOR_PANELS_XY[index] for index in (2, 4)),
    }
    for wing, panels in first_floor_structure_groups.items():
        boxes = interfloor_structure_boxes(3.6, panels)
        create_mesh_object(
            f"VIS_B03_InterfloorStructure_F01_{wing}",
            boxes,
            visual_collection,
            wall_material,
        )
        generated_colliders.append(
            create_mesh_object(
                f"COL_B03_InterfloorStructure_F01_{wing}",
                boxes,
                collider_collection,
            )
        )

    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        floor_boxes = floor_finish_boxes(base_z)
        create_mesh_object(
            f"VIS_B03_Floor_F{floor:02d}",
            floor_boxes,
            visual_collection,
            floor_material,
        )
        generated_colliders.append(
            create_mesh_object(
                f"COL_B03_Floor_F{floor:02d}", floor_boxes, collider_collection
            )
        )

        if floor in (2, 3, 4):
            ceiling_boxes = (
                interfloor_structure_boxes(base_z + 3.6)
                if floor in (2, 3)
                else [
                    (
                        (minimum[0], minimum[1], base_z + 3.0),
                        (maximum[0], maximum[1], base_z + 3.6),
                    )
                    for minimum, maximum in F4_CEILING_PANELS_XY
                ]
            )
            create_mesh_object(
                f"VIS_B03_Ceiling_F{floor:02d}",
                ceiling_boxes,
                visual_collection,
                wall_material,
            )
            generated_colliders.append(
                create_mesh_object(
                    f"COL_B03_Ceiling_F{floor:02d}",
                    ceiling_boxes,
                    collider_collection,
                )
            )

        internal_boxes = upper_interior_wall_boxes(floor, base_z)
        create_mesh_object(
            f"VIS_B03_InteriorWalls_F{floor:02d}",
            internal_boxes,
            visual_collection,
            wall_material,
        )
        generated_colliders.append(
            create_mesh_object(
                f"COL_B03_InteriorWalls_F{floor:02d}",
                internal_boxes,
                collider_collection,
            )
        )

        create_mesh_object(
            f"VIS_B03_DoorLeaves_F{floor:02d}",
            upper_door_leaf_boxes(floor, base_z),
            visual_collection,
            door_material,
        )
    return generated_colliders


def build_readability_finish(visual_collection: bpy.types.Collection) -> None:
    gym_wainscot_boxes = [
        ((33.55, -9.35, 0.02), (33.59, 4.95, 1.20)),
        ((33.55, 8.05, 0.02), (33.59, 26.35, 1.20)),
        ((57.21, -9.35, 0.02), (57.25, 26.35, 1.20)),
        ((33.55, 26.31, 0.02), (39.35, 26.35, 1.20)),
        ((43.45, 26.31, 0.02), (53.60, 26.35, 1.20)),
        ((55.20, 26.31, 0.02), (57.25, 26.35, 1.20)),
    ]
    create_mesh_object(
        "VIS_B03_GymWainscot",
        gym_wainscot_boxes,
        visual_collection,
    )
    gym_trim_boxes = [
        ((33.59, -9.35, 0.02), (33.63, 4.95, 0.14)),
        ((33.59, 8.05, 0.02), (33.63, 26.35, 0.14)),
        ((57.17, -9.35, 0.02), (57.21, 26.35, 0.14)),
        ((33.55, 26.27, 0.02), (39.35, 26.31, 0.14)),
        ((43.45, 26.27, 0.02), (53.60, 26.31, 0.14)),
        ((55.20, 26.27, 0.02), (57.25, 26.31, 0.14)),
        ((33.59, -9.35, 0.02), (33.67, -9.27, 9.00)),
        ((33.59, 26.27, 0.02), (33.67, 26.35, 9.00)),
        ((57.13, -9.35, 0.02), (57.21, -9.27, 9.00)),
        ((57.13, 26.27, 0.02), (57.21, 26.35, 9.00)),
    ]
    create_mesh_object("VIS_B03_GymTrim", gym_trim_boxes, visual_collection)

    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        create_mesh_object(
            f"VIS_B03_StoreyBand_F{floor:02d}",
            storey_band_boxes(floor, base_z),
            visual_collection,
        )
        create_mesh_object(
            f"VIS_B03_StoreyTrim_F{floor:02d}",
            [
                ((41.32, 36.41, base_z + 0.02), (41.40, 36.45, base_z + 3.50)),
            ],
            visual_collection,
        )


def build_windows_and_links(
    specs: list[WindowSpec],
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    frame_material: bpy.types.Material,
    glass_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    colliders = []
    for spec in specs:
        is_stair_window = "_Stair" in spec.suffix
        window_properties = {
            "hs_window_style": (
                "paired_stair_transom" if is_stair_window else "paired_sliding_band"
            ),
            "hs_window_units": spec.unit_count,
            "hs_window_panes": spec.unit_count * 2,
            "hs_window_unit_width_m": spec.unit_clear_width,
            "hs_window_layout_status": "final",
            "hs_window_clear_height_m": spec.clear_height,
            "hs_window_open_leaves": ",".join(
                str(index + 1) for index in spec.open_leaf_indices
            ),
        }
        create_mesh_object(
            f"VIS_WindowFrame_{spec.suffix}",
            window_frame_boxes(spec),
            visual_collection,
            frame_material,
            window_properties,
        )
        create_mesh_object(
            f"VIS_WindowGlass_{spec.suffix}",
            window_glass_boxes(spec),
            visual_collection,
            glass_material,
            window_properties,
        )
        if not spec.open_leaf_indices:
            colliders.append(
                create_mesh_object(
                    f"COL_ActorOnly_Window_{spec.suffix}",
                    [window_full_plane_box(spec, 0.10)],
                    collider_collection,
                )
            )
            continue

        colliders.append(
            create_mesh_object(
                f"COL_ActorOnly_WindowFixed_{spec.suffix}",
                closed_leaf_boxes(spec, 0.10),
                collider_collection,
            )
        )
        for open_leaf_index in spec.open_leaf_indices:
            unit_index = open_leaf_index // 2 + 1
            open_center = window_leaf_center(spec, open_leaf_index)
            colliders.append(
                create_mesh_object(
                    f"COL_HumanOnly_Window_{spec.suffix}_U{unit_index:02d}",
                    [
                        window_panel_box(
                            spec,
                            open_center,
                            spec.unit_clear_width / 2,
                            spec.clear_height,
                            0.10,
                        )
                    ],
                    collider_collection,
                )
            )

            center = (
                (open_center, spec.fixed, spec.z_center)
                if spec.axis == "X"
                else (spec.fixed, open_center, spec.z_center)
            )
            outward = Vector(spec.outward)
            a = Vector(center) + outward * 1.0
            b = Vector(center) - outward * 1.0
            link_id = window_link_id(spec, open_leaf_index)
            if spec.floor == 0:
                outside_band = ("school-exterior", "outdoor-f3")
                inside_band = ("school-gym", "gym-upper")
            else:
                outside_band = (
                    "school-exterior",
                    f"outdoor-f{spec.floor}",
                )
                inside_band = (
                    "school-interior",
                    f"interior-f{spec.floor}",
                )
            common = {
                "hs_id": link_id,
                "hs_transition_kind": "aperture",
                "hs_bidirectional": True,
                "hs_link_radius_m": LINK_RADIUS_METERS,
                "hs_projection_distance_m": BIT_FLIGHT_PROJECTION_DISTANCE_METERS,
                "hs_affordances_json": json.dumps(
                    [
                        "search-vantage",
                        "indoor-access",
                        "outdoor-access",
                        "window-access",
                    ],
                    separators=(",", ":"),
                ),
            }
            create_empty(
                f"LNK_{link_id}_A",
                tuple(a),
                semantic_collection,
                {
                    **common,
                    "hs_zone_id": outside_band[0],
                    "hs_band_id": outside_band[1],
                    "hs_endpoint": "A",
                },
            )
            create_empty(
                f"LNK_{link_id}_B",
                tuple(b),
                semantic_collection,
                {
                    **common,
                    "hs_zone_id": inside_band[0],
                    "hs_band_id": inside_band[1],
                    "hs_endpoint": "B",
                },
            )
    return colliders


def build_pool(
    visual_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    water_material: bpy.types.Material,
) -> None:
    water_bounds = ((14.6, 36.2, 14.66), (34.2, 41.8, 15.35))
    create_mesh_object(
        "VIS_B03_PoolWater",
        [((14.6, 36.2, 15.33), (34.2, 41.8, 15.35))],
        visual_collection,
        water_material,
    )
    create_mesh_object(
        "VOL_PoolWater",
        [water_bounds],
        semantic_collection,
        properties={"hs_id": "pool-water", "hs_role": "water"},
    )


def import_prop_sources(names: list[str]) -> dict[str, bpy.types.Object]:
    with bpy.data.libraries.load(str(PROP_LIBRARY_PATH), link=False) as (
        data_from,
        data_to,
    ):
        missing = sorted(set(names) - set(data_from.objects))
        if missing:
            raise RuntimeError(f"B03-P小物がありません: {missing}")
        data_to.objects = names
    sources = {obj.name: obj for obj in data_to.objects if obj is not None}
    duplicate_suffix = re.compile(r"\.\d{3}$")
    for obj in sources.values():
        if obj.type != "MESH":
            continue
        for index, material in enumerate(obj.data.materials):
            if material is None:
                continue
            base_name = duplicate_suffix.sub("", material.name)
            shared = bpy.data.materials.get(base_name)
            if shared is not None and shared != material:
                obj.data.materials[index] = shared
    return sources


def instantiate_prop(
    source: bpy.types.Object,
    name: str,
    position: tuple[float, float, float],
    rotation_z: float,
    target_collection: bpy.types.Collection,
) -> list[bpy.types.Object]:
    transform = Matrix.Translation(Vector(position)) @ Matrix.Rotation(
        rotation_z, 4, "Z"
    )
    used_material_indices = sorted(
        {polygon.material_index for polygon in source.data.polygons}
    )
    objects: list[bpy.types.Object] = []
    for part_index, material_index in enumerate(used_material_indices, 1):
        polygons = [
            polygon
            for polygon in source.data.polygons
            if polygon.material_index == material_index
        ]
        source_vertex_indices = sorted(
            {vertex_index for polygon in polygons for vertex_index in polygon.vertices}
        )
        vertex_map = {
            source_index: target_index
            for target_index, source_index in enumerate(source_vertex_indices)
        }
        vertices = [
            tuple(transform @ source.data.vertices[source_index].co)
            for source_index in source_vertex_indices
        ]
        faces = [
            tuple(vertex_map[source_index] for source_index in polygon.vertices)
            for polygon in polygons
        ]
        part_name = name if part_index == 1 else f"{name}_Part{part_index:02d}"
        mesh = bpy.data.meshes.new(part_name)
        mesh.from_pydata(vertices, [], faces)
        if material_index < len(source.data.materials):
            material = source.data.materials[material_index]
            if material is not None:
                mesh.materials.append(material)
        mesh.update(calc_edges=True)
        obj = bpy.data.objects.new(part_name, mesh)
        target_collection.objects.link(obj)
        objects.append(obj)
    return objects


def build_minimum_props(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    bench_material: bpy.types.Material,
) -> None:
    source_names = [
        "VIS_Prop_WesternToilet",
        "VIS_Prop_Urinal",
    ]
    sources = import_prop_sources(source_names)
    toilet_positions = [
        ("M_01", (-5.8, 44.7, 0.0)),
        ("M_02", (-4.35, 44.7, 0.0)),
        ("M_03", (-2.95, 44.7, 0.0)),
        ("F_01", (-1.3, 44.7, 0.0)),
        ("F_02", (0.15, 44.7, 0.0)),
        ("F_03", (1.55, 44.7, 0.0)),
    ]
    for suffix, position in toilet_positions:
        instantiate_prop(
            sources["VIS_Prop_WesternToilet"],
            f"VIS_B03_Prop_Toilet_{suffix}",
            position,
            0.0,
            visual_collection,
        )
    for index, y in enumerate((39.6, 40.6, 41.6), 1):
        instantiate_prop(
            sources["VIS_Prop_Urinal"],
            f"VIS_B03_Prop_Urinal_{index:02d}",
            (-2.40, y, 0.8),
            math.pi / 2,
            visual_collection,
        )

    bench_boxes = [
        ((-5.6, 40.2, 14.5), (-3.1, 40.7, 14.92)),
        ((-1.1, 40.2, 14.5), (1.4, 40.7, 14.92)),
    ]
    create_mesh_object(
        "VIS_B03_ChangingBenches",
        bench_boxes,
        visual_collection,
        bench_material,
    )
    create_mesh_object(
        "COL_B03_ChangingBenches", bench_boxes, collider_collection
    )

    for source in sources.values():
        unlink_and_remove_object(source)
    remove_unused_prop_material_duplicates()


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def append_sloped_rail_prism(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    start: Vector,
    end: Vector,
    half_width: float = 0.05,
    half_height: float = 0.05,
) -> None:
    direction = end - start
    horizontal_length = math.hypot(direction.x, direction.y)
    if horizontal_length < 0.3:
        return
    side = Vector(
        (-direction.y / horizontal_length, direction.x / horizontal_length, 0.0)
    ) * half_width
    vertical = Vector((0.0, 0.0, half_height))
    offset = len(vertices)
    for point in (start, end):
        vertices.extend(
            (
                tuple(point + side + vertical),
                tuple(point - side + vertical),
                tuple(point - side - vertical),
                tuple(point + side - vertical),
            )
        )
    faces.extend(
        [
            (offset + 0, offset + 3, offset + 2, offset + 1),
            (offset + 4, offset + 5, offset + 6, offset + 7),
            (offset + 0, offset + 1, offset + 5, offset + 4),
            (offset + 1, offset + 2, offset + 6, offset + 5),
            (offset + 2, offset + 3, offset + 7, offset + 6),
            (offset + 3, offset + 0, offset + 4, offset + 7),
        ]
    )


def build_stair_finish(
    visual_collection: bpy.types.Collection,
    nosing_material: bpy.types.Material,
) -> None:
    nosing_boxes = []
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or not (
            obj.name.startswith("VIS_Stairs")
            or obj.name.startswith("VIS_StairSystem")
            or obj.name.startswith("VIS_GymStageStair_")
        ):
            continue
        mesh = obj.data
        for polygon in mesh.polygons:
            normal = obj.matrix_world.to_3x3() @ polygon.normal
            if normal.z < 0.98:
                continue
            points = [obj.matrix_world @ mesh.vertices[i].co for i in polygon.vertices]
            x0, x1 = min(p.x for p in points), max(p.x for p in points)
            y0, y1 = min(p.y for p in points), max(p.y for p in points)
            z = max(p.z for p in points)
            if min(x1 - x0, y1 - y0) < 0.04:
                continue
            if x1 - x0 > y1 - y0:
                nosing_boxes.append(((x0, y0, z + 0.006), (x1, min(y0 + 0.06, y1), z + 0.026)))
            else:
                nosing_boxes.append(((x0, y0, z + 0.006), (min(x0 + 0.06, x1), y1, z + 0.026)))
    if nosing_boxes:
        create_mesh_object(
            "VIS_B03_StairNosing",
            nosing_boxes,
            visual_collection,
            nosing_material,
        )

def copy_meshes_into_object(
    name: str,
    source_names: list[str],
    target_collection: bpy.types.Collection,
    properties: dict[str, object],
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for source_name in source_names:
        source = bpy.data.objects.get(source_name)
        if source is None or source.type != "MESH":
            raise RuntimeError(f"NAV生成元の参照Meshがありません: {source_name}")
        offset = len(vertices)
        vertices.extend(tuple(source.matrix_world @ vertex.co) for vertex in source.data.vertices)
        faces.extend(
            tuple(offset + index for index in polygon.vertices)
            for polygon in source.data.polygons
        )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    for key, value in properties.items():
        obj[key] = value
    return obj


def first_floor_toilet_nav_blocker_bounds(
) -> tuple[
    tuple[tuple[float, float, float], tuple[float, float, float]], ...
]:
    half_depth = TOILET_FRONT_WALL_DEPTH / 2.0
    return tuple(
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


def remove_redundant_first_floor_nav_blocker_boxes() -> int:
    obj = bpy.data.objects.get("NAV_Blocker_School1F")
    if obj is None or obj.type != "MESH":
        raise RuntimeError("NAV_Blocker_School1Fがありません")
    if len(obj.data.vertices) % 8 != 0 or len(obj.data.polygons) % 6 != 0:
        raise RuntimeError(
            "NAV_Blocker_School1Fが箱単位のMeshではありません: "
            f"{len(obj.data.vertices)} vertices/{len(obj.data.polygons)} faces"
        )
    expected_bounds = list(first_floor_toilet_nav_blocker_bounds())
    matched_expected_indices: set[int] = set()
    kept_vertices: list[tuple[float, float, float]] = []
    kept_faces: list[tuple[int, ...]] = []
    box_count = len(obj.data.vertices) // 8
    if len(obj.data.polygons) // 6 != box_count:
        raise RuntimeError("NAV_Blocker_School1Fの頂点・面の箱数が一致しません")
    for box_index in range(box_count):
        vertex_offset = box_index * 8
        face_offset = box_index * 6
        points = [
            obj.matrix_world @ obj.data.vertices[vertex_offset + index].co
            for index in range(8)
        ]
        bounds = (
            tuple(min(point[axis] for point in points) for axis in range(3)),
            tuple(max(point[axis] for point in points) for axis in range(3)),
        )
        matching_index = next(
            (
                index
                for index, expected in enumerate(expected_bounds)
                if index not in matched_expected_indices
                and all(
                    abs(bounds[bound][axis] - expected[bound][axis]) <= 1.0e-5
                    for bound in range(2)
                    for axis in range(3)
                )
            ),
            None,
        )
        if matching_index is not None:
            matched_expected_indices.add(matching_index)
            continue
        new_offset = len(kept_vertices)
        kept_vertices.extend(tuple(point) for point in points)
        kept_faces.extend(
            tuple(
                new_offset + vertex_index - vertex_offset
                for vertex_index in obj.data.polygons[face_offset + index].vertices
            )
            for index in range(6)
        )
    if not matched_expected_indices:
        return 0
    if len(matched_expected_indices) != len(expected_bounds):
        missing = [
            expected_bounds[index]
            for index in range(len(expected_bounds))
            if index not in matched_expected_indices
        ]
        raise RuntimeError(
            f"NAV_Blocker_School1Fの重複トイレ壁を照合できません: {missing}"
        )
    replace_mesh_geometry(obj.name, kept_vertices, kept_faces)
    return len(matched_expected_indices)


def build_nav_sources(
    nav_collection: bpy.types.Collection,
    generated_upper_colliders: list[bpy.types.Object],
    window_colliders: list[bpy.types.Object],
) -> None:
    stair_blocker = bpy.data.objects.get("NAV_Blocker_StairClosed")
    if stair_blocker is not None:
        unlink_and_remove_object(stair_blocker)
    copy_meshes_into_object(
        "NAV_Blocker_StairClosed",
        list(STAIR_NAV_BLOCKER_SOURCE_NAMES),
        nav_collection,
        {"hs_nav_role": "blocker"},
    )
    for floor in (2, 3, 4):
        copy_meshes_into_object(
            f"NAV_Walkable_Interior{floor}F",
            [f"COL_B03_Floor_F{floor:02d}"],
            nav_collection,
            {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
        )
    copy_meshes_into_object(
        "NAV_Walkable_StairsNWUpper",
        list(UPPER_STAIR_NAV_SOURCE_NAMES),
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "stairs"},
    )
    copy_meshes_into_object(
        "NAV_Walkable_Rooftop",
        [
            "COL_Roof_North",
            "COL_Roof_West",
            "COL_PoolRaisedDeck_West",
            "COL_PoolRaisedDeck_East",
            "COL_PoolRaisedDeck_North",
            "COL_PoolRaisedDeck_South",
            "COL_PoolDeckAccessRamp_West",
            "COL_PoolBasinRamp_East",
            "COL_PoolBasinFloor",
        ],
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
    )
    blocker_sources = [
        obj.name
        for obj in generated_upper_colliders + window_colliders
        if obj.name.startswith("COL_B03_InteriorWalls_F0")
        or obj.name.startswith(("COL_B03_ExteriorWalls_F02", "COL_B03_ExteriorWalls_F03", "COL_B03_ExteriorWalls_F04"))
        or obj.name.startswith(("COL_ActorOnly_Window_F02", "COL_ActorOnly_Window_F03", "COL_ActorOnly_Window_F04"))
        or obj.name.startswith(("COL_HumanOnly_Window_F02", "COL_HumanOnly_Window_F03", "COL_HumanOnly_Window_F04"))
    ]
    blocker_sources.extend(UPPER_STAIR_NAV_BLOCKER_SOURCE_NAMES)
    blocker_sources.append("COL_RooftopFacilityShell")
    copy_meshes_into_object(
        "NAV_Blocker_SchoolUpper",
        sorted(blocker_sources),
        nav_collection,
        {"hs_nav_role": "blocker"},
    )


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


def build_bit_flight_nav_sources(nav_collection: bpy.types.Collection) -> None:
    sources_and_offsets = {
        "NAV_BitFlight_ExteriorF1": (["NAV_Walkable_Outdoor"], 1.4),
        "NAV_BitFlight_ExteriorF2": (["NAV_Walkable_Outdoor"], 5.0),
        "NAV_BitFlight_ExteriorF3": (["NAV_Walkable_Outdoor"], 8.6),
        "NAV_BitFlight_ExteriorF4": (["NAV_Walkable_Outdoor"], 12.2),
        "NAV_BitFlight_InteriorF1": (
            [
                "COL_Floor_WestWing",
                "COL_Floor_NorthWing",
                "COL_Floor_GymStorage",
            ],
            1.4,
        ),
        "NAV_BitFlight_InteriorF2": (["NAV_Walkable_Interior2F"], 1.4),
        "NAV_BitFlight_InteriorF3": (["NAV_Walkable_Interior3F"], 1.4),
        "NAV_BitFlight_InteriorF4": (["NAV_Walkable_Interior4F"], 1.4),
        "NAV_BitFlight_GymLow": (["COL_Floor_Gym"], 1.4),
        "NAV_BitFlight_GymUpper": (["COL_Floor_Gym"], 5.0),
        "NAV_BitFlight_Rooftop": (["NAV_Walkable_Rooftop"], 2.3),
    }
    band_properties = {
        object_name: bit_flight_nav_properties(
            zone_id,
            band_id,
            space_kind,
            minimum_center_height,
            maximum_center_height,
            "walkable",
        )
        for (
            object_name,
            zone_id,
            band_id,
            space_kind,
            minimum_center_height,
            maximum_center_height,
        ) in BIT_FLIGHT_BANDS
    }
    if set(sources_and_offsets) != set(band_properties):
        raise RuntimeError("ビット飛行帯の形状定義とproperty定義が一致しません")
    for object_name, (source_names, z_offset) in sources_and_offsets.items():
        obj = copy_meshes_into_object(
            object_name,
            source_names,
            nav_collection,
            band_properties[object_name],
        )
        shift_object_geometry_z(obj, z_offset)


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
        points = [obj.matrix_world @ obj.data.vertices[index].co for index in indices]
        result.append(
            (
                Vector(
                    tuple(min(point[axis] for point in points) for axis in range(3))
                ),
                Vector(
                    tuple(max(point[axis] for point in points) for axis in range(3))
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


def build_bit_flight_obstacle_sources(
    nav_collection: bpy.types.Collection,
) -> None:
    collider_collection = collection(COL_COLLECTION_NAME)
    colliders = tuple(
        sorted(
            (
                obj
                for obj in collider_collection.all_objects
                if obj.type == "MESH"
                and obj.name.startswith("COL_")
                and not obj.name.startswith("COL_HumanOnly_")
                and not is_bit_flight_support_collider_name(obj.name)
            ),
            key=lambda obj: obj.name,
        )
    )
    exterior_zone_exclusion_sources = []
    for name in (
        "COL_Floor_WestWing",
        "COL_Floor_NorthWing",
        "COL_Floor_Gym",
        "COL_Floor_GymStorage",
    ):
        source = bpy.data.objects.get(name)
        if source is None or source.type != "MESH":
            raise RuntimeError(f"外部飛行ゾーン除外元がありません: {name}")
        exterior_zone_exclusion_sources.append(source)
    for (
        _surface_name,
        zone_id,
        band_id,
        space_kind,
        minimum_center_height,
        maximum_center_height,
    ) in BIT_FLIGHT_BANDS:
        obstacle_boxes = []
        center_height = (minimum_center_height + maximum_center_height) / 2.0
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
            for exclusion_source in exterior_zone_exclusion_sources:
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
        if not obstacle_boxes:
            continue
        object_suffix = re.sub(r"[^A-Za-z0-9]+", "_", f"{zone_id}_{band_id}")
        create_mesh_object(
            f"NAV_BitFlight_Obstacle_{object_suffix}",
            obstacle_boxes,
            nav_collection,
            properties=bit_flight_nav_properties(
                zone_id,
                band_id,
                space_kind,
                minimum_center_height,
                maximum_center_height,
                "blocker",
            ),
        )


def transition_properties(
    transition_id: str,
    transition_kind: str,
    from_zone_id: str,
    from_band_id: str,
    to_zone_id: str,
    to_band_id: str,
    affordances: tuple[str, ...],
    route_points: list[tuple[float, float, float]] | None = None,
) -> dict[str, object]:
    properties: dict[str, object] = {
        "hs_id": transition_id,
        "hs_role": "bit_flight_transition",
        "hs_transition_kind": transition_kind,
        "hs_from_zone_id": from_zone_id,
        "hs_from_band_id": from_band_id,
        "hs_to_zone_id": to_zone_id,
        "hs_to_band_id": to_band_id,
        "hs_bidirectional": True,
        "hs_affordances_json": json.dumps(
            affordances,
            separators=(",", ":"),
        ),
        "hs_projection_distance_m": BIT_FLIGHT_PROJECTION_DISTANCE_METERS,
    }
    if route_points is not None:
        properties["hs_route_points_json"] = json.dumps(
            route_points,
            separators=(",", ":"),
        )
    return properties


def build_transition_volume(
    object_name: str,
    bounds: tuple[
        tuple[float, float, float],
        tuple[float, float, float],
    ],
    semantic_collection: bpy.types.Collection,
    properties: dict[str, object],
) -> None:
    create_mesh_object(
        object_name,
        [bounds],
        semantic_collection,
        properties=properties,
    )


def build_vertical_transition_volumes(
    semantic_collection: bpy.types.Collection,
) -> None:
    for lower_floor, lower_center_minimum, upper_center_maximum in (
        (1, 1.0, 5.4),
        (2, 4.6, 9.0),
        (3, 8.2, 12.6),
    ):
        upper_floor = lower_floor + 1
        transition_id = f"school-exterior-f{lower_floor}-f{upper_floor}"
        build_transition_volume(
            f"VOL_BitFlight_ExteriorF{lower_floor}ToF{upper_floor}",
            (
                (14.0, 12.0, lower_center_minimum),
                (22.0, 20.0, upper_center_maximum),
            ),
            semantic_collection,
            transition_properties(
                transition_id,
                "vertical",
                "school-exterior",
                f"outdoor-f{lower_floor}",
                "school-exterior",
                f"outdoor-f{upper_floor}",
                ("search-vantage",),
            ),
        )
    build_transition_volume(
        "VOL_BitFlight_GymLowToUpper",
        ((41.0, 5.0, 1.0), (49.0, 12.0, 5.4)),
        semantic_collection,
        transition_properties(
            "school-gym-low-upper",
            "vertical",
            "school-gym",
            "gym-low",
            "school-gym",
            "gym-upper",
            ("search-vantage",),
        ),
    )


def stair_route_points(
    stair: str,
    base_z: float,
) -> list[tuple[float, float, float]]:
    local_points = [
        (-11.4, 39.8, base_z + 1.4),
        (-11.4, 43.1, base_z + 3.8),
        (-11.4, 44.0, base_z + 3.8),
        (-7.8, 44.0, base_z + 3.8),
        (-7.8, 43.1, base_z + 3.8),
        (-7.8, 40.0, base_z + 5.0),
    ]
    return transform_stair_vertices(local_points, stair)


def build_stair_transition_volumes(
    semantic_collection: bpy.types.Collection,
) -> None:
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
            route_points = stair_route_points(stair, base_z)
            horizontal_margin = BIT_FLIGHT_PROJECTION_DISTANCE_METERS
            minimum_x = min(point[0] for point in route_points) - horizontal_margin
            maximum_x = max(point[0] for point in route_points) + horizontal_margin
            minimum_y = min(point[1] for point in route_points) - horizontal_margin
            maximum_y = max(point[1] for point in route_points) + horizontal_margin
            transition_id = (
                f"school-stair-{stair.lower()}-f{lower_floor}-"
                + ("roof" if to_zone_id == "school-rooftop" else f"f{lower_floor + 1}")
            )
            build_transition_volume(
                (
                    f"VOL_BitFlight_Stair{stair}F{lower_floor}To"
                    + ("Roof" if to_zone_id == "school-rooftop" else f"F{lower_floor + 1}")
                ),
                (
                    (minimum_x, minimum_y, base_z + 0.2),
                    (maximum_x, maximum_y, base_z + 5.2),
                ),
                semantic_collection,
                transition_properties(
                    transition_id,
                    "surface-route",
                    "school-interior",
                    f"interior-f{lower_floor}",
                    to_zone_id,
                    to_band_id,
                    ("stair-route",),
                    route_points,
                ),
            )


def build_rooftop_boundary_transition(
    semantic_collection: bpy.types.Collection,
) -> None:
    route_points = [
        (48.4, 34.8, 12.2),
        (48.4, 34.8, 16.25),
        (46.1, 34.8, 16.25),
        (46.1, 34.8, 15.4),
    ]
    build_transition_volume(
        "VOL_BitFlight_ExteriorF4ToRooftop",
        ((45.8, 33.8, 11.8), (48.7, 35.8, 16.8)),
        semantic_collection,
        transition_properties(
            "school-exterior-f4-rooftop",
            "boundary",
            "school-exterior",
            "outdoor-f4",
            "school-rooftop",
            "roof-flight",
            ("search-vantage", "outdoor-access"),
            route_points,
        ),
    )


def configure_stage_navigation_contract() -> None:
    metadata = bpy.data.objects.get("META_Stage")
    if metadata is None or metadata.type != "EMPTY":
        raise RuntimeError("META_Stageがありません")
    metadata["hs_schema_version"] = 2
    metadata["hs_bit_nav_profile"] = BIT_FLIGHT_NAV_PROFILE

    for obj in bpy.data.objects:
        if (
            obj.name.startswith("NAV_")
            and not obj.name.startswith("NAV_BitFlight_")
        ):
            obj["hs_nav_set"] = "human"

    bit_spawn = bpy.data.objects.get("VOL_BitSpawn_Courtyard")
    if bit_spawn is None or bit_spawn.type != "MESH":
        raise RuntimeError("VOL_BitSpawn_Courtyardがありません")
    bit_spawn["hs_zone_id"] = "school-exterior"
    bit_spawn["hs_band_id"] = "outdoor-f1"


def normalize_export_meshes(export_collection: bpy.types.Collection) -> None:
    for obj in export_collection.all_objects:
        if obj.type != "MESH":
            continue
        if obj.data.users != 1:
            obj.data = obj.data.copy()
        obj.data.name = obj.name
        if any(abs(value) > 1e-8 for value in obj.location):
            obj.data.transform(Matrix.Translation(obj.location))
            obj.location = (0.0, 0.0, 0.0)
        if any(abs(value) > 1e-8 for value in obj.rotation_euler):
            rotation = obj.rotation_euler.to_matrix().to_4x4()
            obj.data.transform(rotation)
            obj.rotation_euler = (0.0, 0.0, 0.0)
        if any(abs(value - 1.0) > 1e-8 for value in obj.scale):
            obj.data.transform(Matrix.Diagonal((*obj.scale, 1.0)))
            obj.scale = (1.0, 1.0, 1.0)


def apply_architecture_swatch_uv(
    object_names: tuple[str, ...],
    swatch: str,
) -> None:
    coordinates = swatch_uv("Architecture", swatch)
    for object_name in object_names:
        obj = bpy.data.objects.get(object_name)
        if obj is None or obj.type != "MESH":
            raise RuntimeError(f"Architecture Atlasの再配色対象がありません: {object_name}")
        uv_layer = obj.data.uv_layers.get("UVMap")
        if uv_layer is None:
            uv_layer = obj.data.uv_layers.new(name="UVMap")
        for polygon in obj.data.polygons:
            for corner_index, loop_index in enumerate(polygon.loop_indices):
                uv_layer.data[loop_index].uv = coordinates[corner_index % 4]


def export_stage(
    export_collection: bpy.types.Collection,
) -> dict[str, int | str]:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_collection.all_objects:
        if not (
            bpy.context.scene.get("b03_window_layout_status") == "placement_review"
            and obj.name.startswith("LNK_")
        ):
            obj.select_set(True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    authoring_properties: dict[str, dict[str, object]] = {}
    for obj in export_collection.all_objects:
        values = {
            key: obj[key]
            for key in WINDOW_AUTHORING_PROPERTY_NAMES
            if key in obj
        }
        if not values:
            continue
        authoring_properties[obj.name] = values
        for key in values:
            del obj[key]
    try:
        bpy.ops.export_scene.gltf(
            filepath=str(GLB_PATH),
            check_existing=False,
            export_format="GLB",
            use_selection=True,
            use_visible=False,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
            export_extras=True,
            export_yup=True,
            export_apply=False,
        )
    finally:
        for object_name, values in authoring_properties.items():
            obj = bpy.data.objects[object_name]
            for key, value in values.items():
                obj[key] = value
    return optimize_glb(GLB_PATH)


def is_generated_name(name: str) -> bool:
    return name in GENERATED_EXACT_NAMES or name.startswith(GENERATED_PREFIXES)


def generation_signature() -> str:
    digest = hashlib.sha256()
    generated_objects = sorted(
        (obj for obj in bpy.data.objects if is_generated_name(obj.name)),
        key=lambda obj: obj.name,
    )
    for obj in generated_objects:
        digest.update(obj.name.encode("utf-8"))
        digest.update(obj.type.encode("ascii"))
        for row in obj.matrix_world:
            for value in row:
                digest.update(float(value).hex().encode("ascii"))
        for key in sorted(key for key in obj.keys() if key.startswith("hs_")):
            digest.update(key.encode("utf-8"))
            digest.update(
                json.dumps(obj[key], ensure_ascii=False, sort_keys=True).encode("utf-8")
            )
        if obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            for value in vertex.co:
                digest.update(float(value).hex().encode("ascii"))
        for polygon in obj.data.polygons:
            digest.update(",".join(str(index) for index in polygon.vertices).encode("ascii"))
        for material in obj.data.materials:
            digest.update((material.name if material else "").encode("utf-8"))
    return digest.hexdigest().upper()


def is_current_generation() -> bool:
    names = tuple(bpy.data.objects.keys())
    metadata = bpy.data.objects.get("META_Stage")
    bit_spawn = bpy.data.objects.get("VOL_BitSpawn_Courtyard")
    boundary = bpy.data.objects.get("BND_Stage")
    boundary_maximum_z = (
        world_bounds(boundary)[1].z
        if boundary is not None and boundary.type == "MESH"
        else None
    )
    human_nav_sources = tuple(
        obj
        for obj in bpy.data.objects
        if obj.name.startswith("NAV_")
        and not obj.name.startswith("NAV_BitFlight_")
    )
    return (
        bpy.context.scene.get(GENERATOR_VERSION_PROPERTY) == GENERATOR_VERSION
        and bpy.context.scene.get(T04_CORRECTION_VERSION_PROPERTY)
        == T04_CORRECTION_VERSION
        and metadata is not None
        and metadata.get("hs_schema_version") == 2
        and metadata.get("hs_bit_nav_profile") == BIT_FLIGHT_NAV_PROFILE
        and bit_spawn is not None
        and bit_spawn.get("hs_zone_id") == "school-exterior"
        and bit_spawn.get("hs_band_id") == "outdoor-f1"
        and boundary_maximum_z is not None
        and abs(boundary_maximum_z - 19.0) <= 1.0e-6
        and human_nav_sources
        and all(obj.get("hs_nav_set") == "human" for obj in human_nav_sources)
        and bpy.context.scene.get("b03_window_layout_status") == "final"
        and sum(name.startswith("VIS_WindowFrame_") for name in names) == 82
        and sum(name.startswith("VIS_WindowGlass_") for name in names) == 82
        and sum(name.startswith("COL_ActorOnly_Window_") for name in names) == 33
        and sum(name.startswith("COL_ActorOnly_WindowFixed_") for name in names) == 49
        and sum(name.startswith("COL_HumanOnly_Window_") for name in names) == 58
        and sum(name.startswith("LNK_bit-window-") for name in names) == 116
        and not any(name.startswith("LNK_bit-roof-") for name in names)
        and sum(name.startswith("NAV_BitFlight_") for name in names) == 22
        and sum(name.startswith("NAV_BitFlight_Obstacle_") for name in names) == 11
        and sum(name.startswith("VOL_BitFlight_") for name in names) == 15
        and sum(name.startswith("VIS_B03_StoreyBand_") for name in names) == 4
        and sum(name.startswith("VIS_B03_StoreyTrim_") for name in names) == 4
        and not any(name.startswith("VIS_B03_FloorAccent_") for name in names)
        and "VIS_B03_HandrailTops" not in names
        and all(
            name in names
            for name in (
                "VIS_B03_InterfloorStructure_F01_North",
                "VIS_B03_InterfloorStructure_F01_West",
                "VIS_B03_Ceiling_F02",
                "VIS_B03_Ceiling_F03",
                "VIS_B03_Ceiling_F04",
                "COL_B03_InterfloorStructure_F01_North",
                "COL_B03_InterfloorStructure_F01_West",
                "COL_B03_Ceiling_F02",
                "COL_B03_Ceiling_F03",
                "COL_B03_Ceiling_F04",
            )
        )
        and not any(
            name in names
            for name in (
                "VIS_WindowFrame_F01_CourtyardNorth_Corridor_01",
                "VIS_WindowGlass_F01_CourtyardNorth_Corridor_01",
                "COL_ActorOnly_Window_F01_CourtyardNorth_Corridor_01",
                "VIS_Ceiling1F_North",
                "VIS_Ceiling1F_West",
                "COL_Ceiling1F_North",
                "COL_Ceiling1F_West",
            )
        )
        and GENERATED_EXACT_NAMES.issubset(names)
        and "VOL_PoolWater" in names
        and bpy.context.scene.get(GENERATOR_SIGNATURE_PROPERTY)
        == generation_signature()
    )


def print_build_result(
    specs: list[WindowSpec], optimization: dict[str, int | str]
) -> None:
    result = {
        "blend": str(BLEND_PATH),
        "blend_sha256": sha256(BLEND_PATH),
        "glb": str(GLB_PATH),
        "glb_sha256": sha256(GLB_PATH),
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "materials": len(bpy.data.materials),
        "windows": len(specs) + 1,
        "open_window_bands": sum(bool(spec.open_leaf_indices) for spec in specs),
        "open_window_units": sum(len(spec.open_leaf_indices) for spec in specs),
        "closed_window_bands": sum(not spec.open_leaf_indices for spec in specs) + 1,
        "glb_optimization": optimization,
    }
    print("B03_BUILD_RESULT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


def main() -> None:
    require_source_file()
    visual_collection = collection(VIS_COLLECTION_NAME)
    collider_collection = collection(COL_COLLECTION_NAME)
    nav_collection = collection(NAV_COLLECTION_NAME)
    semantic_collection = collection(SEMANTIC_COLLECTION_NAME)
    export_collection = collection(EXPORT_COLLECTION_NAME)

    specs = build_window_specs()
    if len(specs) != 81 or sum(len(spec.open_leaf_indices) for spec in specs) != 58:
        raise RuntimeError("最終窓帯が81件または開放ユニットが58件ではありません")
    removed_authoring_data = remove_final_unused_authoring_data()
    force_rebuild = "--force" in sys.argv
    if is_current_generation() and not force_rebuild:
        if removed_authoring_data:
            bpy.context.preferences.filepaths.save_version = 0
            bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
        optimization = export_stage(export_collection)
        print_build_result(specs, optimization)
        return

    clear_generated_objects()
    align_existing_storey_sources()

    architecture_material = existing_material("MAT_B03_Atlas_Architecture")
    furniture_material = existing_material("MAT_B03_Atlas_FurnitureProps")
    wall_material = architecture_material
    floor_material = architecture_material
    door_material = architecture_material
    water_material = existing_material("MAT_Pool_Water")
    bench_material = furniture_material
    frame_material = make_material(
        "MAT_B03_WindowFrame", (0.36, 0.39, 0.41, 1.0), metallic=0.15, roughness=0.38
    )
    glass_material = make_material(
        "MAT_B03_WindowGlass", (0.56, 0.78, 0.86, 0.28), roughness=0.18, alpha_blend=True
    )
    nosing_material = make_material(
        "MAT_B03_StairNosing", (0.84, 0.78, 0.62, 1.0), roughness=0.45
    )

    upper_colliders = build_school_exterior(
        specs, visual_collection, collider_collection, wall_material
    )
    upper_colliders.extend(
        build_gym_exterior(
            specs, visual_collection, collider_collection, wall_material
        )
    )
    storage_wall_colliders, storage_window_colliders = build_gym_storage_window(
        visual_collection,
        collider_collection,
        wall_material,
        frame_material,
        glass_material,
    )
    upper_colliders.extend(storage_wall_colliders)
    upper_colliders.extend(
        build_upper_floors_and_rooms(
            visual_collection,
            collider_collection,
            floor_material,
            wall_material,
            door_material,
        )
    )
    build_readability_finish(visual_collection)
    window_colliders = build_windows_and_links(
        specs,
        visual_collection,
        collider_collection,
        semantic_collection,
        frame_material,
        glass_material,
    )
    window_colliders.extend(storage_window_colliders)
    build_pool(visual_collection, semantic_collection, water_material)
    build_minimum_props(visual_collection, collider_collection, bench_material)
    interior_result = build_school_interiors(
        visual_collection, collider_collection, nav_collection
    )
    interior_result["removed_redundant_school1f_nav_boxes"] = (
        remove_redundant_first_floor_nav_blocker_boxes()
    )
    bpy.context.scene["b03_2_interior_result"] = json.dumps(
        interior_result, ensure_ascii=False, sort_keys=True
    )
    build_stair_finish(visual_collection, nosing_material)
    build_nav_sources(nav_collection, upper_colliders, window_colliders)
    configure_stage_navigation_contract()
    build_bit_flight_nav_sources(nav_collection)
    build_bit_flight_obstacle_sources(nav_collection)
    build_vertical_transition_volumes(semantic_collection)
    build_stair_transition_volumes(semantic_collection)
    build_rooftop_boundary_transition(semantic_collection)
    build_assembly_venues(semantic_collection)
    normalize_export_meshes(export_collection)
    material_result = consolidate_school_materials(export_collection)
    apply_architecture_swatch_uv(
        tuple(f"VIS_RoofGuard_{suffix}" for suffix, *_ in ROOF_GUARD_SEGMENTS),
        "trim",
    )
    apply_architecture_swatch_uv(
        ("VIS_B03_PerimeterBlockJoints",),
        "trim",
    )
    bpy.context.scene["b03_2_material_result"] = json.dumps(
        material_result, ensure_ascii=False, sort_keys=True
    )

    bpy.context.scene[GENERATOR_VERSION_PROPERTY] = GENERATOR_VERSION
    bpy.context.scene[T04_CORRECTION_VERSION_PROPERTY] = T04_CORRECTION_VERSION
    bpy.context.scene["b03_window_layout_status"] = "final"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    bpy.context.scene[GENERATOR_SIGNATURE_PROPERTY] = generation_signature()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    optimization = export_stage(export_collection)
    print_build_result(specs, optimization)


if __name__ == "__main__":
    main()
