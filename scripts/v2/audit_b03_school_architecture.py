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
    accessor_payload,
    collect_used_accessor_indices,
    material_uses_texture,
    read_glb,
)
from build_b03_school_interiors import swatch_uv


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
    "6DD2782329851F345C01D750D592A96C5C49DC2092FD12F03509B8804F420135"
)
EXPECTED_PROP_LIBRARY_SHA256 = (
    "FAEBDD4CEFE2C80BE254021BFE151B975AADF5A3922ADCAD0B8958B96C30F7DF"
)
LINK_PATTERN = re.compile(r"^LNK_(.+)_([AB])$")

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
    "Gym_North_02": (1,),
    "Gym_West_01": (4,),
    "Gym_West_02": (2,),
    "Gym_West_03": (1,),
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
    actual.sort()
    expected.sort()
    for actual_bounds, expected_bounds in zip(actual, expected, strict=True):
        require(
            bounds_match(actual_bounds, expected_bounds),
            f"箱形状監査対象の位置が不正です: {object_name}/{actual_bounds}/{expected_bounds}",
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


def bounds_match(
    actual: tuple[tuple[float, float, float], tuple[float, float, float]],
    expected: tuple[tuple[float, float, float], tuple[float, float, float]],
) -> bool:
    return all(
        abs(actual[bound][axis] - expected[bound][axis]) <= 1e-5
        for bound in range(2)
        for axis in range(3)
    )


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


def expected_storey_band_boxes(
    floor: int,
    base_z: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    west_classroom_openings = (
        ((3.5, 4.7), (10.7, 11.9), (13.1, 14.3), (30.7, 31.9))
        if floor == 1
        else ((3.5, 4.7), (13.1, 14.3), (21.9, 23.1), (30.7, 31.9))
    )
    west_window_openings = ((-2.5, 2.5),) if floor == 1 else ()
    north_classroom_openings = (
        (6.0, 7.2),
        (21.6, 22.8),
        (24.0, 25.2),
        (39.6, 40.8),
    )
    north_window_openings = ((0.15, 5.4), (39.4, 43.4)) if floor == 1 else ()
    z0, z1 = base_z + 0.15, base_z + 0.25
    boxes = [
        ((-3.35, start, z0), (-3.33, end, z1))
        for start, end in expected_band_segments(2.5, 32.5, west_classroom_openings)
    ]
    boxes.extend(
        ((-0.17, start, z0), (-0.15, end, z1))
        for start, end in expected_band_segments(-3.5, 32.5, west_window_openings)
    )
    boxes.extend(
        ((start, 36.33, z0), (end, 36.35, z1))
        for start, end in expected_band_segments(-6.6, 41.4, north_classroom_openings)
    )
    boxes.extend(
        ((start, 32.65, z0), (end, 32.67, z1))
        for start, end in expected_band_segments(0.0, 47.4, north_window_openings)
    )
    return boxes


def audit_acceptance_visuals(objects: list[bpy.types.Object]) -> dict[str, int]:
    atlas_rgb_cells = audit_architecture_atlas_rgb()
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
    for object_name, swatch in expected_swatches.items():
        require_architecture_swatch(object_name, swatch)

    trim_components = audit_box_components(
        "VIS_B03_GymTrim",
        [
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
                ((-3.47, 36.41, base_z + 0.02), (-3.39, 36.45, base_z + 3.50)),
                ((-6.60, 36.41, base_z + 0.02), (-6.52, 36.45, base_z + 3.50)),
                ((41.32, 36.41, base_z + 0.02), (41.40, 36.45, base_z + 3.50)),
            ],
        )

    floor_panels = (
        ((-6.0, -3.5), (0.0, 32.5)),
        ((-12.6, 2.5), (-6.0, 32.5)),
        ((-6.6, 32.5), (41.4, 45.5)),
        ((-12.6, 32.5), (-6.6, 38.9)),
        ((41.4, 32.5), (47.4, 38.9)),
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
        for prefix in ("VIS", "COL"):
            floor_component_count += audit_box_components(
                f"{prefix}_B03_Floor_F{floor:02d}",
                list(expected_floor),
            )

    first_floor_groups = {
        "West": tuple(floor_panels[index] for index in (0, 1, 3)),
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
    }
    present_removed = sorted(removed_objects & {obj.name for obj in objects})
    require(not present_removed, f"閉鎖または重複表示面が残っています: {present_removed}")

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
            if floor == 2:
                require_box_component(
                    wall_name,
                    ((5.25, 36.5, base_z), (5.55, 45.5, base_z + 3.6)),
                )
        require_box_component(
            f"VIS_B03_DoorLeaves_F{floor:02d}",
            ((22.71, 35.35, base_z), (22.79, 36.45, base_z + 2.3)),
        )

    for prefix in ("VIS", "COL"):
        require_point_in_box_component(
            f"{prefix}_B03_ExteriorWalls_F01",
            (9.55, 32.5, 1.7),
        )

    return {
        "atlas_rgb_cells": atlas_rgb_cells,
        "swatches": len(expected_swatches) + len(lintels) + 2,
        "trim_components": trim_components,
        "floor_components": floor_component_count,
        "f01_stair_classroom_boundary_checks": f01_boundary_checks,
        "interfloor_structure_components": structure_component_count,
        "removed_overlap_objects": len(removed_objects),
    }


def read_glb_json(path: Path) -> dict[str, object]:
    with path.open("rb") as stream:
        header = stream.read(12)
        magic, version, total_length = struct.unpack("<4sII", header)
        require(magic == b"glTF", "GLB magicが不正です")
        require(version == 2, f"GLB versionが2ではありません: {version}")
        require(total_length == path.stat().st_size, "GLB header長が実容量と不一致です")
        chunk_length, chunk_type = struct.unpack("<II", stream.read(8))
        require(chunk_type == 0x4E4F534A, "GLB先頭chunkがJSONではありません")
        return json.loads(stream.read(chunk_length).decode("utf-8"))


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
        if match is None:
            continue
        link_id, endpoint = match.groups()
        pairs[link_id][endpoint] = obj
        require(obj.type == "EMPTY", f"LNK_*がEmptyではありません: {obj.name}")
        require(obj.get("hs_id") == link_id, f"LNK名とhs_idが不一致です: {obj.name}")
        require(obj.get("hs_endpoint") == endpoint, f"LNK名と端点が不一致です: {obj.name}")
        require(obj.get("hs_bidirectional") is True, f"LNKが双方向ではありません: {obj.name}")
        require(
            abs(float(obj.get("hs_link_radius_m")) - 0.54) <= 1e-9,
            f"LNK半径が0.54mではありません: {obj.name}",
        )
    expected_pairs = 60
    require(len(pairs) == expected_pairs, f"特殊接続が{expected_pairs}組ではありません: {len(pairs)}")
    window_colliders = {
        "bit-window-"
        + obj.name.removeprefix("COL_HumanOnly_Window_").lower().replace("_", "-"): obj
        for obj in objects
        if obj.name.startswith("COL_HumanOnly_Window_")
    }
    kinds = Counter()
    for link_id, endpoints in pairs.items():
        require(set(endpoints) == {"A", "B"}, f"LNK pairが不完全です: {link_id}")
        a = endpoints["A"]
        b = endpoints["B"]
        kind = a.get("hs_link_kind")
        require(kind == b.get("hs_link_kind"), f"LNK kindが端点間で不一致です: {link_id}")
        kinds[kind] += 1
        segment = b.location - a.location
        require(
            abs(segment.z) <= 1e-7,
            f"LNK直線が端点最高高度を越える傾斜を持ちます: {link_id}",
        )
        require(segment.length / 2 >= 0.54, f"LNK端点余裕が0.54m未満です: {link_id}")
        if kind == "bit_window":
            collider = window_colliders.get(link_id)
            require(collider is not None, f"bit_window対応Colliderがありません: {link_id}")
            minimum, maximum = world_bounds(collider)
            center = (minimum + maximum) / 2
            midpoint = (a.location + b.location) / 2
            require((midpoint - center).length <= 1e-5, f"bit_windowが開口中央を通りません: {link_id}")
            dimensions = maximum - minimum
            thin_axis = min(range(3), key=lambda axis: dimensions[axis])
            direction = segment.normalized()
            require(
                abs(direction[thin_axis]) >= 1.0 - 1e-7,
                f"bit_windowが壁法線方向ではありません: {link_id}",
            )
        elif kind == "bit_roof":
            require(
                min(a.location.z, b.location.z) - 13.8 >= 0.54,
                f"bit_roofが屋上手すりへ半径0.54mの空きを持ちません: {link_id}",
            )
    expected_window_links = 58
    require(kinds["bit_window"] == expected_window_links, f"bit_windowが{expected_window_links}組ではありません: {kinds}")
    require(kinds["bit_roof"] == 2, f"bit_roofが2組ではありません: {kinds}")
    return dict(kinds)


def audit_windows(objects: list[bpy.types.Object]) -> dict[str, int]:
    names = [obj.name for obj in objects]
    frames = [obj for obj in objects if obj.name.startswith("VIS_WindowFrame_")]
    glass = [obj for obj in objects if obj.name.startswith("VIS_WindowGlass_")]
    actor = [obj for obj in objects if obj.name.startswith("COL_ActorOnly_Window_")]
    fixed_actor = [
        obj for obj in objects if obj.name.startswith("COL_ActorOnly_WindowFixed_")
    ]
    human = [obj for obj in objects if obj.name.startswith("COL_HumanOnly_Window_")]
    expected_frames = 82
    expected_actor = 33
    expected_fixed = 49
    expected_human = 58
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
        "HumanOnly窓の開放ユニットが承認済み58か所と一致しません",
    )
    expected_fixed_names = {
        f"COL_ActorOnly_WindowFixed_{suffix}" for suffix in EXPECTED_OPEN_UNITS
    }
    require(
        {obj.name for obj in fixed_actor} == expected_fixed_names,
        "開放窓帯の固定ガラスColliderが承認済み49窓帯と一致しません",
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
        units = frame.get("hs_window_units")
        require(units in {1, 2, 4}, f"窓帯の2枚ユニット数が不正です: {frame.name}={units}")
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
        elif any(token in frame.name for token in ("_Ordinary_", "_West_Special_", "_CourtyardNorth_Corridor_", "Gym_")):
            expected_panes = 8
        else:
            expected_panes = 4
        require(frame.get("hs_window_panes") == expected_panes, f"用途別の窓枚数が不正です: {frame.name}")
        suffix = frame.name.removeprefix("VIS_WindowFrame_")
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
    require(open_leaf_sides == Counter({"R": 30, "L": 28}), f"開放羽の左右数が不正です: {open_leaf_sides}")
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
        require(sum(name.startswith("VIS_WindowFrame_Gym_") for name in frame_names) == 7, "体育館8枚窓帯の配置数が不正です")
        require("VIS_WindowFrame_Gym_North_01" not in frame_names, "体育館北面西側の6m壁区画に窓があります")
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
        require(gym_west_centers == [-2.925, 8.5, 19.925], f"体育館西面の窓が壁面均等配置ではありません: {gym_west_centers}")
        require(gym_east_centers == gym_west_centers, f"体育館東西面の窓位置が一致しません: east={gym_east_centers}, west={gym_west_centers}")
        gym_intervals = []
        for index in (1, 2, 3):
            frame = bpy.data.objects[f"VIS_WindowFrame_Gym_West_{index:02d}"]
            minimum, maximum = world_bounds(frame)
            gym_intervals.append((minimum.y, maximum.y))
        gym_gaps = [
            gym_intervals[0][0] - (-9.5),
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
            expected_centers = [23.7, 37.85] if floor == 1 else [9.55, 23.7, 37.85]
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
    }


def audit_semantics(objects: list[bpy.types.Object]) -> None:
    require(not any(obj.name.startswith("PRT_") for obj in objects), "PRT_*が存在します")
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
    require(abs(boundary_maximum.z - 18.0) <= 1e-5, "BND_Stageが引き上げ後の屋上施設を覆っていません")
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
        "COL_B03_Ceiling_F02",
        "COL_B03_Ceiling_F03",
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


def audit_stair_guards(objects: list[bpy.types.Object]) -> dict[str, int]:
    names = {obj.name for obj in objects}
    central_well_checks = 0
    for floor, floor_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        floor_object = bpy.data.objects.get(f"VIS_B03_Floor_F{floor:02d}")
        require(floor_object is not None, f"階段吹抜け監査用の床がありません: {floor}階")
        for stair in ("NW", "NE", "SW"):
            well_center = transform_stair_point(stair, (-9.6, 41.9, floor_z))
            require(
                not has_horizontal_surface(floor_object, well_center),
                f"階段中央吹抜けに床面があります: {floor}階/{stair}",
            )
            central_well_checks += 1

    first_part_vertices = {"Lower": (96, 16), "Landing": (40, 8), "Upper": (88, 16)}
    visual_components = 0
    collider_components = 0
    for stair in ("NW", "NE", "SW"):
        for part, default_counts in first_part_vertices.items():
            expected_visual_vertices, expected_collider_vertices = (
                (56, 8) if stair == "NW" and part == "Lower" else default_counts
            )
            visual_name = f"VIS_StairGuard_{stair}_{part}"
            collider_name = f"COL_StairGuard_{stair}_{part}"
            require(visual_name in names and collider_name in names, f"1～2階階段柵が不足しています: {stair}/{part}")
            visual = bpy.data.objects[visual_name]
            collider = bpy.data.objects[collider_name]
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

    connector_surface_count = 0
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
            require(len(visual.data.vertices) == 224, f"上階の開放型階段柵が不正です: {visual_name}")
            require(len(collider.data.vertices) == 40, f"上階の連続階段柵Colliderが不正です: {collider_name}")
            require_architecture_swatch(visual_name, "trim")
            visual_components += 28
            collider_components += 5

            stair_object = bpy.data.objects.get(f"VIS_StairSystem_{stair}_{suffix}")
            require(stair_object is not None, f"上階階段本体がありません: {stair}/{suffix}")
            connector = transform_stair_point(stair, (-7.8, 39.8, base_z + 3.6))
            require(has_horizontal_surface(stair_object, connector), f"階段上端の接続床がありません: {stair}/{suffix}")
            connector_surface_count += 1

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

    return {
        "visual_objects": 16,
        "collider_objects": 16,
        "visual_components": visual_components,
        "collider_components": collider_components,
        "connector_surfaces": connector_surface_count,
        "central_well_checks": central_well_checks,
    }


def audit_glb(gltf: dict[str, object]) -> dict[str, int]:
    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    materials = gltf.get("materials", [])
    animations = gltf.get("animations", [])
    cameras = gltf.get("cameras", [])
    require(not animations, "GLBにAnimationがあります")
    require(not cameras, "GLBにCameraがあります")
    extensions = gltf.get("extensions", {})
    require("KHR_lights_punctual" not in extensions, "GLBにLightがあります")
    node_names = [node.get("name") for node in nodes if node.get("name")]
    require(len(node_names) == len(set(node_names)), "GLB Node名が重複しています")
    expected_frames = 82
    expected_actor = 33
    expected_fixed = 49
    expected_human = 58
    expected_link_endpoints = 116
    require(sum(name.startswith("VIS_WindowFrame_") for name in node_names) == expected_frames, f"GLB窓枠が{expected_frames}件ではありません")
    require(sum(name.startswith("VIS_WindowGlass_") for name in node_names) == expected_frames, f"GLB窓ガラスが{expected_frames}件ではありません")
    require(sum(name.startswith("COL_ActorOnly_Window_") for name in node_names) == expected_actor, f"GLB ActorOnly窓が{expected_actor}件ではありません")
    require(sum(name.startswith("COL_ActorOnly_WindowFixed_") for name in node_names) == expected_fixed, f"GLB開放窓帯固定Colliderが{expected_fixed}件ではありません")
    require(sum(name.startswith("COL_HumanOnly_Window_") for name in node_names) == expected_human, f"GLB HumanOnly窓が{expected_human}件ではありません")
    require(sum(name.startswith("LNK_bit-window-") for name in node_names) == expected_link_endpoints, f"GLB bit_window端点が{expected_link_endpoints}件ではありません")
    expected_roof_link_endpoints = 4
    require(
        sum(name.startswith("LNK_bit-roof-") for name in node_names)
        == expected_roof_link_endpoints,
        f"GLB bit_roof端点が{expected_roof_link_endpoints}件ではありません",
    )
    require("VOL_PoolWater" in node_names, "GLBにVOL_PoolWaterがありません")
    require(not any("Gym_South" in name for name in node_names), "GLB体育館南面に窓があります")
    require(not any(name.startswith("PRT_") for name in node_names), "GLBにPRT_*があります")
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
        if name.startswith("LNK_bit-"):
            require(extras.get("hs_bidirectional") is True, f"GLB LNKが双方向ではありません: {name}")
            require(abs(float(extras.get("hs_link_radius_m")) - 0.54) <= 1e-9, f"GLB LNK半径が不正です: {name}")
    return {
        "nodes": len(nodes),
        "meshes": len(meshes),
        "materials": len(materials),
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
    stair_guard_counts = audit_stair_guards(export_objects)
    acceptance_visuals = audit_acceptance_visuals(export_objects)
    audit_semantics(export_objects)
    glb_counts = audit_glb(read_glb_json(GLB_PATH))
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
        "stair_guards": stair_guard_counts,
        "acceptance_visuals": acceptance_visuals,
        "glb": glb_counts,
        "glb_optimization": glb_optimization,
    }
    print("B03_AUDIT_RESULT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
