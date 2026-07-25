import { Vector3 } from "@babylonjs/core";

import type {
  BitFlightBand,
  BitFlightHeightSelection as NavigationBitFlightHeightSelection,
  BitFlightSurfaceRouteStep
} from "./bitFlightNavigation";
import type {
  SpatialSphereSweepHit,
  StageSpatialQueries
} from "./stageSpatialQueries";
import { BLENDER_METERS_TO_WORLD_UNITS } from "./worldUnits";

export const BIT_FLIGHT_BODY_RADIUS_METERS = 0.44;
export const BIT_FLIGHT_SAFETY_MARGIN_METERS = 0.1;
export const BIT_FLIGHT_ENVELOPE_RADIUS_METERS =
  BIT_FLIGHT_BODY_RADIUS_METERS + BIT_FLIGHT_SAFETY_MARGIN_METERS;
export const BIT_FLIGHT_BODY_RADIUS_WORLD_UNITS =
  BIT_FLIGHT_BODY_RADIUS_METERS * BLENDER_METERS_TO_WORLD_UNITS;
export const BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS =
  BIT_FLIGHT_ENVELOPE_RADIUS_METERS * BLENDER_METERS_TO_WORLD_UNITS;
export const BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS =
  0.001 * BLENDER_METERS_TO_WORLD_UNITS;
export const BIT_FLIGHT_LOW_CEILING_GROUND_PROBE_WORLD_UNITS = 5;

export type BitFlightVerticalClearance = Readonly<{
  center: Vector3;
  lowerObstruction: SpatialSphereSweepHit | null;
  upperObstruction: SpatialSphereSweepHit | null;
  floor: SpatialSphereSweepHit | null;
  ceiling: SpatialSphereSweepHit | null;
  minimumSafeCenterHeight: number | null;
  maximumSafeCenterHeight: number | null;
}>;

export type BitFlightHeightSelection = NavigationBitFlightHeightSelection &
  Readonly<{
    clearance: BitFlightVerticalClearance;
    usedLowCeilingAllowance: boolean;
  }>;

export interface BitFlightSafety {
  readonly envelopeRadius: number;
  findMovementCollision(
    from: Vector3,
    to: Vector3
  ): SpatialSphereSweepHit | null;
  isCenterSafe(center: Vector3): boolean;
  inspectVerticalClearance(
    safeCenter: Vector3,
    probeDistance: number
  ): BitFlightVerticalClearance;
  selectBandCenterHeight(
    band: BitFlightBand,
    safeCenter: Vector3,
    preferredCenterHeight: number,
    probeDistance: number
  ): BitFlightHeightSelection | null;
  selectLowCeilingCenterHeight(
    band: BitFlightBand,
    horizontalPosition: Vector3,
    preferredCenterHeight: number,
    probeDistance: number
  ): BitFlightHeightSelection | null;
  findLowCeilingCruiseHeights(
    step: BitFlightSurfaceRouteStep,
    band: BitFlightBand
  ): readonly number[];
}

const assertFiniteVector = (label: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${label}には有限の3D座標が必要です。`);
  }
};

const assertFiniteNumber = (label: string, value: number) => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}には有限値が必要です。`);
  }
};

const assertPositiveFiniteNumber = (label: string, value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}には正の有限値が必要です。`);
  }
};

const assertBandHeightRange = (band: BitFlightBand) => {
  assertFiniteNumber("飛行帯の中心高度下限", band.minimumCenterHeight);
  assertFiniteNumber("飛行帯の中心高度上限", band.maximumCenterHeight);
  if (band.minimumCenterHeight > band.maximumCenterHeight) {
    throw new Error("飛行帯の中心高度範囲が逆転しています。");
  }
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const createHeightSelection = (
  queries: StageSpatialQueries,
  safeCenter: Vector3,
  preferredCenterHeight: number,
  minimumCenterHeight: number,
  maximumCenterHeight: number,
  clearance: BitFlightVerticalClearance,
  usedLowCeilingAllowance: boolean
): BitFlightHeightSelection | null => {
  if (minimumCenterHeight > maximumCenterHeight) {
    return null;
  }
  const selectedCenter = new Vector3(
    safeCenter.x,
    clamp(
      preferredCenterHeight,
      minimumCenterHeight,
      maximumCenterHeight
    ),
    safeCenter.z
  );
  if (
    queries.castMovementSphere(
      "bit",
      safeCenter,
      selectedCenter,
      BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS
    )
  ) {
    return null;
  }
  return Object.freeze({
    center: selectedCenter,
    heightMode: usedLowCeilingAllowance
      ? ("low-ceiling" as const)
      : ("band" as const),
    clearance,
    usedLowCeilingAllowance
  });
};

export const createBitFlightSafety = (
  queries: StageSpatialQueries
): BitFlightSafety => {
  const findMovementCollision = (from: Vector3, to: Vector3) => {
    assertFiniteVector("飛行移動始点", from);
    assertFiniteVector("飛行移動終点", to);
    return queries.castMovementSphere(
      "bit",
      from,
      to,
      BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS
    );
  };

  const isCenterSafe = (center: Vector3) => {
    assertFiniteVector("飛行中心位置", center);
    return findMovementCollision(center, center) === null;
  };

  const inspectVerticalClearance = (
    safeCenter: Vector3,
    probeDistance: number
  ): BitFlightVerticalClearance => {
    assertFiniteVector("飛行高度問い合わせ位置", safeCenter);
    assertPositiveFiniteNumber("飛行高度問い合わせ距離", probeDistance);
    if (!isCenterSafe(safeCenter)) {
      throw new Error(
        "飛行高度問い合わせの始点に0.54m安全包絡が収まりません。"
      );
    }

    const lowerObstruction = findMovementCollision(
      safeCenter,
      safeCenter.add(Vector3.Down().scale(probeDistance))
    );
    const upperObstruction = findMovementCollision(
      safeCenter,
      safeCenter.add(Vector3.Up().scale(probeDistance))
    );
    const floor =
      lowerObstruction && lowerObstruction.normal.y > 0
        ? lowerObstruction
        : null;
    const ceiling =
      upperObstruction && upperObstruction.normal.y < 0
        ? upperObstruction
        : null;
    return Object.freeze({
      center: safeCenter.clone(),
      lowerObstruction,
      upperObstruction,
      floor,
      ceiling,
      minimumSafeCenterHeight: lowerObstruction
        ? lowerObstruction.center.y +
          BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS
        : null,
      maximumSafeCenterHeight: upperObstruction
        ? upperObstruction.center.y -
          BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS
        : null
    });
  };

  const selectBandCenterHeight = (
    band: BitFlightBand,
    safeCenter: Vector3,
    preferredCenterHeight: number,
    probeDistance: number
  ): BitFlightHeightSelection | null => {
    assertBandHeightRange(band);
    assertFiniteVector("飛行高度選択の始点", safeCenter);
    assertFiniteNumber("希望中心高度", preferredCenterHeight);
    if (
      safeCenter.y < band.minimumCenterHeight ||
      safeCenter.y > band.maximumCenterHeight
    ) {
      throw new Error("通常高度選択の始点が飛行帯の中心高度範囲外です。");
    }
    const clearance = inspectVerticalClearance(
      safeCenter,
      probeDistance
    );
    const minimumCenterHeight = Math.max(
      band.minimumCenterHeight,
      clearance.minimumSafeCenterHeight ?? band.minimumCenterHeight
    );
    const maximumCenterHeight = Math.min(
      band.maximumCenterHeight,
      clearance.maximumSafeCenterHeight ?? band.maximumCenterHeight
    );
    return createHeightSelection(
      queries,
      safeCenter,
      preferredCenterHeight,
      minimumCenterHeight,
      maximumCenterHeight,
      clearance,
      false
    );
  };

  const selectLowCeilingCenterHeight = (
    band: BitFlightBand,
    horizontalPosition: Vector3,
    preferredCenterHeight: number,
    probeDistance: number
  ): BitFlightHeightSelection | null => {
    assertBandHeightRange(band);
    assertFiniteVector("低天井高度選択の水平位置", horizontalPosition);
    assertFiniteNumber("希望中心高度", preferredCenterHeight);
    assertPositiveFiniteNumber("低天井高度問い合わせ距離", probeDistance);
    const floor = queries.sampleGround(
      new Vector3(
        horizontalPosition.x,
        band.minimumCenterHeight,
        horizontalPosition.z
      ),
      probeDistance
    );
    if (!floor || floor.normal.y <= 0) {
      return null;
    }
    const safeCenter = new Vector3(
      horizontalPosition.x,
      floor.point.y +
        BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS +
        BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS,
      horizontalPosition.z
    );
    if (
      safeCenter.y >= band.minimumCenterHeight ||
      !isCenterSafe(safeCenter)
    ) {
      return null;
    }
    const clearance = inspectVerticalClearance(
      safeCenter,
      probeDistance
    );
    if (
      !clearance.floor ||
      !clearance.ceiling ||
      clearance.minimumSafeCenterHeight === null ||
      clearance.maximumSafeCenterHeight === null
    ) {
      return null;
    }
    const minimumCenterHeight = clearance.minimumSafeCenterHeight;
    const maximumCenterHeight = Math.min(
      band.maximumCenterHeight,
      clearance.maximumSafeCenterHeight
    );
    const selectedCenterHeight = clamp(
      preferredCenterHeight,
      minimumCenterHeight,
      maximumCenterHeight
    );
    return createHeightSelection(
      queries,
      safeCenter,
      selectedCenterHeight,
      minimumCenterHeight,
      maximumCenterHeight,
      clearance,
      selectedCenterHeight < band.minimumCenterHeight
    );
  };

  const findLowCeilingCruiseHeights = (
    step: BitFlightSurfaceRouteStep,
    band: BitFlightBand
  ) => {
    assertBandHeightRange(band);
    if (
      step.band.zoneId !== band.zoneId ||
      step.band.bandId !== band.id
    ) {
      throw new Error(
        "低天井巡航高度を調べる帯内経路と飛行帯が一致しません。"
      );
    }
    if (step.points.length === 0) {
      throw new Error("低天井巡航高度の検索には帯内経路点が必要です。");
    }

    let hasLowCeilingPassageEvidence = false;
    for (
      let segmentIndex = 1;
      segmentIndex < step.points.length;
      segmentIndex += 1
    ) {
      const fromSurface =
        step.points[segmentIndex - 1].surface.position;
      const toSurface = step.points[segmentIndex].surface.position;
      const from = new Vector3(
        fromSurface.x,
        band.minimumCenterHeight,
        fromSurface.z
      );
      const to = new Vector3(
        toSurface.x,
        band.minimumCenterHeight,
        toSurface.z
      );
      const hit = findMovementCollision(from, to);
      if (!hit) {
        continue;
      }
      const segmentLength = Vector3.Distance(from, to);
      if (segmentLength === 0) {
        continue;
      }
      const evidenceRatio = Math.min(
        1,
        hit.fraction +
          (BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS +
            BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS) /
            segmentLength
      );
      const evidencePosition = Vector3.Lerp(
        from,
        to,
        evidenceRatio
      );
      const floor = queries.sampleGround(
        evidencePosition,
        BIT_FLIGHT_LOW_CEILING_GROUND_PROBE_WORLD_UNITS
      );
      if (!floor || floor.normal.y <= 0) {
        continue;
      }
      const evidenceHeight =
        floor.point.y +
        BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS +
        BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS;
      if (
        evidenceHeight < band.minimumCenterHeight &&
        isCenterSafe(
          new Vector3(
            evidencePosition.x,
            evidenceHeight,
            evidencePosition.z
          )
        )
      ) {
        hasLowCeilingPassageEvidence = true;
        break;
      }
    }
    if (!hasLowCeilingPassageEvidence) {
      return Object.freeze([]);
    }

    let requiredCruiseHeight = Number.NEGATIVE_INFINITY;
    for (
      let segmentIndex = 1;
      segmentIndex < step.points.length;
      segmentIndex += 1
    ) {
      const from = step.points[segmentIndex - 1].surface.position;
      const to = step.points[segmentIndex].surface.position;
      const surfaceDistance = Vector3.Distance(from, to);
      const sampleCount = Math.max(
        1,
        Math.ceil(
          surfaceDistance / BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS
        )
      );
      const firstSampleIndex = segmentIndex === 1 ? 0 : 1;
      for (
        let sampleIndex = firstSampleIndex;
        sampleIndex <= sampleCount;
        sampleIndex += 1
      ) {
        const ratio = sampleIndex / sampleCount;
        const sample = new Vector3(
          from.x + (to.x - from.x) * ratio,
          band.minimumCenterHeight,
          from.z + (to.z - from.z) * ratio
        );
        const floor = queries.sampleGround(
          sample,
          BIT_FLIGHT_LOW_CEILING_GROUND_PROBE_WORLD_UNITS
        );
        if (!floor || floor.normal.y <= 0) {
          return Object.freeze([]);
        }
        requiredCruiseHeight = Math.max(
          requiredCruiseHeight,
          floor.point.y +
            BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS +
            BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS
        );
      }
    }

    return requiredCruiseHeight < band.minimumCenterHeight
      ? Object.freeze([requiredCruiseHeight])
      : Object.freeze([]);
  };

  return Object.freeze({
    envelopeRadius: BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
    findMovementCollision,
    isCenterSafe,
    inspectVerticalClearance,
    selectBandCenterHeight,
    selectLowCeilingCenterHeight,
    findLowCeilingCruiseHeights
  });
};
