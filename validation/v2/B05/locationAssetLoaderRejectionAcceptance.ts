import { NullEngine, Scene } from "@babylonjs/core";

import {
  SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
} from "../../../src/world/schoolRuntimeSettings";
import {
  createSchoolStageDynamicSpatialInitializer
} from "../../../src/world/schoolStageDynamicRuntime";
import {
  SCHOOL_STAGE,
  type StageCatalogEntry
} from "../../../src/world/stageCatalog";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../../../src/world/stageSpatialContext";

export type LocationAssetLoaderRejectionAcceptanceCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type MutableGltfDocument = Record<string, unknown> & {
  nodes?: unknown;
};

type MutableGltfNode = Record<string, unknown> & {
  name?: unknown;
  extras?: unknown;
};

type GlbChunk = Readonly<{
  type: number;
  data: Uint8Array;
}>;

type DecodedGlb = Readonly<{
  version: number;
  chunks: readonly GlbChunk[];
}>;

type GltfMutationResult = Readonly<{
  objectName: string;
  expectedMessages: readonly string[];
}>;

type LoaderRejectionCase = Readonly<{
  name: string;
  fakeGlbUrl: string;
  bytes: Uint8Array;
  sha256: string;
  objectName: string;
  expectedMessages: readonly string[];
}>;

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const UNKNOWN_MISSION_MARKER_ROLE = "unknown_marker";
const UNKNOWN_HS_PROPERTY = "hs_b05_unknown_property";
const DOOR_FIXTURE_SEED = 2;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireUint32 = (
  view: DataView,
  offset: number,
  label: string
): number => {
  if (offset < 0 || offset + 4 > view.byteLength) {
    throw new Error(`GLB ${label}が範囲外です: offset=${offset}`);
  }
  return view.getUint32(offset, true);
};

const decodeGlb = (bytes: Uint8Array): DecodedGlb => {
  if (bytes.byteLength < GLB_HEADER_BYTES) {
    throw new Error(`GLB headerが不足しています: ${bytes.byteLength} bytes`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = requireUint32(view, 0, "magic");
  const version = requireUint32(view, 4, "version");
  const declaredLength = requireUint32(view, 8, "length");
  if (magic !== GLB_MAGIC) {
    throw new Error(`GLB magicが不正です: 0x${magic.toString(16)}`);
  }
  if (version !== GLB_VERSION) {
    throw new Error(`GLB versionが不正です: ${version}`);
  }
  if (declaredLength !== bytes.byteLength) {
    throw new Error(
      `GLB lengthが一致しません: ${declaredLength}/${bytes.byteLength}`
    );
  }

  const chunks: GlbChunk[] = [];
  let offset = GLB_HEADER_BYTES;
  while (offset < bytes.byteLength) {
    if (offset + GLB_CHUNK_HEADER_BYTES > bytes.byteLength) {
      throw new Error(`GLB chunk headerが不足しています: offset=${offset}`);
    }
    const chunkLength = requireUint32(view, offset, "chunk length");
    const chunkType = requireUint32(view, offset + 4, "chunk type");
    const dataStart = offset + GLB_CHUNK_HEADER_BYTES;
    const dataEnd = dataStart + chunkLength;
    if (chunkLength % 4 !== 0 || dataEnd > bytes.byteLength) {
      throw new Error(
        `GLB chunk長が不正です: type=0x${chunkType.toString(16)} ` +
          `length=${chunkLength}`
      );
    }
    chunks.push(
      Object.freeze({
        type: chunkType,
        data: bytes.slice(dataStart, dataEnd)
      })
    );
    offset = dataEnd;
  }
  if (chunks.filter((chunk) => chunk.type === GLB_JSON_CHUNK_TYPE).length !== 1) {
    throw new Error("GLB JSON chunkは1個必要です");
  }
  return Object.freeze({ version, chunks: Object.freeze(chunks) });
};

const parseJsonChunk = (chunk: GlbChunk): MutableGltfDocument => {
  const text = new TextDecoder("utf-8", { fatal: true })
    .decode(chunk.data)
    .replace(/[\u0000\u0020\t\r\n]+$/u, "");
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("GLB JSON chunkのrootがObjectではありません");
  }
  return parsed as MutableGltfDocument;
};

const encodeJsonChunk = (document: MutableGltfDocument): Uint8Array => {
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  const paddedLength = Math.ceil(encoded.byteLength / 4) * 4;
  const padded = new Uint8Array(paddedLength);
  padded.fill(0x20);
  padded.set(encoded);
  return padded;
};

const encodeGlb = (glb: DecodedGlb, jsonData: Uint8Array): Uint8Array => {
  const chunks = glb.chunks.map((chunk) =>
    chunk.type === GLB_JSON_CHUNK_TYPE
      ? Object.freeze({ type: chunk.type, data: jsonData })
      : chunk
  );
  const totalLength = chunks.reduce(
    (sum, chunk) => sum + GLB_CHUNK_HEADER_BYTES + chunk.data.byteLength,
    GLB_HEADER_BYTES
  );
  const result = new Uint8Array(totalLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, glb.version, true);
  view.setUint32(8, totalLength, true);
  let offset = GLB_HEADER_BYTES;
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.data.byteLength, true);
    view.setUint32(offset + 4, chunk.type, true);
    result.set(chunk.data, offset + GLB_CHUNK_HEADER_BYTES);
    offset += GLB_CHUNK_HEADER_BYTES + chunk.data.byteLength;
  }
  return result;
};

const requireGltfNodes = (
  document: MutableGltfDocument
): MutableGltfNode[] => {
  if (!Array.isArray(document.nodes)) {
    throw new Error("GLB JSONにnodes配列がありません");
  }
  return document.nodes.map((node, index) => {
    if (!isRecord(node)) {
      throw new Error(`GLB nodeがObjectではありません: index=${index}`);
    }
    return node as MutableGltfNode;
  });
};

const requireNodeByRole = (
  document: MutableGltfDocument,
  role: string
): Readonly<{
  node: MutableGltfNode;
  extras: Record<string, unknown>;
  objectName: string;
}> => {
  for (const node of requireGltfNodes(document)) {
    const extras = isRecord(node.extras) ? node.extras : null;
    if (extras?.hs_role !== role) {
      continue;
    }
    if (typeof node.name !== "string" || node.name.length === 0) {
      throw new Error(`hs_role=${role}のnode名が不正です`);
    }
    return Object.freeze({ node, extras, objectName: node.name });
  }
  throw new Error(`GLB JSONにhs_role=${role}がありません`);
};

const mutateGlb = (
  originalBytes: Uint8Array,
  mutate: (document: MutableGltfDocument) => GltfMutationResult
): Readonly<{
  bytes: Uint8Array;
  mutation: GltfMutationResult;
}> => {
  const decoded = decodeGlb(originalBytes);
  const jsonChunk = decoded.chunks.find(
    (chunk) => chunk.type === GLB_JSON_CHUNK_TYPE
  )!;
  const document = parseJsonChunk(jsonChunk);
  const mutation = mutate(document);
  return Object.freeze({
    bytes: encodeGlb(decoded, encodeJsonChunk(document)),
    mutation
  });
};

const mutateMissionAnchorRole = (
  document: MutableGltfDocument
): GltfMutationResult => {
  const authored = requireNodeByRole(document, "mission_anchor");
  const encoder = new TextEncoder();
  if (
    encoder.encode("mission_anchor").byteLength !==
    encoder.encode(UNKNOWN_MISSION_MARKER_ROLE).byteLength
  ) {
    throw new Error("未知mission marker roleが同一byte長ではありません");
  }
  authored.extras.hs_role = UNKNOWN_MISSION_MARKER_ROLE;
  return Object.freeze({
    objectName: authored.objectName,
    expectedMessages: Object.freeze([
      "未登録値です",
      `.hs_role=${UNKNOWN_MISSION_MARKER_ROLE}`
    ])
  });
};

const mutateLocationAreaPriority = (
  document: MutableGltfDocument
): GltfMutationResult => {
  const authored = requireNodeByRole(document, "location_area");
  if (!Object.prototype.hasOwnProperty.call(authored.extras, "hs_priority")) {
    throw new Error(
      `location_areaにhs_priorityがありません: ${authored.objectName}`
    );
  }
  delete authored.extras.hs_priority;
  return Object.freeze({
    objectName: authored.objectName,
    expectedMessages: Object.freeze(["整数が必要です", ".hs_priority"])
  });
};

const mutateUnknownHsProperty = (
  document: MutableGltfDocument
): GltfMutationResult => {
  const authored = requireNodeByRole(document, "mission_anchor");
  if (Object.prototype.hasOwnProperty.call(authored.extras, UNKNOWN_HS_PROPERTY)) {
    throw new Error(
      `未知property fixture名が既に使われています: ${authored.objectName}`
    );
  }
  authored.extras[UNKNOWN_HS_PROPERTY] = true;
  return Object.freeze({
    objectName: authored.objectName,
    expectedMessages: Object.freeze([
      "未登録のhs_ propertyです",
      `.${UNKNOWN_HS_PROPERTY}`
    ])
  });
};

const mutateUnknownMapRole = (
  document: MutableGltfDocument
): GltfMutationResult => {
  const authored = requireNodeByRole(document, "map_barrier");
  authored.extras.hs_role = "map_unknown";
  return Object.freeze({
    objectName: authored.objectName,
    expectedMessages: Object.freeze(["未登録のMAP_* roleです", ".map_unknown"])
  });
};

const mutateMapMissingFloor = (
  document: MutableGltfDocument
): GltfMutationResult => {
  const authored = requireNodeByRole(document, "map_passage");
  delete authored.extras.hs_floor_id;
  return Object.freeze({
    objectName: authored.objectName,
    expectedMessages: Object.freeze(["非空文字列が必要です", ".hs_floor_id"])
  });
};

const mutateMapUnknownFloor = (
  document: MutableGltfDocument
): GltfMutationResult => {
  const authored = requireNodeByRole(document, "map_barrier");
  authored.extras.hs_floor_id = "b01";
  return Object.freeze({
    objectName: authored.objectName,
    expectedMessages: Object.freeze(["未登録値です", ".hs_floor_id=b01"])
  });
};

const mutateDuplicateMapId = (
  document: MutableGltfDocument
): GltfMutationResult => {
  const barrier = requireNodeByRole(document, "map_barrier");
  const passage = requireNodeByRole(document, "map_passage");
  barrier.extras.hs_id = passage.extras.hs_id;
  return Object.freeze({
    objectName: barrier.objectName,
    expectedMessages: Object.freeze(["hs_idが重複しています"])
  });
};

const calculateSha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const toAbsoluteUrl = (url: string): string =>
  new URL(url, window.location.href).href;

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    return toAbsoluteUrl(input);
  }
  if (input instanceof URL) {
    return input.href;
  }
  return toAbsoluteUrl(input.url);
};

const loadMutationAndCaptureRejection = async (
  engine: NullEngine,
  testCase: LoaderRejectionCase
): Promise<string | null> => {
  const scene = new Scene(engine);
  let context: StageSpatialContext | null = null;
  const stage: StageCatalogEntry = Object.freeze({
    ...SCHOOL_STAGE,
    glbUrl: testCase.fakeGlbUrl,
    glbSha256: testCase.sha256
  });
  try {
    context = await loadStageSpatialContext(scene, stage, {
      initializeDynamicSpatial:
        createSchoolStageDynamicSpatialInitializer(DOOR_FIXTURE_SEED),
      roomVariantSelections: SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    context?.dispose();
    scene.dispose();
  }
};

export const runLocationAssetLoaderRejectionAcceptance = async (): Promise<
  readonly LocationAssetLoaderRejectionAcceptanceCheck[]
> => {
  const originalFetch = globalThis.fetch;
  const engine = new NullEngine();
  let fetchReplaced = false;
  try {
    const originalGlbUrl = `${import.meta.env.BASE_URL}${SCHOOL_STAGE.glbUrl}`;
    const originalResponse = await originalFetch(originalGlbUrl, {
      cache: "no-store"
    });
    if (!originalResponse.ok) {
      throw new Error(
        `B05原本GLBの取得に失敗しました: ${originalResponse.status}`
      );
    }
    const originalBytes = new Uint8Array(await originalResponse.arrayBuffer());
    const mutations = Object.freeze([
      Object.freeze({
        name: "未知mission_anchor roleを厳格分類で拒否",
        fakeGlbUrl: "stage-assets/v2/B05/rejection-unknown-role.glb",
        mutate: mutateMissionAnchorRole
      }),
      Object.freeze({
        name: "location_areaの必須hs_priority欠落を拒否",
        fakeGlbUrl: "stage-assets/v2/B05/rejection-missing-priority.glb",
        mutate: mutateLocationAreaPriority
      }),
      Object.freeze({
        name: "Location意味Nodeの未知hs_* propertyを拒否",
        fakeGlbUrl: "stage-assets/v2/B05/rejection-unknown-property.glb",
        mutate: mutateUnknownHsProperty
      }),
      Object.freeze({
        name: "未知MAP roleを厳格分類で拒否",
        fakeGlbUrl: "stage-assets/v2/B06-4/rejection-unknown-map-role.glb",
        mutate: mutateUnknownMapRole
      }),
      Object.freeze({
        name: "MAP必須floor metadata欠落を拒否",
        fakeGlbUrl: "stage-assets/v2/B06-4/rejection-missing-map-floor.glb",
        mutate: mutateMapMissingFloor
      }),
      Object.freeze({
        name: "MAP未知floorを拒否",
        fakeGlbUrl: "stage-assets/v2/B06-4/rejection-unknown-map-floor.glb",
        mutate: mutateMapUnknownFloor
      }),
      Object.freeze({
        name: "MAP ID重複を拒否",
        fakeGlbUrl: "stage-assets/v2/B06-4/rejection-duplicate-map-id.glb",
        mutate: mutateDuplicateMapId
      })
    ]);

    const cases: LoaderRejectionCase[] = [];
    for (const definition of mutations) {
      const mutated = mutateGlb(originalBytes, definition.mutate);
      cases.push(
        Object.freeze({
          name: definition.name,
          fakeGlbUrl: definition.fakeGlbUrl,
          bytes: mutated.bytes,
          sha256: await calculateSha256(mutated.bytes),
          objectName: mutated.mutation.objectName,
          expectedMessages: mutated.mutation.expectedMessages
        })
      );
    }

    const responseByUrl = new Map(
      cases.map((testCase) => [
        toAbsoluteUrl(`${import.meta.env.BASE_URL}${testCase.fakeGlbUrl}`),
        testCase.bytes
      ])
    );
    const fetchCountByUrl = new Map<string, number>();
    globalThis.fetch = async (input, init) => {
      const url = requestUrl(input);
      const bytes = responseByUrl.get(url);
      if (!bytes) {
        return originalFetch(input, init);
      }
      fetchCountByUrl.set(url, (fetchCountByUrl.get(url) ?? 0) + 1);
      return new Response(Uint8Array.from(bytes).buffer, {
        status: 200,
        headers: Object.freeze({
          "Content-Type": "model/gltf-binary",
          "Content-Length": String(bytes.byteLength)
        })
      });
    };
    fetchReplaced = true;

    const checks: LocationAssetLoaderRejectionAcceptanceCheck[] = [];
    for (const testCase of cases) {
      const message = await loadMutationAndCaptureRejection(engine, testCase);
      const fakeUrl = toAbsoluteUrl(
        `${import.meta.env.BASE_URL}${testCase.fakeGlbUrl}`
      );
      const fetchCount = fetchCountByUrl.get(fakeUrl) ?? 0;
      const expectedMatched =
        message !== null &&
        testCase.expectedMessages.every((expected) =>
          message.includes(expected)
        );
      const hashPassed =
        message !== null &&
        !message.includes("SHA-256がカタログと一致しません");
      checks.push(
        Object.freeze({
          name: testCase.name,
          ok:
            fetchCount === 1 &&
            expectedMatched &&
            hashPassed &&
            message.includes(testCase.objectName),
          detail:
            `fetch=${fetchCount} / object=${testCase.objectName} / ` +
            `${message ?? "拒否されませんでした"}`
        })
      );
    }
    return Object.freeze(checks);
  } finally {
    if (fetchReplaced) {
      globalThis.fetch = originalFetch;
    }
    engine.dispose();
  }
};
