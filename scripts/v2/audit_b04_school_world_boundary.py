from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import Counter, deque
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from build_b03_school_interiors import swatch_uv
from optimize_b03_school_glb import read_glb


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
NAVMESH_PATHS = {
    "human": (
        REPOSITORY_ROOT
        / "public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin",
        3_123_476,
        "530FA01F472A7F3AB4F983C6360AA41C296F3170AE44334E67E26377ED5D977B",
    ),
    "bit": (
        REPOSITORY_ROOT
        / "public/stage-assets/v2/B02/b02_school_blockout.bit-flight.navmesh.bin",
        565_399,
        "E7E0A76429BA1C9BCFCB26A18071DB2307CA394632FB727A0559140244CAC62A",
    ),
    "room_variants": (
        REPOSITORY_ROOT
        / "public/stage-assets/v2/B02/b02_school_blockout.room-variants.navmesh.bin",
        1_943_448,
        "E8164B33546A12167ED28655598707D643B88DB67DCFFBF17D03DD2E9460FFE6",
    ),
}
EXPECTED_OBJECTS = {
    "VIS_B04_Sidewalk": {
        "inner": (-18.8, -14.7, 63.6, 51.7),
        "outer": (-20.3, -16.2, 65.1, 53.2),
        "swatch": "wall",
    },
    "VIS_B04_Road": {
        "inner": (-20.3, -16.2, 65.1, 53.2),
        "outer": (-23.8, -19.7, 68.6, 56.7),
        "swatch": "trim",
    },
}
WORLD_BOUNDARY_MINIMUM = (-23.8, -19.7, -0.6)
WORLD_BOUNDARY_MAXIMUM = (68.6, 56.7, 24.0)
SURFACE_Z = (-0.35, -0.30)
TOLERANCE = 1.0e-5


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def close_tuple(
    actual: tuple[float, ...], expected: tuple[float, ...]
) -> bool:
    return len(actual) == len(expected) and all(
        math.isclose(left, right, abs_tol=TOLERANCE)
        for left, right in zip(actual, expected, strict=True)
    )


def world_bounds(
    obj: bpy.types.Object,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        tuple(min(corner[axis] for corner in corners) for axis in range(3)),
        tuple(max(corner[axis] for corner in corners) for axis in range(3)),
    )


def connected_vertex_components(mesh: bpy.types.Mesh) -> list[set[int]]:
    adjacency: dict[int, set[int]] = {
        vertex.index: set() for vertex in mesh.vertices
    }
    for edge in mesh.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)

    remaining = set(adjacency)
    components: list[set[int]] = []
    while remaining:
        start = min(remaining)
        component = {start}
        queue = deque([start])
        remaining.remove(start)
        while queue:
            current = queue.popleft()
            for neighbor in adjacency[current]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    component.add(neighbor)
                    queue.append(neighbor)
        components.append(component)
    return components


def component_bounds(
    obj: bpy.types.Object,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    result = []
    for component in connected_vertex_components(obj.data):
        coordinates = [
            obj.matrix_world @ obj.data.vertices[index].co for index in component
        ]
        result.append(
            (
                tuple(
                    min(coordinate[axis] for coordinate in coordinates)
                    for axis in range(3)
                ),
                tuple(
                    max(coordinate[axis] for coordinate in coordinates)
                    for axis in range(3)
                ),
            )
        )
    return result


def expected_frame_bounds(
    inner: tuple[float, float, float, float],
    outer: tuple[float, float, float, float],
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    inner_min_x, inner_min_y, inner_max_x, inner_max_y = inner
    outer_min_x, outer_min_y, outer_max_x, outer_max_y = outer
    z_min, z_max = SURFACE_Z
    return [
        (
            (outer_min_x, outer_min_y, z_min),
            (inner_min_x, outer_max_y, z_max),
        ),
        (
            (inner_max_x, outer_min_y, z_min),
            (outer_max_x, outer_max_y, z_max),
        ),
        (
            (inner_min_x, outer_min_y, z_min),
            (inner_max_x, inner_min_y, z_max),
        ),
        (
            (inner_min_x, inner_max_y, z_min),
            (inner_max_x, outer_max_y, z_max),
        ),
    ]


def canonical_bounds(
    bounds: list[tuple[tuple[float, float, float], tuple[float, float, float]]],
) -> list[tuple[float, ...]]:
    return sorted(
        tuple(round(value, 5) for endpoint in item for value in endpoint)
        for item in bounds
    )


def audit_surface_object(name: str, spec: dict[str, object]) -> dict[str, int]:
    obj = bpy.data.objects.get(name)
    require(obj is not None and obj.type == "MESH", f"{name}がMeshではありません")
    require(not obj.modifiers, f"{name}にModifierがあります")
    require(
        close_tuple(tuple(obj.location), (0.0, 0.0, 0.0))
        and close_tuple(tuple(obj.rotation_euler), (0.0, 0.0, 0.0))
        and close_tuple(tuple(obj.scale), (1.0, 1.0, 1.0)),
        f"{name}のTransformが正規化されていません",
    )
    expected = expected_frame_bounds(spec["inner"], spec["outer"])
    actual = component_bounds(obj)
    require(
        canonical_bounds(actual) == canonical_bounds(expected),
        f"{name}の4辺形状が不正です: {actual}",
    )
    require(
        len(obj.data.vertices) == 32
        and len(obj.data.polygons) == 24
        and len(actual) == 4,
        f"{name}のbox構成が4件ではありません",
    )
    require(
        len(obj.data.materials) == 1
        and obj.data.materials[0].name == "MAT_B03_Atlas_Architecture",
        f"{name}がArchitecture Atlasを使用していません",
    )
    uv_layer = obj.data.uv_layers.get("UVMap")
    require(uv_layer is not None, f"{name}にUVMapがありません")
    expected_uvs = swatch_uv("Architecture", spec["swatch"])
    for uv in uv_layer.data:
        require(
            any(close_tuple(tuple(uv.uv), tuple(expected_uv)) for expected_uv in expected_uvs),
            f"{name}のAtlas swatchが{spec['swatch']}ではありません",
        )
    return {
        "components": len(actual),
        "vertices": len(obj.data.vertices),
        "polygons": len(obj.data.polygons),
    }


def audit_world_boundary() -> dict[str, object]:
    boundaries = [
        obj for obj in bpy.data.objects if obj.name == "BND_WorldLimit"
    ]
    require(len(boundaries) == 1, "BND_WorldLimitがちょうど1件ではありません")
    boundary = boundaries[0]
    require(boundary.type == "MESH", "BND_WorldLimitがMeshではありません")
    require(boundary.get("hs_id") == "world-limit", "world-limit hs_idが不正です")
    require(
        boundary.get("hs_role") == "world_boundary",
        "world-limit hs_roleが不正です",
    )
    require(not boundary.modifiers, "BND_WorldLimitにModifierがあります")
    require(
        len(boundary.data.materials) == 0,
        "BND_WorldLimitへMaterialが設定されています",
    )
    require(
        len(boundary.data.vertices) == 8
        and len(boundary.data.polygons) == 6
        and len(boundary.data.edges) == 12,
        "BND_WorldLimitが8頂点・6面・12辺の直方体ではありません",
    )
    edge_use = Counter(
        tuple(sorted((polygon.vertices[index], polygon.vertices[(index + 1) % len(polygon.vertices)])))
        for polygon in boundary.data.polygons
        for index in range(len(polygon.vertices))
    )
    require(
        set(edge_use.values()) == {2},
        "BND_WorldLimitが閉鎖Meshではありません",
    )
    minimum, maximum = world_bounds(boundary)
    require(
        close_tuple(minimum, WORLD_BOUNDARY_MINIMUM)
        and close_tuple(maximum, WORLD_BOUNDARY_MAXIMUM),
        f"BND_WorldLimitのmin/maxが不正です: {minimum}/{maximum}",
    )
    for vertex in boundary.data.vertices:
        world = boundary.matrix_world @ vertex.co
        require(
            all(
                math.isclose(world[axis], minimum[axis], abs_tol=TOLERANCE)
                or math.isclose(world[axis], maximum[axis], abs_tol=TOLERANCE)
                for axis in range(3)
            ),
            f"BND_WorldLimitに軸平行面上ではない頂点があります: {tuple(world)}",
        )
    stage = bpy.data.objects.get("BND_Stage")
    require(stage is not None and stage.type == "MESH", "BND_Stageがありません")
    stage_minimum, stage_maximum = world_bounds(stage)
    require(
        all(
            minimum[axis] <= stage_minimum[axis] + TOLERANCE
            and maximum[axis] >= stage_maximum[axis] - TOLERANCE
            for axis in range(3)
        ),
        "BND_WorldLimitがBND_Stageを内包していません",
    )
    return {
        "minimum": minimum,
        "maximum": maximum,
        "vertices": len(boundary.data.vertices),
        "polygons": len(boundary.data.polygons),
    }


def audit_glb() -> dict[str, object]:
    document = read_glb(GLB_PATH)
    gltf = document.json_data
    nodes = [
        node
        for node in gltf.get("nodes", [])
        if node.get("name") == "BND_WorldLimit"
    ]
    require(len(nodes) == 1, "GLBのBND_WorldLimitがちょうど1件ではありません")
    node = nodes[0]
    require(
        node.get("extras")
        == {"hs_id": "world-limit", "hs_role": "world_boundary"},
        f"GLB world-limit extrasが不正です: {node.get('extras')}",
    )
    mesh_index = node.get("mesh")
    meshes = gltf.get("meshes", [])
    require(
        isinstance(mesh_index, int) and 0 <= mesh_index < len(meshes),
        "GLB world-limit Mesh参照が不正です",
    )
    primitives = meshes[mesh_index].get("primitives", [])
    require(len(primitives) == 1, "GLB world-limit Primitiveが1件ではありません")
    position_index = primitives[0].get("attributes", {}).get("POSITION")
    accessors = gltf.get("accessors", [])
    require(
        isinstance(position_index, int) and 0 <= position_index < len(accessors),
        "GLB world-limit POSITION参照が不正です",
    )
    position = accessors[position_index]
    require(
        close_tuple(tuple(position.get("min", ())), (-23.8, -0.6, -56.7))
        and close_tuple(tuple(position.get("max", ())), (68.6, 24.0, 19.7)),
        f"GLB world-limit min/maxが不正です: {position}",
    )
    names = {node.get("name") for node in gltf.get("nodes", [])}
    require(
        {"VIS_B04_Sidewalk", "VIS_B04_Road", "BND_WorldLimit"} <= names,
        "GLBにB04表示または境界Nodeがありません",
    )
    return {
        "bytes": GLB_PATH.stat().st_size,
        "sha256": sha256(GLB_PATH),
        "world_boundary_position_count": position.get("count"),
    }


def audit_forbidden_outer_assets() -> None:
    forbidden = sorted(
        obj.name
        for obj in bpy.data.objects
        if obj.name.startswith(
            (
                "NAV_B04",
                "NAV_BitFlight_Outer",
                "LNK_b04",
                "VOL_B04",
                "MRK_B04",
                "COL_B04",
            )
        )
    )
    require(not forbidden, f"外周経路・Collider・Volumeが混入しています: {forbidden}")


def main() -> None:
    require(
        Path(bpy.data.filepath).resolve() == BLEND_PATH.resolve(),
        "監査対象.blendが不正です",
    )
    surface_results = {
        name: audit_surface_object(name, spec)
        for name, spec in EXPECTED_OBJECTS.items()
    }
    boundary_result = audit_world_boundary()
    audit_forbidden_outer_assets()
    navmesh_results = {}
    for label, (path, expected_bytes, expected_hash) in NAVMESH_PATHS.items():
        actual_hash = sha256(path)
        require(
            path.stat().st_size == expected_bytes and actual_hash == expected_hash,
            f"{label} NavMeshのbytesまたはSHA-256が変化しています",
        )
        navmesh_results[label] = {
            "bytes": path.stat().st_size,
            "sha256": actual_hash,
        }
    result = {
        "blend": {
            "bytes": BLEND_PATH.stat().st_size,
            "sha256": sha256(BLEND_PATH),
        },
        "glb": audit_glb(),
        "surfaces": surface_results,
        "world_boundary": boundary_result,
        "navmeshes": navmesh_results,
        "outer_bit_routes": 0,
        "outer_spawns": 0,
    }
    print("B04_SCHOOL_WORLD_BOUNDARY_AUDIT=" + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
