from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

import build_b03_school_architecture as architecture


NORTHWEST_OPEN_FLOOR_PANELS_XY = (
    ((-12.6, -3.5), (0.0, 32.5)),
    ((-6.6, 32.5), (47.4, 45.5)),
    ((-12.6, 32.5), (-6.6, 38.9)),
)

SECOND_FLOOR_PANELS_XY = (
    ((-6.0, -3.5), (0.0, 32.5)),
    ((-12.6, 2.5), (-6.0, 32.5)),
    ((-6.6, 32.5), (41.4, 45.5)),
    ((-12.6, 32.5), (-6.6, 38.9)),
    ((41.4, 32.5), (47.4, 38.9)),
)

EXPECTED_SOURCE_VERSION = "b03-2-interiors-v05-staffroom-placement"
CORRECTION_VERSION_PROPERTY = "t04_2b_nav_connectivity_version"
CORRECTION_VERSION = "t04-2b-nav-connectivity-v03"
SUPPORTED_INPUT_CORRECTION_VERSIONS = {
    "t04-2b-nav-connectivity-v01",
    "t04-2b-nav-connectivity-v02",
    CORRECTION_VERSION,
}

UPPER_NAV_BLOCKER_SOURCE_NAMES = (
    "COL_StairGuardSystem_NW_2FTo3F",
    "COL_StairGuardSystem_NW_3FTo4F",
    "COL_StairGuardSystem_NW_4FToRooftop",
    "COL_RooftopFacilityShell",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def rebuild_box_object(
    object_name: str,
    boxes: list[tuple[tuple[float, float, float], tuple[float, float, float]]],
) -> None:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for minimum, maximum in boxes:
        architecture.append_box(vertices, faces, minimum, maximum)
    obj = architecture.replace_mesh_geometry(object_name, vertices, faces)
    if object_name.startswith("VIS_"):
        obj.data.materials.clear()


def floor_boxes(
    base_z: float,
    panels_xy: tuple[
        tuple[tuple[float, float], tuple[float, float]], ...
    ] = NORTHWEST_OPEN_FLOOR_PANELS_XY,
) -> list[
    tuple[tuple[float, float, float], tuple[float, float, float]]
]:
    return [
        ((minimum[0], minimum[1], base_z - 0.15), (maximum[0], maximum[1], base_z))
        for minimum, maximum in panels_xy
    ]


def rebuild_upper_floor_openings() -> None:
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        boxes = floor_boxes(
            base_z,
            SECOND_FLOOR_PANELS_XY
            if floor == 2
            else NORTHWEST_OPEN_FLOOR_PANELS_XY,
        )
        rebuild_box_object(f"VIS_B03_Floor_F{floor:02d}", boxes)
        rebuild_box_object(f"COL_B03_Floor_F{floor:02d}", boxes)

        if floor in (2, 3):
            ceiling_boxes = floor_boxes(base_z + 3.6)
            rebuild_box_object(f"VIS_B03_Ceiling_F{floor:02d}", ceiling_boxes)
            rebuild_box_object(f"COL_B03_Ceiling_F{floor:02d}", ceiling_boxes)


def replace_nav_source(
    name: str,
    source_names: list[str],
    properties: dict[str, object],
) -> None:
    current = bpy.data.objects.get(name)
    if current is None:
        raise RuntimeError(f"置換対象NAV Objectがありません: {name}")
    architecture.unlink_and_remove_object(current)
    architecture.copy_meshes_into_object(
        name,
        source_names,
        architecture.collection(architecture.NAV_COLLECTION_NAME),
        properties,
    )


def rebuild_nav_sources() -> int:
    for floor in (2, 3, 4):
        replace_nav_source(
            f"NAV_Walkable_Interior{floor}F",
            [f"COL_B03_Floor_F{floor:02d}"],
            {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
        )

    replace_nav_source(
        "NAV_Walkable_StairsNWUpper",
        [
            "COL_StairRampUpper_NW",
            "COL_StairSystem_NW_2FTo3F",
            "COL_StairSystem_NW_3FTo4F",
            "COL_StairSystem_NW_4FToRooftop",
        ],
        {"hs_nav_role": "walkable", "hs_nav_area": "stairs"},
    )

    upper_blocker_sources = sorted(
        [
            obj.name
            for obj in bpy.data.objects
            if obj.name.startswith("COL_B03_InteriorWalls_F0")
            or obj.name.startswith(
                (
                    "COL_B03_ExteriorWalls_F02",
                    "COL_B03_ExteriorWalls_F03",
                    "COL_B03_ExteriorWalls_F04",
                )
            )
            or obj.name.startswith(
                (
                    "COL_ActorOnly_Window_F02",
                    "COL_ActorOnly_Window_F03",
                    "COL_ActorOnly_Window_F04",
                )
            )
            or obj.name.startswith(
                (
                    "COL_HumanOnly_Window_F02",
                    "COL_HumanOnly_Window_F03",
                    "COL_HumanOnly_Window_F04",
                )
            )
            or obj.name in UPPER_NAV_BLOCKER_SOURCE_NAMES
        ]
    )
    replace_nav_source(
        "NAV_Blocker_SchoolUpper",
        upper_blocker_sources,
        {"hs_nav_role": "blocker"},
    )
    return len(upper_blocker_sources)


def main() -> None:
    if Path(bpy.data.filepath).resolve() != architecture.BLEND_PATH.resolve():
        raise RuntimeError(f"対象Blenderファイルが不正です: {bpy.data.filepath}")
    source_version = bpy.context.scene.get(architecture.GENERATOR_VERSION_PROPERTY)
    correction_version = bpy.context.scene.get(CORRECTION_VERSION_PROPERTY)
    valid_source = source_version == EXPECTED_SOURCE_VERSION or (
        source_version == architecture.GENERATOR_VERSION
        and correction_version in SUPPORTED_INPUT_CORRECTION_VERSIONS
    )
    if not valid_source:
        raise RuntimeError(
            "B03-2最終生成版が一致しません: "
            f"expected={EXPECTED_SOURCE_VERSION} or "
            f"{sorted(SUPPORTED_INPUT_CORRECTION_VERSIONS)}, "
            f"actual={source_version}, correction={correction_version}"
        )

    rebuild_upper_floor_openings()
    upper_nav_blocker_source_count = rebuild_nav_sources()
    export_collection = architecture.collection(architecture.EXPORT_COLLECTION_NAME)
    material_result = architecture.consolidate_school_materials(export_collection)
    bpy.context.scene[architecture.GENERATOR_VERSION_PROPERTY] = architecture.GENERATOR_VERSION
    bpy.context.scene[CORRECTION_VERSION_PROPERTY] = CORRECTION_VERSION
    bpy.context.scene[architecture.GENERATOR_SIGNATURE_PROPERTY] = architecture.generation_signature()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(architecture.BLEND_PATH), check_existing=False)

    optimization = architecture.export_stage(export_collection)
    print(
        "T04_NAV_CONNECTIVITY_FIX="
        + json.dumps(
            {
                "blendSha256": sha256_file(architecture.BLEND_PATH),
                "correctionVersion": CORRECTION_VERSION,
                "glbOptimization": optimization,
                "glbSha256": sha256_file(architecture.GLB_PATH),
                "materials": material_result,
                "secondFloorPanelCount": len(SECOND_FLOOR_PANELS_XY),
                "upperNavBlockerSourceCount": upper_nav_blocker_source_count,
                "upperFloorPanelCount": len(NORTHWEST_OPEN_FLOOR_PANELS_XY),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
