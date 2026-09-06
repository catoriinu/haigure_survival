from pathlib import Path

import bmesh
import bpy


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"

DEGENERATE_RAMP_NAMES = {
    "COL_GymStageStairRamp_East",
    "COL_GymStageStairRamp_West",
    "COL_StairRamp_NE",
    "COL_StairRamp_NW",
    "COL_StairRamp_SW",
}

INWARD_NORMAL_NAMES = DEGENERATE_RAMP_NAMES | {
    "COL_StairGuard_NE_Lower",
    "COL_StairGuard_NE_Upper",
    "COL_StairGuard_NW_Lower",
    "COL_StairGuard_NW_Upper",
    "COL_StairRampUpper_NE",
    "COL_StairRampUpper_NW",
    "COL_StairRampUpper_SW",
}


def normalize_mesh(object_name: str) -> dict[str, int | float | str]:
    obj = bpy.data.objects[object_name]
    if obj.type != "MESH":
        raise RuntimeError(f"Meshではありません: {object_name}")

    mesh = obj.data
    before_vertices = len(mesh.vertices)
    before_faces = len(mesh.polygons)

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()

    if object_name in DEGENERATE_RAMP_NAMES:
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-6)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    signed_volume = bm.calc_volume(signed=True)
    if signed_volume < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
        bm.normal_update()
        signed_volume = bm.calc_volume(signed=True)

    degenerate_faces = sum(1 for face in bm.faces if face.calc_area() < 1e-9)
    non_manifold_edges = sum(1 for edge in bm.edges if not edge.is_manifold)
    if signed_volume <= 0 or degenerate_faces != 0 or non_manifold_edges != 0:
        raise RuntimeError(
            f"斜面Collider正規化に失敗しました: {object_name}, "
            f"volume={signed_volume}, degenerate={degenerate_faces}, "
            f"non_manifold={non_manifold_edges}"
        )

    bm.to_mesh(mesh)
    bm.free()
    mesh.name = obj.name
    mesh.update()

    return {
        "name": object_name,
        "before_vertices": before_vertices,
        "after_vertices": len(mesh.vertices),
        "before_faces": before_faces,
        "after_faces": len(mesh.polygons),
        "signed_volume": round(signed_volume, 6),
    }


def export_existing_stage() -> None:
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = [
        obj
        for obj in bpy.data.objects
        if obj.name.startswith("VIS_") or obj.name.startswith("COL_")
    ]
    if len(export_objects) != 407:
        raise RuntimeError(f"既存B02の出力Object数が407件ではありません: {len(export_objects)}")
    for obj in export_objects:
        obj.select_set(True)

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


def main() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if any(bpy.data.objects.get(name) is None for name in INWARD_NORMAL_NAMES):
        raise RuntimeError("正規化対象の斜面Colliderが不足しています")

    audit = [normalize_mesh(name) for name in sorted(INWARD_NORMAL_NAMES)]
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_existing_stage()

    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "normalized": audit,
            "glb": str(GLB_PATH),
        }
    )


main()
