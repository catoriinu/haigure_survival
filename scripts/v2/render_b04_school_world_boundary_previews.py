from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
OUTPUT_DIRECTORY = REPOSITORY_ROOT / "docs/plans/v2/B04/images"
VIEWS = (
    (
        "01_boundary_overview",
        (22.4, 18.5, 145.0),
        (22.4, 18.5, 0.0),
        "ORTHO",
        118.0,
    ),
    (
        "02_main_gate_flat_surface",
        (22.4, -31.0, 4.0),
        (22.4, -13.8, 0.25),
        "PERSP",
        48.0,
    ),
    (
        "03_west_fence_flat_surface",
        (-31.0, 12.0, 4.0),
        (-18.5, 12.0, 0.35),
        "PERSP",
        52.0,
    ),
)


def point_camera(camera: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def configure_visibility() -> None:
    for obj in bpy.context.scene.objects:
        visible = obj.name.startswith("VIS_")
        obj.hide_render = not visible


def add_lighting() -> None:
    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.42, 0.68, 0.90, 1.0)
    background.inputs["Strength"].default_value = 0.65

    sun_data = bpy.data.lights.new("B04_PreviewSun", type="SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(22.0)
    sun = bpy.data.objects.new("B04_PreviewSun", sun_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (
        math.radians(30.0),
        math.radians(-20.0),
        math.radians(-35.0),
    )


def add_camera() -> bpy.types.Object:
    camera_data = bpy.data.cameras.new("B04_PreviewCamera")
    camera = bpy.data.objects.new("B04_PreviewCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    return camera


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"


def main() -> None:
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError("B04プレビュー対象の学校.blendではありません")
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    configure_visibility()
    add_lighting()
    camera = add_camera()
    configure_render()

    results = []
    for name, location, target, camera_type, value in VIEWS:
        camera.location = location
        camera.data.type = camera_type
        if camera_type == "ORTHO":
            camera.data.ortho_scale = value
        else:
            camera.data.lens = value
        point_camera(camera, target)
        output_path = OUTPUT_DIRECTORY / f"{name}.png"
        bpy.context.scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)
        results.append(
            {
                "name": name,
                "path": str(output_path.relative_to(REPOSITORY_ROOT)),
                "bytes": output_path.stat().st_size,
            }
        )
    print("B04_PREVIEW_RESULT=" + json.dumps(results, sort_keys=True))


if __name__ == "__main__":
    main()
