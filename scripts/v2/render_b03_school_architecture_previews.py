from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
OUTPUT_DIRECTORY = (
    REPOSITORY_ROOT / "docs/plans/v2/B03/images/architecture"
)


VIEWS = (
    ("01_exterior_iso", (78.0, -58.0, 48.0), (15.0, 19.0, 6.0), 52.0),
    ("02_courtyard_windows", (24.0, 5.0, 15.0), (13.0, 33.0, 6.0), 48.0),
    ("03_upper_corridor", (9.0, 17.0, 18.0), (-3.0, 26.0, 4.0), 52.0),
    ("04_northwest_stairs", (3.0, 30.0, 14.0), (-9.6, 42.2, 8.0), 52.0),
    ("05_gym_windows", (88.0, 8.0, 13.0), (57.4, 8.0, 6.0), 38.0),
    ("06_toilets", (-9.5, 36.0, 7.0), (-1.8, 43.0, 0.9), 55.0),
    ("07_rooftop_pool", (57.0, 18.0, 29.0), (12.0, 39.0, 13.1), 48.0),
)

VIEW_SHOW_PREFIXES = {
    "03_upper_corridor": (
        "VIS_B03_Floor_F02",
        "VIS_B03_InteriorWalls_F02",
        "VIS_B03_FloorAccent_F02",
        "VIS_B03_DoorLeaves_F02",
        "VIS_WindowFrame_F02_",
        "VIS_WindowGlass_F02_",
    ),
    "04_northwest_stairs": (
        "VIS_StairSystem_NW_",
        "VIS_StairGuard",
        "VIS_B03_StairNosing",
        "VIS_B03_HandrailTops",
        "VIS_B03_Floor_F0",
    ),
    "05_gym_windows": (
        "VIS_B03_GymExteriorWalls",
        "VIS_WindowFrame_Gym_",
        "VIS_WindowGlass_Gym_",
        "VIS_Floor_Gym",
    ),
    "06_toilets": (
        "VIS_B03_Prop_Toilet_",
        "VIS_B03_Prop_Urinal_",
        "VIS_ToiletStallDoor_",
        "VIS_ToiletStallPartition_",
        "VIS_Floor_Toilet",
    ),
}


def point_camera(camera: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError(f"B03-1対象外のBlenderファイルです: {bpy.data.filepath}")
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    original_camera = scene.camera
    original_engine = scene.render.engine
    original_resolution = (
        scene.render.resolution_x,
        scene.render.resolution_y,
        scene.render.resolution_percentage,
    )
    original_filepath = scene.render.filepath
    original_world_color = tuple(scene.world.color)
    original_hide_render = {obj.name: obj.hide_render for obj in bpy.data.objects}

    camera_data = bpy.data.cameras.new("B03_PREVIEW_Camera")
    camera = bpy.data.objects.new("B03_PREVIEW_Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    sun_data = bpy.data.lights.new("B03_PREVIEW_Sun", "SUN")
    sun_data.energy = 2.2
    sun = bpy.data.objects.new("B03_PREVIEW_Sun", sun_data)
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(32))
    scene.collection.objects.link(sun)

    area_data = bpy.data.lights.new("B03_PREVIEW_Area", "AREA")
    area_data.energy = 1500
    area_data.shape = "DISK"
    area_data.size = 18.0
    area = bpy.data.objects.new("B03_PREVIEW_Area", area_data)
    area.location = (12.0, 18.0, 35.0)
    point_camera(area, (12.0, 20.0, 5.0))
    scene.collection.objects.link(area)

    for obj in bpy.data.objects:
        if obj.name.startswith(("COL_", "NAV_", "META_", "MRK_", "VOL_", "BND_", "LNK_", "GUIDE_")):
            obj.hide_render = True
        elif obj.name.startswith("VIS_"):
            obj.hide_render = False

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.055, 0.065, 0.085)

    outputs = []
    for name, location, target, lens in VIEWS:
        show_prefixes = VIEW_SHOW_PREFIXES.get(name)
        for obj in bpy.data.objects:
            if obj.name.startswith("VIS_"):
                obj.hide_render = bool(
                    show_prefixes
                    and not obj.name.startswith(show_prefixes)
                )
        camera.location = location
        camera_data.lens = lens
        camera_data.sensor_width = 36.0
        point_camera(camera, target)
        area.location = Vector(location) + Vector((0.0, 0.0, 4.0))
        point_camera(area, target)
        output_path = OUTPUT_DIRECTORY / f"{name}.png"
        scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)
        outputs.append(
            {
                "path": str(output_path),
                "bytes": output_path.stat().st_size,
                "width": scene.render.resolution_x,
                "height": scene.render.resolution_y,
            }
        )

    scene.camera = original_camera
    scene.render.engine = original_engine
    scene.render.resolution_x = original_resolution[0]
    scene.render.resolution_y = original_resolution[1]
    scene.render.resolution_percentage = original_resolution[2]
    scene.render.filepath = original_filepath
    scene.world.color = original_world_color
    for name, hidden in original_hide_render.items():
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_render = hidden
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)
    bpy.data.objects.remove(sun, do_unlink=True)
    bpy.data.lights.remove(sun_data)
    bpy.data.objects.remove(area, do_unlink=True)
    bpy.data.lights.remove(area_data)

    print("B03_RENDER_RESULT=" + json.dumps(outputs, ensure_ascii=False))


if __name__ == "__main__":
    main()
