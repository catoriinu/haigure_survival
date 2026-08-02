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
ALLOWED_NEW_PREFIXES = (
    "COL_BeamSightOnly_",
    "COL_B03_Interior_",
    "COL_DoorPanel_",
    "COL_ElevatorCar_",
    "COL_ElevatorThresholdPlate_",
    "COL_HumanOnly_ElevatorGate_",
    "COL_RoomVariant_",
    "LNK_school-elevator-",
    "MRK_Door",
    "MRK_Elevator",
    "MRK_RoomVariant_",
    "NAV_RoomVariant_",
    "VOL_DoorSweep_",
    "VOL_Elevator",
    "VOL_RoomVariantTile_",
)
ALLOWED_NEW_EXACT_NAMES = {"NAV_Blocker_Interiors"}
T04_CORRECTION_VERSION_PROPERTY = "t04_2b_nav_connectivity_version"
T04_CORRECTION_VERSION = "t04-2b-nav-connectivity-v11"
T05_GENERATOR_VERSION_PROPERTY = "b03_architecture_generator_version"
T05_GENERATOR_VERSION = "b03-3c-interactive-assets-v9"
T04_ALLOWED_MISSING_EXACT_NAMES = {
    "COL_B03_Prop_Locker_Changing_F_01",
    "COL_B03_Prop_Locker_Changing_F_02",
    "COL_B03_Prop_Locker_Changing_M_01",
    "COL_B03_Prop_Locker_Changing_M_02",
    "COL_ActorOnly_Window_F01_CourtyardNorth_Corridor_01",
    "COL_Ceiling1F_North",
    "COL_Ceiling1F_West",
    "COL_StairClosure_NE",
    "COL_StairClosure_SW",
    "COL_Wall_Lintel_Toilet_F",
    "COL_Wall_Lintel_Toilet_M",
    "COL_Wall_Toilet_South_A",
    "COL_Wall_Toilet_South_B",
    "COL_Wall_Toilet_South_C",
    "COL_Wall_Toilet_South_D",
    "VIS_WindowFrame_F01_CourtyardNorth_Corridor_01",
    "VIS_WindowGlass_F01_CourtyardNorth_Corridor_01",
}
T04_ALLOWED_NEW_EXACT_NAMES = {
    "COL_B03_Ceiling_F04",
    "COL_B03_Interior_Walls_F01_Toilets",
    "COL_B03_Interior_Walls_F02_Toilets",
    "COL_B03_Interior_Walls_F03_Toilets",
    "COL_B03_Interior_Walls_F04_Toilets",
    "COL_B03_StairBoundaryCaps_F01",
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
    "NAV_Blocker_Interiors",
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
    "COL_RoofGuard_CourtyardNorth",
    "COL_RoofGuard_CourtyardWest",
    "COL_RoofGuard_EastOuter",
    "COL_RoofGuard_NorthOuter",
    "COL_RoofGuard_SouthOuter",
    "COL_RoofGuard_WestOuter",
    "COL_StairGuard_NE_Landing",
    "COL_StairGuard_NE_Lower",
    "COL_StairGuard_NE_Upper",
    "COL_StairGuard_NW_Landing",
    "COL_StairGuard_NW_Lower",
    "COL_StairGuard_NW_Upper",
    "COL_StairGuardSystem_NW_2FTo3F",
    "COL_StairGuardSystem_NW_3FTo4F",
    "COL_StairGuardSystem_NW_4FToRooftop",
    "COL_StairSystem_NW_2FTo3F",
    "COL_StairSystem_NW_3FTo4F",
    "COL_StairSystem_NW_4FToRooftop",
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
    "NAV_Blocker_School1F",
    "NAV_Blocker_SchoolUpper",
    "NAV_Blocker_StairClosed",
}
T05_ALLOWED_MISSING_EXACT_NAMES = {
    "COL_ActorOnly_WindowFixed_Gym_North_02",
    "COL_GymStageSideWall_East_Left",
    "COL_GymStageSideWall_East_Lintel",
    "COL_GymStageSideWall_East_Right",
    "COL_GymStageSideWall_West_Left",
    "COL_GymStageSideWall_West_Lintel",
    "COL_GymStageSideWall_West_Right",
    "LNK_bit-roof-north-east_A",
    "LNK_bit-roof-north-east_B",
    "LNK_bit-roof-west-south_A",
    "LNK_bit-roof-west-south_B",
    "LNK_bit-window-gym-north-02-u01_A",
    "LNK_bit-window-gym-north-02-u01_B",
    "COL_HumanOnly_Window_Gym_North_02_U01",
    "VIS_WindowFrame_Gym_North_02",
    "VIS_WindowGlass_Gym_North_02",
    "COL_B03_ChangingBenches",
}
T05_ALLOWED_CHANGED_EXACT_NAMES = {
    "COL_ActorOnly_WindowFixed_F02_CourtyardNorth_Corridor_03",
    "COL_ActorOnly_WindowFixed_F03_CourtyardNorth_Corridor_03",
    "COL_ActorOnly_WindowFixed_Gym_East_01",
    "COL_ActorOnly_WindowFixed_Gym_East_02",
    "COL_ActorOnly_WindowFixed_Gym_East_03",
    "COL_ActorOnly_WindowFixed_Gym_West_01",
    "COL_ActorOnly_WindowFixed_Gym_West_02",
    "COL_ActorOnly_WindowFixed_Gym_West_03",
    "COL_B03_ExteriorWalls_F02",
    "COL_B03_ExteriorWalls_F03",
    "COL_B03_ExteriorWalls_F04",
    "COL_B03_GymExteriorWalls",
    "COL_Floor_Gym",
    "COL_GymRoof",
    "COL_GymStage",
    "COL_GymStageStairHeadWall_East",
    "COL_GymStageStairHeadWall_West",
    "COL_GymStageStairRamp_East",
    "COL_GymStageStairRamp_West",
    "COL_GymWall_South",
    "COL_Gate_MainClosed",
    "COL_Gate_UtilityClosed",
    "COL_Perimeter_East",
    "COL_Perimeter_EastNorth",
    "COL_Perimeter_NorthEast",
    "COL_Perimeter_NorthWest",
    "COL_Perimeter_SouthEast",
    "COL_Perimeter_SouthWest",
    "COL_Perimeter_West",
    "COL_Roof_West",
    "COL_SiteGround",
    "COL_HumanOnly_Window_Gym_East_01_U03",
    "COL_HumanOnly_Window_Gym_East_02_U01",
    "COL_HumanOnly_Window_Gym_East_03_U04",
    "COL_HumanOnly_Window_Gym_West_01_U04",
    "COL_HumanOnly_Window_Gym_West_02_U02",
    "COL_HumanOnly_Window_Gym_West_03_U01",
    "COL_HumanOnly_Window_F02_CourtyardNorth_Corridor_03_U01",
    "COL_HumanOnly_Window_F03_CourtyardNorth_Corridor_03_U03",
    "NAV_Blocker_Gym",
    "NAV_Blocker_Perimeter",
    "NAV_Walkable_EntryTransitions",
    "NAV_Walkable_Interior1F",
    "NAV_Walkable_Outdoor",
    "NAV_Walkable_Rooftop",
    "NAV_Walkable_Stairs",
    "VIS_WindowFrame_Gym_East_01",
    "VIS_WindowFrame_Gym_East_02",
    "VIS_WindowFrame_Gym_East_03",
    "VIS_WindowFrame_Gym_West_01",
    "VIS_WindowFrame_Gym_West_02",
    "VIS_WindowFrame_Gym_West_03",
    "VIS_WindowFrame_F02_CourtyardNorth_Corridor_03",
    "VIS_WindowFrame_F03_CourtyardNorth_Corridor_03",
    "VIS_WindowGlass_F02_CourtyardNorth_Corridor_03",
    "VIS_WindowGlass_F03_CourtyardNorth_Corridor_03",
    "VIS_WindowGlass_Gym_East_01",
    "VIS_WindowGlass_Gym_East_02",
    "VIS_WindowGlass_Gym_East_03",
    "VIS_WindowGlass_Gym_West_01",
    "VIS_WindowGlass_Gym_West_02",
    "VIS_WindowGlass_Gym_West_03",
    "VOL_BitSpawn_Courtyard",
    "COL_RooftopFacilityShell",
}
T05_ALLOWED_NEW_EXACT_NAMES = {
    "COL_B03_ElevatorClosedDoor_F02_F03",
    "VOL_NavigationArea_Ground",
    "VOL_NavigationArea_Roof",
    "VOL_NavigationArea_Upper01",
    "VOL_NavigationArea_Upper02",
    "VOL_NavigationArea_Upper03",
    "COL_B03_ElevatorShaftShell",
    "COL_B03_ElevatorStairWall",
    "COL_B03_GymBridgeEnvelope",
    "COL_B03_GymBridgeCeiling",
    "COL_B03_GymBridgeFloor",
    "COL_B03_GymGalleryFloor",
    "COL_B03_GymGalleryGuards",
    "COL_B03_GymGalleryStairs",
    "COL_B03_GymRoofConnectionGuards",
    "COL_B03_GymRoofGapWall",
    "COL_B03_GymRoofGuards",
    "COL_B03_GymRoofRamp",
    "COL_B03_GymRoofRampUnderfill",
    "COL_B03_GymRoofEscapeCrateRamp",
    "COL_B03_GymRoofWalkable",
    "COL_B03_GymStageSideWalls",
    "COL_B03_WestExtensionFloor_F01",
    "COL_B03_SchoolRoofEscapeCrateRamp",
    "MRK_AssemblyAnchor_Courtyard",
    "MRK_AssemblyAnchor_Gym",
    "NAV_BitFlight_ExteriorF1",
    "NAV_BitFlight_ExteriorF2",
    "NAV_BitFlight_ExteriorF3",
    "NAV_BitFlight_ExteriorF4",
    "NAV_BitFlight_GymLow",
    "NAV_BitFlight_GymUpper",
    "NAV_BitFlight_InteriorF1",
    "NAV_BitFlight_InteriorF2",
    "NAV_BitFlight_InteriorF3",
    "NAV_BitFlight_InteriorF4",
    "NAV_BitFlight_Obstacle_school_exterior_outdoor_f1",
    "NAV_BitFlight_Obstacle_school_exterior_outdoor_f2",
    "NAV_BitFlight_Obstacle_school_exterior_outdoor_f3",
    "NAV_BitFlight_Obstacle_school_exterior_outdoor_f4",
    "NAV_BitFlight_Obstacle_school_gym_gym_low",
    "NAV_BitFlight_Obstacle_school_gym_gym_upper",
    "NAV_BitFlight_Obstacle_school_interior_interior_f1",
    "NAV_BitFlight_Obstacle_school_interior_interior_f2",
    "NAV_BitFlight_Obstacle_school_interior_interior_f3",
    "NAV_BitFlight_Obstacle_school_interior_interior_f4",
    "NAV_BitFlight_Obstacle_school_rooftop_roof_flight",
    "NAV_BitFlight_Rooftop",
    "NAV_B03_Walkable_GymGallery",
    "NAV_B03_Walkable_GymGalleryStairs",
    "NAV_B03_Walkable_GymRoofRamp",
    "NAV_B03_Walkable_GymRooftop",
    "VOL_BitFlight_ExteriorF1ToF2",
    "VOL_BitFlight_ExteriorF2ToF3",
    "VOL_BitFlight_ExteriorF3ToF4",
    "VOL_BitFlight_ExteriorF4ToRooftop",
    "VOL_BitFlight_GymLowToUpper",
    "VOL_BitFlight_StairNEF1ToF2",
    "VOL_BitFlight_StairNEF2ToF3",
    "VOL_BitFlight_StairNEF3ToF4",
    "VOL_BitFlight_StairNWF1ToF2",
    "VOL_BitFlight_StairNWF2ToF3",
    "VOL_BitFlight_StairNWF3ToF4",
    "VOL_BitFlight_StairNWF4ToRoof",
    "VOL_BitFlight_StairSWF1ToF2",
    "VOL_BitFlight_StairSWF2ToF3",
    "VOL_BitFlight_StairSWF3ToF4",
    "VOL_Assembly_Courtyard",
    "VOL_Assembly_Gym",
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
    generator_version = bpy.context.scene.get(T05_GENERATOR_VERSION_PROPERTY)
    t04_enabled = correction_version == T04_CORRECTION_VERSION
    t05_enabled = generator_version == T05_GENERATOR_VERSION
    baseline_aperture_endpoints = {
        name
        for name, entry in expected.items()
        if entry.get("properties", {}).get("hs_link_kind") == "bit_window"
    }
    if t05_enabled and len(baseline_aperture_endpoints) != 116:
        raise RuntimeError(
            "旧保護baselineの窓接続端点が116件ではありません: "
            f"{len(baseline_aperture_endpoints)}"
        )
    allowed_change_names = (
        set(T04_ALLOWED_CHANGED_EXACT_NAMES) if t04_enabled else set()
    )
    allowed_missing_names = (
        set(T04_ALLOWED_MISSING_EXACT_NAMES) if t04_enabled else set()
    )
    allowed_new_names = (
        set(T04_ALLOWED_NEW_EXACT_NAMES) if t04_enabled else set()
    )
    if t05_enabled:
        allowed_change_names.update(T05_ALLOWED_CHANGED_EXACT_NAMES)
        allowed_missing_names.update(T05_ALLOWED_MISSING_EXACT_NAMES)
        allowed_change_names.update(
            baseline_aperture_endpoints - allowed_missing_names
        )
        allowed_new_names.update(T05_ALLOWED_NEW_EXACT_NAMES)
    expected_allowed_changes = sorted(allowed_change_names)
    expected_allowed_missing = sorted(allowed_missing_names)
    expected_allowed_new = sorted(allowed_new_names)
    allowed_missing = sorted(
        name for name in all_missing if name in allowed_missing_names
    )
    missing = sorted(
        name for name in all_missing if name not in allowed_missing_names
    )
    allowed_changed = sorted(
        name for name in all_changed if name in allowed_change_names
    )
    changed = sorted(
        name for name in all_changed if name not in allowed_change_names
    )
    all_new = sorted(
        name
        for name in set(current) - set(expected)
        if name in allowed_new_names
        or (
            name not in ALLOWED_NEW_EXACT_NAMES
            and not name.startswith(ALLOWED_NEW_PREFIXES)
        )
    )
    allowed_new = sorted(
        name for name in all_new if name in allowed_new_names
    )
    unexpected = sorted(
        name for name in all_new if name not in allowed_new_names
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
                    "allowed_missing": allowed_missing,
                    "expected_missing": expected_allowed_missing,
                    "allowed_changed": allowed_changed,
                    "expected_changed": expected_allowed_changes,
                    "allowed_new": allowed_new,
                    "expected_new": expected_allowed_new,
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
                "t04_contract": t04_enabled,
                "t05_contract": t05_enabled,
                "allowed_missing": len(allowed_missing),
                "allowed_changed": len(allowed_changed),
                "allowed_new": len(allowed_new),
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
