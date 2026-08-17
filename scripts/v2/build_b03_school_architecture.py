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
from mathutils.geometry import tessellate_polygon


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
    polygon_swatch_uvs,
    swatch_uv,
)
from build_b03_school_interactive_assets import (
    ROOM_VARIANT_AUTHOR_NAMES,
    ROOM_VARIANT_SPECS,
    build_school_interactive_assets,
)
from b06_signage_manifest import (
    ADJUSTMENT_TEXT,
    EXPECTED_FONT_BYTES,
    EXPECTED_FONT_SHA256,
    SIGNAGE_FONT_RELATIVE_PATH,
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
WINDOW_LINK_ENDPOINT_OFFSET_METERS = 1.0
GYM_WINDOW_LINK_ENDPOINT_OFFSET_METERS = 2.30
BIT_FLIGHT_BLOCKER_HALF_HEIGHT_METERS = (
    BIT_FLIGHT_SAFETY_ENVELOPE_METERS + 0.05
)
BIT_FLIGHT_PROJECTION_DISTANCE_METERS = 3.0
BIT_FLIGHT_NAV_PROFILE = "bit-flight-body-0.44-margin-0.10-v1"
HUMAN_NAV_PROFILE = "school-humanoid-room-variants-v2"
GENERATOR_VERSION = "b06-4-minimap-location-assets-v3"
GENERATOR_VERSION_PROPERTY = "b03_architecture_generator_version"
GENERATOR_SIGNATURE_PROPERTY = "b03_architecture_generator_signature"
T04_CORRECTION_VERSION_PROPERTY = "t04_2b_nav_connectivity_version"
T04_CORRECTION_VERSION = "t04-2b-nav-connectivity-v11"
B04_WORLD_BOUNDARY_VERSION_PROPERTY = "b04_world_boundary_version"
B04_WORLD_BOUNDARY_VERSION = "b04-school-world-boundary-v1"

# 共有壁を一つの連結Meshへ再構築した後も、NavMesh障害物は元の実壁区間
# 単位で扱う。連結Mesh全体のAABBを一枚の障害物として扱わないための、
# 同一生成実行内だけで使用する分解境界である。
B06_WALL_SPATIAL_COMPONENT_BOUNDS: dict[
    str,
    tuple[
        tuple[
            tuple[float, float, float],
            tuple[float, float, float],
        ],
        ...,
    ],
] = {}

ASSEMBLY_GUIDE_NAMES = (
    "VIS_CourtyardCapacityGrid_10x10",
    "VIS_GymCapacityGrid_10x10",
    "VIS_GymExecutionAudience_94",
    "VIS_GymExecutionTargets_06",
)

GATE_VISUAL_SPECS = (
    ("VIS_Gate_MainClosed", "X", 19.4, 25.4, -14.5),
    ("VIS_Gate_UtilityClosed", "Y", 44.5, 50.5, 63.4),
)
PERIMETER_WALL_SPECS = (
    ("VIS_Perimeter_East", "Y", -14.5, 44.5, 63.2, 63.6),
    ("VIS_Perimeter_EastNorth", "Y", 50.5, 51.5, 63.2, 63.6),
    ("VIS_Perimeter_NorthEast", "X", 22.4, 63.4, 51.3, 51.7),
    ("VIS_Perimeter_NorthWest", "X", -18.6, 22.4, 51.3, 51.7),
    ("VIS_Perimeter_SouthEast", "X", 25.4, 63.4, -14.7, -14.3),
    ("VIS_Perimeter_SouthWest", "X", -18.6, 19.4, -14.7, -14.3),
    ("VIS_Perimeter_West", "Y", -14.5, 51.5, -18.8, -18.4),
)
PERIMETER_WALL_Z = (-0.3, 1.7)
PERIMETER_WALL_THICKNESS = 0.4
PERIMETER_BLOCK_WIDTH = 0.8
PERIMETER_BLOCK_HEIGHT = 0.4
PERIMETER_JOINT_WIDTH = 0.02
PERIMETER_JOINT_DEPTH = 0.006
SITE_GROUND_BOUNDS = (
    (-18.6, -14.5, -0.6),
    (63.4, 51.5, -0.3),
)
SITE_GROUND_VISUAL_BOUNDS = (
    (-18.8, -14.7, -0.6),
    (63.6, 51.7, -0.3),
)
STAGE_BOUNDARY_SOUTH_Y = -14.3
B04_FENCE_OUTER_BOUNDS_XY = (-18.8, -14.7, 63.6, 51.7)
B04_SIDEWALK_OUTER_BOUNDS_XY = (-20.3, -16.2, 65.1, 53.2)
B04_ROAD_OUTER_BOUNDS_XY = (-23.8, -19.7, 68.6, 56.7)
B04_SURFACE_Z = (-0.35, -0.30)
B04_WORLD_BOUNDARY_BOUNDS = (
    (-23.8, -19.7, -0.6),
    (68.6, 56.7, 24.0),
)

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

ELEVATOR_CENTER_Y = -5.175
ELEVATOR_OPENING_Y = (-5.975, -4.375)
ELEVATOR_FRONT_X = -8.65
ELEVATOR_SHAFT_INNER_Y = (-6.55, -3.80)

WEST_EXTENSION_FLOOR_PANELS_XY = (
    ((-12.6, -7.0), (-11.5, -3.5)),
    ((-9.1, -7.0), (0.0, -3.5)),
    ((-11.5, -7.0), (-9.1, -6.55)),
    ((-11.5, -4.0), (-9.1, -3.5)),
)
UPPER_FLOOR_PANELS_XY = (
    ((-6.0, -3.5), (0.0, 32.5)),
    ((-12.6, 2.5), (-6.0, 32.5)),
    ((-6.6, 32.5), (41.4, 45.5)),
    ((-12.6, 32.5), (-6.6, 38.9)),
    ((41.4, 32.5), (47.4, 38.9)),
    *WEST_EXTENSION_FLOOR_PANELS_XY,
)
F02_VISUAL_FLOOR_PANELS_XY = (
    ((-6.0, -3.5), (0.0, 32.5)),
    ((-12.6, 2.5), (-6.0, 32.5)),
    ((-6.6, 32.5), (39.3, 45.5)),
    ((39.3, 32.65), (41.4, 45.5)),
    ((-12.6, 32.5), (-6.6, 38.9)),
    ((41.4, 32.65), (43.5, 38.9)),
    ((43.5, 32.5), (47.4, 38.9)),
    *WEST_EXTENSION_FLOOR_PANELS_XY,
)
F4_CEILING_PANELS_XY = (
    *UPPER_FLOOR_PANELS_XY,
    ((-12.6, -3.5), (-6.0, 2.5)),
    ((41.4, 38.9), (47.4, 45.5)),
)

ROOFTOP_FACILITY_WALL_BOXES = (
    # 屋上階段室。南面を男女更衣室と同じ一直線へ揃え、西・北外壁は
    # 4階外壁の同一Objectへ統合する。
    ((-12.75, 38.50, 14.40), (-12.45, 38.90, 16.90)),
    ((-12.45, 38.50, 14.50), (-9.00, 38.80, 16.90)),
    ((-9.00, 38.50, 16.70), (-6.75, 38.80, 16.90)),
    ((-6.75, 38.50, 14.40), (-6.45, 45.35, 16.90)),
    # 男子更衣室。南面中央の1.20mは引き戸開口である。
    ((-6.45, 38.50, 14.50), (-5.40, 38.80, 16.90)),
    ((-5.40, 38.50, 16.80), (-4.20, 38.80, 16.90)),
    ((-4.20, 38.50, 14.50), (-2.25, 38.80, 16.90)),
    # 男女更衣室の共有仕切り。
    ((-2.25, 38.50, 14.50), (-1.95, 45.50, 16.90)),
    # 女子更衣室。南面中央の1.20mは引き戸開口である。
    ((-1.95, 38.50, 14.50), (-0.90, 38.80, 16.90)),
    ((-0.90, 38.50, 16.80), (0.30, 38.80, 16.90)),
    ((0.30, 38.50, 14.50), (2.10, 38.80, 16.90)),
    ((2.10, 38.50, 14.50), (2.40, 45.50, 16.90)),
)

ROOFTOP_FACILITY_ROOF_BOXES = (
    ((-12.75, 38.50, 16.90), (-6.45, 45.65, 17.00)),
    ((-6.45, 38.50, 16.90), (-2.10, 45.65, 17.00)),
    ((-2.10, 38.50, 16.90), (2.40, 45.65, 17.00)),
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
        (-12.5, 38.55, 14.5),
        True,
        False,
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
    "VIS_B06_",
    "COL_B06_",
    "NAV_B03_",
    "NAV_BitFlight_",
    "VIS_WindowFrame_",
    "VIS_WindowGlass_",
    "COL_ActorOnly_Window_",
    "COL_ActorOnly_WindowFixed_",
    "COL_HumanOnly_Window_",
    "COL_BeamSightOnly_",
    "LNK_bit-window-",
    "LNK_bit-roof-",
    "VOL_BitFlight_",
    "VOL_BitSpawn_",
    "VOL_NpcSpawnBias_",
    "VOL_NpcSpawn_",
    "VOL_PlayerSpawnExclusion_",
    "VOL_LocationArea_",
    "VOL_MissionLocation_",
    "VOL_BroadcastConsoleTarget_",
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
    "MRK_RoomVariant_",
    "MRK_PlayerSpawn_",
    "MRK_MissionAnchor_",
    "MRK_MapStairLanding_",
    "MRK_MapElevatorLanding_",
    "MRK_BroadcastConsole_",
    "MAP_",
    "VOL_RoomVariantTile_",
    "VIS_RoomVariant_",
    "COL_RoomVariant_",
    "NAV_RoomVariant_",
    "MRK_Door_",
    "MRK_DoorPanel_",
    "MRK_DoorOpenPose_",
    "VIS_DoorPanel_",
    "COL_DoorPanel_",
    "VOL_DoorSweep_",
    "MRK_Elevator",
    "VIS_ElevatorCar_",
    "VIS_ElevatorCallIndicator_",
    "VIS_ElevatorThresholdPlate_",
    "COL_ElevatorCar_",
    "COL_ElevatorThresholdPlate_",
    "VOL_Elevator",
    "VOL_NavigationArea_",
    "PRT_NavigationArea_",
    "COL_HumanOnly_ElevatorGate_",
    "LNK_school-elevator-",
)

GENERATED_EXACT_NAMES = {
    "BND_WorldLimit",
    "MRK_AssemblyAnchor_Courtyard",
    "MRK_AssemblyAnchor_Gym",
    "VOL_Assembly_Courtyard",
    "VOL_Assembly_Gym",
    "VIS_B04_Road",
    "VIS_B04_Sidewalk",
    "VIS_Gate_MainClosed",
    "VIS_Gate_UtilityClosed",
    "NAV_Walkable_Interior2F",
    "NAV_Walkable_Interior3F",
    "NAV_Walkable_Interior4F",
    "NAV_Walkable_Interior1F",
    "NAV_Walkable_StairsNWUpper",
    "NAV_Walkable_Rooftop",
    "NAV_B03_Walkable_GymGallery",
    "NAV_B03_Walkable_GymGalleryStairs",
    "NAV_B03_Walkable_GymRooftop",
    "NAV_B03_Walkable_GymRoofRamp",
    "NAV_Blocker_SchoolUpper",
    "NAV_Blocker_Interiors",
}

B05_FLOOR_SPECS = (
    ("f01", "1F", 1, 0.0),
    ("f02", "2F", 2, 3.6),
    ("f03", "3F", 3, 7.2),
    ("f04", "4F", 4, 10.8),
    ("roof", "屋上", 5, 14.4),
)

B05_ROOM_DISPLAY_NAMES = {
    "f01-infirmary": "保健室",
    "f01-library": "図書室",
    "f01-staff-room": "職員室",
    "f01-pc-room": "パソコン室",
    "f02-classroom-01": "3年1組",
    "f02-classroom-02": "3年2組",
    "f02-classroom-03": "3年3組",
    "f02-council": "生徒会室",
    "f02-broadcast": "放送室",
    "f02-science": "理科室",
    "f03-classroom-01": "2年1組",
    "f03-classroom-02": "2年2組",
    "f03-classroom-03": "2年3組",
    "f03-art": "美術室",
    "f03-home-ec": "家庭科室",
    "f04-classroom-01": "1年1組",
    "f04-classroom-02": "1年2組",
    "f04-classroom-03": "1年3組",
    "f04-ll": "LL教室",
    "f04-music": "音楽室",
}

B05_MISSION_LOCATION_IDS = (
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
    "gym",
    "courtyard",
    "gym-rooftop",
    "rooftop",
    "rooftop-poolside",
)


def perimeter_wall_map_boxes_xy() -> tuple[
    tuple[tuple[float, float], tuple[float, float]], ...
]:
    return tuple(
        (
            (primary_minimum, cross_minimum),
            (primary_maximum, cross_maximum),
        )
        if axis == "X"
        else (
            (cross_minimum, primary_minimum),
            (cross_maximum, primary_maximum),
        )
        for (
            _,
            axis,
            primary_minimum,
            primary_maximum,
            cross_minimum,
            cross_maximum,
        ) in PERIMETER_WALL_SPECS
    )


def gate_passage_map_boxes_xy() -> tuple[
    tuple[tuple[float, float], tuple[float, float]], ...
]:
    half_thickness = PERIMETER_WALL_THICKNESS / 2.0
    return tuple(
        (
            (primary_minimum, fixed - half_thickness),
            (primary_maximum, fixed + half_thickness),
        )
        if axis == "X"
        else (
            (fixed - half_thickness, primary_minimum),
            (fixed + half_thickness, primary_maximum),
        )
        for _, axis, primary_minimum, primary_maximum, fixed in GATE_VISUAL_SPECS
    )

# B06-4のミニマップ形状は、表示Object、Collider、NAV_*から探索せず、
# この一覧を作者定義の正本として生成する。Barrierは恒久仕切りの平面占有、
# Passageはその仕切りを横断できる開口を表す。家具・小物・動的扉パネルは含めない。
B06_MAP_BARRIER_BOXES_XY_BY_FLOOR = {
    "f01": (
        # 敷地外周は表示塀の作者定義区間を共用する。正門と通用門には
        # Barrierを敷かず、実際の開口区間をPassage側で所有する。
        *perimeter_wall_map_boxes_xy(),
        # 校舎外壁と中庭側外壁。
        ((-12.75, -7.15), (0.15, -6.85)),
        ((-12.75, 45.35), (47.55, 45.65)),
        ((-12.75, -7.15), (-12.45, 45.65)),
        ((47.25, 32.35), (47.55, 45.65)),
        ((-0.15, 32.35), (47.55, 32.65)),
        ((-0.15, -7.15), (0.15, 32.65)),
        # 西棟・北棟の恒久間仕切りと階段室境界。
        ((-3.65, 2.35), (-3.35, 32.65)),
        ((-12.75, 2.35), (-3.35, 2.65)),
        ((-12.75, 12.35), (-3.35, 12.65)),
        ((-12.75, 22.35), (-3.35, 22.65)),
        ((-12.75, 32.35), (-3.35, 32.65)),
        ((-6.75, 36.35), (41.55, 36.65)),
        ((-6.75, 38.35), (5.55, 38.65)),
        ((5.25, 36.35), (5.55, 45.65)),
        ((41.25, 36.35), (41.55, 45.65)),
        # 体育館外壁・倉庫北壁。
        ((33.25, -11.65), (59.55, -11.35)),
        ((33.25, 26.35), (59.55, 26.65)),
        ((33.25, -11.65), (33.55, 26.65)),
        ((59.25, -11.65), (59.55, 26.65)),
        ((51.25, 30.35), (57.55, 30.65)),
    ),
    "f02": (
        ((-12.75, -7.15), (0.15, -6.85)),
        ((-12.75, 45.35), (47.55, 45.65)),
        ((-12.75, -7.15), (-12.45, 45.65)),
        ((47.25, 32.35), (47.55, 45.65)),
        ((-0.15, 32.35), (47.55, 32.65)),
        ((-0.15, -7.15), (0.15, 32.65)),
        ((-3.65, 2.35), (-3.35, 32.65)),
        ((-12.75, 2.35), (-3.35, 2.65)),
        ((-12.75, 12.35), (-3.35, 12.65)),
        ((-12.75, 22.35), (-3.35, 22.65)),
        ((-12.75, 32.35), (-3.35, 32.65)),
        ((-6.75, 36.35), (41.55, 36.65)),
        ((-6.75, 38.35), (5.55, 38.65)),
        ((5.25, 36.35), (5.55, 45.65)),
        ((14.25, 36.35), (14.55, 45.65)),
        ((23.25, 36.35), (23.55, 45.65)),
        ((41.25, 36.35), (41.55, 45.65)),
        # 体育館ギャラリーの外縁柵と屋上Ramp接続部。
        ((33.45, -11.5), (34.95, 26.65)),
        ((57.85, -11.5), (59.35, 26.65)),
        ((34.8, 24.85), (58.0, 26.65)),
        ((39.25, 26.35), (39.55, 32.65)),
        ((43.25, 26.35), (43.55, 32.65)),
    ),
    "f03": (
        ((-12.75, -7.15), (0.15, -6.85)),
        ((-12.75, 45.35), (47.55, 45.65)),
        ((-12.75, -7.15), (-12.45, 45.65)),
        ((47.25, 32.35), (47.55, 45.65)),
        ((-0.15, 32.35), (47.55, 32.65)),
        ((-0.15, -7.15), (0.15, 32.65)),
        ((-3.65, 2.35), (-3.35, 32.65)),
        ((-12.75, 2.35), (-3.35, 2.65)),
        ((-12.75, 12.35), (-3.35, 12.65)),
        ((-12.75, 22.35), (-3.35, 22.65)),
        ((-12.75, 32.35), (-3.35, 32.65)),
        ((-6.75, 36.35), (41.55, 36.65)),
        ((-6.75, 38.35), (5.55, 38.65)),
        ((5.25, 36.35), (5.55, 45.65)),
        ((23.25, 36.35), (23.55, 45.65)),
        ((41.25, 36.35), (41.55, 45.65)),
        # 体育館屋上固有の外周柵。北側Ramp開口をPassageで所有する。
        ((33.35, -11.55), (59.45, -11.25)),
        ((33.35, -11.55), (33.65, 26.55)),
        ((59.15, -11.55), (59.45, 26.55)),
        ((33.35, 26.25), (59.45, 26.55)),
        ((39.25, 26.35), (39.55, 32.65)),
        ((43.25, 26.35), (43.55, 32.65)),
    ),
    "f04": (
        ((-12.75, -7.15), (0.15, -6.85)),
        ((-12.75, 45.35), (47.55, 45.65)),
        ((-12.75, -7.15), (-12.45, 45.65)),
        ((47.25, 32.35), (47.55, 45.65)),
        ((-0.15, 32.35), (47.55, 32.65)),
        ((-0.15, -7.15), (0.15, 32.65)),
        ((-3.65, 2.35), (-3.35, 32.65)),
        ((-12.75, 2.35), (-3.35, 2.65)),
        ((-12.75, 12.35), (-3.35, 12.65)),
        ((-12.75, 22.35), (-3.35, 22.65)),
        ((-12.75, 32.35), (-3.35, 32.65)),
        ((-6.75, 36.35), (41.55, 36.65)),
        ((-6.75, 38.35), (5.55, 38.65)),
        ((5.25, 36.35), (5.55, 45.65)),
        ((23.25, 36.35), (23.55, 45.65)),
        ((41.25, 36.35), (41.55, 45.65)),
        # 北西屋上階段室の恒久外壁。
        ((-12.75, 38.35), (2.55, 38.65)),
        ((-6.75, 38.35), (-6.45, 45.65)),
    ),
    "roof": (
        # 校舎屋上固有の外周柵。
        ((-0.25, -7.05), (0.05, 32.75)),
        ((-0.25, 32.45), (47.45, 32.75)),
        ((47.15, 32.45), (47.45, 45.55)),
        ((2.25, 45.25), (47.45, 45.55)),
        # 階段室・男女更衣室。
        ((-12.75, 38.35), (2.40, 38.80)),
        ((-12.75, 38.35), (-12.45, 45.65)),
        ((-6.75, 38.35), (-6.45, 45.65)),
        ((-2.25, 38.35), (-1.95, 45.65)),
        ((2.10, 38.35), (2.40, 45.65)),
        # プール槽の恒久縁。
        ((9.85, 33.85), (36.55, 34.15)),
        ((9.85, 43.85), (36.55, 44.15)),
        ((9.85, 33.85), (10.15, 44.15)),
        ((36.25, 33.85), (36.55, 44.15)),
    ),
}

B06_MAP_PASSAGE_BOXES_XY_BY_FLOOR = {
    "f01": (
        # 敷地正門・通用門は表示門と同じ作者定義開口を共用する。
        *gate_passage_map_boxes_xy(),
        # 校舎出入口、各室扉、階段接続。
        ((2.4, 45.1), (5.4, 45.9)),
        ((0.0, 32.1), (5.4, 32.9)),
        ((39.4, 32.1), (43.4, 32.9)),
        ((-0.4, -2.5), (0.4, 2.5)),
        *tuple(
            ((-3.9, minimum), (-3.1, maximum))
            for minimum, maximum in FIRST_FLOOR_WEST_DOOR_OPENINGS
        ),
        *tuple(
            ((minimum, 36.1), (maximum, 36.9))
            for minimum, maximum in NORTH_CLASSROOM_DOOR_OPENINGS
        ),
        ((TOILET_COMMON_OPENING[0], 36.1), (TOILET_COMMON_OPENING[1], 36.9)),
        # 体育館西・北出入口と校舎接続口。
        ((33.0, 5.0), (33.8, 8.0)),
        ((39.4, 26.1), (43.4, 26.9)),
        ((53.65, 26.1), (55.15, 26.9)),
    ),
    "f02": (
        *tuple(
            ((-3.9, minimum), (-3.1, maximum))
            for minimum, maximum in UPPER_WEST_CLASSROOM_DOOR_OPENINGS
        ),
        *tuple(
            ((minimum, 36.1), (maximum, 36.9))
            for minimum, maximum in NORTH_CLASSROOM_DOOR_OPENINGS
        ),
        ((TOILET_COMMON_OPENING[0], 36.1), (TOILET_COMMON_OPENING[1], 36.9)),
        ((39.1, 26.1), (43.7, 26.9)),
        ((39.1, 32.1), (43.7, 32.9)),
    ),
    "f03": (
        *tuple(
            ((-3.9, minimum), (-3.1, maximum))
            for minimum, maximum in UPPER_WEST_CLASSROOM_DOOR_OPENINGS
        ),
        *tuple(
            ((minimum, 36.1), (maximum, 36.9))
            for minimum, maximum in NORTH_CLASSROOM_DOOR_OPENINGS
        ),
        ((TOILET_COMMON_OPENING[0], 36.1), (TOILET_COMMON_OPENING[1], 36.9)),
        # 体育館屋上Ramp接続。
        ((39.1, 26.1), (43.7, 26.9)),
        ((39.1, 32.1), (43.7, 32.9)),
    ),
    "f04": (
        *tuple(
            ((-3.9, minimum), (-3.1, maximum))
            for minimum, maximum in UPPER_WEST_CLASSROOM_DOOR_OPENINGS
        ),
        *tuple(
            ((minimum, 36.1), (maximum, 36.9))
            for minimum, maximum in NORTH_CLASSROOM_DOOR_OPENINGS
        ),
        ((TOILET_COMMON_OPENING[0], 36.1), (TOILET_COMMON_OPENING[1], 36.9)),
        ((-9.0, 38.1), (-6.75, 39.0)),
    ),
    "roof": (
        # 屋上階段室・男女更衣室の出入口。
        ((-9.0, 38.1), (-6.75, 39.0)),
        ((-5.4, 38.1), (-4.2, 39.0)),
        ((-0.9, 38.1), (0.3, 39.0)),
    ),
}

B05_ROOM_ANCHORS = {
    "f01-infirmary": (-8.05, 7.50, 0.05),
    "f01-library": (-8.05, 22.50, 0.05),
    "f01-staff-room": (14.40, 41.00, 0.05),
    "f01-pc-room": (32.40, 41.00, 0.05),
    "f02-classroom-01": (-8.05, 7.50, 3.65),
    "f02-classroom-02": (-8.05, 17.50, 3.65),
    "f02-classroom-03": (-8.05, 27.50, 3.65),
    "f02-council": (9.90, 41.90, 3.65),
    "f02-broadcast": (18.90, 40.40, 3.65),
    "f02-science": (32.40, 41.00, 3.65),
    "f03-classroom-01": (-8.05, 7.50, 7.25),
    "f03-classroom-02": (-8.05, 17.50, 7.25),
    "f03-classroom-03": (-8.05, 27.50, 7.25),
    "f03-art": (14.40, 41.00, 7.25),
    "f03-home-ec": (32.40, 41.00, 7.25),
    "f04-classroom-01": (-8.05, 7.50, 10.85),
    "f04-classroom-02": (-8.05, 17.50, 10.85),
    "f04-classroom-03": (-8.05, 27.50, 10.85),
    "f04-ll": (14.496, 40.872, 10.85),
    "f04-music": (32.40, 41.00, 10.85),
}

B05_COMMON_Z_BANDS = {
    "f01": (-0.49, 2.4),
    "f02": (2.4, 6.0),
    "f03": (6.0, 9.6),
    "f04": (9.6, 13.2),
}

B05_STAIR_BOUNDS_XY = {
    "nw": (-12.6, -6.6, 38.9, 45.5),
    "ne": (41.4, 47.4, 38.9, 45.5),
    "sw": (-12.6, -6.0, -3.5, 2.5),
}

B05_STAIR_LANDING_SPECS = (
    ("nw", "f01", (-11.4, 38.7, 0.0), "up"),
    ("nw", "f02", (-11.4, 38.7, 3.6), "both"),
    ("nw", "f03", (-11.4, 38.7, 7.2), "both"),
    ("nw", "f04", (-11.4, 38.7, 10.8), "both"),
    ("nw", "roof", (-5.5, 39.5, 14.4), "down"),
    ("ne", "f01", (43.2, 38.3, 0.0), "up"),
    ("ne", "f02", (43.2, 38.3, 3.6), "both"),
    ("ne", "f03", (43.2, 38.3, 7.2), "both"),
    ("ne", "f04", (43.2, 38.3, 10.8), "down"),
    ("sw", "f01", (-5.4, 1.3, 0.0), "up"),
    ("sw", "f02", (-5.4, 1.3, 3.6), "both"),
    ("sw", "f03", (-5.4, 1.3, 7.2), "both"),
    ("sw", "f04", (-5.4, 1.3, 10.8), "down"),
    ("gym-west", "f01", (35.7, -2.6, 0.15), "up"),
    ("gym-west", "f02", (34.2, -2.5, 5.25), "down"),
    ("gym-east", "f01", (57.1, -2.6, 0.15), "up"),
    ("gym-east", "f02", (58.6, -2.5, 5.25), "down"),
)

B05_ELEVATOR_LANDING_SPECS = (
    ("f01", 0.0, True, "school-elevator-stop-f01"),
    ("f02", 3.6, False, None),
    ("f03", 7.2, False, None),
    ("f04", 10.8, True, "school-elevator-stop-f04"),
)

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

PLAYER_SPAWN_SPECS = (
    (
        "Main",
        "player-spawn-main",
        (-1.5, 0.0, 0.0),
        90.0,
        "player-spawn-main-exclusion",
        ((-4.0, -2.5, -0.4), (1.0, 2.5, 2.8)),
    ),
    (
        "GymCenter",
        "player-spawn-gym-center",
        (46.4, 9.5, 0.0),
        0.0,
        "player-spawn-gym-center-exclusion",
        ((41.4, 4.5, -0.4), (51.4, 14.5, 6.0)),
    ),
    (
        "GymStage",
        "player-spawn-gym-stage",
        (46.4, -6.5, 1.0),
        180.0,
        "player-spawn-gym-stage-exclusion",
        ((42.4, -9.0, 0.6), (50.4, -4.0, 7.0)),
    ),
    (
        "F02_Classroom02",
        "player-spawn-f02-classroom-02",
        (-4.6, 18.0, 3.6),
        -141.52,
        "player-spawn-f02-classroom-02-exclusion",
        ((-7.6, 15.0, 3.2), (-1.6, 21.0, 6.4)),
    ),
    (
        "F03_Classroom02",
        "player-spawn-f03-classroom-02",
        (-4.6, 18.0, 7.2),
        -141.52,
        "player-spawn-f03-classroom-02-exclusion",
        ((-7.6, 15.0, 6.8), (-1.6, 21.0, 10.0)),
    ),
    (
        "F04_Classroom02",
        "player-spawn-f04-classroom-02",
        (-4.6, 18.0, 10.8),
        -141.52,
        "player-spawn-f04-classroom-02-exclusion",
        ((-7.6, 15.0, 10.4), (-1.6, 21.0, 13.6)),
    ),
    (
        "F02_ToiletWashSide",
        "player-spawn-f02-toilet-wash-side",
        (-0.8, 40.5, 3.6),
        14.04,
        "player-spawn-f02-toilet-wash-side-exclusion",
        ((-2.8, 38.5, 3.2), (1.2, 42.5, 6.4)),
    ),
    (
        "F02_CouncilSouth",
        "player-spawn-f02-council-south",
        (9.9, 38.5, 3.6),
        180.0,
        "player-spawn-f02-council-south-exclusion",
        ((6.4, 36.5, 3.2), (13.4, 40.5, 6.4)),
    ),
    (
        "F03_ArtSouth",
        "player-spawn-f03-art-south",
        (14.3, 37.4, 7.2),
        180.0,
        "player-spawn-f03-art-south-exclusion",
        ((10.3, 34.9, 6.8), (18.3, 39.9, 10.0)),
    ),
    (
        "F04_MusicSouth",
        "player-spawn-f04-music-south",
        (31.3, 37.4, 10.8),
        180.0,
        "player-spawn-f04-music-south-exclusion",
        ((27.3, 34.9, 10.4), (35.3, 39.9, 13.6)),
    ),
    (
        "RoofPoolWestStairs",
        "player-spawn-roof-pool-west-stairs",
        (17.5, 39.0, 14.66),
        -90.0,
        "player-spawn-roof-pool-west-stairs-exclusion",
        ((14.0, 36.5, 14.1), (21.0, 41.5, 18.7)),
    ),
)

NPC_SPAWN_VOLUME_SPECS = (
    (
        "F01_Stage",
        "npc-spawn-f01-stage",
        ((-18.4, -14.2, -0.4), (63.2, 51.0, 3.4)),
    ),
    (
        "F02_Stage",
        "npc-spawn-f02-stage",
        ((-12.2, -8.7, 3.4), (59.0, 45.1, 7.0)),
    ),
    (
        "F03_Stage",
        "npc-spawn-f03-stage",
        ((-12.2, -11.2, 7.0), (59.2, 45.1, 10.6)),
    ),
    (
        "F04_Stage",
        "npc-spawn-f04-stage",
        ((-12.2, -8.8, 10.6), (47.0, 45.1, 14.2)),
    ),
    (
        "Roof_Stage",
        "npc-spawn-roof-stage",
        ((-12.5, -6.9, 14.2), (47.3, 45.4, 18.6)),
    ),
)

NPC_SPAWN_BIAS_VOLUME_SPECS = (
    (
        "Main",
        "npc-spawn-bias-main",
        "player-spawn-main",
        0.5,
        ((-6.0, -3.5, -0.4), (0.0, 5.0, 3.4)),
    ),
    (
        "GymCenter",
        "npc-spawn-bias-gym-center",
        "player-spawn-gym-center",
        0.5,
        ((39.4, 2.5, -0.4), (53.4, 16.5, 3.4)),
    ),
    (
        "GymStage",
        "npc-spawn-bias-gym-stage",
        "player-spawn-gym-stage",
        0.5,
        ((40.6, -11.0, 0.6), (52.2, -2.0, 3.4)),
    ),
    (
        "F02_Classroom02",
        "npc-spawn-bias-f02-classroom-02",
        "player-spawn-f02-classroom-02",
        0.5,
        ((-12.15, 12.65, 3.4), (-3.65, 22.35, 7.0)),
    ),
    (
        "F03_Classroom02",
        "npc-spawn-bias-f03-classroom-02",
        "player-spawn-f03-classroom-02",
        0.5,
        ((-12.15, 12.65, 7.0), (-3.65, 22.35, 10.6)),
    ),
    (
        "F04_Classroom02",
        "npc-spawn-bias-f04-classroom-02",
        "player-spawn-f04-classroom-02",
        0.5,
        ((-12.15, 12.65, 10.6), (-3.65, 22.35, 14.2)),
    ),
    (
        "F02_ToiletWashSide",
        "npc-spawn-bias-f02-toilet-wash-side",
        "player-spawn-f02-toilet-wash-side",
        0.5,
        ((-6.3, 39.8, 3.4), (2.2, 45.05, 7.0)),
    ),
    (
        "F02_CouncilSouth",
        "npc-spawn-bias-f02-council-south",
        "player-spawn-f02-council-south",
        0.5,
        ((5.55, 36.65, 3.4), (14.25, 45.05, 7.0)),
    ),
    (
        "F03_ArtSouth",
        "npc-spawn-bias-f03-art-south",
        "player-spawn-f03-art-south",
        0.5,
        ((5.55, 36.65, 7.0), (23.25, 45.05, 10.6)),
    ),
    (
        "F04_MusicSouth",
        "npc-spawn-bias-f04-music-south",
        "player-spawn-f04-music-south",
        0.5,
        ((23.55, 36.65, 10.6), (41.25, 45.05, 14.2)),
    ),
    (
        "RoofPoolWestStairs",
        "npc-spawn-bias-roof-pool-west-stairs",
        "player-spawn-roof-pool-west-stairs",
        0.5,
        ((10.0, 36.0, 14.2), (14.4, 42.0, 18.6)),
    ),
)

BIT_SPAWN_VOLUME_SPECS = (
    (
        "OutdoorF1",
        "bit-spawn-outdoor-f1",
        "school-exterior",
        "outdoor-f1",
        ((-18.1, -14.1, -0.4), (62.9, 50.9, 3.2)),
    ),
    (
        "InteriorF1",
        "bit-spawn-interior-f1",
        "school-interior",
        "interior-f1",
        ((-12.2, -3.1, -0.4), (56.9, 45.0, 3.2)),
    ),
    (
        "GymLow",
        "bit-spawn-gym-low",
        "school-gym",
        "gym-low",
        ((33.9, -10.9, -0.4), (58.8, 26.0, 3.2)),
    ),
    (
        "OutdoorF2",
        "bit-spawn-outdoor-f2",
        "school-exterior",
        "outdoor-f2",
        ((-18.1, -14.1, 3.2), (62.9, 50.9, 6.8)),
    ),
    (
        "InteriorF2",
        "bit-spawn-interior-f2",
        "school-interior",
        "interior-f2",
        ((-12.2, -6.5, 3.2), (46.9, 45.1, 6.8)),
    ),
    (
        "GymUpper",
        "bit-spawn-gym-upper",
        "school-gym",
        "gym-upper",
        ((34.0, -11.0, 3.2), (58.9, 26.1, 6.8)),
    ),
    (
        "OutdoorF3",
        "bit-spawn-outdoor-f3",
        "school-exterior",
        "outdoor-f3",
        ((-18.1, -14.1, 6.8), (62.9, 50.9, 10.4)),
    ),
    (
        "InteriorF3",
        "bit-spawn-interior-f3",
        "school-interior",
        "interior-f3",
        ((-12.2, -6.5, 6.8), (46.9, 45.1, 10.4)),
    ),
    (
        "OutdoorF4",
        "bit-spawn-outdoor-f4",
        "school-exterior",
        "outdoor-f4",
        ((-18.1, -14.1, 10.4), (62.9, 50.9, 14.0)),
    ),
    (
        "InteriorF4",
        "bit-spawn-interior-f4",
        "school-interior",
        "interior-f4",
        ((-12.2, -6.5, 10.4), (46.9, 45.1, 14.0)),
    ),
    (
        "RoofFlight",
        "bit-spawn-roof-flight",
        "school-rooftop",
        "roof-flight",
        ((-12.2, -6.4, 14.0), (46.9, 45.0, 18.6)),
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
    "VIS_Floor_StairFront_NW",
    "VIS_Floor_StairZone_NW",
    "VIS_Floor_NorthEntryFoyer",
    "VIS_DoorLeaf_Classroom1_Front",
    "VIS_DoorLeaf_Classroom1_Rear",
    "VIS_DoorLeaf_S1Front",
    "VIS_DoorLeaf_S1Rear",
    "VIS_DoorLeaf_S2Front",
    "VIS_DoorLeaf_S2Rear",
    "VIS_DoorLeaf_SpecialRoomWest_Front",
    "VIS_DoorLeaf_SpecialRoomWest_Rear",
    "VIS_ToiletStallDoor_Open_F_01",
    "VIS_ToiletStallDoor_Open_F_02",
    "VIS_ToiletStallDoor_Open_F_03",
    "VIS_ToiletStallDoor_Open_M_01",
    "VIS_ToiletStallDoor_Open_M_02",
    "VIS_ToiletStallDoor_Open_M_03",
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

for side in ("West", "East"):
    SOURCE_OBJECTS_TO_REMOVE.update(
        {
            f"VIS_GymStageSideWall_{side}_Left",
            f"VIS_GymStageSideWall_{side}_Lintel",
            f"VIS_GymStageSideWall_{side}_Right",
            f"COL_GymStageSideWall_{side}_Left",
            f"COL_GymStageSideWall_{side}_Lintel",
            f"COL_GymStageSideWall_{side}_Right",
            f"VIS_GymStageSideDoor_Open_{side}",
        }
    )

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


@dataclass(frozen=True)
class RampPrismSpec:
    run_axis: str
    width: tuple[float, float]
    start: tuple[float, float]
    end: tuple[float, float]
    thickness: float = 0.15


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
    # 旧VIS_CourtyardSurfaceはSiteGround上面より3cm高い重複草地で、
    # 南端が表示だけの段差になっていた。校庭全域の表示所有者を
    # VIS_SiteGroundへ一本化し、Collider・Nav歩行面と同じz=-0.3にする。
    redundant_courtyard_surface = bpy.data.objects.get("VIS_CourtyardSurface")
    if redundant_courtyard_surface is not None:
        bpy.data.objects.remove(redundant_courtyard_surface, do_unlink=True)
    for object_name, bounds in (
        ("VIS_SiteGround", SITE_GROUND_VISUAL_BOUNDS),
        ("COL_SiteGround", SITE_GROUND_BOUNDS),
    ):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, ...]] = []
        append_box(vertices, faces, *bounds)
        replace_mesh_geometry(object_name, vertices, faces)

    outdoor_nav_vertices = [
        (63.4, 51.5, -0.3),
        (-18.6, 51.5, -0.3),
        (-18.6, -14.5, -0.3),
        (63.4, -14.5, -0.3),
        (43.4, 32.5, 0.0),
        (39.4, 32.5, 0.0),
        (39.4, 26.5, 0.0),
        (43.4, 26.5, 0.0),
    ]
    outdoor_nav_faces = [
        (0, 1, 2, 3),
        (4, 5, 6, 7),
    ]
    outdoor_nav = replace_mesh_geometry(
        "NAV_Walkable_Outdoor",
        outdoor_nav_vertices,
        outdoor_nav_faces,
    )
    if any(polygon.normal.z < 0.0 for polygon in outdoor_nav.data.polygons):
        mesh = bmesh.new()
        mesh.from_mesh(outdoor_nav.data)
        bmesh.ops.reverse_faces(mesh, faces=list(mesh.faces))
        mesh.normal_update()
        mesh.to_mesh(outdoor_nav.data)
        mesh.free()
        outdoor_nav.data.update(calc_edges=True)
    if any(polygon.normal.z <= 0.0 for polygon in outdoor_nav.data.polygons):
        raise RuntimeError("NAV_Walkable_Outdoorの上向き面を構築できませんでした")

    for (
        visual_name,
        axis,
        primary_minimum,
        primary_maximum,
        cross_minimum,
        cross_maximum,
    ) in PERIMETER_WALL_SPECS:
        bounds = oriented_box(
            axis,
            primary_minimum,
            primary_maximum,
            cross_minimum,
            cross_maximum,
            *PERIMETER_WALL_Z,
        )
        for object_name in (
            visual_name,
            visual_name.replace("VIS_", "COL_", 1),
        ):
            vertices = []
            faces = []
            append_box(vertices, faces, *bounds)
            replace_mesh_geometry(object_name, vertices, faces)

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
        collider_bounds = oriented_box(
            axis,
            minimum,
            maximum,
            fixed - 0.125,
            fixed + 0.125,
            *PERIMETER_WALL_Z,
        )
        collider_vertices: list[tuple[float, float, float]] = []
        collider_faces: list[tuple[int, ...]] = []
        append_box(
            collider_vertices,
            collider_faces,
            *collider_bounds,
        )
        replace_mesh_geometry(
            object_name.replace("VIS_", "COL_", 1),
            collider_vertices,
            collider_faces,
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


def rectangular_frame_boxes(
    inner_bounds_xy: tuple[float, float, float, float],
    outer_bounds_xy: tuple[float, float, float, float],
    z_bounds: tuple[float, float],
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    inner_min_x, inner_min_y, inner_max_x, inner_max_y = inner_bounds_xy
    outer_min_x, outer_min_y, outer_max_x, outer_max_y = outer_bounds_xy
    z_min, z_max = z_bounds
    if not (
        outer_min_x < inner_min_x < inner_max_x < outer_max_x
        and outer_min_y < inner_min_y < inner_max_y < outer_max_y
    ):
        raise RuntimeError(
            f"不正な矩形リング境界です: inner={inner_bounds_xy}, outer={outer_bounds_xy}"
        )
    return [
        (
            (outer_min_x, outer_min_y, z_min),
            (inner_min_x, outer_max_y, z_max),
        ),
        (
            (inner_max_x, outer_min_y, z_min),
            (outer_max_x, outer_max_y, z_max),
        ),
        (
            (inner_min_x, outer_min_y, z_min),
            (inner_max_x, inner_min_y, z_max),
        ),
        (
            (inner_min_x, inner_max_y, z_min),
            (inner_max_x, outer_max_y, z_max),
        ),
    ]


def build_b04_school_world_boundary(
    visual_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    architecture_material: bpy.types.Material,
) -> None:
    create_mesh_object(
        "VIS_B04_Sidewalk",
        rectangular_frame_boxes(
            B04_FENCE_OUTER_BOUNDS_XY,
            B04_SIDEWALK_OUTER_BOUNDS_XY,
            B04_SURFACE_Z,
        ),
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "VIS_B04_Road",
        rectangular_frame_boxes(
            B04_SIDEWALK_OUTER_BOUNDS_XY,
            B04_ROAD_OUTER_BOUNDS_XY,
            B04_SURFACE_Z,
        ),
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "BND_WorldLimit",
        [B04_WORLD_BOUNDARY_BOUNDS],
        semantic_collection,
        properties={
            "hs_id": "world-limit",
            "hs_role": "world_boundary",
        },
    )


def create_open_box_mesh_object(
    name: str,
    boxes: list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    omitted_face_indices: frozenset[int],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for minimum, maximum in boxes:
        box_faces: list[tuple[int, int, int, int]] = []
        append_box(vertices, box_faces, minimum, maximum)
        faces.extend(
            face
            for face_index, face in enumerate(box_faces)
            if face_index not in omitted_face_indices
        )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    return obj


def replace_existing_boxes(
    object_name: str,
    boxes: list[
        tuple[tuple[float, float, float], tuple[float, float, float]]
    ],
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for minimum, maximum in boxes:
        append_box(vertices, faces, minimum, maximum)
    return replace_mesh_geometry(object_name, vertices, faces)


def replace_existing_open_boxes(
    object_name: str,
    boxes: list[
        tuple[tuple[float, float, float], tuple[float, float, float]]
    ],
    omitted_face_indices_by_box: tuple[frozenset[int], ...],
) -> bpy.types.Object:
    if len(boxes) != len(omitted_face_indices_by_box):
        raise RuntimeError(f"開放boxの面指定数が不正です: {object_name}")
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for (minimum, maximum), omitted_face_indices in zip(
        boxes,
        omitted_face_indices_by_box,
        strict=True,
    ):
        box_faces: list[tuple[int, int, int, int]] = []
        append_box(vertices, box_faces, minimum, maximum)
        faces.extend(
            face
            for face_index, face in enumerate(box_faces)
            if face_index not in omitted_face_indices
        )
    return replace_mesh_geometry(object_name, vertices, faces)


def replace_existing_xy_prism(
    object_name: str,
    outline: tuple[tuple[float, float], ...],
    z_minimum: float,
    z_maximum: float,
) -> bpy.types.Object:
    if len(outline) < 3 or z_maximum <= z_minimum:
        raise RuntimeError(f"不正なXY角柱境界です: {object_name}")
    polygon = [Vector((x, y, 0.0)) for x, y in outline]
    triangles = tessellate_polygon([polygon])
    if not triangles:
        raise RuntimeError(f"XY角柱を三角形分割できません: {object_name}")
    vertices = [
        (x, y, z)
        for z in (z_minimum, z_maximum)
        for x, y in outline
    ]
    faces: list[tuple[int, ...]] = []
    top_offset = len(outline)
    tessellated_area = 0.0
    for triangle in triangles:
        indices = tuple(int(index) for index in triangle)
        first, second, third = (polygon[index] for index in indices)
        signed_double_area = (second - first).cross(third - first).z
        if abs(signed_double_area) <= 1.0e-8:
            continue
        tessellated_area += abs(signed_double_area) * 0.5
        if signed_double_area < 0.0:
            indices = (indices[0], indices[2], indices[1])
        faces.append(tuple(reversed(indices)))
        faces.append(tuple(top_offset + index for index in indices))
    outline_area = abs(
        sum(
            x * next_y - next_x * y
            for (x, y), (next_x, next_y) in zip(
                outline,
                (*outline[1:], outline[0]),
                strict=True,
            )
        )
    ) * 0.5
    if not math.isclose(tessellated_area, outline_area, abs_tol=1.0e-5):
        raise RuntimeError(
            f"XY角柱の三角形分割面積が不正です: {object_name}/"
            f"{tessellated_area}/{outline_area}"
        )
    for index, next_index in zip(
        range(len(outline)),
        (*range(1, len(outline)), 0),
        strict=True,
    ):
        faces.append(
            (
                index,
                next_index,
                top_offset + next_index,
                top_offset + index,
            )
        )
    return replace_mesh_geometry(object_name, vertices, faces)


def replace_stage_ramp_geometry(
    object_name: str,
    low_x: float,
    high_x: float,
    minimum_y: float,
    maximum_y: float,
) -> bpy.types.Object:
    vertices = [
        (low_x, minimum_y, 0.0),
        (high_x, minimum_y, 0.0),
        (high_x, minimum_y, 1.0),
        (low_x, maximum_y, 0.0),
        (high_x, maximum_y, 0.0),
        (high_x, maximum_y, 1.0),
    ]
    faces = [
        (0, 1, 4, 3),
        (1, 2, 5, 4),
        (0, 3, 5, 2),
        (0, 2, 1),
        (3, 4, 5),
    ]
    if high_x > low_x:
        faces = [tuple(reversed(face)) for face in faces]
    return replace_mesh_geometry(object_name, vertices, faces)


def create_yz_beam_mesh_object(
    name: str,
    beams: list[
        tuple[
            tuple[float, float],
            tuple[float, float],
            float,
            float,
            float,
        ]
    ],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for start, end, width, minimum_x, maximum_x in beams:
        direction_y = end[0] - start[0]
        direction_z = end[1] - start[1]
        length = math.hypot(direction_y, direction_z)
        if length <= 1.0e-8:
            raise RuntimeError(f"長さ0のYZ梁です: {name}")
        offset_y = -direction_z / length * width / 2.0
        offset_z = direction_y / length * width / 2.0
        yz_corners = (
            (start[0] + offset_y, start[1] + offset_z),
            (start[0] - offset_y, start[1] - offset_z),
            (end[0] - offset_y, end[1] - offset_z),
            (end[0] + offset_y, end[1] + offset_z),
        )
        vertex_offset = len(vertices)
        vertices.extend(
            (x, y, z)
            for x in (minimum_x, maximum_x)
            for y, z in yz_corners
        )
        faces.extend(
            (
                (vertex_offset + 3, vertex_offset + 2, vertex_offset + 1, vertex_offset),
                (
                    vertex_offset + 4,
                    vertex_offset + 5,
                    vertex_offset + 6,
                    vertex_offset + 7,
                ),
                (vertex_offset, vertex_offset + 1, vertex_offset + 5, vertex_offset + 4),
                (vertex_offset + 1, vertex_offset + 2, vertex_offset + 6, vertex_offset + 5),
                (vertex_offset + 2, vertex_offset + 3, vertex_offset + 7, vertex_offset + 6),
                (vertex_offset + 3, vertex_offset, vertex_offset + 4, vertex_offset + 7),
            )
        )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    return obj


def create_elevator_adjustment_text(
    name: str,
    floor_base_z: float,
    target_collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    font_path = REPOSITORY_ROOT / SIGNAGE_FONT_RELATIVE_PATH
    if not font_path.is_file():
        raise RuntimeError(
            f"調整中表示用subset fontがありません: {SIGNAGE_FONT_RELATIVE_PATH}"
        )
    actual_font_bytes = font_path.stat().st_size
    actual_font_sha256 = sha256(font_path)
    if actual_font_bytes != EXPECTED_FONT_BYTES or actual_font_sha256 != EXPECTED_FONT_SHA256.upper():
        raise RuntimeError(
            "調整中表示用subset fontが固定生成物と一致しません: "
            f"bytes={actual_font_bytes}, sha256={actual_font_sha256}"
        )
    font = bpy.data.fonts.load(str(font_path), check_existing=True)
    font.name = "B06_HaigureSignageSubsetBold"

    curve = bpy.data.curves.new(name, type="FONT")
    curve.body = ADJUSTMENT_TEXT
    curve.font = font
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = 0.34
    curve.extrude = 0.01
    curve.resolution_u = 2
    obj = bpy.data.objects.new(name, curve)
    target_collection.objects.link(obj)
    curve.materials.append(material)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.view_layer.objects.active
    if mesh_obj is None or mesh_obj.type != "MESH":
        raise RuntimeError(f"調整中文字をMeshへ変換できません: {name}")
    mesh_obj.name = name
    mesh_obj.data.name = name
    orientation = Matrix.Rotation(math.pi / 2, 4, "Y") @ Matrix.Rotation(
        math.pi / 2, 4, "Z"
    )
    mesh_obj.data.transform(orientation)
    mesh_obj.data.transform(
        Matrix.Translation(
            Vector((-8.74, ELEVATOR_CENTER_Y, floor_base_z + 1.26))
        )
    )
    if curve.users == 0:
        bpy.data.curves.remove(curve)
    if font.users == 0:
        bpy.data.fonts.remove(font)
    bpy.context.scene["b06_3_adjustment_text"] = ADJUSTMENT_TEXT
    bpy.context.scene["b06_3_signage_font_source"] = SIGNAGE_FONT_RELATIVE_PATH
    bpy.context.scene["b06_3_signage_font_sha256"] = EXPECTED_FONT_SHA256
    return mesh_obj


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


def append_xz_profile_prism(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    width: tuple[float, float],
    profile: tuple[tuple[float, float], ...],
) -> None:
    offset = len(vertices)
    for y in width:
        vertices.extend((x, y, z) for x, z in profile)
    profile_size = len(profile)
    faces.extend(
        [
            tuple(offset + index for index in range(profile_size)),
            tuple(
                offset + profile_size + index
                for index in reversed(range(profile_size))
            ),
        ]
    )
    for index in range(profile_size):
        next_index = (index + 1) % profile_size
        faces.append(
            (
                offset + index,
                offset + profile_size + index,
                offset + profile_size + next_index,
                offset + next_index,
            )
        )


def append_ramp_prism(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    spec: RampPrismSpec,
) -> None:
    if spec.end[0] >= spec.start[0]:
        profile = (
            spec.end,
            spec.start,
            (spec.start[0], spec.start[1] - spec.thickness),
            (spec.end[0], spec.end[1] - spec.thickness),
        )
    else:
        profile = (
            spec.start,
            spec.end,
            (spec.end[0], spec.end[1] - spec.thickness),
            (spec.start[0], spec.start[1] - spec.thickness),
        )
    if spec.run_axis == "Y":
        append_profile_prism(vertices, faces, spec.width, profile)
    elif spec.run_axis == "X":
        append_xz_profile_prism(vertices, faces, spec.width, profile)
    else:
        raise RuntimeError(f"Ramp軸が不正です: {spec.run_axis}")


def ramp_top_surface(
    spec: RampPrismSpec,
) -> tuple[
    tuple[float, float, float],
    tuple[float, float, float],
    tuple[float, float, float],
    tuple[float, float, float],
]:
    if spec.run_axis == "Y":
        if spec.end[0] >= spec.start[0]:
            return (
                (spec.width[0], spec.start[0], spec.start[1]),
                (spec.width[1], spec.start[0], spec.start[1]),
                (spec.width[1], spec.end[0], spec.end[1]),
                (spec.width[0], spec.end[0], spec.end[1]),
            )
        return (
            (spec.width[0], spec.start[0], spec.start[1]),
            (spec.width[0], spec.end[0], spec.end[1]),
            (spec.width[1], spec.end[0], spec.end[1]),
            (spec.width[1], spec.start[0], spec.start[1]),
        )
    if spec.run_axis == "X":
        if spec.end[0] >= spec.start[0]:
            return (
                (spec.start[0], spec.width[0], spec.start[1]),
                (spec.end[0], spec.width[0], spec.end[1]),
                (spec.end[0], spec.width[1], spec.end[1]),
                (spec.start[0], spec.width[1], spec.start[1]),
            )
        return (
            (spec.start[0], spec.width[0], spec.start[1]),
            (spec.start[0], spec.width[1], spec.start[1]),
            (spec.end[0], spec.width[1], spec.end[1]),
            (spec.end[0], spec.width[0], spec.end[1]),
        )
    raise RuntimeError(f"Ramp軸が不正です: {spec.run_axis}")


def create_stair_mesh_object(
    name: str,
    boxes: list[
        tuple[tuple[float, float, float], tuple[float, float, float]]
    ],
    ramps: list[RampPrismSpec],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for minimum, maximum in boxes:
        append_box(vertices, faces, minimum, maximum)
    for ramp in ramps:
        append_ramp_prism(vertices, faces, ramp)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    return obj


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


def create_floor_finish_visual_mesh_object(
    name: str,
    boxes: list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """南西階段境界の床断面を除き、別の壁色面へ所有を渡す。"""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for minimum, maximum in boxes:
        box_faces: list[tuple[int, int, int, int]] = []
        append_box(vertices, box_faces, minimum, maximum)
        for face_index, face in enumerate(box_faces):
            is_southwest_stair_edge = (
                face_index == 2
                and math.isclose(minimum[1], -3.5, abs_tol=1.0e-6)
            ) or (
                face_index == 4
                and math.isclose(maximum[1], -3.5, abs_tol=1.0e-6)
            )
            if not is_southwest_stair_edge:
                faces.append(face)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    mesh.materials.append(material)
    return obj


def create_outward_surface_mesh_object(
    name: str,
    surfaces: tuple[tuple[str, float, float, float, float, float, int], ...],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for (
        axis,
        primary_minimum,
        primary_maximum,
        cross_coordinate,
        z_minimum,
        z_maximum,
        outward_sign,
    ) in surfaces:
        append_outward_surface_quad(
            vertices,
            faces,
            axis,
            primary_minimum,
            primary_maximum,
            cross_coordinate,
            z_minimum,
            z_maximum,
            outward_sign,
        )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    mesh.materials.append(material)
    return obj


def planar_polygon_xz_area(points: list[Vector]) -> float:
    return abs(
        sum(
            point.x * points[(index + 1) % len(points)].z
            - points[(index + 1) % len(points)].x * point.z
            for index, point in enumerate(points)
        )
    ) / 2.0


def clean_planar_polygon(points: list[Vector]) -> list[Vector]:
    cleaned: list[Vector] = []
    for point in points:
        if not cleaned or (point - cleaned[-1]).length > 1.0e-8:
            cleaned.append(point)
    if len(cleaned) >= 2 and (cleaned[0] - cleaned[-1]).length <= 1.0e-8:
        cleaned.pop()
    return cleaned


def clip_planar_polygon_halfspace(
    points: list[Vector],
    axis: int,
    boundary: float,
    *,
    keep_lower: bool,
) -> list[Vector]:
    clipped: list[Vector] = []
    for start, end in zip(points, points[1:] + points[:1], strict=True):
        start_distance = start[axis] - boundary
        end_distance = end[axis] - boundary
        start_inside = start_distance <= 1.0e-8 if keep_lower else start_distance >= -1.0e-8
        end_inside = end_distance <= 1.0e-8 if keep_lower else end_distance >= -1.0e-8
        if start_inside:
            clipped.append(start.copy())
        if start_inside != end_inside:
            ratio = start_distance / (start_distance - end_distance)
            clipped.append(start.lerp(end, ratio))
    return clean_planar_polygon(clipped)


def split_planar_polygon_by_coordinate(
    points: list[Vector], axis: int, boundary: float
) -> list[list[Vector]]:
    pieces = (
        clip_planar_polygon_halfspace(points, axis, boundary, keep_lower=True),
        clip_planar_polygon_halfspace(points, axis, boundary, keep_lower=False),
    )
    return [piece for piece in pieces if len(piece) >= 3 and planar_polygon_xz_area(piece) > 1.0e-10]


def simplify_elevator_shaft_north_wall_owner(
    shaft: bpy.types.Object,
) -> int:
    """F4北面と屋上天端の共線分割点を両面から除き、所有面をquad化する。"""
    normal_matrix = shaft.matrix_world.to_3x3().inverted().transposed()
    owner_polygons = []
    for polygon in shaft.data.polygons:
        points = [
            shaft.matrix_world @ shaft.data.vertices[index].co
            for index in polygon.vertices
        ]
        normal = (normal_matrix @ polygon.normal).normalized()
        if normal.y > 1.0 - 1.0e-5 and all(
            abs(point.y + 3.5) <= 1.0e-5 for point in points
        ):
            owner_polygons.append(polygon)
    if all(len(polygon.vertices) == 4 for polygon in owner_polygons):
        return 0
    non_quad_owner_bounds = {
        (
            round(min((shaft.matrix_world @ shaft.data.vertices[index].co).x for index in polygon.vertices), 5),
            round(max((shaft.matrix_world @ shaft.data.vertices[index].co).x for index in polygon.vertices), 5),
            round(min((shaft.matrix_world @ shaft.data.vertices[index].co).z for index in polygon.vertices), 5),
            round(max((shaft.matrix_world @ shaft.data.vertices[index].co).z for index in polygon.vertices), 5),
            len(polygon.vertices),
        )
        for polygon in owner_polygons
        if len(polygon.vertices) != 4
    }
    if non_quad_owner_bounds != {(-12.45, -6.0, 10.8, 14.4, 6)}:
        raise RuntimeError(
            "エレベーターシャフト北面のquad化前形状が不正です: "
            f"{sorted(non_quad_owner_bounds)}"
        )

    if shaft.data.users != 1:
        shaft.data = shaft.data.copy()
    mesh = bmesh.new()
    mesh.from_mesh(shaft.data)
    mesh.normal_update()

    def world_coordinate(vertex: bmesh.types.BMVert) -> tuple[float, float, float]:
        return tuple(
            round(float(value), 5) for value in (shaft.matrix_world @ vertex.co)
        )

    expected_top_edges = {
        ((-11.8, -3.8, 14.4), (-11.8, -3.5, 14.4)),
        ((-8.65, -3.8, 14.4), (-8.65, -3.5, 14.4)),
    }
    top_edges = [
        edge
        for edge in mesh.edges
        if len(edge.link_faces) == 2
        and all(face.normal.z > 1.0 - 1.0e-5 for face in edge.link_faces)
        and tuple(sorted(world_coordinate(vertex) for vertex in edge.verts))
        in expected_top_edges
    ]
    actual_top_edges = {
        tuple(sorted(world_coordinate(vertex) for vertex in edge.verts))
        for edge in top_edges
    }
    if actual_top_edges != expected_top_edges:
        mesh.free()
        raise RuntimeError(
            "エレベーターシャフトF4天端の統合edgeが不正です: "
            f"actual={sorted(actual_top_edges)}"
        )
    bmesh.ops.dissolve_edges(
        mesh,
        edges=top_edges,
        use_verts=False,
        use_face_split=False,
    )
    mesh.normal_update()
    owner_face = next(
        face
        for face in mesh.faces
        if face.normal.y > 1.0 - 1.0e-5
        and {
            (round((shaft.matrix_world @ vertex.co).x, 5), round((shaft.matrix_world @ vertex.co).z, 5))
            for vertex in face.verts
        }
        >= {
            (-12.45, 10.8),
            (-12.45, 14.4),
            (-6.0, 10.8),
            (-6.0, 14.4),
        }
    )
    owner_corners = {
        (-12.45, 10.8),
        (-12.45, 14.4),
        (-6.0, 10.8),
        (-6.0, 14.4),
    }
    extra_vertices = [
        vertex
        for vertex in owner_face.verts
        if (
            round((shaft.matrix_world @ vertex.co).x, 5),
            round((shaft.matrix_world @ vertex.co).z, 5),
        )
        not in owner_corners
    ]
    actual_extra_coordinates = {
        world_coordinate(vertex) for vertex in extra_vertices
    }
    expected_extra_coordinates = {
        (-11.8, -3.5, 14.4),
        (-8.65, -3.5, 14.4),
    }
    if actual_extra_coordinates != expected_extra_coordinates or any(
        len(vertex.link_edges) != 2 or len(vertex.link_faces) != 2
        for vertex in extra_vertices
    ):
        mesh.free()
        raise RuntimeError(
            "エレベーターシャフトF4北面の共線頂点が不正です: "
            f"actual={sorted(actual_extra_coordinates)}"
        )
    bmesh.ops.dissolve_verts(
        mesh,
        verts=extra_vertices,
        use_face_split=False,
        use_boundary_tear=False,
    )
    mesh.to_mesh(shaft.data)
    shaft.data.update(calc_edges=True)
    mesh.free()
    return len(extra_vertices)


def elevator_shaft_north_wall_owner_rectangles(
    shaft: bpy.types.Object,
) -> tuple[tuple[float, float, float, float], ...]:
    rectangles: list[tuple[float, float, float, float]] = []
    normal_matrix = shaft.matrix_world.to_3x3().inverted().transposed()
    for polygon in shaft.data.polygons:
        points = [
            shaft.matrix_world @ shaft.data.vertices[index].co
            for index in polygon.vertices
        ]
        normal = (normal_matrix @ polygon.normal).normalized()
        if (
            normal.y <= 1.0 - 1.0e-5
            or any(abs(point.y + 3.5) > 1.0e-5 for point in points)
        ):
            continue
        rectangles.append(
            (
                min(point.x for point in points),
                max(point.x for point in points),
                min(point.z for point in points),
                max(point.z for point in points),
            )
        )
    actual = {
        tuple(round(value, 5) for value in rectangle) for rectangle in rectangles
    }
    expected = {
        (-12.45, -6.0, 0.04, 3.45),
        (-12.45, -6.0, 3.6, 7.05),
        (-12.45, -6.0, 7.2, 10.65),
        (-12.45, -6.0, 10.8, 14.4),
    }
    if actual != expected:
        raise RuntimeError(
            "エレベーターシャフト北面の単一所有範囲が不正です: "
            f"actual={sorted(actual)}"
        )
    return tuple(sorted(rectangles))


def trim_visual_faces_owned_by_elevator_shaft_north_wall() -> dict[str, float]:
    """シャフト北面と共面になる他の表示面を境界で分割し、壁へ所有を渡す。"""
    shaft = bpy.data.objects.get("VIS_B03_ElevatorShaftShell")
    if shaft is None or shaft.type != "MESH":
        raise RuntimeError("エレベーターシャフト表示Meshがありません")
    simplify_elevator_shaft_north_wall_owner(shaft)
    owner_rectangles = elevator_shaft_north_wall_owner_rectangles(shaft)
    cut_coordinates = (
        (0, sorted({value for x0, x1, _z0, _z1 in owner_rectangles for value in (x0, x1)})),
        (2, sorted({value for _x0, _x1, z0, z1 in owner_rectangles for value in (z0, z1)})),
    )
    removed_area_by_object: dict[str, float] = {}
    for obj in sorted(bpy.data.objects, key=lambda item: item.name):
        if (
            obj == shaft
            or obj.type != "MESH"
            or not obj.name.startswith("VIS_")
        ):
            continue
        world_to_local = obj.matrix_world.inverted()
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        polygons_by_vertex: dict[int, list[int]] = {}
        for polygon in obj.data.polygons:
            for vertex_index in polygon.vertices:
                polygons_by_vertex.setdefault(vertex_index, []).append(polygon.index)
        polygon_components: dict[int, int] = {}
        for polygon in obj.data.polygons:
            if polygon.index in polygon_components:
                continue
            component = len(set(polygon_components.values()))
            pending = [polygon.index]
            polygon_components[polygon.index] = component
            while pending:
                polygon_index = pending.pop()
                for vertex_index in obj.data.polygons[polygon_index].vertices:
                    for neighbor_index in polygons_by_vertex[vertex_index]:
                        if neighbor_index in polygon_components:
                            continue
                        polygon_components[neighbor_index] = component
                        pending.append(neighbor_index)

        rebuilt_polygons: list[tuple[list[Vector], int, bool, int, float]] = []
        source_vertex_keys_by_component: dict[
            int, set[tuple[float, float, float]]
        ] = {}
        for polygon in obj.data.polygons:
            source_vertex_keys_by_component.setdefault(
                polygon_components[polygon.index], set()
            ).update(
                tuple(
                    round(float(value), 8)
                    for value in (obj.matrix_world @ obj.data.vertices[index].co)
                )
                for index in polygon.vertices
            )
        introduced_breakpoints_by_component: dict[
            int, set[tuple[float, float, float]]
        ] = {}
        removed_area = 0.0
        for polygon in obj.data.polygons:
            component = polygon_components[polygon.index]
            world_normal_y = (
                normal_matrix @ polygon.normal
            ).normalized().y
            world_points = [
                obj.matrix_world @ obj.data.vertices[index].co
                for index in polygon.vertices
            ]
            if any(abs(point.y + 3.5) > 1.0e-5 for point in world_points):
                rebuilt_polygons.append(
                    (
                        world_points,
                        polygon.material_index,
                        polygon.use_smooth,
                        component,
                        world_normal_y,
                    )
                )
                continue
            pieces = [world_points]
            for axis, boundaries in cut_coordinates:
                for boundary in boundaries:
                    pieces = [
                        piece
                        for candidate in pieces
                        for piece in split_planar_polygon_by_coordinate(
                            candidate, axis, boundary
                        )
                    ]
            kept_pieces = []
            for piece in pieces:
                introduced_breakpoints_by_component.setdefault(
                    component, set()
                ).update(
                    tuple(round(float(value), 8) for value in point)
                    for point in piece
                    if tuple(round(float(value), 8) for value in point)
                    not in source_vertex_keys_by_component[component]
                )
                center_x = sum(point.x for point in piece) / len(piece)
                center_z = sum(point.z for point in piece) / len(piece)
                if any(
                    x0 - 1.0e-8 <= center_x <= x1 + 1.0e-8
                    and z0 - 1.0e-8 <= center_z <= z1 + 1.0e-8
                    for x0, x1, z0, z1 in owner_rectangles
                ):
                    continue
                kept_pieces.append(piece)
            original_area = planar_polygon_xz_area(world_points)
            kept_area = sum(planar_polygon_xz_area(piece) for piece in kept_pieces)
            removed_area += max(0.0, original_area - kept_area)
            rebuilt_polygons.extend(
                (
                    piece,
                    polygon.material_index,
                    polygon.use_smooth,
                    component,
                    world_normal_y,
                )
                for piece in kept_pieces
            )
        if removed_area <= 1.0e-10:
            continue
        # 同じObject内で表裏が同一座標に残る床断面も、-Y側の一面だけへ
        # 統一する。F4の完全矩形外形と露出帯は維持し、二重描画だけを省く。
        unique_polygons: dict[
            tuple[tuple[float, float, float], ...],
            tuple[list[Vector], int, bool, int, float],
        ] = {}
        passthrough_polygons: list[
            tuple[list[Vector], int, bool, int, float]
        ] = []
        for candidate in rebuilt_polygons:
            points, _material_index, _use_smooth, _component, normal_y = candidate
            if any(abs(point.y + 3.5) > 1.0e-5 for point in points):
                passthrough_polygons.append(candidate)
                continue
            surface_key = tuple(
                sorted(
                    tuple(round(float(value), 5) for value in point)
                    for point in points
                )
            )
            current = unique_polygons.get(surface_key)
            if current is None or normal_y < current[4]:
                unique_polygons[surface_key] = candidate
        rebuilt_polygons = passthrough_polygons + list(unique_polygons.values())

        propagated_polygons: list[
            tuple[list[Vector], int, bool, int, float]
        ] = []
        breakpoint_vectors_by_component = {
            component: [Vector(point) for point in breakpoints]
            for component, breakpoints in introduced_breakpoints_by_component.items()
        }
        for (
            points,
            material_index,
            use_smooth,
            component,
            world_normal_y,
        ) in rebuilt_polygons:
            propagated_points: list[Vector] = []
            for start, end in zip(points, points[1:] + points[:1], strict=True):
                propagated_points.append(start)
                direction = end - start
                length_squared = direction.length_squared
                if length_squared <= 1.0e-16:
                    continue
                edge_breakpoints = []
                for breakpoint in breakpoint_vectors_by_component.get(component, ()):
                    ratio = (breakpoint - start).dot(direction) / length_squared
                    if not 1.0e-8 < ratio < 1.0 - 1.0e-8:
                        continue
                    projected = start + direction * ratio
                    # Blenderのfloat32頂点から求めた交点は、同じ物理edge上でも
                    # 隣接面との間に数百nmの丸め差が出る。監査の幾何許容値と
                    # 同じ10µm以内を同一直線とし、同一breakpointを共有する。
                    if (breakpoint - projected).length > 1.0e-5:
                        continue
                    edge_breakpoints.append((ratio, breakpoint))
                propagated_points.extend(
                    breakpoint
                    for _ratio, breakpoint in sorted(
                        edge_breakpoints, key=lambda item: item[0]
                    )
                )
            propagated_polygons.append(
                (
                    clean_planar_polygon(propagated_points),
                    material_index,
                    use_smooth,
                    component,
                    world_normal_y,
                )
            )

        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, ...]] = []
        vertex_indices: dict[
            tuple[int, tuple[float, float, float]], int
        ] = {}
        material_indices: list[int] = []
        smooth_flags: list[bool] = []
        for (
            points,
            material_index,
            use_smooth,
            component,
            _world_normal_y,
        ) in propagated_polygons:
            local_points = [world_to_local @ point for point in points]
            face = []
            for point in local_points:
                coordinate = tuple(float(value) for value in point)
                key = (
                    component,
                    tuple(round(value, 5) for value in coordinate),
                )
                vertex_index = vertex_indices.get(key)
                if vertex_index is None:
                    vertex_index = len(vertices)
                    vertex_indices[key] = vertex_index
                    vertices.append(coordinate)
                face.append(vertex_index)
            faces.append(tuple(face))
            material_indices.append(material_index)
            smooth_flags.append(use_smooth)
        if obj.data.users != 1:
            obj.data = obj.data.copy()
        obj.data.clear_geometry()
        obj.data.from_pydata(vertices, [], faces)
        obj.data.name = obj.name
        for polygon, material_index, use_smooth in zip(
            obj.data.polygons,
            material_indices,
            smooth_flags,
            strict=True,
        ):
            polygon.material_index = material_index
            polygon.use_smooth = use_smooth
        obj.data.update(calc_edges=True)
        removed_area_by_object[obj.name] = round(removed_area, 6)
    expected_trimmed_objects = {
        "VIS_B03_Ceiling_F02",
        "VIS_B03_Ceiling_F03",
        "VIS_B03_Ceiling_F04",
        "VIS_B03_InterfloorStructure_F01_West",
        "VIS_StairGuardSystem_SW_3FTo4F",
        "VIS_StairLanding_SW",
        "VIS_Stairs_SW",
        "VIS_StairSystem_SW_2FTo3F",
        "VIS_StairSystem_SW_3FTo4F",
    }
    if set(removed_area_by_object) != expected_trimmed_objects:
        raise RuntimeError(
            "エレベーターシャフト北面と接する表示面の集合が不正です: "
            f"actual={sorted(removed_area_by_object)}"
        )
    return removed_area_by_object


def replace_mesh_geometry_with_oriented_faces(
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
    nosing_vertices: list[tuple[float, float, float]] | None = None,
    nosing_faces: list[tuple[int, ...]] | None = None,
) -> None:
    if (nosing_vertices is None) != (nosing_faces is None):
        raise RuntimeError("階段防護材の頂点・面は同時に指定してください")
    rise = 0.15
    direction = 1.0 if end_y > start_y else -1.0
    for index in range(step_count):
        y0 = start_y + (end_y - start_y) * index / step_count
        y1 = start_y + (end_y - start_y) * (index + 1) / step_count
        top = base_z + rise * (index + 1)
        previous_top = base_z + rise * index
        y_min, y_max = sorted((y0, y1))
        offset = len(vertices)
        vertices.extend(
            (
                (width[0], y_min, top),
                (width[1], y_min, top),
                (width[1], y_max, top),
                (width[0], y_max, top),
            )
        )
        faces.append((offset, offset + 1, offset + 2, offset + 3))

        approach_y = y0
        offset = len(vertices)
        vertices.extend(
            (
                (width[0], approach_y, previous_top),
                (width[1], approach_y, previous_top),
                (width[1], approach_y, top),
                (width[0], approach_y, top),
            )
        )
        if direction > 0.0:
            faces.append((offset, offset + 1, offset + 2, offset + 3))
        else:
            faces.append((offset + 3, offset + 2, offset + 1, offset))

        if nosing_vertices is not None and nosing_faces is not None:
            nosing_y0, nosing_y1 = sorted(
                (approach_y, approach_y + direction * 0.06)
            )
            face_offset = len(nosing_faces)
            append_box(
                nosing_vertices,
                nosing_faces,
                (width[0], nosing_y0, top),
                (width[1], nosing_y1, top + 0.02),
            )
            # 段上面・階段幅端との接触面は階段本体が所有する。防護材は
            # 可視となる上面と前後面だけを残し、同一平面を二重描画しない。
            nosing_faces[face_offset:] = (
                nosing_faces[face_offset + 1],
                nosing_faces[face_offset + 2],
                nosing_faces[face_offset + 4],
            )


def append_stair_support_board(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    width: tuple[float, float],
    start_y: float,
    end_y: float,
    start_z: float,
    end_z: float,
) -> None:
    append_ramp_prism(
        vertices,
        faces,
        RampPrismSpec(
            run_axis="Y",
            width=width,
            start=(start_y, start_z),
            end=(end_y, end_z),
            thickness=0.12,
        ),
    )


def append_southwest_upper_stair_support_board(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    base_z: float,
) -> None:
    # 南西階段の外側支持面は、階床の壁色断面と同じY=-3.5を向く。
    # 支持板の低い三角形だけを床断面の下へ隠すと二重面になるため、
    # 壁色断面を単一所有者として残し、表示支持面だけをfloor topで切る。
    # Colliderは元の連続Rampを維持する。
    profile = (
        (43.1, base_z + 2.4),
        (38.9, base_z),
        (39.11, base_z),
        (43.1, base_z + 2.28),
    )
    append_profile_prism(vertices, faces, (-12.6, -10.2), profile)


def rebuild_first_transition_stair_visuals() -> dict[str, int]:
    # 南西踊り場は旧正本Objectを再利用するため、強制再生成でも必ず元の箱へ戻す。
    # 最終段でシャフト壁との共有部分だけが再度trimされ、生成が決定的になる。
    replace_existing_boxes(
        "VIS_StairLanding_SW",
        [((-12.6, -3.5, 2.3), (-10.2, 2.5, 2.4))],
    )
    rebuilt: dict[str, int] = {}
    for stair in ("NW", "NE", "SW"):
        nosing_vertices: list[tuple[float, float, float]] = []
        nosing_faces: list[tuple[int, ...]] = []
        lower_vertices: list[tuple[float, float, float]] = []
        lower_faces: list[tuple[int, ...]] = []
        append_thin_steps(
            lower_vertices,
            lower_faces,
            (-12.6, -10.2),
            38.9,
            43.1,
            0.0,
            16,
            nosing_vertices,
            nosing_faces,
        )
        append_stair_support_board(
            lower_vertices,
            lower_faces,
            (-12.6, -10.2),
            38.9,
            43.1,
            0.0,
            2.4,
        )
        upsert_surface_geometry(
            f"VIS_Stairs_{stair}",
            transform_stair_vertices(lower_vertices, stair),
            lower_faces,
            collection(VIS_COLLECTION_NAME),
        )
        rebuilt[f"lower_{stair.lower()}"] = 16

        upper_vertices: list[tuple[float, float, float]] = []
        upper_faces: list[tuple[int, ...]] = []
        append_thin_steps(
            upper_vertices,
            upper_faces,
            (-9.0, -6.6),
            41.3,
            38.9,
            2.4,
            8,
            nosing_vertices,
            nosing_faces,
        )
        append_profile_prism(
            upper_vertices,
            upper_faces,
            (-9.0, -6.6),
            (
                (43.1, 2.3),
                (41.3, 2.3),
                (38.9, 3.48),
                (38.9, 3.6),
                (41.3, 2.4),
                (43.1, 2.4),
            ),
        )
        upsert_surface_geometry(
            f"VIS_StairsUpper_{stair}",
            transform_stair_vertices(upper_vertices, stair),
            upper_faces,
            collection(VIS_COLLECTION_NAME),
        )
        nosing = upsert_mesh_geometry(
            f"VIS_B03_StairNosing_{stair}_1FTo2F",
            transform_stair_vertices(nosing_vertices, stair),
            nosing_faces,
            collection(VIS_COLLECTION_NAME),
        )
        nosing.data.materials.clear()
        nosing.data.materials.append(
            existing_material("MAT_B03_Atlas_Architecture")
        )
        collider_vertices: list[tuple[float, float, float]] = []
        collider_faces: list[tuple[int, ...]] = []
        append_profile_prism(
            collider_vertices,
            collider_faces,
            (-9.0, -6.6),
            (
                (43.1, 2.3),
                (41.3, 2.3),
                (38.9, 3.5),
                (38.9, 3.6),
                (41.3, 2.4),
                (43.1, 2.4),
            ),
        )
        upsert_mesh_geometry(
            f"COL_StairRampUpper_{stair}",
            transform_stair_vertices(collider_vertices, stair),
            collider_faces,
            collection(COL_COLLECTION_NAME),
        )
        claimed_guard_posts = {
            tuple(
                round(float(value), 6)
                for value in Vector((-10.28, 43.1, 2.4))
            )
        }
        guard_vertices, guard_faces = create_upper_stair_guard_visual_geometry(
            0.0,
            ("Landing",),
            claimed_post_positions=claimed_guard_posts,
        )
        upsert_mesh_geometry(
            f"VIS_StairGuard_{stair}_Landing",
            transform_stair_vertices(guard_vertices, stair),
            guard_faces,
            collection(VIS_COLLECTION_NAME),
        )
        guard_vertices, guard_faces = create_upper_stair_guard_visual_geometry(
            0.0,
            ("Upper",),
            claimed_post_positions=claimed_guard_posts,
        )
        upsert_mesh_geometry(
            f"VIS_StairGuard_{stair}_Upper",
            transform_stair_vertices(guard_vertices, stair),
            guard_faces,
            collection(VIS_COLLECTION_NAME),
        )
        guard_vertices, guard_faces = create_upper_stair_guard_collider_geometry(
            0.0,
            ("Landing",),
        )
        upsert_mesh_geometry(
            f"COL_StairGuard_{stair}_Landing",
            transform_stair_vertices(guard_vertices, stair),
            guard_faces,
            collection(COL_COLLECTION_NAME),
        )
        guard_vertices, guard_faces = create_upper_stair_guard_collider_geometry(
            0.0,
            ("Upper",),
        )
        upsert_mesh_geometry(
            f"COL_StairGuard_{stair}_Upper",
            transform_stair_vertices(guard_vertices, stair),
            guard_faces,
            collection(COL_COLLECTION_NAME),
        )
        rebuilt[f"upper_{stair.lower()}"] = 8
    return rebuilt


def create_upper_stair_visual_geometry(
    base_z: float,
    *,
    rooftop_connector: bool = False,
    southwest_floor_edge_trim: bool,
    nosing_vertices: list[tuple[float, float, float]] | None = None,
    nosing_faces: list[tuple[int, ...]] | None = None,
) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    upper_maximum_x = -6.75 if rooftop_connector else -6.60
    append_thin_steps(
        vertices,
        faces,
        (-12.6, -10.2),
        38.9,
        43.1,
        base_z,
        16,
        nosing_vertices,
        nosing_faces,
    )
    if southwest_floor_edge_trim:
        append_southwest_upper_stair_support_board(vertices, faces, base_z)
    else:
        append_stair_support_board(
            vertices,
            faces,
            (-12.6, -10.2),
            38.9,
            43.1,
            base_z,
            base_z + 2.4,
        )
    landing_face_offset = len(faces)
    append_box(
        vertices,
        faces,
        (-12.6, 43.1, base_z + 2.3),
        (upper_maximum_x, 45.5, base_z + 2.4),
    )
    if rooftop_connector:
        # 4階壁と同一平面になる踊り場東端面は壁だけが所有する。
        # ここを階段側にも残すと、階段から見た壁根元へ濃い横帯が現れる。
        del faces[landing_face_offset + 3]
    append_thin_steps(
        vertices,
        faces,
        (-9.0, upper_maximum_x),
        41.3,
        38.9,
        base_z + 2.4,
        8,
        nosing_vertices,
        nosing_faces,
    )
    if rooftop_connector:
        profile_face_offset = len(faces)
        append_profile_prism(
            vertices,
            faces,
            (-9.0, upper_maximum_x),
            (
                (43.1, base_z + 2.30),
                (41.3, base_z + 2.30),
                (38.9, base_z + 3.48),
                (38.6, base_z + 3.58),
                (38.6, base_z + 3.70),
                (38.9, base_z + 3.60),
                (41.3, base_z + 2.40),
                (43.1, base_z + 2.40),
            ),
        )
        # x=-6.75の階段側面は、4階から連続する屋上施設壁だけが所有する。
        del faces[profile_face_offset + 1]
    else:
        append_profile_prism(
            vertices,
            faces,
            (-9.0, -6.6),
            (
                (43.1, base_z + 2.30),
                (41.3, base_z + 2.30),
                (38.9, base_z + 3.48),
                (38.9, base_z + 3.60),
                (41.3, base_z + 2.40),
                (43.1, base_z + 2.40),
            ),
        )
    return vertices, faces


def create_upper_stair_collider_geometry(
    base_z: float,
    *,
    rooftop_connector: bool = False,
) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    upper_maximum_x = -6.75 if rooftop_connector else -6.60
    append_profile_prism(
        vertices,
        faces,
        (-12.6, -10.2),
        ((38.9, base_z - 0.1), (43.1, base_z + 2.3), (43.1, base_z + 2.4), (38.9, base_z)),
    )
    append_box(
        vertices,
        faces,
        (-12.6, 43.1, base_z + 2.3),
        (upper_maximum_x, 45.5, base_z + 2.4),
    )
    upper_profile = (
        (
            (43.1, base_z + 2.3),
            (41.3, base_z + 2.3),
            (38.9, base_z + 3.5),
            (38.6, base_z + 3.6),
            (38.6, base_z + 3.7),
            (38.9, base_z + 3.6),
            (41.3, base_z + 2.4),
            (43.1, base_z + 2.4),
        )
        if rooftop_connector
        else (
            (43.1, base_z + 2.3),
            (41.3, base_z + 2.3),
            (38.9, base_z + 3.5),
            (38.9, base_z + 3.6),
            (41.3, base_z + 2.4),
            (43.1, base_z + 2.4),
        )
    )
    append_profile_prism(vertices, faces, (-9.0, upper_maximum_x), upper_profile)
    return vertices, faces


def upper_stair_guard_base_segments(
    base_z: float,
    parts: tuple[str, ...] = ("Lower", "Landing", "Upper"),
    *,
    include_lower_end_cap: bool = True,
) -> list[tuple[Vector, Vector]]:
    lower_start = Vector((-10.28, 38.9, base_z))
    lower_end = Vector((-10.28, 43.1, base_z + 2.4))
    landing_corner = Vector((-8.92, 43.1, base_z + 2.4))
    upper_start = Vector((-8.92, 41.3, base_z + 2.4))
    upper_end = Vector((-8.92, 38.9, base_z + 3.6))
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
            (lower_end, landing_corner),
            (landing_corner, upper_start),
        ),
        "Upper": (
            (upper_start, upper_end),
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
            if stair == "NW" and suffix == "4FToRooftop":
                guard_parts = ("Lower", "Landing", "Upper")
            elif stair in ("NE", "SW") and suffix == "3FTo4F":
                guard_parts = ("Lower", "Landing", "Upper", "Terminal")
            else:
                guard_parts = ("Lower", "Landing", "Upper")
            has_rooftop_connector = stair == "NW" and suffix == "4FToRooftop"
            nosing_vertices: list[tuple[float, float, float]] = []
            nosing_faces: list[tuple[int, ...]] = []
            vertices, faces = create_upper_stair_visual_geometry(
                base_z,
                rooftop_connector=has_rooftop_connector,
                southwest_floor_edge_trim=stair == "SW",
                nosing_vertices=nosing_vertices,
                nosing_faces=nosing_faces,
            )
            upsert_surface_geometry(
                f"VIS_StairSystem_{stair}_{suffix}",
                transform_stair_vertices(vertices, stair),
                faces,
                visual_collection,
            )
            nosing = upsert_mesh_geometry(
                f"VIS_B03_StairNosing_{stair}_{suffix}",
                transform_stair_vertices(nosing_vertices, stair),
                nosing_faces,
                visual_collection,
            )
            nosing.data.materials.clear()
            nosing.data.materials.append(
                existing_material("MAT_B03_Atlas_Architecture")
            )
            vertices, faces = create_upper_stair_collider_geometry(
                base_z,
                rooftop_connector=has_rooftop_connector,
            )
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


def align_rooftop_stairhouse_door() -> None:
    door = bpy.data.objects.get("VIS_DoorLeaf_RooftopStairHouse_Open")
    if door is None or door.type != "MESH":
        raise RuntimeError("屋上階段室の開扉表示がありません")
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    append_box(
        vertices,
        faces,
        (-9.04, 36.60, 14.50),
        (-8.96, 38.50, 16.70),
    )
    replace_mesh_geometry(door.name, vertices, faces)


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
    align_rooftop_stairhouse_door()
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
    append_box(
        boundary_vertices,
        boundary_faces,
        (minimum.x, STAGE_BOUNDARY_SOUTH_Y, minimum.z),
        (maximum.x, maximum.y, 19.0),
    )
    replace_mesh_geometry("BND_Stage", boundary_vertices, boundary_faces)


def remove_rooftop_facility_wall_hidden_caps(obj: bpy.types.Object) -> None:
    """屋根・屋上床が所有する水平capを表示壁から取り除く。"""
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.normal_update()
    hidden_caps = [
        face
        for face in mesh.faces
        if (
            face.normal.z < -1.0 + 1.0e-5
            and face.calc_center_median().z <= 14.50 + 1.0e-5
        )
        or (
            face.normal.z > 1.0 - 1.0e-5
            and face.calc_center_median().z >= 16.90 - 1.0e-5
        )
    ]
    if not hidden_caps:
        mesh.free()
        raise RuntimeError("屋上施設表示壁から除く水平capがありません")
    bmesh.ops.delete(mesh, geom=hidden_caps, context="FACES")
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update(calc_edges=True)


def replace_rooftop_changing_floor_surface(
    object_name: str,
    top_bounds_xy: tuple[float, float, float, float],
    south_opening_x: tuple[float, float],
) -> None:
    minimum_x, minimum_y, maximum_x, maximum_y = top_bounds_xy
    opening_minimum_x, opening_maximum_x = south_opening_x
    vertices = [
        (minimum_x, minimum_y, 14.53),
        (maximum_x, minimum_y, 14.53),
        (maximum_x, maximum_y, 14.53),
        (minimum_x, maximum_y, 14.53),
        (opening_minimum_x, minimum_y, 14.50),
        (opening_maximum_x, minimum_y, 14.50),
        (opening_maximum_x, minimum_y, 14.53),
        (opening_minimum_x, minimum_y, 14.53),
    ]
    faces = [
        (0, 1, 2, 3),
        (4, 5, 6, 7),
    ]
    replace_mesh_geometry_with_oriented_faces(object_name, vertices, faces)


def rebuild_rooftop_facility_geometry() -> None:
    visual_walls = replace_existing_boxes(
        "VIS_RooftopFacilityWalls",
        list(ROOFTOP_FACILITY_WALL_BOXES),
    )
    remove_rooftop_facility_wall_hidden_caps(visual_walls)
    replace_existing_union_boxes(
        "VIS_RooftopFacilityRoofs",
        list(ROOFTOP_FACILITY_ROOF_BOXES),
    )
    replace_existing_boxes(
        "COL_RooftopFacilityShell",
        [*ROOFTOP_FACILITY_WALL_BOXES, *ROOFTOP_FACILITY_ROOF_BOXES],
    )
    replace_rooftop_changing_floor_surface(
        "VIS_Floor_RooftopChangingRoom_M",
        (-6.45, 38.50, -2.10, 45.35),
        (-5.40, -4.20),
    )
    replace_rooftop_changing_floor_surface(
        "VIS_Floor_RooftopChangingRoom_F",
        (-2.10, 38.50, 2.40, 45.35),
        (-0.90, 0.30),
    )


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


def build_spawn_semantics(semantic_collection: bpy.types.Collection) -> None:
    for (
        suffix,
        spawn_id,
        position,
        yaw_degrees,
        exclusion_id,
        exclusion_bounds,
    ) in PLAYER_SPAWN_SPECS:
        marker = create_empty(
            f"MRK_PlayerSpawn_{suffix}",
            position,
            semantic_collection,
            {
                "hs_id": spawn_id,
                "hs_role": "player_spawn",
            },
        )
        marker.empty_display_type = "ARROWS"
        marker.empty_display_size = 0.8
        marker.rotation_euler = (0.0, 0.0, math.radians(yaw_degrees))

        exclusion = create_mesh_object(
            f"VOL_PlayerSpawnExclusion_{suffix}",
            [exclusion_bounds],
            semantic_collection,
            properties={
                "hs_id": exclusion_id,
                "hs_role": "player_spawn_exclusion",
                "hs_player_spawn_id": spawn_id,
            },
        )
        exclusion.display_type = "WIRE"

    for suffix, spawn_id, bounds in NPC_SPAWN_VOLUME_SPECS:
        volume = create_mesh_object(
            f"VOL_NpcSpawn_{suffix}",
            [bounds],
            semantic_collection,
            properties={
                "hs_id": spawn_id,
                "hs_role": "npc_spawn",
            },
        )
        volume.display_type = "WIRE"

    for suffix, bias_id, player_spawn_id, weight, bounds in (
        NPC_SPAWN_BIAS_VOLUME_SPECS
    ):
        volume = create_mesh_object(
            f"VOL_NpcSpawnBias_{suffix}",
            [bounds],
            semantic_collection,
            properties={
                "hs_id": bias_id,
                "hs_role": "npc_spawn_bias",
                "hs_player_spawn_id": player_spawn_id,
                "hs_weight": weight,
            },
        )
        volume.display_type = "WIRE"

    for suffix, spawn_id, zone_id, band_id, bounds in BIT_SPAWN_VOLUME_SPECS:
        volume = create_mesh_object(
            f"VOL_BitSpawn_{suffix}",
            [bounds],
            semantic_collection,
            properties={
                "hs_id": spawn_id,
                "hs_role": "bit_spawn",
                "hs_zone_id": zone_id,
                "hs_band_id": band_id,
            },
        )
        volume.display_type = "WIRE"


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
            (46.4, 9.5, 0.0),
            (40.325, 3.425, 1.35),
            ((36.4, -0.5, 0.0), (56.4, 19.5, 2.0)),
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


def build_navigation_areas(
    semantic_collection: bpy.types.Collection,
) -> None:
    stage_minimum_x = -18.39
    stage_maximum_x = 63.19
    stage_minimum_y = -14.29
    stage_maximum_y = 51.29
    area_specs = (
        ("Ground", "school-ground", -0.49, 3.55),
        ("Upper01", "school-upper-01", 3.59999, 7.15),
        ("Upper02", "school-upper-02", 7.19999, 10.75),
        ("Upper03", "school-upper-03", 10.79999, 14.35),
        ("Roof", "school-roof", 14.39999, 19.0),
    )
    for suffix, area_id, minimum_z, maximum_z in area_specs:
        create_mesh_object(
            f"VOL_NavigationArea_{suffix}",
            [
                (
                    (stage_minimum_x, stage_minimum_y, minimum_z),
                    (stage_maximum_x, stage_maximum_y, maximum_z),
                )
            ],
            semantic_collection,
            properties={
                "hs_id": f"navigation-area-piece-{area_id}",
                "hs_role": "navigation_area",
                "hs_area_id": area_id,
            },
        )
    for index in range(len(area_specs) - 1):
        from_spec = area_specs[index]
        to_spec = area_specs[index + 1]
        create_mesh_object(
            f"PRT_NavigationArea_{index + 1:02d}",
            [
                (
                    (stage_minimum_x, stage_minimum_y, from_spec[3]),
                    (stage_maximum_x, stage_maximum_y, to_spec[2]),
                )
            ],
            semantic_collection,
            properties={
                "hs_id": f"navigation-area-portal-{index + 1:02d}",
                "hs_role": "navigation_area_portal",
                "hs_from": from_spec[1],
                "hs_to": to_spec[1],
                "hs_bidirectional": True,
            },
        )


def build_b05_location_assets(
    semantic_collection: bpy.types.Collection,
) -> dict[str, int]:
    floor_by_base_z = {
        base_z: floor_id
        for floor_id, _, _, base_z in B05_FLOOR_SPECS
    }
    area_piece_counts: dict[str, int] = {}

    def token(value: str) -> str:
        return "_".join(part.upper() for part in value.split("-"))

    def add_area_piece(
        area_id: str,
        display_name: str,
        priority: int,
        bounds: tuple[
            tuple[float, float, float],
            tuple[float, float, float],
        ],
        *,
        floor_id: str | None = None,
        elevator_id: str | None = None,
        parent: bpy.types.Object | None = None,
    ) -> bpy.types.Object:
        if (floor_id is None) == (elevator_id is None):
            raise RuntimeError(
                f"B05 Area pieceの階参照が不正です: {area_id}"
            )
        piece_index = area_piece_counts.get(area_id, 0) + 1
        area_piece_counts[area_id] = piece_index
        piece_id = f"{area_id}-piece-{piece_index:02d}"
        properties: dict[str, object] = {
            "hs_id": piece_id,
            "hs_role": "location_area",
            "hs_area_id": area_id,
            "hs_display_name": display_name,
            "hs_priority": priority,
        }
        if floor_id is not None:
            properties["hs_floor_id"] = floor_id
        else:
            properties["hs_elevator_id"] = elevator_id
        obj = create_mesh_object(
            f"VOL_LocationArea_{token(area_id)}_P{piece_index:02d}",
            [bounds],
            semantic_collection,
            properties=properties,
        )
        if parent is not None:
            obj.parent = parent
        return obj

    school_perimeter_map_boxes = (
        ((-18.3, -14.2), (63.1, -11.5)),
        ((-18.3, -11.5), (33.4, -7.0)),
        ((59.4, -11.5), (63.1, -7.0)),
        ((-18.3, -7.0), (-12.6, 26.5)),
        ((59.4, -7.0), (63.1, 26.5)),
        ((-18.3, 26.5), (-12.6, 30.5)),
        ((57.4, 26.5), (63.1, 30.5)),
        ((-18.3, 30.5), (-12.6, 32.5)),
        ((-18.3, 32.5), (-12.6, 45.5)),
        ((47.4, 32.5), (63.1, 45.5)),
        ((-18.3, 45.5), (63.1, 51.2)),
    )
    courtyard_map_boxes = (
        ((0.0, -7.0), (33.4, 26.5)),
        ((0.0, 26.5), (51.4, 30.5)),
        ((0.0, 30.5), (63.1, 32.5)),
    )
    map_boxes_by_floor = {
        "f01": (
            *school_perimeter_map_boxes,
            *courtyard_map_boxes,
            ((-12.6, -7.0), (0.0, 45.5)),
            ((0.0, 32.5), (47.4, 45.5)),
            ((33.4, -11.5), (59.4, 26.5)),
            ((51.4, 26.5), (57.4, 30.5)),
        ),
        "f02": (
            ((-12.6, -7.0), (0.0, 45.5)),
            ((0.0, 32.5), (47.4, 45.5)),
            ((39.3, 26.6), (43.5, 32.65)),
            ((33.6, -11.35), (36.6, -2.0)),
            ((56.2, -11.35), (59.2, -2.0)),
            ((33.6, -2.0), (34.8, 26.4)),
            ((58.0, -2.0), (59.2, 26.4)),
            ((34.8, 25.0), (58.0, 26.6)),
        ),
        "f03": (
            ((-12.6, -7.0), (0.0, 45.5)),
            ((0.0, 32.5), (47.4, 45.5)),
            ((33.0, -11.7), (59.6, 26.5)),
            ((39.4, 26.5), (43.4, 32.5)),
        ),
        "f04": (
            ((-12.6, -7.0), (0.0, 45.5)),
            ((0.0, 32.5), (47.4, 45.5)),
        ),
        "roof": (
            ((-12.6, -6.7), (0.0, 32.5)),
            ((-12.6, 32.5), (47.4, 45.5)),
            ((0.0, 11.3), (0.4, 13.7)),
        ),
    }
    for floor_id, display_name, order, base_z in B05_FLOOR_SPECS:
        map_z = base_z + 0.08
        create_mesh_object(
            f"MAP_{floor_id.upper()}",
            [
                (
                    (minimum[0], minimum[1], map_z),
                    (maximum[0], maximum[1], map_z + 0.02),
                )
                for minimum, maximum in map_boxes_by_floor[floor_id]
            ],
            semantic_collection,
            properties={
                "hs_id": f"floor-map-{floor_id}",
                "hs_role": "floor_map",
                "hs_floor_id": floor_id,
                "hs_display_name": display_name,
                "hs_order": order,
            },
        )
        create_mesh_object(
            f"MAP_Barrier_{floor_id.upper()}",
            [
                (
                    (minimum[0], minimum[1], map_z + 0.04),
                    (maximum[0], maximum[1], map_z + 0.06),
                )
                for minimum, maximum in B06_MAP_BARRIER_BOXES_XY_BY_FLOOR[
                    floor_id
                ]
            ],
            semantic_collection,
            properties={
                "hs_id": f"minimap-barrier-{floor_id}",
                "hs_role": "map_barrier",
                "hs_floor_id": floor_id,
            },
        )
        create_mesh_object(
            f"MAP_Passage_{floor_id.upper()}",
            [
                (
                    (minimum[0], minimum[1], map_z + 0.08),
                    (maximum[0], maximum[1], map_z + 0.10),
                )
                for minimum, maximum in B06_MAP_PASSAGE_BOXES_XY_BY_FLOOR[
                    floor_id
                ]
            ],
            semantic_collection,
            properties={
                "hs_id": f"minimap-passage-{floor_id}",
                "hs_role": "map_passage",
                "hs_floor_id": floor_id,
            },
        )

    room_by_id = {room.room_id: room for room in ROOM_VARIANT_SPECS}
    if set(room_by_id) != set(B05_ROOM_DISPLAY_NAMES):
        raise RuntimeError("B05の20室IDがRoom Variant正本と一致しません")
    for room_id, display_name in B05_ROOM_DISPLAY_NAMES.items():
        room = room_by_id[room_id]
        minimum_x, maximum_x, minimum_y, maximum_y = room.bounds_xy
        floor_id = floor_by_base_z[room.base_z]
        add_area_piece(
            f"area-room-{room_id}",
            display_name,
            300,
            (
                (minimum_x, minimum_y, room.base_z - 0.2),
                (maximum_x, maximum_y, room.base_z + 3.4),
            ),
            floor_id=floor_id,
        )

    for floor_id, _, _, base_z in B05_FLOOR_SPECS[:4]:
        for sex, display_name, minimum_x, maximum_x in (
            ("male", "男子トイレ", -6.6, -2.1),
            ("female", "女子トイレ", -2.1, 2.4),
        ):
            add_area_piece(
                f"area-toilet-{sex}-{floor_id}",
                display_name,
                300,
                (
                    (minimum_x, 38.5, base_z - 0.2),
                    (maximum_x, 45.5, base_z + 3.4),
                ),
                floor_id=floor_id,
            )

    for floor_id, (minimum_z, maximum_z) in B05_COMMON_Z_BANDS.items():
        add_area_piece(
            f"area-common-{floor_id}",
            "廊下・共用部",
            100,
            (
                (-18.39, -14.29, minimum_z),
                (63.19, 51.29, maximum_z),
            ),
            floor_id=floor_id,
        )

    stair_names = {"nw": "北西", "ne": "北東", "sw": "南西"}
    floor_labels = {floor_id: label for floor_id, label, _, _ in B05_FLOOR_SPECS}
    school_stair_transitions = {
        "nw": (("f01", "f02"), ("f02", "f03"), ("f03", "f04"), ("f04", "roof")),
        "ne": (("f01", "f02"), ("f02", "f03"), ("f03", "f04")),
        "sw": (("f01", "f02"), ("f02", "f03"), ("f03", "f04")),
    }
    base_z_by_floor = {
        floor_id: base_z for floor_id, _, _, base_z in B05_FLOOR_SPECS
    }
    for stair_id, transitions in school_stair_transitions.items():
        minimum_x, maximum_x, minimum_y, maximum_y = B05_STAIR_BOUNDS_XY[
            stair_id
        ]
        for transition_index, (lower_floor, upper_floor) in enumerate(transitions):
            base_z = base_z_by_floor[lower_floor]
            upper_z = base_z_by_floor[upper_floor]
            owned_upper_z = (
                upper_z
                if transition_index == len(transitions) - 1
                else upper_z - 0.00001
            )
            switch_z = base_z + 2.4
            area_id = f"area-stair-{stair_id}-{lower_floor}-{upper_floor}"
            display_name = (
                f"{floor_labels[lower_floor]}-{floor_labels[upper_floor]} "
                f"{stair_names[stair_id]}階段"
            )
            add_area_piece(
                area_id,
                display_name,
                250,
                (
                    (minimum_x, minimum_y, base_z),
                    (maximum_x, maximum_y, switch_z),
                ),
                floor_id=lower_floor,
            )
            add_area_piece(
                area_id,
                display_name,
                250,
                (
                    (minimum_x, minimum_y, switch_z),
                    (maximum_x, maximum_y, owned_upper_z),
                ),
                floor_id=upper_floor,
            )

    for side, bounds in (
        ("west", ((33.6, -11.35, 0.0), (36.6, -2.0, 5.25))),
        ("east", ((56.2, -11.35, 0.0), (59.2, -2.0, 5.25))),
    ):
        area_id = f"area-stair-gym-{side}-f01-f02"
        display_name = f"1F-2F 体育館{'西' if side == 'west' else '東'}階段"
        add_area_piece(
            area_id,
            display_name,
            250,
            (bounds[0], (bounds[1][0], bounds[1][1], 2.55)),
            floor_id="f01",
        )
        add_area_piece(
            area_id,
            display_name,
            250,
            ((bounds[0][0], bounds[0][1], 2.55), bounds[1]),
            floor_id="f02",
        )

    courtyard_boxes = tuple(
        (
            (minimum[0], minimum[1], -0.49),
            (maximum[0], maximum[1], 2.4),
        )
        for minimum, maximum in courtyard_map_boxes
    )
    for bounds in courtyard_boxes:
        add_area_piece(
            "area-courtyard",
            "校庭",
            200,
            bounds,
            floor_id="f01",
        )

    for minimum, maximum in school_perimeter_map_boxes:
        add_area_piece(
            "area-school-perimeter",
            "校舎外周",
            200,
            (
                (minimum[0], minimum[1], -0.49),
                (maximum[0], maximum[1], 2.4),
            ),
            floor_id="f01",
        )

    for bounds in (
        ((33.4, -11.5, -0.49), (59.4, 26.5, 2.4)),
        ((51.4, 26.5, -0.49), (57.4, 30.5, 2.4)),
    ):
        add_area_piece(
            "area-gym", "体育館", 200, bounds, floor_id="f01"
        )

    gallery_boxes = (
        ((33.6, -2.0, 3.4), (34.8, 26.4, 6.0)),
        ((58.0, -2.0, 3.4), (59.2, 26.4, 6.0)),
        ((34.8, 25.0, 3.4), (39.1, 26.6, 6.0)),
        ((39.1, 25.0, 3.4), (43.7, 26.6, 6.0)),
        ((43.7, 25.0, 3.4), (58.0, 26.6, 6.0)),
    )
    for bounds in gallery_boxes:
        add_area_piece(
            "area-gym-gallery",
            "体育館ギャラリー",
            200,
            bounds,
            floor_id="f02",
        )

    for bounds in (
        ((33.0, -11.7, 9.3), (59.6, 26.7, 13.2)),
        ((39.4, 26.5, 7.0), (43.4, 32.5, 9.6)),
    ):
        add_area_piece(
            "area-gym-rooftop",
            "体育館屋上",
            200,
            bounds,
            floor_id="f03",
        )

    for bounds in (
        ((-12.6, -6.7, 13.2), (0.0, 32.5, 19.0)),
        ((-12.6, 32.5, 13.2), (47.4, 45.5, 19.0)),
        ((-4.1, 11.3, 14.35), (0.4, 13.7, 19.0)),
    ):
        add_area_piece(
            "area-school-rooftop",
            "校舎屋上",
            200,
            bounds,
            floor_id="roof",
        )

    add_area_piece(
        "area-poolside",
        "プールサイド",
        300,
        ((10.0, 34.0, 14.3), (36.4, 44.0, 19.0)),
        floor_id="roof",
    )
    add_area_piece(
        "area-changing-room",
        "更衣室",
        300,
        ((-6.45, 38.5, 14.35), (2.4, 45.5, 17.0)),
        floor_id="roof",
    )

    elevator_car = bpy.data.objects.get("MRK_ElevatorCar_School")
    if elevator_car is None or elevator_car.type != "EMPTY":
        raise RuntimeError("B05エレベーターAreaの親がありません")
    add_area_piece(
        "area-elevator",
        "エレベーター",
        400,
        ((-0.92, -0.78, 0.12), (0.92, 0.72, 2.18)),
        elevator_id="school-elevator",
        parent=elevator_car,
    )

    mission_specs: dict[
        str,
        tuple[str, str, str, tuple[float, float, float]],
    ] = {}
    for location_id, anchor in B05_ROOM_ANCHORS.items():
        room = room_by_id[location_id]
        mission_specs[location_id] = (
            f"area-room-{location_id}",
            floor_by_base_z[room.base_z],
            B05_ROOM_DISPLAY_NAMES[location_id],
            anchor,
        )
    mission_specs.update(
        {
            "gym": ("area-gym", "f01", "体育館", (46.4, 9.5, 0.05)),
            "courtyard": (
                "area-courtyard",
                "f01",
                "校庭",
                (16.7, 14.5, -0.25),
            ),
            "gym-rooftop": (
                "area-gym-rooftop",
                "f03",
                "体育館屋上",
                (46.4, 9.5, 9.6),
            ),
            "rooftop": (
                "area-school-rooftop",
                "roof",
                "校舎屋上",
                (-7.8, 37.8, 14.5),
            ),
            "rooftop-poolside": (
                "area-poolside",
                "roof",
                "屋上プールサイド",
                (12.0, 39.0, 15.65),
            ),
        }
    )
    if tuple(mission_specs) != B05_MISSION_LOCATION_IDS:
        raise RuntimeError("B05 Mission Locationの順序またはIDが不正です")
    for location_id, (area_id, floor_id, display_name, anchor) in (
        mission_specs.items()
    ):
        anchor_id = f"mission-anchor-{location_id}"
        volume_id = f"mission-location-volume-{location_id}"
        create_empty(
            f"MRK_MissionAnchor_{token(location_id)}",
            anchor,
            semantic_collection,
            {
                "hs_id": anchor_id,
                "hs_role": "mission_anchor",
                "hs_location_id": location_id,
            },
        )
        create_mesh_object(
            f"VOL_MissionLocation_{token(location_id)}",
            [
                (
                    (
                        anchor[0] - 1.0,
                        anchor[1] - 1.0,
                        max(anchor[2] - 0.25, -0.49),
                    ),
                    (anchor[0] + 1.0, anchor[1] + 1.0, anchor[2] + 2.35),
                )
            ],
            semantic_collection,
            properties={
                "hs_id": volume_id,
                "hs_role": "mission_location",
                "hs_location_id": location_id,
                "hs_area_id": area_id,
                "hs_floor_id": floor_id,
                "hs_display_name": display_name,
                "hs_anchor_id": anchor_id,
            },
        )

    for stair_id, floor_id, position, direction in B05_STAIR_LANDING_SPECS:
        landing_id = f"stair-landing-{stair_id}-{floor_id}"
        create_empty(
            f"MRK_MapStairLanding_{token(stair_id)}_{floor_id.upper()}",
            position,
            semantic_collection,
            {
                "hs_id": landing_id,
                "hs_role": "map_stair_landing",
                "hs_stair_id": f"stair-{stair_id}",
                "hs_floor_id": floor_id,
                "hs_direction": direction,
            },
        )

    for floor_id, base_z, available, stop_id in B05_ELEVATOR_LANDING_SPECS:
        properties: dict[str, object] = {
            "hs_id": f"elevator-landing-{floor_id}",
            "hs_role": "map_elevator_landing",
            "hs_elevator_id": "school-elevator",
            "hs_floor_id": floor_id,
            "hs_available": available,
        }
        if stop_id is not None:
            properties["hs_stop_id"] = stop_id
        create_empty(
            f"MRK_MapElevatorLanding_{floor_id.upper()}",
            (-8.2, ELEVATOR_CENTER_Y, base_z),
            semantic_collection,
            properties,
        )

    broadcast_console_id = "broadcast-console-school"
    broadcast_target_id = "broadcast-console-target-school"
    create_empty(
        "MRK_BroadcastConsole_School",
        (18.8, 41.2, 3.65),
        semantic_collection,
        {
            "hs_id": broadcast_console_id,
            "hs_role": "broadcast_console",
            "hs_floor_id": "f02",
            "hs_display_name": "放送卓",
            "hs_target_id": broadcast_target_id,
        },
    )
    create_mesh_object(
        "VOL_BroadcastConsoleTarget_School",
        [((18.0, 41.54, 3.6), (19.6, 41.59, 4.69))],
        semantic_collection,
        properties={
            "hs_id": broadcast_target_id,
            "hs_role": "broadcast_console_target",
            "hs_console_id": broadcast_console_id,
        },
    )

    if len(area_piece_counts) != 53:
        raise RuntimeError(
            f"B06-4論理Areaが53件ではありません: {len(area_piece_counts)}"
        )
    result = {
        "floor_maps": len(B05_FLOOR_SPECS),
        "minimap_barriers": len(B06_MAP_BARRIER_BOXES_XY_BY_FLOOR),
        "minimap_passages": len(B06_MAP_PASSAGE_BOXES_XY_BY_FLOOR),
        "logical_areas": len(area_piece_counts),
        "area_pieces": sum(area_piece_counts.values()),
        "mission_locations": len(mission_specs),
        "stair_landings": len(B05_STAIR_LANDING_SPECS),
        "elevator_landings": len(B05_ELEVATOR_LANDING_SPECS),
        "broadcast_consoles": 1,
    }
    bpy.context.scene["b05_location_assets_result"] = json.dumps(
        result, ensure_ascii=False, sort_keys=True
    )
    return result


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

        courtyard_north_units = (
            (2, 4, 1)
            if floor == 1
            else (4, 4, 3)
            if floor in (2, 3)
            else (4, 4, 4)
        )
        courtyard_north_centers = (
            (9.550, 23.700, 35.750)
            if floor in (2, 3)
            else (9.550, 23.700, 37.850)
        )
        for index, (center, unit_count) in enumerate(
            zip(courtyard_north_centers, courtyard_north_units), start=1
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
        ("Gym_East_01", "GymEast", "Y", 59.4, -4.425, (1, 0, 0)),
        ("Gym_East_02", "GymEast", "Y", 59.4, 7.500, (1, 0, 0)),
        ("Gym_East_03", "GymEast", "Y", 59.4, 19.425, (1, 0, 0)),
        ("Gym_West_01", "GymWest", "Y", 33.4, -4.425, (-1, 0, 0)),
        ("Gym_West_02", "GymWest", "Y", 33.4, 7.500, (-1, 0, 0)),
        ("Gym_West_03", "GymWest", "Y", 33.4, 19.425, (-1, 0, 0)),
    )
    for label, wall, axis, fixed, horizontal, outward in gym_entries:
        append(0, 0.0, label, wall, axis, fixed, horizontal, outward, 4, GYM_WINDOW_CLEAR_HEIGHT, WINDOW_UNIT_CLEAR_WIDTH, 7.1)
    unknown_open_windows = set(OPEN_WINDOW_UNITS) - {spec.suffix for spec in specs}
    if unknown_open_windows:
        raise RuntimeError(f"存在しない窓帯へ開放指定があります: {sorted(unknown_open_windows)}")
    corridor03_specs = {
        spec.suffix: spec
        for spec in specs
        if spec.suffix
        in {
            "F02_CourtyardNorth_Corridor_03",
            "F03_CourtyardNorth_Corridor_03",
        }
    }
    for suffix in (
        "F02_CourtyardNorth_Corridor_03",
        "F03_CourtyardNorth_Corridor_03",
    ):
        spec = corridor03_specs[suffix]
        clear_east = (
            spec.horizontal_center + window_clear_width(spec) / 2
        )
        frame_east = clear_east + WINDOW_FRAME_BORDER
        if (
            spec.unit_count != 3
            or abs(spec.horizontal_center - 35.75) > 1.0e-9
            or abs(clear_east - 39.35) > 1.0e-9
            or abs(frame_east - 39.40) > 1.0e-9
        ):
            raise RuntimeError(
                f"中庭北廊下03窓の東端契約が不正です: "
                f"{suffix}/{spec.unit_count}/{clear_east}/{frame_east}"
            )
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


def storey_common_space_polygons(
    floor: int,
) -> tuple[tuple[tuple[float, float], ...], ...]:
    if floor not in (1, 2, 3, 4):
        raise RuntimeError(f"階層色帯の階が不正です: {floor}")
    return STOREY_COMMON_SPACE_POLYGONS_XY


def storey_band_source_objects(floor: int) -> tuple[bpy.types.Object, ...]:
    targets = set(b06_wall_join_target_objects("VIS_"))
    shaft_shell = bpy.data.objects.get("VIS_B03_ElevatorShaftShell")
    if shaft_shell is not None and shaft_shell.type == "MESH":
        targets.add(shaft_shell)
    return tuple(sorted(targets, key=lambda obj: obj.name))


def merge_storey_band_intervals(
    intervals: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    merged: list[list[float]] = []
    for minimum, maximum in sorted(intervals):
        if maximum - minimum <= 1.0e-4:
            continue
        if not merged or minimum > merged[-1][1] + 0.01:
            merged.append([minimum, maximum])
        else:
            merged[-1][1] = max(merged[-1][1], maximum)
    return [(minimum, maximum) for minimum, maximum in merged]


def storey_band_wall_support_covers(
    target: tuple[float, float],
    support_intervals: list[tuple[float, float]],
) -> bool:
    cursor = target[0]
    for minimum, maximum in merge_storey_band_intervals(support_intervals):
        clipped_minimum = max(target[0], minimum)
        clipped_maximum = min(target[1], maximum)
        if clipped_maximum - clipped_minimum <= 1.0e-4:
            continue
        if clipped_minimum > cursor + 1.0e-4:
            return False
        cursor = max(cursor, clipped_maximum)
        if cursor >= target[1] - 1.0e-4:
            return True
    return cursor >= target[1] - 1.0e-4


def close_storey_band_wall_seams(
    intervals_by_face: dict[
        tuple[str, float, int, tuple[int, ...]], list[tuple[float, float]]
    ],
    wall_support_by_face: dict[
        tuple[str, float, int], list[tuple[float, float]]
    ],
) -> dict[tuple[str, float, int, tuple[int, ...]], list[tuple[float, float]]]:
    """実壁が連続する壁厚seamを閉じ、直交runの見える角まで帯を延長する。"""
    maximum_seam = WALL_THICKNESS + 0.01
    baseline = {
        key: merge_storey_band_intervals(intervals)
        for key, intervals in intervals_by_face.items()
    }
    additions: dict[
        tuple[str, float, int, tuple[int, ...]], list[tuple[float, float]]
    ] = {}
    records = tuple(baseline.items())
    for key, intervals in records:
        axis, face, direction, space_indices = key
        support = wall_support_by_face.get((axis, face, direction), [])
        for first, second in zip(intervals, intervals[1:]):
            gap = (first[1], second[0])
            if (
                1.0e-4 < gap[1] - gap[0] <= maximum_seam + 1.0e-5
                and storey_band_wall_support_covers(gap, support)
            ):
                additions.setdefault(key, []).append(gap)

        # 追加済み区間の端点を次の起点にはしない。各延長は必ず初期runの
        # 端点から直接0.31m以内であり、全長を同じ向きの実壁が支持する。
        for endpoint in {
            value for interval in intervals for value in (interval[0], interval[1])
        }:
            for other_key, other_intervals in records:
                other_axis, other_face, _other_direction, other_spaces = other_key
                if other_axis == axis or not set(space_indices) & set(other_spaces):
                    continue
                extension = tuple(sorted((endpoint, other_face)))
                if not (
                    1.0e-4
                    < extension[1] - extension[0]
                    <= maximum_seam + 1.0e-5
                    and any(
                        minimum - 1.0e-5 <= face <= maximum + 1.0e-5
                        for minimum, maximum in other_intervals
                    )
                    and storey_band_wall_support_covers(extension, support)
                ):
                    continue
                additions.setdefault(key, []).append(extension)

    return {
        key: merge_storey_band_intervals(
            [*intervals, *additions.get(key, ())]
        )
        for key, intervals in baseline.items()
    }


def point_is_in_polygon_xy(
    point_x: float,
    point_y: float,
    polygon: tuple[tuple[float, float], ...],
) -> bool:
    inside = False
    previous_x, previous_y = polygon[-1]
    for current_x, current_y in polygon:
        edge_x = current_x - previous_x
        edge_y = current_y - previous_y
        cross = (
            (point_x - previous_x) * edge_y
            - (point_y - previous_y) * edge_x
        )
        if (
            abs(cross) <= 1.0e-8
            and min(previous_x, current_x) - 1.0e-8
            <= point_x
            <= max(previous_x, current_x) + 1.0e-8
            and min(previous_y, current_y) - 1.0e-8
            <= point_y
            <= max(previous_y, current_y) + 1.0e-8
        ):
            return True
        intersects = (current_y > point_y) != (previous_y > point_y)
        if intersects:
            intersection_x = previous_x + (
                (point_y - previous_y) * edge_x / edge_y
            )
            if point_x < intersection_x:
                inside = not inside
        previous_x, previous_y = current_x, current_y
    return inside


def point_is_in_storey_common_space(
    point_x: float,
    point_y: float,
    common_space_polygons: tuple[tuple[tuple[float, float], ...], ...],
) -> bool:
    return any(
        point_is_in_polygon_xy(point_x, point_y, polygon)
        for polygon in common_space_polygons
    )


def storey_common_space_indices(
    point_x: float,
    point_y: float,
    common_space_polygons: tuple[tuple[tuple[float, float], ...], ...],
) -> tuple[int, ...]:
    # 矩形群は形状分割の都合で複数Polygonだが、校内の廊下・階段踊り場・
    # エレベーターホールは扉や開口で相互に接続された一つの共用空間である。
    # Polygon番号を空間IDにすると校舎接合角で帯が壁厚ぶん途切れるため、
    # 包含Polygonが一つでもあれば同じ意味空間IDを返す。
    return (
        (0,)
        if any(
            point_is_in_polygon_xy(point_x, point_y, polygon)
            for polygon in common_space_polygons
        )
        else ()
    )


def storey_band_wall_face_intervals(
    axis: str,
    minimum_fixed: float,
    maximum_fixed: float,
    minimum_along: float,
    maximum_along: float,
    common_space_polygons: tuple[tuple[tuple[float, float], ...], ...],
) -> tuple[tuple[float, int, float, float, tuple[int, ...]], ...]:
    breakpoints = {minimum_along, maximum_along}
    for polygon in common_space_polygons:
        for point_x, point_y in polygon:
            coordinate = point_y if axis == "X" else point_x
            if minimum_along < coordinate < maximum_along:
                breakpoints.add(coordinate)

    intervals = []
    ordered = sorted(breakpoints)
    for segment_minimum, segment_maximum in zip(ordered, ordered[1:]):
        if segment_maximum - segment_minimum <= 1.0e-4:
            continue
        midpoint = (segment_minimum + segment_maximum) / 2.0
        if axis == "X":
            minimum_side_spaces = storey_common_space_indices(
                minimum_fixed - 0.02,
                midpoint,
                common_space_polygons,
            )
            maximum_side_spaces = storey_common_space_indices(
                maximum_fixed + 0.02,
                midpoint,
                common_space_polygons,
            )
        else:
            minimum_side_spaces = storey_common_space_indices(
                midpoint,
                minimum_fixed - 0.02,
                common_space_polygons,
            )
            maximum_side_spaces = storey_common_space_indices(
                midpoint,
                maximum_fixed + 0.02,
                common_space_polygons,
            )
        if minimum_side_spaces:
            intervals.append(
                (
                    minimum_fixed,
                    -1,
                    segment_minimum,
                    segment_maximum,
                    minimum_side_spaces,
                )
            )
        if maximum_side_spaces:
            intervals.append(
                (
                    maximum_fixed,
                    1,
                    segment_minimum,
                    segment_maximum,
                    maximum_side_spaces,
                )
            )
    return tuple(intervals)


def storey_band_wall_footprints(
    obj: bpy.types.Object,
    band_z0: float,
    band_z1: float,
) -> tuple[tuple[Vector, Vector], ...]:
    vertical_intervals_by_footprint: dict[
        tuple[float, float, float, float], list[tuple[float, float]]
    ] = {}
    for minimum, maximum in mesh_component_world_bounds(obj):
        extent_x = maximum.x - minimum.x
        extent_y = maximum.y - minimum.y
        if not (
            min(extent_x, extent_y) <= WALL_THICKNESS + 0.21
            and max(extent_x, extent_y) > 0.1
        ):
            continue
        footprint = (
            round(minimum.x, 4),
            round(maximum.x, 4),
            round(minimum.y, 4),
            round(maximum.y, 4),
        )
        vertical_intervals_by_footprint.setdefault(footprint, []).append(
            (minimum.z, maximum.z)
        )

    footprints = []
    for (minimum_x, maximum_x, minimum_y, maximum_y), vertical_intervals in (
        sorted(vertical_intervals_by_footprint.items())
    ):
        merged_vertical_intervals = merge_storey_band_intervals(vertical_intervals)
        if not any(
            minimum_z <= band_z0 + 1.0e-5
            and maximum_z >= band_z1 - 1.0e-5
            for minimum_z, maximum_z in merged_vertical_intervals
        ):
            continue
        footprints.append(
            (
                Vector((minimum_x, minimum_y, band_z0)),
                Vector((maximum_x, maximum_y, band_z1)),
            )
        )
    return tuple(footprints)


def storey_band_boxes(
    floor: int,
    base_z: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    # 窓下の実壁は高さ0.20mなので、全壁面に連続して収まる高さへ統一する。
    band_z0, band_z1 = base_z + 0.08, base_z + 0.18
    common_space_polygons = storey_common_space_polygons(floor)
    intervals_by_face: dict[
        tuple[str, float, int, tuple[int, ...]], list[tuple[float, float]]
    ] = {}
    wall_support_by_face: dict[
        tuple[str, float, int], list[tuple[float, float]]
    ] = {}

    for obj in storey_band_source_objects(floor):
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for polygon in obj.data.polygons:
            points = [
                obj.matrix_world @ obj.data.vertices[index].co
                for index in polygon.vertices
            ]
            minimum_x = min(point.x for point in points)
            maximum_x = max(point.x for point in points)
            minimum_y = min(point.y for point in points)
            maximum_y = max(point.y for point in points)
            minimum_z = min(point.z for point in points)
            maximum_z = max(point.z for point in points)
            if (
                minimum_z > band_z0 + 1.0e-5
                or maximum_z < band_z1 - 1.0e-5
            ):
                continue
            world_normal = (normal_matrix @ polygon.normal).normalized()
            if maximum_x - minimum_x <= 1.0e-5:
                axis = "X"
                face = (minimum_x + maximum_x) / 2.0
                direction = -1 if world_normal.x < 0.0 else 1
                interval_minimum = minimum_y
                interval_maximum = maximum_y
            elif maximum_y - minimum_y <= 1.0e-5:
                axis = "Y"
                face = (minimum_y + maximum_y) / 2.0
                direction = -1 if world_normal.y < 0.0 else 1
                interval_minimum = minimum_x
                interval_maximum = maximum_x
            else:
                continue
            if interval_maximum - interval_minimum <= 1.0e-4:
                continue
            wall_support_by_face.setdefault(
                (axis, round(face, 4), direction),
                [],
            ).append((interval_minimum, interval_maximum))
            # 統合後の壁面は複数の共用空間境界をまたぐことがある。面全体の
            # 中点一つで判定すると、廊下側の一部が欠落するため、共用空間
            # 輪郭の全境界で区間を分割してから各区間の法線側を判定する。
            for (
                interval_face,
                interval_direction,
                segment_minimum,
                segment_maximum,
                space_indices,
            ) in storey_band_wall_face_intervals(
                axis,
                face,
                face,
                interval_minimum,
                interval_maximum,
                common_space_polygons,
            ):
                if interval_direction != direction:
                    continue
                key = (
                    axis,
                    round(interval_face, 4),
                    interval_direction,
                    space_indices,
                )
                intervals_by_face.setdefault(key, []).append(
                    (segment_minimum, segment_maximum)
                )

    intervals_by_face = close_storey_band_wall_seams(
        intervals_by_face,
        wall_support_by_face,
    )
    boxes = []
    band_records = []
    for (
        axis,
        face,
        direction,
        space_indices,
    ), intervals in sorted(intervals_by_face.items()):
        for minimum, maximum in merge_storey_band_intervals(intervals):
            if axis == "X":
                x0, x1 = (
                    (face - 0.012, face - 0.002)
                    if direction < 0
                    else (face + 0.002, face + 0.012)
                )
                boxes.append(((x0, minimum, band_z0), (x1, maximum, band_z1)))
                band_records.append(
                    (
                        axis,
                        face,
                        direction,
                        minimum,
                        maximum,
                        x0,
                        x1,
                        space_indices,
                    )
                )
            else:
                y0, y1 = (
                    (face - 0.012, face - 0.002)
                    if direction < 0
                    else (face + 0.002, face + 0.012)
                )
                boxes.append(((minimum, y0, band_z0), (maximum, y1, band_z1)))
                band_records.append(
                    (
                        axis,
                        face,
                        direction,
                        minimum,
                        maximum,
                        y0,
                        y1,
                        space_indices,
                    )
                )

    corner_boxes = set()
    x_records = [record for record in band_records if record[0] == "X"]
    y_records = [record for record in band_records if record[0] == "Y"]
    for x_record in x_records:
        (
            _,
            x_face,
            x_direction,
            x_minimum_y,
            x_maximum_y,
            x0,
            x1,
            x_space_indices,
        ) = x_record
        for y_record in y_records:
            (
                _,
                y_face,
                y_direction,
                y_minimum_x,
                y_maximum_x,
                y0,
                y1,
                y_space_indices,
            ) = y_record
            x_endpoint_y = min(
                (x_minimum_y, x_maximum_y),
                key=lambda value: abs(value - y_face),
            )
            y_endpoint_x = min(
                (y_minimum_x, y_maximum_x),
                key=lambda value: abs(value - x_face),
            )
            if (
                abs(y_face - x_endpoint_y) > 0.021
                or abs(x_face - y_endpoint_x) > 0.021
            ):
                continue
            if not set(x_space_indices) & set(y_space_indices):
                continue
            minimum_x, maximum_x = sorted((x0, x1))
            minimum_y, maximum_y = sorted((y0, y1))
            x_extension_far_y = None
            if x_endpoint_y < minimum_y - 1.0e-4:
                x_extension_far_y = maximum_y
            elif x_endpoint_y > maximum_y + 1.0e-4:
                x_extension_far_y = minimum_y
            y_extension_near_x = None
            if y_endpoint_x < minimum_x - 1.0e-4:
                y_extension_near_x = maximum_x
            elif y_endpoint_x > maximum_x + 1.0e-4:
                y_extension_near_x = minimum_x
            if x_extension_far_y is not None:
                corner_boxes.add(
                    (
                        (
                            round(minimum_x, 6),
                            round(min(x_endpoint_y, x_extension_far_y), 6),
                            round(band_z0, 6),
                        ),
                        (
                            round(maximum_x, 6),
                            round(max(x_endpoint_y, x_extension_far_y), 6),
                            round(band_z1, 6),
                        ),
                    )
                )
            if y_extension_near_x is not None:
                corner_boxes.add(
                    (
                        (
                            round(min(y_endpoint_x, y_extension_near_x), 6),
                            round(minimum_y, 6),
                            round(band_z0, 6),
                        ),
                        (
                            round(max(y_endpoint_x, y_extension_near_x), 6),
                            round(maximum_y, 6),
                            round(band_z1, 6),
                        ),
                    )
                )
    boxes.extend(sorted(corner_boxes))
    if not boxes:
        raise RuntimeError(f"{floor}階の廊下・階段側階層色帯を生成できません")
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
        "WestOuter": ("Y", -12.6, -7.0, 45.5),
        "North": ("X", 45.5, -12.6, 47.4),
        "East": ("Y", 47.4, 32.5, 45.5),
        "CourtyardNorth": ("X", 32.5, 0.0, 47.4),
        "CourtyardWest": ("Y", 0.0, -7.0, 32.5),
        "South": ("X", -7.0, -12.6, 0.0),
    }
    floor_ranges = {1: (0.0, 3.6), 2: (3.6, 7.2), 3: (7.2, 10.8), 4: (10.8, 14.4)}
    door_openings = {
        (1, "North"): [(2.4, 5.4, 0.0, 2.4)],
        (1, "CourtyardNorth"): [
            (0.15, 5.4, 0.0, 2.4),
            (39.4, 43.4, 0.0, 2.4),
            (39.4, 43.4, 3.45, 3.6),
        ],
        (1, "CourtyardWest"): [(-2.5, 2.5, 0.0, 2.4)],
        (2, "CourtyardNorth"): [(39.4, 43.4, 3.6, 6.6)],
        (3, "CourtyardNorth"): [(39.4, 43.4, 7.2, 9.6)],
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
                "X", 45.5, -12.45, 2.40, 14.4, 16.9, rooftop_stair_openings
            )
            rooftop_stair_boxes.extend(
                wall_boxes(
                    "Y", -12.6, 38.90, 45.50, 14.4, 16.9, []
                )
            )
            visual_boxes.extend(rooftop_stair_boxes)
            collider_boxes.extend(rooftop_stair_boxes)
        omitted_visual_faces = frozenset(
            (
                *((0,) if floor > 1 else ()),
                *((1,) if floor < 4 else ()),
            )
        )
        create_open_box_mesh_object(
            f"VIS_B03_ExteriorWalls_F{floor:02d}",
            visual_boxes,
            omitted_visual_faces,
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
        "GymEast": ("Y", 59.4, -11.5, 26.5, []),
        "GymWest": ("Y", 33.4, -11.5, 26.5, [(5.0, 8.0, 0.0, 2.4)]),
        "GymNorth": (
            "X",
            26.5,
            33.4,
            59.4,
            [
                (39.4, 43.4, 0.0, 2.4),
                (53.65, 55.15, 0.0, 2.3),
                (39.4, 43.4, 3.45, 3.6),
                (39.4, 43.4, 3.6, 6.6),
                (39.4, 43.4, 7.2, 9.0),
            ],
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
        "West": (
            *(UPPER_FLOOR_PANELS_XY[index] for index in (0, 1, 3)),
            *WEST_EXTENSION_FLOOR_PANELS_XY,
        ),
        "North": tuple(UPPER_FLOOR_PANELS_XY[index] for index in (2, 4)),
    }
    for wing, panels in first_floor_structure_groups.items():
        boxes = interfloor_structure_boxes(3.6, panels)
        create_open_box_mesh_object(
            f"VIS_B03_InterfloorStructure_F01_{wing}",
            boxes,
            frozenset((1,)),
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
        visual_floor_boxes = floor_finish_boxes(
            base_z,
            (
                F02_VISUAL_FLOOR_PANELS_XY
                if floor == 2
                else UPPER_FLOOR_PANELS_XY
            ),
        )
        create_floor_finish_visual_mesh_object(
            f"VIS_B03_Floor_F{floor:02d}",
            visual_floor_boxes,
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
            create_open_box_mesh_object(
                f"VIS_B03_Ceiling_F{floor:02d}",
                ceiling_boxes,
                frozenset((1,)),
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

    # 階段室から見える床スラブ側面だけを壁色で閉じる。
    # 上面・下面を生成しないため、表示床との共面重複は発生しない。
    stair_floor_edge_bases = (3.6, 7.2, 10.8)
    south_surfaces = tuple(
        surface
        for base_z in stair_floor_edge_bases
        for surface in (
            # 壁unionが床所有セルを抑制する区間を、壁色の単一面で閉じる。
            # x=-6..0は床が南北へ連続するため断面自体を生成しない。
            ("X", -12.6, -6.0, -3.5, base_z - 0.15, base_z, 1),
            ("X", -12.6, -6.0, 2.498, base_z - 0.15, base_z, -1),
        )
    )
    create_outward_surface_mesh_object(
        "VIS_B06_StairFloorEdgeCladding_South",
        south_surfaces,
        visual_collection,
        wall_material,
    )
    edge_groups = (
        (
            "North",
            [
                (minimum, maximum)
                for base_z in stair_floor_edge_bases
                for minimum, maximum in (
                    ((-12.6, 38.898, base_z - 0.15), (-6.6, 38.902, base_z)),
                    ((41.4, 38.898, base_z - 0.15), (47.4, 38.902, base_z)),
                )
            ],
            frozenset((0, 1, 2, 3, 5)),
        ),
        (
            "West",
            [
                ((-6.002, -3.5, base_z - 0.15), (-5.998, 2.5, base_z))
                for base_z in stair_floor_edge_bases
            ],
            frozenset((0, 1, 2, 3, 4)),
        ),
    )
    for suffix, boxes, omitted_face_indices in edge_groups:
        create_open_box_mesh_object(
            f"VIS_B06_StairFloorEdgeCladding_{suffix}",
            boxes,
            omitted_face_indices,
            visual_collection,
            wall_material,
        )

    return generated_colliders


def create_profile_prism_mesh_object(
    name: str,
    width: tuple[float, float],
    profile: tuple[tuple[float, float], ...],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    append_profile_prism(vertices, faces, width, profile)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    return obj


def create_open_profile_prism_mesh_object(
    name: str,
    width: tuple[float, float],
    profile: tuple[tuple[float, float], ...],
    omitted_face_indices: frozenset[int],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    prism_faces: list[tuple[int, ...]] = []
    append_profile_prism(vertices, prism_faces, width, profile)
    faces = [
        face
        for face_index, face in enumerate(prism_faces)
        if face_index not in omitted_face_indices
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    return obj


def guard_rail_boxes(
    start: tuple[float, float],
    end: tuple[float, float],
    base_z: float,
    height: float = 1.1,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    start_x, start_y = start
    end_x, end_y = end
    if abs(start_x - end_x) <= 1.0e-9:
        axis = "Y"
        fixed = start_x
        minimum = min(start_y, end_y)
        maximum = max(start_y, end_y)
    elif abs(start_y - end_y) <= 1.0e-9:
        axis = "X"
        fixed = start_y
        minimum = min(start_x, end_x)
        maximum = max(start_x, end_x)
    else:
        raise RuntimeError(f"柵線分が水平直交ではありません: {start}->{end}")
    length = maximum - minimum
    if length <= 0:
        raise RuntimeError(f"柵線分長が不正です: {start}->{end}")
    post_count = max(1, math.ceil(length / 2.0))
    boxes = [
        oriented_box(
            axis,
            minimum + length * index / post_count - 0.05,
            minimum + length * index / post_count + 0.05,
            fixed - 0.05,
            fixed + 0.05,
            base_z,
            base_z + height,
        )
        for index in range(post_count + 1)
    ]
    for rail_center_z in (base_z + 0.55, base_z + height - 0.05):
        boxes.append(
            oriented_box(
                axis,
                minimum,
                maximum,
                fixed - 0.04,
                fixed + 0.04,
                rail_center_z - 0.04,
                rail_center_z + 0.04,
            )
        )
    return boxes


def create_guard_mesh_object(
    name: str,
    segments: list[
        tuple[
            tuple[float, float, float],
            tuple[float, float, float],
        ]
    ],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for start_coordinates, end_coordinates in segments:
        start = Vector(start_coordinates)
        end = Vector(end_coordinates)
        direction = end - start
        horizontal_length = math.hypot(direction.x, direction.y)
        if horizontal_length <= 1.0e-8:
            raise RuntimeError(f"体育館手すり線分長が不正です: {start}->{end}")
        for rail_height in (0.55, 1.05):
            vertical = Vector((0.0, 0.0, rail_height))
            append_sloped_rail_prism(
                vertices,
                faces,
                start + vertical,
                end + vertical,
            )
        post_count = max(1, math.ceil(horizontal_length / 1.1))
        for index in range(post_count + 1):
            base = start + direction * (index / post_count)
            append_box(
                vertices,
                faces,
                (base.x - 0.05, base.y - 0.05, base.z),
                (base.x + 0.05, base.y + 0.05, base.z + 1.10),
            )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    return obj


def create_guard_collider_mesh_object(
    name: str,
    segments: list[
        tuple[
            tuple[float, float, float],
            tuple[float, float, float],
        ]
    ],
    target_collection: bpy.types.Collection,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for start_coordinates, end_coordinates in segments:
        start = Vector(start_coordinates)
        end = Vector(end_coordinates)
        direction = end - start
        horizontal_length = math.hypot(direction.x, direction.y)
        if horizontal_length <= 1.0e-8:
            raise RuntimeError(
                f"体育館手すりCollider線分長が不正です: {start}->{end}"
            )
        for rail_height in (0.55, 1.05):
            vertical = Vector((0.0, 0.0, rail_height))
            append_sloped_rail_prism(
                vertices,
                faces,
                start + vertical,
                end + vertical,
                half_width=0.08,
            )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    return obj


def gym_gallery_stair_geometry(
    side: str,
) -> tuple[
    list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    list[RampPrismSpec],
    list[
        tuple[
            tuple[float, float, float],
            tuple[float, float, float],
        ]
    ],
    list[tuple[tuple[float, float, float], tuple[float, float, float]]],
]:
    if side == "West":
        first_x = (34.8, 36.0)
        second_x = (33.6, 34.8)
        turn_x = (33.6, 36.0)
        top_x = (33.6, 34.8)
        bottom_x = (34.8, 36.6)
        guard_segments = [
            ((34.76, -2.15, 0.15), (34.76, -3.80, 0.15)),
            ((36.04, -3.80, 0.15), (36.04, -10.20, 2.55)),
            ((36.04, -10.20, 2.55), (36.04, -11.30, 2.55)),
            ((34.76, -3.80, 0.15), (34.76, -10.20, 2.55)),
            ((34.84, -10.20, 2.55), (34.84, -3.00, 5.25)),
            ((34.84, -3.00, 5.25), (34.84, -2.00, 5.25)),
        ]
    elif side == "East":
        first_x = (56.8, 58.0)
        second_x = (58.0, 59.2)
        turn_x = (56.8, 59.2)
        top_x = (58.0, 59.2)
        bottom_x = (56.2, 58.0)
        guard_segments = [
            ((58.04, -2.15, 0.15), (58.04, -3.80, 0.15)),
            ((56.76, -3.80, 0.15), (56.76, -10.20, 2.55)),
            ((56.76, -10.20, 2.55), (56.76, -11.30, 2.55)),
            ((58.04, -3.80, 0.15), (58.04, -10.20, 2.55)),
            ((57.96, -10.20, 2.55), (57.96, -3.00, 5.25)),
            ((57.96, -3.00, 5.25), (57.96, -2.00, 5.25)),
        ]
    else:
        raise RuntimeError(f"体育館ギャラリー階段の側が不正です: {side}")

    step_depth = 0.40
    rise = 0.15
    tread_thickness = 0.05
    riser_half_depth = 0.025
    lower_north_y = -3.40
    turn_north_y = -10.20
    turn_south_y = -11.35
    upper_north_y = -3.00
    lower_landing = (
        (bottom_x[0], -3.40, 0.0),
        (bottom_x[1], -2.20, 0.15),
    )
    lower_connector = (
        (first_x[0], -3.80, 0.0),
        (first_x[1], -3.40, 0.15),
    )
    turn_landing = (
        (turn_x[0], turn_south_y, 2.40),
        (turn_x[1], turn_north_y, 2.55),
    )
    upper_landing = (
        (top_x[0], upper_north_y, 5.10),
        (top_x[1], -2.00, 5.25),
    )
    visual_boxes = [lower_landing, turn_landing, upper_landing]
    nosing_boxes = []
    collider_boxes = [
        lower_landing,
        lower_connector,
        turn_landing,
        upper_landing,
    ]
    for index in range(17):
        first_y_maximum = lower_north_y - index * step_depth
        first_y_minimum = first_y_maximum - step_depth
        first_top = (index + 1) * rise
        visual_boxes.append(
            (
                (
                    first_x[0],
                    first_y_minimum,
                    first_top - tread_thickness,
                ),
                (first_x[1], first_y_maximum, first_top),
            )
        )
        nosing_boxes.append(
            (
                (first_x[0], first_y_maximum - 0.06, first_top),
                (first_x[1], first_y_maximum, first_top + 0.02),
            )
        )
        if index > 0:
            previous_top = index * rise
            visual_boxes.append(
                (
                    (
                        first_x[0],
                        first_y_maximum - riser_half_depth,
                        previous_top,
                    ),
                    (
                        first_x[1],
                        first_y_maximum + riser_half_depth,
                        first_top,
                    ),
                )
            )

    for index in range(18):
        second_y_minimum = turn_north_y + index * step_depth
        second_y_maximum = second_y_minimum + step_depth
        second_top = 17 * rise + (index + 1) * rise
        previous_top = 17 * rise + index * rise
        visual_boxes.append(
            (
                (
                    second_x[0],
                    second_y_minimum,
                    second_top - tread_thickness,
                ),
                (second_x[1], second_y_maximum, second_top),
            )
        )
        nosing_boxes.append(
            (
                (second_x[0], second_y_minimum, second_top),
                (second_x[1], second_y_minimum + 0.06, second_top + 0.02),
            )
        )
        visual_boxes.append(
            (
                (
                    second_x[0],
                    second_y_minimum - riser_half_depth,
                    previous_top,
                ),
                (
                    second_x[1],
                    second_y_minimum + riser_half_depth,
                    second_top,
                ),
            )
        )

    ramps = [
        RampPrismSpec(
            run_axis="Y",
            width=first_x,
            start=(-3.80, 0.15),
            end=(turn_north_y, 2.55),
        ),
        RampPrismSpec(
            run_axis="Y",
            width=second_x,
            start=(turn_north_y, 2.55),
            end=(upper_north_y, 5.25),
        ),
    ]
    return visual_boxes, collider_boxes, ramps, guard_segments, nosing_boxes


def gym_gallery_north_transition_geometry(
) -> tuple[
    list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    list[RampPrismSpec],
    list[
        tuple[
            tuple[float, float, float],
            tuple[float, float, float],
        ]
    ],
    list[tuple[tuple[float, float, float], tuple[float, float, float]]],
]:
    step_depth = 0.30
    rise = 0.15
    tread_thickness = 0.05
    riser_half_depth = 0.025
    visual_boxes = []
    nosing_boxes = []
    ramps = []
    guard_segments = []
    for side in ("West", "East"):
        for index in range(11):
            if side == "West":
                x_maximum = 39.1 - index * step_depth
                x_minimum = x_maximum - step_depth
            else:
                x_minimum = 43.7 + index * step_depth
                x_maximum = x_minimum + step_depth
            top = 3.60 + (index + 1) * rise
            previous_top = 3.60 + index * rise
            visual_boxes.append(
                (
                    (x_minimum, 25.0, top - tread_thickness),
                    (x_maximum, 26.6, top),
                )
            )
            nosing_x0, nosing_x1 = (
                (x_maximum - 0.06, x_maximum)
                if side == "West"
                else (x_minimum, x_minimum + 0.06)
            )
            nosing_boxes.append(
                (
                    (nosing_x0, 25.0, top),
                    (nosing_x1, 26.6, top + 0.02),
                )
            )
            riser_x = x_maximum if side == "West" else x_minimum
            visual_boxes.append(
                (
                    (
                        riser_x - riser_half_depth,
                        25.0,
                        previous_top,
                    ),
                    (
                        riser_x + riser_half_depth,
                        26.6,
                        top,
                    ),
                )
            )
        if side == "West":
            ramps.append(
                RampPrismSpec(
                    run_axis="X",
                    width=(25.0, 26.6),
                    start=(39.1, 3.60),
                    end=(35.8, 5.25),
                )
            )
            guard_segments.append(
                ((39.1, 25.0, 3.60), (35.8, 25.0, 5.25))
            )
        else:
            ramps.append(
                RampPrismSpec(
                    run_axis="X",
                    width=(25.0, 26.6),
                    start=(43.7, 3.60),
                    end=(47.0, 5.25),
                )
            )
            guard_segments.append(
                ((43.7, 25.0, 3.60), (47.0, 25.0, 5.25))
            )
    return visual_boxes, ramps, guard_segments, nosing_boxes


def rebuild_gym_envelope_and_stage() -> None:
    for object_name in ("VIS_Floor_Gym", "COL_Floor_Gym"):
        replace_existing_boxes(
            object_name,
            [((33.4, -11.5, -0.2), (59.4, 26.5, 0.0))],
        )
    for object_name in ("VIS_GymWall_South", "COL_GymWall_South"):
        replace_existing_boxes(
            object_name,
            [((33.4, -11.65, 0.0), (59.4, -11.35, 9.0))],
        )
    for object_name in ("VIS_GymRoof", "COL_GymRoof"):
        replace_existing_boxes(
            object_name,
            [((33.4, -11.5, 9.0), (59.4, 26.5, 9.1))],
        )
    for object_name in ("VIS_GymStage", "COL_GymStage"):
        replace_existing_boxes(
            object_name,
            [((40.6, -11.0, 0.0), (52.2, -2.0, 1.0))],
        )

    stage_nosing_boxes = []
    for side, x_minimum, direction in (
        ("West", 39.1, 1.0),
        ("East", 53.7, -1.0),
    ):
        for step_index in range(1, 6):
            if direction > 0:
                step_x_minimum = x_minimum + (step_index - 1) * 0.3
                step_x_maximum = step_x_minimum + 0.3
            else:
                step_x_maximum = x_minimum - (step_index - 1) * 0.3
                step_x_minimum = step_x_maximum - 0.3
            replace_existing_boxes(
                f"VIS_GymStageStair_{side}_{step_index:02d}",
                [
                    (
                        (step_x_minimum, -11.0, 0.0),
                        (step_x_maximum, -8.6, step_index * 0.2),
                    )
                ],
            )
            nosing_x0, nosing_x1 = (
                (step_x_minimum, step_x_minimum + 0.06)
                if direction > 0
                else (step_x_maximum - 0.06, step_x_maximum)
            )
            stage_nosing_boxes.append(
                (
                    (nosing_x0, -11.0, step_index * 0.2),
                    (nosing_x1, -8.6, step_index * 0.2 + 0.02),
                )
            )

    create_mesh_object(
        "VIS_B03_GymStageStairNosing",
        stage_nosing_boxes,
        collection(VIS_COLLECTION_NAME),
        existing_material("MAT_B03_Atlas_Architecture"),
    )

    for side, low_x, high_x in (
        ("West", 39.1, 40.6),
        ("East", 53.7, 52.2),
    ):
        replace_stage_ramp_geometry(
            f"COL_GymStageStairRamp_{side}",
            low_x,
            high_x,
            -11.0,
            -8.6,
        )
    for side, x_minimum, x_maximum in (
        ("West", 40.45, 40.75),
        ("East", 52.05, 52.35),
    ):
        for prefix in ("VIS", "COL"):
            replace_existing_boxes(
                f"{prefix}_GymStageStairHeadWall_{side}",
                [((x_minimum, -11.0, 3.4), (x_maximum, -2.0, 9.0))],
            )


def build_b03_3b_structure(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    architecture_material: bpy.types.Material,
    frame_material: bpy.types.Material,
    glass_material: bpy.types.Material,
) -> dict[str, tuple[str, ...]]:
    blocker_names: list[str] = []
    rebuild_gym_envelope_and_stage()
    replace_existing_boxes(
        "VIS_Roof_West",
        [((-12.6, -6.7, 14.4), (0.0, 32.5, 14.5))],
    )
    rooftop_crate_collider_boxes = [
        ((-12.6, -6.7, 14.4), (-4.05, 32.5, 14.5)),
        ((-4.05, -6.7, 14.4), (0.0, 11.35, 14.5)),
        ((-4.05, 13.65, 14.4), (0.0, 32.5, 14.5)),
    ]
    replace_existing_boxes("COL_Roof_West", rooftop_crate_collider_boxes)
    rooftop_stair_vertices, rooftop_stair_faces = b06_roof_north_reference_geometry(
        suppress_stair_contact_faces=False
    )
    replace_mesh_geometry(
        "COL_Roof_North",
        list(rooftop_stair_vertices),
        list(rooftop_stair_faces),
    )
    rooftop_ramp = bpy.data.objects.get("COL_RooftopStairExitRamp")
    if rooftop_ramp is not None:
        unlink_and_remove_object(rooftop_ramp)
    rooftop_visual_vertices, rooftop_visual_faces = (
        b06_roof_north_reference_geometry(suppress_stair_contact_faces=True)
    )
    replace_mesh_geometry_with_oriented_faces(
        "VIS_Roof_North",
        list(rooftop_visual_vertices),
        list(rooftop_visual_faces),
    )

    bridge_floor_boxes = [
        ((39.3, 26.6, 3.45), (43.5, 32.5, 3.60)),
    ]
    create_open_box_mesh_object(
        "VIS_B03_GymBridgeFloor",
        bridge_floor_boxes,
        frozenset((2, 4)),
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_GymBridgeFloor",
        bridge_floor_boxes,
        collider_collection,
    )
    bridge_school_floor_joint_boxes = [
        ((39.3, 32.5, 3.45), (43.5, 32.65, 3.60)),
    ]
    create_open_box_mesh_object(
        "VIS_B03_GymBridgeSchoolFloorJoint",
        bridge_school_floor_joint_boxes,
        frozenset((2, 4)),
        visual_collection,
        architecture_material,
    )
    bridge_ceiling_boxes = [
        ((39.3, 26.65, 6.60), (43.5, 32.35, 7.05)),
    ]
    create_open_box_mesh_object(
        "VIS_B03_GymBridgeCeiling",
        bridge_ceiling_boxes,
        frozenset((2, 4)),
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_GymBridgeCeiling",
        bridge_ceiling_boxes,
        collider_collection,
    )
    bridge_frame_boxes = []
    bridge_glass_boxes = []
    bridge_envelope_boxes = []
    for side_minimum, side_maximum in ((39.3, 39.4), (43.4, 43.5)):
        bridge_frame_boxes.extend(
            (
                ((side_minimum, 26.70, 3.60), (side_maximum, 32.30, 4.40)),
                ((side_minimum, 26.70, 6.10), (side_maximum, 32.30, 6.60)),
            )
        )
        bridge_envelope_boxes.append(
            ((side_minimum, 26.70, 3.60), (side_maximum, 32.30, 6.60))
        )
        for post_y in (28.55, 30.45):
            bridge_frame_boxes.append(
                (
                    (side_minimum, post_y - 0.05, 4.40),
                    (side_maximum, post_y + 0.05, 6.10),
                )
            )
        for glass_y_minimum, glass_y_maximum in (
            (26.75, 28.50),
            (28.60, 30.40),
            (30.50, 32.25),
        ):
            glass_x_center = (side_minimum + side_maximum) / 2.0
            bridge_glass_boxes.append(
                (
                    (glass_x_center - 0.0125, glass_y_minimum, 4.40),
                    (glass_x_center + 0.0125, glass_y_maximum, 6.10),
                )
            )
    school_side_terminal_boxes = [
        ((39.30, 32.30, 3.60), (39.40, 32.35, 4.35)),
        ((39.30, 32.30, 4.35), (39.40, 32.40, 6.25)),
        ((39.30, 32.30, 6.25), (39.40, 32.35, 6.60)),
        ((43.40, 32.30, 3.60), (43.50, 32.35, 6.60)),
    ]
    bridge_frame_boxes.extend(school_side_terminal_boxes)
    bridge_envelope_boxes.extend(school_side_terminal_boxes)
    create_mesh_object(
        "VIS_B03_GymBridgeWindowFrames",
        bridge_frame_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "VIS_B03_GymBridgeWindowGlass",
        bridge_glass_boxes,
        visual_collection,
        glass_material,
    )
    create_mesh_object(
        "COL_B03_GymBridgeEnvelope",
        bridge_envelope_boxes,
        collider_collection,
    )
    blocker_names.append("COL_B03_GymBridgeEnvelope")

    bridge_side_infill_boxes = [
        ((39.30, 26.50, 3.60), (39.40, 26.70, 6.60)),
        ((43.40, 26.50, 3.60), (43.50, 26.70, 6.60)),
    ]
    create_mesh_object(
        "VIS_B06_GymBridgeSideInfill",
        bridge_side_infill_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B06_GymBridgeSideInfill",
        bridge_side_infill_boxes,
        collider_collection,
    )

    stage_side_wall_boxes = [
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
    ]
    create_mesh_object(
        "VIS_B03_GymStageSideWalls",
        stage_side_wall_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_GymStageSideWalls",
        stage_side_wall_boxes,
        collider_collection,
    )
    blocker_names.append("COL_B03_GymStageSideWalls")

    gallery_floor_boxes = [
        ((33.6, -2.0, 5.10), (34.8, 26.4, 5.25)),
        ((58.0, -2.0, 5.10), (59.2, 26.4, 5.25)),
        ((34.8, 25.0, 5.10), (35.8, 26.6, 5.25)),
        ((39.1, 25.0, 3.45), (43.7, 26.6, 3.60)),
        ((47.0, 25.0, 5.10), (58.0, 26.6, 5.25)),
    ]
    create_mesh_object(
        "VIS_B03_GymGalleryFloor",
        gallery_floor_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_GymGalleryFloor",
        gallery_floor_boxes,
        collider_collection,
    )
    gallery_guard_segments = [
        ((34.84, -2.0, 5.25), (34.84, 25.0, 5.25)),
        ((57.96, -2.0, 5.25), (57.96, 25.0, 5.25)),
        ((34.84, 25.0, 5.25), (35.8, 25.0, 5.25)),
        ((39.1, 25.0, 3.60), (43.7, 25.0, 3.60)),
        ((47.0, 25.0, 5.25), (57.96, 25.0, 5.25)),
    ]

    visual_stair_boxes = []
    collider_stair_boxes = []
    stair_ramps = []
    stair_guard_segments = []
    stair_nosing_boxes = []
    (
        north_visual_stairs,
        north_ramps,
        north_guards,
        north_nosings,
    ) = gym_gallery_north_transition_geometry()
    visual_stair_boxes.extend(north_visual_stairs)
    stair_ramps.extend(north_ramps)
    stair_guard_segments.extend(north_guards)
    stair_nosing_boxes.extend(north_nosings)
    for side in ("West", "East"):
        (
            side_visual_stairs,
            side_collider_stairs,
            side_ramps,
            side_guards,
            side_nosings,
        ) = gym_gallery_stair_geometry(side)
        visual_stair_boxes.extend(side_visual_stairs)
        collider_stair_boxes.extend(side_collider_stairs)
        stair_ramps.extend(side_ramps)
        stair_guard_segments.extend(side_guards)
        stair_nosing_boxes.extend(side_nosings)
    create_stair_mesh_object(
        "VIS_B03_GymGalleryStairs",
        visual_stair_boxes,
        stair_ramps,
        visual_collection,
        architecture_material,
    )
    create_stair_mesh_object(
        "COL_B03_GymGalleryStairs",
        collider_stair_boxes,
        stair_ramps,
        collider_collection,
    )
    gallery_guard_segments.extend(stair_guard_segments)
    create_guard_mesh_object(
        "VIS_B03_GymGalleryGuards",
        gallery_guard_segments,
        visual_collection,
        architecture_material,
    )
    create_guard_collider_mesh_object(
        "COL_B03_GymGalleryGuards",
        gallery_guard_segments,
        collider_collection,
    )
    blocker_names.append("COL_B03_GymGalleryGuards")

    gym_roof_boxes = [
        ((33.4, -11.5, 9.45), (59.4, 26.5, 9.60)),
    ]
    create_mesh_object(
        "VIS_B03_GymRoofWalkable",
        gym_roof_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_GymRoofWalkable",
        gym_roof_boxes,
        collider_collection,
    )
    gym_roof_gap_boxes = [
        ((33.4, -11.5, 9.10), (59.4, 26.5, 9.45)),
    ]
    create_mesh_object(
        "VIS_B03_GymRoofGapWall",
        gym_roof_gap_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_GymRoofGapWall",
        gym_roof_gap_boxes,
        collider_collection,
    )
    gym_roof_guard_boxes = []
    for start, end in (
        ((33.5, -11.4), (59.3, -11.4)),
        ((33.5, -11.4), (33.5, 26.4)),
        ((59.3, -11.4), (59.3, 26.4)),
        ((33.5, 26.4), (39.4, 26.4)),
        ((43.4, 26.4), (59.3, 26.4)),
    ):
        gym_roof_guard_boxes.extend(guard_rail_boxes(start, end, 9.60))
    create_mesh_object(
        "VIS_B03_GymRoofGuards",
        gym_roof_guard_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_GymRoofGuards",
        gym_roof_guard_boxes,
        collider_collection,
    )

    roof_ramp_profile = (
        (26.5, 9.45),
        (32.5, 7.05),
        (32.5, 7.20),
        (26.5, 9.60),
    )
    create_open_profile_prism_mesh_object(
        "VIS_B03_GymRoofRamp",
        (39.4, 43.4),
        roof_ramp_profile,
        frozenset((0, 1, 3, 5)),
        visual_collection,
        architecture_material,
    )
    create_profile_prism_mesh_object(
        "COL_B03_GymRoofRamp",
        (39.4, 43.4),
        roof_ramp_profile,
        collider_collection,
    )
    roof_ramp_underfill_profile = (
        (26.5, 7.05),
        (32.5, 7.05),
        (26.5, 9.45),
    )
    create_open_profile_prism_mesh_object(
        "VIS_B03_GymRoofRampUnderfill",
        (39.4, 43.4),
        roof_ramp_underfill_profile,
        frozenset((0, 1, 2, 3)),
        visual_collection,
        architecture_material,
    )
    create_profile_prism_mesh_object(
        "COL_B03_GymRoofRampUnderfill",
        (39.4, 43.4),
        roof_ramp_underfill_profile,
        collider_collection,
    )
    roof_ramp_side_profile = (
        (26.65, 7.05),
        (32.35, 7.05),
        (32.35, 7.26),
        (26.65, 9.54),
    )
    create_open_profile_prism_mesh_object(
        "VIS_B03_GymRoofRampSideCladding",
        (39.4, 43.4),
        roof_ramp_side_profile,
        frozenset((2, 3, 4, 5)),
        visual_collection,
        architecture_material,
    )
    roof_connection_guard_segments = [
        ((39.52, 32.5, 7.20), (39.52, 26.5, 9.60)),
        ((43.28, 32.5, 7.20), (43.28, 26.5, 9.60)),
    ]
    create_guard_mesh_object(
        "VIS_B03_GymRoofConnectionGuards",
        roof_connection_guard_segments,
        visual_collection,
        architecture_material,
    )
    create_guard_collider_mesh_object(
        "COL_B03_GymRoofConnectionGuards",
        roof_connection_guard_segments,
        collider_collection,
    )

    first_floor_extension_visual_boxes = [
        ((minimum[0], minimum[1], -0.15), (maximum[0], maximum[1], -0.002))
        for minimum, maximum in WEST_EXTENSION_FLOOR_PANELS_XY
    ]
    create_mesh_object(
        "VIS_B03_WestExtensionFloor_F01",
        first_floor_extension_visual_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_WestExtensionFloor_F01",
        [
            ((minimum[0], minimum[1], -0.15), (maximum[0], maximum[1], 0.0))
            for minimum, maximum in WEST_EXTENSION_FLOOR_PANELS_XY
        ],
        collider_collection,
    )
    create_mesh_object(
        "VIS_B03_GymGalleryStairNosing",
        stair_nosing_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "VIS_B06_WestExtensionFloorFinish_F01",
        [
            ((minimum[0], minimum[1], 0.0), (maximum[0], maximum[1], 0.04))
            for minimum, maximum in WEST_EXTENSION_FLOOR_PANELS_XY
        ],
        visual_collection,
        architecture_material,
    )
    replace_existing_xy_prism(
        "VIS_Floor_CorridorCorner",
        (
            (-12.6, 32.5),
            (0.0, 32.5),
            (0.0, 36.5),
            (5.4, 36.5),
            (5.4, 45.5),
            (2.4, 45.5),
            (2.4, 38.5),
            (-6.6, 38.5),
            (-6.6, 45.5),
            (-12.6, 45.5),
            (-12.6, 36.5),
        ),
        0.0,
        0.04,
    )

    opening_minimum_y, opening_maximum_y = ELEVATOR_OPENING_Y
    shaft_inner_south_y, shaft_inner_north_y = ELEVATOR_SHAFT_INNER_Y
    shaft_shell_boxes = [
        ((-11.8, -6.85, 0.0), (-11.5, -3.5, 14.25)),
        ((-11.5, -6.85, 0.0), (ELEVATOR_FRONT_X, shaft_inner_south_y, 14.25)),
        ((-11.5, shaft_inner_north_y, 0.0), (ELEVATOR_FRONT_X, -3.5, 14.25)),
        # エレベーターホールと南西階段を分離する正規の北側接続壁。
        # 旧ElevatorStairWallに混在していた南側長壁は復元しない。
        ((ELEVATOR_FRONT_X, shaft_inner_north_y, 0.0), (-6.0, -3.5, 14.4)),
        # 西外壁とシャフト背面の間にある空間は残し、階段側の口だけを閉じる。
        ((-12.45, shaft_inner_north_y, 0.0), (-11.8, -3.5, 14.4)),
        ((-9.1, shaft_inner_south_y, 0.0), (ELEVATOR_FRONT_X, opening_minimum_y, 14.25)),
        ((-9.1, opening_maximum_y, 0.0), (ELEVATOR_FRONT_X, shaft_inner_north_y, 14.25)),
        ((-9.1, opening_minimum_y, 2.4), (ELEVATOR_FRONT_X, opening_maximum_y, 3.6)),
        ((-9.1, opening_minimum_y, 6.0), (ELEVATOR_FRONT_X, opening_maximum_y, 7.2)),
        ((-9.1, opening_minimum_y, 9.6), (ELEVATOR_FRONT_X, opening_maximum_y, 10.8)),
        ((-9.1, opening_minimum_y, 13.2), (ELEVATOR_FRONT_X, opening_maximum_y, 14.25)),
        ((-11.8, -6.85, 14.25), (ELEVATOR_FRONT_X, -3.5, 14.4)),
    ]
    create_mesh_object(
        "VIS_B03_ElevatorShaftShell",
        shaft_shell_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_ElevatorShaftShell",
        shaft_shell_boxes,
        collider_collection,
    )
    blocker_names.append("COL_B03_ElevatorShaftShell")
    closed_door_boxes = [
        (
            (-8.92, opening_minimum_y, floor_base_z),
            (-8.80, opening_maximum_y, floor_base_z + 2.4),
        )
        for floor_base_z in (3.6, 7.2)
    ]
    create_mesh_object(
        "VIS_B03_ElevatorClosedDoor_F02_F03",
        closed_door_boxes,
        visual_collection,
        architecture_material,
    )
    create_mesh_object(
        "COL_B03_ElevatorClosedDoor_F02_F03",
        closed_door_boxes,
        collider_collection,
    )
    blocker_names.append("COL_B03_ElevatorClosedDoor_F02_F03")

    adjustment_tape_beams = []
    for floor_base_z in (3.6, 7.2):
        adjustment_tape_beams.extend(
            (
                (
                    (-5.755, floor_base_z + 0.18),
                    (-4.595, floor_base_z + 2.22),
                    0.10,
                    -8.795,
                    -8.775,
                ),
                (
                    (-4.595, floor_base_z + 0.18),
                    (-5.755, floor_base_z + 2.22),
                    0.10,
                    -8.795,
                    -8.775,
                ),
            )
        )
    create_yz_beam_mesh_object(
        "VIS_B03_ElevatorAdjustmentTape_F02_F03",
        adjustment_tape_beams,
        visual_collection,
        architecture_material,
    )
    adjustment_sign_boxes = [
        (
            (-8.79, -5.695, floor_base_z + 1.02),
            (-8.75, -4.655, floor_base_z + 1.50),
        )
        for floor_base_z in (3.6, 7.2)
    ]
    create_mesh_object(
        "VIS_B03_ElevatorAdjustmentSign_F02_F03",
        adjustment_sign_boxes,
        visual_collection,
        architecture_material,
    )
    for floor, floor_base_z in ((2, 3.6), (3, 7.2)):
        create_elevator_adjustment_text(
            f"VIS_B03_ElevatorAdjustmentText_F{floor:02d}",
            floor_base_z,
            visual_collection,
            architecture_material,
        )

    return {
        "blocker_names": tuple(blocker_names),
        "gallery_nav_sources": ("COL_B03_GymGalleryFloor",),
        "gallery_stair_nav_sources": ("COL_B03_GymGalleryStairs",),
        "gym_rooftop_nav_sources": ("COL_B03_GymRoofWalkable",),
        "gym_roof_ramp_nav_sources": ("COL_B03_GymRoofRamp",),
    }


def build_readability_finish(visual_collection: bpy.types.Collection) -> None:
    gym_wainscot_boxes = [
        ((33.55, -11.35, 0.02), (33.59, 4.95, 1.20)),
        ((33.55, 8.05, 0.02), (33.59, 26.35, 1.20)),
        ((59.21, -11.35, 0.02), (59.25, 26.35, 1.20)),
        ((33.55, 26.31, 0.02), (39.35, 26.35, 1.20)),
        ((43.45, 26.31, 0.02), (53.60, 26.35, 1.20)),
        ((55.20, 26.31, 0.02), (59.25, 26.35, 1.20)),
    ]
    create_mesh_object(
        "VIS_B03_GymWainscot",
        gym_wainscot_boxes,
        visual_collection,
    )
    gym_trim_boxes = [
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
    ]
    create_mesh_object("VIS_B03_GymTrim", gym_trim_boxes, visual_collection)

    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
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
            endpoint_offset = (
                GYM_WINDOW_LINK_ENDPOINT_OFFSET_METERS
                if spec.floor == 0
                else WINDOW_LINK_ENDPOINT_OFFSET_METERS
            )
            a = Vector(center) + outward * endpoint_offset
            b = Vector(center) - outward * endpoint_offset
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

    for source in sources.values():
        unlink_and_remove_object(source)
    remove_unused_prop_material_duplicates()


def append_oriented_box(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    rotation_z: float,
) -> None:
    transform = Matrix.Translation(Vector(center)) @ Matrix.Rotation(
        rotation_z, 4, "Z"
    )
    half_x, half_y, half_z = (dimension / 2.0 for dimension in size)
    local_vertices = (
        (-half_x, -half_y, -half_z),
        (half_x, -half_y, -half_z),
        (half_x, half_y, -half_z),
        (-half_x, half_y, -half_z),
        (-half_x, -half_y, half_z),
        (half_x, -half_y, half_z),
        (half_x, half_y, half_z),
        (-half_x, half_y, half_z),
    )
    offset = len(vertices)
    vertices.extend(tuple(transform @ Vector(vertex)) for vertex in local_vertices)
    faces.extend(
        tuple(offset + index for index in face)
        for face in (
            (0, 3, 2, 1),
            (4, 5, 6, 7),
            (0, 1, 5, 4),
            (1, 2, 6, 5),
            (2, 3, 7, 6),
            (3, 0, 4, 7),
        )
    )


def append_stepped_rooftop_crate(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    transform: Matrix,
    x_minimum: float,
    x_maximum: float,
    y_minimum: float,
    y_maximum: float,
    height: float,
    previous_height: float,
    *,
    first: bool,
    last: bool,
) -> None:
    local_vertices = [
        (x_minimum, y_minimum, 0.0),
        (x_maximum, y_minimum, 0.0),
        (x_maximum, y_maximum, 0.0),
        (x_minimum, y_maximum, 0.0),
        (x_minimum, y_minimum, height),
        (x_maximum, y_minimum, height),
        (x_maximum, y_maximum, height),
        (x_minimum, y_maximum, height),
    ]
    if not first:
        local_vertices.extend(
            (
                (x_minimum, y_minimum, previous_height),
                (x_minimum, y_maximum, previous_height),
            )
        )
    offset = len(vertices)
    vertices.extend(tuple(transform @ Vector(vertex)) for vertex in local_vertices)
    local_faces: list[tuple[int, ...]] = [
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (2, 3, 7, 6),
    ]
    if first:
        local_faces.append((3, 0, 4, 7))
    else:
        local_faces.append((9, 8, 4, 7))
    if last:
        local_faces.append((1, 2, 6, 5))
    faces.extend(
        tuple(offset + vertex_index for vertex_index in face)
        for face in local_faces
    )


def append_rooftop_crate_cell(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    transform: Matrix,
    x_minimum: float,
    x_maximum: float,
    y_minimum: float,
    y_maximum: float,
    height: float,
    neighbor_heights: tuple[float, float, float, float],
) -> None:
    offset = len(vertices)
    vertices.extend(
        tuple(transform @ Vector(vertex))
        for vertex in (
            (x_minimum, y_minimum, height),
            (x_maximum, y_minimum, height),
            (x_maximum, y_maximum, height),
            (x_minimum, y_maximum, height),
        )
    )
    faces.append((offset, offset + 1, offset + 2, offset + 3))

    x_minimum_neighbor, x_maximum_neighbor, y_minimum_neighbor, y_maximum_neighbor = (
        neighbor_heights
    )
    if height > x_minimum_neighbor:
        lower_offset = len(vertices)
        vertices.extend(
            tuple(transform @ Vector(vertex))
            for vertex in (
                (x_minimum, y_minimum, x_minimum_neighbor),
                (x_minimum, y_maximum, x_minimum_neighbor),
            )
        )
        faces.append((lower_offset, offset, offset + 3, lower_offset + 1))
    if height > x_maximum_neighbor:
        lower_offset = len(vertices)
        vertices.extend(
            tuple(transform @ Vector(vertex))
            for vertex in (
                (x_maximum, y_minimum, x_maximum_neighbor),
                (x_maximum, y_maximum, x_maximum_neighbor),
            )
        )
        faces.append((lower_offset, lower_offset + 1, offset + 2, offset + 1))
    if height > y_minimum_neighbor:
        lower_offset = len(vertices)
        vertices.extend(
            tuple(transform @ Vector(vertex))
            for vertex in (
                (x_minimum, y_minimum, y_minimum_neighbor),
                (x_maximum, y_minimum, y_minimum_neighbor),
            )
        )
        faces.append((lower_offset, lower_offset + 1, offset + 1, offset))
    if height > y_maximum_neighbor:
        lower_offset = len(vertices)
        vertices.extend(
            tuple(transform @ Vector(vertex))
            for vertex in (
                (x_minimum, y_maximum, y_maximum_neighbor),
                (x_maximum, y_maximum, y_maximum_neighbor),
            )
        )
        faces.append((lower_offset, offset + 3, offset + 2, lower_offset + 1))


ROOFTOP_CRATE_X_BOUNDS = (0.00, 0.99, 1.98, 2.97, 3.95)
ROOFTOP_CRATE_Y_BOUNDS = (-1.80, -0.60, 0.60, 1.80)
ROOFTOP_CRATE_HEIGHTS = (
    (0.30, 0.30, 0.30),
    (0.30, 0.60, 0.60),
    (0.60, 0.90, 0.60),
    (0.60, 1.20, 0.90),
)

# 階層色帯の正本となる共用空間輪郭。床全体のAABBや室内矩形の差分ではなく、
# 実壁の内面で囲まれた廊下・共用部・階段踊り場だけを明示する。
STOREY_COMMON_SPACE_POLYGONS_XY = (
    ((-3.35, 2.65), (-0.15, 2.65), (-0.15, 32.35), (-3.35, 32.35)),
    # 西棟廊下は南端外壁まで実壁で連続する。旧輪郭のY=2.65終端は
    # 実開口ではなく、南端壁と両側壁の帯を欠落させていた。
    ((-3.35, -6.85), (-0.15, -6.85), (-0.15, 2.65), (-3.35, 2.65)),
    # 西棟廊下と北棟廊下の共有床接続部。壁厚を避けて縮めた二つの
    # 廊下矩形だけでは、接続角の実壁面が室内・屋外へ誤分類される。
    ((-3.35, 32.35), (0.0, 32.35), (0.0, 32.65), (-3.35, 32.65)),
    ((-6.45, 32.65), (41.25, 32.65), (41.25, 36.35), (-6.45, 36.35)),
    ((-12.45, 32.65), (-6.75, 32.65), (-6.75, 45.35), (-12.45, 45.35)),
    ((41.55, 32.65), (47.25, 32.65), (47.25, 45.35), (41.55, 45.35)),
    ((-6.45, 36.65), (5.25, 36.65), (5.25, 38.35), (-6.45, 38.35)),
    ((2.55, 38.35), (5.25, 38.35), (5.25, 45.35), (2.55, 45.35)),
    ((-12.45, -3.35), (-3.65, -3.35), (-3.65, 2.35), (-12.45, 2.35)),
    # 南西階段側の共用床と、後方空間を閉じたElevatorShaftShell北面の間を
    # 同じ共用空間として接続する。壁面Y=-3.50の+Y側だけを対象にし、
    # シャフト内部やかご側へ階層色帯を生成しない。
    ((-12.45, -3.50), (-6.00, -3.50), (-6.00, -3.35), (-12.45, -3.35)),
    ((-8.70, -6.85), (-6.15, -6.85), (-6.15, -3.35), (-8.70, -3.35)),
    # エレベーターホールと西棟廊下の間も同じ共用床である。中央を
    # 台帳から外すと、南端の連続壁だけが実開口なしで2.80m途切れる。
    ((-6.15, -6.85), (-3.35, -6.85), (-3.35, -3.35), (-6.15, -3.35)),
)


def append_shared_crate_walkable_envelope(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    transform: Matrix,
) -> None:
    x_positions = ROOFTOP_CRATE_X_BOUNDS
    y_positions = ROOFTOP_CRATE_Y_BOUNDS
    top_height_by_x = (0.00, 0.30, 0.60, 0.90, 1.20)
    top_height_by_y = (0.30, 1.20, 1.20, 0.30)
    top_indices: list[list[int]] = []
    bottom_indices: list[list[int]] = []
    for x, x_height in zip(x_positions, top_height_by_x, strict=True):
        row = []
        bottom_row = []
        for y, y_height in zip(y_positions, top_height_by_y, strict=True):
            z = min(x_height, y_height)
            row.append(len(vertices))
            vertices.append(tuple(transform @ Vector((x, y, z))))
            if math.isclose(z, 0.0, abs_tol=1.0e-8):
                bottom_row.append(row[-1])
            else:
                bottom_row.append(len(vertices))
                vertices.append(tuple(transform @ Vector((x, y, 0.0))))
        top_indices.append(row)
        bottom_indices.append(bottom_row)
    for x_index in range(len(x_positions) - 1):
        for y_index in range(len(y_positions) - 1):
            a = top_indices[x_index][y_index]
            b = top_indices[x_index + 1][y_index]
            c = top_indices[x_index + 1][y_index + 1]
            d = top_indices[x_index][y_index + 1]
            faces.extend(((a, b, c), (a, c, d)))

    def append_side(indices: tuple[int, ...]) -> None:
        normalized = []
        for index in indices:
            if not normalized or normalized[-1] != index:
                normalized.append(index)
        if len(normalized) > 1 and normalized[0] == normalized[-1]:
            normalized.pop()
        if len(set(normalized)) >= 3:
            faces.append(tuple(normalized))

    for x_index in range(len(x_positions) - 1):
        append_side(
            (
                bottom_indices[x_index][0],
                bottom_indices[x_index + 1][0],
                top_indices[x_index + 1][0],
                top_indices[x_index][0],
            )
        )
        append_side(
            (
                bottom_indices[x_index][-1],
                top_indices[x_index][-1],
                top_indices[x_index + 1][-1],
                bottom_indices[x_index + 1][-1],
            )
        )
    for y_index in range(len(y_positions) - 1):
        append_side(
            (
                bottom_indices[0][y_index],
                top_indices[0][y_index],
                top_indices[0][y_index + 1],
                bottom_indices[0][y_index + 1],
            )
        )
        append_side(
            (
                bottom_indices[-1][y_index],
                bottom_indices[-1][y_index + 1],
                top_indices[-1][y_index + 1],
                top_indices[-1][y_index],
            )
        )
    for x_index in range(len(x_positions) - 1):
        for y_index in range(len(y_positions) - 1):
            faces.append(
                (
                    bottom_indices[x_index][y_index],
                    bottom_indices[x_index][y_index + 1],
                    bottom_indices[x_index + 1][y_index + 1],
                    bottom_indices[x_index + 1][y_index],
                )
            )


def build_rooftop_escape_crate_mounds(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    architecture_material: bpy.types.Material,
) -> dict[str, tuple[str, ...]]:
    batches: dict[str, tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]] = {
        key: ([], []) for key in ("Dark", "Light", "Gray")
    }
    placements = (
        Matrix.Translation(Vector((37.65, -7.45, 9.60)))
        @ Matrix.Rotation(math.pi, 4, "Z"),
        Matrix.Translation(Vector((-4.20, 12.50, 14.50))),
    )
    colors = ("Dark", "Light", "Gray")
    for placement_index, transform in enumerate(placements):
        for x_index, (x_minimum, x_maximum) in enumerate(
            zip(ROOFTOP_CRATE_X_BOUNDS[:-1], ROOFTOP_CRATE_X_BOUNDS[1:], strict=True)
        ):
            for y_index, (y_minimum, y_maximum) in enumerate(
                zip(ROOFTOP_CRATE_Y_BOUNDS[:-1], ROOFTOP_CRATE_Y_BOUNDS[1:], strict=True)
            ):
                height = ROOFTOP_CRATE_HEIGHTS[x_index][y_index]
                neighbor_heights = (
                    0.0 if x_index == 0 else ROOFTOP_CRATE_HEIGHTS[x_index - 1][y_index],
                    0.0 if x_index + 1 == len(ROOFTOP_CRATE_HEIGHTS) else ROOFTOP_CRATE_HEIGHTS[x_index + 1][y_index],
                    0.0 if y_index == 0 else ROOFTOP_CRATE_HEIGHTS[x_index][y_index - 1],
                    0.0 if y_index + 1 == len(ROOFTOP_CRATE_Y_BOUNDS) - 1 else ROOFTOP_CRATE_HEIGHTS[x_index][y_index + 1],
                )
                vertices, faces = batches[
                    colors[(placement_index + x_index + y_index) % len(colors)]
                ]
                append_rooftop_crate_cell(
                    vertices,
                    faces,
                    transform,
                    x_minimum,
                    x_maximum,
                    y_minimum,
                    y_maximum,
                    height,
                    neighbor_heights,
                )
    for color, (vertices, faces) in batches.items():
        name = f"VIS_B03_RooftopEscapeCrates_{color}"
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update(calc_edges=True)
        obj = bpy.data.objects.new(name, mesh)
        visual_collection.objects.link(obj)
        mesh.materials.append(architecture_material)

    gym_vertices: list[tuple[float, float, float]] = []
    gym_faces: list[tuple[int, ...]] = []
    append_shared_crate_walkable_envelope(gym_vertices, gym_faces, placements[0])
    gym_mesh = bpy.data.meshes.new("COL_B03_GymRoofEscapeCrateRamp")
    gym_mesh.from_pydata(gym_vertices, [], gym_faces)
    gym_mesh.update(calc_edges=True)
    gym_collider = bpy.data.objects.new(
        "COL_B03_GymRoofEscapeCrateRamp", gym_mesh
    )
    collider_collection.objects.link(gym_collider)

    school_vertices: list[tuple[float, float, float]] = []
    school_faces: list[tuple[int, ...]] = []
    append_shared_crate_walkable_envelope(school_vertices, school_faces, placements[1])
    school_mesh = bpy.data.meshes.new("COL_B03_SchoolRoofEscapeCrateRamp")
    school_mesh.from_pydata(school_vertices, [], school_faces)
    school_mesh.update(calc_edges=True)
    school_collider = bpy.data.objects.new(
        "COL_B03_SchoolRoofEscapeCrateRamp", school_mesh
    )
    collider_collection.objects.link(school_collider)
    return {
        "gym_nav_sources": (gym_collider.name,),
        "school_nav_sources": (school_collider.name,),
    }


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
    if horizontal_length <= 1.0e-8:
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


def copy_meshes_into_object(
    name: str,
    source_names: list[str],
    target_collection: bpy.types.Collection,
    properties: dict[str, object],
    *,
    source_z_offsets: dict[str, float] | None = None,
    additional_boxes: tuple[
        tuple[tuple[float, float, float], tuple[float, float, float]], ...
    ] = (),
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for source_name in source_names:
        source = bpy.data.objects.get(source_name)
        if source is None or source.type != "MESH":
            raise RuntimeError(f"NAV生成元の参照Meshがありません: {source_name}")
        offset = len(vertices)
        z_offset = (source_z_offsets or {}).get(source_name, 0.0)
        vertices.extend(
            tuple((source.matrix_world @ vertex.co) + Vector((0.0, 0.0, z_offset)))
            for vertex in source.data.vertices
        )
        faces.extend(
            tuple(offset + index for index in polygon.vertices)
            for polygon in source.data.polygons
        )
    for minimum, maximum in additional_boxes:
        append_box(vertices, faces, minimum, maximum)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    for key, value in properties.items():
        obj[key] = value
    return obj


def rebuild_human_entry_transition_nav_source() -> bpy.types.Object:
    source_names = (
        "COL_EntryRamp",
        "COL_NorthEntryRamp",
        "COL_NorthWingSouthEntryRamp",
        "COL_BridgeSideRamp_West",
        "COL_BridgeSideRamp_East",
        "COL_GymCourtyardEntryRamp",
    )
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    selected_faces = 0
    extended_vertices = 0
    minimum_walkable_normal_z = math.cos(math.radians(45.0))
    for source_name in source_names:
        source = bpy.data.objects.get(source_name)
        if source is None or source.type != "MESH":
            raise RuntimeError(
                f"人物用玄関NavMesh生成元がありません: {source_name}"
            )
        normal_matrix = source.matrix_world.to_3x3().inverted().transposed()
        source_selected_faces = 0
        for polygon in source.data.polygons:
            world_normal = (normal_matrix @ polygon.normal).normalized()
            if world_normal.z < minimum_walkable_normal_z:
                continue
            offset = len(vertices)
            for vertex_index in polygon.vertices:
                point = source.matrix_world @ source.data.vertices[vertex_index].co
                if (
                    source_name == "COL_EntryRamp"
                    and abs(point.x - 2.0) <= 1.0e-5
                    and abs(point.z + 0.30) <= 1.0e-5
                ):
                    point.x = 2.10
                    extended_vertices += 1
                vertices.append(tuple(point))
            faces.append(
                tuple(offset + index for index in range(len(polygon.vertices)))
            )
            source_selected_faces += 1
            selected_faces += 1
        if source_selected_faces != 1:
            raise RuntimeError(
                f"人物用玄関NavMesh上面数が不正です: "
                f"{source_name}/{source_selected_faces}"
            )
    if (
        selected_faces != len(source_names)
        or len(vertices) != len(source_names) * 4
        or extended_vertices != 2
    ):
        raise RuntimeError(
            "人物用玄関NavMesh再構築結果が不正です: "
            f"faces={selected_faces}, vertices={len(vertices)}, "
            f"extended={extended_vertices}"
        )
    target = bpy.data.objects.get("NAV_Walkable_EntryTransitions")
    if target is None or target.type != "MESH":
        raise RuntimeError("人物用玄関NavMesh再構築対象がありません")
    if target.data.users != 1:
        target.data = target.data.copy()
    target.matrix_world = Matrix.Identity(4)
    target.data.clear_geometry()
    target.data.from_pydata(vertices, [], faces)
    target.data.name = target.name
    target.data.update(calc_edges=True)
    invalid_normals = [
        polygon.index
        for polygon in target.data.polygons
        if polygon.normal.z < minimum_walkable_normal_z
    ]
    if invalid_normals:
        raise RuntimeError(
            "人物用玄関NavMesh上面の法線が下向きです: "
            f"{invalid_normals}"
        )
    minimum, maximum = world_bounds(target)
    if (
        abs(minimum.x - 0.0) > 1.0e-5
        or abs(maximum.x - 45.4) > 1.0e-4
        or abs(minimum.y + 2.5) > 1.0e-5
        or abs(maximum.y - 47.5) > 1.0e-4
        or abs(minimum.z + 0.30) > 1.0e-5
        or abs(maximum.z - 0.0) > 1.0e-5
    ):
        raise RuntimeError(
            "人物用玄関NavMesh全体範囲が不正です: "
            f"{tuple(minimum)}->{tuple(maximum)}"
        )
    return target


def create_gym_gallery_stair_nav_source(
    nav_collection: bpy.types.Collection,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    def append_surface(
        points: tuple[
            tuple[float, float, float],
            tuple[float, float, float],
            tuple[float, float, float],
            tuple[float, float, float],
        ],
    ) -> None:
        offset = len(vertices)
        vertices.extend(points)
        faces.append((offset, offset + 1, offset + 2, offset + 3))

    _, north_ramps, _, _ = gym_gallery_north_transition_geometry()
    for ramp in north_ramps:
        append_surface(ramp_top_surface(ramp))

    for side in ("West", "East"):
        _, collider_boxes, side_ramps, _, _ = gym_gallery_stair_geometry(side)
        for minimum, maximum in collider_boxes:
            append_surface(
                (
                    (minimum[0], minimum[1], maximum[2]),
                    (maximum[0], minimum[1], maximum[2]),
                    (maximum[0], maximum[1], maximum[2]),
                    (minimum[0], maximum[1], maximum[2]),
                )
            )
        for ramp in side_ramps:
            append_surface(ramp_top_surface(ramp))

    mesh = bpy.data.meshes.new("NAV_B03_Walkable_GymGalleryStairs")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new("NAV_B03_Walkable_GymGalleryStairs", mesh)
    nav_collection.objects.link(obj)
    obj["hs_nav_role"] = "walkable"
    obj["hs_nav_area"] = "stairs"
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


def update_first_floor_nav_blocker_for_west_extension() -> dict[str, int]:
    blocker = bpy.data.objects.get("NAV_Blocker_School1F")
    exterior = bpy.data.objects.get("COL_B03_ExteriorWalls_F01")
    if blocker is None or blocker.type != "MESH":
        raise RuntimeError("NAV_Blocker_School1Fがありません")
    if exterior is None or exterior.type != "MESH":
        raise RuntimeError("COL_B03_ExteriorWalls_F01がありません")
    for obj in (blocker, exterior):
        if len(obj.data.vertices) % 8 != 0 or len(obj.data.polygons) % 6 != 0:
            raise RuntimeError(
                f"西側延長境界のNav blocker元が箱単位ではありません: {obj.name}"
            )

    kept_vertices: list[tuple[float, float, float]] = []
    kept_faces: list[tuple[int, ...]] = []
    removed = 0
    for box_index in range(len(blocker.data.vertices) // 8):
        vertex_offset = box_index * 8
        face_offset = box_index * 6
        points = [
            blocker.matrix_world @ blocker.data.vertices[vertex_offset + index].co
            for index in range(8)
        ]
        minimum = Vector(
            tuple(min(point[axis] for point in points) for axis in range(3))
        )
        maximum = Vector(
            tuple(max(point[axis] for point in points) for axis in range(3))
        )
        replaces_west_outer = (
            abs(minimum.x + 12.75) <= 1.0e-4
            and abs(maximum.x + 12.45) <= 1.0e-4
        )
        replaces_courtyard_west = (
            abs(minimum.x + 0.15) <= 1.0e-4
            and abs(maximum.x - 0.15) <= 1.0e-4
        )
        replaces_south = (
            (
                abs(minimum.y + 3.65) <= 1.0e-4
                and abs(maximum.y + 3.35) <= 1.0e-4
            )
            or (
                abs(minimum.y + 7.15) <= 1.0e-4
                and abs(maximum.y + 6.85) <= 1.0e-4
            )
        )
        replaces_south = replaces_south and maximum.x <= 0.1
        if replaces_west_outer or replaces_courtyard_west or replaces_south:
            removed += 1
            continue
        new_offset = len(kept_vertices)
        kept_vertices.extend(tuple(point) for point in points)
        kept_faces.extend(
            tuple(
                new_offset + vertex_index - vertex_offset
                for vertex_index in blocker.data.polygons[face_offset + index].vertices
            )
            for index in range(6)
        )

    added = 0
    for box_index in range(len(exterior.data.vertices) // 8):
        points = [
            exterior.matrix_world @ exterior.data.vertices[box_index * 8 + index].co
            for index in range(8)
        ]
        minimum = Vector(
            tuple(min(point[axis] for point in points) for axis in range(3))
        )
        maximum = Vector(
            tuple(max(point[axis] for point in points) for axis in range(3))
        )
        is_west_outer = (
            abs(minimum.x + 12.75) <= 1.0e-4
            and abs(maximum.x + 12.45) <= 1.0e-4
        )
        is_courtyard_west = (
            abs(minimum.x + 0.15) <= 1.0e-4
            and abs(maximum.x - 0.15) <= 1.0e-4
        )
        is_new_south = (
            abs(minimum.y + 7.15) <= 1.0e-4
            and abs(maximum.y + 6.85) <= 1.0e-4
            and maximum.x <= 0.1
        )
        if not (is_west_outer or is_courtyard_west or is_new_south):
            continue
        append_box(
            kept_vertices,
            kept_faces,
            tuple(minimum),
            tuple(maximum),
        )
        added += 1

    if removed == 0 or added == 0:
        raise RuntimeError(
            f"西側延長境界のNav blocker更新対象がありません: removed={removed}, added={added}"
        )
    replace_mesh_geometry(blocker.name, kept_vertices, kept_faces)
    return {"removed": removed, "added": added}


def update_gym_nav_blocker_for_bridge_opening() -> dict[str, int]:
    blocker = bpy.data.objects.get("NAV_Blocker_Gym")
    exterior = bpy.data.objects.get("COL_B03_GymExteriorWalls")
    south_wall = bpy.data.objects.get("COL_GymWall_South")
    if blocker is None or blocker.type != "MESH":
        raise RuntimeError("NAV_Blocker_Gymがありません")
    if exterior is None or exterior.type != "MESH":
        raise RuntimeError("COL_B03_GymExteriorWallsがありません")
    if south_wall is None or south_wall.type != "MESH":
        raise RuntimeError("COL_GymWall_Southがありません")
    for obj in (blocker, exterior, south_wall):
        if len(obj.data.vertices) % 8 != 0 or len(obj.data.polygons) % 6 != 0:
            raise RuntimeError(
                f"体育館渡り廊下開口のNav blocker元が箱単位ではありません: {obj.name}"
            )

    kept_vertices: list[tuple[float, float, float]] = []
    kept_faces: list[tuple[int, ...]] = []
    removed = 0
    for box_index in range(len(blocker.data.vertices) // 8):
        vertex_offset = box_index * 8
        face_offset = box_index * 6
        points = [
            blocker.matrix_world @ blocker.data.vertices[vertex_offset + index].co
            for index in range(8)
        ]
        minimum = Vector(
            tuple(min(point[axis] for point in points) for axis in range(3))
        )
        maximum = Vector(
            tuple(max(point[axis] for point in points) for axis in range(3))
        )
        is_old_north_wall = (
            abs(minimum.y - 26.35) <= 1.0e-4
            and abs(maximum.y - 26.65) <= 1.0e-4
            and minimum.x >= 33.4 - 1.0e-4
            and maximum.x <= 57.4 + 1.0e-4
        )
        is_old_stage_side_wall = (
            abs(minimum.y + 4.15) <= 1.0e-4
            and abs(maximum.y + 3.85) <= 1.0e-4
            and (
                (
                    minimum.x >= 33.4 - 1.0e-4
                    and maximum.x <= 39.4 + 1.0e-4
                )
                or (
                    minimum.x >= 51.4 - 1.0e-4
                    and maximum.x <= 57.4 + 1.0e-4
                )
            )
        )
        is_old_east_wall = (
            abs(minimum.x - 57.25) <= 1.0e-4
            and abs(maximum.x - 57.55) <= 1.0e-4
            and minimum.y >= -9.5 - 1.0e-4
            and maximum.y <= 26.5 + 1.0e-4
        )
        is_old_south_wall = (
            abs(minimum.y + 9.65) <= 1.0e-4
            and abs(maximum.y + 9.35) <= 1.0e-4
            and minimum.x >= 33.4 - 1.0e-4
            and maximum.x <= 57.4 + 1.0e-4
        )
        is_current_north_wall = (
            abs(minimum.y - 26.35) <= 1.0e-4
            and abs(maximum.y - 26.65) <= 1.0e-4
            and minimum.x >= 33.4 - 1.0e-4
            and maximum.x <= 59.4 + 1.0e-4
        )
        is_current_east_wall = (
            abs(minimum.x - 59.25) <= 1.0e-4
            and abs(maximum.x - 59.55) <= 1.0e-4
            and minimum.y >= -11.5 - 1.0e-4
            and maximum.y <= 26.5 + 1.0e-4
        )
        is_current_south_wall = (
            abs(minimum.y + 11.65) <= 1.0e-4
            and abs(maximum.y + 11.35) <= 1.0e-4
            and minimum.x >= 33.4 - 1.0e-4
            and maximum.x <= 59.4 + 1.0e-4
        )
        if (
            is_old_north_wall
            or is_old_stage_side_wall
            or is_old_east_wall
            or is_old_south_wall
            or is_current_north_wall
            or is_current_east_wall
            or is_current_south_wall
        ):
            removed += 1
            continue
        new_offset = len(kept_vertices)
        kept_vertices.extend(tuple(point) for point in points)
        kept_faces.extend(
            tuple(
                new_offset + vertex_index - vertex_offset
                for vertex_index in blocker.data.polygons[face_offset + index].vertices
            )
            for index in range(6)
        )

    added = 0
    for box_index in range(len(exterior.data.vertices) // 8):
        points = [
            exterior.matrix_world @ exterior.data.vertices[box_index * 8 + index].co
            for index in range(8)
        ]
        minimum = Vector(
            tuple(min(point[axis] for point in points) for axis in range(3))
        )
        maximum = Vector(
            tuple(max(point[axis] for point in points) for axis in range(3))
        )
        is_current_north_wall = (
            abs(minimum.y - 26.35) <= 1.0e-4
            and abs(maximum.y - 26.65) <= 1.0e-4
            and minimum.x >= 33.4 - 1.0e-4
            and maximum.x <= 59.4 + 1.0e-4
        )
        is_current_east_wall = (
            abs(minimum.x - 59.25) <= 1.0e-4
            and abs(maximum.x - 59.55) <= 1.0e-4
            and minimum.y >= -11.5 - 1.0e-4
            and maximum.y <= 26.5 + 1.0e-4
        )
        if not (is_current_north_wall or is_current_east_wall):
            continue
        append_box(
            kept_vertices,
            kept_faces,
            tuple(minimum),
            tuple(maximum),
        )
        added += 1
    for box_index in range(len(south_wall.data.vertices) // 8):
        points = [
            south_wall.matrix_world
            @ south_wall.data.vertices[box_index * 8 + index].co
            for index in range(8)
        ]
        append_box(
            kept_vertices,
            kept_faces,
            tuple(
                min(point[axis] for point in points)
                for axis in range(3)
            ),
            tuple(
                max(point[axis] for point in points)
                for axis in range(3)
            ),
        )
        added += 1

    if removed == 0 or added == 0:
        raise RuntimeError(
            f"体育館渡り廊下開口のNav blocker更新対象がありません: removed={removed}, added={added}"
        )
    replace_mesh_geometry(blocker.name, kept_vertices, kept_faces)
    return {"removed": removed, "added": added}


def b06_roof_north_reference_geometry(
    *,
    suppress_stair_contact_faces: bool = False,
) -> tuple[
    tuple[tuple[float, float, float], ...],
    tuple[tuple[int, ...], ...],
]:
    roof_wall_footprints = tuple(
        (minimum[0], minimum[1], maximum[0], maximum[1])
        for minimum, maximum in ROOFTOP_FACILITY_WALL_BOXES
    ) + (
        (-12.60, 38.90, -12.45, 45.50),
        (-12.45, 45.35, 2.40, 45.50),
    )
    if suppress_stair_contact_faces:
        x_coordinates = tuple(
            sorted(
                {
                    -12.60,
                    -12.45,
                    -9.00,
                    -6.75,
                    -6.45,
                    2.40,
                    47.40,
                    *(
                        coordinate
                        for minimum_x, _, maximum_x, _ in roof_wall_footprints
                        for coordinate in (minimum_x, maximum_x)
                        if -12.60 <= coordinate <= 47.40
                    ),
                }
            )
        )
        y_coordinates = tuple(
            sorted(
                {
                    32.50,
                    38.50,
                    38.60,
                    38.90,
                    39.20,
                    45.35,
                    45.50,
                    *(
                        coordinate
                        for _, minimum_y, _, maximum_y in roof_wall_footprints
                        for coordinate in (minimum_y, maximum_y)
                    ),
                }
            )
        )
    else:
        # Collider / NavMesh は修正前と同じ連続床・同じ分割を維持する。
        # 屋上壁の占有部分を除くのは表示床だけであり、物理床へ表示都合の
        # breakpointを伝播させない。
        x_coordinates = (-12.60, -12.45, -9.00, -6.75, -6.45, 47.40)
        y_coordinates = (32.50, 38.50, 38.60, 38.90, 39.20, 45.35, 45.50)
    occupied: set[tuple[int, int]] = set()
    stair_connector_cells: set[tuple[int, int]] = set()
    for x_index in range(len(x_coordinates) - 1):
        x_minimum = x_coordinates[x_index]
        x_maximum = x_coordinates[x_index + 1]
        for y_index in range(len(y_coordinates) - 1):
            y_minimum = y_coordinates[y_index]
            y_maximum = y_coordinates[y_index + 1]
            is_rooftop_wall_footprint = any(
                x_minimum >= footprint_minimum_x
                and x_maximum <= footprint_maximum_x
                and y_minimum >= footprint_minimum_y
                and y_maximum <= footprint_maximum_y
                for (
                    footprint_minimum_x,
                    footprint_minimum_y,
                    footprint_maximum_x,
                    footprint_maximum_y,
                ) in roof_wall_footprints
            )
            if is_rooftop_wall_footprint and suppress_stair_contact_faces:
                stair_connector_cells.add((x_index, y_index))
                continue
            is_stair_connector = (
                x_minimum >= -9.00
                and x_maximum <= -6.45
                and y_minimum >= 38.60
                and y_maximum <= 38.90
            )
            if is_stair_connector:
                stair_connector_cells.add((x_index, y_index))
                continue
            is_south_roof = y_maximum <= 38.60
            is_connector_cutout_band = (
                y_minimum >= 38.60
                and y_maximum <= 38.90
                and (x_maximum <= -9.00 or x_minimum >= -6.45)
            )
            is_stairwell_band = (
                y_minimum >= 38.90
                and y_maximum <= 45.35
                and (x_maximum <= -12.45 or x_minimum >= -6.45)
            )
            is_north_border = y_minimum >= 45.35
            if (
                is_south_roof
                or is_connector_cutout_band
                or is_stairwell_band
                or is_north_border
            ):
                occupied.add((x_index, y_index))

    vertices: list[tuple[float, float, float]] = []
    vertex_indices: dict[tuple[float, float, float], int] = {}
    faces: list[tuple[int, ...]] = []

    def vertex_index(coordinate: tuple[float, float, float]) -> int:
        existing = vertex_indices.get(coordinate)
        if existing is not None:
            return existing
        index = len(vertices)
        vertices.append(coordinate)
        vertex_indices[coordinate] = index
        return index

    def append_face(*coordinates: tuple[float, float, float]) -> None:
        faces.append(tuple(vertex_index(coordinate) for coordinate in coordinates))

    z_minimum = 14.40
    z_maximum = 14.50
    surface_occupied = (
        occupied | stair_connector_cells
        if suppress_stair_contact_faces
        else occupied
    )
    for x_index, y_index in sorted(occupied):
        x_minimum = x_coordinates[x_index]
        x_maximum = x_coordinates[x_index + 1]
        y_minimum = y_coordinates[y_index]
        y_maximum = y_coordinates[y_index + 1]
        append_face(
            (x_minimum, y_maximum, z_minimum),
            (x_maximum, y_maximum, z_minimum),
            (x_maximum, y_minimum, z_minimum),
            (x_minimum, y_minimum, z_minimum),
        )
        append_face(
            (x_minimum, y_minimum, z_maximum),
            (x_maximum, y_minimum, z_maximum),
            (x_maximum, y_maximum, z_maximum),
            (x_minimum, y_maximum, z_maximum),
        )
        if (x_index - 1, y_index) not in surface_occupied:
            append_face(
                (x_minimum, y_minimum, z_minimum),
                (x_minimum, y_minimum, z_maximum),
                (x_minimum, y_maximum, z_maximum),
                (x_minimum, y_maximum, z_minimum),
            )
        if (x_index + 1, y_index) not in surface_occupied:
            append_face(
                (x_maximum, y_minimum, z_minimum),
                (x_maximum, y_maximum, z_minimum),
                (x_maximum, y_maximum, z_maximum),
                (x_maximum, y_minimum, z_maximum),
            )
        if (x_index, y_index - 1) not in surface_occupied:
            append_face(
                (x_minimum, y_minimum, z_minimum),
                (x_maximum, y_minimum, z_minimum),
                (x_maximum, y_minimum, z_maximum),
                (x_minimum, y_minimum, z_maximum),
            )
        if (x_index, y_index + 1) not in surface_occupied:
            append_face(
                (x_minimum, y_maximum, z_minimum),
                (x_minimum, y_maximum, z_maximum),
                (x_maximum, y_maximum, z_maximum),
                (x_maximum, y_maximum, z_minimum),
            )
    return tuple(vertices), tuple(faces)


def create_b06_rooftop_nav_reference_sources() -> tuple[str, str]:
    collider_collection = collection(COL_COLLECTION_NAME)
    north_vertices, north_faces = b06_roof_north_reference_geometry(
        suppress_stair_contact_faces=False
    )
    north_mesh = bpy.data.meshes.new("TMP_B06_RoofNorthNavSource")
    north_mesh.from_pydata(north_vertices, [], north_faces)
    north_mesh.update(calc_edges=True)
    north = bpy.data.objects.new("TMP_B06_RoofNorthNavSource", north_mesh)
    collider_collection.objects.link(north)
    west = create_mesh_object(
        "TMP_B06_RoofWestNavSource",
        [((-12.6, -6.7, 14.4), (0.0, 32.5, 14.5))],
        collider_collection,
    )
    return north.name, west.name


def build_nav_sources(
    nav_collection: bpy.types.Collection,
    generated_upper_colliders: list[bpy.types.Object],
    window_colliders: list[bpy.types.Object],
    b03_3b_result: dict[str, tuple[str, ...]],
    escape_mound_result: dict[str, tuple[str, ...]],
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
    copy_meshes_into_object(
        "NAV_Walkable_Interior1F",
        [
            "COL_Floor_WestWing",
            "COL_Floor_NorthWing",
            "COL_Floor_Gym",
            "COL_Floor_GymStorage",
            "COL_GymStage",
            "COL_GymStageStairRamp_West",
            "COL_GymStageStairRamp_East",
            "COL_B03_WestExtensionFloor_F01",
        ],
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
    )
    for floor in (2, 3, 4):
        source_names = [f"COL_B03_Floor_F{floor:02d}"]
        if floor == 2:
            source_names.append("COL_B03_GymBridgeFloor")
        copy_meshes_into_object(
            f"NAV_Walkable_Interior{floor}F",
            source_names,
            nav_collection,
            {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
        )
    copy_meshes_into_object(
        "NAV_Walkable_StairsNWUpper",
        list(UPPER_STAIR_NAV_SOURCE_NAMES),
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "stairs"},
    )
    rooftop_nav_source_names = create_b06_rooftop_nav_reference_sources()
    copy_meshes_into_object(
        "NAV_Walkable_Rooftop",
        [
            *rooftop_nav_source_names,
            "COL_PoolRaisedDeck_West",
            "COL_PoolRaisedDeck_East",
            "COL_PoolRaisedDeck_North",
            "COL_PoolRaisedDeck_South",
            "COL_PoolDeckAccessRamp_West",
            "COL_PoolBasinRamp_East",
            "COL_PoolBasinFloor",
            *escape_mound_result["school_nav_sources"],
        ],
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
        additional_boxes=tuple(
            floor_finish_boxes(14.4, WEST_EXTENSION_FLOOR_PANELS_XY)
            + [((-11.8, -6.7, 14.25), (-8.8, -3.5, 14.4))]
        ),
    )
    for source_name in rooftop_nav_source_names:
        unlink_and_remove_object(bpy.data.objects[source_name])
    copy_meshes_into_object(
        "NAV_B03_Walkable_GymGallery",
        list(b03_3b_result["gallery_nav_sources"]),
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
    )
    create_gym_gallery_stair_nav_source(nav_collection)
    copy_meshes_into_object(
        "NAV_B03_Walkable_GymRooftop",
        list(b03_3b_result["gym_rooftop_nav_sources"])
        + list(escape_mound_result["gym_nav_sources"]),
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
    )
    copy_meshes_into_object(
        "NAV_B03_Walkable_GymRoofRamp",
        list(b03_3b_result["gym_roof_ramp_nav_sources"]),
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "stairs"},
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
    blocker_sources.extend(b03_3b_result["blocker_names"])
    rooftop_facility_shell = bpy.data.objects.get("COL_RooftopFacilityShell")
    if rooftop_facility_shell is None or rooftop_facility_shell.type != "MESH":
        raise RuntimeError("屋上施設Colliderがありません: COL_RooftopFacilityShell")
    rooftop_facility_bounds = mesh_component_world_bounds(rooftop_facility_shell)
    rooftop_facility_wall_bounds = [
        (minimum, maximum)
        for minimum, maximum in rooftop_facility_bounds
        if minimum.z < 16.85
    ]
    rooftop_facility_roof_bounds = [
        (minimum, maximum)
        for minimum, maximum in rooftop_facility_bounds
        if minimum.z >= 16.85
    ]
    if (
        len(rooftop_facility_bounds) != 15
        or len(rooftop_facility_wall_bounds) != 12
        or len(rooftop_facility_roof_bounds) != 3
    ):
        raise RuntimeError(
            "屋上施設の人物Nav blocker分離数が不正です: "
            f"all={len(rooftop_facility_bounds)}, "
            f"walls={len(rooftop_facility_wall_bounds)}, "
            f"roofs={len(rooftop_facility_roof_bounds)}"
        )
    copy_meshes_into_object(
        "NAV_Blocker_SchoolUpper",
        sorted(blocker_sources),
        nav_collection,
        {"hs_nav_role": "blocker"},
        additional_boxes=tuple(
            (tuple(minimum), tuple(maximum))
            for minimum, maximum in rooftop_facility_wall_bounds
        ),
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
        source_z_offsets = None
        additional_boxes = ()
        if object_name == "NAV_BitFlight_ExteriorF4":
            source_names = ["COL_B03_GymRoofWalkable"]
            source_z_offsets = {
                "COL_B03_GymRoofWalkable": 2.60,
            }
            additional_boxes = (
                ((-18.6, -14.5, 12.05), (33.4, 51.5, 12.20)),
                ((59.4, -14.5, 12.05), (63.4, 51.5, 12.20)),
                ((33.4, -14.5, 12.05), (59.4, -11.5, 12.20)),
                ((33.4, 26.5, 12.05), (59.4, 51.5, 12.20)),
            )
        obj = copy_meshes_into_object(
            object_name,
            source_names,
            nav_collection,
            band_properties[object_name],
            source_z_offsets=source_z_offsets,
            additional_boxes=additional_boxes,
        )
        if source_z_offsets is None:
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


def b06_wall_join_target_objects(prefix: str) -> tuple[bpy.types.Object, ...]:
    exact_names = {
        f"{prefix}B03_ElevatorShaftShell",
        f"{prefix}B03_GymExteriorWalls",
        f"{prefix}B03_GymStageSideWalls",
        f"{prefix}B03_GymStorageNorthWall",
        f"{prefix}B03_StairBoundaryCaps_F01",
        f"{prefix}B06_GymBridgeSideInfill",
    }
    if prefix == "VIS_":
        exact_names.add("VIS_RooftopFacilityWalls")
    target_names = {
        obj.name
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and (
            obj.name in exact_names
            or obj.name.startswith(f"{prefix}Wall_")
            or obj.name.startswith(f"{prefix}B03_ExteriorWalls_F")
            or obj.name.startswith(f"{prefix}B03_InteriorWalls_F")
            or (
                prefix == "VIS_"
                and obj.name.startswith("VIS_B03_Interior_F")
                and obj.name.endswith("_Toilets_Architecture")
            )
            or (
                prefix == "COL_"
                and obj.name.startswith("COL_B03_Interior_Walls_F")
                and obj.name.endswith("_Toilets")
            )
        )
    }
    return tuple(bpy.data.objects[name] for name in sorted(target_names))


def b06_floor_owner_components(
    prefix: str,
) -> tuple[
    tuple[
        tuple[float, float, float],
        tuple[float, float, float],
    ],
    ...,
]:
    exact_names = {
        f"{prefix}B03_GymBridgeFloor",
        f"{prefix}B03_GymBridgeSchoolFloorJoint",
        f"{prefix}B03_GymGalleryFloor",
        f"{prefix}B03_WestExtensionFloor_F01",
        f"{prefix}B06_WestExtensionFloorFinish_F01",
    }
    if prefix == "VIS_":
        exact_names.add("VIS_RooftopFacilityRoofs")
    floor_objects = tuple(
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and (
            obj.name in exact_names
            or obj.name.startswith(f"{prefix}B03_Floor_F")
            or obj.name.startswith(f"{prefix}Floor_")
        )
        and "Accent" not in obj.name
    )
    return tuple(
        (
            tuple(round(value, 5) for value in minimum),
            tuple(round(value, 5) for value in maximum),
        )
        for obj in sorted(floor_objects, key=lambda item: item.name)
        for minimum, maximum in mesh_component_world_bounds(obj)
        if all(maximum[axis] - minimum[axis] > 1.0e-6 for axis in range(3))
    )


def merge_wall_union_cells(
    x_coordinates: tuple[float, ...],
    y_coordinates: tuple[float, ...],
    cells: set[tuple[int, int]],
) -> list[tuple[float, float, float, float]]:
    remaining = set(cells)
    rectangles = []
    while remaining:
        start_x, start_y = min(remaining, key=lambda cell: (cell[1], cell[0]))
        end_x = start_x
        while (end_x + 1, start_y) in remaining:
            end_x += 1
        end_y = start_y
        while all(
            (cell_x, end_y + 1) in remaining
            for cell_x in range(start_x, end_x + 1)
        ):
            end_y += 1
        for cell_y in range(start_y, end_y + 1):
            for cell_x in range(start_x, end_x + 1):
                remaining.remove((cell_x, cell_y))
        rectangles.append(
            (
                x_coordinates[start_x],
                x_coordinates[end_x + 1],
                y_coordinates[start_y],
                y_coordinates[end_y + 1],
            )
        )
    return rectangles


WallSurfaceRectangle = tuple[int, int, int, int, int, int, int]
WallSurfaceSpatialLineKey = tuple[int, float, float]
WallSurfaceLineKey = tuple[int, float, int, float, float]


def owned_voxel_surface_rectangles(
    owned_cells: set[tuple[int, int, int]],
    occupied_cells: set[tuple[int, int, int]],
    x_coordinates: tuple[float, ...],
    y_coordinates: tuple[float, ...],
    z_coordinates: tuple[float, ...],
) -> tuple[WallSurfaceRectangle, ...]:
    surface_cells: dict[
        tuple[int, int, int],
        set[tuple[int, int]],
    ] = {}

    def add_surface_cell(
        axis: int,
        direction: int,
        plane_index: int,
        first_index: int,
        second_index: int,
    ) -> None:
        surface_cells.setdefault((axis, direction, plane_index), set()).add(
            (first_index, second_index)
        )

    for cell_x, cell_y, cell_z in sorted(
        owned_cells,
        key=lambda cell: (cell[2], cell[1], cell[0]),
    ):
        if (cell_x, cell_y, cell_z - 1) not in occupied_cells:
            add_surface_cell(2, -1, cell_z, cell_x, cell_y)
        if (cell_x, cell_y, cell_z + 1) not in occupied_cells:
            add_surface_cell(2, 1, cell_z + 1, cell_x, cell_y)
        if (cell_x, cell_y - 1, cell_z) not in occupied_cells:
            add_surface_cell(1, -1, cell_y, cell_x, cell_z)
        if (cell_x + 1, cell_y, cell_z) not in occupied_cells:
            add_surface_cell(0, 1, cell_x + 1, cell_y, cell_z)
        if (cell_x, cell_y + 1, cell_z) not in occupied_cells:
            add_surface_cell(1, 1, cell_y + 1, cell_x, cell_z)
        if (cell_x - 1, cell_y, cell_z) not in occupied_cells:
            add_surface_cell(0, -1, cell_x, cell_y, cell_z)

    surface_rectangles: list[WallSurfaceRectangle] = []
    for (axis, direction, plane_index), plane_cells in sorted(surface_cells.items()):
        if axis == 2:
            first_coordinates = x_coordinates
            second_coordinates = y_coordinates
        elif axis == 1:
            first_coordinates = x_coordinates
            second_coordinates = z_coordinates
        else:
            first_coordinates = y_coordinates
            second_coordinates = z_coordinates

        first_index_by_coordinate = {
            coordinate: index for index, coordinate in enumerate(first_coordinates)
        }
        second_index_by_coordinate = {
            coordinate: index for index, coordinate in enumerate(second_coordinates)
        }
        for (
            first_minimum,
            first_maximum,
            second_minimum,
            second_maximum,
        ) in merge_wall_union_cells(
            first_coordinates,
            second_coordinates,
            plane_cells,
        ):
            surface_rectangles.append(
                (
                    axis,
                    direction,
                    plane_index,
                    first_index_by_coordinate[first_minimum],
                    first_index_by_coordinate[first_maximum],
                    second_index_by_coordinate[second_minimum],
                    second_index_by_coordinate[second_maximum],
                )
            )
    return tuple(surface_rectangles)


def wall_surface_rectangle_corners(
    rectangle: WallSurfaceRectangle,
    x_coordinates: tuple[float, ...],
    y_coordinates: tuple[float, ...],
    z_coordinates: tuple[float, ...],
) -> tuple[tuple[float, float, float], ...]:
    (
        axis,
        _direction,
        plane_index,
        first_start,
        first_end,
        second_start,
        second_end,
    ) = rectangle
    if axis == 2:
        return (
            (x_coordinates[first_start], y_coordinates[second_start], z_coordinates[plane_index]),
            (x_coordinates[first_start], y_coordinates[second_end], z_coordinates[plane_index]),
            (x_coordinates[first_end], y_coordinates[second_end], z_coordinates[plane_index]),
            (x_coordinates[first_end], y_coordinates[second_start], z_coordinates[plane_index]),
        )
    if axis == 1:
        return (
            (x_coordinates[first_start], y_coordinates[plane_index], z_coordinates[second_start]),
            (x_coordinates[first_end], y_coordinates[plane_index], z_coordinates[second_start]),
            (x_coordinates[first_end], y_coordinates[plane_index], z_coordinates[second_end]),
            (x_coordinates[first_start], y_coordinates[plane_index], z_coordinates[second_end]),
        )
    return (
        (x_coordinates[plane_index], y_coordinates[first_start], z_coordinates[second_start]),
        (x_coordinates[plane_index], y_coordinates[first_end], z_coordinates[second_start]),
        (x_coordinates[plane_index], y_coordinates[first_end], z_coordinates[second_end]),
        (x_coordinates[plane_index], y_coordinates[first_start], z_coordinates[second_end]),
    )


def wall_surface_spatial_line_key(
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    object_name: str,
) -> tuple[WallSurfaceSpatialLineKey, int]:
    varying_axes = [
        axis for axis in range(3) if abs(start[axis] - end[axis]) > 1.0e-8
    ]
    if len(varying_axes) != 1:
        raise RuntimeError(
            f"B06-1外周面に軸平行でない辺があります: "
            f"{object_name} {start} {end}"
        )
    varying_axis = varying_axes[0]
    fixed = tuple(start[axis] for axis in range(3) if axis != varying_axis)
    return (varying_axis, fixed[0], fixed[1]), varying_axis


def wall_surface_line_key(
    rectangle: WallSurfaceRectangle,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    x_coordinates: tuple[float, ...],
    y_coordinates: tuple[float, ...],
    z_coordinates: tuple[float, ...],
    object_name: str,
) -> tuple[WallSurfaceLineKey, int]:
    spatial_line_key, varying_axis = wall_surface_spatial_line_key(
        start,
        end,
        object_name,
    )
    plane_axis = rectangle[0]
    plane_index = rectangle[2]
    plane_coordinates = (x_coordinates, y_coordinates, z_coordinates)[plane_axis]
    return (
        plane_axis,
        plane_coordinates[plane_index],
        spatial_line_key[0],
        spatial_line_key[1],
        spatial_line_key[2],
    ), varying_axis


def wall_surface_line_breakpoints(
    surface_rectangles_by_object: dict[
        str,
        tuple[WallSurfaceRectangle, ...],
    ],
    x_coordinates: tuple[float, ...],
    y_coordinates: tuple[float, ...],
    z_coordinates: tuple[float, ...],
    label: str,
) -> dict[WallSurfaceLineKey, set[float]]:
    line_breakpoints: dict[WallSurfaceLineKey, set[float]] = {}
    object_line_breakpoints: dict[
        tuple[str, WallSurfaceSpatialLineKey],
        set[float],
    ] = {}
    related_line_keys: set[
        tuple[
            WallSurfaceLineKey,
            tuple[str, WallSurfaceSpatialLineKey],
        ]
    ] = set()
    vertices_by_plane: dict[
        tuple[int, float],
        set[tuple[float, float, float]],
    ] = {}
    vertices_by_object: dict[str, set[tuple[float, float, float]]] = {}
    for object_name in sorted(surface_rectangles_by_object):
        for rectangle in surface_rectangles_by_object[object_name]:
            corners = wall_surface_rectangle_corners(
                rectangle,
                x_coordinates,
                y_coordinates,
                z_coordinates,
            )
            plane_axis = rectangle[0]
            plane_coordinate = (x_coordinates, y_coordinates, z_coordinates)[
                plane_axis
            ][rectangle[2]]
            vertices_by_plane.setdefault(
                (plane_axis, plane_coordinate), set()
            ).update(corners)
            vertices_by_object.setdefault(object_name, set()).update(corners)
            for start, end in zip(corners, corners[1:] + corners[:1]):
                plane_line_key, varying_axis = wall_surface_line_key(
                    rectangle,
                    start,
                    end,
                    x_coordinates,
                    y_coordinates,
                    z_coordinates,
                    label,
                )
                spatial_line_key, _ = wall_surface_spatial_line_key(
                    start,
                    end,
                    label,
                )
                object_line_key = (object_name, spatial_line_key)
                edge_values = (start[varying_axis], end[varying_axis])
                line_breakpoints.setdefault(plane_line_key, set()).update(
                    edge_values
                )
                object_line_breakpoints.setdefault(object_line_key, set()).update(
                    edge_values
                )
                related_line_keys.add((plane_line_key, object_line_key))

    # 同一Object内では、別平面の面頂点も同じ空間line上のedgeを分割する。
    # 外部Object由来の分割点が角を共有する別面へ伝播するための正本である。
    for object_name, coordinates in vertices_by_object.items():
        for coordinate in coordinates:
            for varying_axis in range(3):
                fixed = tuple(
                    coordinate[axis] for axis in range(3) if axis != varying_axis
                )
                spatial_line_key = (varying_axis, fixed[0], fixed[1])
                object_line_key = (object_name, spatial_line_key)
                if object_line_key in object_line_breakpoints:
                    object_line_breakpoints[object_line_key].add(
                        coordinate[varying_axis]
                    )

    # 別Object間では同一平面・同一直線に限定して面頂点を共有する。
    for (plane_axis, plane_coordinate), coordinates in vertices_by_plane.items():
        for coordinate in coordinates:
            for varying_axis in range(3):
                if varying_axis == plane_axis:
                    continue
                fixed = tuple(
                    coordinate[axis] for axis in range(3) if axis != varying_axis
                )
                plane_line_key = (
                    plane_axis,
                    plane_coordinate,
                    varying_axis,
                    fixed[0],
                    fixed[1],
                )
                if plane_line_key in line_breakpoints:
                    line_breakpoints[plane_line_key].add(
                        coordinate[varying_axis]
                    )

    # plane-lineの共有とObject内spatial-lineの共有を固定点まで伝播する。
    # これにより、別Objectから導入された点が同一Objectの別平面へ伝わり、
    # さらにその平面を共有する別Objectへも欠落なく伝わる。
    changed = True
    while changed:
        changed = False
        for plane_line_key, object_line_key in sorted(related_line_keys):
            plane_values = line_breakpoints[plane_line_key]
            object_values = object_line_breakpoints[object_line_key]
            shared_values = plane_values | object_values
            if len(shared_values) != len(plane_values):
                plane_values.update(shared_values)
                changed = True
            if len(shared_values) != len(object_values):
                object_values.update(shared_values)
                changed = True
    return line_breakpoints


def replace_owned_voxel_surface(
    object_name: str,
    owned_cells: set[tuple[int, int, int]],
    occupied_cells: set[tuple[int, int, int]],
    x_coordinates: tuple[float, ...],
    y_coordinates: tuple[float, ...],
    z_coordinates: tuple[float, ...],
    cross_object_line_breakpoints: dict[WallSurfaceLineKey, set[float]],
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    vertex_index_by_coordinate: dict[
        tuple[
            tuple[float, float, float],
            tuple[int, int, int],
        ],
        int,
    ] = {}

    x_index = {coordinate: index for index, coordinate in enumerate(x_coordinates)}
    y_index = {coordinate: index for index, coordinate in enumerate(y_coordinates)}
    z_index = {coordinate: index for index, coordinate in enumerate(z_coordinates)}

    def local_fan_owner(
        cell: tuple[int, int, int],
        coordinate: tuple[float, float, float],
    ) -> tuple[int, int, int]:
        coordinate_indices = (
            x_index[coordinate[0]],
            y_index[coordinate[1]],
            z_index[coordinate[2]],
        )
        incident_cells = {
            (candidate_x, candidate_y, candidate_z)
            for candidate_x in (
                coordinate_indices[0] - 1,
                coordinate_indices[0],
            )
            for candidate_y in (
                coordinate_indices[1] - 1,
                coordinate_indices[1],
            )
            for candidate_z in (
                coordinate_indices[2] - 1,
                coordinate_indices[2],
            )
            if (candidate_x, candidate_y, candidate_z) in owned_cells
        }
        connected = {cell}
        pending = [cell]
        while pending:
            current = pending.pop()
            for candidate in incident_cells - connected:
                if sum(
                    abs(current[axis] - candidate[axis]) for axis in range(3)
                ) == 1:
                    connected.add(candidate)
                    pending.append(candidate)
        return min(connected)

    def vertex_index(
        cell: tuple[int, int, int],
        coordinate: tuple[float, float, float],
    ) -> int:
        key = (coordinate, local_fan_owner(cell, coordinate))
        index = vertex_index_by_coordinate.get(key)
        if index is None:
            index = len(vertices)
            vertex_index_by_coordinate[key] = index
            vertices.append(coordinate)
        return index

    def append_face(
        *corners: tuple[
            tuple[int, int, int],
            tuple[float, float, float],
        ],
    ) -> None:
        faces.append(
            tuple(vertex_index(cell, coordinate) for cell, coordinate in corners)
        )

    surface_rectangles = owned_voxel_surface_rectangles(
        owned_cells,
        occupied_cells,
        x_coordinates,
        y_coordinates,
        z_coordinates,
    )
    line_breakpoints = wall_surface_line_breakpoints(
        {object_name: surface_rectangles},
        x_coordinates,
        y_coordinates,
        z_coordinates,
        object_name,
    )
    for key, values in cross_object_line_breakpoints.items():
        line_breakpoints.setdefault(key, set()).update(values)

    for rectangle in surface_rectangles:
        (
            axis,
            direction,
            plane_index,
            first_start,
            first_end,
            second_start,
            second_end,
        ) = rectangle
        rectangle_points = wall_surface_rectangle_corners(
            rectangle,
            x_coordinates,
            y_coordinates,
            z_coordinates,
        )
        perimeter: list[tuple[float, float, float]] = []
        for start, end in zip(
            rectangle_points,
            rectangle_points[1:] + rectangle_points[:1],
        ):
            key, varying_axis = wall_surface_line_key(
                rectangle,
                start,
                end,
                x_coordinates,
                y_coordinates,
                z_coordinates,
                object_name,
            )
            minimum = min(start[varying_axis], end[varying_axis])
            maximum = max(start[varying_axis], end[varying_axis])
            values = sorted(
                value
                for value in line_breakpoints[key]
                if minimum - 1.0e-8 <= value <= maximum + 1.0e-8
            )
            if start[varying_axis] > end[varying_axis]:
                values.reverse()
            for value in values[:-1]:
                coordinate = list(start)
                coordinate[varying_axis] = value
                perimeter.append(tuple(coordinate))

        corners = []
        for coordinate in perimeter:
            if axis == 2:
                first_index = x_index[coordinate[0]]
                second_index = y_index[coordinate[1]]
                cell_z = plane_index if direction < 0 else plane_index - 1
                cell = (
                    min(max(first_index, first_start), first_end - 1),
                    min(max(second_index, second_start), second_end - 1),
                    cell_z,
                )
            elif axis == 1:
                first_index = x_index[coordinate[0]]
                second_index = z_index[coordinate[2]]
                cell_y = plane_index if direction < 0 else plane_index - 1
                cell = (
                    min(max(first_index, first_start), first_end - 1),
                    cell_y,
                    min(max(second_index, second_start), second_end - 1),
                )
            else:
                first_index = y_index[coordinate[1]]
                second_index = z_index[coordinate[2]]
                cell_x = plane_index if direction < 0 else plane_index - 1
                cell = (
                    cell_x,
                    min(max(first_index, first_start), first_end - 1),
                    min(max(second_index, second_start), second_end - 1),
                )
            corners.append((cell, coordinate))

        reverse_winding = (axis in (1, 2) and direction > 0) or (
            axis == 0 and direction < 0
        )
        if reverse_winding:
            corners.reverse()
        append_face(*corners)

    if not faces:
        raise RuntimeError(f"B06-1共有壁の外周面が空です: {object_name}")
    return replace_mesh_geometry_with_oriented_faces(object_name, vertices, faces)


def replace_existing_union_boxes(
    object_name: str,
    boxes: list[
        tuple[
            tuple[float, float, float],
            tuple[float, float, float],
        ]
    ],
) -> bpy.types.Object:
    """重なる直方体群を一つの外周面へ統合して既存Meshを置換する。"""
    if not boxes:
        raise RuntimeError(f"B06-1外周統合対象の箱が空です: {object_name}")
    normalized_boxes = [
        (
            tuple(round(coordinate, 4) for coordinate in minimum),
            tuple(round(coordinate, 4) for coordinate in maximum),
        )
        for minimum, maximum in boxes
    ]
    for minimum, maximum in normalized_boxes:
        if any(minimum[axis] >= maximum[axis] for axis in range(3)):
            raise RuntimeError(
                f"B06-1外周統合対象に退化した箱があります: "
                f"{object_name} {minimum} {maximum}"
            )
    x_coordinates = tuple(
        sorted(
            {
                coordinate
                for minimum, maximum in normalized_boxes
                for coordinate in (minimum[0], maximum[0])
            }
        )
    )
    y_coordinates = tuple(
        sorted(
            {
                coordinate
                for minimum, maximum in normalized_boxes
                for coordinate in (minimum[1], maximum[1])
            }
        )
    )
    z_coordinates = tuple(
        sorted(
            {
                coordinate
                for minimum, maximum in normalized_boxes
                for coordinate in (minimum[2], maximum[2])
            }
        )
    )
    x_index = {coordinate: index for index, coordinate in enumerate(x_coordinates)}
    y_index = {coordinate: index for index, coordinate in enumerate(y_coordinates)}
    z_index = {coordinate: index for index, coordinate in enumerate(z_coordinates)}
    occupied_cells: set[tuple[int, int, int]] = set()
    for minimum, maximum in normalized_boxes:
        for cell_z in range(z_index[minimum[2]], z_index[maximum[2]]):
            for cell_y in range(y_index[minimum[1]], y_index[maximum[1]]):
                for cell_x in range(x_index[minimum[0]], x_index[maximum[0]]):
                    occupied_cells.add((cell_x, cell_y, cell_z))
    return replace_owned_voxel_surface(
        object_name,
        occupied_cells,
        occupied_cells,
        x_coordinates,
        y_coordinates,
        z_coordinates,
        {},
    )


def merge_wall_cells_to_cuboid_bounds(
    cells: set[tuple[int, int, int]],
    x_coordinates: tuple[float, ...],
    y_coordinates: tuple[float, ...],
    z_coordinates: tuple[float, ...],
) -> tuple[
    tuple[
        tuple[float, float, float],
        tuple[float, float, float],
    ],
    ...,
]:
    """共有壁の占有セルを、空洞を横断しない直方体へ正確に分解する。"""
    remaining = set(cells)
    result = []
    while remaining:
        start_x, start_y, start_z = min(
            remaining,
            key=lambda cell: (cell[2], cell[1], cell[0]),
        )
        end_x = start_x + 1
        while (end_x, start_y, start_z) in remaining:
            end_x += 1

        end_y = start_y + 1
        while all(
            (cell_x, end_y, start_z) in remaining
            for cell_x in range(start_x, end_x)
        ):
            end_y += 1

        end_z = start_z + 1
        while all(
            (cell_x, cell_y, end_z) in remaining
            for cell_y in range(start_y, end_y)
            for cell_x in range(start_x, end_x)
        ):
            end_z += 1

        for cell_z in range(start_z, end_z):
            for cell_y in range(start_y, end_y):
                for cell_x in range(start_x, end_x):
                    remaining.remove((cell_x, cell_y, cell_z))
        result.append(
            (
                (
                    x_coordinates[start_x],
                    y_coordinates[start_y],
                    z_coordinates[start_z],
                ),
                (
                    x_coordinates[end_x],
                    y_coordinates[end_y],
                    z_coordinates[end_z],
                ),
            )
        )
    return tuple(result)


def rebuild_shared_wall_planar_union(prefix: str) -> int:
    targets = b06_wall_join_target_objects(prefix)
    source_components = [
        (
            obj.name,
            tuple(round(value, 5) for value in minimum),
            tuple(round(value, 5) for value in maximum),
        )
        for obj in targets
        for minimum, maximum in mesh_component_world_bounds(obj)
        if all(maximum[axis] - minimum[axis] > 1.0e-6 for axis in range(3))
    ]
    if not source_components:
        raise RuntimeError(f"B06-1壁平面の2D結合対象がありません: {prefix}")
    floor_owner_components = b06_floor_owner_components(prefix)
    coordinate_components = tuple(
        (minimum, maximum)
        for _, minimum, maximum in source_components
    ) + floor_owner_components

    x_coordinates = tuple(
        sorted(
            {
                coordinate
                for minimum, maximum in coordinate_components
                for coordinate in (minimum[0], maximum[0])
            }
        )
    )
    y_coordinates = tuple(
        sorted(
            {
                coordinate
                for minimum, maximum in coordinate_components
                for coordinate in (minimum[1], maximum[1])
            }
        )
    )
    z_coordinates = tuple(
        sorted(
            {
                coordinate
                for minimum, maximum in coordinate_components
                for coordinate in (minimum[2], maximum[2])
            }
        )
    )
    x_index = {coordinate: index for index, coordinate in enumerate(x_coordinates)}
    y_index = {coordinate: index for index, coordinate in enumerate(y_coordinates)}
    z_index = {coordinate: index for index, coordinate in enumerate(z_coordinates)}
    floor_owner_cells: set[tuple[int, int, int]] = set()
    for minimum, maximum in floor_owner_components:
        for cell_z in range(z_index[minimum[2]], z_index[maximum[2]]):
            for cell_y in range(y_index[minimum[1]], y_index[maximum[1]]):
                for cell_x in range(x_index[minimum[0]], x_index[maximum[0]]):
                    floor_owner_cells.add((cell_x, cell_y, cell_z))
    owner_by_cell: dict[tuple[int, int, int], str] = {}
    shared_cell_count = 0
    for object_name, minimum, maximum in sorted(source_components):
        for cell_z in range(z_index[minimum[2]], z_index[maximum[2]]):
            for cell_y in range(y_index[minimum[1]], y_index[maximum[1]]):
                for cell_x in range(x_index[minimum[0]], x_index[maximum[0]]):
                    cell = (cell_x, cell_y, cell_z)
                    if cell in floor_owner_cells:
                        continue
                    if cell in owner_by_cell:
                        shared_cell_count += 1
                        continue
                    owner_by_cell[cell] = object_name

    # 直交する壁箱が格子の対角だけで接する箇所は、外周化すると壁厚内に
    # 一段のへこみが残る。扉・開口を塞がないよう、壁厚以下の空セルが
    # 直交二辺の壁セルに挟まれる場合だけ一度だけ充填し、直角面へ正規化する。
    occupied_before_corner_fill = set(owner_by_cell)
    candidate_cells: set[tuple[int, int, int]] = set()
    for cell_x, cell_y, cell_z in occupied_before_corner_fill:
        for offset_x, offset_y in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            candidate_x = cell_x + offset_x
            candidate_y = cell_y + offset_y
            if (
                0 <= candidate_x < len(x_coordinates) - 1
                and 0 <= candidate_y < len(y_coordinates) - 1
            ):
                candidate_cells.add((candidate_x, candidate_y, cell_z))
    corner_fill_count = 0
    perpendicular_pairs = (
        ((-1, 0), (0, -1)),
        ((-1, 0), (0, 1)),
        ((1, 0), (0, -1)),
        ((1, 0), (0, 1)),
    )

    def nearest_wall_owner(
        cell_x: int,
        cell_y: int,
        cell_z: int,
        direction_x: int,
        direction_y: int,
    ) -> str | None:
        """壁厚以内の空セルを越えた最初の壁所有者を返す。"""
        probe_x = cell_x + direction_x
        probe_y = cell_y + direction_y
        gap_width = 0.0
        while (
            0 <= probe_x < len(x_coordinates) - 1
            and 0 <= probe_y < len(y_coordinates) - 1
        ):
            probe = (probe_x, probe_y, cell_z)
            if probe in floor_owner_cells:
                return None
            owner = owner_by_cell.get(probe)
            if owner is not None:
                return owner
            if direction_x != 0:
                gap_width += x_coordinates[probe_x + 1] - x_coordinates[probe_x]
            else:
                gap_width += y_coordinates[probe_y + 1] - y_coordinates[probe_y]
            if gap_width > WALL_THICKNESS + 1.0e-5:
                return None
            probe_x += direction_x
            probe_y += direction_y
        return None

    for cell_x, cell_y, cell_z in sorted(candidate_cells):
        cell = (cell_x, cell_y, cell_z)
        if cell in occupied_before_corner_fill or cell in floor_owner_cells:
            continue
        if (
            x_coordinates[cell_x + 1] - x_coordinates[cell_x]
            > WALL_THICKNESS + 1.0e-5
            or y_coordinates[cell_y + 1] - y_coordinates[cell_y]
            > WALL_THICKNESS + 1.0e-5
        ):
            continue
        neighbor_owners = None
        for (first_x, first_y), (second_x, second_y) in perpendicular_pairs:
            first_owner = nearest_wall_owner(
                cell_x,
                cell_y,
                cell_z,
                first_x,
                first_y,
            )
            second_owner = nearest_wall_owner(
                cell_x,
                cell_y,
                cell_z,
                second_x,
                second_y,
            )
            if first_owner is not None and second_owner is not None:
                neighbor_owners = (first_owner, second_owner)
                break
        if neighbor_owners is None:
            continue
        fill_owner = min(neighbor_owners)
        owner_by_cell[cell] = fill_owner
        corner_fill_count += 1

    cells_by_owner: dict[str, set[tuple[int, int, int]]] = {
        obj.name: set() for obj in targets
    }
    for cell, object_name in owner_by_cell.items():
        cells_by_owner[object_name].add(cell)
    occupied_cells = set(owner_by_cell)
    cross_object_line_breakpoints: dict[WallSurfaceLineKey, set[float]] = {}
    if prefix == "VIS_":
        visual_surface_occupied_cells = occupied_cells | floor_owner_cells
        visual_surface_rectangles_by_object = {
            object_name: owned_voxel_surface_rectangles(
                cells_by_owner[object_name],
                visual_surface_occupied_cells,
                x_coordinates,
                y_coordinates,
                z_coordinates,
            )
            for object_name in sorted(cells_by_owner)
            if cells_by_owner[object_name]
        }
        cross_object_line_breakpoints = wall_surface_line_breakpoints(
            visual_surface_rectangles_by_object,
            x_coordinates,
            y_coordinates,
            z_coordinates,
            "B06-1全表示壁",
        )
    if prefix == "COL_":
        for object_name, cells in cells_by_owner.items():
            if cells:
                B06_WALL_SPATIAL_COMPONENT_BOUNDS[object_name] = (
                    merge_wall_cells_to_cuboid_bounds(
                        cells,
                        x_coordinates,
                        y_coordinates,
                        z_coordinates,
                    )
                )
    removed_redundant_objects = 0
    for object_name, cells in cells_by_owner.items():
        if not cells:
            # 他の壁Objectが全Volumeを所有する完全重複Objectは残さない。
            # 空Meshや同一平面の二重所有へ置き換えず、単一所有者へ統合する。
            unlink_and_remove_object(bpy.data.objects[object_name])
            removed_redundant_objects += 1
            continue
        # 表示壁は全Objectを通じた外周面だけを一意に所有する。
        # Colliderは各Objectの非重複Volumeを閉じ、隣接境界では体積を重ねない。
        surface_occupied_cells = (
            occupied_cells | floor_owner_cells if prefix == "VIS_" else cells
        )
        replace_owned_voxel_surface(
            object_name,
            cells,
            surface_occupied_cells,
            x_coordinates,
            y_coordinates,
            z_coordinates,
            cross_object_line_breakpoints,
        )
    rebuilt_object_count = len(cells_by_owner) - removed_redundant_objects
    return (
        rebuilt_object_count
        + removed_redundant_objects
        + shared_cell_count
        + corner_fill_count
    )


def b06_spatial_component_world_bounds(
    obj: bpy.types.Object,
) -> list[tuple[Vector, Vector]]:
    stored_bounds = B06_WALL_SPATIAL_COMPONENT_BOUNDS.get(obj.name)
    if stored_bounds is None:
        return mesh_component_world_bounds(obj)
    return [
        (Vector(minimum), Vector(maximum))
        for minimum, maximum in stored_bounds
    ]


def synchronize_visual_wall_sources_from_colliders() -> int:
    """閉じたCollider壁体積を、表示壁の共有面統合入力へ同期する。"""
    reference = bpy.data.objects.get("VIS_B03_ExteriorWalls_F01")
    if reference is None or reference.type != "MESH":
        raise RuntimeError("B06-1表示壁の復元先Collectionがありません")
    if not reference.users_collection or not reference.data.materials:
        raise RuntimeError("B06-1表示壁のCollectionまたはMaterialがありません")
    target_collection = reference.users_collection[0]
    wall_material = reference.data.materials[0]
    synchronized = 0
    for collider in b06_wall_join_target_objects("COL_"):
        if not collider.name.startswith("COL_Wall_"):
            continue
        visual_name = collider.name.replace("COL_", "VIS_", 1)
        visual = bpy.data.objects.get(visual_name)
        if visual is None:
            visual = collider.copy()
            visual.name = visual_name
            target_collection.objects.link(visual)
        elif visual.type != "MESH":
            raise RuntimeError(f"B06-1表示壁がMeshではありません: {visual_name}")
        old_mesh = visual.data
        visual.data = collider.data.copy()
        visual.data.name = visual_name
        visual.matrix_world = collider.matrix_world.copy()
        visual.data.materials.clear()
        visual.data.materials.append(wall_material)
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
        synchronized += 1
    return synchronized


def rebuild_b06_wall_corner_joins() -> dict[str, int]:
    stair_boundary_cap_boxes = [
        ((-12.45, 2.35, 3.0), (-3.35, 2.65, 3.6)),
        ((-12.45, 32.35, 3.0), (-3.35, 32.65, 3.6)),
        ((41.25, 36.65, 3.0), (41.55, 45.35, 3.6)),
        ((-6.75, 38.65, 3.0), (-6.45, 45.35, 3.6)),
    ]
    for prefix in ("VIS_", "COL_"):
        replace_existing_boxes(
            f"{prefix}B03_StairBoundaryCaps_F01",
            stair_boundary_cap_boxes,
        )
    synchronize_visual_wall_sources_from_colliders()
    result = {
        "visual": rebuild_shared_wall_planar_union("VIS_"),
        "collider": rebuild_shared_wall_planar_union("COL_"),
    }
    apply_architecture_swatch_uv(
        tuple(
            f"VIS_B03_Interior_F{floor:02d}_Toilets_Architecture"
            for floor in range(1, 5)
        ),
        "wall",
    )
    if result["visual"] == 0 or result["collider"] == 0:
        raise RuntimeError(f"B06-1壁角の共有接合面を生成できません: {result}")
    return result


def rebuild_interior_nav_blocker_from_colliders() -> int:
    dynamic_variant_collider_names = {
        f"COL_B03_Interior_{room_name}"
        for room_name in ROOM_VARIANT_AUTHOR_NAMES
    }
    sources = [
        obj
        for obj in sorted(bpy.data.objects, key=lambda candidate: candidate.name)
        if obj.type == "MESH"
        and obj.name.startswith("COL_B03_Interior_")
        and obj.name not in dynamic_variant_collider_names
    ]
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for source in sources:
        offset = len(vertices)
        vertices.extend(
            tuple(source.matrix_world @ vertex.co)
            for vertex in source.data.vertices
        )
        faces.extend(
            tuple(offset + index for index in polygon.vertices)
            for polygon in source.data.polygons
        )
    replace_mesh_geometry_with_oriented_faces(
        "NAV_Blocker_Interiors",
        vertices,
        faces,
    )
    return len(sources)


def rebuild_b06_storey_bands() -> dict[str, int]:
    counts = {}
    visual_collection = collection(VIS_COLLECTION_NAME)
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        boxes = storey_band_boxes(floor, base_z)
        object_name = f"VIS_B03_StoreyBand_F{floor:02d}"
        create_mesh_object(object_name, boxes, visual_collection)
        replace_existing_union_boxes(object_name, boxes)
        counts[f"f{floor:02d}"] = len(boxes)
    return counts


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
                and not obj.name.startswith("COL_BeamSightOnly_")
                and not has_dynamic_spatial_ancestor(obj)
                and not is_bit_flight_support_collider_name(obj.name)
                and not is_bit_flight_obstacle_exempt_collider_name(obj.name)
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
            for minimum, maximum in b06_spatial_component_world_bounds(collider):
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
                if (
                    band_id == "outdoor-f4"
                    and exclusion_source.name == "COL_Floor_Gym"
                ):
                    continue
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
    metadata["hs_schema_version"] = 3
    metadata["hs_nav_profile"] = HUMAN_NAV_PROFILE
    metadata["hs_bit_nav_profile"] = BIT_FLIGHT_NAV_PROFILE

    for obj in bpy.data.objects:
        if (
            obj.name.startswith("NAV_")
            and not obj.name.startswith("NAV_BitFlight_")
        ):
            obj["hs_nav_set"] = "human"


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
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        degenerate_faces = [face for face in mesh.faces if face.calc_area() <= 1.0e-10]
        if degenerate_faces:
            was_closed = all(len(edge.link_faces) == 2 for edge in mesh.edges)
            bmesh.ops.dissolve_degenerate(
                mesh,
                dist=1.0e-10,
                edges=list(mesh.edges),
            )
            remaining_degenerate_faces = [
                face for face in mesh.faces if face.calc_area() <= 1.0e-10
            ]
            if remaining_degenerate_faces:
                bmesh.ops.delete(
                    mesh,
                    geom=remaining_degenerate_faces,
                    context="FACES",
                )
            if was_closed:
                boundary_edges = [
                    edge for edge in mesh.edges if len(edge.link_faces) == 1
                ]
                if boundary_edges:
                    bmesh.ops.holes_fill(mesh, edges=boundary_edges, sides=0)
            loose_edges = [edge for edge in mesh.edges if not edge.link_faces]
            if loose_edges:
                bmesh.ops.delete(mesh, geom=loose_edges, context="EDGES")
            loose_vertices = [vertex for vertex in mesh.verts if not vertex.link_edges]
            if loose_vertices:
                bmesh.ops.delete(mesh, geom=loose_vertices, context="VERTS")
            bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
            mesh.to_mesh(obj.data)
            obj.data.update()
        mesh.free()


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
            polygon_coordinates = polygon_swatch_uvs(obj, polygon, coordinates)
            for loop_index, uv in zip(
                polygon.loop_indices,
                polygon_coordinates,
                strict=True,
            ):
                uv_layer.data[loop_index].uv = uv


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
        for row in obj.matrix_local:
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


def has_exact_hs_properties(
    obj: bpy.types.Object,
    expected: dict[str, object],
) -> bool:
    actual = {
        key: obj[key]
        for key in obj.keys()
        if key.startswith("hs_")
    }
    return actual == expected


def has_exact_world_bounds(
    obj: bpy.types.Object,
    expected: tuple[
        tuple[float, float, float],
        tuple[float, float, float],
    ],
) -> bool:
    if obj.type != "MESH":
        return False
    actual_minimum, actual_maximum = world_bounds(obj)
    return all(
        abs(actual - target) <= 1.0e-5
        for actual, target in zip(actual_minimum, expected[0], strict=True)
    ) and all(
        abs(actual - target) <= 1.0e-5
        for actual, target in zip(actual_maximum, expected[1], strict=True)
    )


def spawn_semantics_are_current() -> bool:
    expected_names_by_role = {
        "player_spawn": {
            f"MRK_PlayerSpawn_{suffix}"
            for suffix, *_remaining in PLAYER_SPAWN_SPECS
        },
        "player_spawn_exclusion": {
            f"VOL_PlayerSpawnExclusion_{suffix}"
            for suffix, *_remaining in PLAYER_SPAWN_SPECS
        },
        "npc_spawn": {
            f"VOL_NpcSpawn_{suffix}"
            for suffix, *_remaining in NPC_SPAWN_VOLUME_SPECS
        },
        "npc_spawn_bias": {
            f"VOL_NpcSpawnBias_{suffix}"
            for suffix, *_remaining in NPC_SPAWN_BIAS_VOLUME_SPECS
        },
        "bit_spawn": {
            f"VOL_BitSpawn_{suffix}"
            for suffix, *_remaining in BIT_SPAWN_VOLUME_SPECS
        },
    }
    for role, expected_names in expected_names_by_role.items():
        actual_names = {
            obj.name for obj in bpy.data.objects if obj.get("hs_role") == role
        }
        if actual_names != expected_names:
            return False

    for (
        suffix,
        spawn_id,
        position,
        yaw_degrees,
        exclusion_id,
        exclusion_bounds,
    ) in PLAYER_SPAWN_SPECS:
        marker = bpy.data.objects.get(f"MRK_PlayerSpawn_{suffix}")
        if (
            marker is None
            or marker.type != "EMPTY"
            or marker.parent is not None
            or not has_exact_hs_properties(
                marker,
                {
                    "hs_id": spawn_id,
                    "hs_role": "player_spawn",
                },
            )
            or any(
                abs(actual - expected) > 1.0e-5
                for actual, expected in zip(marker.location, position, strict=True)
            )
            or abs(marker.rotation_euler.x) > 1.0e-6
            or abs(marker.rotation_euler.y) > 1.0e-6
            or abs(marker.rotation_euler.z - math.radians(yaw_degrees)) > 1.0e-6
            or any(abs(value - 1.0) > 1.0e-6 for value in marker.scale)
        ):
            return False

        exclusion = bpy.data.objects.get(
            f"VOL_PlayerSpawnExclusion_{suffix}"
        )
        if (
            exclusion is None
            or not has_exact_hs_properties(
                exclusion,
                {
                    "hs_id": exclusion_id,
                    "hs_role": "player_spawn_exclusion",
                    "hs_player_spawn_id": spawn_id,
                },
            )
            or not has_exact_world_bounds(exclusion, exclusion_bounds)
        ):
            return False

    for suffix, spawn_id, bounds in NPC_SPAWN_VOLUME_SPECS:
        volume = bpy.data.objects.get(f"VOL_NpcSpawn_{suffix}")
        if (
            volume is None
            or not has_exact_hs_properties(
                volume,
                {
                    "hs_id": spawn_id,
                    "hs_role": "npc_spawn",
                },
            )
            or not has_exact_world_bounds(volume, bounds)
        ):
            return False

    for suffix, bias_id, player_spawn_id, weight, bounds in (
        NPC_SPAWN_BIAS_VOLUME_SPECS
    ):
        volume = bpy.data.objects.get(f"VOL_NpcSpawnBias_{suffix}")
        if (
            volume is None
            or not has_exact_hs_properties(
                volume,
                {
                    "hs_id": bias_id,
                    "hs_role": "npc_spawn_bias",
                    "hs_player_spawn_id": player_spawn_id,
                    "hs_weight": weight,
                },
            )
            or not has_exact_world_bounds(volume, bounds)
        ):
            return False

    for suffix, spawn_id, zone_id, band_id, bounds in BIT_SPAWN_VOLUME_SPECS:
        volume = bpy.data.objects.get(f"VOL_BitSpawn_{suffix}")
        if (
            volume is None
            or not has_exact_hs_properties(
                volume,
                {
                    "hs_id": spawn_id,
                    "hs_role": "bit_spawn",
                    "hs_zone_id": zone_id,
                    "hs_band_id": band_id,
                },
            )
            or not has_exact_world_bounds(volume, bounds)
        ):
            return False

    return True


def is_current_generation() -> bool:
    names = tuple(bpy.data.objects.keys())
    metadata = bpy.data.objects.get("META_Stage")
    boundary = bpy.data.objects.get("BND_Stage")
    site_ground = bpy.data.objects.get("COL_SiteGround")
    outdoor_nav = bpy.data.objects.get("NAV_Walkable_Outdoor")
    south_perimeter = bpy.data.objects.get("COL_Perimeter_SouthWest")
    world_boundary = bpy.data.objects.get("BND_WorldLimit")
    sidewalk = bpy.data.objects.get("VIS_B04_Sidewalk")
    road = bpy.data.objects.get("VIS_B04_Road")
    boundary_maximum_z = (
        world_bounds(boundary)[1].z
        if boundary is not None and boundary.type == "MESH"
        else None
    )
    boundary_minimum_y = (
        world_bounds(boundary)[0].y
        if boundary is not None and boundary.type == "MESH"
        else None
    )
    site_ground_minimum_y = (
        world_bounds(site_ground)[0].y
        if site_ground is not None and site_ground.type == "MESH"
        else None
    )
    outdoor_nav_minimum_y = (
        world_bounds(outdoor_nav)[0].y
        if outdoor_nav is not None and outdoor_nav.type == "MESH"
        else None
    )
    south_perimeter_maximum_y = (
        world_bounds(south_perimeter)[1].y
        if south_perimeter is not None and south_perimeter.type == "MESH"
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
        and bpy.context.scene.get(B04_WORLD_BOUNDARY_VERSION_PROPERTY)
        == B04_WORLD_BOUNDARY_VERSION
        and bpy.context.scene.get(T04_CORRECTION_VERSION_PROPERTY)
        == T04_CORRECTION_VERSION
        and metadata is not None
        and metadata.get("hs_schema_version") == 3
        and metadata.get("hs_bit_nav_profile") == BIT_FLIGHT_NAV_PROFILE
        and spawn_semantics_are_current()
        and boundary_maximum_z is not None
        and abs(boundary_maximum_z - 19.0) <= 1.0e-6
        and boundary_minimum_y is not None
        and abs(boundary_minimum_y - STAGE_BOUNDARY_SOUTH_Y) <= 1.0e-6
        and site_ground_minimum_y is not None
        and abs(site_ground_minimum_y + 14.5) <= 1.0e-6
        and outdoor_nav_minimum_y is not None
        and abs(outdoor_nav_minimum_y + 14.5) <= 1.0e-6
        and south_perimeter_maximum_y is not None
        and abs(south_perimeter_maximum_y + 14.3) <= 1.0e-6
        and world_boundary is not None
        and world_boundary.get("hs_id") == "world-limit"
        and world_boundary.get("hs_role") == "world_boundary"
        and all(
            abs(actual - expected) <= 1.0e-5
            for actual, expected in zip(
                world_bounds(world_boundary)[0],
                B04_WORLD_BOUNDARY_BOUNDS[0],
                strict=True,
            )
        )
        and all(
            abs(actual - expected) <= 1.0e-5
            for actual, expected in zip(
                world_bounds(world_boundary)[1],
                B04_WORLD_BOUNDARY_BOUNDS[1],
                strict=True,
            )
        )
        and sidewalk is not None
        and road is not None
        and abs(world_bounds(sidewalk)[1].z - B04_SURFACE_Z[1]) <= 1.0e-6
        and abs(world_bounds(road)[1].z - B04_SURFACE_Z[1]) <= 1.0e-6
        and "VIS_CourtyardSurface" not in names
        and human_nav_sources
        and all(obj.get("hs_nav_set") == "human" for obj in human_nav_sources)
        and bpy.context.scene.get("b03_window_layout_status") == "final"
        and sum(name.startswith("VIS_WindowFrame_") for name in names) == 81
        and sum(name.startswith("VIS_WindowGlass_") for name in names) == 81
        and sum(name.startswith("COL_ActorOnly_Window_") for name in names) == 33
        and sum(name.startswith("COL_ActorOnly_WindowFixed_") for name in names) == 48
        and sum(name.startswith("COL_HumanOnly_Window_") for name in names) == 57
        and sum(name.startswith("LNK_bit-window-") for name in names) == 114
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
    if len(specs) != 80 or sum(len(spec.open_leaf_indices) for spec in specs) != 57:
        raise RuntimeError("最終窓帯が80件または開放ユニットが57件ではありません")
    remove_final_unused_authoring_data()
    force_rebuild = "--force" in sys.argv
    if is_current_generation() and not force_rebuild:
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
    rebuild_rooftop_facility_geometry()
    frame_material = make_material(
        "MAT_B03_WindowFrame", (0.36, 0.39, 0.41, 1.0), metallic=0.15, roughness=0.38
    )
    glass_material = make_material(
        "MAT_B03_WindowGlass", (0.56, 0.78, 0.86, 0.28), roughness=0.18, alpha_blend=True
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
        )
    )
    b03_3b_result = build_b03_3b_structure(
        visual_collection,
        collider_collection,
        architecture_material,
        frame_material,
        glass_material,
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
    escape_mound_result = build_rooftop_escape_crate_mounds(
        visual_collection,
        collider_collection,
        architecture_material,
    )
    interior_result = build_school_interiors(
        visual_collection,
        collider_collection,
        nav_collection,
        ROOM_VARIANT_AUTHOR_NAMES,
    )
    interior_result["removed_redundant_school1f_nav_boxes"] = (
        remove_redundant_first_floor_nav_blocker_boxes()
    )
    interior_result["west_extension_school1f_nav_blocker"] = (
        update_first_floor_nav_blocker_for_west_extension()
    )
    interior_result["gym_bridge_nav_blocker"] = (
        update_gym_nav_blocker_for_bridge_opening()
    )
    bpy.context.scene["b03_2_interior_result"] = json.dumps(
        interior_result, ensure_ascii=False, sort_keys=True
    )
    build_nav_sources(
        nav_collection,
        upper_colliders,
        window_colliders,
        b03_3b_result,
        escape_mound_result,
    )
    # 表示壁・Colliderを共有境界Meshへ変換する。
    wall_corner_joins = rebuild_b06_wall_corner_joins()
    rebuilt_stair_visuals = rebuild_first_transition_stair_visuals()
    interactive_result = build_school_interactive_assets(
        visual_collection,
        collider_collection,
        nav_collection,
        semantic_collection,
        door_material,
        architecture_material,
        furniture_material,
    )
    bpy.context.scene["b03_3c_interactive_result"] = json.dumps(
        interactive_result, ensure_ascii=False, sort_keys=True
    )
    configure_stage_navigation_contract()
    build_bit_flight_nav_sources(nav_collection)
    build_bit_flight_obstacle_sources(nav_collection)
    rebuild_human_entry_transition_nav_source()
    build_vertical_transition_volumes(semantic_collection)
    build_stair_transition_volumes(semantic_collection)
    build_rooftop_boundary_transition(semantic_collection)
    build_assembly_venues(semantic_collection)
    build_spawn_semantics(semantic_collection)
    build_navigation_areas(semantic_collection)
    build_b05_location_assets(semantic_collection)
    build_b04_school_world_boundary(
        visual_collection,
        semantic_collection,
        architecture_material,
    )
    # y=-3.5ではシャフト北面を唯一の表示所有者とする。床・天井スラブ、
    # 南西階段支持板、踊り場、終端手すりは実交差部分だけを分割して省く。
    # Collider・Nav・反対面は変更しない。
    elevator_shaft_face_trims = (
        trim_visual_faces_owned_by_elevator_shaft_north_wall()
    )
    # 色帯は、構造表示面の所有整理が終わった最終壁面を意味分類して生成する。
    # 元の箱境界や生成履歴から壁面を推測せず、構造面のtrim対象にも含めない。
    storey_band_segments = rebuild_b06_storey_bands()
    # すべての資産生成が完了した最終Collider外殻を人物Nav blockerへ複製する。
    # これより後では形状を生成せず、旧AABB近似や生成順依存へ戻さない。
    interior_nav_blocker_boxes = rebuild_interior_nav_blocker_from_colliders()
    bpy.context.scene["b06_1_structure_result"] = json.dumps(
        {
            "wall_corner_joins": wall_corner_joins,
            "interior_nav_blocker_boxes": interior_nav_blocker_boxes,
            "storey_band_segments": storey_band_segments,
            "rebuilt_stair_visuals": rebuilt_stair_visuals,
            "elevator_shaft_face_trims": elevator_shaft_face_trims,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    normalize_export_meshes(export_collection)
    material_result = consolidate_school_materials(export_collection)
    apply_architecture_swatch_uv(
        (
            "VIS_B03_GymBridgeFloor",
            "VIS_B03_GymBridgeSchoolFloorJoint",
            "VIS_B03_GymRoofRamp",
        ),
        "gym_floor",
    )
    apply_architecture_swatch_uv(
        (
            "VIS_B06_WestExtensionFloorFinish_F01",
            "VIS_B03_WestExtensionFloor_F01",
            "VIS_Floor_CorridorCorner",
        ),
        "floor",
    )
    apply_architecture_swatch_uv(
        (
            "VIS_B03_GymBridgeCeiling",
            "VIS_B03_GymBridgeWindowFrames",
            "VIS_B03_GymRoofGapWall",
            "VIS_B03_GymRoofRampUnderfill",
            "VIS_B03_GymRoofRampSideCladding",
            "VIS_B03_StairBoundaryCaps_F01",
            "VIS_B03_ElevatorShaftShell",
            "VIS_B06_StairFloorEdgeCladding_South",
            "VIS_B06_StairFloorEdgeCladding_North",
            "VIS_B06_StairFloorEdgeCladding_West",
        ),
        "wall",
    )
    apply_architecture_swatch_uv(
        tuple(f"VIS_RoofGuard_{suffix}" for suffix, *_ in ROOF_GUARD_SEGMENTS),
        "trim",
    )
    apply_architecture_swatch_uv(
        tuple(
            sorted(
                obj.name
                for obj in bpy.data.objects
                if obj.name.startswith(
                    ("VIS_StairGuard_", "VIS_StairGuardSystem_")
                )
            )
        ),
        "trim",
    )
    apply_architecture_swatch_uv(
        (
            "VIS_B03_GymGalleryGuards",
            "VIS_B03_GymRoofConnectionGuards",
        ),
        "trim",
    )
    apply_architecture_swatch_uv(
        tuple(
            sorted(
                obj.name
                for obj in bpy.data.objects
                if obj.name.startswith("VIS_B03_StairNosing_")
                or obj.name in {
                    "VIS_B03_GymGalleryStairNosing",
                    "VIS_B03_GymStageStairNosing",
                }
            )
        ),
        "trim",
    )
    apply_architecture_swatch_uv(
        ("VIS_B03_PerimeterBlockJoints",),
        "trim",
    )
    apply_architecture_swatch_uv(
        ("VIS_B04_Sidewalk",),
        "wall",
    )
    apply_architecture_swatch_uv(
        ("VIS_B04_Road",),
        "trim",
    )
    bpy.context.scene["b03_2_material_result"] = json.dumps(
        material_result, ensure_ascii=False, sort_keys=True
    )
    remove_final_unused_authoring_data()

    bpy.context.scene[GENERATOR_VERSION_PROPERTY] = GENERATOR_VERSION
    bpy.context.scene[T04_CORRECTION_VERSION_PROPERTY] = T04_CORRECTION_VERSION
    bpy.context.scene[B04_WORLD_BOUNDARY_VERSION_PROPERTY] = (
        B04_WORLD_BOUNDARY_VERSION
    )
    bpy.context.scene["b03_window_layout_status"] = "final"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.view_layer.update()
    bpy.context.scene[GENERATOR_SIGNATURE_PROPERTY] = generation_signature()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    optimization = export_stage(export_collection)
    print_build_result(specs, optimization)


if __name__ == "__main__":
    main()
