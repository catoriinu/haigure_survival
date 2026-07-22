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
    COUNCIL_INTERIOR_BOUNDS,
    FIRST_FLOOR_WEST_DOOR_OPENINGS,
    GYM_STAGE_LECTERN,
    LIBRARY_BOOKSHELF_PLACEMENTS,
    LIBRARY_EAST_WALL_INNER_X,
    LIBRARY_WEST_WALL_INNER_X,
    LL_AV_RACK,
    LL_BAGGAGE_LOCKER_XS,
    LL_DESK_XS,
    LL_DESK_YS,
    LL_INTERIOR_BOUNDS,
    MAIN_ENTRY_BAGGAGE_LOCKERS,
    NORTH_CLASSROOM_DOOR_OPENINGS,
    PROP_COLLIDER_SIZES,
    STAFFROOM_CLEANING_LOCKER,
    STAFFROOM_INTERIOR_BOUNDS,
    TOILET_COMMON_OPENING,
    UPPER_WEST_CLASSROOM_DOOR_OPENINGS,
    architecture_swatch,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
TEXTURE_DIRECTORY = REPOSITORY_ROOT / "assets/textures/v2/B03"


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
    if abs(sine) > 0.5:
        size = (size[1], size[0], size[2])
    return box_bounds(center, size)


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
    toilet_passages = (
        (-6.45, -2.25),
        (-1.95, 2.25),
        (2.55, TOILET_COMMON_OPENING[1]),
    )
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
        for index, (minimum_x, maximum_x) in enumerate(toilet_passages, 1):
            clearances.append(
                (
                    f"F{floor:02d}_ToiletCommon_{index:02d}",
                    Vector((minimum_x + 0.05, 38.65, base_z + 0.05)),
                    Vector((maximum_x - 0.05, 39.65, base_z + 2.25)),
                )
            )
    clearances.extend(
        (
            (
                "MainEntry",
                Vector((-1.20, -4.60, 0.05)),
                Vector((1.20, 2.45, 2.25)),
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
        clearances.append(
            (
                f"F{floor:02d}_ToiletCommon",
                Vector((TOILET_COMMON_OPENING[0], 38.20, base_z + 1.50)),
                Vector((TOILET_COMMON_OPENING[1], 38.50, base_z + 1.90)),
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
    if len(sign_components) != 30:
        raise RuntimeError(f"表札が30枚ではありません: {len(sign_components)}")
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
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        for room_index, room_y_offset in enumerate((0.0, 10.0, 20.0), 1):
            room_name = f"F{floor:02d}_Classroom{room_index:02d}"
            visual = bpy.data.objects[
                f"VIS_B03_Interior_{room_name}_FurnitureProps"
            ]
            collider = bpy.data.objects[f"COL_B03_Interior_{room_name}"]
            visual_components = connected_component_aabbs(visual)
            collider_components = connected_component_aabbs(collider)
            teacher_y = 11.25 + room_y_offset
            teacher_bounds = box_bounds(
                (-5.40, teacher_y, base_z + 0.36),
                (1.20, 0.60, 0.72),
            )
            require_component_bounds(
                f"{room_name} 教卓Collider",
                collider_components,
                teacher_bounds,
            )
            require_component_bounds(
                f"{room_name} 教卓天板",
                visual_components,
                box_bounds(
                    (-5.40, teacher_y, base_z + 0.66),
                    (1.20, 0.60, 0.12),
                ),
            )
            require_component_bounds(
                f"{room_name} 教卓本体",
                visual_components,
                box_bounds(
                    (-5.40, teacher_y, base_z + 0.30),
                    (1.05, 0.50, 0.60),
                ),
            )
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
                        locker_y + 0.207,
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
    }


def audit_library_bookshelves() -> dict[str, int]:
    visual = bpy.data.objects["VIS_B03_Interior_F01_Library_FurnitureProps"]
    collider = bpy.data.objects["COL_B03_Interior_F01_Library"]
    visual_components = connected_component_aabbs(visual)
    collider_components = connected_component_aabbs(collider)
    shelf_bounds: list[tuple[Vector, Vector]] = []
    orientation_checks = 0
    for x, y, rotation in LIBRARY_BOOKSHELF_PLACEMENTS:
        if abs(rotation) <= 1.0:
            raise RuntimeError(f"図書室本棚が壁と平行ではありません: {(x, y, rotation)}")
        expected = box_bounds((x, y, 0.90), (0.32, 0.90, 1.80))
        require_component_bounds("図書室本棚Collider", collider_components, expected)
        shelf_bounds.append((Vector(expected[0]), Vector(expected[1])))
        if rotation > 0:
            back_panel = (
                (x - 0.16, y - 0.45, 0.0),
                (x - 0.12, y + 0.45, 1.80),
            )
            wall_gap = expected[0][0] - LIBRARY_WEST_WALL_INNER_X
            if wall_gap < -1e-5:
                raise RuntimeError("図書室西壁本棚が壁へ食い込んでいます")
            if wall_gap > 1e-5:
                raise RuntimeError(
                    f"図書室西壁本棚が壁際から離れています: gap={wall_gap:.6f}m"
                )
        else:
            back_panel = (
                (x + 0.12, y - 0.45, 0.0),
                (x + 0.16, y + 0.45, 1.80),
            )
            wall_gap = LIBRARY_EAST_WALL_INNER_X - expected[1][0]
            if wall_gap < -1e-5:
                raise RuntimeError("図書室東壁本棚が壁へ食い込んでいます")
            if wall_gap > 1e-5:
                raise RuntimeError(
                    f"図書室東壁本棚が壁際から離れています: gap={wall_gap:.6f}m"
                )
        require_component_bounds("図書室本棚背板", visual_components, back_panel)
        orientation_checks += 1

    opening_clearances = (
        (Vector((-12.31, 17.45, 0.0)), Vector((-11.90, 27.55, 1.90))),
        (Vector((-4.00, 12.90, 0.0)), Vector((-3.60, 15.65, 1.90))),
        (Vector((-4.00, 30.50, 0.0)), Vector((-3.60, 32.50, 1.90))),
    )
    violations = [
        (shelf_index, clearance_index)
        for shelf_index, (minimum, maximum) in enumerate(shelf_bounds, 1)
        for clearance_index, (clearance_minimum, clearance_maximum) in enumerate(
            opening_clearances,
            1,
        )
        if aabb_overlaps(minimum, maximum, clearance_minimum, clearance_maximum)
    ]
    if violations:
        raise RuntimeError(f"図書室本棚が窓・扉・開扉葉へ干渉しています: {violations}")

    relevant_openings = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and obj.name.startswith("VIS_")
        and ("Door" in obj.name or "WindowFrame" in obj.name or "WindowGlass" in obj.name)
    ]
    mesh_overlap_violations = [
        f"shelf#{shelf_index}/{opening.name}#{opening_index}"
        for shelf_index, (minimum, maximum) in enumerate(shelf_bounds, 1)
        for opening in relevant_openings
        for opening_index, (opening_minimum, opening_maximum) in enumerate(
            connected_component_aabbs(opening),
            1,
        )
        if aabb_overlaps(minimum, maximum, opening_minimum, opening_maximum)
    ]
    if mesh_overlap_violations:
        raise RuntimeError(
            "図書室本棚が実際の扉・窓Meshへ重なっています:\n"
            + "\n".join(mesh_overlap_violations)
        )
    east_shelf_maximum_y = max(
        maximum.y
        for (minimum, maximum), (_, _, rotation) in zip(
            shelf_bounds,
            LIBRARY_BOOKSHELF_PLACEMENTS,
        )
        if rotation < 0
    )
    rear_door_clearance = 30.50 - east_shelf_maximum_y
    if abs(rear_door_clearance - 2.15) > 1e-5:
        raise RuntimeError(
            "図書室廊下側本棚と後方扉の離隔が2.15mではありません: "
            f"{rear_door_clearance:.6f}m"
        )
    return {
        "bookshelves": len(shelf_bounds),
        "orientation_checks": orientation_checks,
        "opening_clearance_checks": len(shelf_bounds) * len(opening_clearances),
    }


def audit_bulletin_board_design() -> dict[str, int]:
    origin = (-8.0, 12.68, 0.0)
    rotation = math.pi
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
    board_front_y = board_bounds[1][1]
    for local_center, size, _swatch in BULLETIN_BOARD_PAPER_PARTS:
        expected = transformed_box_bounds(origin, local_center, size, rotation)
        require_component_bounds("図書室掲示板の掲示紙", sign_components, expected)
        if expected[0][1] < board_front_y + 0.005 - 1e-5:
            raise RuntimeError("図書室掲示板の掲示紙が板面へ埋没しています")
    return {
        "furniture_parts": len(BULLETIN_BOARD_FURNITURE_PARTS),
        "papers": len(BULLETIN_BOARD_PAPER_PARTS),
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
    expected_colliders.append(
        box_bounds((LL_AV_RACK[0], LL_AV_RACK[1], 11.55), (0.7, 0.5, 1.5))
    )
    if len(collider_components) != len(expected_colliders):
        raise RuntimeError(
            f"4階LL室Collider数が不正です: "
            f"{len(collider_components)}/{len(expected_colliders)}"
        )
    for expected in expected_colliders:
        require_component_bounds("4階LL室家具Collider", collider_components, expected)

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
        "furniture_overlap_checks": (
            len(collider_components) * (len(collider_components) - 1) // 2
        ),
        "toilet_overlap_checks": len(visual_components) + len(collider_components),
    }


def audit_toilet_open_fronts() -> dict[str, int]:
    front_wall_violations: list[str] = []
    checked_components = 0
    for floor in (2, 3, 4):
        object_names = (
            f"VIS_B03_Interior_F{floor:02d}_Toilets_Architecture",
            f"COL_B03_Interior_Walls_F{floor:02d}_Toilets",
        )
        for object_name in object_names:
            obj = bpy.data.objects[object_name]
            for component_index, (minimum, maximum) in enumerate(
                connected_component_aabbs(obj),
                1,
            ):
                checked_components += 1
                dimensions = maximum - minimum
                is_front_facing = dimensions.y <= 0.40 + 1e-5
                crosses_front = minimum.y <= 38.65 and maximum.y >= 38.35
                crosses_opening = (
                    minimum.x < TOILET_COMMON_OPENING[1] - 1e-5
                    and maximum.x > TOILET_COMMON_OPENING[0] + 1e-5
                )
                if is_front_facing and crosses_front and crosses_opening:
                    front_wall_violations.append(f"{obj.name}#{component_index}")
    if front_wall_violations:
        raise RuntimeError(
            "上階トイレ全面開放部に正面壁・梁Colliderが残っています:\n"
            + "\n".join(front_wall_violations)
        )

    sign_checks = 0
    expected_signs = (
        (-6.43, 39.0, -math.pi / 2),
        (2.23, 39.0, math.pi / 2),
    )
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        signs = bpy.data.objects[f"VIS_B03_Interior_F{floor:02d}_Toilets_SignsPaper"]
        components = connected_component_aabbs(signs)
        for x, y, rotation in expected_signs:
            require_component_bounds(
                "トイレ側壁表札",
                components,
                transformed_box_bounds(
                    (x, y, base_z),
                    (0.0, 0.0, 1.7),
                    (0.45, 0.04, 0.18),
                    rotation,
                ),
            )
            sign_checks += 1
    return {
        "front_components": checked_components,
        "side_wall_signs": sign_checks,
    }


def audit_broadcast_orientation() -> int:
    visual = bpy.data.objects["VIS_B03_Interior_F02_Broadcast_FurnitureProps"]
    components = connected_component_aabbs(visual)
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
        if dimensions_match(minimum, maximum, (0.55, 0.06, 0.32))
    ]
    monitor_screens = [
        (minimum, maximum)
        for minimum, maximum in components
        if dimensions_match(minimum, maximum, (0.49, 0.012, 0.265))
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
    return len(controls) + len(monitor_screens)


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
        box_bounds((12.5, 44.2, 3.96), (1.40, 0.70, 0.72)),
        box_bounds((6.45, 45.125, 4.20), (1.80, 0.45, 1.20)),
    )
    if len(collider_components) != len(expected_colliders):
        raise RuntimeError(
            f"生徒会室Collider数が不正です: {len(collider_components)}/{len(expected_colliders)}"
        )
    for expected in expected_colliders:
        require_component_bounds("生徒会室家具Collider", collider_components, expected)
    return len(visual_components) + len(collider_components)


def audit_acceptance_placements() -> dict[str, int]:
    main_entry = bpy.data.objects["VIS_B03_Interior_F01_MainEntry_FurnitureProps"]
    main_components = connected_component_aabbs(main_entry)
    if any(
        minimum.y < -3.5 - 1e-5 or maximum.y > -2.9 + 1e-5
        for minimum, maximum in main_components
    ):
        raise RuntimeError("主玄関の荷物ロッカーが建物内の南壁際にありません")
    if min(minimum.x for minimum, _ in main_components) < -5.35:
        raise RuntimeError("主玄関の家具が南西階段の出入口へ近すぎます")
    if max(maximum.x for _, maximum in main_components) >= 0.0:
        raise RuntimeError("主玄関の家具が校庭側へ残っています")
    main_collider = bpy.data.objects["COL_B03_Interior_F01_MainEntry"]
    main_collider_components = connected_component_aabbs(main_collider)
    if len(main_collider_components) != len(MAIN_ENTRY_BAGGAGE_LOCKERS):
        raise RuntimeError(
            "主玄関の荷物ロッカーColliderが2台分ではありません: "
            f"{len(main_collider_components)}"
        )
    for x, y, rotation in MAIN_ENTRY_BAGGAGE_LOCKERS:
        if abs(rotation - math.pi) > 1e-7:
            raise RuntimeError("主玄関の荷物ロッカーが屋内を向いていません")
        require_component_bounds(
            "主玄関の荷物ロッカーCollider",
            main_collider_components,
            box_bounds((x, y, 0.60), PROP_COLLIDER_SIZES["BaggageLocker"]),
        )
        require_component_bounds(
            "主玄関の荷物ロッカー背板",
            main_components,
            (
                (x - 0.90, y - 0.225, 0.0),
                (x + 0.90, y - 0.185, 1.20),
            ),
        )

    north_entry = bpy.data.objects["VIS_B03_Interior_F01_NorthEntry_FurnitureProps"]
    north_components = connected_component_aabbs(north_entry)
    if min(minimum.x for minimum, _ in north_components) < 4.79:
        raise RuntimeError("北側通用口の小物が壁際から廊下側へ出ています")

    staff = bpy.data.objects["VIS_B03_Interior_F01_StaffRoom_FurnitureProps"]
    if max(maximum.y for _, maximum in connected_component_aabbs(staff)) > 45.15:
        raise RuntimeError("職員室の掲示板または時計が北窓面に残っています")

    gym = bpy.data.objects["VIS_B03_Interior_Gym_FurnitureProps"]
    gym_components = connected_component_aabbs(gym)
    expected_backboards = (
        ((33.55, 7.60, 2.825), (33.60, 9.40, 3.875)),
        ((57.20, 7.60, 2.825), (57.25, 9.40, 3.875)),
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
    expected_lectern_collider = box_bounds(
        (lectern_x, lectern_y, lectern_z + lectern_size[2] / 2.0),
        lectern_size,
    )
    if not any(
        bounds_match(component, expected_lectern_collider)
        for component in connected_component_aabbs(gym_collider)
    ):
        raise RuntimeError("演説机Colliderが舞台上にありません")

    return {
        "main_entry": len(main_components),
        "main_entry_colliders": len(main_collider_components),
        "north_entry": len(north_components),
        "staffroom": 1,
        "gym": len(expected_backboards) + 2,
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


def main() -> None:
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError(f"B03-2対象外のBlenderファイルです: {bpy.data.filepath}")
    if len(ADDITIONAL_PROP_TYPES) != 24 or len(set(ADDITIONAL_PROP_TYPES)) != 24:
        raise RuntimeError("追加小物カタログが24種ではありません")

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
    nav_blocker = bpy.data.objects.get("NAV_Blocker_Interiors")
    expected_toilet_wall_colliders = {
        f"COL_B03_Interior_Walls_F{floor:02d}_Toilets" for floor in (2, 3, 4)
    }
    if (
        not interior_visuals
        or len(interior_colliders) != 36
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
        raise RuntimeError("全校34区画の生成結果ではありません")
    if generation.get("wall_collider_objects") != 3:
        raise RuntimeError("上階トイレの専用建築壁Colliderが3 Objectではありません")
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
        ):
            raise RuntimeError(f"普通教室の必須家具数が不正です: {room_name}")
        if not 0.15 <= metrics["scatter_ratio"] <= 0.25:
            raise RuntimeError(f"普通教室の散乱率が範囲外です: {room_name}")
        if not 2 <= metrics["book_paper_spots"] <= 4:
            raise RuntimeError(f"普通教室の本・紙配置が範囲外です: {room_name}")
        if metrics["stored_chairs"] + metrics["scattered_sets"] != 30:
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
        },
        "F01_Library": {
            "Bookshelf": 24,
            "LargeWoodTable": 4,
            "ClassroomChair": 16,
            "StaffDesk": 1,
            "StaffChair": 1,
        },
        "F01_StaffRoom": {
            "StaffDesk": 12,
            "StaffChair": 12,
            "PcMonitor": 6,
            "Bookshelf": 2,
            "CleaningLocker": 1,
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
        "RoofChanging": {"BaggageLocker": 4, "CleaningLocker": 2},
    }
    for room_name, expected_counts in expected_room_counts.items():
        actual_counts = room_counts[room_name]
        for prop_type, expected_count in expected_counts.items():
            if actual_counts.get(prop_type) != expected_count:
                raise RuntimeError(
                    f"室内小物数が不正です: {room_name}/{prop_type}="
                    f"{actual_counts.get(prop_type)}/{expected_count}"
                )
    staffroom_collider = bpy.data.objects["COL_B03_Interior_F01_StaffRoom"]
    locker_x, locker_y, locker_rotation = STAFFROOM_CLEANING_LOCKER
    if locker_rotation != 0.0:
        raise RuntimeError("職員室の掃除ロッカー回転が監査前提と一致しません")
    locker_width, locker_depth, locker_height = PROP_COLLIDER_SIZES[
        "CleaningLocker"
    ]
    locker_minimum = Vector(
        (
            locker_x - locker_width / 2,
            locker_y - locker_depth / 2,
            0.0,
        )
    )
    locker_maximum = Vector(
        (
            locker_x + locker_width / 2,
            locker_y + locker_depth / 2,
            locker_height,
        )
    )
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
        main_entry_counts.get("BaggageLocker") != 2
        or main_entry_counts.get("ShoeLocker", 0) != 0
        or main_entry_counts.get("UmbrellaStand", 0) != 0
    ):
        raise RuntimeError(f"主玄関のロッカー構成が不正です: {main_entry_counts}")
    storey_band_swatches = audit_storey_band_swatches()
    nav_blocker_parity = audit_nav_blocker_parity(interior_colliders, nav_blocker)
    classroom_acceptance = audit_classroom_teacher_desks_and_lockers()
    library_acceptance = audit_library_bookshelves()
    bulletin_board_design = audit_bulletin_board_design()
    art_room_acceptance = audit_art_room_placement()
    ll_room_acceptance = audit_ll_room_placement()
    toilet_open_fronts = audit_toilet_open_fronts()
    broadcast_orientation_checks = audit_broadcast_orientation()
    council_placement_checks = audit_council_placement()
    door_clearance_checks = audit_door_clearance(interior_colliders)
    door_sign_clearance_checks = audit_door_sign_clearance()
    room_sign_wall_support_checks = audit_room_sign_wall_support()
    acceptance_placements = audit_acceptance_placements()
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
        "art_room_acceptance": art_room_acceptance,
        "ll_room_acceptance": ll_room_acceptance,
        "toilet_open_fronts": toilet_open_fronts,
        "broadcast_orientation_checks": broadcast_orientation_checks,
        "council_placement_checks": council_placement_checks,
        "link_clearance_checks": link_clearance_checks,
        "door_clearance_checks": door_clearance_checks,
        "door_sign_clearance_checks": door_sign_clearance_checks,
        "room_sign_wall_support_checks": room_sign_wall_support_checks,
        "acceptance_placements": acceptance_placements,
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
