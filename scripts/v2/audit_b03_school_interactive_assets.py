from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bpy
from mathutils import Matrix, Quaternion, Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))
sys.dont_write_bytecode = True

from b06_signage_manifest import SIGN_PLACEMENTS, SIGN_SIZE

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
)
GLB_PATH = (
    REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
)
EXPORT_COLLECTION_NAME = "EXP_Stage_school"
EXPECTED_GENERATOR_VERSION = "b06-3-school-props-signage-v1"
EXPECTED_HUMAN_NAV_PROFILE = "school-humanoid-room-variants-v2"

GLB_MAGIC = b"glTF"
GLB_VERSION = 2
JSON_CHUNK_TYPE = 0x4E4F534A
BINARY_CHUNK_TYPE = 0x004E4942
TOLERANCE = 1.0e-5
OVERLAP_TOLERANCE = 1.0e-4
GLTF_COMPONENT_FORMATS = {
    5121: "B",
    5123: "H",
    5125: "I",
    5126: "f",
}
GLTF_TYPE_COMPONENT_COUNTS = {
    "SCALAR": 1,
    "VEC3": 3,
}
SIGN_COMPONENT_OBJECT_NAMES = frozenset(
    f"VIS_B03_Interior_{placement.owner_room}_SignsPaper"
    for placement in SIGN_PLACEMENTS
)
INFIRMARY_CURTAIN_PANEL_NAMES = ("North", "West", "East", "Divider")
INFIRMARY_NORMAL_CURTAIN_BEAM_SIGHT_COLLIDER_NAME = (
    "COL_BeamSightOnly_B03_Interior_F01_Infirmary_Curtains"
)
INFIRMARY_DISORDERED_CURTAIN_BEAM_SIGHT_COLLIDER_NAME = (
    "COL_BeamSightOnly_RoomVariant_F01_Infirmary_Disordered_Curtains"
)
UNCHANGED_DISORDERED_ROOM_IDS = frozenset(
    {
        "f02-classroom-01",
        "f03-classroom-03",
        "f04-classroom-02",
    }
)
FRONT_BLOCKED_CLASSROOM_ROOM_IDS = frozenset(
    {
        "f02-classroom-03",
        "f03-classroom-02",
        "f04-classroom-01",
    }
)
ROOM_VARIANT_WALL_ATTACHMENT_ALLOWANCE = 0.55
INFIRMARY_DISORDERED_CURTAIN_COLLIDER_BOUNDS = (
    ((-12.10, 6.55, 0.45), (-9.275, 6.69, 3.00)),
    ((-12.17, 3.00, 0.45), (-12.03, 6.62, 3.00)),
    ((-9.345, 3.00, 0.45), (-9.205, 6.62, 3.00)),
    ((-6.57, 2.74, 0.45), (-6.33, 3.56, 3.00)),
    ((-7.19, 2.70, 0.45), (-6.45, 2.94, 3.00)),
)


@dataclass(frozen=True)
class RoomSpec:
    author_name: str
    room_id: str
    base_z: float
    bounds_xy: tuple[float, float, float, float]
    wall_axis: str
    openings: tuple[tuple[float, float], ...]
    has_signs_paper: bool


ROOM_SPECS = (
    RoomSpec(
        "F02_Classroom01",
        "f02-classroom-01",
        3.6,
        (-12.45, -3.65, 2.65, 12.35),
        "west",
        ((3.1, 4.3), (10.7, 11.9)),
        True,
    ),
    RoomSpec(
        "F02_Classroom02",
        "f02-classroom-02",
        3.6,
        (-12.45, -3.65, 12.65, 22.35),
        "west",
        ((13.1, 14.3), (20.7, 21.9)),
        True,
    ),
    RoomSpec(
        "F02_Classroom03",
        "f02-classroom-03",
        3.6,
        (-12.45, -3.65, 22.65, 32.35),
        "west",
        ((23.1, 24.3), (30.7, 31.9)),
        True,
    ),
    RoomSpec(
        "F03_Classroom01",
        "f03-classroom-01",
        7.2,
        (-12.45, -3.65, 2.65, 12.35),
        "west",
        ((3.1, 4.3), (10.7, 11.9)),
        True,
    ),
    RoomSpec(
        "F03_Classroom02",
        "f03-classroom-02",
        7.2,
        (-12.45, -3.65, 12.65, 22.35),
        "west",
        ((13.1, 14.3), (20.7, 21.9)),
        True,
    ),
    RoomSpec(
        "F03_Classroom03",
        "f03-classroom-03",
        7.2,
        (-12.45, -3.65, 22.65, 32.35),
        "west",
        ((23.1, 24.3), (30.7, 31.9)),
        True,
    ),
    RoomSpec(
        "F04_Classroom01",
        "f04-classroom-01",
        10.8,
        (-12.45, -3.65, 2.65, 12.35),
        "west",
        ((3.1, 4.3), (10.7, 11.9)),
        True,
    ),
    RoomSpec(
        "F04_Classroom02",
        "f04-classroom-02",
        10.8,
        (-12.45, -3.65, 12.65, 22.35),
        "west",
        ((13.1, 14.3), (20.7, 21.9)),
        True,
    ),
    RoomSpec(
        "F04_Classroom03",
        "f04-classroom-03",
        10.8,
        (-12.45, -3.65, 22.65, 32.35),
        "west",
        ((23.1, 24.3), (30.7, 31.9)),
        True,
    ),
    RoomSpec(
        "F01_Infirmary",
        "f01-infirmary",
        0.0,
        (-12.45, -3.65, 2.65, 12.35),
        "west",
        ((3.1, 4.3), (10.7, 11.9)),
        True,
    ),
    RoomSpec(
        "F01_Library",
        "f01-library",
        0.0,
        (-12.45, -3.65, 12.65, 32.35),
        "west",
        ((13.1, 14.3), (30.7, 31.9)),
        True,
    ),
    RoomSpec(
        "F01_StaffRoom",
        "f01-staff-room",
        0.0,
        (5.55, 23.25, 36.65, 45.35),
        "north",
        ((6.0, 7.2), (21.6, 22.8)),
        True,
    ),
    RoomSpec(
        "F01_PcRoom",
        "f01-pc-room",
        0.0,
        (23.55, 41.25, 36.65, 45.35),
        "north",
        ((24.0, 25.2), (39.6, 40.8)),
        False,
    ),
    RoomSpec(
        "F02_Council",
        "f02-council",
        3.6,
        (5.55, 14.25, 36.65, 45.35),
        "north",
        ((6.0, 7.2),),
        True,
    ),
    RoomSpec(
        "F02_Broadcast",
        "f02-broadcast",
        3.6,
        (14.55, 23.25, 36.65, 45.35),
        "north",
        ((21.6, 22.8),),
        False,
    ),
    RoomSpec(
        "F02_Science",
        "f02-science",
        3.6,
        (23.55, 41.25, 36.65, 45.35),
        "north",
        ((24.0, 25.2), (39.6, 40.8)),
        False,
    ),
    RoomSpec(
        "F03_Art",
        "f03-art",
        7.2,
        (5.55, 23.25, 36.65, 45.35),
        "north",
        ((6.0, 7.2), (21.6, 22.8)),
        False,
    ),
    RoomSpec(
        "F03_HomeEc",
        "f03-home-ec",
        7.2,
        (23.55, 41.25, 36.65, 45.35),
        "north",
        ((24.0, 25.2), (39.6, 40.8)),
        False,
    ),
    RoomSpec(
        "F04_LL",
        "f04-ll",
        10.8,
        (5.55, 23.25, 36.65, 45.35),
        "north",
        ((6.0, 7.2), (21.6, 22.8)),
        False,
    ),
    RoomSpec(
        "F04_Music",
        "f04-music",
        10.8,
        (23.55, 41.25, 36.65, 45.35),
        "north",
        ((24.0, 25.2), (39.6, 40.8)),
        False,
    ),
)

EXPECTED_ROOM_IDS = tuple(room.room_id for room in ROOM_SPECS)
EXPECTED_VARIANT_IDS = ("normal", "disordered")

LEGACY_OBJECT_NAMES = frozenset(
    {
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
        "VIS_B03_DoorLeaves_F02",
        "VIS_B03_DoorLeaves_F03",
        "VIS_B03_DoorLeaves_F04",
        "COL_B03_ElevatorShaftSafety",
    }
)

EXPECTED_CLOSED_ELEVATOR_DISPLAY_NAMES = frozenset(
    {
        "VIS_B03_ElevatorClosedDoor_F02_F03",
        "COL_B03_ElevatorClosedDoor_F02_F03",
        "VIS_B03_ElevatorAdjustmentTape_F02_F03",
        "VIS_B03_ElevatorAdjustmentSign_F02_F03",
        "VIS_B03_ElevatorAdjustmentText_F02",
        "VIS_B03_ElevatorAdjustmentText_F03",
    }
)

EXPECTED_NPC_SPAWN_BIAS_PROPERTIES = {
    "VOL_NpcSpawnBias_Main": {
        "hs_id": "npc-spawn-bias-main",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-main",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_GymCenter": {
        "hs_id": "npc-spawn-bias-gym-center",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-gym-center",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_GymStage": {
        "hs_id": "npc-spawn-bias-gym-stage",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-gym-stage",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_F02_Classroom02": {
        "hs_id": "npc-spawn-bias-f02-classroom-02",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-f02-classroom-02",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_F03_Classroom02": {
        "hs_id": "npc-spawn-bias-f03-classroom-02",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-f03-classroom-02",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_F04_Classroom02": {
        "hs_id": "npc-spawn-bias-f04-classroom-02",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-f04-classroom-02",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_F02_ToiletWashSide": {
        "hs_id": "npc-spawn-bias-f02-toilet-wash-side",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-f02-toilet-wash-side",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_F02_CouncilSouth": {
        "hs_id": "npc-spawn-bias-f02-council-south",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-f02-council-south",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_F03_ArtSouth": {
        "hs_id": "npc-spawn-bias-f03-art-south",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-f03-art-south",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_F04_MusicSouth": {
        "hs_id": "npc-spawn-bias-f04-music-south",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-f04-music-south",
        "hs_weight": 0.5,
    },
    "VOL_NpcSpawnBias_RoofPoolWestStairs": {
        "hs_id": "npc-spawn-bias-roof-pool-west-stairs",
        "hs_role": "npc_spawn_bias",
        "hs_player_spawn_id": "player-spawn-roof-pool-west-stairs",
        "hs_weight": 0.5,
    },
}

EXPECTED_SPAWN_NAMES_BY_ROLE = {
    "player_spawn": frozenset(
        {
            "MRK_PlayerSpawn_Main",
            "MRK_PlayerSpawn_GymCenter",
            "MRK_PlayerSpawn_GymStage",
            "MRK_PlayerSpawn_F02_Classroom02",
            "MRK_PlayerSpawn_F03_Classroom02",
            "MRK_PlayerSpawn_F04_Classroom02",
            "MRK_PlayerSpawn_F02_ToiletWashSide",
            "MRK_PlayerSpawn_F02_CouncilSouth",
            "MRK_PlayerSpawn_F03_ArtSouth",
            "MRK_PlayerSpawn_F04_MusicSouth",
            "MRK_PlayerSpawn_RoofPoolWestStairs",
        }
    ),
    "player_spawn_exclusion": frozenset(
        {
            "VOL_PlayerSpawnExclusion_Main",
            "VOL_PlayerSpawnExclusion_GymCenter",
            "VOL_PlayerSpawnExclusion_GymStage",
            "VOL_PlayerSpawnExclusion_F02_Classroom02",
            "VOL_PlayerSpawnExclusion_F03_Classroom02",
            "VOL_PlayerSpawnExclusion_F04_Classroom02",
            "VOL_PlayerSpawnExclusion_F02_ToiletWashSide",
            "VOL_PlayerSpawnExclusion_F02_CouncilSouth",
            "VOL_PlayerSpawnExclusion_F03_ArtSouth",
            "VOL_PlayerSpawnExclusion_F04_MusicSouth",
            "VOL_PlayerSpawnExclusion_RoofPoolWestStairs",
        }
    ),
    "npc_spawn": frozenset(
        {
            "VOL_NpcSpawn_F01_Stage",
            "VOL_NpcSpawn_F02_Stage",
            "VOL_NpcSpawn_F03_Stage",
            "VOL_NpcSpawn_F04_Stage",
            "VOL_NpcSpawn_Roof_Stage",
        }
    ),
    "npc_spawn_bias": frozenset(EXPECTED_NPC_SPAWN_BIAS_PROPERTIES),
    "bit_spawn": frozenset(
        {
            "VOL_BitSpawn_OutdoorF1",
            "VOL_BitSpawn_InteriorF1",
            "VOL_BitSpawn_GymLow",
            "VOL_BitSpawn_OutdoorF2",
            "VOL_BitSpawn_InteriorF2",
            "VOL_BitSpawn_GymUpper",
            "VOL_BitSpawn_OutdoorF3",
            "VOL_BitSpawn_InteriorF3",
            "VOL_BitSpawn_OutdoorF4",
            "VOL_BitSpawn_InteriorF4",
            "VOL_BitSpawn_RoofFlight",
        }
    ),
}
SPAWN_ROLES = frozenset(EXPECTED_SPAWN_NAMES_BY_ROLE)
LEGACY_SPAWN_OBJECT_NAMES = frozenset(
    {
        "VOL_BitSpawn_Courtyard",
        "VOL_NpcSpawn_Courtyard",
    }
)

DYNAMIC_ROLES = frozenset(
    {
        "door",
        "door_panel",
        "door_open_pose",
        "door_sweep",
        "elevator",
        "elevator_car",
        "elevator_car_occupancy",
        "elevator_passenger_origin",
        "elevator_stop",
        "elevator_call_mat",
        "elevator_call_indicator",
        "elevator_threshold",
        "elevator_human_gate",
        "elevator_wait",
        "room_variant",
        "room_variant_tile",
        *SPAWN_ROLES,
    }
)


@dataclass(frozen=True)
class DoorSpec:
    token: str
    door_id: str
    door_class: str
    motion_kind: str
    root_location: tuple[float, float, float]
    open_location: tuple[float, float, float]
    open_rotation_z: float
    parent_name: str | None
    elevator_id: str | None = None
    stop_id: str | None = None
    wall_axis: str | None = None
    wall_normal_bounds: tuple[float, float] | None = None
    corridor_normal_direction: int | None = None
    minimum_wall_clearance: float | None = None


@dataclass(frozen=True)
class DoorPanelSpec:
    token: str
    panel_id: str
    open_pose_id: str
    closed_location: tuple[float, float, float]
    open_location: tuple[float, float, float]
    open_rotation_z: float


@dataclass
class NodeRecord:
    name: str
    kind: str
    properties: dict[str, Any]
    parent_name: str | None
    child_names: tuple[str, ...]
    translation: tuple[float, float, float]
    rotation: tuple[float, float, float, float]
    scale: tuple[float, float, float]
    local_matrix: Matrix
    world_matrix: Matrix
    local_bounds: tuple[Vector, Vector] | None
    local_component_bounds: tuple[tuple[Vector, Vector], ...]
    triangle_count: int


@dataclass(frozen=True)
class AssetGraph:
    source: str
    nodes: dict[str, NodeRecord]

    def require_node(self, name: str) -> NodeRecord:
        node = self.nodes.get(name)
        require(node is not None, f"{self.source}: 必須Objectがありません: {name}")
        return node

    def role_nodes(self, role: str) -> tuple[NodeRecord, ...]:
        return tuple(
            node
            for node in self.nodes.values()
            if node.properties.get("hs_role") == role
        )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def token(value: str) -> str:
    result = []
    previous_was_separator = False
    for character in value:
        if character.isascii() and character.isalnum():
            result.append(character)
            previous_was_separator = False
        elif not previous_was_separator:
            result.append("_")
            previous_was_separator = True
    return "".join(result).strip("_")


def python_value(value: Any) -> Any:
    if isinstance(value, (str, bool, int, float)) or value is None:
        return value
    if hasattr(value, "to_list"):
        return value.to_list()
    if isinstance(value, (list, tuple)):
        return [python_value(item) for item in value]
    return value


def values_equal(actual: Any, expected: Any) -> bool:
    if isinstance(actual, bool) or isinstance(expected, bool):
        return actual is expected
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return math.isclose(
            float(actual),
            float(expected),
            rel_tol=0.0,
            abs_tol=TOLERANCE,
        )
    return actual == expected


def require_properties(node: NodeRecord, expected: dict[str, Any]) -> None:
    require(
        set(node.properties) == set(expected),
        f"{node.name}: hs_* property集合が不正です: "
        f"actual={sorted(node.properties)}, expected={sorted(expected)}",
    )
    for key, expected_value in expected.items():
        require(
            values_equal(node.properties[key], expected_value),
            f"{node.name}: {key}が不正です: "
            f"actual={node.properties[key]!r}, expected={expected_value!r}",
        )


def vector_close(
    actual: tuple[float, float, float],
    expected: tuple[float, float, float],
) -> bool:
    return all(
        math.isclose(first, second, rel_tol=0.0, abs_tol=TOLERANCE)
        for first, second in zip(actual, expected, strict=True)
    )


def quaternion_close(
    actual: tuple[float, float, float, float],
    expected: tuple[float, float, float, float],
) -> bool:
    direct = sum(
        (first - second) ** 2
        for first, second in zip(actual, expected, strict=True)
    )
    negated = sum(
        (first + second) ** 2
        for first, second in zip(actual, expected, strict=True)
    )
    return min(direct, negated) <= TOLERANCE**2


def require_transform(
    node: NodeRecord,
    translation: tuple[float, float, float],
    rotation: tuple[float, float, float, float],
) -> None:
    require(
        vector_close(node.translation, translation),
        f"{node.name}: local translationが不正です: "
        f"actual={node.translation}, expected={translation}",
    )
    require(
        quaternion_close(node.rotation, rotation),
        f"{node.name}: local rotationが不正です: "
        f"actual={node.rotation}, expected={rotation}",
    )
    require(
        vector_close(node.scale, (1.0, 1.0, 1.0)),
        f"{node.name}: local scaleが1ではありません: {node.scale}",
    )


def identity_quaternion() -> tuple[float, float, float, float]:
    return (1.0, 0.0, 0.0, 0.0)


def z_rotation_quaternion(
    angle: float,
    *,
    glb_coordinates: bool,
) -> tuple[float, float, float, float]:
    half = angle / 2.0
    if glb_coordinates:
        return (math.cos(half), 0.0, math.sin(half), 0.0)
    return (math.cos(half), 0.0, 0.0, math.sin(half))


def convert_location(
    location: tuple[float, float, float],
    *,
    glb_coordinates: bool,
) -> tuple[float, float, float]:
    if not glb_coordinates:
        return location
    x, y, z = location
    return (x, z, -y)


def bounds_from_points(points: list[Vector]) -> tuple[Vector, Vector]:
    require(bool(points), "AABBを作る頂点がありません")
    return (
        Vector(
            tuple(min(point[axis] for point in points) for axis in range(3))
        ),
        Vector(
            tuple(max(point[axis] for point in points) for axis in range(3))
        ),
    )


def transformed_bounds(
    local_bounds: tuple[Vector, Vector],
    matrix: Matrix,
) -> tuple[Vector, Vector]:
    minimum, maximum = local_bounds
    points = [
        matrix
        @ Vector(
            (
                maximum.x if x_high else minimum.x,
                maximum.y if y_high else minimum.y,
                maximum.z if z_high else minimum.z,
            )
        )
        for x_high in (False, True)
        for y_high in (False, True)
        for z_high in (False, True)
    ]
    return bounds_from_points(points)


def bounds_close(
    first: tuple[Vector, Vector],
    second: tuple[Vector, Vector],
) -> bool:
    return all(
        abs(first[bound][axis] - second[bound][axis]) <= TOLERANCE
        for bound in (0, 1)
        for axis in range(3)
    )


def bounds_contains(
    outer: tuple[Vector, Vector],
    inner: tuple[Vector, Vector],
) -> bool:
    return all(
        outer[0][axis] <= inner[0][axis] + TOLERANCE
        and outer[1][axis] >= inner[1][axis] - TOLERANCE
        for axis in range(3)
    )


def convert_bounds(
    bounds: tuple[Vector, Vector],
) -> tuple[Vector, Vector]:
    return transformed_bounds(
        bounds,
        Matrix(
            (
                (1.0, 0.0, 0.0, 0.0),
                (0.0, 0.0, 1.0, 0.0),
                (0.0, -1.0, 0.0, 0.0),
                (0.0, 0.0, 0.0, 1.0),
            )
        ),
    )


def convert_quaternion(
    rotation: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    w, x, y, z = rotation
    return (w, x, z, -y)


def positive_aabb_overlap(
    first: tuple[Vector, Vector],
    second: tuple[Vector, Vector],
) -> bool:
    overlap_depths = tuple(
        min(first[1][axis], second[1][axis])
        - max(first[0][axis], second[0][axis])
        for axis in range(3)
    )
    return all(depth > OVERLAP_TOLERANCE for depth in overlap_depths)


def coplanar_aabb_face_overlap(
    first: tuple[Vector, Vector],
    second: tuple[Vector, Vector],
) -> bool:
    overlap_depths = tuple(
        min(first[1][axis], second[1][axis])
        - max(first[0][axis], second[0][axis])
        for axis in range(3)
    )
    coplanar_axes = sum(
        abs(depth) <= OVERLAP_TOLERANCE for depth in overlap_depths
    )
    return coplanar_axes == 1 and all(
        depth > OVERLAP_TOLERANCE
        for depth in overlap_depths
        if abs(depth) > OVERLAP_TOLERANCE
    )


def blender_mesh_bounds(
    obj: bpy.types.Object,
) -> tuple[Vector, Vector] | None:
    if obj.type != "MESH":
        return None
    require(len(obj.data.vertices) > 0, f"{obj.name}: Mesh頂点がありません")
    return bounds_from_points([vertex.co.copy() for vertex in obj.data.vertices])


def build_blender_graph() -> AssetGraph:
    export_collection = bpy.data.collections.get(EXPORT_COLLECTION_NAME)
    require(
        export_collection is not None,
        f"Blender: {EXPORT_COLLECTION_NAME}がありません",
    )
    objects = tuple(export_collection.all_objects)
    names = [obj.name for obj in objects]
    require(
        len(names) == len(set(names)),
        "Blender: Export Collection内のObject名が重複しています",
    )
    object_names = set(names)
    nodes: dict[str, NodeRecord] = {}
    for obj in objects:
        translation, rotation, scale = obj.matrix_basis.decompose()
        properties = {
            key: python_value(obj[key])
            for key in obj.keys()
            if key.startswith("hs_")
        }
        nodes[obj.name] = NodeRecord(
            name=obj.name,
            kind=obj.type,
            properties=properties,
            parent_name=(
                obj.parent.name
                if obj.parent is not None and obj.parent.name in object_names
                else None
            ),
            child_names=tuple(
                sorted(
                    child.name
                    for child in obj.children
                    if child.name in object_names
                )
            ),
            translation=tuple(float(value) for value in translation),
            rotation=(
                float(rotation.w),
                float(rotation.x),
                float(rotation.y),
                float(rotation.z),
            ),
            scale=tuple(float(value) for value in scale),
            local_matrix=obj.matrix_basis.copy(),
            world_matrix=obj.matrix_world.copy(),
            local_bounds=blender_mesh_bounds(obj),
            local_component_bounds=(
                tuple(
                    component_bounds(component)
                    for component in mesh_connected_components(obj)
                )
                if obj.type == "MESH"
                and (
                    obj.name in SIGN_COMPONENT_OBJECT_NAMES
                    or obj.name.startswith("COL_DoorPanel_")
                )
                else ()
            ),
            triangle_count=(
                sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)
                if obj.type == "MESH"
                else 0
            ),
        )
    return AssetGraph("Blender", nodes)


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    require(len(data) >= 20, "GLBが短すぎます")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    require(magic == GLB_MAGIC, "GLB magicが不正です")
    require(version == GLB_VERSION, "GLB versionが2ではありません")
    require(declared_length == len(data), "GLB宣言長と実ファイル長が不一致です")

    document: dict[str, Any] | None = None
    binary_chunk: bytes | None = None
    offset = 12
    while offset < len(data):
        require(offset + 8 <= len(data), "GLB chunk headerが途中で終わっています")
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        require(
            offset + chunk_length <= len(data),
            "GLB chunkがファイル範囲外です",
        )
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == JSON_CHUNK_TYPE:
            require(document is None, "GLBにJSON chunkが複数あります")
            document = json.loads(
                chunk.decode("utf-8").rstrip("\x00 ")
            )
        elif chunk_type == BINARY_CHUNK_TYPE:
            require(binary_chunk is None, "GLBにBIN chunkが複数あります")
            binary_chunk = chunk
    require(offset == len(data), "GLB末尾に未解釈bytesがあります")
    require(document is not None, "GLBにJSON chunkがありません")
    require(binary_chunk is not None, "GLBにBIN chunkがありません")
    buffers = document.get("buffers", [])
    require(len(buffers) == 1, "GLBのbufferが1件ではありません")
    declared_binary_length = buffers[0].get("byteLength")
    require(
        isinstance(declared_binary_length, int)
        and declared_binary_length <= len(binary_chunk)
        and len(binary_chunk) - declared_binary_length <= 3,
        "GLBのBIN chunk長がbuffer宣言と一致しません",
    )
    return document, binary_chunk


def gltf_matrix(node: dict[str, Any]) -> Matrix:
    if "matrix" in node:
        values = node["matrix"]
        require(
            isinstance(values, list) and len(values) == 16,
            f"GLB node matrixが16要素ではありません: {node.get('name')}",
        )
        return Matrix(
            tuple(
                tuple(float(values[column * 4 + row]) for column in range(4))
                for row in range(4)
            )
        )

    translation = node.get("translation", (0.0, 0.0, 0.0))
    rotation = node.get("rotation", (0.0, 0.0, 0.0, 1.0))
    scale = node.get("scale", (1.0, 1.0, 1.0))
    require(len(translation) == 3, f"{node.get('name')}: translationが不正です")
    require(len(rotation) == 4, f"{node.get('name')}: rotationが不正です")
    require(len(scale) == 3, f"{node.get('name')}: scaleが不正です")
    quaternion = Quaternion(
        (
            float(rotation[3]),
            float(rotation[0]),
            float(rotation[1]),
            float(rotation[2]),
        )
    )
    return (
        Matrix.Translation(Vector(tuple(float(value) for value in translation)))
        @ quaternion.to_matrix().to_4x4()
        @ Matrix.Diagonal(tuple(float(value) for value in scale) + (1.0,))
    )


def gltf_accessor_values(
    document: dict[str, Any],
    binary_chunk: bytes,
    accessor_index: int,
    *,
    expected_type: str,
    allowed_component_types: frozenset[int],
) -> tuple[tuple[int | float, ...], ...]:
    accessors = document.get("accessors", [])
    buffer_views = document.get("bufferViews", [])
    require(
        0 <= accessor_index < len(accessors),
        f"GLB accessor参照が範囲外です: {accessor_index}",
    )
    accessor = accessors[accessor_index]
    require("sparse" not in accessor, f"GLB sparse accessorは許可しません: {accessor_index}")
    require(
        accessor.get("type") == expected_type,
        f"GLB accessor型が{expected_type}ではありません: {accessor_index}",
    )
    component_type = accessor.get("componentType")
    require(
        component_type in allowed_component_types
        and component_type in GLTF_COMPONENT_FORMATS,
        f"GLB accessor componentTypeが不正です: {accessor_index}/{component_type}",
    )
    require(
        not accessor.get("normalized", False),
        f"GLB geometry accessorがnormalizedです: {accessor_index}",
    )
    buffer_view_index = accessor.get("bufferView")
    require(
        isinstance(buffer_view_index, int)
        and 0 <= buffer_view_index < len(buffer_views),
        f"GLB accessorのbufferView参照が不正です: {accessor_index}",
    )
    buffer_view = buffer_views[buffer_view_index]
    require(
        buffer_view.get("buffer", 0) == 0,
        f"GLB bufferViewが内蔵BINを参照していません: {buffer_view_index}",
    )
    count = accessor.get("count")
    require(
        isinstance(count, int) and count > 0,
        f"GLB accessor countが不正です: {accessor_index}/{count}",
    )
    component_count = GLTF_TYPE_COMPONENT_COUNTS[expected_type]
    component_format = GLTF_COMPONENT_FORMATS[component_type]
    component_size = struct.calcsize("<" + component_format)
    element_size = component_size * component_count
    byte_stride = buffer_view.get("byteStride", element_size)
    require(
        isinstance(byte_stride, int)
        and byte_stride >= element_size
        and byte_stride % component_size == 0,
        f"GLB bufferView byteStrideが不正です: {buffer_view_index}/{byte_stride}",
    )
    view_offset = buffer_view.get("byteOffset", 0)
    view_length = buffer_view.get("byteLength")
    accessor_offset = accessor.get("byteOffset", 0)
    require(
        isinstance(view_offset, int)
        and view_offset >= 0
        and isinstance(view_length, int)
        and view_length > 0
        and isinstance(accessor_offset, int)
        and accessor_offset >= 0,
        f"GLB accessor byte範囲が不正です: {accessor_index}",
    )
    first_offset = view_offset + accessor_offset
    final_offset = first_offset + (count - 1) * byte_stride + element_size
    require(
        final_offset <= view_offset + view_length
        and final_offset <= len(binary_chunk),
        f"GLB accessorがBIN範囲外です: {accessor_index}",
    )
    unpack_format = "<" + component_format * component_count
    return tuple(
        struct.unpack_from(
            unpack_format,
            binary_chunk,
            first_offset + element_index * byte_stride,
        )
        for element_index in range(count)
    )


def gltf_mesh_component_bounds(
    document: dict[str, Any],
    binary_chunk: bytes,
    mesh_index: int,
    node_name: str,
) -> tuple[tuple[Vector, Vector], ...]:
    meshes = document.get("meshes", [])
    require(
        0 <= mesh_index < len(meshes),
        f"{node_name}: mesh参照が範囲外です",
    )
    adjacency: dict[tuple[float, float, float], set[tuple[float, float, float]]] = {}
    coordinates: dict[tuple[float, float, float], Vector] = {}
    for primitive in meshes[mesh_index].get("primitives", []):
        require(
            primitive.get("mode", 4) == 4,
            f"{node_name}: GLB primitiveがTRIANGLESではありません",
        )
        position_index = primitive.get("attributes", {}).get("POSITION")
        require(
            isinstance(position_index, int),
            f"{node_name}: POSITION accessor参照がありません",
        )
        positions = gltf_accessor_values(
            document,
            binary_chunk,
            position_index,
            expected_type="VEC3",
            allowed_component_types=frozenset({5126}),
        )
        position_keys = tuple(
            tuple(round(float(value), 6) for value in position)
            for position in positions
        )
        indices_index = primitive.get("indices")
        if indices_index is None:
            indices = tuple(range(len(positions)))
        else:
            require(
                isinstance(indices_index, int),
                f"{node_name}: indices accessor参照が不正です",
            )
            indices = tuple(
                int(value[0])
                for value in gltf_accessor_values(
                    document,
                    binary_chunk,
                    indices_index,
                    expected_type="SCALAR",
                    allowed_component_types=frozenset({5121, 5123, 5125}),
                )
            )
        require(
            len(indices) % 3 == 0
            and all(0 <= index < len(positions) for index in indices),
            f"{node_name}: triangle index列が不正です",
        )
        for triangle_offset in range(0, len(indices), 3):
            triangle_keys = tuple(
                position_keys[index]
                for index in indices[triangle_offset:triangle_offset + 3]
            )
            for key in triangle_keys:
                coordinates[key] = Vector(key)
                adjacency.setdefault(key, set()).update(triangle_keys)

    require(bool(adjacency), f"{node_name}: component判定対象triangleがありません")
    pending = set(adjacency)
    components: list[tuple[Vector, Vector]] = []
    while pending:
        component_keys: set[tuple[float, float, float]] = set()
        frontier = [min(pending)]
        while frontier:
            key = frontier.pop()
            if key not in pending:
                continue
            pending.remove(key)
            component_keys.add(key)
            frontier.extend(adjacency[key] & pending)
        components.append(
            bounds_from_points([coordinates[key] for key in component_keys])
        )
    return tuple(
        sorted(
            components,
            key=lambda bounds: tuple(
                round(float(bounds[bound][axis]), 6)
                for bound in (0, 1)
                for axis in range(3)
            ),
        )
    )


def gltf_mesh_geometry(
    document: dict[str, Any],
    mesh_index: int,
    node_name: str,
) -> tuple[tuple[Vector, Vector], int]:
    meshes = document.get("meshes", [])
    accessors = document.get("accessors", [])
    require(
        0 <= mesh_index < len(meshes),
        f"{node_name}: mesh参照が範囲外です",
    )
    points: list[Vector] = []
    triangle_count = 0
    for primitive in meshes[mesh_index].get("primitives", []):
        position_index = primitive.get("attributes", {}).get("POSITION")
        require(
            isinstance(position_index, int)
            and 0 <= position_index < len(accessors),
            f"{node_name}: POSITION accessor参照が不正です",
        )
        accessor = accessors[position_index]
        minimum = accessor.get("min")
        maximum = accessor.get("max")
        require(
            isinstance(minimum, list)
            and isinstance(maximum, list)
            and len(minimum) == 3
            and len(maximum) == 3,
            f"{node_name}: POSITION accessorにmin/maxがありません",
        )
        points.extend(
            (
                Vector(tuple(float(value) for value in minimum)),
                Vector(tuple(float(value) for value in maximum)),
            )
        )
        mode = primitive.get("mode", 4)
        require(mode == 4, f"{node_name}: GLB primitiveがTRIANGLESではありません")
        indices_index = primitive.get("indices")
        if indices_index is None:
            element_count = accessor.get("count")
        else:
            require(
                isinstance(indices_index, int)
                and 0 <= indices_index < len(accessors),
                f"{node_name}: indices accessor参照が不正です",
            )
            element_count = accessors[indices_index].get("count")
        require(
            isinstance(element_count, int) and element_count % 3 == 0,
            f"{node_name}: triangle index数が不正です",
        )
        triangle_count += element_count // 3
    require(points, f"{node_name}: Mesh primitiveがありません")
    return bounds_from_points(points), triangle_count


def build_glb_graph(
    document: dict[str, Any],
    binary_chunk: bytes,
) -> AssetGraph:
    raw_nodes = document.get("nodes", [])
    require(isinstance(raw_nodes, list), "GLB nodesが配列ではありません")
    names = [node.get("name") for node in raw_nodes]
    require(
        all(isinstance(name, str) and name for name in names),
        "GLBに無名nodeがあります",
    )
    require(len(names) == len(set(names)), "GLB node名が重複しています")

    parent_indices: dict[int, int] = {}
    for parent_index, node in enumerate(raw_nodes):
        for child_index in node.get("children", []):
            require(
                isinstance(child_index, int)
                and 0 <= child_index < len(raw_nodes),
                f"{node['name']}: child参照が範囲外です",
            )
            require(
                child_index not in parent_indices,
                f"{raw_nodes[child_index]['name']}: GLB親nodeが複数あります",
            )
            parent_indices[child_index] = parent_index

    reachable: set[int] = set()
    pending = [
        node_index
        for scene in document.get("scenes", [])
        for node_index in scene.get("nodes", [])
    ]
    while pending:
        node_index = pending.pop()
        require(
            isinstance(node_index, int) and 0 <= node_index < len(raw_nodes),
            "GLB scene node参照が不正です",
        )
        if node_index in reachable:
            continue
        reachable.add(node_index)
        pending.extend(raw_nodes[node_index].get("children", []))
    require(
        reachable == set(range(len(raw_nodes))),
        "GLBにsceneから到達できないnodeがあります",
    )

    local_matrices = [gltf_matrix(node) for node in raw_nodes]
    world_matrices: dict[int, Matrix] = {}
    visiting: set[int] = set()

    def world_matrix(index: int) -> Matrix:
        if index in world_matrices:
            return world_matrices[index]
        require(index not in visiting, "GLB node階層が循環しています")
        visiting.add(index)
        parent_index = parent_indices.get(index)
        result = (
            local_matrices[index]
            if parent_index is None
            else world_matrix(parent_index) @ local_matrices[index]
        )
        visiting.remove(index)
        world_matrices[index] = result
        return result

    nodes: dict[str, NodeRecord] = {}
    for index, raw_node in enumerate(raw_nodes):
        name = raw_node["name"]
        local_matrix = local_matrices[index]
        translation, rotation, scale = local_matrix.decompose()
        extras = raw_node.get("extras", {})
        require(isinstance(extras, dict), f"{name}: extrasがObjectではありません")
        properties = {
            key: python_value(value)
            for key, value in extras.items()
            if key.startswith("hs_")
        }
        mesh_index = raw_node.get("mesh")
        local_bounds = None
        local_component_bounds: tuple[tuple[Vector, Vector], ...] = ()
        triangle_count = 0
        kind = "EMPTY"
        if mesh_index is not None:
            require(isinstance(mesh_index, int), f"{name}: mesh参照が整数ではありません")
            kind = "MESH"
            local_bounds, triangle_count = gltf_mesh_geometry(
                document,
                mesh_index,
                name,
            )
            if (
                name in SIGN_COMPONENT_OBJECT_NAMES
                or name.startswith("COL_DoorPanel_")
            ):
                local_component_bounds = gltf_mesh_component_bounds(
                    document,
                    binary_chunk,
                    mesh_index,
                    name,
                )
        nodes[name] = NodeRecord(
            name=name,
            kind=kind,
            properties=properties,
            parent_name=(
                raw_nodes[parent_indices[index]]["name"]
                if index in parent_indices
                else None
            ),
            child_names=tuple(
                sorted(raw_nodes[child_index]["name"] for child_index in raw_node.get("children", []))
            ),
            translation=tuple(float(value) for value in translation),
            rotation=(
                float(rotation.w),
                float(rotation.x),
                float(rotation.y),
                float(rotation.z),
            ),
            scale=tuple(float(value) for value in scale),
            local_matrix=local_matrix,
            world_matrix=world_matrix(index),
            local_bounds=local_bounds,
            local_component_bounds=local_component_bounds,
            triangle_count=triangle_count,
        )
    return AssetGraph("GLB", nodes)


def require_node_contract(
    node: NodeRecord,
    *,
    kind: str,
    parent_name: str | None,
    properties: dict[str, Any],
) -> None:
    require(
        node.kind == kind,
        f"{node.name}: Object種別が不正です: actual={node.kind}, expected={kind}",
    )
    require(
        node.parent_name == parent_name,
        f"{node.name}: 親が不正です: "
        f"actual={node.parent_name}, expected={parent_name}",
    )
    require_properties(node, properties)


def expected_door_specs() -> tuple[DoorSpec, ...]:
    result: list[DoorSpec] = []
    for room in ROOM_SPECS:
        minimum_x, maximum_x, minimum_y, maximum_y = room.bounds_xy
        room_center = (
            (minimum_y + maximum_y) / 2.0
            if room.wall_axis == "west"
            else (minimum_x + maximum_x) / 2.0
        )
        for opening_index, (minimum, maximum) in enumerate(room.openings, 1):
            opening_center = (minimum + maximum) / 2.0
            open_sign = 1.0 if opening_center < room_center else -1.0
            if room.wall_axis == "west":
                door_plane = -3.28
                root_location = (door_plane, opening_center, room.base_z)
                normal_offset = 0.0
                open_location = (
                    normal_offset,
                    open_sign * 1.20,
                    0.0,
                )
            else:
                door_plane = 36.28
                root_location = (opening_center, door_plane, room.base_z)
                normal_offset = 0.0
                open_location = (
                    open_sign * 1.20,
                    normal_offset,
                    0.0,
                )
            result.append(
                DoorSpec(
                    token=f"{token(room.author_name)}_{opening_index:02d}",
                    door_id=f"room-door-{room.room_id}-{opening_index:02d}",
                    door_class="room",
                    motion_kind="slide",
                    root_location=root_location,
                    open_location=open_location,
                    open_rotation_z=0.0,
                    parent_name=None,
                    wall_axis=room.wall_axis,
                    wall_normal_bounds=(
                        (-3.65, -3.35)
                        if room.wall_axis == "west"
                        else (36.35, 36.65)
                    ),
                    corridor_normal_direction=(
                        1 if room.wall_axis == "west" else -1
                    ),
                    minimum_wall_clearance=0.01,
                )
            )

    for token_value, door_id, center_x in (
        ("RoofChangingMale_01", "room-door-roof-changing-male-01", -4.80),
        ("RoofChangingFemale_01", "room-door-roof-changing-female-01", -0.30),
    ):
        result.append(
            DoorSpec(
                token=token_value,
                door_id=door_id,
                door_class="room",
                motion_kind="slide",
                root_location=(center_x, 38.42, 14.50),
                open_location=(1.20, 0.0, 0.0),
                open_rotation_z=0.0,
                parent_name=None,
                wall_axis="north",
                wall_normal_bounds=(38.50, 38.80),
                corridor_normal_direction=-1,
                minimum_wall_clearance=0.02,
            )
        )

    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        for gender, hinge_positions in (
            ("m", (-5.05, -3.65, -2.25)),
            ("f", (-0.55, 0.85, 2.25)),
        ):
            for stall_index, hinge_x in enumerate(hinge_positions, 1):
                result.append(
                    DoorSpec(
                        token=(
                            f"ToiletStall_F{floor:02d}_"
                            f"{gender.upper()}_{stall_index:02d}"
                        ),
                        door_id=(
                            f"toilet-stall-f{floor:02d}-"
                            f"{gender}-{stall_index:02d}"
                        ),
                        door_class="toilet_stall",
                        motion_kind="swing",
                        root_location=(hinge_x, 43.25, base_z),
                        open_location=(0.0, 0.0, 0.0),
                        open_rotation_z=-math.radians(85.0),
                        parent_name=None,
                    )
                )

    result.append(
        DoorSpec(
            token="ElevatorCar_School",
            door_id="school-elevator-car-door",
            door_class="elevator_car",
            motion_kind="slide",
            root_location=(0.0, -0.99, 0.12),
            open_location=(0.0, 0.0, 0.0),
            open_rotation_z=0.0,
            parent_name="MRK_ElevatorCar_School",
            elevator_id="school-elevator",
        )
    )
    for floor in (1, 4):
        result.append(
            DoorSpec(
                token=f"ElevatorLanding_F{floor:02d}",
                door_id=f"school-elevator-landing-door-f{floor:02d}",
                door_class="elevator_landing",
                motion_kind="slide",
                root_location=(0.0, -1.46, 0.0),
                open_location=(0.0, 0.0, 0.0),
                open_rotation_z=0.0,
                parent_name=f"MRK_ElevatorStop_F{floor:02d}",
                elevator_id="school-elevator",
                stop_id=f"school-elevator-stop-f{floor:02d}",
            )
        )
    return tuple(result)


def expected_panel_specs(spec: DoorSpec) -> tuple[DoorPanelSpec, ...]:
    if spec.door_class not in {"elevator_car", "elevator_landing"}:
        return (
            DoorPanelSpec(
                token=spec.token,
                panel_id=f"{spec.door_id}-panel",
                open_pose_id=f"{spec.door_id}-open-pose",
                closed_location=(0.0, 0.0, 0.0),
                open_location=spec.open_location,
                open_rotation_z=spec.open_rotation_z,
            ),
        )

    return tuple(
        DoorPanelSpec(
            token=f"{spec.token}_{panel_token}",
            panel_id=(
                f"{spec.door_id}-panel-{token(panel_token).lower()}"
            ),
            open_pose_id=(
                f"{spec.door_id}-panel-"
                f"{token(panel_token).lower()}-open-pose"
            ),
            closed_location=(closed_x, local_y, 0.0),
            open_location=(open_x, local_y, 0.0),
            open_rotation_z=0.0,
        )
        for panel_token, closed_x, local_y, open_x in (
            ("LeftOuter", -0.600, -0.020, -1.000),
            ("LeftInner", -0.200, 0.020, -1.000),
            ("RightInner", 0.200, 0.020, 1.000),
            ("RightOuter", 0.600, -0.020, 1.000),
        )
    )


def audit_room_variants(
    graph: AssetGraph,
    *,
    glb_coordinates: bool,
) -> dict[str, int]:
    markers = graph.role_nodes("room_variant")
    require(
        len(markers) == 40,
        f"{graph.source}: room_variantが40件ではありません: {len(markers)}",
    )
    markers_by_key: dict[tuple[str, str], NodeRecord] = {}
    for marker in markers:
        key = (
            marker.properties.get("hs_room_id"),
            marker.properties.get("hs_variant_id"),
        )
        require(key not in markers_by_key, f"{graph.source}: room_variantが重複しています: {key}")
        markers_by_key[key] = marker
    expected_keys = {
        (room_id, variant_id)
        for room_id in EXPECTED_ROOM_IDS
        for variant_id in EXPECTED_VARIANT_IDS
    }
    require(
        set(markers_by_key) == expected_keys,
        f"{graph.source}: 固定20室×2 variant集合が不正です",
    )

    unchanged_room_parity_checks = 0
    collider_blocker_parity_checks = 0
    front_door_nav_blocker_checks = 0
    disordered_bounds_checks = 0
    for room in ROOM_SPECS:
        room_token = token(room.author_name)
        normal_children = {
            f"VIS_B03_Interior_{room.author_name}_FurnitureProps",
            f"COL_B03_Interior_{room.author_name}",
            f"NAV_RoomVariant_{room_token}_Normal_Blocker",
        }
        disordered_children = {
            f"VIS_RoomVariant_{room_token}_Disordered_FurnitureProps",
            f"COL_RoomVariant_{room_token}_Disordered",
            f"NAV_RoomVariant_{room_token}_Disordered_Blocker",
        }
        if room.author_name == "F01_Infirmary":
            normal_children.update(
                f"VIS_B03_Interior_F01_Infirmary_Curtain_{panel_name}"
                for panel_name in INFIRMARY_CURTAIN_PANEL_NAMES
            )
            disordered_children.update(
                f"VIS_RoomVariant_F01_Infirmary_Disordered_Curtain_{panel_name}"
                for panel_name in INFIRMARY_CURTAIN_PANEL_NAMES
            )
            normal_children.add(
                INFIRMARY_NORMAL_CURTAIN_BEAM_SIGHT_COLLIDER_NAME
            )
            disordered_children.add(
                INFIRMARY_DISORDERED_CURTAIN_BEAM_SIGHT_COLLIDER_NAME
            )
        if room.has_signs_paper:
            normal_children.add(
                f"VIS_B03_Interior_{room.author_name}_SignsPaper"
            )
            disordered_children.add(
                f"VIS_RoomVariant_{room_token}_Disordered_SignsPaper"
            )

        for variant_id, expected_children in (
            ("normal", normal_children),
            ("disordered", disordered_children),
        ):
            marker = markers_by_key[(room.room_id, variant_id)]
            expected_marker_name = (
                f"MRK_RoomVariant_{room_token}_{variant_id.capitalize()}"
            )
            require(
                marker.name == expected_marker_name,
                f"{graph.source}: room_variant名が不正です: "
                f"actual={marker.name}, expected={expected_marker_name}",
            )
            require_node_contract(
                marker,
                kind="EMPTY",
                parent_name=None,
                properties={
                    "hs_id": f"room-variant-{room.room_id}-{variant_id}",
                    "hs_role": "room_variant",
                    "hs_room_id": room.room_id,
                    "hs_variant_id": variant_id,
                },
            )
            require_transform(
                marker,
                (0.0, 0.0, 0.0),
                identity_quaternion(),
            )
            require(
                set(marker.child_names) == expected_children,
                f"{marker.name}: variant子Object集合が不正です: "
                f"actual={sorted(marker.child_names)}, "
                f"expected={sorted(expected_children)}",
            )

            for child_name in expected_children:
                child = graph.require_node(child_name)
                require(
                    child.parent_name == marker.name,
                    f"{child.name}: room_variant直下ではありません",
                )
                require(
                    child.kind == "MESH",
                    f"{child.name}: variant子がMeshではありません",
                )
                require(
                    child.local_bounds is not None,
                    f"{child.name}: variant子MeshにAABBがありません",
                )
                if child.name.startswith("NAV_"):
                    require_properties(
                        child,
                        {
                            "hs_nav_set": "human",
                            "hs_nav_role": "blocker",
                        },
                    )
                else:
                    require_properties(child, {})

                if variant_id == "disordered":
                    minimum_x, maximum_x, minimum_y, maximum_y = (
                        room.bounds_xy
                    )
                    room_bounds = (
                        Vector(
                            (
                                minimum_x - ROOM_VARIANT_WALL_ATTACHMENT_ALLOWANCE,
                                minimum_y - ROOM_VARIANT_WALL_ATTACHMENT_ALLOWANCE,
                                room.base_z,
                            )
                        ),
                        Vector(
                            (
                                maximum_x + ROOM_VARIANT_WALL_ATTACHMENT_ALLOWANCE,
                                maximum_y + ROOM_VARIANT_WALL_ATTACHMENT_ALLOWANCE,
                                room.base_z + 3.20,
                            )
                        ),
                    )
                    if glb_coordinates:
                        room_bounds = convert_bounds(room_bounds)
                    child_world_bounds = transformed_bounds(
                        child.local_bounds,
                        child.world_matrix,
                    )
                    require(
                        bounds_contains(room_bounds, child_world_bounds),
                        f"{child.name}: 荒れ版Meshが室内boundsから出ています: "
                        f"actual={child_world_bounds}, room={room_bounds}",
                    )
                    disordered_bounds_checks += 1

            child_prefixes = Counter(
                child_name.split("_", 1)[0]
                for child_name in marker.child_names
            )
            require(
                child_prefixes["VIS"] >= 1
                and child_prefixes["COL"]
                == (2 if room.author_name == "F01_Infirmary" else 1)
                and child_prefixes["NAV"] == 1,
                f"{marker.name}: VIS/COL/NAV構成が不正です: {child_prefixes}",
            )

        for variant_id, collider_name, blocker_name in (
            (
                "normal",
                f"COL_B03_Interior_{room.author_name}",
                f"NAV_RoomVariant_{room_token}_Normal_Blocker",
            ),
            (
                "disordered",
                f"COL_RoomVariant_{room_token}_Disordered",
                f"NAV_RoomVariant_{room_token}_Disordered_Blocker",
            ),
        ):
            collider = graph.require_node(collider_name)
            blocker = graph.require_node(blocker_name)
            require(
                collider.local_bounds is not None
                and blocker.local_bounds is not None,
                f"{room.room_id}/{variant_id}: COL/BlockerにAABBがありません",
            )
            if (
                variant_id == "disordered"
                and room.room_id in FRONT_BLOCKED_CLASSROOM_ROOM_IDS
            ):
                require(
                    not bounds_close(collider.local_bounds, blocker.local_bounds)
                    and blocker.triangle_count == 12,
                    f"{room.room_id}/{variant_id}: 前扉用Nav Blockerが単一箱ではありません",
                )
                front_door_nav_blocker_checks += 1
            else:
                require(
                    bounds_close(collider.local_bounds, blocker.local_bounds)
                    and collider.triangle_count == blocker.triangle_count,
                    f"{room.room_id}/{variant_id}: COL/Blocker形状契約が不一致です",
                )
                collider_blocker_parity_checks += 1

        if room.room_id in UNCHANGED_DISORDERED_ROOM_IDS:
            unchanged_pairs = [
                (
                    f"VIS_B03_Interior_{room.author_name}_FurnitureProps",
                    f"VIS_RoomVariant_{room_token}_Disordered_FurnitureProps",
                ),
                (
                    f"COL_B03_Interior_{room.author_name}",
                    f"COL_RoomVariant_{room_token}_Disordered",
                ),
                (
                    f"NAV_RoomVariant_{room_token}_Normal_Blocker",
                    f"NAV_RoomVariant_{room_token}_Disordered_Blocker",
                ),
            ]
            if room.has_signs_paper:
                unchanged_pairs.append(
                    (
                        f"VIS_B03_Interior_{room.author_name}_SignsPaper",
                        f"VIS_RoomVariant_{room_token}_Disordered_SignsPaper",
                    )
                )
            for normal_name, disordered_name in unchanged_pairs:
                normal_node = graph.require_node(normal_name)
                disordered_node = graph.require_node(disordered_name)
                require(
                    normal_node.local_bounds is not None
                    and disordered_node.local_bounds is not None,
                    f"{room.room_id}: A配置の通常・荒れ版にAABBがありません",
                )
                require(
                    bounds_close(
                        normal_node.local_bounds,
                        disordered_node.local_bounds,
                    )
                    and normal_node.triangle_count
                    == disordered_node.triangle_count,
                    f"{room.room_id}: A配置の通常・荒れ版が一致しません: "
                    f"{normal_name}/{disordered_name}",
                )
                unchanged_room_parity_checks += 1

    volumes = graph.role_nodes("room_variant_tile")
    require(
        len(volumes) == 20,
        f"{graph.source}: room_variant_tileが20件ではありません: {len(volumes)}",
    )
    volumes_by_room: dict[str, NodeRecord] = {}
    volume_bounds: dict[str, tuple[Vector, Vector]] = {}
    for volume in volumes:
        room_id = volume.properties.get("hs_room_id")
        require(
            isinstance(room_id, str) and room_id in EXPECTED_ROOM_IDS,
            f"{volume.name}: hs_room_idが固定20室に含まれません",
        )
        require(
            room_id not in volumes_by_room,
            f"{graph.source}: room_variant_tileが重複しています: {room_id}",
        )
        volumes_by_room[room_id] = volume
        room = next(item for item in ROOM_SPECS if item.room_id == room_id)
        expected_name = f"VOL_RoomVariantTile_{token(room.author_name)}"
        require(
            volume.name == expected_name,
            f"{graph.source}: room_variant_tile名が不正です: "
            f"actual={volume.name}, expected={expected_name}",
        )
        require_node_contract(
            volume,
            kind="MESH",
            parent_name=None,
            properties={
                "hs_id": f"room-variant-tile-{room_id}",
                "hs_role": "room_variant_tile",
                "hs_room_id": room_id,
            },
        )
        require_transform(
            volume,
            (0.0, 0.0, 0.0),
            identity_quaternion(),
        )
        require(
            volume.local_bounds is not None,
            f"{volume.name}: Volume MeshにAABBがありません",
        )
        world_bounds = transformed_bounds(
            volume.local_bounds,
            volume.world_matrix,
        )
        require(
            all(
                world_bounds[1][axis] - world_bounds[0][axis] > TOLERANCE
                for axis in range(3)
            ),
            f"{volume.name}: Volume AABBが退化しています",
        )
        volume_bounds[room_id] = world_bounds
    require(
        set(volumes_by_room) == set(EXPECTED_ROOM_IDS),
        f"{graph.source}: room_variant_tileのroomId集合が不正です",
    )

    overlaps: list[tuple[str, str]] = []
    room_ids = sorted(volume_bounds)
    for first_index, first_room_id in enumerate(room_ids):
        for second_room_id in room_ids[first_index + 1 :]:
            if positive_aabb_overlap(
                volume_bounds[first_room_id],
                volume_bounds[second_room_id],
            ):
                overlaps.append((first_room_id, second_room_id))
    require(
        not overlaps,
        f"{graph.source}: room_variant_tile所有Volumeが重複しています: {overlaps}",
    )
    return {
        "rooms": len(EXPECTED_ROOM_IDS),
        "markers": len(markers),
        "tile_volumes": len(volumes),
        "tile_volume_overlaps": len(overlaps),
        "unchanged_disordered_rooms": len(UNCHANGED_DISORDERED_ROOM_IDS),
        "unchanged_room_parity_checks": unchanged_room_parity_checks,
        "collider_blocker_parity_checks": collider_blocker_parity_checks,
        "front_door_nav_blocker_checks": front_door_nav_blocker_checks,
        "disordered_bounds_checks": disordered_bounds_checks,
    }


def audit_doors(
    graph: AssetGraph,
    *,
    glb_coordinates: bool,
) -> dict[str, Any]:
    specs = expected_door_specs()
    require(len(specs) == 67, "監査側DoorSpecが67件ではありません")
    expected_by_id = {spec.door_id: spec for spec in specs}
    require(
        len(expected_by_id) == len(specs),
        "監査側DoorSpecのhs_idが重複しています",
    )
    expected_panel_count = sum(
        len(expected_panel_specs(spec))
        for spec in specs
    )
    require(
        expected_panel_count == 76,
        "監査側DoorPanelSpecが76件ではありません",
    )

    door_nodes = graph.role_nodes("door")
    panel_nodes = graph.role_nodes("door_panel")
    open_pose_nodes = graph.role_nodes("door_open_pose")
    sweep_nodes = graph.role_nodes("door_sweep")
    for role, nodes, expected_count in (
        ("door", door_nodes, 67),
        ("door_panel", panel_nodes, expected_panel_count),
        ("door_open_pose", open_pose_nodes, expected_panel_count),
        ("door_sweep", sweep_nodes, 67),
    ):
        require(
            len(nodes) == expected_count,
            f"{graph.source}: {role}が{expected_count}件ではありません: "
            f"{len(nodes)}",
        )

    actual_door_ids = {node.properties.get("hs_id") for node in door_nodes}
    require(
        actual_door_ids == set(expected_by_id),
        f"{graph.source}: Door hs_id集合が不正です",
    )

    door_classes = Counter()
    motion_kinds = Counter()
    sweep_containment_checks = 0
    elevator_pocket_checks = 0
    room_wall_clearance_checks = 0
    room_hardware_wall_clearance_checks = 0
    corridor_side_checks = 0
    hardware_counts = Counter()
    expected_hardware_names: set[str] = set()
    for spec in specs:
        root_name = f"MRK_Door_{spec.token}"
        sweep_name = f"VOL_DoorSweep_{spec.token}"
        sweep_id = f"{spec.door_id}-sweep"
        panel_specs = expected_panel_specs(spec)

        door_properties: dict[str, Any] = {
            "hs_id": spec.door_id,
            "hs_role": "door",
            "hs_door_class": spec.door_class,
            "hs_sweep_id": sweep_id,
        }
        if spec.elevator_id is not None:
            door_properties["hs_elevator_id"] = spec.elevator_id
        if spec.stop_id is not None:
            door_properties["hs_stop_id"] = spec.stop_id

        root = graph.require_node(root_name)
        sweep = graph.require_node(sweep_name)

        require_node_contract(
            root,
            kind="EMPTY",
            parent_name=spec.parent_name,
            properties=door_properties,
        )
        expected_root_children = {sweep_name}
        for panel_spec in panel_specs:
            expected_root_children.update(
                {
                    f"MRK_DoorPanel_{panel_spec.token}",
                    f"MRK_DoorOpenPose_{panel_spec.token}",
                }
            )
        require(
            set(root.child_names) == expected_root_children,
            f"{root.name}: Door直下のPanel/OpenPose/Sweep構成が不正です",
        )
        require_transform(
            root,
            convert_location(
                spec.root_location,
                glb_coordinates=glb_coordinates,
            ),
            identity_quaternion(),
        )

        require_node_contract(
            sweep,
            kind="MESH",
            parent_name=root_name,
            properties={
                "hs_id": sweep_id,
                "hs_role": "door_sweep",
                "hs_door_id": spec.door_id,
            },
        )
        require_transform(
            sweep,
            (0.0, 0.0, 0.0),
            identity_quaternion(),
        )
        require(
            sweep.local_bounds is not None,
            f"{sweep.name}: Door sweep MeshにAABBがありません",
        )
        require(
            not sweep.child_names,
            f"{sweep.name}: Door sweepに子Objectがあります",
        )
        if spec.door_class == "toilet_stall":
            expected_sweep_bounds = (
                Vector((-1.42, -0.02, 0.0)),
                Vector((0.02, 1.42, 1.80)),
            )
            if glb_coordinates:
                expected_sweep_bounds = convert_bounds(
                    expected_sweep_bounds
                )
            require(
                bounds_close(sweep.local_bounds, expected_sweep_bounds),
                f"{sweep.name}: トイレ個室扉sweep境界が不正です: "
                f"actual={sweep.local_bounds}, "
                f"expected={expected_sweep_bounds}",
            )

        closed_panel_bounds: list[tuple[Vector, Vector]] = []
        for panel_spec in panel_specs:
            panel_name = f"MRK_DoorPanel_{panel_spec.token}"
            visual_name = f"VIS_DoorPanel_{panel_spec.token}"
            collider_name = f"COL_DoorPanel_{panel_spec.token}"
            open_pose_name = f"MRK_DoorOpenPose_{panel_spec.token}"
            hardware_name = None
            if spec.door_class == "room":
                hardware_name = f"VIS_DoorPanel_Handle_{panel_spec.token}"
            elif spec.door_class == "toilet_stall":
                hardware_name = f"VIS_DoorPanel_Knob_{panel_spec.token}"
            panel = graph.require_node(panel_name)
            visual = graph.require_node(visual_name)
            collider = graph.require_node(collider_name)
            open_pose = graph.require_node(open_pose_name)
            hardware = None
            expected_panel_children = {visual_name, collider_name}
            if hardware_name is not None:
                expected_panel_children.add(hardware_name)
                expected_hardware_names.add(hardware_name)

            require_node_contract(
                panel,
                kind="EMPTY",
                parent_name=root_name,
                properties={
                    "hs_id": panel_spec.panel_id,
                    "hs_role": "door_panel",
                    "hs_door_id": spec.door_id,
                    "hs_motion_kind": spec.motion_kind,
                    "hs_open_pose_id": panel_spec.open_pose_id,
                },
            )
            require(
                set(panel.child_names) == expected_panel_children,
                f"{panel.name}: VIS/COL/扉金物の子構成が不正です",
            )
            require_transform(
                panel,
                convert_location(
                    panel_spec.closed_location,
                    glb_coordinates=glb_coordinates,
                ),
                identity_quaternion(),
            )

            for child in (visual, collider):
                require_node_contract(
                    child,
                    kind="MESH",
                    parent_name=panel_name,
                    properties={},
                )
                require_transform(
                    child,
                    (0.0, 0.0, 0.0),
                    identity_quaternion(),
                )
                require(
                    child.local_bounds is not None,
                    f"{child.name}: Door panel MeshにAABBがありません",
                )
            require(
                bounds_close(visual.local_bounds, collider.local_bounds),
                f"{panel.name}: VIS/COLの閉状態AABBが一致しません",
            )
            if spec.door_class == "toilet_stall":
                expected_panel_bounds = (
                    Vector((-1.40, -0.02, 0.0)),
                    Vector((0.0, 0.02, 1.80)),
                )
                if glb_coordinates:
                    expected_panel_bounds = convert_bounds(
                        expected_panel_bounds
                    )
                require(
                    bounds_close(
                        collider.local_bounds,
                        expected_panel_bounds,
                    ),
                    f"{panel.name}: トイレ個室扉panel境界が不正です: "
                    f"actual={collider.local_bounds}, "
                    f"expected={expected_panel_bounds}",
                )

            if hardware_name is not None:
                hardware = graph.require_node(hardware_name)
                require_node_contract(
                    hardware,
                    kind="MESH",
                    parent_name=panel_name,
                    properties={},
                )
                require_transform(
                    hardware,
                    (0.0, 0.0, 0.0),
                    identity_quaternion(),
                )
                require(
                    hardware.local_bounds is not None,
                    f"{hardware.name}: 扉金物MeshにAABBがありません",
                )
                require(
                    not hardware.child_names,
                    f"{hardware.name}: 扉金物に子Objectがあります",
                )
                if spec.door_class == "room":
                    if abs(panel_spec.open_location[0]) > abs(
                        panel_spec.open_location[1]
                    ):
                        handle_center = -math.copysign(
                            0.45,
                            panel_spec.open_location[0],
                        )
                        expected_hardware_bounds = (
                            Vector((handle_center - 0.08, -0.06, 0.89)),
                            Vector((handle_center + 0.08, 0.06, 1.21)),
                        )
                    else:
                        handle_center = -math.copysign(
                            0.45,
                            panel_spec.open_location[1],
                        )
                        expected_hardware_bounds = (
                            Vector((-0.06, handle_center - 0.08, 0.89)),
                            Vector((0.06, handle_center + 0.08, 1.21)),
                        )
                    require(
                        hardware.triangle_count == 24,
                        f"{hardware.name}: 両面box2個の24 trianglesではありません",
                    )
                    hardware_counts["room_handle"] += 1
                else:
                    expected_hardware_bounds = (
                        Vector(
                            (
                                -1.2736654964089394,
                                -0.12603839933872223,
                                0.8900000013411045,
                            )
                        ),
                        Vector(
                            (
                                -1.1663345035910606,
                                0.12603839933872223,
                                1.0099999986588954,
                            )
                        ),
                    )
                    require(
                        hardware.triangle_count == 40,
                        f"{hardware.name}: 両面低ポリ丸ノブの40 trianglesではありません",
                    )
                    hardware_counts["toilet_knob"] += 1
                if glb_coordinates:
                    expected_hardware_bounds = convert_bounds(
                        expected_hardware_bounds
                    )
                require(
                    bounds_close(
                        hardware.local_bounds,
                        expected_hardware_bounds,
                    ),
                    f"{hardware.name}: 扉金物AABBが不正です: "
                    f"actual={hardware.local_bounds}, "
                    f"expected={expected_hardware_bounds}",
                )

            require_node_contract(
                open_pose,
                kind="EMPTY",
                parent_name=root_name,
                properties={
                    "hs_id": panel_spec.open_pose_id,
                    "hs_role": "door_open_pose",
                    "hs_door_id": spec.door_id,
                    "hs_panel_id": panel_spec.panel_id,
                },
            )
            require_transform(
                open_pose,
                convert_location(
                    panel_spec.open_location,
                    glb_coordinates=glb_coordinates,
                ),
                z_rotation_quaternion(
                    panel_spec.open_rotation_z,
                    glb_coordinates=glb_coordinates,
                ),
            )
            require(
                not open_pose.child_names,
                f"{open_pose.name}: OpenPoseに子Objectがあります",
            )

            closed_bounds = transformed_bounds(
                collider.local_bounds,
                panel.local_matrix,
            )
            closed_panel_bounds.append(closed_bounds)
            open_bounds = transformed_bounds(
                collider.local_bounds,
                open_pose.local_matrix,
            )
            require(
                bounds_contains(sweep.local_bounds, closed_bounds),
                f"{sweep.name}: panel閉姿勢を包含しません: {panel.name}",
            )
            require(
                bounds_contains(sweep.local_bounds, open_bounds),
                f"{sweep.name}: panel開姿勢を包含しません: {panel.name}",
            )
            sweep_containment_checks += 2

            if spec.wall_axis is not None:
                require(
                    spec.wall_normal_bounds is not None
                    and spec.corridor_normal_direction in {-1, 1},
                    f"{panel.name}: 廊下側を判定する壁契約がありません",
                )
                require(
                    spec.minimum_wall_clearance is not None,
                    f"{panel.name}: 壁離隔の固定契約がありません",
                )
                closed_world_bounds = transformed_bounds(
                    collider.local_bounds,
                    root.world_matrix @ panel.local_matrix,
                )
                open_world_bounds = transformed_bounds(
                    collider.local_bounds,
                    root.world_matrix @ open_pose.local_matrix,
                )
                if spec.wall_axis == "west":
                    normal_axis = 0
                else:
                    normal_axis = 2 if glb_coordinates else 1
                wall_minimum, wall_maximum = spec.wall_normal_bounds
                corridor_direction = spec.corridor_normal_direction
                if glb_coordinates and spec.wall_axis == "north":
                    wall_minimum, wall_maximum = -wall_maximum, -wall_minimum
                    corridor_direction *= -1
                wall_center = (wall_minimum + wall_maximum) / 2.0
                for pose_name, pose_bounds in (
                    ("閉姿勢", closed_world_bounds),
                    ("開姿勢", open_world_bounds),
                ):
                    panel_center = (
                        pose_bounds[0][normal_axis] + pose_bounds[1][normal_axis]
                    ) / 2.0
                    require(
                        (panel_center - wall_center) * corridor_direction > 0.0,
                        f"{panel.name}: {pose_name}が廊下側にありません: "
                        f"panel={panel_center}, wall={wall_center}",
                    )
                    corridor_side_checks += 1
                    panel_minimum = pose_bounds[0][normal_axis]
                    panel_maximum = pose_bounds[1][normal_axis]
                    wall_clearance = (
                        panel_minimum - wall_maximum
                        if corridor_direction > 0
                        else wall_minimum - panel_maximum
                    )
                    require(
                        wall_clearance
                        >= spec.minimum_wall_clearance - TOLERANCE,
                        f"{panel.name}: {pose_name}が隣接壁から"
                        f"{spec.minimum_wall_clearance:.2f}m離れていません: "
                        f"actual={wall_clearance}",
                    )
                    room_wall_clearance_checks += 1
                    if spec.door_class == "room":
                        require(
                            hardware is not None
                            and hardware.local_bounds is not None,
                            f"{panel.name}: 部屋扉の取っ手AABBがありません",
                        )
                        pose_transform = (
                            root.world_matrix @ panel.local_matrix
                            if pose_name == "閉姿勢"
                            else root.world_matrix @ open_pose.local_matrix
                        )
                        hardware_bounds = transformed_bounds(
                            hardware.local_bounds,
                            pose_transform,
                        )
                        hardware_minimum = hardware_bounds[0][normal_axis]
                        hardware_maximum = hardware_bounds[1][normal_axis]
                        hardware_wall_clearance = (
                            hardware_minimum - wall_maximum
                            if corridor_direction > 0
                            else wall_minimum - hardware_maximum
                        )
                        require(
                            hardware_wall_clearance
                            >= spec.minimum_wall_clearance - TOLERANCE,
                            f"{hardware.name}: {pose_name}が隣接壁から"
                            f"{spec.minimum_wall_clearance:.2f}m離れていません: "
                            f"actual={hardware_wall_clearance}",
                        )
                        room_hardware_wall_clearance_checks += 1

            if spec.door_class in {"elevator_car", "elevator_landing"}:
                horizontal_x = 0
                require(
                    open_bounds[0][horizontal_x] >= -1.20 - TOLERANCE
                    and open_bounds[1][horizontal_x] <= 1.20 + TOLERANCE,
                    f"{panel.name}: 開姿勢がエレベーター戸袋幅から突出します",
                )
                require(
                    open_bounds[1][horizontal_x] <= -0.80 + TOLERANCE
                    or open_bounds[0][horizontal_x] >= 0.80 - TOLERANCE,
                    f"{panel.name}: 開姿勢が中央開口に残っています",
                )
                elevator_pocket_checks += 1

            motion_kinds[spec.motion_kind] += 1

        if spec.door_class == "room":
            panel_dimensions = sorted(
                collider.local_bounds[1][axis]
                - collider.local_bounds[0][axis]
                for axis in range(3)
            )
            require(
                all(
                    abs(actual - expected) <= TOLERANCE
                    for actual, expected in zip(
                        panel_dimensions,
                        (0.08, 1.20, 2.30),
                        strict=True,
                    )
                ),
                f"{root.name}: 1.20m開口を閉じるpanel寸法ではありません",
            )
        if spec.door_class == "toilet_stall":
            panel_dimensions = sorted(
                collider.local_bounds[1][axis]
                - collider.local_bounds[0][axis]
                for axis in range(3)
            )
            require(
                all(
                    abs(actual - expected) <= TOLERANCE
                    for actual, expected in zip(
                        panel_dimensions,
                        (0.04, 1.40, 1.80),
                        strict=True,
                    )
                ),
                f"{root.name}: 1.40m個室開口を閉じるpanel寸法ではありません",
            )
        if spec.door_class in {"elevator_car", "elevator_landing"}:
            closed_minimum_x = min(bounds[0][0] for bounds in closed_panel_bounds)
            closed_maximum_x = max(bounds[1][0] for bounds in closed_panel_bounds)
            require(
                abs(closed_minimum_x + 0.80) <= TOLERANCE
                and abs(closed_maximum_x - 0.80) <= TOLERANCE,
                f"{root.name}: 1.60m中央開口を閉じていません",
            )
        door_classes[spec.door_class] += 1

    require(
        door_classes
        == Counter(
            {
                "room": 40,
                "toilet_stall": 24,
                "elevator_landing": 2,
                "elevator_car": 1,
            }
        ),
        f"{graph.source}: Door class内訳が不正です: {door_classes}",
    )
    require(
        motion_kinds == Counter({"slide": 52, "swing": 24}),
        f"{graph.source}: Door motion内訳が不正です: {motion_kinds}",
    )
    require(
        hardware_counts
        == Counter({"room_handle": 40, "toilet_knob": 24}),
        f"{graph.source}: 扉金物内訳が不正です: {hardware_counts}",
    )
    require(
        corridor_side_checks == 80,
        f"{graph.source}: 部屋・屋上更衣室扉の閉開廊下側監査が80件ではありません: "
        f"{corridor_side_checks}",
    )
    require(
        room_wall_clearance_checks == 80,
        f"{graph.source}: 部屋・屋上更衣室の閉開壁離隔監査が80件ではありません: "
        f"{room_wall_clearance_checks}",
    )
    require(
        room_hardware_wall_clearance_checks == 80,
        f"{graph.source}: 部屋・屋上更衣室の閉開取っ手壁離隔監査が"
        f"80件ではありません: {room_hardware_wall_clearance_checks}",
    )
    actual_hardware_names = {
        name
        for name in graph.nodes
        if name.startswith(
            (
                "VIS_DoorPanel_Handle_",
                "VIS_DoorPanel_Knob_",
            )
        )
    }
    require(
        actual_hardware_names == expected_hardware_names,
        f"{graph.source}: 固定扉・エレベーターを含む規定外扉金物があります: "
        f"missing={sorted(expected_hardware_names - actual_hardware_names)}, "
        f"extra={sorted(actual_hardware_names - expected_hardware_names)}",
    )

    legacy_found = sorted(LEGACY_OBJECT_NAMES & set(graph.nodes))
    require(
        not legacy_found,
        f"{graph.source}: 旧扉またはshaft safetyが残っています: {legacy_found}",
    )
    return {
        "doors": len(door_nodes),
        "panels": len(panel_nodes),
        "open_poses": len(open_pose_nodes),
        "sweeps": len(sweep_nodes),
        "sweep_containment_checks": sweep_containment_checks,
        "elevator_pocket_checks": elevator_pocket_checks,
        "room_wall_clearance_checks": room_wall_clearance_checks,
        "room_hardware_wall_clearance_checks": (
            room_hardware_wall_clearance_checks
        ),
        "corridor_side_checks": corridor_side_checks,
        "hardware": dict(sorted(hardware_counts.items())),
        "classes": dict(sorted(door_classes.items())),
        "motions": dict(sorted(motion_kinds.items())),
    }


def expected_sign_world_bounds(
    position: tuple[float, float, float],
    rotation_z: float,
    *,
    glb_coordinates: bool,
) -> tuple[Vector, Vector]:
    half_size = Vector(tuple(value / 2.0 for value in SIGN_SIZE))
    bounds = transformed_bounds(
        (-half_size, half_size),
        Matrix.Translation(Vector(position))
        @ Matrix.Rotation(rotation_z, 4, "Z"),
    )
    return convert_bounds(bounds) if glb_coordinates else bounds


def manifest_sign_component_bounds(
    graph: AssetGraph,
    *,
    glb_coordinates: bool,
) -> tuple[tuple[str, tuple[Vector, Vector]], ...]:
    require(
        len(SIGN_PLACEMENTS) == 30,
        f"表札manifestが30配置ではありません: {len(SIGN_PLACEMENTS)}",
    )
    matched_components: set[tuple[str, int]] = set()
    result: list[tuple[str, tuple[Vector, Vector]]] = []
    for placement in SIGN_PLACEMENTS:
        object_name = f"VIS_B03_Interior_{placement.owner_room}_SignsPaper"
        node = graph.require_node(object_name)
        require(
            node.kind == "MESH" and bool(node.local_component_bounds),
            f"{graph.source}: 表札owner Meshの実形状componentがありません: "
            f"{object_name}",
        )
        expected_bounds = expected_sign_world_bounds(
            placement.position,
            placement.rotation_z,
            glb_coordinates=glb_coordinates,
        )
        component_matches = [
            (component_index, world_bounds)
            for component_index, local_bounds in enumerate(
                node.local_component_bounds
            )
            if bounds_close(
                world_bounds := transformed_bounds(
                    local_bounds,
                    node.world_matrix,
                ),
                expected_bounds,
            )
        ]
        require(
            len(component_matches) == 1,
            f"{graph.source}: manifest表札に一致する実形状componentが"
            f"1件ではありません: {placement.placement_id}/"
            f"{len(component_matches)}",
        )
        component_index, actual_bounds = component_matches[0]
        component_key = (object_name, component_index)
        require(
            component_key not in matched_components,
            f"{graph.source}: 同じ表札componentを複数placementが参照しています: "
            f"{component_key}",
        )
        matched_components.add(component_key)
        result.append((placement.placement_id, actual_bounds))
    require(
        len(result) == 30 and len(matched_components) == 30,
        f"{graph.source}: manifest表札component対応が30件ではありません",
    )
    return tuple(result)


def audit_door_sign_clearance(
    graph: AssetGraph,
    *,
    glb_coordinates: bool,
) -> dict[str, int]:
    sign_components = manifest_sign_component_bounds(
        graph,
        glb_coordinates=glb_coordinates,
    )
    room_door_specs = tuple(
        spec for spec in expected_door_specs() if spec.door_class == "room"
    )
    require(
        len(room_door_specs) == 40,
        f"{graph.source}: 表札干渉監査対象の部屋・屋上扉が40件ではありません",
    )
    intersections: list[str] = []
    coplanar_face_overlaps: list[str] = []
    pose_checks = 0
    component_pair_checks = 0
    for spec in room_door_specs:
        panel_spec = expected_panel_specs(spec)[0]
        root = graph.require_node(f"MRK_Door_{spec.token}")
        panel = graph.require_node(f"MRK_DoorPanel_{panel_spec.token}")
        open_pose = graph.require_node(
            f"MRK_DoorOpenPose_{panel_spec.token}"
        )
        collider = graph.require_node(f"COL_DoorPanel_{panel_spec.token}")
        require(
            len(collider.local_component_bounds) == 1,
            f"{graph.source}: 部屋扉Colliderの実形状componentが1件ではありません: "
            f"{collider.name}/{len(collider.local_component_bounds)}",
        )
        collider_component = collider.local_component_bounds[0]
        for pose_name, pose_matrix in (
            ("closed", panel.local_matrix),
            ("open", open_pose.local_matrix),
        ):
            door_bounds = transformed_bounds(
                collider_component,
                root.world_matrix @ pose_matrix @ collider.local_matrix,
            )
            pose_checks += 1
            for placement_id, sign_bounds in sign_components:
                component_pair_checks += 1
                label = f"{spec.token}/{pose_name}/{placement_id}"
                if positive_aabb_overlap(door_bounds, sign_bounds):
                    intersections.append(label)
                if coplanar_aabb_face_overlap(door_bounds, sign_bounds):
                    coplanar_face_overlaps.append(label)
    require(
        pose_checks == 80,
        f"{graph.source}: 部屋・屋上40扉の閉開姿勢監査が80件ではありません: "
        f"{pose_checks}",
    )
    require(
        component_pair_checks == 2_400,
        f"{graph.source}: 80扉姿勢×30表札のcomponent比較が2400件ではありません: "
        f"{component_pair_checks}",
    )
    require(
        not intersections,
        f"{graph.source}: 部屋扉と表札の正の体積交差があります: "
        f"{intersections}",
    )
    require(
        not coplanar_face_overlaps,
        f"{graph.source}: 部屋扉と表札に正面積の共面重複があります: "
        f"{coplanar_face_overlaps}",
    )
    return {
        "doors": len(room_door_specs),
        "poses": pose_checks,
        "sign_components": len(sign_components),
        "component_pair_checks": component_pair_checks,
        "intersections": len(intersections),
        "coplanar_face_overlaps": len(coplanar_face_overlaps),
    }


def audit_elevator(
    graph: AssetGraph,
    *,
    glb_coordinates: bool,
) -> dict[str, int]:
    expected_role_counts = {
        "elevator": 1,
        "elevator_car": 1,
        "elevator_car_occupancy": 1,
        "elevator_passenger_origin": 1,
        "elevator_stop": 2,
        "elevator_call_mat": 2,
        "elevator_call_indicator": 2,
        "elevator_threshold": 2,
        "elevator_human_gate": 2,
        "elevator_wait": 2,
    }
    for role, expected_count in expected_role_counts.items():
        actual_count = len(graph.role_nodes(role))
        require(
            actual_count == expected_count,
            f"{graph.source}: {role}件数が不正です: "
            f"actual={actual_count}, expected={expected_count}",
        )

    controller = graph.require_node("MRK_Elevator_School")
    require_node_contract(
        controller,
        kind="EMPTY",
        parent_name=None,
        properties={
            "hs_id": "school-elevator",
            "hs_role": "elevator",
            "hs_link_id": "school-elevator-f01-f04",
            "hs_car_id": "school-elevator-car",
            "hs_car_door_id": "school-elevator-car-door",
            "hs_occupancy_id": "school-elevator-car-occupancy",
            "hs_passenger_origin_id": "school-elevator-passenger-origin",
            "hs_initial_stop_id": "school-elevator-stop-f04",
        },
    )
    require_transform(
        controller,
        (0.0, 0.0, 0.0),
        identity_quaternion(),
    )
    require(
        set(controller.child_names)
        == {
            "MRK_ElevatorCar_School",
            "MRK_ElevatorStop_F01",
            "MRK_ElevatorStop_F04",
        },
        f"{graph.source}: Elevator controller直下構成が不正です",
    )

    car = graph.require_node("MRK_ElevatorCar_School")
    require_node_contract(
        car,
        kind="EMPTY",
        parent_name=controller.name,
        properties={
            "hs_id": "school-elevator-car",
            "hs_role": "elevator_car",
            "hs_elevator_id": "school-elevator",
        },
    )
    require_transform(
        car,
        convert_location(
            (-10.30, -5.175, 10.8),
            glb_coordinates=glb_coordinates,
        ),
        z_rotation_quaternion(
            math.pi / 2.0,
            glb_coordinates=glb_coordinates,
        ),
    )
    expected_car_children = {
        "VIS_ElevatorCar_School",
        "COL_ElevatorCar_School",
        "MRK_Door_ElevatorCar_School",
        "VOL_ElevatorCarOccupancy_School",
        "MRK_ElevatorPassengerOrigin_School",
        "VOL_LocationArea_AREA_ELEVATOR_P01",
    }
    require(
        set(car.child_names) == expected_car_children,
        f"{graph.source}: Elevator car直下構成が不正です",
    )

    for name in ("VIS_ElevatorCar_School", "COL_ElevatorCar_School"):
        child = graph.require_node(name)
        require_node_contract(
            child,
            kind="MESH",
            parent_name=car.name,
            properties={},
        )
        expected_car_bounds = bounds_from_points(
            [
                Vector(
                    convert_location(
                        (x, y, z),
                        glb_coordinates=glb_coordinates,
                    )
                )
                for x in (-1.32, 1.32)
                for y in (-1.08, 1.19)
                for z in (0.00, 2.42)
            ]
        )
        require(
            bounds_close(child.local_bounds, expected_car_bounds),
            f"{child.name}: 中心Yを基準に左右対称なかごAABBではありません",
        )
        require(
            abs(child.local_bounds[0][0] + child.local_bounds[1][0])
            <= TOLERANCE,
            f"{child.name}: かご外幅2.64mがlocal X=0を中心に対称ではありません",
        )

    occupancy = graph.require_node("VOL_ElevatorCarOccupancy_School")
    require_node_contract(
        occupancy,
        kind="MESH",
        parent_name=car.name,
        properties={
            "hs_id": "school-elevator-car-occupancy",
            "hs_role": "elevator_car_occupancy",
            "hs_elevator_id": "school-elevator",
        },
    )
    passenger_origin = graph.require_node(
        "MRK_ElevatorPassengerOrigin_School"
    )
    require_node_contract(
        passenger_origin,
        kind="EMPTY",
        parent_name=car.name,
        properties={
            "hs_id": "school-elevator-passenger-origin",
            "hs_role": "elevator_passenger_origin",
            "hs_elevator_id": "school-elevator",
        },
    )
    require_transform(
        passenger_origin,
        convert_location(
            (0.0, 0.0, 0.12),
            glb_coordinates=glb_coordinates,
        ),
        identity_quaternion(),
    )
    for volume in (occupancy,):
        require(
            volume.local_bounds is not None
            and all(
                volume.local_bounds[1][axis] - volume.local_bounds[0][axis]
                > TOLERANCE
                for axis in range(3)
            ),
            f"{volume.name}: 閉じた非退化VolumeのAABBではありません",
        )
    expected_occupancy_bounds = bounds_from_points(
        [
            Vector(
                convert_location(
                    (x, y, z),
                    glb_coordinates=glb_coordinates,
                )
            )
            for x in (-1.04, 1.04)
            for y in (-0.78, 0.96)
            for z in (0.12, 2.18)
        ]
    )
    require(
        bounds_close(occupancy.local_bounds, expected_occupancy_bounds),
        f"{occupancy.name}: 左右対称なかご占有Volumeではありません",
    )
    require(
        abs(occupancy.local_bounds[0][0] + occupancy.local_bounds[1][0])
        <= TOLERANCE,
        f"{occupancy.name}: 占有幅2.08mがlocal X=0を中心に対称ではありません",
    )

    require(
        "VIS_B03_ElevatorWaitingMat_F01_F04" not in graph.nodes,
        f"{graph.source}: 旧共用エレベーター待機マットが残っています",
    )

    for floor, endpoint, base_z in ((1, "A", 0.0), (4, "B", 10.8)):
        suffix = f"F{floor:02d}"
        stop_id = f"school-elevator-stop-f{floor:02d}"
        landing_door_id = f"school-elevator-landing-door-f{floor:02d}"
        call_mat_id = f"school-elevator-call-mat-f{floor:02d}"
        call_indicator_id = (
            f"school-elevator-call-indicator-f{floor:02d}"
        )
        threshold_id = f"school-elevator-threshold-f{floor:02d}"
        gate_id = f"school-elevator-human-gate-f{floor:02d}"
        wait_id = f"school-elevator-wait-f{floor:02d}"

        stop = graph.require_node(f"MRK_ElevatorStop_{suffix}")
        require_node_contract(
            stop,
            kind="EMPTY",
            parent_name=controller.name,
            properties={
                "hs_id": stop_id,
                "hs_role": "elevator_stop",
                "hs_elevator_id": "school-elevator",
                "hs_link_id": "school-elevator-f01-f04",
                "hs_endpoint": endpoint,
                "hs_floor_index": floor,
                "hs_landing_door_id": landing_door_id,
                "hs_call_mat_id": call_mat_id,
                "hs_call_indicator_id": call_indicator_id,
                "hs_threshold_id": threshold_id,
                "hs_gate_id": gate_id,
                "hs_wait_id": wait_id,
            },
        )
        require_transform(
            stop,
            convert_location(
                (-10.30, -5.175, base_z),
                glb_coordinates=glb_coordinates,
            ),
            z_rotation_quaternion(
                math.pi / 2.0,
                glb_coordinates=glb_coordinates,
            ),
        )
        expected_stop_children = {
            f"MRK_Door_ElevatorLanding_{suffix}",
            f"VOL_ElevatorCallMat_{suffix}",
            f"MRK_ElevatorCallIndicator_{suffix}",
            f"VOL_ElevatorThreshold_{suffix}",
            f"VIS_ElevatorThresholdPlate_{suffix}",
            f"COL_ElevatorThresholdPlate_{suffix}",
            f"MRK_ElevatorHumanGate_{suffix}",
            f"MRK_ElevatorWait_{suffix}",
        }
        require(
            set(stop.child_names) == expected_stop_children,
            f"{stop.name}: Stop直下構成が不正です",
        )

        call_indicator = graph.require_node(
            f"MRK_ElevatorCallIndicator_{suffix}"
        )
        require_node_contract(
            call_indicator,
            kind="EMPTY",
            parent_name=stop.name,
            properties={
                "hs_id": call_indicator_id,
                "hs_role": "elevator_call_indicator",
                "hs_elevator_id": "school-elevator",
                "hs_stop_id": stop_id,
                "hs_direction": "up" if floor == 1 else "down",
            },
        )
        require_transform(
            call_indicator,
            (0.0, 0.0, 0.0),
            identity_quaternion(),
        )
        indicator_base_name = (
            f"VIS_ElevatorCallIndicator_Base_{suffix}"
        )
        indicator_direction_name = (
            f"VIS_ElevatorCallIndicator_Direction_{suffix}"
        )
        require(
            set(call_indicator.child_names)
            == {indicator_base_name, indicator_direction_name},
            f"{call_indicator.name}: 表示MeshがBase/Direction各1件ではありません",
        )
        indicator_base = graph.require_node(indicator_base_name)
        indicator_direction = graph.require_node(indicator_direction_name)
        for indicator_mesh in (indicator_base, indicator_direction):
            require_node_contract(
                indicator_mesh,
                kind="MESH",
                parent_name=call_indicator.name,
                properties={},
            )
            require_transform(
                indicator_mesh,
                (0.0, 0.0, 0.0),
                identity_quaternion(),
            )
            require(
                indicator_mesh.local_bounds is not None,
                f"{indicator_mesh.name}: 表示MeshにAABBがありません",
            )
        indicator_base_min_z = 0.045 if floor == 1 else 0.005
        indicator_base_max_z = indicator_base_min_z + 0.020
        indicator_direction_min_z = indicator_base_max_z + 0.002
        indicator_direction_max_z = indicator_direction_min_z + 0.010
        expected_indicator_base_bounds = bounds_from_points(
            [
                Vector(
                    convert_location(
                        (x, y, z),
                        glb_coordinates=glb_coordinates,
                    )
                )
                for x in (-0.85, 0.85)
                for y in (-3.12, -1.62)
                for z in (indicator_base_min_z, indicator_base_max_z)
            ]
        )
        require(
            bounds_close(
                indicator_base.local_bounds,
                expected_indicator_base_bounds,
            ),
            f"{indicator_base.name}: 呼出Volumeと同じ幅1.70mの足元表示範囲ではありません",
        )
        expected_direction_points = (
            (
                (0.0, -1.82),
                (-0.45, -2.72),
                (0.45, -2.72),
            )
            if floor == 1
            else (
                (0.0, -2.92),
                (0.45, -2.02),
                (-0.45, -2.02),
            )
        )
        expected_direction_bounds = bounds_from_points(
            [
                Vector(
                    convert_location(
                        (x, y, z),
                        glb_coordinates=glb_coordinates,
                    )
                )
                for x, y in expected_direction_points
                for z in (
                    indicator_direction_min_z,
                    indicator_direction_max_z,
                )
            ]
        )
        require(
            bounds_close(
                indicator_direction.local_bounds,
                expected_direction_bounds,
            )
            and indicator_direction.triangle_count == 8,
            f"{indicator_direction.name}: 足元の明色塗りつぶし矢印ではありません",
        )

        component_specs = (
            (
                f"VOL_ElevatorCallMat_{suffix}",
                "MESH",
                {
                    "hs_id": call_mat_id,
                    "hs_role": "elevator_call_mat",
                    "hs_elevator_id": "school-elevator",
                    "hs_stop_id": stop_id,
                },
            ),
            (
                f"VOL_ElevatorThreshold_{suffix}",
                "MESH",
                {
                    "hs_id": threshold_id,
                    "hs_role": "elevator_threshold",
                    "hs_elevator_id": "school-elevator",
                    "hs_stop_id": stop_id,
                },
            ),
            (
                f"MRK_ElevatorHumanGate_{suffix}",
                "EMPTY",
                {
                    "hs_id": gate_id,
                    "hs_role": "elevator_human_gate",
                    "hs_elevator_id": "school-elevator",
                    "hs_stop_id": stop_id,
                },
            ),
            (
                f"MRK_ElevatorWait_{suffix}",
                "EMPTY",
                {
                    "hs_id": wait_id,
                    "hs_role": "elevator_wait",
                    "hs_elevator_id": "school-elevator",
                    "hs_stop_id": stop_id,
                },
            ),
        )
        for name, kind, properties in component_specs:
            component = graph.require_node(name)
            require_node_contract(
                component,
                kind=kind,
                parent_name=stop.name,
                properties=properties,
            )
            if kind == "MESH":
                require(
                    component.local_bounds is not None
                    and all(
                        component.local_bounds[1][axis]
                        - component.local_bounds[0][axis]
                        > TOLERANCE
                        for axis in range(3)
                    ),
                    f"{component.name}: 閉じた非退化VolumeのAABBではありません",
                )
        threshold_visual = graph.require_node(
            f"VIS_ElevatorThresholdPlate_{suffix}"
        )
        threshold_collider = graph.require_node(
            f"COL_ElevatorThresholdPlate_{suffix}"
        )
        for plate in (threshold_visual, threshold_collider):
            require_node_contract(
                plate,
                kind="MESH",
                parent_name=stop.name,
                properties={},
            )
            require_transform(
                plate,
                (0.0, 0.0, 0.0),
                identity_quaternion(),
            )
            require(
                plate.local_bounds is not None,
                f"{plate.name}: 乗降敷居板にAABBがありません",
            )
        require(
            bounds_close(
                threshold_visual.local_bounds,
                threshold_collider.local_bounds,
            ),
            f"{suffix}: 乗降敷居板のVIS/COL AABBが一致しません",
        )
        expected_plate_bounds = bounds_from_points(
            [
                Vector(
                    convert_location(
                        (x, y, z),
                        glb_coordinates=glb_coordinates,
                    )
                )
                for x in (-0.80, 0.80)
                for y in (-1.20, -0.98)
                for z in (-0.02, 0.12)
            ]
        )
        require(
            bounds_close(threshold_collider.local_bounds, expected_plate_bounds),
            f"{threshold_collider.name}: 0.16m斜面と0.06m水平部の範囲ではありません",
        )
        require(
            bounds_close(
                graph.require_node(
                    f"VOL_ElevatorThreshold_{suffix}"
                ).local_bounds,
                expected_plate_bounds,
            ),
            f"VOL_ElevatorThreshold_{suffix}: 敷居実形状全域を包含していません",
        )

        gate = graph.require_node(f"MRK_ElevatorHumanGate_{suffix}")
        gate_collider_name = f"COL_HumanOnly_ElevatorGate_{suffix}"
        require(
            set(gate.child_names) == {gate_collider_name},
            f"{gate.name}: 人物gate Colliderが1件ではありません",
        )
        gate_collider = graph.require_node(gate_collider_name)
        require_node_contract(
            gate_collider,
            kind="MESH",
            parent_name=gate.name,
            properties={},
        )
        require_transform(
            gate,
            convert_location(
                (0.0, -1.18, 0.0),
                glb_coordinates=glb_coordinates,
            ),
            identity_quaternion(),
        )
        expected_gate_bounds = bounds_from_points(
            [
                Vector(
                    convert_location(
                        (x, y, z),
                        glb_coordinates=glb_coordinates,
                    )
                )
                for x in (-0.85, 0.85)
                for y in (-0.04, 0.04)
                for z in (0.0, 2.30)
            ]
        )
        require(
            bounds_close(gate_collider.local_bounds, expected_gate_bounds),
            f"{gate_collider.name}: 人間Gate幅1.70mのAABBではありません",
        )
        require_transform(
            graph.require_node(f"MRK_ElevatorWait_{suffix}"),
            convert_location(
                (1.20, -2.30, 0.0),
                glb_coordinates=glb_coordinates,
            ),
            identity_quaternion(),
        )
        call_mat = graph.require_node(f"VOL_ElevatorCallMat_{suffix}")
        threshold = graph.require_node(f"VOL_ElevatorThreshold_{suffix}")
        wait_marker = graph.require_node(f"MRK_ElevatorWait_{suffix}")
        horizontal_axes = (0, 2) if glb_coordinates else (0, 1)
        expected_call_mat_bounds = bounds_from_points(
            [
                Vector(
                    convert_location(
                        (x, y, z),
                        glb_coordinates=glb_coordinates,
                    )
                )
                for x in (-0.85, 0.85)
                for y in (-3.12, -1.62)
                for z in (0.00, 0.05)
            ]
        )
        require(
            bounds_close(call_mat.local_bounds, expected_call_mat_bounds),
            f"{call_mat.name}: 床面の呼出Volume AABBではありません",
        )
        call_mat_world_bounds = transformed_bounds(
            call_mat.local_bounds,
            call_mat.world_matrix,
        )
        indicator_base_world_bounds = transformed_bounds(
            indicator_base.local_bounds,
            indicator_base.world_matrix,
        )
        require(
            all(
                abs(
                    call_mat_world_bounds[bound][axis]
                    - indicator_base_world_bounds[bound][axis]
                )
                <= TOLERANCE
                for bound in (0, 1)
                for axis in horizontal_axes
            ),
            f"{suffix}: 足元indicator Baseが呼出Volumeの踏込領域と一致しません",
        )
        for volume in (call_mat, threshold):
            require(
                not all(
                    volume.local_bounds[0][axis] - 0.25
                    <= wait_marker.translation[axis]
                    <= volume.local_bounds[1][axis] + 0.25
                    for axis in horizontal_axes
                ),
                f"{wait_marker.name}: {volume.name}の外側0.25mを確保していません",
            )

        link_name = f"LNK_school-elevator-f01-f04_{endpoint}"
        link = graph.require_node(link_name)
        require_node_contract(
            link,
            kind="EMPTY",
            parent_name=None,
            properties={
                "hs_id": "school-elevator-f01-f04",
                "hs_link_kind": "elevator",
                "hs_bidirectional": True,
                "hs_link_radius_m": 0.54,
                "hs_endpoint": endpoint,
            },
        )
        require_transform(
            link,
            convert_location(
                (-8.20, -5.175, base_z),
                glb_coordinates=glb_coordinates,
            ),
            identity_quaternion(),
        )

    stop_four = graph.require_node("MRK_ElevatorStop_F04")
    require(
        vector_close(car.translation, stop_four.translation)
        and quaternion_close(car.rotation, stop_four.rotation),
        f"{graph.source}: Elevator car初期Transformが4F stopと一致しません",
    )
    car_visual = graph.require_node("VIS_ElevatorCar_School")
    require(
        car_visual.local_bounds is not None,
        f"{graph.source}: Elevator car表示にAABBがありません",
    )
    for panel_spec in expected_panel_specs(
        next(spec for spec in expected_door_specs()
             if spec.door_class == "elevator_car")
    ):
        collider = graph.require_node(
            f"COL_DoorPanel_{panel_spec.token}"
        )
        open_pose = graph.require_node(
            f"MRK_DoorOpenPose_{panel_spec.token}"
        )
        door = graph.require_node("MRK_Door_ElevatorCar_School")
        open_bounds_in_car = transformed_bounds(
            collider.local_bounds,
            door.local_matrix @ open_pose.local_matrix,
        )
        require(
            bounds_contains(car_visual.local_bounds, open_bounds_in_car),
            f"{collider.name}: 開姿勢がかご外形から突出します",
        )

    elevator_links = tuple(
        node
        for node in graph.nodes.values()
        if node.properties.get("hs_id") == "school-elevator-f01-f04"
        and node.properties.get("hs_link_kind") == "elevator"
    )
    require(
        len(elevator_links) == 2
        and {node.properties.get("hs_endpoint") for node in elevator_links}
        == {"A", "B"},
        f"{graph.source}: Elevator link pairがA/B各1件ではありません",
    )

    for name in EXPECTED_CLOSED_ELEVATOR_DISPLAY_NAMES:
        node = graph.require_node(name)
        require(
            node.kind == "MESH",
            f"{graph.source}: 2/3F閉鎖表示がMeshではありません: {name}",
        )
        require_properties(node, {})
    return {
        "controllers": 1,
        "cars": 1,
        "stops": 2,
        "call_mats": 2,
        "call_indicators": 2,
        "thresholds": 2,
        "wait_markers": 2,
        "occupancy_volumes": 1,
        "passenger_origins": 1,
        "human_gates": 2,
        "link_endpoints": 2,
        "closed_floor_displays": len(EXPECTED_CLOSED_ELEVATOR_DISPLAY_NAMES),
    }


def mesh_vertex_coordinates(
    obj: bpy.types.Object,
) -> list[tuple[float, float, float]]:
    require(obj.type == "MESH", f"{obj.name}: Meshではありません")
    return [
        tuple(float(value) for value in vertex.co)
        for vertex in obj.data.vertices
    ]


def mesh_faces(obj: bpy.types.Object) -> list[tuple[int, ...]]:
    require(obj.type == "MESH", f"{obj.name}: Meshではありません")
    return [tuple(polygon.vertices) for polygon in obj.data.polygons]


def coordinates_close(
    first: tuple[float, float, float],
    second: tuple[float, float, float],
) -> bool:
    return all(
        abs(actual - expected) <= TOLERANCE
        for actual, expected in zip(first, second, strict=True)
    )


def component_bounds(
    vertices: list[tuple[float, float, float]],
) -> tuple[Vector, Vector]:
    return bounds_from_points([Vector(vertex) for vertex in vertices])


def mesh_connected_components(
    obj: bpy.types.Object,
) -> list[list[tuple[float, float, float]]]:
    adjacency = [set() for _ in obj.data.vertices]
    for edge in obj.data.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)
    pending = set(range(len(obj.data.vertices)))
    components: list[list[tuple[float, float, float]]] = []
    while pending:
        component_indices: set[int] = set()
        frontier = [min(pending)]
        while frontier:
            index = frontier.pop()
            if index not in pending:
                continue
            pending.remove(index)
            component_indices.add(index)
            frontier.extend(adjacency[index] & pending)
        components.append(
            [
                tuple(float(value) for value in obj.data.vertices[index].co)
                for index in sorted(component_indices)
            ]
        )
    return components


def require_closed_manifold(obj: bpy.types.Object) -> None:
    edge_counts: Counter[tuple[int, int]] = Counter()
    for polygon in obj.data.polygons:
        indices = tuple(polygon.vertices)
        require(len(indices) >= 3, f"{obj.name}: 3頂点未満の面があります")
        for index, first in enumerate(indices):
            second = indices[(index + 1) % len(indices)]
            edge_counts[tuple(sorted((first, second)))] += 1
    boundary_edges = [
        edge
        for edge, count in edge_counts.items()
        if count != 2
    ]
    require(
        not boundary_edges,
        f"{obj.name}: 閉じたmanifold Meshではありません: "
        f"boundary_or_nonmanifold_edges={len(boundary_edges)}",
    )


def require_mesh_geometry_parity(
    first: bpy.types.Object,
    second: bpy.types.Object,
    label: str,
    *,
    include_materials: bool,
) -> None:
    require(
        mesh_vertex_coordinates(first) == mesh_vertex_coordinates(second)
        and mesh_faces(first) == mesh_faces(second),
        f"{label}: 頂点または面が一致しません",
    )
    if not include_materials:
        return
    require(
        tuple(
            material.name if material is not None else ""
            for material in first.data.materials
        )
        == tuple(
            material.name if material is not None else ""
            for material in second.data.materials
        )
        and tuple(polygon.material_index for polygon in first.data.polygons)
        == tuple(polygon.material_index for polygon in second.data.polygons),
        f"{label}: Material契約が一致しません",
    )


def mesh_component_world_bounds(
    obj: bpy.types.Object,
) -> list[tuple[Vector, Vector]]:
    return [
        bounds_from_points(
            [obj.matrix_world @ Vector(vertex) for vertex in component]
        )
        for component in mesh_connected_components(obj)
    ]


def require_component_bounds_set(
    label: str,
    actual: list[tuple[Vector, Vector]],
    expected: tuple[
        tuple[
            tuple[float, float, float],
            tuple[float, float, float],
        ],
        ...,
    ],
) -> None:
    remaining = list(actual)
    for expected_minimum, expected_maximum in expected:
        expected_bounds = (
            Vector(expected_minimum),
            Vector(expected_maximum),
        )
        match_index = next(
            (
                index
                for index, bounds in enumerate(remaining)
                if bounds_close(bounds, expected_bounds)
            ),
            None,
        )
        require(
            match_index is not None,
            f"{label}: 規定AABBがありません: {expected_bounds}",
        )
        remaining.pop(match_index)
    require(
        not remaining,
        f"{label}: 仕様外の成分AABBがあります: {remaining}",
    )


def audit_blender_geometry() -> dict[str, int]:
    changed_collider_rooms = 0
    changed_visual_rooms = 0
    collider_blocker_parity_checks = 0
    front_door_nav_blocker_checks = 0
    disordered_component_bounds_checks = 0
    unchanged_room_geometry_checks = 0
    infirmary_curtain_checks = 0
    manifold_checks = 0
    threshold_profile_checks = 0
    elevator_visible_panel_surface_checks = 0
    toilet_knob_component_checks = 0

    expected_knob_component_bounds = (
        (
            Vector(
                (-1.2736654964089394, -0.12603839933872223, 0.8900000013411045)
            ),
            Vector(
                (-1.1663345035910606, -0.02396160066127777, 1.0099999986588954)
            ),
        ),
        (
            Vector(
                (-1.2736654964089394, 0.02396160066127777, 0.8900000013411045)
            ),
            Vector(
                (-1.1663345035910606, 0.12603839933872223, 1.0099999986588954)
            ),
        ),
    )
    toilet_knobs = sorted(
        (
            obj
            for obj in bpy.data.objects
            if obj.name.startswith("VIS_DoorPanel_Knob_")
        ),
        key=lambda obj: obj.name,
    )
    require(
        len(toilet_knobs) == 24,
        f"トイレ個室扉の両面ノブObjectが24件ではありません: {len(toilet_knobs)}",
    )
    for knob in toilet_knobs:
        components = sorted(
            mesh_connected_components(knob),
            key=lambda component: component_bounds(component)[0].y,
        )
        require(
            len(components) == 2,
            f"{knob.name}: 単一Mesh内のノブ球が2成分ではありません",
        )
        for component, expected_bounds in zip(
            components,
            expected_knob_component_bounds,
            strict=True,
        ):
            require(
                bounds_close(component_bounds(component), expected_bounds),
                f"{knob.name}: 両面ノブ球の配置が不正です",
            )
        toilet_knob_component_checks += 1

    normal_curtains = {
        panel_name: bpy.data.objects[
            f"VIS_B03_Interior_F01_Infirmary_Curtain_{panel_name}"
        ]
        for panel_name in INFIRMARY_CURTAIN_PANEL_NAMES
    }
    disordered_curtains = {
        panel_name: bpy.data.objects[
            "VIS_RoomVariant_F01_Infirmary_Disordered_Curtain_"
            f"{panel_name}"
        ]
        for panel_name in INFIRMARY_CURTAIN_PANEL_NAMES
    }
    for curtain in (*normal_curtains.values(), *disordered_curtains.values()):
        require(
            tuple(
                material.name
                for material in curtain.data.materials
                if material is not None
            )
            == ("MAT_B03_InfirmaryCurtain",),
            f"{curtain.name}: カーテン専用Materialではありません",
        )
        infirmary_curtain_checks += 1

    for panel_name in ("West", "Divider"):
        require_mesh_geometry_parity(
            normal_curtains[panel_name],
            disordered_curtains[panel_name],
            f"保健室{panel_name}カーテン通常・荒れ版",
            include_materials=True,
        )
        infirmary_curtain_checks += 1
    for panel_name in ("North", "East"):
        require(
            mesh_vertex_coordinates(normal_curtains[panel_name])
            != mesh_vertex_coordinates(disordered_curtains[panel_name])
            or mesh_faces(normal_curtains[panel_name])
            != mesh_faces(disordered_curtains[panel_name]),
            f"保健室{panel_name}カーテンが荒れ版配置へ変化していません",
        )
        infirmary_curtain_checks += 1

    require_component_bounds_set(
        "保健室荒れ版カーテン表示",
        [
            *mesh_component_world_bounds(disordered_curtains["North"]),
            *mesh_component_world_bounds(disordered_curtains["West"]),
            *mesh_component_world_bounds(disordered_curtains["Divider"]),
            *mesh_component_world_bounds(disordered_curtains["East"]),
        ],
        INFIRMARY_DISORDERED_CURTAIN_COLLIDER_BOUNDS,
    )
    infirmary_curtain_checks += len(
        INFIRMARY_DISORDERED_CURTAIN_COLLIDER_BOUNDS
    )

    normal_beam_sight_collider = bpy.data.objects[
        INFIRMARY_NORMAL_CURTAIN_BEAM_SIGHT_COLLIDER_NAME
    ]
    disordered_beam_sight_collider = bpy.data.objects[
        INFIRMARY_DISORDERED_CURTAIN_BEAM_SIGHT_COLLIDER_NAME
    ]
    require(
        mesh_vertex_coordinates(normal_beam_sight_collider)
        != mesh_vertex_coordinates(disordered_beam_sight_collider)
        or mesh_faces(normal_beam_sight_collider)
        != mesh_faces(disordered_beam_sight_collider),
        "保健室荒れ版のビーム・視線遮蔽が通常版から変化していません",
    )
    require_component_bounds_set(
        "保健室荒れ版カーテンBeamSight",
        mesh_component_world_bounds(disordered_beam_sight_collider),
        INFIRMARY_DISORDERED_CURTAIN_COLLIDER_BOUNDS,
    )
    infirmary_curtain_checks += 2
    for collider, expected_components in (
        (normal_beam_sight_collider, 4),
        (disordered_beam_sight_collider, 5),
    ):
        require(
            not collider.data.materials,
            f"{collider.name}: ビーム・視線遮蔽へMaterialがあります",
        )
        require(
            len(mesh_connected_components(collider)) == expected_components,
            f"{collider.name}: ビーム・視線遮蔽成分数が不正です: "
            f"{len(mesh_connected_components(collider))}/{expected_components}",
        )
        require_closed_manifold(collider)

    threshold_profiles: dict[int, list[tuple[float, float, float]]] = {}
    for floor in (1, 4):
        suffix = f"F{floor:02d}"
        visual = bpy.data.objects[
            f"VIS_ElevatorThresholdPlate_{suffix}"
        ]
        collider = bpy.data.objects[
            f"COL_ElevatorThresholdPlate_{suffix}"
        ]
        visual_vertices = mesh_vertex_coordinates(visual)
        collider_vertices = mesh_vertex_coordinates(collider)
        threshold_profiles[floor] = visual_vertices
        visual_faces = mesh_faces(visual)
        collider_faces = mesh_faces(collider)
        require(
            visual_vertices == collider_vertices,
            f"{suffix}: 敷居のVIS/COL境界頂点が一致しません",
        )
        require(
            visual_faces
            == [
                face
                for face_index, face in enumerate(collider_faces)
                if face_index not in {3, 6}
            ],
            f"{suffix}: 廊下床・かご床が所有する敷居端面以外まで表示面から欠落しています",
        )
        require(
            len(visual_vertices) == 10
            and len(visual_faces) == 5
            and len(collider_faces) == 7,
            f"{suffix}: 敷居の10頂点・表示5面・Collider7面契約が不正です",
        )
        for side_offset in (0, 5):
            ramp_start = visual_vertices[side_offset + 4]
            ramp_end = visual_vertices[side_offset + 3]
            plateau_end = visual_vertices[side_offset + 2]
            require(
                coordinates_close(
                    ramp_start,
                    (
                        -0.80 if side_offset == 0 else 0.80,
                        -1.20,
                        0.00,
                    ),
                )
                and coordinates_close(
                    ramp_end,
                    (
                        -0.80 if side_offset == 0 else 0.80,
                        -1.04,
                        0.12,
                    ),
                )
                and coordinates_close(
                    plateau_end,
                    (
                        -0.80 if side_offset == 0 else 0.80,
                        -0.98,
                        0.12,
                    ),
                ),
                f"{suffix}: 0.16m斜面または0.06m水平部が不正です",
            )
            ramp_run = ramp_end[1] - ramp_start[1]
            ramp_rise = ramp_end[2] - ramp_start[2]
            ramp_normal_y = ramp_run / math.hypot(ramp_run, ramp_rise)
            require(
                ramp_normal_y >= 0.79,
                f"{suffix}: 敷居斜面の上向き法線Yが0.79未満です: "
                f"{ramp_normal_y}",
            )
        ramp_angle_degrees = math.degrees(math.atan2(0.12, 0.16))
        require(
            abs(ramp_angle_degrees - 36.86989764584402) <= TOLERANCE,
            f"{suffix}: 敷居斜面が36.87度ではありません",
        )
        threshold_profile_checks += 1
    require(
        threshold_profiles[1] == threshold_profiles[4],
        "1Fと4Fのエレベーター敷居形状が同型ではありません",
    )

    elevator_visible_panels = tuple(
        sorted(
            (
                obj
                for obj in bpy.data.objects
                if obj.type == "MESH"
                and obj.name.startswith(
                    (
                        "VIS_DoorPanel_ElevatorCar_School_",
                        "VIS_DoorPanel_ElevatorLanding_F01_",
                        "VIS_DoorPanel_ElevatorLanding_F04_",
                    )
                )
            ),
            key=lambda obj: obj.name,
        )
    )
    require(
        len(elevator_visible_panels) == 12,
        f"エレベーター表示扉が12枚ではありません: {len(elevator_visible_panels)}",
    )
    for panel in elevator_visible_panels:
        require(
            len(panel.data.polygons) == 2
            and all(abs(polygon.normal.y) >= 1.0 - TOLERANCE for polygon in panel.data.polygons),
            f"{panel.name}: 床・枠と重なる底面・上面・側面が残っています",
        )
        elevator_visible_panel_surface_checks += 1

    car_floor_vertices = mesh_vertex_coordinates(
        bpy.data.objects["COL_ElevatorCar_School"]
    )[:8]
    require(
        all(vertex[1] >= -0.98 - TOLERANCE for vertex in car_floor_vertices),
        "かご床の前面が敷居水平部へ重なっています",
    )

    for room in ROOM_SPECS:
        room_token = token(room.author_name)
        normal_collider = bpy.data.objects[
            f"COL_B03_Interior_{room.author_name}"
        ]
        disordered_collider = bpy.data.objects[
            f"COL_RoomVariant_{room_token}_Disordered"
        ]
        normal_blocker = bpy.data.objects[
            f"NAV_RoomVariant_{room_token}_Normal_Blocker"
        ]
        disordered_blocker = bpy.data.objects[
            f"NAV_RoomVariant_{room_token}_Disordered_Blocker"
        ]
        normal_furniture = bpy.data.objects[
            f"VIS_B03_Interior_{room.author_name}_FurnitureProps"
        ]
        disordered_furniture = bpy.data.objects[
            f"VIS_RoomVariant_{room_token}_Disordered_FurnitureProps"
        ]

        require_mesh_geometry_parity(
            normal_collider,
            normal_blocker,
            f"{room.room_id}/normal COL=Blocker",
            include_materials=False,
        )
        collider_blocker_parity_checks += 1
        if room.room_id in FRONT_BLOCKED_CLASSROOM_ROOM_IDS:
            minimum_x, maximum_x, _minimum_y, _maximum_y = room.bounds_xy
            front_door_minimum_y, front_door_maximum_y = room.openings[1]
            require_component_bounds_set(
                f"{room.room_id}/disordered 前扉Nav Blocker",
                mesh_component_world_bounds(disordered_blocker),
                (
                    (
                        Vector(
                            (
                                maximum_x - 0.95,
                                front_door_minimum_y - 0.20,
                                room.base_z,
                            )
                        ),
                        Vector(
                            (
                                maximum_x - 0.15,
                                front_door_maximum_y + 0.20,
                                room.base_z + 2.40,
                            )
                        ),
                    ),
                ),
            )
            front_door_nav_blocker_checks += 1
        else:
            require_mesh_geometry_parity(
                disordered_collider,
                disordered_blocker,
                f"{room.room_id}/disordered COL=Blocker",
                include_materials=False,
            )
            collider_blocker_parity_checks += 1

        for obj in (
            normal_collider,
            normal_blocker,
            disordered_collider,
            disordered_blocker,
        ):
            require_closed_manifold(obj)
            manifold_checks += 1

        minimum_x, maximum_x, minimum_y, maximum_y = room.bounds_xy
        room_bounds = (
            Vector(
                (
                    minimum_x - ROOM_VARIANT_WALL_ATTACHMENT_ALLOWANCE,
                    minimum_y - ROOM_VARIANT_WALL_ATTACHMENT_ALLOWANCE,
                    room.base_z,
                )
            ),
            Vector(
                (
                    maximum_x + ROOM_VARIANT_WALL_ATTACHMENT_ALLOWANCE,
                    maximum_y + ROOM_VARIANT_WALL_ATTACHMENT_ALLOWANCE,
                    room.base_z + 3.20,
                )
            ),
        )
        disordered_marker = bpy.data.objects[
            f"MRK_RoomVariant_{room_token}_Disordered"
        ]
        for child in disordered_marker.children:
            require(
                child.type == "MESH",
                f"{child.name}: 荒れ版marker直下がMeshではありません",
            )
            for child_component_bounds in mesh_component_world_bounds(child):
                require(
                    bounds_contains(room_bounds, child_component_bounds),
                    f"{child.name}: 荒れ版配置成分が室内boundsから出ています: "
                    f"actual={child_component_bounds}, room={room_bounds}",
                )
                disordered_component_bounds_checks += 1

        if room.room_id in UNCHANGED_DISORDERED_ROOM_IDS:
            require_mesh_geometry_parity(
                normal_furniture,
                disordered_furniture,
                f"{room.room_id}/A FurnitureProps",
                include_materials=True,
            )
            require_mesh_geometry_parity(
                normal_collider,
                disordered_collider,
                f"{room.room_id}/A Collider",
                include_materials=False,
            )
            require_mesh_geometry_parity(
                normal_blocker,
                disordered_blocker,
                f"{room.room_id}/A Nav Blocker",
                include_materials=False,
            )
            if room.has_signs_paper:
                require_mesh_geometry_parity(
                    bpy.data.objects[
                        f"VIS_B03_Interior_{room.author_name}_SignsPaper"
                    ],
                    bpy.data.objects[
                        f"VIS_RoomVariant_{room_token}_Disordered_SignsPaper"
                    ],
                    f"{room.room_id}/A SignsPaper",
                    include_materials=True,
                )
            unchanged_room_geometry_checks += 1
        else:
            require(
                mesh_vertex_coordinates(normal_furniture)
                != mesh_vertex_coordinates(disordered_furniture)
                or mesh_faces(normal_furniture)
                != mesh_faces(disordered_furniture),
                f"{room.room_id}: 荒れ版FurniturePropsが通常版から変化していません",
            )
            require(
                mesh_vertex_coordinates(normal_collider)
                != mesh_vertex_coordinates(disordered_collider)
                or mesh_faces(normal_collider)
                != mesh_faces(disordered_collider),
                f"{room.room_id}: 荒れ版Colliderが通常版から変化していません",
            )
            changed_visual_rooms += 1
            changed_collider_rooms += 1

    require(
        unchanged_room_geometry_checks == 3,
        "通常版と同一のA配置が3室ではありません: "
        f"{unchanged_room_geometry_checks}",
    )
    require(
        changed_visual_rooms == 17 and changed_collider_rooms == 17,
        "個別配置replayで変化した荒れ版が17室ではありません: "
        f"VIS={changed_visual_rooms}, COL={changed_collider_rooms}",
    )

    closed_roles = {
        "door_sweep",
        "elevator_call_mat",
        "elevator_threshold",
        "elevator_car_occupancy",
        "room_variant_tile",
        "player_spawn_exclusion",
        "npc_spawn",
        "npc_spawn_bias",
        "bit_spawn",
    }
    for obj in bpy.data.objects:
        if (
            obj.type == "MESH"
            and (
                obj.get("hs_role") in closed_roles
                or obj.name.startswith("COL_DoorPanel_")
                or obj.name.startswith("COL_ElevatorThresholdPlate_")
                or obj.name.startswith("COL_BeamSightOnly_")
            )
        ):
            require_closed_manifold(obj)
            manifold_checks += 1

    return {
        "unchanged_room_geometry_checks": unchanged_room_geometry_checks,
        "changed_visual_rooms": changed_visual_rooms,
        "changed_collider_rooms": changed_collider_rooms,
        "collider_blocker_parity_checks": collider_blocker_parity_checks,
        "front_door_nav_blocker_checks": front_door_nav_blocker_checks,
        "disordered_component_bounds_checks": (
            disordered_component_bounds_checks
        ),
        "infirmary_curtain_checks": infirmary_curtain_checks,
        "manifold_checks": manifold_checks,
        "threshold_profile_checks": threshold_profile_checks,
        "elevator_visible_panel_surface_checks": elevator_visible_panel_surface_checks,
        "toilet_knob_component_checks": toilet_knob_component_checks,
    }


def audit_meta(graph: AssetGraph) -> dict[str, Any]:
    metadata = graph.require_node("META_Stage")
    require_node_contract(
        metadata,
        kind="EMPTY",
        parent_name=None,
        properties={
            "hs_schema_version": 3,
            "hs_stage_id": "school",
            "hs_nav_profile": EXPECTED_HUMAN_NAV_PROFILE,
            "hs_bit_nav_profile": "bit-flight-body-0.44-margin-0.10-v1",
        },
    )
    return {
        "human_nav_profile": metadata.properties["hs_nav_profile"],
        "schema_version": metadata.properties["hs_schema_version"],
    }


def audit_spawn_semantics(graph: AssetGraph) -> dict[str, int]:
    expected_names = set().union(*EXPECTED_SPAWN_NAMES_BY_ROLE.values())
    require(
        len(expected_names) == 49,
        f"{graph.source}: 監査側のspawn意味Object定義が49件ではありません",
    )
    for role, expected_role_names in EXPECTED_SPAWN_NAMES_BY_ROLE.items():
        actual_role_names = {node.name for node in graph.role_nodes(role)}
        require(
            actual_role_names == expected_role_names,
            f"{graph.source}: {role}のObject集合が不正です: "
            f"missing={sorted(expected_role_names - actual_role_names)}, "
            f"unexpected={sorted(actual_role_names - expected_role_names)}",
        )
        expected_kind = "EMPTY" if role == "player_spawn" else "MESH"
        for object_name in sorted(expected_role_names):
            node = graph.require_node(object_name)
            require(
                node.kind == expected_kind,
                f"{graph.source}: spawn意味Objectの種別が不正です: "
                f"{object_name}/{node.kind}",
            )
            require(
                node.parent_name is None and not node.child_names,
                f"{graph.source}: spawn意味Objectに親子関係があります: "
                f"{object_name}",
            )
            require(
                (node.local_bounds is None) == (expected_kind == "EMPTY"),
                f"{graph.source}: spawn意味ObjectのAABB有無が不正です: "
                f"{object_name}",
            )

    spawn_prefixes = (
        "MRK_PlayerSpawn_",
        "VOL_PlayerSpawnExclusion_",
        "VOL_NpcSpawn_",
        "VOL_NpcSpawnBias_",
        "VOL_BitSpawn_",
    )
    actual_prefixed_names = {
        name for name in graph.nodes if name.startswith(spawn_prefixes)
    }
    require(
        actual_prefixed_names == expected_names,
        f"{graph.source}: spawn接頭辞のObject集合が49件と一致しません: "
        f"missing={sorted(expected_names - actual_prefixed_names)}, "
        f"unexpected={sorted(actual_prefixed_names - expected_names)}",
    )
    legacy_names = LEGACY_SPAWN_OBJECT_NAMES.intersection(graph.nodes)
    require(
        not legacy_names,
        f"{graph.source}: 廃止済みCourtyard spawnが残っています: "
        f"{sorted(legacy_names)}",
    )
    for object_name, expected_properties in (
        EXPECTED_NPC_SPAWN_BIAS_PROPERTIES.items()
    ):
        require_properties(graph.require_node(object_name), expected_properties)
    return {
        "semantic_objects": len(expected_names),
        "player_spawns": len(EXPECTED_SPAWN_NAMES_BY_ROLE["player_spawn"]),
        "player_spawn_exclusions": len(
            EXPECTED_SPAWN_NAMES_BY_ROLE["player_spawn_exclusion"]
        ),
        "npc_spawn_volumes": len(EXPECTED_SPAWN_NAMES_BY_ROLE["npc_spawn"]),
        "npc_spawn_bias_volumes": len(
            EXPECTED_SPAWN_NAMES_BY_ROLE["npc_spawn_bias"]
        ),
        "bit_spawn_volumes": len(EXPECTED_SPAWN_NAMES_BY_ROLE["bit_spawn"]),
    }


def descendants(graph: AssetGraph, root_name: str) -> set[str]:
    result: set[str] = set()
    pending = [root_name]
    while pending:
        name = pending.pop()
        if name in result:
            continue
        result.add(name)
        pending.extend(graph.require_node(name).child_names)
    return result


def interactive_contract_names(graph: AssetGraph) -> set[str]:
    result = {
        "META_Stage",
        *EXPECTED_CLOSED_ELEVATOR_DISPLAY_NAMES,
    }
    for node in graph.nodes.values():
        if node.properties.get("hs_role") in DYNAMIC_ROLES:
            result.update(descendants(graph, node.name))
        if (
            node.name.startswith("LNK_school-elevator-f01-f04_")
            and node.properties.get("hs_link_kind") == "elevator"
        ):
            result.add(node.name)
    return result


def audit_active_visual_counts(graph: AssetGraph) -> dict[str, int]:
    static_visuals = 0
    variant_visuals: Counter[tuple[str, str]] = Counter()
    for node in graph.nodes.values():
        if not node.name.startswith("VIS_"):
            continue
        parent_name = node.parent_name
        variant_key: tuple[str, str] | None = None
        while parent_name is not None:
            parent = graph.require_node(parent_name)
            if parent.properties.get("hs_role") == "room_variant":
                room_id = parent.properties.get("hs_room_id")
                variant_id = parent.properties.get("hs_variant_id")
                require(
                    isinstance(room_id, str)
                    and isinstance(variant_id, str),
                    f"{graph.source}: room variantのVIS祖先IDが不正です: "
                    f"{node.name}",
                )
                variant_key = (room_id, variant_id)
                break
            parent_name = parent.parent_name
        if variant_key is None:
            static_visuals += 1
        else:
            variant_visuals[variant_key] += 1

    normal_visuals = static_visuals + sum(
        variant_visuals[(room_id, "normal")]
        for room_id in EXPECTED_ROOM_IDS
    )
    disordered_visuals = static_visuals + sum(
        variant_visuals[(room_id, "disordered")]
        for room_id in EXPECTED_ROOM_IDS
    )
    expected_variant_keys = {
        (room_id, variant_id)
        for room_id in EXPECTED_ROOM_IDS
        for variant_id in EXPECTED_VARIANT_IDS
    }
    require(
        set(variant_visuals) == expected_variant_keys,
        f"{graph.source}: 20室×2 variantのVIS所有集合が不正です",
    )
    for room_id in UNCHANGED_DISORDERED_ROOM_IDS:
        require(
            variant_visuals[(room_id, "normal")]
            == variant_visuals[(room_id, "disordered")],
            f"{graph.source}: A配置のVIS件数が通常・荒れ版で不一致です: "
            f"{room_id}",
        )
    return {
        "static": static_visuals,
        "normal": normal_visuals,
        "all_disordered": disordered_visuals,
    }


def audit_blender_glb_parity(
    blender_graph: AssetGraph,
    glb_graph: AssetGraph,
) -> dict[str, int]:
    blender_names = interactive_contract_names(blender_graph)
    glb_names = interactive_contract_names(glb_graph)
    require(
        bool(blender_names) and bool(glb_names),
        "BlenderまたはGLBにB03-3C interactive契約Objectがありません",
    )
    require(
        blender_names == glb_names,
        "Blender/GLBのB03-3C Object集合が不一致です: "
        f"blend_only={sorted(blender_names - glb_names)}, "
        f"glb_only={sorted(glb_names - blender_names)}",
    )
    for name in sorted(blender_names):
        blender_node = blender_graph.require_node(name)
        glb_node = glb_graph.require_node(name)
        require(
            blender_node.kind == glb_node.kind,
            f"{name}: Blender/GLBのObject種別が不一致です",
        )
        require(
            blender_node.parent_name == glb_node.parent_name,
            f"{name}: Blender/GLBの親が不一致です",
        )
        require(
            set(blender_node.child_names) == set(glb_node.child_names),
            f"{name}: Blender/GLBの子Object集合が不一致です",
        )
        require(
            set(blender_node.properties) == set(glb_node.properties),
            f"{name}: Blender/GLBのhs_* property集合が不一致です",
        )
        for key, value in blender_node.properties.items():
            require(
                values_equal(glb_node.properties[key], value),
                f"{name}: Blender/GLBの{key}が不一致です",
            )
        require(
            vector_close(
                glb_node.translation,
                convert_location(
                    blender_node.translation,
                    glb_coordinates=True,
                ),
            ),
            f"{name}: Blender/GLBのlocal translationが不一致です",
        )
        require(
            quaternion_close(
                glb_node.rotation,
                convert_quaternion(blender_node.rotation),
            ),
            f"{name}: Blender/GLBのlocal rotationが不一致です",
        )
        require(
            vector_close(glb_node.scale, blender_node.scale),
            f"{name}: Blender/GLBのlocal scaleが不一致です",
        )
        require(
            (blender_node.local_bounds is None)
            == (glb_node.local_bounds is None),
            f"{name}: Blender/GLBのMesh AABB有無が不一致です",
        )
        if blender_node.local_bounds is not None:
            require(
                bounds_close(
                    convert_bounds(blender_node.local_bounds),
                    glb_node.local_bounds,
                ),
                f"{name}: Blender/GLBのlocal Mesh AABBが不一致です",
            )
            blender_world_bounds = transformed_bounds(
                blender_node.local_bounds,
                blender_node.world_matrix,
            )
            glb_world_bounds = transformed_bounds(
                glb_node.local_bounds,
                glb_node.world_matrix,
            )
            require(
                bounds_close(
                    convert_bounds(blender_world_bounds),
                    glb_world_bounds,
                ),
                f"{name}: Blender/GLBのworld Mesh AABBが不一致です",
            )
            require(
                blender_node.triangle_count == glb_node.triangle_count,
                f"{name}: Blender/GLBのtriangle数が不一致です: "
                f"blend={blender_node.triangle_count}, "
                f"glb={glb_node.triangle_count}",
            )
    return {
        "contract_objects": len(blender_names),
        "property_mismatches": 0,
        "parent_mismatches": 0,
        "transform_mismatches": 0,
        "bounds_mismatches": 0,
        "triangle_mismatches": 0,
    }


def main() -> None:
    require(
        Path(bpy.data.filepath).resolve() == BLEND_PATH.resolve(),
        "監査対象.blendがB03学校正本ではありません",
    )
    require(
        bpy.context.scene.get("b03_architecture_generator_version")
        == EXPECTED_GENERATOR_VERSION,
        "Blender正本の生成版がB06-3小物・表札版ではありません",
    )
    raw_generation_result = bpy.context.scene.get("b03_3c_interactive_result")
    require(
        isinstance(raw_generation_result, str),
        "b03_3c_interactive_resultがありません",
    )
    generation_result = json.loads(raw_generation_result)
    require(
        generation_result
        == {
            "elevator": {
                "car_doors": 1,
                "cars": 1,
                "call_indicators": 2,
                "controllers": 1,
                "landing_doors": 2,
                "link_endpoints": 2,
                "stops": 2,
            },
            "room_doors": 38,
            "rooftop_changing_doors": 2,
            "room_variants": {
                "fallen_chairs_backrest_down": 86,
                "fallen_chairs_seat_up": 0,
                "fallen_chairs_side": 58,
                "markers": 40,
                "rooms": 20,
                "tile_volumes": 20,
                "unchanged_disordered_rooms": 3,
            },
            "toilet_stall_doors": 24,
        },
        "b03_3c_interactive_resultの生成件数が不正です",
    )
    require(GLB_PATH.is_file(), f"GLBがありません: {GLB_PATH}")

    blender_graph = build_blender_graph()
    glb_document, glb_binary_chunk = read_glb(GLB_PATH)
    glb_graph = build_glb_graph(glb_document, glb_binary_chunk)
    blender_geometry = audit_blender_geometry()

    blender_result = {
        "active_visuals": audit_active_visual_counts(blender_graph),
        "room_variants": audit_room_variants(
            blender_graph,
            glb_coordinates=False,
        ),
        "doors": audit_doors(
            blender_graph,
            glb_coordinates=False,
        ),
        "door_sign_clearance": audit_door_sign_clearance(
            blender_graph,
            glb_coordinates=False,
        ),
        "elevator": audit_elevator(
            blender_graph,
            glb_coordinates=False,
        ),
        "meta": audit_meta(blender_graph),
        "spawns": audit_spawn_semantics(blender_graph),
    }
    glb_result = {
        "active_visuals": audit_active_visual_counts(glb_graph),
        "room_variants": audit_room_variants(
            glb_graph,
            glb_coordinates=True,
        ),
        "doors": audit_doors(
            glb_graph,
            glb_coordinates=True,
        ),
        "door_sign_clearance": audit_door_sign_clearance(
            glb_graph,
            glb_coordinates=True,
        ),
        "elevator": audit_elevator(
            glb_graph,
            glb_coordinates=True,
        ),
        "meta": audit_meta(glb_graph),
        "spawns": audit_spawn_semantics(glb_graph),
    }
    parity = audit_blender_glb_parity(blender_graph, glb_graph)
    require(
        blender_result["door_sign_clearance"]
        == glb_result["door_sign_clearance"],
        "Blender/GLBの扉・表札component監査件数が一致しません",
    )
    parity["door_sign_pose_checks"] = blender_result[
        "door_sign_clearance"
    ]["poses"]
    parity["door_sign_component_pair_checks"] = blender_result[
        "door_sign_clearance"
    ]["component_pair_checks"]

    result = {
        "blend": {
            "bytes": BLEND_PATH.stat().st_size,
            "sha256": sha256(BLEND_PATH),
            "export_objects": len(blender_graph.nodes),
            **blender_result,
        },
        "glb": {
            "bytes": GLB_PATH.stat().st_size,
            "sha256": sha256(GLB_PATH),
            "nodes": len(glb_graph.nodes),
            "meshes": len(glb_document.get("meshes", [])),
            **glb_result,
        },
        "parity": parity,
        "blender_geometry": blender_geometry,
    }
    print(
        "B03_INTERACTIVE_ASSET_AUDIT="
        + json.dumps(result, ensure_ascii=False, sort_keys=True)
    )


if __name__ == "__main__":
    main()
