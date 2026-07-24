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
    ("01_exterior_iso", (78.0, -58.0, 50.0), (15.0, 19.0, 7.5), 52.0),
    ("02_courtyard_windows", (24.0, 5.0, 18.0), (13.0, 33.0, 7.5), 48.0),
    ("03_upper_corridor", (9.0, 17.0, 19.0), (-3.0, 26.0, 5.0), 52.0),
    ("04_northwest_stairs", (3.0, 30.0, 17.0), (-9.6, 42.2, 9.0), 52.0),
    ("05_gym_windows", (88.0, 8.0, 13.0), (57.4, 8.0, 6.0), 38.0),
    ("06_toilets", (-9.5, 36.0, 7.0), (-1.8, 43.0, 0.9), 55.0),
    ("07_rooftop_pool", (57.0, 18.0, 31.0), (12.0, 39.0, 14.9), 48.0),
    ("08_west_exterior_windows", (-58.0, 21.0, 18.0), (-12.6, 21.0, 7.8), 32.0),
    ("09_north_exterior_windows", (17.0, 92.0, 18.0), (17.0, 45.5, 7.8), 28.0),
    ("10_gym_window_detail", (92.0, 8.5, 10.5), (57.4, 8.5, 6.8), 34.0),
    ("11_gym_north_entry_storage", (74.0, 48.0, 9.0), (48.0, 27.5, 4.2), 42.0),
    ("12_schoolyard_west_corridor", (34.0, 16.0, 15.0), (0.0, 17.0, 7.5), 44.0),
    ("13_schoolyard_north_corridor", (24.0, -24.0, 16.0), (24.0, 32.5, 7.5), 46.0),
    ("14_gym_west_equal_spacing", (4.0, 8.5, 12.5), (33.4, 8.5, 6.8), 34.0),
    ("15_northwest_stair_windows", (-9.6, 90.0, 9.5), (-9.6, 45.5, 9.5), 52.0),
    ("16_northwest_stair_storage", (-3.0, 48.0, 5.5), (-8.0, 41.0, 1.2), 50.0),
    ("17_school_west_full", (-112.6, 21.0, 8.0), (-12.6, 21.0, 8.0), 55.0),
    ("18_school_north_full", (17.4, 145.5, 8.0), (17.4, 45.5, 8.0), 55.0),
    ("19_school_south_full", (17.4, -103.5, 8.0), (17.4, -3.5, 8.0), 55.0),
    ("20_school_east_full", (147.4, 21.0, 8.0), (47.4, 21.0, 8.0), 55.0),
    ("21_gym_north_full", (45.4, 106.5, 5.5), (45.4, 26.5, 5.5), 55.0),
    ("22_gym_east_full", (137.4, 8.5, 5.5), (57.4, 8.5, 5.5), 55.0),
    ("23_gym_west_full", (-46.6, 8.5, 5.5), (33.4, 8.5, 5.5), 55.0),
    ("24_gym_south_full", (45.4, -89.5, 5.5), (45.4, -9.5, 5.5), 55.0),
    ("25_2f_ordinary_room02_full_open", (-35.0, 17.5, 5.3), (-12.6, 17.5, 5.3), 60.0),
    ("26_3f_special_room02_full_open", (32.4, 68.0, 8.9), (32.4, 45.5, 8.9), 60.0),
    ("27_4f_ordinary_room03_full_open", (-35.0, 27.5, 12.5), (-12.6, 27.5, 12.5), 60.0),
    ("28_3f_ordinary_room03_closed", (-35.0, 27.5, 8.9), (-12.6, 27.5, 8.9), 60.0),
    ("29_2f_student_council_closed", (9.9, 68.0, 5.3), (9.9, 45.5, 5.3), 60.0),
    ("30_northeast_stairs", (35.0, 29.0, 12.5), (43.2, 40.8, 6.2), 40.0),
    ("31_southwest_stairs", (5.0, 9.5, 12.5), (-5.4, 0.8, 6.2), 40.0),
    ("32_gym_interior_readability", (45.4, 18.0, 5.8), (45.4, -5.5, 1.6), 34.0),
    ("33_main_gate_block_wall", (22.4, -23.5, 3.0), (22.4, -12.5, 0.75), 45.0),
    ("34_utility_gate_block_wall", (74.4, 47.5, 3.0), (63.4, 47.5, 0.75), 45.0),
)

SCHOOL_FULL_PREFIXES = (
    "VIS_B03_ExteriorWalls_F",
    "VIS_B03_DoorLeaves_F",
    "VIS_WindowFrame_F",
    "VIS_WindowGlass_F",
    "VIS_StairStorageShell_NW",
    "VIS_Stairs_NW",
    "VIS_StairsUpper_NW",
    "VIS_StairLanding_NW",
    "VIS_Roof_",
)

GYM_FULL_PREFIXES = (
    "VIS_B03_GymExteriorWalls",
    "VIS_B03_GymStorageNorthWall",
    "VIS_GymStorage_",
    "VIS_GymDoor_",
    "VIS_WindowFrame_Gym_",
    "VIS_WindowGlass_Gym_",
    "VIS_WindowFrame_GymStorage_",
    "VIS_WindowGlass_GymStorage_",
    "VIS_Roof_Gym",
)

VIEW_SHOW_PREFIXES = {
    "03_upper_corridor": (
        "VIS_B03_Floor_F02",
        "VIS_B03_InteriorWalls_F02",
        "VIS_B03_StoreyBand_F02",
        "VIS_B03_StoreyTrim_F02",
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
    "10_gym_window_detail": (
        "VIS_B03_GymExteriorWalls",
        "VIS_WindowFrame_Gym_",
        "VIS_WindowGlass_Gym_",
        "VIS_Floor_Gym",
    ),
    "11_gym_north_entry_storage": (
        "VIS_B03_GymExteriorWalls",
        "VIS_B03_GymStorageNorthWall",
        "VIS_GymStorage_",
        "VIS_GymDoor_Open_Bridge_",
        "VIS_GymStorageDoor_Open",
        "VIS_WindowFrame_Gym_",
        "VIS_WindowGlass_Gym_",
        "VIS_WindowFrame_GymStorage_",
        "VIS_WindowGlass_GymStorage_",
        "VIS_Floor_Gym",
        "VIS_Floor_GymStorage",
    ),
    "14_gym_west_equal_spacing": (
        "VIS_B03_GymExteriorWalls",
        "VIS_WindowFrame_Gym_",
        "VIS_WindowGlass_Gym_",
        "VIS_Floor_Gym",
    ),
    "15_northwest_stair_windows": (
        "VIS_B03_ExteriorWalls_F",
        "VIS_WindowFrame_F",
        "VIS_WindowGlass_F",
        "VIS_StairSystem_NW_",
        "VIS_B03_Floor_F",
    ),
    "16_northwest_stair_storage": (
        "VIS_StairStorageShell_NW",
        "VIS_Stairs_NW",
        "VIS_StairsUpper_NW",
        "VIS_StairLanding_NW",
        "VIS_StairGuard_NW_",
        "VIS_Floor_Stair",
    ),
    "17_school_west_full": SCHOOL_FULL_PREFIXES,
    "18_school_north_full": SCHOOL_FULL_PREFIXES,
    "19_school_south_full": SCHOOL_FULL_PREFIXES,
    "20_school_east_full": SCHOOL_FULL_PREFIXES,
    "21_gym_north_full": GYM_FULL_PREFIXES,
    "22_gym_east_full": GYM_FULL_PREFIXES,
    "23_gym_west_full": GYM_FULL_PREFIXES,
    "24_gym_south_full": GYM_FULL_PREFIXES,
    "25_2f_ordinary_room02_full_open": SCHOOL_FULL_PREFIXES,
    "26_3f_special_room02_full_open": SCHOOL_FULL_PREFIXES,
    "27_4f_ordinary_room03_full_open": SCHOOL_FULL_PREFIXES,
    "28_3f_ordinary_room03_closed": SCHOOL_FULL_PREFIXES,
    "29_2f_student_council_closed": SCHOOL_FULL_PREFIXES,
    "30_northeast_stairs": (
        "VIS_Stairs_NE",
        "VIS_StairsUpper_NE",
        "VIS_StairLanding_NE",
        "VIS_StairSystem_NE_",
        "VIS_StairGuard_NE_",
        "VIS_StairGuardSystem_NE_",
        "VIS_B03_StairNosing",
        "VIS_B03_HandrailTops",
        "VIS_B03_Floor_F01",
    ),
    "31_southwest_stairs": (
        "VIS_Stairs_SW",
        "VIS_StairsUpper_SW",
        "VIS_StairLanding_SW",
        "VIS_StairSystem_SW_",
        "VIS_StairGuard_SW_",
        "VIS_StairGuardSystem_SW_",
        "VIS_B03_StairNosing",
        "VIS_B03_HandrailTops",
        "VIS_B03_Floor_F01",
    ),
    "32_gym_interior_readability": (
        "VIS_Floor_Gym",
        "VIS_GymStage",
        "VIS_B03_GymExteriorWalls",
        "VIS_B03_GymWainscot",
        "VIS_B03_GymTrim",
        "VIS_B03_Interior_Gym_",
    ),
    "33_main_gate_block_wall": (
        "VIS_Gate_MainClosed",
        "VIS_Perimeter_SouthEast",
        "VIS_Perimeter_SouthWest",
        "VIS_B03_PerimeterBlockJoints",
        "VIS_SiteGround",
    ),
    "34_utility_gate_block_wall": (
        "VIS_Gate_UtilityClosed",
        "VIS_Perimeter_East",
        "VIS_Perimeter_EastNorth",
        "VIS_Perimeter_NorthEast",
        "VIS_B03_PerimeterBlockJoints",
        "VIS_SiteGround",
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
        view_number = int(name.split("_", 1)[0])
        if view_number >= 17:
            area_data.energy = 8000
            toward_camera = (Vector(location) - Vector(target)).normalized()
            area.location = Vector(target) + toward_camera * 20.0 + Vector((0.0, 0.0, 12.0))
        elif view_number >= 8:
            area_data.energy = 5000
            area.location = (Vector(location) + Vector(target)) / 2 + Vector((0.0, 0.0, 10.0))
        else:
            area_data.energy = 1500
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
