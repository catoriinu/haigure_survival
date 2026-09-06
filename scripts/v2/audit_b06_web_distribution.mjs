import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const DIST_ROOT = join(REPOSITORY_ROOT, "dist");
const STAGE_CATALOG_PATH = join(REPOSITORY_ROOT, "src/world/stageCatalog.ts");
const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav"]);
const FORBIDDEN_LOCAL_ASSET_ROOTS = Object.freeze([
  Object.freeze({
    id: "local-audio-paths-absent",
    path: "audio",
  }),
  Object.freeze({
    id: "local-character-paths-absent",
    path: "picture/chara",
  }),
]);
const ALLOWED_PUBLIC_ASSET_PATHS = Object.freeze([
  "LICENSES/NotoSansJP-OFL-1.1.txt",
  "LICENSES/THIRD_PARTY_NOTICES.txt",
  "stage-assets/v2/B02/b02_school_blockout.bit-flight.navmesh.bin",
  "stage-assets/v2/B02/b02_school_blockout.glb",
  "stage-assets/v2/B02/b02_school_blockout.navmesh.bin",
  "stage-assets/v2/B02/b02_school_blockout.room-variants.navmesh.bin",
  "stage-assets/v2/B02/b03_signs_paper_atlas.png",
  "stage-assets/v2/B03/b03_school_prop_library_preview.glb",
  "stage-assets/v2/T01/t01_glb_collision_course.glb",
]);
const ATLAS = Object.freeze({
  path: "stage-assets/v2/B02/b03_signs_paper_atlas.png",
  bytes: 63_890,
  sha256: "04d2e138c7b2c65a9f2987bc4f3115ef61dfc39f3f9228496e5df7bef3af9351",
  width: 2_048,
  height: 1_024,
});
const SCHOOL_GLB = Object.freeze({
  path: "stage-assets/v2/B02/b02_school_blockout.glb",
  requiredMeshNodes: Object.freeze([
    "VIS_B03_ElevatorAdjustmentText_F02",
    "VIS_B03_ElevatorAdjustmentText_F03",
  ]),
});
const LICENSE_FILES = Object.freeze([
  Object.freeze({
    id: "ofl-integrity",
    path: "LICENSES/NotoSansJP-OFL-1.1.txt",
    bytes: 4_294,
    sha256: "08a85e306e23729511f968cfaeb27198b04253e546c8d89953f394ef68afb9d8",
  }),
  Object.freeze({
    id: "third-party-notices-integrity",
    path: "LICENSES/THIRD_PARTY_NOTICES.txt",
    bytes: 750,
    sha256: "45aa4daf9a1017da5c5e093677bbdb5f309dc87082d94e7fca405a5631280bb5",
  }),
]);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const GLB_MAGIC = Buffer.from("glTF", "ascii");
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const FORBIDDEN_FONT_PATH_MARKERS = Object.freeze([
  "meiryob.ttc",
  "windir",
  "c:/windows/fonts",
  "c:\\windows\\fonts",
]);

function normalizeRelativePath(path) {
  return path.replaceAll("\\", "/");
}

function normalizedPathKey(path) {
  return normalizeRelativePath(path).toLowerCase();
}

const ALLOWED_PUBLIC_ASSET_PATH_KEYS = new Set(
  ALLOWED_PUBLIC_ASSET_PATHS.map(normalizedPathKey)
);
const ALLOWED_PRODUCTION_DIRECTORY_KEYS = new Set([
  "assets",
  ...ALLOWED_PUBLIC_ASSET_PATHS.flatMap((path) => {
    const segments = normalizeRelativePath(path).split("/");
    return segments.slice(0, -1).map((_, index) =>
      segments.slice(0, index + 1).join("/").toLowerCase()
    );
  }),
]);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function listDistributionTree(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { allPaths: [], filePaths: [], specialPaths: [] };
    }
    throw error;
  }

  const allPaths = [];
  const filePaths = [];
  const specialPaths = [];
  entries.sort((left, right) => {
    if (left.name < right.name) {
      return -1;
    }
    if (left.name > right.name) {
      return 1;
    }
    return 0;
  });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    allPaths.push(path);
    if (entry.isDirectory()) {
      const nested = await listDistributionTree(path);
      allPaths.push(...nested.allPaths);
      filePaths.push(...nested.filePaths);
      specialPaths.push(...nested.specialPaths);
    } else if (entry.isFile()) {
      filePaths.push(path);
    } else {
      specialPaths.push(path);
    }
  }
  return { allPaths, filePaths, specialPaths };
}

function readPngDimensions(buffer) {
  const hasSignature =
    buffer.length >= 24 && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const hasIhdr = hasSignature && buffer.toString("ascii", 12, 16) === "IHDR";
  if (!hasIhdr) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readCatalogGlbSha256() {
  const source = await readFile(STAGE_CATALOG_PATH, "utf8");
  const matches = [...source.matchAll(/glbSha256:\s*"([0-9a-f]{64})"/g)];
  if (matches.length !== 1) {
    throw new Error(
      `stageCatalogのglbSha256が一意ではありません: ${matches.length}`
    );
  }
  return matches[0][1];
}

function readGlbDocument(buffer) {
  if (
    buffer.length < 20 ||
    !buffer.subarray(0, GLB_MAGIC.length).equals(GLB_MAGIC) ||
    buffer.readUInt32LE(4) !== 2 ||
    buffer.readUInt32LE(8) !== buffer.length ||
    buffer.readUInt32LE(16) !== GLB_JSON_CHUNK_TYPE
  ) {
    throw new Error("学校GLBのheaderまたはJSON chunk契約が不正です");
  }
  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkEnd = 20 + jsonChunkLength;
  if (jsonChunkEnd > buffer.length) {
    throw new Error("学校GLBのJSON chunk長がファイル範囲外です");
  }
  return JSON.parse(
    buffer.subarray(20, jsonChunkEnd).toString("utf8").replace(/[\u0000 ]+$/u, "")
  );
}

function createCheck(id, passed, expected, actual) {
  return {
    id,
    status: passed ? "passed" : "failed",
    expected,
    actual,
  };
}

async function auditDistribution() {
  const tree = await listDistributionTree(DIST_ROOT);
  const allArtifacts = tree.allPaths
    .map((path) => normalizeRelativePath(relative(DIST_ROOT, path)))
    .sort();
  const fileArtifacts = tree.filePaths
    .map((path) => normalizeRelativePath(relative(DIST_ROOT, path)))
    .sort();
  const specialArtifacts = tree.specialPaths
    .map((path) => normalizeRelativePath(relative(DIST_ROOT, path)))
    .sort();
  const fontArtifacts = fileArtifacts
    .filter((path) => FONT_EXTENSIONS.has(extname(path).toLowerCase()))
    .sort();
  const audioFileArtifacts = allArtifacts
    .filter((path) => AUDIO_EXTENSIONS.has(extname(path).toLowerCase()))
    .sort();

  const checks = [
    createCheck("font-artifacts-absent", fontArtifacts.length === 0, 0, fontArtifacts.length),
    createCheck(
      "audio-file-artifacts-absent",
      audioFileArtifacts.length === 0,
      [],
      audioFileArtifacts
    ),
  ];

  for (const forbiddenRoot of FORBIDDEN_LOCAL_ASSET_ROOTS) {
    const rootKey = normalizedPathKey(forbiddenRoot.path);
    const artifacts = allArtifacts.filter((path) => {
      const key = normalizedPathKey(path);
      return key === rootKey || key.startsWith(`${rootKey}/`);
    });
    checks.push(
      createCheck(forbiddenRoot.id, artifacts.length === 0, [], artifacts)
    );
  }

  const actualAllowedPublicAssets = fileArtifacts.filter((path) =>
    ALLOWED_PUBLIC_ASSET_PATH_KEYS.has(normalizedPathKey(path))
  );
  const actualAllowedPublicAssetKeys = new Set(
    actualAllowedPublicAssets.map(normalizedPathKey)
  );
  checks.push(
    createCheck(
      "allowed-public-assets-present",
      actualAllowedPublicAssets.length === ALLOWED_PUBLIC_ASSET_PATHS.length &&
        actualAllowedPublicAssetKeys.size === ALLOWED_PUBLIC_ASSET_PATHS.length,
      ALLOWED_PUBLIC_ASSET_PATHS,
      actualAllowedPublicAssets
    )
  );

  const unexpectedArtifacts = [
    ...new Set([
      ...allArtifacts.filter((path) => {
        const key = normalizedPathKey(path);
        if (ALLOWED_PRODUCTION_DIRECTORY_KEYS.has(key)) {
          return false;
        }
        if (key === "index.html" || ALLOWED_PUBLIC_ASSET_PATH_KEYS.has(key)) {
          return false;
        }
        return !/^assets\/[^/]+\.(?:js|css|wasm)$/u.test(key);
      }),
      ...specialArtifacts,
    ]),
  ].sort();
  checks.push(
    createCheck(
      "unexpected-production-artifacts-absent",
      unexpectedArtifacts.length === 0,
      [],
      unexpectedArtifacts
    )
  );

  const atlasPath = join(DIST_ROOT, ATLAS.path);
  const atlasExists = await isFile(atlasPath);
  checks.push(createCheck("signage-atlas-present", atlasExists, true, atlasExists));

  for (const licenseFile of LICENSE_FILES) {
    const path = join(DIST_ROOT, licenseFile.path);
    const actual = (await isFile(path)) ? await readFile(path) : null;
    checks.push(
      createCheck(
        licenseFile.id,
        actual !== null &&
          actual.length === licenseFile.bytes &&
          sha256(actual) === licenseFile.sha256,
        { bytes: licenseFile.bytes, sha256: licenseFile.sha256 },
        actual === null
          ? null
          : { bytes: actual.length, sha256: sha256(actual) }
      )
    );
  }

  let atlasActual = null;
  if (atlasExists) {
    const buffer = await readFile(atlasPath);
    const dimensions = readPngDimensions(buffer);
    atlasActual = {
      bytes: buffer.length,
      sha256: sha256(buffer),
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    };
  }
  const atlasMatches =
    atlasActual !== null &&
    atlasActual.bytes === ATLAS.bytes &&
    atlasActual.sha256 === ATLAS.sha256 &&
    atlasActual.width === ATLAS.width &&
    atlasActual.height === ATLAS.height;
  checks.push(
    createCheck(
      "signage-atlas-integrity",
      atlasMatches,
      {
        bytes: ATLAS.bytes,
        sha256: ATLAS.sha256,
        width: ATLAS.width,
        height: ATLAS.height,
      },
      atlasActual
    )
  );

  const schoolGlbPath = join(DIST_ROOT, SCHOOL_GLB.path);
  const schoolGlbExists = await isFile(schoolGlbPath);
  checks.push(
    createCheck("school-glb-present", schoolGlbExists, true, schoolGlbExists)
  );
  if (schoolGlbExists) {
    const buffer = await readFile(schoolGlbPath);
    const document = readGlbDocument(buffer);
    const catalogSha256 = await readCatalogGlbSha256();
    const actualSha256 = sha256(buffer);
    checks.push(
      createCheck(
        "school-glb-catalog-integrity",
        actualSha256 === catalogSha256,
        catalogSha256,
        actualSha256
      )
    );
    const nodes = Array.isArray(document.nodes) ? document.nodes : [];
    const meshes = Array.isArray(document.meshes) ? document.meshes : [];
    const requiredMeshNodes = Object.fromEntries(
      SCHOOL_GLB.requiredMeshNodes.map((name) => {
        const node = nodes.find((item) => item?.name === name);
        const mesh = Number.isInteger(node?.mesh) ? meshes[node.mesh] : null;
        return [
          name,
          node !== undefined &&
            mesh !== null &&
            Array.isArray(mesh.primitives) &&
            mesh.primitives.length > 0,
        ];
      })
    );
    checks.push(
      createCheck(
        "adjustment-text-meshes-present",
        Object.values(requiredMeshNodes).every(Boolean),
        Object.fromEntries(SCHOOL_GLB.requiredMeshNodes.map((name) => [name, true])),
        requiredMeshNodes
      )
    );
    const glbJson = JSON.stringify(document).toLowerCase();
    const forbiddenMarkers = FORBIDDEN_FONT_PATH_MARKERS.filter((marker) =>
      glbJson.includes(marker)
    );
    checks.push(
      createCheck(
        "windows-font-paths-absent",
        forbiddenMarkers.length === 0,
        [],
        forbiddenMarkers
      )
    );
  }

  return {
    schemaVersion: 1,
    auditId: "B06-3-web-distribution",
    distributionRoot: "dist",
    status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
    checks,
    fontArtifacts,
    audioFileArtifacts,
    localAudioArtifacts:
      checks.find((check) => check.id === "local-audio-paths-absent")?.actual ?? [],
    localCharacterArtifacts:
      checks.find((check) => check.id === "local-character-paths-absent")?.actual ?? [],
    unexpectedArtifacts,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    throw new Error(`未知の引数です: ${args.join(" ")}`);
  }

  const report = await auditDistribution();
  process.stdout.write(stableJson(report));
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stdout.write(
    stableJson({
      schemaVersion: 1,
      auditId: "B06-3-web-distribution",
      distributionRoot: "dist",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exitCode = 1;
});
