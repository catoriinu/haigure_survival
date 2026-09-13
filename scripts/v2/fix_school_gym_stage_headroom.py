from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"

TARGET_BOUNDS = {
    "VIS_GymStageStairHeadWall_East": (
        Vector((51.25, -9.0, 2.4)),
        Vector((51.55, -4.0, 9.0)),
    ),
    "VIS_GymStageStairHeadWall_West": (
        Vector((39.25, -9.0, 2.4)),
        Vector((39.55, -4.0, 9.0)),
    ),
    "COL_GymStageStairHeadWall_East": (
        Vector((51.25, -9.0, 2.4)),
        Vector((51.55, -4.0, 9.0)),
    ),
    "COL_GymStageStairHeadWall_West": (
        Vector((39.25, -9.0, 2.4)),
        Vector((39.55, -4.0, 9.0)),
    ),
}

TARGET_LOWER_Z = 3.4
TOLERANCE = 1e-5


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(vertex[index] for vertex in vertices) for index in range(3))),
        Vector(tuple(max(vertex[index] for vertex in vertices) for index in range(3))),
    )


def assert_vector(label: str, actual: Vector, expected: Vector) -> None:
    if (actual - expected).length > TOLERANCE:
        raise RuntimeError(f"{label}が想定外です: actual={tuple(actual)}, expected={tuple(expected)}")


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 263:
        raise RuntimeError("既存B02のVIS Object数が263件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 144:
        raise RuntimeError("既存B02のCOL Object数が144件ではありません")

    for name, (expected_min, expected_max) in TARGET_BOUNDS.items():
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            raise RuntimeError(f"対象Meshがありません: {name}")
        if len(obj.data.vertices) != 8 or len(obj.data.polygons) != 6:
            raise RuntimeError(f"対象が直方体Meshではありません: {name}")
        if tuple(round(value, 6) for value in obj.rotation_euler) != (0.0, 0.0, 0.0):
            raise RuntimeError(f"対象の回転が想定外です: {name}")
        if tuple(round(value, 6) for value in obj.scale) != (1.0, 1.0, 1.0):
            raise RuntimeError(f"対象のscaleが想定外です: {name}")
        actual_min, actual_max = world_bounds(obj)
        assert_vector(f"{name}の修正前最小境界", actual_min, expected_min)
        assert_vector(f"{name}の修正前最大境界", actual_max, expected_max)


def raise_lower_edge(obj: bpy.types.Object) -> dict[str, object]:
    inverse_world = obj.matrix_world.inverted()
    for vertex in obj.data.vertices:
        world_position = obj.matrix_world @ vertex.co
        if abs(world_position.z - 2.4) <= TOLERANCE:
            world_position.z = TARGET_LOWER_Z
            vertex.co = inverse_world @ world_position
    obj.data.update()

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    signed_volume = bm.calc_volume(signed=True)
    degenerate_faces = sum(1 for face in bm.faces if face.calc_area() < 1e-9)
    non_manifold_edges = sum(1 for edge in bm.edges if not edge.is_manifold)
    if signed_volume <= 0 or degenerate_faces != 0 or non_manifold_edges != 0:
        bm.free()
        raise RuntimeError(
            f"舞台階段上部壁の開口高修正に失敗しました: {obj.name}, "
            f"volume={signed_volume}, degenerate={degenerate_faces}, "
            f"non_manifold={non_manifold_edges}"
        )
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.name = obj.name
    obj.data.update()

    actual_min, actual_max = world_bounds(obj)
    expected_min, expected_max = TARGET_BOUNDS[obj.name]
    expected_min = expected_min.copy()
    expected_min.z = TARGET_LOWER_Z
    assert_vector(f"{obj.name}の修正後最小境界", actual_min, expected_min)
    assert_vector(f"{obj.name}の修正後最大境界", actual_max, expected_max)

    return {
        "name": obj.name,
        "bounds_min": tuple(round(value, 6) for value in actual_min),
        "bounds_max": tuple(round(value, 6) for value in actual_max),
        "signed_volume": round(signed_volume, 6),
    }


def main() -> None:
    preflight()
    audit = [raise_lower_edge(bpy.data.objects[name]) for name in sorted(TARGET_BOUNDS)]

    for side in ("East", "West"):
        visual_min, visual_max = world_bounds(
            bpy.data.objects[f"VIS_GymStageStairHeadWall_{side}"]
        )
        collision_min, collision_max = world_bounds(
            bpy.data.objects[f"COL_GymStageStairHeadWall_{side}"]
        )
        assert_vector(f"{side}側VIS/COL最小境界", visual_min, collision_min)
        assert_vector(f"{side}側VIS/COL最大境界", visual_max, collision_max)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "headroom": audit,
        }
    )


main()
