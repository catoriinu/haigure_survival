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


ALL_STAIR_OPEN_FLOOR_PANELS_XY = architecture.UPPER_FLOOR_PANELS_XY

CORRECTION_VERSION_PROPERTY = architecture.T04_CORRECTION_VERSION_PROPERTY
CORRECTION_VERSION = architecture.T04_CORRECTION_VERSION
SUPPORTED_INPUT_CORRECTION_VERSIONS = {CORRECTION_VERSION}

STAIR_NAV_BLOCKER_SOURCE_NAMES = architecture.STAIR_NAV_BLOCKER_SOURCE_NAMES

UPPER_STAIR_NAV_SOURCE_NAMES = architecture.UPPER_STAIR_NAV_SOURCE_NAMES

UPPER_NAV_BLOCKER_SOURCE_NAMES = (
    *architecture.UPPER_STAIR_NAV_BLOCKER_SOURCE_NAMES,
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


def rebuild_mesh_object(
    object_name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
) -> None:
    if object_name.startswith("VIS_"):
        collection_name = architecture.VIS_COLLECTION_NAME
    elif object_name.startswith("COL_"):
        collection_name = architecture.COL_COLLECTION_NAME
    else:
        raise RuntimeError(f"VIS/COL以外の再構築対象です: {object_name}")

    target_collection = architecture.collection(collection_name)
    obj = bpy.data.objects.get(object_name)
    if obj is None:
        obj = architecture.create_mesh_object(object_name, [], target_collection)
    elif obj.type != "MESH":
        raise RuntimeError(f"再構築対象がMeshではありません: {object_name}")
    else:
        architecture.move_to_collection(obj, target_collection)

    obj = architecture.replace_mesh_geometry(object_name, vertices, faces)
    if object_name.startswith("VIS_"):
        obj.data.materials.clear()
        obj.display_type = "TEXTURED"
    else:
        obj.display_type = "WIRE"


def floor_boxes(
    base_z: float,
    panels_xy: tuple[
        tuple[tuple[float, float], tuple[float, float]], ...
    ] = ALL_STAIR_OPEN_FLOOR_PANELS_XY,
) -> list[
    tuple[tuple[float, float, float], tuple[float, float, float]]
]:
    return architecture.floor_finish_boxes(base_z, panels_xy)


def rebuild_upper_floor_openings() -> None:
    first_floor_structure_groups = {
        "West": tuple(ALL_STAIR_OPEN_FLOOR_PANELS_XY[index] for index in (0, 1, 3)),
        "North": tuple(ALL_STAIR_OPEN_FLOOR_PANELS_XY[index] for index in (2, 4)),
    }
    for wing, panels in first_floor_structure_groups.items():
        boxes = architecture.interfloor_structure_boxes(3.6, panels)
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, ...]] = []
        for minimum, maximum in boxes:
            architecture.append_box(vertices, faces, minimum, maximum)
        for prefix in ("VIS", "COL"):
            rebuild_mesh_object(
                f"{prefix}_B03_InterfloorStructure_F01_{wing}",
                vertices,
                faces,
            )

    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        boxes = floor_boxes(base_z)
        rebuild_box_object(f"VIS_B03_Floor_F{floor:02d}", boxes)
        rebuild_box_object(f"COL_B03_Floor_F{floor:02d}", boxes)

        if floor in (2, 3):
            ceiling_boxes = architecture.interfloor_structure_boxes(base_z + 3.6)
            vertices = []
            faces = []
            for minimum, maximum in ceiling_boxes:
                architecture.append_box(vertices, faces, minimum, maximum)
            for prefix in ("VIS", "COL"):
                rebuild_mesh_object(
                    f"{prefix}_B03_Ceiling_F{floor:02d}",
                    vertices,
                    faces,
                )


def upper_interior_wall_boxes(
    floor: int,
    base_z: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    return architecture.upper_interior_wall_boxes(floor, base_z)


def rebuild_upper_interior_walls() -> None:
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        boxes = upper_interior_wall_boxes(floor, base_z)
        rebuild_box_object(f"VIS_B03_InteriorWalls_F{floor:02d}", boxes)
        rebuild_box_object(f"COL_B03_InteriorWalls_F{floor:02d}", boxes)


def rebuild_upper_door_leaves() -> None:
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        rebuild_box_object(
            f"VIS_B03_DoorLeaves_F{floor:02d}",
            architecture.upper_door_leaf_boxes(floor, base_z),
        )


def transform_northwest_vertex(
    staircase: str,
    vertex: tuple[float, float, float],
) -> tuple[float, float, float]:
    x, y, z = vertex
    if staircase == "NE":
        return x + 54.0, y, z
    if staircase == "SW":
        return 32.9 - y, x + 9.1, z
    raise RuntimeError(f"未対応の階段位置です: {staircase}")


def transform_northwest_geometry(
    staircase: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    return (
        [transform_northwest_vertex(staircase, vertex) for vertex in vertices],
        [tuple(face) for face in faces],
    )


def copy_transformed_mesh_geometry(
    source_name: str,
    target_name: str,
    staircase: str,
) -> None:
    source = bpy.data.objects.get(source_name)
    if source is None or source.type != "MESH":
        raise RuntimeError(f"階段変換元のMeshがありません: {source_name}")
    source_vertices = [
        tuple(source.matrix_world @ vertex.co) for vertex in source.data.vertices
    ]
    source_faces = [tuple(polygon.vertices) for polygon in source.data.polygons]
    vertices, faces = transform_northwest_geometry(
        staircase,
        source_vertices,
        source_faces,
    )
    rebuild_mesh_object(target_name, vertices, faces)


def rebuild_northeast_and_southwest_stairs() -> tuple[list[str], list[str]]:
    claimed_post_positions_by_stair = (
        architecture.rebuild_first_transition_stair_guards()
    )
    rebuilt_first_transition_names = [
        f"{prefix}_StairGuard_{staircase}_{part}"
        for staircase in ("NW", "NE", "SW")
        for part in ("Lower", "Landing", "Upper")
        for prefix in ("VIS", "COL")
    ]
    first_transition_sources = (
        ("VIS_StairsUpper_NW", "VIS_StairsUpper"),
        ("COL_StairRampUpper_NW", "COL_StairRampUpper"),
    )

    for staircase in ("NE", "SW"):
        for source_name, target_prefix in first_transition_sources:
            target_name = f"{target_prefix}_{staircase}"
            copy_transformed_mesh_geometry(source_name, target_name, staircase)
            rebuilt_first_transition_names.append(target_name)

    architecture.rebuild_upper_stairs(claimed_post_positions_by_stair)
    upper_transitions = {
        "NW": ("2FTo3F", "3FTo4F", "4FToRooftop"),
        "NE": ("2FTo3F", "3FTo4F"),
        "SW": ("2FTo3F", "3FTo4F"),
    }
    created_upper_transition_names = [
        f"{prefix}_{staircase}_{suffix}"
        for staircase, suffixes in upper_transitions.items()
        for suffix in suffixes
        for prefix in (
            "VIS_StairSystem",
            "COL_StairSystem",
            "VIS_StairGuardSystem",
            "COL_StairGuardSystem",
        )
    ]

    return rebuilt_first_transition_names, created_upper_transition_names


def remove_objects_if_present(names: tuple[str, ...]) -> list[str]:
    removed: list[str] = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        architecture.unlink_and_remove_object(obj)
        removed.append(name)
    return removed


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


def rebuild_nav_sources() -> tuple[int, int]:
    for floor in (2, 3, 4):
        replace_nav_source(
            f"NAV_Walkable_Interior{floor}F",
            [f"COL_B03_Floor_F{floor:02d}"],
            {"hs_nav_role": "walkable", "hs_nav_area": "ground"},
        )

    replace_nav_source(
        "NAV_Walkable_StairsNWUpper",
        list(UPPER_STAIR_NAV_SOURCE_NAMES),
        {"hs_nav_role": "walkable", "hs_nav_area": "stairs"},
    )

    replace_nav_source(
        "NAV_Blocker_StairClosed",
        list(STAIR_NAV_BLOCKER_SOURCE_NAMES),
        {"hs_nav_role": "blocker"},
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
    return len(STAIR_NAV_BLOCKER_SOURCE_NAMES), len(upper_blocker_sources)


def main() -> None:
    if Path(bpy.data.filepath).resolve() != architecture.BLEND_PATH.resolve():
        raise RuntimeError(f"対象Blenderファイルが不正です: {bpy.data.filepath}")
    source_version = bpy.context.scene.get(architecture.GENERATOR_VERSION_PROPERTY)
    correction_version = bpy.context.scene.get(CORRECTION_VERSION_PROPERTY)
    valid_source = (
        source_version == architecture.GENERATOR_VERSION
        and correction_version in SUPPORTED_INPUT_CORRECTION_VERSIONS
    )
    if not valid_source:
        raise RuntimeError(
            "T04-2B現行生成版が一致しません: "
            f"expected={architecture.GENERATOR_VERSION} and "
            f"correction in {sorted(SUPPORTED_INPUT_CORRECTION_VERSIONS)}, "
            f"actual={source_version}, correction={correction_version}"
        )

    rebuild_upper_floor_openings()
    rebuild_upper_interior_walls()
    rebuild_upper_door_leaves()
    rebuilt_first_stairs, created_upper_stairs = (
        rebuild_northeast_and_southwest_stairs()
    )
    removed_stair_closures = remove_objects_if_present(
        ("COL_StairClosure_NE", "COL_StairClosure_SW")
    )
    removed_legacy_ceilings = remove_objects_if_present(
        (
            "VIS_Ceiling1F_North",
            "VIS_Ceiling1F_West",
            "COL_Ceiling1F_North",
            "COL_Ceiling1F_West",
        )
    )
    (
        stair_nav_blocker_source_count,
        upper_nav_blocker_source_count,
    ) = rebuild_nav_sources()
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
                "rebuiltFirstStairObjectCount": len(rebuilt_first_stairs),
                "removedLegacyCeilings": removed_legacy_ceilings,
                "removedStairClosures": removed_stair_closures,
                "stairNavBlockerSourceCount": stair_nav_blocker_source_count,
                "upperFloorPanelCount": len(ALL_STAIR_OPEN_FLOOR_PANELS_XY),
                "upperNavBlockerSourceCount": upper_nav_blocker_source_count,
                "upperStairObjectCount": len(created_upper_stairs),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
