from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
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
    storey_band_box_bounds,
)


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
EXPECTED_GENERATOR_VERSION = "b06-1-school-structure-polish-v22"
TOLERANCE = 1.0e-5

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
EXPECTED_MISSING_OBJECTS: frozenset[str] = frozenset(
    {
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
            if first[0] == second[0] or first[2] != second[2]:
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
        f"{label}に別Object間の同一平面重複があります: {overlaps[:40]}",
    )


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
    expected_changed = EXPECTED_CHANGED_OBJECTS | EXPECTED_FIFTH_REWORK_CHANGED_OBJECTS
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


def audit_structure_geometry() -> None:
    # 実装と同じ正本値ではなく、P1-STR-01～09の成果境界をここで検証する。
    band_relationships = audit_storey_band_relationships(
        list(bpy.data.objects)
    )
    require(
        band_relationships["backing_checks"] > 0
        and band_relationships["band_depth_checks"]
        == band_relationships["backing_checks"],
        f"廊下側階層色帯の実壁支持数が不正です: {band_relationships}",
    )
    band_box_count = 0
    band_corner_join_count = 0
    for floor in range(1, 5):
        band = bpy.data.objects.get(f"VIS_B03_StoreyBand_F{floor:02d}")
        require(band is not None and band.type == "MESH", f"{floor}F階層色帯がありません")
        boxes = storey_band_box_bounds(band)
        require(boxes, f"{floor}F廊下側階層色帯の区間がありません")
        for minimum, maximum in boxes:
            extent_x = maximum[0] - minimum[0]
            extent_y = maximum[1] - minimum[1]
            band_normal_extent_maximum = 0.013
            is_corner_join = (
                extent_x <= band_normal_extent_maximum
                and extent_y <= band_normal_extent_maximum
            )
            is_wall_segment = (
                extent_x <= band_normal_extent_maximum
            ) != (
                extent_y <= band_normal_extent_maximum
            )
            require(
                is_corner_join or is_wall_segment,
                f"{floor}F階層色帯に壁面・角接合面以外の成分があります: "
                f"{minimum}/{maximum}",
            )
            if is_corner_join:
                band_corner_join_count += 1
        band_box_count += len(boxes)
    require(
        band_box_count
        == band_relationships["backing_checks"]
        + band_relationships["corner_join_checks"],
        f"階層色帯の独立監査が全出力部品を網羅していません: "
        f"{band_box_count}/{band_relationships}",
    )
    require(
        band_corner_join_count == band_relationships["corner_join_checks"],
        f"同じ共用空間へ向く直交角接合面の監査数が一致しません: "
        f"{band_corner_join_count}/{band_relationships}",
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
            ((-11.5, -7.0, 0.0), (-9.1, -6.4, 0.04)),
            ((-11.5, -4.0, 0.0), (-9.1, -3.5, 0.04)),
        ),
    )
    elevator_shaft_boxes = (
        ((-11.8, -6.85, 0.0), (-11.5, -3.5, 14.25)),
        ((-11.5, -6.85, 0.0), (-8.72, -6.55, 14.25)),
        ((-11.5, -4.0, 0.0), (-8.72, -3.5, 14.25)),
        ((-9.1, -6.55, 0.0), (-8.72, -5.9, 14.25)),
        ((-9.1, -4.3, 0.0), (-8.72, -4.0, 14.25)),
        ((-9.1, -5.9, 2.4), (-8.8, -4.3, 3.6)),
        ((-9.1, -5.9, 6.0), (-8.8, -4.3, 7.2)),
        ((-9.1, -5.9, 9.6), (-8.8, -4.3, 10.8)),
        ((-9.1, -5.9, 13.2), (-8.8, -4.3, 14.25)),
        ((-11.8, -6.85, 14.25), (-8.72, -3.5, 14.4)),
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
        and shaft_visual_maximum[0] >= -8.72 - TOLERANCE
        and shaft_visual_maximum[1] >= -3.5 - TOLERANCE
        and shaft_visual_maximum[2] >= 14.4 - TOLERANCE,
        f"エレベーターシャフトの共有外形が不正です: "
        f"{tuple(shaft_visual_minimum)}/{tuple(shaft_visual_maximum)}",
    )
    require(
        bpy.data.objects.get("VIS_B03_ElevatorStairWall") is None
        and bpy.data.objects.get("COL_B03_ElevatorStairWall") is None,
        "第8次再修正で削除した長いエレベーター階段側壁が残っています",
    )
    elevator_car = bpy.data.objects.get("MRK_ElevatorCar_School")
    require(
        elevator_car is not None
        and close_tuple(tuple(elevator_car.location), (-10.3, -5.1, 10.8)),
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
            "VIS_B06_WestExtensionFloorFinish_F01",
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
        bpy.data.objects.get("VIS_B06_ElevatorCallPanel_F01") is not None,
        "1Fエレベーター呼出パネルがありません",
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
        require(
            set(sloped_runs) == {2.4, 4.2},
            f"上階階段の上下勾配が2.4m／4.2mではありません: "
            f"{upper_stair_name}/{sloped_runs}",
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
        Vector((-6.6, 38.9, 14.5)),
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
    require_unique_polygon_surfaces(
        ("COL_Roof_North", "COL_StairSystem_NW_4FToRooftop"),
        "屋上階段接続Collider",
    )
    require(
        len(roof_visual.data.vertices) == len(roof_collider.data.vertices)
        and len(roof_visual.data.polygons) == len(roof_collider.data.polygons),
        "屋上床の表示・Collider切り欠きが一致していません",
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
