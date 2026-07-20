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


ALL_STAIR_OPEN_FLOOR_PANELS_XY = (
    ((-6.0, -3.5), (0.0, 32.5)),
    ((-12.6, 2.5), (-6.0, 32.5)),
    ((-6.6, 32.5), (41.4, 45.5)),
    ((-12.6, 32.5), (-6.6, 38.9)),
    ((41.4, 32.5), (47.4, 38.9)),
)

EXPECTED_SOURCE_VERSION = "b03-2-interiors-v05-staffroom-placement"
CORRECTION_VERSION_PROPERTY = "t04_2b_nav_connectivity_version"
CORRECTION_VERSION = "t04-2b-nav-connectivity-v04"
SUPPORTED_INPUT_CORRECTION_VERSIONS = {
    "t04-2b-nav-connectivity-v01",
    "t04-2b-nav-connectivity-v02",
    "t04-2b-nav-connectivity-v03",
    CORRECTION_VERSION,
}

STAIR_NAV_BLOCKER_SOURCE_NAMES = (
    "COL_StairGuard_NE_Landing",
    "COL_StairGuard_NE_Lower",
    "COL_StairGuard_NE_Upper",
    "COL_StairGuard_NW_Landing",
    "COL_StairGuard_NW_Lower",
    "COL_StairGuard_NW_Upper",
    "COL_StairStorageShell_NW",
    "COL_StairGuard_SW_Landing",
    "COL_StairGuard_SW_Lower",
    "COL_StairGuard_SW_Upper",
)

UPPER_STAIR_NAV_SOURCE_NAMES = (
    "COL_StairRampUpper_NW",
    "COL_StairRampUpper_NE",
    "COL_StairRampUpper_SW",
    "COL_StairSystem_NW_2FTo3F",
    "COL_StairSystem_NW_3FTo4F",
    "COL_StairSystem_NW_4FToRooftop",
    "COL_StairSystem_NE_2FTo3F",
    "COL_StairSystem_NE_3FTo4F",
    "COL_StairSystem_SW_2FTo3F",
    "COL_StairSystem_SW_3FTo4F",
)

UPPER_NAV_BLOCKER_SOURCE_NAMES = (
    "COL_StairGuardSystem_NW_2FTo3F",
    "COL_StairGuardSystem_NW_3FTo4F",
    "COL_StairGuardSystem_NW_4FToRooftop",
    "COL_StairGuardSystem_NE_2FTo3F",
    "COL_StairGuardSystem_NE_3FTo4F",
    "COL_StairGuardSystem_SW_2FTo3F",
    "COL_StairGuardSystem_SW_3FTo4F",
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
    return [
        ((minimum[0], minimum[1], base_z - 0.15), (maximum[0], maximum[1], base_z))
        for minimum, maximum in panels_xy
    ]


def rebuild_upper_floor_openings() -> None:
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        boxes = floor_boxes(base_z)
        rebuild_box_object(f"VIS_B03_Floor_F{floor:02d}", boxes)
        rebuild_box_object(f"COL_B03_Floor_F{floor:02d}", boxes)

        if floor in (2, 3):
            ceiling_boxes = floor_boxes(base_z + 3.6)
            rebuild_box_object(f"COL_B03_Ceiling_F{floor:02d}", ceiling_boxes)


def upper_interior_wall_boxes(
    floor: int,
    base_z: float,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    z0, z1 = base_z, base_z + 3.6
    west_doors = [
        (3.5, 4.7, z0, z0 + 2.3),
        (13.1, 14.3, z0, z0 + 2.3),
        (21.9, 23.1, z0, z0 + 2.3),
        (30.7, 31.9, z0, z0 + 2.3),
    ]
    north_doors = [
        (6.0, 7.2, z0, z0 + 2.3),
        (21.6, 22.8, z0, z0 + 2.3),
        (24.0, 25.2, z0, z0 + 2.3),
        (39.6, 40.8, z0, z0 + 2.3),
    ]
    boxes = architecture.wall_boxes(
        "Y",
        -3.5,
        2.5,
        32.5,
        z0,
        z1,
        west_doors,
    )
    boxes.extend(
        architecture.wall_boxes(
            "X",
            36.5,
            -6.6,
            41.4,
            z0,
            z1,
            north_doors,
        )
    )

    # 西側普通教室間の境界を揃える。
    for divider_y in (12.5, 22.5):
        boxes.append(
            ((-12.6, divider_y - 0.15, z0), (-3.5, divider_y + 0.15, z1))
        )

    # 南西階段と普通教室だけを隔て、東側の階段出入口は開けておく。
    boxes.append(((-12.6, 2.35, z0), (-6.0, 2.65, z1)))

    north_dividers = (14.4, 23.4) if floor == 2 else (23.4,)
    for divider_x in north_dividers:
        boxes.append(
            ((divider_x - 0.15, 36.5, z0), (divider_x + 0.15, 45.5, z1))
        )

    # 北東階段と北側普通教室の境界を、1Fと同じ位置へ揃える。
    boxes.append(((41.25, 36.5, z0), (41.55, 45.5, z1)))
    return boxes


def rebuild_upper_interior_walls() -> None:
    for floor, base_z in ((2, 3.6), (3, 7.2), (4, 10.8)):
        boxes = upper_interior_wall_boxes(floor, base_z)
        rebuild_box_object(f"VIS_B03_InteriorWalls_F{floor:02d}", boxes)
        rebuild_box_object(f"COL_B03_InteriorWalls_F{floor:02d}", boxes)


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
    rebuilt_first_transition_names: list[str] = []
    created_upper_transition_names: list[str] = []
    first_transition_sources = (
        ("VIS_StairsUpper_NW", "VIS_StairsUpper"),
        ("COL_StairRampUpper_NW", "COL_StairRampUpper"),
        ("VIS_StairGuard_NW_Upper", "VIS_StairGuard"),
        ("COL_StairGuard_NW_Upper", "COL_StairGuard"),
    )

    for staircase in ("NE", "SW"):
        for source_name, target_prefix in first_transition_sources:
            target_name = (
                f"{target_prefix}_{staircase}_Upper"
                if target_prefix.endswith("StairGuard")
                else f"{target_prefix}_{staircase}"
            )
            copy_transformed_mesh_geometry(source_name, target_name, staircase)
            rebuilt_first_transition_names.append(target_name)

        for suffix, base_z in (("2FTo3F", 3.6), ("3FTo4F", 7.2)):
            visual_vertices, visual_faces = (
                architecture.create_upper_stair_visual_geometry(base_z)
            )
            visual_vertices, visual_faces = transform_northwest_geometry(
                staircase,
                visual_vertices,
                visual_faces,
            )
            visual_name = f"VIS_StairSystem_{staircase}_{suffix}"
            rebuild_mesh_object(visual_name, visual_vertices, visual_faces)
            created_upper_transition_names.append(visual_name)

            collider_vertices, collider_faces = (
                architecture.create_upper_stair_collider_geometry(base_z)
            )
            collider_vertices, collider_faces = transform_northwest_geometry(
                staircase,
                collider_vertices,
                collider_faces,
            )
            collider_name = f"COL_StairSystem_{staircase}_{suffix}"
            rebuild_mesh_object(collider_name, collider_vertices, collider_faces)
            created_upper_transition_names.append(collider_name)

            guard_vertices, guard_faces = architecture.create_upper_stair_guard_geometry(
                base_z
            )
            guard_vertices, guard_faces = transform_northwest_geometry(
                staircase,
                guard_vertices,
                guard_faces,
            )
            for prefix in ("VIS", "COL"):
                guard_name = f"{prefix}_StairGuardSystem_{staircase}_{suffix}"
                rebuild_mesh_object(guard_name, guard_vertices, guard_faces)
                created_upper_transition_names.append(guard_name)

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
    rebuild_upper_interior_walls()
    rebuilt_first_stairs, created_upper_stairs = (
        rebuild_northeast_and_southwest_stairs()
    )
    removed_stair_closures = remove_objects_if_present(
        ("COL_StairClosure_NE", "COL_StairClosure_SW")
    )
    removed_visual_ceilings = remove_objects_if_present(
        ("VIS_B03_Ceiling_F02", "VIS_B03_Ceiling_F03")
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
                "removedStairClosures": removed_stair_closures,
                "removedVisualCeilings": removed_visual_ceilings,
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
