import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
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
  x: REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE,
  y: REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE,
  z: REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE
});
const LINK_ENDPOINT_COUNT = 120;
const LINK_PAIR_COUNT = 60;
const BIT_WINDOW_PAIR_COUNT = 58;
const BIT_ROOF_PAIR_COUNT = 2;
const LINK_PROJECTION_TOLERANCE = 1e-7;
const NORMAL_WINDOW_REGRESSION = Object.freeze({
  linkId: "bit-window-f01-courtyardnorth-corridor-02-u03",
  openingNodeName: "COL_HumanOnly_Window_F01_CourtyardNorth_Corridor_02_U03",
  entranceNodeName: "COL_BridgeSideRamp_West"
});
const CLOSED_UPPER_STAIR_FLIGHT_ENVELOPES = Object.freeze([
  Object.freeze({
    id: "northeast-upper-flight",
    label: "北東階段上段",
    centerBlender: Object.freeze([46.2, 41.9, 3.0]),
    halfExtentsBlender: Object.freeze([0.6, 0.3, 0.2]),
    detourRouteId: "northeast-landing-to-second-floor-west-corridor"
  }),
  Object.freeze({
    id: "southwest-upper-flight",
    label: "南西階段上段",
    centerBlender: Object.freeze([-9.0, 1.3, 3.0]),
    halfExtentsBlender: Object.freeze([0.3, 0.6, 0.2]),
    detourRouteId: "southwest-landing-to-second-floor-west-corridor"
  })
]);

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const INPUT_RELATIVE_PATH = "public/stage-assets/v2/B02/b02_school_blockout.glb";
const OUTPUT_RELATIVE_PATH = "public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin";
const INPUT_PATH = resolve(REPOSITORY_ROOT, INPUT_RELATIVE_PATH);
const OUTPUT_PATH = resolve(REPOSITORY_ROOT, OUTPUT_RELATIVE_PATH);

const SCHOOL_NAV_PROFILE = Object.freeze({
  id: "school-humanoid-v1",
  schemaVersion: 1,
  stageId: "school",
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
const LINK_SURFACE_HEIGHT_TOLERANCE_BLENDER =
  Math.max(
    SCHOOL_NAV_PROFILE.parameters.ch / SCHOOL_NAV_PROFILE.worldScale * 2,
    SCHOOL_NAV_PROFILE.parameters.walkableClimb *
      SCHOOL_NAV_PROFILE.parameters.ch /
      SCHOOL_NAV_PROFILE.worldScale
  ) + 1e-5;

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
    id: "northeast-landing-to-second-floor-west-corridor",
    label: "北東踊り場→2F西側廊下（北西階段迂回）",
    startBlender: Object.freeze([44.4, 44.3, 2.4]),
    endBlender: Object.freeze([-2, 15, 3.6])
  }),
  Object.freeze({
    id: "southwest-landing-to-second-floor-west-corridor",
    label: "南西踊り場→2F西側廊下（北西階段迂回）",
    startBlender: Object.freeze([-11.4, -0.5, 2.4]),
    endBlender: Object.freeze([-2, 15, 3.6])
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
    id: "male-toilet-aisle-to-stall",
    label: "男子トイレ通路→個室",
    startBlender: Object.freeze([-4.35, 42.4, 0]),
    endBlender: Object.freeze([-5.75, 44.6, 0])
  }),
  Object.freeze({
    id: "female-toilet-aisle-to-stall",
    label: "女子トイレ通路→個室",
    startBlender: Object.freeze([0.15, 42.4, 0]),
    endBlender: Object.freeze([-1.25, 44.6, 0])
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
    startBlender: Object.freeze([45.4, 0, 0]),
    endBlender: Object.freeze([45.4, -6.5, 1])
  }),
  Object.freeze({
    id: "east-ramp-bottom-to-stage",
    label: "東ランプ下→舞台",
    startBlender: Object.freeze([53.1, -6.5, 0]),
    endBlender: Object.freeze([45.4, -6.5, 1])
  }),
  Object.freeze({
    id: "west-ramp-bottom-to-stage",
    label: "西ランプ下→舞台",
    startBlender: Object.freeze([37.7, -6.5, 0]),
    endBlender: Object.freeze([45.4, -6.5, 1])
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
  const navigationNodes = nodes
    .map((node, nodeIndex) => ({ node, nodeIndex }))
    .filter(({ node }) => node.name.startsWith("NAV_"));
  const contractErrors = [];

  if (metadataNodes.length !== 1) {
    contractErrors.push(`META_Stageは1件必要です（実際=${metadataNodes.length}件）`);
  }
  if (navigationNodes.length === 0) {
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
    ["hs_schema_version", "hs_stage_id", "hs_nav_profile"],
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

  const countsByRole = { walkable: 0, blocker: 0, exclude: 0 };
  const countsByArea = { ground: 0, stairs: 0, outdoor: 0, door: 0 };
  navigationNodes.forEach(({ node }) => {
    if (node.mesh === undefined) {
      fail(`${node.name}はMeshを参照する必要があります。`);
    }
    const extras = assertObject(node.extras, `${node.name}.extras`);
    const role = extras.hs_nav_role;
    if (!REGISTERED_NAV_ROLES.has(role)) {
      fail(`${node.name}.hs_nav_roleが未登録です: ${String(role)}`);
    }
    if (role === "walkable") {
      assertExactKeys(extras, ["hs_nav_role", "hs_nav_area"], `${node.name}.extras`);
      const area = extras.hs_nav_area;
      if (!REGISTERED_NAV_AREAS.has(area)) {
        fail(`${node.name}.hs_nav_areaが未登録です: ${String(area)}`);
      }
      countsByArea[area] += 1;
    } else {
      assertExactKeys(extras, ["hs_nav_role"], `${node.name}.extras`);
    }
    countsByRole[role] += 1;
  });

  if (countsByRole.walkable === 0) {
    fail("hs_nav_role=walkableのNAV_* Meshがありません。");
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

const extractMeshNodeBoundsRecast = (
  gltf,
  binary,
  nodes,
  worldMatrices,
  nodeName
) => {
  const nodeIndex = nodes.findIndex((node) => node.name === nodeName);
  if (nodeIndex < 0) {
    fail(`境界取得対象nodeがありません: ${nodeName}`);
  }
  const node = nodes[nodeIndex];
  if (node.mesh === undefined) {
    fail(`境界取得対象nodeがMeshを参照していません: ${nodeName}`);
  }
  const meshes = assertArray(gltf.meshes, "glTF.meshes");
  const meshIndex = assertIndex(node.mesh, meshes.length, `${nodeName}.mesh`);
  const mesh = assertObject(meshes[meshIndex], `glTF.meshes[${meshIndex}]`);
  const primitives = assertArray(mesh.primitives, `${nodeName}.primitives`);
  const minimum = {
    x: Number.POSITIVE_INFINITY,
    y: Number.POSITIVE_INFINITY,
    z: Number.POSITIVE_INFINITY
  };
  const maximum = {
    x: Number.NEGATIVE_INFINITY,
    y: Number.NEGATIVE_INFINITY,
    z: Number.NEGATIVE_INFINITY
  };

  primitives.forEach((primitiveValue, primitiveIndex) => {
    const primitive = assertObject(
      primitiveValue,
      `${nodeName}.primitives[${primitiveIndex}]`
    );
    const attributes = assertObject(
      primitive.attributes,
      `${nodeName}.primitives[${primitiveIndex}].attributes`
    );
    if (attributes.POSITION === undefined) {
      fail(`${nodeName}.primitives[${primitiveIndex}]にPOSITIONがありません。`);
    }
    const accessor = readAccessor(gltf, binary, attributes.POSITION, "position");
    for (let vertexIndex = 0; vertexIndex < accessor.count; vertexIndex += 1) {
      const offset = vertexIndex * 3;
      const transformed = transformPosition(
        worldMatrices[nodeIndex],
        accessor.values[offset],
        accessor.values[offset + 1],
        accessor.values[offset + 2]
      );
      const point = {
        x: transformed[0] * SCHOOL_NAV_PROFILE.worldScale,
        y: transformed[1] * SCHOOL_NAV_PROFILE.worldScale,
        z: transformed[2] * SCHOOL_NAV_PROFILE.worldScale
      };
      for (const axis of ["x", "y", "z"]) {
        minimum[axis] = Math.min(minimum[axis], point[axis]);
        maximum[axis] = Math.max(maximum[axis], point[axis]);
      }
    }
  });

  if (!Number.isFinite(minimum.x) || !Number.isFinite(maximum.x)) {
    fail(`境界取得対象nodeに頂点がありません: ${nodeName}`);
  }
  return { minimum, maximum };
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
    fail(`代表経路の${label}をNavMeshへ投影できませんでした。`);
  }
  const projectionDistance = distanceBetweenPoints(point, result.point);
  if (projectionDistance > REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE) {
    fail(
      `代表経路の${label}投影距離が上限を超えました: ` +
      `${projectionDistance} > ${REPRESENTATIVE_ROUTE_PROJECTION_MAX_DISTANCE}`
    );
  }
  return {
    point: result.point,
    polygonRef: result.polyRef,
    projectionDistance,
  };
};

const blenderHalfExtentsToRecast = ([x, y, z]) => ({
  x: x * SCHOOL_NAV_PROFILE.worldScale,
  y: z * SCHOOL_NAV_PROFILE.worldScale,
  z: y * SCHOOL_NAV_PROFILE.worldScale
});

const calculateNavMeshBounds = (positions) => {
  const minimum = {
    x: Number.POSITIVE_INFINITY,
    y: Number.POSITIVE_INFINITY,
    z: Number.POSITIVE_INFINITY
  };
  const maximum = {
    x: Number.NEGATIVE_INFINITY,
    y: Number.NEGATIVE_INFINITY,
    z: Number.NEGATIVE_INFINITY
  };
  for (let offset = 0; offset < positions.length; offset += 3) {
    minimum.x = Math.min(minimum.x, positions[offset]);
    minimum.y = Math.min(minimum.y, positions[offset + 1]);
    minimum.z = Math.min(minimum.z, positions[offset + 2]);
    maximum.x = Math.max(maximum.x, positions[offset]);
    maximum.y = Math.max(maximum.y, positions[offset + 1]);
    maximum.z = Math.max(maximum.z, positions[offset + 2]);
  }
  return { minimum, maximum };
};

const countNavMeshPolygons = (navMesh) => {
  let polygonCount = 0;
  for (let tileIndex = 0; tileIndex < navMesh.getMaxTiles(); tileIndex += 1) {
    const header = navMesh.getTile(tileIndex).header();
    if (header !== null) {
      polygonCount += header.polyCount();
    }
  }
  if (polygonCount === 0) {
    fail("NavMeshのpolygon件数が0です。");
  }
  return polygonCount;
};

const collectLinkPairs = (nodes, worldMatrices) => {
  const pairMap = new Map();
  nodes.forEach((node, nodeIndex) => {
    if (!node.name.startsWith("LNK_")) {
      return;
    }
    if (node.mesh !== undefined) {
      fail(`${node.name}はMeshを参照しないEmptyである必要があります。`);
    }
    const extras = assertObject(node.extras, `${node.name}.extras`);
    assertExactKeys(
      extras,
      [
        "hs_id",
        "hs_endpoint",
        "hs_link_kind",
        "hs_bidirectional",
        "hs_link_radius_m"
      ],
      `${node.name}.extras`
    );
    if (typeof extras.hs_id !== "string" || extras.hs_id.length === 0) {
      fail(`${node.name}.hs_idが非空stringではありません。`);
    }
    if (extras.hs_endpoint !== "A" && extras.hs_endpoint !== "B") {
      fail(`${node.name}.hs_endpointがA/Bではありません。`);
    }
    if (extras.hs_link_kind !== "bit_window" && extras.hs_link_kind !== "bit_roof") {
      fail(`${node.name}.hs_link_kindが学校用特殊接続ではありません。`);
    }
    if (extras.hs_bidirectional !== true) {
      fail(`${node.name}.hs_bidirectionalがtrueではありません。`);
    }
    if (extras.hs_link_radius_m !== 0.54) {
      fail(`${node.name}.hs_link_radius_mが0.54ではありません。`);
    }
    const expectedName = `LNK_${extras.hs_id}_${extras.hs_endpoint}`;
    if (node.name !== expectedName) {
      fail(`${node.name}がextras由来の期待名${expectedName}と一致しません。`);
    }
    const transformed = transformPosition(worldMatrices[nodeIndex], 0, 0, 0);
    const rawRecast = {
      x: transformed[0] * SCHOOL_NAV_PROFILE.worldScale,
      y: transformed[1] * SCHOOL_NAV_PROFILE.worldScale,
      z: transformed[2] * SCHOOL_NAV_PROFILE.worldScale
    };
    const pair = pairMap.get(extras.hs_id) ?? {
      id: extras.hs_id,
      kind: extras.hs_link_kind,
      radiusMeters: extras.hs_link_radius_m,
      endpointA: null,
      endpointB: null
    };
    if (pair.kind !== extras.hs_link_kind || pair.radiusMeters !== extras.hs_link_radius_m) {
      fail(`特殊接続pairの契約が端点間で一致しません: ${extras.hs_id}`);
    }
    const key = extras.hs_endpoint === "A" ? "endpointA" : "endpointB";
    if (pair[key] !== null) {
      fail(`特殊接続端点が重複しています: ${extras.hs_id}/${extras.hs_endpoint}`);
    }
    pair[key] = {
      name: node.name,
      endpoint: extras.hs_endpoint,
      rawRecast
    };
    pairMap.set(extras.hs_id, pair);
  });

  const pairs = [...pairMap.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  if (pairs.length !== LINK_PAIR_COUNT) {
    fail(`特殊接続pairが${LINK_PAIR_COUNT}組ではありません: ${pairs.length}`);
  }
  pairs.forEach((pair) => {
    if (pair.endpointA === null || pair.endpointB === null) {
      fail(`特殊接続pairのA/Bが揃っていません: ${pair.id}`);
    }
  });
  const kindCounts = {
    bit_window: pairs.filter((pair) => pair.kind === "bit_window").length,
    bit_roof: pairs.filter((pair) => pair.kind === "bit_roof").length
  };
  if (
    kindCounts.bit_window !== BIT_WINDOW_PAIR_COUNT ||
    kindCounts.bit_roof !== BIT_ROOF_PAIR_COUNT
  ) {
    fail(
      `特殊接続kind件数が不正です: ` +
      `bit_window=${kindCounts.bit_window}, bit_roof=${kindCounts.bit_roof}`
    );
  }
  return { pairs, kindCounts };
};

const expectedLinkSurfaceBandBlender = (pair, endpoint) => {
  if (endpoint.endpoint === "A") {
    return {
      id: "outdoor-ground",
      nominal: -0.3,
      minimum: -0.3 - LINK_PROJECTION_TOLERANCE,
      maximum: 0.1 + LINK_PROJECTION_TOLERANCE
    };
  }
  let nominal;
  let id;
  if (pair.kind === "bit_roof") {
    nominal = 14.4;
    id = "rooftop";
  } else if (pair.id.includes("-gym-")) {
    nominal = 0;
    id = "gym-floor";
  } else {
    const floorMatch = pair.id.match(/-f0([1-4])-/);
    if (floorMatch === null) {
      fail(`bit_windowの階をhs_idから判定できません: ${pair.id}`);
    }
    const floor = Number(floorMatch[1]);
    nominal = (floor - 1) * 3.6;
    id = `school-floor-${floor}`;
  }
  return {
    id,
    nominal,
    minimum: nominal - LINK_SURFACE_HEIGHT_TOLERANCE_BLENDER,
    maximum: nominal + LINK_SURFACE_HEIGHT_TOLERANCE_BLENDER
  };
};

const projectLinkEndpoint = (
  query,
  polygonCount,
  navMeshBounds,
  pair,
  endpoint
) => {
  const radius = pair.radiusMeters * SCHOOL_NAV_PROFILE.worldScale;
  if (endpoint.rawRecast.y < navMeshBounds.minimum.y) {
    fail(`特殊接続端点がNavMesh下端より下です: ${endpoint.name}`);
  }
  const verticalSpan = endpoint.rawRecast.y - navMeshBounds.minimum.y;
  const searchCenter = {
    x: endpoint.rawRecast.x,
    y: navMeshBounds.minimum.y + verticalSpan / 2,
    z: endpoint.rawRecast.z
  };
  const searchHalfExtents = {
    x: radius,
    y: verticalSpan / 2,
    z: radius
  };
  const polygonResult = query.queryPolygons(searchCenter, searchHalfExtents, {
    maxPolys: polygonCount
  });
  if (!polygonResult.success) {
    fail(`特殊接続端点の直下polygon検索に失敗しました: ${endpoint.name}`);
  }
  const candidates = [...new Set(polygonResult.polyRefs)]
    .map((polyRef) => {
      const closestResult = query.closestPointOnPoly(polyRef, endpoint.rawRecast);
      if (!closestResult.success) {
        return null;
      }
      const point = closestResult.closestPoint;
      const verticalDrop = endpoint.rawRecast.y - point.y;
      const horizontalDistance = Math.hypot(
        endpoint.rawRecast.x - point.x,
        endpoint.rawRecast.z - point.z
      );
      if (
        verticalDrop < -LINK_PROJECTION_TOLERANCE ||
        horizontalDistance > radius + LINK_PROJECTION_TOLERANCE
      ) {
        return null;
      }
      return { polyRef, point, verticalDrop, horizontalDistance };
    })
    .filter((candidate) => candidate !== null)
    .sort(
      (left, right) =>
        left.verticalDrop - right.verticalDrop ||
        left.horizontalDistance - right.horizontalDistance ||
        left.polyRef - right.polyRef
    );
  if (candidates.length === 0) {
    fail(`特殊接続端点の直下にNavMesh面がありません: ${endpoint.name}`);
  }
  const selected = candidates[0];
  const projectedBlender = recastPointToBlender(selected.point);
  const expectedSurfaceBand = expectedLinkSurfaceBandBlender(pair, endpoint);
  const surfaceHeightError = Math.abs(projectedBlender[2] - expectedSurfaceBand.nominal);
  if (
    projectedBlender[2] < expectedSurfaceBand.minimum ||
    projectedBlender[2] > expectedSurfaceBand.maximum
  ) {
    fail(
      `特殊接続端点が期待する高さ帯へ投影されません: ${endpoint.name}, ` +
      `actual=${projectedBlender[2]}, ` +
      `expected=${expectedSurfaceBand.minimum}..${expectedSurfaceBand.maximum}`
    );
  }
  return {
    name: endpoint.name,
    endpoint: endpoint.endpoint,
    rawRecast: recastPointToArray(endpoint.rawRecast),
    rawBlender: recastPointToBlender(endpoint.rawRecast),
    projectedRecast: recastPointToArray(selected.point),
    projectedBlender,
    polyRef: selected.polyRef,
    verticalDrop: selected.verticalDrop,
    horizontalDistance: selected.horizontalDistance,
    expectedSurfaceBandBlender: expectedSurfaceBand,
    surfaceHeightErrorBlender: surfaceHeightError
  };
};

const validateLinkEndpointProjections = (
  navMesh,
  navMeshPositions,
  nodes,
  worldMatrices
) => {
  const { pairs, kindCounts } = collectLinkPairs(nodes, worldMatrices);
  const query = new NavMeshQuery(navMesh, {
    maxNodes: REPRESENTATIVE_ROUTE_PATH_LIMIT
  });
  try {
    const polygonCount = countNavMeshPolygons(navMesh);
    const navMeshBounds = calculateNavMeshBounds(navMeshPositions);
    const projectedPairs = pairs.map((pair) => ({
      ...pair,
      endpointA: projectLinkEndpoint(
        query,
        polygonCount,
        navMeshBounds,
        pair,
        pair.endpointA
      ),
      endpointB: projectLinkEndpoint(
        query,
        polygonCount,
        navMeshBounds,
        pair,
        pair.endpointB
      )
    }));
    const endpoints = projectedPairs.flatMap((pair) => [
      { id: pair.id, kind: pair.kind, ...pair.endpointA },
      { id: pair.id, kind: pair.kind, ...pair.endpointB }
    ]);
    if (endpoints.length !== LINK_ENDPOINT_COUNT) {
      fail(`特殊接続端点が${LINK_ENDPOINT_COUNT}件ではありません: ${endpoints.length}`);
    }
    const gymHighWindowEndpointCount = endpoints.filter(
      (endpoint) => endpoint.kind === "bit_window" && endpoint.id.includes("-gym-")
    ).length;
    const roofOutsideEndpointCount = endpoints.filter(
      (endpoint) => endpoint.kind === "bit_roof" && endpoint.endpoint === "A"
    ).length;
    if (gymHighWindowEndpointCount !== 14 || roofOutsideEndpointCount !== 2) {
      fail(
        `高所端点件数が不正です: ` +
        `gym=${gymHighWindowEndpointCount}, roofOutside=${roofOutsideEndpointCount}`
      );
    }
    const projectedHeightDistribution = Object.fromEntries(
      [...new Set(endpoints.map((endpoint) => endpoint.projectedBlender[2].toFixed(2)))]
        .sort((left, right) => Number(left) - Number(right))
        .map((height) => [
          height,
          endpoints.filter(
            (endpoint) => endpoint.projectedBlender[2].toFixed(2) === height
          ).length
        ])
    );
    const expectedBandDistribution = Object.fromEntries(
      [...new Set(endpoints.map((endpoint) => endpoint.expectedSurfaceBandBlender.id))]
        .sort()
        .map((bandId) => [
          bandId,
          endpoints.filter(
            (endpoint) => endpoint.expectedSurfaceBandBlender.id === bandId
          ).length
        ])
    );
    return {
      pairCount: projectedPairs.length,
      endpointCount: endpoints.length,
      kindCounts,
      polygonCount,
      horizontalRadiusMeters: 0.54,
      surfaceHeightToleranceBlender: LINK_SURFACE_HEIGHT_TOLERANCE_BLENDER,
      gymHighWindowEndpointCount,
      roofOutsideEndpointCount,
      projectedSurfaceHeightDistributionBlender: projectedHeightDistribution,
      expectedSurfaceBandDistribution: expectedBandDistribution,
      pairs: projectedPairs
    };
  } finally {
    query.destroy();
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
      const pathResult = query.computePath(projectedStart.point, projectedEnd.point, {
        halfExtents: REPRESENTATIVE_ROUTE_QUERY_HALF_EXTENTS,
        maxPathPolys: REPRESENTATIVE_ROUTE_PATH_LIMIT,
        maxStraightPathPoints: REPRESENTATIVE_ROUTE_PATH_LIMIT
      });
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
        distance: measurePathDistance(pathResult.path),
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

const pointWithinBounds = (point, bounds) =>
  point.x >= bounds.minimum.x - LINK_PROJECTION_TOLERANCE &&
  point.x <= bounds.maximum.x + LINK_PROJECTION_TOLERANCE &&
  point.y >= bounds.minimum.y - LINK_PROJECTION_TOLERANCE &&
  point.y <= bounds.maximum.y + LINK_PROJECTION_TOLERANCE &&
  point.z >= bounds.minimum.z - LINK_PROJECTION_TOLERANCE &&
  point.z <= bounds.maximum.z + LINK_PROJECTION_TOLERANCE;

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

const pathIntersectsBounds = (path, bounds, axes) => {
  for (let index = 1; index < path.length; index += 1) {
    if (segmentIntersectsBounds(path[index - 1], path[index], bounds, axes)) {
      return true;
    }
  }
  return false;
};

const boundsFromCenterAndHalfExtents = (center, halfExtents) => ({
  minimum: {
    x: center.x - halfExtents.x,
    y: center.y - halfExtents.y,
    z: center.z - halfExtents.z
  },
  maximum: {
    x: center.x + halfExtents.x,
    y: center.y + halfExtents.y,
    z: center.z + halfExtents.z
  }
});

const boundsToReport = (bounds) => {
  const firstBlenderCorner = recastPointToBlender(bounds.minimum);
  const secondBlenderCorner = recastPointToBlender(bounds.maximum);
  return {
    minimumRecast: recastPointToArray(bounds.minimum),
    maximumRecast: recastPointToArray(bounds.maximum),
    minimumBlender: firstBlenderCorner.map((value, index) =>
      Math.min(value, secondBlenderCorner[index])
    ),
    maximumBlender: firstBlenderCorner.map((value, index) =>
      Math.max(value, secondBlenderCorner[index])
    )
  };
};

const validateClosedUpperStairs = (navMesh, representativeRoutes) => {
  const query = new NavMeshQuery(navMesh, {
    maxNodes: REPRESENTATIVE_ROUTE_PATH_LIMIT
  });
  try {
    const polygonCount = countNavMeshPolygons(navMesh);
    return CLOSED_UPPER_STAIR_FLIGHT_ENVELOPES.map((definition) => {
      const center = blenderPointToRecast(definition.centerBlender);
      const halfExtents = blenderHalfExtentsToRecast(definition.halfExtentsBlender);
      const bounds = boundsFromCenterAndHalfExtents(center, halfExtents);
      const polygonResult = query.queryPolygons(center, halfExtents, {
        maxPolys: polygonCount
      });
      if (!polygonResult.success) {
        fail(`${definition.label}の局所polygon検索に失敗しました。`);
      }
      const localSurfacePolyRefs = [...new Set(polygonResult.polyRefs)].filter(
        (polyRef) => {
          const closest = query.closestPointOnPoly(polyRef, center);
          return closest.success && pointWithinBounds(closest.closestPoint, bounds);
        }
      );
      const detourRoute = representativeRoutes.find(
        (route) => route.id === definition.detourRouteId
      );
      if (detourRoute === undefined) {
        fail(`${definition.label}の迂回代表経路がありません。`);
      }
      const detourPath = detourRoute.pathRecast.map(pointFromArray);
      const detourIntersectsEnvelope = pathIntersectsBounds(
        detourPath,
        bounds,
        ["x", "y", "z"]
      );
      if (localSurfacePolyRefs.length > 0 || detourIntersectsEnvelope) {
        fail(
          `${definition.label}の閉鎖上段にNavMesh面または代表経路が侵入しています: ` +
          `localPolys=${localSurfacePolyRefs.length}, ` +
          `pathIntersects=${detourIntersectsEnvelope}`
        );
      }
      return {
        id: definition.id,
        label: definition.label,
        ...boundsToReport(bounds),
        queriedPolygonCount: polygonResult.polyRefs.length,
        localSurfacePolygonCount: localSurfacePolyRefs.length,
        detourRouteId: detourRoute.id,
        detourRouteDistance: detourRoute.distance,
        detourIntersectsEnvelope
      };
    });
  } finally {
    query.destroy();
  }
};

const validateNormalWindowDetour = (
  navMesh,
  gltf,
  binary,
  nodes,
  worldMatrices,
  linkProjectionValidation
) => {
  const pair = linkProjectionValidation.pairs.find(
    (candidate) => candidate.id === NORMAL_WINDOW_REGRESSION.linkId
  );
  if (pair === undefined) {
    fail(`通常窓迂回検証用linkがありません: ${NORMAL_WINDOW_REGRESSION.linkId}`);
  }
  const openingBounds = extractMeshNodeBoundsRecast(
    gltf,
    binary,
    nodes,
    worldMatrices,
    NORMAL_WINDOW_REGRESSION.openingNodeName
  );
  const entranceBounds = extractMeshNodeBoundsRecast(
    gltf,
    binary,
    nodes,
    worldMatrices,
    NORMAL_WINDOW_REGRESSION.entranceNodeName
  );
  const start = pointFromArray(pair.endpointA.projectedRecast);
  const end = pointFromArray(pair.endpointB.projectedRecast);
  const query = new NavMeshQuery(navMesh, {
    maxNodes: REPRESENTATIVE_ROUTE_PATH_LIMIT
  });
  try {
    const pathResult = query.computePath(start, end, {
      halfExtents: REPRESENTATIVE_ROUTE_QUERY_HALF_EXTENTS,
      maxPathPolys: REPRESENTATIVE_ROUTE_PATH_LIMIT,
      maxStraightPathPoints: REPRESENTATIVE_ROUTE_PATH_LIMIT
    });
    if (!pathResult.success || pathResult.path.length === 0) {
      fail("通常窓の内外を結ぶ正規入口迂回経路を計算できませんでした。");
    }
    const endpoint = pathResult.path[pathResult.path.length - 1];
    const endpointError = distanceBetweenPoints(endpoint, end);
    const crossesWindowOpening = pathIntersectsBounds(
      pathResult.path,
      openingBounds,
      ["x", "z"]
    );
    const crossesNormalEntrance = pathIntersectsBounds(
      pathResult.path,
      entranceBounds,
      ["x", "z"]
    );
    const pathDistance = measurePathDistance(pathResult.path);
    const directDistance = distanceBetweenPoints(start, end);
    if (
      endpointError > REPRESENTATIVE_ROUTE_ENDPOINT_TOLERANCE ||
      crossesWindowOpening ||
      !crossesNormalEntrance ||
      pathDistance <= directDistance
    ) {
      fail(
        `通常窓のsurface経路が正規入口へ迂回していません: ` +
        `endpointError=${endpointError}, window=${crossesWindowOpening}, ` +
        `entrance=${crossesNormalEntrance}, distance=${pathDistance}/${directDistance}, ` +
        `pathBlender=${JSON.stringify(pathResult.path.map(recastPointToBlender))}, ` +
        `entranceBounds=${JSON.stringify(boundsToReport(entranceBounds))}`
      );
    }
    return {
      linkId: pair.id,
      openingNodeName: NORMAL_WINDOW_REGRESSION.openingNodeName,
      entranceNodeName: NORMAL_WINDOW_REGRESSION.entranceNodeName,
      openingBounds: boundsToReport(openingBounds),
      entranceBounds: boundsToReport(entranceBounds),
      startRecast: recastPointToArray(start),
      endRecast: recastPointToArray(end),
      pathRecast: pathResult.path.map(recastPointToArray),
      pathDistance,
      directDistance,
      endpointError,
      crossesWindowOpening,
      crossesNormalEntrance
    };
  } finally {
    query.destroy();
  }
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
    const linkEndpointProjections = validateLinkEndpointProjections(
      restoredNavMesh,
      navMeshPositions,
      nodes,
      worldMatrices
    );
    const closedUpperStairs = validateClosedUpperStairs(
      restoredNavMesh,
      representativeRoutes
    );
    const normalWindowDetour = validateNormalWindowDetour(
      restoredNavMesh,
      gltf,
      binary,
      nodes,
      worldMatrices,
      linkEndpointProjections
    );

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
        linkEndpointProjections,
        negativeCases: {
          closedUpperStairs,
          normalWindowDetour
        }
      },
      bakeMilliseconds: Number(bakeMilliseconds.toFixed(3))
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    restoredNavMesh?.destroy();
    navMesh.destroy();
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[学校NavMeshベイク失敗] ${message}\n`);
  process.exitCode = 1;
});
