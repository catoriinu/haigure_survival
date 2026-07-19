from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
PROP_LIBRARY_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B03/b03_school_prop_library.blend"
)

VIS_COLLECTION_NAME = "B02_VIS"
COL_COLLECTION_NAME = "B02_COL"
NAV_COLLECTION_NAME = "B02_NAV"
SEMANTIC_COLLECTION_NAME = "B02_SEMANTIC"
EXPORT_COLLECTION_NAME = "EXP_Stage_school"

WINDOW_UNIT_CLEAR_WIDTH = 2.40
SCHOOL_WINDOW_CLEAR_HEIGHT = 1.80
GYM_WINDOW_CLEAR_HEIGHT = 2.40
WINDOW_FRAME_BORDER = 0.08
WINDOW_MEETING_STILE_WIDTH = 0.06
WALL_THICKNESS = 0.30
LINK_RADIUS_METERS = 0.54
GENERATOR_VERSION = "b03-1-architecture-v4"
GENERATOR_VERSION_PROPERTY = "b03_architecture_generator_version"
GENERATOR_SIGNATURE_PROPERTY = "b03_architecture_generator_signature"

GENERATED_PREFIXES = (
    "VIS_B03_",
    "COL_B03_",
    "NAV_B03_",
    "VIS_WindowFrame_",
    "VIS_WindowGlass_",
    "COL_ActorOnly_Window_",
    "COL_ActorOnly_WindowFixed_",
    "COL_HumanOnly_Window_",
    "LNK_bit-window-",
    "LNK_bit-roof-",
    "VOL_PoolWater",
)

GENERATED_EXACT_NAMES = {
    "NAV_Walkable_Interior2F",
    "NAV_Walkable_Interior3F",
    "NAV_Walkable_Interior4F",
    "NAV_Walkable_StairsNWUpper",
    "NAV_Walkable_Rooftop",
    "NAV_Blocker_SchoolUpper",
}

SOURCE_OBJECTS_TO_REMOVE = {
    "VIS_WindowGuide_1F_Courtyard_1",
    "VIS_WindowGuide_1F_Courtyard_2",
    "VIS_WindowGuide_1F_Courtyard_3",
    "VIS_WindowGuide_1F_North_1",
    "VIS_WindowGuide_1F_North_2",
    "VIS_WindowGuide_1F_North_3",
    "VIS_WindowGuide_1F_North_4",
    "VIS_WindowGuide_1F_North_5",
    "VIS_WindowGuide_1F_NorthWingEast",
    "VIS_WindowGuide_1F_NorthWingWest",
    "VIS_WindowGuide_1F_WestCourtyard_1",
    "VIS_WindowGuide_1F_WestCourtyard_2",
    "VIS_WindowGuide_1F_WestCourtyard_3",
    "VIS_WindowGuide_1F_WestOuter_1",
    "VIS_WindowGuide_1F_WestOuter_2",
    "VIS_WindowGuide_1F_WestOuter_3",
    "VIS_WindowGuide_1F_WestSouth_1",
    "VIS_WindowGuide_1F_WestSouth_2",
    "VIS_PoolWaterPlaceholder",
}

for floor in (2, 3, 4):
    SOURCE_OBJECTS_TO_REMOVE.update(
        {
            f"VIS_{floor}F_NorthVolume",
            f"VIS_{floor}F_WestVolume",
            f"COL_{floor}F_NorthVolume",
            f"COL_{floor}F_WestVolume",
        }
    )
    for band, count in (
        ("Courtyard", 3),
        ("North", 5),
        ("West", 5),
        ("WestCourtyard", 3),
        ("WestSouth", 2),
    ):
        for index in range(1, count + 1):
            SOURCE_OBJECTS_TO_REMOVE.add(
                f"VIS_WindowGuide_{floor}F_{band}_{index}"
            )

for side in ("East", "North", "South", "West"):
    for index in range(1, 4):
        SOURCE_OBJECTS_TO_REMOVE.add(f"VIS_WindowGuide_GymUpper_{side}_{index}")

for prefix in ("VIS_", "COL_"):
    SOURCE_OBJECTS_TO_REMOVE.update(
        {
            f"{prefix}Wall1F_CourtyardNorth_Left",
            f"{prefix}Wall1F_CourtyardNorth_Right",
            f"{prefix}Wall1F_CourtyardWest_North",
            f"{prefix}Wall1F_CourtyardWest_South",
            f"{prefix}Wall1F_EastNorth",
            f"{prefix}Wall1F_NorthLeft",
            f"{prefix}Wall1F_NorthRight",
            f"{prefix}Wall1F_NorthWingWestOuter",
            f"{prefix}Wall1F_SouthFull",
            f"{prefix}Wall1F_WestOuter",
            f"{prefix}Wall_Lintel_MainEntry",
            f"{prefix}Wall_Lintel_NorthEntry",
            f"{prefix}Wall_Lintel_NorthWingBridge",
            f"{prefix}Wall_Lintel_NorthWingSouthEntry",
            f"{prefix}GymWall_East",
            f"{prefix}GymWall_Lintel_Bridge",
            f"{prefix}GymWall_Lintel_Courtyard",
            f"{prefix}GymWall_Lintel_StorageDoor",
            f"{prefix}GymWall_North_Left",
            f"{prefix}GymWall_North_RightA",
            f"{prefix}GymWall_North_RightB",
            f"{prefix}GymWall_WestMiddle",
            f"{prefix}GymWall_WestSouth",
        }
    )


@dataclass(frozen=True)
class WindowSpec:
    suffix: str
    link_id: str
    floor: int
    wall_key: str
    axis: str
    fixed: float
    horizontal_center: float
    z_center: float
    outward: tuple[float, float, float]
    is_open: bool
    unit_count: int
    clear_height: float


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def require_source_file() -> None:
    actual = Path(bpy.data.filepath).resolve()
    expected = BLEND_PATH.resolve()
    if actual != expected:
        raise RuntimeError(f"B03-1対象外のBlenderファイルです: {actual}")
    if not PROP_LIBRARY_PATH.exists():
        raise RuntimeError(f"B03-P小物ライブラリがありません: {PROP_LIBRARY_PATH}")


def collection(name: str) -> bpy.types.Collection:
    result = bpy.data.collections.get(name)
    if result is None:
        raise RuntimeError(f"必須Collectionがありません: {name}")
    return result


def unlink_and_remove_object(obj: bpy.types.Object) -> None:
    data = obj.data if obj.type == "MESH" else None
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is not None and data.users == 0:
        bpy.data.meshes.remove(data)


def clear_generated_objects() -> None:
    for obj in list(bpy.data.objects):
        if (
            obj.name in SOURCE_OBJECTS_TO_REMOVE
            or obj.name in GENERATED_EXACT_NAMES
            or obj.name.startswith(GENERATED_PREFIXES)
        ):
            unlink_and_remove_object(obj)
    remove_unused_prop_material_duplicates()


def remove_unused_prop_material_duplicates() -> None:
    duplicate_material_pattern = re.compile(r"^MAT_Prop_.+\.\d{3}$")
    for material in list(bpy.data.materials):
        if material.users == 0 and duplicate_material_pattern.match(material.name):
            bpy.data.materials.remove(material)


def move_to_collection(
    obj: bpy.types.Object, target: bpy.types.Collection
) -> bpy.types.Object:
    for source in list(obj.users_collection):
        source.objects.unlink(obj)
    target.objects.link(obj)
    return obj


def append_box(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int, int]],
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
) -> None:
    x0, y0, z0 = minimum
    x1, y1, z1 = maximum
    if x1 <= x0 or y1 <= y0 or z1 <= z0:
        raise RuntimeError(f"不正なbox境界です: {minimum} -> {maximum}")
    offset = len(vertices)
    vertices.extend(
        [
            (x0, y0, z0),
            (x1, y0, z0),
            (x1, y1, z0),
            (x0, y1, z0),
            (x0, y0, z1),
            (x1, y0, z1),
            (x1, y1, z1),
            (x0, y1, z1),
        ]
    )
    faces.extend(
        [
            (offset + 0, offset + 3, offset + 2, offset + 1),
            (offset + 4, offset + 5, offset + 6, offset + 7),
            (offset + 0, offset + 1, offset + 5, offset + 4),
            (offset + 1, offset + 2, offset + 6, offset + 5),
            (offset + 2, offset + 3, offset + 7, offset + 6),
            (offset + 3, offset + 0, offset + 4, offset + 7),
        ]
    )


def create_mesh_object(
    name: str,
    boxes: list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    target_collection: bpy.types.Collection,
    material: bpy.types.Material | None = None,
    properties: dict[str, object] | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for minimum, maximum in boxes:
        append_box(vertices, faces, minimum, maximum)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    for key, value in (properties or {}).items():
        obj[key] = value
    return obj


def create_empty(
    name: str,
    position: tuple[float, float, float],
    target_collection: bpy.types.Collection,
    properties: dict[str, object],
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.18
    obj.location = position
    target_collection.objects.link(obj)
    for key, value in properties.items():
        obj[key] = value
    return obj


def existing_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        raise RuntimeError(f"既存Materialがありません: {name}")
    return material


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.55,
    alpha_blend: bool = False,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    node = material.node_tree.nodes.get("Principled BSDF")
    if node is not None:
        node.inputs["Base Color"].default_value = color
        node.inputs["Metallic"].default_value = metallic
        node.inputs["Roughness"].default_value = roughness
        node.inputs["Alpha"].default_value = color[3]
    if alpha_blend and hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    return material


def build_window_specs() -> list[WindowSpec]:
    specs: list[WindowSpec] = []
    open_indices = {
        1: {1, 4, 6, 9, 12, 15, 17},
        2: {0, 3, 5, 8, 11, 14, 16},
        3: {2, 4, 7, 10, 12, 15, 17},
        4: {0, 2, 5, 7, 9, 12, 14, 17},
    }

    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 6.6), (4, 9.6)):
        entries: list[
            tuple[str, str, str, float, float, tuple[float, float, float]]
        ] = []
        if floor == 1:
            entries.extend(
                [
                    ("Courtyard_01", "CourtyardNorth", "X", 32.5, 11.4, (0, -1, 0)),
                    ("Courtyard_02", "CourtyardNorth", "X", 32.5, 23.4, (0, -1, 0)),
                    ("Courtyard_03", "CourtyardNorth", "X", 32.5, 35.4, (0, -1, 0)),
                    ("North_01", "North", "X", 45.5, -3.6, (0, 1, 0)),
                    ("North_02", "North", "X", 45.5, 8.4, (0, 1, 0)),
                    ("North_03", "North", "X", 45.5, 20.4, (0, 1, 0)),
                    ("North_04", "North", "X", 45.5, 32.4, (0, 1, 0)),
                    ("North_05", "North", "X", 45.5, 44.4, (0, 1, 0)),
                    ("East_01", "East", "Y", 47.4, 39.0, (1, 0, 0)),
                    ("WestNorth_01", "WestOuter", "Y", -12.6, 39.0, (-1, 0, 0)),
                    ("WestCourtyard_01", "CourtyardWest", "Y", 0.0, 7.5, (1, 0, 0)),
                    ("WestCourtyard_02", "CourtyardWest", "Y", 0.0, 17.5, (1, 0, 0)),
                    ("WestCourtyard_03", "CourtyardWest", "Y", 0.0, 27.5, (1, 0, 0)),
                    ("WestOuter_01", "WestOuter", "Y", -12.6, 7.5, (-1, 0, 0)),
                    ("WestOuter_02", "WestOuter", "Y", -12.6, 17.5, (-1, 0, 0)),
                    ("WestOuter_03", "WestOuter", "Y", -12.6, 27.5, (-1, 0, 0)),
                    ("South_01", "South", "X", -3.5, -9.5, (0, -1, 0)),
                    ("South_02", "South", "X", -3.5, -4.0, (0, -1, 0)),
                ]
            )
        else:
            entries.extend(
                [
                    ("Courtyard_01", "CourtyardNorth", "X", 32.5, 11.4, (0, -1, 0)),
                    ("Courtyard_02", "CourtyardNorth", "X", 32.5, 23.4, (0, -1, 0)),
                    ("Courtyard_03", "CourtyardNorth", "X", 32.5, 35.4, (0, -1, 0)),
                    ("North_01", "North", "X", 45.5, -3.6, (0, 1, 0)),
                    ("North_02", "North", "X", 45.5, 8.4, (0, 1, 0)),
                    ("North_03", "North", "X", 45.5, 20.4, (0, 1, 0)),
                    ("North_04", "North", "X", 45.5, 32.4, (0, 1, 0)),
                    ("North_05", "North", "X", 45.5, 44.4, (0, 1, 0)),
                    ("West_01", "WestOuter", "Y", -12.6, 3.5, (-1, 0, 0)),
                    ("West_02", "WestOuter", "Y", -12.6, 12.5, (-1, 0, 0)),
                    ("West_03", "WestOuter", "Y", -12.6, 21.5, (-1, 0, 0)),
                    ("West_04", "WestOuter", "Y", -12.6, 30.5, (-1, 0, 0)),
                    ("West_05", "WestOuter", "Y", -12.6, 39.5, (-1, 0, 0)),
                    ("WestCourtyard_01", "CourtyardWest", "Y", 0.0, 7.5, (1, 0, 0)),
                    ("WestCourtyard_02", "CourtyardWest", "Y", 0.0, 17.5, (1, 0, 0)),
                    ("WestCourtyard_03", "CourtyardWest", "Y", 0.0, 27.5, (1, 0, 0)),
                    ("South_01", "South", "X", -3.5, -9.5, (0, -1, 0)),
                    ("South_02", "South", "X", -3.5, -4.0, (0, -1, 0)),
                ]
            )
        for index, (label, wall, axis, fixed, horizontal, outward) in enumerate(
            entries
        ):
            if wall == "North":
                unit_count = 3 if label in {"North_01", "North_02"} else 4
                if label == "North_05":
                    unit_count = 2
            elif wall == "CourtyardNorth":
                unit_count = 3 if floor == 1 and label == "Courtyard_03" else 4
            elif wall in {"WestOuter", "CourtyardWest", "East"}:
                unit_count = 3
            else:
                unit_count = 2
            suffix = f"F{floor:02d}_{label}"
            specs.append(
                WindowSpec(
                    suffix=suffix,
                    link_id=f"bit-window-f{floor:02d}-{label.lower().replace('_', '-')}",
                    floor=floor,
                    wall_key=wall,
                    axis=axis,
                    fixed=fixed,
                    horizontal_center=horizontal,
                    z_center=base_z + 1.7,
                    outward=outward,
                    is_open=index in open_indices[floor],
                    unit_count=unit_count,
                    clear_height=SCHOOL_WINDOW_CLEAR_HEIGHT,
                )
            )

    gym_entries = [
        ("Gym_East_01", "GymEast", "Y", 57.4, -2.5, (1, 0, 0), True),
        ("Gym_East_02", "GymEast", "Y", 57.4, 8.5, (1, 0, 0), False),
        ("Gym_East_03", "GymEast", "Y", 57.4, 19.5, (1, 0, 0), True),
        ("Gym_West_01", "GymWest", "Y", 33.4, -2.5, (-1, 0, 0), False),
        ("Gym_West_02", "GymWest", "Y", 33.4, 12.5, (-1, 0, 0), True),
        ("Gym_West_03", "GymWest", "Y", 33.4, 21.5, (-1, 0, 0), False),
        ("Gym_North_01", "GymNorth", "X", 26.5, 37.2, (0, 1, 0), False),
        ("Gym_North_02", "GymNorth", "X", 26.5, 45.5, (0, 1, 0), True),
        ("Gym_North_03", "GymNorth", "X", 26.5, 53.5, (0, 1, 0), False),
    ]
    for label, wall, axis, fixed, horizontal, outward, is_open in gym_entries:
        specs.append(
            WindowSpec(
                suffix=label,
                link_id=f"bit-window-{label.lower().replace('_', '-')}",
                floor=0,
                wall_key=wall,
                axis=axis,
                fixed=fixed,
                horizontal_center=horizontal,
                z_center=7.1,
                outward=outward,
                is_open=is_open,
                unit_count=3,
                clear_height=GYM_WINDOW_CLEAR_HEIGHT,
            )
        )
    return specs


def wall_boxes(
    axis: str,
    fixed: float,
    horizontal_min: float,
    horizontal_max: float,
    z_min: float,
    z_max: float,
    openings: list[tuple[float, float, float, float]],
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    h_edges = {horizontal_min, horizontal_max}
    z_edges = {z_min, z_max}
    clipped: list[tuple[float, float, float, float]] = []
    for h0, h1, o_z0, o_z1 in openings:
        h0 = max(horizontal_min, h0)
        h1 = min(horizontal_max, h1)
        o_z0 = max(z_min, o_z0)
        o_z1 = min(z_max, o_z1)
        if h0 < h1 and o_z0 < o_z1:
            clipped.append((h0, h1, o_z0, o_z1))
            h_edges.update((h0, h1))
            z_edges.update((o_z0, o_z1))
    sorted_h = sorted(h_edges)
    sorted_z = sorted(z_edges)
    boxes = []
    half = WALL_THICKNESS / 2.0
    for h0, h1 in zip(sorted_h, sorted_h[1:]):
        for cell_z0, cell_z1 in zip(sorted_z, sorted_z[1:]):
            h_mid = (h0 + h1) / 2.0
            z_mid = (cell_z0 + cell_z1) / 2.0
            if any(
                o_h0 < h_mid < o_h1 and o_z0 < z_mid < o_z1
                for o_h0, o_h1, o_z0, o_z1 in clipped
            ):
                continue
            if axis == "X":
                boxes.append(((h0, fixed - half, cell_z0), (h1, fixed + half, cell_z1)))
            else:
                boxes.append(((fixed - half, h0, cell_z0), (fixed + half, h1, cell_z1)))
    return boxes


def window_opening(spec: WindowSpec) -> tuple[float, float, float, float]:
    outer_half_width = window_clear_width(spec) / 2 + WINDOW_FRAME_BORDER
    outer_half_height = spec.clear_height / 2 + WINDOW_FRAME_BORDER
    return (
        spec.horizontal_center - outer_half_width,
        spec.horizontal_center + outer_half_width,
        spec.z_center - outer_half_height,
        spec.z_center + outer_half_height,
    )


def window_clear_width(spec: WindowSpec) -> float:
    return spec.unit_count * WINDOW_UNIT_CLEAR_WIDTH


def open_leaf_index(spec: WindowSpec) -> int:
    unit_index = (spec.unit_count - 1) // 2
    opens_left = sum(ord(character) for character in spec.suffix) % 2 == 0
    return unit_index * 2 + (0 if opens_left else 1)


def window_leaf_center(spec: WindowSpec, leaf_index: int) -> float:
    left = spec.horizontal_center - window_clear_width(spec) / 2
    leaf_width = WINDOW_UNIT_CLEAR_WIDTH / 2
    return left + (leaf_index + 0.5) * leaf_width


def window_frame_boxes(
    spec: WindowSpec,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    half_w = window_clear_width(spec) / 2
    half_h = spec.clear_height / 2
    border = WINDOW_FRAME_BORDER
    depth = 0.20
    h = spec.horizontal_center
    z = spec.z_center
    boxes = []
    if spec.axis == "X":
        boxes.extend(
            [
            ((h - half_w - border, spec.fixed - depth / 2, z - half_h - border), (h + half_w + border, spec.fixed + depth / 2, z - half_h)),
            ((h - half_w - border, spec.fixed - depth / 2, z + half_h), (h + half_w + border, spec.fixed + depth / 2, z + half_h + border)),
            ((h - half_w - border, spec.fixed - depth / 2, z - half_h), (h - half_w, spec.fixed + depth / 2, z + half_h)),
            ((h + half_w, spec.fixed - depth / 2, z - half_h), (h + half_w + border, spec.fixed + depth / 2, z + half_h)),
            ]
        )
    else:
        boxes.extend(
            [
                ((spec.fixed - depth / 2, h - half_w - border, z - half_h - border), (spec.fixed + depth / 2, h + half_w + border, z - half_h)),
                ((spec.fixed - depth / 2, h - half_w - border, z + half_h), (spec.fixed + depth / 2, h + half_w + border, z + half_h + border)),
                ((spec.fixed - depth / 2, h - half_w - border, z - half_h), (spec.fixed + depth / 2, h - half_w, z + half_h)),
                ((spec.fixed - depth / 2, h + half_w, z - half_h), (spec.fixed + depth / 2, h + half_w + border, z + half_h)),
            ]
        )
    leaf_width = WINDOW_UNIT_CLEAR_WIDTH / 2
    for divider_index in range(1, spec.unit_count * 2):
        divider = h - half_w + divider_index * leaf_width
        divider_width = (
            WINDOW_MEETING_STILE_WIDTH if divider_index % 2 else WINDOW_FRAME_BORDER
        )
        if spec.axis == "X":
            boxes.append(
                ((divider - divider_width / 2, spec.fixed - depth / 2, z - half_h), (divider + divider_width / 2, spec.fixed + depth / 2, z + half_h))
            )
        else:
            boxes.append(
                ((spec.fixed - depth / 2, divider - divider_width / 2, z - half_h), (spec.fixed + depth / 2, divider + divider_width / 2, z + half_h))
            )
    return boxes


def window_panel_box(
    spec: WindowSpec,
    horizontal_center: float,
    width: float,
    height: float,
    depth: float,
    normal_offset: float = 0.0,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    half_w = width / 2
    half_h = height / 2
    h = horizontal_center
    z = spec.z_center
    if spec.axis == "X":
        return (
            (h - half_w, spec.fixed + normal_offset - depth / 2, z - half_h),
            (h + half_w, spec.fixed + normal_offset + depth / 2, z + half_h),
        )
    return (
        (spec.fixed + normal_offset - depth / 2, h - half_w, z - half_h),
        (spec.fixed + normal_offset + depth / 2, h + half_w, z + half_h),
    )


def window_full_plane_box(
    spec: WindowSpec, depth: float
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    return window_panel_box(
        spec,
        spec.horizontal_center,
        window_clear_width(spec),
        spec.clear_height,
        depth,
    )


def closed_leaf_boxes(
    spec: WindowSpec, depth: float
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    leaf_width = WINDOW_UNIT_CLEAR_WIDTH / 2
    skipped_leaf = open_leaf_index(spec) if spec.is_open else -1
    return [
        window_panel_box(
            spec,
            window_leaf_center(spec, leaf_index),
            leaf_width,
            spec.clear_height,
            depth,
        )
        for leaf_index in range(spec.unit_count * 2)
        if leaf_index != skipped_leaf
    ]


def window_glass_boxes(
    spec: WindowSpec,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    boxes = closed_leaf_boxes(spec, 0.025)
    if spec.is_open:
        moved_leaf = open_leaf_index(spec)
        stacked_leaf = moved_leaf + 1 if moved_leaf % 2 == 0 else moved_leaf - 1
        boxes.append(
            window_panel_box(
                spec,
                window_leaf_center(spec, stacked_leaf),
                WINDOW_UNIT_CLEAR_WIDTH / 2,
                spec.clear_height,
                0.025,
                normal_offset=0.035,
            )
        )
    return boxes


def build_school_exterior(
    specs: list[WindowSpec],
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    wall_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    generated_colliders: list[bpy.types.Object] = []
    walls = {
        "WestOuter": ("Y", -12.6, -3.5, 45.5),
        "North": ("X", 45.5, -12.6, 47.4),
        "East": ("Y", 47.4, 32.5, 45.5),
        "CourtyardNorth": ("X", 32.5, 0.0, 47.4),
        "CourtyardWest": ("Y", 0.0, -3.5, 32.5),
        "South": ("X", -3.5, -12.6, 0.0),
    }
    floor_ranges = {1: (0.0, 3.0), 2: (3.6, 6.6), 3: (6.6, 9.6), 4: (9.6, 12.6)}
    door_openings = {
        (1, "North"): [(2.4, 5.4, 0.0, 2.4)],
        (1, "CourtyardNorth"): [
            (0.15, 5.4, 0.0, 2.4),
            (39.4, 43.4, 0.0, 2.4),
        ],
        (1, "CourtyardWest"): [(-2.5, 2.5, 0.0, 2.4)],
    }
    for floor, (z0, z1) in floor_ranges.items():
        visual_boxes = []
        collider_boxes = []
        for wall_key, (axis, fixed, h0, h1) in walls.items():
            openings = [
                window_opening(spec)
                for spec in specs
                if spec.floor == floor and spec.wall_key == wall_key
            ]
            openings.extend(door_openings.get((floor, wall_key), []))
            boxes = wall_boxes(axis, fixed, h0, h1, z0, z1, openings)
            visual_boxes.extend(boxes)
            collider_boxes.extend(boxes)
        create_mesh_object(
            f"VIS_B03_ExteriorWalls_F{floor:02d}",
            visual_boxes,
            visual_collection,
            wall_material,
        )
        collider = create_mesh_object(
            f"COL_B03_ExteriorWalls_F{floor:02d}",
            collider_boxes,
            collider_collection,
        )
        generated_colliders.append(collider)
    return generated_colliders


def build_gym_exterior(
    specs: list[WindowSpec],
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    wall_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    definitions = {
        "GymEast": ("Y", 57.4, -9.5, 26.5, []),
        "GymWest": ("Y", 33.4, -9.5, 26.5, [(5.0, 8.0, 0.0, 2.4)]),
        "GymNorth": (
            "X",
            26.5,
            33.4,
            57.4,
            [(39.4, 43.4, 0.0, 2.4), (53.65, 55.15, 0.0, 2.3)],
        ),
    }
    visual_boxes = []
    collider_boxes = []
    for wall_key, (axis, fixed, h0, h1, doors) in definitions.items():
        openings = [
            window_opening(spec) for spec in specs if spec.wall_key == wall_key
        ]
        openings.extend(doors)
        boxes = wall_boxes(axis, fixed, h0, h1, 0.0, 9.0, openings)
        visual_boxes.extend(boxes)
        collider_boxes.extend(boxes)
    create_mesh_object(
        "VIS_B03_GymExteriorWalls",
        visual_boxes,
        visual_collection,
        wall_material,
    )
    return [
        create_mesh_object(
            "COL_B03_GymExteriorWalls", collider_boxes, collider_collection
        )
    ]


def build_upper_floors_and_rooms(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    floor_material: bpy.types.Material,
    wall_material: bpy.types.Material,
    accent_materials: dict[int, bpy.types.Material],
    door_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    generated_colliders: list[bpy.types.Object] = []
    floor_panels_xy = [
        ((-12.6, -3.5), (0.0, 32.5)),
        ((-6.6, 32.5), (47.4, 45.5)),
        ((-12.6, 32.5), (-6.6, 38.9)),
        ((-12.6, 43.1), (-6.6, 45.5)),
    ]
    for floor, base_z in ((2, 3.6), (3, 6.6), (4, 9.6)):
        floor_boxes = [
            ((xy0[0], xy0[1], base_z - 0.15), (xy1[0], xy1[1], base_z))
            for xy0, xy1 in floor_panels_xy
        ]
        create_mesh_object(
            f"VIS_B03_Floor_F{floor:02d}",
            floor_boxes,
            visual_collection,
            floor_material,
        )
        generated_colliders.append(
            create_mesh_object(
                f"COL_B03_Floor_F{floor:02d}", floor_boxes, collider_collection
            )
        )

        if floor in (2, 3):
            ceiling_z = base_z + 3.0
            ceiling_boxes = [
                ((xy0[0], xy0[1], ceiling_z - 0.15), (xy1[0], xy1[1], ceiling_z))
                for xy0, xy1 in floor_panels_xy
            ]
            create_mesh_object(
                f"VIS_B03_Ceiling_F{floor:02d}",
                ceiling_boxes,
                visual_collection,
                wall_material,
            )
            generated_colliders.append(
                create_mesh_object(
                    f"COL_B03_Ceiling_F{floor:02d}",
                    ceiling_boxes,
                    collider_collection,
                )
            )

        z0, z1 = base_z, base_z + 3.0
        internal_boxes = []
        west_doors = [
            (3.5, 4.7, z0, z0 + 2.3),
            (13.1, 14.3, z0, z0 + 2.3),
            (21.9, 23.1, z0, z0 + 2.3),
            (30.7, 31.9, z0, z0 + 2.3),
        ]
        internal_boxes.extend(
            wall_boxes("Y", -3.5, 2.5, 32.5, z0, z1, west_doors)
        )
        north_doors = [
            (6.0, 7.2, z0, z0 + 2.3),
            (21.6, 22.8, z0, z0 + 2.3),
            (24.0, 25.2, z0, z0 + 2.3),
            (39.6, 40.8, z0, z0 + 2.3),
        ]
        internal_boxes.extend(
            wall_boxes("X", 36.5, -6.6, 41.4, z0, z1, north_doors)
        )
        for divider_y in (12.5, 22.5):
            internal_boxes.append(
                ((-12.6, divider_y - 0.15, z0), (-3.5, divider_y + 0.15, z1))
            )
        north_dividers = (14.4, 23.4) if floor == 2 else (23.4,)
        for divider_x in north_dividers:
            internal_boxes.append(
                ((divider_x - 0.15, 36.5, z0), (divider_x + 0.15, 45.5, z1))
            )
        create_mesh_object(
            f"VIS_B03_InteriorWalls_F{floor:02d}",
            internal_boxes,
            visual_collection,
            wall_material,
        )
        generated_colliders.append(
            create_mesh_object(
                f"COL_B03_InteriorWalls_F{floor:02d}",
                internal_boxes,
                collider_collection,
            )
        )

        accent_boxes = [
            ((-3.45, 2.5, base_z + 0.006), (-3.25, 32.5, base_z + 0.026)),
            ((-6.6, 36.25, base_z + 0.006), (41.4, 36.45, base_z + 0.026)),
        ]
        create_mesh_object(
            f"VIS_B03_FloorAccent_F{floor:02d}",
            accent_boxes,
            visual_collection,
            accent_materials[floor],
        )

        door_boxes = []
        for h0, h1, _, _ in west_doors:
            door_boxes.append(
                ((-3.42, h1 + 0.05, z0), (-3.34, h1 + 1.15, z0 + 2.3))
            )
        for h0, h1, _, _ in north_doors:
            door_boxes.append(
                ((h1 + 0.05, 36.58, z0), (h1 + 1.15, 36.66, z0 + 2.3))
            )
        create_mesh_object(
            f"VIS_B03_DoorLeaves_F{floor:02d}",
            door_boxes,
            visual_collection,
            door_material,
        )
    return generated_colliders


def build_windows_and_links(
    specs: list[WindowSpec],
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    frame_material: bpy.types.Material,
    glass_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    colliders = []
    for spec in specs:
        window_properties = {
            "hs_window_style": "paired_sliding_band",
            "hs_window_units": spec.unit_count,
            "hs_window_clear_height_m": spec.clear_height,
            "hs_window_open_leaf": open_leaf_index(spec) + 1 if spec.is_open else 0,
        }
        create_mesh_object(
            f"VIS_WindowFrame_{spec.suffix}",
            window_frame_boxes(spec),
            visual_collection,
            frame_material,
            window_properties,
        )
        create_mesh_object(
            f"VIS_WindowGlass_{spec.suffix}",
            window_glass_boxes(spec),
            visual_collection,
            glass_material,
            window_properties,
        )
        if not spec.is_open:
            colliders.append(
                create_mesh_object(
                    f"COL_ActorOnly_Window_{spec.suffix}",
                    [window_full_plane_box(spec, 0.10)],
                    collider_collection,
                )
            )
            continue

        colliders.append(
            create_mesh_object(
                f"COL_ActorOnly_WindowFixed_{spec.suffix}",
                closed_leaf_boxes(spec, 0.10),
                collider_collection,
            )
        )
        open_center = window_leaf_center(spec, open_leaf_index(spec))
        colliders.append(
            create_mesh_object(
                f"COL_HumanOnly_Window_{spec.suffix}",
                [
                    window_panel_box(
                        spec,
                        open_center,
                        WINDOW_UNIT_CLEAR_WIDTH / 2,
                        spec.clear_height,
                        0.10,
                    )
                ],
                collider_collection,
            )
        )

        center = (
            (open_center, spec.fixed, spec.z_center)
            if spec.axis == "X"
            else (spec.fixed, open_center, spec.z_center)
        )
        outward = Vector(spec.outward)
        a = Vector(center) + outward * 1.0
        b = Vector(center) - outward * 1.0
        common = {
            "hs_id": spec.link_id,
            "hs_link_kind": "bit_window",
            "hs_bidirectional": True,
            "hs_link_radius_m": LINK_RADIUS_METERS,
        }
        create_empty(
            f"LNK_{spec.link_id}_A",
            tuple(a),
            semantic_collection,
            {**common, "hs_endpoint": "A"},
        )
        create_empty(
            f"LNK_{spec.link_id}_B",
            tuple(b),
            semantic_collection,
            {**common, "hs_endpoint": "B"},
        )
    return colliders


def build_roof_links(semantic_collection: bpy.types.Collection) -> None:
    definitions = (
        (
            "bit-roof-north-east",
            (48.4, 34.8, 14.45),
            (46.1, 34.8, 14.45),
        ),
        (
            "bit-roof-west-south",
            (-10.0, -4.5, 14.45),
            (-10.0, -2.2, 14.45),
        ),
    )
    for link_id, a, b in definitions:
        common = {
            "hs_id": link_id,
            "hs_link_kind": "bit_roof",
            "hs_bidirectional": True,
            "hs_link_radius_m": LINK_RADIUS_METERS,
        }
        create_empty(
            f"LNK_{link_id}_A",
            a,
            semantic_collection,
            {**common, "hs_endpoint": "A"},
        )
        create_empty(
            f"LNK_{link_id}_B",
            b,
            semantic_collection,
            {**common, "hs_endpoint": "B"},
        )


def build_pool(
    visual_collection: bpy.types.Collection,
    semantic_collection: bpy.types.Collection,
    water_material: bpy.types.Material,
) -> None:
    water_bounds = ((14.6, 36.2, 12.86), (34.2, 41.8, 13.55))
    create_mesh_object(
        "VIS_B03_PoolWater",
        [((14.6, 36.2, 13.53), (34.2, 41.8, 13.55))],
        visual_collection,
        water_material,
    )
    create_mesh_object(
        "VOL_PoolWater",
        [water_bounds],
        semantic_collection,
        properties={"hs_id": "pool-water", "hs_role": "water"},
    )


def import_prop_sources(names: list[str]) -> dict[str, bpy.types.Object]:
    with bpy.data.libraries.load(str(PROP_LIBRARY_PATH), link=False) as (
        data_from,
        data_to,
    ):
        missing = sorted(set(names) - set(data_from.objects))
        if missing:
            raise RuntimeError(f"B03-P小物がありません: {missing}")
        data_to.objects = names
    sources = {obj.name: obj for obj in data_to.objects if obj is not None}
    duplicate_suffix = re.compile(r"\.\d{3}$")
    for obj in sources.values():
        if obj.type != "MESH":
            continue
        for index, material in enumerate(obj.data.materials):
            if material is None:
                continue
            base_name = duplicate_suffix.sub("", material.name)
            shared = bpy.data.materials.get(base_name)
            if shared is not None and shared != material:
                obj.data.materials[index] = shared
    return sources


def instantiate_prop(
    source: bpy.types.Object,
    name: str,
    position: tuple[float, float, float],
    rotation_z: float,
    target_collection: bpy.types.Collection,
) -> bpy.types.Object:
    mesh = source.data.copy()
    transform = Matrix.Translation(Vector(position)) @ Matrix.Rotation(
        rotation_z, 4, "Z"
    )
    mesh.transform(transform)
    mesh.name = name
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    return obj


def build_minimum_props(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    bench_material: bpy.types.Material,
) -> None:
    source_names = [
        "VIS_Prop_WesternToilet",
        "VIS_Prop_Urinal",
        "VIS_Prop_BaggageLocker",
        "COL_Prop_BaggageLocker",
    ]
    sources = import_prop_sources(source_names)
    toilet_positions = [
        ("M_01", (-5.8, 44.7, 0.0)),
        ("M_02", (-4.35, 44.7, 0.0)),
        ("M_03", (-2.95, 44.7, 0.0)),
        ("F_01", (-1.3, 44.7, 0.0)),
        ("F_02", (0.15, 44.7, 0.0)),
        ("F_03", (1.55, 44.7, 0.0)),
    ]
    for suffix, position in toilet_positions:
        instantiate_prop(
            sources["VIS_Prop_WesternToilet"],
            f"VIS_B03_Prop_Toilet_{suffix}",
            position,
            math.pi,
            visual_collection,
        )
    for index, y in enumerate((39.6, 40.6, 41.6), 1):
        instantiate_prop(
            sources["VIS_Prop_Urinal"],
            f"VIS_B03_Prop_Urinal_{index:02d}",
            (-2.40, y, 0.8),
            -math.pi / 2,
            visual_collection,
        )

    locker_positions = [
        ("Changing_M_01", (-5.5, 44.9, 12.7)),
        ("Changing_M_02", (-3.3, 44.9, 12.7)),
        ("Changing_F_01", (-1.0, 44.9, 12.7)),
        ("Changing_F_02", (1.2, 44.9, 12.7)),
    ]
    for suffix, position in locker_positions:
        instantiate_prop(
            sources["VIS_Prop_BaggageLocker"],
            f"VIS_B03_Prop_Locker_{suffix}",
            position,
            0.0,
            visual_collection,
        )
        instantiate_prop(
            sources["COL_Prop_BaggageLocker"],
            f"COL_B03_Prop_Locker_{suffix}",
            position,
            0.0,
            collider_collection,
        )

    bench_boxes = [
        ((-5.6, 40.2, 12.7), (-3.1, 40.7, 13.12)),
        ((-1.1, 40.2, 12.7), (1.4, 40.7, 13.12)),
    ]
    create_mesh_object(
        "VIS_B03_ChangingBenches",
        bench_boxes,
        visual_collection,
        bench_material,
    )
    create_mesh_object(
        "COL_B03_ChangingBenches", bench_boxes, collider_collection
    )

    for source in sources.values():
        unlink_and_remove_object(source)
    remove_unused_prop_material_duplicates()


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def build_stair_finish(
    visual_collection: bpy.types.Collection,
    nosing_material: bpy.types.Material,
    rail_material: bpy.types.Material,
) -> None:
    nosing_boxes = []
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or not (
            obj.name.startswith("VIS_Stairs")
            or obj.name.startswith("VIS_StairSystem")
            or obj.name.startswith("VIS_GymStageStair_")
        ):
            continue
        mesh = obj.data
        for polygon in mesh.polygons:
            normal = obj.matrix_world.to_3x3() @ polygon.normal
            if normal.z < 0.98:
                continue
            points = [obj.matrix_world @ mesh.vertices[i].co for i in polygon.vertices]
            x0, x1 = min(p.x for p in points), max(p.x for p in points)
            y0, y1 = min(p.y for p in points), max(p.y for p in points)
            z = max(p.z for p in points)
            if min(x1 - x0, y1 - y0) < 0.04:
                continue
            if x1 - x0 > y1 - y0:
                nosing_boxes.append(((x0, y0, z + 0.006), (x1, min(y0 + 0.06, y1), z + 0.026)))
            else:
                nosing_boxes.append(((x0, y0, z + 0.006), (min(x0 + 0.06, x1), y1, z + 0.026)))
    if nosing_boxes:
        create_mesh_object(
            "VIS_B03_StairNosing",
            nosing_boxes,
            visual_collection,
            nosing_material,
        )

    rail_boxes = []
    guard_objects = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj.name.startswith("VIS_StairGuard")
    ]
    for obj in guard_objects:
        minimum, maximum = world_bounds(obj)
        z0 = maximum.z - 0.05
        z1 = maximum.z + 0.05
        if maximum.x - minimum.x >= maximum.y - minimum.y:
            rail_boxes.append(
                ((minimum.x, (minimum.y + maximum.y) / 2 - 0.05, z0), (maximum.x, (minimum.y + maximum.y) / 2 + 0.05, z1))
            )
        else:
            rail_boxes.append(
                (((minimum.x + maximum.x) / 2 - 0.05, minimum.y, z0), ((minimum.x + maximum.x) / 2 + 0.05, maximum.y, z1))
            )
    if rail_boxes:
        create_mesh_object(
            "VIS_B03_HandrailTops",
            rail_boxes,
            visual_collection,
            rail_material,
        )


def copy_meshes_into_object(
    name: str,
    source_names: list[str],
    target_collection: bpy.types.Collection,
    properties: dict[str, object],
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for source_name in source_names:
        source = bpy.data.objects.get(source_name)
        if source is None or source.type != "MESH":
            raise RuntimeError(f"NAV生成元の参照Meshがありません: {source_name}")
        offset = len(vertices)
        vertices.extend(tuple(source.matrix_world @ vertex.co) for vertex in source.data.vertices)
        faces.extend(
            tuple(offset + index for index in polygon.vertices)
            for polygon in source.data.polygons
        )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    for key, value in properties.items():
        obj[key] = value
    return obj


def build_nav_sources(
    nav_collection: bpy.types.Collection,
    generated_upper_colliders: list[bpy.types.Object],
    window_colliders: list[bpy.types.Object],
) -> None:
    for floor in (2, 3, 4):
        copy_meshes_into_object(
            f"NAV_Walkable_Interior{floor}F",
            [f"COL_B03_Floor_F{floor:02d}"],
            nav_collection,
            {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
        )
    copy_meshes_into_object(
        "NAV_Walkable_StairsNWUpper",
        [
            "COL_StairSystem_NW_2FTo3F",
            "COL_StairSystem_NW_3FTo4F",
            "COL_StairSystem_NW_4FToRooftop",
        ],
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
    )
    copy_meshes_into_object(
        "NAV_Walkable_Rooftop",
        [
            "COL_Roof_North",
            "COL_Roof_West",
            "COL_PoolRaisedDeck_West",
            "COL_PoolRaisedDeck_East",
            "COL_PoolRaisedDeck_North",
            "COL_PoolRaisedDeck_South",
            "COL_PoolDeckAccessRamp_West",
            "COL_PoolBasinRamp_East",
            "COL_PoolBasinFloor",
        ],
        nav_collection,
        {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
    )
    blocker_sources = [
        obj.name
        for obj in generated_upper_colliders + window_colliders
        if obj.name.startswith("COL_B03_InteriorWalls_F0")
        or obj.name.startswith(("COL_B03_ExteriorWalls_F02", "COL_B03_ExteriorWalls_F03", "COL_B03_ExteriorWalls_F04"))
        or obj.name.startswith(("COL_ActorOnly_Window_F02", "COL_ActorOnly_Window_F03", "COL_ActorOnly_Window_F04"))
        or obj.name.startswith(("COL_HumanOnly_Window_F02", "COL_HumanOnly_Window_F03", "COL_HumanOnly_Window_F04"))
    ]
    copy_meshes_into_object(
        "NAV_Blocker_SchoolUpper",
        sorted(blocker_sources),
        nav_collection,
        {"hs_nav_role": "blocker"},
    )


def normalize_export_meshes(export_collection: bpy.types.Collection) -> None:
    for obj in export_collection.all_objects:
        if obj.type != "MESH":
            continue
        if obj.data.users != 1:
            obj.data = obj.data.copy()
        obj.data.name = obj.name
        if any(abs(value) > 1e-8 for value in obj.location):
            obj.data.transform(Matrix.Translation(obj.location))
            obj.location = (0.0, 0.0, 0.0)
        if any(abs(value) > 1e-8 for value in obj.rotation_euler):
            rotation = obj.rotation_euler.to_matrix().to_4x4()
            obj.data.transform(rotation)
            obj.rotation_euler = (0.0, 0.0, 0.0)
        if any(abs(value - 1.0) > 1e-8 for value in obj.scale):
            obj.data.transform(Matrix.Diagonal((*obj.scale, 1.0)))
            obj.scale = (1.0, 1.0, 1.0)


def export_stage(export_collection: bpy.types.Collection) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_collection.all_objects:
        obj.select_set(True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
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


def is_generated_name(name: str) -> bool:
    return name in GENERATED_EXACT_NAMES or name.startswith(GENERATED_PREFIXES)


def generation_signature() -> str:
    digest = hashlib.sha256()
    generated_objects = sorted(
        (obj for obj in bpy.data.objects if is_generated_name(obj.name)),
        key=lambda obj: obj.name,
    )
    for obj in generated_objects:
        digest.update(obj.name.encode("utf-8"))
        digest.update(obj.type.encode("ascii"))
        for row in obj.matrix_world:
            for value in row:
                digest.update(float(value).hex().encode("ascii"))
        for key in sorted(key for key in obj.keys() if key.startswith("hs_")):
            digest.update(key.encode("utf-8"))
            digest.update(
                json.dumps(obj[key], ensure_ascii=False, sort_keys=True).encode("utf-8")
            )
        if obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            for value in vertex.co:
                digest.update(float(value).hex().encode("ascii"))
        for polygon in obj.data.polygons:
            digest.update(",".join(str(index) for index in polygon.vertices).encode("ascii"))
        for material in obj.data.materials:
            digest.update((material.name if material else "").encode("utf-8"))
    return digest.hexdigest().upper()


def is_current_generation() -> bool:
    names = tuple(bpy.data.objects.keys())
    return (
        bpy.context.scene.get(GENERATOR_VERSION_PROPERTY) == GENERATOR_VERSION
        and sum(name.startswith("VIS_WindowFrame_") for name in names) == 81
        and sum(name.startswith("VIS_WindowGlass_") for name in names) == 81
        and sum(name.startswith("COL_ActorOnly_Window_") for name in names) == 48
        and sum(name.startswith("COL_ActorOnly_WindowFixed_") for name in names) == 33
        and sum(name.startswith("COL_HumanOnly_Window_") for name in names) == 33
        and sum(name.startswith("LNK_bit-window-") for name in names) == 66
        and sum(name.startswith("LNK_bit-roof-") for name in names) == 4
        and GENERATED_EXACT_NAMES.issubset(names)
        and "VOL_PoolWater" in names
        and bpy.context.scene.get(GENERATOR_SIGNATURE_PROPERTY)
        == generation_signature()
    )


def print_build_result(specs: list[WindowSpec]) -> None:
    result = {
        "blend": str(BLEND_PATH),
        "blend_sha256": sha256(BLEND_PATH),
        "glb": str(GLB_PATH),
        "glb_sha256": sha256(GLB_PATH),
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "materials": len(bpy.data.materials),
        "windows": len(specs),
        "open_windows": sum(spec.is_open for spec in specs),
        "closed_windows": sum(not spec.is_open for spec in specs),
    }
    print("B03_BUILD_RESULT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


def main() -> None:
    require_source_file()
    visual_collection = collection(VIS_COLLECTION_NAME)
    collider_collection = collection(COL_COLLECTION_NAME)
    nav_collection = collection(NAV_COLLECTION_NAME)
    semantic_collection = collection(SEMANTIC_COLLECTION_NAME)
    export_collection = collection(EXPORT_COLLECTION_NAME)

    specs = build_window_specs()
    if len(specs) != 81 or sum(spec.is_open for spec in specs) != 33:
        raise RuntimeError("W02-R1窓定義が81件／開33件ではありません")
    if is_current_generation():
        export_stage(export_collection)
        print_build_result(specs)
        return

    clear_generated_objects()

    wall_material = existing_material("MAT_Wall_White")
    floor_material = existing_material("MAT_Corridor_Ochre")
    door_material = existing_material("MAT_Door_Blue")
    water_material = existing_material("MAT_Pool_Water")
    bench_material = existing_material("MAT_Classroom_Beige")
    frame_material = make_material(
        "MAT_B03_WindowFrame", (0.36, 0.39, 0.41, 1.0), metallic=0.15, roughness=0.38
    )
    glass_material = make_material(
        "MAT_B03_WindowGlass", (0.56, 0.78, 0.86, 0.28), roughness=0.18, alpha_blend=True
    )
    nosing_material = make_material(
        "MAT_B03_StairNosing", (0.84, 0.78, 0.62, 1.0), roughness=0.45
    )
    rail_material = make_material(
        "MAT_B03_Handrail", (0.24, 0.27, 0.29, 1.0), metallic=0.3, roughness=0.4
    )
    accent_materials = {
        2: make_material("MAT_B03_Accent_2F_Green", (0.31, 0.42, 0.35, 1.0)),
        3: make_material("MAT_B03_Accent_3F_Claret", (0.48, 0.30, 0.32, 1.0)),
        4: make_material("MAT_B03_Accent_4F_Navy", (0.27, 0.35, 0.45, 1.0)),
    }

    upper_colliders = build_school_exterior(
        specs, visual_collection, collider_collection, wall_material
    )
    upper_colliders.extend(
        build_gym_exterior(
            specs, visual_collection, collider_collection, wall_material
        )
    )
    upper_colliders.extend(
        build_upper_floors_and_rooms(
            visual_collection,
            collider_collection,
            floor_material,
            wall_material,
            accent_materials,
            door_material,
        )
    )
    window_colliders = build_windows_and_links(
        specs,
        visual_collection,
        collider_collection,
        semantic_collection,
        frame_material,
        glass_material,
    )
    build_roof_links(semantic_collection)
    build_pool(visual_collection, semantic_collection, water_material)
    build_minimum_props(visual_collection, collider_collection, bench_material)
    build_stair_finish(visual_collection, nosing_material, rail_material)
    build_nav_sources(nav_collection, upper_colliders, window_colliders)
    normalize_export_meshes(export_collection)

    bpy.context.scene[GENERATOR_VERSION_PROPERTY] = GENERATOR_VERSION
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    bpy.context.scene[GENERATOR_SIGNATURE_PROPERTY] = generation_signature()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    export_stage(export_collection)
    print_build_result(specs)


if __name__ == "__main__":
    main()
