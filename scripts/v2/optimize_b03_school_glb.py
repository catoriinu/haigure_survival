from __future__ import annotations

import argparse
import hashlib
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any


GLB_MAGIC = b"glTF"
GLB_VERSION = 2
JSON_CHUNK_TYPE = 0x4E4F534A
BIN_CHUNK_TYPE = 0x004E4942
COMPONENT_BYTE_SIZES = {
    5120: 1,
    5121: 1,
    5122: 2,
    5123: 2,
    5125: 4,
    5126: 4,
}
TYPE_COMPONENT_COUNTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
}


@dataclass(frozen=True)
class GlbDocument:
    json_data: dict[str, Any]
    binary_data: bytes


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def read_glb(path: Path) -> GlbDocument:
    data = path.read_bytes()
    if len(data) < 20:
        raise RuntimeError(f"GLBが短すぎます: {path}")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != GLB_MAGIC or version != GLB_VERSION or declared_length != len(data):
        raise RuntimeError(f"GLBヘッダーが不正です: {path}")

    json_data: dict[str, Any] | None = None
    binary_data: bytes | None = None
    offset = 12
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == JSON_CHUNK_TYPE:
            if json_data is not None:
                raise RuntimeError("GLBにJSON chunkが複数あります")
            json_data = json.loads(chunk.decode("utf-8"))
        elif chunk_type == BIN_CHUNK_TYPE:
            if binary_data is not None:
                raise RuntimeError("GLBにBIN chunkが複数あります")
            binary_data = chunk
        else:
            raise RuntimeError(f"未対応のGLB chunkです: {chunk_type}")
    if json_data is None or binary_data is None:
        raise RuntimeError("GLBのJSONまたはBIN chunkがありません")
    return GlbDocument(json_data=json_data, binary_data=binary_data)


def material_uses_texture(material: dict[str, Any]) -> bool:
    def contains_texture(value: Any) -> bool:
        if isinstance(value, dict):
            for key, child in value.items():
                if key.endswith("Texture") and isinstance(child, dict) and "index" in child:
                    return True
                if contains_texture(child):
                    return True
        elif isinstance(value, list):
            return any(contains_texture(child) for child in value)
        return False

    return contains_texture(material)


def strip_unused_attributes(gltf: dict[str, Any]) -> dict[str, int]:
    meshes = gltf.get("meshes", [])
    materials = gltf.get("materials", [])
    mesh_node_names: dict[int, list[str]] = {}
    for node in gltf.get("nodes", []):
        mesh_index = node.get("mesh")
        if mesh_index is not None:
            mesh_node_names.setdefault(mesh_index, []).append(node.get("name", ""))

    removed_normals = 0
    removed_texcoords = 0
    for mesh_index, mesh in enumerate(meshes):
        node_names = mesh_node_names.get(mesh_index, [])
        normals_are_runtime_unused = bool(node_names) and all(
            name.startswith(("NAV_", "VOL_", "BND_", "PRT_"))
            for name in node_names
        )
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            if normals_are_runtime_unused and "NORMAL" in attributes:
                attributes.pop("NORMAL")
                removed_normals += 1
            material_index = primitive.get("material")
            uses_texture = (
                material_index is not None
                and material_uses_texture(materials[material_index])
            )
            if not uses_texture:
                for semantic in tuple(attributes):
                    if semantic.startswith("TEXCOORD_"):
                        attributes.pop(semantic)
                        removed_texcoords += 1
    return {
        "removed_normal_attributes": removed_normals,
        "removed_texcoord_attributes": removed_texcoords,
    }


def accessor_element_size(accessor: dict[str, Any]) -> int:
    component_type = accessor.get("componentType")
    accessor_type = accessor.get("type")
    if component_type not in COMPONENT_BYTE_SIZES:
        raise RuntimeError(f"未対応のAccessor componentTypeです: {component_type}")
    if accessor_type not in TYPE_COMPONENT_COUNTS:
        raise RuntimeError(f"未対応のAccessor typeです: {accessor_type}")
    return COMPONENT_BYTE_SIZES[component_type] * TYPE_COMPONENT_COUNTS[accessor_type]


def accessor_payload(
    accessor: dict[str, Any], buffer_views: list[dict[str, Any]], binary_data: bytes
) -> tuple[bytes, int | None]:
    if "sparse" in accessor:
        raise RuntimeError("Sparse Accessorは最適化対象外です")
    view_index = accessor.get("bufferView")
    if view_index is None:
        raise RuntimeError("bufferViewを持たないAccessorは最適化対象外です")
    view = buffer_views[view_index]
    if view.get("buffer", 0) != 0:
        raise RuntimeError("複数bufferのGLBは最適化対象外です")

    element_size = accessor_element_size(accessor)
    stride = view.get("byteStride", element_size)
    if stride < element_size:
        raise RuntimeError(f"AccessorのbyteStrideが不正です: {stride} < {element_size}")
    count = accessor.get("count", 0)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    end = start + (count - 1) * stride + element_size if count else start
    view_end = view.get("byteOffset", 0) + view.get("byteLength", 0)
    if start < 0 or end > view_end or end > len(binary_data):
        raise RuntimeError("AccessorがbufferView範囲外を参照しています")
    if stride == element_size:
        payload = binary_data[start:end]
    else:
        payload = b"".join(
            binary_data[start + index * stride : start + index * stride + element_size]
            for index in range(count)
        )
    return payload, view.get("target")


def collect_used_accessor_indices(gltf: dict[str, Any]) -> set[int]:
    used: set[int] = set()
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            used.update(primitive.get("attributes", {}).values())
            if "indices" in primitive:
                used.add(primitive["indices"])
            for target in primitive.get("targets", []):
                used.update(target.values())
    for skin in gltf.get("skins", []):
        if "inverseBindMatrices" in skin:
            used.add(skin["inverseBindMatrices"])
    for animation in gltf.get("animations", []):
        for sampler in animation.get("samplers", []):
            used.add(sampler["input"])
            used.add(sampler["output"])
    return used


def remap_accessor_references(gltf: dict[str, Any], remap: dict[int, int]) -> None:
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitive["attributes"] = {
                semantic: remap[index]
                for semantic, index in primitive.get("attributes", {}).items()
            }
            if "indices" in primitive:
                primitive["indices"] = remap[primitive["indices"]]
            for target in primitive.get("targets", []):
                for semantic, index in tuple(target.items()):
                    target[semantic] = remap[index]
    for skin in gltf.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = remap[skin["inverseBindMatrices"]]
    for animation in gltf.get("animations", []):
        for sampler in animation.get("samplers", []):
            sampler["input"] = remap[sampler["input"]]
            sampler["output"] = remap[sampler["output"]]


def rebuild_and_deduplicate_accessors(
    gltf: dict[str, Any], binary_data: bytes
) -> tuple[bytes, dict[str, int]]:
    accessors = gltf.get("accessors", [])
    buffer_views = gltf.get("bufferViews", [])
    used_indices = sorted(collect_used_accessor_indices(gltf))
    remap: dict[int, int] = {}
    canonical_to_new: dict[tuple[str, int | None, bytes], int] = {}
    new_accessors: list[dict[str, Any]] = []
    new_buffer_views: list[dict[str, Any]] = []
    new_binary = bytearray()

    for old_index in used_indices:
        accessor = accessors[old_index]
        payload, target = accessor_payload(accessor, buffer_views, binary_data)
        metadata = {
            key: value
            for key, value in accessor.items()
            if key not in {"bufferView", "byteOffset", "name"}
        }
        metadata_json = json.dumps(
            metadata, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        canonical_key = (metadata_json, target, payload)
        existing_index = canonical_to_new.get(canonical_key)
        if existing_index is not None:
            remap[old_index] = existing_index
            continue

        while len(new_binary) % 4:
            new_binary.append(0)
        byte_offset = len(new_binary)
        new_binary.extend(payload)
        view: dict[str, Any] = {
            "buffer": 0,
            "byteOffset": byte_offset,
            "byteLength": len(payload),
        }
        if target is not None:
            view["target"] = target
        new_view_index = len(new_buffer_views)
        new_buffer_views.append(view)
        new_accessor = dict(metadata)
        new_accessor["bufferView"] = new_view_index
        new_index = len(new_accessors)
        new_accessors.append(new_accessor)
        canonical_to_new[canonical_key] = new_index
        remap[old_index] = new_index

    image_view_remap: dict[int, int] = {}
    for old_view_index in sorted(
        {
            image["bufferView"]
            for image in gltf.get("images", [])
            if "bufferView" in image
        }
    ):
        view = buffer_views[old_view_index]
        if view.get("buffer", 0) != 0:
            raise RuntimeError("複数bufferの埋め込みImageは最適化対象外です")
        start = view.get("byteOffset", 0)
        end = start + view.get("byteLength", 0)
        if start < 0 or end > len(binary_data):
            raise RuntimeError("埋め込みImageのbufferViewが範囲外です")
        while len(new_binary) % 4:
            new_binary.append(0)
        new_view_index = len(new_buffer_views)
        new_buffer_views.append(
            {
                "buffer": 0,
                "byteOffset": len(new_binary),
                "byteLength": end - start,
            }
        )
        new_binary.extend(binary_data[start:end])
        image_view_remap[old_view_index] = new_view_index

    for image in gltf.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = image_view_remap[image["bufferView"]]

    remap_accessor_references(gltf, remap)
    gltf["accessors"] = new_accessors
    gltf["bufferViews"] = new_buffer_views
    gltf["buffers"] = [{"byteLength": len(new_binary)}]
    return bytes(new_binary), {
        "source_accessors": len(accessors),
        "used_accessors": len(used_indices),
        "optimized_accessors": len(new_accessors),
        "deduplicated_accessors": len(used_indices) - len(new_accessors),
        "source_buffer_views": len(buffer_views),
        "optimized_buffer_views": len(new_buffer_views),
        "preserved_image_buffer_views": len(image_view_remap),
    }


def encode_glb(gltf: dict[str, Any], binary_data: bytes) -> bytes:
    json_data = json.dumps(
        gltf, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    json_padding = (-len(json_data)) % 4
    binary_padding = (-len(binary_data)) % 4
    json_chunk = json_data + b" " * json_padding
    binary_chunk = binary_data + b"\0" * binary_padding
    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary_chunk)
    return b"".join(
        (
            struct.pack("<4sII", GLB_MAGIC, GLB_VERSION, total_length),
            struct.pack("<II", len(json_chunk), JSON_CHUNK_TYPE),
            json_chunk,
            struct.pack("<II", len(binary_chunk), BIN_CHUNK_TYPE),
            binary_chunk,
        )
    )


def optimize_glb(path: Path) -> dict[str, int | str]:
    source_bytes = path.read_bytes()
    document = read_glb(path)
    gltf = document.json_data
    if gltf.get("animations") or gltf.get("skins"):
        raise RuntimeError("B03学校GLBにAnimationまたはSkinがあるため最適化できません")

    attribute_stats = strip_unused_attributes(gltf)
    optimized_binary, accessor_stats = rebuild_and_deduplicate_accessors(
        gltf, document.binary_data
    )
    optimized_bytes = encode_glb(gltf, optimized_binary)
    if optimized_bytes != source_bytes:
        path.write_bytes(optimized_bytes)
    return {
        "source_bytes": len(source_bytes),
        "optimized_bytes": len(optimized_bytes),
        "saved_bytes": len(source_bytes) - len(optimized_bytes),
        "sha256": sha256_bytes(optimized_bytes),
        **attribute_stats,
        **accessor_stats,
    }


def main() -> None:
    repository_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "path",
        nargs="?",
        type=Path,
        default=repository_root / "public/stage-assets/v2/B02/b02_school_blockout.glb",
    )
    args = parser.parse_args()
    print(
        "B03_GLB_OPTIMIZE_RESULT="
        + json.dumps(optimize_glb(args.path.resolve()), ensure_ascii=False, sort_keys=True)
    )


if __name__ == "__main__":
    main()
