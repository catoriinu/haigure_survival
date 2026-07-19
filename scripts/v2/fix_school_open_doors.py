from pathlib import Path

import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
TOLERANCE = 1e-5

TOILET_DOORS = (
    "VIS_DoorLeaf_Toilet_M",
    "VIS_DoorLeaf_Toilet_F",
)

OPEN_DOORS = {
    "VIS_NorthEntryDoor_Open_L": {
        "axis": "x",
        "location": 1.725,
        "before_bounds": ((2.475, 45.61, 0.0), (3.825, 45.71, 2.3)),
        "after_bounds": ((1.05, 45.61, 0.0), (2.4, 45.71, 2.3)),
    },
    "VIS_NorthEntryDoor_Open_R": {
        "axis": "x",
        "location": 6.075,
        "before_bounds": ((3.975, 45.61, 0.0), (5.325, 45.71, 2.3)),
        "after_bounds": ((5.4, 45.61, 0.0), (6.75, 45.71, 2.3)),
    },
    "VIS_GymDoor_Open_Courtyard_L": {
        "axis": "y",
        "location": 4.35,
        "before_bounds": ((33.51, 4.85, 0.0), (33.61, 6.15, 2.4)),
        "after_bounds": ((33.51, 3.7, 0.0), (33.61, 5.0, 2.4)),
    },
    "VIS_GymDoor_Open_Courtyard_R": {
        "axis": "y",
        "location": 8.65,
        "before_bounds": ((33.51, 6.85, 0.0), (33.61, 8.15, 2.4)),
        "after_bounds": ((33.51, 8.0, 0.0), (33.61, 9.3, 2.4)),
    },
}


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def assert_bounds(
    obj: bpy.types.Object,
    expected: tuple[tuple[float, ...], tuple[float, ...]],
) -> None:
    actual_minimum, actual_maximum = world_bounds(obj)
    expected_minimum = Vector(expected[0])
    expected_maximum = Vector(expected[1])
    if (actual_minimum - expected_minimum).length > TOLERANCE:
        raise RuntimeError(
            f"{obj.name}の最小境界が想定外です: "
            f"actual={tuple(actual_minimum)}, expected={tuple(expected_minimum)}"
        )
    if (actual_maximum - expected_maximum).length > TOLERANCE:
        raise RuntimeError(
            f"{obj.name}の最大境界が想定外です: "
            f"actual={tuple(actual_maximum)}, expected={tuple(expected_maximum)}"
        )


def require_mesh(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError(f"対象Meshがありません: {name}")
    return obj


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len(bpy.data.objects) != 443 or len(bpy.data.meshes) != 418:
        raise RuntimeError(
            "扉修正前のシーン件数が想定外です: "
            f"objects={len(bpy.data.objects)}, meshes={len(bpy.data.meshes)}"
        )
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 263:
        raise RuntimeError("扉修正前のVIS Object数が263件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 144:
        raise RuntimeError("扉修正前のCOL Object数が144件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]) != 8:
        raise RuntimeError("扉修正前のNAV Object数が8件ではありません")

    toilet_bounds = {
        "VIS_DoorLeaf_Toilet_M": ((-5.35, 38.61, 0.0), (-4.25, 38.71, 2.3)),
        "VIS_DoorLeaf_Toilet_F": ((-0.85, 38.61, 0.0), (0.25, 38.71, 2.3)),
    }
    for name, expected in toilet_bounds.items():
        obj = require_mesh(name)
        if obj.data.users != 1 or obj.data.name != name:
            raise RuntimeError(
                f"{name}のMesh Data契約が想定外です: "
                f"data={obj.data.name}, users={obj.data.users}"
            )
        assert_bounds(obj, expected)

    for name, definition in OPEN_DOORS.items():
        obj = require_mesh(name)
        if tuple(round(value, 8) for value in obj.rotation_euler) != (0.0, 0.0, 0.0):
            raise RuntimeError(f"{name}の回転が0ではありません")
        if tuple(round(value, 8) for value in obj.scale) != (1.0, 1.0, 1.0):
            raise RuntimeError(f"{name}のscaleが(1,1,1)ではありません")
        assert_bounds(obj, definition["before_bounds"])


def main() -> None:
    preflight()

    removed = []
    for name in TOILET_DOORS:
        obj = bpy.data.objects[name]
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh.users != 0:
            raise RuntimeError(f"削除後もMesh Dataが参照されています: {mesh.name}")
        bpy.data.meshes.remove(mesh)
        removed.append(name)

    moved = []
    for name, definition in OPEN_DOORS.items():
        obj = bpy.data.objects[name]
        axis = definition["axis"]
        setattr(obj.location, axis, definition["location"])
        bpy.context.view_layer.update()
        assert_bounds(obj, definition["after_bounds"])
        moved.append(
            {
                "name": name,
                "axis": axis,
                "location": round(getattr(obj.location, axis), 6),
                "bounds": tuple(
                    tuple(round(value, 6) for value in point)
                    for point in world_bounds(obj)
                ),
            }
        )

    if len(bpy.data.objects) != 441 or len(bpy.data.meshes) != 416:
        raise RuntimeError(
            "扉修正後のシーン件数が想定外です: "
            f"objects={len(bpy.data.objects)}, meshes={len(bpy.data.meshes)}"
        )
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 261:
        raise RuntimeError("扉修正後のVIS Object数が261件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 144:
        raise RuntimeError("扉修正後のCOL Object数が144件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]) != 8:
        raise RuntimeError("扉修正後のNAV Object数が8件ではありません")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "meshes": len(bpy.data.meshes),
            "removed": removed,
            "moved": moved,
        }
    )


main()
