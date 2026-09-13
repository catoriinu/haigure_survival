from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
COLLIDER_NAME = "COL_NorthEntryStep"

EXPECTED_BOUNDS_MIN = Vector((2.4, 45.5, -0.3))
EXPECTED_BOUNDS_MAX = Vector((5.4, 47.0, 0.0))


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(vertex[index] for vertex in corners) for index in range(3))),
        Vector(tuple(max(vertex[index] for vertex in corners) for index in range(3))),
    )


def assert_bounds(actual_min: Vector, actual_max: Vector) -> None:
    if (actual_min - EXPECTED_BOUNDS_MIN).length > 1e-5:
        raise RuntimeError(f"北側出入口Colliderの最小境界が想定外です: {tuple(actual_min)}")
    if (actual_max - EXPECTED_BOUNDS_MAX).length > 1e-5:
        raise RuntimeError(f"北側出入口Colliderの最大境界が想定外です: {tuple(actual_max)}")


def replace_box_with_ramp(obj: bpy.types.Object) -> dict[str, object]:
    if obj.type != "MESH":
        raise RuntimeError(f"Meshではありません: {COLLIDER_NAME}")
    if tuple(round(value, 6) for value in obj.rotation_euler) != (0.0, 0.0, 0.0):
        raise RuntimeError(f"北側出入口Colliderの回転が想定外です: {tuple(obj.rotation_euler)}")
    if tuple(round(value, 6) for value in obj.scale) != (1.0, 1.0, 1.0):
        raise RuntimeError(f"北側出入口Colliderのscaleが想定外です: {tuple(obj.scale)}")

    before_min, before_max = world_bounds(obj)
    assert_bounds(before_min, before_max)

    vertices = [
        (-1.5, -0.75, -0.15),
        (-1.5, -0.75, 0.15),
        (-1.5, 0.75, -0.15),
        (1.5, -0.75, -0.15),
        (1.5, -0.75, 0.15),
        (1.5, 0.75, -0.15),
    ]
    faces = [
        (0, 2, 1),
        (3, 4, 5),
        (0, 3, 5, 2),
        (0, 1, 4, 3),
        (1, 2, 5, 4),
    ]

    mesh = obj.data
    mesh.clear_geometry()
    mesh.from_pydata(vertices, [], faces)
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
        raise RuntimeError(
            "北側出入口の連続Ramp化に失敗しました: "
            f"volume={signed_volume}, degenerate={degenerate_faces}, "
            f"non_manifold={non_manifold_edges}"
        )

    slope_normal_z = max(face.normal.z for face in bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    after_min, after_max = world_bounds(obj)
    assert_bounds(after_min, after_max)

    return {
        "name": obj.name,
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "signed_volume": round(signed_volume, 6),
        "slope_normal_z": round(slope_normal_z, 6),
        "bounds_min": tuple(round(value, 6) for value in after_min),
        "bounds_max": tuple(round(value, 6) for value in after_max),
    }


def export_existing_stage() -> None:
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = [
        obj
        for obj in bpy.data.objects
        if obj.name.startswith("VIS_") or obj.name.startswith("COL_")
    ]
    if len(export_objects) != 407:
        raise RuntimeError(f"既存B02の出力Object数が407件ではありません: {len(export_objects)}")
    for obj in export_objects:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        use_visible=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
        export_yup=True,
        export_apply=False,
    )


def main() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 263:
        raise RuntimeError("既存B02のVIS Object数が263件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 144:
        raise RuntimeError("既存B02のCOL Object数が144件ではありません")

    collider = bpy.data.objects.get(COLLIDER_NAME)
    if collider is None:
        raise RuntimeError(f"北側出入口Colliderがありません: {COLLIDER_NAME}")

    audit = replace_box_with_ramp(collider)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_existing_stage()

    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "collider": audit,
            "glb": str(GLB_PATH),
        }
    )


main()
