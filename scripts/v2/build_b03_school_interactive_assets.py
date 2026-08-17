from __future__ import annotations

import math
import re
from dataclasses import dataclass, replace

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

from build_b03_school_interiors import (
    INFIRMARY_CURTAIN_CENTER_Z,
    INFIRMARY_CURTAIN_FOLD_DEPTH,
    INFIRMARY_CURTAIN_HEIGHT,
    INFIRMARY_CURTAIN_BEAM_SIGHT_COLLIDER_NAME,
    MeshBatch,
    PROP_COLLIDER_LOCAL_CENTERS,
    PROP_COLLIDER_SIZES,
    RoomBuilder,
    RoomPlacement,
    add_additional_prop,
    build_school_rooms,
    import_prop_sources,
    infirmary_curtain_segment_count,
    remove_imported_sources,
    swatch_uv,
)
from b06_signage_manifest import SIGN_SIZE


ROOM_VARIANT_IDS = (
    "f02-classroom-01",
    "f02-classroom-02",
    "f02-classroom-03",
    "f03-classroom-01",
    "f03-classroom-02",
    "f03-classroom-03",
    "f04-classroom-01",
    "f04-classroom-02",
    "f04-classroom-03",
    "f01-infirmary",
    "f01-library",
    "f01-staff-room",
    "f01-pc-room",
    "f02-council",
    "f02-broadcast",
    "f02-science",
    "f03-art",
    "f03-home-ec",
    "f04-ll",
    "f04-music",
)
ROOM_VARIANT_AUTHOR_NAMES = frozenset(
    (
        "F02_Classroom01",
        "F02_Classroom02",
        "F02_Classroom03",
        "F03_Classroom01",
        "F03_Classroom02",
        "F03_Classroom03",
        "F04_Classroom01",
        "F04_Classroom02",
        "F04_Classroom03",
        "F01_Infirmary",
        "F01_Library",
        "F01_StaffRoom",
        "F01_PcRoom",
        "F02_Council",
        "F02_Broadcast",
        "F02_Science",
        "F03_Art",
        "F03_HomeEc",
        "F04_LL",
        "F04_Music",
    )
)

NAV_GRID_ORIGIN_X_BLENDER = -19.6
NAV_GRID_ORIGIN_Y_BLENDER = 52.5
NAV_TILE_SIZE_BLENDER = 1.0
NAV_GRID_WIDTH = 84
NAV_GRID_HEIGHT = 68
ROOM_DOOR_OPEN_NORMAL_OFFSETS = {
    ("west", "f01"): -0.04,
    ("west", "upper"): 0.08,
    ("north", "f01"): 0.04,
    ("north", "upper"): -0.04,
}
TOILET_STALL_OPEN_ROTATION_Z = -math.radians(85.0)
TOILET_STALL_KNOB_CENTERS = (
    (-1.22, -0.075, 0.95),
    (-1.22, 0.075, 0.95),
)
TOILET_STALL_KNOB_RADIUS = 0.06
INFIRMARY_DISORDERED_CURTAIN_BEAM_SIGHT_COLLIDER_NAME = (
    "COL_BeamSightOnly_RoomVariant_F01_Infirmary_Disordered_Curtains"
)


@dataclass(frozen=True)
class RoomVariantSpec:
    author_name: str
    room_id: str
    base_z: float
    bounds_xy: tuple[float, float, float, float]
    wall_axis: str
    openings: tuple[tuple[float, float], ...]


ROOM_VARIANT_SPECS = (
    RoomVariantSpec(
        "F02_Classroom01",
        "f02-classroom-01",
        3.6,
        (-12.45, -3.65, 2.65, 12.35),
        "west",
        ((3.1, 4.3), (10.7, 11.9)),
    ),
    RoomVariantSpec(
        "F02_Classroom02",
        "f02-classroom-02",
        3.6,
        (-12.45, -3.65, 12.65, 22.35),
        "west",
        ((13.1, 14.3), (20.7, 21.9)),
    ),
    RoomVariantSpec(
        "F02_Classroom03",
        "f02-classroom-03",
        3.6,
        (-12.45, -3.65, 22.65, 32.35),
        "west",
        ((23.1, 24.3), (30.7, 31.9)),
    ),
    RoomVariantSpec(
        "F03_Classroom01",
        "f03-classroom-01",
        7.2,
        (-12.45, -3.65, 2.65, 12.35),
        "west",
        ((3.1, 4.3), (10.7, 11.9)),
    ),
    RoomVariantSpec(
        "F03_Classroom02",
        "f03-classroom-02",
        7.2,
        (-12.45, -3.65, 12.65, 22.35),
        "west",
        ((13.1, 14.3), (20.7, 21.9)),
    ),
    RoomVariantSpec(
        "F03_Classroom03",
        "f03-classroom-03",
        7.2,
        (-12.45, -3.65, 22.65, 32.35),
        "west",
        ((23.1, 24.3), (30.7, 31.9)),
    ),
    RoomVariantSpec(
        "F04_Classroom01",
        "f04-classroom-01",
        10.8,
        (-12.45, -3.65, 2.65, 12.35),
        "west",
        ((3.1, 4.3), (10.7, 11.9)),
    ),
    RoomVariantSpec(
        "F04_Classroom02",
        "f04-classroom-02",
        10.8,
        (-12.45, -3.65, 12.65, 22.35),
        "west",
        ((13.1, 14.3), (20.7, 21.9)),
    ),
    RoomVariantSpec(
        "F04_Classroom03",
        "f04-classroom-03",
        10.8,
        (-12.45, -3.65, 22.65, 32.35),
        "west",
        ((23.1, 24.3), (30.7, 31.9)),
    ),
    RoomVariantSpec(
        "F01_Infirmary",
        "f01-infirmary",
        0.0,
        (-12.45, -3.65, 2.65, 12.35),
        "west",
        ((3.1, 4.3), (10.7, 11.9)),
    ),
    RoomVariantSpec(
        "F01_Library",
        "f01-library",
        0.0,
        (-12.45, -3.65, 12.65, 32.35),
        "west",
        ((13.1, 14.3), (30.7, 31.9)),
    ),
    RoomVariantSpec(
        "F01_StaffRoom",
        "f01-staff-room",
        0.0,
        (5.55, 23.25, 36.65, 45.35),
        "north",
        ((6.0, 7.2), (21.6, 22.8)),
    ),
    RoomVariantSpec(
        "F01_PcRoom",
        "f01-pc-room",
        0.0,
        (23.55, 41.25, 36.65, 45.35),
        "north",
        ((24.0, 25.2), (39.6, 40.8)),
    ),
    RoomVariantSpec(
        "F02_Council",
        "f02-council",
        3.6,
        (5.55, 14.25, 36.65, 45.35),
        "north",
        ((6.0, 7.2),),
    ),
    RoomVariantSpec(
        "F02_Broadcast",
        "f02-broadcast",
        3.6,
        (14.55, 23.25, 36.65, 45.35),
        "north",
        ((21.6, 22.8),),
    ),
    RoomVariantSpec(
        "F02_Science",
        "f02-science",
        3.6,
        (23.55, 41.25, 36.65, 45.35),
        "north",
        ((24.0, 25.2), (39.6, 40.8)),
    ),
    RoomVariantSpec(
        "F03_Art",
        "f03-art",
        7.2,
        (5.55, 23.25, 36.65, 45.35),
        "north",
        ((6.0, 7.2), (21.6, 22.8)),
    ),
    RoomVariantSpec(
        "F03_HomeEc",
        "f03-home-ec",
        7.2,
        (23.55, 41.25, 36.65, 45.35),
        "north",
        ((24.0, 25.2), (39.6, 40.8)),
    ),
    RoomVariantSpec(
        "F04_LL",
        "f04-ll",
        10.8,
        (5.55, 23.25, 36.65, 45.35),
        "north",
        ((6.0, 7.2), (21.6, 22.8)),
    ),
    RoomVariantSpec(
        "F04_Music",
        "f04-music",
        10.8,
        (23.55, 41.25, 36.65, 45.35),
        "north",
        ((24.0, 25.2), (39.6, 40.8)),
    ),
)

VARIANT_SOURCE_TYPES = {
    "ClassroomDesk",
    "ClassroomChair",
    "StaffDesk",
    "StaffChair",
    "Blackboard",
    "StageLectern",
    "LargeWoodTable",
    "CleaningLocker",
    "BaggageLocker",
    "GrandPiano",
    "InfirmaryBed",
    "PcMonitor",
    "BasketballGoal",
    "VaultingBox",
    "Bookshelf",
    "ClosedBook",
    "OpenBook",
    "PaperStack",
    "SinglePaper",
    "PencilCase",
    "WesternToilet",
    "Urinal",
}
PAPER_SWATCHES = {
    "ClosedBook": "book_blue",
    "OpenBook": "book_red",
    "PaperStack": "paper",
    "SinglePaper": "paper_white",
}
CLASSROOM_DESKTOP_PROP_TYPES = frozenset((*PAPER_SWATCHES, "PencilCase"))
CLASSROOM_PATTERN_BY_AUTHOR = {
    "F02_Classroom01": "A",
    "F02_Classroom02": "B",
    "F02_Classroom03": "C",
    "F03_Classroom01": "B",
    "F03_Classroom02": "C",
    "F03_Classroom03": "A",
    "F04_Classroom01": "C",
    "F04_Classroom02": "A",
    "F04_Classroom03": "B",
}
UNCHANGED_DISORDERED_ROOM_IDS = frozenset(
    room_id
    for author_name, room_id in zip(
        (
            "F02_Classroom01",
            "F02_Classroom02",
            "F02_Classroom03",
            "F03_Classroom01",
            "F03_Classroom02",
            "F03_Classroom03",
            "F04_Classroom01",
            "F04_Classroom02",
            "F04_Classroom03",
        ),
        ROOM_VARIANT_IDS[:9],
        strict=True,
    )
    if CLASSROOM_PATTERN_BY_AUTHOR[author_name] == "A"
)


@dataclass(frozen=True)
class PlacementOverride:
    offset: tuple[float, float, float] = (0.0, 0.0, 0.0)
    rotation_x: float = 0.0
    rotation_y: float = 0.0
    rotation_z_delta: float = 0.0
    target_pivot: tuple[float, float, float] | None = None
    rest_z: float | None = None


CHAIR_FALL_POSE_SEQUENCE = (
    "backrest_down",
    "side_left",
    "backrest_down",
    "backrest_down",
    "side_right",
    "backrest_down",
    "side_left",
    "backrest_down",
    "side_left",
    "backrest_down",
    "side_right",
    "backrest_down",
    "side_left",
    "backrest_down",
)


def _fallen_chair_override(
    placement: RoomPlacement,
    sequence: int,
    *,
    outward_distance: float,
    lateral_distance: float,
    rotation_z_delta: float,
    rest_z: float,
) -> PlacementOverride:
    if sequence >= len(CHAIR_FALL_POSE_SEQUENCE):
        raise RuntimeError(f"椅子転倒姿勢の定義が不足しています: sequence={sequence}")
    pose = CHAIR_FALL_POSE_SEQUENCE[sequence]
    rotation_x = 0.0
    rotation_y = 0.0
    if pose == "backrest_down":
        rotation_x = -math.pi / 2.0
    elif pose == "side_left":
        rotation_y = math.pi / 2.0
    elif pose == "side_right":
        rotation_y = -math.pi / 2.0
    else:
        raise RuntimeError(f"未定義の椅子転倒姿勢です: {pose}")

    sine = math.sin(placement.rotation_z)
    cosine = math.cos(placement.rotation_z)
    outward = (-sine, cosine)
    lateral = (cosine, sine)
    lateral_sign = -1.0 if sequence % 2 else 1.0
    return PlacementOverride(
        offset=(
            outward[0] * outward_distance
            + lateral[0] * lateral_distance * lateral_sign,
            outward[1] * outward_distance
            + lateral[1] * lateral_distance * lateral_sign,
            0.0,
        ),
        rotation_x=rotation_x,
        rotation_y=rotation_y,
        rotation_z_delta=rotation_z_delta,
        rest_z=rest_z,
    )


@dataclass(frozen=True)
class WalkableRampSpec:
    bounds_xy: tuple[float, float, float, float]
    direction: str
    base_z: float


@dataclass
class ReplayedPlacement:
    furniture: MeshBatch
    signs: MeshBatch
    collider_boxes: list[
        tuple[tuple[float, float, float], tuple[float, float, float]]
    ]
    local_pivot: tuple[float, float, float]


@dataclass(frozen=True)
class TransformedPlacementGeometry:
    key: tuple[str, int]
    changed: bool
    bounds: tuple[tuple[float, float, float], tuple[float, float, float]]
    vertices: tuple[tuple[float, float, float], ...]
    faces: tuple[tuple[int, ...], ...]


FLOOR_FURNITURE_TYPES = frozenset(
    (
        "AvRack",
        "BaggageLocker",
        "Bookshelf",
        "BroadcastConsole",
        "ClassroomChair",
        "ClassroomDesk",
        "CleaningLocker",
        "Easel",
        "GrandPiano",
        "InfirmaryBed",
        "KitchenIsland",
        "LabBench",
        "LargeWoodTable",
        "ScienceStool",
        "StaffChair",
        "StaffDesk",
        "TeacherDesk",
    )
)


def _append_box(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
) -> None:
    x0, y0, z0 = minimum
    x1, y1, z1 = maximum
    offset = len(vertices)
    vertices.extend(
        (
            (x0, y0, z0),
            (x1, y0, z0),
            (x1, y1, z0),
            (x0, y1, z0),
            (x0, y0, z1),
            (x1, y0, z1),
            (x1, y1, z1),
            (x0, y1, z1),
        )
    )
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


def _append_ramp(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    minimum_x: float,
    maximum_x: float,
    minimum_y: float,
    maximum_y: float,
    bottom_z: float,
    start_z: float,
    end_z: float,
    rise_direction: str,
) -> None:
    top_z_by_corner = {
        "x+": (start_z, end_z, end_z, start_z),
        "x-": (end_z, start_z, start_z, end_z),
        "y+": (start_z, start_z, end_z, end_z),
        "y-": (end_z, end_z, start_z, start_z),
    }
    if rise_direction not in top_z_by_corner:
        raise RuntimeError(f"未登録の倒れ家具斜路方向です: {rise_direction}")
    top_z = top_z_by_corner[rise_direction]
    offset = len(vertices)
    vertices.extend(
        (
            (minimum_x, minimum_y, bottom_z),
            (maximum_x, minimum_y, bottom_z),
            (maximum_x, maximum_y, bottom_z),
            (minimum_x, maximum_y, bottom_z),
            (minimum_x, minimum_y, top_z[0]),
            (maximum_x, minimum_y, top_z[1]),
            (maximum_x, maximum_y, top_z[2]),
            (minimum_x, maximum_y, top_z[3]),
        )
    )
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


def _append_threshold_ramp_with_plateau(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    minimum_x: float,
    maximum_x: float,
    ramp_start_y: float,
    ramp_end_y: float,
    plateau_end_y: float,
    bottom_z: float,
    hall_floor_z: float,
    car_floor_z: float,
) -> None:
    profile = (
        (ramp_start_y, bottom_z),
        (plateau_end_y, bottom_z),
        (plateau_end_y, car_floor_z),
        (ramp_end_y, car_floor_z),
        (ramp_start_y, hall_floor_z),
    )
    offset = len(vertices)
    vertices.extend(
        (x, y, z)
        for x in (minimum_x, maximum_x)
        for y, z in profile
    )
    profile_size = len(profile)
    faces.extend(
        (
            tuple(offset + index for index in reversed(range(profile_size))),
            tuple(
                offset + profile_size + index
                for index in range(profile_size)
            ),
            *(
                (
                    offset + index,
                    offset + ((index + 1) % profile_size),
                    offset + profile_size + ((index + 1) % profile_size),
                    offset + profile_size + index,
                )
                for index in range(profile_size)
            ),
        )
    )


def _append_triangular_prism(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    points_xy: tuple[
        tuple[float, float],
        tuple[float, float],
        tuple[float, float],
    ],
    bottom_z: float,
    top_z: float,
) -> None:
    offset = len(vertices)
    vertices.extend(
        (x, y, z)
        for z in (bottom_z, top_z)
        for x, y in points_xy
    )
    faces.extend(
        (
            (offset, offset + 2, offset + 1),
            (offset + 3, offset + 4, offset + 5),
            (offset, offset + 1, offset + 4, offset + 3),
            (offset + 1, offset + 2, offset + 5, offset + 4),
            (offset + 2, offset, offset + 3, offset + 5),
        )
    )


def _normal_collider_boxes(
    collider: bpy.types.Object,
) -> tuple[
    tuple[tuple[float, float, float], tuple[float, float, float]], ...
]:
    vertices = collider.data.vertices
    polygons = collider.data.polygons
    if len(vertices) % 8 != 0 or len(polygons) != len(vertices) // 8 * 6:
        raise RuntimeError(
            f"{collider.name}: 箱集合Colliderの頂点・面構成が不正です"
        )
    boxes = []
    for offset in range(0, len(vertices), 8):
        coordinates = tuple(
            tuple(vertices[index].co)
            for index in range(offset, offset + 8)
        )
        boxes.append(
            (
                tuple(min(point[axis] for point in coordinates) for axis in range(3)),
                tuple(max(point[axis] for point in coordinates) for axis in range(3)),
            )
        )
    return tuple(boxes)


def _boxes_overlap_with_clearance(
    first: tuple[
        tuple[float, float, float],
        tuple[float, float, float],
    ],
    second: tuple[
        tuple[float, float, float],
        tuple[float, float, float],
    ],
    horizontal_clearance: float,
) -> bool:
    return (
        first[0][0] - horizontal_clearance < second[1][0]
        and first[1][0] + horizontal_clearance > second[0][0]
        and first[0][1] - horizontal_clearance < second[1][1]
        and first[1][1] + horizontal_clearance > second[0][1]
        and first[0][2] < second[1][2]
        and first[1][2] > second[0][2]
    )


def _grid_centers(
    minimum: float,
    maximum: float,
    half_extent: float,
) -> tuple[float, ...]:
    first = math.ceil((minimum + 0.40 + half_extent) * 4.0) / 4.0
    last = math.floor((maximum - 0.40 - half_extent) * 4.0) / 4.0
    count = int(round((last - first) * 4.0)) + 1
    if count <= 0:
        return ()
    return tuple(first + index * 0.25 for index in range(count))


def _protected_room_boxes(
    room: RoomVariantSpec,
) -> tuple[
    tuple[tuple[float, float, float], tuple[float, float, float]], ...
]:
    minimum_x, maximum_x, minimum_y, maximum_y = room.bounds_xy
    center_x = (minimum_x + maximum_x) / 2.0
    center_y = (minimum_y + maximum_y) / 2.0
    boxes = [
        (
            (center_x - 0.75, center_y - 0.75, room.base_z - 0.05),
            (center_x + 0.75, center_y + 0.75, room.base_z + 2.40),
        )
    ]
    for opening_minimum, opening_maximum in room.openings:
        if room.wall_axis == "west":
            boxes.append(
                (
                    (
                        maximum_x - 1.80,
                        opening_minimum - 0.25,
                        room.base_z - 0.05,
                    ),
                    (
                        maximum_x + 0.10,
                        opening_maximum + 0.25,
                        room.base_z + 2.40,
                    ),
                )
            )
        else:
            boxes.append(
                (
                    (
                        opening_minimum - 0.25,
                        minimum_y - 0.10,
                        room.base_z - 0.05,
                    ),
                    (
                        opening_maximum + 0.25,
                        minimum_y + 1.80,
                        room.base_z + 2.40,
                    ),
                )
            )
    return tuple(boxes)


def _select_disordered_placement(
    room: RoomVariantSpec,
    normal_collider: bpy.types.Object,
) -> dict[str, object]:
    minimum_x, maximum_x, minimum_y, maximum_y = room.bounds_xy
    center_x = (minimum_x + maximum_x) / 2.0
    center_y = (minimum_y + maximum_y) / 2.0
    occupied = _normal_collider_boxes(normal_collider)
    protected = _protected_room_boxes(room)
    orientation_specs = (
        ("x+", 1.60, 1.20),
        ("x-", 1.60, 1.20),
        ("y+", 1.20, 1.60),
        ("y-", 1.20, 1.60),
    )
    orientation_offset = sum(ord(character) for character in room.room_id) % 4
    ordered_orientations = (
        orientation_specs[orientation_offset:]
        + orientation_specs[:orientation_offset]
    )
    ramp_candidates = []
    for direction, width, depth in ordered_orientations:
        for candidate_y in _grid_centers(
            minimum_y,
            maximum_y,
            depth / 2.0,
        ):
            for candidate_x in _grid_centers(
                minimum_x,
                maximum_x,
                width / 2.0,
            ):
                ramp_box = (
                    (
                        candidate_x - width / 2.0,
                        candidate_y - depth / 2.0,
                        room.base_z + 0.02,
                    ),
                    (
                        candidate_x + width / 2.0,
                        candidate_y + depth / 2.0,
                        room.base_z + 0.65,
                    ),
                )
                approach_minimum = list(ramp_box[0])
                approach_maximum = list(ramp_box[1])
                if direction == "x+":
                    approach_minimum[0] -= 0.60
                    approach_maximum[0] = ramp_box[0][0]
                elif direction == "x-":
                    approach_minimum[0] = ramp_box[1][0]
                    approach_maximum[0] += 0.60
                elif direction == "y+":
                    approach_minimum[1] -= 0.60
                    approach_maximum[1] = ramp_box[0][1]
                else:
                    approach_minimum[1] = ramp_box[1][1]
                    approach_maximum[1] += 0.60
                approach_box = (
                    tuple(approach_minimum),
                    tuple(approach_maximum),
                )
                if (
                    approach_box[0][0] < minimum_x
                    or approach_box[1][0] > maximum_x
                    or approach_box[0][1] < minimum_y
                    or approach_box[1][1] > maximum_y
                ):
                    continue
                if any(
                    _boxes_overlap_with_clearance(
                        ramp_box,
                        obstacle,
                        0.08,
                    )
                    or _boxes_overlap_with_clearance(
                        approach_box,
                        obstacle,
                        0.08,
                    )
                    for obstacle in protected
                ):
                    continue
                conflicting_indices = tuple(
                    index
                    for index, obstacle in enumerate(occupied)
                    if _boxes_overlap_with_clearance(
                        ramp_box,
                        obstacle,
                        0.08,
                    )
                    or _boxes_overlap_with_clearance(
                        approach_box,
                        obstacle,
                        0.08,
                    )
                )
                removable_conflicts = all(
                    occupied[index][1][2] - occupied[index][0][2]
                    <= 0.75
                    and occupied[index][1][0] - occupied[index][0][0]
                    <= 0.75
                    and occupied[index][1][1] - occupied[index][0][1]
                    <= 0.55
                    for index in conflicting_indices
                )
                if len(conflicting_indices) > 1 or not removable_conflicts:
                    continue
                distance_from_center = (
                    (candidate_x - center_x) ** 2
                    + (candidate_y - center_y) ** 2
                )
                ramp_candidates.append(
                    (
                        len(conflicting_indices),
                        -distance_from_center,
                        direction,
                        ramp_box,
                        conflicting_indices,
                    )
                )
    if not ramp_candidates:
        raise RuntimeError(
            f"{room.room_id}: 既存家具と進入帯に干渉しない倒れ家具斜路を配置できません"
        )
    (
        _,
        _,
        ramp_direction,
        ramp_box,
        removed_box_indices,
    ) = sorted(ramp_candidates)[0]
    active_occupied = tuple(
        obstacle
        for index, obstacle in enumerate(occupied)
        if index not in removed_box_indices
    )

    shelf_candidates = []
    shelf_width = 0.60
    shelf_depth = 1.00
    for candidate_y in _grid_centers(
        minimum_y,
        maximum_y,
        shelf_depth / 2.0,
    ):
        for candidate_x in _grid_centers(
            minimum_x,
            maximum_x,
            shelf_width / 2.0,
        ):
            shelf_box = (
                (
                    candidate_x - shelf_width / 2.0,
                    candidate_y - shelf_depth / 2.0,
                    room.base_z,
                ),
                (
                    candidate_x + shelf_width / 2.0,
                    candidate_y + shelf_depth / 2.0,
                    room.base_z + 1.40,
                ),
            )
            if any(
                _boxes_overlap_with_clearance(
                    shelf_box,
                    obstacle,
                    0.08,
                )
                for obstacle in (*active_occupied, *protected, ramp_box)
            ):
                continue
            wall_distance = min(
                shelf_box[0][0] - minimum_x,
                maximum_x - shelf_box[1][0],
                shelf_box[0][1] - minimum_y,
                maximum_y - shelf_box[1][1],
            )
            distance_from_center = (
                (candidate_x - center_x) ** 2
                + (candidate_y - center_y) ** 2
            )
            shelf_candidates.append(
                (
                    wall_distance,
                    -distance_from_center,
                    shelf_box,
                )
            )
    if not shelf_candidates:
        raise RuntimeError(
            f"{room.room_id}: 既存家具と進入帯に干渉しない大型家具を配置できません"
        )
    _, _, shelf_box = sorted(shelf_candidates)[0]
    return {
        "ramp_box": ramp_box,
        "ramp_direction": ramp_direction,
        "removed_box_indices": removed_box_indices,
        "shelf_box": shelf_box,
    }


def _create_mesh_object(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    target_collection: bpy.types.Collection,
    *,
    material: bpy.types.Material | None = None,
    uv_swatch: tuple[tuple[float, float], ...] | None = None,
    properties: dict[str, object] | None = None,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    if material is not None:
        mesh.materials.append(material)
    if uv_swatch is not None:
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for polygon in mesh.polygons:
            for corner_index, loop_index in enumerate(polygon.loop_indices):
                uv_layer.data[loop_index].uv = uv_swatch[
                    corner_index % len(uv_swatch)
                ]
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    obj.parent = parent
    for key, value in (properties or {}).items():
        obj[key] = value
    return obj


def _create_box_object(
    name: str,
    boxes: tuple[
        tuple[tuple[float, float, float], tuple[float, float, float]], ...
    ],
    target_collection: bpy.types.Collection,
    *,
    material: bpy.types.Material | None = None,
    uv_swatch: tuple[tuple[float, float], ...] | None = None,
    properties: dict[str, object] | None = None,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for minimum, maximum in boxes:
        _append_box(vertices, faces, minimum, maximum)
    return _create_mesh_object(
        name,
        vertices,
        faces,
        target_collection,
        material=material,
        uv_swatch=uv_swatch,
        properties=properties,
        parent=parent,
    )


def _create_low_poly_spheres_object(
    name: str,
    centers: tuple[tuple[float, float, float], ...],
    radius: float,
    target_collection: bpy.types.Collection,
    *,
    material: bpy.types.Material,
    uv_swatch: tuple[tuple[float, float], ...],
    parent: bpy.types.Object,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for center in centers:
        editable = bmesh.new()
        bmesh.ops.create_icosphere(editable, subdivisions=1, radius=radius)
        editable.verts.index_update()
        editable.verts.ensure_lookup_table()
        vertex_offset = len(vertices)
        vertices.extend(
            (
                float(vertex.co.x) + center[0],
                float(vertex.co.y) + center[1],
                float(vertex.co.z) + center[2],
            )
            for vertex in editable.verts
        )
        faces.extend(
            tuple(vertex_offset + vertex.index for vertex in face.verts)
            for face in editable.faces
        )
        editable.free()
    return _create_mesh_object(
        name,
        vertices,
        faces,
        target_collection,
        material=material,
        uv_swatch=uv_swatch,
        parent=parent,
    )


def _create_empty(
    name: str,
    target_collection: bpy.types.Collection,
    *,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation_z: float = 0.0,
    properties: dict[str, object],
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.18
    target_collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.rotation_euler[2] = rotation_z
    for key, value in properties.items():
        obj[key] = value
    return obj


def _token(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")


def _build_sliding_door(
    *,
    token: str,
    door_id: str,
    door_class: str,
    root_location: tuple[float, float, float],
    root_rotation_z: float,
    panel_size: tuple[float, float, float],
    open_delta: tuple[float, float, float],
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    door_material: bpy.types.Material,
    hardware_material: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    elevator_id: str | None = None,
    stop_id: str | None = None,
) -> bpy.types.Object:
    panel_id = f"{door_id}-panel"
    open_pose_id = f"{door_id}-open-pose"
    sweep_id = f"{door_id}-sweep"
    door_properties: dict[str, object] = {
        "hs_id": door_id,
        "hs_role": "door",
        "hs_door_class": door_class,
        "hs_sweep_id": sweep_id,
    }
    if elevator_id is not None:
        door_properties["hs_elevator_id"] = elevator_id
    if stop_id is not None:
        door_properties["hs_stop_id"] = stop_id
    door = _create_empty(
        f"MRK_Door_{token}",
        semantic_collection,
        location=root_location,
        rotation_z=root_rotation_z,
        properties=door_properties,
        parent=parent,
    )
    panel = _create_empty(
        f"MRK_DoorPanel_{token}",
        semantic_collection,
        properties={
            "hs_id": panel_id,
            "hs_role": "door_panel",
            "hs_door_id": door_id,
            "hs_motion_kind": "slide",
            "hs_open_pose_id": open_pose_id,
        },
        parent=door,
    )
    panel_half = tuple(value / 2.0 for value in panel_size)
    panel_box = (
        (
            -panel_half[0],
            -panel_half[1],
            0.0,
        ),
        (
            panel_half[0],
            panel_half[1],
            panel_size[2],
        ),
    )
    _create_box_object(
        f"VIS_DoorPanel_{token}",
        (panel_box,),
        visual_collection,
        material=door_material,
        uv_swatch=swatch_uv("Architecture", "door"),
        parent=panel,
    )
    if abs(open_delta[0]) > abs(open_delta[1]):
        handle_center_x = -math.copysign(0.45, open_delta[0])
        handle_boxes = (
            (
                (
                    handle_center_x - 0.08,
                    -panel_half[1] - 0.02,
                    0.89,
                ),
                (
                    handle_center_x + 0.08,
                    -panel_half[1],
                    1.21,
                ),
            ),
            (
                (
                    handle_center_x - 0.08,
                    panel_half[1],
                    0.89,
                ),
                (
                    handle_center_x + 0.08,
                    panel_half[1] + 0.02,
                    1.21,
                ),
            ),
        )
    else:
        handle_center_y = -math.copysign(0.45, open_delta[1])
        handle_boxes = (
            (
                (
                    -panel_half[0] - 0.02,
                    handle_center_y - 0.08,
                    0.89,
                ),
                (
                    -panel_half[0],
                    handle_center_y + 0.08,
                    1.21,
                ),
            ),
            (
                (
                    panel_half[0],
                    handle_center_y - 0.08,
                    0.89,
                ),
                (
                    panel_half[0] + 0.02,
                    handle_center_y + 0.08,
                    1.21,
                ),
            ),
        )
    _create_box_object(
        f"VIS_DoorPanel_Handle_{token}",
        handle_boxes,
        visual_collection,
        material=hardware_material,
        uv_swatch=swatch_uv("FurnitureProps", "door_hardware_yellow"),
        parent=panel,
    )
    _create_box_object(
        f"COL_DoorPanel_{token}",
        (panel_box,),
        collider_collection,
        parent=panel,
    )
    _create_empty(
        f"MRK_DoorOpenPose_{token}",
        semantic_collection,
        location=open_delta,
        properties={
            "hs_id": open_pose_id,
            "hs_role": "door_open_pose",
            "hs_door_id": door_id,
            "hs_panel_id": panel_id,
        },
        parent=door,
    )
    sweep_minimum = (
        min(-panel_half[0], open_delta[0] - panel_half[0]),
        min(-panel_half[1], open_delta[1] - panel_half[1]),
        0.0,
    )
    sweep_maximum = (
        max(panel_half[0], open_delta[0] + panel_half[0]),
        max(panel_half[1], open_delta[1] + panel_half[1]),
        panel_size[2],
    )
    _create_box_object(
        f"VOL_DoorSweep_{token}",
        ((sweep_minimum, sweep_maximum),),
        semantic_collection,
        properties={
            "hs_id": sweep_id,
            "hs_role": "door_sweep",
            "hs_door_id": door_id,
        },
        parent=door,
    )
    return door


def _build_center_opening_elevator_door(
    *,
    token: str,
    door_id: str,
    door_class: str,
    root_location: tuple[float, float, float],
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    door_material: bpy.types.Material,
    parent: bpy.types.Object,
    elevator_id: str,
    panel_height: float,
    stop_id: str | None = None,
) -> bpy.types.Object:
    sweep_id = f"{door_id}-sweep"
    door_properties: dict[str, object] = {
        "hs_id": door_id,
        "hs_role": "door",
        "hs_door_class": door_class,
        "hs_sweep_id": sweep_id,
        "hs_elevator_id": elevator_id,
    }
    if stop_id is not None:
        door_properties["hs_stop_id"] = stop_id
    door = _create_empty(
        f"MRK_Door_{token}",
        semantic_collection,
        location=root_location,
        properties=door_properties,
        parent=parent,
    )

    panel_specs = (
        ("LeftOuter", -0.600, -0.020, -1.000),
        ("LeftInner", -0.200, 0.020, -1.000),
        ("RightInner", 0.200, 0.020, 1.000),
        ("RightOuter", 0.600, -0.020, 1.000),
    )
    panel_half_width = 0.200
    panel_half_depth = 0.0125
    for panel_token, closed_x, local_y, open_x in panel_specs:
        panel_id = f"{door_id}-panel-{_token(panel_token).lower()}"
        open_pose_id = f"{panel_id}-open-pose"
        object_token = f"{token}_{panel_token}"
        panel = _create_empty(
            f"MRK_DoorPanel_{object_token}",
            semantic_collection,
            location=(closed_x, local_y, 0.0),
            properties={
                "hs_id": panel_id,
                "hs_role": "door_panel",
                "hs_door_id": door_id,
                "hs_motion_kind": "slide",
                "hs_open_pose_id": open_pose_id,
            },
            parent=door,
        )
        panel_box = (
            (
                -panel_half_width,
                -panel_half_depth,
                0.0,
            ),
            (
                panel_half_width,
                panel_half_depth,
                panel_height,
            ),
        )
        panel_vertices: list[tuple[float, float, float]] = []
        panel_faces: list[tuple[int, ...]] = []
        _append_box(panel_vertices, panel_faces, panel_box[0], panel_box[1])
        panel_faces = [
            face
            for face_index, face in enumerate(panel_faces)
            if face_index in (2, 4)
        ]
        _create_mesh_object(
            f"VIS_DoorPanel_{object_token}",
            panel_vertices,
            panel_faces,
            visual_collection,
            material=door_material,
            uv_swatch=swatch_uv("Architecture", "door"),
            parent=panel,
        )
        _create_box_object(
            f"COL_DoorPanel_{object_token}",
            (panel_box,),
            collider_collection,
            parent=panel,
        )
        _create_empty(
            f"MRK_DoorOpenPose_{object_token}",
            semantic_collection,
            location=(open_x, local_y, 0.0),
            properties={
                "hs_id": open_pose_id,
                "hs_role": "door_open_pose",
                "hs_door_id": door_id,
                "hs_panel_id": panel_id,
            },
            parent=door,
        )

    _create_box_object(
        f"VOL_DoorSweep_{token}",
        (((-1.20, -0.04, 0.0), (1.20, 0.04, panel_height)),),
        semantic_collection,
        properties={
            "hs_id": sweep_id,
            "hs_role": "door_sweep",
            "hs_door_id": door_id,
        },
        parent=door,
    )
    return door


def _build_room_doors(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    door_material: bpy.types.Material,
    hardware_material: bpy.types.Material,
) -> int:
    count = 0
    for room in ROOM_VARIANT_SPECS:
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
                door_plane = -3.66 if room.base_z == 0.0 else -3.38
                root_location = (door_plane, opening_center, room.base_z)
                panel_size = (0.08, 1.20, 2.30)
                normal_offset = ROOM_DOOR_OPEN_NORMAL_OFFSETS[
                    ("west", "f01" if room.base_z == 0.0 else "upper")
                ]
                open_delta = (
                    normal_offset,
                    open_sign * 1.20,
                    0.0,
                )
            else:
                door_plane = 36.66 if room.base_z == 0.0 else 36.34
                root_location = (opening_center, door_plane, room.base_z)
                panel_size = (1.20, 0.08, 2.30)
                normal_offset = ROOM_DOOR_OPEN_NORMAL_OFFSETS[
                    ("north", "f01" if room.base_z == 0.0 else "upper")
                ]
                open_delta = (
                    open_sign * 1.20,
                    normal_offset,
                    0.0,
                )
            token = f"{_token(room.author_name)}_{opening_index:02d}"
            _build_sliding_door(
                token=token,
                door_id=f"room-door-{room.room_id}-{opening_index:02d}",
                door_class="room",
                root_location=root_location,
                root_rotation_z=0.0,
                panel_size=panel_size,
                open_delta=open_delta,
                visual_collection=visual_collection,
                collider_collection=collider_collection,
                semantic_collection=semantic_collection,
                door_material=door_material,
                hardware_material=hardware_material,
            )
            count += 1
    if count != 38:
        raise RuntimeError(f"対象20室の引き戸が38件ではありません: {count}")
    return count


def _build_rooftop_changing_doors(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    door_material: bpy.types.Material,
    hardware_material: bpy.types.Material,
) -> int:
    specs = (
        (
            "RoofChangingMale_01",
            "room-door-roof-changing-male-01",
            -4.80,
        ),
        (
            "RoofChangingFemale_01",
            "room-door-roof-changing-female-01",
            -0.30,
        ),
    )
    for token, door_id, center_x in specs:
        _build_sliding_door(
            token=token,
            door_id=door_id,
            door_class="room",
            root_location=(center_x, 38.48, 14.50),
            root_rotation_z=0.0,
            panel_size=(1.20, 0.08, 2.30),
            open_delta=(1.20, -0.04, 0.0),
            visual_collection=visual_collection,
            collider_collection=collider_collection,
            semantic_collection=semantic_collection,
            door_material=door_material,
            hardware_material=hardware_material,
        )
    return len(specs)


def _build_toilet_stall_doors(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    door_material: bpy.types.Material,
    hardware_material: bpy.types.Material,
) -> int:
    stall_groups = (
        ("m", (-5.05, -3.65, -2.25)),
        ("f", (-0.55, 0.85, 2.25)),
    )
    count = 0
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        for gender, hinge_positions in stall_groups:
            for stall_index, hinge_x in enumerate(hinge_positions, 1):
                door_id = (
                    f"toilet-stall-f{floor:02d}-{gender}-{stall_index:02d}"
                )
                token = (
                    f"ToiletStall_F{floor:02d}_{gender.upper()}_{stall_index:02d}"
                )
                panel_id = f"{door_id}-panel"
                open_pose_id = f"{door_id}-open-pose"
                sweep_id = f"{door_id}-sweep"
                width = 1.40
                door = _create_empty(
                    f"MRK_Door_{token}",
                    semantic_collection,
                    location=(hinge_x, 43.25, base_z),
                    properties={
                        "hs_id": door_id,
                        "hs_role": "door",
                        "hs_door_class": "toilet_stall",
                        "hs_sweep_id": sweep_id,
                    },
                )
                panel = _create_empty(
                    f"MRK_DoorPanel_{token}",
                    semantic_collection,
                    properties={
                        "hs_id": panel_id,
                        "hs_role": "door_panel",
                        "hs_door_id": door_id,
                        "hs_motion_kind": "swing",
                        "hs_open_pose_id": open_pose_id,
                    },
                    parent=door,
                )
                panel_box = (
                    (-width, -0.02, 0.0),
                    (0.0, 0.02, 1.80),
                )
                _create_box_object(
                    f"VIS_DoorPanel_{token}",
                    (panel_box,),
                    visual_collection,
                    material=door_material,
                    uv_swatch=swatch_uv("Architecture", "door"),
                    parent=panel,
                )
                _create_low_poly_spheres_object(
                    f"VIS_DoorPanel_Knob_{token}",
                    TOILET_STALL_KNOB_CENTERS,
                    TOILET_STALL_KNOB_RADIUS,
                    visual_collection,
                    material=hardware_material,
                    uv_swatch=swatch_uv(
                        "FurnitureProps",
                        "door_hardware_yellow",
                    ),
                    parent=panel,
                )
                _create_box_object(
                    f"COL_DoorPanel_{token}",
                    (panel_box,),
                    collider_collection,
                    parent=panel,
                )
                _create_empty(
                    f"MRK_DoorOpenPose_{token}",
                    semantic_collection,
                    rotation_z=TOILET_STALL_OPEN_ROTATION_Z,
                    properties={
                        "hs_id": open_pose_id,
                        "hs_role": "door_open_pose",
                        "hs_door_id": door_id,
                        "hs_panel_id": panel_id,
                    },
                    parent=door,
                )
                _create_box_object(
                    f"VOL_DoorSweep_{token}",
                    (
                        (
                            (-width - 0.02, -0.02, 0.0),
                            (0.02, width + 0.02, 1.80),
                        ),
                    ),
                    semantic_collection,
                    properties={
                        "hs_id": sweep_id,
                        "hs_role": "door_sweep",
                        "hs_door_id": door_id,
                    },
                    parent=door,
                )
                count += 1
    if count != 24:
        raise RuntimeError(f"トイレ個室開き戸が24件ではありません: {count}")
    return count


def _build_elevator(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    door_material: bpy.types.Material,
    architecture_material: bpy.types.Material,
) -> dict[str, int]:
    elevator_id = "school-elevator"
    elevator_center_y = -5.175
    car_id = "school-elevator-car"
    car_door_id = "school-elevator-car-door"
    occupancy_id = "school-elevator-car-occupancy"
    passenger_origin_id = "school-elevator-passenger-origin"
    link_id = "school-elevator-f01-f04"
    stop_specs = (
        (1, "A", 0.0),
        (4, "B", 10.8),
    )
    controller = _create_empty(
        "MRK_Elevator_School",
        semantic_collection,
        properties={
            "hs_id": elevator_id,
            "hs_role": "elevator",
            "hs_link_id": link_id,
            "hs_car_id": car_id,
            "hs_car_door_id": car_door_id,
            "hs_occupancy_id": occupancy_id,
            "hs_passenger_origin_id": passenger_origin_id,
            "hs_initial_stop_id": "school-elevator-stop-f04",
        },
    )
    car = _create_empty(
        "MRK_ElevatorCar_School",
        semantic_collection,
        location=(-10.30, elevator_center_y, 10.8),
        rotation_z=math.pi / 2.0,
        properties={
            "hs_id": car_id,
            "hs_role": "elevator_car",
            "hs_elevator_id": elevator_id,
        },
        parent=controller,
    )
    car_boxes = (
        ((-1.32, -0.98, 0.00), (1.32, 1.19, 0.12)),
        ((-1.32, -1.08, 2.30), (1.32, 1.19, 2.42)),
        ((-1.32, 1.11, 0.12), (1.32, 1.19, 2.30)),
        ((-1.32, -0.94, 0.12), (-1.24, 1.11, 2.30)),
        ((1.24, -0.94, 0.12), (1.32, 1.11, 2.30)),
        ((-1.32, -1.08, 0.12), (-1.24, -1.04, 2.30)),
        ((1.24, -1.08, 0.12), (1.32, -1.04, 2.30)),
    )
    car_visual_vertices: list[tuple[float, float, float]] = []
    car_visual_faces: list[tuple[int, ...]] = []
    for box_index, (minimum, maximum) in enumerate(car_boxes):
        first_face_index = len(car_visual_faces)
        _append_box(car_visual_vertices, car_visual_faces, minimum, maximum)
        if box_index == 0:
            # 停止階の床上面がかご床下面を所有する。かご側の同一平面は出力しない。
            car_visual_faces.pop(first_face_index)
    _create_mesh_object(
        "VIS_ElevatorCar_School",
        car_visual_vertices,
        car_visual_faces,
        visual_collection,
        material=architecture_material,
        uv_swatch=swatch_uv("Architecture", "wall"),
        parent=car,
    )
    _create_box_object(
        "COL_ElevatorCar_School",
        car_boxes,
        collider_collection,
        parent=car,
    )
    _build_center_opening_elevator_door(
        token="ElevatorCar_School",
        door_id=car_door_id,
        door_class="elevator_car",
        root_location=(0.0, -0.99, 0.12),
        visual_collection=visual_collection,
        collider_collection=collider_collection,
        semantic_collection=semantic_collection,
        door_material=door_material,
        parent=car,
        elevator_id=elevator_id,
        panel_height=2.18,
    )
    _create_box_object(
        "VOL_ElevatorCarOccupancy_School",
        (((-1.04, -0.78, 0.12), (1.04, 0.96, 2.18)),),
        semantic_collection,
        properties={
            "hs_id": occupancy_id,
            "hs_role": "elevator_car_occupancy",
            "hs_elevator_id": elevator_id,
        },
        parent=car,
    )
    _create_empty(
        "MRK_ElevatorPassengerOrigin_School",
        semantic_collection,
        location=(0.0, 0.0, 0.12),
        properties={
            "hs_id": passenger_origin_id,
            "hs_role": "elevator_passenger_origin",
            "hs_elevator_id": elevator_id,
        },
        parent=car,
    )

    for floor, endpoint, base_z in stop_specs:
        stop_id = f"school-elevator-stop-f{floor:02d}"
        landing_door_id = f"school-elevator-landing-door-f{floor:02d}"
        call_mat_id = f"school-elevator-call-mat-f{floor:02d}"
        call_indicator_id = (
            f"school-elevator-call-indicator-f{floor:02d}"
        )
        threshold_id = f"school-elevator-threshold-f{floor:02d}"
        gate_id = f"school-elevator-human-gate-f{floor:02d}"
        wait_id = f"school-elevator-wait-f{floor:02d}"
        stop = _create_empty(
            f"MRK_ElevatorStop_F{floor:02d}",
            semantic_collection,
            location=(-10.30, elevator_center_y, base_z),
            rotation_z=math.pi / 2.0,
            properties={
                "hs_id": stop_id,
                "hs_role": "elevator_stop",
                "hs_elevator_id": elevator_id,
                "hs_link_id": link_id,
                "hs_endpoint": endpoint,
                "hs_floor_index": floor,
                "hs_landing_door_id": landing_door_id,
                "hs_call_mat_id": call_mat_id,
                "hs_call_indicator_id": call_indicator_id,
                "hs_threshold_id": threshold_id,
                "hs_gate_id": gate_id,
                "hs_wait_id": wait_id,
            },
            parent=controller,
        )
        _build_center_opening_elevator_door(
            token=f"ElevatorLanding_F{floor:02d}",
            door_id=landing_door_id,
            door_class="elevator_landing",
            root_location=(0.0, -1.46, 0.0),
            visual_collection=visual_collection,
            collider_collection=collider_collection,
            semantic_collection=semantic_collection,
            door_material=door_material,
            parent=stop,
            elevator_id=elevator_id,
            panel_height=2.40,
            stop_id=stop_id,
        )
        _create_box_object(
            f"VOL_ElevatorCallMat_F{floor:02d}",
            (((-0.85, -3.12, 0.00), (0.85, -1.62, 0.05)),),
            semantic_collection,
            properties={
                "hs_id": call_mat_id,
                "hs_role": "elevator_call_mat",
                "hs_elevator_id": elevator_id,
                "hs_stop_id": stop_id,
            },
            parent=stop,
        )
        call_indicator = _create_empty(
            f"MRK_ElevatorCallIndicator_F{floor:02d}",
            semantic_collection,
            properties={
                "hs_id": call_indicator_id,
                "hs_role": "elevator_call_indicator",
                "hs_elevator_id": elevator_id,
                "hs_stop_id": stop_id,
                "hs_direction": "up" if floor == 1 else "down",
            },
            parent=stop,
        )
        # 1Fの西棟床仕上げはStop基準Z=0.00..0.04を占有するため、
        # 呼出表示だけをその上へ載せる。4Fは床上端がStop基準Z=0.00なので
        # 従来の高さを維持し、両階とも呼出Volumeと同じ足元範囲を見せる。
        indicator_base_min_z = 0.045 if floor == 1 else 0.005
        indicator_base_max_z = indicator_base_min_z + 0.020
        indicator_direction_min_z = indicator_base_max_z + 0.002
        indicator_direction_max_z = indicator_direction_min_z + 0.010
        # 呼出Volumeを踏む位置そのものを点滅表示にする。StopはZ軸+90度
        # 回転しているため、このlocal床面は扉前のworld領域へ一致する。
        _create_box_object(
            f"VIS_ElevatorCallIndicator_Base_F{floor:02d}",
            (
                (
                    (-0.85, -3.12, indicator_base_min_z),
                    (0.85, -1.62, indicator_base_max_z),
                ),
            ),
            visual_collection,
            material=architecture_material,
            uv_swatch=swatch_uv("Architecture", "elevator_wait"),
            parent=call_indicator,
        )
        direction_vertices: list[tuple[float, float, float]] = []
        direction_faces: list[tuple[int, ...]] = []
        if floor == 1:
            direction_points = (
                (0.0, -1.82),
                (-0.45, -2.72),
                (0.45, -2.72),
            )
        else:
            direction_points = (
                (0.0, -2.92),
                (0.45, -2.02),
                (-0.45, -2.02),
            )
        _append_triangular_prism(
            direction_vertices,
            direction_faces,
            direction_points,
            indicator_direction_min_z,
            indicator_direction_max_z,
        )
        _create_mesh_object(
            f"VIS_ElevatorCallIndicator_Direction_F{floor:02d}",
            direction_vertices,
            direction_faces,
            visual_collection,
            material=architecture_material,
            uv_swatch=swatch_uv("Architecture", "elevator_direction"),
            parent=call_indicator,
        )
        _create_box_object(
            f"VOL_ElevatorThreshold_F{floor:02d}",
            (((-0.80, -1.20, -0.02), (0.80, -0.98, 0.12)),),
            semantic_collection,
            properties={
                "hs_id": threshold_id,
                "hs_role": "elevator_threshold",
                "hs_elevator_id": elevator_id,
                "hs_stop_id": stop_id,
            },
            parent=stop,
        )
        threshold_vertices: list[tuple[float, float, float]] = []
        threshold_faces: list[tuple[int, ...]] = []
        _append_threshold_ramp_with_plateau(
            threshold_vertices,
            threshold_faces,
            -0.80,
            0.80,
            -1.20,
            -1.04,
            -0.98,
            -0.02,
            0.00,
            0.12,
        )
        # 表示面は廊下床端とかご前端が敷居の両端面を所有するため、敷居側を開く。
        # Colliderは閉体契約を維持し、表示されない衝突境界だけを同一面へ接続する。
        threshold_visual_faces = [
            face
            for face_index, face in enumerate(threshold_faces)
            if face_index not in {3, 6}
        ]
        _create_mesh_object(
            f"VIS_ElevatorThresholdPlate_F{floor:02d}",
            threshold_vertices,
            threshold_visual_faces,
            visual_collection,
            material=architecture_material,
            uv_swatch=swatch_uv("Architecture", "floor"),
            parent=stop,
        )
        _create_mesh_object(
            f"COL_ElevatorThresholdPlate_F{floor:02d}",
            threshold_vertices,
            threshold_faces,
            collider_collection,
            parent=stop,
        )
        gate = _create_empty(
            f"MRK_ElevatorHumanGate_F{floor:02d}",
            semantic_collection,
            location=(0.0, -1.18, 0.0),
            properties={
                "hs_id": gate_id,
                "hs_role": "elevator_human_gate",
                "hs_elevator_id": elevator_id,
                "hs_stop_id": stop_id,
            },
            parent=stop,
        )
        _create_box_object(
            f"COL_HumanOnly_ElevatorGate_F{floor:02d}",
            (((-0.85, -0.04, 0.0), (0.85, 0.04, 2.30)),),
            collider_collection,
            parent=gate,
        )
        _create_empty(
            f"MRK_ElevatorWait_F{floor:02d}",
            semantic_collection,
            location=(1.20, -2.30, 0.0),
            properties={
                "hs_id": wait_id,
                "hs_role": "elevator_wait",
                "hs_elevator_id": elevator_id,
                "hs_stop_id": stop_id,
            },
            parent=stop,
        )
        _create_empty(
            f"LNK_{link_id}_{endpoint}",
            semantic_collection,
            location=(-8.20, elevator_center_y, base_z),
            properties={
                "hs_id": link_id,
                "hs_link_kind": "elevator",
                "hs_bidirectional": True,
                "hs_link_radius_m": 0.54,
                "hs_endpoint": endpoint,
            },
        )
    return {
        "controllers": 1,
        "cars": 1,
        "stops": len(stop_specs),
        "call_indicators": len(stop_specs),
        "landing_doors": len(stop_specs),
        "car_doors": 1,
        "link_endpoints": len(stop_specs),
    }


def _copy_mesh_object(
    source: bpy.types.Object,
    name: str,
    target_collection: bpy.types.Collection,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, source.data.copy())
    obj.data.name = name
    target_collection.objects.link(obj)
    obj.parent = parent
    return obj


def _copy_mesh_excluding_bounds(
    source: bpy.types.Object,
    name: str,
    target_collection: bpy.types.Collection,
    parent: bpy.types.Object,
    excluded_bounds: tuple[
        tuple[tuple[float, float, float], tuple[float, float, float]], ...
    ],
) -> bpy.types.Object:
    obj = _copy_mesh_object(
        source,
        name,
        target_collection,
        parent,
    )
    mesh = obj.data
    adjacency = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)
    components: list[set[int]] = []
    pending = set(range(len(mesh.vertices)))
    while pending:
        component = set()
        frontier = [min(pending)]
        while frontier:
            index = frontier.pop()
            if index not in pending:
                continue
            pending.remove(index)
            component.add(index)
            frontier.extend(adjacency[index] & pending)
        components.append(component)

    removed_indices: set[int] = set()
    for component in components:
        coordinates = [mesh.vertices[index].co for index in component]
        center = tuple(
            (
                min(coordinate[axis] for coordinate in coordinates)
                + max(coordinate[axis] for coordinate in coordinates)
            )
            / 2.0
            for axis in range(3)
        )
        if any(
            minimum[0] - 0.12 <= center[0] <= maximum[0] + 0.12
            and minimum[1] - 0.12 <= center[1] <= maximum[1] + 0.12
            and minimum[2] - 0.05 <= center[2] <= maximum[2] + 0.25
            for minimum, maximum in excluded_bounds
        ):
            removed_indices.update(component)
    if removed_indices:
        editable = bmesh.new()
        editable.from_mesh(mesh)
        editable.verts.ensure_lookup_table()
        bmesh.ops.delete(
            editable,
            geom=[editable.verts[index] for index in sorted(removed_indices)],
            context="VERTS",
        )
        editable.to_mesh(mesh)
        editable.free()
        mesh.update(calc_edges=True)
    return obj


def _collider_without_boxes(
    collider: bpy.types.Object,
    removed_box_indices: tuple[int, ...],
) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    removed = set(removed_box_indices)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    source_vertices = collider.data.vertices
    source_faces = collider.data.polygons
    for box_index in range(len(source_vertices) // 8):
        if box_index in removed:
            continue
        source_vertex_offset = box_index * 8
        target_vertex_offset = len(vertices)
        vertices.extend(
            tuple(source_vertices[source_vertex_offset + index].co)
            for index in range(8)
        )
        for polygon in source_faces[box_index * 6:(box_index + 1) * 6]:
            faces.append(
                tuple(
                    vertex_index
                    - source_vertex_offset
                    + target_vertex_offset
                    for vertex_index in polygon.vertices
                )
            )
    return vertices, faces


def _create_variant_nav_from_collider(
    collider: bpy.types.Object,
    name: str,
    nav_collection: bpy.types.Collection,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    obj = _copy_mesh_object(collider, name, nav_collection, parent)
    obj["hs_nav_set"] = "human"
    obj["hs_nav_role"] = "blocker"
    return obj


def _create_variant_nav_from_boxes(
    boxes: tuple[
        tuple[tuple[float, float, float], tuple[float, float, float]],
        ...,
    ],
    name: str,
    nav_collection: bpy.types.Collection,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    obj = _create_box_object(
        name,
        boxes,
        nav_collection,
        parent=parent,
    )
    obj["hs_nav_set"] = "human"
    obj["hs_nav_role"] = "blocker"
    return obj


def _tile_aligned_room_bounds(
    bounds_xy: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    minimum_x, maximum_x, minimum_y, maximum_y = bounds_xy
    x_indices = tuple(
        index
        for index in range(NAV_GRID_WIDTH)
        if minimum_x
        < NAV_GRID_ORIGIN_X_BLENDER + (index + 0.5) * NAV_TILE_SIZE_BLENDER
        < maximum_x
    )
    y_indices = tuple(
        index
        for index in range(NAV_GRID_HEIGHT)
        if minimum_y
        < NAV_GRID_ORIGIN_Y_BLENDER - (index + 0.5) * NAV_TILE_SIZE_BLENDER
        < maximum_y
    )
    if not x_indices or not y_indices:
        raise RuntimeError(f"部屋所有tileが空です: {bounds_xy}")
    return (
        NAV_GRID_ORIGIN_X_BLENDER + min(x_indices) * NAV_TILE_SIZE_BLENDER,
        NAV_GRID_ORIGIN_X_BLENDER + (max(x_indices) + 1) * NAV_TILE_SIZE_BLENDER,
        NAV_GRID_ORIGIN_Y_BLENDER
        - (max(y_indices) + 1) * NAV_TILE_SIZE_BLENDER,
        NAV_GRID_ORIGIN_Y_BLENDER - min(y_indices) * NAV_TILE_SIZE_BLENDER,
    )


def _batch_bounds(
    *batches: MeshBatch,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    vertices = [vertex for batch in batches for vertex in batch.vertices]
    if not vertices:
        return ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
    return (
        tuple(min(vertex[axis] for vertex in vertices) for axis in range(3)),
        tuple(max(vertex[axis] for vertex in vertices) for axis in range(3)),
    )


def _box_corners(
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
) -> tuple[Vector, ...]:
    return tuple(
        Vector((x, y, z))
        for x in (minimum[0], maximum[0])
        for y in (minimum[1], maximum[1])
        for z in (minimum[2], maximum[2])
    )


def _transformed_box_bounds(
    box: tuple[tuple[float, float, float], tuple[float, float, float]],
    transform: Matrix,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    corners = tuple(transform @ corner for corner in _box_corners(*box))
    return (
        tuple(min(corner[axis] for corner in corners) for axis in range(3)),
        tuple(max(corner[axis] for corner in corners) for axis in range(3)),
    )


def _source_collider_boxes(
    prop_type: str,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    size = PROP_COLLIDER_SIZES.get(prop_type)
    if size is None:
        return []
    center = PROP_COLLIDER_LOCAL_CENTERS.get(
        prop_type,
        (0.0, 0.0, size[2] / 2.0),
    )
    return [
        (
            tuple(center[axis] - size[axis] / 2.0 for axis in range(3)),
            tuple(center[axis] + size[axis] / 2.0 for axis in range(3)),
        )
    ]


def _replay_local_placement(
    placement: RoomPlacement,
    sources: dict[str, bpy.types.Object],
) -> ReplayedPlacement:
    furniture = MeshBatch("FurnitureProps")
    signs = MeshBatch("SignsPaper")
    collider_boxes: list[
        tuple[tuple[float, float, float], tuple[float, float, float]]
    ] = []
    if placement.kind == "prop":
        source = sources[placement.prop_type]
        target = signs if placement.prop_type in PAPER_SWATCHES else furniture
        target.add_source_matrix(
            source,
            Matrix.Identity(4),
            PAPER_SWATCHES.get(placement.prop_type),
        )
        collider_boxes.extend(_source_collider_boxes(placement.prop_type))
    elif placement.kind == "additional":
        temporary = RoomBuilder.create("VariantReplay", 0.0)
        add_additional_prop(
            temporary,
            placement.prop_type,
            (0.0, 0.0, 0.0),
        )
        furniture.add_batch(temporary.furniture, Matrix.Identity(4))
        signs.add_batch(temporary.signs, Matrix.Identity(4))
        collider_boxes.extend(temporary.colliders)
    elif placement.kind == "sign":
        signs.add_sign_box(
            (0.0, 0.0, 0.0),
            SIGN_SIZE,
            placement.prop_type,
        )
    else:
        raise RuntimeError(
            f"個別再配置に未対応のplacement種別です: {placement.kind}"
        )
    minimum, maximum = _batch_bounds(furniture, signs)
    local_pivot = (
        (minimum[0] + maximum[0]) / 2.0,
        (minimum[1] + maximum[1]) / 2.0,
        minimum[2],
    )
    return ReplayedPlacement(
        furniture,
        signs,
        collider_boxes,
        local_pivot,
    )


def _placement_transform(
    placement: RoomPlacement,
    replayed: ReplayedPlacement,
    override: PlacementOverride,
) -> Matrix:
    local_pivot = Vector(replayed.local_pivot)
    if override.target_pivot is None:
        original_rotation = Matrix.Rotation(placement.rotation_z, 3, "Z")
        target_pivot = (
            Vector(placement.position)
            + original_rotation @ local_pivot
            + Vector(override.offset)
        )
    else:
        target_pivot = Vector(override.target_pivot)
    rotation = Euler(
        (
            override.rotation_x,
            override.rotation_y,
            placement.rotation_z + override.rotation_z_delta,
        ),
        "XYZ",
    ).to_matrix().to_4x4()
    transform = (
        Matrix.Translation(target_pivot)
        @ rotation
        @ Matrix.Translation(-local_pivot)
    )
    if override.rest_z is not None:
        vertices = [
            transform @ Vector(vertex)
            for batch in (replayed.furniture, replayed.signs)
            for vertex in batch.vertices
        ]
        vertices.extend(
            transform @ corner
            for box in replayed.collider_boxes
            for corner in _box_corners(*box)
        )
        minimum_z = min(vertex.z for vertex in vertices)
        transform = Matrix.Translation(
            (0.0, 0.0, override.rest_z - minimum_z)
        ) @ transform
    return transform


def _transformed_placement_geometry(
    key: tuple[str, int],
    changed: bool,
    replayed: ReplayedPlacement,
    transform: Matrix,
) -> TransformedPlacementGeometry:
    vertices = tuple(
        tuple(transform @ Vector(vertex)) for vertex in replayed.furniture.vertices
    )
    if not vertices:
        raise RuntimeError(f"家具メッシュが空です: {key[0]}[{key[1]}]")
    bounds = (
        tuple(min(vertex[axis] for vertex in vertices) for axis in range(3)),
        tuple(max(vertex[axis] for vertex in vertices) for axis in range(3)),
    )
    return TransformedPlacementGeometry(
        key,
        changed,
        bounds,
        vertices,
        tuple(replayed.furniture.faces),
    )


def _placement_bounds_overlap(
    first: TransformedPlacementGeometry,
    second: TransformedPlacementGeometry,
) -> bool:
    tolerance = 1.0e-4
    return all(
        first.bounds[0][axis] + tolerance < second.bounds[1][axis]
        and first.bounds[1][axis] - tolerance > second.bounds[0][axis]
        for axis in range(3)
    )


def _placement_meshes_intersect(
    first: TransformedPlacementGeometry,
    second: TransformedPlacementGeometry,
) -> bool:
    if not _placement_bounds_overlap(first, second):
        return False
    first_tree = BVHTree.FromPolygons(
        [Vector(vertex) for vertex in first.vertices],
        first.faces,
        all_triangles=False,
        epsilon=1.0e-5,
    )
    second_tree = BVHTree.FromPolygons(
        [Vector(vertex) for vertex in second.vertices],
        second.faces,
        all_triangles=False,
        epsilon=1.0e-5,
    )
    return bool(first_tree.overlap(second_tree))


def _pattern_c_barricade_keys(
    room: RoomVariantSpec,
) -> frozenset[tuple[str, int]]:
    if CLASSROOM_PATTERN_BY_AUTHOR.get(room.author_name) != "C":
        return frozenset()
    return frozenset(
        {
            *(("ClassroomDesk", index) for index in range(20, 30)),
            *(("ClassroomChair", index) for index in range(20, 30)),
            ("TeacherDesk", 0),
        }
    )


def _is_pattern_c_barricade_pair(
    room: RoomVariantSpec,
    first_key: tuple[str, int],
    second_key: tuple[str, int],
) -> bool:
    barricade = _pattern_c_barricade_keys(room)
    return first_key in barricade and second_key in barricade


def _assert_disordered_furniture_clearance(
    room: RoomVariantSpec,
    geometries: tuple[TransformedPlacementGeometry, ...],
) -> None:
    intersections = []
    for first_index, first in enumerate(geometries):
        for second in geometries[first_index + 1 :]:
            if not first.changed and not second.changed:
                continue
            if _is_pattern_c_barricade_pair(room, first.key, second.key):
                continue
            if _placement_meshes_intersect(first, second):
                intersections.append(
                    f"{first.key[0]}[{first.key[1]}] x "
                    f"{second.key[0]}[{second.key[1]}]"
                )
    if intersections:
        raise RuntimeError(
            f"{room.room_id}: バリケード内部以外の家具メッシュが干渉しています: "
            + ", ".join(intersections)
        )


def _assert_pattern_c_barricade_at_front_door(
    room: RoomVariantSpec,
    geometries: tuple[TransformedPlacementGeometry, ...],
) -> None:
    barricade_keys = _pattern_c_barricade_keys(room)
    if not barricade_keys:
        return

    barricade_geometries = tuple(
        geometry for geometry in geometries if geometry.key in barricade_keys
    )
    if len(barricade_geometries) != len(barricade_keys):
        raise RuntimeError(
            f"{room.room_id}: 前扉バリケードの家具数が不正です: "
            f"expected={len(barricade_keys)}, actual={len(barricade_geometries)}"
        )

    minimum_x, maximum_x, _minimum_y, _maximum_y = room.bounds_xy
    pile_minimum_x = min(
        geometry.bounds[0][0] for geometry in barricade_geometries
    )
    pile_maximum_x = max(
        geometry.bounds[1][0] for geometry in barricade_geometries
    )
    if (pile_minimum_x + pile_maximum_x) / 2.0 <= (minimum_x + maximum_x) / 2.0:
        raise RuntimeError(
            f"{room.room_id}: バリケードが前扉ではなく窓側にあります: "
            f"pile_x=({pile_minimum_x}, {pile_maximum_x}), room={room.bounds_xy}"
        )

    front_door_minimum_y, front_door_maximum_y = room.openings[1]
    front_door_center_y = (front_door_minimum_y + front_door_maximum_y) / 2.0
    front_door_barriers = tuple(
        geometry
        for geometry in barricade_geometries
        if geometry.bounds[0][1] <= front_door_center_y <= geometry.bounds[1][1]
    )
    if not front_door_barriers:
        raise RuntimeError(
            f"{room.room_id}: バリケードが前扉中央を塞いでいません: "
            f"door_y=({front_door_minimum_y}, {front_door_maximum_y})"
        )
    wall_gap = min(
        maximum_x - geometry.bounds[1][0]
        for geometry in front_door_barriers
    )
    if wall_gap > 0.40:
        raise RuntimeError(
            f"{room.room_id}: バリケード脇と前扉壁の間隔が広すぎます: "
            f"gap={wall_gap:.3f}m"
        )

    room_center_x = (minimum_x + maximum_x) / 2.0
    room_center_y = (
        room.bounds_xy[2] + room.bounds_xy[3]
    ) / 2.0
    center_obstacles = tuple(
        geometry.key
        for geometry in geometries
        if geometry.bounds[0][0] <= room_center_x <= geometry.bounds[1][0]
        and geometry.bounds[0][1] <= room_center_y <= geometry.bounds[1][1]
    )
    if center_obstacles:
        raise RuntimeError(
            f"{room.room_id}: 後扉から到達する室内中央に家具があります: "
            f"{center_obstacles}"
        )


def _placement_occurrences(
    room: RoomBuilder,
) -> dict[str, list[RoomPlacement]]:
    result: dict[str, list[RoomPlacement]] = {}
    for placement in room.placements:
        if placement.kind == "curtain":
            continue
        result.setdefault(placement.prop_type, []).append(placement)
    return result


def _translated_override(
    override: PlacementOverride,
    translation: tuple[float, float],
) -> PlacementOverride:
    delta_x, delta_y = translation
    if override.target_pivot is not None:
        return replace(
            override,
            target_pivot=(
                override.target_pivot[0] + delta_x,
                override.target_pivot[1] + delta_y,
                override.target_pivot[2],
            ),
        )
    return replace(
        override,
        offset=(
            override.offset[0] + delta_x,
            override.offset[1] + delta_y,
            override.offset[2],
        ),
    )


def _clearance_candidate_translations(
    placement: RoomPlacement,
) -> tuple[tuple[float, float], ...]:
    if placement.prop_type in {"ClassroomChair", "StaffChair"}:
        sine = math.sin(placement.rotation_z)
        cosine = math.cos(placement.rotation_z)
        outward = (-sine, cosine)
        lateral = (cosine, sine)
        candidates = []
        for outward_distance in (0.0, 0.15, 0.30, 0.45, 0.60, -0.15):
            for lateral_distance in (
                0.0,
                0.15,
                -0.15,
                0.30,
                -0.30,
                0.45,
                -0.45,
                0.60,
                -0.60,
            ):
                candidates.append(
                    (
                        outward[0] * outward_distance
                        + lateral[0] * lateral_distance,
                        outward[1] * outward_distance
                        + lateral[1] * lateral_distance,
                    )
                )
        for radius in (
            0.75,
            0.90,
            1.05,
            1.20,
            1.35,
            1.50,
            1.65,
            1.80,
            1.95,
            2.10,
            2.25,
            2.40,
        ):
            for direction in range(24):
                angle = math.tau * direction / 24.0
                candidates.append(
                    (radius * math.cos(angle), radius * math.sin(angle))
                )
        return tuple(candidates)

    candidates = [(0.0, 0.0)]
    for radius in (0.20, 0.40, 0.60, 0.80, 1.00, 1.20, 1.40, 1.60, 1.80, 2.00):
        for direction in range(16):
            angle = math.tau * direction / 16.0
            candidates.append(
                (radius * math.cos(angle), radius * math.sin(angle))
            )
    return tuple(candidates)


def _geometry_is_inside_room(
    room: RoomVariantSpec,
    geometry: TransformedPlacementGeometry,
) -> bool:
    minimum_x, maximum_x, minimum_y, maximum_y = room.bounds_xy
    margin = 0.03
    return (
        geometry.bounds[0][0] >= minimum_x + margin
        and geometry.bounds[1][0] <= maximum_x - margin
        and geometry.bounds[0][1] >= minimum_y + margin
        and geometry.bounds[1][1] <= maximum_y - margin
    )


def _resolve_disordered_furniture_overrides(
    room: RoomVariantSpec,
    normal_room: RoomBuilder,
    sources: dict[str, bpy.types.Object],
    overrides: dict[tuple[str, int], PlacementOverride],
) -> dict[tuple[str, int], PlacementOverride]:
    occurrences: dict[str, int] = {}
    placements = []
    for placement in normal_room.placements:
        if placement.kind == "curtain":
            continue
        occurrence = occurrences.get(placement.prop_type, 0)
        occurrences[placement.prop_type] = occurrence + 1
        key = (placement.prop_type, occurrence)
        if placement.prop_type in FLOOR_FURNITURE_TYPES:
            placements.append((key, placement))

    barricade_keys = _pattern_c_barricade_keys(room)
    resolved = dict(overrides)
    occupied: list[TransformedPlacementGeometry] = []
    movable = []
    for key, placement in placements:
        override = resolved.get(key, PlacementOverride())
        replayed = _replay_local_placement(placement, sources)
        geometry = _transformed_placement_geometry(
            key,
            key in resolved,
            replayed,
            _placement_transform(placement, replayed, override),
        )
        if key not in resolved or key in barricade_keys:
            if key in barricade_keys and not _geometry_is_inside_room(room, geometry):
                raise RuntimeError(
                    f"{room.room_id}: バリケードの{key[0]}[{key[1]}]が"
                    "教室壁の外へはみ出しています: "
                    f"bounds={geometry.bounds}, room={room.bounds_xy}"
                )
            occupied.append(geometry)
        else:
            movable.append((key, placement, replayed))

    movable.sort(
        key=lambda item: (
            item[0][0] in {"ClassroomChair", "StaffChair"},
            0 if item[0][0] == "CleaningLocker" else 1,
            item[0][0],
            item[0][1],
        )
    )
    for key, placement, replayed in movable:
        original_override = resolved[key]
        for translation in _clearance_candidate_translations(placement):
            candidate_override = _translated_override(original_override, translation)
            candidate_geometry = _transformed_placement_geometry(
                key,
                True,
                replayed,
                _placement_transform(placement, replayed, candidate_override),
            )
            if not _geometry_is_inside_room(room, candidate_geometry):
                continue
            if any(
                _placement_meshes_intersect(candidate_geometry, obstacle)
                for obstacle in occupied
            ):
                continue
            resolved[key] = candidate_override
            occupied.append(candidate_geometry)
            break
        else:
            raise RuntimeError(
                f"{room.room_id}: {key[0]}[{key[1]}]を"
                "ほかの家具と干渉しない位置へ移動できません"
            )
    return resolved


def _classroom_desktop_prop_owners(
    room: RoomBuilder,
) -> dict[tuple[str, int], int]:
    desks = [
        placement
        for placement in room.placements
        if placement.prop_type == "ClassroomDesk"
    ]
    occurrence_by_type: dict[str, int] = {}
    owners: dict[tuple[str, int], int] = {}
    for placement in room.placements:
        occurrence = occurrence_by_type.get(placement.prop_type, 0)
        occurrence_by_type[placement.prop_type] = occurrence + 1
        if (
            placement.prop_type not in CLASSROOM_DESKTOP_PROP_TYPES
            or not math.isclose(
                placement.position[2],
                room.base_z + 0.70,
                abs_tol=1.0e-6,
            )
        ):
            continue
        owner_index = min(
            range(len(desks)),
            key=lambda index: (
                desks[index].position[0] - placement.position[0]
            ) ** 2
            + (
                desks[index].position[1] - placement.position[1]
            ) ** 2,
        )
        owners[(placement.prop_type, occurrence)] = owner_index
    return owners


def _room_overrides(
    room: RoomVariantSpec,
    normal_room: RoomBuilder,
) -> dict[tuple[str, int], PlacementOverride]:
    overrides: dict[tuple[str, int], PlacementOverride] = {}
    by_type = _placement_occurrences(normal_room)

    def assign(
        prop_type: str,
        index: int,
        override: PlacementOverride,
    ) -> None:
        if index >= len(by_type.get(prop_type, ())):
            raise RuntimeError(
                f"{room.room_id}: {prop_type}[{index}]が通常配置にありません"
            )
        overrides[(prop_type, index)] = override

    pattern = CLASSROOM_PATTERN_BY_AUTHOR.get(room.author_name)
    if pattern == "A":
        return overrides
    if pattern == "B":
        fallen_desk_indices = (1, 4, 7, 13, 18, 22, 26)
        desk_offsets = (
            (0.70, 0.45),
            (-0.55, 0.62),
            (0.58, -0.48),
            (-0.68, -0.42),
            (0.46, 0.58),
            (-0.62, 0.36),
            (0.52, -0.54),
        )
        for sequence, index in enumerate(fallen_desk_indices):
            assign(
                "ClassroomDesk",
                index,
                PlacementOverride(
                    offset=(*desk_offsets[sequence], 0.0),
                    rotation_x=(math.pi / 2.0) * (-1 if sequence % 2 else 1),
                    rotation_z_delta=math.radians((-18, 27, -31, 22, 35, -24, 16)[sequence]),
                    rest_z=room.base_z,
                ),
            )
        chair_indices = (0, 2, 4, 6, 9, 11, 13, 16, 19, 22, 25, 28)
        for sequence, index in enumerate(chair_indices):
            assign(
                "ClassroomChair",
                index,
                _fallen_chair_override(
                    by_type["ClassroomChair"][index],
                    sequence,
                    outward_distance=0.48,
                    lateral_distance=0.52 if sequence < 7 else 0.10,
                    rotation_z_delta=math.radians((sequence * 19) % 47 - 23),
                    rest_z=room.base_z,
                ),
            )
        for sequence, index in enumerate((5, 8, 14, 17, 21, 27)):
            assign(
                "ClassroomChair",
                index,
                PlacementOverride(
                    offset=(0.10 * (-1 if sequence % 2 else 1), 0.08, 0.0),
                    rotation_z_delta=math.radians((-14, 18, -11, 15, -17, 12)[sequence]),
                ),
            )
        desktop_prop_owners = _classroom_desktop_prop_owners(normal_room)
        prop_scatter_offsets = (
            (0.30, -0.24),
            (-0.32, 0.22),
            (0.26, 0.28),
            (-0.28, -0.25),
            (0.34, 0.18),
            (-0.30, 0.27),
            (0.27, -0.29),
        )
        for (prop_type, prop_index), desk_index in desktop_prop_owners.items():
            if desk_index not in fallen_desk_indices:
                continue
            desk_sequence = fallen_desk_indices.index(desk_index)
            desk = by_type["ClassroomDesk"][desk_index]
            desk_offset = desk_offsets[desk_sequence]
            scatter_offset = prop_scatter_offsets[desk_sequence]
            assign(
                prop_type,
                prop_index,
                PlacementOverride(
                    target_pivot=(
                        desk.position[0] + desk_offset[0] + scatter_offset[0],
                        desk.position[1] + desk_offset[1] + scatter_offset[1],
                        room.base_z + 0.01,
                    ),
                    rotation_z_delta=math.radians(17 * (desk_sequence + 1)),
                    rest_z=room.base_z + 0.01,
                ),
            )
        return overrides
    if pattern == "C":
        maximum_y = room.bounds_xy[3]
        barricade_x_shift = 0.0
        barricade_y_shift = -0.20
        barricade_desks = (20, 21, 22, 23, 24, 25, 26, 27, 28, 29)
        barricade_chairs = (20, 21, 22, 23, 24, 25, 26, 27, 28, 29)
        desk_targets = tuple(
            (x + barricade_x_shift, y + barricade_y_shift, z)
            for x, y, z in (
                (-4.80, maximum_y - 1.28, room.base_z),
                (-5.27, maximum_y - 0.72, room.base_z),
                (-5.65, maximum_y - 1.42, room.base_z),
                (-5.00, maximum_y - 1.05, room.base_z + 0.32),
                (-5.50, maximum_y - 0.78, room.base_z + 0.35),
                (-5.87, maximum_y - 1.26, room.base_z + 0.38),
                (-5.17, maximum_y - 1.20, room.base_z + 0.64),
                (-5.67, maximum_y - 1.00, room.base_z + 0.68),
                (-5.37, maximum_y - 0.86, room.base_z + 0.94),
                (-5.75, maximum_y - 1.18, room.base_z + 0.92),
            )
        )
        for sequence, index in enumerate(barricade_desks):
            assign(
                "ClassroomDesk",
                index,
                PlacementOverride(
                    target_pivot=desk_targets[sequence],
                    rotation_x=math.radians((72, -78, 86, -68, 74, -82, 61, -70, 55, -58)[sequence]),
                    rotation_z_delta=math.radians((-28, 19, 43, -35, 12, 31, -18, 48, -42, 26)[sequence]),
                    rest_z=desk_targets[sequence][2],
                ),
            )
        chair_targets = tuple(
            (x + barricade_x_shift, y + barricade_y_shift, z)
            for x, y, z in (
                (-4.18, maximum_y - 1.48, room.base_z),
                (-4.93, maximum_y - 0.58, room.base_z),
                (-6.03, maximum_y - 0.78, room.base_z),
                (-6.17, maximum_y - 1.42, room.base_z),
                (-4.73, maximum_y - 0.92, room.base_z + 0.42),
                (-6.07, maximum_y - 1.10, room.base_z + 0.46),
                (-4.97, maximum_y - 1.40, room.base_z + 0.70),
                (-5.79, maximum_y - 0.66, room.base_z + 0.72),
                (-5.27, maximum_y - 1.08, room.base_z + 1.00),
                (-5.65, maximum_y - 1.30, room.base_z + 1.08),
            )
        )
        for sequence, index in enumerate(barricade_chairs):
            assign(
                "ClassroomChair",
                index,
                PlacementOverride(
                    target_pivot=chair_targets[sequence],
                    rotation_x=math.radians((88, -83, 75, -79, 64, -70, 58, -62, 49, -52)[sequence]),
                    rotation_z_delta=math.radians((24, -31, 47, -18, 36, -42, 14, 53, -27, 32)[sequence]),
                    rest_z=chair_targets[sequence][2],
                ),
            )
        for sequence, index in enumerate((0, 2, 4, 6, 8, 10, 12, 14, 16, 18)):
            assign(
                "ClassroomDesk",
                index,
                PlacementOverride(
                    offset=(0.30 * (-1 if sequence % 2 else 1), 0.22 * ((sequence % 3) - 1), 0.0),
                    rotation_x=(math.pi / 2.0) * (-1 if sequence % 2 else 1),
                    rotation_z_delta=math.radians((sequence * 23) % 61 - 30),
                    rest_z=room.base_z,
                ),
            )
        for sequence, index in enumerate((1, 3, 5, 7, 9, 11, 13, 15, 17, 19)):
            assign(
                "ClassroomChair",
                index,
                _fallen_chair_override(
                    by_type["ClassroomChair"][index],
                    sequence,
                    outward_distance=0.48,
                    lateral_distance=0.12,
                    rotation_z_delta=math.radians((sequence * 17) % 53 - 26),
                    rest_z=room.base_z,
                ),
            )
        assign(
            "ClassroomDesk",
            3,
            PlacementOverride(
                target_pivot=(-6.65, room.bounds_xy[2] + 1.25, room.base_z),
                rotation_z_delta=math.radians(6.0),
            ),
        )
        assign(
            "TeacherDesk",
            0,
            PlacementOverride(
                target_pivot=(
                    -6.30 + barricade_x_shift,
                    maximum_y - 1.05 + barricade_y_shift,
                    room.base_z,
                ),
                rotation_z_delta=math.radians(8.0),
            ),
        )
        assign(
            "CleaningLocker",
            0,
            PlacementOverride(
                target_pivot=(
                    -6.25,
                    room.bounds_xy[2] + 0.35,
                    room.base_z,
                ),
                rotation_y=math.pi / 2.0,
                rotation_z_delta=math.radians(-12.0),
                rest_z=room.base_z,
            ),
        )
        assign(
            "BaggageLocker",
            2,
            PlacementOverride(
                offset=(-0.12, 0.18, 0.0),
                rotation_x=math.radians(64.0),
                rest_z=room.base_z,
            ),
        )
        for prop_type in CLASSROOM_DESKTOP_PROP_TYPES:
            for index in range(len(by_type.get(prop_type, ()))):
                assign(
                    prop_type,
                    index,
                    PlacementOverride(
                        offset=(
                            0.22 * ((index % 3) - 1),
                            0.18 * ((index % 4) - 1.5),
                            0.0,
                        ),
                        rotation_z_delta=math.radians(29 * (index + 1)),
                        rest_z=room.base_z + 0.01,
                    ),
                )
        return overrides

    if room.author_name == "F01_Infirmary":
        assign(
            "ClassroomDesk",
            0,
            PlacementOverride(
                offset=(-0.18, -0.12, 0.0),
                rotation_x=math.pi / 2.0,
                rotation_z_delta=math.radians(-18.0),
                rest_z=0.0,
            ),
        )
        assign(
            "ClassroomDesk",
            1,
            PlacementOverride(
                target_pivot=(-8.20, 8.35, 0.0),
                rotation_x=-math.pi / 2.0,
                rotation_z_delta=math.radians(32.0),
                rest_z=0.0,
            ),
        )
        assign("ClassroomChair", 0, PlacementOverride(offset=(-0.35, 0.28, 0.0), rotation_z_delta=math.radians(12.0)))
        assign("ClassroomChair", 1, PlacementOverride(offset=(0.25, -0.32, 0.0), rotation_z_delta=math.radians(-16.0)))
        assign("StaffChair", 0, PlacementOverride(target_pivot=(-11.78, 9.35, 0.0), rotation_z_delta=math.radians(8.0)))
    elif room.author_name == "F01_Library":
        for sequence, index in enumerate((7, 12, 19, 31, 38, 44)):
            assign(
                "Bookshelf",
                index,
                PlacementOverride(
                    rotation_x=math.pi / 2.0,
                    rotation_z_delta=math.radians((-8, 6, -5, 9, -7, 4)[sequence]),
                    rest_z=0.0,
                ),
            )
        for sequence, index in enumerate((0, 3, 5, 8, 10, 14)):
            assign("ClassroomChair", index, _fallen_chair_override(by_type["ClassroomChair"][index], sequence, outward_distance=0.48, lateral_distance=0.10, rotation_z_delta=math.radians(13 * sequence - 24), rest_z=0.0))
        for sequence, index in enumerate((1, 4, 7, 11, 13)):
            assign("ClassroomChair", index, PlacementOverride(offset=(0.18 * (-1 if sequence % 2 else 1), 0.14, 0.0), rotation_z_delta=math.radians((-15, 12, -18, 16, -11)[sequence])))
    elif room.author_name == "F01_StaffRoom":
        for sequence, index in enumerate((0, 3, 5, 8, 10, 13, 15)):
            assign("StaffChair", index, _fallen_chair_override(by_type["StaffChair"][index], sequence, outward_distance=0.38, lateral_distance=0.10, rotation_z_delta=math.radians(11 * sequence - 28), rest_z=0.0))
        for sequence, index in enumerate((1, 4, 7, 11, 14)):
            assign("StaffChair", index, PlacementOverride(offset=(0.30 * (-1 if sequence % 2 else 1), 0.22 * ((sequence % 3) - 1), 0.0), rotation_z_delta=math.radians((-18, 14, -12, 17, -15)[sequence])))
        for sequence, index in enumerate((0, 3, 6)):
            assign("PcMonitor", index, PlacementOverride(rotation_x=(math.pi / 2.0) * (-1 if sequence % 2 else 1), rotation_z_delta=math.radians((-12, 17, -9)[sequence]), rest_z=0.72))
        assign("PaperStack", 0, PlacementOverride(offset=(0.65, -0.45, 0.0), rotation_z_delta=math.radians(28.0), rest_z=0.01))
    elif room.author_name == "F01_PcRoom":
        for sequence, index in enumerate((0, 2, 5, 7, 9, 12, 15, 17)):
            assign("StaffChair", index, _fallen_chair_override(by_type["StaffChair"][index], sequence, outward_distance=0.38, lateral_distance=0.10, rotation_z_delta=math.radians(9 * sequence - 27), rest_z=0.0))
        for sequence, index in enumerate((1, 4, 6, 10, 13, 16)):
            assign("StaffChair", index, PlacementOverride(offset=(0.28 * (-1 if sequence % 2 else 1), 0.18 * ((sequence % 3) - 1), 0.0), rotation_z_delta=math.radians((-16, 13, -11, 17, -14, 10)[sequence])))
        for sequence, index in enumerate((2, 9, 14)):
            assign("PcTower", index, PlacementOverride(offset=(-0.42, 0.30 * (-1 if sequence % 2 else 1), 0.0), rotation_x=(math.pi / 2.0) * (-1 if sequence % 2 else 1), rotation_z_delta=math.radians(18 * sequence - 15), rest_z=0.0))
    elif room.author_name == "F02_Council":
        assign("LargeWoodTable", 0, PlacementOverride(rotation_z_delta=math.radians(-10.0)))
        for sequence, index in enumerate((0, 1, 2, 3, 4, 6)):
            assign("ClassroomChair", index, _fallen_chair_override(by_type["ClassroomChair"][index], sequence, outward_distance=0.48, lateral_distance=0.10, rotation_z_delta=math.radians((-10, 12, -8, 14, -11, 9)[sequence]), rest_z=3.6))
        assign("StaffChair", 0, _fallen_chair_override(by_type["StaffChair"][0], 0, outward_distance=0.38, lateral_distance=0.08, rotation_z_delta=math.radians(12.0), rest_z=3.6))
        assign("PaperStack", 0, PlacementOverride(offset=(-1.10, 0.42, 0.0), rotation_z_delta=math.radians(31.0), rest_z=3.61))
        for index in range(len(by_type.get("SinglePaper", ()))):
            assign("SinglePaper", index, PlacementOverride(offset=(-0.75 - 0.28 * index, (-0.30, 0.18)[index % 2], 0.0), rotation_z_delta=math.radians(37 * (index + 1)), rest_z=3.605))
    elif room.author_name == "F02_Broadcast":
        assign("StaffDesk", 1, PlacementOverride(rotation_z_delta=math.radians(-10.0)))
        assign("StaffChair", 0, _fallen_chair_override(by_type["StaffChair"][0], 0, outward_distance=0.38, lateral_distance=0.08, rotation_z_delta=math.radians(-14.0), rest_z=3.6))
        assign("StaffChair", 1, PlacementOverride(offset=(0.22, 0.20, 0.0), rotation_z_delta=math.radians(13.0)))
        assign("PcMonitor", 0, PlacementOverride(rotation_x=math.pi / 2.0, rotation_z_delta=math.radians(-10.0), rest_z=4.40))
    elif room.author_name == "F02_Science":
        for sequence, index in enumerate(range(18)):
            assign("ScienceStool", index, PlacementOverride(offset=(0.08 * (-1 if sequence % 2 else 1), 0.06, 0.0), rotation_x=(math.pi / 2.0) * (-1 if sequence % 2 else 1), rotation_z_delta=math.radians((sequence * 13) % 41 - 20), rest_z=3.6))
        for sequence, index in enumerate(range(18, 26)):
            assign("ScienceStool", index, PlacementOverride(offset=(0.18 * (-1 if sequence % 2 else 1), 0.12, 0.0), rotation_z_delta=math.radians((-15, 12, -10, 16, -13, 11, -17, 14)[sequence])))
        assign("Bookshelf", 1, PlacementOverride(rotation_x=math.pi / 2.0, rotation_z_delta=math.radians(5.0), rest_z=3.6))
    elif room.author_name == "F03_Art":
        for sequence, index in enumerate((0, 1, 2, 3, 4)):
            placement = by_type["Easel"][index]
            inward = (
                -math.sin(placement.rotation_z),
                math.cos(placement.rotation_z),
            )
            assign(
                "Easel",
                index,
                PlacementOverride(
                    offset=(inward[0] * 0.90, inward[1] * 0.90, 0.0),
                    rotation_x=math.pi / 2.0,
                    rotation_z_delta=math.radians(12 * sequence - 24),
                    rest_z=7.2,
                ),
            )
        for sequence, index in enumerate((5, 6)):
            assign("Easel", index, PlacementOverride(offset=(0.22 * (-1 if sequence % 2 else 1), 0.16, 0.0), rotation_z_delta=math.radians((-14, 17)[sequence])))
        fallen_chairs = (1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 16, 18, 21, 23)
        for sequence, index in enumerate(fallen_chairs):
            assign("ClassroomChair", index, _fallen_chair_override(by_type["ClassroomChair"][index], sequence, outward_distance=0.40, lateral_distance=0.10, rotation_z_delta=math.radians((sequence * 11) % 43 - 21), rest_z=7.2))
        for sequence, index in enumerate((4, 7, 10, 13, 17, 22)):
            assign("ClassroomChair", index, PlacementOverride(offset=(0.18 * (-1 if sequence % 2 else 1), 0.14, 0.0), rotation_z_delta=math.radians((-13, 16, -11, 14, -17, 12)[sequence])))
        assign("LargeWoodTable", 3, PlacementOverride(rotation_z_delta=math.radians(-10.0)))
        assign("Bookshelf", 1, PlacementOverride(rotation_x=math.pi / 2.0, rotation_z_delta=math.radians(5.0), rest_z=7.2))
    elif room.author_name == "F03_HomeEc":
        for sequence, index in enumerate(range(12)):
            assign("ClassroomChair", index, _fallen_chair_override(by_type["ClassroomChair"][index], sequence, outward_distance=0.48, lateral_distance=0.10, rotation_z_delta=math.radians((sequence * 13) % 45 - 22), rest_z=7.2))
        for sequence, index in enumerate(range(12, 20)):
            assign("ClassroomChair", index, PlacementOverride(offset=(0.18 * (-1 if sequence % 2 else 1), 0.12, 0.0), rotation_z_delta=math.radians((-14, 12, -10, 16, -13, 11, -15, 13)[sequence])))
        for sequence, index in enumerate((1, 8)):
            assign("SewingMachine", index, PlacementOverride(rotation_x=(math.pi / 2.0) * (-1 if sequence % 2 else 1), rotation_z_delta=math.radians((-12, 15)[sequence]), rest_z=8.0))
        for sequence, index in enumerate((4, 10)):
            assign("SewingMachine", index, PlacementOverride(offset=(0.16 * (-1 if sequence % 2 else 1), 0.08, 0.0), rotation_z_delta=math.radians((-10, 13)[sequence])))
    elif room.author_name == "F04_LL":
        for sequence, index in enumerate((2, 16)):
            assign(
                "ClassroomDesk",
                index,
                PlacementOverride(
                    offset=(0.32, (-0.14, 0.14)[sequence], 0.0),
                    rotation_x=math.pi / 2.0,
                    rotation_z_delta=math.radians((-14, 17)[sequence]),
                    rest_z=10.8,
                ),
            )
        for sequence, index in enumerate((5, 10, 18)):
            assign("ClassroomDesk", index, PlacementOverride(offset=(0.16 * (-1 if sequence % 2 else 1), 0.10, 0.0), rotation_z_delta=math.radians((-12, 15, -10)[sequence])))
        for sequence, index in enumerate((0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 19)):
            assign("ClassroomChair", index, _fallen_chair_override(by_type["ClassroomChair"][index], sequence, outward_distance=0.48, lateral_distance=0.10, rotation_z_delta=math.radians((sequence * 13) % 47 - 23), rest_z=10.8))
        for sequence, index in enumerate((1, 5, 9, 13, 17)):
            assign("ClassroomChair", index, PlacementOverride(offset=(0.18 * (-1 if sequence % 2 else 1), 0.12, 0.0), rotation_z_delta=math.radians((-14, 12, -10, 16, -13)[sequence])))
        assign("BaggageLocker", 1, PlacementOverride(rotation_x=math.pi / 2.0, rotation_z_delta=math.radians(4.0), rest_z=10.8))
    elif room.author_name == "F04_Music":
        for sequence, index in enumerate((0, 2, 5, 7, 10, 12, 15, 17, 20, 23, 26, 28)):
            assign("ClassroomChair", index, _fallen_chair_override(by_type["ClassroomChair"][index], sequence, outward_distance=0.36, lateral_distance=0.10, rotation_z_delta=math.radians((sequence * 11) % 45 - 22), rest_z=10.8))
        for sequence, index in enumerate((1, 4, 6, 9, 11, 14, 18, 21, 24, 27)):
            assign("ClassroomChair", index, PlacementOverride(offset=(0.18 * (-1 if sequence % 2 else 1), 0.12 * ((sequence % 3) - 1), 0.0), rotation_z_delta=math.radians((sequence * 13) % 39 - 19)))
        assign("ScienceStool", 0, PlacementOverride(offset=(0.22, -0.18, 0.0), rotation_z_delta=math.radians(12.0)))
    return overrides


def _variant_extra_props(
    room: RoomVariantSpec,
) -> tuple[tuple[str, tuple[float, float, float], float], ...]:
    if CLASSROOM_PATTERN_BY_AUTHOR.get(room.author_name) == "B":
        minimum_y = room.bounds_xy[2]
        return tuple(
            (
                ("SinglePaper", "ClosedBook", "PencilCase")[index % 3],
                (-10.9 + (index % 4) * 1.55, minimum_y + 2.3 + (index // 4) * 1.25, room.base_z + 0.01),
                math.radians(index * 23 - 41),
            )
            for index in range(9)
        )
    if CLASSROOM_PATTERN_BY_AUTHOR.get(room.author_name) == "C":
        minimum_y = room.bounds_xy[2]
        return tuple(
            (
                ("SinglePaper", "ClosedBook", "OpenBook", "PencilCase")[index % 4],
                (-11.2 + (index % 5) * 1.35, minimum_y + 2.0 + (index // 5) * 1.15, room.base_z + 0.01),
                math.radians(index * 19 - 52),
            )
            for index in range(14)
        )
    if room.author_name == "F01_Library":
        return tuple(
            (
                ("ClosedBook", "OpenBook")[index % 2],
                (-11.25 + (index % 4) * 1.95, 16.2 + (index // 4) * 3.0, 0.01),
                math.radians(index * 29 - 70),
            )
            for index in range(12)
        )
    if room.author_name == "F01_StaffRoom":
        return tuple(
            (
                "SinglePaper",
                (7.4 + (index % 6) * 1.8, 38.2 + (index // 6) * 2.4, room.base_z + 0.006),
                math.radians(index * 31 - 55),
            )
            for index in range(12)
        )
    if room.author_name == "F02_Council":
        paper_positions = (
            (8.0, 39.25),
            (9.1, 39.00),
            (10.2, 39.25),
            (11.2, 39.20),
            (8.4, 42.30),
            (9.7, 42.50),
            (11.0, 42.30),
        )
        return tuple(
            (
                "SinglePaper",
                (x, y, room.base_z + 0.006),
                math.radians(index * 31 - 55),
            )
            for index, (x, y) in enumerate(paper_positions)
        )
    return ()


def _create_disordered_infirmary_curtains(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    parent: bpy.types.Object,
) -> None:
    curtain_material = bpy.data.materials.get("MAT_B03_InfirmaryCurtain")
    if curtain_material is None:
        raise RuntimeError("保健室カーテンMaterialがありません")
    curtain_specs = {
        "North": ((-10.6875, 6.62, 0.0), 2.825, 0.0),
        "West": ((-12.10, 4.81, 0.0), 3.62, math.pi / 2.0),
        "Divider": ((-9.275, 4.81, 0.0), 3.62, math.pi / 2.0),
    }
    collider_boxes: list[
        tuple[tuple[float, float, float], tuple[float, float, float]]
    ] = []
    for panel_name, (position, length, rotation_z) in curtain_specs.items():
        panel = MeshBatch("FurnitureProps")
        panel.add_corrugated_curtain(
            (
                position[0],
                position[1],
                INFIRMARY_CURTAIN_CENTER_Z,
            ),
            length,
            INFIRMARY_CURTAIN_HEIGHT,
            INFIRMARY_CURTAIN_FOLD_DEPTH,
            infirmary_curtain_segment_count(length),
            "fabric_ivory",
            rotation_z,
        )
        obj = panel.create(
            f"VIS_RoomVariant_F01_Infirmary_Disordered_Curtain_{panel_name}",
            visual_collection,
            curtain_material,
        )
        if obj is None:
            raise RuntimeError(f"保健室荒れ版{panel_name}カーテンが空です")
        obj.parent = parent
        half_length = length / 2.0
        half_depth = INFIRMARY_CURTAIN_FOLD_DEPTH
        if abs(rotation_z) < 1.0e-6:
            minimum = (
                position[0] - half_length,
                position[1] - half_depth,
                0.45,
            )
            maximum = (
                position[0] + half_length,
                position[1] + half_depth,
                3.0,
            )
        else:
            minimum = (
                position[0] - half_depth,
                position[1] - half_length,
                0.45,
            )
            maximum = (
                position[0] + half_depth,
                position[1] + half_length,
                3.0,
            )
        collider_boxes.append((minimum, maximum))

    gathered = MeshBatch("FurnitureProps")
    gathered_segments = (
        ((-6.45, 3.15, INFIRMARY_CURTAIN_CENTER_Z), 0.82, math.pi / 2.0),
        ((-6.82, 2.82, INFIRMARY_CURTAIN_CENTER_Z), 0.74, 0.0),
    )
    for center, length, rotation_z in gathered_segments:
        gathered.add_corrugated_curtain(
            center,
            length,
            INFIRMARY_CURTAIN_HEIGHT,
            0.12,
            4,
            "fabric_ivory",
            rotation_z,
        )
        if abs(rotation_z) < 1.0e-6:
            collider_boxes.append(
                (
                    (center[0] - length / 2.0, center[1] - 0.12, 0.45),
                    (center[0] + length / 2.0, center[1] + 0.12, 3.0),
                )
            )
        else:
            collider_boxes.append(
                (
                    (center[0] - 0.12, center[1] - length / 2.0, 0.45),
                    (center[0] + 0.12, center[1] + length / 2.0, 3.0),
                )
            )
    gathered_obj = gathered.create(
        "VIS_RoomVariant_F01_Infirmary_Disordered_Curtain_East",
        visual_collection,
        curtain_material,
    )
    if gathered_obj is None:
        raise RuntimeError("保健室荒れ版の集約カーテンが空です")
    gathered_obj.parent = parent
    _create_box_object(
        INFIRMARY_DISORDERED_CURTAIN_BEAM_SIGHT_COLLIDER_NAME,
        tuple(collider_boxes),
        collider_collection,
        parent=parent,
    )


def _build_room_variants(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    nav_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    furniture_material: bpy.types.Material,
) -> dict[str, int]:
    marker_count = 0
    volume_count = 0
    unchanged_count = 0
    chair_pose_counts = {
        "backrest_down": 0,
        "side": 0,
        "inverted": 0,
    }
    signs_material = bpy.data.materials.get("MAT_B03_Atlas_SignsPaper")
    if signs_material is None:
        raise RuntimeError("SignsPaper atlas Materialがありません")
    sources = import_prop_sources(VARIANT_SOURCE_TYPES)
    normal_rooms, _classroom_metrics, _signage_result = build_school_rooms(
        sources
    )
    normal_rooms_by_name = {room.name: room for room in normal_rooms}
    for room in ROOM_VARIANT_SPECS:
        token = _token(room.author_name)
        normal_room = normal_rooms_by_name.get(room.author_name)
        if normal_room is None:
            raise RuntimeError(
                f"荒れ版の通常配置記録がありません: {room.author_name}"
            )
        normal_marker = _create_empty(
            f"MRK_RoomVariant_{token}_Normal",
            semantic_collection,
            properties={
                "hs_id": f"room-variant-{room.room_id}-normal",
                "hs_role": "room_variant",
                "hs_room_id": room.room_id,
                "hs_variant_id": "normal",
            },
        )
        disordered_marker = _create_empty(
            f"MRK_RoomVariant_{token}_Disordered",
            semantic_collection,
            properties={
                "hs_id": f"room-variant-{room.room_id}-disordered",
                "hs_role": "room_variant",
                "hs_room_id": room.room_id,
                "hs_variant_id": "disordered",
            },
        )
        marker_count += 2

        normal_visuals = tuple(
            obj
            for suffix in ("FurnitureProps", "SignsPaper")
            if (
                obj := bpy.data.objects.get(
                    f"VIS_B03_Interior_{room.author_name}_{suffix}"
                )
            )
            is not None
        ) + tuple(
            sorted(
                (
                    obj
                    for obj in bpy.data.objects
                    if obj.type == "MESH"
                    and obj.name.startswith(
                        f"VIS_B03_Interior_{room.author_name}_Curtain_"
                    )
                ),
                key=lambda obj: obj.name,
            )
        )
        if not normal_visuals:
            raise RuntimeError(f"部屋variantの表示がありません: {room.author_name}")

        normal_collider = bpy.data.objects.get(
            f"COL_B03_Interior_{room.author_name}"
        )
        if normal_collider is None or normal_collider.type != "MESH":
            raise RuntimeError(f"部屋variantのColliderがありません: {room.author_name}")
        normal_collider.parent = normal_marker
        if room.author_name == "F01_Infirmary":
            normal_beam_sight_collider = bpy.data.objects.get(
                INFIRMARY_CURTAIN_BEAM_SIGHT_COLLIDER_NAME
            )
            if (
                normal_beam_sight_collider is None
                or normal_beam_sight_collider.type != "MESH"
            ):
                raise RuntimeError("保健室カーテンのビーム・視線遮蔽Meshがありません")
            normal_beam_sight_collider.parent = normal_marker
        _create_variant_nav_from_collider(
            normal_collider,
            f"NAV_RoomVariant_{token}_Normal_Blocker",
            nav_collection,
            normal_marker,
        )
        for source in normal_visuals:
            source.parent = normal_marker

        if room.room_id in UNCHANGED_DISORDERED_ROOM_IDS:
            for source in normal_visuals:
                target_name = source.name.replace(
                    f"VIS_B03_Interior_{room.author_name}",
                    f"VIS_RoomVariant_{token}_Disordered",
                )
                _copy_mesh_object(
                    source,
                    target_name,
                    visual_collection,
                    disordered_marker,
                )
            disordered_collider = _copy_mesh_object(
                normal_collider,
                f"COL_RoomVariant_{token}_Disordered",
                collider_collection,
                disordered_marker,
            )
            _create_variant_nav_from_collider(
                disordered_collider,
                f"NAV_RoomVariant_{token}_Disordered_Blocker",
                nav_collection,
                disordered_marker,
            )
            unchanged_count += 1
        else:
            overrides = _room_overrides(room, normal_room)
            if room.author_name == "F01_PcRoom":
                moved_desktop_props = tuple(
                    key
                    for key in overrides
                    if key[0] in {"PcMonitor", "KeyboardMouse"}
                )
                if moved_desktop_props:
                    raise RuntimeError(
                        "PC室のモニターまたはキーボード・マウスが"
                        "机上の通常配置から移動しています: "
                        f"{moved_desktop_props}"
                    )
            overrides = _resolve_disordered_furniture_overrides(
                room,
                normal_room,
                sources,
                overrides,
            )
            for (prop_type, _occurrence), override in overrides.items():
                if prop_type not in {"ClassroomChair", "StaffChair"}:
                    continue
                if math.isclose(
                    override.rotation_x,
                    -math.pi / 2.0,
                    abs_tol=1.0e-6,
                ):
                    chair_pose_counts["backrest_down"] += 1
                elif math.isclose(
                    abs(override.rotation_y),
                    math.pi / 2.0,
                    abs_tol=1.0e-6,
                ):
                    chair_pose_counts["side"] += 1
                elif math.isclose(
                    abs(override.rotation_x),
                    math.pi,
                    abs_tol=1.0e-6,
                ):
                    chair_pose_counts["inverted"] += 1
            disordered_furniture = MeshBatch("FurnitureProps")
            disordered_signs = MeshBatch("SignsPaper")
            disordered_collider_boxes: list[
                tuple[
                    tuple[float, float, float],
                    tuple[float, float, float],
                ]
            ] = []
            disordered_nav_collider_boxes: list[
                tuple[
                    tuple[float, float, float],
                    tuple[float, float, float],
                ]
            ] = []
            placement_geometries: list[TransformedPlacementGeometry] = []
            room_center_collider_obstacles: list[
                tuple[
                    tuple[str, int],
                    tuple[
                        tuple[float, float, float],
                        tuple[float, float, float],
                    ],
                ]
            ] = []
            barricade_keys = _pattern_c_barricade_keys(room)
            occurrence_counts: dict[str, int] = {}
            for placement in normal_room.placements:
                if placement.kind == "curtain":
                    continue
                occurrence = occurrence_counts.get(placement.prop_type, 0)
                occurrence_counts[placement.prop_type] = occurrence + 1
                override = overrides.get(
                    (placement.prop_type, occurrence),
                    PlacementOverride(),
                )
                replayed = _replay_local_placement(placement, sources)
                transform = _placement_transform(
                    placement,
                    replayed,
                    override,
                )
                key = (placement.prop_type, occurrence)
                if placement.prop_type in FLOOR_FURNITURE_TYPES:
                    placement_geometries.append(
                        _transformed_placement_geometry(
                            key,
                            key in overrides,
                            replayed,
                            transform,
                        )
                    )
                disordered_furniture.add_batch(
                    replayed.furniture,
                    transform,
                )
                disordered_signs.add_batch(
                    replayed.signs,
                    transform,
                )
                transformed_collider_boxes = tuple(
                    _transformed_box_bounds(box, transform)
                    for box in replayed.collider_boxes
                )
                disordered_collider_boxes.extend(transformed_collider_boxes)
                if (
                    CLASSROOM_PATTERN_BY_AUTHOR.get(room.author_name) != "C"
                    and key not in barricade_keys
                ):
                    disordered_nav_collider_boxes.extend(
                        transformed_collider_boxes
                    )
                if CLASSROOM_PATTERN_BY_AUTHOR.get(room.author_name) == "C":
                    room_center_x = (room.bounds_xy[0] + room.bounds_xy[1]) / 2.0
                    room_center_y = (room.bounds_xy[2] + room.bounds_xy[3]) / 2.0
                    room_center_collider_obstacles.extend(
                        (key, bounds)
                        for bounds in transformed_collider_boxes
                        if bounds[0][0] <= room_center_x <= bounds[1][0]
                        and bounds[0][1] <= room_center_y <= bounds[1][1]
                    )

            if room_center_collider_obstacles:
                raise RuntimeError(
                    f"{room.room_id}: 後扉から到達する室内中央に"
                    "家具Colliderがあります: "
                    f"{room_center_collider_obstacles}"
                )

            _assert_disordered_furniture_clearance(
                room,
                tuple(placement_geometries),
            )
            _assert_pattern_c_barricade_at_front_door(
                room,
                tuple(placement_geometries),
            )

            for prop_type, position, rotation_z in _variant_extra_props(room):
                source = sources[prop_type]
                transform = (
                    Matrix.Translation(Vector(position))
                    @ Matrix.Rotation(rotation_z, 4, "Z")
                )
                if prop_type in PAPER_SWATCHES:
                    disordered_signs.add_source_matrix(
                        source,
                        transform,
                        PAPER_SWATCHES[prop_type],
                    )
                else:
                    disordered_furniture.add_source_matrix(
                        source,
                        transform,
                    )

            furniture_obj = disordered_furniture.create(
                f"VIS_RoomVariant_{token}_Disordered_FurnitureProps",
                visual_collection,
                furniture_material,
            )
            if furniture_obj is None:
                raise RuntimeError(
                    f"{room.room_id}: 荒れ版FurniturePropsが空です"
                )
            furniture_obj.parent = disordered_marker
            if disordered_signs.faces:
                signs_obj = disordered_signs.create(
                    f"VIS_RoomVariant_{token}_Disordered_SignsPaper",
                    visual_collection,
                    signs_material,
                )
                if signs_obj is None:
                    raise RuntimeError(
                        f"{room.room_id}: 荒れ版SignsPaperが空です"
                    )
                signs_obj.parent = disordered_marker

            if not disordered_collider_boxes:
                raise RuntimeError(
                    f"{room.room_id}: 荒れ版Collider箱がありません"
                )
            disordered_collider = _create_box_object(
                f"COL_RoomVariant_{token}_Disordered",
                tuple(disordered_collider_boxes),
                collider_collection,
                parent=disordered_marker,
            )
            disordered_nav_name = (
                f"NAV_RoomVariant_{token}_Disordered_Blocker"
            )
            if CLASSROOM_PATTERN_BY_AUTHOR.get(room.author_name) == "C":
                _minimum_x, maximum_x, _minimum_y, _maximum_y = room.bounds_xy
                front_door_minimum_y, front_door_maximum_y = room.openings[1]
                disordered_nav_collider_boxes.append(
                    (
                        (
                            maximum_x - 0.95,
                            front_door_minimum_y - 0.20,
                            room.base_z,
                        ),
                        (
                            maximum_x - 0.15,
                            front_door_maximum_y + 0.20,
                            room.base_z + 2.40,
                        ),
                    )
                )
                _create_variant_nav_from_boxes(
                    tuple(disordered_nav_collider_boxes),
                    disordered_nav_name,
                    nav_collection,
                    disordered_marker,
                )
            else:
                _create_variant_nav_from_collider(
                    disordered_collider,
                    disordered_nav_name,
                    nav_collection,
                    disordered_marker,
                )
            if room.author_name == "F01_Infirmary":
                _create_disordered_infirmary_curtains(
                    visual_collection,
                    collider_collection,
                    disordered_marker,
                )

        owner_minimum_x, owner_maximum_x, owner_minimum_y, owner_maximum_y = (
            _tile_aligned_room_bounds(room.bounds_xy)
        )
        _create_box_object(
            f"VOL_RoomVariantTile_{token}",
            (
                (
                    (
                        owner_minimum_x,
                        owner_minimum_y,
                        room.base_z - 0.40,
                    ),
                    (
                        owner_maximum_x,
                        owner_maximum_y,
                        room.base_z + 3.20,
                    ),
                ),
            ),
            semantic_collection,
            properties={
                "hs_id": f"room-variant-tile-{room.room_id}",
                "hs_role": "room_variant_tile",
                "hs_room_id": room.room_id,
            },
        )
        volume_count += 1

    remove_imported_sources(sources)

    if marker_count != 40 or volume_count != 20:
        raise RuntimeError(
            "部屋variant件数が不正です: "
            f"markers={marker_count}, volumes={volume_count}"
        )
    if tuple(room.room_id for room in ROOM_VARIANT_SPECS) != ROOM_VARIANT_IDS:
        raise RuntimeError("固定room ID順がRoomVariantSpecと一致しません")
    if not (
        chair_pose_counts["backrest_down"]
        > chair_pose_counts["side"]
        > 0
        and chair_pose_counts["inverted"] == 0
    ):
        raise RuntimeError(
            "倒れた椅子の姿勢分布が不正です: "
            f"{chair_pose_counts}"
        )
    return {
        "rooms": len(ROOM_VARIANT_SPECS),
        "markers": marker_count,
        "tile_volumes": volume_count,
        "unchanged_disordered_rooms": unchanged_count,
        "fallen_chairs_backrest_down": chair_pose_counts["backrest_down"],
        "fallen_chairs_side": chair_pose_counts["side"],
        "fallen_chairs_seat_up": chair_pose_counts["inverted"],
    }


def build_school_interactive_assets(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    nav_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    door_material: bpy.types.Material,
    architecture_material: bpy.types.Material,
    furniture_material: bpy.types.Material,
) -> dict[str, object]:
    room_doors = _build_room_doors(
        visual_collection,
        collider_collection,
        semantic_collection,
        door_material,
        furniture_material,
    )
    rooftop_changing_doors = _build_rooftop_changing_doors(
        visual_collection,
        collider_collection,
        semantic_collection,
        door_material,
        furniture_material,
    )
    toilet_doors = _build_toilet_stall_doors(
        visual_collection,
        collider_collection,
        semantic_collection,
        door_material,
        furniture_material,
    )
    elevator = _build_elevator(
        visual_collection,
        collider_collection,
        semantic_collection,
        door_material,
        architecture_material,
    )
    variants = _build_room_variants(
        visual_collection,
        collider_collection,
        nav_collection,
        semantic_collection,
        furniture_material,
    )
    return {
        "room_doors": room_doors,
        "rooftop_changing_doors": rooftop_changing_doors,
        "toilet_stall_doors": toilet_doors,
        "elevator": elevator,
        "room_variants": variants,
    }
