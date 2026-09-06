from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
VIS_COLLECTION_NAME = "B02_VIS"
COL_COLLECTION_NAME = "B02_COL"
TOLERANCE = 1e-5

EXISTING_BOUNDS = {
    "VIS_NorthSouthEntryStep01": ((37.4, 26.5, -0.3), (38.4, 32.5, -0.15)),
    "VIS_NorthSouthEntryStep02": ((38.4, 26.5, -0.15), (39.4, 32.5, 0.0)),
    "COL_NorthSouthEntryRamp": ((37.4, 26.5, -0.3), (39.4, 32.5, 0.0)),
    "COL_Floor_Bridge": ((39.4, 26.5, -0.2), (43.4, 32.5, 0.0)),
    "COL_Floor_NorthWing": ((-12.6, 32.5, -0.2), (47.4, 45.5, 0.0)),
}

NEW_OBJECT_NAMES = (
    "VIS_NorthWingSouthEntryStep01",
    "VIS_NorthWingSouthEntryStep02",
    "COL_NorthWingSouthEntryRamp",
    "VIS_NorthWingSouthEntryDoor_Open_L",
    "VIS_NorthWingSouthEntryDoor_Open_R",
    "VIS_Wall_Lintel_NorthWingSouthEntry",
    "COL_Wall_Lintel_NorthWingSouthEntry",
    "COL_BridgeSideRamp_West",
    "COL_BridgeSideRamp_East",
)


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
    if len(bpy.data.objects) != 457:
        raise RuntimeError(f"既存B02のObject数が457件ではありません: {len(bpy.data.objects)}")
    if len(bpy.data.meshes) != 432:
        raise RuntimeError(f"既存B02のMesh数が432件ではありません: {len(bpy.data.meshes)}")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 274:
        raise RuntimeError("既存B02のVIS Object数が274件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 147:
        raise RuntimeError("既存B02のCOL Object数が147件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]) != 8:
        raise RuntimeError("既存B02のNAV Object数が8件ではありません")
    for name, (minimum, maximum) in EXISTING_BOUNDS.items():
        assert_bounds(name, minimum, maximum)
    conflicts = sorted(name for name in NEW_OBJECT_NAMES if bpy.data.objects.get(name) is not None)
    if conflicts:
        raise RuntimeError(f"追加予定Objectが既に存在します: {conflicts}")


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
    display_type: str,
) -> tuple[bpy.types.Object, dict[str, object]]:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    audit = replace_world_mesh(obj, *geometry)
    assign_material(obj, material_name)
    obj.display_type = display_type
    return obj, audit


def main() -> None:
    preflight()
    visual_collection = bpy.data.collections[VIS_COLLECTION_NAME]
    collider_collection = bpy.data.collections[COL_COLLECTION_NAME]
    audit = []

    lower_step = bpy.data.objects["VIS_NorthSouthEntryStep01"]
    rename_object(lower_step, "VIS_NorthWingSouthEntryStep01")
    audit.append(
        replace_world_mesh(
            lower_step,
            *box_geometry((0.15, 30.5, -0.3), (5.4, 31.5, -0.15)),
        )
    )
    assign_material(lower_step, "MAT_Stair_Yellow")

    upper_step = bpy.data.objects["VIS_NorthSouthEntryStep02"]
    rename_object(upper_step, "VIS_NorthWingSouthEntryStep02")
    audit.append(
        replace_world_mesh(
            upper_step,
            *box_geometry((0.15, 31.5, -0.15), (5.4, 32.5, 0.0)),
        )
    )
    assign_material(upper_step, "MAT_Stair_Yellow")

    west_ramp = bpy.data.objects["COL_NorthSouthEntryRamp"]
    rename_object(west_ramp, "COL_BridgeSideRamp_West")
    audit.append(
        replace_world_mesh(
            west_ramp,
            *x_ramp_geometry(39.4, 37.4, 26.5, 32.5, -0.3, 0.0),
        )
    )
    assign_material(west_ramp, "MAT_Collider_Magenta")
    west_ramp.display_type = "WIRE"

    _, created_audit = create_mesh_object(
        "COL_BridgeSideRamp_East",
        collider_collection,
        x_ramp_geometry(43.4, 45.4, 26.5, 32.5, -0.3, 0.0),
        "MAT_Collider_Magenta",
        "WIRE",
    )
    audit.append(created_audit)

    _, created_audit = create_mesh_object(
        "COL_NorthWingSouthEntryRamp",
        collider_collection,
        y_ramp_geometry(0.15, 5.4, 32.5, 30.5, -0.3, 0.0),
        "MAT_Collider_Magenta",
        "WIRE",
    )
    audit.append(created_audit)

    for name, minimum, maximum in (
        (
            "VIS_NorthWingSouthEntryDoor_Open_L",
            (-1.55, 32.3, 0.0),
            (0.05, 32.38, 2.4),
        ),
        (
            "VIS_NorthWingSouthEntryDoor_Open_R",
            (5.5, 32.3, 0.0),
            (7.1, 32.38, 2.4),
        ),
    ):
        _, created_audit = create_mesh_object(
            name,
            visual_collection,
            box_geometry(minimum, maximum),
            "MAT_Door_Blue",
            "TEXTURED",
        )
        audit.append(created_audit)

    _, created_audit = create_mesh_object(
        "VIS_Wall_Lintel_NorthWingSouthEntry",
        visual_collection,
        box_geometry((0.15, 32.35, 2.4), (5.4, 32.65, 3.0)),
        "MAT_Wall_White",
        "TEXTURED",
    )
    audit.append(created_audit)
    _, created_audit = create_mesh_object(
        "COL_Wall_Lintel_NorthWingSouthEntry",
        collider_collection,
        box_geometry((0.15, 32.35, 2.4), (5.4, 32.65, 3.0)),
        "MAT_Collider_Magenta",
        "WIRE",
    )
    audit.append(created_audit)

    if len(bpy.data.objects) != 463:
        raise RuntimeError(f"修正後のObject数が463件ではありません: {len(bpy.data.objects)}")
    if len(bpy.data.meshes) != 438:
        raise RuntimeError(f"修正後のMesh数が438件ではありません: {len(bpy.data.meshes)}")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 277:
        raise RuntimeError("修正後のVIS Object数が277件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 150:
        raise RuntimeError("修正後のCOL Object数が150件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]) != 8:
        raise RuntimeError("修正後のNAV Object数が8件ではありません")

    for name, minimum, maximum in (
        ("VIS_NorthWingSouthEntryStep01", (0.15, 30.5, -0.3), (5.4, 31.5, -0.15)),
        ("VIS_NorthWingSouthEntryStep02", (0.15, 31.5, -0.15), (5.4, 32.5, 0.0)),
        ("COL_NorthWingSouthEntryRamp", (0.15, 30.5, -0.3), (5.4, 32.5, 0.0)),
        ("COL_BridgeSideRamp_West", (37.4, 26.5, -0.3), (39.4, 32.5, 0.0)),
        ("COL_BridgeSideRamp_East", (43.4, 26.5, -0.3), (45.4, 32.5, 0.0)),
        ("VIS_NorthWingSouthEntryDoor_Open_L", (-1.55, 32.3, 0.0), (0.05, 32.38, 2.4)),
        ("VIS_NorthWingSouthEntryDoor_Open_R", (5.5, 32.3, 0.0), (7.1, 32.38, 2.4)),
        ("VIS_Wall_Lintel_NorthWingSouthEntry", (0.15, 32.35, 2.4), (5.4, 32.65, 3.0)),
        ("COL_Wall_Lintel_NorthWingSouthEntry", (0.15, 32.35, 2.4), (5.4, 32.65, 3.0)),
    ):
        assert_bounds(name, minimum, maximum)

    if bpy.data.objects.get("VIS_NorthSouthEntryStep01") is not None:
        raise RuntimeError("渡り廊下西側に旧表示段01が残っています")
    if bpy.data.objects.get("VIS_NorthSouthEntryStep02") is not None:
        raise RuntimeError("渡り廊下西側に旧表示段02が残っています")
    if bpy.data.objects.get("COL_NorthSouthEntryRamp") is not None:
        raise RuntimeError("用途が曖昧な旧Ramp名が残っています")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "meshes": len(bpy.data.meshes),
            "visuals": 277,
            "colliders": 150,
            "audit": audit,
        }
    )


main()
