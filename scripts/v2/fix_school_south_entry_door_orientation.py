from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
DOOR_NAME = "VIS_NorthWingSouthEntryDoor_Open_L"
RIGHT_DOOR_NAME = "VIS_NorthWingSouthEntryDoor_Open_R"
TOLERANCE = 1e-5

CURRENT_DOOR_BOUNDS = ((-1.55, 32.3, 0.0), (0.05, 32.38, 2.4))
RIGHT_DOOR_BOUNDS = ((5.5, 32.3, 0.0), (7.1, 32.38, 2.4))
ROTATED_DOOR_BOUNDS = ((0.16, 30.74, 0.0), (0.24, 32.34, 2.4))


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(vertex[index] for vertex in vertices) for index in range(3))),
        Vector(tuple(max(vertex[index] for vertex in vertices) for index in range(3))),
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
        raise RuntimeError(f"{name}の最小境界が想定外です: {tuple(actual_minimum)}")
    if (actual_maximum - Vector(expected_maximum)).length > TOLERANCE:
        raise RuntimeError(f"{name}の最大境界が想定外です: {tuple(actual_maximum)}")


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len(bpy.data.objects) != 463 or len(bpy.data.meshes) != 438:
        raise RuntimeError(
            "既存B02のシーン件数が想定外です: "
            f"objects={len(bpy.data.objects)}, meshes={len(bpy.data.meshes)}"
        )
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 277:
        raise RuntimeError("既存B02のVIS Object数が277件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 150:
        raise RuntimeError("既存B02のCOL Object数が150件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]) != 8:
        raise RuntimeError("既存B02のNAV Object数が8件ではありません")
    assert_bounds(DOOR_NAME, *CURRENT_DOOR_BOUNDS)
    assert_bounds(RIGHT_DOOR_NAME, *RIGHT_DOOR_BOUNDS)


def box_geometry(minimum, maximum):
    min_x, min_y, min_z = minimum
    max_x, max_y, max_z = maximum
    return (
        (
            (min_x, min_y, min_z),
            (min_x, min_y, max_z),
            (min_x, max_y, min_z),
            (min_x, max_y, max_z),
            (max_x, min_y, min_z),
            (max_x, min_y, max_z),
            (max_x, max_y, min_z),
            (max_x, max_y, max_z),
        ),
        (
            (0, 2, 3, 1),
            (4, 5, 7, 6),
            (0, 1, 5, 4),
            (2, 6, 7, 3),
            (0, 4, 6, 2),
            (1, 3, 7, 5),
        ),
    )


def replace_world_mesh(
    obj: bpy.types.Object,
    vertices: tuple[tuple[float, float, float], ...],
    faces: tuple[tuple[int, ...], ...],
) -> dict[str, object]:
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
            f"扉Meshの生成に失敗しました: volume={signed_volume}, "
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


def main() -> None:
    preflight()
    door = bpy.data.objects[DOOR_NAME]
    audit = replace_world_mesh(door, *box_geometry(*ROTATED_DOOR_BOUNDS))

    assert_bounds(DOOR_NAME, *ROTATED_DOOR_BOUNDS)
    assert_bounds(RIGHT_DOOR_NAME, *RIGHT_DOOR_BOUNDS)
    if len(bpy.data.objects) != 463 or len(bpy.data.meshes) != 438:
        raise RuntimeError("扉修正でObjectまたはMesh件数が変化しました")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "meshes": len(bpy.data.meshes),
            "audit": audit,
        }
    )


main()
