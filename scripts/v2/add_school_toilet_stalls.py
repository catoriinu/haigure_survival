from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
VIS_COLLECTION_NAME = "B02_VIS"
COL_COLLECTION_NAME = "B02_COL"
TOLERANCE = 1e-5

PARTITIONS = (
    ("M_01", -5.05),
    ("M_02", -3.65),
    ("F_01", -0.55),
    ("F_02", 0.85),
)
STALL_DOORS = (
    ("M_01", -5.05),
    ("M_02", -3.65),
    ("M_03", -2.25),
    ("F_01", -0.55),
    ("F_02", 0.85),
    ("F_03", 2.25),
)


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(vertex[index] for vertex in vertices) for index in range(3))),
        Vector(tuple(max(vertex[index] for vertex in vertices) for index in range(3))),
    )


def assert_bounds(
    obj: bpy.types.Object,
    expected_minimum: tuple[float, float, float],
    expected_maximum: tuple[float, float, float],
) -> None:
    actual_minimum, actual_maximum = world_bounds(obj)
    if (actual_minimum - Vector(expected_minimum)).length > TOLERANCE:
        raise RuntimeError(
            f"{obj.name}の最小境界が想定外です: {tuple(actual_minimum)}"
        )
    if (actual_maximum - Vector(expected_maximum)).length > TOLERANCE:
        raise RuntimeError(
            f"{obj.name}の最大境界が想定外です: {tuple(actual_maximum)}"
        )


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len(bpy.data.objects) != 443:
        raise RuntimeError(
            f"出入口修正後のObject数が443件ではありません: {len(bpy.data.objects)}"
        )
    if len(bpy.data.meshes) != 418:
        raise RuntimeError(
            f"出入口修正後のMesh数が418件ではありません: {len(bpy.data.meshes)}"
        )
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 264:
        raise RuntimeError("出入口修正後のVIS Object数が264件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 143:
        raise RuntimeError("出入口修正後のCOL Object数が143件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]) != 8:
        raise RuntimeError("出入口修正後のNAV Object数が8件ではありません")
    assert_bounds(
        bpy.data.objects["COL_EntryRamp"],
        (0.0, -2.5, -0.3),
        (2.0, 2.5, 0.0),
    )
    expected_names = {
        *(f"VIS_ToiletStallPartition_{suffix}" for suffix, _ in PARTITIONS),
        *(f"COL_ToiletStallPartition_{suffix}" for suffix, _ in PARTITIONS),
        *(f"VIS_ToiletStallDoor_Open_{suffix}" for suffix, _ in STALL_DOORS),
    }
    existing_names = expected_names.intersection(bpy.data.objects.keys())
    if existing_names:
        raise RuntimeError(
            f"追加予定のトイレObjectが既に存在します: {sorted(existing_names)}"
        )


def box_geometry(
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
) -> tuple[tuple[tuple[float, float, float], ...], tuple[tuple[int, ...], ...]]:
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


def create_box(
    name: str,
    collection: bpy.types.Collection,
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
    material_name: str,
    display_type: str,
) -> dict[str, object]:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.matrix_world = Matrix.Identity(4)
    vertices, faces = box_geometry(minimum, maximum)
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
            f"トイレMeshの生成に失敗しました: {name}, volume={signed_volume}, "
            f"degenerate={degenerate_faces}, non_manifold={non_manifold_edges}"
        )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"既存Materialがありません: {material_name}")
    mesh.materials.append(material)
    obj.display_type = display_type
    assert_bounds(obj, minimum, maximum)
    return {
        "name": name,
        "minimum": minimum,
        "maximum": maximum,
        "volume": round(signed_volume, 6),
    }


def main() -> None:
    preflight()
    visual_collection = bpy.data.collections[VIS_COLLECTION_NAME]
    collider_collection = bpy.data.collections[COL_COLLECTION_NAME]
    audit = []

    for suffix, center_x in PARTITIONS:
        minimum = (center_x - 0.04, 43.25, 0.0)
        maximum = (center_x + 0.04, 45.35, 2.1)
        audit.append(
            create_box(
                f"VIS_ToiletStallPartition_{suffix}",
                visual_collection,
                minimum,
                maximum,
                "MAT_Wall_White",
                "TEXTURED",
            )
        )
        audit.append(
            create_box(
                f"COL_ToiletStallPartition_{suffix}",
                collider_collection,
                minimum,
                maximum,
                "MAT_Collider_Magenta",
                "WIRE",
            )
        )

    for suffix, right_x in STALL_DOORS:
        audit.append(
            create_box(
                f"VIS_ToiletStallDoor_Open_{suffix}",
                visual_collection,
                (right_x - 0.08, 43.25, 0.0),
                (right_x - 0.04, 44.15, 1.8),
                "MAT_Door_Blue",
                "TEXTURED",
            )
        )

    if len(bpy.data.objects) != 457:
        raise RuntimeError(
            f"トイレ個室追加後のObject数が457件ではありません: {len(bpy.data.objects)}"
        )
    if len(bpy.data.meshes) != 432:
        raise RuntimeError(
            f"トイレ個室追加後のMesh数が432件ではありません: {len(bpy.data.meshes)}"
        )
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 274:
        raise RuntimeError("トイレ個室追加後のVIS Object数が274件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 147:
        raise RuntimeError("トイレ個室追加後のCOL Object数が147件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]) != 8:
        raise RuntimeError("トイレ個室追加後のNAV Object数が8件ではありません")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "meshes": len(bpy.data.meshes),
            "visuals": 274,
            "colliders": 147,
            "reserved_male_urinals": {
                "fixture_band": ((-2.55, 39.0), (-2.25, 42.2)),
                "standing_clear": ((-3.55, 39.0), (-2.55, 42.2)),
                "centers_y": (39.6, 40.6, 41.6),
            },
            "stalls": audit,
        }
    )


main()
