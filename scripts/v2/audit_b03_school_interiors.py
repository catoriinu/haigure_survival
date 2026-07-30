from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from build_b03_school_interiors import (
    ADDITIONAL_PROP_TYPES,
    ART_BOOKSHELF_PLACEMENTS,
    ART_CLEANING_LOCKER,
    ART_EASEL_XS,
    ART_EASEL_Y,
    ART_INTERIOR_BOUNDS,
    ART_TABLE_XS,
    ART_TABLE_YS,
    ATLAS_DEFINITIONS,
    BULLETIN_BOARD_FURNITURE_PARTS,
    BULLETIN_BOARD_PAPER_PARTS,
    CLASSROOM_REAR_BAGGAGE_XS,
    CLASSROOM_REAR_CLEANING_X,
    CLASSROOM_REAR_INTERIOR_X_BOUNDS,
    CLASSROOM_REAR_LOCKER_Y,
    CLASSROOM_REAR_WALL_INNER_Y,
    CLASSROOM_DESK_ROW_Y_OFFSETS,
    CLASSROOM_DESKTOP_PROP_VARIANTS,
    CLASSROOM_FLOOR_PROP_VARIANTS,
    CLASSROOM_LAYOUT_VARIANTS,
    CLASSROOM_TRASH_BIN_PLACEMENT,
    COUNCIL_INTERIOR_BOUNDS,
    CORRIDOR_CLEANING_LOCKER,
    FIRST_FLOOR_WEST_DOOR_OPENINGS,
    GYM_STAGE_LECTERN,
    INFIRMARY_BED_PLACEMENTS,
    INFIRMARY_CURTAIN_SEGMENTS,
    INFIRMARY_JOINED_CHAIRS,
    INFIRMARY_JOINED_DESKS,
    INFIRMARY_NORTH_STORAGE_PLACEMENTS,
    INFIRMARY_STAFF_CHAIR,
    INFIRMARY_STAFF_DESK,
    INFIRMARY_TRASH_BIN,
    LIBRARY_AISLE_WIDTH,
    LIBRARY_BLOCK_AISLE,
    LIBRARY_BOOKSHELF_PLACEMENTS,
    LIBRARY_DENSE_ROW_XS,
    LIBRARY_EAST_SHELF_SERVICE_GAP,
    LIBRARY_EAST_SHELF_X,
    LIBRARY_EAST_SHELF_YS,
    LIBRARY_EAST_WALL_INNER_X,
    LIBRARY_NORTH_BLOCK_YS,
    LIBRARY_NORTHWEST_SHELF_YS,
    LIBRARY_SOUTH_BLOCK_YS,
    LIBRARY_SOUTH_TO_WALL_AISLE,
    LIBRARY_SOUTH_SHELF_XS,
    LIBRARY_WEST_WALL_INNER_X,
    LL_AV_RACK,
    LL_BAGGAGE_LOCKER_XS,
    LL_DESK_XS,
    LL_DESK_YS,
    LL_INTERIOR_BOUNDS,
    MAIN_ENTRY_BAGGAGE_LOCKERS,
    MUSIC_CHAIR_ROTATION,
    MUSIC_CHAIR_XS,
    MUSIC_CHAIR_YS,
    MUSIC_PIANO_PLACEMENT,
    NORTH_CLASSROOM_DOOR_OPENINGS,
    NORTH_ENTRY_BAGGAGE_LOCKER,
    NORTH_ENTRY_UMBRELLA_STAND,
    PROP_COLLIDER_LOCAL_CENTERS,
    PROP_COLLIDER_SIZES,
    ROOF_CHANGING_BAGGAGE_LOCKER_XS,
    ROOF_POOL_NORTH_SIGN_SUPPORT,
    STAFFROOM_CLEANING_LOCKER,
    STAFFROOM_DESK_YS,
    STAFFROOM_EAST_BOOKSHELVES,
    STAFFROOM_INTERIOR_BOUNDS,
    STAFFROOM_ISLAND_XS,
    STAFFROOM_TRASH_BIN,
    STAFFROOM_WEST_BOOKSHELVES,
    TOILET_COMMON_OPENING,
    TOILET_FRONT_DOOR_HEIGHT,
    TOILET_FRONT_DOOR_OPENINGS,
    TOILET_FRONT_WALL_DEPTH,
    TOILET_FRONT_WALL_SPANS,
    TOILET_FRONT_WALL_Y,
    TOILET_SIGN_PLACEMENTS,
    UPPER_WEST_CLASSROOM_DOOR_OPENINGS,
    architecture_swatch,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
TEXTURE_DIRECTORY = REPOSITORY_ROOT / "assets/textures/v2/B03"

CLASSROOM_SMALL_PROP_PARTS = {
    "ClosedBook": (
        ((0.0, 0.0, 0.015), (0.25, 0.18, 0.02)),
        ((0.0, 0.0, 0.005), (0.25, 0.18, 0.01)),
    ),
    "OpenBook": (
        ((-0.1125, 0.0, 0.02), (0.215, 0.25, 0.02)),
        ((0.1125, 0.0, 0.02), (0.215, 0.25, 0.02)),
        ((0.0, 0.0, 0.02), (0.01, 0.25, 0.04)),
    ),
    "PaperStack": (((0.0, 0.0, 0.0125), (0.297, 0.21, 0.025)),),
    "SinglePaper": (((0.0, 0.0, 0.001), (0.297, 0.21, 0.002)),),
    "PencilCase": (((0.0, 0.0, 0.025), (0.20, 0.07, 0.05)),),
}
CLASSROOM_SMALL_PROP_FOOTPRINTS = {
    "ClosedBook": (0.25, 0.18),
    "OpenBook": (0.44, 0.25),
    "PaperStack": (0.297, 0.21),
    "SinglePaper": (0.297, 0.21),
    "PencilCase": (0.20, 0.07),
}
CLASSROOM_PAPER_PROP_TYPES = {
    "ClosedBook",
    "OpenBook",
    "PaperStack",
    "SinglePaper",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"PNG署名が不正です: {path}")
    return struct.unpack_from(">II", data, 16)


def read_glb_json(path: Path) -> tuple[dict[str, object], int]:
    data = path.read_bytes()
    magic, version, declared = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared != len(data):
        raise RuntimeError("GLBヘッダーが不正です")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLBの先頭chunkがJSONではありません")
    gltf = json.loads(data[20 : 20 + json_length].decode("utf-8").rstrip("\x00 "))
    binary_offset = 20 + json_length
    binary_length, binary_type = struct.unpack_from("<II", data, binary_offset)
    if binary_type != 0x004E4942:
        raise RuntimeError("GLBにBIN chunkがありません")
    return gltf, binary_length


def is_identity_transform(obj: bpy.types.Object) -> bool:
    return (
        all(abs(value) < 1e-7 for value in obj.location)
        and all(abs(value) < 1e-7 for value in obj.rotation_euler)
        and all(abs(value - 1.0) < 1e-7 for value in obj.scale)
    )


def is_closed_mesh(obj: bpy.types.Object) -> bool:
    edge_use = Counter()
    for polygon in obj.data.polygons:
        vertices = list(polygon.vertices)
        for index, first in enumerate(vertices):
            second = vertices[(index + 1) % len(vertices)]
            edge_use[tuple(sorted((first, second)))] += 1
    return bool(edge_use) and all(count == 2 for count in edge_use.values())


def connected_component_aabbs(
    obj: bpy.types.Object,
) -> list[tuple[Vector, Vector]]:
    adjacency = [set() for _ in obj.data.vertices]
    for edge in obj.data.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)

    remaining = set(range(len(obj.data.vertices)))
    bounds: list[tuple[Vector, Vector]] = []
    while remaining:
        pending = [remaining.pop()]
        component: list[int] = []
        while pending:
            vertex_index = pending.pop()
            component.append(vertex_index)
            connected = adjacency[vertex_index] & remaining
            remaining.difference_update(connected)
            pending.extend(connected)
        points = [
            obj.matrix_world @ obj.data.vertices[vertex_index].co
            for vertex_index in component
        ]
        bounds.append(
            (
                Vector(tuple(min(point[axis] for point in points) for axis in range(3))),
                Vector(tuple(max(point[axis] for point in points) for axis in range(3))),
            )
        )
    return bounds


def point_aabb_distance(point: Vector, minimum: Vector, maximum: Vector) -> float:
    return sum(
        max(minimum[axis] - point[axis], 0.0, point[axis] - maximum[axis]) ** 2
        for axis in range(3)
    ) ** 0.5


def aabb_overlaps(
    first_minimum: Vector,
    first_maximum: Vector,
    second_minimum: Vector,
    second_maximum: Vector,
) -> bool:
    return all(
        first_minimum[axis] < second_maximum[axis] - 1e-6
        and first_maximum[axis] > second_minimum[axis] + 1e-6
        for axis in range(3)
    )


def aabb_axis_gap(
    first_minimum: Vector,
    first_maximum: Vector,
    second_minimum: Vector,
    second_maximum: Vector,
    axis: int,
) -> float:
    return max(
        second_minimum[axis] - first_maximum[axis],
        first_minimum[axis] - second_maximum[axis],
        0.0,
    )


def interval_contains(
    container_minimum: float,
    container_maximum: float,
    content_minimum: float,
    content_maximum: float,
    tolerance: float = 1e-4,
) -> bool:
    return (
        container_minimum - tolerance <= content_minimum
        and content_maximum <= container_maximum + tolerance
    )


def is_architecture_wall_collider(obj: bpy.types.Object) -> bool:
    name = obj.name
    return (
        name.startswith("COL_Wall")
        or name.startswith("COL_B03_ExteriorWalls_F")
        or name.startswith("COL_B03_InteriorWalls_F")
        or name.startswith("COL_B03_Interior_Walls_F")
        or name
        in {
            "COL_B03_GymExteriorWalls",
            "COL_B03_GymStorageNorthWall",
            "COL_RooftopFacilityShell",
        }
    )


def box_bounds(
    center: tuple[float, float, float],
    size: tuple[float, float, float],
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    return (
        tuple(center[axis] - size[axis] / 2.0 for axis in range(3)),
        tuple(center[axis] + size[axis] / 2.0 for axis in range(3)),
    )


def transformed_box_bounds(
    origin: tuple[float, float, float],
    local_center: tuple[float, float, float],
    size: tuple[float, float, float],
    rotation_z: float,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    cosine = math.cos(rotation_z)
    sine = math.sin(rotation_z)
    local_x, local_y, local_z = local_center
    center = (
        origin[0] + local_x * cosine - local_y * sine,
        origin[1] + local_x * sine + local_y * cosine,
        origin[2] + local_z,
    )
    absolute_cosine = abs(cosine)
    absolute_sine = abs(sine)
    rotated_size = (
        size[0] * absolute_cosine + size[1] * absolute_sine,
        size[0] * absolute_sine + size[1] * absolute_cosine,
        size[2],
    )
    return box_bounds(center, rotated_size)


def dimensions_match(
    minimum: Vector,
    maximum: Vector,
    expected: tuple[float, float, float],
    tolerance: float = 1e-4,
) -> bool:
    return all(
        abs((maximum[axis] - minimum[axis]) - expected[axis]) <= tolerance
        for axis in range(3)
    )


def bounds_key(minimum: Vector, maximum: Vector) -> tuple[float, ...]:
    return tuple(round(float(value), 5) for point in (minimum, maximum) for value in point)


def door_clearance_volumes() -> list[tuple[str, Vector, Vector]]:
    clearances: list[tuple[str, Vector, Vector]] = []
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        west_doors = (
            FIRST_FLOOR_WEST_DOOR_OPENINGS
            if floor == 1
            else UPPER_WEST_CLASSROOM_DOOR_OPENINGS
        )
        for index, (minimum_y, maximum_y) in enumerate(west_doors, 1):
            clearances.append(
                (
                    f"F{floor:02d}_West_{index:02d}",
                    Vector((-4.6, minimum_y + 0.05, base_z + 0.05)),
                    Vector((-2.4, maximum_y - 0.05, base_z + 2.25)),
                )
            )
        for index, (minimum_x, maximum_x) in enumerate(
            NORTH_CLASSROOM_DOOR_OPENINGS,
            1,
        ):
            clearances.append(
                (
                    f"F{floor:02d}_North_{index:02d}",
                    Vector((minimum_x + 0.05, 35.4, base_z + 0.05)),
                    Vector((maximum_x - 0.05, 37.6, base_z + 2.25)),
                )
            )
        clearances.append(
            (
                f"F{floor:02d}_ToiletCommon",
                Vector(
                    (
                        TOILET_COMMON_OPENING[0] + 0.15,
                        36.35,
                        base_z + 0.05,
                    )
                ),
                Vector(
                    (
                        TOILET_COMMON_OPENING[1] - 0.15,
                        38.30,
                        base_z + 2.25,
                    )
                ),
            )
        )
        for index, (minimum_x, maximum_x) in enumerate(
            TOILET_FRONT_DOOR_OPENINGS,
            1,
        ):
            clearances.append(
                (
                    f"F{floor:02d}_ToiletDoor_{index:02d}",
                    Vector((minimum_x + 0.05, 38.35, base_z + 0.05)),
                    Vector((maximum_x - 0.05, 39.65, base_z + 2.25)),
                )
            )
    clearances.extend(
        (
            (
                "MainEntry",
                Vector((-1.70, -6.75, 0.05)),
                Vector((-0.70, 2.45, 2.25)),
            ),
            (
                "NorthEntry",
                Vector((2.45, 44.40, 0.05)),
                Vector((5.35, 46.60, 2.25)),
            ),
            (
                "NorthWingSouthEntry",
                Vector((0.30, 31.30, 0.05)),
                Vector((5.40, 33.70, 2.25)),
            ),
            (
                "NorthWingBridge",
                Vector((39.35, 31.30, 0.05)),
                Vector((43.45, 33.70, 2.25)),
            ),
            (
                "GymBridge",
                Vector((39.35, 25.30, 0.05)),
                Vector((43.45, 27.70, 2.25)),
            ),
            (
                "GymCourtyard",
                Vector((32.30, 5.05, 0.05)),
                Vector((34.70, 7.95, 2.25)),
            ),
            (
                "GymStorage",
                Vector((53.70, 25.30, 0.05)),
                Vector((55.10, 27.70, 2.25)),
            ),
            (
                "GymStageWest",
                Vector((33.20, -4.60, 0.05)),
                Vector((36.90, -2.40, 2.25)),
            ),
            (
                "GymStageEast",
                Vector((54.00, -4.60, 0.05)),
                Vector((57.60, -2.40, 2.25)),
            ),
        )
    )
    return clearances


def audit_door_clearance(interior_colliders: list[bpy.types.Object]) -> int:
    clearances = door_clearance_volumes()

    collider_components = [
        (collider.name, component_index, minimum, maximum)
        for collider in interior_colliders
        for component_index, (minimum, maximum) in enumerate(
            connected_component_aabbs(collider),
            1,
        )
    ]
    violations = []
    for label, clearance_minimum, clearance_maximum in clearances:
        for collider_name, component_index, minimum, maximum in collider_components:
            if aabb_overlaps(
                clearance_minimum,
                clearance_maximum,
                minimum,
                maximum,
            ):
                violations.append(f"{label}/{collider_name}#{component_index}")
    if violations:
        raise RuntimeError(
            "出入口前へ通行不能小物が侵入しています:\n" + "\n".join(violations)
        )
    return len(clearances) * len(collider_components)


def audit_visual_door_clearance(interior_visuals: list[bpy.types.Object]) -> int:
    clearances = door_clearance_volumes()
    furniture_components = [
        (visual.name, component_index, minimum, maximum)
        for visual in interior_visuals
        if visual.name.endswith("_FurnitureProps")
        for component_index, (minimum, maximum) in enumerate(
            connected_component_aabbs(visual),
            1,
        )
    ]
    violations = []
    for label, clearance_minimum, clearance_maximum in clearances:
        for object_name, component_index, minimum, maximum in furniture_components:
            if aabb_overlaps(
                clearance_minimum,
                clearance_maximum,
                minimum,
                maximum,
            ):
                violations.append(f"{label}/{object_name}#{component_index}")
    if violations:
        raise RuntimeError(
            "出入口前へ表示小物が侵入しています:\n" + "\n".join(violations)
        )
    return len(clearances) * len(furniture_components)


def room_sign_components() -> list[tuple[str, int, Vector, Vector]]:
    sign_objects = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and obj.name.startswith("VIS_B03_Interior_")
        and obj.name.endswith("_SignsPaper")
    ]
    return [
        (obj.name, component_index, minimum, maximum)
        for obj in sign_objects
        for component_index, (minimum, maximum) in enumerate(
            connected_component_aabbs(obj),
            1,
        )
        if dimensions_match(minimum, maximum, (0.45, 0.04, 0.18))
        or dimensions_match(minimum, maximum, (0.04, 0.45, 0.18))
    ]


def room_sign_clearance_volumes() -> list[tuple[str, Vector, Vector]]:
    clearances: list[tuple[str, Vector, Vector]] = []
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        west_doors = (
            FIRST_FLOOR_WEST_DOOR_OPENINGS
            if floor == 1
            else UPPER_WEST_CLASSROOM_DOOR_OPENINGS
        )
        for index, (minimum_y, maximum_y) in enumerate(west_doors, 1):
            clearances.append(
                (
                    f"F{floor:02d}_West_{index:02d}",
                    Vector((-3.70, minimum_y - 0.20, base_z + 1.50)),
                    Vector((-3.10, maximum_y + 0.20, base_z + 1.90)),
                )
            )
        for index, (minimum_x, maximum_x) in enumerate(
            NORTH_CLASSROOM_DOOR_OPENINGS,
            1,
        ):
            clearances.append(
                (
                    f"F{floor:02d}_North_{index:02d}",
                    Vector((minimum_x - 0.20, 36.20, base_z + 1.50)),
                    Vector((maximum_x + 0.20, 36.70, base_z + 1.90)),
                )
            )
        for index, (minimum_x, maximum_x) in enumerate(
            TOILET_FRONT_DOOR_OPENINGS,
            1,
        ):
            clearances.append(
                (
                    f"F{floor:02d}_ToiletDoor_{index:02d}",
                    Vector((minimum_x - 0.20, 38.20, base_z + 1.50)),
                    Vector((maximum_x + 0.20, 38.50, base_z + 1.90)),
                )
            )
    clearances.extend(
        (
            (
                "MainEntry",
                Vector((-1.40, -3.70, 1.50)),
                Vector((1.40, -3.20, 1.90)),
            ),
            (
                "NorthEntry",
                Vector((2.20, 45.30, 1.50)),
                Vector((5.60, 45.70, 1.90)),
            ),
            (
                "GymStorage",
                Vector((53.50, 26.30, 1.50)),
                Vector((55.30, 26.80, 1.90)),
            ),
            (
                "RoofChangingMale",
                Vector((-5.60, 38.30, 16.00)),
                Vector((-4.00, 38.70, 16.40)),
            ),
            (
                "RoofChangingFemale",
                Vector((-1.10, 38.30, 16.00)),
                Vector((0.50, 38.70, 16.40)),
            ),
        )
    )
    return clearances


def audit_door_sign_clearance() -> int:
    sign_components = room_sign_components()
    if len(sign_components) != 29:
        raise RuntimeError(f"表札が29枚ではありません: {len(sign_components)}")
    violations = []
    clearances = room_sign_clearance_volumes()
    for label, clearance_minimum, clearance_maximum in clearances:
        for object_name, component_index, minimum, maximum in sign_components:
            if aabb_overlaps(
                clearance_minimum,
                clearance_maximum,
                minimum,
                maximum,
            ):
                violations.append(f"{label}/{object_name}#{component_index}")
    if violations:
        raise RuntimeError(
            "表札が出入口中央へ重なっています:\n" + "\n".join(violations)
        )
    return len(clearances) * len(sign_components)


def audit_room_sign_wall_support() -> int:
    support_objects = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and is_architecture_wall_collider(obj)
    ]
    support_components = [
        (obj.name, minimum, maximum)
        for obj in support_objects
        for minimum, maximum in connected_component_aabbs(obj)
    ]
    unsupported: list[str] = []
    checked = 0
    for object_name, component_index, minimum, maximum in room_sign_components():
        dimensions = maximum - minimum
        thin_axis = 0 if dimensions.x < dimensions.y else 1
        long_axis = 1 - thin_axis
        matching_supports = []
        for wall_name, wall_minimum, wall_maximum in support_components:
            wall_dimensions = wall_maximum - wall_minimum
            checked += 1
            if wall_dimensions[thin_axis] > 0.40 + 1e-4:
                continue
            if (
                aabb_axis_gap(
                    minimum,
                    maximum,
                    wall_minimum,
                    wall_maximum,
                    thin_axis,
                )
                > 1e-4
            ):
                continue
            if not interval_contains(
                wall_minimum[long_axis],
                wall_maximum[long_axis],
                minimum[long_axis],
                maximum[long_axis],
            ):
                continue
            if not interval_contains(
                wall_minimum.z,
                wall_maximum.z,
                minimum.z,
                maximum.z,
            ):
                continue
            matching_supports.append(wall_name)
        if not matching_supports:
            unsupported.append(f"{object_name}#{component_index}")
    if unsupported:
        raise RuntimeError(
            "表札AABBの長辺・高さ全体が単一の建築壁Collider成分へ"
            "支持されていません:\n"
            + "\n".join(unsupported)
        )
    return checked


def bounds_match(
    actual: tuple[Vector, Vector],
    expected: tuple[tuple[float, float, float], tuple[float, float, float]],
) -> bool:
    minimum, maximum = actual
    return all(
        abs(minimum[axis] - expected[0][axis]) <= 1e-4
        and abs(maximum[axis] - expected[1][axis]) <= 1e-4
        for axis in range(3)
    )


def require_component_bounds(
    label: str,
    components: list[tuple[Vector, Vector]],
    expected: tuple[tuple[float, float, float], tuple[float, float, float]],
) -> None:
    if not any(bounds_match(component, expected) for component in components):
        raise RuntimeError(f"{label}のAABBが見つかりません: {expected}")


def consume_component_bounds(
    label: str,
    components: list[tuple[Vector, Vector]],
    expected: tuple[tuple[float, float, float], tuple[float, float, float]],
) -> None:
    for index, component in enumerate(components):
        if bounds_match(component, expected):
            components.pop(index)
            return
    raise RuntimeError(f"{label}のAABBが見つかりません: {expected}")


def require_bounds_contained(
    label: str,
    container: tuple[
        tuple[float, float, float],
        tuple[float, float, float],
    ],
    contents: list[tuple[Vector, Vector]],
    tolerance: float = 1e-4,
) -> int:
    violations = [
        (minimum.copy(), maximum.copy())
        for minimum, maximum in contents
        if any(
            minimum[axis] < container[0][axis] - tolerance
            or maximum[axis] > container[1][axis] + tolerance
            for axis in range(3)
        )
    ]
    if violations:
        raise RuntimeError(
            f"{label}がCollider AABBからはみ出しています: {violations}"
        )
    return len(contents)


def component_union_bounds(
    components: list[tuple[Vector, Vector]],
) -> tuple[Vector, Vector]:
    if not components:
        raise RuntimeError("AABB合成対象の表示componentがありません")
    return (
        Vector(
            tuple(
                min(minimum[axis] for minimum, _maximum in components)
                for axis in range(3)
            )
        ),
        Vector(
            tuple(
                max(maximum[axis] for _minimum, maximum in components)
                for axis in range(3)
            )
        ),
    )


def architecture_wall_component_aabbs() -> list[tuple[str, int, Vector, Vector]]:
    return [
        (obj.name, component_index, minimum, maximum)
        for obj in bpy.data.objects
        if obj.type == "MESH" and is_architecture_wall_collider(obj)
        for component_index, (minimum, maximum) in enumerate(
            connected_component_aabbs(obj),
            1,
        )
    ]


def require_no_architecture_wall_overlap(
    label: str,
    bounds: tuple[Vector, Vector],
    wall_components: list[tuple[str, int, Vector, Vector]],
) -> int:
    minimum, maximum = bounds
    violations = [
        f"{wall_name}#{component_index}"
        for wall_name, component_index, wall_minimum, wall_maximum in wall_components
        if aabb_overlaps(minimum, maximum, wall_minimum, wall_maximum)
    ]
    if violations:
        raise RuntimeError(
            f"{label}が建築壁へ重なっています: {', '.join(violations)}"
        )
    return len(wall_components)


def audit_storey_band_swatches() -> int:
    expected_colors = {
        "floor_1": (198, 151, 53),
        "floor_2": (66, 135, 104),
        "floor_3": (185, 101, 71),
        "floor_4": (70, 105, 159),
    }
    actual_colors = ATLAS_DEFINITIONS["Architecture"]["swatches"]
    for swatch, expected in expected_colors.items():
        if actual_colors.get(swatch) != expected:
            raise RuntimeError(
                f"階色swatchが不正です: {swatch}={actual_colors.get(swatch)}/{expected}"
            )
    for floor in range(1, 5):
        object_name = f"VIS_B03_StoreyBand_F{floor:02d}"
        if bpy.data.objects.get(object_name) is None:
            raise RuntimeError(f"階色帯がありません: {object_name}")
        if architecture_swatch(object_name) != f"floor_{floor}":
            raise RuntimeError(f"階色帯のswatch判定が不正です: {object_name}")
    old_accents = [
        obj.name
        for obj in bpy.data.objects
        if obj.name.startswith("VIS_B03_FloorAccent_F")
    ]
    if old_accents:
        raise RuntimeError(f"旧床面階色ラインが残っています: {old_accents}")
    stair_guards = [
        obj.name
        for obj in bpy.data.objects
        if obj.name.startswith("VIS_StairGuard")
    ]
    if not stair_guards or any(
        architecture_swatch(object_name) != "trim" for object_name in stair_guards
    ):
        raise RuntimeError(f"階段手すりのswatch判定が不正です: {stair_guards}")
    interfloor_structures = (
        "VIS_B03_InterfloorStructure_F01_North",
        "VIS_B03_InterfloorStructure_F01_West",
    )
    for object_name in interfloor_structures:
        if bpy.data.objects.get(object_name) is None:
            raise RuntimeError(f"1F・2F間構造がありません: {object_name}")
        if architecture_swatch(object_name) != "ceiling":
            raise RuntimeError(
                f"1F・2F間構造のswatch判定がceilingではありません: {object_name}"
            )
    return len(expected_colors) + len(stair_guards) + len(interfloor_structures)


def audit_nav_blocker_parity(
    interior_colliders: list[bpy.types.Object],
    nav_blocker: bpy.types.Object,
) -> int:
    collider_bounds = Counter(
        bounds_key(minimum, maximum)
        for collider in interior_colliders
        for minimum, maximum in connected_component_aabbs(collider)
    )
    nav_bounds = Counter(
        bounds_key(minimum, maximum)
        for minimum, maximum in connected_component_aabbs(nav_blocker)
    )
    if collider_bounds != nav_bounds:
        missing = list((collider_bounds - nav_bounds).elements())
        unexpected = list((nav_bounds - collider_bounds).elements())
        raise RuntimeError(
            "内装ColliderとNAV_Blocker_InteriorsのAABBが一致しません: "
            f"missing={missing[:5]}, unexpected={unexpected[:5]}"
        )
    return sum(collider_bounds.values())


def audit_classroom_teacher_desks_and_lockers() -> dict[str, int]:
    if CLASSROOM_REAR_BAGGAGE_XS != (-10.65, -8.65, -6.65):
        raise RuntimeError("普通教室の後方荷物ロッカー配置が受入仕様と一致しません")
    if CLASSROOM_REAR_CLEANING_X != -5.20 or CLASSROOM_REAR_LOCKER_Y != 2.875:
        raise RuntimeError("普通教室の後方収納配置が受入仕様と一致しません")
    teacher_desk_count = 0
    rear_locker_count = 0
    orientation_checks = 0
    placement_checks = 0
    bulletin_board_absence_checks = 0
    blackboard_alignment_checks = 0
    desk_collider_checks = 0
    desk_visual_checks = 0
    chair_layout_checks = 0
    desktop_prop_spot_checks = 0
    floor_prop_spot_checks = 0
    small_prop_component_checks = 0
    small_prop_room_checks = 0
    blackboard_x = -8.05
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        for room_index, room_y_offset in enumerate((0.0, 10.0, 20.0), 1):
            room_name = f"F{floor:02d}_Classroom{room_index:02d}"
            visual = bpy.data.objects[
                f"VIS_B03_Interior_{room_name}_FurnitureProps"
            ]
            collider = bpy.data.objects[f"COL_B03_Interior_{room_name}"]
            visual_components = connected_component_aabbs(visual)
            collider_components = connected_component_aabbs(collider)
            paper_object = bpy.data.objects[
                f"VIS_B03_Interior_{room_name}_SignsPaper"
            ]
            paper_components = connected_component_aabbs(paper_object)
            unmatched_paper_components = list(paper_components)
            unmatched_furniture_components = list(visual_components)
            variant_index = (floor + room_index) % len(
                CLASSROOM_LAYOUT_VARIANTS
            )
            desk_adjustments = CLASSROOM_LAYOUT_VARIANTS[variant_index][
                "desk_adjustments"
            ]
            chair_adjustments = CLASSROOM_LAYOUT_VARIANTS[variant_index][
                "chair_adjustments"
            ]
            desk_positions: dict[tuple[int, int], tuple[float, float, float]] = {}
            for row in range(6):
                for column in range(5):
                    desk_x = -11.15 + column * 1.42
                    desk_y = (
                        4.5
                        + room_y_offset
                        + row * 1.22
                        + CLASSROOM_DESK_ROW_Y_OFFSETS[row]
                    )
                    desk_dx, desk_dy, rotation = desk_adjustments.get(
                        (column, row),
                        (0.0, 0.0, 0.0),
                    )
                    desk_x += desk_dx
                    desk_y += desk_dy
                    desk_positions[(column, row)] = (
                        desk_x,
                        desk_y,
                        rotation,
                    )
                    expected_desk_bounds = transformed_box_bounds(
                        (desk_x, desk_y, base_z),
                        (
                            0.0,
                            0.0,
                            PROP_COLLIDER_SIZES["ClassroomDesk"][2] / 2.0,
                        ),
                        PROP_COLLIDER_SIZES["ClassroomDesk"],
                        rotation,
                    )
                    require_component_bounds(
                        f"{room_name} 生徒机Collider",
                        collider_components,
                        expected_desk_bounds,
                    )
                    desk_collider_checks += 1
                    require_component_bounds(
                        f"{room_name} 生徒机天板",
                        visual_components,
                        transformed_box_bounds(
                            (desk_x, desk_y, base_z),
                            (0.0, 0.0, 0.68),
                            (0.65, 0.45, 0.04),
                            rotation,
                        ),
                    )
                    desk_visual_checks += 1
                    chair_dx, chair_dy, chair_rotation = chair_adjustments.get(
                        (column, row),
                        (0.0, 0.0, 0.0),
                    )
                    chair_x = desk_x + math.sin(rotation) * 0.31 + chair_dx
                    chair_y = desk_y - math.cos(rotation) * 0.31 + chair_dy
                    require_component_bounds(
                        f"{room_name} 生徒椅子座面",
                        visual_components,
                        transformed_box_bounds(
                            (chair_x, chair_y, base_z),
                            (0.0, 0.0, 0.43),
                            (0.42, 0.45, 0.035),
                            math.pi + rotation + chair_rotation,
                        ),
                    )
                    chair_layout_checks += 1
            small_prop_expectations = []
            for prop_type, key, offset_x, offset_y in (
                CLASSROOM_DESKTOP_PROP_VARIANTS[variant_index]
            ):
                footprint_x, footprint_y = CLASSROOM_SMALL_PROP_FOOTPRINTS[
                    prop_type
                ]
                if (
                    abs(offset_x) + footprint_x / 2.0 > 0.325 + 1e-4
                    or abs(offset_y) + footprint_y / 2.0 > 0.225 + 1e-4
                ):
                    raise RuntimeError(
                        f"{room_name}の机上小物が机天板内に収まりません: "
                        f"{prop_type}/{key}"
                    )
                desk_x, desk_y, desk_rotation = desk_positions[key]
                cosine = math.cos(desk_rotation)
                sine = math.sin(desk_rotation)
                prop_x = desk_x + offset_x * cosine - offset_y * sine
                prop_y = desk_y + offset_x * sine + offset_y * cosine
                small_prop_expectations.append(
                    (
                        "机上",
                        prop_type,
                        (prop_x, prop_y, base_z + 0.70),
                        desk_rotation,
                    )
                )
                desktop_prop_spot_checks += 1
            for prop_type, x, y, rotation in CLASSROOM_FLOOR_PROP_VARIANTS[
                variant_index
            ]:
                small_prop_expectations.append(
                    (
                        "床上",
                        prop_type,
                        (x, y + room_y_offset, base_z),
                        rotation,
                    )
                )
                floor_prop_spot_checks += 1
            for placement_label, prop_type, origin, rotation in (
                small_prop_expectations
            ):
                for part_index, (local_center, size) in enumerate(
                    CLASSROOM_SMALL_PROP_PARTS[prop_type],
                    1,
                ):
                    expected = transformed_box_bounds(
                        origin,
                        local_center,
                        size,
                        rotation,
                    )
                    target_components = (
                        unmatched_paper_components
                        if prop_type in CLASSROOM_PAPER_PROP_TYPES
                        else unmatched_furniture_components
                    )
                    consume_component_bounds(
                        f"{room_name} {placement_label}{prop_type}#{part_index}",
                        target_components,
                        expected,
                    )
                    small_prop_component_checks += 1
            if unmatched_paper_components:
                raise RuntimeError(
                    f"{room_name}に仕様外の紙・本小物成分が残っています: "
                    f"{len(unmatched_paper_components)}"
                )
            small_prop_room_checks += 1
            teacher_y = 11.25 + room_y_offset
            teacher_bounds = box_bounds(
                (blackboard_x, teacher_y, base_z + 0.36),
                (1.20, 0.60, 0.72),
            )
            require_component_bounds(
                f"{room_name} 教卓Collider",
                collider_components,
                teacher_bounds,
            )
            actual_teacher_bounds = next(
                component
                for component in collider_components
                if bounds_match(component, teacher_bounds)
            )
            require_component_bounds(
                f"{room_name} 教卓天板",
                visual_components,
                box_bounds(
                    (blackboard_x, teacher_y, base_z + 0.66),
                    (1.20, 0.60, 0.12),
                ),
            )
            require_component_bounds(
                f"{room_name} 教卓本体",
                visual_components,
                box_bounds(
                    (blackboard_x, teacher_y, base_z + 0.30),
                    (1.05, 0.50, 0.60),
                ),
            )
            actual_teacher_center_x = (
                actual_teacher_bounds[0].x + actual_teacher_bounds[1].x
            ) / 2.0
            if abs(actual_teacher_center_x - blackboard_x) > 1e-5:
                raise RuntimeError(f"{room_name} 教卓が黒板中央にありません")
            blackboard_alignment_checks += 1

            old_bulletin_origin = (
                -12.42,
                8.7 + room_y_offset,
                base_z,
            )
            for local_center, size, _swatch in BULLETIN_BOARD_FURNITURE_PARTS:
                old_bounds = transformed_box_bounds(
                    old_bulletin_origin,
                    local_center,
                    size,
                    math.pi / 2,
                )
                if any(bounds_match(component, old_bounds) for component in visual_components):
                    raise RuntimeError(f"{room_name} 窓際掲示板の枠が残っています")
                bulletin_board_absence_checks += 1
            for local_center, size, _swatch in BULLETIN_BOARD_PAPER_PARTS:
                old_bounds = transformed_box_bounds(
                    old_bulletin_origin,
                    local_center,
                    size,
                    math.pi / 2,
                )
                if any(bounds_match(component, old_bounds) for component in paper_components):
                    raise RuntimeError(f"{room_name} 窓際掲示板の掲示紙が残っています")
                bulletin_board_absence_checks += 1
            teacher_desk_count += 1

            locker_y = CLASSROOM_REAR_LOCKER_Y + room_y_offset
            rear_locker_bounds = []
            for locker_x in CLASSROOM_REAR_BAGGAGE_XS:
                locker_bounds = box_bounds(
                    (locker_x, locker_y, base_z + 0.60),
                    PROP_COLLIDER_SIZES["BaggageLocker"],
                )
                require_component_bounds(
                    f"{room_name} 荷物ロッカーCollider",
                    collider_components,
                    locker_bounds,
                )
                if (
                    locker_bounds[0][1]
                    < CLASSROOM_REAR_WALL_INNER_Y + room_y_offset - 1e-5
                ):
                    raise RuntimeError(f"{room_name} 荷物ロッカーが後方壁へ重なります")
                require_component_bounds(
                    f"{room_name} 荷物ロッカー背板",
                    visual_components,
                    (
                        (locker_x - 0.90, locker_y - 0.225, base_z),
                        (locker_x + 0.90, locker_y - 0.185, base_z + 1.20),
                    ),
                )
                rear_locker_bounds.append(locker_bounds)
                rear_locker_count += 1
                orientation_checks += 1

            cleaning_bounds = box_bounds(
                (CLASSROOM_REAR_CLEANING_X, locker_y, base_z + 0.90),
                PROP_COLLIDER_SIZES["CleaningLocker"],
            )
            require_component_bounds(
                f"{room_name} 掃除ロッカーCollider",
                collider_components,
                cleaning_bounds,
            )
            if (
                cleaning_bounds[0][1]
                < CLASSROOM_REAR_WALL_INNER_Y + room_y_offset - 1e-5
            ):
                raise RuntimeError(f"{room_name} 掃除ロッカーが後方壁へ重なります")
            require_component_bounds(
                f"{room_name} 掃除ロッカー正面継ぎ目",
                visual_components,
                (
                    (
                        CLASSROOM_REAR_CLEANING_X - 0.01,
                        locker_y + 0.225,
                        base_z + 0.06,
                    ),
                    (
                        CLASSROOM_REAR_CLEANING_X + 0.01,
                        locker_y + 0.225,
                        base_z + 1.74,
                    ),
                ),
            )
            rear_locker_bounds.append(cleaning_bounds)
            west_x, east_x = CLASSROOM_REAR_INTERIOR_X_BOUNDS
            rear_locker_bounds.sort(key=lambda bounds: bounds[0][0])
            for minimum, maximum in rear_locker_bounds:
                if minimum[0] < west_x - 1e-5 or maximum[0] > east_x + 1e-5:
                    raise RuntimeError(f"{room_name} 後方収納が教室壁内に収まりません")
            for previous, current in zip(
                rear_locker_bounds,
                rear_locker_bounds[1:],
            ):
                if previous[1][0] > current[0][0] + 1e-5:
                    raise RuntimeError(f"{room_name} 後方収納同士が重なります")
            placement_checks += len(rear_locker_bounds)
            rear_locker_count += 1
            orientation_checks += 1
    return {
        "teacher_desks": teacher_desk_count,
        "rear_lockers": rear_locker_count,
        "orientation_checks": orientation_checks,
        "placement_checks": placement_checks,
        "bulletin_board_absence_checks": bulletin_board_absence_checks,
        "blackboard_alignment_checks": blackboard_alignment_checks,
        "desk_collider_checks": desk_collider_checks,
        "desk_visual_checks": desk_visual_checks,
        "chair_layout_checks": chair_layout_checks,
        "desktop_prop_spot_checks": desktop_prop_spot_checks,
        "floor_prop_spot_checks": floor_prop_spot_checks,
        "small_prop_component_checks": small_prop_component_checks,
        "small_prop_room_checks": small_prop_room_checks,
    }


def audit_library_bookshelves() -> dict[str, int]:
    visual = bpy.data.objects["VIS_B03_Interior_F01_Library_FurnitureProps"]
    collider = bpy.data.objects["COL_B03_Interior_F01_Library"]
    visual_components = connected_component_aabbs(visual)
    collider_components = connected_component_aabbs(collider)
    shelf_bounds: list[tuple[Vector, Vector]] = []
    orientation_checks = 0
    for x, y, rotation in LIBRARY_BOOKSHELF_PLACEMENTS:
        expected = transformed_box_bounds(
            (x, y, 0.0),
            (0.0, 0.0, 0.90),
            PROP_COLLIDER_SIZES["Bookshelf"],
            rotation,
        )
        require_component_bounds("図書室本棚Collider", collider_components, expected)
        shelf_bounds.append((Vector(expected[0]), Vector(expected[1])))
        back_panel = transformed_box_bounds(
            (x, y, 0.0),
            (0.0, 0.14, 0.90),
            (0.90, 0.04, 1.80),
            rotation,
        )
        require_component_bounds("図書室本棚背板", visual_components, back_panel)
        orientation_checks += 1

    if len(shelf_bounds) != 80:
        raise RuntimeError(
            f"図書室本棚が80台ではありません: {len(shelf_bounds)}"
        )
    expected_west_rows = len(LIBRARY_SOUTH_BLOCK_YS) + len(
        LIBRARY_NORTH_BLOCK_YS
    ) + len(LIBRARY_NORTHWEST_SHELF_YS)
    west_wall_rows = [
        placement
        for placement in LIBRARY_BOOKSHELF_PLACEMENTS
        if abs(placement[0] - (LIBRARY_WEST_WALL_INNER_X + 0.16)) < 1e-5
        and abs(placement[2] - math.pi / 2) < 1e-5
    ]
    if len(west_wall_rows) != expected_west_rows:
        raise RuntimeError("図書室西窓側の本棚列数が不正です")

    east_rows = [
        (minimum, maximum)
        for (minimum, maximum), (x, y, rotation) in zip(
            shelf_bounds,
            LIBRARY_BOOKSHELF_PLACEMENTS,
        )
        if abs(x - LIBRARY_EAST_SHELF_X) < 1e-5
        and abs(rotation + math.pi / 2) < 1e-5
        and any(abs(y - expected_y) < 1e-5 for expected_y in LIBRARY_EAST_SHELF_YS)
    ]
    if len(east_rows) != 17:
        raise RuntimeError(f"図書室東壁本棚が17台ではありません: {len(east_rows)}")
    east_back_gap = (
        LIBRARY_EAST_WALL_INNER_X
        - max(maximum.x for _, maximum in east_rows)
    )
    if abs(east_back_gap - LIBRARY_EAST_SHELF_SERVICE_GAP) > 1e-5:
        raise RuntimeError(
            "図書室東壁本棚の扉収納用隙間が0.15mではありません: "
            f"{east_back_gap:.6f}m"
        )

    open_door_handle_minimum_x = -3.76
    door_track_clearance = open_door_handle_minimum_x - max(
        maximum.x for _, maximum in east_rows
    )
    if door_track_clearance < 0.039:
        raise RuntimeError(
            "図書室東壁本棚が開扉パネルまたは取っ手へ近すぎます: "
            f"{door_track_clearance:.6f}m"
        )
    south_door_clearance = min(minimum.y for minimum, _ in east_rows) - 14.30
    north_door_clearance = 30.70 - max(maximum.y for _, maximum in east_rows)
    if (
        abs(south_door_clearance - 0.55) > 1e-5
        or abs(north_door_clearance - 0.55) > 1e-5
    ):
        raise RuntimeError(
            "図書室東壁本棚の南北扉端離隔が各0.55mではありません: "
            f"south={south_door_clearance:.6f}, "
            f"north={north_door_clearance:.6f}"
        )

    first_pair_west_front = LIBRARY_DENSE_ROW_XS[1] - 0.16
    first_pair_east_front = LIBRARY_DENSE_ROW_XS[2] + 0.16
    second_pair_west_front = LIBRARY_DENSE_ROW_XS[3] - 0.16
    second_pair_east_front = LIBRARY_DENSE_ROW_XS[4] + 0.16
    aisle_widths = (
        first_pair_west_front - (LIBRARY_DENSE_ROW_XS[0] + 0.16),
        second_pair_west_front - first_pair_east_front,
        (LIBRARY_EAST_SHELF_X - 0.16) - second_pair_east_front,
    )
    if any(abs(width - LIBRARY_AISLE_WIDTH) > 1e-5 for width in aisle_widths):
        raise RuntimeError(f"図書室東西通路が均等ではありません: {aisle_widths}")
    south_wall_front_y = 12.81 + 0.16
    south_block_minimum_y = min(LIBRARY_SOUTH_BLOCK_YS) - 0.45
    south_to_wall_aisle = south_block_minimum_y - south_wall_front_y
    block_aisle = (
        min(LIBRARY_NORTH_BLOCK_YS)
        - 0.45
        - (max(LIBRARY_SOUTH_BLOCK_YS) + 0.45)
    )
    if (
        abs(south_to_wall_aisle - LIBRARY_SOUTH_TO_WALL_AISLE) > 1e-5
        or abs(block_aisle - LIBRARY_BLOCK_AISLE) > 1e-5
    ):
        raise RuntimeError(
            "図書室南壁・書架ブロック間の通路幅が設計値と一致しません: "
            f"south={south_to_wall_aisle:.6f}, blocks={block_aisle:.6f}"
        )

    overlaps = [
        (first_index, second_index)
        for first_index, (first_minimum, first_maximum) in enumerate(
            shelf_bounds,
            1,
        )
        for second_index, (second_minimum, second_maximum) in enumerate(
            shelf_bounds[first_index:],
            first_index + 1,
        )
        if aabb_overlaps(
            first_minimum,
            first_maximum,
            second_minimum,
            second_maximum,
        )
    ]
    if overlaps:
        raise RuntimeError(f"図書室本棚同士が重なっています: {overlaps[:10]}")
    return {
        "bookshelves": len(shelf_bounds),
        "orientation_checks": orientation_checks,
        "aisle_checks": len(aisle_widths) + 2,
        "door_clearance_checks": len(east_rows) + 3,
    }


def audit_bulletin_board_design() -> dict[str, int]:
    origin = (-8.05, 32.32, 0.0)
    rotation = 0.0
    furniture = bpy.data.objects["VIS_B03_Interior_F01_Library_FurnitureProps"]
    signs = bpy.data.objects["VIS_B03_Interior_F01_Library_SignsPaper"]
    furniture_components = connected_component_aabbs(furniture)
    sign_components = connected_component_aabbs(signs)

    for local_center, size, _swatch in BULLETIN_BOARD_FURNITURE_PARTS:
        require_component_bounds(
            "図書室掲示板の板面・木枠",
            furniture_components,
            transformed_box_bounds(origin, local_center, size, rotation),
        )

    board_bounds = transformed_box_bounds(
        origin,
        BULLETIN_BOARD_FURNITURE_PARTS[0][0],
        BULLETIN_BOARD_FURNITURE_PARTS[0][1],
        rotation,
    )
    board_front_y = board_bounds[0][1]
    for local_center, size, _swatch in BULLETIN_BOARD_PAPER_PARTS:
        expected = transformed_box_bounds(origin, local_center, size, rotation)
        require_component_bounds("図書室掲示板の掲示紙", sign_components, expected)
        if expected[1][1] > board_front_y - 0.005 + 1e-5:
            raise RuntimeError("図書室掲示板の掲示紙が板面へ埋没しています")
    return {
        "furniture_parts": len(BULLETIN_BOARD_FURNITURE_PARTS),
        "papers": len(BULLETIN_BOARD_PAPER_PARTS),
    }


def audit_infirmary_layout() -> dict[str, float | int]:
    furniture = bpy.data.objects["VIS_B03_Interior_F01_Infirmary_FurnitureProps"]
    collider = bpy.data.objects["COL_B03_Interior_F01_Infirmary"]
    visual_components = connected_component_aabbs(furniture)
    collider_components = connected_component_aabbs(collider)

    storage_bounds: list[tuple[Vector, Vector]] = []
    additional_sizes = {
        "MedicalCabinet": (1.20, 0.45, 1.80),
        "WashBasin": (1.20, 0.50, 0.85),
    }
    for prop_type, x, y, rotation in INFIRMARY_NORTH_STORAGE_PLACEMENTS:
        size = PROP_COLLIDER_SIZES.get(prop_type, additional_sizes.get(prop_type))
        if size is None:
            raise RuntimeError(f"保健室北壁設備の寸法がありません: {prop_type}")
        local_center = PROP_COLLIDER_LOCAL_CENTERS.get(
            prop_type,
            (0.0, 0.0, size[2] / 2.0),
        )
        expected = transformed_box_bounds(
            (x, y, 0.0),
            local_center,
            size,
            rotation,
        )
        require_component_bounds(
            f"保健室北壁{prop_type}Collider",
            collider_components,
            expected,
        )
        storage_bounds.append((Vector(expected[0]), Vector(expected[1])))
    storage_bounds.sort(key=lambda bounds: bounds[0].x)
    for previous, current in zip(storage_bounds, storage_bounds[1:]):
        if abs(previous[1].x - current[0].x) > 1e-5:
            raise RuntimeError("保健室北壁設備の間に隙間があります")
    if any(abs(maximum.y - 12.35) > 1e-5 for _, maximum in storage_bounds):
        raise RuntimeError("保健室北壁設備の背面が北壁へ揃っていません")

    trash_bounds = box_bounds(
        (
            INFIRMARY_TRASH_BIN[0],
            INFIRMARY_TRASH_BIN[1],
            INFIRMARY_TRASH_BIN[2] + 0.25,
        ),
        (0.30, 0.30, 0.50),
    )
    require_component_bounds(
        "保健室ごみ箱",
        visual_components,
        trash_bounds,
    )
    if abs(storage_bounds[-1][1].x - trash_bounds[0][0]) > 1e-5:
        raise RuntimeError("保健室清掃用具入れとごみ箱が接していません")

    for x, y, rotation in INFIRMARY_BED_PLACEMENTS:
        expected = transformed_box_bounds(
            (x, y, 0.0),
            (0.0, 0.0, 0.275),
            PROP_COLLIDER_SIZES["InfirmaryBed"],
            rotation,
        )
        require_component_bounds(
            "保健室ベッドCollider",
            collider_components,
            expected,
        )
        dimensions = Vector(expected[1]) - Vector(expected[0])
        if abs(dimensions.x - 0.90) > 1e-5 or abs(dimensions.y - 2.00) > 1e-5:
            raise RuntimeError("保健室ベッドが南枕・北足の向きではありません")

    curtain_checks = 0
    for x, y, length, rotation in INFIRMARY_CURTAIN_SEGMENTS:
        expected = transformed_box_bounds(
            (x, y, 0.0),
            (0.0, 0.0, 1.35),
            (length, 0.05, 1.80),
            rotation,
        )
        require_component_bounds(
            "保健室アイボリーカーテン",
            visual_components,
            expected,
        )
        curtain_checks += 1
    if ATLAS_DEFINITIONS["FurnitureProps"]["swatches"]["fabric_ivory"] != (
        232,
        222,
        188,
    ):
        raise RuntimeError("保健室カーテンのアイボリー色が確定値と違います")
    curtain_zone_area = (
        INFIRMARY_CURTAIN_SEGMENTS[0][2]
        * INFIRMARY_CURTAIN_SEGMENTS[1][2]
    )
    room_area = (12.45 - 3.65) * (12.35 - 2.65)
    curtain_zone_ratio = curtain_zone_area / room_area
    if curtain_zone_ratio <= 1.0 / 3.0:
        raise RuntimeError("保健室のベッド・カーテン区画が室内の3分の1以下です")

    for x, y, rotation in INFIRMARY_JOINED_DESKS:
        require_component_bounds(
            "保健室接合机Collider",
            collider_components,
            transformed_box_bounds(
                (x, y, 0.0),
                (0.0, 0.0, 0.35),
                PROP_COLLIDER_SIZES["ClassroomDesk"],
                rotation,
            ),
        )
    first_desk = transformed_box_bounds(
        (INFIRMARY_JOINED_DESKS[0][0], INFIRMARY_JOINED_DESKS[0][1], 0.0),
        (0.0, 0.0, 0.35),
        PROP_COLLIDER_SIZES["ClassroomDesk"],
        INFIRMARY_JOINED_DESKS[0][2],
    )
    second_desk = transformed_box_bounds(
        (INFIRMARY_JOINED_DESKS[1][0], INFIRMARY_JOINED_DESKS[1][1], 0.0),
        (0.0, 0.0, 0.35),
        PROP_COLLIDER_SIZES["ClassroomDesk"],
        INFIRMARY_JOINED_DESKS[1][2],
    )
    if abs(first_desk[1][0] - second_desk[0][0]) > 1e-5:
        raise RuntimeError("保健室の机1・2が接合されていません")
    for x, y, rotation in INFIRMARY_JOINED_CHAIRS:
        require_component_bounds(
            "保健室向かい合わせ椅子座面",
            visual_components,
            transformed_box_bounds(
                (x, y, 0.0),
                (0.0, 0.0, 0.43),
                (0.42, 0.45, 0.035),
                rotation,
            ),
        )

    require_component_bounds(
        "保健室職員椅子座面",
        visual_components,
        transformed_box_bounds(
            (INFIRMARY_STAFF_CHAIR[0], INFIRMARY_STAFF_CHAIR[1], 0.0),
            (0.0, 0.0, 0.51),
            (0.48, 0.46, 0.08),
            INFIRMARY_STAFF_CHAIR[2],
        ),
    )
    return {
        "north_storage": len(storage_bounds),
        "beds": len(INFIRMARY_BED_PLACEMENTS),
        "curtains": curtain_checks,
        "curtain_zone_ratio": round(curtain_zone_ratio, 6),
        "joined_desks": len(INFIRMARY_JOINED_DESKS),
    }


def audit_staffroom_storage_layout() -> dict[str, int]:
    furniture = bpy.data.objects["VIS_B03_Interior_F01_StaffRoom_FurnitureProps"]
    collider = bpy.data.objects["COL_B03_Interior_F01_StaffRoom"]
    visual_components = connected_component_aabbs(furniture)
    collider_components = connected_component_aabbs(collider)
    minimum_x, maximum_x, minimum_y, maximum_y = STAFFROOM_INTERIOR_BOUNDS

    placements = (
        ("CleaningLocker", STAFFROOM_CLEANING_LOCKER),
        *(("Bookshelf", placement) for placement in STAFFROOM_WEST_BOOKSHELVES),
        *(("Bookshelf", placement) for placement in STAFFROOM_EAST_BOOKSHELVES),
    )
    storage_bounds: list[tuple[str, Vector, Vector]] = []
    for prop_type, (x, y, rotation) in placements:
        size = PROP_COLLIDER_SIZES[prop_type]
        expected = transformed_box_bounds(
            (x, y, 0.0),
            (0.0, 0.0, size[2] / 2.0),
            size,
            rotation,
        )
        require_component_bounds(
            f"職員室{prop_type}Collider",
            collider_components,
            expected,
        )
        expected_minimum = Vector(expected[0])
        expected_maximum = Vector(expected[1])
        if (
            expected_minimum.x < minimum_x - 1e-5
            or expected_maximum.x > maximum_x + 1e-5
            or expected_minimum.y < minimum_y - 1e-5
            or expected_maximum.y > maximum_y + 1e-5
        ):
            raise RuntimeError(f"職員室{prop_type}が室内境界外です")
        storage_bounds.append((prop_type, expected_minimum, expected_maximum))
        if prop_type == "Bookshelf":
            require_component_bounds(
                "職員室本棚背板",
                visual_components,
                transformed_box_bounds(
                    (x, y, 0.0),
                    (0.0, 0.14, 0.90),
                    (0.90, 0.04, 1.80),
                    rotation,
                ),
            )

    west = sorted(
        (
            (minimum, maximum)
            for _prop_type, minimum, maximum in storage_bounds
            if abs(minimum.x - minimum_x) < 1e-5
        ),
        key=lambda bounds: bounds[0].y,
        reverse=True,
    )
    east = sorted(
        (
            (minimum, maximum)
            for _prop_type, minimum, maximum in storage_bounds
            if abs(maximum.x - maximum_x) < 1e-5
        ),
        key=lambda bounds: bounds[0].y,
        reverse=True,
    )
    if len(west) != 3 or len(east) != 3:
        raise RuntimeError("職員室の西壁3台・東壁3台の収納列が不足しています")
    for row in (west, east):
        if abs(row[0][1].y - maximum_y) > 1e-5:
            raise RuntimeError("職員室収納列が北壁側から始まっていません")
        for northern, southern in zip(row, row[1:]):
            if abs(northern[0].y - southern[1].y) > 1e-5:
                raise RuntimeError("職員室壁際収納の間に隙間があります")
    return {
        "west_storage": len(west),
        "east_bookshelves": len(east),
        "islands": len(STAFFROOM_ISLAND_XS),
    }


def audit_pc_room_fixed_layout() -> dict[str, int]:
    collider = bpy.data.objects["COL_B03_Interior_F01_PcRoom"]
    collider_components = connected_component_aabbs(collider)
    desk_checks = 0
    for row_y in (38.5, 40.9, 43.0):
        for column in range(6):
            x = 24.8 + column * 3.1
            require_component_bounds(
                "PC室職員机Collider",
                collider_components,
                transformed_box_bounds(
                    (x, row_y, 0.0),
                    PROP_COLLIDER_LOCAL_CENTERS["StaffDesk"],
                    PROP_COLLIDER_SIZES["StaffDesk"],
                    -math.pi / 2,
                ),
            )
            desk_checks += 1
    for prop_type, x, y, rotation in (
        ("BaggageLocker", 29.0, 44.8, 0.0),
        ("BaggageLocker", 31.2, 44.8, 0.0),
        ("CleaningLocker", 32.7, 44.8, 0.0),
    ):
        size = PROP_COLLIDER_SIZES[prop_type]
        require_component_bounds(
            f"PC室{prop_type}Collider",
            collider_components,
            transformed_box_bounds(
                (x, y, 0.0),
                (0.0, 0.0, size[2] / 2.0),
                size,
                rotation,
            ),
        )
    require_component_bounds(
        "PC室AVラックCollider",
        collider_components,
        box_bounds((40.8, 44.6875, 0.75), (0.70, 0.525, 1.50)),
    )
    return {
        "desks": desk_checks,
        "baggage_lockers": 2,
        "cleaning_lockers": 1,
        "av_racks": 1,
    }


def audit_art_room_placement() -> dict[str, int]:
    visual = bpy.data.objects["VIS_B03_Interior_F03_Art_FurnitureProps"]
    collider = bpy.data.objects["COL_B03_Interior_F03_Art"]
    visual_components = connected_component_aabbs(visual)
    collider_components = connected_component_aabbs(collider)
    minimum_x, maximum_x, minimum_y, maximum_y = ART_INTERIOR_BOUNDS
    outside = [
        index
        for index, (minimum, maximum) in enumerate(visual_components, 1)
        if minimum.x < minimum_x - 1e-5
        or maximum.x > maximum_x + 1e-5
        or minimum.y < minimum_y - 1e-5
        or maximum.y > maximum_y + 1e-5
    ]
    if outside:
        raise RuntimeError(f"3階美術室家具が室外へ越境しています: {outside}")

    expected_colliders = [
        box_bounds((x, y, 7.56), PROP_COLLIDER_SIZES["LargeWoodTable"])
        for x in ART_TABLE_XS
        for y in ART_TABLE_YS
    ]
    expected_colliders.extend(
        transformed_box_bounds(
            (x, y, 7.2),
            (0.0, 0.0, PROP_COLLIDER_SIZES["Bookshelf"][2] / 2.0),
            PROP_COLLIDER_SIZES["Bookshelf"],
            rotation,
        )
        for x, y, rotation in ART_BOOKSHELF_PLACEMENTS
    )
    locker_x, locker_y, locker_rotation = ART_CLEANING_LOCKER
    expected_colliders.append(
        transformed_box_bounds(
            (locker_x, locker_y, 7.2),
            (0.0, 0.0, PROP_COLLIDER_SIZES["CleaningLocker"][2] / 2.0),
            PROP_COLLIDER_SIZES["CleaningLocker"],
            locker_rotation,
        )
    )
    if len(collider_components) != len(expected_colliders):
        raise RuntimeError(
            "3階美術室Collider数が不正です: "
            f"{len(collider_components)}/{len(expected_colliders)}"
        )
    for expected in expected_colliders:
        require_component_bounds("3階美術室家具Collider", collider_components, expected)

    easel_canvas_part = ((0.0, -0.025, 1.13), (0.52, 0.02, 0.65))
    for x in ART_EASEL_XS:
        require_component_bounds(
            "3階美術室イーゼル",
            visual_components,
            transformed_box_bounds(
                (x, ART_EASEL_Y, 7.2),
                easel_canvas_part[0],
                easel_canvas_part[1],
                math.pi / 2,
            ),
        )

    toilet_minimum = Vector((TOILET_COMMON_OPENING[0], 38.5, 7.2))
    toilet_maximum = Vector((TOILET_COMMON_OPENING[1], 45.5, 10.2))
    toilet_overlaps = [
        index
        for index, (minimum, maximum) in enumerate(
            [*visual_components, *collider_components],
            1,
        )
        if aabb_overlaps(
            minimum,
            maximum,
            toilet_minimum,
            toilet_maximum,
        )
    ]
    if toilet_overlaps:
        raise RuntimeError(
            f"3階美術室家具がトイレ区画へ越境しています: {toilet_overlaps}"
        )
    return {
        "visual_components": len(visual_components),
        "colliders": len(collider_components),
        "easels": len(ART_EASEL_XS),
        "toilet_overlap_checks": len(visual_components) + len(collider_components),
    }


def audit_ll_room_placement() -> dict[str, int]:
    visual = bpy.data.objects["VIS_B03_Interior_F04_LL_FurnitureProps"]
    collider = bpy.data.objects["COL_B03_Interior_F04_LL"]
    visual_components = connected_component_aabbs(visual)
    collider_components = connected_component_aabbs(collider)
    minimum_x, maximum_x, minimum_y, maximum_y = LL_INTERIOR_BOUNDS
    outside = [
        index
        for index, (minimum, maximum) in enumerate(visual_components, 1)
        if minimum.x < minimum_x - 1e-5
        or maximum.x > maximum_x + 1e-5
        or minimum.y < minimum_y - 1e-5
        or maximum.y > maximum_y + 1e-5
    ]
    if outside:
        raise RuntimeError(f"4階LL室家具が室外へ越境しています: {outside}")

    expected_colliders = [
        transformed_box_bounds(
            (x, y, 10.8),
            (0.0, 0.0, PROP_COLLIDER_SIZES["ClassroomDesk"][2] / 2.0),
            PROP_COLLIDER_SIZES["ClassroomDesk"],
            -math.pi / 2,
        )
        for y in LL_DESK_YS
        for x in LL_DESK_XS
    ]
    expected_colliders.extend(
        box_bounds(
            (x, 44.8, 11.4),
            PROP_COLLIDER_SIZES["BaggageLocker"],
        )
        for x in LL_BAGGAGE_LOCKER_XS
    )
    ll_av_rack_collider = box_bounds(
        (LL_AV_RACK[0], LL_AV_RACK[1] - 0.0125, 11.55),
        (0.7, 0.525, 1.5),
    )
    expected_colliders.append(ll_av_rack_collider)
    if len(collider_components) != len(expected_colliders):
        raise RuntimeError(
            f"4階LL室Collider数が不正です: "
            f"{len(collider_components)}/{len(expected_colliders)}"
        )
    for expected in expected_colliders:
        require_component_bounds("4階LL室家具Collider", collider_components, expected)
    ll_av_rack_visuals = [
        transformed_box_bounds(
            (LL_AV_RACK[0], LL_AV_RACK[1], 10.8),
            local_center,
            size,
            0.0,
        )
        for local_center, size in (
            ((0.0, 0.0, 0.75), (0.7, 0.5, 1.5)),
            ((0.0, -0.26, 0.9), (0.52, 0.03, 0.3)),
        )
    ]
    for expected in ll_av_rack_visuals:
        require_component_bounds("4階LL室AVラック表示", visual_components, expected)
    ll_av_rack_visual_containment = require_bounds_contained(
        "4階LL室AVラック表示",
        ll_av_rack_collider,
        [
            (Vector(minimum), Vector(maximum))
            for minimum, maximum in ll_av_rack_visuals
        ],
    )

    overlaps = [
        (first_index, second_index)
        for first_index, (first_minimum, first_maximum) in enumerate(
            collider_components,
            1,
        )
        for second_index, (second_minimum, second_maximum) in enumerate(
            collider_components[first_index:],
            first_index + 1,
        )
        if aabb_overlaps(
            first_minimum,
            first_maximum,
            second_minimum,
            second_maximum,
        )
    ]
    if overlaps:
        raise RuntimeError(f"4階LL室家具Collider同士が重なっています: {overlaps}")

    toilet_minimum = Vector((TOILET_COMMON_OPENING[0], 38.5, 10.8))
    toilet_maximum = Vector((TOILET_COMMON_OPENING[1], 45.5, 13.8))
    toilet_overlaps = [
        index
        for index, (minimum, maximum) in enumerate(
            [*visual_components, *collider_components],
            1,
        )
        if aabb_overlaps(
            minimum,
            maximum,
            toilet_minimum,
            toilet_maximum,
        )
    ]
    if toilet_overlaps:
        raise RuntimeError(f"4階LL室家具がトイレ区画へ越境しています: {toilet_overlaps}")
    return {
        "visual_components": len(visual_components),
        "colliders": len(collider_components),
        "av_rack_visual_containment": ll_av_rack_visual_containment,
        "furniture_overlap_checks": (
            len(collider_components) * (len(collider_components) - 1) // 2
        ),
        "toilet_overlap_checks": len(visual_components) + len(collider_components),
    }


def audit_music_room_orientation() -> dict[str, int]:
    if tuple(MUSIC_PIANO_PLACEMENT) != (40.4, 42.5, -math.pi / 2):
        raise RuntimeError("音楽室ピアノの確定配置が変化しています")
    if tuple(MUSIC_CHAIR_XS) != (29.0, 30.55, 32.1, 33.65, 35.2, 36.75):
        raise RuntimeError("音楽室椅子のX座標が変化しています")
    if tuple(MUSIC_CHAIR_YS) != (38.2, 39.55, 40.9, 42.25, 43.6):
        raise RuntimeError("音楽室椅子のY座標が変化しています")
    if abs(MUSIC_CHAIR_ROTATION - math.pi / 2) > 1e-7:
        raise RuntimeError("音楽室の椅子が東向きではありません")

    visual = bpy.data.objects["VIS_B03_Interior_F04_Music_FurnitureProps"]
    collider = bpy.data.objects["COL_B03_Interior_F04_Music"]
    visual_components = connected_component_aabbs(visual)
    collider_components = connected_component_aabbs(collider)
    piano_x, piano_y, piano_rotation = MUSIC_PIANO_PLACEMENT
    piano_collider_bounds = transformed_box_bounds(
        (piano_x, piano_y, 10.8),
        (0.0, 0.0, PROP_COLLIDER_SIZES["GrandPiano"][2] / 2.0),
        PROP_COLLIDER_SIZES["GrandPiano"],
        piano_rotation,
    )
    require_component_bounds(
        "音楽室ピアノCollider",
        collider_components,
        piano_collider_bounds,
    )
    if not bounds_match(
        (Vector(piano_collider_bounds[0]), Vector(piano_collider_bounds[1])),
        (
            (39.675, 41.725, 10.8),
            (41.125, 43.275, 11.8),
        ),
    ):
        raise RuntimeError(
            f"音楽室ピアノColliderの確定AABBが不正です: {piano_collider_bounds}"
        )
    piano_visual_components = [
        (minimum, maximum)
        for minimum, maximum in visual_components
        if all(
            piano_collider_bounds[0][axis] - 1e-4
            <= (minimum[axis] + maximum[axis]) / 2.0
            <= piano_collider_bounds[1][axis] + 1e-4
            for axis in range(3)
        )
    ]
    if len(piano_visual_components) != 9:
        raise RuntimeError(
            "音楽室ピアノの表示9部品をCollider内で特定できません: "
            f"{len(piano_visual_components)}/9"
        )
    piano_visual_union = component_union_bounds(piano_visual_components)
    if not bounds_match(piano_visual_union, piano_collider_bounds):
        raise RuntimeError(
            "音楽室ピアノ表示の合成AABBがColliderと一致しません: "
            f"{piano_visual_union}/{piano_collider_bounds}"
        )
    piano_visual_containment = require_bounds_contained(
        "音楽室ピアノ表示",
        piano_collider_bounds,
        piano_visual_components,
    )

    keyboard_bounds = transformed_box_bounds(
        (piano_x, piano_y, 10.8),
        (-0.22, -0.605, 0.73),
        (1.05, 0.24, 0.035),
        piano_rotation,
    )
    require_component_bounds("音楽室ピアノ鍵盤", visual_components, keyboard_bounds)
    if keyboard_bounds[1][0] >= piano_x:
        raise RuntimeError("音楽室ピアノの鍵盤が西側を向いていません")

    blackboard_bounds = (
        (41.26, 39.2, 11.92),
        (41.34, 42.8, 13.12),
    )
    for component_bounds in (
        ((41.28, 39.26, 11.98), (41.32, 42.74, 13.06)),
        ((41.26, 39.2, 13.06), (41.34, 42.8, 13.12)),
        ((41.26, 39.2, 11.92), (41.34, 42.8, 11.98)),
        ((41.26, 39.2, 11.98), (41.34, 39.26, 13.06)),
        ((41.26, 42.74, 11.98), (41.34, 42.8, 13.06)),
    ):
        require_component_bounds(
            "音楽室東壁黒板",
            visual_components,
            component_bounds,
        )
    blackboard_gap = blackboard_bounds[0][0] - piano_collider_bounds[1][0]
    if blackboard_gap < 0.135 - 1e-5:
        raise RuntimeError(
            f"音楽室ピアノと東壁黒板の間隔が不足しています: {blackboard_gap}"
        )

    south_wall_inner_y = 36.65
    door_clearance = piano_collider_bounds[0][1] - south_wall_inner_y
    if door_clearance < 5.0:
        raise RuntimeError(
            f"音楽室ピアノが南側出入口へ近すぎます: {door_clearance}"
        )

    chair_back_checks = 0
    for y in MUSIC_CHAIR_YS:
        for x in MUSIC_CHAIR_XS:
            expected_back = transformed_box_bounds(
                (x, y, 10.8),
                (0.0, 0.195, 0.65),
                (0.42, 0.06, 0.26),
                MUSIC_CHAIR_ROTATION,
            )
            require_component_bounds(
                "音楽室東向き椅子の背板",
                visual_components,
                expected_back,
            )
            if expected_back[1][0] >= x:
                raise RuntimeError("音楽室椅子の背板が座面の西側にありません")
            chair_back_checks += 1

    return {
        "piano_collider": 1,
        "piano_keyboard": 1,
        "piano_visual_containment": piano_visual_containment,
        "chair_backs": chair_back_checks,
        "blackboard_clearance_mm": round(blackboard_gap * 1000),
        "door_clearance_mm": round(door_clearance * 1000),
    }


def audit_toilet_front_structures() -> dict[str, int]:
    expected_wall_spans = (
        (-6.6, -5.4),
        (-4.2, -2.1),
        (-2.1, -0.9),
        (0.3, 2.4),
    )
    expected_door_openings = ((-5.4, -4.2), (-0.9, 0.3))
    expected_sign_placements = (
        (-5.825, 38.34, math.pi),
        (0.725, 38.34, math.pi),
    )
    if tuple(TOILET_FRONT_WALL_SPANS) != expected_wall_spans:
        raise RuntimeError("トイレ正面壁4区画の確定座標が変化しています")
    if tuple(TOILET_FRONT_DOOR_OPENINGS) != expected_door_openings:
        raise RuntimeError("トイレ正面入口2区画の確定座標が変化しています")
    if (
        TOILET_FRONT_WALL_Y != 38.5
        or TOILET_FRONT_WALL_DEPTH != 0.30
        or TOILET_FRONT_DOOR_HEIGHT != 2.3
        or tuple(TOILET_COMMON_OPENING) != (-6.6, 5.4)
    ):
        raise RuntimeError("トイレ正面・共用前室の確定寸法が変化しています")
    if tuple(TOILET_SIGN_PLACEMENTS) != expected_sign_placements:
        raise RuntimeError("トイレ表札の確定座標が変化しています")
    expected_front_components = (
        len(TOILET_FRONT_WALL_SPANS) + len(TOILET_FRONT_DOOR_OPENINGS)
    )
    wall_objects = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and is_architecture_wall_collider(obj)
    ]
    front_component_checks = 0
    door_opening_checks = 0
    common_opening_checks = 0
    sign_support_checks = 0

    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        visual = bpy.data.objects[
            f"VIS_B03_Interior_F{floor:02d}_Toilets_Architecture"
        ]
        collider = bpy.data.objects[
            f"COL_B03_Interior_Walls_F{floor:02d}_Toilets"
        ]
        object_components = (
            connected_component_aabbs(visual),
            connected_component_aabbs(collider),
        )

        expected_bounds = [
            box_bounds(
                (
                    (minimum_x + maximum_x) / 2.0,
                    TOILET_FRONT_WALL_Y,
                    base_z + 1.5,
                ),
                (
                    maximum_x - minimum_x,
                    TOILET_FRONT_WALL_DEPTH,
                    3.0,
                ),
            )
            for minimum_x, maximum_x in TOILET_FRONT_WALL_SPANS
        ]
        expected_bounds.extend(
            box_bounds(
                (
                    (minimum_x + maximum_x) / 2.0,
                    TOILET_FRONT_WALL_Y,
                    base_z + (TOILET_FRONT_DOOR_HEIGHT + 3.0) / 2.0,
                ),
                (
                    maximum_x - minimum_x,
                    TOILET_FRONT_WALL_DEPTH,
                    3.0 - TOILET_FRONT_DOOR_HEIGHT,
                ),
            )
            for minimum_x, maximum_x in TOILET_FRONT_DOOR_OPENINGS
        )

        for components in object_components:
            front_components = [
                (minimum, maximum)
                for minimum, maximum in components
                if (maximum - minimum).y <= TOILET_FRONT_WALL_DEPTH + 1e-5
                and minimum.y <= TOILET_FRONT_WALL_Y + TOILET_FRONT_WALL_DEPTH / 2
                and maximum.y >= TOILET_FRONT_WALL_Y - TOILET_FRONT_WALL_DEPTH / 2
            ]
            if len(front_components) != expected_front_components:
                raise RuntimeError(
                    f"F{floor:02d}トイレ正面構造が"
                    f"{expected_front_components}区画ではありません: "
                    f"{len(front_components)}"
                )
            for expected in expected_bounds:
                require_component_bounds(
                    f"F{floor:02d}トイレ正面壁・まぐさ",
                    front_components,
                    expected,
                )
                front_component_checks += 1

            for minimum_x, maximum_x in TOILET_FRONT_DOOR_OPENINGS:
                opening_minimum = Vector(
                    (
                        minimum_x + 0.01,
                        TOILET_FRONT_WALL_Y - TOILET_FRONT_WALL_DEPTH / 2 - 0.01,
                        base_z + 0.01,
                    )
                )
                opening_maximum = Vector(
                    (
                        maximum_x - 0.01,
                        TOILET_FRONT_WALL_Y + TOILET_FRONT_WALL_DEPTH / 2 + 0.01,
                        base_z + TOILET_FRONT_DOOR_HEIGHT - 0.01,
                    )
                )
                if any(
                    aabb_overlaps(
                        opening_minimum,
                        opening_maximum,
                        minimum,
                        maximum,
                    )
                    for minimum, maximum in front_components
                ):
                    raise RuntimeError(f"F{floor:02d}トイレ入口が壁で塞がれています")
            door_opening_checks += len(TOILET_FRONT_DOOR_OPENINGS)

        common_minimum = Vector(
            (
                TOILET_COMMON_OPENING[0] + 0.15,
                36.35,
                base_z + 0.05,
            )
        )
        common_maximum = Vector(
            (
                TOILET_COMMON_OPENING[1] - 0.15,
                36.65,
                base_z + 2.25,
            )
        )
        common_violations = [
            f"{obj.name}#{component_index}"
            for obj in wall_objects
            for component_index, (minimum, maximum) in enumerate(
                connected_component_aabbs(obj),
                1,
            )
            if aabb_overlaps(
                common_minimum,
                common_maximum,
                minimum,
                maximum,
            )
        ]
        if common_violations:
            raise RuntimeError(
                f"F{floor:02d}トイレ共用前室入口が壁で塞がれています: "
                f"{common_violations}"
            )
        common_opening_checks += 1

        signs = bpy.data.objects[
            f"VIS_B03_Interior_F{floor:02d}_Toilets_SignsPaper"
        ]
        sign_components = connected_component_aabbs(signs)
        wall_components = object_components[1]
        for x, y, rotation in TOILET_SIGN_PLACEMENTS:
            expected_sign = transformed_box_bounds(
                (x, y, base_z),
                (0.0, 0.0, 1.7),
                (0.45, 0.04, 0.18),
                rotation,
            )
            require_component_bounds(
                "トイレ正面壁表札",
                sign_components,
                expected_sign,
            )
            sign_minimum = Vector(expected_sign[0])
            sign_maximum = Vector(expected_sign[1])
            if not any(
                aabb_axis_gap(
                    sign_minimum,
                    sign_maximum,
                    wall_minimum,
                    wall_maximum,
                    1,
                )
                <= 1e-4
                and interval_contains(
                    wall_minimum.x,
                    wall_maximum.x,
                    sign_minimum.x,
                    sign_maximum.x,
                )
                and interval_contains(
                    wall_minimum.z,
                    wall_maximum.z,
                    sign_minimum.z,
                    sign_maximum.z,
                )
                for wall_minimum, wall_maximum in wall_components
            ):
                raise RuntimeError(f"F{floor:02d}トイレ表札が実壁に支持されていません")
            sign_support_checks += 1

    return {
        "front_component_checks": front_component_checks,
        "door_opening_checks": door_opening_checks,
        "common_opening_checks": common_opening_checks,
        "sign_support_checks": sign_support_checks,
    }


def audit_broadcast_orientation() -> dict[str, int]:
    visual = bpy.data.objects["VIS_B03_Interior_F02_Broadcast_FurnitureProps"]
    collider = bpy.data.objects["COL_B03_Interior_F02_Broadcast"]
    components = connected_component_aabbs(visual)
    collider_components = connected_component_aabbs(collider)
    console_origin = (18.8, 41.2, 3.6)
    console_rotation = math.pi
    console_collider_bounds = transformed_box_bounds(
        console_origin,
        (0.0, 0.0, 0.545),
        (1.6, 0.75, 1.09),
        console_rotation,
    )
    require_component_bounds(
        "放送卓Collider",
        collider_components,
        console_collider_bounds,
    )
    console_visual_bounds = [
        transformed_box_bounds(
            console_origin,
            local_center,
            size,
            console_rotation,
        )
        for local_center, size in (
            ((0.0, 0.0, 0.36), (1.6, 0.75, 0.72)),
            ((0.0, -0.04, 0.76), (1.45, 0.55, 0.08)),
            ((0.0, 0.20, 0.94), (1.35, 0.08, 0.30)),
            ((-0.48, -0.12, 0.82), (0.18, 0.12, 0.03)),
            ((-0.16, -0.12, 0.82), (0.18, 0.12, 0.03)),
            ((0.16, -0.12, 0.82), (0.18, 0.12, 0.03)),
            ((0.48, -0.12, 0.82), (0.18, 0.12, 0.03)),
        )
    ]
    for expected in console_visual_bounds:
        require_component_bounds("放送卓表示", components, expected)
    console_visual_components = [
        (Vector(minimum), Vector(maximum))
        for minimum, maximum in console_visual_bounds
    ]
    console_visual_containment = require_bounds_contained(
        "放送卓表示",
        console_collider_bounds,
        console_visual_components,
    )
    if not bounds_match(
        component_union_bounds(console_visual_components),
        console_collider_bounds,
    ):
        raise RuntimeError("放送卓表示の合成AABBがColliderと一致しません")

    av_rack_origin = (15.2, 44.7, 3.6)
    av_rack_collider_bounds = transformed_box_bounds(
        av_rack_origin,
        (0.0, -0.0125, 0.75),
        (0.7, 0.525, 1.5),
        0.0,
    )
    require_component_bounds(
        "放送室AVラックCollider",
        collider_components,
        av_rack_collider_bounds,
    )
    av_rack_visual_bounds = [
        transformed_box_bounds(av_rack_origin, local_center, size, 0.0)
        for local_center, size in (
            ((0.0, 0.0, 0.75), (0.7, 0.5, 1.5)),
            ((0.0, -0.26, 0.9), (0.52, 0.03, 0.3)),
        )
    ]
    for expected in av_rack_visual_bounds:
        require_component_bounds("放送室AVラック表示", components, expected)
    av_rack_visual_components = [
        (Vector(minimum), Vector(maximum))
        for minimum, maximum in av_rack_visual_bounds
    ]
    av_rack_visual_containment = require_bounds_contained(
        "放送室AVラック表示",
        av_rack_collider_bounds,
        av_rack_visual_components,
    )
    if not bounds_match(
        component_union_bounds(av_rack_visual_components),
        av_rack_collider_bounds,
    ):
        raise RuntimeError("放送室AVラック表示の合成AABBがColliderと一致しません")

    controls = [
        (minimum, maximum)
        for minimum, maximum in components
        if dimensions_match(minimum, maximum, (0.18, 0.12, 0.03))
        and abs(((minimum.z + maximum.z) / 2.0) - 4.42) <= 1e-4
    ]
    if len(controls) != 4 or any(
        (minimum.y + maximum.y) / 2.0 <= 41.2 for minimum, maximum in controls
    ):
        raise RuntimeError("放送卓の操作面が椅子側を向いていません")
    monitor_bodies = [
        (minimum, maximum)
        for minimum, maximum in components
        if dimensions_match(minimum, maximum, (0.55, 0.058, 0.32))
    ]
    monitor_screens = [
        (minimum, maximum)
        for minimum, maximum in components
        if dimensions_match(minimum, maximum, (0.49, 0.0, 0.265))
    ]
    if len(monitor_bodies) != 2 or len(monitor_screens) != 2:
        raise RuntimeError("放送卓のモニター構成が不正です")
    for screen_minimum, screen_maximum in monitor_screens:
        screen_center = (screen_minimum + screen_maximum) * 0.5
        matching_bodies = [
            (minimum, maximum)
            for minimum, maximum in monitor_bodies
            if abs(((minimum.x + maximum.x) / 2.0) - screen_center.x) <= 1e-4
        ]
        if len(matching_bodies) != 1:
            raise RuntimeError("放送卓モニターの画面と本体を対応付けられません")
        body_minimum, body_maximum = matching_bodies[0]
        if screen_center.y <= (body_minimum.y + body_maximum.y) / 2.0:
            raise RuntimeError("放送卓モニターの画面が椅子側を向いていません")
    return {
        "controls_and_screens": len(controls) + len(monitor_screens),
        "console_visual_containment": console_visual_containment,
        "av_rack_visual_containment": av_rack_visual_containment,
    }


def audit_council_placement() -> int:
    visual = bpy.data.objects["VIS_B03_Interior_F02_Council_FurnitureProps"]
    collider = bpy.data.objects["COL_B03_Interior_F02_Council"]
    minimum_x, maximum_x, minimum_y, maximum_y = COUNCIL_INTERIOR_BOUNDS
    visual_components = connected_component_aabbs(visual)
    collider_components = connected_component_aabbs(collider)
    outside = [
        index
        for index, (minimum, maximum) in enumerate(visual_components, 1)
        if minimum.x < minimum_x - 1e-5
        or maximum.x > maximum_x + 1e-5
        or minimum.y < minimum_y - 1e-5
        or maximum.y > maximum_y + 1e-5
    ]
    if outside:
        raise RuntimeError(f"生徒会室家具が新しい室境界外です: {outside}")
    expected_colliders = (
        box_bounds((8.4, 41.0, 3.96), (1.80, 0.90, 0.72)),
        box_bounds((10.2, 41.0, 3.96), (1.80, 0.90, 0.72)),
        transformed_box_bounds(
            (12.5, 44.2, 3.6),
            PROP_COLLIDER_LOCAL_CENTERS["StaffDesk"],
            PROP_COLLIDER_SIZES["StaffDesk"],
            0.0,
        ),
        box_bounds((6.45, 45.125, 4.20), (1.80, 0.45, 1.20)),
    )
    if len(collider_components) != len(expected_colliders):
        raise RuntimeError(
            f"生徒会室Collider数が不正です: {len(collider_components)}/{len(expected_colliders)}"
        )
    for expected in expected_colliders:
        require_component_bounds("生徒会室家具Collider", collider_components, expected)
    return len(visual_components) + len(collider_components)


def audit_staff_desk_collider_contract() -> dict[str, int]:
    staff_desk_size = PROP_COLLIDER_SIZES["StaffDesk"]
    staff_desk_local_center = PROP_COLLIDER_LOCAL_CENTERS["StaffDesk"]
    if any(
        abs(actual - expected) > 1e-9
        for actual, expected in zip(staff_desk_size, (1.40, 0.71, 0.72))
    ):
        raise RuntimeError(
            f"職員机Collider寸法が表示外形と一致しません: {staff_desk_size}"
        )
    if any(
        abs(actual - expected) > 1e-9
        for actual, expected in zip(
            staff_desk_local_center,
            (0.0, -0.005, 0.36),
        )
    ):
        raise RuntimeError(
            "職員机Collider中心が表示外形と一致しません: "
            f"{staff_desk_local_center}"
        )

    visual_parts = (
        ((0.0, 0.0, 0.70), (1.40, 0.70, 0.04)),
        ((-0.50, 0.0, 0.33), (0.34, 0.62, 0.66)),
        ((0.50, 0.0, 0.33), (0.34, 0.62, 0.66)),
        ((0.0, 0.3325, 0.43), (0.66, 0.035, 0.36)),
        ((-0.50, -0.32, 0.51), (0.025, 0.08, 0.02)),
        ((0.50, -0.32, 0.51), (0.025, 0.08, 0.02)),
    )

    visual_containment_checks = 0
    collider_checks = 0

    def audit_instance(
        label: str,
        room_name: str,
        origin: tuple[float, float, float],
        rotation: float,
    ) -> tuple[Vector, Vector]:
        nonlocal visual_containment_checks, collider_checks
        visual_components = connected_component_aabbs(
            bpy.data.objects[f"VIS_B03_Interior_{room_name}_FurnitureProps"]
        )
        collider_components = connected_component_aabbs(
            bpy.data.objects[f"COL_B03_Interior_{room_name}"]
        )
        collider_bounds = transformed_box_bounds(
            origin,
            staff_desk_local_center,
            staff_desk_size,
            rotation,
        )
        require_component_bounds(
            f"{label}職員机Collider",
            collider_components,
            collider_bounds,
        )
        expected_visuals = [
            transformed_box_bounds(origin, local_center, size, rotation)
            for local_center, size in visual_parts
        ]
        for expected in expected_visuals:
            require_component_bounds(f"{label}職員机表示", visual_components, expected)
        visual_containment_checks += require_bounds_contained(
            f"{label}職員机表示",
            collider_bounds,
            [
                (Vector(minimum), Vector(maximum))
                for minimum, maximum in expected_visuals
            ],
        )
        if not bounds_match(
            component_union_bounds(
                [
                    (Vector(minimum), Vector(maximum))
                    for minimum, maximum in expected_visuals
                ]
            ),
            collider_bounds,
        ):
            raise RuntimeError(f"{label}職員机表示の合成AABBがColliderと一致しません")
        collider_checks += 1
        return Vector(collider_bounds[0]), Vector(collider_bounds[1])

    staffroom_colliders: list[tuple[Vector, Vector]] = []
    for island_x in STAFFROOM_ISLAND_XS:
        for row, desk_y in enumerate(STAFFROOM_DESK_YS):
            rotation = 0.0 if row == 0 else math.pi
            for desk_x in (island_x - 0.7, island_x + 0.7):
                staffroom_colliders.append(
                    audit_instance(
                        "職員室",
                        "F01_StaffRoom",
                        (desk_x, desk_y, 0.0),
                        rotation,
                    )
                )

    overlap_pairs = [
        (first_index, second_index)
        for first_index, (first_minimum, first_maximum) in enumerate(
            staffroom_colliders,
            1,
        )
        for second_index, (second_minimum, second_maximum) in enumerate(
            staffroom_colliders[first_index:],
            first_index + 1,
        )
        if aabb_overlaps(
            first_minimum,
            first_maximum,
            second_minimum,
            second_maximum,
        )
    ]
    if overlap_pairs:
        raise RuntimeError(
            f"職員室の職員机Colliderが重複しています: {overlap_pairs}"
        )

    audit_instance(
        "保健室",
        "F01_Infirmary",
        (INFIRMARY_STAFF_DESK[0], INFIRMARY_STAFF_DESK[1], 0.0),
        INFIRMARY_STAFF_DESK[2],
    )
    return {
        "collider_checks": collider_checks,
        "visual_containment_checks": visual_containment_checks,
        "staffroom_overlap_pairs": len(overlap_pairs),
    }


def audit_acceptance_placements() -> dict[str, int]:
    main_entry = bpy.data.objects["VIS_B03_Interior_F01_MainEntry_FurnitureProps"]
    main_components = connected_component_aabbs(main_entry)
    if tuple(MAIN_ENTRY_BAGGAGE_LOCKERS) != (
        (-0.425, -5.8, -math.pi / 2),
        (-0.425, -4.0, -math.pi / 2),
        (-1.975, -5.8, math.pi / 2),
        (-2.425, -5.8, -math.pi / 2),
        (-1.975, -4.0, math.pi / 2),
        (-2.425, -4.0, -math.pi / 2),
    ):
        raise RuntimeError("主玄関の荷物ロッカー確定配置が変化しています")
    if len(main_components) != 60:
        raise RuntimeError(
            "主玄関の荷物ロッカー表示部品が6台分ではありません: "
            f"{len(main_components)}"
        )
    if any(
        minimum.x < -2.65 - 1e-5
        or maximum.x > -0.20 + 1e-5
        or minimum.y < -6.70 - 1e-5
        or maximum.y > -3.10 + 1e-5
        for minimum, maximum in main_components
    ):
        raise RuntimeError("主玄関の荷物ロッカーが東壁側の確定範囲にありません")
    main_collider = bpy.data.objects["COL_B03_Interior_F01_MainEntry"]
    main_collider_components = connected_component_aabbs(main_collider)
    if len(main_collider_components) != len(MAIN_ENTRY_BAGGAGE_LOCKERS):
        raise RuntimeError(
            "主玄関の荷物ロッカーColliderが6台分ではありません: "
            f"{len(main_collider_components)}"
        )
    expected_back_panels = (
        ((-0.24, -6.70, 0.0), (-0.20, -4.90, 1.20)),
        ((-0.24, -4.90, 0.0), (-0.20, -3.10, 1.20)),
        ((-2.20, -6.70, 0.0), (-2.16, -4.90, 1.20)),
        ((-2.24, -6.70, 0.0), (-2.20, -4.90, 1.20)),
        ((-2.20, -4.90, 0.0), (-2.16, -3.10, 1.20)),
        ((-2.24, -4.90, 0.0), (-2.20, -3.10, 1.20)),
    )
    for locker_index, (x, y, rotation) in enumerate(
        MAIN_ENTRY_BAGGAGE_LOCKERS
    ):
        expected_collider = transformed_box_bounds(
            (x, y, 0.0),
            (0.0, 0.0, 0.60),
            PROP_COLLIDER_SIZES["BaggageLocker"],
            rotation,
        )
        require_component_bounds(
            "主玄関の荷物ロッカーCollider",
            main_collider_components,
            expected_collider,
        )
        require_component_bounds(
            "主玄関の荷物ロッカー背板",
            main_components,
            expected_back_panels[locker_index],
        )
    wall_locker_colliders = sorted(
        (
            bounds
            for bounds in main_collider_components
            if abs(bounds[0].x + 0.65) <= 1e-5
            and abs(bounds[1].x + 0.20) <= 1e-5
        ),
        key=lambda bounds: bounds[0].y,
    )
    inner_east_facing_colliders = sorted(
        (
            bounds
            for bounds in main_collider_components
            if abs(bounds[0].x + 2.20) <= 1e-5
            and abs(bounds[1].x + 1.75) <= 1e-5
        ),
        key=lambda bounds: bounds[0].y,
    )
    inner_west_facing_colliders = sorted(
        (
            bounds
            for bounds in main_collider_components
            if abs(bounds[0].x + 2.65) <= 1e-5
            and abs(bounds[1].x + 2.20) <= 1e-5
        ),
        key=lambda bounds: bounds[0].y,
    )
    if not (
        len(wall_locker_colliders) == 2
        and len(inner_east_facing_colliders) == 2
        and len(inner_west_facing_colliders) == 2
    ):
        raise RuntimeError(
            "主玄関ロッカーが壁列2台・背中合わせ2組に分かれていません"
        )
    east_wall_inner_x = -0.15
    east_wall_gap = east_wall_inner_x - max(
        maximum.x for _, maximum in wall_locker_colliders
    )
    wall_row_gap = (
        wall_locker_colliders[1][0].y
        - wall_locker_colliders[0][1].y
    )
    facing_clearance = (
        min(minimum.x for minimum, _ in wall_locker_colliders)
        - max(maximum.x for _, maximum in inner_east_facing_colliders)
    )
    back_to_back_gaps = [
        east_facing[0].x - west_facing[1].x
        for east_facing, west_facing in zip(
            inner_east_facing_colliders,
            inner_west_facing_colliders,
            strict=True,
        )
    ]
    west_detour = min(
        minimum.x for minimum, _ in inner_west_facing_colliders
    ) - (-6.0)
    positive_overlap_pairs = [
        (first_index, second_index)
        for first_index, (first_minimum, first_maximum) in enumerate(
            main_collider_components
        )
        for second_index, (second_minimum, second_maximum) in enumerate(
            main_collider_components[first_index + 1 :],
            first_index + 1,
        )
        if all(
            min(first_maximum[axis], second_maximum[axis])
            - max(first_minimum[axis], second_minimum[axis])
            > 1e-5
            for axis in range(3)
        )
    ]
    if abs(east_wall_gap - 0.05) > 1e-5:
        raise RuntimeError(
            f"主玄関東側ロッカーと東壁の隙間が0.05mではありません: "
            f"{east_wall_gap:.3f}m"
        )
    if abs(wall_row_gap) > 1e-5:
        raise RuntimeError(
            f"主玄関東壁側ロッカー2台が隙間なく並んでいません: "
            f"{wall_row_gap:.3f}m"
        )
    if any(abs(gap) > 1e-5 for gap in back_to_back_gaps):
        raise RuntimeError(
            f"主玄関の背中合わせロッカーが密着していません: "
            f"{back_to_back_gaps}"
        )
    if abs(facing_clearance - 1.10) > 1e-5:
        raise RuntimeError(
            f"主玄関ロッカー正面間の有効幅が1.10mではありません: "
            f"{facing_clearance:.3f}m"
        )
    if abs(west_detour - 3.35) > 1e-5:
        raise RuntimeError(
            f"主玄関ロッカー西側の通路が3.35mではありません: "
            f"{west_detour:.3f}m"
        )
    if positive_overlap_pairs:
        raise RuntimeError(
            f"主玄関の荷物ロッカー同士が正の体積で重複しています: "
            f"{positive_overlap_pairs}"
        )

    north_entry = bpy.data.objects["VIS_B03_Interior_F01_NorthEntry_FurnitureProps"]
    north_components = connected_component_aabbs(north_entry)
    if min(minimum.x for minimum, _ in north_components) < 4.79:
        raise RuntimeError("北側通用口の小物が壁際から廊下側へ出ています")
    if tuple(NORTH_ENTRY_BAGGAGE_LOCKER) != (5.025, 40.6, -math.pi / 2):
        raise RuntimeError("北側通用口の荷物ロッカー確定配置が変化しています")
    north_locker_x, north_locker_y, north_locker_rotation = (
        NORTH_ENTRY_BAGGAGE_LOCKER
    )
    north_locker_collider = bpy.data.objects["COL_B03_Interior_F01_NorthEntry"]
    north_locker_collider_components = connected_component_aabbs(
        north_locker_collider
    )
    if len(north_locker_collider_components) != 1:
        raise RuntimeError(
            "北側通用口の荷物ロッカーColliderが1台分ではありません: "
            f"{len(north_locker_collider_components)}"
        )
    north_locker_bounds = transformed_box_bounds(
        (north_locker_x, north_locker_y, 0.0),
        (0.0, 0.0, PROP_COLLIDER_SIZES["BaggageLocker"][2] / 2.0),
        PROP_COLLIDER_SIZES["BaggageLocker"],
        north_locker_rotation,
    )
    require_component_bounds(
        "北側通用口の荷物ロッカーCollider",
        north_locker_collider_components,
        north_locker_bounds,
    )
    if not bounds_match(
        (Vector(north_locker_bounds[0]), Vector(north_locker_bounds[1])),
        ((4.8, 39.7, 0.0), (5.25, 41.5, 1.2)),
    ):
        raise RuntimeError(
            "北側通用口の荷物ロッカーCollider確定AABBが不正です: "
            f"{north_locker_bounds}"
        )
    require_component_bounds(
        "北側通用口の荷物ロッカー背板",
        north_components,
        ((5.21, 39.7, 0.0), (5.25, 41.5, 1.2)),
    )
    if tuple(NORTH_ENTRY_UMBRELLA_STAND) != (5.05, 39.0, math.pi / 2):
        raise RuntimeError("北側通用口の傘立て確定配置が変化しています")
    umbrella_x, umbrella_y, umbrella_rotation = NORTH_ENTRY_UMBRELLA_STAND
    umbrella_bounds = transformed_box_bounds(
        (umbrella_x, umbrella_y, 0.0),
        (0.0, 0.0, 0.3),
        (0.9, 0.3, 0.6),
        umbrella_rotation,
    )
    require_component_bounds(
        "北側通用口の傘立て",
        north_components,
        umbrella_bounds,
    )
    if north_locker_bounds[0][1] - umbrella_bounds[1][1] < 0.25 - 1e-5:
        raise RuntimeError("北側通用口の荷物ロッカーと傘立てが重なっています")
    if 44.4 - north_locker_bounds[1][1] < 2.9 - 1e-5:
        raise RuntimeError("北側通用口の荷物ロッカーが出入口へ近すぎます")

    staff = bpy.data.objects["VIS_B03_Interior_F01_StaffRoom_FurnitureProps"]
    staff_components = connected_component_aabbs(staff)
    for local_center, size, _swatch in BULLETIN_BOARD_FURNITURE_PARTS:
        require_component_bounds(
            "職員室南壁掲示板",
            staff_components,
            transformed_box_bounds(
                (14.4, 36.68, 0.0),
                local_center,
                size,
                math.pi,
            ),
        )
    require_component_bounds(
        "職員室南壁時計",
        staff_components,
        box_bounds((18.0, 36.67, 1.9), (0.35, 0.04, 0.35)),
    )

    gym = bpy.data.objects["VIS_B03_Interior_Gym_FurnitureProps"]
    gym_components = connected_component_aabbs(gym)
    expected_backboards = (
        ((33.55, 7.60, 2.825), (33.60, 9.40, 3.875)),
        ((59.20, 7.60, 2.825), (59.25, 9.40, 3.875)),
    )
    for expected in expected_backboards:
        if not any(bounds_match(component, expected) for component in gym_components):
            raise RuntimeError(f"バスケットゴールが壁面の規定高にありません: {expected}")
    lectern_x, lectern_y, lectern_z = GYM_STAGE_LECTERN
    lectern_components = [
        (minimum, maximum)
        for minimum, maximum in gym_components
        if abs(((minimum.x + maximum.x) / 2.0) - lectern_x) <= 0.50
        and abs(((minimum.y + maximum.y) / 2.0) - lectern_y) <= 0.50
    ]
    if not lectern_components or min(
        minimum.z for minimum, _ in lectern_components
    ) < lectern_z - 1e-5:
        raise RuntimeError("演説机が舞台上にありません")

    gym_collider = bpy.data.objects["COL_B03_Interior_Gym"]
    lectern_size = PROP_COLLIDER_SIZES["StageLectern"]
    lectern_local_center = PROP_COLLIDER_LOCAL_CENTERS["StageLectern"]
    expected_lectern_collider = box_bounds(
        (
            lectern_x + lectern_local_center[0],
            lectern_y + lectern_local_center[1],
            lectern_z + lectern_local_center[2],
        ),
        lectern_size,
    )
    if not any(
        bounds_match(component, expected_lectern_collider)
        for component in connected_component_aabbs(gym_collider)
    ):
        raise RuntimeError("演説机Colliderが舞台上にありません")
    if len(lectern_components) != 5:
        raise RuntimeError(
            f"演説机の表示5部品を特定できません: {len(lectern_components)}/5"
        )
    lectern_visual_containment = require_bounds_contained(
        "演説机表示",
        expected_lectern_collider,
        lectern_components,
    )
    lectern_visual_union = component_union_bounds(lectern_components)
    if not bounds_match(lectern_visual_union, expected_lectern_collider):
        raise RuntimeError(
            "演説机表示の合成AABBがColliderと一致しません: "
            f"{lectern_visual_union}/{expected_lectern_collider}"
        )

    return {
        "main_entry": len(main_components),
        "main_entry_colliders": len(main_collider_components),
        "north_entry": len(north_components),
        "north_entry_colliders": len(north_locker_collider_components),
        "staffroom": 1,
        "gym": len(expected_backboards) + 2,
        "lectern_visual_containment": lectern_visual_containment,
    }


def audit_refactored_furniture_placements(
    wall_components: list[tuple[str, int, Vector, Vector]],
) -> dict[str, int]:
    if tuple(CORRIDOR_CLEANING_LOCKER) != (-3.125, 6.8, math.pi / 2):
        raise RuntimeError("廊下掃除ロッカーの確定配置が変化しています")
    if tuple(CLASSROOM_TRASH_BIN_PLACEMENT) != (-3.8, 7.5):
        raise RuntimeError("普通教室ごみ箱の確定配置が変化しています")
    if tuple(STAFFROOM_TRASH_BIN) != (19.0, 36.8, 0.0):
        raise RuntimeError("職員室ごみ箱の確定配置が変化しています")

    placement_checks = 0
    wall_overlap_checks = 0
    corridor_x, corridor_y, corridor_rotation = CORRIDOR_CLEANING_LOCKER
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        corridor_bounds = transformed_box_bounds(
            (corridor_x, corridor_y, base_z),
            (
                0.0,
                0.0,
                PROP_COLLIDER_SIZES["CleaningLocker"][2] / 2.0,
            ),
            PROP_COLLIDER_SIZES["CleaningLocker"],
            corridor_rotation,
        )
        collider_components = connected_component_aabbs(
            bpy.data.objects[f"COL_B03_Interior_F{floor:02d}_Corridors"]
        )
        visual_components = connected_component_aabbs(
            bpy.data.objects[
                f"VIS_B03_Interior_F{floor:02d}_Corridors_FurnitureProps"
            ]
        )
        require_component_bounds(
            f"F{floor:02d}廊下掃除ロッカーCollider",
            collider_components,
            corridor_bounds,
        )
        corridor_visual_body = transformed_box_bounds(
            (corridor_x, corridor_y, base_z),
            (0.0, 0.001, 0.90),
            (0.90, 0.448, 1.80),
            corridor_rotation,
        )
        corridor_visual_front_seam = transformed_box_bounds(
            (corridor_x, corridor_y, base_z),
            (0.0, -0.225, 0.90),
            (0.02, 0.0, 1.68),
            corridor_rotation,
        )
        require_component_bounds(
            f"F{floor:02d}廊下掃除ロッカー表示本体",
            visual_components,
            corridor_visual_body,
        )
        require_component_bounds(
            f"F{floor:02d}廊下掃除ロッカー正面継ぎ目",
            visual_components,
            corridor_visual_front_seam,
        )
        corridor_visual_components = [
            (minimum, maximum)
            for minimum, maximum in visual_components
            if all(
                corridor_bounds[0][axis] - 1e-4
                <= (minimum[axis] + maximum[axis]) / 2.0
                <= corridor_bounds[1][axis] + 1e-4
                for axis in range(3)
            )
        ]
        if len(corridor_visual_components) != 10:
            raise RuntimeError(
                f"F{floor:02d}廊下掃除ロッカーの表示10部品を"
                "Collider内で特定できません: "
                f"{len(corridor_visual_components)}/10"
            )
        require_bounds_contained(
            f"F{floor:02d}廊下掃除ロッカー表示",
            corridor_bounds,
            corridor_visual_components,
        )
        wall_overlap_checks += require_no_architecture_wall_overlap(
            f"F{floor:02d}廊下掃除ロッカー",
            (Vector(corridor_bounds[0]), Vector(corridor_bounds[1])),
            wall_components,
        )
        placement_checks += 2 + len(corridor_visual_components)

    trash_x, trash_y = CLASSROOM_TRASH_BIN_PLACEMENT
    trash_size = (0.3, 0.3, 0.5)
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        for room_index, room_y_offset in enumerate((0.0, 10.0, 20.0), 1):
            trash_bounds = box_bounds(
                (
                    trash_x,
                    trash_y + room_y_offset,
                    base_z + trash_size[2] / 2.0,
                ),
                trash_size,
            )
            visual_components = connected_component_aabbs(
                bpy.data.objects[
                    f"VIS_B03_Interior_F{floor:02d}_Classroom"
                    f"{room_index:02d}_FurnitureProps"
                ]
            )
            require_component_bounds(
                f"F{floor:02d}普通教室{room_index:02d}ごみ箱",
                visual_components,
                trash_bounds,
            )
            wall_overlap_checks += require_no_architecture_wall_overlap(
                f"F{floor:02d}普通教室{room_index:02d}ごみ箱",
                (Vector(trash_bounds[0]), Vector(trash_bounds[1])),
                wall_components,
            )
            placement_checks += 1

    staff_x, staff_y, staff_z = STAFFROOM_TRASH_BIN
    staff_trash_bounds = box_bounds(
        (staff_x, staff_y, staff_z + trash_size[2] / 2.0),
        trash_size,
    )
    staff_components = connected_component_aabbs(
        bpy.data.objects["VIS_B03_Interior_F01_StaffRoom_FurnitureProps"]
    )
    require_component_bounds(
        "職員室ごみ箱",
        staff_components,
        staff_trash_bounds,
    )
    wall_overlap_checks += require_no_architecture_wall_overlap(
        "職員室ごみ箱",
        (Vector(staff_trash_bounds[0]), Vector(staff_trash_bounds[1])),
        wall_components,
    )
    placement_checks += 1

    return {
        "placements": placement_checks,
        "wall_overlap_checks": wall_overlap_checks,
    }


def audit_roof_changing_lockers(
    wall_components: list[tuple[str, int, Vector, Vector]],
) -> dict[str, int]:
    expected_locker_xs = (-5.4, -3.16, -0.8, 1.19)
    if tuple(ROOF_CHANGING_BAGGAGE_LOCKER_XS) != expected_locker_xs:
        raise RuntimeError("屋上男女更衣室ロッカー4台の確定座標が変化しています")
    collider = bpy.data.objects["COL_B03_Interior_RoofChanging"]
    collider_components = connected_component_aabbs(collider)
    visual_components = connected_component_aabbs(
        bpy.data.objects["VIS_B03_Interior_RoofChanging_FurnitureProps"]
    )
    expected_lockers = [
        (
            Vector(minimum),
            Vector(maximum),
        )
        for minimum, maximum in (
            box_bounds(
                (x, 44.8, 14.5 + PROP_COLLIDER_SIZES["BaggageLocker"][2] / 2.0),
                PROP_COLLIDER_SIZES["BaggageLocker"],
            )
            for x in ROOF_CHANGING_BAGGAGE_LOCKER_XS
        )
    ]
    actual_lockers = [
        (minimum, maximum)
        for minimum, maximum in collider_components
        if dimensions_match(
            minimum,
            maximum,
            PROP_COLLIDER_SIZES["BaggageLocker"],
        )
    ]
    if len(actual_lockers) != len(expected_lockers):
        raise RuntimeError(
            "屋上男女更衣室の荷物ロッカーが4台ではありません: "
            f"{len(actual_lockers)}"
        )
    for expected_minimum, expected_maximum in expected_lockers:
        require_component_bounds(
            "屋上男女更衣室の荷物ロッカーCollider",
            actual_lockers,
            (
                tuple(expected_minimum),
                tuple(expected_maximum),
            ),
        )
        require_component_bounds(
            "屋上男女更衣室の荷物ロッカー背板",
            visual_components,
            (
                (
                    expected_minimum.x,
                    44.985,
                    expected_minimum.z,
                ),
                (
                    expected_maximum.x,
                    45.025,
                    expected_maximum.z,
                ),
            ),
        )
    overlap_checks = 0
    for index, (minimum, maximum) in enumerate(expected_lockers):
        for other_minimum, other_maximum in expected_lockers[index + 1 :]:
            if aabb_overlaps(
                minimum,
                maximum,
                other_minimum,
                other_maximum,
            ):
                raise RuntimeError("屋上男女更衣室の荷物ロッカー同士が重なっています")
            overlap_checks += 1

    wall_overlap_checks = 0
    for index, bounds in enumerate(expected_lockers, 1):
        wall_overlap_checks += require_no_architecture_wall_overlap(
            f"屋上男女更衣室の荷物ロッカー{index:02d}",
            bounds,
            wall_components,
        )

    for old_x in (3.0, 4.2):
        old_cleaning_bounds = box_bounds(
            (
                old_x,
                44.8,
                14.5 + PROP_COLLIDER_SIZES["CleaningLocker"][2] / 2.0,
            ),
            PROP_COLLIDER_SIZES["CleaningLocker"],
        )
        if any(
            bounds_match(component, old_cleaning_bounds)
            for component in collider_components
        ):
            raise RuntimeError("更衣室外へはみ出す掃除ロッカーが残っています")

    legacy_names = {
        f"{prefix}_B03_Prop_Locker_Changing_{sex}_{index:02d}"
        for prefix in ("VIS", "COL")
        for sex in ("M", "F")
        for index in (1, 2)
    }
    remaining_legacy = sorted(
        name for name in legacy_names if bpy.data.objects.get(name) is not None
    )
    if remaining_legacy:
        raise RuntimeError(
            f"屋上更衣室の旧二重ロッカーが残っています: {remaining_legacy}"
        )

    return {
        "baggage_lockers": len(actual_lockers),
        "visual_back_panels": len(expected_lockers),
        "overlap_checks": overlap_checks,
        "wall_overlap_checks": wall_overlap_checks,
        "removed_cleaning_lockers": 2,
        "removed_legacy_objects": len(legacy_names),
    }


def audit_roof_pool_north_sign_support() -> dict[str, int]:
    support = bpy.data.objects[
        "VIS_B03_Interior_RoofPoolSafety_Architecture"
    ]
    support_components = connected_component_aabbs(support)
    support_center, support_size = ROOF_POOL_NORTH_SIGN_SUPPORT
    if support_center != (39.5, 45.28, 15.5) or support_size != (0.10, 0.24, 0.10):
        raise RuntimeError(
            "屋上北側救命表示ブラケットの座標または寸法が契約値と一致しません"
        )
    expected_support = box_bounds(support_center, support_size)
    require_component_bounds(
        "屋上北側救命表示ブラケット",
        support_components,
        expected_support,
    )

    signs = bpy.data.objects[
        "VIS_B03_Interior_RoofPoolSafety_SignsPaper"
    ]
    sign_components = connected_component_aabbs(signs)
    expected_sign = transformed_box_bounds(
        (39.5, 45.1, 14.5),
        (0.0, 0.0, 1.2),
        (0.7, 0.12, 0.7),
        0.0,
    )
    require_component_bounds(
        "屋上北側救命表示",
        sign_components,
        expected_sign,
    )

    support_minimum = Vector(expected_support[0])
    support_maximum = Vector(expected_support[1])
    sign_minimum = Vector(expected_sign[0])
    sign_maximum = Vector(expected_sign[1])
    if max(
        aabb_axis_gap(
            support_minimum,
            support_maximum,
            sign_minimum,
            sign_maximum,
            axis,
        )
        for axis in range(3)
    ) > 1e-4:
        raise RuntimeError("屋上北側救命表示とブラケットが接触していません")

    fence_checks = 0
    for object_name in (
        "VIS_RoofGuard_NorthOuter",
        "COL_RoofGuard_NorthOuter",
    ):
        fence = bpy.data.objects[object_name]
        if not any(
            max(
                aabb_axis_gap(
                    support_minimum,
                    support_maximum,
                    minimum,
                    maximum,
                    axis,
                )
                for axis in range(3)
            )
            <= 1e-4
            for minimum, maximum in connected_component_aabbs(fence)
        ):
            raise RuntimeError(
                f"屋上北側救命表示ブラケットが柵へ接続していません: {object_name}"
            )
        fence_checks += 1

    return {
        "brackets": 1,
        "sign_contacts": 1,
        "fence_contacts": fence_checks,
    }


def audit_link_clearance(interior_colliders: list[bpy.types.Object]) -> int:
    endpoints: dict[str, dict[str, Vector]] = {}
    for obj in bpy.data.objects:
        if not obj.name.startswith("LNK_"):
            continue
        link_id = obj.get("hs_id")
        endpoint = obj.get("hs_endpoint")
        if link_id and endpoint in {"A", "B"}:
            endpoints.setdefault(str(link_id), {})[str(endpoint)] = obj.matrix_world.translation
    checked = 0
    violations: list[str] = []
    for link_id, pair in endpoints.items():
        if set(pair) != {"A", "B"}:
            raise RuntimeError(f"LNK端点が不足しています: {link_id}")
        start, end = pair["A"], pair["B"]
        for collider in interior_colliders:
            for component_index, (minimum, maximum) in enumerate(
                connected_component_aabbs(collider), start=1
            ):
                clearance = min(
                    point_aabb_distance(start.lerp(end, index / 100), minimum, maximum)
                    for index in range(101)
                )
                if clearance < 0.54 - 1e-6:
                    center = (minimum + maximum) * 0.5
                    violations.append(
                        f"{link_id} / {collider.name}#{component_index} / "
                        f"{clearance:.3f}m / center=({center.x:.2f},{center.y:.2f},{center.z:.2f})"
                    )
                checked += 1
    if violations:
        raise RuntimeError(
            "特殊経路0.54m包絡へ家具Colliderが侵入しています:\n"
            + "\n".join(violations)
        )
    return checked


def audit_elevator_lobby_opening() -> dict[str, int]:
    remaining_objects = [
        object_name
        for object_name in (
            "VIS_B03_Interior_F01_ElevatorLobby_FurnitureProps",
            "COL_B03_Interior_F01_ElevatorLobby",
        )
        if bpy.data.objects.get(object_name) is not None
    ]
    if remaining_objects:
        raise RuntimeError(
            f"撤去対象のエレベーターホールロッカーが残っています: {remaining_objects}"
        )
    return {
        "lockers": 0,
        "visual_objects": 0,
        "collider_objects": 0,
    }


def main() -> None:
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError(f"B03-2対象外のBlenderファイルです: {bpy.data.filepath}")
    if len(ADDITIONAL_PROP_TYPES) != 23 or len(set(ADDITIONAL_PROP_TYPES)) != 23:
        raise RuntimeError("追加小物カタログが23種ではありません")

    atlas_results = {}
    for definition in ATLAS_DEFINITIONS.values():
        path = TEXTURE_DIRECTORY / str(definition["file"])
        dimensions = png_dimensions(path)
        expected = int(definition["size"])
        if dimensions != (expected, expected):
            raise RuntimeError(f"Atlas寸法が不正です: {path}={dimensions}")
        atlas_results[path.name] = {
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "dimensions": dimensions,
        }

    interior_visuals = sorted(
        (obj for obj in bpy.data.objects if obj.name.startswith("VIS_B03_Interior_")),
        key=lambda obj: obj.name,
    )
    interior_colliders = sorted(
        (obj for obj in bpy.data.objects if obj.name.startswith("COL_B03_Interior_")),
        key=lambda obj: obj.name,
    )
    static_nav_colliders = [
        obj
        for obj in interior_colliders
        if not (
            obj.parent is not None
            and obj.parent.get("hs_role") == "room_variant"
        )
    ]
    nav_blocker = bpy.data.objects.get("NAV_Blocker_Interiors")
    expected_toilet_wall_colliders = {
        f"COL_B03_Interior_Walls_F{floor:02d}_Toilets" for floor in (1, 2, 3, 4)
    }
    if (
        not interior_visuals
        or len(interior_colliders) != 37
        or nav_blocker is None
        or not (
            expected_toilet_wall_colliders
            <= {obj.name for obj in interior_colliders}
        )
    ):
        raise RuntimeError("全校内装の表示・Collider・Nav blockerが不足しています")
    if nav_blocker.get("hs_nav_role") != "blocker":
        raise RuntimeError("NAV_Blocker_Interiorsのhs_nav_roleが不正です")

    for obj in [*interior_visuals, *interior_colliders, nav_blocker]:
        if obj.type != "MESH" or obj.data.name != obj.name:
            raise RuntimeError(f"Object名とMesh名が一致しません: {obj.name}")
        if obj.data.users != 1 or not is_identity_transform(obj):
            raise RuntimeError(f"single-userまたはTransform契約に違反しています: {obj.name}")
    for obj in [*interior_colliders, nav_blocker]:
        if len(obj.data.materials) != 0 or not is_closed_mesh(obj):
            raise RuntimeError(f"Colliderが無材質の閉形状ではありません: {obj.name}")

    generation = json.loads(bpy.context.scene["b03_2_interior_result"])
    if generation.get("scope") != "full_school" or generation.get("rooms") != 34:
        raise RuntimeError("全校34区画の内装生成結果ではありません")
    if generation.get("wall_collider_objects") != 4:
        raise RuntimeError("全階トイレの専用建築壁Colliderが4 Objectではありません")
    if generation.get("classrooms") != 9:
        raise RuntimeError("普通教室が9室ではありません")
    room_counts = generation["room_counts"]
    classroom_metrics = generation["classroom_metrics"]
    for room_name, metrics in classroom_metrics.items():
        classroom_counts = room_counts[room_name]
        if (
            classroom_counts.get("ClassroomDesk") != 30
            or classroom_counts.get("ClassroomChair") != 30
            or classroom_counts.get("Blackboard") != 1
            or classroom_counts.get("BaggageLocker") != 3
            or classroom_counts.get("CleaningLocker") != 1
            or classroom_counts.get("TeacherDesk") != 1
            or classroom_counts.get("TrashBin") != 1
            or classroom_counts.get("BulletinBoard", 0) != 0
        ):
            raise RuntimeError(f"普通教室の必須家具数が不正です: {room_name}")
        floor = int(room_name[1:3])
        room_index = int(room_name[-2:])
        variant_index = (floor + room_index) % len(CLASSROOM_LAYOUT_VARIANTS)
        expected_small_prop_counts = Counter(
            prop_type
            for prop_type, *_rest in (
                *CLASSROOM_DESKTOP_PROP_VARIANTS[variant_index],
                *CLASSROOM_FLOOR_PROP_VARIANTS[variant_index],
            )
        )
        for prop_type in CLASSROOM_SMALL_PROP_PARTS:
            if classroom_counts.get(prop_type, 0) != expected_small_prop_counts.get(
                prop_type,
                0,
            ):
                raise RuntimeError(
                    f"普通教室{room_name}の{prop_type}数が不正です: "
                    f"{classroom_counts.get(prop_type, 0)}/"
                    f"{expected_small_prop_counts.get(prop_type, 0)}"
                )
        expected_metrics = (
            {
                "pattern": "A",
                "moved_desks": 0,
                "moved_chairs": 0,
                "desktop_prop_spots": 7,
                "floor_prop_spots": 0,
            },
            {
                "pattern": "B",
                "moved_desks": 0,
                "moved_chairs": 7,
                "desktop_prop_spots": 6,
                "floor_prop_spots": 5,
            },
            {
                "pattern": "C",
                "moved_desks": 8,
                "moved_chairs": 8,
                "desktop_prop_spots": 3,
                "floor_prop_spots": 7,
            },
        )[variant_index]
        for key, expected in expected_metrics.items():
            if metrics.get(key) != expected:
                raise RuntimeError(
                    f"普通教室{room_name}の{key}が不正です: "
                    f"{metrics.get(key)}/{expected}"
                )
        if metrics["stored_chairs"] + metrics["moved_chairs"] != 30:
            raise RuntimeError(f"普通教室の椅子状態数が不正です: {room_name}")
    if generation.get("classroom_front") != "north":
        raise RuntimeError("西側校舎の教室前方が北ではありません")
    if generation.get("north_wing_classroom_front") != "east":
        raise RuntimeError("北側校舎の教室前方が東ではありません")

    expected_room_counts = {
        "F01_Infirmary": {
            "InfirmaryBed": 2,
            "StaffDesk": 1,
            "StaffChair": 1,
            "Bookshelf": 1,
            "CleaningLocker": 1,
            "MedicalCabinet": 2,
            "WashBasin": 1,
            "TrashBin": 1,
            "InfirmaryCurtain": 4,
            "ClassroomDesk": 2,
            "ClassroomChair": 2,
            "SinglePaper": 1,
            "ClosedBook": 1,
        },
        "F01_Library": {
            "Bookshelf": 80,
            "LargeWoodTable": 4,
            "ClassroomChair": 16,
            "StaffDesk": 0,
            "StaffChair": 0,
        },
        "F01_StaffRoom": {
            "StaffDesk": 16,
            "StaffChair": 16,
            "PcMonitor": 8,
            "Bookshelf": 5,
            "CleaningLocker": 1,
            "TrashBin": 1,
        },
        "F01_PcRoom": {
            "StaffDesk": 18,
            "StaffChair": 18,
            "PcMonitor": 18,
            "BaggageLocker": 2,
            "CleaningLocker": 1,
            "PcTower": 18,
            "KeyboardMouse": 18,
        },
        "F02_Council": {
            "LargeWoodTable": 2,
            "ClassroomChair": 8,
            "StaffDesk": 1,
            "StaffChair": 1,
            "BaggageLocker": 1,
        },
        "F02_Broadcast": {
            "StaffDesk": 2,
            "StaffChair": 2,
            "PcMonitor": 2,
            "BaggageLocker": 1,
            "BroadcastConsole": 1,
        },
        "F02_Science": {
            "LabBench": 6,
            "ScienceStool": 36,
            "Blackboard": 1,
            "Bookshelf": 2,
            "CleaningLocker": 1,
        },
        "F03_Art": {
            "LargeWoodTable": 6,
            "ClassroomChair": 24,
            "Easel": 5,
            "Blackboard": 1,
            "Bookshelf": 2,
            "CleaningLocker": 1,
        },
        "F03_HomeEc": {
            "KitchenIsland": 4,
            "ClassroomChair": 24,
            "Blackboard": 1,
            "CleaningLocker": 1,
        },
        "F04_LL": {
            "ClassroomDesk": 24,
            "ClassroomChair": 24,
            "Blackboard": 1,
            "BaggageLocker": 2,
        },
        "F04_Music": {
            "GrandPiano": 1,
            "ClassroomChair": 30,
            "Blackboard": 1,
            "Bookshelf": 2,
            "CleaningLocker": 1,
        },
        "Gym": {"BasketballGoal": 2, "VaultingBox": 2, "StageLectern": 1},
        "GymStorage": {"VaultingBox": 2, "CleaningLocker": 1},
        "RoofChanging": {"BaggageLocker": 4},
    }
    for room_name, expected_counts in expected_room_counts.items():
        actual_counts = room_counts[room_name]
        for prop_type, expected_count in expected_counts.items():
            if actual_counts.get(prop_type, 0) != expected_count:
                raise RuntimeError(
                    f"室内小物数が不正です: {room_name}/{prop_type}="
                    f"{actual_counts.get(prop_type, 0)}/{expected_count}"
                )
    if room_counts["Gym"].get("WallClock", 0) != 0:
        raise RuntimeError("撤去指定の体育館北面壁時計が残っています")
    if room_counts["RoofChanging"].get("CleaningLocker", 0) != 0:
        raise RuntimeError("屋上更衣室に掃除ロッカーが残っています")
    staffroom_collider = bpy.data.objects["COL_B03_Interior_F01_StaffRoom"]
    locker_x, locker_y, locker_rotation = STAFFROOM_CLEANING_LOCKER
    locker_width, locker_depth, locker_height = PROP_COLLIDER_SIZES[
        "CleaningLocker"
    ]
    locker_bounds = transformed_box_bounds(
        (locker_x, locker_y, 0.0),
        (0.0, 0.0, locker_height / 2.0),
        (locker_width, locker_depth, locker_height),
        locker_rotation,
    )
    locker_minimum = Vector(locker_bounds[0])
    locker_maximum = Vector(locker_bounds[1])
    room_min_x, room_max_x, room_min_y, room_max_y = STAFFROOM_INTERIOR_BOUNDS
    if not (
        room_min_x <= locker_minimum.x
        and locker_maximum.x <= room_max_x
        and room_min_y <= locker_minimum.y
        and locker_maximum.y <= room_max_y
    ):
        raise RuntimeError("職員室の掃除ロッカーが職員室区画外です")
    if not any(
        all(
            abs(actual_minimum[axis] - locker_minimum[axis]) < 1e-6
            for axis in range(3)
        )
        and all(
            abs(actual_maximum[axis] - locker_maximum[axis]) < 1e-6
            for axis in range(3)
        )
        for actual_minimum, actual_maximum in connected_component_aabbs(
            staffroom_collider
        )
    ):
        raise RuntimeError("職員室の掃除ロッカーColliderを確認できません")
    for floor in range(1, 5):
        corridor_name = f"F{floor:02d}_Corridors"
        if room_counts[corridor_name].get("CleaningLocker") != 1:
            raise RuntimeError(f"廊下の掃除ロッカー数が不正です: {corridor_name}")
    if room_counts["F01_PcRoom"].get("Blackboard", 0) != 0:
        raise RuntimeError("PC室に黒板が残っています")
    if room_counts["F04_LL"].get("PcMonitor", 0) != 0:
        raise RuntimeError("LL室にモニターが残っています")
    if room_counts["F04_Music"].get("MusicStand", 0) != 0:
        raise RuntimeError("音楽室に譜面台が残っています")
    if room_counts["GymStorage"].get("RoomSign", 0) != 0:
        raise RuntimeError("体育倉庫の表札数が0件ではありません")
    if bpy.data.objects.get("VIS_B03_Interior_GymStorage_SignsPaper") is not None:
        raise RuntimeError("体育倉庫内の不要な表札が残っています")
    expected_blackboards = {
        f"F{floor:02d}_Classroom{room_index:02d}"
        for floor in (2, 3, 4)
        for room_index in (1, 2, 3)
    } | {
        "F02_Science",
        "F03_Art",
        "F03_HomeEc",
        "F04_LL",
        "F04_Music",
    }
    if set(generation.get("blackboards", {})) != expected_blackboards:
        raise RuntimeError("黒板を置く教室が不正です")

    for floor in (1, 2, 3, 4):
        toilet_counts = room_counts[f"F{floor:02d}_Toilets"]
        expected_toilets = 0 if floor == 1 else 6
        expected_urinals = 0 if floor == 1 else 3
        if toilet_counts.get("WesternToilet", 0) != expected_toilets:
            raise RuntimeError(f"便器数が不正です: F{floor:02d}")
        if toilet_counts.get("Urinal", 0) != expected_urinals:
            raise RuntimeError(f"小便器数が不正です: F{floor:02d}")
        if toilet_counts.get("WashBasin") != 2 or toilet_counts.get("Mirror") != 2:
            raise RuntimeError(f"洗面設備数が不正です: F{floor:02d}")
        if toilet_counts.get("RoomSign") != 2:
            raise RuntimeError(f"トイレ標識数が不正です: F{floor:02d}")

    required_common_rooms = {
        "F01_Corridors", "F02_Corridors", "F03_Corridors", "F04_Corridors",
        "F01_MainEntry", "F01_NorthEntry", "GymStorage", "RoofPoolSafety",
    }
    if not required_common_rooms <= set(room_counts):
        raise RuntimeError("共用部の全校展開が不足しています")
    main_entry_counts = room_counts["F01_MainEntry"]
    if (
        main_entry_counts.get("BaggageLocker") != 6
        or main_entry_counts.get("ShoeLocker", 0) != 0
        or main_entry_counts.get("UmbrellaStand", 0) != 0
    ):
        raise RuntimeError(f"主玄関のロッカー構成が不正です: {main_entry_counts}")
    north_entry_counts = room_counts["F01_NorthEntry"]
    if (
        north_entry_counts.get("BaggageLocker") != 1
        or north_entry_counts.get("ShoeLocker", 0) != 0
        or north_entry_counts.get("UmbrellaStand") != 1
    ):
        raise RuntimeError(
            f"北側通用口のロッカー構成が不正です: {north_entry_counts}"
        )
    if "F01_ElevatorLobby" in room_counts:
        raise RuntimeError(
            f"撤去対象のエレベーターホール家具定義が残っています: "
            f"{room_counts['F01_ElevatorLobby']}"
        )
    elevator_lobby_opening = audit_elevator_lobby_opening()
    storey_band_swatches = audit_storey_band_swatches()
    nav_blocker_parity = audit_nav_blocker_parity(
        static_nav_colliders,
        nav_blocker,
    )
    classroom_acceptance = audit_classroom_teacher_desks_and_lockers()
    library_acceptance = audit_library_bookshelves()
    bulletin_board_design = audit_bulletin_board_design()
    infirmary_layout = audit_infirmary_layout()
    staffroom_storage_layout = audit_staffroom_storage_layout()
    pc_room_fixed_layout = audit_pc_room_fixed_layout()
    art_room_acceptance = audit_art_room_placement()
    ll_room_acceptance = audit_ll_room_placement()
    music_room_orientation = audit_music_room_orientation()
    toilet_front_structures = audit_toilet_front_structures()
    broadcast_orientation_checks = audit_broadcast_orientation()
    council_placement_checks = audit_council_placement()
    staff_desk_collider_contract = audit_staff_desk_collider_contract()
    architecture_wall_components = architecture_wall_component_aabbs()
    roof_changing_lockers = audit_roof_changing_lockers(
        architecture_wall_components
    )
    roof_pool_north_sign_support = audit_roof_pool_north_sign_support()
    door_clearance_checks = audit_door_clearance(interior_colliders)
    visual_door_clearance_checks = audit_visual_door_clearance(interior_visuals)
    door_sign_clearance_checks = audit_door_sign_clearance()
    room_sign_wall_support_checks = audit_room_sign_wall_support()
    acceptance_placements = audit_acceptance_placements()
    refactored_furniture_placements = audit_refactored_furniture_placements(
        architecture_wall_components
    )
    link_clearance_checks = audit_link_clearance(interior_colliders)

    gltf, binary_length = read_glb_json(GLB_PATH)
    views = gltf.get("bufferViews", [])
    for image in gltf.get("images", []):
        view_index = image.get("bufferView")
        if not isinstance(view_index, int) or view_index >= len(views):
            raise RuntimeError(f"AtlasのbufferView参照が不正です: {image}")
        view = views[view_index]
        if view.get("byteOffset", 0) + view.get("byteLength", 0) > binary_length:
            raise RuntimeError(f"AtlasがBIN chunk範囲外です: {image}")

    mesh_indices = [
        node["mesh"] for node in gltf.get("nodes", []) if "mesh" in node
    ]
    repeated_meshes = len(mesh_indices) - len(set(mesh_indices))
    if repeated_meshes:
        raise RuntimeError(f"共有Mesh参照があります: {repeated_meshes}")
    if len(gltf.get("materials", [])) != 5:
        raise RuntimeError("MaterialがAtlas 3系統＋透明2系統ではありません")
    if len(gltf.get("textures", [])) != 3 or len(gltf.get("images", [])) != 3:
        raise RuntimeError("GLBのAtlas Texture/Imageが3枚ではありません")

    result = {
        "additional_prop_types": len(ADDITIONAL_PROP_TYPES),
        "atlases": atlas_results,
        "school_rooms": generation["rooms"],
        "classrooms": generation["classrooms"],
        "interior_visual_objects": len(interior_visuals),
        "interior_collider_objects": len(interior_colliders),
        "interior_collider_boxes": generation["collider_boxes"],
        "classroom_metrics": classroom_metrics,
        "storey_band_swatches": storey_band_swatches,
        "nav_blocker_parity": nav_blocker_parity,
        "classroom_acceptance": classroom_acceptance,
        "library_acceptance": library_acceptance,
        "bulletin_board_design": bulletin_board_design,
        "infirmary_layout": infirmary_layout,
        "staffroom_storage_layout": staffroom_storage_layout,
        "pc_room_fixed_layout": pc_room_fixed_layout,
        "art_room_acceptance": art_room_acceptance,
        "ll_room_acceptance": ll_room_acceptance,
        "music_room_orientation": music_room_orientation,
        "toilet_front_structures": toilet_front_structures,
        "broadcast_orientation_checks": broadcast_orientation_checks,
        "council_placement_checks": council_placement_checks,
        "staff_desk_collider_contract": staff_desk_collider_contract,
        "roof_changing_lockers": roof_changing_lockers,
        "roof_pool_north_sign_support": roof_pool_north_sign_support,
        "elevator_lobby_opening": elevator_lobby_opening,
        "link_clearance_checks": link_clearance_checks,
        "door_clearance_checks": door_clearance_checks,
        "visual_door_clearance_checks": visual_door_clearance_checks,
        "door_sign_clearance_checks": door_sign_clearance_checks,
        "room_sign_wall_support_checks": room_sign_wall_support_checks,
        "acceptance_placements": acceptance_placements,
        "refactored_furniture_placements": refactored_furniture_placements,
        "glb": {
            "bytes": GLB_PATH.stat().st_size,
            "sha256": sha256(GLB_PATH),
            "nodes": len(gltf.get("nodes", [])),
            "meshes": len(gltf.get("meshes", [])),
            "materials": len(gltf.get("materials", [])),
            "textures": len(gltf.get("textures", [])),
            "images": len(gltf.get("images", [])),
            "shared_mesh_references": repeated_meshes,
        },
    }
    print("B03_INTERIOR_AUDIT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
