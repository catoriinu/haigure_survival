from pathlib import Path
import math

import bmesh
import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPOSITORY_ROOT / "assets/blender/v2/B02/b02_school_blockout.blend"
GLB_PATH = REPOSITORY_ROOT / "public/stage-assets/v2/B02/b02_school_blockout.glb"

EXPORT_COLLECTION_NAME = "EXP_Stage_school"
NAV_COLLECTION_NAME = "B02_NAV"
SEMANTIC_COLLECTION_NAME = "B02_SEMANTIC"

WALKABLE_SOURCES = {
    "NAV_Walkable_Outdoor": (
        "outdoor",
        (
            "COL_SiteGround",
            "COL_Floor_Bridge",
        ),
    ),
    "NAV_Walkable_Interior1F": (
        "ground",
        (
            "COL_Floor_WestWing",
            "COL_Floor_NorthWing",
            "COL_Floor_Gym",
            "COL_Floor_GymStorage",
            "COL_GymStage",
        ),
    ),
    "NAV_Walkable_EntryTransitions": (
        "door",
        (
            "COL_EntryRamp",
            "COL_NorthEntryRamp",
            "COL_NorthWingSouthEntryRamp",
            "COL_BridgeSideRamp_West",
            "COL_BridgeSideRamp_East",
            "COL_GymCourtyardEntryRamp",
        ),
    ),
    "NAV_Walkable_Stairs": (
        "stairs",
        (
            "COL_StairRamp_NE",
            "COL_StairRamp_NW",
            "COL_StairRamp_SW",
            "COL_StairLanding_NE",
            "COL_StairLanding_NW",
            "COL_StairLanding_SW",
            "COL_GymStageStairRamp_East",
            "COL_GymStageStairRamp_West",
        ),
    ),
}

SCHOOL_1F_BLOCKERS = (
    "COL_Wall1F_CourtyardNorth_Left",
    "COL_Wall1F_CourtyardNorth_Right",
    "COL_Wall1F_CourtyardWest_North",
    "COL_Wall1F_CourtyardWest_South",
    "COL_Wall1F_EastNorth",
    "COL_Wall1F_NorthLeft",
    "COL_Wall1F_NorthRight",
    "COL_Wall1F_NorthWingWestOuter",
    "COL_Wall1F_SouthFull",
    "COL_Wall1F_WestOuter",
    "COL_Wall_Classroom1_Corridor_1",
    "COL_Wall_Classroom1_Corridor_2",
    "COL_Wall_Classroom1_Corridor_3",
    "COL_Wall_Classroom2_Corridor_1",
    "COL_Wall_Classroom2_Corridor_2",
    "COL_Wall_Classroom2_Corridor_3",
    "COL_Wall_Classroom3_Corridor_1",
    "COL_Wall_Classroom3_Corridor_2",
    "COL_Wall_Classroom3_Corridor_3",
    "COL_Wall_Classroom3_North",
    "COL_Wall_ClassroomCross_1",
    "COL_Wall_ClassroomCross_2",
    "COL_Wall_Lintel_ClassroomDoor_01",
    "COL_Wall_Lintel_ClassroomDoor_02",
    "COL_Wall_Lintel_ClassroomDoor_03",
    "COL_Wall_Lintel_ClassroomDoor_04",
    "COL_Wall_Lintel_ClassroomDoor_05",
    "COL_Wall_Lintel_ClassroomDoor_06",
    "COL_Wall_Lintel_MainEntry",
    "COL_Wall_Lintel_NorthEntry",
    "COL_Wall_Lintel_NorthWingBridge",
    "COL_Wall_Lintel_NorthWingSouthEntry",
    "COL_Wall_Lintel_SpecialDoor_01",
    "COL_Wall_Lintel_SpecialDoor_02",
    "COL_Wall_Lintel_SpecialDoor_03",
    "COL_Wall_Lintel_SpecialDoor_04",
    "COL_Wall_Lintel_Toilet_F",
    "COL_Wall_Lintel_Toilet_M",
    "COL_Wall_NorthEntry_Special1",
    "COL_Wall_Special_Divider",
    "COL_Wall_Special_S1A",
    "COL_Wall_Special_S1B",
    "COL_Wall_Special_S1C",
    "COL_Wall_Special_S2A",
    "COL_Wall_Special_S2B",
    "COL_Wall_Special_S2C",
    "COL_Wall_StairNE_West",
    "COL_Wall_Toilet_Divider",
    "COL_Wall_Toilet_East",
    "COL_Wall_Toilet_South_A",
    "COL_Wall_Toilet_South_B",
    "COL_Wall_Toilet_South_C",
    "COL_Wall_Toilet_South_D",
    "COL_Wall_Toilet_West",
    "COL_ToiletStallPartition_M_01",
    "COL_ToiletStallPartition_M_02",
    "COL_ToiletStallPartition_F_01",
    "COL_ToiletStallPartition_F_02",
)

GYM_BLOCKERS = (
    "COL_GymStageSideWall_East_Left",
    "COL_GymStageSideWall_East_Lintel",
    "COL_GymStageSideWall_East_Right",
    "COL_GymStageSideWall_West_Left",
    "COL_GymStageSideWall_West_Lintel",
    "COL_GymStageSideWall_West_Right",
    "COL_GymStageStairHeadWall_East",
    "COL_GymStageStairHeadWall_West",
    "COL_GymStorage_East",
    "COL_GymStorage_North",
    "COL_GymStorage_West",
    "COL_GymWall_East",
    "COL_GymWall_Lintel_Bridge",
    "COL_GymWall_Lintel_Courtyard",
    "COL_GymWall_Lintel_StorageDoor",
    "COL_GymWall_North_Left",
    "COL_GymWall_North_RightA",
    "COL_GymWall_North_RightB",
    "COL_GymWall_South",
    "COL_GymWall_WestMiddle",
    "COL_GymWall_WestSouth",
)

PERIMETER_BLOCKERS = (
    "COL_Perimeter_East",
    "COL_Perimeter_EastNorth",
    "COL_Perimeter_NorthEast",
    "COL_Perimeter_NorthWest",
    "COL_Perimeter_SouthEast",
    "COL_Perimeter_SouthWest",
    "COL_Perimeter_West",
    "COL_Gate_MainClosed",
    "COL_Gate_UtilityClosed",
)

STAIR_BLOCKERS = (
    "COL_StairClosure_NE",
    "COL_StairClosure_SW",
    "COL_StairGuard_NE_Landing",
    "COL_StairGuard_NE_Lower",
    "COL_StairGuard_NE_Upper",
    "COL_StairGuard_NW_Landing",
    "COL_StairGuard_NW_Lower",
    "COL_StairGuard_NW_Upper",
    "COL_StairGuard_SW_Landing",
    "COL_StairGuard_SW_Lower",
    "COL_StairGuard_SW_Upper",
)

BLOCKER_SOURCES = {
    "NAV_Blocker_School1F": SCHOOL_1F_BLOCKERS,
    "NAV_Blocker_Gym": GYM_BLOCKERS,
    "NAV_Blocker_Perimeter": PERIMETER_BLOCKERS,
    "NAV_Blocker_StairClosed": STAIR_BLOCKERS,
}

GENERATED_OBJECT_NAMES = (
    *WALKABLE_SOURCES.keys(),
    *BLOCKER_SOURCES.keys(),
    "META_Stage",
    "MRK_PlayerSpawn_Main",
    "VOL_NpcSpawn_Courtyard",
    "VOL_BitSpawn_Courtyard",
    "BND_Stage",
)


def require_clean_current_blend() -> None:
    if Path(bpy.data.filepath) != BLEND_PATH:
        raise RuntimeError(f"現worktree側B02ではありません: {bpy.data.filepath}")
    if bpy.data.is_dirty:
        raise RuntimeError("編集開始前のB02に未保存変更があります")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("VIS_")]) != 306:
        raise RuntimeError("4階化後B02のVIS Object数が306件ではありません")
    if len([obj for obj in bpy.data.objects if obj.name.startswith("COL_")]) != 158:
        raise RuntimeError("4階化後B02のCOL Object数が158件ではありません")


def reset_generated_semantics() -> None:
    export_collection = bpy.data.collections.get(EXPORT_COLLECTION_NAME)
    nav_collection = bpy.data.collections.get(NAV_COLLECTION_NAME)
    semantic_collection = bpy.data.collections.get(SEMANTIC_COLLECTION_NAME)
    generated_objects = [bpy.data.objects.get(name) for name in GENERATED_OBJECT_NAMES]

    if export_collection is None:
        if nav_collection is not None or semantic_collection is not None:
            raise RuntimeError("学校の空間意味Collectionが一部だけ存在します")
        if any(obj is not None for obj in generated_objects):
            raise RuntimeError("学校の空間意味ObjectがCollectionなしで存在します")
        return

    if nav_collection is None or semantic_collection is None:
        raise RuntimeError("学校の空間意味Collectionが不足しています")
    if any(obj is None for obj in generated_objects):
        raise RuntimeError("再生成対象の学校空間意味Objectが不足しています")
    if {collection.name for collection in export_collection.children} != {
        "B02_VIS",
        "B02_COL",
        NAV_COLLECTION_NAME,
        SEMANTIC_COLLECTION_NAME,
    }:
        raise RuntimeError("学校Export Collectionの子Collectionが想定外です")
    if {obj.name for obj in nav_collection.objects} != {
        *WALKABLE_SOURCES.keys(),
        *BLOCKER_SOURCES.keys(),
    }:
        raise RuntimeError("B02_NAVのObjectが想定外です")
    if {obj.name for obj in semantic_collection.objects} != {
        "META_Stage",
        "MRK_PlayerSpawn_Main",
        "VOL_NpcSpawn_Courtyard",
        "VOL_BitSpawn_Courtyard",
        "BND_Stage",
    }:
        raise RuntimeError("B02_SEMANTICのObjectが想定外です")
    if len(export_collection.all_objects) != 477:
        raise RuntimeError("再生成前の学校契約Object数が477件ではありません")

    scene_root = bpy.context.scene.collection
    if {collection.name for collection in scene_root.children} != {
        EXPORT_COLLECTION_NAME,
        "B02_GUIDES",
    }:
        raise RuntimeError("再生成前のScene直下Collectionが想定外です")

    for name in ("B02_VIS", "B02_COL"):
        collection = bpy.data.collections[name]
        export_collection.children.unlink(collection)
        scene_root.children.link(collection)

    for obj in generated_objects:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)

    bpy.data.collections.remove(nav_collection)
    bpy.data.collections.remove(semantic_collection)
    bpy.data.collections.remove(export_collection)


def require_source_objects() -> None:
    source_names = {
        name
        for _area, names in WALKABLE_SOURCES.values()
        for name in names
    } | {
        name
        for names in BLOCKER_SOURCES.values()
        for name in names
    }
    missing = sorted(name for name in source_names if bpy.data.objects.get(name) is None)
    if missing:
        raise RuntimeError(f"NavMesh複製元が不足しています: {missing}")
    non_mesh = sorted(name for name in source_names if bpy.data.objects[name].type != "MESH")
    if non_mesh:
        raise RuntimeError(f"NavMesh複製元がMeshではありません: {non_mesh}")

    source_occurrences = [
        name
        for _area, names in WALKABLE_SOURCES.values()
        for name in names
    ] + [
        name
        for names in BLOCKER_SOURCES.values()
        for name in names
    ]
    duplicates = sorted({name for name in source_occurrences if source_occurrences.count(name) > 1})
    if duplicates:
        raise RuntimeError(f"NavMesh複製元が複数roleへ重複しています: {duplicates}")


def create_export_collections() -> tuple[bpy.types.Collection, bpy.types.Collection, bpy.types.Collection]:
    scene_root = bpy.context.scene.collection
    existing_children = {collection.name for collection in scene_root.children}
    if existing_children != {"B02_VIS", "B02_COL", "B02_GUIDES"}:
        raise RuntimeError(f"B02のScene直下Collectionが想定外です: {sorted(existing_children)}")

    export_collection = bpy.data.collections.new(EXPORT_COLLECTION_NAME)
    nav_collection = bpy.data.collections.new(NAV_COLLECTION_NAME)
    semantic_collection = bpy.data.collections.new(SEMANTIC_COLLECTION_NAME)
    scene_root.children.link(export_collection)
    export_collection.children.link(nav_collection)
    export_collection.children.link(semantic_collection)

    for name in ("B02_VIS", "B02_COL"):
        collection = bpy.data.collections[name]
        scene_root.children.unlink(collection)
        export_collection.children.link(collection)

    return export_collection, nav_collection, semantic_collection


def create_merged_nav_mesh(
    object_name: str,
    source_names: tuple[str, ...],
    collection: bpy.types.Collection,
    nav_role: str,
    nav_area: str | None,
) -> dict[str, object]:
    bm = bmesh.new()
    selected_source_faces = 0
    for source_name in source_names:
        source = bpy.data.objects[source_name]
        normal_matrix = source.matrix_world.to_3x3().inverted().transposed()
        vertex_map: dict[int, bmesh.types.BMVert] = {}
        for polygon in source.data.polygons:
            world_normal = (normal_matrix @ polygon.normal).normalized()
            if nav_role == "walkable" and world_normal.z < math.cos(math.radians(45.0)):
                continue
            face_vertices = []
            for vertex_index in polygon.vertices:
                if vertex_index not in vertex_map:
                    vertex_map[vertex_index] = bm.verts.new(
                        source.matrix_world @ source.data.vertices[vertex_index].co
                    )
                face_vertices.append(vertex_map[vertex_index])
            bm.faces.new(tuple(face_vertices))
            selected_source_faces += 1

    if nav_role == "walkable":
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    else:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    degenerate_faces = sum(1 for face in bm.faces if face.calc_area() < 1e-9)
    non_manifold_edges = sum(1 for edge in bm.edges if not edge.is_manifold)
    signed_volume = bm.calc_volume(signed=True)
    invalid_walkable_normal = any(
        face.normal.z < math.cos(math.radians(45.0))
        for face in bm.faces
    )
    invalid_geometry = degenerate_faces != 0
    if nav_role == "walkable":
        invalid_geometry = invalid_geometry or invalid_walkable_normal or selected_source_faces == 0
    else:
        invalid_geometry = invalid_geometry or non_manifold_edges != 0 or signed_volume <= 0
    if invalid_geometry:
        bm.free()
        raise RuntimeError(
            f"NavMesh入力の統合に失敗しました: {object_name}, "
            f"role={nav_role}, volume={signed_volume}, degenerate={degenerate_faces}, "
            f"non_manifold={non_manifold_edges}, invalid_walkable_normal={invalid_walkable_normal}"
        )

    mesh = bpy.data.meshes.new(object_name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(object_name, mesh)
    collection.objects.link(obj)
    obj.display_type = "WIRE"
    obj["hs_nav_role"] = nav_role
    if nav_area is not None:
        obj["hs_nav_area"] = nav_area

    return {
        "name": object_name,
        "sources": len(source_names),
        "selected_source_faces": selected_source_faces,
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "signed_volume": round(signed_volume, 6) if nav_role == "blocker" else None,
    }


def create_box_mesh(
    object_name: str,
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
    collection: bpy.types.Collection,
    properties: dict[str, str],
) -> bpy.types.Object:
    min_x, min_y, min_z = minimum
    max_x, max_y, max_z = maximum
    vertices = (
        (min_x, min_y, min_z),
        (min_x, min_y, max_z),
        (min_x, max_y, min_z),
        (min_x, max_y, max_z),
        (max_x, min_y, min_z),
        (max_x, min_y, max_z),
        (max_x, max_y, min_z),
        (max_x, max_y, max_z),
    )
    faces = (
        (0, 2, 3, 1),
        (4, 5, 7, 6),
        (0, 1, 5, 4),
        (2, 6, 7, 3),
        (0, 4, 6, 2),
        (1, 3, 7, 5),
    )
    mesh = bpy.data.meshes.new(object_name)
    mesh.from_pydata(vertices, (), faces)
    mesh.update()

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    signed_volume = bm.calc_volume(signed=True)
    if signed_volume <= 0 or any(not edge.is_manifold for edge in bm.edges):
        bm.free()
        raise RuntimeError(f"閉じた意味Volumeの生成に失敗しました: {object_name}")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(object_name, mesh)
    collection.objects.link(obj)
    obj.display_type = "WIRE"
    for key, value in properties.items():
        obj[key] = value
    return obj


def create_empty(
    object_name: str,
    collection: bpy.types.Collection,
    location: tuple[float, float, float],
    rotation_z_degrees: float,
    properties: dict[str, str | int],
) -> bpy.types.Object:
    obj = bpy.data.objects.new(object_name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.8
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, math.radians(rotation_z_degrees))
    obj.scale = (1.0, 1.0, 1.0)
    for key, value in properties.items():
        obj[key] = value
    return obj


def create_semantic_objects(collection: bpy.types.Collection) -> None:
    create_empty(
        "META_Stage",
        collection,
        (0.0, 0.0, 0.0),
        0.0,
        {
            "hs_schema_version": 1,
            "hs_stage_id": "school",
            "hs_nav_profile": "school-humanoid-v1",
        },
    )
    create_empty(
        "MRK_PlayerSpawn_Main",
        collection,
        (-1.5, 0.0, 0.0),
        90.0,
        {
            "hs_id": "player-spawn-main",
            "hs_role": "player_spawn",
        },
    )
    create_box_mesh(
        "VOL_NpcSpawn_Courtyard",
        (6.0, 4.0, -0.4),
        (30.0, 28.0, 2.5),
        collection,
        {
            "hs_id": "npc-spawn-courtyard",
            "hs_role": "npc_spawn",
        },
    )
    create_box_mesh(
        "VOL_BitSpawn_Courtyard",
        (6.0, 4.0, -0.4),
        (30.0, 28.0, 2.5),
        collection,
        {
            "hs_id": "bit-spawn-courtyard",
            "hs_role": "bit_spawn",
        },
    )
    create_box_mesh(
        "BND_Stage",
        (-18.4, -12.3, -0.5),
        (63.2, 51.3, 15.3),
        collection,
        {
            "hs_id": "stage",
            "hs_role": "playable_boundary",
        },
    )


def export_stage(export_collection: bpy.types.Collection) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = list(export_collection.all_objects)
    if len(export_objects) != 477:
        raise RuntimeError(f"学校の契約Object数が477件ではありません: {len(export_objects)}")
    for obj in export_objects:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        use_visible=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
        export_yup=True,
        export_apply=False,
    )


def main() -> None:
    require_clean_current_blend()
    reset_generated_semantics()
    require_source_objects()
    export_collection, nav_collection, semantic_collection = create_export_collections()

    nav_audit = []
    for object_name, (area, source_names) in WALKABLE_SOURCES.items():
        nav_audit.append(
            create_merged_nav_mesh(
                object_name,
                source_names,
                nav_collection,
                "walkable",
                area,
            )
        )
    for object_name, source_names in BLOCKER_SOURCES.items():
        nav_audit.append(
            create_merged_nav_mesh(
                object_name,
                source_names,
                nav_collection,
                "blocker",
                None,
            )
        )

    create_semantic_objects(semantic_collection)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_stage(export_collection)

    print(
        {
            "filepath": bpy.data.filepath,
            "is_dirty": bpy.data.is_dirty,
            "objects": len(bpy.data.objects),
            "meshes": sum(1 for obj in bpy.data.objects if obj.type == "MESH"),
            "export_objects": len(export_collection.all_objects),
            "nav": nav_audit,
            "glb": str(GLB_PATH),
        }
    )


main()
