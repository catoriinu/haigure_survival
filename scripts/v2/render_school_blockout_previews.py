from pathlib import Path

import bpy


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
OUTPUT_DIRECTORY = REPOSITORY_ROOT / "docs/plans/v2/B02/images"

PREVIEWS = (
    ("GUIDE_Camera_Top", "b02_blockout_top.png"),
    ("GUIDE_Camera_Iso", "b02_blockout_iso.png"),
    ("GUIDE_Camera_Eye", "b02_blockout_eye.png"),
)


def main() -> None:
    if not bpy.app.background:
        raise RuntimeError("確認画像生成はBlenderの--background実行専用です")
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現ブランチ側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("確認画像生成前のB02に未保存変更があります")

    for camera_name, _filename in PREVIEWS:
        camera = bpy.data.objects.get(camera_name)
        if camera is None or camera.type != "CAMERA":
            raise RuntimeError(f"確認画像用Cameraがありません: {camera_name}")

    scene = bpy.context.scene
    original_hide_render = {
        obj.name: obj.hide_render for obj in bpy.data.objects
    }
    original_settings = {
        "camera": scene.camera,
        "engine": scene.render.engine,
        "light": scene.display.shading.light,
        "color_type": scene.display.shading.color_type,
        "show_shadows": scene.display.shading.show_shadows,
        "show_cavity": scene.display.shading.show_cavity,
        "cavity_type": scene.display.shading.cavity_type,
        "show_specular_highlight": scene.display.shading.show_specular_highlight,
        "resolution_x": scene.render.resolution_x,
        "resolution_y": scene.render.resolution_y,
        "resolution_percentage": scene.render.resolution_percentage,
        "file_format": scene.render.image_settings.file_format,
        "film_transparent": scene.render.film_transparent,
        "filepath": scene.render.filepath,
    }

    rendered = []
    try:
        for obj in bpy.data.objects:
            obj.hide_render = obj.name.startswith(
                ("COL_", "NAV_", "META_", "MRK_", "VOL_", "BND_")
            )

        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_shadows = True
        scene.display.shading.show_cavity = True
        scene.display.shading.cavity_type = "WORLD"
        scene.display.shading.show_specular_highlight = False
        scene.render.resolution_x = 1400
        scene.render.resolution_y = 900
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.film_transparent = False

        OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
        for camera_name, filename in PREVIEWS:
            output_path = OUTPUT_DIRECTORY / filename
            scene.camera = bpy.data.objects[camera_name]
            scene.render.filepath = str(output_path)
            bpy.ops.render.render(write_still=True)
            rendered.append(
                {
                    "camera": camera_name,
                    "path": str(output_path),
                    "bytes": output_path.stat().st_size,
                }
            )
    finally:
        for name, hide_render in original_hide_render.items():
            bpy.data.objects[name].hide_render = hide_render
        scene.camera = original_settings["camera"]
        scene.render.engine = original_settings["engine"]
        scene.display.shading.light = original_settings["light"]
        scene.display.shading.color_type = original_settings["color_type"]
        scene.display.shading.show_shadows = original_settings["show_shadows"]
        scene.display.shading.show_cavity = original_settings["show_cavity"]
        scene.display.shading.cavity_type = original_settings["cavity_type"]
        scene.display.shading.show_specular_highlight = original_settings[
            "show_specular_highlight"
        ]
        scene.render.resolution_x = original_settings["resolution_x"]
        scene.render.resolution_y = original_settings["resolution_y"]
        scene.render.resolution_percentage = original_settings[
            "resolution_percentage"
        ]
        scene.render.image_settings.file_format = original_settings["file_format"]
        scene.render.film_transparent = original_settings["film_transparent"]
        scene.render.filepath = original_settings["filepath"]

    print({"blend": bpy.data.filepath, "rendered": rendered})


if __name__ == "__main__":
    main()
