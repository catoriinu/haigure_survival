from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
VIS_COLLECTION_NAME = "B02_VIS"
COL_COLLECTION_NAME = "B02_COL"
GUIDE_COLLECTION_NAME = "B02_GUIDES"
EXPORT_COLLECTION_NAME = "EXP_Stage_school"
TOLERANCE = 1e-5

NORTH_OUTER = (-12.6, 47.4, 32.5, 45.5)
NORTHWEST_STAIR_OPENING = ((-12.45, -6.75, 38.9, 45.35),)
UPPER_FLOOR_RISE = 3.0
BOUNDARY_MAXIMUM_Z = 16.0

TRANSITIONS = (
    ("2FTo3F", 3.6, False),
    ("3FTo4F", 6.6, False),
    ("4FToRooftop", 9.6, True),
)

FACILITY_WALL_BOXES = (
    # 屋上階段室。南面東側の幅2.1mを常時開放する。
    ((-12.6, 38.9, 12.7), (-12.3, 45.5, 15.1)),
    ((-6.9, 38.9, 12.7), (-6.6, 45.5, 15.1)),
    ((-12.3, 45.2, 12.7), (-6.9, 45.5, 15.1)),
    ((-12.3, 38.9, 12.7), (-9.0, 39.2, 15.1)),
    ((-9.0, 38.9, 14.9), (-6.9, 39.2, 15.1)),
    # 男子更衣室。西壁は階段室東壁を共有する。
    ((-6.9, 38.5, 12.7), (-6.6, 38.9, 15.1)),
    ((-2.25, 38.5, 12.7), (-1.95, 45.5, 15.1)),
    ((-6.6, 45.2, 12.7), (-2.25, 45.5, 15.1)),
    ((-6.6, 38.5, 12.7), (-5.4, 38.8, 15.1)),
    ((-4.2, 38.5, 12.7), (-2.25, 38.8, 15.1)),
    ((-5.4, 38.5, 15.0), (-4.2, 38.8, 15.1)),
    # 女子更衣室。西壁は男子更衣室東壁を共有する。
    ((2.1, 38.5, 12.7), (2.4, 45.5, 15.1)),
    ((-1.95, 45.2, 12.7), (2.1, 45.5, 15.1)),
    ((-1.95, 38.5, 12.7), (-0.9, 38.8, 15.1)),
    ((0.3, 38.5, 12.7), (2.1, 38.8, 15.1)),
    ((-0.9, 38.5, 15.0), (0.3, 38.8, 15.1)),
)

FACILITY_ROOF_BOXES = (
    ((-12.6, 38.9, 15.1), (-6.6, 45.5, 15.2)),
    ((-6.6, 38.5, 15.1), (-2.1, 45.5, 15.2)),
    ((-2.1, 38.5, 15.1), (2.4, 45.5, 15.2)),
)


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def assert_bounds(
    name: str,
    expected_minimum: tuple[float, float, float],
    expected_maximum: tuple[float, float, float],
) -> None:
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError(f"対象Meshがありません: {name}")
    actual_minimum, actual_maximum = world_bounds(obj)
    if (actual_minimum - Vector(expected_minimum)).length > TOLERANCE:
        raise RuntimeError(
            f"{name}の最小境界が想定外です: "
            f"actual={tuple(actual_minimum)}, expected={expected_minimum}"
        )
    if (actual_maximum - Vector(expected_maximum)).length > TOLERANCE:
        raise RuntimeError(
            f"{name}の最大境界が想定外です: "
            f"actual={tuple(actual_maximum)}, expected={expected_maximum}"
        )


def object_signature(obj: bpy.types.Object) -> tuple[object, ...]:
    matrix = tuple(round(value, 8) for row in obj.matrix_world for value in row)
    if obj.type == "MESH":
        vertices = tuple(
            tuple(round(value, 8) for value in vertex.co)
            for vertex in obj.data.vertices
        )
        polygons = tuple(tuple(polygon.vertices) for polygon in obj.data.polygons)
        materials = tuple(material.name for material in obj.data.materials if material)
        return (obj.type, matrix, vertices, polygons, materials)
    if obj.type == "FONT":
        return (obj.type, matrix, obj.data.body)
    return (obj.type, matrix)


def is_preserved_north_special(name: str) -> bool:
    return any(
        marker in name
        for marker in (
            "SpecialRoom0",
            "Wall_Special",
            "SpecialDoor",
            "DoorLeaf_S1",
            "DoorLeaf_S2",
            "NorthEntry_Special",
            "GUIDE_Special",
        )
    )


def append_box(vertices, faces, minimum, maximum) -> None:
    min_x, min_y, min_z = minimum
    max_x, max_y, max_z = maximum
    offset = len(vertices)
    vertices.extend(
        (
            (min_x, min_y, min_z),
            (min_x, min_y, max_z),
            (min_x, max_y, min_z),
            (min_x, max_y, max_z),
            (max_x, min_y, min_z),
            (max_x, min_y, max_z),
            (max_x, max_y, min_z),
            (max_x, max_y, max_z),
        )
    )
    faces.extend(
        (
            (offset + 0, offset + 2, offset + 3, offset + 1),
            (offset + 4, offset + 5, offset + 7, offset + 6),
            (offset + 0, offset + 1, offset + 5, offset + 4),
            (offset + 2, offset + 6, offset + 7, offset + 3),
            (offset + 0, offset + 4, offset + 6, offset + 2),
            (offset + 1, offset + 3, offset + 7, offset + 5),
        )
    )


def append_profile_prism(vertices, faces, axis, width, profile) -> None:
    offset = len(vertices)
    for width_value in width:
        for primary, height in profile:
            if axis == "y":
                vertices.append((width_value, primary, height))
            else:
                vertices.append((primary, width_value, height))

    profile_size = len(profile)
    faces.append(tuple(offset + index for index in range(profile_size)))
    faces.append(
        tuple(offset + profile_size + index for index in range(profile_size))
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


def audit_and_store_mesh(obj, vertices, faces) -> dict[str, object]:
    obj.matrix_world = Matrix.Identity(4)
    mesh = obj.data
    mesh.clear_geometry()
    mesh.from_pydata(vertices, (), faces)
    mesh.name = obj.name
    mesh.update()

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    signed_volume = bm.calc_volume(signed=True)
    if signed_volume < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
        bm.normal_update()
        signed_volume = bm.calc_volume(signed=True)
    degenerate_faces = sum(1 for face in bm.faces if face.calc_area() < 1e-9)
    non_manifold_edges = sum(1 for edge in bm.edges if not edge.is_manifold)
    if signed_volume <= 0 or degenerate_faces != 0 or non_manifold_edges != 0:
        bm.free()
        raise RuntimeError(
            f"Mesh生成に失敗しました: {obj.name}, volume={signed_volume}, "
            f"degenerate={degenerate_faces}, non_manifold={non_manifold_edges}"
        )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    minimum, maximum = world_bounds(obj)
    return {
        "name": obj.name,
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "signed_volume": round(signed_volume, 6),
        "minimum": tuple(round(value, 6) for value in minimum),
        "maximum": tuple(round(value, 6) for value in maximum),
    }


def replace_boxes(obj, boxes) -> dict[str, object]:
    vertices = []
    faces = []
    for minimum, maximum in boxes:
        append_box(vertices, faces, minimum, maximum)
    return audit_and_store_mesh(obj, vertices, faces)


def replace_box(obj, minimum, maximum) -> dict[str, object]:
    return replace_boxes(obj, ((minimum, maximum),))


def replace_slab_with_holes(obj, outer, holes, bottom, top) -> dict[str, object]:
    min_x, max_x, min_y, max_y = outer
    x_values = sorted({min_x, max_x, *(value for hole in holes for value in hole[:2])})
    y_values = sorted({min_y, max_y, *(value for hole in holes for value in hole[2:])})
    included = {}
    for x_index in range(len(x_values) - 1):
        for y_index in range(len(y_values) - 1):
            center_x = (x_values[x_index] + x_values[x_index + 1]) * 0.5
            center_y = (y_values[y_index] + y_values[y_index + 1]) * 0.5
            included[x_index, y_index] = not any(
                hole[0] < center_x < hole[1] and hole[2] < center_y < hole[3]
                for hole in holes
            )

    vertices = []
    faces = []
    vertex_indices = {}

    def vertex_index(point) -> int:
        key = tuple(round(value, 8) for value in point)
        if key not in vertex_indices:
            vertex_indices[key] = len(vertices)
            vertices.append(point)
        return vertex_indices[key]

    def add_face(points) -> None:
        faces.append(tuple(vertex_index(point) for point in points))

    for (x_index, y_index), is_included in included.items():
        if not is_included:
            continue
        x0 = x_values[x_index]
        x1 = x_values[x_index + 1]
        y0 = y_values[y_index]
        y1 = y_values[y_index + 1]
        add_face(((x0, y0, bottom), (x1, y0, bottom), (x1, y1, bottom), (x0, y1, bottom)))
        add_face(((x0, y0, top), (x0, y1, top), (x1, y1, top), (x1, y0, top)))
        if not included.get((x_index - 1, y_index), False):
            add_face(((x0, y0, bottom), (x0, y1, bottom), (x0, y1, top), (x0, y0, top)))
        if not included.get((x_index + 1, y_index), False):
            add_face(((x1, y0, bottom), (x1, y0, top), (x1, y1, top), (x1, y1, bottom)))
        if not included.get((x_index, y_index - 1), False):
            add_face(((x0, y0, bottom), (x0, y0, top), (x1, y0, top), (x1, y0, bottom)))
        if not included.get((x_index, y_index + 1), False):
            add_face(((x0, y1, bottom), (x1, y1, bottom), (x1, y1, top), (x0, y1, top)))
    return audit_and_store_mesh(obj, vertices, faces)


def set_single_material(obj, material_name: str) -> None:
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"既存Materialがありません: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def create_mesh_object(
    name: str,
    collection: bpy.types.Collection,
    material_name: str,
    display_type: str,
    vertices,
    faces,
) -> tuple[bpy.types.Object, dict[str, object]]:
    if bpy.data.objects.get(name) is not None:
        raise RuntimeError(f"追加予定Objectが既に存在します: {name}")
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    set_single_material(obj, material_name)
    obj.display_type = display_type
    return obj, audit_and_store_mesh(obj, vertices, faces)


def create_boxes_object(
    name: str,
    collection: bpy.types.Collection,
    material_name: str,
    display_type: str,
    boxes,
) -> tuple[bpy.types.Object, dict[str, object]]:
    vertices = []
    faces = []
    for minimum, maximum in boxes:
        append_box(vertices, faces, minimum, maximum)
    return create_mesh_object(
        name,
        collection,
        material_name,
        display_type,
        vertices,
        faces,
    )


def delete_object(name: str) -> None:
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"削除対象Objectがありません: {name}")
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is None or data.users != 0:
        return
    if isinstance(data, bpy.types.Mesh):
        bpy.data.meshes.remove(data)
    elif isinstance(data, bpy.types.Curve):
        bpy.data.curves.remove(data)


def shift_world_z(obj: bpy.types.Object, amount: float) -> None:
    matrix = obj.matrix_world.copy()
    matrix.translation.z += amount
    obj.matrix_world = matrix


def create_upper_window_guides(visual_collection) -> list[dict[str, object]]:
    source_objects = sorted(
        (obj for obj in bpy.data.objects if obj.name.startswith("VIS_WindowGuide_3F_")),
        key=lambda obj: obj.name,
    )
    if len(source_objects) != 18:
        raise RuntimeError(f"3階窓ガイドが18件ではありません: {len(source_objects)}")
    audit = []
    for source in source_objects:
        name = source.name.replace("_3F_", "_4F_", 1)
        if bpy.data.objects.get(name) is not None:
            raise RuntimeError(f"4階窓ガイドが既に存在します: {name}")
        duplicate = source.copy()
        duplicate.data = source.data.copy()
        duplicate.name = name
        duplicate.data.name = name
        visual_collection.objects.link(duplicate)
        shift_world_z(duplicate, UPPER_FLOOR_RISE)
        minimum, maximum = world_bounds(duplicate)
        audit.append(
            {
                "name": name,
                "minimum": tuple(round(value, 6) for value in minimum),
                "maximum": tuple(round(value, 6) for value in maximum),
            }
        )
    return audit


def append_steps(vertices, faces, width, start_y, end_y, base_z, step_count, rise) -> None:
    for index in range(step_count):
        y0 = start_y + (end_y - start_y) * index / step_count
        y1 = start_y + (end_y - start_y) * (index + 1) / step_count
        top = base_z + rise * (index + 1)
        append_box(
            vertices,
            faces,
            (width[0], min(y0, y1), base_z - 0.1),
            (width[1], max(y0, y1), top),
        )


def create_stair_visual_geometry(base_z: float, rooftop: bool):
    vertices = []
    faces = []
    append_box(vertices, faces, (-12.6, 38.9, base_z - 0.1), (-9.0, 40.7, base_z))
    append_steps(vertices, faces, (-12.6, -10.2), 40.7, 43.1, base_z, 10, 0.15)
    append_box(
        vertices,
        faces,
        (-12.6, 43.1, base_z + 1.4),
        (-6.6, 45.5, base_z + 1.5),
    )
    append_steps(vertices, faces, (-9.0, -6.6), 43.1, 40.7, base_z + 1.5, 10, 0.15)
    append_box(
        vertices,
        faces,
        (-9.0, 38.9, base_z + 2.9),
        (-6.6, 40.7, base_z + 3.0),
    )
    return vertices, faces


def create_stair_collider_geometry(base_z: float, rooftop: bool):
    vertices = []
    faces = []
    append_box(vertices, faces, (-12.6, 38.9, base_z - 0.1), (-9.0, 40.7, base_z))
    append_profile_prism(
        vertices,
        faces,
        "y",
        (-12.6, -10.2),
        (
            (40.7, base_z - 0.1),
            (43.1, base_z + 1.4),
            (43.1, base_z + 1.5),
            (40.7, base_z),
        ),
    )
    append_box(
        vertices,
        faces,
        (-12.6, 43.1, base_z + 1.4),
        (-6.6, 45.5, base_z + 1.5),
    )
    append_profile_prism(
        vertices,
        faces,
        "y",
        (-9.0, -6.6),
        (
            (43.1, base_z + 1.4),
            (40.7, base_z + 2.9),
            (40.7, base_z + 3.0),
            (43.1, base_z + 1.5),
        ),
    )
    if not rooftop:
        append_box(
            vertices,
            faces,
            (-9.0, 38.9, base_z + 2.9),
            (-6.6, 40.7, base_z + 3.0),
        )
    return vertices, faces


def create_stair_guard_geometry(base_z: float, rooftop: bool):
    vertices = []
    faces = []
    append_profile_prism(
        vertices,
        faces,
        "y",
        (-10.36, -10.2),
        (
            (40.7, base_z),
            (43.1, base_z + 1.5),
            (43.1, base_z + 2.55),
            (40.7, base_z + 1.05),
        ),
    )
    append_box(
        vertices,
        faces,
        (-10.2, 43.1, base_z + 1.5),
        (-9.0, 43.26, base_z + 2.55),
    )
    append_profile_prism(
        vertices,
        faces,
        "y",
        (-9.0, -8.84),
        (
            (43.1, base_z + 1.5),
            (40.7, base_z + 3.0),
            (40.7, base_z + 4.05),
            (43.1, base_z + 2.55),
        ),
    )
    append_box(
        vertices,
        faces,
        (-10.2, 40.7, base_z),
        (-9.0, 40.86, base_z + 1.05),
    )
    append_box(
        vertices,
        faces,
        (-10.2, 40.7, base_z + 3.0),
        (-9.0, 40.86, base_z + 4.05),
    )
    if rooftop:
        append_box(
            vertices,
            faces,
            (-9.0, 38.9, base_z + 3.0),
            (-8.84, 40.7, base_z + 4.05),
        )
    return vertices, faces


def rebuild_existing_northwest_upper_stair() -> list[dict[str, object]]:
    audit = []
    visual_vertices = []
    visual_faces = []
    append_steps(
        visual_vertices,
        visual_faces,
        (-9.0, -6.6),
        43.1,
        40.7,
        2.4,
        8,
        0.15,
    )
    append_box(visual_vertices, visual_faces, (-9.0, 38.9, 3.5), (-6.6, 40.7, 3.6))
    audit.append(
        audit_and_store_mesh(
            bpy.data.objects["VIS_StairsUpper_NW"],
            visual_vertices,
            visual_faces,
        )
    )

    collider_vertices = []
    collider_faces = []
    append_profile_prism(
        collider_vertices,
        collider_faces,
        "y",
        (-9.0, -6.6),
        ((43.1, 2.3), (40.7, 3.5), (40.7, 3.6), (43.1, 2.4)),
    )
    append_box(collider_vertices, collider_faces, (-9.0, 38.9, 3.5), (-6.6, 40.7, 3.6))
    audit.append(
        audit_and_store_mesh(
            bpy.data.objects["COL_StairRampUpper_NW"],
            collider_vertices,
            collider_faces,
        )
    )

    guard_vertices = []
    guard_faces = []
    append_profile_prism(
        guard_vertices,
        guard_faces,
        "y",
        (-9.0, -8.84),
        ((43.1, 2.4), (40.7, 3.6), (40.7, 4.65), (43.1, 3.45)),
    )
    for prefix in ("VIS", "COL"):
        audit.append(
            audit_and_store_mesh(
                bpy.data.objects[f"{prefix}_StairGuard_NW_Upper"],
                guard_vertices,
                guard_faces,
            )
        )
    return audit


def preflight() -> dict[str, tuple[object, ...]]:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len(bpy.data.objects) != 463 or len(bpy.data.meshes) != 438:
        raise RuntimeError(
            "南口扉修正後のシーン件数が想定外です: "
            f"objects={len(bpy.data.objects)}, meshes={len(bpy.data.meshes)}"
        )
    counts = {
        prefix: len([obj for obj in bpy.data.objects if obj.name.startswith(prefix)])
        for prefix in ("VIS_", "COL_", "NAV_")
    }
    if counts != {"VIS_": 277, "COL_": 150, "NAV_": 8}:
        raise RuntimeError(f"南口扉修正後の分類件数が想定外です: {counts}")
    if len(bpy.data.collections[GUIDE_COLLECTION_NAME].objects) != 23:
        raise RuntimeError("B02_GUIDESのObject数が23件ではありません")
    if len(bpy.data.collections[EXPORT_COLLECTION_NAME].all_objects) != 440:
        raise RuntimeError("学校Export対象が440件ではありません")

    expected_bounds = {
        "VIS_NorthWingSouthEntryDoor_Open_L": ((0.16, 30.74, 0.0), (0.24, 32.34, 2.4)),
        "VIS_Floor_Classroom02": ((-12.6, 12.5, 0.0), (-3.5, 22.5, 0.03)),
        "VIS_Floor_Classroom03": ((-12.6, 22.5, 0.0), (-3.5, 32.5, 0.03)),
        "VIS_Wall_ClassroomCross_3": ((-12.6, 22.35, 0.0), (-3.5, 22.65, 3.0)),
        "COL_Wall_ClassroomCross_3": ((-12.6, 22.35, 0.0), (-3.5, 22.65, 3.0)),
        "VIS_3F_NorthVolume": ((-12.6, 32.5, 6.6), (47.4, 45.5, 9.6)),
        "COL_3F_NorthVolume": ((-12.6, 32.5, 6.6), (47.4, 45.5, 9.6)),
        "VIS_Roof_North": ((-12.6, 32.5, 9.6), (47.4, 45.5, 9.7)),
        "COL_Roof_North": ((-12.6, 32.5, 9.6), (47.4, 45.5, 9.7)),
        "VIS_Roof_West": ((-12.6, -3.5, 9.6), (0.0, 32.5, 9.7)),
        "COL_Roof_West": ((-12.6, -3.5, 9.6), (0.0, 32.5, 9.7)),
        "COL_StairClosure_NW": ((-9.0, 42.29, 0.0), (-6.6, 42.49, 6.6)),
        "BND_Stage": ((-18.4, -12.3, -0.5), (63.2, 51.3, 4.6)),
    }
    for name, (minimum, maximum) in expected_bounds.items():
        assert_bounds(name, minimum, maximum)

    new_names = {
        "VIS_Floor_SpecialRoom_West",
        "GUIDE_WestSpecialRoom",
        "VIS_4F_NorthVolume",
        "COL_4F_NorthVolume",
        "VIS_4F_WestVolume",
        "COL_4F_WestVolume",
        "COL_RooftopStairExitRamp",
        "VIS_RooftopFacilityWalls",
        "VIS_RooftopFacilityRoofs",
        "COL_RooftopFacilityShell",
        "VIS_DoorLeaf_RooftopStairHouse_Open",
        "VIS_Floor_RooftopChangingRoom_M",
        "VIS_Floor_RooftopChangingRoom_F",
        *(f"VIS_StairSystem_NW_{suffix}" for suffix, _base, _roof in TRANSITIONS),
        *(f"COL_StairSystem_NW_{suffix}" for suffix, _base, _roof in TRANSITIONS),
        *(f"VIS_StairGuardSystem_NW_{suffix}" for suffix, _base, _roof in TRANSITIONS),
        *(f"COL_StairGuardSystem_NW_{suffix}" for suffix, _base, _roof in TRANSITIONS),
    }
    new_names.update(
        obj.name.replace("_3F_", "_4F_", 1)
        for obj in bpy.data.objects
        if obj.name.startswith("VIS_WindowGuide_3F_")
    )
    existing_new_names = sorted(name for name in new_names if bpy.data.objects.get(name))
    if existing_new_names:
        raise RuntimeError(f"4階化Objectが既に存在します: {existing_new_names}")

    required_materials = {
        "MAT_Collider_Magenta",
        "MAT_Door_Blue",
        "MAT_Roof_Gray",
        "MAT_SpecialRoom_Blue",
        "MAT_Stair_Yellow",
        "MAT_Upper_WarmWhite",
        "MAT_Wall_White",
    }
    missing_materials = sorted(
        name for name in required_materials if bpy.data.materials.get(name) is None
    )
    if missing_materials:
        raise RuntimeError(f"再利用Materialが不足しています: {missing_materials}")

    pool_objects = [obj for obj in bpy.data.objects if "Pool" in obj.name]
    roof_guards = [obj for obj in bpy.data.objects if "RoofGuard" in obj.name]
    if len(pool_objects) != 20 or len(roof_guards) != 12:
        raise RuntimeError(
            f"屋上移動対象数が想定外です: pool={len(pool_objects)}, guards={len(roof_guards)}"
        )

    return {
        obj.name: object_signature(obj)
        for obj in bpy.data.objects
        if is_preserved_north_special(obj.name)
    }


def main() -> None:
    preserved_north_special = preflight()
    visual_collection = bpy.data.collections[VIS_COLLECTION_NAME]
    collider_collection = bpy.data.collections[COL_COLLECTION_NAME]
    audit = []

    # 1階西側の中央・北普通教室だけを一室へ統合する。
    delete_object("VIS_Wall_ClassroomCross_3")
    delete_object("COL_Wall_ClassroomCross_3")
    delete_object("VIS_Floor_Classroom03")
    floor = bpy.data.objects["VIS_Floor_Classroom02"]
    floor.name = "VIS_Floor_SpecialRoom_West"
    floor.data.name = floor.name
    set_single_material(floor, "MAT_SpecialRoom_Blue")
    audit.append(replace_box(floor, (-12.6, 12.5, 0.0), (-3.5, 32.5, 0.03)))

    guide = bpy.data.objects["GUIDE_Class02"]
    guide.name = "GUIDE_WestSpecialRoom"
    guide.data.name = guide.name
    guide.data.body = "仮特別教室 西側"
    guide.location.y = 22.5
    delete_object("GUIDE_Class03")

    # 3階北側、4階北側、屋根に北西階段shaftを通す。
    for name in ("VIS_3F_NorthVolume", "COL_3F_NorthVolume"):
        audit.append(
            replace_slab_with_holes(
                bpy.data.objects[name],
                NORTH_OUTER,
                NORTHWEST_STAIR_OPENING,
                6.6,
                9.6,
            )
        )

    for prefix, collection, material, display in (
        ("VIS", visual_collection, "MAT_Upper_WarmWhite", "TEXTURED"),
        ("COL", collider_collection, "MAT_Collider_Magenta", "WIRE"),
    ):
        north_name = f"{prefix}_4F_NorthVolume"
        north_mesh = bpy.data.meshes.new(north_name)
        north_obj = bpy.data.objects.new(north_name, north_mesh)
        collection.objects.link(north_obj)
        set_single_material(north_obj, material)
        north_obj.display_type = display
        audit.append(
            replace_slab_with_holes(
                north_obj,
                NORTH_OUTER,
                NORTHWEST_STAIR_OPENING,
                9.6,
                12.6,
            )
        )

        west_name = f"{prefix}_4F_WestVolume"
        west_obj, west_audit = create_boxes_object(
            west_name,
            collection,
            material,
            display,
            (((-12.6, -3.5, 9.6), (0.0, 32.5, 12.6)),),
        )
        audit.append(west_audit)

    audit.extend(create_upper_window_guides(visual_collection))

    audit.append(
        replace_slab_with_holes(
            bpy.data.objects["VIS_Roof_North"],
            NORTH_OUTER,
            NORTHWEST_STAIR_OPENING,
            12.6,
            12.7,
        )
    )
    audit.append(
        replace_slab_with_holes(
            bpy.data.objects["COL_Roof_North"],
            NORTH_OUTER,
            NORTHWEST_STAIR_OPENING,
            12.6,
            12.7,
        )
    )
    for name in ("VIS_Roof_West", "COL_Roof_West"):
        audit.append(
            replace_box(
                bpy.data.objects[name],
                (-12.6, -3.5, 12.6),
                (0.0, 32.5, 12.7),
            )
        )

    for obj in [obj for obj in bpy.data.objects if "Pool" in obj.name]:
        shift_world_z(obj, UPPER_FLOOR_RISE)
    for obj in [obj for obj in bpy.data.objects if "RoofGuard" in obj.name]:
        shift_world_z(obj, UPPER_FLOOR_RISE)
    for prefix in ("VIS", "COL"):
        audit.append(
            replace_box(
                bpy.data.objects[f"{prefix}_RoofGuard_NorthOuter"],
                (2.4, 45.3, 12.7),
                (47.4, 45.5, 13.8),
            )
        )
        audit.append(
            replace_box(
                bpy.data.objects[f"{prefix}_RoofGuard_WestOuter"],
                (-12.6, -3.5, 12.7),
                (-12.4, 38.9, 13.8),
            )
        )

    audit.extend(rebuild_existing_northwest_upper_stair())
    delete_object("COL_StairClosure_NW")

    for suffix, base_z, rooftop in TRANSITIONS:
        visual_vertices, visual_faces = create_stair_visual_geometry(base_z, rooftop)
        _obj, item = create_mesh_object(
            f"VIS_StairSystem_NW_{suffix}",
            visual_collection,
            "MAT_Stair_Yellow",
            "TEXTURED",
            visual_vertices,
            visual_faces,
        )
        audit.append(item)
        collider_vertices, collider_faces = create_stair_collider_geometry(base_z, rooftop)
        _obj, item = create_mesh_object(
            f"COL_StairSystem_NW_{suffix}",
            collider_collection,
            "MAT_Collider_Magenta",
            "WIRE",
            collider_vertices,
            collider_faces,
        )
        audit.append(item)
        guard_vertices, guard_faces = create_stair_guard_geometry(base_z, rooftop)
        for prefix, collection, material, display in (
            ("VIS", visual_collection, "MAT_Stair_Yellow", "TEXTURED"),
            ("COL", collider_collection, "MAT_Collider_Magenta", "WIRE"),
        ):
            _obj, item = create_mesh_object(
                f"{prefix}_StairGuardSystem_NW_{suffix}",
                collection,
                material,
                display,
                guard_vertices,
                guard_faces,
            )
            audit.append(item)

    ramp_vertices = []
    ramp_faces = []
    append_profile_prism(
        ramp_vertices,
        ramp_faces,
        "y",
        (-9.0, -6.9),
        ((40.7, 12.5), (38.9, 12.6), (38.9, 12.7), (40.7, 12.6)),
    )
    _obj, item = create_mesh_object(
        "COL_RooftopStairExitRamp",
        collider_collection,
        "MAT_Collider_Magenta",
        "WIRE",
        ramp_vertices,
        ramp_faces,
    )
    audit.append(item)

    _obj, item = create_boxes_object(
        "VIS_RooftopFacilityWalls",
        visual_collection,
        "MAT_Wall_White",
        "TEXTURED",
        FACILITY_WALL_BOXES,
    )
    audit.append(item)
    _obj, item = create_boxes_object(
        "VIS_RooftopFacilityRoofs",
        visual_collection,
        "MAT_Roof_Gray",
        "TEXTURED",
        FACILITY_ROOF_BOXES,
    )
    audit.append(item)
    _obj, item = create_boxes_object(
        "COL_RooftopFacilityShell",
        collider_collection,
        "MAT_Collider_Magenta",
        "WIRE",
        (*FACILITY_WALL_BOXES, *FACILITY_ROOF_BOXES),
    )
    audit.append(item)
    _obj, item = create_boxes_object(
        "VIS_DoorLeaf_RooftopStairHouse_Open",
        visual_collection,
        "MAT_Door_Blue",
        "TEXTURED",
        (((-9.04, 37.0, 12.7), (-8.96, 38.9, 14.9)),),
    )
    audit.append(item)
    for suffix, minimum, maximum in (
        ("M", (-6.6, 38.5, 12.7), (-2.1, 45.5, 12.73)),
        ("F", (-2.1, 38.5, 12.7), (2.4, 45.5, 12.73)),
    ):
        _obj, item = create_boxes_object(
            f"VIS_Floor_RooftopChangingRoom_{suffix}",
            visual_collection,
            "MAT_SpecialRoom_Blue",
            "TEXTURED",
            ((minimum, maximum),),
        )
        audit.append(item)

    audit.append(
        replace_box(
            bpy.data.objects["BND_Stage"],
            (-18.4, -12.3, -0.5),
            (63.2, 51.3, BOUNDARY_MAXIMUM_Z),
        )
    )

    current_north_special = {
        name: object_signature(bpy.data.objects[name])
        for name in preserved_north_special
    }
    if current_north_special != preserved_north_special:
        changed = sorted(
            name
            for name, signature in preserved_north_special.items()
            if current_north_special.get(name) != signature
        )
        raise RuntimeError(f"北側校舎の既存特別教室が変化しました: {changed}")

    final_counts = {
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "visuals": len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]),
        "colliders": len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]),
        "nav": len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]),
        "guides": len(bpy.data.collections[GUIDE_COLLECTION_NAME].objects),
        "export": len(bpy.data.collections[EXPORT_COLLECTION_NAME].all_objects),
    }
    expected_counts = {
        "objects": 499,
        "meshes": 475,
        "visuals": 306,
        "colliders": 158,
        "nav": 8,
        "guides": 22,
        "export": 477,
    }
    if final_counts != expected_counts:
        raise RuntimeError(
            f"4階化後の件数が想定外です: actual={final_counts}, expected={expected_counts}"
        )

    assert_bounds(
        "VIS_Floor_SpecialRoom_West",
        (-12.6, 12.5, 0.0),
        (-3.5, 32.5, 0.03),
    )
    assert_bounds("VIS_4F_NorthVolume", (-12.6, 32.5, 9.6), (47.4, 45.5, 12.6))
    assert_bounds("VIS_4F_WestVolume", (-12.6, -3.5, 9.6), (0.0, 32.5, 12.6))
    assert_bounds("VIS_Roof_North", (-12.6, 32.5, 12.6), (47.4, 45.5, 12.7))
    assert_bounds("BND_Stage", (-18.4, -12.3, -0.5), (63.2, 51.3, 16.0))
    if any(bpy.data.objects.get(name) is not None for name in (
        "VIS_Wall_ClassroomCross_3",
        "COL_Wall_ClassroomCross_3",
        "VIS_Floor_Classroom03",
        "COL_StairClosure_NW",
        "GUIDE_Class03",
    )):
        raise RuntimeError("削除対象Objectが4階化後も残っています")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_WindowGuide_4F_")]) != 18:
        raise RuntimeError("4階窓ガイドが18件ではありません")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "counts": final_counts,
            "preserved_north_special_objects": len(preserved_north_special),
            "audit": audit,
        }
    )


main()
