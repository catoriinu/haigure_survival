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
  locationAssetsMode: "required" | "unsupported";
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
    sha256: "c5d9bd4a021370006a4c9d380ea938720719b2908c2d83ae4509720ccac74c4c"
  }),
  assetSchemaVersion: 3,
  navProfileId: "school-humanoid-room-variants-v2",
  bitNavProfileId: "bit-flight-body-0.44-margin-0.10-v1",
  glbSha256: "928d330a0ebd2b38c461b87d9de997d390e064725923bb1a3eaa7bb13b758160",
  navmeshSha256: "52f7dcbcd09b5dee685865001bc2dd1e8b98f4bf418688c8f4f01db0c180a9e4",
  bitNavmeshSha256:
    "4b3bbd249e00c515dad333ef29157e5128fc5cf7286cc26655d096e34be5b499",
  depthPrePassMaterialNames: Object.freeze([
    "MAT_B03_InfirmaryCurtain"
  ]),
  worldBoundaryMode: "required",
  locationAssetsMode: "required"
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
