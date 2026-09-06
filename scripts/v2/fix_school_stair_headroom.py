from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
TOLERANCE = 1e-5
UPPER_SHIFT = 0.6

NORTH_OUTER = (-12.6, 47.4, 32.5, 45.5)
WEST_OUTER = (-12.6, 0.0, -3.5, 32.5)
NORTH_STAIR_OPENINGS = (
    (-12.45, -6.75, 38.9, 45.35),
    (41.55, 47.25, 38.9, 45.35),
)
WEST_STAIR_OPENINGS = ((-12.45, -6.0, -3.35, 2.35),)

EXPECTED_BOUNDS = {
    "COL_Ceiling1F_North": ((-12.6, 32.5, 2.9), (47.4, 45.5, 3.0)),
    "COL_Ceiling1F_West": ((-12.6, -3.5, 2.9), (0.0, 32.5, 3.0)),
    "COL_2F_NorthVolume": ((-12.6, 32.5, 3.0), (47.4, 45.5, 6.0)),
    "COL_2F_WestVolume": ((-12.6, -3.5, 3.0), (0.0, 32.5, 6.0)),
    "COL_3F_NorthVolume": ((-12.6, 32.5, 6.0), (47.4, 45.5, 9.0)),
    "COL_3F_WestVolume": ((-12.6, -3.5, 6.0), (0.0, 32.5, 9.0)),
    "COL_StairLanding_NE": ((41.4, 43.1, 1.4), (47.4, 45.5, 1.5)),
    "COL_StairLanding_NW": ((-12.6, 43.1, 1.4), (-6.6, 45.5, 1.5)),
    "COL_StairLanding_SW": ((-12.6, -3.5, 1.4), (-10.2, 2.5, 1.5)),
    "COL_StairRamp_NE": ((41.4, 38.9, 0.0), (43.8, 43.1, 1.5)),
    "COL_StairRamp_NW": ((-12.6, 38.9, 0.0), (-10.2, 43.1, 1.5)),
    "COL_StairRamp_SW": ((-10.2, -3.5, 0.0), (-6.0, -1.1, 1.5)),
}

STAIRS = {
    "NE": {
        "lower_visual": "VIS_Stairs_NE",
        "lower_collider": "COL_StairRamp_NE",
        "landing_visual": "VIS_StairLanding_NE",
        "landing_collider": "COL_StairLanding_NE",
        "upper_visual": "VIS_StairsUpper_NE",
        "upper_collider": "COL_StairRampUpper_NE",
        "lower_width": (41.4, 43.8),
        "upper_width": (45.0, 47.4),
        "landing_bounds": ((41.4, 43.1, 2.3), (47.4, 45.5, 2.4)),
        "lower_axis": "y",
        "lower_start": 38.9,
        "lower_end": 43.1,
        "upper_axis": "y",
        "upper_start": 43.1,
        "upper_end": 40.7,
        "upper_landing_end": 38.9,
        "lower_guard_width": (43.64, 43.8),
        "landing_guard_bounds": ((43.8, 43.1, 2.4), (45.0, 43.26, 3.45)),
        "upper_guard_width": (45.0, 45.16),
        "closure_bounds": ((45.0, 42.29, 0.0), (47.4, 42.49, 6.6)),
    },
    "NW": {
        "lower_visual": "VIS_Stairs_NW",
        "lower_collider": "COL_StairRamp_NW",
        "landing_visual": "VIS_StairLanding_NW",
        "landing_collider": "COL_StairLanding_NW",
        "upper_visual": "VIS_StairsUpper_NW",
        "upper_collider": "COL_StairRampUpper_NW",
        "lower_width": (-12.6, -10.2),
        "upper_width": (-9.0, -6.6),
        "landing_bounds": ((-12.6, 43.1, 2.3), (-6.6, 45.5, 2.4)),
        "lower_axis": "y",
        "lower_start": 38.9,
        "lower_end": 43.1,
        "upper_axis": "y",
        "upper_start": 43.1,
        "upper_end": 40.7,
        "upper_landing_end": 38.9,
        "lower_guard_width": (-10.36, -10.2),
        "landing_guard_bounds": ((-10.2, 43.1, 2.4), (-9.0, 43.26, 3.45)),
        "upper_guard_width": (-9.0, -8.84),
        "closure_bounds": ((-9.0, 42.29, 0.0), (-6.6, 42.49, 6.6)),
    },
    "SW": {
        "lower_visual": "VIS_Stairs_SW",
        "lower_collider": "COL_StairRamp_SW",
        "landing_visual": "VIS_StairLanding_SW",
        "landing_collider": "COL_StairLanding_SW",
        "upper_visual": "VIS_StairsUpper_SW",
        "upper_collider": "COL_StairRampUpper_SW",
        "lower_width": (-3.5, -1.1),
        "upper_width": (0.1, 2.5),
        "landing_bounds": ((-12.6, -3.5, 2.3), (-10.2, 2.5, 2.4)),
        "lower_axis": "x",
        "lower_start": -6.0,
        "lower_end": -10.2,
        "upper_axis": "x",
        "upper_start": -10.2,
        "upper_end": -7.8,
        "upper_landing_end": -6.0,
        "lower_guard_width": (-1.26, -1.1),
        "landing_guard_bounds": ((-10.36, -1.1, 2.4), (-10.2, 0.1, 3.45)),
        "upper_guard_width": (0.1, 0.26),
        "closure_bounds": ((-9.59, 0.1, 0.0), (-9.39, 2.5, 6.6)),
    },
}


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def assert_bounds(name: str, expected: tuple[tuple[float, ...], tuple[float, ...]]) -> None:
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError(f"対象Meshがありません: {name}")
    actual_minimum, actual_maximum = world_bounds(obj)
    expected_minimum = Vector(expected[0])
    expected_maximum = Vector(expected[1])
    if (actual_minimum - expected_minimum).length > TOLERANCE:
        raise RuntimeError(
            f"{name}の修正前最小境界が想定外です: "
            f"actual={tuple(actual_minimum)}, expected={tuple(expected_minimum)}"
        )
    if (actual_maximum - expected_maximum).length > TOLERANCE:
        raise RuntimeError(
            f"{name}の修正前最大境界が想定外です: "
            f"actual={tuple(actual_maximum)}, expected={tuple(expected_maximum)}"
        )


def preflight() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 263:
        raise RuntimeError("既存B02のVIS Object数が263件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 144:
        raise RuntimeError("既存B02のCOL Object数が144件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]) != 8:
        raise RuntimeError("既存B02のNAV Object数が8件ではありません")
    for name, expected in EXPECTED_BOUNDS.items():
        assert_bounds(name, expected)

    window_2f = [obj for obj in bpy.data.objects if obj.name.startswith("VIS_WindowGuide_2F_")]
    window_3f = [obj for obj in bpy.data.objects if obj.name.startswith("VIS_WindowGuide_3F_")]
    pool = [obj for obj in bpy.data.objects if "Pool" in obj.name]
    if len(window_2f) != 18 or len(window_3f) != 18 or len(pool) != 20:
        raise RuntimeError(
            "上階移動対象数が想定外です: "
            f"window2F={len(window_2f)}, window3F={len(window_3f)}, pool={len(pool)}"
        )


def audit_and_store_mesh(obj: bpy.types.Object, vertices, faces) -> dict[str, object]:
    obj.matrix_world = Matrix.Identity(4)
    mesh = obj.data
    mesh.clear_geometry()
    mesh.from_pydata(vertices, (), faces)
    mesh.name = obj.name
    mesh.update()

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    signed_volume = bm.calc_volume(signed=True)
    if signed_volume < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
        bm.normal_update()
        signed_volume = bm.calc_volume(signed=True)
    degenerate_faces = sum(1 for face in bm.faces if face.calc_area() < 1e-9)
    non_manifold_edges = sum(1 for edge in bm.edges if not edge.is_manifold)
    if signed_volume <= 0 or degenerate_faces != 0 or non_manifold_edges != 0:
        bm.free()
        raise RuntimeError(
            f"Mesh再構築に失敗しました: {obj.name}, volume={signed_volume}, "
            f"degenerate={degenerate_faces}, non_manifold={non_manifold_edges}"
        )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    minimum, maximum = world_bounds(obj)
    return {
        "name": obj.name,
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "signed_volume": round(signed_volume, 6),
        "bounds_min": tuple(round(value, 6) for value in minimum),
        "bounds_max": tuple(round(value, 6) for value in maximum),
    }


def append_box(vertices, faces, minimum, maximum) -> None:
    min_x, min_y, min_z = minimum
    max_x, max_y, max_z = maximum
    offset = len(vertices)
    vertices.extend(
        (
            (min_x, min_y, min_z),
            (min_x, min_y, max_z),
            (min_x, max_y, min_z),
            (min_x, max_y, max_z),
            (max_x, min_y, min_z),
            (max_x, min_y, max_z),
            (max_x, max_y, min_z),
            (max_x, max_y, max_z),
        )
    )
    faces.extend(
        (
            (offset + 0, offset + 2, offset + 3, offset + 1),
            (offset + 4, offset + 5, offset + 7, offset + 6),
            (offset + 0, offset + 1, offset + 5, offset + 4),
            (offset + 2, offset + 6, offset + 7, offset + 3),
            (offset + 0, offset + 4, offset + 6, offset + 2),
            (offset + 1, offset + 3, offset + 7, offset + 5),
        )
    )


def replace_box(obj: bpy.types.Object, minimum, maximum) -> dict[str, object]:
    vertices = []
    faces = []
    append_box(vertices, faces, minimum, maximum)
    return audit_and_store_mesh(obj, vertices, faces)


def replace_steps(
    obj: bpy.types.Object,
    axis: str,
    start: float,
    end: float,
    width: tuple[float, float],
    base_height: float,
    step_count: int,
    rise: float,
    top_landing_end: float | None = None,
) -> dict[str, object]:
    vertices = []
    faces = []
    for index in range(step_count):
        primary_a = start + (end - start) * index / step_count
        primary_b = start + (end - start) * (index + 1) / step_count
        primary_min = min(primary_a, primary_b)
        primary_max = max(primary_a, primary_b)
        top = base_height + rise * (index + 1)
        if axis == "y":
            minimum = (width[0], primary_min, 0.0)
            maximum = (width[1], primary_max, top)
        else:
            minimum = (primary_min, width[0], 0.0)
            maximum = (primary_max, width[1], top)
        append_box(vertices, faces, minimum, maximum)

    if top_landing_end is not None:
        primary_min = min(end, top_landing_end)
        primary_max = max(end, top_landing_end)
        top = base_height + rise * step_count
        if axis == "y":
            minimum = (width[0], primary_min, 0.0)
            maximum = (width[1], primary_max, top)
        else:
            minimum = (primary_min, width[0], 0.0)
            maximum = (primary_max, width[1], top)
        append_box(vertices, faces, minimum, maximum)
    return audit_and_store_mesh(obj, vertices, faces)


def replace_profile_prism(
    obj: bpy.types.Object,
    axis: str,
    width: tuple[float, float],
    profile: tuple[tuple[float, float], ...],
) -> dict[str, object]:
    vertices = []
    for width_value in width:
        for primary, height in profile:
            if axis == "y":
                vertices.append((width_value, primary, height))
            else:
                vertices.append((primary, width_value, height))

    profile_size = len(profile)
    faces = [
        tuple(range(profile_size)),
        tuple(range(profile_size, profile_size * 2)),
    ]
    for index in range(profile_size):
        next_index = (index + 1) % profile_size
        faces.append(
            (
                index,
                next_index,
                profile_size + next_index,
                profile_size + index,
            )
        )
    return audit_and_store_mesh(obj, vertices, faces)


def replace_slab_with_holes(
    obj: bpy.types.Object,
    outer: tuple[float, float, float, float],
    holes: tuple[tuple[float, float, float, float], ...],
    bottom: float,
    top: float,
) -> dict[str, object]:
    min_x, max_x, min_y, max_y = outer
    x_values = sorted({min_x, max_x, *(value for hole in holes for value in hole[:2])})
    y_values = sorted({min_y, max_y, *(value for hole in holes for value in hole[2:])})

    included = {}
    for x_index in range(len(x_values) - 1):
        for y_index in range(len(y_values) - 1):
            center_x = (x_values[x_index] + x_values[x_index + 1]) * 0.5
            center_y = (y_values[y_index] + y_values[y_index + 1]) * 0.5
            included[x_index, y_index] = not any(
                hole[0] < center_x < hole[1] and hole[2] < center_y < hole[3]
                for hole in holes
            )

    vertices = []
    vertex_indices = {}
    faces = []

    def vertex_index(point) -> int:
        key = tuple(round(value, 8) for value in point)
        if key not in vertex_indices:
            vertex_indices[key] = len(vertices)
            vertices.append(point)
        return vertex_indices[key]

    def add_face(points) -> None:
        faces.append(tuple(vertex_index(point) for point in points))

    for (x_index, y_index), is_included in included.items():
        if not is_included:
            continue
        x0 = x_values[x_index]
        x1 = x_values[x_index + 1]
        y0 = y_values[y_index]
        y1 = y_values[y_index + 1]
        add_face(((x0, y0, bottom), (x1, y0, bottom), (x1, y1, bottom), (x0, y1, bottom)))
        add_face(((x0, y0, top), (x0, y1, top), (x1, y1, top), (x1, y0, top)))
        if not included.get((x_index - 1, y_index), False):
            add_face(((x0, y0, bottom), (x0, y1, bottom), (x0, y1, top), (x0, y0, top)))
        if not included.get((x_index + 1, y_index), False):
            add_face(((x1, y0, bottom), (x1, y0, top), (x1, y1, top), (x1, y1, bottom)))
        if not included.get((x_index, y_index - 1), False):
            add_face(((x0, y0, bottom), (x0, y0, top), (x1, y0, top), (x1, y0, bottom)))
        if not included.get((x_index, y_index + 1), False):
            add_face(((x0, y1, bottom), (x1, y1, bottom), (x1, y1, top), (x0, y1, top)))
    return audit_and_store_mesh(obj, vertices, faces)


def shift_world_z(obj: bpy.types.Object, amount: float) -> None:
    matrix = obj.matrix_world.copy()
    matrix.translation.z += amount
    obj.matrix_world = matrix


def rebuild_stair(stair_id: str, definition: dict[str, object]) -> list[dict[str, object]]:
    axis = definition["lower_axis"]
    lower_start = definition["lower_start"]
    lower_end = definition["lower_end"]
    upper_start = definition["upper_start"]
    upper_end = definition["upper_end"]
    upper_landing_end = definition["upper_landing_end"]
    lower_width = definition["lower_width"]
    upper_width = definition["upper_width"]

    audit = [
        replace_steps(
            bpy.data.objects[definition["lower_visual"]],
            axis,
            lower_start,
            lower_end,
            lower_width,
            0.0,
            16,
            0.15,
        ),
        replace_profile_prism(
            bpy.data.objects[definition["lower_collider"]],
            axis,
            lower_width,
            ((lower_start, 0.0), (lower_end, 0.0), (lower_end, 2.4)),
        ),
        replace_box(
            bpy.data.objects[definition["landing_visual"]],
            *definition["landing_bounds"],
        ),
        replace_box(
            bpy.data.objects[definition["landing_collider"]],
            *definition["landing_bounds"],
        ),
        replace_steps(
            bpy.data.objects[definition["upper_visual"]],
            axis,
            upper_start,
            upper_end,
            upper_width,
            2.4,
            8,
            0.15,
            top_landing_end=upper_landing_end,
        ),
        replace_profile_prism(
            bpy.data.objects[definition["upper_collider"]],
            axis,
            upper_width,
            (
                (upper_start, 0.0),
                (upper_start, 2.4),
                (upper_end, 3.6),
                (upper_landing_end, 3.6),
                (upper_landing_end, 0.0),
            ),
        ),
    ]

    lower_guard_profile = (
        (lower_start, 0.0),
        (lower_end, 2.4),
        (lower_end, 3.45),
        (lower_start, 1.05),
    )
    upper_guard_profile = (
        (upper_start, 2.4),
        (upper_end, 3.6),
        (upper_landing_end, 3.6),
        (upper_landing_end, 4.65),
        (upper_end, 4.65),
        (upper_start, 3.45),
    )
    for prefix in ("VIS", "COL"):
        audit.extend(
            (
                replace_profile_prism(
                    bpy.data.objects[f"{prefix}_StairGuard_{stair_id}_Lower"],
                    axis,
                    definition["lower_guard_width"],
                    lower_guard_profile,
                ),
                replace_box(
                    bpy.data.objects[f"{prefix}_StairGuard_{stair_id}_Landing"],
                    *definition["landing_guard_bounds"],
                ),
                replace_profile_prism(
                    bpy.data.objects[f"{prefix}_StairGuard_{stair_id}_Upper"],
                    axis,
                    definition["upper_guard_width"],
                    upper_guard_profile,
                ),
            )
        )
    audit.append(
        replace_box(
            bpy.data.objects[f"COL_StairClosure_{stair_id}"],
            *definition["closure_bounds"],
        )
    )
    return audit


def main() -> None:
    preflight()
    audit = []

    for name in ("VIS_Ceiling1F_North", "COL_Ceiling1F_North"):
        audit.append(
            replace_slab_with_holes(
                bpy.data.objects[name],
                NORTH_OUTER,
                NORTH_STAIR_OPENINGS,
                3.0,
                3.6,
            )
        )
    for name in ("VIS_Ceiling1F_West", "COL_Ceiling1F_West"):
        audit.append(
            replace_slab_with_holes(
                bpy.data.objects[name],
                WEST_OUTER,
                WEST_STAIR_OPENINGS,
                3.0,
                3.6,
            )
        )
    for name in ("VIS_2F_NorthVolume", "COL_2F_NorthVolume"):
        audit.append(
            replace_slab_with_holes(
                bpy.data.objects[name],
                NORTH_OUTER,
                NORTH_STAIR_OPENINGS,
                3.6,
                6.6,
            )
        )
    for name in ("VIS_2F_WestVolume", "COL_2F_WestVolume"):
        audit.append(
            replace_slab_with_holes(
                bpy.data.objects[name],
                WEST_OUTER,
                WEST_STAIR_OPENINGS,
                3.6,
                6.6,
            )
        )

    shifted_objects = [
        bpy.data.objects[name]
        for name in (
            "VIS_3F_NorthVolume",
            "COL_3F_NorthVolume",
            "VIS_3F_WestVolume",
            "COL_3F_WestVolume",
            "VIS_Roof_North",
            "COL_Roof_North",
            "VIS_Roof_West",
            "COL_Roof_West",
        )
    ]
    shifted_objects.extend(
        obj
        for obj in bpy.data.objects
        if obj.name.startswith("VIS_WindowGuide_2F_")
        or obj.name.startswith("VIS_WindowGuide_3F_")
        or "RoofGuard" in obj.name
        or "Pool" in obj.name
    )
    if len(shifted_objects) != 76:
        raise RuntimeError(f"上階移動対象が76件ではありません: {len(shifted_objects)}")
    if len({obj.name for obj in shifted_objects}) != len(shifted_objects):
        raise RuntimeError("上階移動対象に重複があります")
    for obj in shifted_objects:
        shift_world_z(obj, UPPER_SHIFT)

    for stair_id, definition in STAIRS.items():
        audit.extend(rebuild_stair(stair_id, definition))

    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 263:
        raise RuntimeError("階段修正後のVIS Object数が263件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 144:
        raise RuntimeError("階段修正後のCOL Object数が144件ではありません")
    if len(bpy.data.objects) != 443 or len(bpy.data.meshes) != 418:
        raise RuntimeError(
            f"階段修正後のシーン件数が想定外です: "
            f"objects={len(bpy.data.objects)}, meshes={len(bpy.data.meshes)}"
        )

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "meshes": len(bpy.data.meshes),
            "shifted_upper_objects": len(shifted_objects) + 4,
            "reconstructed": audit,
        }
    )


main()
