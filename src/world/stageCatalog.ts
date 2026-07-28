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
    sha256: "78a0f481aae3abd6a6e403c60fc0debc1c70941c8b7956f17e35006df10c3afd"
  }),
  assetSchemaVersion: 2,
  navProfileId: "school-humanoid-room-variants-v2",
  bitNavProfileId: "bit-flight-body-0.44-margin-0.10-v1",
  glbSha256: "e485055c36203017cc2fe0d2df5de84d1397be4b309331a6308ca479bbac36d6",
  navmeshSha256: "bf4d57aec72458236964c53dc6632407b90baeacf86cd6695bd01f1c1c38be37",
  bitNavmeshSha256:
    "110568baee435f42a0262b3a3c8e204bdb5a6334c3aa6d77a136ad33c74381e2",
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
