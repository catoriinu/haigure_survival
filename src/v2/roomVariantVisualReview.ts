export const V2_DEFAULT_ROOM_VARIANT_LEVEL = 2;
export const V2_ALL_DISORDERED_ROOM_VARIANT_REVIEW_LEVEL = 10;
export type V2RoomVariantLevel =
  | typeof V2_DEFAULT_ROOM_VARIANT_LEVEL
  | typeof V2_ALL_DISORDERED_ROOM_VARIANT_REVIEW_LEVEL;

export const resolveV2RoomVariantLevel = (
  search: string
): V2RoomVariantLevel => {
  const requested = new URLSearchParams(search).get("roomVariantReview");
  if (requested === null) {
    return V2_DEFAULT_ROOM_VARIANT_LEVEL;
  }
  if (requested === "all-disordered") {
    return V2_ALL_DISORDERED_ROOM_VARIANT_REVIEW_LEVEL;
  }
  throw new Error(
    "roomVariantReviewにはall-disorderedが必要です。"
  );
};
