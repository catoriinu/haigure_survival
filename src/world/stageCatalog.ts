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
  glbSha256: "e414d302387053db953e9422b25b85f185f2173c2885ccfee54e7990dcdb5806",
  navmeshSha256: "9ccfe1419b150053a1e7ad85f686431a18343cbc9f7780041ee1acdaa77063af"
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
