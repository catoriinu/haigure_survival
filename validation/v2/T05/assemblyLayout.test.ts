import { Vector3 } from "@babylonjs/core";

import {
  createAssemblyPositions,
  createExecutionAudiencePositions,
  createExecutionTargetPositions,
  selectAssemblyVenueByWeight
} from "../../../src/v2/assemblyLayout";
import type { StageAssemblyVenue } from "../../../src/world/stageSpatialContext";

export type AssemblyLayoutTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const approximately = (
  actual: number,
  expected: number,
  tolerance = 1e-9
) => Math.abs(actual - expected) <= tolerance;

const samePosition = (actual: Vector3, expected: Vector3) =>
  approximately(actual.x, expected.x) &&
  approximately(actual.y, expected.y) &&
  approximately(actual.z, expected.z);

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): AssemblyLayoutTestResult => {
  try {
    return Object.freeze({ name, ...operation() });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
};

const center = new Vector3(10, 2, -3);
const assemblyPositions = Object.freeze([
  new Vector3(16, 2, -3),
  new Vector3(4, 2, -3),
  new Vector3(10, 2, 1),
  new Vector3(10, 2, -7),
  new Vector3(13, 2, 0),
  new Vector3(7, 2, -6)
]);
const audiencePositions = Object.freeze([
  new Vector3(14, 2, -3),
  new Vector3(6, 2, -3),
  new Vector3(10, 2, 1),
  new Vector3(10, 2, -7)
]);
const targetPositions = Object.freeze([
  new Vector3(11, 2, -3),
  new Vector3(9, 2, -3)
]);

const createVenue = (
  id: string,
  selectionWeight: number
): StageAssemblyVenue =>
  Object.freeze({
    id,
    anchor: {} as StageAssemblyVenue["anchor"],
    volume: {} as StageAssemblyVenue["volume"],
    center: center.clone(),
    selectionWeight,
    assemblyPositions,
    executionAudiencePositions: audiencePositions,
    executionTargetPositions: targetPositions
  });

const venueA = createVenue("venue-a", 1);
const venueB = createVenue("venue-b", 1);

const throws = (operation: () => unknown) => {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
};

export const runAssemblyLayoutTests =
  (): readonly AssemblyLayoutTestResult[] => [
    executeTest("等weightの境界値で前半・後半の会場を選択する", () => {
      const venues = Object.freeze([venueA, venueB]);
      const beforeHalf = selectAssemblyVenueByWeight(venues, 0.499999);
      const atHalf = selectAssemblyVenueByWeight(venues, 0.5);
      return {
        ok: beforeHalf === venueA && atHalf === venueB,
        detail: `before=${beforeHalf.id} / at=${atHalf.id}`
      };
    }),
    executeTest("最大人数では作者座標の値と順序をそのまま使う", () => {
      const result = createAssemblyPositions(
        venueA,
        assemblyPositions.length
      );
      const exact =
        result.length === assemblyPositions.length &&
        result.every(
          (position, index) =>
            samePosition(position, assemblyPositions[index]) &&
            position !== assemblyPositions[index]
        );
      return {
        ok: exact && result !== assemblyPositions,
        detail: `count=${result.length} / cloned=${result !== assemblyPositions}`
      };
    }),
    executeTest("1人では会場中央へ配置する", () => {
      const result = createAssemblyPositions(venueA, 1);
      return {
        ok:
          result.length === 1 &&
          samePosition(result[0], center) &&
          result[0] !== venueA.center,
        detail: `position=${result[0].toString()}`
      };
    }),
    executeTest("少人数では平方根縮小した等角度円を決定的に作る", () => {
      const count = 3;
      const expectedRadius = 6 * Math.sqrt(count / assemblyPositions.length);
      const first = createAssemblyPositions(venueA, count);
      const second = createAssemblyPositions(venueA, count);
      const radii = first.map((position) =>
        Math.hypot(position.x - center.x, position.z - center.z)
      );
      const mean = first.reduce(
        (sum, position) => sum.add(position),
        Vector3.Zero()
      ).scale(1 / count);
      return {
        ok:
          first.every((position, index) =>
            samePosition(position, second[index])
          ) &&
          radii.every((radius) => approximately(radius, expectedRadius)) &&
          samePosition(mean, center) &&
          approximately(first[0].x, center.x + expectedRadius) &&
          approximately(first[0].z, center.z),
        detail:
          `radius=${radii.map((radius) => radius.toFixed(6)).join(",")} / ` +
          `mean=${mean.toString()}`
      };
    }),
    executeTest("公開処刑の観客と対象を別容量で縮小する", () => {
      const audience = createExecutionAudiencePositions(venueA, 2);
      const targets = createExecutionTargetPositions(venueA, 1);
      const expectedAudienceRadius =
        4 * Math.sqrt(2 / audiencePositions.length);
      return {
        ok:
          audience.length === 2 &&
          audience.every((position) =>
            approximately(
              Math.hypot(position.x - center.x, position.z - center.z),
              expectedAudienceRadius
            )
          ) &&
          targets.length === 1 &&
          samePosition(targets[0], center),
        detail:
          `audienceRadius=${expectedAudienceRadius.toFixed(6)} / ` +
          `target=${targets[0].toString()}`
      };
    }),
    executeTest("観客作者座標を超える全非対象者も同じ最大半径へ配置する", () => {
      const count = assemblyPositions.length - 1;
      const audience = createExecutionAudiencePositions(
        venueA,
        count
      );
      const radii = audience.map((position) =>
        Math.hypot(
          position.x - center.x,
          position.z - center.z
        )
      );
      const mean = audience
        .reduce(
          (sum, position) => sum.add(position),
          Vector3.Zero()
        )
        .scale(1 / count);
      return {
        ok:
          audience.length === count &&
          radii.every((radius) => approximately(radius, 4)) &&
          samePosition(mean, center),
        detail:
          `count=${audience.length} / ` +
          `radius=${radii.map((radius) => radius.toFixed(6)).join(",")} / ` +
          `mean=${mean.toString()}`
      };
    }),
    executeTest("人数範囲外と乱数範囲外を拒否する", () => {
      const invalidZero = throws(() => createAssemblyPositions(venueA, 0));
      const invalidOver = throws(() =>
        createExecutionTargetPositions(
          venueA,
          targetPositions.length + 1
        )
      );
      const invalidRandom = throws(() =>
        selectAssemblyVenueByWeight([venueA, venueB], 1)
      );
      return {
        ok: invalidZero && invalidOver && invalidRandom,
        detail:
          `zero=${invalidZero} / over=${invalidOver} / random=${invalidRandom}`
      };
    })
  ];
