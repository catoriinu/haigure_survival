from __future__ import annotations

import math
import re
from dataclasses import dataclass

import bmesh
import bpy

from build_b03_school_interiors import swatch_uv


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


def _create_low_poly_sphere_object(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    target_collection: bpy.types.Collection,
    *,
    material: bpy.types.Material,
    uv_swatch: tuple[tuple[float, float], ...],
    parent: bpy.types.Object,
) -> bpy.types.Object:
    editable = bmesh.new()
    bmesh.ops.create_icosphere(editable, subdivisions=1, radius=radius)
    editable.verts.index_update()
    editable.verts.ensure_lookup_table()
    vertices = [
        (
            float(vertex.co.x) + center[0],
            float(vertex.co.y) + center[1],
            float(vertex.co.z) + center[2],
        )
        for vertex in editable.verts
    ]
    faces = [
        tuple(vertex.index for vertex in face.verts)
        for face in editable.faces
    ]
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
        ("LeftOuter", -0.525, -0.020, -0.875),
        ("LeftInner", -0.175, 0.020, -0.875),
        ("RightInner", 0.175, 0.020, 0.875),
        ("RightOuter", 0.525, -0.020, 0.875),
    )
    panel_half_width = 0.175
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
        _create_box_object(
            f"VIS_DoorPanel_{object_token}",
            (panel_box,),
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
        (((-1.05, -0.04, 0.0), (1.05, 0.04, panel_height)),),
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
                _create_low_poly_sphere_object(
                    f"VIS_DoorPanel_Knob_{token}",
                    (-1.22, -0.075, 0.95),
                    0.06,
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
        location=(-10.30, -5.20, 10.8),
        rotation_z=math.pi / 2.0,
        properties={
            "hs_id": car_id,
            "hs_role": "elevator_car",
            "hs_elevator_id": elevator_id,
        },
        parent=controller,
    )
    car_boxes = (
        ((-1.10, -0.98, 0.00), (1.10, 0.95, 0.12)),
        ((-1.10, -1.08, 2.30), (1.10, 0.95, 2.42)),
        ((-1.10, 0.87, 0.12), (1.10, 0.95, 2.30)),
        ((-1.10, -0.94, 0.12), (-1.02, 0.87, 2.30)),
        ((1.02, -0.94, 0.12), (1.10, 0.87, 2.30)),
        ((-1.10, -1.08, 0.12), (-1.02, -1.04, 2.30)),
        ((1.02, -1.08, 0.12), (1.10, -1.04, 2.30)),
    )
    _create_box_object(
        "VIS_ElevatorCar_School",
        car_boxes,
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
        (((-0.82, -0.78, 0.12), (0.82, 0.72, 2.18)),),
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
            location=(-10.30, -5.20, base_z),
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
            (((-0.75, -3.12, 0.00), (0.75, -1.62, 0.05)),),
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
        _create_box_object(
            f"VIS_ElevatorCallIndicator_Base_F{floor:02d}",
            (((-0.75, -3.12, 0.005), (0.75, -1.62, 0.025)),),
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
            0.027,
            0.037,
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
            (((-0.70, -1.32, -0.02), (0.70, -0.98, 0.12)),),
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
            -0.70,
            0.70,
            -1.32,
            -1.08,
            -0.98,
            -0.02,
            0.00,
            0.12,
        )
        _create_mesh_object(
            f"VIS_ElevatorThresholdPlate_F{floor:02d}",
            threshold_vertices,
            threshold_faces,
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
            (((-0.75, -0.04, 0.0), (0.75, 0.04, 2.30)),),
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
            location=(-8.20, -5.20, base_z),
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


def _build_room_variants(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    nav_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    furniture_material: bpy.types.Material,
) -> dict[str, int]:
    marker_count = 0
    volume_count = 0
    for room in ROOM_VARIANT_SPECS:
        token = _token(room.author_name)
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
            for suffix in ("FurnitureProps", "Curtains", "SignsPaper")
            if (
                obj := bpy.data.objects.get(
                    f"VIS_B03_Interior_{room.author_name}_{suffix}"
                )
            )
            is not None
        )
        if not normal_visuals:
            raise RuntimeError(f"部屋variantの表示がありません: {room.author_name}")

        normal_collider = bpy.data.objects.get(
            f"COL_B03_Interior_{room.author_name}"
        )
        if normal_collider is None or normal_collider.type != "MESH":
            raise RuntimeError(f"部屋variantのColliderがありません: {room.author_name}")
        normal_collider.parent = normal_marker
        _create_variant_nav_from_collider(
            normal_collider,
            f"NAV_RoomVariant_{token}_Normal_Blocker",
            nav_collection,
            normal_marker,
        )

        placement = _select_disordered_placement(room, normal_collider)
        removed_box_indices = placement["removed_box_indices"]
        normal_boxes = _normal_collider_boxes(normal_collider)
        excluded_bounds = tuple(
            normal_boxes[index]
            for index in removed_box_indices
        )
        for source in normal_visuals:
            source.parent = normal_marker
            target_name = source.name.replace(
                f"VIS_B03_Interior_{room.author_name}",
                f"VIS_RoomVariant_{token}_Disordered",
            )
            if excluded_bounds and not source.name.endswith("_Curtains"):
                disordered_visual = _copy_mesh_excluding_bounds(
                    source,
                    target_name,
                    visual_collection,
                    disordered_marker,
                    excluded_bounds,
                )
                if source.name.endswith("_FurnitureProps"):
                    if (
                        len(disordered_visual.data.vertices)
                        >= len(source.data.vertices)
                    ):
                        raise RuntimeError(
                            f"{source.name}: 荒れ版で置換する通常机の表示形状"
                            "が見つかりません"
                        )
            else:
                _copy_mesh_object(
                    source,
                    target_name,
                    visual_collection,
                    disordered_marker,
                )

        disordered_vertices, disordered_faces = _collider_without_boxes(
            normal_collider,
            removed_box_indices,
        )
        ramp_box = placement["ramp_box"]
        ramp_direction = placement["ramp_direction"]
        shelf_minimum, shelf_maximum = placement["shelf_box"]
        ramp_minimum_x = ramp_box[0][0]
        ramp_maximum_x = ramp_box[1][0]
        ramp_minimum_y = ramp_box[0][1]
        ramp_maximum_y = ramp_box[1][1]
        _append_ramp(
            disordered_vertices,
            disordered_faces,
            ramp_minimum_x,
            ramp_maximum_x,
            ramp_minimum_y,
            ramp_maximum_y,
            room.base_z + 0.02,
            room.base_z + 0.12,
            room.base_z + 0.65,
            ramp_direction,
        )
        _append_box(
            disordered_vertices,
            disordered_faces,
            shelf_minimum,
            shelf_maximum,
        )
        disordered_collider = _create_mesh_object(
            f"COL_RoomVariant_{token}_Disordered",
            disordered_vertices,
            disordered_faces,
            collider_collection,
            parent=disordered_marker,
        )
        (
            disordered_blocker_vertices,
            disordered_blocker_faces,
        ) = _collider_without_boxes(
            normal_collider,
            removed_box_indices,
        )
        _append_box(
            disordered_blocker_vertices,
            disordered_blocker_faces,
            shelf_minimum,
            shelf_maximum,
        )
        _create_mesh_object(
            f"NAV_RoomVariant_{token}_Disordered_Blocker",
            disordered_blocker_vertices,
            disordered_blocker_faces,
            nav_collection,
            properties={
                "hs_nav_set": "human",
                "hs_nav_role": "blocker",
            },
            parent=disordered_marker,
        )

        disordered_walkable_vertices: list[tuple[float, float, float]] = []
        disordered_walkable_faces: list[tuple[int, ...]] = []
        _append_ramp(
            disordered_walkable_vertices,
            disordered_walkable_faces,
            ramp_minimum_x,
            ramp_maximum_x,
            ramp_minimum_y,
            ramp_maximum_y,
            room.base_z + 0.02,
            room.base_z + 0.12,
            room.base_z + 0.65,
            ramp_direction,
        )
        _create_mesh_object(
            f"NAV_RoomVariant_{token}_Disordered_Walkable",
            disordered_walkable_vertices,
            disordered_walkable_faces,
            nav_collection,
            properties={
                "hs_nav_set": "human",
                "hs_nav_role": "walkable",
                "hs_nav_area": "ground",
            },
            parent=disordered_marker,
        )

        disorder_visual_vertices: list[tuple[float, float, float]] = []
        disorder_visual_faces: list[tuple[int, ...]] = []
        _append_ramp(
            disorder_visual_vertices,
            disorder_visual_faces,
            ramp_minimum_x,
            ramp_maximum_x,
            ramp_minimum_y,
            ramp_maximum_y,
            room.base_z + 0.02,
            room.base_z + 0.12,
            room.base_z + 0.65,
            ramp_direction,
        )
        _append_box(
            disorder_visual_vertices,
            disorder_visual_faces,
            shelf_minimum,
            shelf_maximum,
        )
        _create_mesh_object(
            f"VIS_RoomVariant_{token}_Disordered_FallenFurniture",
            disorder_visual_vertices,
            disorder_visual_faces,
            visual_collection,
            material=furniture_material,
            uv_swatch=swatch_uv("FurnitureProps", "wood"),
            parent=disordered_marker,
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

    if marker_count != 40 or volume_count != 20:
        raise RuntimeError(
            "部屋variant件数が不正です: "
            f"markers={marker_count}, volumes={volume_count}"
        )
    if tuple(room.room_id for room in ROOM_VARIANT_SPECS) != ROOM_VARIANT_IDS:
        raise RuntimeError("固定room ID順がRoomVariantSpecと一致しません")
    return {
        "rooms": len(ROOM_VARIANT_SPECS),
        "markers": marker_count,
        "tile_volumes": volume_count,
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
        "toilet_stall_doors": toilet_doors,
        "elevator": elevator,
        "room_variants": variants,
    }
