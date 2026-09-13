from __future__ import annotations

import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path

import bpy


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from build_b03_school_interiors import (  # noqa: E402
    ATLAS_DEFINITIONS,
    atlas_png_bytes,
    swatch_uv,
)
from optimize_b03_school_glb import read_glb  # noqa: E402


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ARCHITECTURE_ATLAS_PATH = (
    REPOSITORY_ROOT / "assets/textures/v2/B03/b03_architecture_atlas.png"
)
SCHOOL_BLEND_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
)
SCHOOL_GLB_PATH = (
    REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
)
ARCHITECTURE_IMAGE_NAME = "b03_architecture_atlas.png"
ARCHITECTURE_MATERIAL_NAME = "MAT_B03_Atlas_Architecture"
ARCHITECTURE_DIMENSIONS = (1024, 512)
ARCHITECTURE_GRID = (8, 4)
ARCHITECTURE_CELL_SIZE = 128
ARCHITECTURE_UV_SAMPLE_SIZE = 32
ARCHITECTURE_SWATCH_COUNT = 20
GLTF_NEAREST = 9728
GLTF_NEAREST_MIPMAP_NEAREST = 9984
GLTF_REPEAT = 10497


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def decode_rgb_png(payload: bytes) -> tuple[int, int, bytes]:
    require(payload.startswith(b"\x89PNG\r\n\x1a\n"), "PNG signatureが不正です")
    cursor = 8
    width = 0
    height = 0
    compressed = bytearray()
    while cursor < len(payload):
        length = struct.unpack_from(">I", payload, cursor)[0]
        chunk_type = payload[cursor + 4 : cursor + 8]
        data_start = cursor + 8
        data_end = data_start + length
        chunk_data = payload[data_start:data_end]
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, compression, filtering, interlace = (
                struct.unpack(">IIBBBBB", chunk_data)
            )
            require(
                (bit_depth, color_type, compression, filtering, interlace)
                == (8, 2, 0, 0, 0),
                "Architecture AtlasのPNG形式が不正です",
            )
        elif chunk_type == b"IDAT":
            compressed.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
        cursor = data_end + 4
    scanlines = zlib.decompress(bytes(compressed))
    stride = width * 3 + 1
    require(len(scanlines) == stride * height, "PNG scanline長が不正です")
    require(
        all(scanlines[row * stride] == 0 for row in range(height)),
        "PNG filterは0である必要があります",
    )
    pixels = b"".join(
        scanlines[row * stride + 1 : (row + 1) * stride]
        for row in range(height)
    )
    return width, height, pixels


def glb_buffer_view_payload(
    json_data: dict[str, object],
    binary_data: bytes,
    buffer_view_index: int,
) -> bytes:
    buffer_views = json_data["bufferViews"]
    require(isinstance(buffer_views, list), "GLB bufferViewsが配列ではありません")
    buffer_view = buffer_views[buffer_view_index]
    require(isinstance(buffer_view, dict), "GLB bufferViewがObjectではありません")
    require(
        buffer_view.get("buffer") == 0,
        "Architecture AtlasのGLB bufferがBIN chunkではありません",
    )
    byte_offset = int(buffer_view.get("byteOffset", 0))
    byte_length = int(buffer_view["byteLength"])
    return binary_data[byte_offset : byte_offset + byte_length]


def audit_architecture_atlas_artifacts(expected_png: bytes) -> dict[str, int | str]:
    require(
        Path(bpy.data.filepath).resolve() == SCHOOL_BLEND_PATH.resolve(),
        "Architecture Atlas監査対象の.blendが不正です",
    )
    require(ARCHITECTURE_ATLAS_PATH.is_file(), "追跡Architecture Atlasがありません")
    tracked_png = ARCHITECTURE_ATLAS_PATH.read_bytes()
    require(
        tracked_png == expected_png,
        "追跡Architecture Atlasが生成器の期待bytesと一致しません",
    )
    tracked_dimensions = decode_rgb_png(tracked_png)[:2]
    require(
        tracked_dimensions == ARCHITECTURE_DIMENSIONS,
        f"追跡Architecture Atlas寸法が不正です: {tracked_dimensions}",
    )

    image = bpy.data.images.get(ARCHITECTURE_IMAGE_NAME)
    require(image is not None, "BlenderにArchitecture Atlas imageがありません")
    require(
        tuple(image.size) == ARCHITECTURE_DIMENSIONS,
        f"Blender Architecture Atlas寸法が不正です: {tuple(image.size)}",
    )
    require(
        image.packed_file is not None,
        "Blender Architecture Atlasがpackされていません",
    )
    packed_png = bytes(image.packed_file.data)
    require(
        packed_png == expected_png,
        "Blender packed Architecture Atlasが生成器の期待bytesと一致しません",
    )
    packed_dimensions = decode_rgb_png(packed_png)[:2]
    require(
        packed_dimensions == ARCHITECTURE_DIMENSIONS,
        f"Blender packed Architecture Atlas寸法が不正です: {packed_dimensions}",
    )

    material = bpy.data.materials.get(ARCHITECTURE_MATERIAL_NAME)
    require(
        material is not None and material.node_tree is not None,
        "Blender Architecture Atlas materialがNode materialではありません",
    )
    image_nodes = [
        node
        for node in material.node_tree.nodes
        if node.type == "TEX_IMAGE" and node.image == image
    ]
    require(
        len(image_nodes) == 1,
        f"Blender Architecture Atlas image node数が不正です: {len(image_nodes)}",
    )
    image_node = image_nodes[0]
    require(
        image_node.interpolation == "Closest",
        f"Blender Architecture Atlas補間がNearestではありません: "
        f"{image_node.interpolation}",
    )
    require(
        image_node.extension == "REPEAT",
        f"Blender Architecture Atlas wrapがREPEATではありません: "
        f"{image_node.extension}",
    )

    document = read_glb(SCHOOL_GLB_PATH)
    json_data = document.json_data
    materials = json_data["materials"]
    require(isinstance(materials, list), "GLB materialsが配列ではありません")
    material_indices = [
        index
        for index, candidate in enumerate(materials)
        if isinstance(candidate, dict)
        and candidate.get("name") == ARCHITECTURE_MATERIAL_NAME
    ]
    require(
        len(material_indices) == 1,
        f"GLB Architecture material数が不正です: {material_indices}",
    )
    glb_material = materials[material_indices[0]]
    pbr = glb_material["pbrMetallicRoughness"]
    require(isinstance(pbr, dict), "GLB Architecture PBR定義が不正です")
    base_color_texture = pbr["baseColorTexture"]
    require(
        isinstance(base_color_texture, dict),
        "GLB Architecture baseColorTextureが不正です",
    )
    texture_index = int(base_color_texture["index"])
    textures = json_data["textures"]
    require(isinstance(textures, list), "GLB texturesが配列ではありません")
    texture = textures[texture_index]
    require(isinstance(texture, dict), "GLB Architecture textureが不正です")

    images = json_data["images"]
    require(isinstance(images, list), "GLB imagesが配列ではありません")
    source_index = int(texture["source"])
    glb_image = images[source_index]
    require(isinstance(glb_image, dict), "GLB Architecture imageが不正です")
    require(
        glb_image.get("mimeType") == "image/png",
        f"GLB Architecture image形式がPNGではありません: {glb_image}",
    )
    embedded_png = glb_buffer_view_payload(
        json_data,
        document.binary_data,
        int(glb_image["bufferView"]),
    )
    require(
        embedded_png == expected_png,
        "GLB埋込Architecture Atlasが生成器の期待bytesと一致しません",
    )
    embedded_dimensions = decode_rgb_png(embedded_png)[:2]
    require(
        embedded_dimensions == ARCHITECTURE_DIMENSIONS,
        f"GLB埋込Architecture Atlas寸法が不正です: {embedded_dimensions}",
    )

    samplers = json_data["samplers"]
    require(isinstance(samplers, list), "GLB samplersが配列ではありません")
    sampler = samplers[int(texture["sampler"])]
    require(isinstance(sampler, dict), "GLB Architecture samplerが不正です")
    normalized_sampler = {
        "magFilter": sampler.get("magFilter"),
        "minFilter": sampler.get("minFilter"),
        "wrapS": sampler.get("wrapS", GLTF_REPEAT),
        "wrapT": sampler.get("wrapT", GLTF_REPEAT),
    }
    expected_sampler = {
        "magFilter": GLTF_NEAREST,
        "minFilter": GLTF_NEAREST_MIPMAP_NEAREST,
        "wrapS": GLTF_REPEAT,
        "wrapT": GLTF_REPEAT,
    }
    require(
        normalized_sampler == expected_sampler,
        f"GLB Architecture samplerがBlender契約と一致しません: "
        f"{normalized_sampler}",
    )

    return {
        "png_bytes": len(expected_png),
        "sha256": hashlib.sha256(expected_png).hexdigest(),
        "blender_image_nodes": len(image_nodes),
        "glb_material_index": material_indices[0],
        "glb_texture_index": texture_index,
        "glb_image_index": source_index,
        "glb_sampler_index": int(texture["sampler"]),
    }


def audit_architecture_atlas_contract() -> dict[str, int | str | dict[str, int | str]]:
    definition = ATLAS_DEFINITIONS["Architecture"]
    dimensions = tuple(definition["dimensions"])
    grid = tuple(definition["grid"])
    uv_sample_size = int(definition["uv_sample_size"])
    swatches = definition["swatches"]
    require(
        dimensions == ARCHITECTURE_DIMENSIONS,
        f"Architecture Atlas寸法が不正です: {dimensions}",
    )
    require(
        grid == ARCHITECTURE_GRID,
        f"Architecture Atlasグリッドが不正です: {grid}",
    )
    width, height = dimensions
    columns, rows = grid
    require(
        width // columns == ARCHITECTURE_CELL_SIZE
        and height // rows == ARCHITECTURE_CELL_SIZE,
        "Architecture Atlasのセルは128px正方形である必要があります",
    )
    require(
        len(swatches) == ARCHITECTURE_SWATCH_COUNT,
        f"Architecture Atlasのswatch数が不正です: {len(swatches)}",
    )
    require(
        uv_sample_size == ARCHITECTURE_UV_SAMPLE_SIZE,
        f"Architecture AtlasのUVサンプル幅が不正です: {uv_sample_size}",
    )
    require(
        definition.get("checker") is False,
        "Architecture Atlasは遠景の面境界をなくすため単色セルである必要があります",
    )
    expected_png = atlas_png_bytes(
        dimensions,
        grid,
        list(swatches.values()),
        checker=False,
    )
    png_width, png_height, png_pixels = decode_rgb_png(expected_png)
    require(
        (png_width, png_height) == dimensions,
        f"生成PNG寸法が不正です: {(png_width, png_height)}",
    )

    used_cells: set[tuple[int, int]] = set()
    uniform_color_samples = 0
    uv_coordinates = 0
    half_sample = uv_sample_size // 2
    for index, (swatch, base) in enumerate(swatches.items()):
        column = index % columns
        row = index // columns
        require(row < rows, f"swatchがAtlas領域外です: {swatch}")
        require(
            (column, row) not in used_cells,
            f"swatchセルが重複しています: {swatch}/({column}, {row})",
        )
        used_cells.add((column, row))

        center_x = column * ARCHITECTURE_CELL_SIZE + ARCHITECTURE_CELL_SIZE // 2
        center_y = row * ARCHITECTURE_CELL_SIZE + ARCHITECTURE_CELL_SIZE // 2
        expected = (
            (
                (center_x - half_sample) / width,
                1.0 - (center_y + half_sample) / height,
            ),
            (
                (center_x + half_sample) / width,
                1.0 - (center_y + half_sample) / height,
            ),
            (
                (center_x + half_sample) / width,
                1.0 - (center_y - half_sample) / height,
            ),
            (
                (center_x - half_sample) / width,
                1.0 - (center_y - half_sample) / height,
            ),
        )
        actual = swatch_uv("Architecture", swatch)
        require(actual == expected, f"中央32px UVが不正です: {swatch}/{actual}")
        require(
            all(0.0 <= u <= 1.0 and 0.0 <= v <= 1.0 for u, v in actual),
            f"UVが[0,1]外です: {swatch}/{actual}",
        )
        uv_coordinates += len(actual)

        actual_colors = {
            tuple(
                png_pixels[(y * width + x) * 3 + channel]
                for channel in range(3)
            )
            for y in range(center_y - half_sample, center_y + half_sample)
            for x in range(center_x - half_sample, center_x + half_sample)
        }
        require(
            actual_colors == {base},
            f"中央32px UV領域が単色ではありません: {swatch}/{actual_colors}",
        )
        uniform_color_samples += len(actual_colors)

    return {
        "atlas_width": width,
        "atlas_height": height,
        "columns": columns,
        "rows": rows,
        "cell_size": ARCHITECTURE_CELL_SIZE,
        "swatches": len(swatches),
        "used_cells": len(used_cells),
        "uv_coordinates": uv_coordinates,
        "uniform_color_samples": uniform_color_samples,
        "artifacts": audit_architecture_atlas_artifacts(expected_png),
    }


if __name__ == "__main__":
    print(
        "B03_ARCHITECTURE_ATLAS_AUDIT "
        + json.dumps(audit_architecture_atlas_contract(), ensure_ascii=False)
    )
