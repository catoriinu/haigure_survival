from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


sys.dont_write_bytecode = True

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
)
GLB_PATH = (
    REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
)
EXPORT_COLLECTION_NAME = "EXP_Stage_school"
COORDINATE_TOLERANCE = 1.0e-5
AREA_TOLERANCE = 1.0e-10
MAX_REPORTED_GROUPS = 40
MAX_REPORTED_GROUP_MEMBERS = 8
EXPECTED_PACKED_ATLAS_PATHS = {
    image_name: REPOSITORY_ROOT / "assets/textures/v2/B03" / image_name
    for image_name in (
        "b03_architecture_atlas.png",
        "b03_furniture_props_atlas.png",
        "b03_signs_paper_atlas.png",
    )
}

GLB_MAGIC = b"glTF"
GLB_VERSION = 2
JSON_CHUNK_TYPE = 0x4E4F534A


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def quantize(value: float) -> int:
    return round(value / COORDINATE_TOLERANCE)


def quantized_vector(vector: Vector) -> tuple[int, int, int]:
    return (quantize(vector.x), quantize(vector.y), quantize(vector.z))


def read_glb_json(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    require(len(data) >= 20, "GLBが短すぎます")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    require(magic == GLB_MAGIC, "GLB magicが不正です")
    require(version == GLB_VERSION, "GLB versionが不正です")
    require(declared_length == len(data), "GLB全長が不正です")
    offset = 12
    document: dict[str, Any] | None = None
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == JSON_CHUNK_TYPE:
            require(document is None, "GLBにJSON chunkが複数あります")
            document = json.loads(chunk.decode("utf-8"))
    require(document is not None, "GLBにJSON chunkがありません")
    return document


def recursively_reachable_nodes(
    nodes: list[dict[str, Any]], scenes: list[dict[str, Any]]
) -> set[int]:
    reachable: set[int] = set()
    pending = [
        node_index
        for scene in scenes
        for node_index in scene.get("nodes", [])
    ]
    while pending:
        node_index = pending.pop()
        if node_index in reachable:
            continue
        require(0 <= node_index < len(nodes), "GLB scene node参照が不正です")
        reachable.add(node_index)
        pending.extend(nodes[node_index].get("children", []))
    return reachable


def used_glb_indices(
    document: dict[str, Any],
) -> dict[str, set[int]]:
    nodes = document.get("nodes", [])
    meshes = document.get("meshes", [])
    accessors = document.get("accessors", [])
    buffer_views = document.get("bufferViews", [])
    materials = document.get("materials", [])
    textures = document.get("textures", [])
    reachable_nodes = recursively_reachable_nodes(
        nodes,
        document.get("scenes", []),
    )
    used_meshes = {
        nodes[index]["mesh"]
        for index in reachable_nodes
        if "mesh" in nodes[index]
    }
    used_skins = {
        nodes[index]["skin"]
        for index in reachable_nodes
        if "skin" in nodes[index]
    }
    used_materials = {
        primitive["material"]
        for mesh_index in used_meshes
        for primitive in meshes[mesh_index].get("primitives", [])
        if "material" in primitive
    }

    def collect_texture_indices(value: Any) -> set[int]:
        result: set[int] = set()
        if isinstance(value, dict):
            for key, child in value.items():
                if (
                    key.endswith("Texture")
                    and isinstance(child, dict)
                    and isinstance(child.get("index"), int)
                ):
                    result.add(child["index"])
                result.update(collect_texture_indices(child))
        elif isinstance(value, list):
            for child in value:
                result.update(collect_texture_indices(child))
        return result

    used_textures: set[int] = set()
    for material_index in used_materials:
        used_textures.update(collect_texture_indices(materials[material_index]))
    used_images = {
        textures[index]["source"]
        for index in used_textures
        if "source" in textures[index]
    }
    used_samplers = {
        textures[index]["sampler"]
        for index in used_textures
        if "sampler" in textures[index]
    }
    used_accessors: set[int] = set()
    for mesh_index in used_meshes:
        for primitive in meshes[mesh_index].get("primitives", []):
            used_accessors.update(primitive.get("attributes", {}).values())
            if "indices" in primitive:
                used_accessors.add(primitive["indices"])
            for target in primitive.get("targets", []):
                used_accessors.update(target.values())
    for skin_index in used_skins:
        skin = document["skins"][skin_index]
        if "inverseBindMatrices" in skin:
            used_accessors.add(skin["inverseBindMatrices"])
    for animation in document.get("animations", []):
        for sampler in animation.get("samplers", []):
            used_accessors.add(sampler["input"])
            used_accessors.add(sampler["output"])

    used_buffer_views: set[int] = set()
    for accessor_index in used_accessors:
        accessor = accessors[accessor_index]
        if "bufferView" in accessor:
            used_buffer_views.add(accessor["bufferView"])
        sparse = accessor.get("sparse")
        if sparse is not None:
            used_buffer_views.add(sparse["indices"]["bufferView"])
            used_buffer_views.add(sparse["values"]["bufferView"])
    for image_index in used_images:
        image = document["images"][image_index]
        if "bufferView" in image:
            used_buffer_views.add(image["bufferView"])
    used_buffers = {
        buffer_views[index]["buffer"]
        for index in used_buffer_views
    }
    return {
        "reachable_nodes": reachable_nodes,
        "meshes": used_meshes,
        "skins": used_skins,
        "materials": used_materials,
        "textures": used_textures,
        "images": used_images,
        "samplers": used_samplers,
        "accessors": used_accessors,
        "buffer_views": used_buffer_views,
        "buffers": used_buffers,
    }


class DisjointSet:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, index: int) -> int:
        parent = self.parent[index]
        if parent != index:
            self.parent[index] = self.find(parent)
        return self.parent[index]

    def union(self, left: int, right: int) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root == right_root:
            return
        if self.rank[left_root] < self.rank[right_root]:
            left_root, right_root = right_root, left_root
        self.parent[right_root] = left_root
        if self.rank[left_root] == self.rank[right_root]:
            self.rank[left_root] += 1


def component_aabb_signatures(
    obj: bpy.types.Object,
) -> list[tuple[tuple[int, ...], dict[str, Any]]]:
    mesh = obj.data
    if not mesh.vertices or not mesh.polygons:
        return []
    disjoint = DisjointSet(len(mesh.vertices))
    for polygon in mesh.polygons:
        vertices = tuple(polygon.vertices)
        for index in vertices[1:]:
            disjoint.union(vertices[0], index)
    polygons_by_root: dict[int, list[int]] = defaultdict(list)
    vertices_by_root: dict[int, set[int]] = defaultdict(set)
    for polygon in mesh.polygons:
        root = disjoint.find(polygon.vertices[0])
        polygons_by_root[root].append(polygon.index)
        vertices_by_root[root].update(polygon.vertices)

    result: list[tuple[tuple[int, ...], dict[str, Any]]] = []
    for component_index, root in enumerate(sorted(polygons_by_root)):
        points = [
            obj.matrix_world @ mesh.vertices[index].co
            for index in sorted(vertices_by_root[root])
        ]
        minimum = tuple(min(point[axis] for point in points) for axis in range(3))
        maximum = tuple(max(point[axis] for point in points) for axis in range(3))
        signature = tuple(quantize(value) for value in (*minimum, *maximum))
        result.append(
            (
                signature,
                {
                    "object": obj.name,
                    "component": component_index,
                    "polygons": len(polygons_by_root[root]),
                    "minimum": [round(value, 6) for value in minimum],
                    "maximum": [round(value, 6) for value in maximum],
                },
            )
        )
    return result


def object_geometry_signature(obj: bpy.types.Object) -> str:
    mesh = obj.data
    digest = hashlib.sha256()
    world_points = [
        quantized_vector(obj.matrix_world @ vertex.co)
        for vertex in mesh.vertices
    ]
    for point in sorted(world_points):
        digest.update(struct.pack("<qqq", *point))
    face_signatures = []
    for polygon in mesh.polygons:
        face_signatures.append(
            tuple(sorted(world_points[index] for index in polygon.vertices))
        )
    for signature in sorted(face_signatures):
        digest.update(struct.pack("<I", len(signature)))
        for point in signature:
            digest.update(struct.pack("<qqq", *point))
    return digest.hexdigest().upper()


def axis_aligned_rectangle(
    obj: bpy.types.Object,
    polygon: bpy.types.MeshPolygon,
) -> dict[str, Any] | None:
    if len(polygon.vertices) != 4:
        return None
    normal = obj.matrix_world.to_3x3() @ polygon.normal
    if normal.length_squared == 0:
        return None
    normal.normalize()
    axis = max(range(3), key=lambda index: abs(normal[index]))
    if abs(normal[axis]) < 1.0 - 1.0e-6:
        return None
    other_axes = [index for index in range(3) if index != axis]
    points = [
        obj.matrix_world @ obj.data.vertices[index].co
        for index in polygon.vertices
    ]
    plane_values = [point[axis] for point in points]
    if max(plane_values) - min(plane_values) > COORDINATE_TOLERANCE:
        return None
    u_values = [point[other_axes[0]] for point in points]
    v_values = [point[other_axes[1]] for point in points]
    u0, u1 = min(u_values), max(u_values)
    v0, v1 = min(v_values), max(v_values)
    if (u1 - u0) * (v1 - v0) <= AREA_TOLERANCE:
        return None
    corners = {
        (quantize(point[other_axes[0]]), quantize(point[other_axes[1]]))
        for point in points
    }
    expected = {
        (quantize(u0), quantize(v0)),
        (quantize(u0), quantize(v1)),
        (quantize(u1), quantize(v0)),
        (quantize(u1), quantize(v1)),
    }
    if corners != expected:
        return None
    return {
        "axis": axis,
        "plane": sum(plane_values) / len(plane_values),
        "u0": u0,
        "u1": u1,
        "v0": v0,
        "v1": v1,
        "normal_sign": 1 if normal[axis] >= 0 else -1,
        "object": obj.name,
        "polygon": polygon.index,
    }


def coincident_rectangle_overlaps(
    rectangles: list[dict[str, Any]],
) -> tuple[int, float, list[dict[str, Any]]]:
    by_plane: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for rectangle in rectangles:
        by_plane[
            (rectangle["axis"], quantize(rectangle["plane"]))
        ].append(rectangle)

    count = 0
    total_area = 0.0
    largest: list[dict[str, Any]] = []
    for items in by_plane.values():
        items.sort(key=lambda item: (item["u0"], item["v0"], item["u1"], item["v1"]))
        for left_index, left in enumerate(items):
            for right in items[left_index + 1 :]:
                if right["u0"] >= left["u1"] - COORDINATE_TOLERANCE:
                    break
                u_overlap = min(left["u1"], right["u1"]) - max(
                    left["u0"], right["u0"]
                )
                v_overlap = min(left["v1"], right["v1"]) - max(
                    left["v0"], right["v0"]
                )
                if (
                    u_overlap <= COORDINATE_TOLERANCE
                    or v_overlap <= COORDINATE_TOLERANCE
                ):
                    continue
                area = u_overlap * v_overlap
                count += 1
                total_area += area
                largest.append(
                    {
                        "area": round(area, 6),
                        "orientation": (
                            "same"
                            if left["normal_sign"] == right["normal_sign"]
                            else "opposite"
                        ),
                        "left": {
                            "object": left["object"],
                            "polygon": left["polygon"],
                        },
                        "right": {
                            "object": right["object"],
                            "polygon": right["polygon"],
                        },
                    }
                )
    largest.sort(key=lambda item: item["area"], reverse=True)
    return count, total_area, largest[:MAX_REPORTED_GROUPS]


def audit_scene() -> dict[str, Any]:
    require(Path(bpy.data.filepath).resolve() == BLEND_PATH.resolve(), "監査対象.blendが不正です")
    export_collection = bpy.data.collections.get(EXPORT_COLLECTION_NAME)
    require(export_collection is not None, "Export Collectionがありません")
    export_objects = list(export_collection.all_objects)
    export_names = {obj.name for obj in export_objects}

    object_type_counts = Counter(obj.type for obj in bpy.data.objects)
    unexpected_empty_objects = sorted(
        obj.name
        for obj in bpy.data.objects
        if obj.type == "EMPTY"
        and not obj.name.startswith(("LNK_", "META_", "MRK_"))
    )
    hidden_objects = [
        {
            "name": obj.name,
            "type": obj.type,
            "hide_render": obj.hide_render,
            "hide_viewport": obj.hide_viewport,
            "hide_get": obj.hide_get(),
        }
        for obj in bpy.data.objects
        if obj.hide_render or obj.hide_viewport or obj.hide_get()
    ]
    outside_export = sorted(
        obj.name for obj in bpy.data.objects if obj.name not in export_names
    )
    multi_linked_export = sorted(
        obj.name for obj in export_objects if len(obj.users_collection) != 1
    )

    zero_user_datablocks: dict[str, list[str]] = {}
    datablock_groups = {
        "meshes": bpy.data.meshes,
        "materials": bpy.data.materials,
        "images": bpy.data.images,
        "textures": bpy.data.textures,
        "curves": bpy.data.curves,
        "cameras": bpy.data.cameras,
        "lights": bpy.data.lights,
        "armatures": bpy.data.armatures,
        "actions": bpy.data.actions,
        "node_groups": bpy.data.node_groups,
    }
    for name, datablocks in datablock_groups.items():
        zero_user_datablocks[name] = sorted(
            datablock.name for datablock in datablocks if datablock.users == 0
        )

    mesh_issues = {
        "zero_vertices": [],
        "zero_polygons": [],
        "degenerate_polygons": [],
        "modifiers": [],
        "shape_keys": [],
        "vertex_groups": [],
        "animation_data": [],
        "non_finite_vertices": [],
    }
    geometry_signature_groups: dict[str, list[str]] = defaultdict(list)
    component_signature_groups: dict[
        tuple[int, ...], list[dict[str, Any]]
    ] = defaultdict(list)
    visual_rectangles: list[dict[str, Any]] = []
    visual_triangles = 0
    prefix_triangles: Counter[str] = Counter()

    for obj in export_objects:
        if obj.animation_data is not None:
            mesh_issues["animation_data"].append(obj.name)
        if obj.type != "MESH":
            continue
        mesh = obj.data
        if not mesh.vertices:
            mesh_issues["zero_vertices"].append(obj.name)
        if not mesh.polygons:
            mesh_issues["zero_polygons"].append(obj.name)
        degenerate = [
            polygon.index
            for polygon in mesh.polygons
            if polygon.area <= AREA_TOLERANCE
        ]
        if degenerate:
            mesh_issues["degenerate_polygons"].append(
                {"name": obj.name, "polygons": degenerate[:20]}
            )
        if obj.modifiers:
            mesh_issues["modifiers"].append(
                {
                    "name": obj.name,
                    "modifiers": [
                        {"name": modifier.name, "type": modifier.type}
                        for modifier in obj.modifiers
                    ],
                }
            )
        if mesh.shape_keys is not None:
            mesh_issues["shape_keys"].append(obj.name)
        if obj.vertex_groups:
            mesh_issues["vertex_groups"].append(obj.name)
        non_finite = [
            vertex.index
            for vertex in mesh.vertices
            if not all(math.isfinite(value) for value in vertex.co)
        ]
        if non_finite:
            mesh_issues["non_finite_vertices"].append(
                {"name": obj.name, "vertices": non_finite[:20]}
            )

        geometry_signature_groups[object_geometry_signature(obj)].append(obj.name)
        for signature, component in component_aabb_signatures(obj):
            component_signature_groups[signature].append(component)

        mesh.calc_loop_triangles()
        triangle_count = len(mesh.loop_triangles)
        prefix = obj.name.split("_", 1)[0]
        prefix_triangles[prefix] += triangle_count
        if obj.name.startswith("VIS_"):
            visual_triangles += triangle_count
            for polygon in mesh.polygons:
                rectangle = axis_aligned_rectangle(obj, polygon)
                if rectangle is not None:
                    visual_rectangles.append(rectangle)

    duplicate_geometry_groups = [
        sorted(names)
        for names in geometry_signature_groups.values()
        if len(names) > 1
    ]
    duplicate_component_aabbs = [
        components
        for components in component_signature_groups.values()
        if len(components) > 1
    ]
    duplicate_component_aabbs.sort(
        key=lambda components: (
            -len(components),
            components[0]["object"],
            components[0]["component"],
        )
    )
    rectangle_overlap_count, rectangle_overlap_area, largest_overlaps = (
        coincident_rectangle_overlaps(visual_rectangles)
    )

    armatures = [
        {
            "name": armature.name,
            "users": armature.users,
            "bones": len(armature.bones),
        }
        for armature in bpy.data.armatures
    ]
    packed_atlases = {}
    for image_name, expected_path in EXPECTED_PACKED_ATLAS_PATHS.items():
        image = bpy.data.images.get(image_name)
        require(image is not None, f"Atlas Imageがありません: {image_name}")
        require(image.packed_file is not None, f"Atlasがpackされていません: {image_name}")
        require(
            image.filepath.startswith("//"),
            f"Atlas filepathがリポジトリ相対ではありません: {image_name}",
        )
        require(
            image.filepath_raw.startswith("//"),
            f"Atlas filepath_rawがリポジトリ相対ではありません: {image_name}",
        )
        require(
            Path(bpy.path.abspath(image.filepath)).resolve()
            == expected_path.resolve(),
            f"Atlas filepathの参照先が不正です: {image_name}",
        )
        require(
            Path(bpy.path.abspath(image.filepath_raw)).resolve()
            == expected_path.resolve(),
            f"Atlas filepath_rawの参照先が不正です: {image_name}",
        )
        packed_atlases[image_name] = image.filepath
    return {
        "blend": {
            "bytes": BLEND_PATH.stat().st_size,
            "sha256": sha256(BLEND_PATH),
            "objects": len(bpy.data.objects),
            "export_objects": len(export_objects),
            "meshes": len(bpy.data.meshes),
            "materials": len(bpy.data.materials),
            "images": len(bpy.data.images),
            "textures": len(bpy.data.textures),
            "object_types": dict(sorted(object_type_counts.items())),
        },
        "authoring_residue": {
            "outside_export": outside_export,
            "multi_linked_export": multi_linked_export,
            "hidden_objects": hidden_objects,
            "zero_user_datablocks": zero_user_datablocks,
            "armatures": armatures,
            "bones": sum(item["bones"] for item in armatures),
            "actions": sorted(action.name for action in bpy.data.actions),
            "unexpected_empty_objects": unexpected_empty_objects,
            "packed_atlases": packed_atlases,
        },
        "mesh_issues": mesh_issues,
        "geometry": {
            "prefix_triangles": dict(sorted(prefix_triangles.items())),
            "visual_triangles": visual_triangles,
            "duplicate_world_geometry_groups": duplicate_geometry_groups[
                :MAX_REPORTED_GROUPS
            ],
            "duplicate_component_aabb_group_count": len(
                duplicate_component_aabbs
            ),
            "duplicate_component_aabb_groups": [
                {
                    "member_count": len(group),
                    "members": group[:MAX_REPORTED_GROUP_MEMBERS],
                }
                for group in duplicate_component_aabbs[:MAX_REPORTED_GROUPS]
            ],
            "axis_aligned_visual_rectangles": len(visual_rectangles),
            "coincident_rectangle_overlap_count": rectangle_overlap_count,
            "coincident_rectangle_overlap_area": round(
                rectangle_overlap_area,
                6,
            ),
            "largest_coincident_rectangle_overlaps": largest_overlaps,
        },
    }


def audit_glb() -> dict[str, Any]:
    document = read_glb_json(GLB_PATH)
    used = used_glb_indices(document)
    counts = {
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
        "images": len(document.get("images", [])),
        "samplers": len(document.get("samplers", [])),
        "skins": len(document.get("skins", [])),
        "animations": len(document.get("animations", [])),
        "cameras": len(document.get("cameras", [])),
        "accessors": len(document.get("accessors", [])),
        "buffer_views": len(document.get("bufferViews", [])),
        "buffers": len(document.get("buffers", [])),
    }
    unused = {}
    for key in (
        "meshes",
        "materials",
        "textures",
        "images",
        "samplers",
        "accessors",
        "buffer_views",
        "buffers",
    ):
        unused[key] = sorted(set(range(counts[key])) - used[key])
    unused["nodes"] = sorted(
        set(range(counts["nodes"])) - used["reachable_nodes"]
    )
    return {
        "bytes": GLB_PATH.stat().st_size,
        "sha256": sha256(GLB_PATH),
        "counts": counts,
        "unused_indices": unused,
        "extensions_used": document.get("extensionsUsed", []),
        "extensions_required": document.get("extensionsRequired", []),
    }


def main() -> None:
    scene = audit_scene()
    glb = audit_glb()
    residue = scene["authoring_residue"]
    mesh_issues = scene["mesh_issues"]
    require(
        set(scene["blend"]["object_types"]) == {"EMPTY", "MESH"},
        "学校正本に許可していないObject種別が残っています",
    )
    require(
        not residue["unexpected_empty_objects"],
        "意味ObjectではないEmptyが残っています",
    )
    require(not residue["outside_export"], "Export Collection外のObjectが残っています")
    require(
        not residue["multi_linked_export"],
        "複数Collectionへ所属するExport Objectが残っています",
    )
    require(not residue["hidden_objects"], "非表示Objectが残っています")
    require(
        all(not names for names in residue["zero_user_datablocks"].values()),
        "ユーザー数0のDatablockが残っています",
    )
    require(not residue["armatures"], "Armatureが残っています")
    require(residue["bones"] == 0, "Boneが残っています")
    require(not residue["actions"], "Actionが残っています")
    require(
        all(not issues for issues in mesh_issues.values()),
        "破損Meshまたは未適用の編集データが残っています",
    )
    require(glb["counts"]["skins"] == 0, "GLBにSkinが残っています")
    require(glb["counts"]["animations"] == 0, "GLBにAnimationが残っています")
    require(glb["counts"]["cameras"] == 0, "GLBにCameraが残っています")
    require(
        all(not indices for indices in glb["unused_indices"].values()),
        "GLBに未参照データが残っています",
    )
    result = {
        "scene": scene,
        "glb": glb,
    }
    print(
        "B03_REFACTOR_AUDIT="
        + json.dumps(result, ensure_ascii=False, sort_keys=True)
    )


if __name__ == "__main__":
    main()
