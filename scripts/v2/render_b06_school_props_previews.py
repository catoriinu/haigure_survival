from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B03/b03_school_prop_library.blend"
OUTPUT_DIRECTORY = REPOSITORY_ROOT / "docs/plans/v2/B06-3/images/props"

PREVIEW_SCENE_NAME = "B06_PROP_PREVIEW_Scene"
PREVIEW_COLLECTION_NAME = "B06_PROP_PREVIEW"
RENDER_WIDTH = 1920
RENDER_HEIGHT = 1080

TARGETS = (
    (
        "urinal",
        "VIS_Prop_Urinal",
        1.0,
        (
            ("01_urinal_front", (0.0, 1.0)),
            ("02_urinal_three_quarter", (1.0, 1.0)),
            ("03_urinal_side", (1.0, 0.0)),
        ),
    ),
    (
        "western_toilet",
        "VIS_Prop_WesternToilet",
        1.0,
        (
            ("04_western_toilet_front", (0.0, -1.0)),
            ("05_western_toilet_three_quarter", (1.0, -1.0)),
            ("06_western_toilet_side", (1.0, 0.0)),
        ),
    ),
    (
        "grand_piano",
        "VIS_Prop_GrandPiano",
        0.9,
        (
            ("07_grand_piano_front", (0.0, -1.0)),
            ("08_grand_piano_three_quarter", (1.0, -1.0)),
            ("09_grand_piano_side", (1.0, 0.0)),
        ),
    ),
)


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(
        (
            min(corner.x for corner in corners),
            min(corner.y for corner in corners),
            min(corner.z for corner in corners),
        )
    )
    maximum = Vector(
        (
            max(corner.x for corner in corners),
            max(corner.y for corner in corners),
            max(corner.z for corner in corners),
        )
    )
    return minimum, maximum


def source_snapshot(obj: bpy.types.Object) -> dict[str, object]:
    return {
        "matrix_world": tuple(
            tuple(float(value) for value in row) for row in obj.matrix_world
        ),
        "mesh_pointer": obj.data.as_pointer(),
        "hide_render": obj.hide_render,
        "hide_viewport": obj.hide_viewport,
    }


def duplicate_at_origin(
    source: bpy.types.Object,
    name: str,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    source_minimum, source_maximum = world_bounds(source)
    offset = Vector(
        (
            -(source_minimum.x + source_maximum.x) / 2.0,
            -(source_minimum.y + source_maximum.y) / 2.0,
            -source_minimum.z,
        )
    )
    duplicate = source.copy()
    duplicate.data = source.data.copy()
    duplicate.name = name
    duplicate.data.name = f"{name}_Mesh"
    duplicate.parent = None
    duplicate.animation_data_clear()
    duplicate.matrix_world = Matrix.Translation(offset) @ source.matrix_world
    duplicate.hide_render = True
    duplicate.hide_viewport = False
    collection.objects.link(duplicate)

    minimum, maximum = world_bounds(duplicate)
    if abs((minimum.x + maximum.x) / 2.0) > 1e-5:
        raise RuntimeError(f"複製ObjectのX中心が原点ではありません: {name}")
    if abs((minimum.y + maximum.y) / 2.0) > 1e-5:
        raise RuntimeError(f"複製ObjectのY中心が原点ではありません: {name}")
    if abs(minimum.z) > 1e-5:
        raise RuntimeError(f"複製Objectの下端が床高ではありません: {name}")
    return duplicate


def create_floor_material() -> bpy.types.Material:
    material = bpy.data.materials.new("B06_PROP_PREVIEW_FloorMaterial")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader is None:
        raise RuntimeError("床MaterialにPrincipled BSDFがありません")
    shader.inputs["Base Color"].default_value = (0.23, 0.25, 0.29, 1.0)
    shader.inputs["Roughness"].default_value = 0.86
    return material


def create_floor(
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    half_extent = 4.0
    bottom = -0.08
    vertices = (
        (-half_extent, -half_extent, bottom),
        (half_extent, -half_extent, bottom),
        (half_extent, half_extent, bottom),
        (-half_extent, half_extent, bottom),
        (-half_extent, -half_extent, 0.0),
        (half_extent, -half_extent, 0.0),
        (half_extent, half_extent, 0.0),
        (-half_extent, half_extent, 0.0),
    )
    faces = (
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    )
    mesh = bpy.data.meshes.new("B06_PROP_PREVIEW_FloorMesh")
    mesh.from_pydata(vertices, (), faces)
    mesh.materials.append(material)
    floor = bpy.data.objects.new("B06_PROP_PREVIEW_Floor", mesh)
    collection.objects.link(floor)
    return floor


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def create_camera(collection: bpy.types.Collection) -> bpy.types.Object:
    camera_data = bpy.data.cameras.new("B06_PROP_PREVIEW_CameraData")
    camera_data.type = "PERSP"
    camera_data.lens = 58.0
    camera_data.sensor_width = 36.0
    camera_data.clip_start = 0.05
    camera_data.clip_end = 100.0
    camera = bpy.data.objects.new("B06_PROP_PREVIEW_Camera", camera_data)
    collection.objects.link(camera)
    return camera


def create_area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    size: float,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    light_data = bpy.data.lights.new(f"{name}Data", type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    light.location = location
    collection.objects.link(light)
    point_at(light, Vector((0.0, 0.0, 0.55)))
    return light


def create_sun(collection: bpy.types.Collection) -> bpy.types.Object:
    light_data = bpy.data.lights.new("B06_PROP_PREVIEW_SunData", type="SUN")
    light_data.energy = 1.6
    light = bpy.data.objects.new("B06_PROP_PREVIEW_Sun", light_data)
    light.rotation_euler = (
        math.radians(24.0),
        math.radians(-18.0),
        math.radians(34.0),
    )
    collection.objects.link(light)
    return light


def configure_scene(scene: bpy.types.Scene, camera: bpy.types.Object) -> None:
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_WIDTH
    scene.render.resolution_y = RENDER_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15

    world = bpy.data.worlds.new("B06_PROP_PREVIEW_World")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is None:
        raise RuntimeError("Preview WorldにBackground nodeがありません")
    background.inputs["Color"].default_value = (0.035, 0.042, 0.055, 1.0)
    background.inputs["Strength"].default_value = 0.45
    scene.world = world


def render_target_views(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    duplicate: bpy.types.Object,
    views: tuple[tuple[str, tuple[float, float]], ...],
    framing_scale: float,
) -> list[dict[str, object]]:
    minimum, maximum = world_bounds(duplicate)
    dimensions = maximum - minimum
    extent = max(dimensions.x, dimensions.y, dimensions.z)
    target = Vector((0.0, 0.0, dimensions.z * 0.44))
    distance = extent * 2.9 * framing_scale
    elevation = extent * 0.62
    outputs: list[dict[str, object]] = []

    duplicate.hide_render = False
    for filename, horizontal_direction in views:
        direction = Vector((horizontal_direction[0], horizontal_direction[1], 0.0))
        direction.normalize()
        camera.location = target + direction * distance + Vector((0.0, 0.0, elevation))
        point_at(camera, target)
        output_path = OUTPUT_DIRECTORY / f"{filename}.png"
        scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True, scene=scene.name)
        payload = output_path.read_bytes()
        outputs.append(
            {
                "path": str(output_path.relative_to(REPOSITORY_ROOT)).replace("\\", "/"),
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "width": RENDER_WIDTH,
                "height": RENDER_HEIGHT,
            }
        )
    duplicate.hide_render = True
    return outputs


def assert_sources_unchanged(
    sources: dict[str, bpy.types.Object],
    snapshots: dict[str, dict[str, object]],
) -> None:
    for name, source in sources.items():
        if source_snapshot(source) != snapshots[name]:
            raise RuntimeError(f"正本Objectを変更しました: {name}")


def main() -> None:
    if not bpy.data.filepath:
        raise RuntimeError("小物ライブラリ.blendを指定してバックグラウンド起動してください")
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError(f"B06-3対象外のBlenderファイルです: {bpy.data.filepath}")
    if bpy.data.scenes.get(PREVIEW_SCENE_NAME) is not None:
        raise RuntimeError(f"Preview Scene名が重複しています: {PREVIEW_SCENE_NAME}")
    if bpy.data.collections.get(PREVIEW_COLLECTION_NAME) is not None:
        raise RuntimeError(f"Preview Collection名が重複しています: {PREVIEW_COLLECTION_NAME}")

    sources: dict[str, bpy.types.Object] = {}
    for _, object_name, _, _ in TARGETS:
        source = bpy.data.objects.get(object_name)
        if source is None or source.type != "MESH":
            raise RuntimeError(f"対象Mesh Objectがありません: {object_name}")
        sources[object_name] = source
    snapshots = {name: source_snapshot(source) for name, source in sources.items()}

    preview_scene = bpy.data.scenes.new(PREVIEW_SCENE_NAME)
    preview_collection = bpy.data.collections.new(PREVIEW_COLLECTION_NAME)
    preview_scene.collection.children.link(preview_collection)

    floor_material = create_floor_material()
    create_floor(preview_collection, floor_material)
    camera = create_camera(preview_collection)
    configure_scene(preview_scene, camera)
    create_area_light(
        "B06_PROP_PREVIEW_Key",
        (-3.8, -4.6, 6.5),
        950.0,
        4.0,
        preview_collection,
    )
    create_area_light(
        "B06_PROP_PREVIEW_Fill",
        (4.2, -1.0, 3.8),
        620.0,
        3.2,
        preview_collection,
    )
    create_area_light(
        "B06_PROP_PREVIEW_Rim",
        (0.5, 4.8, 5.4),
        780.0,
        3.4,
        preview_collection,
    )
    create_sun(preview_collection)

    duplicates: dict[str, bpy.types.Object] = {}
    for target_id, object_name, _, _ in TARGETS:
        duplicates[target_id] = duplicate_at_origin(
            sources[object_name],
            f"B06_PROP_PREVIEW_{target_id}",
            preview_collection,
        )

    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    outputs: list[dict[str, object]] = []
    for target_id, _, framing_scale, views in TARGETS:
        outputs.extend(
            render_target_views(
                preview_scene,
                camera,
                duplicates[target_id],
                views,
                framing_scale,
            )
        )

    if len(outputs) != 9:
        raise RuntimeError(f"Preview出力件数が不正です: {len(outputs)}")
    assert_sources_unchanged(sources, snapshots)
    print("B06_PROP_PREVIEWS=" + json.dumps(outputs, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
