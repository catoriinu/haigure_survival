from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from audit_b03_school_protected_contract import protected_snapshot
from audit_b03_school_architecture import (
    audit_storey_band_relationships,
    mesh_component_world_bounds,
    shared_wall_volume_owners,
)
from audit_b03_school_refactor import read_glb_json


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
NAVMESH_PATH = (
    REPOSITORY_ROOT
    / "public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin"
)
ROOM_VARIANT_NAVMESH_PATH = (
    REPOSITORY_ROOT
    / "public/stage-assets/v2/B02/b02_school_blockout.room-variants.navmesh.bin"
)
BIT_NAVMESH_PATH = (
    REPOSITORY_ROOT
    / "public/stage-assets/v2/B02/b02_school_blockout.bit-flight.navmesh.bin"
)
BASELINE_PATH = (
    REPOSITORY_ROOT
    / "docs/plans/v2/B06-1/before_protected_baseline.json"
)

GENERATOR_VERSION_PROPERTY = "b03_architecture_generator_version"
EXPECTED_GENERATOR_VERSION = "b06-1-school-structure-polish-v38"
TOLERANCE = 1.0e-5
BAND_LENGTH_TOLERANCE = 1.0e-4
MAX_GLB_BYTES = 25_000_000
MAX_GLB_NODES = 1_907
MAX_GLB_MESHES = 1_461
MAX_GLB_PRIMITIVES = 1_461
MAX_GLB_VERTICES = 900_000
MAX_GLB_INDICES = 1_350_000
MAX_GLB_TRIANGLES = 450_000
MAX_VISUAL_TRIANGLES = 350_000
MAX_COLLIDER_TRIANGLES = 45_000

# 実装完了時に、変更前snapshotとの差分からB06-1所有Objectだけを固定する。
EXPECTED_CHANGED_OBJECTS: frozenset[str] = frozenset(
    {
        "COL_B03_ElevatorShaftShell",
        "COL_B03_ExteriorWalls_F01",
        "COL_B03_ExteriorWalls_F02",
        "COL_B03_ExteriorWalls_F03",
        "COL_B03_ExteriorWalls_F04",
        "COL_B03_GymExteriorWalls",
        "COL_B03_GymRoofEscapeCrateRamp",
        "COL_B03_Interior_RoofChanging",
        "COL_B03_InteriorWalls_F02",
        "COL_B03_InteriorWalls_F03",
        "COL_B03_InteriorWalls_F04",
        "COL_B03_Interior_Walls_F01_Toilets",
        "COL_B03_Interior_Walls_F02_Toilets",
        "COL_B03_Interior_Walls_F03_Toilets",
        "COL_B03_Interior_Walls_F04_Toilets",
        "COL_B03_SchoolRoofEscapeCrateRamp",
        "COL_B03_StairBoundaryCaps_F01",
        "COL_Roof_North",
        "COL_Roof_West",
        "COL_RoofGuard_WestOuter",
        "COL_RooftopFacilityShell",
        "COL_StairGuardSystem_NE_2FTo3F",
        "COL_StairGuardSystem_NE_3FTo4F",
        "COL_StairGuardSystem_NW_2FTo3F",
        "COL_StairGuardSystem_NW_3FTo4F",
        "COL_StairGuardSystem_NW_4FToRooftop",
        "COL_StairGuardSystem_SW_2FTo3F",
        "COL_StairGuardSystem_SW_3FTo4F",
        "COL_StairGuard_NE_Landing",
        "COL_StairGuard_NE_Upper",
        "COL_StairGuard_NW_Landing",
        "COL_StairGuard_NW_Upper",
        "COL_StairGuard_SW_Landing",
        "COL_StairGuard_SW_Upper",
        "COL_StairRampUpper_NE",
        "COL_StairRampUpper_NW",
        "COL_StairRampUpper_SW",
        "COL_StairSystem_NE_2FTo3F",
        "COL_StairSystem_NE_3FTo4F",
        "COL_StairSystem_NW_2FTo3F",
        "COL_StairSystem_NW_3FTo4F",
        "COL_StairSystem_NW_4FToRooftop",
        "COL_StairSystem_SW_2FTo3F",
        "COL_StairSystem_SW_3FTo4F",
        "COL_Wall_Classroom1_Corridor_1",
        "COL_Wall_Classroom1_Corridor_2",
        "COL_Wall_Classroom1_Corridor_3",
        "COL_Wall_Classroom2_Corridor_1",
        "COL_Wall_Classroom2_Corridor_2",
        "COL_Wall_Classroom2_Corridor_3",
        "COL_Wall_Classroom3_Corridor_1",
        "COL_Wall_Classroom3_Corridor_2",
        "COL_Wall_Classroom3_Corridor_3",
        "COL_Wall_Classroom3_North",
        "COL_Wall_ClassroomCross_1",
        "COL_Wall_ClassroomCross_2",
        "COL_Wall_Lintel_ClassroomDoor_01",
        "COL_Wall_Lintel_ClassroomDoor_02",
        "COL_Wall_Lintel_SpecialDoor_01",
        "COL_Wall_Lintel_SpecialDoor_02",
        "COL_Wall_Lintel_SpecialDoor_03",
        "COL_Wall_Lintel_SpecialDoor_04",
        "COL_Wall_Lintel_SpecialRoomWest_Front",
        "COL_Wall_Lintel_SpecialRoomWest_Rear",
        "COL_Wall_NorthEntry_Special1",
        "COL_Wall_SpecialRoomWest_CorridorClosed_North",
        "COL_Wall_SpecialRoomWest_CorridorClosed_South",
        "COL_Wall_Special_Divider",
        "COL_Wall_Special_S1A",
        "COL_Wall_Special_S1B",
        "COL_Wall_Special_S1C",
        "COL_Wall_Special_S2A",
        "COL_Wall_Special_S2B",
        "COL_Wall_Special_S2C",
        "COL_Wall_StairNE_West",
        "COL_Wall_Toilet_Divider",
        "COL_Wall_Toilet_East",
        "COL_Wall_Toilet_West",
        "NAV_B03_Walkable_GymRooftop",
        "NAV_BitFlight_Obstacle_school_exterior_outdoor_f1",
        "NAV_BitFlight_Obstacle_school_exterior_outdoor_f2",
        "NAV_BitFlight_Obstacle_school_exterior_outdoor_f3",
        "NAV_BitFlight_Obstacle_school_exterior_outdoor_f4",
        "NAV_BitFlight_Obstacle_school_gym_gym_low",
        "NAV_BitFlight_Obstacle_school_gym_gym_upper",
        "NAV_BitFlight_Obstacle_school_interior_interior_f1",
        "NAV_BitFlight_Obstacle_school_interior_interior_f2",
        "NAV_BitFlight_Obstacle_school_interior_interior_f3",
        "NAV_BitFlight_Obstacle_school_interior_interior_f4",
        "NAV_BitFlight_Obstacle_school_rooftop_roof_flight",
        "NAV_BitFlight_Rooftop",
        "NAV_Blocker_Interiors",
        "NAV_Blocker_SchoolUpper",
        "NAV_Blocker_StairClosed",
        "NAV_Walkable_Rooftop",
        "NAV_Walkable_StairsNWUpper",
        "VOL_LocationArea_AREA_CHANGING_ROOM_P01",
    }
)
ELEVATOR_PANEL_TOKENS = (
    "ElevatorCar_School_LeftInner",
    "ElevatorCar_School_LeftOuter",
    "ElevatorCar_School_RightInner",
    "ElevatorCar_School_RightOuter",
    "ElevatorLanding_F01_LeftInner",
    "ElevatorLanding_F01_LeftOuter",
    "ElevatorLanding_F01_RightInner",
    "ElevatorLanding_F01_RightOuter",
    "ElevatorLanding_F04_LeftInner",
    "ElevatorLanding_F04_LeftOuter",
    "ElevatorLanding_F04_RightInner",
    "ElevatorLanding_F04_RightOuter",
)
EXPECTED_FIFTH_REWORK_CHANGED_OBJECTS: frozenset[str] = frozenset(
    {
        "COL_B03_ElevatorClosedDoor_F02_F03",
        "COL_ElevatorCar_School",
        "COL_ElevatorThresholdPlate_F01",
        "COL_ElevatorThresholdPlate_F04",
        "COL_HumanOnly_ElevatorGate_F01",
        "COL_HumanOnly_ElevatorGate_F04",
        "LNK_school-elevator-f01-f04_A",
        "LNK_school-elevator-f01-f04_B",
        "MRK_Door_ElevatorCar_School",
        "MRK_Door_ElevatorLanding_F01",
        "MRK_Door_ElevatorLanding_F04",
        "MRK_ElevatorCallIndicator_F01",
        "MRK_ElevatorCallIndicator_F04",
        "MRK_ElevatorCar_School",
        "MRK_ElevatorHumanGate_F01",
        "MRK_ElevatorHumanGate_F04",
        "MRK_ElevatorPassengerOrigin_School",
        "MRK_ElevatorStop_F01",
        "MRK_ElevatorStop_F04",
        "MRK_ElevatorWait_F01",
        "MRK_ElevatorWait_F04",
        "MRK_MapElevatorLanding_F01",
        "MRK_MapElevatorLanding_F02",
        "MRK_MapElevatorLanding_F03",
        "MRK_MapElevatorLanding_F04",
        "VOL_DoorSweep_ElevatorCar_School",
        "VOL_DoorSweep_ElevatorLanding_F01",
        "VOL_DoorSweep_ElevatorLanding_F04",
        "VOL_ElevatorCallMat_F01",
        "VOL_ElevatorCallMat_F04",
        "VOL_ElevatorCarOccupancy_School",
        "VOL_ElevatorThreshold_F01",
        "VOL_ElevatorThreshold_F04",
        "VOL_LocationArea_AREA_ELEVATOR_P01",
        "VOL_LocationArea_AREA_STAIR_NE_F01_F02_P02",
        "VOL_LocationArea_AREA_STAIR_NE_F02_F03_P02",
        "VOL_LocationArea_AREA_STAIR_NW_F01_F02_P02",
        "VOL_LocationArea_AREA_STAIR_NW_F02_F03_P02",
        "VOL_LocationArea_AREA_STAIR_NW_F03_F04_P02",
        "VOL_LocationArea_AREA_STAIR_SW_F01_F02_P02",
        "VOL_LocationArea_AREA_STAIR_SW_F02_F03_P02",
    }
    | {
        f"{prefix}_{token}"
        for prefix in (
            "COL_DoorPanel",
            "MRK_DoorOpenPose",
            "MRK_DoorPanel",
        )
        for token in ELEVATOR_PANEL_TOKENS
    }
)
# 左内側の3 markerは中央揃え後も変更前snapshotと同一座標であり、
# 実差分には含まれない。他のpanel collider／pose／markerは変更を必須とする。
EXPECTED_FIFTH_REWORK_CHANGED_OBJECTS -= frozenset(
    {
        "MRK_DoorPanel_ElevatorCar_School_LeftInner",
        "MRK_DoorPanel_ElevatorLanding_F01_LeftInner",
        "MRK_DoorPanel_ElevatorLanding_F04_LeftInner",
    }
)
EXPECTED_NINTH_REWORK_CHANGED_OBJECTS: frozenset[str] = frozenset(
    {
        "COL_B03_Ceiling_F02",
        "COL_B03_Ceiling_F03",
        "COL_B03_Ceiling_F04",
        "COL_B03_Floor_F02",
        "COL_B03_Floor_F03",
        "COL_B03_Floor_F04",
        "COL_B03_GymStageSideWalls",
        "COL_B03_GymStorageNorthWall",
        "COL_B03_InterfloorStructure_F01_West",
        "COL_B03_WestExtensionFloor_F01",
        "NAV_BitFlight_InteriorF2",
        "NAV_BitFlight_InteriorF3",
        "NAV_BitFlight_InteriorF4",
        "NAV_Walkable_Interior1F",
        "NAV_Walkable_Interior2F",
        "NAV_Walkable_Interior3F",
        "NAV_Walkable_Interior4F",
    }
)
EXPECTED_MISSING_OBJECTS: frozenset[str] = frozenset(
    {
        "COL_B03_ElevatorStairWall",
        "COL_RooftopStairExitRamp",
    }
)
EXPECTED_NEW_OBJECTS: frozenset[str] = frozenset(
    {
        "COL_B06_GymBridgeSideInfill",
    }
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def world_bounds(
    obj: bpy.types.Object,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        tuple(min(point[axis] for point in points) for axis in range(3)),
        tuple(max(point[axis] for point in points) for axis in range(3)),
    )


def close_tuple(
    actual: tuple[float, ...], expected: tuple[float, ...]
) -> bool:
    return len(actual) == len(expected) and all(
        math.isclose(left, right, abs_tol=TOLERANCE)
        for left, right in zip(actual, expected, strict=True)
    )


def polygon_world_key(
    obj: bpy.types.Object, polygon: bpy.types.MeshPolygon
) -> tuple[tuple[float, float, float], ...]:
    return tuple(
        sorted(
            tuple(
                round(coordinate, 5)
                for coordinate in (
                    obj.matrix_world @ obj.data.vertices[index].co
                )
            )
            for index in polygon.vertices
        )
    )


def polygon_world_bounds(
    obj: bpy.types.Object, polygon: bpy.types.MeshPolygon
) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ obj.data.vertices[index].co for index in polygon.vertices]
    return (
        Vector(tuple(min(point[axis] for point in points) for axis in range(3))),
        Vector(tuple(max(point[axis] for point in points) for axis in range(3))),
    )


def require_unique_polygon_surfaces(
    object_names: tuple[str, ...], label: str
) -> None:
    owners: dict[
        tuple[tuple[float, float, float], ...], list[str]
    ] = {}
    for object_name in object_names:
        obj = bpy.data.objects.get(object_name)
        require(obj is not None and obj.type == "MESH", f"{label}がありません: {object_name}")
        for polygon in obj.data.polygons:
            owners.setdefault(polygon_world_key(obj, polygon), []).append(object_name)
    duplicates = {
        key: names for key, names in owners.items() if len(names) > 1
    }
    require(not duplicates, f"{label}に重複面があります: {duplicates}")


def require_no_axis_aligned_coplanar_area(
    object_names: tuple[str, ...],
    label: str,
    *,
    include_same_object: bool = False,
) -> None:
    faces: list[
        tuple[
            str,
            int,
            int,
            float,
            tuple[float, float],
            tuple[float, float],
        ]
    ] = []
    for object_name in object_names:
        obj = bpy.data.objects.get(object_name)
        require(obj is not None and obj.type == "MESH", f"{label}がありません: {object_name}")
        for polygon in obj.data.polygons:
            minimum, maximum = polygon_world_bounds(obj, polygon)
            extents = tuple(maximum[axis] - minimum[axis] for axis in range(3))
            plane_axes = [axis for axis, extent in enumerate(extents) if extent <= TOLERANCE]
            if len(plane_axes) != 1:
                continue
            plane_axis = plane_axes[0]
            span_axes = tuple(axis for axis in range(3) if axis != plane_axis)
            if any(extents[axis] <= TOLERANCE for axis in span_axes):
                continue
            faces.append(
                (
                    object_name,
                    polygon.index,
                    plane_axis,
                    (minimum[plane_axis] + maximum[plane_axis]) / 2.0,
                    (minimum[span_axes[0]], maximum[span_axes[0]]),
                    (minimum[span_axes[1]], maximum[span_axes[1]]),
                )
            )
    overlaps = []
    for first_index, first in enumerate(faces):
        for second in faces[first_index + 1 :]:
            if (
                first[2] != second[2]
                or (first[0] == second[0] and not include_same_object)
            ):
                continue
            if not math.isclose(first[3], second[3], abs_tol=TOLERANCE):
                continue
            first_overlap = min(first[4][1], second[4][1]) - max(first[4][0], second[4][0])
            second_overlap = min(first[5][1], second[5][1]) - max(first[5][0], second[5][0])
            if first_overlap > TOLERANCE and second_overlap > TOLERANCE:
                overlaps.append(
                    (
                        f"{first[0]}[{first[1]}]",
                        f"{second[0]}[{second[1]}]",
                        first[2],
                        round(first[3], 5),
                        round(first_overlap * second_overlap, 6),
                    )
                )
    require(
        not overlaps,
        f"{label}に同一Object内または別Object間の同一平面重複があります: "
        f"{overlaps[:40]}",
    )


def xz_polygon_area(points: list[tuple[float, float]]) -> float:
    return abs(
        sum(
            x * points[(index + 1) % len(points)][1]
            - points[(index + 1) % len(points)][0] * z
            for index, (x, z) in enumerate(points)
        )
    ) / 2.0


def clip_xz_polygon_halfspace(
    points: list[tuple[float, float]],
    axis: int,
    boundary: float,
    *,
    keep_lower: bool,
) -> list[tuple[float, float]]:
    clipped: list[tuple[float, float]] = []
    for start, end in zip(points, points[1:] + points[:1], strict=True):
        start_distance = start[axis] - boundary
        end_distance = end[axis] - boundary
        start_inside = start_distance <= TOLERANCE if keep_lower else start_distance >= -TOLERANCE
        end_inside = end_distance <= TOLERANCE if keep_lower else end_distance >= -TOLERANCE
        if start_inside:
            clipped.append(start)
        if start_inside != end_inside:
            ratio = start_distance / (start_distance - end_distance)
            clipped.append(
                (
                    start[0] + (end[0] - start[0]) * ratio,
                    start[1] + (end[1] - start[1]) * ratio,
                )
            )
    cleaned: list[tuple[float, float]] = []
    for point in clipped:
        if not cleaned or any(
            abs(left - right) > TOLERANCE
            for left, right in zip(point, cleaned[-1], strict=True)
        ):
            cleaned.append(point)
    if len(cleaned) >= 2 and all(
        abs(left - right) <= TOLERANCE
        for left, right in zip(cleaned[0], cleaned[-1], strict=True)
    ):
        cleaned.pop()
    return cleaned


def xz_polygon_rectangle_overlap_area(
    points: list[tuple[float, float]],
    rectangle: tuple[float, float, float, float],
) -> float:
    x_minimum, x_maximum, z_minimum, z_maximum = rectangle
    clipped = points
    for axis, boundary, keep_lower in (
        (0, x_minimum, False),
        (0, x_maximum, True),
        (1, z_minimum, False),
        (1, z_maximum, True),
    ):
        clipped = clip_xz_polygon_halfspace(
            clipped,
            axis,
            boundary,
            keep_lower=keep_lower,
        )
        if len(clipped) < 3:
            return 0.0
    return xz_polygon_area(clipped)


def audit_elevator_shaft_north_wall_single_owner() -> int:
    shaft = bpy.data.objects.get("VIS_B03_ElevatorShaftShell")
    require(
        shaft is not None and shaft.type == "MESH",
        "エレベーターシャフト表示Meshがありません",
    )
    expected_owner_bounds = (
        (-12.45, -6.0, 0.04, 3.45),
        (-12.45, -6.0, 3.6, 7.05),
        (-12.45, -6.0, 7.2, 10.65),
        (-12.45, -6.0, 10.8, 14.4),
    )
    owner_surfaces: list[
        tuple[
            tuple[float, float, float, float],
            int,
            list[tuple[float, float]],
            float,
        ]
    ] = []
    normal_matrix = shaft.matrix_world.to_3x3().inverted().transposed()
    for polygon in shaft.data.polygons:
        points = [
            shaft.matrix_world @ shaft.data.vertices[index].co
            for index in polygon.vertices
        ]
        normal = (normal_matrix @ polygon.normal).normalized()
        if normal.y <= 1.0 - TOLERANCE or any(
            abs(point.y + 3.5) > TOLERANCE for point in points
        ):
            continue
        rectangle = (
            min(point.x for point in points),
            max(point.x for point in points),
            min(point.z for point in points),
            max(point.z for point in points),
        )
        rounded_rectangle = tuple(round(value, 5) for value in rectangle)
        rounded_corners = {
            (round(point.x, 5), round(point.z, 5)) for point in points
        }
        expected_corners = {
            (rounded_rectangle[0], rounded_rectangle[2]),
            (rounded_rectangle[1], rounded_rectangle[2]),
            (rounded_rectangle[1], rounded_rectangle[3]),
            (rounded_rectangle[0], rounded_rectangle[3]),
        }
        require(
            len(polygon.vertices) == 4
            and len(rounded_corners) == 4
            and rounded_corners == expected_corners,
            "エレベーターシャフト北面が四隅を持つ単一矩形ではありません: "
            f"polygon={polygon.index}, corners={sorted(rounded_corners)}",
        )
        projected_area = xz_polygon_area(
            [(point.x, point.z) for point in points]
        )
        expected_area = (
            rectangle[1] - rectangle[0]
        ) * (
            rectangle[3] - rectangle[2]
        )
        require(
            math.isclose(
                projected_area,
                expected_area,
                abs_tol=BAND_LENGTH_TOLERANCE,
            ),
            "エレベーターシャフト北面の実面積が矩形範囲と一致しません: "
            f"polygon={polygon.index}, actual={projected_area}, "
            f"expected={expected_area}",
        )
        owner_surfaces.append(
            (
                rounded_rectangle,
                polygon.index,
                [(point.x, point.z) for point in points],
                projected_area,
            )
        )
    actual_owner_bounds = tuple(
        sorted(surface[0] for surface in owner_surfaces)
    )
    require(
        actual_owner_bounds == expected_owner_bounds,
        "エレベーターシャフト北面が重複なしの4矩形を覆っていません: "
        f"actual={actual_owner_bounds}",
    )
    owner_pair_overlaps = []
    for first_index, first in enumerate(owner_surfaces):
        for second in owner_surfaces[first_index + 1 :]:
            overlap_x = min(first[0][1], second[0][1]) - max(
                first[0][0], second[0][0]
            )
            overlap_z = min(first[0][3], second[0][3]) - max(
                first[0][2], second[0][2]
            )
            if overlap_x > TOLERANCE and overlap_z > TOLERANCE:
                owner_pair_overlaps.append(
                    (first[1], second[1], overlap_x * overlap_z)
                )
    require(
        not owner_pair_overlaps,
        "エレベーターシャフト北面の所有矩形同士が重複しています: "
        f"{owner_pair_overlaps}",
    )
    actual_owner_area = sum(surface[3] for surface in owner_surfaces)
    expected_owner_area = sum(
        (x_maximum - x_minimum) * (z_maximum - z_minimum)
        for x_minimum, x_maximum, z_minimum, z_maximum in expected_owner_bounds
    )
    require(
        math.isclose(
            actual_owner_area,
            expected_owner_area,
            abs_tol=BAND_LENGTH_TOLERANCE,
        ),
        "エレベーターシャフト北面の総被覆面積が不正です: "
        f"actual={actual_owner_area}, expected={expected_owner_area}",
    )
    owner_rectangles = [surface[0] for surface in owner_surfaces]
    overlaps = []
    for obj in sorted(bpy.data.objects, key=lambda item: item.name):
        if (
            obj == shaft
            or obj.type != "MESH"
            or not obj.name.startswith("VIS_")
            or obj.name.startswith("VIS_B03_StoreyBand_")
        ):
            continue
        for polygon in obj.data.polygons:
            points = [
                obj.matrix_world @ obj.data.vertices[index].co
                for index in polygon.vertices
            ]
            if any(abs(point.y + 3.5) > TOLERANCE for point in points):
                continue
            polygon_xz = [(point.x, point.z) for point in points]
            for rectangle in owner_rectangles:
                overlap_area = xz_polygon_rectangle_overlap_area(
                    polygon_xz, rectangle
                )
                if overlap_area > TOLERANCE * TOLERANCE:
                    overlaps.append(
                        (
                            f"{obj.name}[{polygon.index}]",
                            tuple(round(value, 5) for value in rectangle),
                            round(overlap_area, 6),
                        )
                    )
    require(
        not overlaps,
        "エレベーターシャフト北面と他の表示Meshに正面積の共面重複があります: "
        f"{overlaps[:40]}",
    )

    exposed_surface_specs = {
        "VIS_B03_InterfloorStructure_F01_West": (
            -12.6,
            -12.45,
            3.0,
            3.45,
        ),
        "VIS_B03_Ceiling_F02": (-12.6, -12.45, 6.6, 7.05),
        "VIS_B03_Ceiling_F03": (-12.6, -12.45, 10.2, 10.65),
        "VIS_B03_Ceiling_F04": (-12.6, -12.45, 13.8, 14.4),
    }
    for object_name, expected_bounds in exposed_surface_specs.items():
        obj = bpy.data.objects.get(object_name)
        require(
            obj is not None and obj.type == "MESH",
            f"シャフト外の露出断面監査対象がありません: {object_name}",
        )
        exposed_surfaces = []
        for polygon in obj.data.polygons:
            points = [
                obj.matrix_world @ obj.data.vertices[index].co
                for index in polygon.vertices
            ]
            if any(abs(point.y + 3.5) > TOLERANCE for point in points):
                continue
            polygon_xz = [(point.x, point.z) for point in points]
            overlap_area = xz_polygon_rectangle_overlap_area(
                polygon_xz,
                expected_bounds,
            )
            if overlap_area <= TOLERANCE * TOLERANCE:
                continue
            exposed_surfaces.append(
                (
                    polygon.index,
                    tuple(
                        round(value, 5)
                        for value in (
                            min(point.x for point in points),
                            max(point.x for point in points),
                            min(point.z for point in points),
                            max(point.z for point in points),
                        )
                    ),
                    overlap_area,
                    len(polygon.vertices),
                )
            )
        expected_area = (
            expected_bounds[1] - expected_bounds[0]
        ) * (
            expected_bounds[3] - expected_bounds[2]
        )
        require(
            len(exposed_surfaces) == 1
            and exposed_surfaces[0][1]
            == tuple(round(value, 5) for value in expected_bounds)
            and exposed_surfaces[0][3] == 4
            and math.isclose(
                exposed_surfaces[0][2],
                expected_area,
                abs_tol=BAND_LENGTH_TOLERANCE,
            ),
            "シャフト外の露出断面が単一矩形で保持されていません: "
            f"{object_name}/{exposed_surfaces}",
        )

    # 階段系5対象は、変更前のy=-3.5面からowner矩形を引いた差集合を
    # world座標と面積で固定する。重複0だけでは過剰削除を検出できない。
    residual_surface_specs = {
        "VIS_Stairs_SW": (
            (
                {
                    (-6.28, 0.04),
                    (-6.0, -0.12),
                    (-6.0, 0.0),
                    (-6.07, 0.04),
                },
                0.021,
            ),
        ),
        "VIS_StairLanding_SW": (
            (
                {
                    (-12.6, 2.3),
                    (-12.45, 2.3),
                    (-12.45, 2.4),
                    (-12.6, 2.4),
                },
                0.015,
            ),
        ),
        "VIS_StairSystem_SW_2FTo3F": (
            (
                {
                    (-12.6, 5.9),
                    (-12.45, 5.9),
                    (-12.45, 6.0),
                    (-12.6, 6.0),
                },
                0.015,
            ),
        ),
        "VIS_StairSystem_SW_3FTo4F": (
            (
                {
                    (-12.6, 9.5),
                    (-12.45, 9.5),
                    (-12.45, 9.6),
                    (-12.6, 9.6),
                },
                0.015,
            ),
        ),
        "VIS_StairGuardSystem_SW_3FTo4F": (
            (
                {
                    (-6.0, 11.3),
                    (-5.95, 11.3),
                    (-5.95, 11.4),
                    (-6.0, 11.4),
                },
                0.005,
            ),
            (
                {
                    (-6.0, 11.75),
                    (-5.95, 11.75),
                    (-5.95, 11.85),
                    (-6.0, 11.85),
                },
                0.005,
            ),
        ),
    }
    for object_name, expected_surfaces in residual_surface_specs.items():
        obj = bpy.data.objects.get(object_name)
        require(
            obj is not None and obj.type == "MESH",
            f"階段のシャフト差集合監査対象がありません: {object_name}",
        )
        actual_surfaces = []
        for polygon in obj.data.polygons:
            points = [
                obj.matrix_world @ obj.data.vertices[index].co
                for index in polygon.vertices
            ]
            if any(abs(point.y + 3.5) > TOLERANCE for point in points):
                continue
            actual_surfaces.append(
                (
                    {
                        (round(point.x, 5), round(point.z, 5))
                        for point in points
                    },
                    xz_polygon_area([(point.x, point.z) for point in points]),
                )
            )
        unmatched_actual = list(actual_surfaces)
        for expected_coordinates, expected_area in expected_surfaces:
            match_index = next(
                (
                    index
                    for index, (actual_coordinates, actual_area) in enumerate(
                        unmatched_actual
                    )
                    if actual_coordinates == expected_coordinates
                    and math.isclose(
                        actual_area,
                        expected_area,
                        abs_tol=BAND_LENGTH_TOLERANCE,
                    )
                ),
                None,
            )
            require(
                match_index is not None,
                "階段のシャフト差集合に必要な残存面がありません: "
                f"{object_name}/coordinates={sorted(expected_coordinates)}/"
                f"area={expected_area}",
            )
            unmatched_actual.pop(match_index)
        require(
            not unmatched_actual
            and len(actual_surfaces) == len(expected_surfaces),
            "階段のシャフト差集合に余分な面または重複面があります: "
            f"{object_name}/{unmatched_actual}",
        )
    return len(owner_rectangles)


def wall_union_target_names(prefix: str) -> tuple[str, ...]:
    exact_names = {
        f"{prefix}B03_ElevatorShaftShell",
        f"{prefix}B03_GymExteriorWalls",
        f"{prefix}B03_GymStageSideWalls",
        f"{prefix}B03_GymStorageNorthWall",
        f"{prefix}B03_StairBoundaryCaps_F01",
        f"{prefix}B06_GymBridgeSideInfill",
    }
    return tuple(
        sorted(
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
        )
    )


def mesh_t_junctions(
    obj: bpy.types.Object,
) -> tuple[list[tuple[int, int]], list[int]]:
    vertices_by_line: dict[tuple[int, float, float], list[tuple[float, int]]] = {}
    for vertex in obj.data.vertices:
        coordinate = vertex.co
        for axis in range(3):
            fixed_axes = tuple(index for index in range(3) if index != axis)
            key = (
                axis,
                round(coordinate[fixed_axes[0]], 5),
                round(coordinate[fixed_axes[1]], 5),
            )
            vertices_by_line.setdefault(key, []).append((coordinate[axis], vertex.index))

    t_junctions: list[tuple[int, int]] = []
    non_axis_edges: list[int] = []
    for edge in obj.data.edges:
        first = obj.data.vertices[edge.vertices[0]].co
        second = obj.data.vertices[edge.vertices[1]].co
        varying_axes = [
            axis
            for axis in range(3)
            if abs(first[axis] - second[axis]) > TOLERANCE
        ]
        if len(varying_axes) != 1:
            non_axis_edges.append(edge.index)
            continue
        axis = varying_axes[0]
        fixed_axes = tuple(index for index in range(3) if index != axis)
        key = (
            axis,
            round(first[fixed_axes[0]], 5),
            round(first[fixed_axes[1]], 5),
        )
        minimum = min(first[axis], second[axis])
        maximum = max(first[axis], second[axis])
        for value, vertex_index in vertices_by_line[key]:
            if minimum + TOLERANCE < value < maximum - TOLERANCE:
                t_junctions.append((edge.index, vertex_index))
    return t_junctions, non_axis_edges


def mesh_component_world_t_junctions(
    obj: bpy.types.Object,
) -> list[tuple[int, int, int, int]]:
    polygons_by_vertex: dict[int, list[int]] = {}
    for polygon in obj.data.polygons:
        for vertex_index in polygon.vertices:
            polygons_by_vertex.setdefault(vertex_index, []).append(polygon.index)
    polygon_components: dict[int, int] = {}
    component_count = 0
    for polygon in obj.data.polygons:
        if polygon.index in polygon_components:
            continue
        polygon_components[polygon.index] = component_count
        pending = [polygon.index]
        while pending:
            polygon_index = pending.pop()
            for vertex_index in obj.data.polygons[polygon_index].vertices:
                for neighbor_index in polygons_by_vertex[vertex_index]:
                    if neighbor_index in polygon_components:
                        continue
                    polygon_components[neighbor_index] = component_count
                    pending.append(neighbor_index)
        component_count += 1

    vertices_by_component: dict[int, set[int]] = {}
    edges_by_component: dict[int, set[tuple[int, int]]] = {}
    for polygon in obj.data.polygons:
        component = polygon_components[polygon.index]
        vertices_by_component.setdefault(component, set()).update(
            polygon.vertices
        )
        polygon_vertices = tuple(polygon.vertices)
        edges_by_component.setdefault(component, set()).update(
            tuple(sorted((first, second)))
            for first, second in zip(
                polygon_vertices,
                polygon_vertices[1:] + polygon_vertices[:1],
                strict=True,
            )
        )

    t_junctions = []
    for component, edges in edges_by_component.items():
        component_vertices = vertices_by_component[component]
        for first_index, second_index in edges:
            first = obj.matrix_world @ obj.data.vertices[first_index].co
            second = obj.matrix_world @ obj.data.vertices[second_index].co
            direction = second - first
            length_squared = direction.length_squared
            require(
                length_squared > TOLERANCE * TOLERANCE,
                f"シャフト接触面にゼロ長edgeがあります: "
                f"{obj.name}/{first_index}-{second_index}",
            )
            for vertex_index in component_vertices - {
                first_index,
                second_index,
            }:
                point = obj.matrix_world @ obj.data.vertices[vertex_index].co
                ratio = (point - first).dot(direction) / length_squared
                if not TOLERANCE < ratio < 1.0 - TOLERANCE:
                    continue
                projection = first + direction * ratio
                if (point - projection).length <= TOLERANCE:
                    t_junctions.append(
                        (
                            component,
                            first_index,
                            second_index,
                            vertex_index,
                        )
                    )
    return t_junctions


def audit_elevator_shaft_trimmed_visual_topology() -> dict[str, int]:
    expected_boundary_edges = {
        "VIS_B03_Ceiling_F02": 44,
        "VIS_B03_Ceiling_F03": 44,
        "VIS_B03_Ceiling_F04": 55,
        "VIS_B03_InterfloorStructure_F01_West": 36,
        "VIS_StairGuardSystem_SW_3FTo4F": 8,
        "VIS_StairLanding_SW": 4,
        "VIS_StairSystem_SW_2FTo3F": 200,
        "VIS_StairSystem_SW_3FTo4F": 200,
        "VIS_Stairs_SW": 132,
    }
    total_boundary_edges = 0
    for object_name, expected_boundary_count in expected_boundary_edges.items():
        obj = bpy.data.objects.get(object_name)
        require(
            obj is not None and obj.type == "MESH",
            f"シャフト接触面のTopology監査対象がありません: {object_name}",
        )
        t_junctions = mesh_component_world_t_junctions(obj)
        require(
            not t_junctions,
            f"シャフト接触面の隣接面にT-junctionがあります: "
            f"{object_name}/{t_junctions[:40]}",
        )
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        loose_edges = [
            edge.index for edge in mesh.edges if len(edge.link_faces) == 0
        ]
        over_connected_edges = [
            edge.index for edge in mesh.edges if len(edge.link_faces) > 2
        ]
        boundary_edges = [
            edge.index for edge in mesh.edges if len(edge.link_faces) == 1
        ]
        mesh.free()
        require(
            not loose_edges and not over_connected_edges,
            "シャフト接触面に孤立edgeまたは3面以上共有edgeがあります: "
            f"{object_name}/loose={loose_edges[:40]}/"
            f"over={over_connected_edges[:40]}",
        )
        require(
            len(boundary_edges) == expected_boundary_count,
            "シャフト接触面の意図的open境界数が不正です: "
            f"{object_name}/actual={len(boundary_edges)}/"
            f"expected={expected_boundary_count}",
        )
        total_boundary_edges += len(boundary_edges)
    ngon_uv_checks = audit_continuous_ngon_uvs(
        tuple(expected_boundary_edges)
    )
    return {
        "objects": len(expected_boundary_edges),
        "t_junctions": 0,
        "invalid_edges": 0,
        "boundary_edges": total_boundary_edges,
        "ngon_uv_checks": ngon_uv_checks,
    }


def cross_object_coplanar_t_junctions(
    object_names: tuple[str, ...],
) -> list[tuple[str, int, str, int, int, float]]:
    vertices_by_plane_line: dict[
        tuple[int, float, int, float, float],
        list[tuple[float, str, int]],
    ] = {}
    edge_planes_by_object: dict[
        str,
        dict[tuple[int, int], set[tuple[int, float]]],
    ] = {}

    for object_name in object_names:
        obj = bpy.data.objects[object_name]
        planes_by_vertex: dict[int, set[tuple[int, float]]] = {
            vertex.index: set() for vertex in obj.data.vertices
        }
        edge_planes: dict[tuple[int, int], set[tuple[int, float]]] = {}
        for polygon in obj.data.polygons:
            points = [
                obj.matrix_world @ obj.data.vertices[index].co
                for index in polygon.vertices
            ]
            extents = tuple(
                max(point[axis] for point in points)
                - min(point[axis] for point in points)
                for axis in range(3)
            )
            plane_axes = [
                axis for axis, extent in enumerate(extents) if extent <= TOLERANCE
            ]
            if len(plane_axes) != 1:
                continue
            plane_axis = plane_axes[0]
            plane_coordinate = round(
                sum(point[plane_axis] for point in points) / len(points),
                5,
            )
            plane = (plane_axis, plane_coordinate)
            polygon_vertices = tuple(polygon.vertices)
            for vertex_index in polygon_vertices:
                planes_by_vertex[vertex_index].add(plane)
            for first, second in zip(
                polygon_vertices,
                polygon_vertices[1:] + polygon_vertices[:1],
            ):
                edge_key = tuple(sorted((first, second)))
                edge_planes.setdefault(edge_key, set()).add(plane)
        edge_planes_by_object[object_name] = edge_planes

        for vertex in obj.data.vertices:
            coordinate = obj.matrix_world @ vertex.co
            for plane_axis, plane_coordinate in planes_by_vertex[vertex.index]:
                for varying_axis in range(3):
                    if varying_axis == plane_axis:
                        continue
                    fixed_axes = tuple(
                        axis for axis in range(3) if axis != varying_axis
                    )
                    key = (
                        plane_axis,
                        plane_coordinate,
                        varying_axis,
                        round(coordinate[fixed_axes[0]], 5),
                        round(coordinate[fixed_axes[1]], 5),
                    )
                    vertices_by_plane_line.setdefault(key, []).append(
                        (coordinate[varying_axis], object_name, vertex.index)
                    )

    t_junctions: list[tuple[str, int, str, int, int, float]] = []
    for object_name in object_names:
        obj = bpy.data.objects[object_name]
        edge_planes = edge_planes_by_object[object_name]
        for edge in obj.data.edges:
            first = obj.matrix_world @ obj.data.vertices[edge.vertices[0]].co
            second = obj.matrix_world @ obj.data.vertices[edge.vertices[1]].co
            varying_axes = [
                axis
                for axis in range(3)
                if abs(first[axis] - second[axis]) > TOLERANCE
            ]
            if len(varying_axes) != 1:
                continue
            varying_axis = varying_axes[0]
            fixed_axes = tuple(
                axis for axis in range(3) if axis != varying_axis
            )
            minimum = min(first[varying_axis], second[varying_axis])
            maximum = max(first[varying_axis], second[varying_axis])
            edge_key = tuple(sorted(edge.vertices))
            for plane_axis, plane_coordinate in edge_planes.get(edge_key, set()):
                key = (
                    plane_axis,
                    plane_coordinate,
                    varying_axis,
                    round(first[fixed_axes[0]], 5),
                    round(first[fixed_axes[1]], 5),
                )
                for value, vertex_object_name, vertex_index in (
                    vertices_by_plane_line.get(key, ())
                ):
                    if vertex_object_name == object_name:
                        continue
                    if minimum + TOLERANCE < value < maximum - TOLERANCE:
                        t_junctions.append(
                            (
                                object_name,
                                edge.index,
                                vertex_object_name,
                                vertex_index,
                                plane_axis,
                                plane_coordinate,
                            )
                        )
    return t_junctions


def polygon_has_continuous_planar_uv(
    obj: bpy.types.Object,
    polygon: bpy.types.MeshPolygon,
) -> bool:
    uv_layer = obj.data.uv_layers.get("UVMap")
    if uv_layer is None:
        return False
    normal_axis = max(range(3), key=lambda axis: abs(polygon.normal[axis]))
    plane_axes = tuple(axis for axis in range(3) if axis != normal_axis)
    points = [
        obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
        for loop_index in polygon.loop_indices
    ]
    uvs = [uv_layer.data[loop_index].uv for loop_index in polygon.loop_indices]

    physical_normalized = []
    for axis in plane_axes:
        minimum = min(point[axis] for point in points)
        maximum = max(point[axis] for point in points)
        span = maximum - minimum
        if span <= TOLERANCE:
            return False
        physical_normalized.append(
            tuple((point[axis] - minimum) / span for point in points)
        )

    uv_normalized = []
    for axis in range(2):
        minimum = min(uv[axis] for uv in uvs)
        maximum = max(uv[axis] for uv in uvs)
        span = maximum - minimum
        if span <= TOLERANCE:
            return False
        uv_normalized.append(tuple((uv[axis] - minimum) / span for uv in uvs))

    for swap_axes in (False, True):
        first_physical = physical_normalized[1 if swap_axes else 0]
        second_physical = physical_normalized[0 if swap_axes else 1]
        for reverse_first in (False, True):
            for reverse_second in (False, True):
                if all(
                    math.isclose(
                        uv_normalized[0][index],
                        1.0 - first_physical[index]
                        if reverse_first
                        else first_physical[index],
                        abs_tol=BAND_LENGTH_TOLERANCE,
                    )
                    and math.isclose(
                        uv_normalized[1][index],
                        1.0 - second_physical[index]
                        if reverse_second
                        else second_physical[index],
                        abs_tol=BAND_LENGTH_TOLERANCE,
                    )
                    for index in range(len(points))
                ):
                    return True
    return False


def audit_continuous_ngon_uvs(object_names: tuple[str, ...]) -> int:
    checks = 0
    for object_name in object_names:
        obj = bpy.data.objects.get(object_name)
        require(
            obj is not None and obj.type == "MESH",
            f"連続UV監査対象がありません: {object_name}",
        )
        for polygon in obj.data.polygons:
            if len(polygon.loop_indices) <= 4:
                continue
            checks += 1
            require(
                polygon_has_continuous_planar_uv(obj, polygon),
                f"統合面のUVが面内で折り返しています: "
                f"{object_name}[{polygon.index}]/{len(polygon.loop_indices)} vertices",
            )
    require(checks > 0, "統合面の連続UV監査対象がありません")
    return checks


def audit_wall_union_surfaces() -> dict[str, int]:
    result: dict[str, int] = {}
    for prefix, label in (("VIS_", "表示壁"), ("COL_", "壁Collider")):
        object_names = wall_union_target_names(prefix)
        require(object_names, f"{label}の監査対象がありません")
        polygon_count = 0
        vertex_count = 0
        boundary_edge_count = 0
        for object_name in object_names:
            obj = bpy.data.objects[object_name]
            polygon_count += len(obj.data.polygons)
            vertex_count += len(obj.data.vertices)
            for polygon in obj.data.polygons:
                require(
                    polygon.area > TOLERANCE * TOLERANCE,
                    f"{label}にゼロ面積面があります: {object_name}[{polygon.index}]",
                )
                require(
                    len(polygon.vertices) == len(set(polygon.vertices)),
                    f"{label}の面に重複頂点があります: {object_name}[{polygon.index}]",
                )
                require(
                    max(abs(value) for value in polygon.normal) >= 1.0 - TOLERANCE,
                    f"{label}に軸非整列面があります: {object_name}[{polygon.index}]",
                )
            t_junctions, non_axis_edges = mesh_t_junctions(obj)
            require(
                not non_axis_edges,
                f"{label}に軸非整列edgeがあります: "
                f"{object_name}/{non_axis_edges[:40]}",
            )
            require(
                not t_junctions,
                f"{label}にT-junctionがあります: {object_name}/{t_junctions[:40]}",
            )
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            non_manifold_edges = [
                edge.index for edge in mesh.edges if len(edge.link_faces) != 2
            ]
            invalid_visual_edges = [
                edge.index for edge in mesh.edges if len(edge.link_faces) not in (1, 2)
            ]
            boundary_edge_count += len(non_manifold_edges)
            mesh.free()
            require(
                not non_manifold_edges if prefix == "COL_" else not invalid_visual_edges,
                f"{label}に不正な非Manifold edgeがあります: "
                f"{object_name}/"
                f"{(non_manifold_edges if prefix == 'COL_' else invalid_visual_edges)[:40]}",
            )
        if prefix == "VIS_":
            cross_object_t_junctions = cross_object_coplanar_t_junctions(
                object_names
            )
            require(
                not cross_object_t_junctions,
                "表示壁の別Object間に同一平面T-junctionがあります: "
                f"{cross_object_t_junctions[:40]}",
            )
            result["vis_cross_object_t_junctions"] = len(
                cross_object_t_junctions
            )
            require_unique_polygon_surfaces(object_names, label)
            require_no_axis_aligned_coplanar_area(
                object_names,
                label,
                include_same_object=True,
            )
            result["vis_ngon_uv_checks"] = audit_continuous_ngon_uvs(
                object_names
                + tuple(f"VIS_B03_StoreyBand_F{floor:02d}" for floor in range(1, 5))
            )
        else:
            # ColliderはObject単位の閉形状契約を維持するため、隣接する別Objectの
            # 接触面は許可する。各Object内部の重複面・内部面は許可しない。
            for object_name in object_names:
                require_unique_polygon_surfaces((object_name,), label)
                require_no_axis_aligned_coplanar_area(
                    (object_name,),
                    label,
                    include_same_object=True,
                )
        result[f"{prefix.lower()}objects"] = len(object_names)
        result[f"{prefix.lower()}vertices"] = vertex_count
        result[f"{prefix.lower()}polygons"] = polygon_count
        result[f"{prefix.lower()}boundary_edges"] = boundary_edge_count
    return result


def storey_band_component_key(
    bounds: tuple[Vector, Vector],
) -> tuple[str, float, int, float, float]:
    minimum, maximum = bounds
    extent_x = maximum.x - minimum.x
    extent_y = maximum.y - minimum.y
    # 色帯は実壁面から2mm離して配置するため、AABB中心ではなく
    # 5cm格子上の正本壁面へ戻して連続区間を照合する。
    def wall_face(value: float) -> float:
        return round(round(value * 20.0) / 20.0, 2)

    if extent_x < extent_y:
        center = (minimum.x + maximum.x) / 2.0
        face = wall_face(center)
        return (
            "X",
            face,
            -1 if center < face else 1,
            round(minimum.y, 2),
            round(maximum.y, 2),
        )
    center = (minimum.y + maximum.y) / 2.0
    face = wall_face(center)
    return (
        "Y",
        face,
        -1 if center < face else 1,
        round(minimum.x, 2),
        round(maximum.x, 2),
    )


def require_component_bounds(
    object_name: str,
    expected: tuple[
        tuple[tuple[float, float, float], tuple[float, float, float]], ...
    ],
) -> None:
    obj = bpy.data.objects.get(object_name)
    require(obj is not None and obj.type == "MESH", f"構造Objectがありません: {object_name}")
    actual = list(mesh_component_world_bounds(obj))
    require(len(actual) == len(expected), f"構造境界数が不正です: {object_name}/{len(actual)}")
    unmatched = list(actual)
    for expected_minimum, expected_maximum in expected:
        matching_index = next(
            (
                index
                for index, (actual_minimum, actual_maximum) in enumerate(unmatched)
                if close_tuple(tuple(actual_minimum), expected_minimum)
                and close_tuple(tuple(actual_maximum), expected_maximum)
            ),
            None,
        )
        require(
            matching_index is not None,
            f"構造境界が不正です: {object_name}/{expected_minimum}/{expected_maximum}",
        )
        unmatched.pop(matching_index)


def audit_stair_nosing_alignment(
    nosing_name: str,
    step_object_names: tuple[str, ...],
    expected_count: int,
) -> int:
    nosing = bpy.data.objects.get(nosing_name)
    require(nosing is not None and nosing.type == "MESH", f"階段防護材がありません: {nosing_name}")
    components = mesh_component_world_bounds(nosing)
    require(
        len(components) == expected_count,
        f"階段防護材本数が不正です: {nosing_name}/{len(components)}/{expected_count}",
    )
    tread_surfaces = []
    for object_name in step_object_names:
        step_object = bpy.data.objects.get(object_name)
        require(
            step_object is not None and step_object.type == "MESH",
            f"防護材の対応階段がありません: {object_name}",
        )
        normal_matrix = step_object.matrix_world.to_3x3().inverted().transposed()
        for polygon in step_object.data.polygons:
            normal = (normal_matrix @ polygon.normal).normalized()
            if normal.z < 1.0 - TOLERANCE:
                continue
            minimum, maximum = polygon_world_bounds(step_object, polygon)
            if maximum.x - minimum.x <= TOLERANCE or maximum.y - minimum.y <= TOLERANCE:
                continue
            tread_surfaces.append((minimum, maximum))

    for minimum, maximum in components:
        extent_x = maximum.x - minimum.x
        extent_y = maximum.y - minimum.y
        require(
            math.isclose(maximum.z - minimum.z, 0.02, abs_tol=TOLERANCE),
            f"防護材高さが0.02mではありません: {nosing_name}/{tuple(minimum)}/{tuple(maximum)}",
        )
        short_axis = 0 if extent_x < extent_y else 1
        long_axis = 1 - short_axis
        require(
            math.isclose(maximum[short_axis] - minimum[short_axis], 0.06, abs_tol=TOLERANCE),
            f"防護材奥行が0.06mではありません: {nosing_name}/{tuple(minimum)}/{tuple(maximum)}",
        )
        matching_treads = []
        for tread_minimum, tread_maximum in tread_surfaces:
            if not math.isclose(minimum.z, tread_maximum.z, abs_tol=TOLERANCE):
                continue
            if (
                minimum[long_axis] < tread_minimum[long_axis] - TOLERANCE
                or maximum[long_axis] > tread_maximum[long_axis] + TOLERANCE
            ):
                continue
            touches_front_edge = (
                math.isclose(
                    minimum[short_axis],
                    tread_minimum[short_axis],
                    abs_tol=TOLERANCE,
                )
                or math.isclose(
                    maximum[short_axis],
                    tread_maximum[short_axis],
                    abs_tol=TOLERANCE,
                )
            )
            if touches_front_edge:
                matching_treads.append((tread_minimum, tread_maximum))
        require(
            len(matching_treads) == 1,
            f"防護材が段前縁へ一意に密着していません: "
            f"{nosing_name}/{tuple(minimum)}/{tuple(maximum)}/{len(matching_treads)}",
        )
    return len(components)


def audit_all_stair_nosings() -> int:
    total = 0
    school_sources = {
        "NW_1FTo2F": ("VIS_Stairs_NW", "VIS_StairsUpper_NW"),
        "NE_1FTo2F": ("VIS_Stairs_NE", "VIS_StairsUpper_NE"),
        "SW_1FTo2F": ("VIS_Stairs_SW", "VIS_StairsUpper_SW"),
        "NW_2FTo3F": ("VIS_StairSystem_NW_2FTo3F",),
        "NW_3FTo4F": ("VIS_StairSystem_NW_3FTo4F",),
        "NW_4FToRooftop": ("VIS_StairSystem_NW_4FToRooftop",),
        "NE_2FTo3F": ("VIS_StairSystem_NE_2FTo3F",),
        "NE_3FTo4F": ("VIS_StairSystem_NE_3FTo4F",),
        "SW_2FTo3F": ("VIS_StairSystem_SW_2FTo3F",),
        "SW_3FTo4F": ("VIS_StairSystem_SW_3FTo4F",),
    }
    for suffix, source_names in school_sources.items():
        total += audit_stair_nosing_alignment(
            f"VIS_B03_StairNosing_{suffix}",
            source_names,
            24,
        )
    total += audit_stair_nosing_alignment(
        "VIS_B03_GymGalleryStairNosing",
        ("VIS_B03_GymGalleryStairs",),
        92,
    )
    total += audit_stair_nosing_alignment(
        "VIS_B03_GymStageStairNosing",
        tuple(
            f"VIS_GymStageStair_{side}_{index:02d}"
            for side in ("East", "West")
            for index in range(1, 6)
        ),
        10,
    )
    require(total == 342, f"全階段防護材が342本ではありません: {total}")
    forbidden_names = sorted(
        obj.name
        for obj in bpy.data.objects
        if "Nosing" in obj.name and obj.name.startswith(("COL_", "NAV_"))
    )
    require(
        not forbidden_names,
        f"階段防護材がColliderまたはNavMeshへ混入しています: {forbidden_names}",
    )
    return total


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mode",
        choices=("write-before", "compare-after", "geometry-only", "report-diff"),
    )
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def source_signature() -> dict[str, dict[str, object]]:
    return {
        name: {
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for name, path in (
            ("blend", BLEND_PATH),
            ("glb", GLB_PATH),
            ("human_navmesh", NAVMESH_PATH),
            ("room_variant_navmesh", ROOM_VARIANT_NAVMESH_PATH),
            ("bit_navmesh", BIT_NAVMESH_PATH),
        )
    }


def audit_geometry_budgets() -> dict[str, object]:
    prefix_triangles = {
        prefix: 0
        for prefix in ("BND", "COL", "MAP", "NAV", "PRT", "VIS", "VOL")
    }
    scene_vertices = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        scene_vertices += len(obj.data.vertices)
        prefix = obj.name.split("_", 1)[0]
        if prefix in prefix_triangles:
            prefix_triangles[prefix] += len(obj.data.loop_triangles)

    document = read_glb_json(GLB_PATH)
    accessors = document.get("accessors", [])
    primitives = [
        primitive
        for mesh in document.get("meshes", [])
        for primitive in mesh.get("primitives", [])
    ]
    glb_vertices = sum(
        accessors[primitive["attributes"]["POSITION"]]["count"]
        for primitive in primitives
    )
    glb_indices = sum(
        accessors[primitive["indices"]]["count"]
        for primitive in primitives
        if "indices" in primitive
    )
    glb_triangles = sum(
        (
            accessors[primitive["indices"]]["count"]
            if "indices" in primitive
            else accessors[primitive["attributes"]["POSITION"]]["count"]
        )
        // 3
        for primitive in primitives
        if primitive.get("mode", 4) == 4
    )
    metrics = {
        "glb_bytes": GLB_PATH.stat().st_size,
        "glb_nodes": len(document.get("nodes", [])),
        "glb_meshes": len(document.get("meshes", [])),
        "glb_primitives": len(primitives),
        "glb_vertices": glb_vertices,
        "glb_indices": glb_indices,
        "glb_triangles": glb_triangles,
        "scene_vertices": scene_vertices,
        "prefix_triangles": prefix_triangles,
    }
    require(metrics["glb_bytes"] <= MAX_GLB_BYTES, f"GLB容量が肥大化しています: {metrics}")
    require(metrics["glb_nodes"] <= MAX_GLB_NODES, f"GLB Node数が肥大化しています: {metrics}")
    require(metrics["glb_meshes"] <= MAX_GLB_MESHES, f"GLB Mesh数が肥大化しています: {metrics}")
    require(
        metrics["glb_primitives"] <= MAX_GLB_PRIMITIVES,
        f"GLB Primitive数が肥大化しています: {metrics}",
    )
    require(metrics["glb_vertices"] <= MAX_GLB_VERTICES, f"GLB頂点数が肥大化しています: {metrics}")
    require(metrics["glb_indices"] <= MAX_GLB_INDICES, f"GLB index数が肥大化しています: {metrics}")
    require(metrics["glb_triangles"] <= MAX_GLB_TRIANGLES, f"GLB三角形数が肥大化しています: {metrics}")
    require(
        prefix_triangles["VIS"] <= MAX_VISUAL_TRIANGLES,
        f"表示Mesh三角形数が肥大化しています: {metrics}",
    )
    require(
        prefix_triangles["COL"] <= MAX_COLLIDER_TRIANGLES,
        f"Collider三角形数が肥大化しています: {metrics}",
    )
    print(
        "B06_1_GEOMETRY_BUDGET="
        + json.dumps(metrics, ensure_ascii=False, sort_keys=True)
    )
    return metrics


def write_before() -> None:
    require(not BASELINE_PATH.exists(), f"変更前baselineは既に存在します: {BASELINE_PATH}")
    snapshot = {
        "source": source_signature(),
        "generator_version": bpy.context.scene.get(GENERATOR_VERSION_PROPERTY),
        "objects": protected_snapshot(),
    }
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BASELINE_PATH.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        "B06_1_BEFORE_BASELINE="
        + json.dumps(
            {
                "path": str(BASELINE_PATH),
                "objects": len(snapshot["objects"]),
                "source": snapshot["source"],
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


def compare_after() -> None:
    require(BASELINE_PATH.is_file(), f"変更前baselineがありません: {BASELINE_PATH}")
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    expected = baseline["objects"]
    current = protected_snapshot()
    missing = frozenset(expected) - frozenset(current)
    changed = frozenset(
        name
        for name in frozenset(expected) & frozenset(current)
        if expected[name] != current[name]
    )
    new = frozenset(current) - frozenset(expected)
    require(
        missing == EXPECTED_MISSING_OBJECTS,
        f"B06-1許可外の削除Objectがあります: {sorted(missing)}",
    )
    expected_changed = (
        EXPECTED_CHANGED_OBJECTS
        | EXPECTED_FIFTH_REWORK_CHANGED_OBJECTS
        | EXPECTED_NINTH_REWORK_CHANGED_OBJECTS
    )
    require(
        changed == expected_changed,
        "B06-1変更Object集合が不正です: "
        f"許可外={sorted(changed - expected_changed)}, "
        f"許可対象の不足={sorted(expected_changed - changed)}",
    )
    require(
        new == EXPECTED_NEW_OBJECTS,
        f"B06-1追加Object集合が不正です: {sorted(new)}",
    )
    require(
        bpy.context.scene.get(GENERATOR_VERSION_PROPERTY)
        == EXPECTED_GENERATOR_VERSION,
        "B06-1生成器versionが不正です",
    )
    audit_structure_geometry()
    print(
        "B06_1_AUDIT_RESULT="
        + json.dumps(
            {
                "before": baseline["source"],
                "after": source_signature(),
                "changed_objects": sorted(changed),
                "missing_objects": sorted(missing),
                "new_objects": sorted(new),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


def report_diff() -> None:
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    before = baseline["objects"]
    after = protected_snapshot()
    before_names = set(before)
    after_names = set(after)
    print(
        "B06_1_DIFF_REPORT="
        + json.dumps(
            {
                "changed_objects": sorted(
                    name
                    for name in before_names & after_names
                    if before[name] != after[name]
                ),
                "missing_objects": sorted(before_names - after_names),
                "new_objects": sorted(after_names - before_names),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


def point_in_yz_polygon(
    points: list[Vector],
    sample_y: float,
    sample_z: float,
) -> bool:
    inside = False
    for index, first in enumerate(points):
        second = points[(index + 1) % len(points)]
        edge_y = second.y - first.y
        edge_z = second.z - first.z
        cross = (
            (sample_y - first.y) * edge_z
            - (sample_z - first.z) * edge_y
        )
        if (
            abs(cross) <= TOLERANCE
            and min(first.y, second.y) - TOLERANCE
            <= sample_y
            <= max(first.y, second.y) + TOLERANCE
            and min(first.z, second.z) - TOLERANCE
            <= sample_z
            <= max(first.z, second.z) + TOLERANCE
        ):
            return True
        crosses_sample_z = (first.z > sample_z) != (second.z > sample_z)
        if not crosses_sample_z:
            continue
        intersection_y = first.y + (
            (sample_z - first.z) * edge_y / edge_z
        )
        if intersection_y > sample_y:
            inside = not inside
    return inside


def point_in_xz_polygon(
    points: list[Vector],
    sample_x: float,
    sample_z: float,
) -> bool:
    inside = False
    for index, first in enumerate(points):
        second = points[(index + 1) % len(points)]
        edge_x = second.x - first.x
        edge_z = second.z - first.z
        cross = (
            (sample_x - first.x) * edge_z
            - (sample_z - first.z) * edge_x
        )
        if (
            abs(cross) <= TOLERANCE
            and min(first.x, second.x) - TOLERANCE
            <= sample_x
            <= max(first.x, second.x) + TOLERANCE
            and min(first.z, second.z) - TOLERANCE
            <= sample_z
            <= max(first.z, second.z) + TOLERANCE
        ):
            return True
        crosses_sample_z = (first.z > sample_z) != (second.z > sample_z)
        if not crosses_sample_z:
            continue
        intersection_x = first.x + (
            (sample_z - first.z) * edge_x / edge_z
        )
        if intersection_x > sample_x:
            inside = not inside
    return inside


def audit_rooftop_hut_merged_with_school_wall(
    facility_walls: bpy.types.Object,
) -> None:
    exterior = bpy.data.objects.get("VIS_B03_ExteriorWalls_F04")
    roof = bpy.data.objects.get("VIS_Roof_North")
    require(
        exterior is not None
        and exterior.type == "MESH"
        and roof is not None
        and roof.type == "MESH",
        "屋上小屋を受ける4階外壁または屋上床がありません",
    )

    facility_vertices = [
        facility_walls.matrix_world @ vertex.co
        for vertex in facility_walls.data.vertices
    ]
    legacy_inset_faces = []
    for polygon in facility_walls.data.polygons:
        points = [facility_vertices[index] for index in polygon.vertices]
        minimum, maximum = polygon_world_bounds(facility_walls, polygon)
        if (
            all(abs(point.y - 45.20) <= TOLERANCE for point in points)
            and (maximum.x - minimum.x) * (maximum.z - minimum.z)
            > TOLERANCE
        ) or (
            all(abs(point.x + 12.30) <= TOLERANCE for point in points)
            and (maximum.y - minimum.y) * (maximum.z - minimum.z)
            > TOLERANCE
        ):
            legacy_inset_faces.append(polygon.index)
    require(
        not legacy_inset_faces,
        "屋上小屋に校舎外壁から内側へ張り出す旧北壁・西壁が残っています: "
        f"{legacy_inset_faces}",
    )

    exterior_vertices = [
        exterior.matrix_world @ vertex.co for vertex in exterior.data.vertices
    ]
    exterior_normal_matrix = exterior.matrix_world.to_3x3().inverted().transposed()
    sample_owners: list[int] = []
    for sample_z in (14.39, 14.41, 14.49, 14.51, 16.89):
        owners = []
        for polygon in exterior.data.polygons:
            points = [exterior_vertices[index] for index in polygon.vertices]
            normal = (exterior_normal_matrix @ polygon.normal).normalized()
            if normal.y >= -1.0 + TOLERANCE or any(
                abs(point.y - 45.35) > TOLERANCE for point in points
            ):
                continue
            if point_in_xz_polygon(points, -7.20, sample_z):
                owners.append(polygon.index)
        require(
            len(owners) == 1,
            "校舎北外壁と屋上小屋北壁を一意に所有する連続面がありません: "
            f"z={sample_z}, owners={owners}",
        )
        sample_owners.append(owners[0])
    require(
        len(set(sample_owners)) == 1,
        "校舎北外壁と屋上小屋北壁が屋上床高さで分割されています: "
        f"{sample_owners}",
    )

    roof_strip_area = 0.0
    for polygon in roof.data.polygons:
        minimum, maximum = polygon_world_bounds(roof, polygon)
        if (
            abs(minimum.z - 14.50) <= TOLERANCE
            and abs(maximum.z - 14.50) <= TOLERANCE
        ):
            overlap_x = min(maximum.x, 2.40) - max(minimum.x, -12.60)
            overlap_y = min(maximum.y, 45.50) - max(minimum.y, 45.35)
            if overlap_x > TOLERANCE and overlap_y > TOLERANCE:
                roof_strip_area += overlap_x * overlap_y
    require(
        roof_strip_area <= TOLERANCE,
        "屋上小屋北壁の下に黒線となる屋上床面が残っています: "
        f"area={roof_strip_area}",
    )

    require_no_axis_aligned_coplanar_area(
        (
            "VIS_B03_ExteriorWalls_F04",
            "VIS_RooftopFacilityWalls",
        ),
        "校舎4階外壁・屋上小屋壁の接続",
    )


def audit_rooftop_west_wall_floor_closure(
    facility_walls: bpy.types.Object,
) -> None:
    exterior = bpy.data.objects.get("VIS_B03_ExteriorWalls_F04")
    roof = bpy.data.objects.get("VIS_Roof_North")
    collider = bpy.data.objects.get("COL_RooftopFacilityShell")
    require(
        exterior is not None
        and exterior.type == "MESH"
        and roof is not None
        and roof.type == "MESH"
        and collider is not None
        and collider.type == "MESH",
        "屋上小屋西壁を閉じる表示・床・Colliderが揃っていません",
    )

    candidates = (facility_walls, exterior)
    for sample_y in (38.81, 38.85, 39.05):
        for sample_z in (14.41, 14.49, 15.50, 16.89):
            owners = []
            for candidate in candidates:
                world_vertices = [
                    candidate.matrix_world @ vertex.co
                    for vertex in candidate.data.vertices
                ]
                normal_matrix = (
                    candidate.matrix_world.to_3x3().inverted().transposed()
                )
                for polygon in candidate.data.polygons:
                    points = [
                        world_vertices[index] for index in polygon.vertices
                    ]
                    normal = (normal_matrix @ polygon.normal).normalized()
                    if normal.x <= 1.0 - TOLERANCE or any(
                        abs(point.x + 12.45) > TOLERANCE for point in points
                    ):
                        continue
                    if point_in_yz_polygon(points, sample_y, sample_z):
                        owners.append((candidate.name, polygon.index))
            require(
                len(owners) == 1,
                "屋上小屋西壁が校舎壁・床境界まで一意に閉じていません: "
                f"y={sample_y}, z={sample_z}, owners={owners}",
            )

    collider_components = mesh_component_world_bounds(collider)
    require(
        any(
            close_tuple(tuple(minimum), (-12.75, 38.50, 14.40))
            and close_tuple(tuple(maximum), (-12.45, 38.90, 16.90))
            for minimum, maximum in collider_components
        ),
        "屋上小屋西壁のColliderが床境界から校舎西壁まで閉じていません",
    )

    roof_overlap_area = 0.0
    for polygon in roof.data.polygons:
        minimum, maximum = polygon_world_bounds(roof, polygon)
        if (
            abs(minimum.z - 14.50) <= TOLERANCE
            and abs(maximum.z - 14.50) <= TOLERANCE
        ):
            overlap_x = min(maximum.x, -12.45) - max(minimum.x, -12.75)
            overlap_y = min(maximum.y, 38.90) - max(minimum.y, 38.50)
            if overlap_x > TOLERANCE and overlap_y > TOLERANCE:
                roof_overlap_area += overlap_x * overlap_y
    require(
        roof_overlap_area <= TOLERANCE,
        "屋上小屋西壁の内部に黒線となる屋上床面が残っています: "
        f"area={roof_overlap_area}",
    )

    for prefix in ("VIS", "COL"):
        guard = bpy.data.objects.get(f"{prefix}_RoofGuard_WestOuter")
        require(
            guard is not None and guard.type == "MESH",
            f"屋上西柵がありません: {prefix}",
        )
        minimum, maximum = world_bounds(guard)
        require(
            math.isclose(maximum[1], 38.55, abs_tol=TOLERANCE)
            and maximum[1] > 38.50 + TOLERANCE,
            "屋上西柵が西壁の内部へ正しく納まっていません: "
            f"{prefix}/{minimum}/{maximum}",
        )

    require_no_axis_aligned_coplanar_area(
        ("VIS_RooftopFacilityWalls", "VIS_RoofGuard_WestOuter"),
        "屋上小屋西壁・西柵の納まり",
    )


def audit_rooftop_stair_side_continuous_wall(
    facility_walls: bpy.types.Object,
) -> None:
    exterior = bpy.data.objects.get("VIS_B03_ExteriorWalls_F04")
    require(
        exterior is not None and exterior.type == "MESH",
        "屋上北西階段側を一体化する4階外壁がありません",
    )
    candidates = (facility_walls, exterior)
    seam_edges = []
    for candidate in candidates:
        world_vertices = [
            candidate.matrix_world @ vertex.co
            for vertex in candidate.data.vertices
        ]
        for edge in candidate.data.edges:
            points = [world_vertices[index] for index in edge.vertices]
            if (
                all(abs(point.x + 6.75) <= TOLERANCE for point in points)
                and all(abs(point.z - 14.50) <= TOLERANCE for point in points)
                and min(point.y for point in points) < 45.20 - TOLERANCE
                and max(point.y for point in points) > 38.50 + TOLERANCE
            ):
                seam_edges.append(
                    (candidate.name, tuple(tuple(point) for point in points))
                )
    require(
        not seam_edges,
        "屋上北西階段側の壁が屋上床高さで分断されています: "
        f"{seam_edges}",
    )

    sample_owners: list[tuple[str, int, int]] = []
    for sample_z in (14.49, 14.51):
        owners: list[tuple[str, int, int]] = []
        for candidate in candidates:
            world_vertices = [
                candidate.matrix_world @ vertex.co
                for vertex in candidate.data.vertices
            ]
            normal_matrix = candidate.matrix_world.to_3x3().inverted().transposed()
            for polygon in candidate.data.polygons:
                points = [world_vertices[index] for index in polygon.vertices]
                normal = (normal_matrix @ polygon.normal).normalized()
                if normal.x >= -1.0 + TOLERANCE or any(
                    abs(point.x + 6.75) > TOLERANCE for point in points
                ):
                    continue
                if point_in_yz_polygon(points, 40.896, sample_z):
                    owners.append(
                        (candidate.name, polygon.index, len(polygon.vertices))
                    )
        require(
            len(owners) == 1,
            "屋上北西階段側の連続壁を一意に所有する表示面がありません: "
            f"z={sample_z}, owners={owners}",
        )
        sample_owners.append(owners[0])
    require(
        sample_owners[0][:2] == sample_owners[1][:2],
        "屋上北西階段側の壁が屋上床高さの上下で別polygonになっています: "
        f"{sample_owners}",
    )


def audit_rooftop_facility_straight_south_front(
    facility_walls: bpy.types.Object,
) -> None:
    world_vertices = [
        facility_walls.matrix_world @ vertex.co
        for vertex in facility_walls.data.vertices
    ]
    normal_matrix = facility_walls.matrix_world.to_3x3().inverted().transposed()
    required_samples = (
        (-10.50, 15.50),
        (-7.875, 16.85),
        (-6.00, 15.50),
        (-4.80, 16.85),
        (-3.00, 15.50),
        (-1.20, 15.50),
        (-0.30, 16.85),
        (1.00, 15.50),
    )
    for sample_x, sample_z in required_samples:
        owners = []
        for polygon in facility_walls.data.polygons:
            points = [world_vertices[index] for index in polygon.vertices]
            normal = (normal_matrix @ polygon.normal).normalized()
            if normal.y >= -1.0 + TOLERANCE or any(
                abs(point.y - 38.50) > TOLERANCE for point in points
            ):
                continue
            if point_in_xz_polygon(points, sample_x, sample_z):
                owners.append(polygon.index)
        require(
            len(owners) == 1,
            "屋上階段室・男女更衣室の南正面が一直線の単一壁面ではありません: "
            f"point={(sample_x, sample_z)}, owners={owners}",
        )

    legacy_stair_front_faces = []
    for polygon in facility_walls.data.polygons:
        points = [world_vertices[index] for index in polygon.vertices]
        normal = (normal_matrix @ polygon.normal).normalized()
        minimum, maximum = polygon_world_bounds(facility_walls, polygon)
        if (
            normal.y < -1.0 + TOLERANCE
            and all(abs(point.y - 38.90) <= TOLERANCE for point in points)
            and (maximum.x - minimum.x) * (maximum.z - minimum.z) > TOLERANCE
        ):
            legacy_stair_front_faces.append(polygon.index)
    require(
        not legacy_stair_front_faces,
        "更衣室より40cm奥まった旧屋上階段室正面が残っています: "
        f"{legacy_stair_front_faces}",
    )

    door = bpy.data.objects.get("VIS_DoorLeaf_RooftopStairHouse_Open")
    require(
        door is not None
        and door.type == "MESH"
        and all(
            abs(actual - expected) <= TOLERANCE
            for actual, expected in zip(
                (*world_bounds(door)[0], *world_bounds(door)[1]),
                (-9.04, 36.60, 14.50, -8.96, 38.50, 16.70),
                strict=True,
            )
        ),
        "屋上階段室の扉が統合後の南正面へ揃っていません",
    )

    visual_guard = bpy.data.objects.get("VIS_StairGuardSystem_NW_4FToRooftop")
    collider_guard = bpy.data.objects.get("COL_StairGuardSystem_NW_4FToRooftop")
    require(
        visual_guard is not None
        and collider_guard is not None
        and world_bounds(visual_guard)[0][1] >= 38.85 - TOLERANCE
        and world_bounds(collider_guard)[0][1] >= 38.82 - TOLERANCE,
        "屋上階段室の扉を塞ぐ短い到着手すりが残っています",
    )

    stair_system = bpy.data.objects.get("VIS_StairSystem_NW_4FToRooftop")
    interior_wall = bpy.data.objects.get("VIS_B03_InteriorWalls_F04")
    require(
        stair_system is not None
        and stair_system.type == "MESH"
        and interior_wall is not None
        and interior_wall.type == "MESH",
        "屋上北西階段と4階壁の表示形状がありません",
    )
    landing_side_owners = []
    for polygon in stair_system.data.polygons:
        points = [
            stair_system.matrix_world @ stair_system.data.vertices[index].co
            for index in polygon.vertices
        ]
        if all(abs(point.x + 6.75) <= TOLERANCE for point in points) and (
            point_in_yz_polygon(points, 44.00, 13.15)
        ):
            landing_side_owners.append(polygon.index)
    require(
        not landing_side_owners,
        "4階壁と同一平面の屋上階段踊り場側面が残っています: "
        f"{landing_side_owners}",
    )

    wall_side_owners = []
    for polygon in interior_wall.data.polygons:
        points = [
            interior_wall.matrix_world @ interior_wall.data.vertices[index].co
            for index in polygon.vertices
        ]
        if all(abs(point.x + 6.75) <= TOLERANCE for point in points) and (
            point_in_yz_polygon(points, 44.00, 13.15)
        ):
            wall_side_owners.append(polygon.index)
    require(
        len(wall_side_owners) == 1,
        "屋上階段踊り場側面を引き受ける4階壁が単一面ではありません: "
        f"{wall_side_owners}",
    )


def audit_structure_geometry() -> None:
    # 実装と同じ正本値ではなく、P1-STR-01～09の成果境界をここで検証する。
    wall_union_surfaces = audit_wall_union_surfaces()
    print(
        "B06_1_WALL_SURFACE_AUDIT="
        + json.dumps(wall_union_surfaces, ensure_ascii=False, sort_keys=True)
    )
    facility_walls = bpy.data.objects.get("VIS_RooftopFacilityWalls")
    require(
        facility_walls is not None and facility_walls.type == "MESH",
        "屋上施設の統合表示壁がありません",
    )
    facility_t_junctions, facility_non_axis_edges = mesh_t_junctions(
        facility_walls
    )
    require(
        not facility_t_junctions and not facility_non_axis_edges,
        "屋上施設表示壁にT-junctionまたは軸非整列edgeがあります: "
        f"t={facility_t_junctions[:40]}, edges={facility_non_axis_edges[:40]}",
    )
    require_unique_polygon_surfaces(
        ("VIS_RooftopFacilityWalls",),
        "屋上施設統合表示壁",
    )
    require_no_axis_aligned_coplanar_area(
        ("VIS_RooftopFacilityWalls",),
        "屋上施設統合表示壁",
        include_same_object=True,
    )
    audit_rooftop_stair_side_continuous_wall(facility_walls)
    audit_rooftop_hut_merged_with_school_wall(facility_walls)
    audit_rooftop_west_wall_floor_closure(facility_walls)
    audit_rooftop_facility_straight_south_front(facility_walls)
    band_relationships = audit_storey_band_relationships(
        list(bpy.data.objects)
    )
    require(
        band_relationships["required_length"] > 0.0
        and band_relationships["covered_length"]
        >= band_relationships["required_length"] - BAND_LENGTH_TOLERANCE,
        f"全階の必須廊下側色帯が100%被覆されていません: {band_relationships}",
    )
    require(
        band_relationships["forbidden_area"] <= TOLERANCE
        and band_relationships["overlap_area"] <= TOLERANCE,
        f"室内・外壁側の色帯または色帯同士の面積重複があります: "
        f"{band_relationships}",
    )
    require(
        band_relationships["manifold_error_count"] == 0
        and band_relationships["wall_support_checks"] > 0,
        f"階層色帯が閉じた実壁支持Meshではありません: {band_relationships}",
    )

    require_component_bounds(
        "VIS_Floor_CorridorCorner",
        (
            ((-12.6, 32.5, 0.0), (5.4, 45.5, 0.04)),
        ),
    )
    north_common_floor = bpy.data.objects["VIS_Floor_CorridorCorner"]
    expected_floor_outline = {
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
    }
    actual_floor_outline = {
        (round(vertex.co.x, 3), round(vertex.co.y, 3))
        for vertex in north_common_floor.data.vertices
        if math.isclose(vertex.co.z, 0.04, abs_tol=TOLERANCE)
    }
    require(
        actual_floor_outline == expected_floor_outline,
        "北西階段前と廊下の単一床外形が不正です",
    )
    require_unique_polygon_surfaces(
        ("VIS_Floor_CorridorCorner",),
        "北西階段前と廊下の床",
    )
    require_component_bounds(
        "VIS_B06_WestExtensionFloorFinish_F01",
        (
            ((-12.6, -7.0, 0.0), (-11.5, -3.5, 0.04)),
            ((-9.1, -7.0, 0.0), (0.0, -3.5, 0.04)),
            ((-11.5, -7.0, 0.0), (-9.1, -6.55, 0.04)),
            ((-11.5, -4.0, 0.0), (-9.1, -3.5, 0.04)),
        ),
    )
    elevator_shaft_boxes = (
        ((-11.8, -6.85, 0.0), (-11.5, -3.5, 14.25)),
        ((-11.5, -6.85, 0.0), (-8.65, -6.55, 14.25)),
        ((-11.5, -3.8, 0.0), (-8.65, -3.5, 14.25)),
        ((-8.65, -3.8, 0.0), (-6.0, -3.5, 14.4)),
        ((-12.45, -3.8, 0.0), (-11.8, -3.5, 14.4)),
        ((-9.1, -6.55, 0.0), (-8.65, -5.975, 14.25)),
        ((-9.1, -4.375, 0.0), (-8.65, -3.8, 14.25)),
        ((-9.1, -5.975, 2.4), (-8.65, -4.375, 3.6)),
        ((-9.1, -5.975, 6.0), (-8.65, -4.375, 7.2)),
        ((-9.1, -5.975, 9.6), (-8.65, -4.375, 10.8)),
        ((-9.1, -5.975, 13.2), (-8.65, -4.375, 14.25)),
        ((-11.8, -6.85, 14.25), (-8.65, -3.5, 14.4)),
    )
    shaft_visual = bpy.data.objects.get("VIS_B03_ElevatorShaftShell")
    shaft_collider = bpy.data.objects.get("COL_B03_ElevatorShaftShell")
    require(
        shaft_visual is not None
        and shaft_visual.type == "MESH"
        and shaft_collider is not None
        and shaft_collider.type == "MESH",
        "エレベーターシャフトの表示またはColliderがありません",
    )
    for minimum, maximum in elevator_shaft_boxes:
        center = (
            (minimum[0] + maximum[0]) / 2.0,
            (minimum[1] + maximum[1]) / 2.0,
            minimum[2] + min(0.2, (maximum[2] - minimum[2]) / 2.0),
        )
        owners = shared_wall_volume_owners(center)
        require(
            len(owners) == 1,
            f"エレベーターシャフト共有境界のVolume所有者が一意ではありません: "
            f"{center}/{owners}",
        )
    shaft_visual_minimum, shaft_visual_maximum = world_bounds(shaft_visual)
    require(
        shaft_visual_minimum[0] <= -11.8 + TOLERANCE
        and shaft_visual_minimum[1] <= -6.85 + TOLERANCE
        and shaft_visual_maximum[0] >= -6.0 - TOLERANCE
        and shaft_visual_maximum[1] >= -3.5 - TOLERANCE
        and shaft_visual_maximum[2] >= 14.4 - TOLERANCE,
        f"エレベーターシャフトの共有外形が不正です: "
        f"{tuple(shaft_visual_minimum)}/{tuple(shaft_visual_maximum)}",
    )
    front_face_x_coordinates = []
    for polygon in shaft_visual.data.polygons:
        normal = (
            shaft_visual.matrix_world.to_3x3().inverted().transposed()
            @ polygon.normal
        ).normalized()
        minimum, maximum = polygon_world_bounds(shaft_visual, polygon)
        if (
            normal.x > 1.0 - TOLERANCE
            and maximum.x > -9.0
            and minimum.y < -3.8 - TOLERANCE
        ):
            front_face_x_coordinates.append((minimum.x + maximum.x) / 2.0)
    require(
        front_face_x_coordinates
        and all(
            math.isclose(coordinate, -8.65, abs_tol=TOLERANCE)
            for coordinate in front_face_x_coordinates
        ),
        f"エレベーター正面壁が単一平面ではありません: "
        f"{sorted(set(round(value, 4) for value in front_face_x_coordinates))}",
    )
    require(
        bpy.data.objects.get("VIS_B03_ElevatorStairWall") is None
        and bpy.data.objects.get("COL_B03_ElevatorStairWall") is None,
        "北側接続壁と誤南壁を混在させた旧エレベーター壁Objectが残っています",
    )
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        north_connector_owners = shared_wall_volume_owners(
            (-7.36, -3.65, base_z + 1.0)
        )
        require(
            len(north_connector_owners) == 1,
            f"{floor}Fエレベーターホール～南西階段の北側接続壁がありません: "
            f"{north_connector_owners}",
        )
        wrong_south_wall_owners = shared_wall_volume_owners(
            (-7.36, -6.55, base_z + 1.0)
        )
        require(
            not wrong_south_wall_owners,
            f"{floor}Fに不要なエレベーター南側長壁が復活しています: "
            f"{wrong_south_wall_owners}",
        )
        rear_gap_cap_owners = shared_wall_volume_owners(
            (-12.10, -3.65, base_z + 1.0)
        )
        require(
            len(rear_gap_cap_owners) == 1,
            f"{floor}Fエレベーター後方空間の階段側閉塞壁がありません: "
            f"{rear_gap_cap_owners}",
        )
    elevator_car = bpy.data.objects.get("MRK_ElevatorCar_School")
    require(
        elevator_car is not None
        and close_tuple(tuple(elevator_car.location), (-10.3, -5.175, 10.8)),
        "エレベーターかご中心が拡張後の停止姿勢と一致しません",
    )
    car_visual = bpy.data.objects.get("VIS_ElevatorCar_School")
    car_occupancy = bpy.data.objects.get("VOL_ElevatorCarOccupancy_School")
    require(
        car_visual is not None
        and car_occupancy is not None
        and close_tuple(tuple(car_visual.dimensions), (2.64, 2.27, 2.42))
        and close_tuple(tuple(car_occupancy.dimensions), (2.08, 1.74, 2.06)),
        "エレベーターかごまたは占有Volumeが第8次再修正の寸法へ同期していません",
    )
    require_no_axis_aligned_coplanar_area(
        (
            "VIS_B03_ElevatorShaftShell",
            "VIS_B06_StairFloorEdgeCladding_South",
            "VIS_B06_WestExtensionFloorFinish_F01",
            "VIS_B03_Floor_F02",
            "VIS_B03_Floor_F03",
            "VIS_B03_Floor_F04",
            "VIS_ElevatorThresholdPlate_F01",
            "VIS_ElevatorThresholdPlate_F04",
            "VIS_ElevatorCar_School",
        ),
        "1F・4Fエレベーター敷居・床・かご・シャフト",
    )
    require_no_axis_aligned_coplanar_area(
        (
            "VIS_B03_GymRoofRamp",
            "VIS_B03_GymRoofRampUnderfill",
            "VIS_B03_GymRoofRampSideCladding",
            "VIS_B03_Floor_F03",
            "VIS_B03_ExteriorWalls_F02",
            "VIS_B03_GymBridgeCeiling",
        ),
        "3F体育館屋上スロープ足元・側面・床・壁",
    )
    require_no_axis_aligned_coplanar_area(
        (
            "VIS_Roof_North",
            "VIS_StairSystem_NW_4FToRooftop",
            "VIS_B03_StairNosing_NW_4FToRooftop",
        ),
        "4F～屋上北西階段・屋根・段前縁材",
    )

    bridge_infill = bpy.data.objects.get("VIS_B06_GymBridgeSideInfill")
    bridge_collider = bpy.data.objects.get("COL_B06_GymBridgeSideInfill")
    require(
        bridge_infill is not None and bridge_collider is not None,
        "体育館渡り廊下の側面充填がありません",
    )
    require(
        close_tuple(world_bounds(bridge_collider)[0], (39.30, 26.65, 3.60))
        and close_tuple(world_bounds(bridge_collider)[1], (43.50, 26.70, 6.60)),
        "体育館渡り廊下の表示・Collider境界が不正です",
    )

    require(
        bpy.data.objects.get("COL_B06_SchoolRoofEscapeCrateSides") is None,
        "屋上箱の側面登降を塞ぐ旧Colliderが残っています",
    )
    school_crate_envelope = bpy.data.objects.get(
        "COL_B03_SchoolRoofEscapeCrateRamp"
    )
    require(
        school_crate_envelope is not None
        and close_tuple(
            world_bounds(school_crate_envelope)[0], (-4.20, 10.70, 14.50)
        )
        and close_tuple(
            world_bounds(school_crate_envelope)[1], (-0.25, 14.30, 15.70)
        ),
        "屋上箱の正面・左右連続歩行外殻が不正です",
    )
    require(
        len(school_crate_envelope.data.vertices) == 36
        and len(school_crate_envelope.data.polygons) == 47
        and sum(
            polygon.normal.z >= math.cos(math.radians(45.0)) - TOLERANCE
            for polygon in school_crate_envelope.data.polygons
        )
        == 24,
        "屋上箱の正面・左右歩行面が連続していません",
    )
    crate_visual_names = tuple(
        f"VIS_B03_RooftopEscapeCrates_{color}"
        for color in ("Dark", "Light", "Gray")
    )
    require_unique_polygon_surfaces(crate_visual_names, "屋上箱表示")
    require(
        sum(
            len(mesh_component_world_bounds(bpy.data.objects[name]))
            for name in crate_visual_names
        )
        == 24,
        "屋上箱表示が体育館・学校各12セルの共通非重複外殻ではありません",
    )
    require(
        all(
            polygon.normal.z >= -TOLERANCE
            for name in crate_visual_names
            for polygon in bpy.data.objects[name].data.polygons
        ),
        "屋上箱と屋上床が重なる底面が残っています",
    )

    require(
        bpy.data.objects.get("VIS_B06_StairRampUnderfills_F01") is None,
        "1F階段下の旧別体板が残っています",
    )
    audit_all_stair_nosings()
    require(
        bpy.data.objects.get("VIS_B06_ElevatorCallPanel_F01") is None,
        "足元CallMat表示と重複する旧静的エレベーターパネルが残っています",
    )
    for floor in (1, 4):
        require(
            bpy.data.objects.get(
                f"VIS_ElevatorCallIndicator_Base_F{floor:02d}"
            )
            is not None
            and bpy.data.objects.get(
                f"VIS_ElevatorCallIndicator_Direction_F{floor:02d}"
            )
            is not None,
            f"{floor}Fエレベーターの足元点滅パネルがありません",
        )
    shaft_owner_faces = audit_elevator_shaft_north_wall_single_owner()
    shaft_trim_topology = audit_elevator_shaft_trimmed_visual_topology()
    print(
        "B06_1_ELEVATOR_SHAFT_NORTH_WALL_OWNERSHIP="
        + json.dumps(
            {
                "owner": "VIS_B03_ElevatorShaftShell",
                "owner_faces": shaft_owner_faces,
                "coplanar_overlap_area": 0.0,
                "trim_topology": shaft_trim_topology,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    for suffix, expected_faces in (("South", 6), ("North", 6), ("West", 3)):
        cladding = bpy.data.objects.get(
            f"VIS_B06_StairFloorEdgeCladding_{suffix}"
        )
        require(
            cladding is not None
            and cladding.type == "MESH"
            and len(cladding.data.polygons) == expected_faces
            and all(abs(polygon.normal.z) <= TOLERANCE for polygon in cladding.data.polygons),
            f"階段室の床スラブ側面被覆が不正です: {suffix}",
        )
    south_cladding = bpy.data.objects["VIS_B06_StairFloorEdgeCladding_South"]
    southwest_edge_bounds = []
    for polygon in south_cladding.data.polygons:
        normal = (
            south_cladding.matrix_world.to_3x3().inverted().transposed()
            @ polygon.normal
        ).normalized()
        minimum, maximum = polygon_world_bounds(south_cladding, polygon)
        if normal.y > 1.0 - TOLERANCE:
            southwest_edge_bounds.append((minimum, maximum))
    expected_southwest_edge_bounds = {
        ((-12.6, -3.5, base_z - 0.15), (-6.0, -3.5, base_z))
        for base_z in (3.6, 7.2, 10.8)
    }
    actual_southwest_edge_bounds = {
        (
            tuple(round(value, 5) for value in minimum),
            tuple(round(value, 5) for value in maximum),
        )
        for minimum, maximum in southwest_edge_bounds
    }
    require(
        actual_southwest_edge_bounds == expected_southwest_edge_bounds,
        "南西階段から見える床断面が壁色の単一面へ置換されていません",
    )
    require_no_axis_aligned_coplanar_area(
        (
            "VIS_B06_StairFloorEdgeCladding_South",
            "VIS_StairSystem_SW_2FTo3F",
            "VIS_StairSystem_SW_3FTo4F",
        ),
        "南西階段の壁色床断面と斜め支持板",
    )
    for suffix, base_z in (("2FTo3F", 3.6), ("3FTo4F", 7.2)):
        stair = bpy.data.objects[f"VIS_StairSystem_SW_{suffix}"]
        expected_support_face = tuple(
            sorted(
                tuple(round(value, 5) for value in point)
                for point in (
                    (-10.2, -1.1, base_z + 2.4),
                    (-6.0, -1.1, base_z),
                    (-6.21, -1.1, base_z),
                    (-10.2, -1.1, base_z + 2.28),
                )
            )
        )
        support_faces = [
            polygon
            for polygon in stair.data.polygons
            if polygon_world_key(stair, polygon) == expected_support_face
        ]
        require(
            len(support_faces) == 1,
            f"南西階段の斜め支持板clip輪郭が維持されていません: {suffix}",
        )
        support_normal = (
            stair.matrix_world.to_3x3().inverted().transposed()
            @ support_faces[0].normal
        ).normalized()
        require(
            support_normal.y > 1.0 - TOLERANCE,
            f"南西階段の斜め支持板内面の法線が不正です: {suffix}",
        )
    for floor in (2, 3, 4):
        floor_object = bpy.data.objects[f"VIS_B03_Floor_F{floor:02d}"]
        exposed_floor_edges = [
            polygon
            for polygon in floor_object.data.polygons
            for minimum, maximum in (polygon_world_bounds(floor_object, polygon),)
            if math.isclose(minimum.y, -3.5, abs_tol=TOLERANCE)
            and math.isclose(maximum.y, -3.5, abs_tol=TOLERANCE)
            and maximum.z - minimum.z > TOLERANCE
        ]
        require(
            not exposed_floor_edges,
            f"{floor}F床に南西階段から見える茶色い断面が残っています",
        )
    first_transition_names = tuple(
        f"VIS_{part}_{stair}"
        for stair in ("NW", "NE", "SW")
        for part in ("Stairs", "StairsUpper")
    )
    for object_name in first_transition_names:
        stair = bpy.data.objects.get(object_name)
        require(stair is not None and stair.type == "MESH", f"階段表示がありません: {object_name}")
        downward_faces = [
            polygon
            for polygon in stair.data.polygons
            if polygon.normal.z < -TOLERANCE
        ]
        is_upper = "StairsUpper" in object_name
        expected_step_count = 8 if is_upper else 16
        upward_treads = [
            polygon
            for polygon in stair.data.polygons
            if polygon.normal.z > 1.0 - TOLERANCE
        ]
        require(
            len(upward_treads) == expected_step_count + (1 if is_upper else 0),
            f"階段の段板数が不正です: {object_name}",
        )
        require(
            len(stair.data.polygons)
            == expected_step_count * 2 + (8 if is_upper else 6),
            f"階段の段面または斜め支持板の面数が不正です: {object_name}",
        )
        require(
            len(downward_faces) == (2 if is_upper else 1),
            f"階段段裏の連続斜め支持板が一意ではありません: {object_name}",
        )
        require(
            sum(
                TOLERANCE < polygon.normal.z < 1.0 - TOLERANCE
                for polygon in stair.data.polygons
            )
            == 1,
            f"階段段裏の斜め支持板上面が一意ではありません: {object_name}",
        )
    for stair_name in ("NW", "NE", "SW"):
        require(
            math.isclose(
                world_bounds(bpy.data.objects[f"VIS_StairsUpper_{stair_name}"])[1][2],
                3.60,
                abs_tol=TOLERANCE,
            ),
            f"1F→2F階段の到着床高が不正です: {stair_name}",
        )
        upper_stair = bpy.data.objects[f"VIS_StairsUpper_{stair_name}"]
        sloped_runs = sorted(
            round(
                max(
                    polygon_world_bounds(upper_stair, polygon)[1].x
                    - polygon_world_bounds(upper_stair, polygon)[0].x,
                    polygon_world_bounds(upper_stair, polygon)[1].y
                    - polygon_world_bounds(upper_stair, polygon)[0].y,
                ),
                3,
            )
            for polygon in upper_stair.data.polygons
            if TOLERANCE < polygon.normal.z < 1.0 - TOLERANCE
        )
        require(
            sloped_runs == [2.4],
            f"1F→2F階段上側8段が2.4mの勾配ではありません: {stair_name}/{sloped_runs}",
        )

    for upper_stair_name in (
        "VIS_StairSystem_NW_2FTo3F",
        "VIS_StairSystem_NW_3FTo4F",
        "VIS_StairSystem_NW_4FToRooftop",
        "VIS_StairSystem_NE_2FTo3F",
        "VIS_StairSystem_NE_3FTo4F",
        "VIS_StairSystem_SW_2FTo3F",
        "VIS_StairSystem_SW_3FTo4F",
    ):
        upper_stair = bpy.data.objects[upper_stair_name]
        sloped_runs = sorted(
            round(
                max(
                    polygon_world_bounds(upper_stair, polygon)[1].x
                    - polygon_world_bounds(upper_stair, polygon)[0].x,
                    polygon_world_bounds(upper_stair, polygon)[1].y
                    - polygon_world_bounds(upper_stair, polygon)[0].y,
                ),
                3,
            )
            for polygon in upper_stair.data.polygons
            if TOLERANCE < polygon.normal.z < 1.0 - TOLERANCE
            and max(
                polygon_world_bounds(upper_stair, polygon)[1].x
                - polygon_world_bounds(upper_stair, polygon)[0].x,
                polygon_world_bounds(upper_stair, polygon)[1].y
                - polygon_world_bounds(upper_stair, polygon)[0].y,
            )
            > 1.0
        )
        expected_sloped_runs = (
            {2.25, 2.4, 4.2}
            if upper_stair_name == "VIS_StairSystem_NW_4FToRooftop"
            else {2.4, 4.2}
        )
        require(
            set(sloped_runs) == expected_sloped_runs,
            f"上階階段の上下勾配が正規寸法ではありません: "
            f"{upper_stair_name}/{sloped_runs}/{sorted(expected_sloped_runs)}",
        )

    require_unique_polygon_surfaces(
        ("VIS_B03_Floor_F02", "VIS_StairsUpper_SW"),
        "南西階段2F到着床",
    )

    require(
        bpy.data.objects.get("VIS_B06_RooftopStairExitRamp") is None
        and bpy.data.objects.get("COL_RooftopStairExitRamp") is None,
        "屋上階段接続の旧別体Rampが残っています",
    )
    roof_visual = bpy.data.objects.get("VIS_Roof_North")
    roof_collider = bpy.data.objects.get("COL_Roof_North")
    stair_visual = bpy.data.objects.get("VIS_StairSystem_NW_4FToRooftop")
    stair_collider = bpy.data.objects.get("COL_StairSystem_NW_4FToRooftop")
    require(
        roof_visual is not None
        and roof_collider is not None
        and stair_visual is not None
        and stair_collider is not None,
        "屋上床または屋上到着Rampがありません",
    )
    expected_connector_bounds = (
        Vector((-9.0, 38.6, 14.4)),
        Vector((-6.75, 38.9, 14.5)),
    )
    require(
        any(
            (minimum - expected_connector_bounds[0]).length <= TOLERANCE
            and (maximum - expected_connector_bounds[1]).length <= TOLERANCE
            and polygon.normal.z > TOLERANCE
            for polygon in stair_collider.data.polygons
            for minimum, maximum in (polygon_world_bounds(stair_collider, polygon),)
        ),
        "屋上到着Rampが階段Colliderと連続していません",
    )
    require_unique_polygon_surfaces(
        ("VIS_Roof_North", "VIS_StairSystem_NW_4FToRooftop"),
        "屋上階段接続表示",
    )
    expected_collider_contact_surface = tuple(
        sorted(
            (
                (-9.0, 38.6, 14.4),
                (-9.0, 38.6, 14.5),
                (-6.75, 38.6, 14.4),
                (-6.75, 38.6, 14.5),
            )
        )
    )
    shared_collider_surfaces = {
        polygon_world_key(roof_collider, polygon)
        for polygon in roof_collider.data.polygons
    } & {
        polygon_world_key(stair_collider, polygon)
        for polygon in stair_collider.data.polygons
    }
    require(
        shared_collider_surfaces == {expected_collider_contact_surface},
        "屋上床と階段Colliderの接触面が正規境界ではありません: "
        f"{sorted(shared_collider_surfaces)}",
    )
    require(
        all(
            close_tuple(actual, expected)
            for actual, expected in zip(
                world_bounds(roof_visual),
                world_bounds(roof_collider),
                strict=True,
            )
        ),
        "屋上床の表示・Collider外形が一致していません",
    )
    expected_suppressed_contact_bounds = {
        (
            (minimum_x, minimum_y, minimum_z),
            (maximum_x, maximum_y, maximum_z),
        )
        for minimum_x, minimum_y, minimum_z, maximum_x, maximum_y, maximum_z in (
            (-9.0, 38.6, 14.4, -9.0, 38.9, 14.5),
            (-9.0, 38.6, 14.4, -6.75, 38.6, 14.5),
            (-6.75, 45.35, 14.4, -6.45, 45.35, 14.5),
            (-6.45, 38.6, 14.4, -6.45, 38.9, 14.5),
            (-6.45, 38.9, 14.4, -6.45, 39.2, 14.5),
            (-6.45, 39.2, 14.4, -6.45, 45.35, 14.5),
        )
    }
    visual_surface_bounds = {
        (
            tuple(round(value, 5) for value in minimum),
            tuple(round(value, 5) for value in maximum),
        )
        for polygon in roof_visual.data.polygons
        for minimum, maximum in (polygon_world_bounds(roof_visual, polygon),)
    }
    require(
        expected_suppressed_contact_bounds.isdisjoint(visual_surface_bounds),
        "屋上表示床に階段・直線壁が所有する接触面が残っています: "
        f"{sorted(expected_suppressed_contact_bounds & visual_surface_bounds)}",
    )
    collider_surface_bounds = {
        (
            tuple(round(value, 5) for value in minimum),
            tuple(round(value, 5) for value in maximum),
        )
        for polygon in roof_collider.data.polygons
        for minimum, maximum in (polygon_world_bounds(roof_collider, polygon),)
    }
    uncovered_collider_contacts = []
    for expected_minimum, expected_maximum in sorted(
        expected_suppressed_contact_bounds
    ):
        plane_axes = [
            axis
            for axis in range(3)
            if abs(expected_maximum[axis] - expected_minimum[axis])
            <= TOLERANCE
        ]
        require(
            len(plane_axes) == 1,
            f"屋上床Collider接触境界が平面ではありません: "
            f"{(expected_minimum, expected_maximum)}",
        )
        plane_axis = plane_axes[0]
        span_axes = tuple(axis for axis in range(3) if axis != plane_axis)
        expected_area = math.prod(
            expected_maximum[axis] - expected_minimum[axis]
            for axis in span_axes
        )
        covered_area = 0.0
        for actual_minimum, actual_maximum in collider_surface_bounds:
            if (
                abs(actual_minimum[plane_axis] - expected_minimum[plane_axis])
                > TOLERANCE
                or abs(actual_maximum[plane_axis] - expected_maximum[plane_axis])
                > TOLERANCE
            ):
                continue
            overlaps = [
                min(actual_maximum[axis], expected_maximum[axis])
                - max(actual_minimum[axis], expected_minimum[axis])
                for axis in span_axes
            ]
            if all(overlap > TOLERANCE for overlap in overlaps):
                covered_area += math.prod(overlaps)
        if covered_area < expected_area - TOLERANCE:
            uncovered_collider_contacts.append(
                (
                    (expected_minimum, expected_maximum),
                    round(expected_area, 6),
                    round(covered_area, 6),
                )
            )
    require(
        not uncovered_collider_contacts,
        "屋上床Colliderが閉じた接触境界を所有していません: "
        f"{uncovered_collider_contacts}",
    )
    roof_collider_mesh = bmesh.new()
    roof_collider_mesh.from_mesh(roof_collider.data)
    roof_collider_non_manifold = [
        edge for edge in roof_collider_mesh.edges if len(edge.link_faces) != 2
    ]
    roof_collider_mesh.free()
    require(
        not roof_collider_non_manifold,
        "屋上床Colliderが閉じた形状ではありません",
    )

    for object_name in (
        "VIS_StairSystem_NW_4FToRooftop",
        "COL_StairSystem_NW_4FToRooftop",
        "VIS_B03_StairNosing_NW_4FToRooftop",
    ):
        obj = bpy.data.objects.get(object_name)
        require(
            obj is not None
            and obj.type == "MESH"
            and math.isclose(world_bounds(obj)[1][0], -6.75, abs_tol=TOLERANCE),
            f"屋上到着階段の東端が直線壁x=-6.75に揃っていません: {object_name}",
        )

    facility_shell = bpy.data.objects.get("COL_RooftopFacilityShell")
    require(
        facility_shell is not None and facility_shell.type == "MESH",
        "屋上施設Colliderがありません",
    )
    facility_components = mesh_component_world_bounds(facility_shell)
    facility_wall_components = [
        bounds for bounds in facility_components if bounds[0].z < 16.85
    ]
    facility_roof_components = [
        bounds for bounds in facility_components if bounds[0].z >= 16.85
    ]
    require(
        len(facility_components) == 15
        and len(facility_wall_components) == 12
        and len(facility_roof_components) == 3,
        "屋上施設Colliderが12壁+3屋根ではありません: "
        f"all={len(facility_components)}, walls={len(facility_wall_components)}, "
        f"roofs={len(facility_roof_components)}",
    )
    require(
        any(
            close_tuple(tuple(minimum), (-12.75, 38.5, 14.4))
            and close_tuple(tuple(maximum), (-12.45, 38.9, 16.9))
            for minimum, maximum in facility_wall_components
        ),
        "校舎西壁と屋上小屋を床境界から閉じる壁がありません",
    )
    require(
        any(
            close_tuple(tuple(minimum), (-6.75, 38.5, 14.4))
            and close_tuple(tuple(maximum), (-6.45, 45.35, 16.9))
            for minimum, maximum in facility_wall_components
        ),
        "4階から屋上まで連続するx[-6.75,-6.45]の施設壁がありません",
    )

    expected_floor_faces = {
        "VIS_Floor_RooftopChangingRoom_M": (
            ((0.0, -1.0, 0.0), (-5.4, 38.5, 14.5), (-4.2, 38.5, 14.53)),
            ((0.0, 0.0, 1.0), (-6.45, 38.5, 14.53), (-2.1, 45.35, 14.53)),
        ),
        "VIS_Floor_RooftopChangingRoom_F": (
            ((0.0, -1.0, 0.0), (-0.9, 38.5, 14.5), (0.3, 38.5, 14.53)),
            ((0.0, 0.0, 1.0), (-2.1, 38.5, 14.53), (2.4, 45.35, 14.53)),
        ),
    }
    for object_name, expected_faces in expected_floor_faces.items():
        obj = bpy.data.objects.get(object_name)
        require(
            obj is not None and obj.type == "MESH",
            f"屋上更衣室床がありません: {object_name}",
        )
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        actual_faces = []
        for polygon in obj.data.polygons:
            normal = (normal_matrix @ polygon.normal).normalized()
            minimum, maximum = polygon_world_bounds(obj, polygon)
            actual_faces.append(
                (
                    tuple(round(value, 5) for value in normal),
                    tuple(round(value, 5) for value in minimum),
                    tuple(round(value, 5) for value in maximum),
                )
            )
        require(
            sorted(actual_faces) == sorted(expected_faces),
            f"屋上更衣室床が上面+実開口南riserの2面ではありません: "
            f"{object_name}/{actual_faces}",
        )

    require_no_axis_aligned_coplanar_area(
        (
            "VIS_RooftopFacilityWalls",
            "VIS_RooftopFacilityRoofs",
            "VIS_Roof_North",
            "VIS_StairSystem_NW_4FToRooftop",
            "VIS_B03_StairNosing_NW_4FToRooftop",
            "VIS_Floor_RooftopChangingRoom_M",
            "VIS_Floor_RooftopChangingRoom_F",
        ),
        "屋上施設壁・屋根・階段・更衣室床",
    )

    changing_area = bpy.data.objects.get(
        "VOL_LocationArea_AREA_CHANGING_ROOM_P01"
    )
    require(
        changing_area is not None
        and changing_area.type == "MESH"
        and close_tuple(world_bounds(changing_area)[0], (-6.45, 38.5, 14.35))
        and close_tuple(world_bounds(changing_area)[1], (2.4, 45.5, 17.0)),
        "更衣室Areaがx=-6.45の室内境界へ揃っていません",
    )
    require(
        bpy.data.objects.get("VIS_B03_StoreyBand_Roof") is None
        and bpy.data.objects.get("COL_B03_StoreyBand_Roof") is None,
        "屋上に存在しない階層ラインが追加されています",
    )
    west_roof = bpy.data.objects.get("COL_Roof_West")
    require(
        west_roof is not None and len(west_roof.data.vertices) == 24,
        "屋上箱Rampの側面Nav境界が一意な3区間ではありません",
    )

    right_angle_objects = tuple(
        obj.name
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and obj.name.startswith(
            (
                "VIS_B03_ExteriorWalls_F",
                "VIS_B03_InteriorWalls_F",
                "VIS_B03_GymExteriorWalls",
                "VIS_B06_GymBridgeSideInfill",
                "VIS_RooftopFacilityWalls",
                "VIS_Wall_",
            )
        )
    )
    diagonal_faces = []
    for object_name in right_angle_objects:
        obj = bpy.data.objects[object_name]
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for polygon in obj.data.polygons:
            normal = (normal_matrix @ polygon.normal).normalized()
            axis_alignment = max(abs(normal.x), abs(normal.y), abs(normal.z))
            if axis_alignment < 1.0 - TOLERANCE:
                diagonal_faces.append((object_name, polygon.index, tuple(normal)))
    require(
        not diagonal_faces,
        f"学校壁に90度角ではない面があります: {diagonal_faces}",
    )
    audit_unique_wall_corner_contacts(right_angle_objects)
    audit_geometry_budgets()


def audit_unique_wall_corner_contacts(object_names: tuple[str, ...]) -> None:
    components = [
        (object_name, minimum, maximum)
        for object_name in object_names
        for minimum, maximum in mesh_component_world_bounds(
            bpy.data.objects[object_name]
        )
    ]
    horizontal = [
        component
        for component in components
        if component[2].x - component[1].x > 0.30 + TOLERANCE
        and component[2].y - component[1].y <= 0.30 + TOLERANCE
    ]
    vertical = [
        component
        for component in components
        if component[2].y - component[1].y > 0.30 + TOLERANCE
        and component[2].x - component[1].x <= 0.30 + TOLERANCE
    ]
    overlaps = []
    collinear_overlaps = []
    centerline_ends = []
    for candidates, run_axis, perpendicular_axis in (
        (horizontal, 0, 1),
        (vertical, 1, 0),
    ):
        for first_index, first in enumerate(candidates):
            first_name, first_minimum, first_maximum = first
            first_center = (
                first_minimum[perpendicular_axis]
                + first_maximum[perpendicular_axis]
            ) / 2.0
            for second_name, second_minimum, second_maximum in candidates[
                first_index + 1 :
            ]:
                second_center = (
                    second_minimum[perpendicular_axis]
                    + second_maximum[perpendicular_axis]
                ) / 2.0
                if abs(first_center - second_center) > TOLERANCE:
                    continue
                if (
                    min(first_maximum.z, second_maximum.z)
                    - max(first_minimum.z, second_minimum.z)
                    <= TOLERANCE
                ):
                    continue
                overlap = min(
                    first_maximum[run_axis], second_maximum[run_axis]
                ) - max(first_minimum[run_axis], second_minimum[run_axis])
                if overlap > TOLERANCE:
                    collinear_overlaps.append(
                        (first_name, second_name, round(overlap, 5))
                    )
    for horizontal_name, horizontal_minimum, horizontal_maximum in horizontal:
        horizontal_center_y = (horizontal_minimum.y + horizontal_maximum.y) / 2.0
        for vertical_name, vertical_minimum, vertical_maximum in vertical:
            if (
                min(horizontal_maximum.z, vertical_maximum.z)
                - max(horizontal_minimum.z, vertical_minimum.z)
                <= TOLERANCE
            ):
                continue
            vertical_center_x = (vertical_minimum.x + vertical_maximum.x) / 2.0
            x_overlap = min(horizontal_maximum.x, vertical_maximum.x) - max(
                horizontal_minimum.x, vertical_minimum.x
            )
            y_overlap = min(horizontal_maximum.y, vertical_maximum.y) - max(
                horizontal_minimum.y, vertical_minimum.y
            )
            if x_overlap > TOLERANCE and y_overlap > TOLERANCE:
                overlaps.append(
                    (
                        horizontal_name,
                        vertical_name,
                        round(x_overlap, 5),
                        round(y_overlap, 5),
                    )
                )
            for endpoint in (horizontal_minimum.x, horizontal_maximum.x):
                if (
                    abs(endpoint - vertical_center_x) <= TOLERANCE
                    and vertical_minimum.y - TOLERANCE
                    <= horizontal_center_y
                    <= vertical_maximum.y + TOLERANCE
                ):
                    centerline_ends.append(
                        (horizontal_name, vertical_name, "X", round(endpoint, 5))
                    )
            for endpoint in (vertical_minimum.y, vertical_maximum.y):
                if (
                    abs(endpoint - horizontal_center_y) <= TOLERANCE
                    and horizontal_minimum.x - TOLERANCE
                    <= vertical_center_x
                    <= horizontal_maximum.x + TOLERANCE
                ):
                    centerline_ends.append(
                        (horizontal_name, vertical_name, "Y", round(endpoint, 5))
                    )
    require(not overlaps, f"壁角に重複体積があります: {overlaps[:20]}")
    require(
        not collinear_overlaps,
        f"同軸壁区間に重複体積があります: {collinear_overlaps[:20]}",
    )
    require(
        not centerline_ends,
        f"壁端が相手壁の中心線で止まっています: {centerline_ends[:20]}",
    )


def main() -> None:
    require(
        Path(bpy.data.filepath).resolve() == BLEND_PATH.resolve(),
        f"監査対象.blendが不正です: {bpy.data.filepath}",
    )
    arguments = parse_arguments()
    if arguments.mode == "write-before":
        write_before()
    elif arguments.mode == "geometry-only":
        audit_structure_geometry()
        print("B06_1_GEOMETRY_AUDIT_RESULT=ok")
    elif arguments.mode == "report-diff":
        report_diff()
    else:
        compare_after()


if __name__ == "__main__":
    main()
