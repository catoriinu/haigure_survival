export type StageRoomVariantNavmesh =
  | Readonly<{
      mode: "unsupported";
    }>
  | Readonly<{
      mode: "required";
      url: string;
      sha256: string;
    }>;

export type StageCatalogEntry = Readonly<{
  id: string;
  label: string;
  glbUrl: string;
  navmeshUrl: string;
  bitNavmeshUrl: string;
  roomVariantNavmesh: StageRoomVariantNavmesh;
  assetSchemaVersion: number;
  navProfileId: string;
  bitNavProfileId: string;
  glbSha256: string;
  navmeshSha256: string;
  bitNavmeshSha256: string;
  depthPrePassMaterialNames: readonly string[];
  worldBoundaryMode: "required" | "unsupported";
}>;

export const SCHOOL_STAGE_ID = "school";

export const SCHOOL_STAGE: StageCatalogEntry = Object.freeze({
  id: SCHOOL_STAGE_ID,
  label: "学校",
  glbUrl: "stage-assets/v2/B02/b02_school_blockout.glb",
  navmeshUrl: "stage-assets/v2/B02/b02_school_blockout.navmesh.bin",
  bitNavmeshUrl:
    "stage-assets/v2/B02/b02_school_blockout.bit-flight.navmesh.bin",
  roomVariantNavmesh: Object.freeze({
    mode: "required",
    url: "stage-assets/v2/B02/b02_school_blockout.room-variants.navmesh.bin",
    sha256: "bba65b3864e9c4c136b0ee9e8f80abd81672b5b5b56de5a0e2ea5c37037cd9ba"
  }),
  assetSchemaVersion: 2,
  navProfileId: "school-humanoid-room-variants-v2",
  bitNavProfileId: "bit-flight-body-0.44-margin-0.10-v1",
  glbSha256: "8bf40c65170be510167521fec471fe99cd7deafe8ef42af7b02693b37d4591e6",
  navmeshSha256: "a6e41aa0fde1522c5b100bf023bd8c8636a8998a14256183583627119952f8e3",
  bitNavmeshSha256:
    "8b9e923e02b5c83491452cd0e95a851615373bcd789007db4e817a922606f9c9",
  depthPrePassMaterialNames: Object.freeze([
    "MAT_B03_InfirmaryCurtain"
  ]),
  worldBoundaryMode: "required"
});

export const STAGE_CATALOG: readonly StageCatalogEntry[] = Object.freeze([
  SCHOOL_STAGE
]);

export const getStageCatalogEntry = (stageId: string): StageCatalogEntry => {
  const stage = STAGE_CATALOG.find((entry) => entry.id === stageId);
  if (!stage) {
    throw new Error(`V2ステージカタログに未登録のIDです: ${stageId}`);
  }
  return stage;
};
