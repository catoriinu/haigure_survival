from __future__ import annotations

import argparse
import sys
from pathlib import Path


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

import render_b03_school_architecture_previews as architecture_previews


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = REPOSITORY_ROOT / "docs/plans/v2/B06-1/images"

SCHOOL_STRUCTURE_PREFIXES = (
    "VIS_B03_ExteriorWalls_F",
    "VIS_B03_InteriorWalls_F",
    "VIS_B03_Floor_F",
    "VIS_Floor_",
    "VIS_B03_StoreyBand_F",
    "VIS_B03_StoreyTrim_F",
    "VIS_Wall_",
    "VIS_B03_StairBoundaryCaps_F01",
    "VIS_B03_InterfloorStructure_F01_",
    "VIS_B03_Ceiling_F",
    "VIS_Stairs_",
    "VIS_StairsUpper_",
    "VIS_StairLanding_",
    "VIS_StairSystem_",
    "VIS_StairGuard_",
    "VIS_StairGuardSystem_",
    "VIS_Roof_",
    "VIS_Rooftop",
    "VIS_B03_WestExtension",
    "VIS_B03_Elevator",
    "VIS_B03_GymBridge",
    "VIS_B03_GymExteriorWalls",
    "VIS_B03_GymRoof",
    "VIS_B03_GymGallery",
    "VIS_B03_RooftopEscapeCrates_",
    "VIS_B06_",
)

VIEWS = (
    (
        "02_p1_e02_rooftop_stair_connection",
        (-3.8, 34.0, 19.0),
        (-8.0, 40.0, 14.5),
        48.0,
    ),
    (
        "03_p1_e03_northwest_stair_band_corner",
        (-2.0, 35.0, 12.2),
        (-7.0, 38.2, 11.1),
        50.0,
    ),
    (
        "04_p1_e04_fourth_floor_corridor_band",
        (18.0, 29.0, 12.8),
        (-1.0, 32.7, 11.6),
        46.0,
    ),
    (
        "05_p1_e05_fourth_floor_stair_band",
        (35.0, 33.5, 11.8),
        (42.0, 36.4, 11.0),
        48.0,
    ),
    (
        "06_p1_e06_fourth_floor_window_stair_band",
        (47.0, 34.0, 11.8),
        (41.55, 42.0, 11.0),
        35.0,
    ),
    (
        "08_p1_e08_rooftop_ramp_joint",
        (-4.8, 35.5, 17.0),
        (-8.0, 40.0, 14.45),
        52.0,
    ),
    (
        "09_p1_e09_stair_underside_arrival",
        (37.0, 37.5, 3.0),
        (43.0, 41.2, 2.2),
        52.0,
    ),
    (
        "10_p1_e10_gym_bridge_side_joint",
        (27.0, 16.0, 9.0),
        (41.4, 26.60, 5.0),
        52.0,
    ),
    (
        "14_p1_e14_northeast_stair_underfill",
        (37.5, 41.0, 2.2),
        (43.0, 40.5, 1.7),
        48.0,
    ),
    (
        "15_p1_e15_northeast_stair_wall_band",
        (38.0, 45.0, 2.6),
        (43.0, 41.5, 2.0),
        52.0,
    ),
    (
        "18_school_north_full",
        (17.4, 145.5, 8.0),
        (17.4, 45.5, 8.0),
        55.0,
    ),
    (
        "19_school_south_full",
        (17.4, -103.5, 8.0),
        (17.4, -3.5, 8.0),
        55.0,
    ),
    (
        "20_school_east_full",
        (147.4, 21.0, 8.0),
        (47.4, 21.0, 8.0),
        55.0,
    ),
    (
        "21_school_west_full",
        (-112.6, 21.0, 8.0),
        (-12.6, 21.0, 8.0),
        55.0,
    ),
    (
        "22_rooftop_crate_front",
        (6.0, 12.5, 18.0),
        (-2.0, 12.5, 15.2),
        52.0,
    ),
    (
        "23_rooftop_crate_side",
        (-2.0, 5.0, 16.2),
        (-2.0, 12.5, 15.2),
        52.0,
    ),
    (
        "24_southwest_stair_floor_cutout",
        (2.2, 0.2, 2.0),
        (-7.8, 0.1, 2.2),
        42.0,
    ),
    (
        "25_second_floor_classroom_corner",
        (-9.0, 8.0, 5.2),
        (-3.5, 12.5, 4.7),
        35.0,
    ),
    (
        "26_second_floor_toilet_front_band",
        (-0.5, 32.8, 5.0),
        (-0.5, 36.6, 4.7),
        54.0,
    ),
    (
        "27_first_floor_toilet_staff_corner_bands",
        (4.0, 34.2, 1.65),
        (4.0, 41.0, 0.75),
        48.0,
    ),
    (
        "28_first_floor_northwest_stair_library_floor",
        (-0.4, 34.0, 1.65),
        (-7.5, 36.7, 0.65),
        44.0,
    ),
    (
        "29_first_floor_library_infirmary_band",
        (-0.4, 9.0, 1.65),
        (-3.5, 12.5, 0.55),
        46.0,
    ),
    (
        "30_first_floor_infirmary_south_band",
        (-0.4, -0.2, 1.65),
        (-4.2, 2.5, 0.55),
        46.0,
    ),
    (
        "31_first_floor_elevator_hall_floor_band",
        (-2.0, -5.1, 1.65),
        (-8.75, -5.1, 1.10),
        46.0,
    ),
    (
        "32_second_floor_southwest_stair_elevator_joint",
        (-3.2, -0.4, 5.2),
        (-8.1, -3.5, 3.45),
        46.0,
    ),
    (
        "33_first_transition_stair_pitch",
        (-15.0, 41.0, 3.6),
        (-8.2, 41.0, 2.4),
        48.0,
    ),
    (
        "34_third_floor_toilet_staff_corner_bands",
        (4.0, 34.2, 8.85),
        (4.0, 41.0, 7.95),
        48.0,
    ),
    (
        "35_fourth_floor_toilet_staff_corner_bands",
        (4.0, 34.2, 12.45),
        (4.0, 41.0, 11.55),
        48.0,
    ),
    (
        "36_second_floor_library_infirmary_band",
        (-0.4, 9.0, 5.25),
        (-3.5, 12.5, 4.15),
        46.0,
    ),
    (
        "37_fourth_floor_northeast_stair_band_corner",
        (45.096, 34.088, 12.45),
        (32.0, 34.088, 11.55),
        48.0,
    ),
    (
        "38_fourth_floor_northwest_stair_west_band",
        (-11.0, 41.0, 12.4),
        (-6.75, 41.0, 11.55),
        48.0,
    ),
    (
        "39_first_floor_schoolyard_exit_corner",
        (-2.468, 36.68, 1.65),
        (-2.468, 41.0, 1.0),
        52.0,
    ),
    (
        "40_third_floor_gym_roof_ramp_joint",
        (41.4, 35.0, 8.7),
        (41.4, 31.8, 7.25),
        50.0,
    ),
    (
        "41_northwest_stair_interfloor_cladding",
        (-7.8, 35.0, 5.0),
        (-8.2, 39.0, 3.3),
        48.0,
    ),
    (
        "42_northeast_stair_interfloor_cladding",
        (43.2, 35.0, 5.0),
        (42.5, 39.0, 3.3),
        48.0,
    ),
    (
        "43_gym_rooftop_shared_crates",
        (41.0, -2.0, 12.6),
        (35.5, -8.0, 10.2),
        50.0,
    ),
    (
        "44_school_rooftop_shared_crates",
        (5.5, 12.5, 18.0),
        (-2.0, 12.5, 15.2),
        50.0,
    ),
    (
        "45_first_floor_northwest_stair_approach_floor",
        (-12.036, 33.316, 1.65),
        (-11.0, 40.5, 1.2),
        52.0,
    ),
    (
        "46_first_floor_pc_room_northeast_stair_corner_band",
        (35.5, 33.2, 1.65),
        (41.5, 36.7, 0.75),
        48.0,
    ),
    (
        "47_fourth_floor_northeast_stair_gym_side_band",
        (44.5, 41.5, 12.45),
        (47.25, 40.0, 11.55),
        48.0,
    ),
    (
        "48_fourth_floor_girls_toilet_corner_band",
        (0.5, 35.0, 12.45),
        (2.5, 38.65, 11.55),
        48.0,
    ),
    (
        "49_fourth_floor_west_north_wing_joint_band",
        (-2.0, 35.0, 12.45),
        (0.1, 32.65, 11.55),
        48.0,
    ),
    (
        "50_second_floor_southwest_stair_classroom_band",
        (-0.5, 4.5, 5.25),
        (-3.35, 3.0, 4.15),
        48.0,
    ),
    (
        "51_second_floor_elevator_under_stair_wall_band",
        (-1.0, -1.5, 5.25),
        (-7.0, -4.0, 4.15),
        48.0,
    ),
    (
        "52_first_floor_elevator_side_rear_closure",
        (-4.8, -5.1, 1.65),
        (-9.1, -5.1, 1.1),
        48.0,
    ),
    (
        "53_second_floor_north_corridor_front_band",
        (3.404, 36.2, 5.25),
        (3.4, 45.35, 4.0),
        50.0,
    ),
    (
        "54_first_floor_elevator_south_wall_closure",
        (-4.3, -6.428, 1.65),
        (-8.72, -6.45, 1.1),
        48.0,
    ),
    (
        "55_fourth_floor_elevator_door_threshold",
        (-5.576, -4.364, 12.45),
        (-8.82, -5.1, 11.2),
        48.0,
    ),
    (
        "56_third_floor_gym_roof_ramp_foot",
        (46.0, 34.0, 8.5),
        (41.5, 32.5, 7.2),
        46.0,
    ),
    (
        "57_second_floor_southwest_stair_landing_band",
        (2.7, 0.6, 5.25),
        (-6.0, -3.75, 4.1),
        48.0,
    ),
    (
        "58_fourth_floor_ll_window_interior_no_band",
        (12.0, 40.0, 12.45),
        (12.0, 45.35, 11.55),
        48.0,
    ),
    (
        "59_fourth_floor_classroom03_stair_side_interior_no_band",
        (-8.0, 27.0, 12.45),
        (-8.0, 32.35, 11.55),
        48.0,
    ),
    (
        "60_fourth_floor_classroom03_room02_divider_no_band",
        (-8.0, 27.0, 12.45),
        (-8.0, 22.5, 11.55),
        48.0,
    ),
    (
        "61_third_floor_art_room_corridor_corner",
        (3.0, 35.0, 8.85),
        (5.55, 36.65, 7.95),
        48.0,
    ),
    (
        "62_second_floor_northeast_special_room_corner",
        (39.0, 35.0, 5.25),
        (41.55, 36.65, 4.35),
        48.0,
    ),
)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("before", "after"))
    parser.add_argument("--blend-path", type=Path)
    parser.add_argument("--only", action="append", default=[])
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def main() -> None:
    arguments = parse_arguments()
    phase = arguments.phase
    if arguments.blend_path is not None:
        architecture_previews.BLEND_PATH = arguments.blend_path.resolve()
    architecture_previews.OUTPUT_DIRECTORY = OUTPUT_ROOT / phase
    selected_views = tuple(
        view for view in VIEWS if not arguments.only or view[0] in arguments.only
    )
    if arguments.only and len(selected_views) != len(set(arguments.only)):
        missing = sorted(set(arguments.only) - {view[0] for view in selected_views})
        raise RuntimeError(f"未定義のB06-1固定視点です: {missing}")
    architecture_previews.VIEWS = selected_views
    for obj in architecture_previews.bpy.data.objects:
        if obj.name.startswith(("MAP_", "PRT_")):
            obj.hide_render = True
    architecture_previews.VIEW_SHOW_PREFIXES = {
        name: SCHOOL_STRUCTURE_PREFIXES for name, *_ in selected_views
    }
    architecture_previews.VIEW_SHOW_PREFIXES.update(
        {
            "02_p1_e02_rooftop_stair_connection": (
                "VIS_StairSystem_NW_4FToRooftop",
                "VIS_StairGuardSystem_NW_4FToRooftop",
                "VIS_Roof_West",
                "VIS_Roof_North",
                "VIS_RooftopFacility",
                "VIS_B03_Floor_F04",
                "VIS_B03_StoreyBand_F04",
            ),
            "03_p1_e03_northwest_stair_band_corner": (
                "VIS_StairSystem_NW_",
                "VIS_StairGuardSystem_NW_",
                "VIS_B03_InteriorWalls_F04",
                "VIS_B03_ExteriorWalls_F04",
                "VIS_B03_Floor_F04",
                "VIS_B03_StoreyBand_F04",
            ),
            "08_p1_e08_rooftop_ramp_joint": (
                "VIS_StairSystem_NW_4FToRooftop",
                "VIS_StairGuardSystem_NW_4FToRooftop",
                "VIS_Roof_West",
                "VIS_Roof_North",
                "VIS_RooftopFacility",
            ),
            "09_p1_e09_stair_underside_arrival": (
                "VIS_Stairs_NE",
                "VIS_StairsUpper_NE",
                "VIS_StairLanding_NE",
                "VIS_StairGuard_NE_",
                "VIS_B03_Floor_F02",
            ),
            "10_p1_e10_gym_bridge_side_joint": (
                "VIS_B03_GymBridgeFloor",
                "VIS_B03_GymBridgeWindowFrames",
                "VIS_B03_GymBridgeWindowGlass",
                "VIS_B06_GymBridgeSideInfill",
            ),
            "14_p1_e14_northeast_stair_underfill": (
                "VIS_Stairs_NE",
                "VIS_StairsUpper_NE",
                "VIS_StairLanding_NE",
                "VIS_StairGuard_NE_",
            ),
            "15_p1_e15_northeast_stair_wall_band": (
                "VIS_Stairs_NE",
                "VIS_StairsUpper_NE",
                "VIS_StairGuard_NE_",
                "VIS_B03_ExteriorWalls_F01",
                "VIS_B03_InteriorWalls_F02",
                "VIS_B03_Floor_F02",
                "VIS_B03_StoreyBand_F01",
                "VIS_B03_StoreyBand_F02",
            ),
            "24_southwest_stair_floor_cutout": (
                "VIS_Stairs_SW",
                "VIS_StairsUpper_SW",
                "VIS_StairLanding_SW",
                "VIS_StairGuard_SW_",
                "VIS_Wall_",
                "VIS_B03_Floor_F02",
                "VIS_B03_ExteriorWalls_F01",
                "VIS_B03_InteriorWalls_F02",
                "VIS_B03_StoreyBand_F01",
                "VIS_B03_StoreyBand_F02",
            ),
            "25_second_floor_classroom_corner": (
                "VIS_B03_InteriorWalls_F02",
                "VIS_B03_StoreyBand_F02",
                "VIS_B03_Floor_F02",
            ),
            "26_second_floor_toilet_front_band": (
                "VIS_B03_InteriorWalls_F02",
                "VIS_B03_Interior_F02_Toilets_Architecture",
                "VIS_B03_StoreyBand_F02",
                "VIS_B03_Floor_F02",
            ),
            "31_first_floor_elevator_hall_floor_band": (
                "VIS_B03_ElevatorShaftShell",
                "VIS_B06_ElevatorCallPanel_F01",
                "VIS_DoorPanel_ElevatorLanding_F01",
                "VIS_ElevatorThresholdPlate_F01",
                "VIS_B06_WestExtensionFloorFinish_F01",
                "VIS_B03_StoreyBand_F01",
            ),
            "32_second_floor_southwest_stair_elevator_joint": (
                "VIS_Stairs_SW",
                "VIS_StairsUpper_SW",
                "VIS_StairLanding_SW",
                "VIS_StairGuard_SW_",
                "VIS_B03_Floor_F02",
                "VIS_B03_StoreyBand_F02",
                "VIS_B03_ElevatorShaftShell",
                "VIS_B06_ElevatorCallPanel_F01",
            ),
            "33_first_transition_stair_pitch": (
                "VIS_Stairs_NW",
                "VIS_StairsUpper_NW",
                "VIS_StairLanding_NW",
                "VIS_StairGuard_NW_",
            ),
            "40_third_floor_gym_roof_ramp_joint": (
                "VIS_B03_GymRoofRamp",
                "VIS_B03_GymRoofRampUnderfill",
                "VIS_B03_GymRoofRampSideCladding",
                "VIS_B03_Floor_F03",
                "VIS_B03_GymRoofConnectionGuards",
            ),
            "52_first_floor_elevator_side_rear_closure": (
                "VIS_B03_ElevatorShaftShell",
                "VIS_B06_ElevatorCallPanel_F01",
                "VIS_DoorPanel_ElevatorLanding_F01",
                "VIS_ElevatorThresholdPlate_F01",
                "VIS_B06_WestExtensionFloorFinish_F01",
                "VIS_B03_StoreyBand_F01",
            ),
            "53_second_floor_north_corridor_front_band": (
                "VIS_B03_ExteriorWalls_F02",
                "VIS_B03_InteriorWalls_F02",
                "VIS_B03_Floor_F02",
                "VIS_B03_StoreyBand_F02",
            ),
            "54_first_floor_elevator_south_wall_closure": (
                "VIS_B03_ElevatorShaftShell",
                "VIS_B06_ElevatorCallPanel_F01",
                "VIS_DoorPanel_ElevatorLanding_F01",
                "VIS_ElevatorThresholdPlate_F01",
                "VIS_B06_WestExtensionFloorFinish_F01",
                "VIS_B03_StoreyBand_F01",
            ),
            "55_fourth_floor_elevator_door_threshold": (
                "VIS_B03_ElevatorShaftShell",
                "VIS_DoorPanel_ElevatorLanding_F04",
                "VIS_ElevatorThresholdPlate_F04",
                "VIS_B03_Floor_F04",
                "VIS_B03_StoreyBand_F04",
            ),
            "56_third_floor_gym_roof_ramp_foot": (
                "VIS_B03_GymRoofRamp",
                "VIS_B03_GymRoofRampUnderfill",
                "VIS_B03_GymRoofRampSideCladding",
                "VIS_B03_Floor_F03",
                "VIS_B03_GymRoofConnectionGuards",
            ),
            "57_second_floor_southwest_stair_landing_band": (
                "VIS_Stairs_SW",
                "VIS_StairsUpper_SW",
                "VIS_StairLanding_SW",
                "VIS_StairGuard_SW_",
                "VIS_B03_Floor_F02",
                "VIS_B03_StoreyBand_F02",
            ),
        }
    )
    architecture_previews.main()


if __name__ == "__main__":
    main()
