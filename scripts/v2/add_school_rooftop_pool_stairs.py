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

STAIR_WIDTH = (37.8, 40.2)
ROOF_SURFACE_Z = 12.7
POOL_DECK_SURFACE_Z = 13.85
POOL_BASIN_SURFACE_Z = 12.86

NEW_OBJECT_NAMES = (
    "VIS_PoolDeckAccessStairs_West",
    "COL_PoolDeckAccessRamp_West",
    "VIS_PoolBasinStairs_West",
    "VIS_PoolBasinStairs_East",
    "COL_PoolBasinRamp_East",
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


def append_profile_prism(vertices, faces, width, profile) -> None:
    offset = len(vertices)
    for y_value in width:
        for x_value, z_value in profile:
            vertices.append((x_value, y_value, z_value))

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


def replace_boxes(obj: bpy.types.Object, boxes) -> dict[str, object]:
    vertices = []
    faces = []
    for minimum, maximum in boxes:
        append_box(vertices, faces, minimum, maximum)
    return audit_and_store_mesh(obj, vertices, faces)


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


def create_roof_to_deck_visual() -> tuple[list, list]:
    vertices = []
    faces = []
    step_count = 8
    start_x = 10.0
    end_x = 12.4
    tread = (end_x - start_x) / step_count
    rise = (POOL_DECK_SURFACE_Z - ROOF_SURFACE_Z) / step_count
    for index in range(step_count):
        x0 = start_x + tread * index
        x1 = start_x + tread * (index + 1)
        top = ROOF_SURFACE_Z + rise * (index + 1)
        append_box(
            vertices,
            faces,
            (x0, STAIR_WIDTH[0], ROOF_SURFACE_Z - 0.05),
            (x1, STAIR_WIDTH[1], top),
        )
    return vertices, faces


def create_basin_visual(start_x: float, end_x: float) -> tuple[list, list]:
    vertices = []
    faces = []
    step_count = 7
    tread = (end_x - start_x) / step_count
    rise = (POOL_DECK_SURFACE_Z - POOL_BASIN_SURFACE_Z) / step_count
    for index in range(step_count):
        x0 = start_x + tread * index
        x1 = start_x + tread * (index + 1)
        top = POOL_BASIN_SURFACE_Z + rise * (index + 1)
        append_box(
            vertices,
            faces,
            (min(x0, x1), STAIR_WIDTH[0], POOL_BASIN_SURFACE_Z - 0.05),
            (max(x0, x1), STAIR_WIDTH[1], top),
        )
    return vertices, faces


def create_west_basin_visual() -> tuple[list, list]:
    vertices, faces = create_basin_visual(16.5, 14.4)
    return vertices, faces


def create_east_basin_visual() -> tuple[list, list]:
    return create_basin_visual(32.3, 34.4)


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    expected_counts = {
        "objects": 499,
        "meshes": 475,
        "visuals": 306,
        "colliders": 158,
        "nav": 8,
        "guides": 22,
        "export": 477,
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
            f"4階化後のシーン件数が想定外です: actual={actual_counts}, expected={expected_counts}"
        )
    if any(bpy.data.objects.get(name) is not None for name in NEW_OBJECT_NAMES):
        raise RuntimeError("プール階段Objectが既に存在します")

    expected_bounds = {
        "VIS_RooftopFacilityRoofs": ((-12.6, 38.5, 15.1), (2.4, 45.5, 15.2)),
        "VIS_PoolWaterPlaceholder": ((14.6, 36.2, 13.53), (34.2, 41.8, 13.57)),
        "COL_PoolRaisedDeck_West": ((12.4, 36.0, 12.65), (14.4, 42.0, 13.85)),
        "COL_PoolRaisedDeck_East": ((34.4, 36.0, 12.65), (36.4, 42.0, 13.85)),
        "VIS_PoolBasinWall_West": ((14.3, 36.0, 12.8), (14.5, 42.0, 13.9)),
        "COL_PoolBasinWall_West": ((14.3, 36.0, 12.8), (14.5, 42.0, 13.9)),
        "VIS_PoolBasinWall_East": ((34.3, 36.0, 12.8), (34.5, 42.0, 13.9)),
        "COL_PoolBasinWall_East": ((34.3, 36.0, 12.8), (34.5, 42.0, 13.9)),
    }
    for name, (minimum, maximum) in expected_bounds.items():
        assert_bounds(name, minimum, maximum)


def main() -> None:
    preflight()
    visual_collection = bpy.data.collections[VIS_COLLECTION_NAME]
    collider_collection = bpy.data.collections[COL_COLLECTION_NAME]
    audit = []

    for name in ("COL_PoolRaisedDeck_West", "COL_PoolRaisedDeck_East"):
        obj = bpy.data.objects[name]
        minimum, maximum = world_bounds(obj)
        audit.append(
            replace_boxes(
                obj,
                (
                    ((minimum.x, minimum.y, minimum.z), (maximum.x, STAIR_WIDTH[0], maximum.z)),
                    ((minimum.x, STAIR_WIDTH[1], minimum.z), (maximum.x, maximum.y, maximum.z)),
                ),
            )
        )

    for name in (
        "VIS_PoolBasinWall_West",
        "COL_PoolBasinWall_West",
        "VIS_PoolBasinWall_East",
        "COL_PoolBasinWall_East",
    ):
        obj = bpy.data.objects[name]
        minimum, maximum = world_bounds(obj)
        audit.append(
            replace_boxes(
                obj,
                (
                    ((minimum.x, minimum.y, minimum.z), (maximum.x, STAIR_WIDTH[0], maximum.z)),
                    ((minimum.x, STAIR_WIDTH[1], minimum.z), (maximum.x, maximum.y, maximum.z)),
                ),
            )
        )

    vertices, faces = create_roof_to_deck_visual()
    _obj, item = create_mesh_object(
        "VIS_PoolDeckAccessStairs_West",
        visual_collection,
        "MAT_Stair_Yellow",
        "TEXTURED",
        vertices,
        faces,
    )
    audit.append(item)

    vertices = []
    faces = []
    append_profile_prism(
        vertices,
        faces,
        STAIR_WIDTH,
        (
            (10.0, 12.65),
            (10.0, 12.7),
            (12.4, 13.85),
            (14.4, 13.85),
            (16.5, 12.86),
            (16.5, 12.76),
            (14.4, 13.75),
            (12.4, 13.75),
        ),
    )
    _obj, item = create_mesh_object(
        "COL_PoolDeckAccessRamp_West",
        collider_collection,
        "MAT_Collider_Magenta",
        "WIRE",
        vertices,
        faces,
    )
    audit.append(item)

    vertices, faces = create_west_basin_visual()
    _obj, item = create_mesh_object(
        "VIS_PoolBasinStairs_West",
        visual_collection,
        "MAT_Stair_Yellow",
        "TEXTURED",
        vertices,
        faces,
    )
    audit.append(item)

    vertices, faces = create_east_basin_visual()
    _obj, item = create_mesh_object(
        "VIS_PoolBasinStairs_East",
        visual_collection,
        "MAT_Stair_Yellow",
        "TEXTURED",
        vertices,
        faces,
    )
    audit.append(item)

    vertices = []
    faces = []
    append_profile_prism(
        vertices,
        faces,
        STAIR_WIDTH,
        (
            (32.3, 12.76),
            (32.3, 12.86),
            (34.4, 13.85),
            (36.4, 13.85),
            (36.4, 13.75),
            (34.4, 13.75),
        ),
    )
    _obj, item = create_mesh_object(
        "COL_PoolBasinRamp_East",
        collider_collection,
        "MAT_Collider_Magenta",
        "WIRE",
        vertices,
        faces,
    )
    audit.append(item)

    final_counts = {
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "visuals": len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]),
        "colliders": len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]),
        "nav": len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]),
        "guides": len(bpy.data.collections[GUIDE_COLLECTION_NAME].objects),
        "export": len(bpy.data.collections[EXPORT_COLLECTION_NAME].all_objects),
    }
    expected_counts = {
        "objects": 504,
        "meshes": 480,
        "visuals": 309,
        "colliders": 160,
        "nav": 8,
        "guides": 22,
        "export": 482,
    }
    if final_counts != expected_counts:
        raise RuntimeError(
            f"プール階段追加後の件数が想定外です: actual={final_counts}, expected={expected_counts}"
        )

    expected_new_bounds = {
        "VIS_PoolDeckAccessStairs_West": ((10.0, 37.8, 12.65), (12.4, 40.2, 13.85)),
        "COL_PoolDeckAccessRamp_West": ((10.0, 37.8, 12.65), (16.5, 40.2, 13.85)),
        "VIS_PoolBasinStairs_West": ((14.4, 37.8, 12.81), (16.5, 40.2, 13.85)),
        "VIS_PoolBasinStairs_East": ((32.3, 37.8, 12.81), (34.4, 40.2, 13.85)),
        "COL_PoolBasinRamp_East": ((32.3, 37.8, 12.76), (36.4, 40.2, 13.85)),
    }
    for name, (minimum, maximum) in expected_new_bounds.items():
        assert_bounds(name, minimum, maximum)

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
