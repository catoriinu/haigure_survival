import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Detour,
  exportNavMesh,
  getNavMeshPositionsAndIndices,
  importNavMesh,
  init,
  NavMeshQuery
} from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const TRIANGLES_MODE = 4;
const FLOAT_COMPONENT_TYPE = 5126;
const UNSIGNED_INDEX_COMPONENT_TYPES = new Set([5121, 5123, 5125]);
const REGISTERED_NAV_AREAS = new Set(["ground", "stairs", "outdoor", "door"]);
const REGISTERED_NAV_ROLES = new Set(["walkable", "blocker", "exclude"]);
const REPRESENTATIVE_ROUTE_ENDPOINT_TOLERANCE = 1e-5;
const REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE = 0.1;
const REPRESENTATIVE_ROUTE_PATH_LIMIT = 4096;
const REPRESENTATIVE_ROUTE_QUERY_HALF_EXTENTS = Object.freeze({
  x: REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE * 2,
  y: REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE * 2,
  z: REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE * 2
});
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const INPUT_RELATIVE_PATH = "public/stage-assets/v2/B02/b02_school_blockout.glb";
const OUTPUT_RELATIVE_PATH = "public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin";
const INPUT_PATH = resolve(REPOSITORY_ROOT, INPUT_RELATIVE_PATH);
const OUTPUT_PATH = resolve(REPOSITORY_ROOT, OUTPUT_RELATIVE_PATH);

const SCHOOL_NAV_PROFILE = Object.freeze({
  id: "school-humanoid-v1",
  schemaVersion: 3,
  stageId: "school",
  bitNavProfileId: "bit-flight-body-0.44-margin-0.10-v1",
  coordinateSpace: "gltf-right-handed-y-up",
  worldScale: 0.25,
  generator: "solo",
  recastPackage: "recast-navigation",
  recastVersion: "0.43.1",
  parameters: Object.freeze({
    cs: 0.025,
    ch: 0.0125,
    walkableSlopeAngle: 45,
    walkableHeight: 34,
    walkableClimb: 3,
    walkableRadius: 4,
    maxEdgeLen: 12,
    maxSimplificationError: 1.3,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxVertsPerPoly: 6,
    detailSampleDist: 6,
    detailSampleMaxError: 1,
    buildBvTree: true
  })
});
const STAIR_ROUTE_MAX_DISTANCE_BLENDER = 25;

const makeStairPassageBounds = (x, y, z) => Object.freeze({
  minimum: Object.freeze({ x: x - 0.8, y: y - 0.8, z: z - 0.2 }),
  maximum: Object.freeze({ x: x + 0.8, y: y + 0.8, z: z + 0.2 })
});

const makeToiletEntrancePassageBounds = (x, z) => Object.freeze({
  minimum: Object.freeze({ x: x - 0.35, y: 38.25, z: z - 0.2 }),
  maximum: Object.freeze({ x: x + 0.35, y: 38.75, z: z + 0.2 })
});

const makeNorthSpecialRoomDoorPassageBounds = (z) => Object.freeze({
  minimum: Object.freeze({ x: 6.0, y: 36.25, z: z - 0.2 }),
  maximum: Object.freeze({ x: 7.2, y: 36.75, z: z + 0.2 })
});

const makeB03StructurePassageBounds = (x, y, z) => Object.freeze({
  minimum: Object.freeze({ x: x - 0.8, y: y - 0.8, z: z - 0.4 }),
  maximum: Object.freeze({ x: x + 0.8, y: y + 0.8, z: z + 0.4 })
});

const makeB03PortalPassageBounds = (y, z) => Object.freeze({
  minimum: Object.freeze({ x: 39.4, y: y - 0.2, z: z - 0.4 }),
  maximum: Object.freeze({ x: 43.4, y: y + 0.2, z: z + 0.4 })
});

const makeGymStageStairPassageBounds = (side) => Object.freeze({
  minimum: Object.freeze({
    x: side === "west" ? 39.1 : 52.2,
    y: -10.15,
    z: 0.2
  }),
  maximum: Object.freeze({
    x: side === "west" ? 40.6 : 53.7,
    y: -9.45,
    z: 0.8
  })
});

const makeGymSouthPassageBounds = () => Object.freeze({
  minimum: Object.freeze({ x: 45.6, y: -13.3, z: -0.5 }),
  maximum: Object.freeze({ x: 47.2, y: -12.4, z: -0.1 })
});

const makeMainEntryLockerAisleBounds = () => Object.freeze({
  minimum: Object.freeze({ x: -1.70, y: -5.15, z: -0.2 }),
  maximum: Object.freeze({ x: -0.70, y: -4.65, z: 0.2 })
});

const REPRESENTATIVE_ROUTES = Object.freeze([
  Object.freeze({
    id: "main-entrance-to-courtyard",
    label: "主玄関→校庭",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([16.7, 14.5, 0])
  }),
  Object.freeze({
    id: "main-entrance-to-north-outside",
    label: "主玄関→北側屋外",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([17.4, 47, 0])
  }),
  Object.freeze({
    id: "main-entrance-to-northwest-landing",
    label: "主玄関→北西踊り場",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-9.6, 44.3, 2.4])
  }),
  Object.freeze({
    id: "main-entrance-to-northwest-storage",
    label: "主玄関→北西階段下倉庫",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-7.8, 40.0, 0])
  }),
  Object.freeze({
    id: "main-entrance-to-northeast-landing",
    label: "主玄関→北東踊り場",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([44.4, 44.3, 2.4])
  }),
  Object.freeze({
    id: "main-entrance-to-southwest-landing",
    label: "主玄関→南西踊り場",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-11.4, -0.5, 2.4])
  }),
  Object.freeze({
    id: "main-entrance-to-second-floor-west-corridor",
    label: "主玄関→2F西側廊下",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-2, 15, 3.6])
  }),
  Object.freeze({
    id: "main-entrance-to-third-floor-west-corridor",
    label: "主玄関→3F西側廊下",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-2, 15, 7.2])
  }),
  Object.freeze({
    id: "main-entrance-to-fourth-floor-west-corridor",
    label: "主玄関→4F西側廊下",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-2, 15, 10.8])
  }),
  Object.freeze({
    id: "main-entrance-to-rooftop",
    label: "主玄関→屋上",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-5.5, 39.5, 14.4])
  }),
  Object.freeze({
    id: "main-entrance-to-second-floor-ordinary-room",
    label: "主玄関→2F西側普通教室",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-5, 13.7, 3.6])
  }),
  Object.freeze({
    id: "main-entrance-to-third-floor-ordinary-room",
    label: "主玄関→3F西側普通教室",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-5, 13.7, 7.2])
  }),
  Object.freeze({
    id: "main-entrance-to-fourth-floor-ordinary-room",
    label: "主玄関→4F西側普通教室",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-5, 13.7, 10.8])
  }),
  Object.freeze({
    id: "northwest-first-floor-to-second-floor",
    label: "北西階段1F→2F",
    startBlender: Object.freeze([-11.4, 38.7, 0]),
    endBlender: Object.freeze([-11.4, 38.7, 3.6]),
    requiredPassageBlender: makeStairPassageBounds(-9.6, 43.7, 2.4),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northwest-second-floor-to-first-floor",
    label: "北西階段2F→1F",
    startBlender: Object.freeze([-11.4, 38.7, 3.6]),
    endBlender: Object.freeze([-11.4, 38.7, 0]),
    requiredPassageBlender: makeStairPassageBounds(-9.6, 43.7, 2.4),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northwest-second-floor-to-third-floor",
    label: "北西階段2F→3F",
    startBlender: Object.freeze([-11.4, 38.7, 3.6]),
    endBlender: Object.freeze([-11.4, 38.7, 7.2]),
    requiredPassageBlender: makeStairPassageBounds(-9.6, 43.7, 6.0),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northwest-third-floor-to-second-floor",
    label: "北西階段3F→2F",
    startBlender: Object.freeze([-11.4, 38.7, 7.2]),
    endBlender: Object.freeze([-11.4, 38.7, 3.6]),
    requiredPassageBlender: makeStairPassageBounds(-9.6, 43.7, 6.0),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northwest-third-floor-to-fourth-floor",
    label: "北西階段3F→4F",
    startBlender: Object.freeze([-11.4, 38.7, 7.2]),
    endBlender: Object.freeze([-11.4, 38.7, 10.8]),
    requiredPassageBlender: makeStairPassageBounds(-9.6, 43.7, 9.6),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northwest-fourth-floor-to-third-floor",
    label: "北西階段4F→3F",
    startBlender: Object.freeze([-11.4, 38.7, 10.8]),
    endBlender: Object.freeze([-11.4, 38.7, 7.2]),
    requiredPassageBlender: makeStairPassageBounds(-9.6, 43.7, 9.6),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northeast-first-floor-to-second-floor",
    label: "北東階段1F→2F",
    startBlender: Object.freeze([43.2, 38.3, 0]),
    endBlender: Object.freeze([43.2, 38.3, 3.6]),
    requiredPassageBlender: makeStairPassageBounds(45.0, 43.7, 2.4),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northeast-second-floor-to-first-floor",
    label: "北東階段2F→1F",
    startBlender: Object.freeze([43.2, 38.3, 3.6]),
    endBlender: Object.freeze([43.2, 38.3, 0]),
    requiredPassageBlender: makeStairPassageBounds(45.0, 43.7, 2.4),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northeast-second-floor-to-third-floor",
    label: "北東階段2F→3F",
    startBlender: Object.freeze([43.2, 38.3, 3.6]),
    endBlender: Object.freeze([43.2, 38.3, 7.2]),
    requiredPassageBlender: makeStairPassageBounds(45.0, 43.7, 6.0),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northeast-third-floor-to-second-floor",
    label: "北東階段3F→2F",
    startBlender: Object.freeze([43.2, 38.3, 7.2]),
    endBlender: Object.freeze([43.2, 38.3, 3.6]),
    requiredPassageBlender: makeStairPassageBounds(45.0, 43.7, 6.0),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northeast-third-floor-to-fourth-floor",
    label: "北東階段3F→4F",
    startBlender: Object.freeze([43.2, 38.3, 7.2]),
    endBlender: Object.freeze([43.2, 38.3, 10.8]),
    requiredPassageBlender: makeStairPassageBounds(45.0, 43.7, 9.6),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "northeast-fourth-floor-to-third-floor",
    label: "北東階段4F→3F",
    startBlender: Object.freeze([43.2, 38.3, 10.8]),
    endBlender: Object.freeze([43.2, 38.3, 7.2]),
    requiredPassageBlender: makeStairPassageBounds(45.0, 43.7, 9.6),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "southwest-first-floor-to-second-floor",
    label: "南西階段1F→2F",
    startBlender: Object.freeze([-5.4, 1.3, 0]),
    endBlender: Object.freeze([-5.4, 1.3, 3.6]),
    requiredPassageBlender: makeStairPassageBounds(-10.8, -1.3, 2.4),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "southwest-second-floor-to-first-floor",
    label: "南西階段2F→1F",
    startBlender: Object.freeze([-5.4, 1.3, 3.6]),
    endBlender: Object.freeze([-5.4, 1.3, 0]),
    requiredPassageBlender: makeStairPassageBounds(-10.8, -1.3, 2.4),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "southwest-second-floor-to-third-floor",
    label: "南西階段2F→3F",
    startBlender: Object.freeze([-5.4, 1.3, 3.6]),
    endBlender: Object.freeze([-5.4, 1.3, 7.2]),
    requiredPassageBlender: makeStairPassageBounds(-10.8, -1.3, 6.0),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "southwest-third-floor-to-second-floor",
    label: "南西階段3F→2F",
    startBlender: Object.freeze([-5.4, 1.3, 7.2]),
    endBlender: Object.freeze([-5.4, 1.3, 3.6]),
    requiredPassageBlender: makeStairPassageBounds(-10.8, -1.3, 6.0),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "southwest-third-floor-to-fourth-floor",
    label: "南西階段3F→4F",
    startBlender: Object.freeze([-5.4, 1.3, 7.2]),
    endBlender: Object.freeze([-5.4, 1.3, 10.8]),
    requiredPassageBlender: makeStairPassageBounds(-10.8, -1.3, 9.6),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "southwest-fourth-floor-to-third-floor",
    label: "南西階段4F→3F",
    startBlender: Object.freeze([-5.4, 1.3, 10.8]),
    endBlender: Object.freeze([-5.4, 1.3, 7.2]),
    requiredPassageBlender: makeStairPassageBounds(-10.8, -1.3, 9.6),
    maximumDistanceBlender: STAIR_ROUTE_MAX_DISTANCE_BLENDER
  }),
  Object.freeze({
    id: "second-floor-to-third-floor",
    label: "2F西側廊下→3F西側廊下",
    startBlender: Object.freeze([-2, 15, 3.6]),
    endBlender: Object.freeze([-2, 15, 7.2])
  }),
  Object.freeze({
    id: "third-floor-to-second-floor",
    label: "3F西側廊下→2F西側廊下",
    startBlender: Object.freeze([-2, 15, 7.2]),
    endBlender: Object.freeze([-2, 15, 3.6])
  }),
  Object.freeze({
    id: "third-floor-to-fourth-floor",
    label: "3F西側廊下→4F西側廊下",
    startBlender: Object.freeze([-2, 15, 7.2]),
    endBlender: Object.freeze([-2, 15, 10.8])
  }),
  Object.freeze({
    id: "fourth-floor-to-third-floor",
    label: "4F西側廊下→3F西側廊下",
    startBlender: Object.freeze([-2, 15, 10.8]),
    endBlender: Object.freeze([-2, 15, 7.2])
  }),
  Object.freeze({
    id: "fourth-floor-to-rooftop",
    label: "4F西側廊下→屋上",
    startBlender: Object.freeze([-2, 15, 10.8]),
    endBlender: Object.freeze([-5.5, 39.5, 14.4])
  }),
  Object.freeze({
    id: "rooftop-to-fourth-floor",
    label: "屋上→4F西側廊下",
    startBlender: Object.freeze([-5.5, 39.5, 14.4]),
    endBlender: Object.freeze([-2, 15, 10.8])
  }),
  Object.freeze({
    id: "rooftop-to-poolside",
    label: "屋上→プールサイド",
    startBlender: Object.freeze([-5.5, 39.5, 14.4]),
    endBlender: Object.freeze([12, 39, 15.65])
  }),
  Object.freeze({
    id: "poolside-to-pool-bottom",
    label: "プールサイド→プール底",
    startBlender: Object.freeze([12, 39, 15.65]),
    endBlender: Object.freeze([23.4, 39, 14.61])
  }),
  Object.freeze({
    id: "main-entrance-to-gym-center",
    label: "主玄関→体育館中央",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([45.4, 8.5, 0])
  }),
  Object.freeze({
    id: "courtyard-to-gym-west-entrance",
    label: "校庭→体育館西側出入口",
    startBlender: Object.freeze([31.6, 6.5, -0.3]),
    endBlender: Object.freeze([34.0, 6.5, 0])
  }),
  Object.freeze({
    id: "gym-south-passage-west-to-east",
    label: "体育館南側通路・西→東",
    startBlender: Object.freeze([34.2, -13.2, -0.3]),
    endBlender: Object.freeze([58.6, -13.2, -0.3]),
    requiredPassageBlender: makeGymSouthPassageBounds(),
    maximumDistanceBlender: 30
  }),
  Object.freeze({
    id: "gym-south-passage-east-to-west",
    label: "体育館南側通路・東→西",
    startBlender: Object.freeze([58.6, -13.2, -0.3]),
    endBlender: Object.freeze([34.2, -13.2, -0.3]),
    requiredPassageBlender: makeGymSouthPassageBounds(),
    maximumDistanceBlender: 30
  }),
  Object.freeze({
    id: "north-wing-to-north-outside",
    label: "北側校舎→北側屋外",
    startBlender: Object.freeze([3.9, 44.5, 0]),
    endBlender: Object.freeze([3.9, 48.0, -0.3])
  }),
  Object.freeze({
    id: "courtyard-to-bridge-west-side",
    label: "校庭→渡り廊下西側",
    startBlender: Object.freeze([37.0, 29.5, -0.3]),
    endBlender: Object.freeze([40.0, 29.5, 0])
  }),
  Object.freeze({
    id: "courtyard-to-north-wing-south-entry",
    label: "校庭→北側校舎南出入口",
    startBlender: Object.freeze([2.7, 30.0, -0.3]),
    endBlender: Object.freeze([2.7, 33.2, 0])
  }),
  Object.freeze({
    id: "east-outside-to-bridge-east-side",
    label: "東側屋外→渡り廊下東側",
    startBlender: Object.freeze([45.8, 29.5, -0.3]),
    endBlender: Object.freeze([42.8, 29.5, 0])
  }),
  Object.freeze({
    id: "first-floor-male-toilet-entrance-to-stall",
    label: "1階男子トイレ入口外→個室",
    startBlender: Object.freeze([-4.8, 37.5, 0]),
    endBlender: Object.freeze([-5.75, 44.6, 0]),
    requiredPassageBlender: makeToiletEntrancePassageBounds(-4.8, 0)
  }),
  Object.freeze({
    id: "first-floor-female-toilet-entrance-to-stall",
    label: "1階女子トイレ入口外→個室",
    startBlender: Object.freeze([-0.3, 37.5, 0]),
    endBlender: Object.freeze([-1.25, 44.6, 0]),
    requiredPassageBlender: makeToiletEntrancePassageBounds(-0.3, 0)
  }),
  Object.freeze({
    id: "second-floor-male-toilet-entrance-to-stall",
    label: "2階男子トイレ入口外→個室",
    startBlender: Object.freeze([-4.8, 37.5, 3.6]),
    endBlender: Object.freeze([-5.75, 44.6, 3.6]),
    requiredPassageBlender: makeToiletEntrancePassageBounds(-4.8, 3.6)
  }),
  Object.freeze({
    id: "second-floor-female-toilet-entrance-to-stall",
    label: "2階女子トイレ入口外→個室",
    startBlender: Object.freeze([-0.3, 37.5, 3.6]),
    endBlender: Object.freeze([-1.25, 44.6, 3.6]),
    requiredPassageBlender: makeToiletEntrancePassageBounds(-0.3, 3.6)
  }),
  Object.freeze({
    id: "third-floor-male-toilet-entrance-to-stall",
    label: "3階男子トイレ入口外→個室",
    startBlender: Object.freeze([-4.8, 37.5, 7.2]),
    endBlender: Object.freeze([-5.75, 44.6, 7.2]),
    requiredPassageBlender: makeToiletEntrancePassageBounds(-4.8, 7.2)
  }),
  Object.freeze({
    id: "third-floor-female-toilet-entrance-to-stall",
    label: "3階女子トイレ入口外→個室",
    startBlender: Object.freeze([-0.3, 37.5, 7.2]),
    endBlender: Object.freeze([-1.25, 44.6, 7.2]),
    requiredPassageBlender: makeToiletEntrancePassageBounds(-0.3, 7.2)
  }),
  Object.freeze({
    id: "fourth-floor-male-toilet-entrance-to-stall",
    label: "4階男子トイレ入口外→個室",
    startBlender: Object.freeze([-4.8, 37.5, 10.8]),
    endBlender: Object.freeze([-5.75, 44.6, 10.8]),
    requiredPassageBlender: makeToiletEntrancePassageBounds(-4.8, 10.8)
  }),
  Object.freeze({
    id: "fourth-floor-female-toilet-entrance-to-stall",
    label: "4階女子トイレ入口外→個室",
    startBlender: Object.freeze([-0.3, 37.5, 10.8]),
    endBlender: Object.freeze([-1.25, 44.6, 10.8]),
    requiredPassageBlender: makeToiletEntrancePassageBounds(-0.3, 10.8)
  }),
  Object.freeze({
    id: "third-floor-toilet-passage-to-special-room",
    label: "3階トイレ側通路→特別教室正規扉",
    startBlender: Object.freeze([3.9, 40.0, 7.2]),
    endBlender: Object.freeze([11.5, 40.75, 7.2]),
    requiredPassageBlender: makeNorthSpecialRoomDoorPassageBounds(7.2)
  }),
  Object.freeze({
    id: "fourth-floor-toilet-passage-to-special-room",
    label: "4階トイレ側通路→特別教室正規扉",
    startBlender: Object.freeze([3.9, 40.0, 10.8]),
    endBlender: Object.freeze([9.3, 40.0, 10.8]),
    requiredPassageBlender: makeNorthSpecialRoomDoorPassageBounds(10.8)
  }),
  Object.freeze({
    id: "west-special-room-south-to-north",
    label: "西側特別教室中央→北端",
    startBlender: Object.freeze([-8.05, 17.5, 0]),
    endBlender: Object.freeze([-8.05, 27.5, 0])
  }),
  Object.freeze({
    id: "west-corridor-to-special-room-south-door",
    label: "西側廊下→1F特別教室南側扉",
    startBlender: Object.freeze([-2.8, 11.8, 0]),
    endBlender: Object.freeze([-5.0, 11.8, 0])
  }),
  Object.freeze({
    id: "main-entrance-to-west-special-room-south-door",
    label: "主玄関→1F西側特別教室南側扉",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-5, 11.8, 0])
  }),
  Object.freeze({
    id: "main-entrance-to-gym-storage",
    label: "主玄関→体育倉庫",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([55.5, 27.1, 0.1])
  }),
  Object.freeze({
    id: "gym-floor-to-stage",
    label: "体育館床→舞台",
    startBlender: Object.freeze([46.4, 0, 0]),
    endBlender: Object.freeze([47.0, -3.0, 1])
  }),
  Object.freeze({
    id: "east-ramp-bottom-to-stage",
    label: "東側舞台階段下→舞台",
    startBlender: Object.freeze([53.2, -9.8, 0]),
    endBlender: Object.freeze([51.0, -9.8, 1]),
    requiredPassageBlender: makeGymStageStairPassageBounds("east"),
    maximumDistanceBlender: 6
  }),
  Object.freeze({
    id: "west-ramp-bottom-to-stage",
    label: "西側舞台階段下→舞台",
    startBlender: Object.freeze([39.6, -9.8, 0]),
    endBlender: Object.freeze([41.8, -9.8, 1]),
    requiredPassageBlender: makeGymStageStairPassageBounds("west"),
    maximumDistanceBlender: 6
  }),
  Object.freeze({
    id: "stage-to-east-ramp-bottom",
    label: "舞台→東側舞台階段下",
    startBlender: Object.freeze([51.0, -9.8, 1]),
    endBlender: Object.freeze([53.2, -9.8, 0]),
    requiredPassageBlender: makeGymStageStairPassageBounds("east"),
    maximumDistanceBlender: 6
  }),
  Object.freeze({
    id: "stage-to-west-ramp-bottom",
    label: "舞台→西側舞台階段下",
    startBlender: Object.freeze([41.8, -9.8, 1]),
    endBlender: Object.freeze([39.6, -9.8, 0]),
    requiredPassageBlender: makeGymStageStairPassageBounds("west"),
    maximumDistanceBlender: 6
  }),
  Object.freeze({
    id: "north-second-floor-to-gym-gallery",
    label: "北側校舎2F→渡り廊下→体育館ギャラリー",
    startBlender: Object.freeze([38.8, 33.0, 3.6]),
    endBlender: Object.freeze([41.4, 25.8, 3.6]),
    requiredPassageBlender: Object.freeze([
      makeB03PortalPassageBounds(32.5, 3.6),
      makeB03PortalPassageBounds(26.5, 3.6)
    ])
  }),
  Object.freeze({
    id: "gym-gallery-to-north-second-floor",
    label: "体育館ギャラリー→渡り廊下→北側校舎2F",
    startBlender: Object.freeze([41.4, 25.8, 3.6]),
    endBlender: Object.freeze([38.8, 33.0, 3.6]),
    requiredPassageBlender: Object.freeze([
      makeB03PortalPassageBounds(26.5, 3.6),
      makeB03PortalPassageBounds(32.5, 3.6)
    ])
  }),
  Object.freeze({
    id: "gym-floor-to-west-gallery-stairs",
    label: "体育館床→西側袖階段→ギャラリー",
    startBlender: Object.freeze([35.7, -2.6, 0.15]),
    endBlender: Object.freeze([34.2, -2.2, 5.25]),
    requiredPassageBlender: makeB03StructurePassageBounds(34.8, -10.75, 2.55),
    maximumDistanceBlender: 20
  }),
  Object.freeze({
    id: "gym-west-gallery-stair-lower-flight",
    label: "体育館西側袖階段の下段",
    startBlender: Object.freeze([35.4, -3.8, 0.15]),
    endBlender: Object.freeze([35.4, -10.2, 2.55]),
    maximumDistanceBlender: 10
  }),
  Object.freeze({
    id: "gym-west-gallery-stair-upper-flight",
    label: "体育館西側袖階段の上段",
    startBlender: Object.freeze([34.2, -10.2, 2.55]),
    endBlender: Object.freeze([34.2, -3.0, 5.25]),
    maximumDistanceBlender: 10
  }),
  Object.freeze({
    id: "gym-west-gallery-stair-turn",
    label: "体育館西側袖階段の折り返し踊り場",
    startBlender: Object.freeze([35.4, -10.75, 2.55]),
    endBlender: Object.freeze([34.2, -10.75, 2.55]),
    maximumDistanceBlender: 5
  }),
  Object.freeze({
    id: "west-gallery-stairs-to-gym-floor",
    label: "ギャラリー→西側袖階段→体育館床",
    startBlender: Object.freeze([34.2, -2.2, 5.25]),
    endBlender: Object.freeze([35.7, -2.6, 0.15]),
    requiredPassageBlender: makeB03StructurePassageBounds(34.8, -10.75, 2.55),
    maximumDistanceBlender: 20
  }),
  Object.freeze({
    id: "gym-floor-to-east-gallery-stairs",
    label: "体育館床→東側袖階段→ギャラリー",
    startBlender: Object.freeze([57.1, -2.6, 0.15]),
    endBlender: Object.freeze([58.6, -2.2, 5.25]),
    requiredPassageBlender: makeB03StructurePassageBounds(58.0, -10.75, 2.55),
    maximumDistanceBlender: 20
  }),
  Object.freeze({
    id: "east-gallery-stairs-to-gym-floor",
    label: "ギャラリー→東側袖階段→体育館床",
    startBlender: Object.freeze([58.6, -2.2, 5.25]),
    endBlender: Object.freeze([57.1, -2.6, 0.15]),
    requiredPassageBlender: makeB03StructurePassageBounds(58.0, -10.75, 2.55),
    maximumDistanceBlender: 20
  }),
  Object.freeze({
    id: "gym-gallery-low-to-west-high",
    label: "体育館北側中央ギャラリー→北西昇段→西側ギャラリー",
    startBlender: Object.freeze([39.6, 25.8, 3.6]),
    endBlender: Object.freeze([34.2, 24.0, 5.25]),
    requiredPassageBlender: makeB03StructurePassageBounds(37.45, 25.8, 4.4),
    maximumDistanceBlender: 20
  }),
  Object.freeze({
    id: "west-gallery-high-to-low",
    label: "西側ギャラリー→北西昇段→体育館北側中央ギャラリー",
    startBlender: Object.freeze([34.2, 24.0, 5.25]),
    endBlender: Object.freeze([39.6, 25.8, 3.6]),
    requiredPassageBlender: makeB03StructurePassageBounds(37.45, 25.8, 4.4),
    maximumDistanceBlender: 20
  }),
  Object.freeze({
    id: "gym-gallery-low-to-east-high",
    label: "体育館北側中央ギャラリー→北東昇段→東側ギャラリー",
    startBlender: Object.freeze([43.2, 25.8, 3.6]),
    endBlender: Object.freeze([58.6, 24.0, 5.25]),
    requiredPassageBlender: makeB03StructurePassageBounds(45.35, 25.8, 4.425),
    maximumDistanceBlender: 20
  }),
  Object.freeze({
    id: "east-gallery-high-to-low",
    label: "東側ギャラリー→北東昇段→体育館北側中央ギャラリー",
    startBlender: Object.freeze([58.6, 24.0, 5.25]),
    endBlender: Object.freeze([43.2, 25.8, 3.6]),
    requiredPassageBlender: makeB03StructurePassageBounds(45.35, 25.8, 4.425),
    maximumDistanceBlender: 20
  }),
  Object.freeze({
    id: "north-third-floor-to-gym-rooftop",
    label: "北側校舎3F→渡り廊下屋根Ramp→体育館屋上",
    startBlender: Object.freeze([38.8, 33.0, 7.2]),
    endBlender: Object.freeze([41.4, 25.5, 9.6]),
    requiredPassageBlender: Object.freeze([
      makeB03PortalPassageBounds(32.5, 7.2),
      makeB03PortalPassageBounds(26.5, 9.6)
    ])
  }),
  Object.freeze({
    id: "gym-rooftop-to-north-third-floor",
    label: "体育館屋上→渡り廊下屋根Ramp→北側校舎3F",
    startBlender: Object.freeze([41.4, 25.5, 9.6]),
    endBlender: Object.freeze([38.8, 33.0, 7.2]),
    requiredPassageBlender: Object.freeze([
      makeB03PortalPassageBounds(26.5, 9.6),
      makeB03PortalPassageBounds(32.5, 7.2)
    ])
  }),
  Object.freeze({
    id: "main-entrance-to-west-extension-first-floor",
    label: "主玄関→西側延長1Fロッカー通路",
    startBlender: Object.freeze([-1.5, 0, 0]),
    endBlender: Object.freeze([-4.4, -5.2, 0])
  }),
  Object.freeze({
    id: "main-entry-locker-aisle-south-to-north",
    label: "主玄関6台ロッカー間通路・南→北",
    startBlender: Object.freeze([-1.2, -6.6, 0]),
    endBlender: Object.freeze([-1.2, -3.0, 0]),
    requiredPassageBlender: makeMainEntryLockerAisleBounds(),
    maximumDistanceBlender: 6
  }),
  Object.freeze({
    id: "main-entry-locker-aisle-north-to-south",
    label: "主玄関6台ロッカー間通路・北→南",
    startBlender: Object.freeze([-1.2, -3.0, 0]),
    endBlender: Object.freeze([-1.2, -6.6, 0]),
    requiredPassageBlender: makeMainEntryLockerAisleBounds(),
    maximumDistanceBlender: 6
  }),
  Object.freeze({
    id: "fourth-floor-corridor-to-west-extension",
    label: "4F西側廊下→西側延長4F",
    startBlender: Object.freeze([-2.0, 0.0, 10.8]),
    endBlender: Object.freeze([-4.4, -5.2, 10.8])
  }),
  Object.freeze({
    id: "west-extension-first-to-fourth-floor-via-stairs",
    label: "西側延長1F→南西階段→西側延長4F",
    startBlender: Object.freeze([-4.4, -5.2, 0]),
    endBlender: Object.freeze([-4.4, -5.2, 10.8]),
    requiredPassageBlender: makeStairPassageBounds(-10.8, -1.3, 6.0),
    maximumDistanceBlender: 65
  })
]);

const identityMatrix = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);

const fail = (message) => {
  throw new Error(message);
};

const assertObject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label}はobjectである必要があります。`);
  }
  return value;
};

const assertArray = (value, label) => {
  if (!Array.isArray(value)) {
    fail(`${label}はarrayである必要があります。`);
  }
  return value;
};

const assertInteger = (value, label, minimum = 0) => {
  if (!Number.isInteger(value) || value < minimum) {
    fail(`${label}は${minimum}以上のintegerである必要があります。`);
  }
  return value;
};

const assertFiniteNumber = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label}は有限numberである必要があります。`);
  }
  return value;
};

const assertFiniteNumberArray = (value, length, label) => {
  const values = assertArray(value, label);
  if (values.length !== length) {
    fail(`${label}は要素数${length}である必要があります。`);
  }
  return values.map((component, index) => assertFiniteNumber(component, `${label}[${index}]`));
};

const assertIndex = (value, length, label) => {
  const index = assertInteger(value, label);
  if (index >= length) {
    fail(`${label}=${index}は参照先件数${length}の範囲外です。`);
  }
  return index;
};

const assertExactKeys = (value, allowedKeys, label) => {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...allowedKeys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail(`${label}のkeysが不正です。期待=${expectedKeys.join(",")} 実際=${actualKeys.join(",")}`);
  }
};

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const parseGlb = (data) => {
  if (data.byteLength < 20) {
    fail("GLBがheaderとJSON chunkを保持する最小長に達していません。");
  }

  const magic = data.readUInt32LE(0);
  const version = data.readUInt32LE(4);
  const declaredLength = data.readUInt32LE(8);
  if (magic !== GLB_MAGIC) {
    fail(`GLB magicが不正です: 0x${magic.toString(16)}`);
  }
  if (version !== GLB_VERSION) {
    fail(`GLB versionが不正です: ${version}`);
  }
  if (declaredLength !== data.byteLength) {
    fail(`GLB header lengthが実ファイル長と一致しません: ${declaredLength} != ${data.byteLength}`);
  }

  let offset = 12;
  let chunkIndex = 0;
  let jsonChunk = null;
  let binaryChunk = null;

  while (offset < data.byteLength) {
    if (offset + 8 > data.byteLength) {
      fail(`GLB chunk ${chunkIndex}のheaderが途中で切れています。`);
    }
    const chunkLength = data.readUInt32LE(offset);
    const chunkType = data.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkLength % 4 !== 0) {
      fail(`GLB chunk ${chunkIndex}の長さが4-byte境界ではありません: ${chunkLength}`);
    }
    if (offset + chunkLength > data.byteLength) {
      fail(`GLB chunk ${chunkIndex}がファイル終端を超えています。`);
    }
    const chunk = data.subarray(offset, offset + chunkLength);
    offset += chunkLength;

    if (chunkIndex === 0 && chunkType !== JSON_CHUNK_TYPE) {
      fail("GLB先頭chunkがJSONではありません。");
    }
    if (chunkType === JSON_CHUNK_TYPE) {
      if (jsonChunk !== null) {
        fail("GLBにJSON chunkが複数あります。");
      }
      jsonChunk = chunk;
    } else if (chunkType === BIN_CHUNK_TYPE) {
      if (binaryChunk !== null) {
        fail("GLBにBIN chunkが複数あります。");
      }
      binaryChunk = chunk;
    } else {
      fail(`GLBに未対応chunk typeがあります: 0x${chunkType.toString(16)}`);
    }
    chunkIndex += 1;
  }

  if (offset !== data.byteLength) {
    fail("GLB chunk走査がファイル終端と一致しません。");
  }
  if (jsonChunk === null || binaryChunk === null || chunkIndex !== 2) {
    fail("GLBはJSON chunk 1件とBIN chunk 1件だけで構成する必要があります。");
  }

  const jsonText = new TextDecoder("utf-8", { fatal: true }).decode(jsonChunk);
  let document;
  try {
    document = JSON.parse(jsonText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`GLB JSONを解析できません: ${detail}`);
  }

  const gltf = assertObject(document, "glTF root");
  const asset = assertObject(gltf.asset, "glTF.asset");
  if (asset.version !== "2.0") {
    fail(`glTF.asset.versionが2.0ではありません: ${String(asset.version)}`);
  }
  const buffers = assertArray(gltf.buffers, "glTF.buffers");
  if (buffers.length !== 1) {
    fail(`GLBのbufferは1件である必要があります: ${buffers.length}`);
  }
  const bufferDefinition = assertObject(buffers[0], "glTF.buffers[0]");
  assertExactKeys(bufferDefinition, ["byteLength"], "glTF.buffers[0]");
  const declaredBinaryLength = assertInteger(
    bufferDefinition.byteLength,
    "glTF.buffers[0].byteLength",
    1
  );
  const paddingLength = binaryChunk.byteLength - declaredBinaryLength;
  if (paddingLength < 0 || paddingLength > 3) {
    fail(
      `GLB BIN chunk長とbuffer.byteLengthの差がpadding範囲外です: ${binaryChunk.byteLength} - ${declaredBinaryLength}`
    );
  }

  return {
    gltf,
    binary: binaryChunk.subarray(0, declaredBinaryLength)
  };
};

const multiplyMatrices = (left, right) => {
  const result = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        result[column * 4 + row] += left[inner * 4 + row] * right[column * 4 + inner];
      }
    }
  }
  return result;
};

const composeTrsMatrix = (translation, rotation, scale) => {
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  return [
    (1 - 2 * (yy + zz)) * sx,
    (2 * (xy + wz)) * sx,
    (2 * (xz - wy)) * sx,
    0,
    (2 * (xy - wz)) * sy,
    (1 - 2 * (xx + zz)) * sy,
    (2 * (yz + wx)) * sy,
    0,
    (2 * (xz + wy)) * sz,
    (2 * (yz - wx)) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    translation[0],
    translation[1],
    translation[2],
    1
  ];
};

const localMatrixForNode = (node, label) => {
  if (node.matrix !== undefined) {
    if (
      node.translation !== undefined ||
      node.rotation !== undefined ||
      node.scale !== undefined
    ) {
      fail(`${label}はmatrixとTRSを同時に持てません。`);
    }
    return assertFiniteNumberArray(node.matrix, 16, `${label}.matrix`);
  }

  const translation =
    node.translation === undefined
      ? [0, 0, 0]
      : assertFiniteNumberArray(node.translation, 3, `${label}.translation`);
  const rotation =
    node.rotation === undefined
      ? [0, 0, 0, 1]
      : assertFiniteNumberArray(node.rotation, 4, `${label}.rotation`);
  const scale =
    node.scale === undefined
      ? [1, 1, 1]
      : assertFiniteNumberArray(node.scale, 3, `${label}.scale`);
  const quaternionLength = Math.hypot(...rotation);
  if (Math.abs(quaternionLength - 1) > 1e-5) {
    fail(`${label}.rotationが単位quaternionではありません: ${quaternionLength}`);
  }
  if (scale.some((component) => component === 0)) {
    fail(`${label}.scaleに0があります。`);
  }
  return composeTrsMatrix(translation, rotation, scale);
};

const matrixDeterminant3x3 = (matrix) =>
  matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6]) -
  matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2]) +
  matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]);

const transformPosition = (matrix, x, y, z) => [
  matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
  matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
  matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
];

const buildSceneGraph = (gltf) => {
  const scenes = assertArray(gltf.scenes, "glTF.scenes");
  if (scenes.length !== 1) {
    fail(`glTF sceneは1件である必要があります: ${scenes.length}`);
  }
  if (gltf.scene !== 0) {
    fail(`glTF.sceneは0である必要があります: ${String(gltf.scene)}`);
  }

  const nodes = assertArray(gltf.nodes, "glTF.nodes");
  if (nodes.length === 0) {
    fail("glTF.nodesが空です。");
  }
  const scene = assertObject(scenes[0], "glTF.scenes[0]");
  const rootNodeIndices = assertArray(scene.nodes, "glTF.scenes[0].nodes").map(
    (nodeIndex, index) => assertIndex(nodeIndex, nodes.length, `glTF.scenes[0].nodes[${index}]`)
  );
  if (rootNodeIndices.length === 0) {
    fail("glTF default sceneにroot nodeがありません。");
  }

  const parentIndices = new Array(nodes.length).fill(-1);
  const names = new Set();
  nodes.forEach((nodeValue, nodeIndex) => {
    const node = assertObject(nodeValue, `glTF.nodes[${nodeIndex}]`);
    if (typeof node.name !== "string" || node.name.length === 0) {
      fail(`glTF.nodes[${nodeIndex}].nameが非空stringではありません。`);
    }
    if (names.has(node.name)) {
      fail(`glTF node名が重複しています: ${node.name}`);
    }
    names.add(node.name);

    if (node.children !== undefined) {
      assertArray(node.children, `glTF.nodes[${nodeIndex}].children`).forEach(
        (childValue, childOffset) => {
          const childIndex = assertIndex(
            childValue,
            nodes.length,
            `glTF.nodes[${nodeIndex}].children[${childOffset}]`
          );
          if (childIndex === nodeIndex) {
            fail(`glTF node ${node.name}が自身をchildにしています。`);
          }
          if (parentIndices[childIndex] !== -1) {
            fail(`glTF node ${nodes[childIndex].name}が複数のparentを持っています。`);
          }
          parentIndices[childIndex] = nodeIndex;
        }
      );
    }
  });

  const rootSet = new Set(rootNodeIndices);
  if (rootSet.size !== rootNodeIndices.length) {
    fail("glTF default sceneのroot node参照が重複しています。");
  }
  rootNodeIndices.forEach((rootIndex) => {
    if (parentIndices[rootIndex] !== -1) {
      fail(`glTF root node ${nodes[rootIndex].name}が別nodeのchildでもあります。`);
    }
  });

  const worldMatrices = new Array(nodes.length);
  const visitState = new Uint8Array(nodes.length);
  let visitedCount = 0;

  const visit = (nodeIndex, parentWorldMatrix) => {
    if (visitState[nodeIndex] === 1) {
      fail(`glTF node階層にcycleがあります: ${nodes[nodeIndex].name}`);
    }
    if (visitState[nodeIndex] === 2) {
      fail(`glTF node ${nodes[nodeIndex].name}へ重複到達しました。`);
    }
    visitState[nodeIndex] = 1;
    const node = nodes[nodeIndex];
    const localMatrix = localMatrixForNode(node, `glTF.nodes[${nodeIndex}](${node.name})`);
    const worldMatrix = multiplyMatrices(parentWorldMatrix, localMatrix);
    worldMatrices[nodeIndex] = worldMatrix;
    const determinant = matrixDeterminant3x3(worldMatrix);
    if (!Number.isFinite(determinant) || determinant <= 1e-8) {
      fail(`glTF node ${node.name}のworld transformが正の非退化変換ではありません: ${determinant}`);
    }
    if (node.children !== undefined) {
      node.children.forEach((childIndex) => visit(childIndex, worldMatrix));
    }
    visitState[nodeIndex] = 2;
    visitedCount += 1;
  };

  rootNodeIndices.forEach((rootIndex) => visit(rootIndex, identityMatrix));
  if (visitedCount !== nodes.length) {
    const unreachable = nodes
      .filter((_, nodeIndex) => visitState[nodeIndex] === 0)
      .map((node) => node.name);
    fail(`glTF default sceneから到達不能なnodeがあります: ${unreachable.join(", ")}`);
  }

  return { nodes, worldMatrices };
};

const validateMetadataAndNavigationNodes = (nodes) => {
  const metadataNodes = nodes
    .map((node, nodeIndex) => ({ node, nodeIndex }))
    .filter(({ node }) => node.name === "META_Stage");
  const allNavigationNodes = nodes
    .map((node, nodeIndex) => ({ node, nodeIndex }))
    .filter(({ node }) => node.name.startsWith("NAV_"));
  const contractErrors = [];

  if (metadataNodes.length !== 1) {
    contractErrors.push(`META_Stageは1件必要です（実際=${metadataNodes.length}件）`);
  }
  if (allNavigationNodes.length === 0) {
    contractErrors.push("NAV_* Meshがありません");
  }
  if (contractErrors.length > 0) {
    fail(`学校NavMeshベイク入力が未完成です: ${contractErrors.join(" / ")}`);
  }

  const metadataNode = metadataNodes[0].node;
  if (metadataNode.mesh !== undefined) {
    fail("META_StageはMeshを参照しないEmptyである必要があります。");
  }
  const metadataExtras = assertObject(metadataNode.extras, "META_Stage.extras");
  assertExactKeys(
    metadataExtras,
    [
      "hs_schema_version",
      "hs_stage_id",
      "hs_nav_profile",
      "hs_bit_nav_profile"
    ],
    "META_Stage.extras"
  );
  if (metadataExtras.hs_schema_version !== SCHOOL_NAV_PROFILE.schemaVersion) {
    fail(
      `META_Stage.hs_schema_versionが不一致です: ${String(metadataExtras.hs_schema_version)} != ${SCHOOL_NAV_PROFILE.schemaVersion}`
    );
  }
  if (metadataExtras.hs_stage_id !== SCHOOL_NAV_PROFILE.stageId) {
    fail(
      `META_Stage.hs_stage_idが不一致です: ${String(metadataExtras.hs_stage_id)} != ${SCHOOL_NAV_PROFILE.stageId}`
    );
  }
  if (metadataExtras.hs_nav_profile !== SCHOOL_NAV_PROFILE.id) {
    fail(
      `META_Stage.hs_nav_profileが不一致です: ${String(metadataExtras.hs_nav_profile)} != ${SCHOOL_NAV_PROFILE.id}`
    );
  }
  if (metadataExtras.hs_bit_nav_profile !== SCHOOL_NAV_PROFILE.bitNavProfileId) {
    fail(
      `META_Stage.hs_bit_nav_profileが不一致です: ${String(metadataExtras.hs_bit_nav_profile)} != ${SCHOOL_NAV_PROFILE.bitNavProfileId}`
    );
  }

  const countsByRole = { walkable: 0, blocker: 0, exclude: 0 };
  const countsByArea = { ground: 0, stairs: 0, outdoor: 0, door: 0 };
  const navigationNodes = [];
  allNavigationNodes.forEach((entry) => {
    const { node } = entry;
    if (node.mesh === undefined) {
      fail(`${node.name}はMeshを参照する必要があります。`);
    }
    const extras = assertObject(node.extras, `${node.name}.extras`);
    if (extras.hs_nav_set === "bit-flight") {
      return;
    }
    if (extras.hs_nav_set !== "human") {
      fail(`${node.name}.hs_nav_setがhuman/bit-flightではありません。`);
    }
    navigationNodes.push(entry);
    const role = extras.hs_nav_role;
    if (!REGISTERED_NAV_ROLES.has(role)) {
      fail(`${node.name}.hs_nav_roleが未登録です: ${String(role)}`);
    }
    if (role === "walkable") {
      assertExactKeys(
        extras,
        ["hs_nav_set", "hs_nav_role", "hs_nav_area"],
        `${node.name}.extras`
      );
      const area = extras.hs_nav_area;
      if (!REGISTERED_NAV_AREAS.has(area)) {
        fail(`${node.name}.hs_nav_areaが未登録です: ${String(area)}`);
      }
      countsByArea[area] += 1;
    } else {
      assertExactKeys(
        extras,
        ["hs_nav_set", "hs_nav_role"],
        `${node.name}.extras`
      );
    }
    countsByRole[role] += 1;
  });

  if (countsByRole.walkable === 0) {
    fail("hs_nav_role=walkableのNAV_* Meshがありません。");
  }
  if (navigationNodes.length === 0) {
    fail("hs_nav_set=humanのNAV_* Meshがありません。");
  }
  if (countsByRole.blocker === 0) {
    fail("hs_nav_role=blockerのNAV_* Meshがありません。");
  }
  if (countsByRole.exclude > 0) {
    fail(
      `school-humanoid-v1のSoloベイクはexcludeを使用しません: ${countsByRole.exclude}件`
    );
  }

  return { navigationNodes, countsByRole, countsByArea };
};

const componentReader = (binary, componentType, byteOffset) => {
  switch (componentType) {
    case 5121:
      return binary.readUInt8(byteOffset);
    case 5123:
      return binary.readUInt16LE(byteOffset);
    case 5125:
      return binary.readUInt32LE(byteOffset);
    case FLOAT_COMPONENT_TYPE:
      return binary.readFloatLE(byteOffset);
    default:
      fail(`未対応componentTypeです: ${componentType}`);
  }
};

const componentByteLength = (componentType) => {
  switch (componentType) {
    case 5121:
      return 1;
    case 5123:
      return 2;
    case 5125:
    case FLOAT_COMPONENT_TYPE:
      return 4;
    default:
      fail(`未対応componentTypeです: ${componentType}`);
  }
};

const readAccessor = (gltf, binary, accessorIndex, expectedKind) => {
  const accessors = assertArray(gltf.accessors, "glTF.accessors");
  const bufferViews = assertArray(gltf.bufferViews, "glTF.bufferViews");
  const checkedAccessorIndex = assertIndex(accessorIndex, accessors.length, "accessor index");
  const accessor = assertObject(
    accessors[checkedAccessorIndex],
    `glTF.accessors[${checkedAccessorIndex}]`
  );
  if (accessor.sparse !== undefined) {
    fail(`glTF.accessors[${checkedAccessorIndex}]はsparse accessorを使用できません。`);
  }
  if (accessor.bufferView === undefined) {
    fail(`glTF.accessors[${checkedAccessorIndex}]にbufferViewがありません。`);
  }
  if (accessor.normalized === true) {
    fail(`glTF.accessors[${checkedAccessorIndex}]はnormalized accessorを使用できません。`);
  }

  const componentType = assertInteger(
    accessor.componentType,
    `glTF.accessors[${checkedAccessorIndex}].componentType`
  );
  if (expectedKind === "position") {
    if (accessor.type !== "VEC3" || componentType !== FLOAT_COMPONENT_TYPE) {
      fail(
        `POSITION accessorはFLOAT VEC3である必要があります: type=${String(accessor.type)} componentType=${componentType}`
      );
    }
  } else if (
    accessor.type !== "SCALAR" ||
    !UNSIGNED_INDEX_COMPONENT_TYPES.has(componentType)
  ) {
    fail(
      `indices accessorはUNSIGNED BYTE/SHORT/INT SCALARである必要があります: type=${String(accessor.type)} componentType=${componentType}`
    );
  }

  const componentCount = expectedKind === "position" ? 3 : 1;
  const bytesPerComponent = componentByteLength(componentType);
  const elementByteLength = bytesPerComponent * componentCount;
  const count = assertInteger(accessor.count, `glTF.accessors[${checkedAccessorIndex}].count`, 1);
  const bufferViewIndex = assertIndex(
    accessor.bufferView,
    bufferViews.length,
    `glTF.accessors[${checkedAccessorIndex}].bufferView`
  );
  const bufferView = assertObject(
    bufferViews[bufferViewIndex],
    `glTF.bufferViews[${bufferViewIndex}]`
  );
  if (bufferView.buffer !== 0) {
    fail(`glTF.bufferViews[${bufferViewIndex}].bufferは0である必要があります。`);
  }
  const viewOffset =
    bufferView.byteOffset === undefined
      ? 0
      : assertInteger(bufferView.byteOffset, `glTF.bufferViews[${bufferViewIndex}].byteOffset`);
  const viewLength = assertInteger(
    bufferView.byteLength,
    `glTF.bufferViews[${bufferViewIndex}].byteLength`,
    1
  );
  const accessorOffset =
    accessor.byteOffset === undefined
      ? 0
      : assertInteger(accessor.byteOffset, `glTF.accessors[${checkedAccessorIndex}].byteOffset`);
  const stride =
    bufferView.byteStride === undefined
      ? elementByteLength
      : assertInteger(bufferView.byteStride, `glTF.bufferViews[${bufferViewIndex}].byteStride`, 4);

  if (accessorOffset % bytesPerComponent !== 0 || stride % bytesPerComponent !== 0) {
    fail(`glTF.accessors[${checkedAccessorIndex}]のbyte alignmentが不正です。`);
  }
  if (stride < elementByteLength || stride > 252) {
    fail(`glTF.bufferViews[${bufferViewIndex}].byteStrideが不正です: ${stride}`);
  }
  const firstByte = viewOffset + accessorOffset;
  const lastByteExclusive = firstByte + (count - 1) * stride + elementByteLength;
  if (lastByteExclusive > viewOffset + viewLength || lastByteExclusive > binary.byteLength) {
    fail(`glTF.accessors[${checkedAccessorIndex}]がbufferViewまたはBIN chunkを超えています。`);
  }

  const values = new Array(count * componentCount);
  for (let elementIndex = 0; elementIndex < count; elementIndex += 1) {
    const elementOffset = firstByte + elementIndex * stride;
    for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
      const value = componentReader(
        binary,
        componentType,
        elementOffset + componentIndex * bytesPerComponent
      );
      if (!Number.isFinite(value)) {
        fail(`glTF.accessors[${checkedAccessorIndex}]に有限値でない要素があります。`);
      }
      values[elementIndex * componentCount + componentIndex] = value;
    }
  }

  return { values, count };
};
const extractNavigationGeometry = (
  gltf,
  binary,
  worldMatrices,
  navigationNodes
) => {
  const meshes = assertArray(gltf.meshes, "glTF.meshes");
  const positions = [];
  const indices = [];
  const sourceStatistics = [];
  const meshNames = new Set();

  meshes.forEach((meshValue, meshIndex) => {
    const mesh = assertObject(meshValue, `glTF.meshes[${meshIndex}]`);
    if (typeof mesh.name !== "string" || mesh.name.length === 0) {
      fail(`glTF.meshes[${meshIndex}].nameが非空stringではありません。`);
    }
    if (meshNames.has(mesh.name)) {
      fail(`glTF mesh名が重複しています: ${mesh.name}`);
    }
    meshNames.add(mesh.name);
  });

  navigationNodes.forEach(({ node, nodeIndex }) => {
    const meshIndex = assertIndex(node.mesh, meshes.length, `${node.name}.mesh`);
    const mesh = meshes[meshIndex];
    if (mesh.name !== node.name) {
      fail(`${node.name}のObject名とMesh名が一致しません: ${mesh.name}`);
    }
    const primitives = assertArray(mesh.primitives, `${mesh.name}.primitives`);
    if (primitives.length === 0) {
      fail(`${mesh.name}.primitivesが空です。`);
    }
    const worldMatrix = worldMatrices[nodeIndex];
    let sourceVertexCount = 0;
    let sourceTriangleCount = 0;

    primitives.forEach((primitiveValue, primitiveIndex) => {
      const primitive = assertObject(
        primitiveValue,
        `${mesh.name}.primitives[${primitiveIndex}]`
      );
      const mode = primitive.mode === undefined ? TRIANGLES_MODE : primitive.mode;
      if (mode !== TRIANGLES_MODE) {
        fail(`${mesh.name}.primitives[${primitiveIndex}]はTRIANGLESではありません: ${mode}`);
      }
      if (primitive.indices === undefined) {
        fail(`${mesh.name}.primitives[${primitiveIndex}]にindicesがありません。`);
      }
      if (primitive.targets !== undefined) {
        fail(`${mesh.name}.primitives[${primitiveIndex}]はmorph targetsを使用できません。`);
      }
      const attributes = assertObject(
        primitive.attributes,
        `${mesh.name}.primitives[${primitiveIndex}].attributes`
      );
      if (attributes.POSITION === undefined) {
        fail(`${mesh.name}.primitives[${primitiveIndex}]にPOSITIONがありません。`);
      }

      const positionAccessor = readAccessor(
        gltf,
        binary,
        attributes.POSITION,
        "position"
      );
      const indexAccessor = readAccessor(gltf, binary, primitive.indices, "index");
      if (indexAccessor.count % 3 !== 0) {
        fail(`${mesh.name}.primitives[${primitiveIndex}]のindex数が3の倍数ではありません。`);
      }

      const vertexOffset = positions.length / 3;
      for (let vertexIndex = 0; vertexIndex < positionAccessor.count; vertexIndex += 1) {
        const sourceOffset = vertexIndex * 3;
        const transformed = transformPosition(
          worldMatrix,
          positionAccessor.values[sourceOffset],
          positionAccessor.values[sourceOffset + 1],
          positionAccessor.values[sourceOffset + 2]
        );
        positions.push(
          transformed[0] * SCHOOL_NAV_PROFILE.worldScale,
          transformed[1] * SCHOOL_NAV_PROFILE.worldScale,
          transformed[2] * SCHOOL_NAV_PROFILE.worldScale
        );
      }
      indexAccessor.values.forEach((indexValue) => {
        if (indexValue >= positionAccessor.count) {
          fail(
            `${mesh.name}.primitives[${primitiveIndex}]のindex ${indexValue}が頂点数${positionAccessor.count}の範囲外です。`
          );
        }
        indices.push(vertexOffset + indexValue);
      });
      sourceVertexCount += positionAccessor.count;
      sourceTriangleCount += indexAccessor.count / 3;
    });

    sourceStatistics.push({
      name: node.name,
      role: node.extras.hs_nav_role,
      area: node.extras.hs_nav_area ?? null,
      vertices: sourceVertexCount,
      triangles: sourceTriangleCount
    });
  });

  if (positions.length === 0 || indices.length === 0) {
    fail("NAV_*からRecast入力三角形を抽出できませんでした。");
  }

  const boundsMin = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const boundsMax = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      boundsMin[axis] = Math.min(boundsMin[axis], positions[offset + axis]);
      boundsMax[axis] = Math.max(boundsMax[axis], positions[offset + axis]);
    }
  }

  return {
    positions,
    indices,
    boundsMin,
    boundsMax,
    sourceStatistics
  };
};

const assertInstalledRecastVersion = async () => {
  const packagePath = resolve(REPOSITORY_ROOT, "node_modules/recast-navigation/package.json");
  const packageDocument = JSON.parse(await readFile(packagePath, "utf8"));
  const packageMetadata = assertObject(packageDocument, "recast-navigation package.json");
  if (packageMetadata.version !== SCHOOL_NAV_PROFILE.recastVersion) {
    fail(
      `recast-navigation versionがプロファイルと不一致です: ${String(packageMetadata.version)} != ${SCHOOL_NAV_PROFILE.recastVersion}`
    );
  }
};

const arraysEqual = (left, right) =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

// Blender右手Z-upから、GLBと同じRecast右手Y-upへ変換する。
// (x, y, z) -> (x * scale, z * scale, -y * scale)
const blenderPointToRecast = ([x, y, z]) => ({
  x: x * SCHOOL_NAV_PROFILE.worldScale,
  y: z * SCHOOL_NAV_PROFILE.worldScale,
  z: -y * SCHOOL_NAV_PROFILE.worldScale
});

const recastPointToBlender = (point) => [
  point.x / SCHOOL_NAV_PROFILE.worldScale,
  -point.z / SCHOOL_NAV_PROFILE.worldScale,
  point.y / SCHOOL_NAV_PROFILE.worldScale
];

const recastPointToArray = (point) => [point.x, point.y, point.z];

const distanceBetweenPoints = (left, right) =>
  Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

const measurePathDistance = (path) => {
  let distance = 0;
  for (let index = 1; index < path.length; index += 1) {
    distance += distanceBetweenPoints(path[index - 1], path[index]);
  }
  return distance;
};

const projectRepresentativeRoutePoint = (query, point, label) => {
  const result = query.findClosestPoint(point, {
    halfExtents: REPRESENTATIVE_ROUTE_QUERY_HALF_EXTENTS,
  });
  if (!result.success || result.polyRef === 0) {
    const diagnostic = query.findClosestPoint(point, {
      halfExtents: { x: 1, y: 1, z: 1 }
    });
    fail(
      `代表経路の${label}をNavMeshへ投影できませんでした。` +
      ` nearest=${JSON.stringify(diagnostic)}`
    );
  }
  const projectionDistance = distanceBetweenPoints(point, result.point);
  if (projectionDistance > REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE) {
    fail(
      `代表経路の${label}投影距離が上限を超えました: ` +
      `${projectionDistance} > ${REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE}, ` +
      `nearest=${JSON.stringify(result.point)}`
    );
  }
  return {
    point: result.point,
    polygonRef: result.polyRef,
    projectionDistance,
  };
};

const computeAllCrossingsPath = (
  query,
  projectedStart,
  projectedEnd
) => {
  const corridorResult = query.findPath(
    projectedStart.polygonRef,
    projectedEnd.polygonRef,
    projectedStart.point,
    projectedEnd.point,
    {
      maxPathPolys: REPRESENTATIVE_ROUTE_PATH_LIMIT
    }
  );
  try {
    if (!corridorResult.success || corridorResult.polys.size === 0) {
      return {
        success: false,
        error: { name: "polygon corridor not found" },
        path: []
      };
    }
    const straightPathResult = query.findStraightPath(
      projectedStart.point,
      projectedEnd.point,
      corridorResult.polys,
      {
        maxStraightPathPoints: REPRESENTATIVE_ROUTE_PATH_LIMIT,
        straightPathOptions: Detour.DT_STRAIGHTPATH_ALL_CROSSINGS
      }
    );
    try {
      if (
        !straightPathResult.success ||
        straightPathResult.straightPathCount === 0
      ) {
        return {
          success: false,
          error: { name: "all-crossings straight path not found" },
          path: []
        };
      }
      const coordinates = straightPathResult.straightPath.toTypedArray();
      return {
        success: true,
        path: Array.from(
          { length: straightPathResult.straightPathCount },
          (_, index) => ({
            x: coordinates[index * 3],
            y: coordinates[index * 3 + 1],
            z: coordinates[index * 3 + 2]
          })
        )
      };
    } finally {
      straightPathResult.straightPath.destroy();
      straightPathResult.straightPathFlags.destroy();
      straightPathResult.straightPathRefs.destroy();
    }
  } finally {
    corridorResult.polys.destroy();
  }
};

const validateRepresentativeRoutes = (navMesh) => {
  const query = new NavMeshQuery(navMesh, {
    maxNodes: REPRESENTATIVE_ROUTE_PATH_LIMIT
  });
  try {
    const failures = [];
    const routes = REPRESENTATIVE_ROUTES.map((route) => {
      const startRecast = blenderPointToRecast(route.startBlender);
      const endRecast = blenderPointToRecast(route.endBlender);
      const projectedStart = projectRepresentativeRoutePoint(
        query,
        startRecast,
        `${route.label}の始点`
      );
      const projectedEnd = projectRepresentativeRoutePoint(
        query,
        endRecast,
        `${route.label}の終点`
      );
      const pathResult = computeAllCrossingsPath(
        query,
        projectedStart,
        projectedEnd
      );
      if (!pathResult.success || pathResult.path.length === 0) {
        failures.push(
          `代表経路を計算できませんでした: ${route.label}, ` +
          `error=${pathResult.error?.name ?? "経路点0件"}`
        );
        return null;
      }

      const startpoint = pathResult.path[0];
      const endpoint = pathResult.path[pathResult.path.length - 1];
      const startpointError = distanceBetweenPoints(
        startpoint,
        projectedStart.point
      );
      const endpointError = distanceBetweenPoints(endpoint, projectedEnd.point);
      if (
        startpointError > REPRESENTATIVE_ROUTE_ENDPOINT_TOLERANCE ||
        endpointError > REPRESENTATIVE_ROUTE_ENDPOINT_TOLERANCE
      ) {
        failures.push(
          `代表経路が投影済み両端へ到達していません: ${route.label}, ` +
          `startpointError=${startpointError}, ` +
          `endpointError=${endpointError}, ` +
          `actualEndpointBlender=${JSON.stringify(recastPointToBlender(endpoint))}, ` +
          `tolerance=${REPRESENTATIVE_ROUTE_ENDPOINT_TOLERANCE}`
        );
        return null;
      }

      const distance = measurePathDistance(pathResult.path);
      const distanceBlender = distance / SCHOOL_NAV_PROFILE.worldScale;
      const pathBlender = pathResult.path.map((point) =>
        pointFromArray(recastPointToBlender(point))
      );
      const requiredPassagesBlender =
        route.requiredPassageBlender === undefined
          ? []
          : Array.isArray(route.requiredPassageBlender)
            ? route.requiredPassageBlender
            : [route.requiredPassageBlender];
      const passedRequiredPassages = requiredPassagesBlender.map((bounds) =>
        pathBlender.some(
          (point, index) =>
            index > 0 &&
            segmentIntersectsBounds(
              pathBlender[index - 1],
              point,
              bounds,
              ["x", "y", "z"]
            )
        )
      );
      const passesRequiredPassage = passedRequiredPassages.every(Boolean);
      if (!passesRequiredPassage) {
        failures.push(
          `代表経路が指定必須区間をすべて通過していません: ${route.label}, ` +
          `requiredPassageBlender=${JSON.stringify(requiredPassagesBlender)}, ` +
          `passedRequiredPassages=${JSON.stringify(passedRequiredPassages)}, ` +
          `pathBlender=${JSON.stringify(pathBlender)}`
        );
        return null;
      }
      if (
        route.maximumDistanceBlender !== undefined &&
        distanceBlender > route.maximumDistanceBlender
      ) {
        failures.push(
          `代表経路が指定階段の距離上限を超えました: ${route.label}, ` +
          `distanceBlender=${distanceBlender}, ` +
          `maximumDistanceBlender=${route.maximumDistanceBlender}`
        );
        return null;
      }

      return {
        id: route.id,
        label: route.label,
        startBlender: route.startBlender,
        endBlender: route.endBlender,
        startRecast: recastPointToArray(startRecast),
        endRecast: recastPointToArray(endRecast),
        projectedStartRecast: recastPointToArray(projectedStart.point),
        projectedEndRecast: recastPointToArray(projectedEnd.point),
        startProjectionDistance: projectedStart.projectionDistance,
        endProjectionDistance: projectedEnd.projectionDistance,
        pathRecast: pathResult.path.map(recastPointToArray),
        distance,
        distanceBlender,
        requiredPassageBlender: requiredPassagesBlender,
        passedRequiredPassages,
        passesRequiredPassage,
        straightPathOptions: Detour.DT_STRAIGHTPATH_ALL_CROSSINGS,
        maximumDistanceBlender: route.maximumDistanceBlender ?? null,
        startpointError,
        endpointError
      };
    });
    if (failures.length > 0) {
      fail(failures.join("\n"));
    }
    return routes;
  } finally {
    query.destroy();
  }
};

const pointFromArray = ([x, y, z]) => ({ x, y, z });

const segmentIntersectsBounds = (start, end, bounds, axes) => {
  let minimumParameter = 0;
  let maximumParameter = 1;
  for (const axis of axes) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) <= Number.EPSILON) {
      if (start[axis] < bounds.minimum[axis] || start[axis] > bounds.maximum[axis]) {
        return false;
      }
      continue;
    }
    let entry = (bounds.minimum[axis] - start[axis]) / delta;
    let exit = (bounds.maximum[axis] - start[axis]) / delta;
    if (entry > exit) {
      [entry, exit] = [exit, entry];
    }
    minimumParameter = Math.max(minimumParameter, entry);
    maximumParameter = Math.min(maximumParameter, exit);
    if (minimumParameter > maximumParameter) {
      return false;
    }
  }
  return true;
};
const main = async () => {
  await assertInstalledRecastVersion();
  const glbData = await readFile(INPUT_PATH);
  const glbHash = sha256(glbData);
  const { gltf, binary } = parseGlb(glbData);
  const { nodes, worldMatrices } = buildSceneGraph(gltf);
  const { navigationNodes, countsByRole, countsByArea } =
    validateMetadataAndNavigationNodes(nodes);
  const geometry = extractNavigationGeometry(
    gltf,
    binary,
    worldMatrices,
    navigationNodes
  );

  await init();
  const bakeStartedAt = performance.now();
  const generationResult = generateSoloNavMesh(
    geometry.positions,
    geometry.indices,
    SCHOOL_NAV_PROFILE.parameters
  );
  const bakeMilliseconds = performance.now() - bakeStartedAt;
  if (!generationResult.success) {
    fail(`Recast Solo NavMesh生成に失敗しました: ${generationResult.error}`);
  }

  const navMesh = generationResult.navMesh;
  let restoredNavMesh = null;
  try {
    const navMeshData = exportNavMesh(navMesh);
    if (navMeshData.byteLength === 0) {
      fail("exportNavMesh()が空のバイナリを返しました。");
    }
    const restored = importNavMesh(navMeshData);
    restoredNavMesh = restored.navMesh;
    const restoredData = exportNavMesh(restoredNavMesh);
    if (!arraysEqual(navMeshData, restoredData)) {
      fail("NavMeshバイナリをimport/exportした結果が一致しません。");
    }

    const [navMeshPositions, navMeshIndices] = getNavMeshPositionsAndIndices(restoredNavMesh);
    if (navMeshPositions.length === 0 || navMeshIndices.length === 0) {
      fail("復元したNavMeshにpolygon geometryがありません。");
    }
    const representativeRoutes = validateRepresentativeRoutes(restoredNavMesh);
    await writeFile(OUTPUT_PATH, navMeshData);
    const profileHash = sha256(Buffer.from(stableStringify(SCHOOL_NAV_PROFILE), "utf8"));
    const report = {
      stageId: SCHOOL_NAV_PROFILE.stageId,
      profileId: SCHOOL_NAV_PROFILE.id,
      profileSha256: profileHash,
      recastVersion: SCHOOL_NAV_PROFILE.recastVersion,
      input: {
        path: INPUT_RELATIVE_PATH,
        bytes: glbData.byteLength,
        sha256: glbHash,
        nodes: nodes.length,
        navSources: navigationNodes.length,
        roles: countsByRole,
        areas: countsByArea,
        vertices: geometry.positions.length / 3,
        triangles: geometry.indices.length / 3,
        boundsMin: geometry.boundsMin,
        boundsMax: geometry.boundsMax,
        sources: geometry.sourceStatistics
      },
      output: {
        path: OUTPUT_RELATIVE_PATH,
        bytes: navMeshData.byteLength,
        sha256: sha256(navMeshData),
        vertices: navMeshPositions.length / 3,
        triangles: navMeshIndices.length / 3
      },
      validation: {
        coordinateTransform: {
          source: "blender-right-handed-z-up",
          destination: SCHOOL_NAV_PROFILE.coordinateSpace,
          worldScale: SCHOOL_NAV_PROFILE.worldScale,
          formula: "(x, y, z) -> (x * scale, z * scale, -y * scale)"
        },
        representativeRoutes: {
          endpointTolerance: REPRESENTATIVE_ROUTE_ENDPOINT_TOLERANCE,
          projectionMaxDistance: REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE,
          maxNodes: REPRESENTATIVE_ROUTE_PATH_LIMIT,
          maxPathPolys: REPRESENTATIVE_ROUTE_PATH_LIMIT,
          maxStraightPathPoints: REPRESENTATIVE_ROUTE_PATH_LIMIT,
          queryHalfExtents: REPRESENTATIVE_ROUTE_QUERY_HALF_EXTENTS,
          routes: representativeRoutes
        },
        bitFlightLinksExcluded: true
      },
      bakeMilliseconds: Number(bakeMilliseconds.toFixed(3))
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    restoredNavMesh?.destroy();
    navMesh.destroy();
  }
};

export {
  assertArray,
  assertExactKeys,
  assertFiniteNumber,
  assertInstalledRecastVersion,
  assertObject,
  buildSceneGraph,
  extractNavigationGeometry,
  fail,
  parseGlb,
  sha256,
  stableStringify
};

if (
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[学校NavMeshベイク失敗] ${message}\n`);
    process.exitCode = 1;
  });
}
