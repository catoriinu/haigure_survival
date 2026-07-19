from __future__ import annotations

import hashlib
import json
import math
import re
import struct
from collections import Counter, defaultdict
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
NAVMESH_PATH = (
    REPOSITORY_ROOT
    / "public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin"
)
PROP_LIBRARY_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B03/b03_school_prop_library.blend"
)

EXPECTED_NAVMESH_SHA256 = (
    "7326422B609D810E8736B48A08EC819AA962848769A718E175463FE6191A5347"
)
EXPECTED_PROP_LIBRARY_SHA256 = (
    "71E461799D915B046483C9B2343C13818AC12203F94C3481E857E56DDA4F09A4"
)
LINK_PATTERN = re.compile(r"^LNK_(.+)_([AB])$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def read_glb_json(path: Path) -> dict[str, object]:
    with path.open("rb") as stream:
        header = stream.read(12)
        magic, version, total_length = struct.unpack("<4sII", header)
        require(magic == b"glTF", "GLB magicが不正です")
        require(version == 2, f"GLB versionが2ではありません: {version}")
        require(total_length == path.stat().st_size, "GLB header長が実容量と不一致です")
        chunk_length, chunk_type = struct.unpack("<II", stream.read(8))
        require(chunk_type == 0x4E4F534A, "GLB先頭chunkがJSONではありません")
        return json.loads(stream.read(chunk_length).decode("utf-8"))


def audit_mesh_contract(export_objects: list[bpy.types.Object]) -> None:
    for obj in export_objects:
        if obj.type != "MESH":
            continue
        require(obj.data.name == obj.name, f"Object名とMesh Data名が不一致です: {obj.name}")
        require(obj.data.users == 1, f"Mesh Dataがsingle-userではありません: {obj.name}")
        require(
            all(abs(value) <= 1e-7 for value in obj.location),
            f"Mesh Objectのlocationが未適用です: {obj.name}",
        )
        require(
            all(abs(value) <= 1e-7 for value in obj.rotation_euler),
            f"Mesh Objectのrotationが未適用です: {obj.name}",
        )
        require(
            all(abs(value - 1.0) <= 1e-7 for value in obj.scale),
            f"Mesh Objectのscaleが未適用です: {obj.name}",
        )
        for vertex in obj.data.vertices:
            require(
                all(math.isfinite(value) for value in vertex.co),
                f"頂点に非有限値があります: {obj.name}",
            )
        for polygon in obj.data.polygons:
            require(
                all(math.isfinite(value) for value in polygon.normal)
                and polygon.normal.length >= 0.999,
                f"面法線が不正です: {obj.name}",
            )
        if obj.name.startswith(("COL_", "VOL_", "BND_")):
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            non_manifold = [edge for edge in mesh.edges if len(edge.link_faces) != 2]
            mesh.free()
            require(
                not non_manifold,
                f"必須閉形状がnon-manifoldです: {obj.name} ({len(non_manifold)} edges)",
            )


def audit_links(objects: list[bpy.types.Object]) -> dict[str, int]:
    pairs: dict[str, dict[str, bpy.types.Object]] = defaultdict(dict)
    for obj in objects:
        match = LINK_PATTERN.match(obj.name)
        if match is None:
            continue
        link_id, endpoint = match.groups()
        pairs[link_id][endpoint] = obj
        require(obj.type == "EMPTY", f"LNK_*がEmptyではありません: {obj.name}")
        require(obj.get("hs_id") == link_id, f"LNK名とhs_idが不一致です: {obj.name}")
        require(obj.get("hs_endpoint") == endpoint, f"LNK名と端点が不一致です: {obj.name}")
        require(obj.get("hs_bidirectional") is True, f"LNKが双方向ではありません: {obj.name}")
        require(
            abs(float(obj.get("hs_link_radius_m")) - 0.54) <= 1e-9,
            f"LNK半径が0.54mではありません: {obj.name}",
        )
    require(len(pairs) == 35, f"特殊接続が35組ではありません: {len(pairs)}")
    window_colliders = {
        "bit-window-"
        + obj.name.removeprefix("COL_HumanOnly_Window_").lower().replace("_", "-"): obj
        for obj in objects
        if obj.name.startswith("COL_HumanOnly_Window_")
    }
    kinds = Counter()
    for link_id, endpoints in pairs.items():
        require(set(endpoints) == {"A", "B"}, f"LNK pairが不完全です: {link_id}")
        a = endpoints["A"]
        b = endpoints["B"]
        kind = a.get("hs_link_kind")
        require(kind == b.get("hs_link_kind"), f"LNK kindが端点間で不一致です: {link_id}")
        kinds[kind] += 1
        segment = b.location - a.location
        require(
            abs(segment.z) <= 1e-7,
            f"LNK直線が端点最高高度を越える傾斜を持ちます: {link_id}",
        )
        require(segment.length / 2 >= 0.54, f"LNK端点余裕が0.54m未満です: {link_id}")
        if kind == "bit_window":
            collider = window_colliders.get(link_id)
            require(collider is not None, f"bit_window対応Colliderがありません: {link_id}")
            minimum, maximum = world_bounds(collider)
            center = (minimum + maximum) / 2
            midpoint = (a.location + b.location) / 2
            require((midpoint - center).length <= 1e-5, f"bit_windowが開口中央を通りません: {link_id}")
            dimensions = maximum - minimum
            thin_axis = min(range(3), key=lambda axis: dimensions[axis])
            direction = segment.normalized()
            require(
                abs(direction[thin_axis]) >= 1.0 - 1e-7,
                f"bit_windowが壁法線方向ではありません: {link_id}",
            )
        elif kind == "bit_roof":
            require(
                min(a.location.z, b.location.z) - 13.8 >= 0.54,
                f"bit_roofが屋上手すりへ半径0.54mの空きを持ちません: {link_id}",
            )
    require(kinds["bit_window"] == 33, f"bit_windowが33組ではありません: {kinds}")
    require(kinds["bit_roof"] == 2, f"bit_roofが2組ではありません: {kinds}")
    return dict(kinds)


def audit_windows(objects: list[bpy.types.Object]) -> dict[str, int]:
    names = [obj.name for obj in objects]
    frames = [obj for obj in objects if obj.name.startswith("VIS_WindowFrame_")]
    glass = [obj for obj in objects if obj.name.startswith("VIS_WindowGlass_")]
    actor = [obj for obj in objects if obj.name.startswith("COL_ActorOnly_Window_")]
    human = [obj for obj in objects if obj.name.startswith("COL_HumanOnly_Window_")]
    require(len(frames) == 81, f"窓枠が81件ではありません: {len(frames)}")
    require(len(glass) == 48, f"閉窓ガラスが48件ではありません: {len(glass)}")
    require(len(actor) == 48, f"ActorOnly窓が48件ではありません: {len(actor)}")
    require(len(human) == 33, f"HumanOnly窓が33件ではありません: {len(human)}")
    require(
        not any("Gym_South" in name for name in names),
        "体育館南面に窓関連Objectがあります",
    )
    require(
        not any("Broken" in name or "Damaged" in name for name in names),
        "破損窓が存在します",
    )
    for collider in human:
        minimum, maximum = world_bounds(collider)
        dimensions = sorted((maximum - minimum))
        require(
            dimensions[1] >= 1.20 - 1e-5 and dimensions[2] >= 1.20 - 1e-5,
            f"通過窓の有効開口が1.20m未満です: {collider.name}",
        )
        require(
            dimensions[1] / 2 >= 0.54 and dimensions[2] / 2 >= 0.54,
            f"通過窓が半径0.54m包絡を満たしません: {collider.name}",
        )
    return {
        "frames": len(frames),
        "glass": len(glass),
        "actor_only": len(actor),
        "human_only": len(human),
    }


def audit_semantics(objects: list[bpy.types.Object]) -> None:
    require(not any(obj.name.startswith("PRT_") for obj in objects), "PRT_*が存在します")
    water = bpy.data.objects.get("VOL_PoolWater")
    require(water is not None, "VOL_PoolWaterがありません")
    require(water.get("hs_id") == "pool-water", "VOL_PoolWaterのhs_idが不正です")
    require(water.get("hs_role") == "water", "VOL_PoolWaterのhs_roleがwaterではありません")
    minimum, maximum = world_bounds(water)
    expected_min = Vector((14.6, 36.2, 12.86))
    expected_max = Vector((34.2, 41.8, 13.55))
    require((minimum - expected_min).length <= 1e-5, f"水Volume下限が不正です: {minimum}")
    require((maximum - expected_max).length <= 1e-5, f"水Volume上限が不正です: {maximum}")
    required_nav = {
        "NAV_Walkable_Interior2F",
        "NAV_Walkable_Interior3F",
        "NAV_Walkable_Interior4F",
        "NAV_Walkable_StairsNWUpper",
        "NAV_Walkable_Rooftop",
        "NAV_Blocker_SchoolUpper",
    }
    missing = sorted(required_nav - {obj.name for obj in objects})
    require(not missing, f"B03-1 NAV生成元が不足しています: {missing}")
    require(
        not any(obj.name.startswith("VIS_WindowGuide_") for obj in bpy.data.objects),
        "仮窓ガイドが残っています",
    )
    required_ceilings = {
        "COL_Ceiling1F_North",
        "COL_Ceiling1F_West",
        "COL_B03_Ceiling_F02",
        "COL_B03_Ceiling_F03",
        "COL_Roof_North",
        "COL_Roof_West",
        "COL_GymRoof",
        "COL_RooftopFacilityShell",
    }
    missing_ceilings = sorted(required_ceilings - {obj.name for obj in objects})
    require(not missing_ceilings, f"天井Colliderが不足しています: {missing_ceilings}")
    require(
        not any(obj.name.startswith("NAV_") and "Window" in obj.name for obj in objects),
        "通常NavMesh用の窓越し接続が存在します",
    )
    toilets = [obj for obj in objects if obj.name.startswith("VIS_B03_Prop_Toilet_")]
    urinals = sorted(
        (obj for obj in objects if obj.name.startswith("VIS_B03_Prop_Urinal_")),
        key=lambda obj: obj.name,
    )
    require(len(toilets) == 6, f"便器が男女各3基ではありません: {len(toilets)}")
    require(len(urinals) == 3, f"男子小便器が3基ではありません: {len(urinals)}")
    for urinal, expected_y in zip(urinals, (39.6, 40.6, 41.6), strict=True):
        minimum, maximum = world_bounds(urinal)
        require(-2.55 <= minimum.x <= -2.25, f"男子小便器が指定X帯にありません: {urinal.name}")
        require(abs((minimum.y + maximum.y) / 2 - expected_y) <= 1e-5, f"男子小便器の中心Yが不正です: {urinal.name}")
        require(minimum.x >= -2.55, f"男子小便器が西側1m立位空間へ侵入しています: {urinal.name}")


def audit_hs_ids(objects: list[bpy.types.Object]) -> None:
    grouped: dict[str, list[bpy.types.Object]] = defaultdict(list)
    for obj in objects:
        hs_id = obj.get("hs_id")
        if hs_id is None:
            continue
        require(isinstance(hs_id, str) and bool(hs_id), f"hs_idの型または値が不正です: {obj.name}")
        grouped[hs_id].append(obj)
    for hs_id, grouped_objects in grouped.items():
        if len(grouped_objects) == 1:
            continue
        require(
            len(grouped_objects) == 2
            and {obj.get("hs_endpoint") for obj in grouped_objects} == {"A", "B"}
            and all(obj.name.startswith(f"LNK_{hs_id}_") for obj in grouped_objects),
            f"hs_idが論理Object間で重複しています: {hs_id}",
        )


def audit_glb(gltf: dict[str, object]) -> dict[str, int]:
    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    materials = gltf.get("materials", [])
    animations = gltf.get("animations", [])
    cameras = gltf.get("cameras", [])
    require(not animations, "GLBにAnimationがあります")
    require(not cameras, "GLBにCameraがあります")
    extensions = gltf.get("extensions", {})
    require("KHR_lights_punctual" not in extensions, "GLBにLightがあります")
    node_names = [node.get("name") for node in nodes if node.get("name")]
    require(len(node_names) == len(set(node_names)), "GLB Node名が重複しています")
    require(sum(name.startswith("VIS_WindowFrame_") for name in node_names) == 81, "GLB窓枠が81件ではありません")
    require(sum(name.startswith("VIS_WindowGlass_") for name in node_names) == 48, "GLBガラスが48件ではありません")
    require(sum(name.startswith("COL_ActorOnly_Window_") for name in node_names) == 48, "GLB ActorOnly窓が48件ではありません")
    require(sum(name.startswith("COL_HumanOnly_Window_") for name in node_names) == 33, "GLB HumanOnly窓が33件ではありません")
    require(sum(name.startswith("LNK_bit-window-") for name in node_names) == 66, "GLB bit_window端点が66件ではありません")
    require(sum(name.startswith("LNK_bit-roof-") for name in node_names) == 4, "GLB bit_roof端点が4件ではありません")
    require("VOL_PoolWater" in node_names, "GLBにVOL_PoolWaterがありません")
    require(not any("Gym_South" in name for name in node_names), "GLB体育館南面に窓があります")
    require(not any(name.startswith("PRT_") for name in node_names), "GLBにPRT_*があります")
    for node in nodes:
        name = node.get("name", "")
        if name == "VOL_PoolWater":
            extras = node.get("extras", {})
            require(extras.get("hs_id") == "pool-water", "GLB水Volumeのhs_idが不正です")
            require(extras.get("hs_role") == "water", "GLB水Volumeのhs_roleが不正です")
        if name.startswith("LNK_bit-"):
            extras = node.get("extras", {})
            require(extras.get("hs_bidirectional") is True, f"GLB LNKが双方向ではありません: {name}")
            require(abs(float(extras.get("hs_link_radius_m")) - 0.54) <= 1e-9, f"GLB LNK半径が不正です: {name}")
    return {
        "nodes": len(nodes),
        "meshes": len(meshes),
        "materials": len(materials),
    }


def main() -> None:
    require(Path(bpy.data.filepath).resolve() == BLEND_PATH.resolve(), "監査対象.blendが不正です")
    require(sha256(NAVMESH_PATH) == EXPECTED_NAVMESH_SHA256, "NavMesh SHA-256が変化しています")
    require(sha256(PROP_LIBRARY_PATH) == EXPECTED_PROP_LIBRARY_SHA256, "B03-PライブラリSHA-256が変化しています")
    export_collection = bpy.data.collections.get("EXP_Stage_school")
    require(export_collection is not None, "EXP_Stage_schoolがありません")
    export_objects = list(export_collection.all_objects)
    names = [obj.name for obj in export_objects]
    require(len(names) == len(set(names)), "Blender Object名が重複しています")
    audit_mesh_contract(export_objects)
    audit_hs_ids(export_objects)
    window_counts = audit_windows(export_objects)
    link_counts = audit_links(export_objects)
    audit_semantics(export_objects)
    glb_counts = audit_glb(read_glb_json(GLB_PATH))
    prefixes = Counter(name.split("_", 1)[0] for name in names)
    result = {
        "blend_sha256": sha256(BLEND_PATH),
        "glb_sha256": sha256(GLB_PATH),
        "navmesh_sha256": sha256(NAVMESH_PATH),
        "prop_library_sha256": sha256(PROP_LIBRARY_PATH),
        "blender_objects": len(bpy.data.objects),
        "blender_meshes": len(bpy.data.meshes),
        "blender_materials": len(bpy.data.materials),
        "export_objects": len(export_objects),
        "prefixes": dict(sorted(prefixes.items())),
        "windows": window_counts,
        "links": link_counts,
        "glb": glb_counts,
    }
    print("B03_AUDIT_RESULT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
