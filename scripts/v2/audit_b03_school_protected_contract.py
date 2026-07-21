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
T04_CORRECTION_VERSION_PROPERTY = "t04_2b_nav_connectivity_version"
T04_CORRECTION_VERSION = "t04-2b-nav-connectivity-v05"
T04_ALLOWED_MISSING_EXACT_NAMES = {
    "COL_ActorOnly_Window_F01_CourtyardNorth_Corridor_01",
    "COL_Ceiling1F_North",
    "COL_Ceiling1F_West",
    "COL_StairClosure_NE",
    "COL_StairClosure_SW",
    "VIS_WindowFrame_F01_CourtyardNorth_Corridor_01",
    "VIS_WindowGlass_F01_CourtyardNorth_Corridor_01",
}
T04_ALLOWED_NEW_EXACT_NAMES = {
    "COL_B03_InterfloorStructure_F01_North",
    "COL_B03_InterfloorStructure_F01_West",
    "COL_StairGuardSystem_NE_2FTo3F",
    "COL_StairGuardSystem_NE_3FTo4F",
    "COL_StairGuardSystem_SW_2FTo3F",
    "COL_StairGuardSystem_SW_3FTo4F",
    "COL_StairSystem_NE_2FTo3F",
    "COL_StairSystem_NE_3FTo4F",
    "COL_StairSystem_SW_2FTo3F",
    "COL_StairSystem_SW_3FTo4F",
}
T04_ALLOWED_CHANGED_EXACT_NAMES = {
    "COL_B03_Ceiling_F02",
    "COL_B03_Ceiling_F03",
    "COL_B03_ExteriorWalls_F01",
    "COL_B03_Floor_F02",
    "COL_B03_Floor_F03",
    "COL_B03_Floor_F04",
    "COL_B03_InteriorWalls_F02",
    "COL_B03_InteriorWalls_F03",
    "COL_B03_InteriorWalls_F04",
    "COL_StairGuard_NE_Landing",
    "COL_StairGuard_NE_Lower",
    "COL_StairGuard_NE_Upper",
    "COL_StairGuard_NW_Landing",
    "COL_StairGuard_NW_Lower",
    "COL_StairGuard_NW_Upper",
    "COL_StairGuardSystem_NW_2FTo3F",
    "COL_StairGuardSystem_NW_3FTo4F",
    "COL_StairGuardSystem_NW_4FToRooftop",
    "COL_StairGuard_SW_Landing",
    "COL_StairGuard_SW_Lower",
    "COL_StairGuard_SW_Upper",
    "COL_StairRampUpper_NE",
    "COL_StairRampUpper_SW",
    "COL_Wall_ClassroomCross_2",
    "NAV_Walkable_Interior2F",
    "NAV_Walkable_Interior3F",
    "NAV_Walkable_Interior4F",
    "NAV_Walkable_StairsNWUpper",
    "NAV_Blocker_SchoolUpper",
    "NAV_Blocker_StairClosed",
}


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
    all_missing = sorted(set(expected) - set(current))
    all_changed = sorted(
        name for name in set(expected) & set(current) if expected[name] != current[name]
    )
    correction_version = bpy.context.scene.get(T04_CORRECTION_VERSION_PROPERTY)
    expected_allowed_changes = (
        sorted(T04_ALLOWED_CHANGED_EXACT_NAMES)
        if correction_version == T04_CORRECTION_VERSION
        else []
    )
    expected_allowed_missing = (
        sorted(T04_ALLOWED_MISSING_EXACT_NAMES)
        if correction_version == T04_CORRECTION_VERSION
        else []
    )
    expected_allowed_new = (
        sorted(T04_ALLOWED_NEW_EXACT_NAMES)
        if correction_version == T04_CORRECTION_VERSION
        else []
    )
    allowed_missing = sorted(
        name for name in all_missing if name in T04_ALLOWED_MISSING_EXACT_NAMES
    )
    missing = sorted(
        name for name in all_missing if name not in T04_ALLOWED_MISSING_EXACT_NAMES
    )
    allowed_changed = sorted(
        name for name in all_changed if name in T04_ALLOWED_CHANGED_EXACT_NAMES
    )
    changed = sorted(
        name for name in all_changed if name not in T04_ALLOWED_CHANGED_EXACT_NAMES
    )
    all_new = sorted(
        name
        for name in set(current) - set(expected)
        if name not in ALLOWED_NEW_EXACT_NAMES
        and not name.startswith(ALLOWED_NEW_PREFIXES)
    )
    allowed_new = sorted(
        name for name in all_new if name in T04_ALLOWED_NEW_EXACT_NAMES
    )
    unexpected = sorted(
        name for name in all_new if name not in T04_ALLOWED_NEW_EXACT_NAMES
    )
    if (
        missing
        or changed
        or unexpected
        or allowed_missing != expected_allowed_missing
        or allowed_changed != expected_allowed_changes
        or allowed_new != expected_allowed_new
    ):
        raise RuntimeError(
            "B03-1保護契約が変化しました: "
            + json.dumps(
                {
                    "missing": missing,
                    "changed": changed,
                    "unexpected": unexpected,
                    "t04_allowed_missing": allowed_missing,
                    "t04_expected_missing": expected_allowed_missing,
                    "t04_allowed_changed": allowed_changed,
                    "t04_expected_changed": expected_allowed_changes,
                    "t04_allowed_new": allowed_new,
                    "t04_expected_new": expected_allowed_new,
                },
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
                "t04_allowed_missing": allowed_missing,
                "t04_allowed_changed": allowed_changed,
                "t04_allowed_new": allowed_new,
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
