from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
VIS_COLLECTION_NAME = "B02_VIS"
COL_COLLECTION_NAME = "B02_COL"
TOLERANCE = 1e-5

EXPECTED_BOUNDS = {
    "COL_EntryStep01": ((1.0, -2.5, -0.3), (2.0, 2.5, -0.15)),
    "COL_EntryStep02": ((0.0, -2.5, -0.15), (1.0, 2.5, 0.0)),
    "VIS_NorthEntryStep": ((2.4, 45.5, -0.3), (5.4, 47.0, 0.0)),
    "COL_NorthEntryStep": ((2.4, 45.5, -0.3), (5.4, 47.0, 0.0)),
    "VIS_NorthSouthEntryTataki": ((39.4, 31.0, 0.0), (43.4, 32.5, 0.05)),
    "VIS_NorthSouthEntryThreshold": ((39.4, 32.24, 0.0), (43.4, 32.4, 0.08)),
    "COL_NorthSouthEntryTataki": ((39.4, 31.0, -0.05), (43.4, 32.5, 0.0)),
    "COL_GymCourtyardEntryRamp": ((31.9, 5.0, -0.3), (33.4, 8.0, 0.0)),
}


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(vertex[index] for vertex in vertices) for index in range(3))),
        Vector(tuple(max(vertex[index] for vertex in vertices) for index in range(3))),
    )


def assert_bounds(name: str, expected_minimum, expected_maximum) -> None:
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError(f"対象Meshがありません: {name}")
    actual_minimum, actual_maximum = world_bounds(obj)
    if (actual_minimum - Vector(expected_minimum)).length > TOLERANCE:
        raise RuntimeError(
            f"{name}の最小境界が想定外です: {tuple(actual_minimum)}"
        )
    if (actual_maximum - Vector(expected_maximum)).length > TOLERANCE:
        raise RuntimeError(
            f"{name}の最大境界が想定外です: {tuple(actual_maximum)}"
        )


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len(bpy.data.objects) != 441:
        raise RuntimeError(f"既存B02のObject数が441件ではありません: {len(bpy.data.objects)}")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 261:
        raise RuntimeError("既存B02のVIS Object数が261件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 144:
        raise RuntimeError("既存B02のCOL Object数が144件ではありません")
    for name, (expected_minimum, expected_maximum) in EXPECTED_BOUNDS.items():
        assert_bounds(name, expected_minimum, expected_maximum)
    for name in (
        "COL_EntryRamp",
        "VIS_NorthEntryStep01",
        "VIS_NorthEntryStep02",
        "COL_NorthEntryRamp",
        "VIS_NorthSouthEntryStep01",
        "VIS_NorthSouthEntryStep02",
        "COL_NorthSouthEntryRamp",
        "VIS_GymCourtyardEntryStep01",
        "VIS_GymCourtyardEntryStep02",
    ):
        if bpy.data.objects.get(name) is not None:
            raise RuntimeError(f"追加予定Objectが既に存在します: {name}")


def rename_object(obj: bpy.types.Object, name: str) -> None:
    obj.name = name
    obj.data.name = name


def assign_material(obj: bpy.types.Object, material_name: str) -> None:
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"既存Materialがありません: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


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
            f"出入口Meshの生成に失敗しました: {obj.name}, volume={signed_volume}, "
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
        "volume": round(signed_volume, 6),
        "minimum": tuple(round(value, 6) for value in minimum),
        "maximum": tuple(round(value, 6) for value in maximum),
    }


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


def x_ramp_geometry(
    high_x: float,
    low_x: float,
    minimum_y: float,
    maximum_y: float,
    bottom_z: float,
    high_z: float,
):
    return (
        (
            (high_x, minimum_y, bottom_z),
            (high_x, minimum_y, high_z),
            (high_x, maximum_y, bottom_z),
            (high_x, maximum_y, high_z),
            (low_x, minimum_y, bottom_z),
            (low_x, maximum_y, bottom_z),
        ),
        ((0, 1, 3, 2), (4, 5, 3, 1), (0, 4, 1), (2, 3, 5), (0, 2, 5, 4)),
    )


def y_ramp_geometry(
    minimum_x: float,
    maximum_x: float,
    high_y: float,
    low_y: float,
    bottom_z: float,
    high_z: float,
):
    return (
        (
            (minimum_x, high_y, bottom_z),
            (minimum_x, high_y, high_z),
            (maximum_x, high_y, bottom_z),
            (maximum_x, high_y, high_z),
            (minimum_x, low_y, bottom_z),
            (maximum_x, low_y, bottom_z),
        ),
        ((0, 2, 3, 1), (4, 1, 3, 5), (0, 1, 4), (2, 5, 3), (0, 4, 5, 2)),
    )


def create_mesh_object(
    name: str,
    collection: bpy.types.Collection,
    geometry,
    material_name: str,
) -> tuple[bpy.types.Object, dict[str, object]]:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    audit = replace_world_mesh(obj, *geometry)
    assign_material(obj, material_name)
    return obj, audit


def main() -> None:
    preflight()
    visual_collection = bpy.data.collections[VIS_COLLECTION_NAME]
    collider_collection = bpy.data.collections[COL_COLLECTION_NAME]
    audit = []

    main_ramp = bpy.data.objects["COL_EntryStep01"]
    rename_object(main_ramp, "COL_EntryRamp")
    audit.append(
        replace_world_mesh(
            main_ramp,
            *x_ramp_geometry(0.0, 2.0, -2.5, 2.5, -0.3, 0.0),
        )
    )
    assign_material(main_ramp, "MAT_Collider_Magenta")
    main_ramp.display_type = "WIRE"
    obsolete_main_step = bpy.data.objects["COL_EntryStep02"]
    obsolete_main_step_mesh = obsolete_main_step.data
    bpy.data.objects.remove(obsolete_main_step, do_unlink=True)
    bpy.data.meshes.remove(obsolete_main_step_mesh)

    north_step01 = bpy.data.objects["VIS_NorthEntryStep"]
    rename_object(north_step01, "VIS_NorthEntryStep01")
    audit.append(
        replace_world_mesh(
            north_step01,
            *box_geometry((2.4, 46.5, -0.3), (5.4, 47.5, -0.15)),
        )
    )
    assign_material(north_step01, "MAT_Stair_Yellow")
    _, created_audit = create_mesh_object(
        "VIS_NorthEntryStep02",
        visual_collection,
        box_geometry((2.4, 45.5, -0.15), (5.4, 46.5, 0.0)),
        "MAT_Stair_Yellow",
    )
    audit.append(created_audit)

    north_ramp = bpy.data.objects["COL_NorthEntryStep"]
    rename_object(north_ramp, "COL_NorthEntryRamp")
    audit.append(
        replace_world_mesh(
            north_ramp,
            *y_ramp_geometry(2.4, 5.4, 45.5, 47.5, -0.3, 0.0),
        )
    )
    assign_material(north_ramp, "MAT_Collider_Magenta")
    north_ramp.display_type = "WIRE"

    bridge_step01 = bpy.data.objects["VIS_NorthSouthEntryTataki"]
    rename_object(bridge_step01, "VIS_NorthSouthEntryStep01")
    audit.append(
        replace_world_mesh(
            bridge_step01,
            *box_geometry((37.4, 26.5, -0.3), (38.4, 32.5, -0.15)),
        )
    )
    assign_material(bridge_step01, "MAT_Stair_Yellow")

    bridge_step02 = bpy.data.objects["VIS_NorthSouthEntryThreshold"]
    rename_object(bridge_step02, "VIS_NorthSouthEntryStep02")
    audit.append(
        replace_world_mesh(
            bridge_step02,
            *box_geometry((38.4, 26.5, -0.15), (39.4, 32.5, 0.0)),
        )
    )
    assign_material(bridge_step02, "MAT_Stair_Yellow")

    bridge_ramp = bpy.data.objects["COL_NorthSouthEntryTataki"]
    rename_object(bridge_ramp, "COL_NorthSouthEntryRamp")
    audit.append(
        replace_world_mesh(
            bridge_ramp,
            *x_ramp_geometry(39.4, 37.4, 26.5, 32.5, -0.3, 0.0),
        )
    )
    assign_material(bridge_ramp, "MAT_Collider_Magenta")
    bridge_ramp.display_type = "WIRE"

    gym_ramp = bpy.data.objects["COL_GymCourtyardEntryRamp"]
    audit.append(
        replace_world_mesh(
            gym_ramp,
            *x_ramp_geometry(33.4, 31.4, 5.0, 8.0, -0.3, 0.0),
        )
    )
    assign_material(gym_ramp, "MAT_Collider_Magenta")
    gym_ramp.display_type = "WIRE"
    for name, minimum, maximum in (
        (
            "VIS_GymCourtyardEntryStep01",
            (31.4, 5.0, -0.3),
            (32.4, 8.0, -0.15),
        ),
        (
            "VIS_GymCourtyardEntryStep02",
            (32.4, 5.0, -0.15),
            (33.4, 8.0, 0.0),
        ),
    ):
        _, created_audit = create_mesh_object(
            name,
            visual_collection,
            box_geometry(minimum, maximum),
            "MAT_Stair_Yellow",
        )
        audit.append(created_audit)

    if len(bpy.data.objects) != 443:
        raise RuntimeError(f"出入口修正後のObject数が443件ではありません: {len(bpy.data.objects)}")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 264:
        raise RuntimeError("出入口修正後のVIS Object数が264件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 143:
        raise RuntimeError("出入口修正後のCOL Object数が143件ではありません")
    if collider_collection.objects.get("COL_EntryRamp") is None:
        raise RuntimeError("主玄関RampがB02_COLにありません")
    if collider_collection.objects.get("COL_NorthEntryRamp") is None:
        raise RuntimeError("北側出入口RampがB02_COLにありません")
    if collider_collection.objects.get("COL_NorthSouthEntryRamp") is None:
        raise RuntimeError("渡り廊下側面RampがB02_COLにありません")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "visuals": len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]),
            "colliders": len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]),
            "entries": audit,
        }
    )


main()
