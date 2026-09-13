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

UPPER_TRANSITIONS = (
    ("2FTo3F", 3.6, False),
    ("3FTo4F", 6.6, False),
    ("4FToRooftop", 9.6, True),
)

NEW_OBJECT_NAMES = (
    "VIS_StairStorageShell_NW",
    "COL_StairStorageShell_NW",
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


def append_profile_prism(vertices, faces, axis: str, width, profile) -> None:
    offset = len(vertices)
    if axis == "x":
        for x_value in width:
            for y_value, z_value in profile:
                vertices.append((x_value, y_value, z_value))
    elif axis == "y":
        for y_value in width:
            for x_value, z_value in profile:
                vertices.append((x_value, y_value, z_value))
    else:
        raise RuntimeError(f"未対応の押し出し軸です: {axis}")

    profile_size = len(profile)
    faces.append(tuple(offset + index for index in range(profile_size)))
    faces.append(tuple(offset + profile_size + index for index in range(profile_size)))
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


def set_single_material(obj: bpy.types.Object, material_name: str) -> None:
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


def append_thin_steps(
    vertices,
    faces,
    width,
    start_y: float,
    end_y: float,
    base_z: float,
) -> None:
    step_count = 10
    rise = 0.15
    for index in range(step_count):
        y0 = start_y + (end_y - start_y) * index / step_count
        y1 = start_y + (end_y - start_y) * (index + 1) / step_count
        top = base_z + rise * (index + 1)
        append_box(
            vertices,
            faces,
            (width[0], min(y0, y1), top - rise),
            (width[1], max(y0, y1), top),
        )


def create_open_upper_stair_visual(base_z: float) -> tuple[list, list]:
    vertices = []
    faces = []
    append_box(vertices, faces, (-12.6, 38.9, base_z - 0.1), (-9.0, 40.7, base_z))
    append_thin_steps(vertices, faces, (-12.6, -10.2), 40.7, 43.1, base_z)
    append_profile_prism(
        vertices,
        faces,
        "x",
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
    append_thin_steps(vertices, faces, (-9.0, -6.6), 43.1, 40.7, base_z + 1.5)
    append_profile_prism(
        vertices,
        faces,
        "x",
        (-9.0, -6.6),
        (
            (43.1, base_z + 1.4),
            (40.7, base_z + 2.9),
            (40.7, base_z + 3.0),
            (43.1, base_z + 1.5),
        ),
    )
    append_box(
        vertices,
        faces,
        (-9.0, 38.9, base_z + 2.9),
        (-6.6, 40.7, base_z + 3.0),
    )
    return vertices, faces


def create_storage_shell_geometry() -> tuple[list, list]:
    vertices = []
    faces = []
    append_box(vertices, faces, (-9.0, 38.9, 0.0), (-6.75, 39.0, 3.5))
    append_profile_prism(
        vertices,
        faces,
        "x",
        (-9.0, -8.9),
        (
            (38.9, 0.0),
            (38.9, 3.5),
            (40.7, 3.5),
            (40.7, 2.3),
            (43.1, 2.3),
            (43.1, 0.0),
        ),
    )
    return vertices, faces


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    expected_counts = {
        "objects": 504,
        "meshes": 480,
        "visuals": 309,
        "colliders": 160,
        "nav": 8,
        "guides": 22,
        "export": 482,
    }
    actual_counts = {
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "visuals": len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]),
        "colliders": len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]),
        "nav": len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]),
        "guides": len(bpy.data.collections[GUIDE_COLLECTION_NAME].objects),
        "export": len(bpy.data.collections[EXPORT_COLLECTION_NAME].all_objects),
    }
    if actual_counts != expected_counts:
        raise RuntimeError(
            f"プール階段追加後のシーン件数が想定外です: "
            f"actual={actual_counts}, expected={expected_counts}"
        )
    if any(bpy.data.objects.get(name) is not None for name in NEW_OBJECT_NAMES):
        raise RuntimeError("北西階段倉庫Shellが既に存在します")

    expected_bounds = {
        "VIS_StairsUpper_NW": ((-9.0, 38.9, 2.3), (-6.6, 43.1, 3.6)),
        "COL_StairRampUpper_NW": ((-9.0, 38.9, 2.3), (-6.6, 43.1, 3.6)),
        "VIS_StairSystem_NW_2FTo3F": ((-12.6, 38.9, 3.5), (-6.6, 45.5, 6.6)),
        "VIS_StairSystem_NW_3FTo4F": ((-12.6, 38.9, 6.5), (-6.6, 45.5, 9.6)),
        "VIS_StairSystem_NW_4FToRooftop": ((-12.6, 38.9, 9.5), (-6.6, 45.5, 12.6)),
    }
    for name, (minimum, maximum) in expected_bounds.items():
        assert_bounds(name, minimum, maximum)


def main() -> None:
    preflight()
    audit = []

    collider_vertices = []
    collider_faces = []
    append_profile_prism(
        collider_vertices,
        collider_faces,
        "x",
        (-9.0, -6.6),
        (
            (38.9, 3.5),
            (38.9, 3.6),
            (40.7, 3.6),
            (43.1, 2.4),
            (43.1, 2.3),
            (40.7, 2.3),
            (40.7, 3.5),
        ),
    )
    audit.append(
        audit_and_store_mesh(
            bpy.data.objects["COL_StairRampUpper_NW"],
            collider_vertices,
            collider_faces,
        )
    )

    for suffix, base_z, _rooftop in UPPER_TRANSITIONS:
        vertices, faces = create_open_upper_stair_visual(base_z)
        audit.append(
            audit_and_store_mesh(
                bpy.data.objects[f"VIS_StairSystem_NW_{suffix}"],
                vertices,
                faces,
            )
        )

    shell_vertices, shell_faces = create_storage_shell_geometry()
    _visual, item = create_mesh_object(
        "VIS_StairStorageShell_NW",
        bpy.data.collections[VIS_COLLECTION_NAME],
        "MAT_Wall_White",
        "TEXTURED",
        shell_vertices,
        shell_faces,
    )
    audit.append(item)
    _collider, item = create_mesh_object(
        "COL_StairStorageShell_NW",
        bpy.data.collections[COL_COLLECTION_NAME],
        "MAT_Collider_Magenta",
        "WIRE",
        shell_vertices,
        shell_faces,
    )
    audit.append(item)

    expected_final_counts = {
        "objects": 506,
        "meshes": 482,
        "visuals": 310,
        "colliders": 161,
        "nav": 8,
        "guides": 22,
        "export": 484,
    }
    final_counts = {
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "visuals": len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]),
        "colliders": len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]),
        "nav": len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]),
        "guides": len(bpy.data.collections[GUIDE_COLLECTION_NAME].objects),
        "export": len(bpy.data.collections[EXPORT_COLLECTION_NAME].all_objects),
    }
    if final_counts != expected_final_counts:
        raise RuntimeError(
            f"北西階段構造修正後の件数が想定外です: "
            f"actual={final_counts}, expected={expected_final_counts}"
        )

    assert_bounds("VIS_StairStorageShell_NW", (-9.0, 38.9, 0.0), (-6.75, 43.1, 3.5))
    assert_bounds("COL_StairStorageShell_NW", (-9.0, 38.9, 0.0), (-6.75, 43.1, 3.5))
    for suffix, base_z, _rooftop in UPPER_TRANSITIONS:
        obj = bpy.data.objects[f"VIS_StairSystem_NW_{suffix}"]
        if len(obj.data.vertices) != 200 or len(obj.data.polygons) != 150:
            raise RuntimeError(
                f"上階開放階段Meshの構成が想定外です: {obj.name}, "
                f"vertices={len(obj.data.vertices)}, faces={len(obj.data.polygons)}"
            )
        assert_bounds(
            obj.name,
            (-12.6, 38.9, base_z - 0.1),
            (-6.6, 45.5, base_z + 3.0),
        )

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "counts": final_counts,
            "audit": audit,
        }
    )


if __name__ == "__main__":
    main()
