from __future__ import annotations

import argparse
import hashlib
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
B06_PROP_GENERATOR_VERSION = "b06-3-school-props-signage-v1"
B06_PROP_SIGNATURE_PROPERTY = "b06_3_prop_library_signature"
B06_PROP_VERSION_PROPERTY = "b06_3_prop_library_version"

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
B06_PROP_COMPONENT_COUNTS = {
    "VIS_Prop_Urinal": 4,
    "VIS_Prop_WesternToilet": 3,
    "VIS_Prop_GrandPiano": 34,
}

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
    "VIS_Prop_BasketballGoal": (1.80, 0.70, 1.205),
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
        "key_white": make_material(
            "MAT_Prop_KeyWhite", (0.96, 0.96, 0.96, 1.0), roughness=0.36
        ),
        "pedal_brass": make_material(
            "MAT_Prop_PedalBrass",
            (0.56, 0.43, 0.16, 1.0),
            metallic=0.62,
            roughness=0.34,
        ),
        "accent": make_material(
            "MAT_Prop_AccentOrange", (0.83, 0.25, 0.035, 1.0), metallic=0.25
        ),
        "accent_red": make_material(
            "MAT_Prop_AccentRed", (0.70, 0.035, 0.025, 1.0), metallic=0.20
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


def add_box_without_faces(
    size: tuple[float, float, float],
    center: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    omitted_faces: frozenset[str],
) -> bpy.types.Object:
    half_x, half_y, half_z = (value / 2.0 for value in size)
    center_x, center_y, center_z = center
    vertices = [
        (center_x - half_x, center_y - half_y, center_z - half_z),
        (center_x + half_x, center_y - half_y, center_z - half_z),
        (center_x + half_x, center_y + half_y, center_z - half_z),
        (center_x - half_x, center_y + half_y, center_z - half_z),
        (center_x - half_x, center_y - half_y, center_z + half_z),
        (center_x + half_x, center_y - half_y, center_z + half_z),
        (center_x + half_x, center_y + half_y, center_z + half_z),
        (center_x - half_x, center_y + half_y, center_z + half_z),
    ]
    face_definitions = {
        "bottom": (3, 2, 1, 0),
        "top": (4, 5, 6, 7),
        "front": (0, 1, 5, 4),
        "right": (1, 2, 6, 5),
        "back": (2, 3, 7, 6),
        "left": (3, 0, 4, 7),
    }
    unknown_faces = omitted_faces - face_definitions.keys()
    if unknown_faces:
        raise RuntimeError(f"除外面名が不正です: {sorted(unknown_faces)}")
    faces = [
        face
        for face_name, face in face_definitions.items()
        if face_name not in omitted_faces
    ]
    mesh = bpy.data.meshes.new("TemporaryOpenBox")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("TemporaryOpenBox", mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign_material(obj, material)
    return obj


def add_front_quad(
    size: tuple[float, float],
    center: tuple[float, float, float],
    material: bpy.types.Material,
) -> bpy.types.Object:
    half_width = size[0] / 2.0
    half_height = size[1] / 2.0
    center_x, center_y, center_z = center
    vertices = (
        (center_x - half_width, center_y, center_z - half_height),
        (center_x + half_width, center_y, center_z - half_height),
        (center_x + half_width, center_y, center_z + half_height),
        (center_x - half_width, center_y, center_z + half_height),
    )
    mesh = bpy.data.meshes.new("TemporaryFrontQuad")
    mesh.from_pydata(vertices, [], ((0, 1, 2, 3),))
    mesh.update()
    obj = bpy.data.objects.new("TemporaryFrontQuad", mesh)
    bpy.context.scene.collection.objects.link(obj)
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


def add_open_circular_frustum(
    top_radius: float,
    bottom_radius: float,
    z_top: float,
    z_bottom: float,
    center_xy: tuple[float, float],
    material: bpy.types.Material,
    *,
    segments: int = 12,
) -> bpy.types.Object:
    center_x, center_y = center_xy
    vertices = []
    for z, radius in ((z_top, top_radius), (z_bottom, bottom_radius)):
        for index in range(segments):
            angle = math.tau * index / segments
            vertices.append(
                (
                    center_x + math.cos(angle) * radius,
                    center_y + math.sin(angle) * radius,
                    z,
                )
            )
    faces = []
    for index in range(segments):
        following = (index + 1) % segments
        faces.append(
            (
                index,
                following,
                segments + following,
                segments + index,
            )
        )
    mesh = bpy.data.meshes.new("TemporaryOpenCircularFrustum")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("TemporaryOpenCircularFrustum", mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign_material(obj, material)
    return obj


def add_elliptical_bowl_shell(
    outer_bottom_radii: tuple[float, float],
    outer_top_radii: tuple[float, float],
    inner_top_radii: tuple[float, float],
    inner_bottom_radii: tuple[float, float],
    z_bottom: float,
    z_top: float,
    inner_z_bottom: float,
    outer_center_y: float,
    inner_center_y: float,
    material: bpy.types.Material,
    *,
    segments: int = 20,
) -> bpy.types.Object:
    rings = (
        (outer_bottom_radii, outer_center_y, z_bottom),
        (outer_top_radii, outer_center_y, z_top),
        (inner_top_radii, inner_center_y, z_top),
        (inner_bottom_radii, inner_center_y, inner_z_bottom),
    )
    vertices = [
        (
            math.cos(math.tau * index / segments) * radii[0],
            center_y + math.sin(math.tau * index / segments) * radii[1],
            z,
        )
        for radii, center_y, z in rings
        for index in range(segments)
    ]
    faces: list[tuple[int, int, int, int]] = []
    for index in range(segments):
        following = (index + 1) % segments
        faces.extend(
            (
                (index, following, segments + following, segments + index),
                (
                    segments + index,
                    segments + following,
                    2 * segments + following,
                    2 * segments + index,
                ),
                (
                    2 * segments + index,
                    2 * segments + following,
                    3 * segments + following,
                    3 * segments + index,
                ),
            )
        )
    mesh = bpy.data.meshes.new("TemporaryEllipticalBowlShell")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("TemporaryEllipticalBowlShell", mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign_material(obj, material)
    return obj


def add_open_elliptical_ring(
    outer_radii: tuple[float, float],
    inner_radii: tuple[float, float],
    center_y: float,
    z_bottom: float,
    z_top: float,
    material: bpy.types.Material,
    *,
    segments: int = 20,
) -> bpy.types.Object:
    vertices = [
        (
            math.cos(math.tau * index / segments) * radii[0],
            center_y + math.sin(math.tau * index / segments) * radii[1],
            z,
        )
        for radii, z in (
            (outer_radii, z_bottom),
            (outer_radii, z_top),
            (inner_radii, z_top),
            (inner_radii, z_bottom),
        )
        for index in range(segments)
    ]
    faces: list[tuple[int, int, int, int]] = []
    for index in range(segments):
        following = (index + 1) % segments
        faces.extend(
            (
                (index, following, segments + following, segments + index),
                (
                    segments + index,
                    segments + following,
                    2 * segments + following,
                    2 * segments + index,
                ),
                (
                    2 * segments + index,
                    2 * segments + following,
                    3 * segments + following,
                    3 * segments + index,
                ),
            )
        )
    mesh = bpy.data.meshes.new("TemporaryOpenEllipticalRing")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("TemporaryOpenEllipticalRing", mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign_material(obj, material)
    return obj


def add_elliptical_disk(
    radii: tuple[float, float],
    center_y: float,
    z: float,
    material: bpy.types.Material,
    *,
    segments: int = 20,
) -> bpy.types.Object:
    vertices = [(0.0, center_y, z)] + [
        (
            math.cos(math.tau * index / segments) * radii[0],
            center_y + math.sin(math.tau * index / segments) * radii[1],
            z,
        )
        for index in range(segments)
    ]
    faces = [
        (0, index + 1, ((index + 1) % segments) + 1)
        for index in range(segments)
    ]
    mesh = bpy.data.meshes.new("TemporaryEllipticalDisk")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("TemporaryEllipticalDisk", mesh)
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
            add_box((0.03, 0.03, 0.34), (-0.175, 0.20, 0.60), materials["metal_gray"]),
            add_box((0.03, 0.03, 0.34), (0.175, 0.20, 0.60), materials["metal_gray"]),
            add_box((0.42, 0.06, 0.26), (0.0, 0.195, 0.65), materials["wood"]),
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
        add_box((0.40, 0.05, 0.65), (0.0, 0.025, 0.0), materials["porcelain"]),
        add_elliptical_bowl_shell(
            (0.11, 0.10),
            (0.18, 0.17),
            (0.12, 0.11),
            (0.04, 0.04),
            -0.22,
            0.14,
            -0.20,
            0.18,
            0.19,
            materials["porcelain"],
        ),
        add_elliptical_disk((0.04, 0.04), 0.12, -0.20, materials["metal_dark"]),
        add_cylinder(
            0.025,
            0.16,
            (0.0, 0.075, 0.245),
            materials["metal_gray"],
            vertices=8,
        ),
    ]


def build_western_toilet(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((0.36, 0.16, 0.25), (0.0, 0.27, 0.625), materials["porcelain"]),
        add_box_without_faces(
            (0.26, 0.30, 0.28),
            (0.0, -0.06, 0.14),
            materials["porcelain"],
            omitted_faces=frozenset({"top"}),
        ),
        add_elliptical_bowl_shell(
            (0.14, 0.18),
            (0.20, 0.27),
            (0.135, 0.20),
            (0.055, 0.075),
            0.28,
            0.50,
            0.34,
            -0.08,
            -0.08,
            materials["porcelain"],
        ),
        add_open_elliptical_ring(
            (0.195, 0.265),
            (0.135, 0.195),
            -0.08,
            0.50,
            0.54,
            materials["plastic"],
        ),
        add_elliptical_disk(
            (0.055, 0.075),
            -0.08,
            0.34,
            materials["metal_dark"],
        ),
    ]


def build_large_table(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [add_box((1.80, 0.90, 0.05), (0.0, 0.0, 0.695), materials["wood"])]
    for x in (-0.82, 0.82):
        for y in (-0.37, 0.37):
            parts.append(add_box((0.055, 0.055, 0.67), (x, y, 0.335), materials["metal_gray"]))
    return parts


def build_cleaning_locker(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = [
        add_box((0.90, 0.448, 1.80), (0.0, 0.001, 0.90), materials["metal_gray"]),
        add_front_quad((0.02, 1.68), (0.0, -0.225, 0.90), materials["metal_dark"]),
        add_front_quad((0.02, 0.12), (-0.08, -0.225, 0.93), materials["metal_dark"]),
        add_front_quad((0.02, 0.12), (0.08, -0.225, 0.93), materials["metal_dark"]),
    ]
    for x in (-0.23, 0.23):
        for z in (1.55, 1.61, 1.67):
            parts.append(
                add_front_quad(
                    (0.22, 0.018),
                    (x, -0.225, z),
                    materials["metal_dark"],
                )
            )
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
    body_outline = (
        (-0.775, -0.445),
        (0.42, -0.445),
        (0.775, -0.16),
        (0.73, 0.28),
        (0.35, 0.725),
        (-0.775, 0.725),
    )
    parts = [
        add_extruded_polygon(body_outline, 0.75, 1.00, materials["plastic"]),
        add_box(
            (1.195, 0.28, 0.08),
            (-0.1775, -0.585, 0.71),
            materials["plastic"],
        ),
    ]
    white_key_count = 14
    keyboard_min_x = -0.735
    keyboard_width = 1.06
    white_key_pitch = keyboard_width / white_key_count
    for index in range(white_key_count):
        key_center_x = keyboard_min_x + (index + 0.5) * white_key_pitch
        parts.append(
            add_box_without_faces(
                (white_key_pitch - 0.004, 0.255, 0.03),
                (key_center_x, -0.5725, 0.765),
                materials["key_white"],
                omitted_faces=frozenset({"bottom", "back"}),
            )
        )
    for boundary_index in (1, 2, 4, 5, 6, 8, 9, 11, 12, 13):
        key_center_x = keyboard_min_x + boundary_index * white_key_pitch
        parts.append(
            add_box_without_faces(
                (0.035, 0.155, 0.04),
                (key_center_x, -0.5225, 0.80),
                materials["plastic"],
                omitted_faces=frozenset({"bottom", "back"}),
            )
        )
    for x, y in ((-0.62, -0.34), (0.53, -0.28), (-0.52, 0.50)):
        parts.append(
            add_box((0.07, 0.07, 0.75), (x, y, 0.375), materials["plastic"])
        )
    parts.extend(
        [
            add_box(
                (0.32, 0.22, 0.04),
                (-0.18, -0.20, 0.20),
                materials["metal_dark"],
            ),
            add_box(
                (0.04, 0.18, 0.025),
                (-0.25, -0.30, 0.175),
                materials["pedal_brass"],
            ),
            add_box(
                (0.04, 0.18, 0.025),
                (-0.11, -0.30, 0.175),
                materials["pedal_brass"],
            ),
            add_box(
                (0.035, 0.035, 0.53),
                (-0.25, -0.16, 0.485),
                materials["metal_dark"],
            ),
            add_box(
                (0.035, 0.035, 0.53),
                (-0.11, -0.16, 0.485),
                materials["metal_dark"],
            ),
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
        add_box((0.55, 0.058, 0.32), (0.0, 0.031, 0.29), materials["plastic"]),
        add_front_quad((0.49, 0.265), (0.0, 0.0, 0.29), materials["metal_dark"]),
        add_box((0.05, 0.08, 0.18), (0.0, 0.08, 0.13), materials["metal_gray"]),
        add_box((0.30, 0.18, 0.035), (0.0, 0.09, 0.0175), materials["plastic"]),
    ]


def build_basketball_goal(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box((1.80, 0.05, 1.05), (0.0, 0.025, 0.0), materials["porcelain"]),
        add_box((0.72, 0.02, 0.025), (0.0, 0.055, 0.17), materials["accent_red"]),
        add_box((0.72, 0.02, 0.025), (0.0, 0.055, -0.33), materials["accent_red"]),
        add_box((0.025, 0.02, 0.50), (-0.3475, 0.055, -0.08), materials["accent_red"]),
        add_box((0.025, 0.02, 0.50), (0.3475, 0.055, -0.08), materials["accent_red"]),
        add_torus(
            0.225,
            0.018,
            (0.0, 0.40, -0.30),
            materials["accent_red"],
        ),
        add_box((0.05, 0.70, 0.05), (0.0, 0.35, -0.30), materials["accent_red"]),
        add_open_circular_frustum(
            0.225,
            0.13,
            -0.32,
            -0.68,
            (0.0, 0.40),
            materials["porcelain"],
        ),
    ]


def build_vaulting_box(materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts = []
    tier_sizes = (
        ((1.20, 0.60), (1.125, 0.555)),
        ((1.125, 0.555), (1.05, 0.51)),
        ((1.05, 0.51), (0.975, 0.465)),
        ((0.975, 0.465), (0.90, 0.42)),
    )
    for tier_index, (bottom_size, top_size) in enumerate(tier_sizes):
        z_min = tier_index * 0.225
        parts.append(
            add_rectangular_frustum(
                bottom_size,
                top_size,
                z_min,
                z_min + 0.225,
                materials["wood"],
            )
        )
    for z, size in (
        (0.225, (1.125, 0.555)),
        (0.450, (1.05, 0.51)),
        (0.675, (0.975, 0.465)),
    ):
        parts.append(
            add_box(
                (size[0], size[1], 0.012),
                (0.0, 0.0, z),
                materials["metal_dark"],
            )
        )
    parts.append(
        add_box((0.92, 0.44, 0.10), (0.0, 0.0, 0.95), materials["fabric"])
    )
    return parts


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
    local_center: tuple[float, float, float],
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    name = f"COL_Prop_{prop_type}"
    obj = add_box(size, local_center, None)
    set_origin_without_moving_geometry(obj, (0.0, 0.0, 0.0))
    obj.name = name
    obj.data.name = name
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    obj.hide_render = True
    move_to_collection(obj, collection)
    return obj


STAGE_LECTERN_TOP_Y_HALF_EXTENT = (
    0.275 * math.cos(math.radians(4.0))
    + 0.035 * math.sin(math.radians(4.0))
)
STAGE_LECTERN_TOP_Z_HALF_EXTENT = (
    0.275 * math.sin(math.radians(4.0))
    + 0.035 * math.cos(math.radians(4.0))
)
STAGE_LECTERN_COLLIDER_HEIGHT = 1.045 + STAGE_LECTERN_TOP_Z_HALF_EXTENT

COLLIDER_DIMENSIONS = {
    "ClassroomDesk": (0.65, 0.45, 0.70),
    "StaffDesk": (1.40, 0.71, 0.72),
    "StageLectern": (
        0.80,
        STAGE_LECTERN_TOP_Y_HALF_EXTENT * 2.0,
        STAGE_LECTERN_COLLIDER_HEIGHT,
    ),
    "LargeWoodTable": (1.80, 0.90, 0.72),
    "CleaningLocker": (0.90, 0.45, 1.80),
    "BaggageLocker": (1.80, 0.45, 1.20),
    "GrandPiano": (1.55, 1.45, 1.00),
    "InfirmaryBed": (2.00, 0.90, 0.55),
    "VaultingBox": (1.20, 0.60, 1.00),
    "Bookshelf": (0.90, 0.32, 1.80),
}

COLLIDER_LOCAL_CENTERS = {
    prop_type: (0.0, 0.0, COLLIDER_DIMENSIONS[prop_type][2] / 2.0)
    for prop_type in COLLIDER_TYPES
}
COLLIDER_LOCAL_CENTERS.update(
    {
        "StaffDesk": (0.0, -0.005, 0.36),
        "StageLectern": (0.0, -0.010, STAGE_LECTERN_COLLIDER_HEIGHT / 2.0),
    }
)


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


def connected_component_bounds(
    obj: bpy.types.Object,
) -> list[tuple[Vector, Vector]]:
    adjacency = [set() for _ in obj.data.vertices]
    for edge in obj.data.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)
    remaining = set(range(len(obj.data.vertices)))
    bounds = []
    while remaining:
        component = {remaining.pop()}
        pending = list(component)
        while pending:
            vertex_index = pending.pop()
            connected = adjacency[vertex_index] & remaining
            remaining.difference_update(connected)
            component.update(connected)
            pending.extend(connected)
        coordinates = [obj.data.vertices[index].co for index in component]
        bounds.append(
            (
                Vector(
                    tuple(
                        min(value[axis] for value in coordinates)
                        for axis in range(3)
                    )
                ),
                Vector(
                    tuple(
                        max(value[axis] for value in coordinates)
                        for axis in range(3)
                    )
                ),
            )
        )
    return bounds


def assert_no_coplanar_upward_overlap(obj: bpy.types.Object) -> None:
    upward_surfaces = []
    for polygon in obj.data.polygons:
        if polygon.normal.z < 0.999999:
            continue
        coordinates = [obj.data.vertices[index].co for index in polygon.vertices]
        z = coordinates[0].z
        if any(abs(vertex.z - z) > 1.0e-7 for vertex in coordinates):
            continue
        upward_surfaces.append(
            (
                polygon.index,
                z,
                min(vertex.x for vertex in coordinates),
                max(vertex.x for vertex in coordinates),
                min(vertex.y for vertex in coordinates),
                max(vertex.y for vertex in coordinates),
            )
        )
    for first_index, first in enumerate(upward_surfaces):
        for second in upward_surfaces[first_index + 1 :]:
            if abs(first[1] - second[1]) > 1.0e-7:
                continue
            overlap_x = min(first[3], second[3]) - max(first[2], second[2])
            overlap_y = min(first[5], second[5]) - max(first[4], second[4])
            if overlap_x > 1.0e-7 and overlap_y > 1.0e-7:
                raise RuntimeError(
                    "同一高さの上向き面が重複しています: "
                    f"{obj.name}/polygon={first[0]},{second[0]}/z={first[1]}"
                )


def prop_library_signature() -> str:
    library = bpy.data.collections.get(LIBRARY_COLLECTION_NAME)
    if library is None:
        raise RuntimeError(f"Collectionがありません: {LIBRARY_COLLECTION_NAME}")
    payload = {
        "version": B06_PROP_GENERATOR_VERSION,
        "objects": [],
    }
    for obj in sorted(
        (item for item in library.all_objects if item.type == "MESH"),
        key=lambda item: item.name,
    ):
        payload["objects"].append(
            {
                "name": obj.name,
                "location": [round(float(value), 9) for value in obj.location],
                "rotation": [round(float(value), 9) for value in obj.rotation_euler],
                "scale": [round(float(value), 9) for value in obj.scale],
                "materials": [
                    material.name if material is not None else None
                    for material in obj.data.materials
                ],
                "vertices": [
                    [round(float(value), 9) for value in vertex.co]
                    for vertex in obj.data.vertices
                ],
                "polygons": [
                    {
                        "vertices": list(polygon.vertices),
                        "material": polygon.material_index,
                        "smooth": bool(polygon.use_smooth),
                    }
                    for polygon in obj.data.polygons
                ],
            }
        )
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest().upper()


def validate_or_store_prop_library_signature(*, store_signature: bool) -> str:
    actual = prop_library_signature()
    scene = bpy.context.scene
    if store_signature:
        scene[B06_PROP_VERSION_PROPERTY] = B06_PROP_GENERATOR_VERSION
        scene[B06_PROP_SIGNATURE_PROPERTY] = actual
    else:
        stored_version = scene.get(B06_PROP_VERSION_PROPERTY)
        stored_signature = scene.get(B06_PROP_SIGNATURE_PROPERTY)
        if stored_version != B06_PROP_GENERATOR_VERSION:
            raise RuntimeError(
                "小物ライブラリ生成版が不一致です: "
                f"{stored_version}/{B06_PROP_GENERATOR_VERSION}"
            )
        if stored_signature != actual:
            raise RuntimeError(
                f"小物ライブラリ監査署名が不一致です: {stored_signature}/{actual}"
            )
    print(f"B06_PROP_SIGNATURE={actual}")
    return actual


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
            requires_centered_z = obj.name != "VIS_Prop_BasketballGoal"
            if abs(minimum.y) > 1.0e-5 or (
                requires_centered_z
                and abs(minimum.z + maximum.z) > 1.0e-5
            ):
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
        expected_center = Vector(COLLIDER_LOCAL_CENTERS[prop_type])
        visual_minimum, visual_maximum = local_bounds(
            bpy.data.objects[f"VIS_Prop_{prop_type}"]
        )
        collider_minimum, collider_maximum = local_bounds(obj)
        assert_vector_close(
            f"{obj.name} bounds center",
            (collider_minimum + collider_maximum) / 2.0,
            expected_center,
        )
        if any(
            collider_minimum[axis] > visual_minimum[axis] + 1.0e-6
            or collider_maximum[axis] < visual_maximum[axis] - 1.0e-6
            for axis in range(3)
        ):
            raise RuntimeError(
                f"Colliderが表示形状を包含していません: {prop_type}/"
                f"{visual_minimum}/{visual_maximum}/"
                f"{collider_minimum}/{collider_maximum}"
            )

    b06_component_counts = {
        name: connected_component_count(bpy.data.objects[name])
        for name in B06_PROP_COMPONENT_COUNTS
    }
    if b06_component_counts != B06_PROP_COMPONENT_COUNTS:
        raise RuntimeError(
            "B06-3小物の連結部品数が不一致です: "
            f"{b06_component_counts}/{B06_PROP_COMPONENT_COUNTS}"
        )

    urinal = bpy.data.objects["VIS_Prop_Urinal"]
    urinal_materials = {
        material.name: index
        for index, material in enumerate(urinal.data.materials)
        if material is not None
    }
    for required_material in (
        "MAT_Prop_Porcelain",
        "MAT_Prop_MetalDark",
        "MAT_Prop_MetalGray",
    ):
        if required_material not in urinal_materials:
            raise RuntimeError(f"小便器のMaterialが不足しています: {required_material}")
    urinal_top_annulus = [
        polygon
        for polygon in urinal.data.polygons
        if polygon.material_index == urinal_materials["MAT_Prop_Porcelain"]
        and len(polygon.vertices) == 3
        and all(
            abs(urinal.data.vertices[index].co.z - 0.14) <= 1.0e-7
            for index in polygon.vertices
        )
    ]
    if len(urinal_top_annulus) != 40:
        raise RuntimeError(
            "小便器上面が開口付きannulusではありません: "
            f"triangles={len(urinal_top_annulus)}/40"
        )

    western_toilet = bpy.data.objects["VIS_Prop_WesternToilet"]
    western_materials = {
        material.name: index
        for index, material in enumerate(western_toilet.data.materials)
        if material is not None
    }
    for required_material in (
        "MAT_Prop_Porcelain",
        "MAT_Prop_PlasticBlack",
        "MAT_Prop_MetalDark",
    ):
        if required_material not in western_materials:
            raise RuntimeError(f"洋式便器のMaterialが不足しています: {required_material}")
    seat_vertices = {
        vertex_index
        for polygon in western_toilet.data.polygons
        if polygon.material_index == western_materials["MAT_Prop_PlasticBlack"]
        for vertex_index in polygon.vertices
    }
    seat_coordinates = [
        western_toilet.data.vertices[index].co for index in seat_vertices
    ]
    assert_vector_close(
        "洋式便器の便座ring minimum",
        tuple(min(vertex[axis] for vertex in seat_coordinates) for axis in range(3)),
        (-0.195, -0.345, 0.50),
        1.0e-6,
    )
    assert_vector_close(
        "洋式便器の便座ring maximum",
        tuple(max(vertex[axis] for vertex in seat_coordinates) for axis in range(3)),
        (0.195, 0.185, 0.54),
        1.0e-6,
    )

    grand_piano = bpy.data.objects["VIS_Prop_GrandPiano"]
    piano_components = connected_component_bounds(grand_piano)
    piano_white_keys = [
        bounds
        for bounds in piano_components
        if abs(bounds[0].z - 0.75) <= 1.0e-6
        and abs(bounds[1].z - 0.78) <= 1.0e-6
        and abs((bounds[1].y - bounds[0].y) - 0.255) <= 1.0e-6
    ]
    piano_black_keys = [
        bounds
        for bounds in piano_components
        if abs(bounds[0].z - 0.78) <= 1.0e-6
        and abs(bounds[1].z - 0.82) <= 1.0e-6
        and abs((bounds[1].y - bounds[0].y) - 0.155) <= 1.0e-6
    ]
    piano_legs = [
        bounds
        for bounds in piano_components
        if abs(bounds[0].z) <= 1.0e-6
        and abs(bounds[1].z - 0.75) <= 1.0e-6
        and abs((bounds[1].x - bounds[0].x) - 0.07) <= 1.0e-6
        and abs((bounds[1].y - bounds[0].y) - 0.07) <= 1.0e-6
    ]
    piano_support_rods = [
        bounds
        for bounds in piano_components
        if abs(bounds[0].z - 0.22) <= 1.0e-6
        and abs(bounds[1].z - 0.75) <= 1.0e-6
        and abs((bounds[1].x - bounds[0].x) - 0.035) <= 1.0e-6
    ]
    if (
        len(piano_white_keys) != 14
        or len(piano_black_keys) != 10
        or len(piano_legs) != 3
        or len(piano_support_rods) != 2
    ):
        raise RuntimeError(
            "グランドピアノの鍵盤・脚・支持棒が不足しています: "
            f"white={len(piano_white_keys)}, black={len(piano_black_keys)}, "
            f"legs={len(piano_legs)}, rods={len(piano_support_rods)}"
        )
    piano_materials = {
        material.name: index
        for index, material in enumerate(grand_piano.data.materials)
        if material is not None
    }
    for required_material in (
        "MAT_Prop_KeyWhite",
        "MAT_Prop_PedalBrass",
        "MAT_Prop_PlasticBlack",
    ):
        if required_material not in piano_materials:
            raise RuntimeError(
                f"グランドピアノのMaterialが不足しています: {required_material}"
            )
    white_key_material_index = piano_materials["MAT_Prop_KeyWhite"]
    brass_material_index = piano_materials["MAT_Prop_PedalBrass"]
    if sum(
        polygon.material_index == white_key_material_index
        for polygon in grand_piano.data.polygons
    ) != 56:
        raise RuntimeError("グランドピアノ白鍵14基が専用白Materialではありません")
    if sum(
        polygon.material_index == brass_material_index
        for polygon in grand_piano.data.polygons
    ) != 12:
        raise RuntimeError("グランドピアノのペダル2基が専用真鍮Materialではありません")
    if visual_triangles[grand_piano.name] != 320:
        raise RuntimeError(
            "グランドピアノの三角形数が造形契約と一致しません: "
            f"{visual_triangles[grand_piano.name]}/320"
        )
    assert_no_coplanar_upward_overlap(grand_piano)

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

    cleaning_locker = bpy.data.objects["VIS_Prop_CleaningLocker"]
    cleaning_components = connected_component_bounds(cleaning_locker)
    if len(cleaning_components) != 10:
        raise RuntimeError(
            "掃除ロッカーの本体＋正面ディテール9部品が揃っていません: "
            f"{len(cleaning_components)}/10"
        )
    cleaning_body_index = max(
        range(len(cleaning_components)),
        key=lambda index: math.prod(
            cleaning_components[index][1][axis]
            - cleaning_components[index][0][axis]
            for axis in range(3)
        ),
    )
    cleaning_body = cleaning_components[cleaning_body_index]
    assert_vector_close(
        "掃除ロッカー本体minimum",
        cleaning_body[0],
        (-0.45, -0.223, 0.0),
        1.0e-6,
    )
    assert_vector_close(
        "掃除ロッカー本体maximum",
        cleaning_body[1],
        (0.45, 0.225, 1.8),
        1.0e-6,
    )
    cleaning_detail_bounds = [
        bounds
        for index, bounds in enumerate(cleaning_components)
        if index != cleaning_body_index
    ]
    if any(
        abs(minimum.y + 0.225) > 1.0e-6
        or abs(maximum.y + 0.225) > 1.0e-6
        for minimum, maximum in cleaning_detail_bounds
    ):
        raise RuntimeError("掃除ロッカーの正面ディテールが前面quadではありません")
    if visual_triangles[cleaning_locker.name] != 30:
        raise RuntimeError(
            "掃除ロッカーの三角形数が不正です: "
            f"{visual_triangles[cleaning_locker.name]}/30"
        )

    pc_monitor = bpy.data.objects["VIS_Prop_PcMonitor"]
    pc_monitor_components = connected_component_bounds(pc_monitor)
    screen_bounds = [
        bounds
        for bounds in pc_monitor_components
        if all(
            abs((bounds[1][axis] - bounds[0][axis]) - expected) <= 1.0e-6
            for axis, expected in enumerate((0.49, 0.0, 0.265))
        )
    ]
    if len(screen_bounds) != 1 or any(
        abs(screen_bounds[0][side].y) > 1.0e-6 for side in (0, 1)
    ):
        raise RuntimeError("PCモニター画面が筐体前面のquadではありません")
    if visual_triangles[pc_monitor.name] != 38:
        raise RuntimeError(
            "PCモニターの三角形数が不正です: "
            f"{visual_triangles[pc_monitor.name]}/38"
        )

    classroom_chair = bpy.data.objects["VIS_Prop_ClassroomChair"]
    wood_indices = {
        index
        for index, material in enumerate(classroom_chair.data.materials)
        if material.name == "MAT_Prop_Wood"
    }
    metal_indices = {
        index
        for index, material in enumerate(classroom_chair.data.materials)
        if material.name == "MAT_Prop_MetalGray"
    }
    back_vertex_indices = {
        vertex_index
        for polygon in classroom_chair.data.polygons
        if polygon.material_index in wood_indices
        and max(classroom_chair.data.vertices[index].co.z for index in polygon.vertices)
        > 0.5
        for vertex_index in polygon.vertices
    }
    back_vertices = [
        classroom_chair.data.vertices[index].co for index in back_vertex_indices
    ]
    chair_back_bounds = (
        tuple(min(vertex[axis] for vertex in back_vertices) for axis in range(3)),
        tuple(max(vertex[axis] for vertex in back_vertices) for axis in range(3)),
    )
    assert_vector_close(
        "木製椅子背板minimum", chair_back_bounds[0], (-0.21, 0.165, 0.52), 1.0e-6
    )
    assert_vector_close(
        "木製椅子背板maximum", chair_back_bounds[1], (0.21, 0.225, 0.78), 1.0e-6
    )
    metal_vertex_indices = {
        vertex_index
        for polygon in classroom_chair.data.polygons
        if polygon.material_index in metal_indices
        for vertex_index in polygon.vertices
    }
    metal_top = max(
        classroom_chair.data.vertices[index].co.z for index in metal_vertex_indices
    )
    if abs(metal_top - 0.77) > 1.0e-6:
        raise RuntimeError(f"木製椅子背面支柱の上端が不正です: {metal_top}")

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
    if len(used_materials) > 12:
        raise RuntimeError(f"Material予算超過です: {len(used_materials)}/12")

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
        "b06PropComponents": b06_component_counts,
        "grandPianoWhiteKeys": len(piano_white_keys),
        "grandPianoBlackKeys": len(piano_black_keys),
        "grandPianoLegs": len(piano_legs),
        "grandPianoSupportRods": len(piano_support_rods),
        "cleaningLockerComponents": len(cleaning_components),
        "cleaningLockerTriangles": visual_triangles[cleaning_locker.name],
        "pcMonitorComponents": len(pc_monitor_components),
        "pcMonitorTriangles": visual_triangles[pc_monitor.name],
        "classroomChairBackBounds": chair_back_bounds,
        "classroomChairMetalTop": metal_top,
        "dimensions": {
            obj.name: [round(float(value), 6) for value in obj.dimensions] for obj in visuals
        },
    }
    print("B03_PROP_AUDIT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    return result


def configure_scene() -> None:
    scene = bpy.context.scene
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.preferences.filepaths.use_file_compression = False
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
            COLLIDER_LOCAL_CENTERS[prop_type],
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
    validate_or_store_prop_library_signature(store_signature=True)
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
    validate_or_store_prop_library_signature(store_signature=False)
    if arguments.mode == "reexport":
        export_library(arguments.glb_output)
        print(f"B03_PROP_GLB={arguments.glb_output}")


if __name__ == "__main__":
    main()
