from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from build_b03_school_interactive_assets import ROOM_VARIANT_SPECS


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
OUTPUT_DIRECTORY = (
    REPOSITORY_ROOT / "docs/plans/v2/B03/images/interactive"
)

DOOR_COMPARISON_VIEWS = (
    {
        "name": "door-room-sliding-f02-classroom-01",
        "reference": "MRK_Door_F02_Classroom01_01",
        "doors": (
            "MRK_Door_F02_Classroom01_01",
        ),
        "frame_kind": "room",
        "stage_rotation_z": -math.pi / 2.0,
        "camera": (0.0, -10.5, 4.0),
        "target": (0.0, 0.0, 1.15),
        "lens": 52.0,
    },
    {
        "name": "door-toilet-swing-f01-m-01",
        "reference": "MRK_Door_ToiletStall_F01_M_01",
        "doors": (
            "MRK_Door_ToiletStall_F01_M_01",
        ),
        "frame_kind": "toilet",
        "stage_rotation_z": 0.0,
        "camera": (1.2, -10.0, 3.6),
        "target": (0.0, 0.0, 0.95),
        "lens": 52.0,
    },
    {
        "name": "elevator-f04-initial-car",
        "reference": "MRK_ElevatorStop_F04",
        "doors": (
            "MRK_Door_ElevatorLanding_F04",
            "MRK_Door_ElevatorCar_School",
        ),
        "extras": (
            "VIS_ElevatorCar_School",
            "VIS_ElevatorThresholdPlate_F04",
            "VIS_ElevatorCallIndicator_Base_F04",
            "VIS_ElevatorCallIndicator_Direction_F04",
        ),
        "frame_kind": "elevator",
        "stage_rotation_z": 0.0,
        "camera": (0.0, -11.5, 4.2),
        "target": (0.0, -0.85, 1.2),
        "lens": 50.0,
    },
    {
        "name": "elevator-f01-call-indicator",
        "reference": "MRK_ElevatorStop_F01",
        "doors": (
            "MRK_Door_ElevatorLanding_F01",
        ),
        "extras": (
            "VIS_ElevatorThresholdPlate_F01",
            "VIS_ElevatorCallIndicator_Base_F01",
            "VIS_ElevatorCallIndicator_Direction_F01",
        ),
        "frame_kind": "elevator",
        "stage_rotation_z": 0.0,
        "camera": (0.0, -11.5, 4.2),
        "target": (0.0, -1.25, 0.75),
        "lens": 50.0,
    },
)


def token(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def descendants(root: bpy.types.Object) -> set[bpy.types.Object]:
    result: set[bpy.types.Object] = set()
    pending = list(root.children)
    while pending:
        child = pending.pop()
        result.add(child)
        pending.extend(child.children)
    return result


def create_floor(
    name: str,
    bounds_xy: tuple[float, float, float, float],
    base_z: float,
    offset_x: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    minimum_x, maximum_x, minimum_y, maximum_y = bounds_xy
    bpy.ops.mesh.primitive_cube_add(
        location=(
            (minimum_x + maximum_x) / 2.0 + offset_x,
            (minimum_y + maximum_y) / 2.0,
            base_z - 0.04,
        )
    )
    floor = bpy.context.object
    floor.name = name
    floor.scale = (
        (maximum_x - minimum_x) / 2.0,
        (maximum_y - minimum_y) / 2.0,
        0.04,
    )
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    floor.data.materials.append(material)
    return floor


def create_context_box(
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    material: bpy.types.Material,
    stage_matrix: Matrix,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(value / 2.0 for value in size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    obj.matrix_world = (
        stage_matrix
        @ Matrix.Translation(Vector(center))
    )
    return obj


def create_context_frame(
    name: str,
    frame_kind: str,
    material: bpy.types.Material,
    stage_matrix: Matrix,
) -> list[bpy.types.Object]:
    if frame_kind == "room":
        boxes = (
            ((0.0, -0.72, 1.20), (0.18, 0.24, 2.40)),
            ((0.0, 0.72, 1.20), (0.18, 0.24, 2.40)),
            ((0.0, 0.0, 2.40), (0.18, 1.68, 0.20)),
            ((0.0, 0.0, -0.04), (1.20, 2.40, 0.08)),
        )
    elif frame_kind == "toilet":
        boxes = (
            ((-1.48, 0.0, 0.95), (0.16, 0.16, 1.90)),
            ((0.08, 0.0, 0.95), (0.16, 0.16, 1.90)),
            ((-0.70, 0.0, 1.90), (1.72, 0.16, 0.20)),
            ((-0.70, 0.0, -0.04), (2.20, 2.20, 0.08)),
        )
    elif frame_kind == "elevator":
        boxes = (
            ((-0.95, -1.46, 1.20), (0.50, 0.18, 2.40)),
            ((0.95, -1.46, 1.20), (0.50, 0.18, 2.40)),
            ((0.0, -1.46, 2.45), (2.40, 0.18, 0.30)),
            ((0.0, -0.55, -0.04), (2.40, 2.20, 0.08)),
        )
    else:
        raise RuntimeError(f"未登録の比較frameです: {frame_kind}")
    return [
        create_context_box(
            f"{name}_{index:02d}",
            center,
            size,
            material,
            stage_matrix,
        )
        for index, (center, size) in enumerate(boxes, 1)
    ]


def duplicate_mesh(
    source: bpy.types.Object,
    name: str,
    matrix_world: Matrix,
) -> bpy.types.Object:
    duplicate = bpy.data.objects.new(name, source.data.copy())
    bpy.context.scene.collection.objects.link(duplicate)
    duplicate.matrix_world = matrix_world
    return duplicate


def create_door_state(
    view: dict[str, object],
    *,
    state: str,
    group_offset_x: float,
    frame_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    reference = bpy.data.objects[str(view["reference"])]
    reference_inverse = reference.matrix_world.inverted()
    stage_matrix = (
        Matrix.Translation(Vector((group_offset_x, 0.0, 0.0)))
        @ Matrix.Rotation(float(view["stage_rotation_z"]), 4, "Z")
    )
    created = create_context_frame(
        f"B03_INTERACTIVE_PREVIEW_{view['name']}_{state}_Frame",
        str(view["frame_kind"]),
        frame_material,
        stage_matrix,
    )

    for door_name in view["doors"]:
        door = bpy.data.objects[str(door_name)]
        panels = tuple(
            child
            for child in door.children
            if child.get("hs_role") == "door_panel"
        )
        for panel in panels:
            visual_children = tuple(
                child
                for child in panel.children
                if child.type == "MESH" and child.name.startswith("VIS_")
            )
            if not visual_children:
                raise RuntimeError(
                    f"{panel.name}: 比較対象VISがありません"
                )
            if state == "closed":
                open_pose = None
            elif state == "open":
                open_poses = tuple(
                    child
                    for child in door.children
                    if child.get("hs_role") == "door_open_pose"
                    and child.get("hs_panel_id") == panel.get("hs_id")
                )
                if len(open_poses) != 1:
                    raise RuntimeError(
                        f"{panel.name}: 比較対象open poseが1件ではありません"
                    )
                open_pose = open_poses[0]
            else:
                raise RuntimeError(f"未登録の扉比較stateです: {state}")
            for visual_child in visual_children:
                if state == "closed":
                    relative_matrix = (
                        reference_inverse @ visual_child.matrix_world
                    )
                else:
                    relative_matrix = (
                        reference_inverse
                        @ door.matrix_world
                        @ open_pose.matrix_basis
                        @ visual_child.matrix_basis
                    )
                created.append(
                    duplicate_mesh(
                        visual_child,
                        (
                            f"B03_INTERACTIVE_PREVIEW_{view['name']}_"
                            f"{state}_{visual_child.name}"
                        ),
                        stage_matrix @ relative_matrix,
                    )
                )

    for extra_name in view.get("extras", ()):
        extra = bpy.data.objects[str(extra_name)]
        created.append(
            duplicate_mesh(
                extra,
                (
                    f"B03_INTERACTIVE_PREVIEW_{view['name']}_"
                    f"{state}_{extra.name}"
                ),
                stage_matrix @ reference_inverse @ extra.matrix_world,
            )
        )
    return created


def main() -> None:
    if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
        raise RuntimeError(f"B03-3C対象外のBlenderファイルです: {bpy.data.filepath}")
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    original_camera = scene.camera
    original_engine = scene.render.engine
    original_filepath = scene.render.filepath
    original_resolution = (
        scene.render.resolution_x,
        scene.render.resolution_y,
        scene.render.resolution_percentage,
    )
    original_file_format = scene.render.image_settings.file_format
    original_world_color = tuple(scene.world.color)
    original_hide_render = {
        obj.name: obj.hide_render for obj in bpy.data.objects
    }

    camera_data = bpy.data.cameras.new("B03_INTERACTIVE_PREVIEW_Camera")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new(
        "B03_INTERACTIVE_PREVIEW_Camera",
        camera_data,
    )
    scene.collection.objects.link(camera)
    scene.camera = camera

    sun_data = bpy.data.lights.new("B03_INTERACTIVE_PREVIEW_Sun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("B03_INTERACTIVE_PREVIEW_Sun", sun_data)
    sun.rotation_euler = (
        math.radians(24.0),
        math.radians(-28.0),
        math.radians(32.0),
    )
    scene.collection.objects.link(sun)

    area_data = bpy.data.lights.new("B03_INTERACTIVE_PREVIEW_Area", "AREA")
    area_data.energy = 2600.0
    area_data.shape = "DISK"
    area_data.size = 24.0
    area = bpy.data.objects.new("B03_INTERACTIVE_PREVIEW_Area", area_data)
    scene.collection.objects.link(area)

    floor_material = bpy.data.materials.new(
        "B03_INTERACTIVE_PREVIEW_FloorMaterial"
    )
    floor_material.diffuse_color = (0.36, 0.32, 0.25, 1.0)
    floor_material.use_nodes = True
    shader = floor_material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.36, 0.32, 0.25, 1.0)
    shader.inputs["Roughness"].default_value = 0.9
    frame_material = bpy.data.materials.new(
        "B03_INTERACTIVE_PREVIEW_FrameMaterial"
    )
    frame_material.diffuse_color = (0.72, 0.75, 0.78, 1.0)
    frame_material.use_nodes = True
    frame_shader = frame_material.node_tree.nodes.get("Principled BSDF")
    frame_shader.inputs["Base Color"].default_value = (
        0.72,
        0.75,
        0.78,
        1.0,
    )
    frame_shader.inputs["Roughness"].default_value = 0.82

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.035, 0.042, 0.052)

    outputs = []
    for room in ROOM_VARIANT_SPECS:
        room_token = token(room.author_name)
        normal = bpy.data.objects.get(
            f"MRK_RoomVariant_{room_token}_Normal"
        )
        disordered = bpy.data.objects.get(
            f"MRK_RoomVariant_{room_token}_Disordered"
        )
        if normal is None or disordered is None:
            raise RuntimeError(
                f"比較対象variant markerがありません: {room.room_id}"
            )
        visible_objects = {
            obj
            for root in (normal, disordered)
            for obj in descendants(root)
            if obj.type == "MESH" and obj.name.startswith("VIS_")
        }
        if not visible_objects:
            raise RuntimeError(
                f"比較対象variant表示がありません: {room.room_id}"
            )
        for obj in bpy.data.objects:
            if obj.type == "MESH":
                obj.hide_render = obj not in visible_objects

        minimum_x, maximum_x, minimum_y, maximum_y = room.bounds_xy
        room_width = maximum_x - minimum_x
        room_depth = maximum_y - minimum_y
        separation = room_width + 1.5
        normal_offset = -separation / 2.0
        disordered_offset = separation / 2.0
        normal.location.x = normal_offset
        disordered.location.x = disordered_offset
        normal_floor = create_floor(
            f"B03_INTERACTIVE_PREVIEW_{room_token}_NormalFloor",
            room.bounds_xy,
            room.base_z,
            normal_offset,
            floor_material,
        )
        disordered_floor = create_floor(
            f"B03_INTERACTIVE_PREVIEW_{room_token}_DisorderedFloor",
            room.bounds_xy,
            room.base_z,
            disordered_offset,
            floor_material,
        )
        normal_floor.hide_render = False
        disordered_floor.hide_render = False

        center = (
            (minimum_x + maximum_x) / 2.0,
            (minimum_y + maximum_y) / 2.0,
            room.base_z + 0.65,
        )
        combined_width = room_width * 2.0 + 1.5
        extent = max(combined_width, room_depth)
        camera_data.ortho_scale = extent * 1.25
        camera.location = (
            center[0],
            center[1] - extent * 0.9,
            room.base_z + extent * 0.95,
        )
        point_at(camera, center)
        area.location = (
            center[0] - extent * 0.25,
            center[1] - extent * 0.25,
            room.base_z + extent * 1.2,
        )
        point_at(area, center)

        output_path = OUTPUT_DIRECTORY / f"{room.room_id}.png"
        scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)
        outputs.append(
            {
                "roomId": room.room_id,
                "path": str(output_path.relative_to(REPOSITORY_ROOT)),
                "bytes": output_path.stat().st_size,
                "normalSide": "left",
                "disorderedSide": "right",
            }
        )

        normal.location.x = 0.0
        disordered.location.x = 0.0
        bpy.data.objects.remove(normal_floor, do_unlink=True)
        bpy.data.objects.remove(disordered_floor, do_unlink=True)

    camera_data.type = "PERSP"
    for view in DOOR_COMPARISON_VIEWS:
        for obj in bpy.data.objects:
            if obj.type == "MESH":
                obj.hide_render = True
        created = [
            *create_door_state(
                view,
                state="closed",
                group_offset_x=-2.35,
                frame_material=frame_material,
            ),
            *create_door_state(
                view,
                state="open",
                group_offset_x=2.35,
                frame_material=frame_material,
            ),
        ]
        for obj in created:
            obj.hide_render = False
        camera.location = tuple(view["camera"])
        camera_data.lens = float(view["lens"])
        camera_data.sensor_width = 36.0
        target = tuple(view["target"])
        point_at(camera, target)
        area.location = (
            camera.location.x,
            camera.location.y,
            camera.location.z + 3.0,
        )
        point_at(area, target)
        output_path = OUTPUT_DIRECTORY / f"{view['name']}.png"
        scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)
        outputs.append(
            {
                "path": str(output_path.relative_to(REPOSITORY_ROOT)),
                "bytes": output_path.stat().st_size,
                "view": view["name"],
                "closedSide": "left",
                "openSide": "right",
            }
        )
        for obj in created:
            bpy.data.objects.remove(obj, do_unlink=True)

    for name, hidden in original_hide_render.items():
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_render = hidden
    scene.camera = original_camera
    scene.render.engine = original_engine
    scene.render.filepath = original_filepath
    scene.render.resolution_x = original_resolution[0]
    scene.render.resolution_y = original_resolution[1]
    scene.render.resolution_percentage = original_resolution[2]
    scene.render.image_settings.file_format = original_file_format
    scene.world.color = original_world_color
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)
    bpy.data.objects.remove(sun, do_unlink=True)
    bpy.data.lights.remove(sun_data)
    bpy.data.objects.remove(area, do_unlink=True)
    bpy.data.lights.remove(area_data)
    bpy.data.materials.remove(floor_material)
    bpy.data.materials.remove(frame_material)
    print(
        "B03_INTERACTIVE_PREVIEWS="
        + json.dumps(outputs, ensure_ascii=False, sort_keys=True)
    )


if __name__ == "__main__":
    main()
