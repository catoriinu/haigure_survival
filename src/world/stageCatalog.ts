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
  glbSha256: "3fbdbd7097af0ce83d9b1231837fb96bc5829842b091553e0e87adacc1e5cabc",
  navmeshSha256: "0fcf0b136d41e23202925eb8821270c39d18efee37a5146f20c9bfa97c03c869",
  bitNavmeshSha256:
    "40144b5cb3db56d2db895bde90758665665d7c0495f4a551025fef52941773a0"
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
