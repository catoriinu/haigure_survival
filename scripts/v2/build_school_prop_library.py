from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Callable, Iterable

import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BLEND_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B03/b03_school_prop_library.blend"
)
DEFAULT_GLB_PATH = (
    REPOSITORY_ROOT
    / "public/stage-assets/v2/B03/b03_school_prop_library_preview.glb"
)
DEFAULT_IMAGE_DIRECTORY = REPOSITORY_ROOT / "docs/plans/v2/B03/images"

LIBRARY_COLLECTION_NAME = "B03_PropLibrary"
OVERVIEW_COLLECTION_NAME = "B03_PreviewOverview"
SCALE_COLLECTION_NAME = "B03_PreviewScale"
SHARED_COLLECTION_NAME = "B03_PreviewShared"

VISUAL_NAMES = (
    "VIS_Prop_ClassroomDesk",
    "VIS_Prop_ClassroomChair",
    "VIS_Prop_StaffDesk",
    "VIS_Prop_StaffChair",
    "VIS_Prop_Blackboard",
    "VIS_Prop_StageLectern",
    "VIS_Prop_Urinal",
    "VIS_Prop_WesternToilet",
    "VIS_Prop_LargeWoodTable",
    "VIS_Prop_CleaningLocker",
    "VIS_Prop_BaggageLocker",
    "VIS_Prop_GrandPiano",
    "VIS_Prop_InfirmaryBed",
    "VIS_Prop_PcMonitor",
    "VIS_Prop_BasketballGoal",
    "VIS_Prop_VaultingBox",
    "VIS_Prop_Bookshelf",
    "VIS_Prop_ClosedBook",
    "VIS_Prop_OpenBook",
    "VIS_Prop_PaperStack",
    "VIS_Prop_SinglePaper",
    "VIS_Prop_PencilCase",
)

COLLIDER_TYPES = (
    "ClassroomDesk",
    "StaffDesk",
    "StageLectern",
    "LargeWoodTable",
    "CleaningLocker",
    "BaggageLocker",
    "GrandPiano",
    "InfirmaryBed",
    "VaultingBox",
    "Bookshelf",
)

FLOOR_ORIGIN_VISUALS = frozenset(
    name
    for name in VISUAL_NAMES
    if name
    not in {
        "VIS_Prop_Blackboard",
        "VIS_Prop_Urinal",
        "VIS_Prop_BasketballGoal",
    }
)
WALL_ORIGIN_VISUALS = frozenset(VISUAL_NAMES) - FLOOR_ORIGIN_VISUALS
BOOKSHELF_BOOK_SPINE_COUNT = 28
BOOKSHELF_COMPONENT_COUNT = 36
BOOKSHELF_TRIANGLE_COUNT = 432

EXPECTED_VISUAL_DIMENSIONS = {
    "VIS_Prop_ClassroomDesk": (0.65, 0.45, 0.70),
    "VIS_Prop_ClassroomChair": (0.42, 0.45, 0.78),
    "VIS_Prop_StaffDesk": (1.40, 0.70, 0.72),
    "VIS_Prop_StaffChair": (0.60, 0.60, 0.95),
    "VIS_Prop_Blackboard": (3.60, 0.08, 1.20),
    "VIS_Prop_StageLectern": (0.80, 0.55, 1.10),
    "VIS_Prop_Urinal": (0.40, 0.35, 0.65),
    "VIS_Prop_WesternToilet": (0.40, 0.70, 0.75),
    "VIS_Prop_LargeWoodTable": (1.80, 0.90, 0.72),
    "VIS_Prop_CleaningLocker": (0.90, 0.45, 1.80),
    "VIS_Prop_BaggageLocker": (1.80, 0.45, 1.20),
    "VIS_Prop_GrandPiano": (1.55, 1.45, 1.00),
    "VIS_Prop_InfirmaryBed": (2.00, 0.90, 0.55),
    "VIS_Prop_PcMonitor": (0.55, 0.18, 0.45),
    "VIS_Prop_BasketballGoal": (1.80, 0.70, 1.05),
    "VIS_Prop_VaultingBox": (1.20, 0.60, 1.00),
    "VIS_Prop_Bookshelf": (0.90, 0.32, 1.80),
    "VIS_Prop_ClosedBook": (0.25, 0.18, 0.03),
    "VIS_Prop_OpenBook": (0.44, 0.25, 0.04),
    "VIS_Prop_PaperStack": (0.297, 0.21, 0.025),
    "VIS_Prop_SinglePaper": (0.297, 0.21, 0.002),
    "VIS_Prop_PencilCase": (0.20, 0.07, 0.05),
}

GRID_POSITIONS = {
    name: (
        -10.0 + (index % 6) * 4.0,
        6.0 - (index // 6) * 4.0,
        0.0,
    )
    for index, name in enumerate(VISUAL_NAMES)
}
GRID_POSITIONS["VIS_Prop_Blackboard"] = (*GRID_POSITIONS["VIS_Prop_Blackboard"][:2], 1.5)
GRID_POSITIONS["VIS_Prop_Urinal"] = (*GRID_POSITIONS["VIS_Prop_Urinal"][:2], 0.8)
GRID_POSITIONS["VIS_Prop_BasketballGoal"] = (
    *GRID_POSITIONS["VIS_Prop_BasketballGoal"][:2],
    3.05,
)


def parse_arguments() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="B03学校小物ライブラリを生成・監査する")
    parser.add_argument("--mode", choices=("build", "reexport", "audit"), default="build")
    parser.add_argument("--blend-output", type=Path, default=DEFAULT_BLEND_PATH)
    parser.add_argument("--glb-output", type=Path, default=DEFAULT_GLB_PATH)
    parser.add_argument("--image-directory", type=Path, default=DEFAULT_IMAGE_DIRECTORY)
    parser.add_argument("--skip-images", action="store_true")
    return parser.parse_args(arguments)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def create_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(
    obj: bpy.types.Object, collection: bpy.types.Collection
) -> None:
    for source_collection in list(obj.users_collection):
        source_collection.objects.unlink(obj)
    collection.objects.link(obj)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.72,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader is None:
        raise RuntimeError(f"Principled BSDFがありません: {name}")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return material


def build_materials() -> dict[str, bpy.types.Material]:
    return {
        "wood": make_material("MAT_Prop_Wood", (0.46, 0.27, 0.11, 1.0)),
        "metal_gray": make_material(
            "MAT_Prop_MetalGray", (0.36, 0.39, 0.41, 1.0), metallic=0.45
        ),
        "metal_dark": make_material(
            "MAT_Prop_MetalDark", (0.11, 0.12, 0.13, 1.0), metallic=0.55
        ),
        "porcelain": make_material(
            "MAT_Prop_Porcelain", (0.90, 0.92, 0.91, 1.0), roughness=0.24
        ),
        "fabric": make_material("MAT_Prop_Fabric", (0.54, 0.62, 0.67, 1.0)),
        "plastic": make_material(
            "MAT_Prop_PlasticBlack", (0.025, 0.03, 0.035, 1.0), roughness=0.42
        ),
        "blackboard": make_material(
            "MAT_Prop_Blackboard", (0.035, 0.16, 0.095, 1.0), roughness=0.88
        ),
        "paper": make_material("MAT_Prop_Paper", (0.90, 0.87, 0.76, 1.0)),
        "accent": make_material(
            "MAT_Prop_AccentOrange", (0.83, 0.25, 0.035, 1.0), metallic=0.25
        ),
    }


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.append(material)


def add_box(
    size: tuple[float, float, float],
    center: tuple[float, float, float],
    material: bpy.types.Material | None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=center)
    obj = bpy.context.object
    obj.scale = (size[0] / 2.0, size[1] / 2.0, size[2] / 2.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material is not None:
        assign_material(obj, material)
    return obj


def add_cylinder(
    radius: float,
    depth: float,
    center: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    vertices: int = 12,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=center,
        rotation=rotation,
    )
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    assign_material(obj, material)
    return obj


def add_uv_sphere(
    scale: tuple[float, float, float],
    center: tuple[float, float, float],
    material: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=12,
        ring_count=6,
        radius=1.0,
        location=center,
    )
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, material)
    return obj


def add_torus(
    major_radius: float,
    minor_radius: float,
    center: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_segments=16,
        minor_segments=6,
        location=center,
        rotation=rotation,
        major_radius=major_radius,
        minor_radius=minor_radius,
    )
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    assign_material(obj, material)
    return obj


def add_extruded_polygon(
    points: tuple[tuple[float, float], ...],
    z_min: float,
    z_max: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    count = len(points)
    vertices = [(x, y, z_min) for x, y in points] + [
        (x, y, z_max) for x, y in points
    ]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    mesh = bpy.data.meshes.new("TemporaryPolygon")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("TemporaryPolygon", mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign_material(obj, material)
    return obj


def add_rectangular_frustum(
    bottom_size: tuple[float, float],
    top_size: tuple[float, float],
    z_min: float,
    z_max: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    bottom_x = bottom_size[0] / 2.0
    bottom_y = bottom_size[1] / 2.0
    top_x = top_size[0] / 2.0
    top_y = top_size[1] / 2.0
    vertices = [
        (-bottom_x, -bottom_y, z_min),
        (bottom_x, -bottom_y, z_min),
        (bottom_x, bottom_y, z_min),
        (-bottom_x, bottom_y, z_min),
        (-top_x, -top_y, z_max),
        (top_x, -top_y, z_max),
        (top_x, top_y, z_max),
        (-top_x, top_y, z_max),
    ]
    faces = [
        (3, 2, 1, 0),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    mesh = bpy.data.meshes.new("TemporaryFrustum")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("TemporaryFrustum", mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign_material(obj, material)
    return obj


def set_origin_without_moving_geometry(
    obj: bpy.types.Object, world_origin: tuple[float, float, float]
) -> None:
    origin = Vector(world_origin)
    local_origin = obj.matrix_world.inverted() @ origin
    for vertex in obj.data.vertices:
        vertex.co -= local_origin
    obj.location = origin


def smart_uv(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def triangulate_mesh(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="FIXED", ngon_method="CLIP")
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def canonicalize_triangle_mesh(obj: bpy.types.Object) -> None:
    source_mesh = obj.data
    face_records = []
    material_names = [
        material.name for material in source_mesh.materials if material is not None
    ]
    source_material_indices = {
        material_name: index for index, material_name in enumerate(material_names)
    }
    for polygon in source_mesh.polygons:
        corners = tuple(
            tuple(float(value) for value in source_mesh.vertices[index].co)
            for index in polygon.vertices
        )
        first_corner = min(range(len(corners)), key=corners.__getitem__)
        rotated_corners = corners[first_corner:] + corners[:first_corner]
        material = source_mesh.materials[polygon.material_index]
        face_records.append((material.name, polygon.use_smooth, rotated_corners))

    face_records.sort(
        key=lambda record: (source_material_indices[record[0]], record[2])
    )
    coordinates = sorted(
        {corner for _, _, corners in face_records for corner in corners}
    )
    vertex_indices = {coordinate: index for index, coordinate in enumerate(coordinates)}
    mesh = bpy.data.meshes.new(f"{source_mesh.name}__canonical")
    mesh.from_pydata(
        coordinates,
        [],
        [
            tuple(vertex_indices[corner] for corner in corners)
            for _, _, corners in face_records
        ],
    )
    mesh.update()
    for material_name in material_names:
        mesh.materials.append(bpy.data.materials[material_name])
    material_indices = {
        material.name: index for index, material in enumerate(mesh.materials)
    }
    for polygon, (material_name, use_smooth, _) in zip(mesh.polygons, face_records):
        polygon.material_index = material_indices[material_name]
        polygon.use_smooth = use_smooth

    obj.data = mesh
    bpy.data.meshes.remove(source_mesh)
    mesh.name = obj.name


def join_asset(
    name: str,
    parts: Iterable[bpy.types.Object],
    collection: bpy.types.Collection,
    location: tuple[float, float, float],
) -> bpy.types.Object:
    joined_parts = list(parts)
    if not joined_parts:
        raise RuntimeError(f"部品がありません: {name}")
    bpy.ops.object.select_all(action="DESELECT")
    for part in joined_parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = joined_parts[0]
    if len(joined_parts) > 1:
        bpy.ops.object.join()
        obj = bpy.context.object
    else:
        obj = joined_parts[0]
    set_origin_without_moving_geometry(obj, (0.0, 0.0, 0.0))
    obj.name = name
    obj.data.name = name
    if name in {"VIS_Prop_Urinal", "VIS_Prop_WesternToilet"}:
        while obj.data.uv_layers:
            obj.data.uv_layers.remove(obj.data.uv_layers[0])
        triangulate_mesh(obj)
        canonicalize_triangle_mesh(obj)
    else:
        smart_uv(obj)
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    move_to_collection(obj, collection)
    return obj


def build_classroom_desk(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [add_box((0.65, 0.45, 0.04), (0.0, 0.0, 0.68), materials["wood"])]
    for x in (-0.285, 0.285):
        for y in (-0.185, 0.185):
            parts.append(add_box((0.035, 0.035, 0.66), (x, y, 0.33), materials["metal_gray"]))
    parts.extend(
        [
            add_box((0.58, 0.025, 0.025), (0.0, 0.185, 0.28), materials["metal_gray"]),
            add_box((0.025, 0.37, 0.025), (-0.285, 0.0, 0.10), materials["metal_gray"]),
            add_box((0.025, 0.37, 0.025), (0.285, 0.0, 0.10), materials["metal_gray"]),
        ]
    )
    return parts


def build_classroom_chair(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [add_box((0.42, 0.45, 0.035), (0.0, 0.0, 0.43), materials["wood"])]
    for x in (-0.175, 0.175):
        for y in (-0.205, 0.205):
            parts.append(add_box((0.03, 0.03, 0.4125), (x, y, 0.20625), materials["metal_gray"]))
    parts.extend(
        [
            add_box((0.03, 0.03, 0.35), (-0.175, 0.20, 0.605), materials["metal_gray"]),
            add_box((0.03, 0.03, 0.35), (0.175, 0.20, 0.605), materials["metal_gray"]),
            add_box((0.42, 0.035, 0.24), (0.0, 0.2075, 0.66), materials["wood"]),
        ]
    )
    return parts


def build_staff_desk(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((1.40, 0.70, 0.04), (0.0, 0.0, 0.70), materials["metal_gray"]),
        add_box((0.34, 0.62, 0.66), (-0.50, 0.0, 0.33), materials["metal_gray"]),
        add_box((0.34, 0.62, 0.66), (0.50, 0.0, 0.33), materials["metal_gray"]),
        add_box((0.66, 0.035, 0.36), (0.0, 0.3325, 0.43), materials["metal_gray"]),
        add_box((0.025, 0.08, 0.02), (-0.50, -0.32, 0.51), materials["metal_dark"]),
        add_box((0.025, 0.08, 0.02), (0.50, -0.32, 0.51), materials["metal_dark"]),
    ]


def build_staff_chair(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [
        add_box((0.48, 0.46, 0.08), (0.0, 0.0, 0.51), materials["fabric"]),
        add_box((0.48, 0.07, 0.40), (0.0, 0.195, 0.75), materials["fabric"]),
        add_cylinder(0.035, 0.43, (0.0, 0.0, 0.275), materials["metal_dark"]),
    ]
    for angle in range(0, 360, 90):
        radians = math.radians(angle)
        x = math.cos(radians) * 0.275
        y = math.sin(radians) * 0.275
        part = add_box((0.275, 0.035, 0.025), (x / 2.0, y / 2.0, 0.07), materials["plastic"])
        part.rotation_euler.z = radians
        bpy.context.view_layer.objects.active = part
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        parts.append(part)
        parts.append(add_cylinder(0.025, 0.05, (x, y, 0.025), materials["plastic"], vertices=8))
    return parts


def build_blackboard(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((3.48, 0.04, 1.08), (0.0, 0.04, 0.0), materials["blackboard"]),
        add_box((3.60, 0.08, 0.06), (0.0, 0.04, 0.57), materials["metal_gray"]),
        add_box((3.60, 0.08, 0.06), (0.0, 0.04, -0.57), materials["metal_gray"]),
        add_box((0.06, 0.08, 1.08), (-1.77, 0.04, 0.0), materials["metal_gray"]),
        add_box((0.06, 0.08, 1.08), (1.77, 0.04, 0.0), materials["metal_gray"]),
        add_box((1.00, 0.08, 0.035), (0.70, 0.04, -0.535), materials["metal_gray"]),
    ]


def build_stage_lectern(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    top = add_box((0.80, 0.55, 0.07), (0.0, -0.01, 1.045), materials["wood"])
    top.rotation_euler.x = math.radians(-4.0)
    bpy.context.view_layer.objects.active = top
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return [
        add_box((0.68, 0.46, 0.10), (0.0, 0.0, 0.05), materials["wood"]),
        add_box((0.62, 0.09, 0.95), (0.0, 0.18, 0.545), materials["wood"]),
        add_box((0.07, 0.42, 0.92), (-0.305, 0.0, 0.56), materials["wood"]),
        add_box((0.07, 0.42, 0.92), (0.305, 0.0, 0.56), materials["wood"]),
        top,
    ]


def build_urinal(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((0.32, 0.08, 0.55), (0.0, 0.04, 0.0), materials["porcelain"]),
        add_uv_sphere((0.20, 0.175, 0.26), (0.0, 0.175, -0.065), materials["porcelain"]),
        add_box((0.20, 0.05, 0.10), (0.0, 0.325, -0.23), materials["porcelain"]),
        add_cylinder(0.025, 0.12, (0.0, 0.08, 0.265), materials["metal_gray"], vertices=8),
    ]


def build_western_toilet(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((0.36, 0.22, 0.52), (0.0, 0.24, 0.49), materials["porcelain"]),
        add_uv_sphere((0.20, 0.27, 0.20), (0.0, -0.08, 0.37), materials["porcelain"]),
        add_box((0.34, 0.48, 0.055), (0.0, -0.05, 0.53), materials["plastic"]),
        add_box((0.34, 0.45, 0.04), (0.0, 0.05, 0.73), materials["porcelain"]),
        add_box((0.28, 0.34, 0.22), (0.0, -0.08, 0.11), materials["porcelain"]),
    ]


def build_large_table(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [add_box((1.80, 0.90, 0.05), (0.0, 0.0, 0.695), materials["wood"])]
    for x in (-0.82, 0.82):
        for y in (-0.37, 0.37):
            parts.append(add_box((0.055, 0.055, 0.67), (x, y, 0.335), materials["metal_gray"]))
    return parts


def build_cleaning_locker(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [
        add_box((0.90, 0.45, 1.80), (0.0, 0.0, 0.90), materials["metal_gray"]),
        add_box((0.02, 0.018, 1.68), (0.0, -0.216, 0.90), materials["metal_dark"]),
        add_box((0.02, 0.04, 0.12), (-0.08, -0.205, 0.93), materials["metal_dark"]),
        add_box((0.02, 0.04, 0.12), (0.08, -0.205, 0.93), materials["metal_dark"]),
    ]
    for x in (-0.23, 0.23):
        for z in (1.55, 1.61, 1.67):
            parts.append(add_box((0.22, 0.018, 0.018), (x, -0.216, z), materials["metal_dark"]))
    return parts


def build_baggage_locker(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [
        add_box((1.80, 0.04, 1.20), (0.0, 0.205, 0.60), materials["wood"]),
        add_box((1.80, 0.45, 0.05), (0.0, 0.0, 0.025), materials["wood"]),
        add_box((1.80, 0.45, 0.05), (0.0, 0.0, 1.175), materials["wood"]),
        add_box((0.05, 0.45, 1.10), (-0.875, 0.0, 0.60), materials["wood"]),
        add_box((0.05, 0.45, 1.10), (0.875, 0.0, 0.60), materials["wood"]),
    ]
    for x in (-0.45, 0.0, 0.45):
        parts.append(add_box((0.04, 0.45, 1.10), (x, 0.0, 0.60), materials["wood"]))
    for z in (0.40, 0.80):
        parts.append(add_box((1.70, 0.45, 0.04), (0.0, 0.0, z), materials["wood"]))
    return parts


def build_grand_piano(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    outline = (
        (-0.775, -0.725),
        (0.42, -0.725),
        (0.775, -0.44),
        (0.73, 0.28),
        (0.35, 0.725),
        (-0.775, 0.725),
    )
    parts = [
        add_extruded_polygon(outline, 0.72, 1.00, materials["plastic"]),
        add_box((1.18, 0.28, 0.10), (-0.18, -0.585, 0.68), materials["plastic"]),
        add_box((1.05, 0.24, 0.035), (-0.22, -0.605, 0.73), materials["paper"]),
    ]
    for x, y in ((-0.62, -0.52), (0.53, -0.40), (-0.52, 0.50)):
        parts.append(add_box((0.07, 0.07, 0.72), (x, y, 0.36), materials["plastic"]))
    parts.extend(
        [
            add_box((0.32, 0.20, 0.035), (-0.18, -0.16, 0.20), materials["metal_dark"]),
            add_box((0.035, 0.18, 0.025), (-0.25, -0.22, 0.12), materials["accent"]),
            add_box((0.035, 0.18, 0.025), (-0.11, -0.22, 0.12), materials["accent"]),
        ]
    )
    return parts


def build_infirmary_bed(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [
        add_box((1.88, 0.82, 0.12), (0.0, 0.0, 0.43), materials["fabric"]),
        add_box((2.00, 0.06, 0.08), (0.0, -0.42, 0.37), materials["metal_gray"]),
        add_box((2.00, 0.06, 0.08), (0.0, 0.42, 0.37), materials["metal_gray"]),
        add_box((0.06, 0.90, 0.42), (-0.97, 0.0, 0.34), materials["metal_gray"]),
        add_box((0.06, 0.90, 0.55), (0.97, 0.0, 0.275), materials["metal_gray"]),
        add_box((0.42, 0.68, 0.08), (-0.67, 0.0, 0.51), materials["paper"]),
    ]
    return parts


def build_pc_monitor(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((0.55, 0.06, 0.32), (0.0, 0.03, 0.29), materials["plastic"]),
        add_box((0.49, 0.012, 0.265), (0.0, 0.006, 0.29), materials["metal_dark"]),
        add_box((0.05, 0.08, 0.18), (0.0, 0.08, 0.13), materials["metal_gray"]),
        add_box((0.30, 0.18, 0.035), (0.0, 0.09, 0.0175), materials["plastic"]),
    ]


def build_basketball_goal(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((1.80, 0.05, 1.05), (0.0, 0.025, 0.0), materials["paper"]),
        add_box((0.72, 0.02, 0.50), (0.0, 0.055, -0.08), materials["accent"]),
        add_torus(0.225, 0.018, (0.0, 0.40, -0.30), materials["accent"]),
        add_box((0.05, 0.70, 0.05), (0.0, 0.35, -0.30), materials["metal_gray"]),
        add_box((0.60, 0.05, 0.05), (0.0, 0.24, 0.43), materials["metal_gray"]),
    ]


def build_vaulting_box(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_rectangular_frustum(
            (1.20, 0.60),
            (0.90, 0.42),
            0.0,
            0.90,
            materials["wood"],
        ),
        add_box((0.92, 0.44, 0.10), (0.0, 0.0, 0.95), materials["fabric"]),
    ]


def build_bookshelf(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [
        add_box((0.90, 0.04, 1.80), (0.0, 0.14, 0.90), materials["wood"]),
        add_box((0.05, 0.32, 1.80), (-0.425, 0.0, 0.90), materials["wood"]),
        add_box((0.05, 0.32, 1.80), (0.425, 0.0, 0.90), materials["wood"]),
    ]
    for z in (0.025, 0.45, 0.90, 1.35, 1.775):
        parts.append(add_box((0.80, 0.32, 0.05), (0.0, 0.0, z), materials["wood"]))
    book_widths = (0.085, 0.10, 0.075, 0.11, 0.09, 0.08, 0.095)
    book_gap = 0.012
    book_materials = ("accent", "fabric", "blackboard", "paper", "metal_dark")
    row_width = sum(book_widths) + book_gap * (len(book_widths) - 1)
    shelf_tops = (0.05, 0.475, 0.925, 1.375)
    for shelf_index, shelf_top in enumerate(shelf_tops):
        cursor = -row_width / 2.0
        for book_index, width in enumerate(book_widths):
            height = 0.30 + 0.02 * ((shelf_index + book_index) % 3)
            center_x = cursor + width / 2.0
            material_index = (
                shelf_index * len(book_widths) + book_index
            ) % len(book_materials)
            parts.append(
                add_box(
                    (width, 0.16, height),
                    (center_x, -0.055, shelf_top + height / 2.0),
                    materials[book_materials[material_index]],
                )
            )
            cursor += width + book_gap
    return parts


def build_closed_book(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((0.25, 0.18, 0.02), (0.0, 0.0, 0.015), materials["paper"]),
        add_box((0.25, 0.18, 0.01), (0.0, 0.0, 0.005), materials["accent"]),
    ]


def build_open_book(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((0.215, 0.25, 0.02), (-0.1125, 0.0, 0.02), materials["paper"]),
        add_box((0.215, 0.25, 0.02), (0.1125, 0.0, 0.02), materials["paper"]),
        add_box((0.01, 0.25, 0.04), (0.0, 0.0, 0.02), materials["accent"]),
    ]


def build_paper_stack(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [add_box((0.297, 0.21, 0.025), (0.0, 0.0, 0.0125), materials["paper"])]


def build_single_paper(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [add_box((0.297, 0.21, 0.002), (0.0, 0.0, 0.001), materials["paper"])]


def build_pencil_case(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [add_box((0.20, 0.07, 0.05), (0.0, 0.0, 0.025), materials["fabric"])]


BUILDERS: dict[str, Callable[[dict[str, bpy.types.Material]], list[bpy.types.Object]]] = {
    "VIS_Prop_ClassroomDesk": build_classroom_desk,
    "VIS_Prop_ClassroomChair": build_classroom_chair,
    "VIS_Prop_StaffDesk": build_staff_desk,
    "VIS_Prop_StaffChair": build_staff_chair,
    "VIS_Prop_Blackboard": build_blackboard,
    "VIS_Prop_StageLectern": build_stage_lectern,
    "VIS_Prop_Urinal": build_urinal,
    "VIS_Prop_WesternToilet": build_western_toilet,
    "VIS_Prop_LargeWoodTable": build_large_table,
    "VIS_Prop_CleaningLocker": build_cleaning_locker,
    "VIS_Prop_BaggageLocker": build_baggage_locker,
    "VIS_Prop_GrandPiano": build_grand_piano,
    "VIS_Prop_InfirmaryBed": build_infirmary_bed,
    "VIS_Prop_PcMonitor": build_pc_monitor,
    "VIS_Prop_BasketballGoal": build_basketball_goal,
    "VIS_Prop_VaultingBox": build_vaulting_box,
    "VIS_Prop_Bookshelf": build_bookshelf,
    "VIS_Prop_ClosedBook": build_closed_book,
    "VIS_Prop_OpenBook": build_open_book,
    "VIS_Prop_PaperStack": build_paper_stack,
    "VIS_Prop_SinglePaper": build_single_paper,
    "VIS_Prop_PencilCase": build_pencil_case,
}


def create_collider(
    prop_type: str,
    size: tuple[float, float, float],
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    name = f"COL_Prop_{prop_type}"
    obj = add_box(size, (0.0, 0.0, size[2] / 2.0), None)
    set_origin_without_moving_geometry(obj, (0.0, 0.0, 0.0))
    obj.name = name
    obj.data.name = name
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    obj.hide_render = True
    move_to_collection(obj, collection)
    return obj


COLLIDER_DIMENSIONS = {
    "ClassroomDesk": (0.65, 0.45, 0.70),
    "StaffDesk": (1.40, 0.70, 0.72),
    "StageLectern": (0.72, 0.50, 1.05),
    "LargeWoodTable": (1.80, 0.90, 0.72),
    "CleaningLocker": (0.90, 0.45, 1.80),
    "BaggageLocker": (1.80, 0.45, 1.20),
    "GrandPiano": (1.55, 1.45, 0.96),
    "InfirmaryBed": (2.00, 0.90, 0.55),
    "VaultingBox": (1.20, 0.60, 1.00),
    "Bookshelf": (0.90, 0.32, 1.80),
}


def duplicate_for_preview(
    source: bpy.types.Object,
    name: str,
    collection: bpy.types.Collection,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    duplicate = source.copy()
    duplicate.data = source.data.copy()
    duplicate.name = name
    duplicate.data.name = name
    collection.objects.link(duplicate)
    duplicate.location = location
    duplicate.rotation_euler = rotation
    duplicate.hide_render = False
    return duplicate


def add_preview_floor(
    collection: bpy.types.Collection,
    size: tuple[float, float],
    center: tuple[float, float, float],
    material: bpy.types.Material,
) -> bpy.types.Object:
    floor = add_box((size[0], size[1], 0.05), center, material)
    floor.name = f"PREVIEW_{collection.name}_Floor"
    floor.data.name = floor.name
    move_to_collection(floor, collection)
    return floor


def create_text_label(
    text: str,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"PREVIEW_Label_{text}", type="FONT")
    curve.body = text.replace("VIS_Prop_", "")
    curve.align_x = "CENTER"
    curve.size = 0.24
    curve.extrude = 0.003
    obj = bpy.data.objects.new(f"PREVIEW_Label_{text}", curve)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, 0.0)
    return obj


def create_camera(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    collection: bpy.types.Collection,
    lens: float,
    *,
    orthographic_scale: float | None = None,
) -> bpy.types.Object:
    camera_data = bpy.data.cameras.new(name)
    camera_data.lens = lens
    if orthographic_scale is not None:
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = orthographic_scale
    camera = bpy.data.objects.new(name, camera_data)
    collection.objects.link(camera)
    camera.location = location
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return camera


def create_light(
    name: str,
    kind: str,
    energy: float,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    *,
    size: float = 5.0,
) -> bpy.types.Object:
    light_data = bpy.data.lights.new(name, type=kind)
    light_data.energy = energy
    if kind == "AREA":
        light_data.shape = "DISK"
        light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    collection.objects.link(light)
    light.location = location
    light.rotation_euler = (math.radians(22.0), 0.0, math.radians(32.0))
    return light


def build_preview_collections(
    library: bpy.types.Collection,
    overview: bpy.types.Collection,
    scale: bpy.types.Collection,
    shared: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Object, bpy.types.Object]:
    add_preview_floor(overview, (25.0, 21.0), (0.0, -1.5, -0.035), materials["metal_dark"])
    for name in VISUAL_NAMES:
        position = GRID_POSITIONS[name]
        label_z = 0.015
        create_text_label(name, (position[0], position[1] - 1.15, label_z), overview)

    desk = bpy.data.objects["VIS_Prop_ClassroomDesk"]
    chair = bpy.data.objects["VIS_Prop_ClassroomChair"]
    staff_chair = bpy.data.objects["VIS_Prop_StaffChair"]
    monitor = bpy.data.objects["VIS_Prop_PcMonitor"]
    closed_book = bpy.data.objects["VIS_Prop_ClosedBook"]
    single_paper = bpy.data.objects["VIS_Prop_SinglePaper"]
    pencil_case = bpy.data.objects["VIS_Prop_PencilCase"]

    duplicate_for_preview(desk, "PREVIEW_Desk_Skewed", overview, (-4.5, -10.0, 0.0), (0.0, 0.0, math.radians(18.0)))
    duplicate_for_preview(desk, "PREVIEW_Desk_Toppled", overview, (-2.7, -10.0, 0.34), (0.0, math.radians(90.0), math.radians(-8.0)))
    duplicate_for_preview(chair, "PREVIEW_Chair_Back", overview, (-0.9, -10.0, 0.23), (math.radians(72.0), 0.0, math.radians(12.0)))
    duplicate_for_preview(chair, "PREVIEW_Chair_Side", overview, (0.7, -10.0, 0.23), (0.0, math.radians(90.0), math.radians(-10.0)))
    duplicate_for_preview(staff_chair, "PREVIEW_StaffChair_Toppled", overview, (2.5, -10.0, 0.34), (math.radians(78.0), 0.0, 0.0))
    duplicate_for_preview(monitor, "PREVIEW_Monitor_Toppled", overview, (4.4, -10.0, 0.20), (math.radians(90.0), 0.0, math.radians(16.0)))
    duplicate_for_preview(desk, "PREVIEW_ClassroomDesk_Upright", overview, (5.4, -10.0, 0.0))
    duplicate_for_preview(chair, "PREVIEW_ClassroomChair_Upright", overview, (5.4, -10.65, 0.0))
    duplicate_for_preview(closed_book, "PREVIEW_ClosedBook_Scatter", overview, (5.22, -10.0, 0.705), (0.0, 0.0, math.radians(28.0)))
    duplicate_for_preview(pencil_case, "PREVIEW_PencilCase_Scatter", overview, (5.50, -10.02, 0.705), (0.0, 0.0, math.radians(-16.0)))
    duplicate_for_preview(single_paper, "PREVIEW_Paper_Scatter", overview, (6.05, -10.55, 0.003), (0.0, 0.0, math.radians(-21.0)))
    create_text_label("PlacementExamples", (0.0, -11.2, 0.015), overview)
    create_text_label("ClassroomScatter", (5.4, -11.45, 0.015), overview)

    add_preview_floor(scale, (13.0, 5.0), (0.0, 0.0, -0.035), materials["metal_dark"])
    scale_sources = (
        ("VIS_Prop_ClassroomDesk", -4.7),
        ("VIS_Prop_ClassroomChair", -3.4),
        ("VIS_Prop_StaffDesk", -1.7),
        ("VIS_Prop_Bookshelf", 0.4),
        ("VIS_Prop_GrandPiano", 2.7),
        ("VIS_Prop_InfirmaryBed", 5.0),
    )
    for source_name, x in scale_sources:
        duplicate_for_preview(
            bpy.data.objects[source_name],
            f"PREVIEW_Scale_{source_name.removeprefix('VIS_Prop_')}",
            scale,
            (x, 0.0, 0.0),
        )

    human_parts = (
        ("LegL", (0.12, 0.14, 0.65), (-5.89, 0.0, 0.325)),
        ("LegR", (0.12, 0.14, 0.65), (-5.71, 0.0, 0.325)),
        ("Hips", (0.34, 0.18, 0.25), (-5.8, 0.0, 0.72)),
        ("Torso", (0.42, 0.20, 0.62), (-5.8, 0.0, 1.12)),
        ("ArmL", (0.10, 0.12, 0.65), (-6.06, 0.0, 1.02)),
        ("ArmR", (0.10, 0.12, 0.65), (-5.54, 0.0, 1.02)),
    )
    for suffix, size, center in human_parts:
        part = add_box(size, center, materials["metal_gray"])
        part.name = f"PREVIEW_Scale_Human{suffix}"
        part.data.name = part.name
        move_to_collection(part, scale)
    head = add_uv_sphere((0.15, 0.15, 0.15), (-5.8, 0.0, 1.55), materials["metal_gray"])
    head.name = "PREVIEW_Scale_HumanHead"
    head.data.name = head.name
    move_to_collection(head, scale)

    overview_camera = create_camera(
        "PREVIEW_Camera_Overview",
        (18.0, -25.0, 24.0),
        (0.0, -2.0, 1.1),
        shared,
        52.0,
        orthographic_scale=28.0,
    )
    scale_camera = create_camera(
        "PREVIEW_Camera_Scale",
        (11.5, -15.5, 7.8),
        (0.0, 0.0, 0.85),
        shared,
        58.0,
    )
    create_light("PREVIEW_Key", "AREA", 1700.0, (-5.0, -7.0, 14.0), shared, size=8.0)
    create_light("PREVIEW_Fill", "AREA", 900.0, (11.0, 5.0, 9.0), shared, size=7.0)
    sun = create_light("PREVIEW_Sun", "SUN", 2.0, (0.0, 0.0, 12.0), shared)
    sun.rotation_euler = (math.radians(28.0), math.radians(-20.0), math.radians(35.0))
    return overview_camera, scale_camera


def render_previews(
    overview_camera: bpy.types.Object,
    scale_camera: bpy.types.Object,
    library: bpy.types.Collection,
    overview: bpy.types.Collection,
    scale: bpy.types.Collection,
    image_directory: Path,
) -> None:
    image_directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    scene.world.color = (0.035, 0.045, 0.055)

    library.hide_render = False
    overview.hide_render = False
    scale.hide_render = True
    scene.camera = overview_camera
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1100
    scene.render.filepath = str(image_directory / "props_overview.png")
    bpy.ops.render.render(write_still=True)

    library.hide_render = True
    overview.hide_render = True
    scale.hide_render = False
    scene.camera = scale_camera
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.filepath = str(image_directory / "props_scale.png")
    bpy.ops.render.render(write_still=True)

    library.hide_render = False
    overview.hide_render = True
    scale.hide_render = True


def export_library(glb_path: Path) -> None:
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    library = bpy.data.collections.get(LIBRARY_COLLECTION_NAME)
    if library is None:
        raise RuntimeError(f"Collectionがありません: {LIBRARY_COLLECTION_NAME}")
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = [obj for obj in library.all_objects if obj.type == "MESH"]
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = export_objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_materials="EXPORT",
        export_extras=True,
    )
    bpy.ops.object.select_all(action="DESELECT")


def triangle_count(obj: bpy.types.Object) -> int:
    return sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)


def connected_component_count(obj: bpy.types.Object) -> int:
    adjacency = [set() for _ in obj.data.vertices]
    for edge in obj.data.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)
    remaining = set(range(len(obj.data.vertices)))
    count = 0
    while remaining:
        pending = [remaining.pop()]
        while pending:
            vertex_index = pending.pop()
            connected = adjacency[vertex_index] & remaining
            remaining.difference_update(connected)
            pending.extend(connected)
        count += 1
    return count


def local_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    coordinates = [vertex.co for vertex in obj.data.vertices]
    return (
        Vector((min(value.x for value in coordinates), min(value.y for value in coordinates), min(value.z for value in coordinates))),
        Vector((max(value.x for value in coordinates), max(value.y for value in coordinates), max(value.z for value in coordinates))),
    )


def assert_vector_close(
    label: str,
    actual: Iterable[float],
    expected: Iterable[float],
    tolerance: float = 0.012,
) -> None:
    actual_values = tuple(float(value) for value in actual)
    expected_values = tuple(float(value) for value in expected)
    if any(abs(a - e) > tolerance for a, e in zip(actual_values, expected_values, strict=True)):
        raise RuntimeError(f"{label}が不一致です: actual={actual_values}, expected={expected_values}")


def audit_library() -> dict[str, object]:
    library = bpy.data.collections.get(LIBRARY_COLLECTION_NAME)
    if library is None:
        raise RuntimeError(f"Collectionがありません: {LIBRARY_COLLECTION_NAME}")
    mesh_objects = sorted(
        (obj for obj in library.all_objects if obj.type == "MESH"), key=lambda obj: obj.name
    )
    visuals = [obj for obj in mesh_objects if obj.name.startswith("VIS_Prop_")]
    colliders = [obj for obj in mesh_objects if obj.name.startswith("COL_Prop_")]
    if tuple(obj.name for obj in visuals) != tuple(sorted(VISUAL_NAMES)):
        raise RuntimeError(f"表示小物一覧が不一致です: {[obj.name for obj in visuals]}")
    expected_collider_names = tuple(sorted(f"COL_Prop_{name}" for name in COLLIDER_TYPES))
    if tuple(obj.name for obj in colliders) != expected_collider_names:
        raise RuntimeError(f"Collider一覧が不一致です: {[obj.name for obj in colliders]}")
    if len(mesh_objects) != 32:
        raise RuntimeError(f"Library Mesh数が不一致です: {len(mesh_objects)}")

    mesh_data_ids: set[int] = set()
    visual_triangles: dict[str, int] = {}
    collider_triangles: dict[str, int] = {}
    for obj in mesh_objects:
        if obj.name != obj.data.name:
            raise RuntimeError(f"Object名とMesh Data名が不一致です: {obj.name}/{obj.data.name}")
        if any(abs(float(value)) > 1.0e-7 for value in obj.rotation_euler):
            raise RuntimeError(f"rotationが未適用です: {obj.name}={tuple(obj.rotation_euler)}")
        assert_vector_close(f"{obj.name} scale", obj.scale, (1.0, 1.0, 1.0), 1.0e-7)
        data_id = obj.data.as_pointer()
        if data_id in mesh_data_ids:
            raise RuntimeError(f"Mesh datablockが共有されています: {obj.name}")
        mesh_data_ids.add(data_id)
        if obj.name.startswith("VIS_"):
            visual_triangles[obj.name] = triangle_count(obj)
        else:
            collider_triangles[obj.name] = triangle_count(obj)

    for obj in visuals:
        assert_vector_close(
            f"{obj.name} dimensions",
            obj.dimensions,
            EXPECTED_VISUAL_DIMENSIONS[obj.name],
        )
        minimum, maximum = local_bounds(obj)
        if obj.name in FLOOR_ORIGIN_VISUALS and abs(minimum.z) > 1.0e-5:
            raise RuntimeError(f"床置き原点が底面にありません: {obj.name}, minZ={minimum.z}")
        if obj.name in WALL_ORIGIN_VISUALS:
            if abs(minimum.y) > 1.0e-5 or abs(minimum.z + maximum.z) > 1.0e-5:
                raise RuntimeError(
                    f"壁付け原点が取付面中央にありません: {obj.name}, bounds={minimum}/{maximum}"
                )
        triangle_limit = (
            1500
            if obj.name == "VIS_Prop_GrandPiano"
            else 1000
            if obj.name == "VIS_Prop_BasketballGoal"
            else 500
        )
        if visual_triangles[obj.name] > triangle_limit:
            raise RuntimeError(
                f"三角形予算超過です: {obj.name}={visual_triangles[obj.name]}/{triangle_limit}"
            )

    for obj in colliders:
        prop_type = obj.name.removeprefix("COL_Prop_")
        assert_vector_close(
            f"{obj.name} dimensions",
            obj.dimensions,
            COLLIDER_DIMENSIONS[prop_type],
        )

    for prop_type in ("Bookshelf", "BaggageLocker", "CleaningLocker"):
        assert_vector_close(
            f"{prop_type} VIS/COL dimensions",
            bpy.data.objects[f"VIS_Prop_{prop_type}"].dimensions,
            bpy.data.objects[f"COL_Prop_{prop_type}"].dimensions,
        )

    bookshelf = bpy.data.objects["VIS_Prop_Bookshelf"]
    bookshelf_components = connected_component_count(bookshelf)
    if bookshelf_components != BOOKSHELF_COMPONENT_COUNT:
        raise RuntimeError(
            "本棚の本体8部品＋背表紙28冊が揃っていません: "
            f"{bookshelf_components}/{BOOKSHELF_COMPONENT_COUNT}"
        )
    if visual_triangles[bookshelf.name] != BOOKSHELF_TRIANGLE_COUNT:
        raise RuntimeError(
            "本棚の三角形数が造形契約と一致しません: "
            f"{visual_triangles[bookshelf.name]}/{BOOKSHELF_TRIANGLE_COUNT}"
        )

    total_visual_triangles = sum(visual_triangles.values())
    total_collider_triangles = sum(collider_triangles.values())
    if total_visual_triangles > 8000:
        raise RuntimeError(f"表示三角形予算超過です: {total_visual_triangles}/8000")
    if total_collider_triangles > 500:
        raise RuntimeError(f"Collider三角形予算超過です: {total_collider_triangles}/500")

    used_materials = sorted(
        {
            slot.material.name
            for obj in visuals
            for slot in obj.material_slots
            if slot.material is not None
        }
    )
    if len(used_materials) > 9:
        raise RuntimeError(f"Material予算超過です: {len(used_materials)}/9")

    result = {
        "visualCount": len(visuals),
        "colliderCount": len(colliders),
        "meshCount": len(mesh_objects),
        "materialCount": len(used_materials),
        "materials": used_materials,
        "visualTriangles": total_visual_triangles,
        "colliderTriangles": total_collider_triangles,
        "trianglesByVisual": visual_triangles,
        "trianglesByCollider": collider_triangles,
        "bookshelfBookSpines": BOOKSHELF_BOOK_SPINE_COUNT,
        "bookshelfComponents": bookshelf_components,
        "dimensions": {
            obj.name: [round(float(value), 6) for value in obj.dimensions] for obj in visuals
        },
    }
    print("B03_PROP_AUDIT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    return result


def configure_scene() -> None:
    scene = bpy.context.scene
    bpy.context.preferences.filepaths.save_version = 0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    scene.render.engine = "BLENDER_EEVEE"


def build_library(arguments: argparse.Namespace) -> None:
    if not bpy.app.background:
        raise RuntimeError(
            "B03学校小物ライブラリの生成はBlenderのバックグラウンド実行専用です"
        )
    clear_scene()
    configure_scene()
    library = create_collection(LIBRARY_COLLECTION_NAME)
    overview = create_collection(OVERVIEW_COLLECTION_NAME)
    scale = create_collection(SCALE_COLLECTION_NAME)
    shared = create_collection(SHARED_COLLECTION_NAME)
    materials = build_materials()

    for name in VISUAL_NAMES:
        join_asset(name, BUILDERS[name](materials), library, GRID_POSITIONS[name])

    for prop_type in COLLIDER_TYPES:
        visual_name = f"VIS_Prop_{prop_type}"
        create_collider(
            prop_type,
            COLLIDER_DIMENSIONS[prop_type],
            GRID_POSITIONS[visual_name],
            library,
        )

    overview_camera, scale_camera = build_preview_collections(
        library, overview, scale, shared, materials
    )
    if not arguments.skip_images:
        render_previews(
            overview_camera,
            scale_camera,
            library,
            overview,
            scale,
            arguments.image_directory,
        )
        bpy.context.scene.render.filepath = ""

    audit_library()
    arguments.blend_output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(arguments.blend_output), check_existing=False)
    export_library(arguments.glb_output)
    bpy.ops.wm.save_as_mainfile(filepath=str(arguments.blend_output), check_existing=False)
    print(f"B03_PROP_BLEND={arguments.blend_output}")
    print(f"B03_PROP_GLB={arguments.glb_output}")


def main() -> None:
    arguments = parse_arguments()
    if arguments.mode == "build":
        build_library(arguments)
        return
    configure_scene()
    audit_library()
    if arguments.mode == "reexport":
        export_library(arguments.glb_output)
        print(f"B03_PROP_GLB={arguments.glb_output}")


if __name__ == "__main__":
    main()
