const MAGIC = Uint8Array.of(
  0x48, // H
  0x53, // S
  0x42, // B
  0x46, // F
  0x4e, // N
  0x41, // A
  0x56, // V
  0x00
);

const FORMAT_VERSION = 1;
const HEADER_BYTE_LENGTH = 24;
const MAX_UINT32 = 0xffff_ffff;

const HEADER_VERSION_OFFSET = 8;
const HEADER_LENGTH_OFFSET = 10;
const MANIFEST_LENGTH_OFFSET = 12;
const PAYLOAD_LENGTH_OFFSET = 16;
const ENTRY_COUNT_OFFSET = 20;

export type BitFlightNavBundleEntry = Readonly<{
  zoneId: string;
  bandId: string;
  data: Uint8Array;
}>;

type ManifestEntry = Readonly<{
  zoneId: string;
  bandId: string;
  offset: number;
  length: number;
}>;

type BundleManifest = Readonly<{
  entries: readonly ManifestEntry[];
}>;

const assertOpaqueId = (
  value: unknown,
  property: "zoneId" | "bandId",
  entryIndex: number
): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `ビット飛行NavMesh bundle entry[${entryIndex}].${property}には非空文字列が必要です。`
    );
  }
  return value;
};

const assertUint32 = (
  value: unknown,
  property: "offset" | "length",
  entryIndex: number
): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_UINT32
  ) {
    throw new Error(
      `ビット飛行NavMesh bundle entry[${entryIndex}].${property}にはuint32が必要です。`
    );
  }
  return value;
};

const assertManifestEntryShape = (
  value: unknown,
  entryIndex: number
): ManifestEntry => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `ビット飛行NavMesh bundle manifest entry[${entryIndex}]がObjectではありません。`
    );
  }

  const keys = Object.keys(value).sort();
  const expectedKeys = ["bandId", "length", "offset", "zoneId"];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      `ビット飛行NavMesh bundle manifest entry[${entryIndex}]のpropertyが不正です。`
    );
  }

  const record = value as Record<string, unknown>;
  return {
    zoneId: assertOpaqueId(record.zoneId, "zoneId", entryIndex),
    bandId: assertOpaqueId(record.bandId, "bandId", entryIndex),
    offset: assertUint32(record.offset, "offset", entryIndex),
    length: assertUint32(record.length, "length", entryIndex),
  };
};

const parseManifest = (
  manifestBytes: Uint8Array,
  expectedEntryCount: number
): BundleManifest => {
  if (
    manifestBytes.length >= 3 &&
    manifestBytes[0] === 0xef &&
    manifestBytes[1] === 0xbb &&
    manifestBytes[2] === 0xbf
  ) {
    throw new Error(
      "ビット飛行NavMesh bundle manifestはUTF-8 BOMなしである必要があります。"
    );
  }

  let manifestText: string;
  try {
    manifestText = new TextDecoder("utf-8", { fatal: true }).decode(
      manifestBytes
    );
  } catch {
    throw new Error(
      "ビット飛行NavMesh bundle manifestをUTF-8として復号できません。"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText) as unknown;
  } catch {
    throw new Error(
      "ビット飛行NavMesh bundle manifestをJSONとして解析できません。"
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "ビット飛行NavMesh bundle manifestのルートがObjectではありません。"
    );
  }
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "entries") {
    throw new Error(
      "ビット飛行NavMesh bundle manifestのpropertyが不正です。"
    );
  }

  const entriesValue = (parsed as Record<string, unknown>).entries;
  if (!Array.isArray(entriesValue)) {
    throw new Error(
      "ビット飛行NavMesh bundle manifest.entriesが配列ではありません。"
    );
  }
  if (entriesValue.length !== expectedEntryCount) {
    throw new Error(
      `ビット飛行NavMesh bundleのentry数が一致しません: header=${expectedEntryCount}, manifest=${entriesValue.length}`
    );
  }

  return {
    entries: entriesValue.map((entry, index) =>
      assertManifestEntryShape(entry, index)
    ),
  };
};

const assertUniqueEntryKey = (
  seenBandIdsByZone: Map<string, Set<string>>,
  zoneId: string,
  bandId: string
): void => {
  const bandIds = seenBandIdsByZone.get(zoneId);
  if (bandIds?.has(bandId)) {
    throw new Error(
      `ビット飛行NavMesh bundleのzoneId/bandIdが重複しています: zoneId=${JSON.stringify(
        zoneId
      )}, bandId=${JSON.stringify(bandId)}`
    );
  }
  if (bandIds) {
    bandIds.add(bandId);
  } else {
    seenBandIdsByZone.set(zoneId, new Set([bandId]));
  }
};

const validateManifestCoverage = (
  entries: readonly ManifestEntry[],
  payloadLength: number
): void => {
  const seenBandIdsByZone = new Map<string, Set<string>>();
  const spans = entries.map((entry) => {
    assertUniqueEntryKey(
      seenBandIdsByZone,
      entry.zoneId,
      entry.bandId
    );
    if (entry.length === 0) {
      throw new Error(
        `ビット飛行NavMesh bundleに空payloadがあります: zoneId=${JSON.stringify(
          entry.zoneId
        )}, bandId=${JSON.stringify(entry.bandId)}`
      );
    }

    const end = entry.offset + entry.length;
    if (end > payloadLength) {
      throw new Error(
        `ビット飛行NavMesh bundleのpayload範囲が不正です: zoneId=${JSON.stringify(
          entry.zoneId
        )}, bandId=${JSON.stringify(entry.bandId)}, offset=${
          entry.offset
        }, length=${entry.length}, payloadLength=${payloadLength}`
      );
    }
    return { start: entry.offset, end };
  });

  spans.sort((left, right) => left.start - right.start);
  let coveredUntil = 0;
  for (const span of spans) {
    if (span.start !== coveredUntil) {
      throw new Error(
        `ビット飛行NavMesh bundleのpayload区間が重複しているか隙間があります: expectedOffset=${coveredUntil}, actualOffset=${span.start}`
      );
    }
    coveredUntil = span.end;
  }
  if (coveredUntil !== payloadLength) {
    throw new Error(
      `ビット飛行NavMesh bundleにmanifestから参照されないpayloadがあります: covered=${coveredUntil}, payloadLength=${payloadLength}`
    );
  }
};

const assertEncodableEntries = (
  entries: readonly BitFlightNavBundleEntry[]
): void => {
  if (entries.length === 0) {
    throw new Error(
      "ビット飛行NavMesh bundleには1個以上のentryが必要です。"
    );
  }
  if (entries.length > MAX_UINT32) {
    throw new Error(
      "ビット飛行NavMesh bundleのentry数がuint32上限を超えています。"
    );
  }

  const seenBandIdsByZone = new Map<string, Set<string>>();
  for (const [index, entry] of entries.entries()) {
    const zoneId = assertOpaqueId(entry.zoneId, "zoneId", index);
    const bandId = assertOpaqueId(entry.bandId, "bandId", index);
    assertUniqueEntryKey(seenBandIdsByZone, zoneId, bandId);
    if (!(entry.data instanceof Uint8Array)) {
      throw new Error(
        `ビット飛行NavMesh bundle entry[${index}].dataにはUint8Arrayが必要です。`
      );
    }
    if (entry.data.length === 0) {
      throw new Error(
        `ビット飛行NavMesh bundleに空payloadがあります: zoneId=${JSON.stringify(
          zoneId
        )}, bandId=${JSON.stringify(bandId)}`
      );
    }
  }
};

/**
 * 複数の飛行帯用Recast NavMesh binaryを単一bundleへ格納する。
 *
 * binary format (little endian):
 * - byte 0..7: magic `HSBFNAV\0`
 * - uint16 byte 8: format version
 * - uint16 byte 10: header byte length
 * - uint32 byte 12: UTF-8 JSON manifest byte length
 * - uint32 byte 16: concatenated payload byte length
 * - uint32 byte 20: entry count
 * - byte 24..: BOMなしUTF-8 JSON manifest
 * - manifest直後: 各entryのRecast NavMesh payload
 *
 * manifestは
 * `{"entries":[{"zoneId":string,"bandId":string,"offset":uint32,"length":uint32}]}`
 * とし、offsetは連結payload先頭からの相対位置とする。bundle全体のSHA-256は
 * この同期形式の外側にあるStageCatalog/読込層で検証する。
 */
export const encodeBitFlightNavBundle = (
  entries: readonly BitFlightNavBundleEntry[]
): Uint8Array => {
  assertEncodableEntries(entries);

  let payloadLength = 0;
  const manifestEntries: ManifestEntry[] = entries.map((entry) => {
    const offset = payloadLength;
    payloadLength += entry.data.length;
    if (payloadLength > MAX_UINT32) {
      throw new Error(
        "ビット飛行NavMesh bundleのpayload長がuint32上限を超えています。"
      );
    }
    return {
      zoneId: entry.zoneId,
      bandId: entry.bandId,
      offset,
      length: entry.data.length,
    };
  });

  const manifestBytes = new TextEncoder().encode(
    JSON.stringify({ entries: manifestEntries } satisfies BundleManifest)
  );
  if (manifestBytes.length > MAX_UINT32) {
    throw new Error(
      "ビット飛行NavMesh bundleのmanifest長がuint32上限を超えています。"
    );
  }

  const totalLength =
    HEADER_BYTE_LENGTH + manifestBytes.length + payloadLength;
  if (!Number.isSafeInteger(totalLength)) {
    throw new Error(
      "ビット飛行NavMesh bundleの全体長が安全な整数範囲を超えています。"
    );
  }

  const bundle = new Uint8Array(totalLength);
  bundle.set(MAGIC, 0);
  const header = new DataView(bundle.buffer);
  header.setUint16(HEADER_VERSION_OFFSET, FORMAT_VERSION, true);
  header.setUint16(HEADER_LENGTH_OFFSET, HEADER_BYTE_LENGTH, true);
  header.setUint32(MANIFEST_LENGTH_OFFSET, manifestBytes.length, true);
  header.setUint32(PAYLOAD_LENGTH_OFFSET, payloadLength, true);
  header.setUint32(ENTRY_COUNT_OFFSET, entries.length, true);
  bundle.set(manifestBytes, HEADER_BYTE_LENGTH);

  const payloadStart = HEADER_BYTE_LENGTH + manifestBytes.length;
  for (const [index, entry] of entries.entries()) {
    bundle.set(entry.data, payloadStart + manifestEntries[index].offset);
  }
  return bundle;
};

/**
 * bundleを同期的に解析し、各飛行帯のRecast NavMesh binaryを返す。
 *
 * 返却するdataは入力bundleから複製する。bundle全体のSHA-256は、この関数を
 * 呼び出す前にStageCatalog/読込層で検証済みでなければならない。
 */
export const decodeBitFlightNavBundle = (
  bundle: Uint8Array
): readonly BitFlightNavBundleEntry[] => {
  if (!(bundle instanceof Uint8Array)) {
    throw new Error(
      "ビット飛行NavMesh bundleにはUint8Arrayが必要です。"
    );
  }
  if (bundle.length < HEADER_BYTE_LENGTH) {
    throw new Error(
      `ビット飛行NavMesh bundleが固定headerより短いです: ${bundle.length} bytes`
    );
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (bundle[index] !== MAGIC[index]) {
      throw new Error("ビット飛行NavMesh bundleのmagicが一致しません。");
    }
  }

  const header = new DataView(
    bundle.buffer,
    bundle.byteOffset,
    bundle.byteLength
  );
  const version = header.getUint16(HEADER_VERSION_OFFSET, true);
  if (version !== FORMAT_VERSION) {
    throw new Error(
      `未対応のビット飛行NavMesh bundle versionです: ${version}`
    );
  }
  const headerLength = header.getUint16(HEADER_LENGTH_OFFSET, true);
  if (headerLength !== HEADER_BYTE_LENGTH) {
    throw new Error(
      `ビット飛行NavMesh bundleのheader長が不正です: ${headerLength}`
    );
  }

  const manifestLength = header.getUint32(MANIFEST_LENGTH_OFFSET, true);
  const payloadLength = header.getUint32(PAYLOAD_LENGTH_OFFSET, true);
  const entryCount = header.getUint32(ENTRY_COUNT_OFFSET, true);
  if (entryCount === 0) {
    throw new Error(
      "ビット飛行NavMesh bundleには1個以上のentryが必要です。"
    );
  }
  if (manifestLength === 0) {
    throw new Error(
      "ビット飛行NavMesh bundleのmanifestが空です。"
    );
  }

  const expectedBundleLength =
    HEADER_BYTE_LENGTH + manifestLength + payloadLength;
  if (bundle.length !== expectedBundleLength) {
    throw new Error(
      `ビット飛行NavMesh bundleの全体長が一致しません: expected=${expectedBundleLength}, actual=${bundle.length}`
    );
  }

  const manifestStart = HEADER_BYTE_LENGTH;
  const payloadStart = manifestStart + manifestLength;
  const manifest = parseManifest(
    bundle.subarray(manifestStart, payloadStart),
    entryCount
  );
  validateManifestCoverage(manifest.entries, payloadLength);

  return manifest.entries.map((entry) => ({
    zoneId: entry.zoneId,
    bandId: entry.bandId,
    data: bundle.slice(
      payloadStart + entry.offset,
      payloadStart + entry.offset + entry.length
    ),
  }));
};
