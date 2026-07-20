from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

import bpy


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"
NAVMESH_PATH = (
    REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin"
)
PROP_LIBRARY_PATH = (
    REPOSITORY_ROOT / "assets/blender/v2/B03/b03_school_prop_library.blend"
)
BASELINE_PATH = (
    REPOSITORY_ROOT / "docs/plans/v2/B03/b03_2_protected_baseline.json"
)

PROTECTED_PREFIXES = (
    "COL_",
    "LNK_",
    "MRK_",
    "NAV_",
    "VIS_WindowFrame_",
    "VIS_WindowGlass_",
    "VOL_",
)
ALLOWED_NEW_PREFIXES = ("COL_B03_Interior_",)
ALLOWED_NEW_EXACT_NAMES = {"NAV_Blocker_Interiors"}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("write", "compare"))
    return parser.parse_args(argparse_input())


def argparse_input() -> list[str]:
    import sys

    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def update_float(digest: object, value: float) -> None:
    digest.update(struct.pack("<d", float(value)))


def object_signature(obj: bpy.types.Object) -> dict[str, object]:
    digest = hashlib.sha256()
    digest.update(obj.type.encode("ascii"))
    for row in obj.matrix_world:
        for value in row:
            update_float(digest, value)
    properties = {
        key: obj[key]
        for key in sorted(obj.keys())
        if key.startswith("hs_")
    }
    digest.update(
        json.dumps(properties, ensure_ascii=False, sort_keys=True).encode("utf-8")
    )
    if obj.type == "MESH":
        for vertex in obj.data.vertices:
            for value in vertex.co:
                update_float(digest, value)
        for polygon in obj.data.polygons:
            digest.update(
                struct.pack("<I", len(polygon.vertices))
                + b"".join(struct.pack("<I", index) for index in polygon.vertices)
            )
    return {
        "type": obj.type,
        "signature": digest.hexdigest().upper(),
        "properties": properties,
    }


def protected_snapshot() -> dict[str, dict[str, object]]:
    return {
        obj.name: object_signature(obj)
        for obj in sorted(bpy.data.objects, key=lambda item: item.name)
        if obj.name.startswith(PROTECTED_PREFIXES)
    }


def write_baseline() -> None:
    snapshot = {
        "source": {
            "blend_sha256": sha256_file(BLEND_PATH),
            "glb_sha256": sha256_file(GLB_PATH),
            "navmesh_sha256": sha256_file(NAVMESH_PATH),
            "prop_library_sha256": sha256_file(PROP_LIBRARY_PATH),
        },
        "objects": protected_snapshot(),
    }
    BASELINE_PATH.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        "B03_PROTECTED_BASELINE="
        + json.dumps(
            {
                "path": str(BASELINE_PATH),
                "objects": len(snapshot["objects"]),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


def compare_baseline() -> None:
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    expected = baseline["objects"]
    current = protected_snapshot()
    missing = sorted(set(expected) - set(current))
    changed = sorted(
        name for name in set(expected) & set(current) if expected[name] != current[name]
    )
    unexpected = sorted(
        name
        for name in set(current) - set(expected)
        if name not in ALLOWED_NEW_EXACT_NAMES
        and not name.startswith(ALLOWED_NEW_PREFIXES)
    )
    if missing or changed or unexpected:
        raise RuntimeError(
            "B03-1保護契約が変化しました: "
            + json.dumps(
                {"missing": missing, "changed": changed, "unexpected": unexpected},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    print(
        "B03_PROTECTED_COMPARE="
        + json.dumps(
            {
                "protected": len(expected),
                "new_interior_objects": len(set(current) - set(expected)),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


def main() -> None:
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError(f"対象Blenderファイルが不正です: {bpy.data.filepath}")
    arguments = parse_arguments()
    if arguments.mode == "write":
        write_baseline()
    else:
        compare_baseline()


if __name__ == "__main__":
    main()
