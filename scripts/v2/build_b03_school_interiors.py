from __future__ import annotations

import math
import re
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PROP_LIBRARY_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B03/b03_school_prop_library.blend"
)
TEXTURE_DIRECTORY = REPOSITORY_ROOT / "assets/textures/v2/B03"

ATLAS_DEFINITIONS = {
    "Architecture": {
        "size": 512,
        "material": "MAT_B03_Atlas_Architecture",
        "file": "b03_architecture_atlas.png",
        "swatches": {
            "wall": (214, 210, 197),
            "ceiling": (232, 231, 221),
            "floor": (158, 132, 91),
            "gym_floor": (176, 145, 101),
            "roof": (83, 96, 103),
            "door": (120, 76, 42),
            "floor_1": (198, 151, 53),
            "floor_2": (66, 135, 104),
            "floor_3": (185, 101, 71),
            "floor_4": (70, 105, 159),
            "grass": (51, 107, 51),
            "gate": (46, 97, 173),
            "gym_stage": (117, 38, 26),
            "gym_wainscot": (92, 117, 98),
            "trim": (72, 78, 79),
        },
    },
    "FurnitureProps": {
        "size": 512,
        "material": "MAT_B03_Atlas_FurnitureProps",
        "file": "b03_furniture_props_atlas.png",
        "swatches": {
            "wood": (126, 76, 35),
            "wood_light": (183, 133, 72),
            "metal_gray": (104, 111, 116),
            "metal_dark": (38, 42, 45),
            "porcelain": (225, 231, 229),
            "fabric": (115, 149, 164),
            "fabric_green": (78, 128, 99),
            "plastic_black": (24, 28, 31),
            "blackboard": (22, 85, 54),
            "piano": (21, 19, 18),
            "accent_orange": (218, 78, 23),
            "accent_red": (180, 42, 34),
        },
    },
    "SignsPaper": {
        "size": 1024,
        "material": "MAT_B03_Atlas_SignsPaper",
        "file": "b03_signs_paper_atlas.png",
        "swatches": {
            "paper": (235, 229, 205),
            "paper_white": (242, 242, 234),
            "book_blue": (47, 87, 131),
            "book_red": (151, 56, 49),
            "book_green": (52, 112, 77),
            "screen": (42, 92, 115),
            "sign_1": (178, 78, 55),
            "sign_2": (194, 145, 40),
            "sign_3": (55, 130, 91),
            "sign_4": (55, 93, 149),
            "safety": (228, 101, 25),
            "clock": (235, 232, 216),
        },
    },
}

ADDITIONAL_PROP_TYPES = (
    "TeacherDesk",
    "ChangingBench",
    "BulletinBoard",
    "WallClock",
    "FireExtinguisher",
    "TrashBin",
    "UmbrellaStand",
    "WashBasin",
    "Mirror",
    "PcTower",
    "KeyboardMouse",
    "ScienceStool",
    "LabBench",
    "MedicalCabinet",
    "BroadcastConsole",
    "Easel",
    "KitchenIsland",
    "SewingMachine",
    "MusicStand",
    "AvRack",
    "InfirmaryCurtain",
    "RoomSign",
    "LifePreserverSign",
)

IMPASSABLE_ADDITIONAL_PROP_TYPES = {
    "TeacherDesk",
    "ChangingBench",
    "WashBasin",
    "LabBench",
    "MedicalCabinet",
    "BroadcastConsole",
    "KitchenIsland",
    "AvRack",
}

STAGE_LECTERN_TOP_Y_HALF_EXTENT = (
    0.275 * math.cos(math.radians(4.0))
    + 0.035 * math.sin(math.radians(4.0))
)
STAGE_LECTERN_TOP_Z_HALF_EXTENT = (
    0.275 * math.sin(math.radians(4.0))
    + 0.035 * math.cos(math.radians(4.0))
)
STAGE_LECTERN_COLLIDER_HEIGHT = 1.045 + STAGE_LECTERN_TOP_Z_HALF_EXTENT

PROP_COLLIDER_SIZES = {
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
PROP_COLLIDER_LOCAL_CENTERS = {
    "StaffDesk": (0.0, -0.005, 0.36),
    "StageLectern": (0.0, -0.01, STAGE_LECTERN_COLLIDER_HEIGHT / 2.0),
}

STAFFROOM_INTERIOR_BOUNDS = (5.4, 23.4, 36.5, 45.5)
STAFFROOM_CLEANING_LOCKER = (7.0, 44.8, 0.0)
CLASSROOM_REAR_LOCKER_Y = 2.875
CLASSROOM_REAR_BAGGAGE_XS = (-10.65, -8.65, -6.65)
CLASSROOM_REAR_CLEANING_X = -5.20
CLASSROOM_REAR_WALL_INNER_Y = 2.65
CLASSROOM_REAR_INTERIOR_X_BOUNDS = (-12.45, -3.65)
CLASSROOM_TRASH_BIN_PLACEMENT = (-3.8, 7.5)
CORRIDOR_CLEANING_LOCKER = (-3.125, 6.8, math.pi / 2)
MAIN_ENTRY_BAGGAGE_LOCKERS = (
    (-4.4, -3.125, math.pi),
    (-2.4, -3.125, math.pi),
)
NORTH_ENTRY_BAGGAGE_LOCKER = (5.025, 40.6, -math.pi / 2)
NORTH_ENTRY_UMBRELLA_STAND = (5.05, 39.0, math.pi / 2)
COUNCIL_INTERIOR_BOUNDS = (5.55, 14.4, 36.65, 45.35)
LIBRARY_WEST_WALL_INNER_X = -12.45
LIBRARY_EAST_WALL_INNER_X = -3.65
LIBRARY_BOOKSHELF_PLACEMENTS = (
    *(
        (LIBRARY_WEST_WALL_INNER_X + 0.16, y, math.pi / 2)
        for y in (13.1, 14.0, 14.9, 15.8, 16.7)
    ),
    *(
        (LIBRARY_WEST_WALL_INNER_X + 0.16, y, math.pi / 2)
        for y in (28.0, 28.9, 29.8, 30.7, 31.6)
    ),
    *(
        (-3.81, y, -math.pi / 2)
        for y in (
            16.2,
            17.1,
            18.0,
            18.9,
            19.8,
            20.7,
            21.6,
            22.5,
            23.4,
            24.3,
            25.2,
            26.1,
            27.0,
            27.9,
        )
    ),
)
FIRST_FLOOR_WEST_DOOR_OPENINGS = (
    (3.1, 4.3),
    (10.7, 11.9),
    (13.1, 14.3),
    (30.7, 31.9),
)
UPPER_WEST_CLASSROOM_DOOR_OPENINGS = (
    (3.1, 4.3),
    (10.7, 11.9),
    (13.1, 14.3),
    (20.7, 21.9),
    (23.1, 24.3),
    (30.7, 31.9),
)
NORTH_CLASSROOM_DOOR_OPENINGS = (
    (6.0, 7.2),
    (21.6, 22.8),
    (24.0, 25.2),
    (39.6, 40.8),
)
TOILET_COMMON_OPENING = (-6.6, 5.4)
TOILET_FRONT_WALL_Y = 38.5
TOILET_FRONT_WALL_DEPTH = 0.30
TOILET_FRONT_WALL_SPANS = (
    (-6.6, -5.4),
    (-4.2, -2.1),
    (-2.1, -0.9),
    (0.3, 2.4),
)
TOILET_FRONT_DOOR_OPENINGS = (
    (-5.4, -4.2),
    (-0.9, 0.3),
)
TOILET_FRONT_DOOR_HEIGHT = 2.3
TOILET_SIGN_PLACEMENTS = (
    (-5.825, 38.34, math.pi),
    (0.725, 38.34, math.pi),
)
ROOF_POOL_NORTH_SIGN_SUPPORT = (
    (39.5, 45.28, 15.5),
    (0.10, 0.24, 0.10),
)
ROOF_CHANGING_BAGGAGE_LOCKER_XS = (-5.4, -3.16, -0.8, 1.19)
STAFFROOM_TRASH_BIN = (19.0, 36.8, 0.0)
ART_INTERIOR_BOUNDS = (5.4, 23.4, 36.5, 45.5)
ART_TABLE_XS = (8.0, 14.4, 20.8)
ART_TABLE_YS = (39.5, 43.0)
ART_EASEL_XS = (9.0, 11.6, 14.2, 16.8, 19.4)
ART_EASEL_Y = 37.6
ART_BOOKSHELF_PLACEMENTS = (
    (5.75, 39.5, math.pi / 2),
    (5.75, 41.5, math.pi / 2),
)
ART_CLEANING_LOCKER = (5.775, 44.0, math.pi / 2)
LL_INTERIOR_BOUNDS = (5.4, 23.4, 36.5, 45.5)
LL_DESK_XS = (6.7, 9.9, 13.1, 16.3, 19.5, 22.7)
LL_DESK_YS = (38.2, 39.9, 41.6, 43.3)
LL_AV_RACK = (5.9, 44.7)
LL_BAGGAGE_LOCKER_XS = (7.2, 9.2)
MUSIC_PIANO_PLACEMENT = (40.4, 42.5, -math.pi / 2)
MUSIC_CHAIR_XS = (29.0, 30.55, 32.1, 33.65, 35.2, 36.75)
MUSIC_CHAIR_YS = (38.2, 39.55, 40.9, 42.25, 43.6)
MUSIC_CHAIR_ROTATION = math.pi / 2
GYM_STAGE_LECTERN = (45.4, -5.0, 1.0)
BULLETIN_BOARD_FURNITURE_PARTS = (
    ((0.0, 0.0, 1.45), (1.80, 0.06, 1.00), "fabric"),
    ((0.0, 0.0, 1.95), (1.92, 0.08, 0.08), "wood"),
    ((0.0, 0.0, 0.95), (1.92, 0.08, 0.08), "wood"),
    ((-0.92, 0.0, 1.45), (0.08, 0.08, 1.08), "wood"),
    ((0.92, 0.0, 1.45), (0.08, 0.08, 1.08), "wood"),
)
BULLETIN_BOARD_PAPER_PARTS = (
    ((-0.50, -0.041, 1.52), (0.42, 0.012, 0.42), "paper_white"),
    ((0.00, -0.041, 1.36), (0.36, 0.012, 0.30), "paper"),
    ((0.50, -0.041, 1.55), (0.42, 0.012, 0.38), "sign_1"),
)
WEST_CORRIDOR_SIGN_POSITIONS = {
    1: (5.125, 14.725, 30.275),
    2: (5.725, 15.725, 25.725),
    3: (5.725, 15.725, 25.725),
    4: (5.725, 15.725, 25.725),
}
NORTH_CORRIDOR_SIGN_X = {1: 7.625, 2: 7.625, 3: 7.625, 4: 7.625}


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + chunk_type
        + data
        + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
    )


def write_atlas_png(path: Path, size: int, colors: list[tuple[int, int, int]]) -> None:
    grid = 4
    cell = size // grid
    scanlines = bytearray()
    for y in range(size):
        scanlines.append(0)
        row = y // cell
        for x in range(size):
            column = x // cell
            index = min(row * grid + column, len(colors) - 1)
            base = colors[index]
            variation = 1 if ((x // 32) + (y // 32)) % 2 == 0 else 0
            scanlines.extend(max(0, min(255, value + variation)) for value in base)
    payload = b"\x89PNG\r\n\x1a\n"
    payload += png_chunk(
        b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    )
    payload += png_chunk(b"IDAT", zlib.compress(bytes(scanlines), 9))
    payload += png_chunk(b"IEND", b"")
    path.write_bytes(payload)


def build_atlases() -> dict[str, bpy.types.Material]:
    TEXTURE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    materials = {}
    for atlas_name, definition in ATLAS_DEFINITIONS.items():
        image_path = TEXTURE_DIRECTORY / str(definition["file"])
        write_atlas_png(
            image_path,
            int(definition["size"]),
            list(definition["swatches"].values()),
        )
        image = bpy.data.images.get(image_path.name)
        if image is not None:
            bpy.data.images.remove(image)
        image = bpy.data.images.load(str(image_path), check_existing=False)
        image.name = image_path.name
        image.colorspace_settings.name = "sRGB"
        image.pack()
        relative_image_path = bpy.path.relpath(
            str(image_path),
            start=str(Path(bpy.data.filepath).resolve().parent),
        )
        image.filepath = relative_image_path
        image.filepath_raw = relative_image_path
        material_name = str(definition["material"])
        material = bpy.data.materials.get(material_name)
        if material is None:
            material = bpy.data.materials.new(material_name)
        material.use_nodes = True
        material.node_tree.nodes.clear()
        output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
        shader = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image = image
        texture.interpolation = "Closest"
        material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
        material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        shader.inputs["Roughness"].default_value = 0.72
        materials[atlas_name] = material
    return materials


def architecture_swatch(object_name: str) -> str:
    name = object_name.lower()
    floor_match = re.search(r"(?:_|^)f0?([1-4])(?:_|$)", name)
    if "siteground" in name or "courtyardsurface" in name:
        return "grass"
    if "gate_" in name:
        return "gate"
    if "gymwainscot" in name:
        return "gym_wainscot"
    if "gymtrim" in name or "storeytrim" in name or "stairguard" in name:
        return "trim"
    if "gymstage" in name and "wall" not in name and "lintel" not in name:
        return "gym_stage"
    if "interfloorstructure" in name:
        return "ceiling"
    if "storeyband" in name and floor_match:
        return f"floor_{floor_match.group(1)}"
    if "ceiling" in name:
        return "ceiling"
    if "wall" in name or "lintel" in name:
        return "wall"
    if "floor_gym" in name or ("gym" in name and "floor" in name):
        return "gym_floor"
    if "door" in name:
        return "door"
    if "windowframe" in name:
        return "roof"
    if "stair" in name or "floor" in name:
        return "floor"
    if "roof" in name or "pool" in name or "rail" in name:
        return "roof"
    return "wall"


def consolidate_school_materials(
    export_collection: bpy.types.Collection,
) -> dict[str, int]:
    materials = {
        atlas_name: bpy.data.materials[str(definition["material"])]
        for atlas_name, definition in ATLAS_DEFINITIONS.items()
    }
    transparent_names = {"MAT_B03_WindowGlass", "MAT_Pool_Water"}
    remapped_visuals = 0
    cleared_function_meshes = 0

    for obj in export_collection.all_objects:
        if obj.type != "MESH":
            continue
        if not obj.name.startswith("VIS_"):
            if len(obj.data.materials):
                obj.data.materials.clear()
                cleared_function_meshes += 1
            continue

        current_material_names = {
            material.name
            for material in obj.data.materials
            if material is not None
        }
        if current_material_names & transparent_names:
            continue
        if (
            current_material_names <= {
                material.name for material in materials.values()
            }
            and len(current_material_names) == 1
            and (
                obj.name.startswith("VIS_B03_Interior_")
                or obj.name.startswith("VIS_B03_Prop_")
            )
        ):
            continue

        if obj.name.startswith("VIS_B03_Prop_") or obj.name == "VIS_B03_ChangingBenches":
            atlas_name = "FurnitureProps"
        else:
            atlas_name = "Architecture"
        target_material = materials[atlas_name]
        uv_layer = obj.data.uv_layers.get("UVMap")
        if uv_layer is None:
            uv_layer = obj.data.uv_layers.new(name="UVMap")

        for polygon in obj.data.polygons:
            material_name = ""
            if polygon.material_index < len(obj.data.materials):
                old_material = obj.data.materials[polygon.material_index]
                material_name = old_material.name if old_material else ""
            swatch = (
                prop_material_swatch(material_name)
                if atlas_name == "FurnitureProps"
                else architecture_swatch(obj.name)
            )
            coordinates = swatch_uv(atlas_name, swatch)
            for corner_index, loop_index in enumerate(polygon.loop_indices):
                uv_layer.data[loop_index].uv = coordinates[corner_index % 4]
            polygon.material_index = 0

        obj.data.materials.clear()
        obj.data.materials.append(target_material)
        remapped_visuals += 1

    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        if image.users == 0:
            bpy.data.images.remove(image)
    return {
        "remapped_visuals": remapped_visuals,
        "cleared_function_meshes": cleared_function_meshes,
        "materials": len(bpy.data.materials),
        "images": len(bpy.data.images),
    }


def swatch_uv(atlas_name: str, swatch: str) -> tuple[tuple[float, float], ...]:
    names = list(ATLAS_DEFINITIONS[atlas_name]["swatches"])
    index = names.index(swatch)
    column = index % 4
    row = index // 4
    margin = 0.015
    u0 = column / 4 + margin
    u1 = (column + 1) / 4 - margin
    v0 = 1.0 - (row + 1) / 4 + margin
    v1 = 1.0 - row / 4 - margin
    return ((u0, v0), (u1, v0), (u1, v1), (u0, v1))


@dataclass
class MeshBatch:
    atlas_name: str

    def __post_init__(self) -> None:
        self.vertices: list[tuple[float, float, float]] = []
        self.faces: list[tuple[int, ...]] = []
        self.face_uvs: list[tuple[tuple[float, float], ...]] = []

    def add_box(
        self,
        center: tuple[float, float, float],
        size: tuple[float, float, float],
        swatch: str,
        rotation_z: float = 0.0,
    ) -> None:
        sx, sy, sz = (value / 2 for value in size)
        local = (
            (-sx, -sy, -sz),
            (sx, -sy, -sz),
            (sx, sy, -sz),
            (-sx, sy, -sz),
            (-sx, -sy, sz),
            (sx, -sy, sz),
            (sx, sy, sz),
            (-sx, sy, sz),
        )
        transform = Matrix.Translation(Vector(center)) @ Matrix.Rotation(
            rotation_z, 4, "Z"
        )
        offset = len(self.vertices)
        self.vertices.extend(tuple(transform @ Vector(vertex)) for vertex in local)
        faces = (
            (0, 3, 2, 1),
            (4, 5, 6, 7),
            (0, 1, 5, 4),
            (1, 2, 6, 5),
            (2, 3, 7, 6),
            (3, 0, 4, 7),
        )
        uv = swatch_uv(self.atlas_name, swatch)
        for face in faces:
            self.faces.append(tuple(offset + index for index in face))
            self.face_uvs.append(uv)

    def add_source(
        self,
        source: bpy.types.Object,
        position: tuple[float, float, float],
        rotation_z: float,
        swatch_override: str | None = None,
    ) -> None:
        transform = Matrix.Translation(Vector(position)) @ Matrix.Rotation(
            rotation_z, 4, "Z"
        )
        offset = len(self.vertices)
        self.vertices.extend(tuple(transform @ vertex.co) for vertex in source.data.vertices)
        for polygon in source.data.polygons:
            self.faces.append(tuple(offset + index for index in polygon.vertices))
            material_name = ""
            if polygon.material_index < len(source.data.materials):
                material = source.data.materials[polygon.material_index]
                material_name = material.name if material else ""
            swatch = swatch_override or prop_material_swatch(material_name)
            uv = swatch_uv(self.atlas_name, swatch)
            corners = tuple(uv[index % 4] for index in range(len(polygon.vertices)))
            self.face_uvs.append(corners)

    def create(
        self,
        name: str,
        collection: bpy.types.Collection,
        material: bpy.types.Material,
    ) -> bpy.types.Object | None:
        if not self.faces:
            return None
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.materials.append(material)
        mesh.update(calc_edges=True)
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for polygon, coordinates in zip(mesh.polygons, self.face_uvs):
            for loop_index, coordinate in zip(polygon.loop_indices, coordinates):
                uv_layer.data[loop_index].uv = coordinate
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj


def prop_material_swatch(material_name: str) -> str:
    name = re.sub(r"\.\d{3}$", "", material_name)
    mappings = {
        "MAT_Prop_Wood": "wood",
        "MAT_Prop_MetalGray": "metal_gray",
        "MAT_Prop_MetalDark": "metal_dark",
        "MAT_Prop_Porcelain": "porcelain",
        "MAT_Prop_Fabric": "fabric",
        "MAT_Prop_PlasticBlack": "plastic_black",
        "MAT_Prop_Blackboard": "blackboard",
        "MAT_Prop_Paper": "wood_light",
        "MAT_Prop_AccentOrange": "accent_orange",
    }
    return mappings.get(name, "wood_light")


def import_prop_sources(names: set[str]) -> dict[str, bpy.types.Object]:
    object_names = sorted(f"VIS_Prop_{name}" for name in names)
    with bpy.data.libraries.load(str(PROP_LIBRARY_PATH), link=False) as (
        data_from,
        data_to,
    ):
        missing = sorted(set(object_names) - set(data_from.objects))
        if missing:
            raise RuntimeError(f"B03-P小物がありません: {missing}")
        data_to.objects = object_names
    return {obj.name.removeprefix("VIS_Prop_"): obj for obj in data_to.objects}


def rotated_box_aabb_size(
    size: tuple[float, float, float],
    rotation_z: float,
) -> tuple[float, float, float]:
    cosine = abs(math.cos(rotation_z))
    sine = abs(math.sin(rotation_z))
    return (
        size[0] * cosine + size[1] * sine,
        size[0] * sine + size[1] * cosine,
        size[2],
    )


@dataclass
class RoomBuilder:
    name: str
    base_z: float
    architecture: MeshBatch
    furniture: MeshBatch
    signs: MeshBatch
    colliders: list[tuple[tuple[float, float, float], tuple[float, float, float]]]
    wall_colliders: list[
        tuple[tuple[float, float, float], tuple[float, float, float]]
    ]
    counts: dict[str, int]

    @classmethod
    def create(cls, name: str, base_z: float) -> "RoomBuilder":
        return cls(
            name,
            base_z,
            MeshBatch("Architecture"),
            MeshBatch("FurnitureProps"),
            MeshBatch("SignsPaper"),
            [],
            [],
            {},
        )

    def add_prop(
        self,
        sources: dict[str, bpy.types.Object],
        prop_type: str,
        x: float,
        y: float,
        rotation_z: float = 0.0,
        z_offset: float = 0.0,
    ) -> None:
        self.counts[prop_type] = self.counts.get(prop_type, 0) + 1
        paper_swatches = {
            "ClosedBook": "book_blue",
            "OpenBook": "book_red",
            "PaperStack": "paper",
            "SinglePaper": "paper_white",
        }
        target_batch = self.signs if prop_type in paper_swatches else self.furniture
        target_batch.add_source(
            sources[prop_type],
            (x, y, self.base_z + z_offset),
            rotation_z,
            paper_swatches.get(prop_type),
        )
        size = PROP_COLLIDER_SIZES.get(prop_type)
        if size is not None:
            local_center = PROP_COLLIDER_LOCAL_CENTERS.get(
                prop_type,
                (0.0, 0.0, size[2] / 2.0),
            )
            cosine = math.cos(rotation_z)
            sine = math.sin(rotation_z)
            collider_center = (
                x + local_center[0] * cosine - local_center[1] * sine,
                y + local_center[0] * sine + local_center[1] * cosine,
                self.base_z + z_offset + local_center[2],
            )
            self.add_collider(
                collider_center,
                size,
                rotation_z,
            )

    def add_collider(
        self,
        center: tuple[float, float, float],
        size: tuple[float, float, float],
        rotation_z: float = 0.0,
    ) -> None:
        size = rotated_box_aabb_size(size, rotation_z)
        minimum = tuple(center[index] - size[index] / 2 for index in range(3))
        maximum = tuple(center[index] + size[index] / 2 for index in range(3))
        self.colliders.append((minimum, maximum))

    def add_wall_collider(
        self,
        center: tuple[float, float, float],
        size: tuple[float, float, float],
        rotation_z: float = 0.0,
    ) -> None:
        size = rotated_box_aabb_size(size, rotation_z)
        minimum = tuple(center[index] - size[index] / 2 for index in range(3))
        maximum = tuple(center[index] + size[index] / 2 for index in range(3))
        self.wall_colliders.append((minimum, maximum))

    def box(
        self,
        center: tuple[float, float, float],
        size: tuple[float, float, float],
        swatch: str,
        rotation_z: float = 0.0,
        *,
        signs: bool = False,
        collider: bool = False,
    ) -> None:
        batch = self.signs if signs else self.furniture
        batch.add_box(center, size, swatch, rotation_z)
        if collider:
            self.add_collider(center, size, rotation_z)

    def architecture_box(
        self,
        center: tuple[float, float, float],
        size: tuple[float, float, float],
        swatch: str,
        rotation_z: float = 0.0,
        *,
        collider: bool = False,
        wall_collider: bool = False,
    ) -> None:
        self.architecture.add_box(center, size, swatch, rotation_z)
        if collider:
            self.add_collider(center, size, rotation_z)
        if wall_collider:
            self.add_wall_collider(center, size, rotation_z)


def create_box_mesh(
    name: str,
    boxes: list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    collection: bpy.types.Collection,
    properties: dict[str, object] | None = None,
) -> bpy.types.Object | None:
    if not boxes:
        return None
    vertices = []
    faces = []
    for minimum, maximum in boxes:
        x0, y0, z0 = minimum
        x1, y1, z1 = maximum
        offset = len(vertices)
        vertices.extend(
            ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))
        )
        faces.extend(
            tuple(offset + index for index in face)
            for face in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))
        )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for key, value in (properties or {}).items():
        obj[key] = value
    return obj


def add_additional_prop(
    room: RoomBuilder,
    prop_type: str,
    position: tuple[float, float, float],
    rotation_z: float = 0.0,
) -> None:
    if prop_type not in ADDITIONAL_PROP_TYPES:
        raise RuntimeError(f"未定義の追加小物です: {prop_type}")
    room.counts[prop_type] = room.counts.get(prop_type, 0) + 1
    x, y, z = position
    definitions = {
        "TeacherDesk": [
            ((0, 0, 0.66), (1.2, 0.6, 0.12), "wood"),
            ((0, 0, 0.30), (1.05, 0.5, 0.60), "metal_gray"),
        ],
        "ChangingBench": [((0, 0, 0.42), (1.8, 0.45, 0.12), "wood"), ((0, 0, 0.2), (1.55, 0.32, 0.4), "metal_gray")],
        "BulletinBoard": BULLETIN_BOARD_FURNITURE_PARTS,
        "WallClock": [((0, 0, 1.9), (0.35, 0.04, 0.35), "plastic_black")],
        "FireExtinguisher": [((0, 0, 0.32), (0.24, 0.18, 0.64), "accent_red")],
        "TrashBin": [((0, 0, 0.25), (0.3, 0.3, 0.5), "metal_gray")],
        "UmbrellaStand": [((0, 0, 0.3), (0.9, 0.3, 0.6), "metal_gray")],
        "WashBasin": [((0, 0, 0.72), (1.2, 0.5, 0.26), "porcelain"), ((0, 0, 0.35), (1.0, 0.38, 0.7), "metal_gray")],
        "Mirror": [((0, 0, 1.5), (0.9, 0.03, 0.6), "metal_gray")],
        "PcTower": [((0, 0, 0.23), (0.2, 0.45, 0.45), "plastic_black")],
        "KeyboardMouse": [((0, 0, 0.74), (0.45, 0.18, 0.04), "plastic_black")],
        "ScienceStool": [((0, 0, 0.45), (0.35, 0.35, 0.08), "wood"), ((0, 0, 0.22), (0.2, 0.2, 0.44), "metal_gray")],
        "LabBench": [((0, 0, 0.72), (1.8, 0.75, 0.26), "wood"), ((0, 0, 0.34), (1.55, 0.58, 0.68), "metal_gray"), ((0.48, 0, 0.88), (0.48, 0.38, 0.08), "porcelain")],
        "MedicalCabinet": [((0, 0, 0.9), (1.2, 0.45, 1.8), "metal_gray")],
        "BroadcastConsole": [
            ((0, 0, 0.36), (1.6, 0.75, 0.72), "metal_gray"),
            ((0, -0.04, 0.76), (1.45, 0.55, 0.08), "metal_dark"),
            ((0, 0.20, 0.94), (1.35, 0.08, 0.30), "plastic_black"),
            ((-0.48, -0.12, 0.82), (0.18, 0.12, 0.03), "accent_orange"),
            ((-0.16, -0.12, 0.82), (0.18, 0.12, 0.03), "fabric_green"),
            ((0.16, -0.12, 0.82), (0.18, 0.12, 0.03), "accent_orange"),
            ((0.48, -0.12, 0.82), (0.18, 0.12, 0.03), "fabric_green"),
        ],
        "Easel": [
            ((-0.24, 0, 0.65), (0.06, 0.06, 1.30), "wood"),
            ((0.24, 0, 0.65), (0.06, 0.06, 1.30), "wood"),
            ((0, 0.28, 0.55), (0.07, 0.07, 1.10), "wood"),
            ((0, -0.02, 0.67), (0.72, 0.16, 0.07), "wood"),
            ((0, 0.01, 1.13), (0.62, 0.06, 0.75), "wood_light"),
            ((0, -0.025, 1.13), (0.52, 0.02, 0.65), "accent_orange"),
        ],
        "KitchenIsland": [((0, 0, 0.72), (1.8, 0.9, 0.26), "porcelain"), ((0, 0, 0.34), (1.55, 0.7, 0.68), "wood")],
        "SewingMachine": [((0, 0, 0.86), (0.45, 0.2, 0.25), "porcelain"), ((-0.12, 0, 1.05), (0.12, 0.18, 0.2), "metal_gray")],
        "MusicStand": [((0, 0, 0.65), (0.05, 0.05, 1.1), "metal_dark"), ((0, 0, 1.18), (0.5, 0.05, 0.32), "metal_dark")],
        "AvRack": [((0, 0, 0.75), (0.7, 0.5, 1.5), "metal_dark"), ((0, -0.26, 0.9), (0.52, 0.03, 0.3), "plastic_black")],
        "InfirmaryCurtain": [((0, 0, 1.35), (2.0, 0.05, 1.8), "fabric_green")],
        "RoomSign": [((0, 0, 1.7), (0.45, 0.04, 0.18), "sign_2")],
        "LifePreserverSign": [((0, 0, 1.2), (0.7, 0.12, 0.7), "safety")],
    }
    cosine = math.cos(rotation_z)
    sine = math.sin(rotation_z)
    for local_center, size, swatch in definitions[prop_type]:
        lx, ly, lz = local_center
        target = (
            x + lx * cosine - ly * sine,
            y + lx * sine + ly * cosine,
            z + lz,
        )
        signs = prop_type in {"RoomSign", "LifePreserverSign"}
        room.box(target, size, swatch, rotation_z, signs=signs)
    if prop_type == "BulletinBoard":
        for local_center, size, swatch in BULLETIN_BOARD_PAPER_PARTS:
            lx, ly, lz = local_center
            target = (
                x + lx * cosine - ly * sine,
                y + lx * sine + ly * cosine,
                z + lz,
            )
            room.box(target, size, swatch, rotation_z, signs=True)
    if prop_type in IMPASSABLE_ADDITIONAL_PROP_TYPES:
        size = {
            "TeacherDesk": (1.2, 0.6, 0.72),
            "ChangingBench": (1.8, 0.45, 0.48), "WashBasin": (1.2, 0.5, 0.85),
            "LabBench": (1.8, 0.75, 0.92), "MedicalCabinet": (1.2, 0.45, 1.8),
            "BroadcastConsole": (1.6, 0.75, 1.09), "KitchenIsland": (1.8, 0.9, 0.9),
            "AvRack": (0.7, 0.525, 1.5),
        }[prop_type]
        local_center = {
            "AvRack": (0.0, -0.0125, 0.75),
        }.get(prop_type, (0.0, 0.0, size[2] / 2.0))
        collider_center = (
            x + local_center[0] * cosine - local_center[1] * sine,
            y + local_center[0] * sine + local_center[1] * cosine,
            z + local_center[2],
        )
        room.add_collider(collider_center, size, rotation_z)


def add_wall_blackboard(
    room: RoomBuilder,
    sources: dict[str, bpy.types.Object],
    x: float,
    y: float,
    rotation_z: float,
) -> None:
    room.add_prop(sources, "Blackboard", x, y, rotation_z, 1.72)


def add_desktop_prop(
    room: RoomBuilder,
    sources: dict[str, bpy.types.Object],
    prop_type: str,
    x: float,
    y: float,
    rotation_z: float = 0.0,
    desktop_height: float = 0.70,
) -> None:
    room.add_prop(sources, prop_type, x, y, rotation_z, desktop_height)


def add_table_group(
    room: RoomBuilder,
    sources: dict[str, bpy.types.Object],
    x: float,
    y: float,
    chairs: int = 4,
) -> None:
    room.add_prop(sources, "LargeWoodTable", x, y)
    offsets = ((-0.55, -0.58), (0.55, -0.58), (-0.55, 0.58), (0.55, 0.58))
    for dx, dy in offsets[:chairs]:
        room.add_prop(
            sources,
            "ClassroomChair",
            x + dx,
            y + dy,
            0.0 if dy > 0 else math.pi,
        )


CLASSROOM_SCATTER_VARIANTS = (
    {
        (0, 5): -0.08,
        (4, 4): 0.07,
        (1, 3): 0.06,
        (3, 2): -0.07,
        (4, 0): -0.08,
    },
    {
        (0, 5): -0.11,
        (4, 4): 0.09,
        (1, 3): 0.08,
        (3, 2): -0.08,
        (0, 1): 0.07,
        (4, 0): -0.09,
    },
    {
        (0, 5): -0.12,
        (4, 4): 0.10,
        (1, 3): 0.09,
        (3, 2): -0.09,
        (0, 1): 0.08,
        (4, 0): -0.10,
        (2, 0): 0.07,
    },
)

CLASSROOM_DESKTOP_PROP_VARIANTS = (
    (
        ("ClosedBook", (0, 3), 0.12, 0.0),
        ("PencilCase", (1, 1), 0.12, 0.0),
    ),
    (
        ("ClosedBook", (0, 3), 0.12, 0.0),
        ("OpenBook", (2, 4), 0.0, 0.0),
        ("SinglePaper", (4, 2), -0.10, 0.0),
        ("PencilCase", (1, 1), 0.12, 0.0),
    ),
    (
        ("OpenBook", (2, 4), 0.0, 0.0),
        ("SinglePaper", (4, 2), -0.10, 0.0),
        ("PencilCase", (1, 1), 0.12, 0.0),
    ),
)


def build_classroom(
    room: RoomBuilder,
    sources: dict[str, bpy.types.Object],
    room_y_offset: float,
    variant_index: int,
) -> dict[str, float | int]:
    rotations = CLASSROOM_SCATTER_VARIANTS[variant_index]
    desk_positions: dict[tuple[int, int], tuple[float, float, float]] = {}
    for row in range(6):
        for column in range(5):
            x = -11.15 + column * 1.42
            y = 4.5 + room_y_offset + row * 1.22
            rotation = rotations.get((column, row), 0.0)
            desk_positions[(column, row)] = (x, y, rotation)
            room.add_prop(sources, "ClassroomDesk", x, y, rotation)
            chair_distance = 0.58 if (column, row) in rotations else 0.31
            chair_x = x + math.sin(rotation) * chair_distance
            chair_y = y - math.cos(rotation) * chair_distance
            room.add_prop(
                sources,
                "ClassroomChair",
                chair_x,
                chair_y,
                math.pi + rotation,
            )
    add_wall_blackboard(room, sources, -8.05, 12.34 + room_y_offset, math.pi)
    for locker_x in CLASSROOM_REAR_BAGGAGE_XS:
        room.add_prop(
            sources,
            "BaggageLocker",
            locker_x,
            CLASSROOM_REAR_LOCKER_Y + room_y_offset,
            math.pi,
        )
    room.add_prop(
        sources,
        "CleaningLocker",
        CLASSROOM_REAR_CLEANING_X,
        CLASSROOM_REAR_LOCKER_Y + room_y_offset,
        math.pi,
    )
    add_additional_prop(
        room,
        "TeacherDesk",
        (-8.05, 11.25 + room_y_offset, room.base_z),
        math.pi,
    )
    add_additional_prop(
        room,
        "WallClock",
        (-8.05, 12.31 + room_y_offset, room.base_z),
        math.pi,
    )
    trash_x, trash_y = CLASSROOM_TRASH_BIN_PLACEMENT
    add_additional_prop(
        room,
        "TrashBin",
        (trash_x, trash_y + room_y_offset, room.base_z),
    )
    for prop_type, key, offset_x, offset_y in CLASSROOM_DESKTOP_PROP_VARIANTS[
        variant_index
    ]:
        desk_x, desk_y, desk_rotation = desk_positions[key]
        add_desktop_prop(
            room,
            sources,
            prop_type,
            desk_x + offset_x,
            desk_y + offset_y,
            desk_rotation,
        )
    scattered = len(rotations)
    return {
        "scattered_sets": scattered,
        "stored_chairs": 30 - scattered,
        "scatter_ratio": scattered / 30,
        "book_paper_spots": len(CLASSROOM_DESKTOP_PROP_VARIANTS[variant_index]),
    }


def build_toilet_room(
    room: RoomBuilder,
    sources: dict[str, bpy.types.Object],
    *,
    include_structure_and_fixtures: bool,
) -> None:
    wall_center_z = room.base_z + 1.5
    for minimum_x, maximum_x in TOILET_FRONT_WALL_SPANS:
        room.architecture_box(
            (
                (minimum_x + maximum_x) / 2.0,
                TOILET_FRONT_WALL_Y,
                wall_center_z,
            ),
            (
                maximum_x - minimum_x,
                TOILET_FRONT_WALL_DEPTH,
                3.0,
            ),
            "wall",
            wall_collider=True,
        )
    for minimum_x, maximum_x in TOILET_FRONT_DOOR_OPENINGS:
        room.architecture_box(
            (
                (minimum_x + maximum_x) / 2.0,
                TOILET_FRONT_WALL_Y,
                room.base_z + (TOILET_FRONT_DOOR_HEIGHT + 3.0) / 2.0,
            ),
            (
                maximum_x - minimum_x,
                TOILET_FRONT_WALL_DEPTH,
                3.0 - TOILET_FRONT_DOOR_HEIGHT,
            ),
            "wall",
            wall_collider=True,
        )

    if include_structure_and_fixtures:
        room.architecture_box(
            (-2.1, 42.0, wall_center_z),
            (0.30, 7.0, 3.0),
            "wall",
            wall_collider=True,
        )
        room.architecture_box(
            (2.4, 42.0, wall_center_z),
            (0.30, 7.0, 3.0),
            "wall",
            wall_collider=True,
        )
        for partition_x in (-5.05, -3.65, -0.55, 0.85):
            room.architecture_box(
                (partition_x, 44.3, room.base_z + 1.05),
                (0.08, 2.10, 2.10),
                "wall",
                collider=True,
            )
            room.architecture_box(
                (partition_x - 0.04, 43.70, room.base_z + 0.90),
                (0.04, 0.90, 1.80),
                "door",
            )
        for toilet_x in (-5.8, -4.35, -2.95, -1.3, 0.15, 1.55):
            room.add_prop(sources, "WesternToilet", toilet_x, 44.7)
        for urinal_y in (39.6, 40.6, 41.6):
            room.add_prop(
                sources,
                "Urinal",
                -2.40,
                urinal_y,
                math.pi / 2,
                0.8,
            )

    add_additional_prop(
        room, "WashBasin", (-6.05, 40.4, room.base_z), math.pi / 2
    )
    add_additional_prop(
        room, "Mirror", (-6.30, 40.4, room.base_z), math.pi / 2
    )
    add_additional_prop(
        room, "WashBasin", (1.95, 40.4, room.base_z), -math.pi / 2
    )
    add_additional_prop(
        room, "Mirror", (2.20, 40.4, room.base_z), -math.pi / 2
    )
    for x, y, rotation in TOILET_SIGN_PLACEMENTS:
        add_additional_prop(room, "RoomSign", (x, y, room.base_z), rotation)


def build_common_area_rooms(
    sources: dict[str, bpy.types.Object],
) -> list[RoomBuilder]:
    rooms: list[RoomBuilder] = []
    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        corridor = RoomBuilder.create(f"F{floor:02d}_Corridors", base_z)
        for y in (8.5, 18.5, 28.5):
            add_additional_prop(
                corridor,
                "FireExtinguisher",
                (-3.15, y, base_z),
                math.pi / 2,
            )
        for y in WEST_CORRIDOR_SIGN_POSITIONS[floor]:
            add_additional_prop(
                corridor, "RoomSign", (-3.34, y, base_z), math.pi / 2
            )
        add_additional_prop(
            corridor, "BulletinBoard", (30.0, 36.34, base_z), 0.0
        )
        add_additional_prop(corridor, "WallClock", (17.0, 36.33, base_z), 0.0)
        add_additional_prop(
            corridor, "FireExtinguisher", (41.15, 36.75, base_z), 0.0
        )
        add_additional_prop(
            corridor,
            "RoomSign",
            (NORTH_CORRIDOR_SIGN_X[floor], 36.34, base_z),
            0.0,
        )
        corridor.add_prop(sources, "CleaningLocker", *CORRIDOR_CLEANING_LOCKER)
        rooms.append(corridor)

    main_entry = RoomBuilder.create("F01_MainEntry", 0.0)
    for x, y, rotation in MAIN_ENTRY_BAGGAGE_LOCKERS:
        main_entry.add_prop(sources, "BaggageLocker", x, y, rotation)
    add_additional_prop(main_entry, "RoomSign", (-1.625, -3.46, 0.0))
    rooms.append(main_entry)

    north_entry = RoomBuilder.create("F01_NorthEntry", 0.0)
    north_locker_x, north_locker_y, north_locker_rotation = (
        NORTH_ENTRY_BAGGAGE_LOCKER
    )
    north_entry.add_prop(
        sources,
        "BaggageLocker",
        north_locker_x,
        north_locker_y,
        north_locker_rotation,
    )
    umbrella_x, umbrella_y, umbrella_rotation = NORTH_ENTRY_UMBRELLA_STAND
    add_additional_prop(
        north_entry,
        "UmbrellaStand",
        (umbrella_x, umbrella_y, 0.0),
        umbrella_rotation,
    )
    add_additional_prop(north_entry, "RoomSign", (5.825, 45.48, 0.0))
    rooms.append(north_entry)

    gym_storage = RoomBuilder.create("GymStorage", 0.0)
    gym_storage.add_prop(sources, "VaultingBox", 52.7, 28.3)
    gym_storage.add_prop(sources, "VaultingBox", 54.4, 28.3)
    gym_storage.add_prop(sources, "CleaningLocker", 56.7, 29.6, math.pi / 2)
    rooms.append(gym_storage)

    roof_pool = RoomBuilder.create("RoofPoolSafety", 14.5)
    add_additional_prop(
        roof_pool, "LifePreserverSign", (22.0, 36.8, 14.5), math.pi
    )
    add_additional_prop(
        roof_pool, "LifePreserverSign", (39.5, 45.1, 14.5), 0.0
    )
    support_center, support_size = ROOF_POOL_NORTH_SIGN_SUPPORT
    roof_pool.architecture_box(support_center, support_size, "trim")
    add_additional_prop(roof_pool, "RoomSign", (2.42, 39.1, 14.5), math.pi / 2)
    rooms.append(roof_pool)
    return rooms


def build_school_rooms(
    sources: dict[str, bpy.types.Object],
) -> tuple[list[RoomBuilder], dict[str, dict[str, float | int]]]:
    rooms: list[RoomBuilder] = []
    classroom_metrics: dict[str, dict[str, float | int]] = {}
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        for room_index, room_y_offset in enumerate((0.0, 10.0, 20.0), 1):
            name = f"F{floor:02d}_Classroom{room_index:02d}"
            classroom = RoomBuilder.create(name, base_z)
            variant_index = (floor + room_index) % len(CLASSROOM_SCATTER_VARIANTS)
            classroom_metrics[name] = build_classroom(
                classroom, sources, room_y_offset, variant_index
            )
            rooms.append(classroom)

    infirmary = RoomBuilder.create("F01_Infirmary", 0.0)
    infirmary.add_prop(sources, "InfirmaryBed", -10.8, 5.0)
    infirmary.add_prop(sources, "InfirmaryBed", -10.8, 7.2)
    infirmary.add_prop(sources, "StaffChair", -5.35, 5.2, -math.pi / 2)
    infirmary.add_prop(sources, "Bookshelf", -7.2, 10.8, math.pi / 2)
    infirmary.add_prop(sources, "CleaningLocker", -10.7, 11.7, math.pi / 2)
    infirmary.add_prop(sources, "StaffDesk", -6.2, 5.2, math.pi / 2)
    add_additional_prop(infirmary, "MedicalCabinet", (-5.0, 10.8, 0.0), math.pi / 2)
    add_additional_prop(infirmary, "InfirmaryCurtain", (-9.5, 6.1, 0.0), math.pi / 2)
    add_additional_prop(infirmary, "WashBasin", (-5.0, 8.8, 0.0), math.pi / 2)
    add_additional_prop(infirmary, "RoomSign", (-3.34, 10.275, 0.0), math.pi / 2)
    rooms.append(infirmary)

    library = RoomBuilder.create("F01_Library", 0.0)
    for x, y, rotation in LIBRARY_BOOKSHELF_PLACEMENTS:
        library.add_prop(sources, "Bookshelf", x, y, rotation)
    for x in (-9.7, -6.5):
        for y in (18.0, 24.0):
            add_table_group(library, sources, x, y)
    library.add_prop(sources, "StaffDesk", -8.1, 30.8)
    library.add_prop(sources, "StaffChair", -8.1, 30.0, math.pi)
    add_desktop_prop(library, sources, "OpenBook", -9.7, 18.0, 0.15)
    add_desktop_prop(library, sources, "ClosedBook", -6.5, 24.0, -0.12)
    add_additional_prop(library, "BulletinBoard", (-8.0, 12.68, 0.0), math.pi)
    rooms.append(library)

    staff = RoomBuilder.create("F01_StaffRoom", 0.0)
    for island, island_x in enumerate((7.2, 14.4, 21.0)):
        for row, desk_y in enumerate((40.65, 41.35)):
            desk_rotation = 0.0 if row == 0 else math.pi
            chair_y = 39.95 if row == 0 else 42.05
            chair_rotation = math.pi if row == 0 else 0.0
            for column, desk_x in enumerate((island_x - 0.7, island_x + 0.7)):
                staff.add_prop(sources, "StaffDesk", desk_x, desk_y, desk_rotation)
                staff.add_prop(
                    sources,
                    "StaffChair",
                    desk_x,
                    chair_y,
                    chair_rotation,
                )
                if column == row:
                    add_desktop_prop(
                        staff,
                        sources,
                        "PcMonitor",
                        desk_x,
                        desk_y,
                        desk_rotation,
                        0.72,
                    )
    staff.add_prop(sources, "Bookshelf", 5.8, 44.0, math.pi / 2)
    staff.add_prop(sources, "Bookshelf", 23.0, 44.0, math.pi / 2)
    staff.add_prop(sources, "CleaningLocker", *STAFFROOM_CLEANING_LOCKER)
    add_additional_prop(staff, "BulletinBoard", (14.4, 36.68, 0.0), math.pi)
    add_additional_prop(staff, "WallClock", (18.0, 36.67, 0.0), math.pi)
    add_additional_prop(staff, "TrashBin", STAFFROOM_TRASH_BIN)
    add_desktop_prop(staff, sources, "PaperStack", 15.1, 40.65, 0.08, 0.72)
    rooms.append(staff)

    pc = RoomBuilder.create("F01_PcRoom", 0.0)
    for row_y in (38.5, 40.9, 43.0):
        for column in range(6):
            x = 24.8 + column * 3.1
            y = row_y
            pc.add_prop(sources, "StaffDesk", x, y, -math.pi / 2)
            pc.add_prop(sources, "StaffChair", x - 0.62, y, math.pi / 2)
            add_desktop_prop(
                pc, sources, "PcMonitor", x + 0.16, y, -math.pi / 2, 0.72
            )
            add_additional_prop(
                pc, "PcTower", (x + 0.10, y + 0.46, 0.72), -math.pi / 2
            )
            add_additional_prop(
                pc, "KeyboardMouse", (x - 0.16, y, 0.0), -math.pi / 2
            )
    add_additional_prop(pc, "AvRack", (40.8, 44.7, 0.0))
    pc.add_prop(sources, "BaggageLocker", 29.0, 44.8)
    pc.add_prop(sources, "BaggageLocker", 31.2, 44.8)
    pc.add_prop(sources, "CleaningLocker", 32.7, 44.8)
    rooms.append(pc)

    council = RoomBuilder.create("F02_Council", 3.6)
    council.add_prop(sources, "LargeWoodTable", 8.4, 41.0)
    council.add_prop(sources, "LargeWoodTable", 10.2, 41.0)
    for chair_x in (7.8, 8.8, 9.8, 10.8):
        council.add_prop(sources, "ClassroomChair", chair_x, 40.38, math.pi)
        council.add_prop(sources, "ClassroomChair", chair_x, 41.62, 0.0)
    council.add_prop(sources, "StaffDesk", 12.5, 44.2)
    council.add_prop(sources, "StaffChair", 12.5, 43.4, math.pi)
    council.add_prop(sources, "BaggageLocker", 6.45, 45.125)
    add_additional_prop(council, "BulletinBoard", (13.3, 45.31, 3.6))
    rooms.append(council)

    broadcast = RoomBuilder.create("F02_Broadcast", 3.6)
    add_additional_prop(
        broadcast, "BroadcastConsole", (18.8, 41.2, 3.6), math.pi
    )
    add_additional_prop(broadcast, "AvRack", (15.2, 44.7, 3.6))
    broadcast.add_prop(sources, "StaffDesk", 16.4, 38.5)
    broadcast.add_prop(sources, "StaffDesk", 21.2, 38.5)
    broadcast.add_prop(sources, "BaggageLocker", 16.7, 44.8)
    broadcast.add_prop(sources, "StaffChair", 18.2, 42.15, 0.0)
    broadcast.add_prop(sources, "StaffChair", 19.4, 42.15, 0.0)
    add_desktop_prop(
        broadcast, sources, "PcMonitor", 18.2, 41.2, math.pi, 0.80
    )
    add_desktop_prop(
        broadcast, sources, "PcMonitor", 19.4, 41.2, math.pi, 0.80
    )
    rooms.append(broadcast)

    science = RoomBuilder.create("F02_Science", 3.6)
    for x in (27.0, 32.4, 37.8):
        for y in (39.4, 43.0):
            add_additional_prop(science, "LabBench", (x, y, 3.6))
            for dx in (-0.6, 0.0, 0.6):
                add_additional_prop(science, "ScienceStool", (x + dx, y - 0.72, 3.6))
                add_additional_prop(science, "ScienceStool", (x + dx, y + 0.72, 3.6))
    add_wall_blackboard(science, sources, 41.34, 41.0, math.pi / 2)
    add_additional_prop(science, "MedicalCabinet", (40.5, 44.7, 3.6))
    science.add_prop(sources, "Bookshelf", 27.0, 44.8)
    science.add_prop(sources, "Bookshelf", 28.2, 44.8)
    science.add_prop(sources, "CleaningLocker", 29.4, 44.8)
    rooms.append(science)

    art = RoomBuilder.create("F03_Art", 7.2)
    for x in ART_TABLE_XS:
        for y in ART_TABLE_YS:
            add_table_group(art, sources, x, y)
    for x in ART_EASEL_XS:
        add_additional_prop(art, "Easel", (x, ART_EASEL_Y, 7.2), math.pi / 2)
    add_wall_blackboard(art, sources, 23.34, 41.0, math.pi / 2)
    for x, y, rotation in ART_BOOKSHELF_PLACEMENTS:
        art.add_prop(sources, "Bookshelf", x, y, rotation)
    locker_x, locker_y, locker_rotation = ART_CLEANING_LOCKER
    art.add_prop(
        sources,
        "CleaningLocker",
        locker_x,
        locker_y,
        locker_rotation,
    )
    rooms.append(art)

    home = RoomBuilder.create("F03_HomeEc", 7.2)
    for x in (27.5, 36.5):
        for y in (39.5, 43.0):
            add_additional_prop(home, "KitchenIsland", (x, y, 7.2))
            for dx in (-0.55, 0.55):
                add_additional_prop(home, "SewingMachine", (x + dx, y, 7.2))
            for dx in (-0.6, 0.0, 0.6):
                home.add_prop(sources, "ClassroomChair", x + dx, y - 0.72, math.pi)
                home.add_prop(sources, "ClassroomChair", x + dx, y + 0.72, 0.0)
    add_additional_prop(home, "WashBasin", (40.5, 44.5, 7.2), math.pi / 2)
    add_wall_blackboard(home, sources, 41.34, 39.4, math.pi / 2)
    home.add_prop(sources, "CleaningLocker", 27.0, 44.8)
    rooms.append(home)

    ll = RoomBuilder.create("F04_LL", 10.8)
    for y in LL_DESK_YS:
        for x in LL_DESK_XS:
            ll.add_prop(sources, "ClassroomDesk", x, y, -math.pi / 2)
            ll.add_prop(sources, "ClassroomChair", x - 0.31, y, math.pi / 2)
    add_wall_blackboard(ll, sources, 23.34, 41.0, math.pi / 2)
    add_additional_prop(ll, "AvRack", (*LL_AV_RACK, 10.8))
    for x in LL_BAGGAGE_LOCKER_XS:
        ll.add_prop(sources, "BaggageLocker", x, 44.8)
    rooms.append(ll)

    music = RoomBuilder.create("F04_Music", 10.8)
    piano_x, piano_y, piano_rotation = MUSIC_PIANO_PLACEMENT
    music.add_prop(sources, "GrandPiano", piano_x, piano_y, piano_rotation)
    for y in MUSIC_CHAIR_YS:
        for x in MUSIC_CHAIR_XS:
            music.add_prop(
                sources,
                "ClassroomChair",
                x,
                y,
                MUSIC_CHAIR_ROTATION,
            )
    add_wall_blackboard(music, sources, 41.34, 41.0, math.pi / 2)
    music.add_prop(sources, "Bookshelf", 34.5, 44.8)
    music.add_prop(sources, "Bookshelf", 35.7, 44.8)
    music.add_prop(sources, "CleaningLocker", 36.9, 44.8)
    rooms.append(music)

    gym = RoomBuilder.create("Gym", 0.0)
    gym.add_prop(sources, "BasketballGoal", 33.55, 8.5, -math.pi / 2, 3.35)
    gym.add_prop(sources, "BasketballGoal", 57.25, 8.5, math.pi / 2, 3.35)
    gym.add_prop(sources, "VaultingBox", 37.0, 22.5)
    gym.add_prop(sources, "VaultingBox", 39.0, 22.5)
    lectern_x, lectern_y, lectern_z = GYM_STAGE_LECTERN
    gym.add_prop(sources, "StageLectern", lectern_x, lectern_y, 0.0, lectern_z)
    add_additional_prop(gym, "WallClock", (45.4, 26.3, 3.0))
    add_additional_prop(gym, "LifePreserverSign", (56.9, 23.5, 0.0), math.pi / 2)
    rooms.append(gym)

    changing = RoomBuilder.create("RoofChanging", 14.5)
    for x in ROOF_CHANGING_BAGGAGE_LOCKER_XS:
        changing.add_prop(sources, "BaggageLocker", x, 44.8)
    add_additional_prop(changing, "ChangingBench", (-4.2, 41.3, 14.5))
    add_additional_prop(changing, "ChangingBench", (0.2, 41.3, 14.5))
    add_additional_prop(changing, "Mirror", (-2.1, 45.3, 14.5))
    add_additional_prop(changing, "RoomSign", (-3.775, 38.48, 14.5))
    rooms.append(changing)

    for floor, base_z in ((1, 0.0), (2, 3.6), (3, 7.2), (4, 10.8)):
        toilets = RoomBuilder.create(f"F{floor:02d}_Toilets", base_z)
        build_toilet_room(
            toilets,
            sources,
            include_structure_and_fixtures=floor != 1,
        )
        rooms.append(toilets)

    rooms.extend(build_common_area_rooms(sources))
    return rooms, classroom_metrics


def remove_imported_sources(sources: dict[str, bpy.types.Object]) -> None:
    for source in sources.values():
        mesh = source.data
        bpy.data.objects.remove(source, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def build_school_interiors(
    visual_collection: bpy.types.Collection,
    collider_collection: bpy.types.Collection,
    nav_collection: bpy.types.Collection,
) -> dict[str, object]:
    materials = build_atlases()
    source_types = {
        "ClassroomDesk", "ClassroomChair", "StaffDesk", "StaffChair", "Blackboard",
        "StageLectern", "LargeWoodTable", "CleaningLocker", "BaggageLocker",
        "GrandPiano", "InfirmaryBed", "PcMonitor", "BasketballGoal", "VaultingBox",
        "Bookshelf", "ClosedBook", "OpenBook", "PaperStack", "SinglePaper",
        "PencilCase",
        "WesternToilet", "Urinal",
    }
    sources = import_prop_sources(source_types)
    rooms, classroom_metrics = build_school_rooms(sources)
    all_colliders = []
    visual_objects = 0
    for room in rooms:
        if room.architecture.create(
            f"VIS_B03_Interior_{room.name}_Architecture",
            visual_collection,
            materials["Architecture"],
        ) is not None:
            visual_objects += 1
        if room.furniture.create(
            f"VIS_B03_Interior_{room.name}_FurnitureProps",
            visual_collection,
            materials["FurnitureProps"],
        ) is not None:
            visual_objects += 1
        if room.signs.create(
            f"VIS_B03_Interior_{room.name}_SignsPaper",
            visual_collection,
            materials["SignsPaper"],
        ) is not None:
            visual_objects += 1
        create_box_mesh(
            f"COL_B03_Interior_{room.name}", room.colliders, collider_collection
        )
        create_box_mesh(
            f"COL_B03_Interior_Walls_{room.name}",
            room.wall_colliders,
            collider_collection,
        )
        all_colliders.extend(room.colliders)
        all_colliders.extend(room.wall_colliders)
    create_box_mesh(
        "NAV_Blocker_Interiors",
        all_colliders,
        nav_collection,
        {"hs_nav_role": "blocker"},
    )
    remove_imported_sources(sources)
    return {
        "scope": "full_school",
        "rooms": len(rooms),
        "visual_objects": visual_objects,
        "collider_boxes": len(all_colliders),
        "wall_collider_objects": sum(bool(room.wall_colliders) for room in rooms),
        "additional_prop_types": len(ADDITIONAL_PROP_TYPES),
        "atlases": len(materials),
        "classrooms": len(classroom_metrics),
        "classroom_metrics": classroom_metrics,
        "classroom_front": "north",
        "north_wing_classroom_front": "east",
        "blackboards": {
            **{
                f"F{floor:02d}_Classroom{room_index:02d}": [
                    -8.05,
                    12.34 + (room_index - 1) * 10.0,
                    base_z + 1.72,
                    math.pi,
                ]
                for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8))
                for room_index in (1, 2, 3)
            },
            "F02_Science": [41.34, 41.0, 5.32, math.pi / 2],
            "F03_Art": [23.34, 41.0, 8.92, math.pi / 2],
            "F03_HomeEc": [41.34, 39.4, 8.92, math.pi / 2],
            "F04_LL": [23.34, 41.0, 12.52, math.pi / 2],
            "F04_Music": [41.34, 41.0, 12.52, math.pi / 2],
        },
        "room_counts": {room.name: room.counts for room in rooms},
    }
