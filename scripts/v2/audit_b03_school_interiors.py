from __future__ import annotations

import hashlib
import json
import struct
import sys
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from build_b03_school_interiors import (
    ADDITIONAL_PROP_TYPES,
    ATLAS_DEFINITIONS,
    PROP_COLLIDER_SIZES,
    STAFFROOM_CLEANING_LOCKER,
    STAFFROOM_INTERIOR_BOUNDS,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
TEXTURE_DIRECTORY = REPOSITORY_ROOT / "assets/textures/v2/B03"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"PNG署名が不正です: {path}")
    return struct.unpack_from(">II", data, 16)


def read_glb_json(path: Path) -> tuple[dict[str, object], int]:
    data = path.read_bytes()
    magic, version, declared = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared != len(data):
        raise RuntimeError("GLBヘッダーが不正です")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLBの先頭chunkがJSONではありません")
    gltf = json.loads(data[20 : 20 + json_length].decode("utf-8").rstrip("\x00 "))
    binary_offset = 20 + json_length
    binary_length, binary_type = struct.unpack_from("<II", data, binary_offset)
    if binary_type != 0x004E4942:
        raise RuntimeError("GLBにBIN chunkがありません")
    return gltf, binary_length


def is_identity_transform(obj: bpy.types.Object) -> bool:
    return (
        all(abs(value) < 1e-7 for value in obj.location)
        and all(abs(value) < 1e-7 for value in obj.rotation_euler)
        and all(abs(value - 1.0) < 1e-7 for value in obj.scale)
    )


def is_closed_mesh(obj: bpy.types.Object) -> bool:
    edge_use = Counter()
    for polygon in obj.data.polygons:
        vertices = list(polygon.vertices)
        for index, first in enumerate(vertices):
            second = vertices[(index + 1) % len(vertices)]
            edge_use[tuple(sorted((first, second)))] += 1
    return bool(edge_use) and all(count == 2 for count in edge_use.values())


def connected_component_aabbs(
    obj: bpy.types.Object,
) -> list[tuple[Vector, Vector]]:
    adjacency = [set() for _ in obj.data.vertices]
    for edge in obj.data.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)

    remaining = set(range(len(obj.data.vertices)))
    bounds: list[tuple[Vector, Vector]] = []
    while remaining:
        pending = [remaining.pop()]
        component: list[int] = []
        while pending:
            vertex_index = pending.pop()
            component.append(vertex_index)
            connected = adjacency[vertex_index] & remaining
            remaining.difference_update(connected)
            pending.extend(connected)
        points = [
            obj.matrix_world @ obj.data.vertices[vertex_index].co
            for vertex_index in component
        ]
        bounds.append(
            (
                Vector(tuple(min(point[axis] for point in points) for axis in range(3))),
                Vector(tuple(max(point[axis] for point in points) for axis in range(3))),
            )
        )
    return bounds


def point_aabb_distance(point: Vector, minimum: Vector, maximum: Vector) -> float:
    return sum(
        max(minimum[axis] - point[axis], 0.0, point[axis] - maximum[axis]) ** 2
        for axis in range(3)
    ) ** 0.5


def audit_link_clearance(interior_colliders: list[bpy.types.Object]) -> int:
    endpoints: dict[str, dict[str, Vector]] = {}
    for obj in bpy.data.objects:
        if not obj.name.startswith("LNK_"):
            continue
        link_id = obj.get("hs_id")
        endpoint = obj.get("hs_endpoint")
        if link_id and endpoint in {"A", "B"}:
            endpoints.setdefault(str(link_id), {})[str(endpoint)] = obj.matrix_world.translation
    checked = 0
    violations: list[str] = []
    for link_id, pair in endpoints.items():
        if set(pair) != {"A", "B"}:
            raise RuntimeError(f"LNK端点が不足しています: {link_id}")
        start, end = pair["A"], pair["B"]
        for collider in interior_colliders:
            for component_index, (minimum, maximum) in enumerate(
                connected_component_aabbs(collider), start=1
            ):
                clearance = min(
                    point_aabb_distance(start.lerp(end, index / 100), minimum, maximum)
                    for index in range(101)
                )
                if clearance < 0.54 - 1e-6:
                    center = (minimum + maximum) * 0.5
                    violations.append(
                        f"{link_id} / {collider.name}#{component_index} / "
                        f"{clearance:.3f}m / center=({center.x:.2f},{center.y:.2f},{center.z:.2f})"
                    )
                checked += 1
    if violations:
        raise RuntimeError(
            "特殊経路0.54m包絡へ家具Colliderが侵入しています:\n"
            + "\n".join(violations)
        )
    return checked


def main() -> None:
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError(f"B03-2対象外のBlenderファイルです: {bpy.data.filepath}")
    if len(ADDITIONAL_PROP_TYPES) != 24 or len(set(ADDITIONAL_PROP_TYPES)) != 24:
        raise RuntimeError("追加小物カタログが24種ではありません")

    atlas_results = {}
    for definition in ATLAS_DEFINITIONS.values():
        path = TEXTURE_DIRECTORY / str(definition["file"])
        dimensions = png_dimensions(path)
        expected = int(definition["size"])
        if dimensions != (expected, expected):
            raise RuntimeError(f"Atlas寸法が不正です: {path}={dimensions}")
        atlas_results[path.name] = {
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "dimensions": dimensions,
        }

    interior_visuals = sorted(
        (obj for obj in bpy.data.objects if obj.name.startswith("VIS_B03_Interior_")),
        key=lambda obj: obj.name,
    )
    interior_colliders = sorted(
        (obj for obj in bpy.data.objects if obj.name.startswith("COL_B03_Interior_")),
        key=lambda obj: obj.name,
    )
    nav_blocker = bpy.data.objects.get("NAV_Blocker_Interiors")
    if not interior_visuals or len(interior_colliders) != 33 or nav_blocker is None:
        raise RuntimeError("全校内装の表示・Collider・Nav blockerが不足しています")
    if nav_blocker.get("hs_nav_role") != "blocker":
        raise RuntimeError("NAV_Blocker_Interiorsのhs_nav_roleが不正です")

    for obj in [*interior_visuals, *interior_colliders, nav_blocker]:
        if obj.type != "MESH" or obj.data.name != obj.name:
            raise RuntimeError(f"Object名とMesh名が一致しません: {obj.name}")
        if obj.data.users != 1 or not is_identity_transform(obj):
            raise RuntimeError(f"single-userまたはTransform契約に違反しています: {obj.name}")
    for obj in [*interior_colliders, nav_blocker]:
        if len(obj.data.materials) != 0 or not is_closed_mesh(obj):
            raise RuntimeError(f"Colliderが無材質の閉形状ではありません: {obj.name}")

    generation = json.loads(bpy.context.scene["b03_2_interior_result"])
    if generation.get("scope") != "full_school" or generation.get("rooms") != 34:
        raise RuntimeError("全校34区画の生成結果ではありません")
    if generation.get("classrooms") != 9:
        raise RuntimeError("普通教室が9室ではありません")
    room_counts = generation["room_counts"]
    classroom_metrics = generation["classroom_metrics"]
    for room_name, metrics in classroom_metrics.items():
        classroom_counts = room_counts[room_name]
        if (
            classroom_counts.get("ClassroomDesk") != 30
            or classroom_counts.get("ClassroomChair") != 30
            or classroom_counts.get("Blackboard") != 1
            or classroom_counts.get("BaggageLocker") != 3
            or classroom_counts.get("CleaningLocker") != 1
        ):
            raise RuntimeError(f"普通教室の必須家具数が不正です: {room_name}")
        if not 0.15 <= metrics["scatter_ratio"] <= 0.25:
            raise RuntimeError(f"普通教室の散乱率が範囲外です: {room_name}")
        if not 2 <= metrics["book_paper_spots"] <= 4:
            raise RuntimeError(f"普通教室の本・紙配置が範囲外です: {room_name}")
        if metrics["stored_chairs"] + metrics["scattered_sets"] != 30:
            raise RuntimeError(f"普通教室の椅子状態数が不正です: {room_name}")
    if generation.get("classroom_front") != "north":
        raise RuntimeError("西側校舎の教室前方が北ではありません")
    if generation.get("north_wing_classroom_front") != "east":
        raise RuntimeError("北側校舎の教室前方が東ではありません")

    expected_room_counts = {
        "F01_Infirmary": {
            "InfirmaryBed": 2,
            "StaffDesk": 1,
            "StaffChair": 1,
            "Bookshelf": 1,
            "CleaningLocker": 1,
        },
        "F01_Library": {
            "Bookshelf": 18,
            "LargeWoodTable": 4,
            "ClassroomChair": 16,
            "StaffDesk": 1,
            "StaffChair": 1,
        },
        "F01_StaffRoom": {
            "StaffDesk": 12,
            "StaffChair": 12,
            "PcMonitor": 6,
            "Bookshelf": 2,
            "CleaningLocker": 1,
        },
        "F01_PcRoom": {
            "StaffDesk": 24,
            "StaffChair": 24,
            "PcMonitor": 24,
            "BaggageLocker": 2,
            "CleaningLocker": 1,
            "PcTower": 24,
            "KeyboardMouse": 24,
        },
        "F02_Council": {
            "LargeWoodTable": 2,
            "ClassroomChair": 8,
            "StaffDesk": 1,
            "StaffChair": 1,
            "BaggageLocker": 1,
        },
        "F02_Broadcast": {
            "StaffDesk": 2,
            "StaffChair": 2,
            "PcMonitor": 2,
            "BaggageLocker": 1,
            "BroadcastConsole": 1,
        },
        "F02_Science": {
            "LabBench": 6,
            "ScienceStool": 36,
            "Blackboard": 1,
            "Bookshelf": 2,
            "CleaningLocker": 1,
        },
        "F03_Art": {
            "LargeWoodTable": 6,
            "ClassroomChair": 24,
            "Easel": 5,
            "Blackboard": 1,
            "Bookshelf": 2,
            "CleaningLocker": 1,
        },
        "F03_HomeEc": {
            "KitchenIsland": 4,
            "ClassroomChair": 24,
            "Blackboard": 1,
            "CleaningLocker": 1,
        },
        "F04_LL": {
            "ClassroomDesk": 24,
            "ClassroomChair": 24,
            "Blackboard": 1,
            "BaggageLocker": 2,
        },
        "F04_Music": {
            "GrandPiano": 1,
            "ClassroomChair": 30,
            "Blackboard": 1,
            "Bookshelf": 2,
            "CleaningLocker": 1,
        },
        "Gym": {"BasketballGoal": 2, "VaultingBox": 2, "StageLectern": 1},
        "GymStorage": {"VaultingBox": 2, "CleaningLocker": 1},
        "RoofChanging": {"BaggageLocker": 4, "CleaningLocker": 2},
    }
    for room_name, expected_counts in expected_room_counts.items():
        actual_counts = room_counts[room_name]
        for prop_type, expected_count in expected_counts.items():
            if actual_counts.get(prop_type) != expected_count:
                raise RuntimeError(
                    f"室内小物数が不正です: {room_name}/{prop_type}="
                    f"{actual_counts.get(prop_type)}/{expected_count}"
                )
    staffroom_collider = bpy.data.objects["COL_B03_Interior_F01_StaffRoom"]
    locker_x, locker_y, locker_rotation = STAFFROOM_CLEANING_LOCKER
    if locker_rotation != 0.0:
        raise RuntimeError("職員室の掃除ロッカー回転が監査前提と一致しません")
    locker_width, locker_depth, locker_height = PROP_COLLIDER_SIZES[
        "CleaningLocker"
    ]
    locker_minimum = Vector(
        (
            locker_x - locker_width / 2,
            locker_y - locker_depth / 2,
            0.0,
        )
    )
    locker_maximum = Vector(
        (
            locker_x + locker_width / 2,
            locker_y + locker_depth / 2,
            locker_height,
        )
    )
    room_min_x, room_max_x, room_min_y, room_max_y = STAFFROOM_INTERIOR_BOUNDS
    if not (
        room_min_x <= locker_minimum.x
        and locker_maximum.x <= room_max_x
        and room_min_y <= locker_minimum.y
        and locker_maximum.y <= room_max_y
    ):
        raise RuntimeError("職員室の掃除ロッカーが職員室区画外です")
    if not any(
        all(
            abs(actual_minimum[axis] - locker_minimum[axis]) < 1e-6
            for axis in range(3)
        )
        and all(
            abs(actual_maximum[axis] - locker_maximum[axis]) < 1e-6
            for axis in range(3)
        )
        for actual_minimum, actual_maximum in connected_component_aabbs(
            staffroom_collider
        )
    ):
        raise RuntimeError("職員室の掃除ロッカーColliderを確認できません")
    for floor in range(1, 5):
        corridor_name = f"F{floor:02d}_Corridors"
        if room_counts[corridor_name].get("CleaningLocker") != 1:
            raise RuntimeError(f"廊下の掃除ロッカー数が不正です: {corridor_name}")
    if room_counts["F01_PcRoom"].get("Blackboard", 0) != 0:
        raise RuntimeError("PC室に黒板が残っています")
    if room_counts["F04_LL"].get("PcMonitor", 0) != 0:
        raise RuntimeError("LL室にモニターが残っています")
    if room_counts["F04_Music"].get("MusicStand", 0) != 0:
        raise RuntimeError("音楽室に譜面台が残っています")
    expected_blackboards = {
        f"F{floor:02d}_Classroom{room_index:02d}"
        for floor in (2, 3, 4)
        for room_index in (1, 2, 3)
    } | {
        "F02_Science",
        "F03_Art",
        "F03_HomeEc",
        "F04_LL",
        "F04_Music",
    }
    if set(generation.get("blackboards", {})) != expected_blackboards:
        raise RuntimeError("黒板を置く教室が不正です")

    for floor in (1, 2, 3, 4):
        toilet_counts = room_counts[f"F{floor:02d}_Toilets"]
        expected_toilets = 0 if floor == 1 else 6
        expected_urinals = 0 if floor == 1 else 3
        if toilet_counts.get("WesternToilet", 0) != expected_toilets:
            raise RuntimeError(f"便器数が不正です: F{floor:02d}")
        if toilet_counts.get("Urinal", 0) != expected_urinals:
            raise RuntimeError(f"小便器数が不正です: F{floor:02d}")
        if toilet_counts.get("WashBasin") != 2 or toilet_counts.get("Mirror") != 2:
            raise RuntimeError(f"洗面設備数が不正です: F{floor:02d}")
        if toilet_counts.get("RoomSign") != 2:
            raise RuntimeError(f"トイレ標識数が不正です: F{floor:02d}")

    required_common_rooms = {
        "F01_Corridors", "F02_Corridors", "F03_Corridors", "F04_Corridors",
        "F01_MainEntry", "F01_NorthEntry", "GymStorage", "RoofPoolSafety",
    }
    if not required_common_rooms <= set(room_counts):
        raise RuntimeError("共用部の全校展開が不足しています")
    link_clearance_checks = audit_link_clearance(interior_colliders)

    gltf, binary_length = read_glb_json(GLB_PATH)
    views = gltf.get("bufferViews", [])
    for image in gltf.get("images", []):
        view_index = image.get("bufferView")
        if not isinstance(view_index, int) or view_index >= len(views):
            raise RuntimeError(f"AtlasのbufferView参照が不正です: {image}")
        view = views[view_index]
        if view.get("byteOffset", 0) + view.get("byteLength", 0) > binary_length:
            raise RuntimeError(f"AtlasがBIN chunk範囲外です: {image}")

    mesh_indices = [
        node["mesh"] for node in gltf.get("nodes", []) if "mesh" in node
    ]
    repeated_meshes = len(mesh_indices) - len(set(mesh_indices))
    if repeated_meshes:
        raise RuntimeError(f"共有Mesh参照があります: {repeated_meshes}")
    if len(gltf.get("materials", [])) != 5:
        raise RuntimeError("MaterialがAtlas 3系統＋透明2系統ではありません")
    if len(gltf.get("textures", [])) != 3 or len(gltf.get("images", [])) != 3:
        raise RuntimeError("GLBのAtlas Texture/Imageが3枚ではありません")

    result = {
        "additional_prop_types": len(ADDITIONAL_PROP_TYPES),
        "atlases": atlas_results,
        "school_rooms": generation["rooms"],
        "classrooms": generation["classrooms"],
        "interior_visual_objects": len(interior_visuals),
        "interior_collider_objects": len(interior_colliders),
        "interior_collider_boxes": generation["collider_boxes"],
        "classroom_metrics": classroom_metrics,
        "link_clearance_checks": link_clearance_checks,
        "glb": {
            "bytes": GLB_PATH.stat().st_size,
            "sha256": sha256(GLB_PATH),
            "nodes": len(gltf.get("nodes", [])),
            "meshes": len(gltf.get("meshes", [])),
            "materials": len(gltf.get("materials", [])),
            "textures": len(gltf.get("textures", [])),
            "images": len(gltf.get("images", [])),
            "shared_mesh_references": repeated_meshes,
        },
    }
    print("B03_INTERIOR_AUDIT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
