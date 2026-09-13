from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
OUTPUT_DIRECTORY = REPOSITORY_ROOT / "docs/plans/v2/B03/images/interiors"

VIEWS = (
    (
        "01_classroom",
        (-4.15, 3.0, 6.15),
        (-8.3, 8.0, 4.15),
        27.0,
        ("VIS_B03_Interior_F02_Classroom01_",),
        (-12.6, 2.5, -3.5, 12.5, 3.6),
    ),
    (
        "02_infirmary",
        (-4.1, 11.7, 3.1),
        (-8.5, 7.0, 0.8),
        26.0,
        ("VIS_B03_Interior_F01_Infirmary_",),
        (-12.6, 2.5, -3.5, 12.5, 0.0),
    ),
    (
        "03_library",
        (-4.1, 30.9, 3.25),
        (-8.2, 22.0, 0.8),
        31.0,
        ("VIS_B03_Interior_F01_Library_",),
        (-12.6, 12.5, -3.5, 32.5, 0.0),
    ),
    (
        "04_staffroom",
        (22.8, 37.1, 3.2),
        (14.4, 41.2, 0.85),
        31.0,
        ("VIS_B03_Interior_F01_StaffRoom_",),
        (5.4, 36.5, 23.4, 45.5, 0.0),
    ),
    (
        "05_pc_room",
        (40.7, 37.1, 3.25),
        (32.4, 41.2, 0.85),
        34.0,
        ("VIS_B03_Interior_F01_PcRoom_",),
        (23.4, 36.5, 41.4, 45.5, 0.0),
    ),
    (
        "06_council",
        (13.6, 37.1, 6.8),
        (4.0, 41.2, 4.45),
        31.0,
        ("VIS_B03_Interior_F02_Council_",),
        (-6.6, 36.5, 14.4, 45.5, 3.6),
    ),
    (
        "06b_broadcast",
        (22.7, 37.0, 6.75),
        (18.8, 41.2, 4.4),
        29.0,
        ("VIS_B03_Interior_F02_Broadcast_",),
        (14.4, 36.5, 23.4, 45.5, 3.6),
    ),
    (
        "07_science",
        (24.2, 37.0, 6.9),
        (35.2, 41.3, 4.45),
        29.0,
        ("VIS_B03_Interior_F02_Science_",),
        (23.4, 36.5, 41.4, 45.5, 3.6),
    ),
    (
        "08_art",
        (-5.5, 37.0, 10.5),
        (11.0, 41.3, 8.05),
        34.0,
        ("VIS_B03_Interior_F03_Art_",),
        (-6.6, 36.5, 23.4, 45.5, 7.2),
    ),
    (
        "09_home_ec",
        (24.2, 37.0, 10.5),
        (35.2, 41.3, 8.05),
        29.0,
        ("VIS_B03_Interior_F03_HomeEc_",),
        (23.4, 36.5, 41.4, 45.5, 7.2),
    ),
    (
        "10_ll_room",
        (-5.5, 37.0, 14.1),
        (11.0, 41.3, 11.65),
        34.0,
        ("VIS_B03_Interior_F04_LL_",),
        (-6.6, 36.5, 23.4, 45.5, 10.8),
    ),
    (
        "11_music",
        (24.2, 37.0, 14.1),
        (35.2, 41.3, 11.65),
        29.0,
        ("VIS_B03_Interior_F04_Music_",),
        (23.4, 36.5, 41.4, 45.5, 10.8),
    ),
    (
        "12_gym",
        (56.2, -5.8, 7.0),
        (45.4, 8.5, 1.0),
        30.0,
        ("VIS_B03_Interior_Gym_",),
        (33.4, -9.5, 57.4, 26.5, 0.0),
    ),
    (
        "13_roof_changing",
        (2.0, 39.2, 17.5),
        (-2.1, 42.2, 15.25),
        27.0,
        ("VIS_B03_Interior_RoofChanging_",),
        (-6.6, 38.9, 2.4, 45.5, 14.5),
    ),
    (
        "14_classroom_4f_room03",
        (-4.15, 23.0, 13.35),
        (-8.3, 28.0, 11.35),
        27.0,
        ("VIS_B03_Interior_F04_Classroom03_",),
        (-12.6, 22.5, -3.5, 32.5, 10.8),
    ),
    (
        "15_upper_toilets",
        (-6.1, 37.1, 10.45),
        (-2.0, 42.2, 8.05),
        28.0,
        ("VIS_B03_Interior_F03_Toilets_",),
        (-6.6, 38.5, 2.4, 45.5, 7.2),
    ),
    (
        "16_upper_corridor",
        (9.0, 32.8, 10.6),
        (1.0, 35.0, 8.1),
        32.0,
        (
            "VIS_B03_Interior_F03_Corridors_",
            "VIS_B03_Floor_F03",
            "VIS_B03_InteriorWalls_F03",
            "VIS_B03_DoorLeaves_F03",
        ),
        (-3.5, 32.5, 41.4, 36.5, 7.2),
    ),
    (
        "17_main_entry",
        (-0.2, 2.2, 3.0),
        (-3.3, -2.2, 0.8),
        28.0,
        ("VIS_B03_Interior_F01_MainEntry_",),
        (-6.6, -3.5, 0.0, 2.5, 0.0),
    ),
    (
        "18_gym_storage",
        (51.0, 26.8, 3.2),
        (54.5, 28.8, 0.9),
        30.0,
        ("VIS_B03_Interior_GymStorage_",),
        (51.4, 26.5, 57.4, 30.5, 0.0),
    ),
    (
        "19_roof_pool_safety",
        (42.0, 34.5, 18.2),
        (30.0, 41.0, 15.4),
        34.0,
        ("VIS_B03_Interior_RoofPoolSafety_",),
        (5.4, 36.5, 41.4, 45.5, 14.5),
    ),
    (
        "20_f01_toilet_stair_band",
        (-1.5, 33.0, 2.8),
        (-1.8, 40.5, 1.0),
        27.0,
        (
            "VIS_B03_Interior_F01_Toilets_",
            "VIS_B03_StoreyBand_F01",
            "VIS_B03_StairBoundaryCaps_F01",
            "VIS_Wall_Toilet_",
            "VIS_Stairs_NW",
            "VIS_StairsUpper_NW",
            "VIS_StairLanding_NW",
            "VIS_StairGuard_NW_",
            "VIS_StairStorageShell_NW",
        ),
        (-12.6, 32.5, 14.4, 45.5, 0.0),
    ),
    (
        "21_f02_toilet_stair_band",
        (-1.5, 33.0, 6.4),
        (4.0, 40.5, 4.6),
        25.0,
        (
            "VIS_B03_Interior_F02_Toilets_",
            "VIS_B03_InteriorWalls_F02",
            "VIS_B03_DoorLeaves_F02",
            "VIS_B03_StoreyBand_F02",
            "VIS_StairSystem_NW_",
            "VIS_StairGuardSystem_NW_",
            "VIS_B03_StairNosing",
            "VIS_B03_HandrailTops",
        ),
        (-12.6, 32.5, 14.4, 45.5, 3.6),
    ),
    (
        "22_f03_toilet_special_boundary",
        (-1.5, 33.0, 10.0),
        (4.0, 40.5, 8.2),
        25.0,
        (
            "VIS_B03_Interior_F03_Toilets_",
            "VIS_B03_Interior_F03_Art_",
            "VIS_B03_InteriorWalls_F03",
            "VIS_B03_DoorLeaves_F03",
            "VIS_B03_StoreyBand_F03",
            "VIS_StairSystem_NW_",
            "VIS_StairGuardSystem_NW_",
            "VIS_B03_StairNosing",
            "VIS_B03_HandrailTops",
        ),
        (-12.6, 32.5, 23.4, 45.5, 7.2),
    ),
    (
        "23_f04_toilet_special_boundary",
        (-1.5, 33.0, 13.6),
        (4.0, 40.5, 11.8),
        25.0,
        (
            "VIS_B03_Interior_F04_Toilets_",
            "VIS_B03_Interior_F04_LL_",
            "VIS_B03_InteriorWalls_F04",
            "VIS_B03_DoorLeaves_F04",
            "VIS_B03_StoreyBand_F04",
            "VIS_StairSystem_NW_",
            "VIS_StairGuardSystem_NW_",
            "VIS_B03_StairNosing",
            "VIS_B03_HandrailTops",
        ),
        (-12.6, 32.5, 23.4, 45.5, 10.8),
    ),
    (
        "24_north_entry_locker",
        (1.2, 37.2, 2.8),
        (5.0, 40.6, 0.75),
        32.0,
        (
            "VIS_B03_Interior_F01_NorthEntry_",
            "VIS_Wall_NorthEntry_",
            "VIS_Floor_NorthEntryFoyer",
            "VIS_NorthEntryDoor_",
            "VIS_NorthEntryStep",
            "VIS_B03_StoreyBand_F01",
        ),
        (0.0, 36.5, 6.6, 45.5, 0.0),
    ),
)


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_floor(
    bounds: tuple[float, float, float, float, float],
    material: bpy.types.Material,
) -> bpy.types.Object:
    x0, y0, x1, y1, z = bounds
    bpy.ops.mesh.primitive_cube_add(
        location=((x0 + x1) / 2, (y0 + y1) / 2, z - 0.04)
    )
    obj = bpy.context.object
    obj.name = "B03_INTERIOR_PREVIEW_Floor"
    obj.scale = ((x1 - x0) / 2, (y1 - y0) / 2, 0.04)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def main() -> None:
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError(f"B03-2対象外のBlenderファイルです: {bpy.data.filepath}")
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    original_camera = scene.camera
    original_engine = scene.render.engine
    original_filepath = scene.render.filepath
    original_resolution = (
        scene.render.resolution_x,
        scene.render.resolution_y,
        scene.render.resolution_percentage,
    )
    original_hide = {obj.name: obj.hide_render for obj in bpy.data.objects}

    camera_data = bpy.data.cameras.new("B03_INTERIOR_PREVIEW_Camera")
    camera_data.type = "PERSP"
    camera = bpy.data.objects.new("B03_INTERIOR_PREVIEW_Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    sun_data = bpy.data.lights.new("B03_INTERIOR_PREVIEW_Sun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("B03_INTERIOR_PREVIEW_Sun", sun_data)
    sun.rotation_euler = (math.radians(18), math.radians(-24), math.radians(28))
    scene.collection.objects.link(sun)

    area_data = bpy.data.lights.new("B03_INTERIOR_PREVIEW_Area", "AREA")
    area_data.energy = 2200
    area_data.shape = "DISK"
    area_data.size = 26.0
    area = bpy.data.objects.new("B03_INTERIOR_PREVIEW_Area", area_data)
    scene.collection.objects.link(area)

    floor_material = bpy.data.materials.new("B03_INTERIOR_PREVIEW_FloorMaterial")
    floor_material.diffuse_color = (0.40, 0.36, 0.29, 1.0)
    floor_material.use_nodes = True
    shader = floor_material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.40, 0.36, 0.29, 1.0)
    shader.inputs["Roughness"].default_value = 0.88

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.035, 0.042, 0.052)

    outputs = []
    for name, location, target, lens, prefixes, bounds in VIEWS:
        for obj in bpy.data.objects:
            if obj.type == "MESH":
                obj.hide_render = not obj.name.startswith(prefixes)
        floor = render_floor(bounds, floor_material)
        camera.location = location
        camera_data.lens = lens
        camera_data.sensor_width = 36.0
        point_at(camera, target)
        area.location = (target[0] - 8.0, target[1] - 8.0, target[2] + 22.0)
        point_at(area, target)
        output_path = OUTPUT_DIRECTORY / f"{name}.png"
        scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)
        outputs.append(
            {
                "path": str(output_path.relative_to(REPOSITORY_ROOT)),
                "bytes": output_path.stat().st_size,
                "width": 1920,
                "height": 1080,
            }
        )
        bpy.data.objects.remove(floor, do_unlink=True)

    for name, hidden in original_hide.items():
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_render = hidden
    scene.camera = original_camera
    scene.render.engine = original_engine
    scene.render.filepath = original_filepath
    scene.render.resolution_x = original_resolution[0]
    scene.render.resolution_y = original_resolution[1]
    scene.render.resolution_percentage = original_resolution[2]
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)
    bpy.data.objects.remove(sun, do_unlink=True)
    bpy.data.lights.remove(sun_data)
    bpy.data.objects.remove(area, do_unlink=True)
    bpy.data.lights.remove(area_data)
    bpy.data.materials.remove(floor_material)
    print("B03_INTERIOR_PREVIEWS=" + json.dumps(outputs, ensure_ascii=False))


if __name__ == "__main__":
    main()
