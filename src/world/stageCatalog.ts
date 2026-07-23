export type StageCatalogEntry = Readonly<{
  id: string;
  label: string;
  glbUrl: string;
  navmeshUrl: string;
  assetSchemaVersion: number;
  navProfileId: string;
  glbSha256: string;
  navmeshSha256: string;
}>;

export const SCHOOL_STAGE_ID = "school";

export const SCHOOL_STAGE: StageCatalogEntry = Object.freeze({
  id: SCHOOL_STAGE_ID,
  label: "学校",
  glbUrl: "stage-assets/v2/B02/b02_school_blockout.glb",
  navmeshUrl: "stage-assets/v2/B02/b02_school_blockout.navmesh.bin",
  assetSchemaVersion: 1,
  navProfileId: "school-humanoid-v1",
  glbSha256: "46cf43eb4c6d612605cc1a669b9c1794885ac0bd7324bc99a07e32a5345e5c01",
  navmeshSha256: "72f3c4b8fdcd2e92ee71ecf5a848683c57ddb9e342ff52059ddfb4179bf29f82"
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
