// 無遭遇時間・距離・方向維持の初期調整値。距離はゲーム設定上のm。
export const V2_NPC_PATROL_TUNING = Object.freeze({
  expansionStartSeconds: 20,
  expansionMaximumSeconds: 80,
  minimumDirectionDistanceMeters: 16,
  maximumDirectionDistanceMeters: 48,
  directionHalfAngleRadians: Math.PI / 3,
  directionalAttempts: 4
});

export const getV2NpcPatrolDistanceMeters = (unseenSeconds: number) => {
  const tuning = V2_NPC_PATROL_TUNING;
  if (unseenSeconds < tuning.expansionStartSeconds) return 0;
  const progress = Math.min(1, (unseenSeconds - tuning.expansionStartSeconds) /
    (tuning.expansionMaximumSeconds - tuning.expansionStartSeconds));
  return tuning.minimumDirectionDistanceMeters + progress *
    (tuning.maximumDirectionDistanceMeters - tuning.minimumDirectionDistanceMeters);
};
