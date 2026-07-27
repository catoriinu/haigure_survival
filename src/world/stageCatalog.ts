export type StageCatalogEntry = Readonly<{
  id: string;
  label: string;
  glbUrl: string;
  navmeshUrl: string;
  bitNavmeshUrl: string;
  assetSchemaVersion: number;
  navProfileId: string;
  bitNavProfileId: string;
  glbSha256: string;
  navmeshSha256: string;
  bitNavmeshSha256: string;
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
  assetSchemaVersion: 2,
  navProfileId: "school-humanoid-v1",
  bitNavProfileId: "bit-flight-body-0.44-margin-0.10-v1",
  glbSha256: "9f3ddba1025db782d648ddc81be1919eb2b38b9b5226b0babb29952a74ab16a6",
  navmeshSha256: "6f8d8b158ad9da16c4a8362221483adb52ae151d41106b6ef5f4faea82315ee5",
  bitNavmeshSha256:
    "1b32c7c55a3b657ee5f3f029bb510fdc5db28b85b07234e111887a00147ec48b",
  worldBoundaryMode: "unsupported"
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
