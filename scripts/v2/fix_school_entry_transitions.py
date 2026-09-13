from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
TOLERANCE = 1e-5

EXPECTED_BOUNDS = {
    "COL_EntryStep01": (
        Vector((1.0, -2.5, -0.3)),
        Vector((2.0, 2.5, -0.15)),
    ),
    "COL_EntryStep02": (
        Vector((0.0, -2.5, -0.15)),
        Vector((1.0, 2.5, 0.0)),
    ),
    "COL_NorthSouthEntryTataki": (
        Vector((39.4, 31.0, 0.0)),
        Vector((43.4, 32.5, 0.05)),
    ),
    "COL_NorthSouthEntryThreshold": (
        Vector((39.4, 32.24, 0.0)),
        Vector((43.4, 32.4, 0.08)),
    ),
}


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(vertex[index] for vertex in vertices) for index in range(3))),
        Vector(tuple(max(vertex[index] for vertex in vertices) for index in range(3))),
    )


def assert_vector(label: str, actual: Vector, expected: Vector) -> None:
    if (actual - expected).length > TOLERANCE:
        raise RuntimeError(
            f"{label}が想定外です: actual={tuple(actual)}, expected={tuple(expected)}"
        )


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 263:
        raise RuntimeError("既存B02のVIS Object数が263件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 144:
        raise RuntimeError("既存B02のCOL Object数が144件ではありません")

    for name, (expected_minimum, expected_maximum) in EXPECTED_BOUNDS.items():
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            raise RuntimeError(f"対象Meshがありません: {name}")
        actual_minimum, actual_maximum = world_bounds(obj)
        assert_vector(f"{name}の修正前最小境界", actual_minimum, expected_minimum)
        assert_vector(f"{name}の修正前最大境界", actual_maximum, expected_maximum)


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
            f"出入口Colliderの生成に失敗しました: {obj.name}, "
            f"volume={signed_volume}, degenerate={degenerate_faces}, "
            f"non_manifold={non_manifold_edges}"
        )
    slope_normal_z = max(face.normal.z for face in bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    minimum, maximum = world_bounds(obj)
    return {
        "name": obj.name,
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "signed_volume": round(signed_volume, 6),
        "slope_normal_z": round(slope_normal_z, 6),
        "bounds_min": tuple(round(value, 6) for value in minimum),
        "bounds_max": tuple(round(value, 6) for value in maximum),
    }


def create_x_ramp(
    obj: bpy.types.Object,
    high_x: float,
    low_x: float,
    minimum_y: float,
    maximum_y: float,
    bottom_z: float,
    high_z: float,
) -> dict[str, object]:
    vertices = (
        (high_x, minimum_y, bottom_z),
        (high_x, minimum_y, high_z),
        (high_x, maximum_y, bottom_z),
        (high_x, maximum_y, high_z),
        (low_x, minimum_y, bottom_z),
        (low_x, maximum_y, bottom_z),
    )
    faces = (
        (0, 1, 3, 2),
        (4, 5, 3, 1),
        (0, 4, 1),
        (2, 3, 5),
        (0, 2, 5, 4),
    )
    return replace_world_mesh(obj, vertices, faces)


def create_box(
    obj: bpy.types.Object,
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
) -> dict[str, object]:
    min_x, min_y, min_z = minimum
    max_x, max_y, max_z = maximum
    vertices = (
        (min_x, min_y, min_z),
        (min_x, min_y, max_z),
        (min_x, max_y, min_z),
        (min_x, max_y, max_z),
        (max_x, min_y, min_z),
        (max_x, min_y, max_z),
        (max_x, max_y, min_z),
        (max_x, max_y, max_z),
    )
    faces = (
        (0, 2, 3, 1),
        (4, 5, 7, 6),
        (0, 1, 5, 4),
        (2, 6, 7, 3),
        (0, 4, 6, 2),
        (1, 3, 7, 5),
    )
    return replace_world_mesh(obj, vertices, faces)


def main() -> None:
    preflight()

    audit = [
        create_x_ramp(
            bpy.data.objects["COL_EntryStep01"],
            high_x=1.0,
            low_x=2.0,
            minimum_y=-2.5,
            maximum_y=2.5,
            bottom_z=-0.3,
            high_z=-0.15,
        ),
        create_x_ramp(
            bpy.data.objects["COL_EntryStep02"],
            high_x=0.0,
            low_x=1.0,
            minimum_y=-2.5,
            maximum_y=2.5,
            bottom_z=-0.15,
            high_z=0.0,
        ),
        create_box(
            bpy.data.objects["COL_NorthSouthEntryTataki"],
            (39.4, 31.0, -0.05),
            (43.4, 32.5, 0.0),
        ),
    ]

    gym_ramp = bpy.data.objects["COL_NorthSouthEntryThreshold"]
    gym_ramp.name = "COL_GymCourtyardEntryRamp"
    gym_ramp.data.name = gym_ramp.name
    audit.append(
        create_x_ramp(
            gym_ramp,
            high_x=33.4,
            low_x=31.9,
            minimum_y=5.0,
            maximum_y=8.0,
            bottom_z=-0.3,
            high_z=0.0,
        )
    )

    if bpy.data.objects.get("COL_NorthSouthEntryThreshold") is not None:
        raise RuntimeError("旧渡り廊下Threshold Colliderが残っています")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 144:
        raise RuntimeError("出入口修正後のCOL Object数が144件ではありません")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "transitions": audit,
        }
    )


main()
