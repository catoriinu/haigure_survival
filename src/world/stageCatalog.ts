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
    sha256: "4b5a584b9ba15dba73d55924b91320475d51ee8dcfc951a06822e08bedd52e43"
  }),
  assetSchemaVersion: 2,
  navProfileId: "school-humanoid-room-variants-v2",
  bitNavProfileId: "bit-flight-body-0.44-margin-0.10-v1",
  glbSha256: "55ca8f0e0eb6bd1115749eafc5fabda30ba16e0a6f6f4dbb9b1cf6cf67239748",
  navmeshSha256: "530fa01f472a7f3ab4f983c6360aa41c296f3170ae44334e67e26377ed5d977b",
  bitNavmeshSha256:
    "e7e0a76429ba1c9bcfcb26a18071db2307ca394632fb727a0559140244cac62a",
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
