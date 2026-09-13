from pathlib import Path

import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
EXPORT_COLLECTION_NAME = "EXP_Stage_school"
BOUNDARY_NAME = "BND_Stage"
TOLERANCE = 1e-5
EXPECTED_MINIMUM = Vector((-18.4, -12.3, -0.5))
EXPECTED_MAXIMUM = Vector((63.2, 51.3, 3.5))
UPDATED_MAXIMUM_Z = 4.6


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    return minimum, maximum


def assert_vector(label: str, actual: Vector, expected: Vector) -> None:
    if any(abs(actual[axis] - expected[axis]) > TOLERANCE for axis in range(3)):
        raise RuntimeError(f"{label}が想定外です: actual={tuple(actual)}, expected={tuple(expected)}")


def preflight() -> tuple[bpy.types.Object, bpy.types.Collection]:
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len(bpy.data.objects) != 441 or len(bpy.data.meshes) != 416:
        raise RuntimeError(
            "学校シーン件数が想定外です: "
            f"objects={len(bpy.data.objects)}, meshes={len(bpy.data.meshes)}"
        )

    boundary = bpy.data.objects.get(BOUNDARY_NAME)
    if boundary is None or boundary.type != "MESH":
        raise RuntimeError(f"{BOUNDARY_NAME}がMeshとして存在しません")
    if tuple(round(value, 8) for value in boundary.location) != (0.0, 0.0, 0.0):
        raise RuntimeError(f"{BOUNDARY_NAME}のlocationが0ではありません")
    if tuple(round(value, 8) for value in boundary.rotation_euler) != (0.0, 0.0, 0.0):
        raise RuntimeError(f"{BOUNDARY_NAME}のrotationが0ではありません")
    if tuple(round(value, 8) for value in boundary.scale) != (1.0, 1.0, 1.0):
        raise RuntimeError(f"{BOUNDARY_NAME}のscaleが1ではありません")
    minimum, maximum = world_bounds(boundary)
    assert_vector(f"{BOUNDARY_NAME}の下限", minimum, EXPECTED_MINIMUM)
    assert_vector(f"{BOUNDARY_NAME}の上限", maximum, EXPECTED_MAXIMUM)

    export_collection = bpy.data.collections.get(EXPORT_COLLECTION_NAME)
    if export_collection is None:
        raise RuntimeError(f"{EXPORT_COLLECTION_NAME}が存在しません")
    if len(export_collection.all_objects) != 418:
        raise RuntimeError(
            f"学校の契約Object数が418件ではありません: {len(export_collection.all_objects)}"
        )
    if boundary.name not in export_collection.all_objects:
        raise RuntimeError(f"{BOUNDARY_NAME}がExport Collectionに含まれていません")
    return boundary, export_collection


def export_stage(export_collection: bpy.types.Collection) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_collection.all_objects:
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
    boundary, export_collection = preflight()
    updated_vertices = 0
    for vertex in boundary.data.vertices:
        if abs(vertex.co.z - EXPECTED_MAXIMUM.z) <= TOLERANCE:
            vertex.co.z = UPDATED_MAXIMUM_Z
            updated_vertices += 1
    if updated_vertices != 4:
        raise RuntimeError(f"境界上面の更新頂点数が4件ではありません: {updated_vertices}")
    boundary.data.update()
    bpy.context.view_layer.update()

    minimum, maximum = world_bounds(boundary)
    assert_vector(f"{BOUNDARY_NAME}の更新後下限", minimum, EXPECTED_MINIMUM)
    assert_vector(
        f"{BOUNDARY_NAME}の更新後上限",
        maximum,
        Vector((EXPECTED_MAXIMUM.x, EXPECTED_MAXIMUM.y, UPDATED_MAXIMUM_Z)),
    )

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_stage(export_collection)
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "meshes": len(bpy.data.meshes),
            "updated_vertices": updated_vertices,
            "boundary_minimum": tuple(round(value, 6) for value in minimum),
            "boundary_maximum": tuple(round(value, 6) for value in maximum),
            "glb": str(GLB_PATH),
        }
    )


main()
