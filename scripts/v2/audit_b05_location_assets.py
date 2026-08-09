from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import Counter, defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from optimize_b03_school_glb import read_glb


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
SEMANTIC_COLLECTION_NAME = "B02_SEMANTIC"
NAV_COLLECTION_NAME = "B02_NAV"
EXPECTED_SCHEMA_VERSION = 3
TOLERANCE = 1.0e-5
OVERLAP_TOLERANCE = 1.0e-5

FLOOR_SPECS = {
    "f01": ("1F", 1),
    "f02": ("2F", 2),
    "f03": ("3F", 3),
    "f04": ("4F", 4),
    "roof": ("屋上", 5),
}
FLOOR_LABELS = {floor_id: display for floor_id, (display, _) in FLOOR_SPECS.items()}

ROOM_DISPLAY_NAMES = {
    "f01-infirmary": "保健室",
    "f01-library": "図書室",
    "f01-staff-room": "職員室",
    "f01-pc-room": "パソコン室",
    "f02-classroom-01": "3年1組",
    "f02-classroom-02": "3年2組",
    "f02-classroom-03": "3年3組",
    "f02-council": "生徒会室",
    "f02-broadcast": "放送室",
    "f02-science": "理科室",
    "f03-classroom-01": "2年1組",
    "f03-classroom-02": "2年2組",
    "f03-classroom-03": "2年3組",
    "f03-art": "美術室",
    "f03-home-ec": "家庭科室",
    "f04-classroom-01": "1年1組",
    "f04-classroom-02": "1年2組",
    "f04-classroom-03": "1年3組",
    "f04-ll": "LL教室",
    "f04-music": "音楽室",
}

MISSION_SPECS = {
    **{
        room_id: (
            f"area-room-{room_id}",
            room_id[:3],
            display_name,
        )
        for room_id, display_name in ROOM_DISPLAY_NAMES.items()
    },
    "gym": ("area-gym", "f01", "体育館"),
    "courtyard": ("area-courtyard", "f01", "校庭"),
    "rooftop": ("area-school-rooftop", "roof", "校舎屋上"),
    "rooftop-poolside": ("area-poolside", "roof", "屋上プールサイド"),
}

STAIR_LANDING_SPECS = (
    ("nw", "f01", "up"),
    ("nw", "f02", "both"),
    ("nw", "f03", "both"),
    ("nw", "f04", "both"),
    ("nw", "roof", "down"),
    ("ne", "f01", "up"),
    ("ne", "f02", "both"),
    ("ne", "f03", "both"),
    ("ne", "f04", "down"),
    ("sw", "f01", "up"),
    ("sw", "f02", "both"),
    ("sw", "f03", "both"),
    ("sw", "f04", "down"),
    ("gym-west", "f01", "up"),
    ("gym-west", "f02", "down"),
    ("gym-east", "f01", "up"),
    ("gym-east", "f02", "down"),
)

ELEVATOR_LANDING_SPECS = {
    "f01": (True, "school-elevator-stop-f01"),
    "f02": (False, None),
    "f03": (False, None),
    "f04": (True, "school-elevator-stop-f04"),
}

ROLE_COUNTS = {
    "floor_map": 5,
    "location_area": 85,
    "mission_location": 24,
    "mission_anchor": 24,
    "map_stair_landing": 17,
    "map_elevator_landing": 4,
    "broadcast_console": 1,
    "broadcast_console_target": 1,
}
MESH_ROLES = {
    "floor_map",
    "location_area",
    "mission_location",
    "broadcast_console_target",
}
MARKER_ROLES = set(ROLE_COUNTS) - MESH_ROLES
PREFIX_ROLES = {
    "MAP_": "floor_map",
    "VOL_LocationArea_": "location_area",
    "VOL_MissionLocation_": "mission_location",
    "MRK_MissionAnchor_": "mission_anchor",
    "MRK_MapStairLanding_": "map_stair_landing",
    "MRK_MapElevatorLanding_": "map_elevator_landing",
    "MRK_BroadcastConsole_": "broadcast_console",
    "VOL_BroadcastConsoleTarget_": "broadcast_console_target",
}


@dataclass(frozen=True)
class AreaContract:
    display_name: str
    priority: int
    floor_ids: tuple[str, ...] = ()
    elevator_id: str | None = None


@dataclass(frozen=True)
class Bounds:
    minimum: tuple[float, float, float]
    maximum: tuple[float, float, float]


@dataclass(frozen=True)
class AreaPiece:
    obj: bpy.types.Object
    area_id: str
    priority: int
    floor_id: str | None
    bounds: Bounds


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def hs_properties(obj: bpy.types.Object) -> dict[str, Any]:
    return {
        key: obj[key]
        for key in obj.keys()
        if isinstance(key, str) and key.startswith("hs_")
    }


def require_hs_properties(
    obj: bpy.types.Object,
    expected: dict[str, Any],
) -> None:
    actual = hs_properties(obj)
    require(
        actual == expected,
        f"{obj.name}のhs_*契約が不正です: actual={actual}, expected={expected}",
    )


def close(left: float, right: float) -> bool:
    return math.isclose(left, right, abs_tol=TOLERANCE)


def build_area_contracts() -> dict[str, AreaContract]:
    contracts: dict[str, AreaContract] = {}

    def add(area_id: str, contract: AreaContract) -> None:
        require(area_id not in contracts, f"Area契約IDが重複しています: {area_id}")
        contracts[area_id] = contract

    for room_id, display_name in ROOM_DISPLAY_NAMES.items():
        add(
            f"area-room-{room_id}",
            AreaContract(display_name, 300, (room_id[:3],)),
        )
    for floor_id in ("f01", "f02", "f03", "f04"):
        add(
            f"area-toilet-male-{floor_id}",
            AreaContract("男子トイレ", 300, (floor_id,)),
        )
        add(
            f"area-toilet-female-{floor_id}",
            AreaContract("女子トイレ", 300, (floor_id,)),
        )
        add(
            f"area-common-{floor_id}",
            AreaContract("廊下・共用部", 100, (floor_id,)),
        )

    stair_labels = {"nw": "北西", "ne": "北東", "sw": "南西"}
    stair_transitions = {
        "nw": (("f01", "f02"), ("f02", "f03"), ("f03", "f04"), ("f04", "roof")),
        "ne": (("f01", "f02"), ("f02", "f03"), ("f03", "f04")),
        "sw": (("f01", "f02"), ("f02", "f03"), ("f03", "f04")),
    }
    for stair_id, transitions in stair_transitions.items():
        for lower_floor, upper_floor in transitions:
            add(
                f"area-stair-{stair_id}-{lower_floor}-{upper_floor}",
                AreaContract(
                    f"{FLOOR_LABELS[lower_floor]}-{FLOOR_LABELS[upper_floor]} "
                    f"{stair_labels[stair_id]}階段",
                    250,
                    (lower_floor, upper_floor),
                ),
            )
    for side, label in (("west", "西"), ("east", "東")):
        add(
            f"area-stair-gym-{side}-f01-f02",
            AreaContract(f"1F-2F 体育館{label}階段", 250, ("f01", "f02")),
        )

    add("area-courtyard", AreaContract("校庭", 200, ("f01",) * 14))
    add("area-gym", AreaContract("体育館", 200, ("f01",) * 2))
    add("area-gym-gallery", AreaContract("体育館ギャラリー", 200, ("f02",) * 5))
    add("area-gym-rooftop", AreaContract("体育館屋上", 200, ("f03",) * 2))
    add("area-school-rooftop", AreaContract("校舎屋上", 200, ("roof",) * 3))
    add("area-poolside", AreaContract("プールサイド", 300, ("roof",)))
    add("area-changing-room", AreaContract("更衣室", 300, ("roof",)))
    add(
        "area-elevator",
        AreaContract("エレベーター", 400, elevator_id="school-elevator"),
    )
    require(len(contracts) == 52, f"監査正本の論理Areaが52件ではありません: {len(contracts)}")
    require(
        sum(len(contract.floor_ids) or 1 for contract in contracts.values()) == 85,
        "監査正本のArea pieceが85件ではありません",
    )
    return contracts


AREA_CONTRACTS = build_area_contracts()


def connected_components(mesh: bpy.types.Mesh) -> list[set[int]]:
    adjacency = {vertex.index: set() for vertex in mesh.vertices}
    for edge in mesh.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)
    remaining = set(adjacency)
    components: list[set[int]] = []
    while remaining:
        start = min(remaining)
        remaining.remove(start)
        component = {start}
        queue = deque([start])
        while queue:
            current = queue.popleft()
            for neighbor in adjacency[current]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    component.add(neighbor)
                    queue.append(neighbor)
        components.append(component)
    return components


def audit_axis_aligned_boxes(obj: bpy.types.Object) -> list[Bounds]:
    require(obj.type == "MESH", f"{obj.name}がMeshではありません")
    require(not obj.modifiers, f"{obj.name}にModifierがあります")
    mesh = obj.data
    components = connected_components(mesh)
    require(components, f"{obj.name}にbox componentがありません")
    result: list[Bounds] = []
    for component_index, component in enumerate(components, start=1):
        edges = [
            edge
            for edge in mesh.edges
            if edge.vertices[0] in component and edge.vertices[1] in component
        ]
        polygons = [
            polygon
            for polygon in mesh.polygons
            if any(vertex_index in component for vertex_index in polygon.vertices)
        ]
        require(
            all(set(polygon.vertices) <= component for polygon in polygons),
            f"{obj.name}のcomponent間を跨ぐ面があります",
        )
        require(
            len(component) == 8 and len(edges) == 12 and len(polygons) == 6,
            f"{obj.name} component {component_index}が8頂点・12辺・6面ではありません",
        )
        require(
            all(len(polygon.vertices) == 4 for polygon in polygons),
            f"{obj.name} component {component_index}に四角形以外の面があります",
        )
        edge_use = Counter(
            tuple(
                sorted(
                    (
                        polygon.vertices[index],
                        polygon.vertices[(index + 1) % len(polygon.vertices)],
                    )
                )
            )
            for polygon in polygons
            for index in range(len(polygon.vertices))
        )
        require(
            len(edge_use) == 12 and set(edge_use.values()) == {2},
            f"{obj.name} component {component_index}が閉じたboxではありません",
        )
        points = [obj.matrix_world @ mesh.vertices[index].co for index in component]
        minimum = tuple(min(point[axis] for point in points) for axis in range(3))
        maximum = tuple(max(point[axis] for point in points) for axis in range(3))
        require(
            all(maximum[axis] - minimum[axis] > TOLERANCE for axis in range(3)),
            f"{obj.name} component {component_index}が正体積ではありません",
        )
        corners: set[tuple[int, int, int]] = set()
        for point in points:
            bits: list[int] = []
            for axis in range(3):
                if close(point[axis], minimum[axis]):
                    bits.append(0)
                elif close(point[axis], maximum[axis]):
                    bits.append(1)
                else:
                    raise RuntimeError(
                        f"{obj.name} component {component_index}に軸平行boxの角でない頂点があります: "
                        f"{tuple(point)}"
                    )
            corners.add(tuple(bits))
        require(
            len(corners) == 8,
            f"{obj.name} component {component_index}の8角が一意ではありません",
        )
        result.append(Bounds(minimum, maximum))
    return result


def contains_point(bounds: Bounds, point: Vector) -> bool:
    return all(
        bounds.minimum[axis] - TOLERANCE
        <= point[axis]
        <= bounds.maximum[axis] + TOLERANCE
        for axis in range(3)
    )


def contains_bounds(outer: Bounds, inner: Bounds) -> bool:
    return all(
        outer.minimum[axis] <= inner.minimum[axis] + TOLERANCE
        and outer.maximum[axis] >= inner.maximum[axis] - TOLERANCE
        for axis in range(3)
    )


def positive_volume_overlap(left: Bounds, right: Bounds) -> bool:
    return all(
        min(left.maximum[axis], right.maximum[axis])
        - max(left.minimum[axis], right.minimum[axis])
        > OVERLAP_TOLERANCE
        for axis in range(3)
    )


def require_global_object(reference_id: str, role: str) -> bpy.types.Object:
    matches = [obj for obj in bpy.data.objects if obj.get("hs_id") == reference_id]
    require(
        len(matches) == 1,
        f"参照IDがBlender内で一意に解決できません: {reference_id}/{len(matches)}件",
    )
    require(
        matches[0].get("hs_role") == role,
        f"参照先roleが不正です: {reference_id}/{matches[0].get('hs_role')}",
    )
    return matches[0]


def collect_location_objects() -> dict[str, list[bpy.types.Object]]:
    for obj in bpy.data.objects:
        for prefix, expected_role in PREFIX_ROLES.items():
            if obj.name.startswith(prefix):
                require(
                    obj.get("hs_role") == expected_role,
                    f"B05 prefixに対するroleが不正です: {obj.name}/{obj.get('hs_role')}",
                )
                break
    by_role = {
        role: [obj for obj in bpy.data.objects if obj.get("hs_role") == role]
        for role in ROLE_COUNTS
    }
    actual_counts = {role: len(objects) for role, objects in by_role.items()}
    require(
        actual_counts == ROLE_COUNTS,
        f"B05 role件数が不正です: {actual_counts}",
    )
    ids = [str(obj.get("hs_id")) for objects in by_role.values() for obj in objects]
    require(
        all(value and value != "None" for value in ids),
        "B05意味Objectにhs_id欠落があります",
    )
    duplicate_ids = sorted(value for value, count in Counter(ids).items() if count != 1)
    require(not duplicate_ids, f"B05 hs_idが重複しています: {duplicate_ids}")
    return by_role


def audit_collections(by_role: dict[str, list[bpy.types.Object]]) -> dict[str, int]:
    semantic_collection = bpy.data.collections.get(SEMANTIC_COLLECTION_NAME)
    nav_collection = bpy.data.collections.get(NAV_COLLECTION_NAME)
    require(semantic_collection is not None, f"{SEMANTIC_COLLECTION_NAME}がありません")
    require(nav_collection is not None, f"{NAV_COLLECTION_NAME}がありません")
    semantic_names = {obj.name for obj in semantic_collection.all_objects}
    nav_names = {obj.name for obj in nav_collection.all_objects}
    objects = [obj for entries in by_role.values() for obj in entries]
    outside_semantic = sorted(obj.name for obj in objects if obj.name not in semantic_names)
    in_nav = sorted(obj.name for obj in objects if obj.name in nav_names)
    require(not outside_semantic, f"B05意味ObjectがSemantic collection外です: {outside_semantic}")
    require(not in_nav, f"B05意味ObjectがNav source collection内です: {in_nav}")
    return {"semantic_objects": len(objects), "nav_source_objects": len(in_nav)}


def audit_floor_maps(objects: list[bpy.types.Object]) -> dict[str, int]:
    by_floor = {str(obj.get("hs_floor_id")): obj for obj in objects}
    require(set(by_floor) == set(FLOOR_SPECS), f"Map floor IDが不正です: {sorted(by_floor)}")
    component_counts: dict[str, int] = {}
    for floor_id, (display_name, order) in FLOOR_SPECS.items():
        obj = by_floor[floor_id]
        require(obj.name == f"MAP_{floor_id.upper()}", f"Map Object名が不正です: {obj.name}")
        require_hs_properties(
            obj,
            {
                "hs_id": f"floor-map-{floor_id}",
                "hs_role": "floor_map",
                "hs_floor_id": floor_id,
                "hs_display_name": display_name,
                "hs_order": order,
            },
        )
        component_counts[floor_id] = len(audit_axis_aligned_boxes(obj))
    return component_counts


def audit_areas(objects: list[bpy.types.Object]) -> list[AreaPiece]:
    grouped: dict[str, list[bpy.types.Object]] = defaultdict(list)
    for obj in objects:
        grouped[str(obj.get("hs_area_id"))].append(obj)
    require(
        set(grouped) == set(AREA_CONTRACTS),
        f"論理Area ID集合が不正です: missing={sorted(set(AREA_CONTRACTS) - set(grouped))}, "
        f"extra={sorted(set(grouped) - set(AREA_CONTRACTS))}",
    )
    result: list[AreaPiece] = []
    for area_id, contract in AREA_CONTRACTS.items():
        pieces = grouped[area_id]
        expected_count = len(contract.floor_ids) or 1
        require(len(pieces) == expected_count, f"{area_id}のpiece数が不正です: {len(pieces)}")
        expected_ids = {f"{area_id}-piece-{index:02d}" for index in range(1, expected_count + 1)}
        require(
            {str(obj.get("hs_id")) for obj in pieces} == expected_ids,
            f"{area_id}のpiece ID集合が不正です",
        )
        if contract.elevator_id is None:
            require(
                Counter(str(obj.get("hs_floor_id")) for obj in pieces)
                == Counter(contract.floor_ids),
                f"{area_id}のfloor割当が不正です",
            )
        for obj in pieces:
            if contract.elevator_id is None:
                floor_id = str(obj.get("hs_floor_id"))
                expected_properties = {
                    "hs_id": obj.get("hs_id"),
                    "hs_role": "location_area",
                    "hs_area_id": area_id,
                    "hs_display_name": contract.display_name,
                    "hs_priority": contract.priority,
                    "hs_floor_id": floor_id,
                }
            else:
                floor_id = None
                expected_properties = {
                    "hs_id": obj.get("hs_id"),
                    "hs_role": "location_area",
                    "hs_area_id": area_id,
                    "hs_display_name": contract.display_name,
                    "hs_priority": contract.priority,
                    "hs_elevator_id": contract.elevator_id,
                }
                elevator = require_global_object(contract.elevator_id, "elevator")
                require(
                    obj.parent is not None
                    and obj.parent.name == "MRK_ElevatorCar_School"
                    and obj.parent.get("hs_role") == "elevator_car"
                    and obj.parent.get("hs_elevator_id") == elevator.get("hs_id"),
                    "エレベーターAreaの親またはelevator参照が不正です",
                )
            require_hs_properties(obj, expected_properties)
            bounds = audit_axis_aligned_boxes(obj)
            require(len(bounds) == 1, f"{obj.name}が1 boxではありません")
            result.append(AreaPiece(obj, area_id, contract.priority, floor_id, bounds[0]))
    require(len(result) == 85, f"Area pieceが85件ではありません: {len(result)}")
    overlaps = []
    for index, left in enumerate(result):
        for right in result[index + 1 :]:
            if left.area_id == right.area_id or left.priority != right.priority:
                continue
            if positive_volume_overlap(left.bounds, right.bounds):
                overlaps.append((left.obj.name, right.obj.name, left.priority))
    require(not overlaps, f"同順位Areaに正体積重複があります: {overlaps}")
    return result


def audit_missions(
    volumes: list[bpy.types.Object],
    anchors: list[bpy.types.Object],
    area_pieces: list[AreaPiece],
) -> dict[str, int]:
    volume_by_location = {str(obj.get("hs_location_id")): obj for obj in volumes}
    anchor_by_location = {str(obj.get("hs_location_id")): obj for obj in anchors}
    require(set(volume_by_location) == set(MISSION_SPECS), "Mission Volumeのlocation ID集合が不正です")
    require(set(anchor_by_location) == set(MISSION_SPECS), "Mission Anchorのlocation ID集合が不正です")
    pieces_by_area: dict[str, list[AreaPiece]] = defaultdict(list)
    for piece in area_pieces:
        pieces_by_area[piece.area_id].append(piece)

    for location_id, (area_id, floor_id, display_name) in MISSION_SPECS.items():
        volume = volume_by_location[location_id]
        anchor = anchor_by_location[location_id]
        anchor_id = f"mission-anchor-{location_id}"
        require_hs_properties(
            anchor,
            {
                "hs_id": anchor_id,
                "hs_role": "mission_anchor",
                "hs_location_id": location_id,
            },
        )
        require(anchor.type == "EMPTY", f"{anchor.name}がEmptyではありません")
        require_hs_properties(
            volume,
            {
                "hs_id": f"mission-location-volume-{location_id}",
                "hs_role": "mission_location",
                "hs_location_id": location_id,
                "hs_area_id": area_id,
                "hs_floor_id": floor_id,
                "hs_display_name": display_name,
                "hs_anchor_id": anchor_id,
            },
        )
        volume_bounds = audit_axis_aligned_boxes(volume)
        require(len(volume_bounds) == 1, f"{volume.name}が1 boxではありません")
        bounds = volume_bounds[0]
        position = anchor.matrix_world.translation
        require(contains_point(bounds, position), f"{location_id} AnchorがMission Volume外です")
        matching_area_pieces = [
            piece
            for piece in pieces_by_area[area_id]
            if piece.floor_id == floor_id
        ]
        require(
            any(
                contains_point(piece.bounds, position)
                and contains_bounds(piece.bounds, bounds)
                for piece in matching_area_pieces
            ),
            f"{location_id} Mission Volumeが参照Area pieceへ完全内包されていません",
        )
        containing_areas = [piece for piece in area_pieces if contains_point(piece.bounds, position)]
        require(containing_areas, f"{location_id} Anchorを含むAreaがありません")
        resolved = sorted(containing_areas, key=lambda piece: (-piece.priority, piece.area_id))[0]
        require(
            resolved.area_id == area_id,
            f"{location_id} Anchorの最優先Areaが不正です: {resolved.area_id}",
        )
    return {"volumes": len(volumes), "anchors": len(anchors), "references": len(MISSION_SPECS)}


def audit_stair_landings(objects: list[bpy.types.Object]) -> int:
    expected_ids = set()
    for stair_id, floor_id, direction in STAIR_LANDING_SPECS:
        landing_id = f"stair-landing-{stair_id}-{floor_id}"
        expected_ids.add(landing_id)
        matches = [obj for obj in objects if obj.get("hs_id") == landing_id]
        require(len(matches) == 1, f"階段踊り場IDが一意ではありません: {landing_id}")
        obj = matches[0]
        require_hs_properties(
            obj,
            {
                "hs_id": landing_id,
                "hs_role": "map_stair_landing",
                "hs_stair_id": f"stair-{stair_id}",
                "hs_floor_id": floor_id,
                "hs_direction": direction,
            },
        )
        require(obj.type == "EMPTY", f"{obj.name}がEmptyではありません")
    require({str(obj.get("hs_id")) for obj in objects} == expected_ids, "階段踊り場ID集合が不正です")
    return len(expected_ids)


def audit_elevator_landings(objects: list[bpy.types.Object]) -> dict[str, int]:
    by_floor = {str(obj.get("hs_floor_id")): obj for obj in objects}
    require(set(by_floor) == set(ELEVATOR_LANDING_SPECS), "エレベーター乗場floor集合が不正です")
    require_global_object("school-elevator", "elevator")
    available_count = 0
    stop_reference_count = 0
    for floor_id, (available, stop_id) in ELEVATOR_LANDING_SPECS.items():
        obj = by_floor[floor_id]
        properties: dict[str, Any] = {
            "hs_id": f"elevator-landing-{floor_id}",
            "hs_role": "map_elevator_landing",
            "hs_elevator_id": "school-elevator",
            "hs_floor_id": floor_id,
            "hs_available": available,
        }
        if stop_id is not None:
            properties["hs_stop_id"] = stop_id
            require_global_object(stop_id, "elevator_stop")
            available_count += 1
            stop_reference_count += 1
        require_hs_properties(obj, properties)
        require(obj.type == "EMPTY", f"{obj.name}がEmptyではありません")
    return {
        "landings": len(objects),
        "available": available_count,
        "unavailable": len(objects) - available_count,
        "stop_references": stop_reference_count,
    }


def audit_broadcast(
    consoles: list[bpy.types.Object],
    targets: list[bpy.types.Object],
) -> dict[str, int]:
    require(len(consoles) == 1 and len(targets) == 1, "放送卓またはtargetが1件ではありません")
    console = consoles[0]
    target = targets[0]
    require_hs_properties(
        console,
        {
            "hs_id": "broadcast-console-school",
            "hs_role": "broadcast_console",
            "hs_floor_id": "f02",
            "hs_display_name": "放送卓",
            "hs_target_id": "broadcast-console-target-school",
        },
    )
    require_hs_properties(
        target,
        {
            "hs_id": "broadcast-console-target-school",
            "hs_role": "broadcast_console_target",
            "hs_console_id": "broadcast-console-school",
        },
    )
    require(console.type == "EMPTY", "放送卓MarkerがEmptyではありません")
    bounds = audit_axis_aligned_boxes(target)
    require(len(bounds) == 1, "放送卓targetが1 boxではありません")
    return {"consoles": 1, "targets": 1, "bidirectional_references": 2}


def audit_boundary_containment(by_role: dict[str, list[bpy.types.Object]]) -> dict[str, int]:
    boundary = bpy.data.objects.get("BND_WorldLimit")
    require(boundary is not None and boundary.type == "MESH", "BND_WorldLimitがありません")
    corners = [boundary.matrix_world @ Vector(corner) for corner in boundary.bound_box]
    bounds = Bounds(
        tuple(min(corner[axis] for corner in corners) for axis in range(3)),
        tuple(max(corner[axis] for corner in corners) for axis in range(3)),
    )
    mesh_objects = [obj for role in MESH_ROLES for obj in by_role[role]]
    outside = []
    for obj in mesh_objects:
        for vertex in obj.data.vertices:
            if not contains_point(bounds, obj.matrix_world @ vertex.co):
                outside.append(obj.name)
                break
    require(not outside, f"B05意味MeshがBND_WorldLimit外です: {sorted(outside)}")
    return {"checked_meshes": len(mesh_objects), "outside_meshes": len(outside)}


def audit_glb(by_role: dict[str, list[bpy.types.Object]]) -> dict[str, Any]:
    document = read_glb(GLB_PATH)
    gltf = document.json_data
    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    meta_nodes = [node for node in nodes if node.get("name") == "META_Stage"]
    require(len(meta_nodes) == 1, "GLBのMETA_Stageが1件ではありません")
    require(
        meta_nodes[0].get("extras", {}).get("hs_schema_version") == EXPECTED_SCHEMA_VERSION,
        "GLBのschema versionが3ではありません",
    )

    relevant_nodes = [
        node
        for node in nodes
        if node.get("extras", {}).get("hs_role") in ROLE_COUNTS
    ]
    role_counts = Counter(node["extras"]["hs_role"] for node in relevant_nodes)
    require(dict(role_counts) == ROLE_COUNTS, f"GLBのB05 role件数が不正です: {dict(role_counts)}")
    nodes_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for node in relevant_nodes:
        nodes_by_name[str(node.get("name"))].append(node)
    blender_objects = [obj for objects in by_role.values() for obj in objects]
    require(
        set(nodes_by_name) == {obj.name for obj in blender_objects},
        "GLBとBlendのB05 Node名集合が一致しません",
    )
    for obj in blender_objects:
        matches = nodes_by_name[obj.name]
        require(len(matches) == 1, f"GLB Node名が一意ではありません: {obj.name}")
        node = matches[0]
        glb_hs = {
            key: value
            for key, value in node.get("extras", {}).items()
            if key.startswith("hs_")
        }
        require(glb_hs == hs_properties(obj), f"GLB extrasがBlendと不一致です: {obj.name}")
        mesh_index = node.get("mesh")
        if obj.get("hs_role") in MESH_ROLES:
            require(
                isinstance(mesh_index, int) and 0 <= mesh_index < len(meshes),
                f"GLB意味Mesh参照が不正です: {obj.name}",
            )
        else:
            require(mesh_index is None, f"GLB MarkerがMeshを参照しています: {obj.name}")

    all_nodes_by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for node in nodes:
        hs_id = node.get("extras", {}).get("hs_id")
        if isinstance(hs_id, str):
            all_nodes_by_id[hs_id].append(node)

    def require_node_reference(reference_id: str, role: str) -> dict[str, Any]:
        matches = all_nodes_by_id[reference_id]
        require(len(matches) == 1, f"GLB参照IDが一意ではありません: {reference_id}")
        require(
            matches[0].get("extras", {}).get("hs_role") == role,
            f"GLB参照先roleが不正です: {reference_id}",
        )
        return matches[0]

    floor_ids = {
        node["extras"]["hs_floor_id"]
        for node in relevant_nodes
        if node["extras"].get("hs_role") == "floor_map"
    }
    area_ids = {
        node["extras"]["hs_area_id"]
        for node in relevant_nodes
        if node["extras"].get("hs_role") == "location_area"
    }
    location_ids = {
        node["extras"]["hs_location_id"]
        for node in relevant_nodes
        if node["extras"].get("hs_role") == "mission_location"
    }
    for node in relevant_nodes:
        extras = node["extras"]
        role = extras["hs_role"]
        if "hs_floor_id" in extras:
            require(extras["hs_floor_id"] in floor_ids, f"GLB floor参照が不正です: {node.get('name')}")
        if role == "location_area" and "hs_elevator_id" in extras:
            require_node_reference(extras["hs_elevator_id"], "elevator")
        elif role == "mission_location":
            require(extras["hs_area_id"] in area_ids, f"GLB Mission Area参照が不正です: {node.get('name')}")
            anchor = require_node_reference(extras["hs_anchor_id"], "mission_anchor")
            require(
                anchor["extras"].get("hs_location_id") == extras["hs_location_id"],
                f"GLB Mission Anchor location参照が不正です: {node.get('name')}",
            )
        elif role == "mission_anchor":
            require(extras["hs_location_id"] in location_ids, f"GLB Anchor location参照が不正です: {node.get('name')}")
        elif role == "map_elevator_landing":
            require_node_reference(extras["hs_elevator_id"], "elevator")
            if extras["hs_available"]:
                require_node_reference(extras["hs_stop_id"], "elevator_stop")
            else:
                require("hs_stop_id" not in extras, f"GLB利用不可乗場にstop参照があります: {node.get('name')}")
        elif role == "broadcast_console":
            require_node_reference(extras["hs_target_id"], "broadcast_console_target")
        elif role == "broadcast_console_target":
            require_node_reference(extras["hs_console_id"], "broadcast_console")

    return {
        "bytes": GLB_PATH.stat().st_size,
        "sha256": sha256(GLB_PATH),
        "role_counts": dict(sorted(role_counts.items())),
        "extras_matched": len(relevant_nodes),
        "references_validated": True,
    }


def main() -> None:
    require(Path(bpy.data.filepath).resolve() == BLEND_PATH.resolve(), "監査対象.blendが不正です")
    metadata = bpy.data.objects.get("META_Stage")
    require(metadata is not None and metadata.type == "EMPTY", "META_Stageがありません")
    require(
        metadata.get("hs_schema_version") == EXPECTED_SCHEMA_VERSION,
        f"schema versionが{EXPECTED_SCHEMA_VERSION}ではありません",
    )
    bpy.context.view_layer.update()
    by_role = collect_location_objects()
    collection_result = audit_collections(by_role)
    floor_map_components = audit_floor_maps(by_role["floor_map"])
    area_pieces = audit_areas(by_role["location_area"])
    mission_result = audit_missions(
        by_role["mission_location"],
        by_role["mission_anchor"],
        area_pieces,
    )
    stair_count = audit_stair_landings(by_role["map_stair_landing"])
    elevator_result = audit_elevator_landings(by_role["map_elevator_landing"])
    broadcast_result = audit_broadcast(
        by_role["broadcast_console"],
        by_role["broadcast_console_target"],
    )
    boundary_result = audit_boundary_containment(by_role)
    priority_counts = Counter(piece.priority for piece in area_pieces)
    result = {
        "schema_version": EXPECTED_SCHEMA_VERSION,
        "blend": {
            "bytes": BLEND_PATH.stat().st_size,
            "sha256": sha256(BLEND_PATH),
        },
        "glb": audit_glb(by_role),
        "counts": {
            "floor_maps": len(by_role["floor_map"]),
            "logical_areas": len(AREA_CONTRACTS),
            "area_pieces": len(area_pieces),
            "mission_volumes": mission_result["volumes"],
            "mission_anchors": mission_result["anchors"],
            "stair_landings": stair_count,
            "elevator_landings": elevator_result["landings"],
            "broadcast_consoles": broadcast_result["consoles"],
            "broadcast_targets": broadcast_result["targets"],
        },
        "floor_map_box_components": floor_map_components,
        "area_priority_piece_counts": {
            str(priority): count for priority, count in sorted(priority_counts.items())
        },
        "same_priority_positive_volume_overlaps": 0,
        "mission_references": mission_result["references"],
        "elevator": elevator_result,
        "broadcast": broadcast_result,
        "collections": collection_result,
        "world_boundary": boundary_result,
    }
    print("B05_AUDIT_RESULT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
