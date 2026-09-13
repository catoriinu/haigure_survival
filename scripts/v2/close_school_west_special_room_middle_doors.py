from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
EXPORT_COLLECTION_NAME = "EXP_Stage_school"
GUIDE_COLLECTION_NAME = "B02_GUIDES"
TOLERANCE = 1e-5

DOOR_LEAF_RENAMES = (
    (
        "VIS_DoorLeaf_Classroom2_Front",
        "VIS_DoorLeaf_SpecialRoomWest_Front",
    ),
    (
        "VIS_DoorLeaf_Classroom3_Rear",
        "VIS_DoorLeaf_SpecialRoomWest_Rear",
    ),
)

LINTEL_RENAMES = (
    (
        "VIS_Wall_Lintel_ClassroomDoor_03",
        "VIS_Wall_Lintel_SpecialRoomWest_Front",
    ),
    (
        "COL_Wall_Lintel_ClassroomDoor_03",
        "COL_Wall_Lintel_SpecialRoomWest_Front",
    ),
    (
        "VIS_Wall_Lintel_ClassroomDoor_06",
        "VIS_Wall_Lintel_SpecialRoomWest_Rear",
    ),
    (
        "COL_Wall_Lintel_ClassroomDoor_06",
        "COL_Wall_Lintel_SpecialRoomWest_Rear",
    ),
)

CLOSED_WALL_RENAMES = (
    (
        "VIS_Wall_Lintel_ClassroomDoor_04",
        "VIS_Wall_SpecialRoomWest_CorridorClosed_South",
        (-3.65, 20.7, 0.0),
        (-3.35, 21.9, 3.0),
    ),
    (
        "COL_Wall_Lintel_ClassroomDoor_04",
        "COL_Wall_SpecialRoomWest_CorridorClosed_South",
        (-3.65, 20.7, 0.0),
        (-3.35, 21.9, 3.0),
    ),
    (
        "VIS_Wall_Lintel_ClassroomDoor_05",
        "VIS_Wall_SpecialRoomWest_CorridorClosed_North",
        (-3.65, 23.1, 0.0),
        (-3.35, 24.3, 3.0),
    ),
    (
        "COL_Wall_Lintel_ClassroomDoor_05",
        "COL_Wall_SpecialRoomWest_CorridorClosed_North",
        (-3.65, 23.1, 0.0),
        (-3.35, 24.3, 3.0),
    ),
)

REMOVED_DOOR_LEAVES = (
    "VIS_DoorLeaf_Classroom2_Rear",
    "VIS_DoorLeaf_Classroom3_Front",
)

EXPECTED_SOURCE_BOUNDS = {
    "VIS_DoorLeaf_Classroom2_Front": (
        (-3.71, 14.35, 0.0),
        (-3.61, 15.45, 2.3),
    ),
    "VIS_DoorLeaf_Classroom2_Rear": (
        (-3.71, 19.55, 0.0),
        (-3.61, 20.65, 2.3),
    ),
    "VIS_DoorLeaf_Classroom3_Front": (
        (-3.71, 24.35, 0.0),
        (-3.61, 25.45, 2.3),
    ),
    "VIS_DoorLeaf_Classroom3_Rear": (
        (-3.71, 29.55, 0.0),
        (-3.61, 30.65, 2.3),
    ),
    **{
        f"{prefix}_Wall_Lintel_ClassroomDoor_{index:02d}": (
            (-3.65, minimum_y, 2.3),
            (-3.35, maximum_y, 3.0),
        )
        for prefix in ("VIS", "COL")
        for index, minimum_y, maximum_y in (
            (3, 13.1, 14.3),
            (4, 20.7, 21.9),
            (5, 23.1, 24.3),
            (6, 30.7, 31.9),
        )
    },
}


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


def scene_counts() -> dict[str, int]:
    return {
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "visuals": len(
            [obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]
        ),
        "colliders": len(
            [obj for obj in bpy.data.objects if obj.name.startswith("COL_")]
        ),
        "nav": len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]),
        "guides": len(bpy.data.collections[GUIDE_COLLECTION_NAME].objects),
        "export": len(bpy.data.collections[EXPORT_COLLECTION_NAME].all_objects),
    }


def create_box_geometry(
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
) -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int, int]]]:
    min_x, min_y, min_z = minimum
    max_x, max_y, max_z = maximum
    vertices = [
        (min_x, min_y, min_z),
        (min_x, min_y, max_z),
        (min_x, max_y, min_z),
        (min_x, max_y, max_z),
        (max_x, min_y, min_z),
        (max_x, min_y, max_z),
        (max_x, max_y, min_z),
        (max_x, max_y, max_z),
    ]
    faces = [
        (0, 2, 3, 1),
        (4, 5, 7, 6),
        (0, 1, 5, 4),
        (2, 6, 7, 3),
        (0, 4, 6, 2),
        (1, 3, 7, 5),
    ]
    return vertices, faces


def replace_with_box(
    obj: bpy.types.Object,
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
) -> None:
    vertices, faces = create_box_geometry(minimum, maximum)
    obj.matrix_world = Matrix.Identity(4)
    mesh = obj.data
    mesh.clear_geometry()
    mesh.from_pydata(vertices, (), faces)
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
            f"壁Mesh生成に失敗しました: {obj.name}, volume={signed_volume}, "
            f"degenerate={degenerate_faces}, non_manifold={non_manifold_edges}"
        )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def rename_mesh_object(source_name: str, destination_name: str) -> None:
    obj = bpy.data.objects[source_name]
    obj.name = destination_name
    obj.data.name = destination_name


def remove_mesh_object(name: str) -> None:
    obj = bpy.data.objects[name]
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh.users != 0:
        raise RuntimeError(f"削除後もMeshが参照されています: {name}, users={mesh.users}")
    bpy.data.meshes.remove(mesh)


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")

    expected_counts = {
        "objects": 506,
        "meshes": 482,
        "visuals": 310,
        "colliders": 161,
        "nav": 8,
        "guides": 22,
        "export": 484,
    }
    actual_counts = scene_counts()
    if actual_counts != expected_counts:
        raise RuntimeError(
            f"北西階段構造修正後のシーン件数が想定外です: "
            f"actual={actual_counts}, expected={expected_counts}"
        )

    destination_names = {
        *(destination for _source, destination in DOOR_LEAF_RENAMES),
        *(destination for _source, destination in LINTEL_RENAMES),
        *(destination for _source, destination, _minimum, _maximum in CLOSED_WALL_RENAMES),
    }
    if any(bpy.data.objects.get(name) is not None for name in destination_names):
        raise RuntimeError("西側特別教室の更新後Object名が既に存在します")

    for name, (minimum, maximum) in EXPECTED_SOURCE_BOUNDS.items():
        assert_bounds(name, minimum, maximum)


def main() -> None:
    preflight()

    for source_name, destination_name in DOOR_LEAF_RENAMES:
        rename_mesh_object(source_name, destination_name)
    for name in REMOVED_DOOR_LEAVES:
        remove_mesh_object(name)
    for source_name, destination_name in LINTEL_RENAMES:
        rename_mesh_object(source_name, destination_name)
    for source_name, destination_name, minimum, maximum in CLOSED_WALL_RENAMES:
        obj = bpy.data.objects[source_name]
        replace_with_box(obj, minimum, maximum)
        rename_mesh_object(source_name, destination_name)

    expected_final_counts = {
        "objects": 504,
        "meshes": 480,
        "visuals": 308,
        "colliders": 161,
        "nav": 8,
        "guides": 22,
        "export": 482,
    }
    final_counts = scene_counts()
    if final_counts != expected_final_counts:
        raise RuntimeError(
            f"西側特別教室の中央扉壁化後の件数が想定外です: "
            f"actual={final_counts}, expected={expected_final_counts}"
        )

    final_bounds = {
        "VIS_DoorLeaf_SpecialRoomWest_Front": EXPECTED_SOURCE_BOUNDS[
            "VIS_DoorLeaf_Classroom2_Front"
        ],
        "VIS_DoorLeaf_SpecialRoomWest_Rear": EXPECTED_SOURCE_BOUNDS[
            "VIS_DoorLeaf_Classroom3_Rear"
        ],
        "VIS_Wall_Lintel_SpecialRoomWest_Front": EXPECTED_SOURCE_BOUNDS[
            "VIS_Wall_Lintel_ClassroomDoor_03"
        ],
        "COL_Wall_Lintel_SpecialRoomWest_Front": EXPECTED_SOURCE_BOUNDS[
            "COL_Wall_Lintel_ClassroomDoor_03"
        ],
        "VIS_Wall_Lintel_SpecialRoomWest_Rear": EXPECTED_SOURCE_BOUNDS[
            "VIS_Wall_Lintel_ClassroomDoor_06"
        ],
        "COL_Wall_Lintel_SpecialRoomWest_Rear": EXPECTED_SOURCE_BOUNDS[
            "COL_Wall_Lintel_ClassroomDoor_06"
        ],
        **{
            destination_name: (minimum, maximum)
            for _source_name, destination_name, minimum, maximum in CLOSED_WALL_RENAMES
        },
    }
    for name, (minimum, maximum) in final_bounds.items():
        assert_bounds(name, minimum, maximum)

    removed_names = {
        *REMOVED_DOOR_LEAVES,
        *(source for source, _destination in DOOR_LEAF_RENAMES),
        *(source for source, _destination in LINTEL_RENAMES),
        *(source for source, _destination, _minimum, _maximum in CLOSED_WALL_RENAMES),
    }
    if any(bpy.data.objects.get(name) is not None for name in removed_names):
        raise RuntimeError("更新前の西側特別教室Object名が残っています")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "counts": final_counts,
            "final_objects": sorted(final_bounds),
        }
    )


if __name__ == "__main__":
    main()
