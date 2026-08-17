import type { StageLinkPair } from "./stageLinks";

/**
 * BIT飛行面のNavigationWorld生成だけに使用する内部識別子。
 * 人間用の公開createNavigationWorldシグネチャへ生成オプションを追加しない。
 */
export const BIT_FLIGHT_NAVIGATION_LINKS: readonly StageLinkPair[] =
  Object.freeze([]);

/**
 * Detourは終点を書き込んで配列が満杯になった場合も
 * DT_BUFFER_TOO_SMALLを返すため、始点・各portal・終点に加えて1枠確保する。
 */
export const calculateStraightPathPointOutputCapacity = (
  maximumPathPolygonCount: number,
  straightPathPointCapacity: number
) =>
  Math.min(
    straightPathPointCapacity,
    maximumPathPolygonCount + 2
  );
