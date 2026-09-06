import {
  Frustum,
  Matrix,
  Vector3,
  type Camera,
  type FreeCamera,
  type Scene
} from "@babylonjs/core";

import { createPlayerMotionController } from "../../../src/game/playerMotion";
import {
  createV2MinimapController,
  projectV2MinimapPoint,
  resolveV2MinimapHorizontalForward,
  V2_MINIMAP_AIRBORNE_AREA_GRACE_SECONDS,
  V2_MINIMAP_AREA_SAMPLE_HEIGHT_METERS,
  V2_MINIMAP_FLOOR_COLORS,
  V2_MINIMAP_PASSAGE_COLOR,
  V2_MINIMAP_RANGE_METERS,
  V2_MINIMAP_VIEW_CONE_RANGE_METERS,
  type V2MinimapUpdate
} from "../../../src/ui/v2Minimap";
import type { StageElevatorSnapshot } from "../../../src/world/stageElevatorRuntime";
import {
  StageLocationAreaAmbiguityError,
  STAGE_LOCATION_FLOOR_IDS,
  type StageLocationAssetRegistry,
  type StageLocationFloorId
} from "../../../src/world/stageLocationAssets";
import type { StageSpatialSession } from "../../../src/world/stageSpatialContext";
import type { StageSpatialQueries } from "../../../src/world/stageSpatialQueries";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import type { V2MinimapActorSnapshot } from "../../../src/v2/survivalRuntime";
import { createT063Check, type T063TestResult } from "./testUtils";

type TestInput = Readonly<{
  scene: Scene;
  camera: FreeCamera;
  canvas: HTMLCanvasElement;
  readout: HTMLElement;
  stage: StageSpatialSession;
}>;

const getNodePosition = (node: { computeWorldMatrix(force?: boolean): unknown; getAbsolutePosition(): Vector3 }) => {
  node.computeWorldMatrix(true);
  return node.getAbsolutePosition().clone();
};

const requireLocationAssets = (
  stage: StageSpatialSession
): StageLocationAssetRegistry => {
  if (stage.locationAssets === null) {
    throw new Error("T06-3 fixtureにはlocation assetsが必要です。");
  }
  return stage.locationAssets;
};

const requireFloorPosition = (
  locationAssets: StageLocationAssetRegistry,
  floorId: StageLocationFloorId
): Vector3 => {
  const missionLocation = locationAssets.missionLocations.find(
    (location) => location.floorId === floorId
  );
  if (missionLocation) {
    return getNodePosition(missionLocation.anchorNode);
  }
  const stairLanding = locationAssets.stairLandings.find(
    (landing) => landing.floorId === floorId
  );
  if (stairLanding) {
    return getNodePosition(stairLanding.node);
  }
  throw new Error(`fixture用の階位置がありません: ${floorId}`);
};

const createElevatorSnapshots = (
  locationAssets: StageLocationAssetRegistry,
  displayStopId: string | null = null
): readonly StageElevatorSnapshot[] =>
  Object.freeze(
    [...new Set(locationAssets.elevatorLandings.map((landing) => landing.elevatorId))]
      .map((elevatorId) => {
        const firstAvailableStop = locationAssets.elevatorLandings.find(
          (landing) =>
            landing.elevatorId === elevatorId && landing.stop !== null
        )?.stop?.id;
        if (!firstAvailableStop) {
          throw new Error(`fixture用の利用可能elevator stopがありません: ${elevatorId}`);
        }
        return Object.freeze({
          id: elevatorId,
          displayStopId: displayStopId ?? firstAvailableStop
        }) as StageElevatorSnapshot;
      })
  );

const setCamera = (
  camera: FreeCamera,
  footPosition: Vector3,
  forward: Vector3
): Vector3 => {
  const eyePosition = footPosition.add(new Vector3(0, 0.12, 0));
  camera.position.copyFrom(eyePosition);
  camera.setTarget(eyePosition.add(forward));
  camera.getViewMatrix(true);
  return eyePosition;
};

const createUpdate = (
  camera: FreeCamera,
  footPosition: Vector3,
  forward: Vector3,
  elapsedSeconds: number,
  elevators: readonly StageElevatorSnapshot[],
  actors: readonly V2MinimapActorSnapshot[] = Object.freeze([]),
  missionTargetActorIds: readonly string[] = Object.freeze([]),
  missionTargetLocationIds: readonly string[] = Object.freeze([]),
  playerGrounded = true,
  viewUp: Vector3 | null = null
): V2MinimapUpdate => {
  const playerEyePosition = setCamera(camera, footPosition, forward);
  return Object.freeze({
    active: true,
    elapsedSeconds,
    playerGrounded,
    playerFootPosition: footPosition,
    playerEyePosition,
    forward,
    up: viewUp ?? camera.getDirection(Vector3.Up()),
    actors,
    elevators,
    missionTargetActorIds,
    missionTargetLocationIds
  });
};

const actor = (
  id: string,
  kind: "npc" | "bit",
  areaPosition: Vector3,
  follower: boolean,
  sightPosition = areaPosition
): V2MinimapActorSnapshot =>
  Object.freeze({
    id,
    kind,
    areaPosition,
    sightPosition,
    follower
  });

const findAdjacentFloorBoundary = (
  locationAssets: StageLocationAssetRegistry,
  lowerAreaId: string,
  upperAreaId: string
): Readonly<{
  position: Vector3;
}> => {
  const lowerArea = locationAssets.getAreaById(lowerAreaId);
  const upperArea = locationAssets.getAreaById(upperAreaId);
  if (!lowerArea || !upperArea) {
    throw new Error(
      `fixture用の隣接Areaがありません: ${lowerAreaId}/${upperAreaId}`
    );
  }
  for (const lowerPiece of lowerArea.pieces) {
    lowerPiece.mesh.computeWorldMatrix(true);
    const lowerBounds = lowerPiece.mesh.getBoundingInfo().boundingBox;
    for (const upperPiece of upperArea.pieces) {
      upperPiece.mesh.computeWorldMatrix(true);
      const upperBounds = upperPiece.mesh.getBoundingInfo().boundingBox;
      const overlapMinimumX = Math.max(
        lowerBounds.minimumWorld.x,
        upperBounds.minimumWorld.x
      );
      const overlapMaximumX = Math.min(
        lowerBounds.maximumWorld.x,
        upperBounds.maximumWorld.x
      );
      const overlapMinimumZ = Math.max(
        lowerBounds.minimumWorld.z,
        upperBounds.minimumWorld.z
      );
      const overlapMaximumZ = Math.min(
        lowerBounds.maximumWorld.z,
        upperBounds.maximumWorld.z
      );
      if (
        overlapMaximumX <= overlapMinimumX ||
        overlapMaximumZ <= overlapMinimumZ ||
        Math.abs(
          lowerBounds.maximumWorld.y - upperBounds.minimumWorld.y
        ) > 1.0e-5
      ) {
        continue;
      }
      const position = new Vector3(
        (overlapMinimumX + overlapMaximumX) / 2,
        upperBounds.minimumWorld.y,
        (overlapMinimumZ + overlapMaximumZ) / 2
      );
      return Object.freeze({ position });
    }
  }
  throw new Error(
    `fixture用の隣接Area接面がありません: ${lowerAreaId}/${upperAreaId}`
  );
};

const findAirborneOutsideAreaPosition = (
  locationAssets: StageLocationAssetRegistry,
  roofPosition: Vector3
): Vector3 => {
  const roofMap = locationAssets.getFloorMap("roof");
  if (!roofMap) {
    throw new Error("fixture用の屋上floor_mapがありません。");
  }
  roofMap.mesh.computeWorldMatrix(true);
  const bounds = roofMap.mesh.getBoundingInfo().boundingBox;
  for (const distance of [0.1, 0.25, 0.5, 1] as const) {
    const candidates = [
      new Vector3(
        bounds.minimumWorld.x - distance,
        roofPosition.y,
        roofPosition.z
      ),
      new Vector3(
        bounds.maximumWorld.x + distance,
        roofPosition.y,
        roofPosition.z
      ),
      new Vector3(
        roofPosition.x,
        roofPosition.y,
        bounds.minimumWorld.z - distance
      ),
      new Vector3(
        roofPosition.x,
        roofPosition.y,
        bounds.maximumWorld.z + distance
      )
    ];
    const outside = candidates.find(
      (candidate) => locationAssets.findArea(candidate) === null
    );
    if (outside) {
      return outside;
    }
  }
  throw new Error("fixture用の屋上Area外空中位置がありません。");
};

const findFrustumPosition = (
  locationAssets: StageLocationAssetRegistry,
  camera: Camera,
  origin: Vector3,
  visible: boolean,
  excluded: readonly Vector3[] = Object.freeze([])
): Vector3 => {
  const planes = Frustum.GetPlanes(camera.getTransformationMatrix());
  for (const radius of [0.18, 0.5, 1, 2] as const) {
    for (let index = 0; index < 64; index += 1) {
      const angle = (index / 64) * Math.PI * 2;
      const candidate = new Vector3(
        origin.x + Math.cos(angle) * radius,
        origin.y + 0.12,
        origin.z + Math.sin(angle) * radius
      );
      if (
        excluded.some(
          (entry) => Vector3.DistanceSquared(entry, candidate) < 1.0e-8
        ) ||
        locationAssets.findArea(candidate) === null ||
        Frustum.IsPointInFrustum(candidate, planes) !== visible
      ) {
        continue;
      }
      return candidate;
    }
  }
  throw new Error(
    `fixture用の${visible ? "frustum内" : "frustum外"}位置がありません。`
  );
};

export const runV2MinimapTests = ({
  scene,
  camera,
  canvas,
  readout,
  stage
}: TestInput): readonly T063TestResult[] => {
  const checks: T063TestResult[] = [];
  const locationAssets = requireLocationAssets(stage);
  const f01Position = requireFloorPosition(locationAssets, "f01");
  const f02Position = requireFloorPosition(locationAssets, "f02");
  const north = new Vector3(0, 0, -1);
  let occludedPosition = f01Position.clone();
  let fixtureSightCastCount = 0;
  let fixtureCameraTransformation = Matrix.Identity();
  const fixtureCamera = Object.freeze({
    getTransformationMatrix: () => fixtureCameraTransformation
  }) as Camera;
  const queries = Object.freeze({
    revision: stage.queries.revision,
    castSightSegment: (_from: Vector3, to: Vector3) => {
      fixtureSightCastCount += 1;
      return Vector3.DistanceSquared(to, occludedPosition) < 1.0e-10
        ? (Object.freeze({}) as NonNullable<
            ReturnType<StageSpatialQueries["castSightSegment"]>
          >)
        : null;
    }
  }) as StageSpatialQueries;
  const controller = createV2MinimapController({
    canvas,
    readout,
    camera: fixtureCamera,
    locationAssets,
    queries
  });
  const elevatorSnapshots = createElevatorSnapshots(locationAssets);

  const northProjection = projectV2MinimapPoint(
    new Vector3(0, 0, -0.25),
    Vector3.Zero(),
    north
  );
  const eastProjection = projectV2MinimapPoint(
    new Vector3(0.25, 0, 0),
    Vector3.Zero(),
    new Vector3(1, 0, 0)
  );
  const rangeProjection = projectV2MinimapPoint(
    new Vector3(0, 0, -4.5),
    Vector3.Zero(),
    north
  );
  const previousRangeProjection = projectV2MinimapPoint(
    new Vector3(0, 0, -2.25),
    Vector3.Zero(),
    north
  );
  const viewConeProjection = projectV2MinimapPoint(
    new Vector3(0, 0, -3),
    Vector3.Zero(),
    north
  );
  const downwardForward = resolveV2MinimapHorizontalForward(
    new Vector3(0, -1, 0),
    north
  );
  const upwardForward = resolveV2MinimapHorizontalForward(
    new Vector3(0, 1, 0),
    north.scale(-1)
  );
  const downwardFrame = controller.update(
    createUpdate(
      camera,
      f01Position,
      new Vector3(0, -1, 0),
      0.1,
      elevatorSnapshots,
      Object.freeze([]),
      Object.freeze([]),
      Object.freeze([]),
      true,
      north
    )
  );
  const upwardFrame = controller.update(
    createUpdate(
      camera,
      f01Position,
      new Vector3(0, 1, 0),
      0.2,
      elevatorSnapshots,
      Object.freeze([]),
      Object.freeze([]),
      Object.freeze([]),
      true,
      north.scale(-1)
    )
  );
  const motion = createPlayerMotionController({
    moveInertiaAt60Fps: 0,
    moveStopEpsilon: 0,
    collisionEpsilon: 0
  });
  const projectWasd = (resolvedForward: Vector3) => {
    const movementYaw = Math.atan2(
      resolvedForward.x,
      resolvedForward.z
    );
    const projectMove = (moveX: number, moveZ: number) => {
      motion.reset();
      const displacement = motion.update(
        Object.freeze({ moveX, moveZ }),
        movementYaw,
        1,
        true,
        1
      );
      return projectV2MinimapPoint(
        displacement,
        Vector3.Zero(),
        resolvedForward
      );
    };
    return Object.freeze({
      w: projectMove(0, 1),
      a: projectMove(-1, 0),
      s: projectMove(0, -1),
      d: projectMove(1, 0)
    });
  };
  const downwardWasd = projectWasd(downwardForward);
  const upwardWasd = projectWasd(upwardForward);
  const wasdDirectionsAreStable = [downwardWasd, upwardWasd].every(
    (projection) =>
      projection.w.y < 90 &&
      projection.a.x < 90 &&
      projection.s.y > 90 &&
      projection.d.x > 90
  );
  checks.push(
    createT063Check(
      "真上・真下を含む進行方向上・18m表示・12m視野扇",
      Math.abs(northProjection.x - 90) < 1.0e-6 &&
        northProjection.y < 90 &&
        Math.abs(eastProjection.x - 90) < 1.0e-6 &&
        eastProjection.y < 90 &&
        V2_MINIMAP_RANGE_METERS === 18 &&
        V2_MINIMAP_VIEW_CONE_RANGE_METERS === 12 &&
        Math.abs(rangeProjection.y) < 1.0e-6 &&
        Math.abs(previousRangeProjection.y - 45) < 1.0e-6 &&
        Math.abs(viewConeProjection.y - 30) < 1.0e-6 &&
        downwardForward.equalsWithEpsilon(north, 1.0e-6) &&
        upwardForward.equalsWithEpsilon(north, 1.0e-6) &&
        downwardFrame?.forward.equalsWithEpsilon(north, 1.0e-6) === true &&
        upwardFrame?.forward.equalsWithEpsilon(north, 1.0e-6) === true &&
        wasdDirectionsAreStable,
      `north=(${northProjection.x.toFixed(2)},${northProjection.y.toFixed(2)}) / ` +
        `east=(${eastProjection.x.toFixed(2)},${eastProjection.y.toFixed(2)}) / ` +
        `range=${rangeProjection.y.toFixed(2)} / cone=${viewConeProjection.y.toFixed(2)} / ` +
        `down=${downwardFrame?.forward.asArray().join(",") ?? "なし"} / ` +
        `up=${upwardFrame?.forward.asArray().join(",") ?? "なし"} / ` +
        `wasd=${wasdDirectionsAreStable}`
    )
  );

  const floorResults = STAGE_LOCATION_FLOOR_IDS.map((floorId, index) => {
    const position = requireFloorPosition(locationAssets, floorId);
    const frame = controller.update(
      createUpdate(
        camera,
        position,
        north,
        1 + index * 0.2,
        elevatorSnapshots
      )
    );
    return Object.freeze({
      floorId,
      resolvedFloorId: frame?.floorId ?? null,
      readout: frame?.readout ?? "",
      floorColor: frame?.floorColor ?? ""
    });
  });
  checks.push(
    createT063Check(
      "5階層Map・現在地表示",
      floorResults.every(
        (result) =>
          result.floorId === result.resolvedFloorId &&
          result.readout.length > 3 &&
          result.floorColor === V2_MINIMAP_FLOOR_COLORS[result.floorId]
      ),
      floorResults
        .map(
          (result) =>
            `${result.floorId}:${result.readout}:${result.floorColor}`
        )
        .join(" / ")
    )
  );

  controller.update(
    createUpdate(
      camera,
      f01Position,
      north,
      2.2,
      elevatorSnapshots
    )
  );
  const firstFloorPassage = locationAssets.getMinimapPassages("f01")[0];
  firstFloorPassage.mesh.computeWorldMatrix(true);
  const firstFloorPassageCenter =
    firstFloorPassage.mesh.getBoundingInfo().boundingBox.centerWorld;
  const passageReviewOffsets = [0, 0.05, -0.05, 0.15, -0.15, 0.3, -0.3];
  let passageReviewPosition: Vector3 | null = null;
  for (const offsetX of passageReviewOffsets) {
    for (const offsetZ of passageReviewOffsets) {
      const candidate = new Vector3(
        firstFloorPassageCenter.x + offsetX,
        f01Position.y,
        firstFloorPassageCenter.z + offsetZ
      );
      try {
        if (locationAssets.findArea(candidate)?.floorId === "f01") {
          passageReviewPosition = candidate;
          break;
        }
      } catch (error) {
        if (!(error instanceof StageLocationAreaAmbiguityError)) {
          throw error;
        }
      }
    }
    if (passageReviewPosition) {
      break;
    }
  }
  if (!passageReviewPosition) {
    throw new Error("1F Passage周辺にfixture表示位置がありません。");
  }
  controller.update(
    createUpdate(
      camera,
      passageReviewPosition,
      north,
      2.21,
      elevatorSnapshots
    )
  );
  const minimapContext = canvas.getContext("2d");
  if (!minimapContext) {
    throw new Error("fixture用ミニマップCanvas contextがありません。");
  }
  const minimapPixels = minimapContext.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  ).data;
  let blockedPixelCount = 0;
  let passagePixelCount = 0;
  let firstFloorPixelCount = 0;
  const passageColor = V2_MINIMAP_PASSAGE_COLOR.match(
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
  );
  if (!passageColor) {
    throw new Error(`開口色がRGB 16進表記ではありません: ${V2_MINIMAP_PASSAGE_COLOR}`);
  }
  const passageRgb = passageColor.slice(1).map((value) =>
    Number.parseInt(value, 16)
  );
  const authoredMapCoverage = STAGE_LOCATION_FLOOR_IDS.every(
    (floorId) =>
      locationAssets.getMinimapBarriers(floorId).length > 0 &&
      locationAssets.getMinimapPassages(floorId).length > 0
  );
  for (let index = 0; index < minimapPixels.length; index += 4) {
    const red = minimapPixels[index];
    const green = minimapPixels[index + 1];
    const blue = minimapPixels[index + 2];
    const alpha = minimapPixels[index + 3];
    if (red <= 7 && green <= 7 && blue <= 7 && alpha === 255) {
      blockedPixelCount += 1;
    }
    if (
      red === passageRgb[0] &&
      green === passageRgb[1] &&
      blue === passageRgb[2] &&
      alpha === 255
    ) {
      passagePixelCount += 1;
    }
    if (
      red > green + 15 &&
      green > blue + 25 &&
      alpha === 255
    ) {
      firstFloorPixelCount += 1;
    }
  }
  checks.push(
    createT063Check(
      "1F床色・作者定義Barrier黒表示・Passage明色表示",
      blockedPixelCount > 0 &&
        passagePixelCount > 0 &&
        firstFloorPixelCount > 0 &&
        locationAssets.minimapBarriers.length === 5 &&
        locationAssets.minimapPassages.length === 5 &&
        authoredMapCoverage,
      `blockedPixels=${blockedPixelCount} / passagePixels=${passagePixelCount} / ` +
        `floorPixels=${firstFloorPixelCount} / ` +
        `authored=${locationAssets.minimapBarriers.length}/${locationAssets.minimapPassages.length}/${authoredMapCoverage}`
    )
  );

  const courtyardArea = locationAssets.getAreaById("area-courtyard");
  const perimeterArea = locationAssets.getAreaById("area-school-perimeter");
  const gymRooftop = locationAssets.getMissionLocationById("gym-rooftop");
  checks.push(
    createT063Check(
      "B06-4校庭・校舎外周Areaと体育館屋上Missionを意味資産だけで取得",
      courtyardArea?.displayName === "校庭" &&
        perimeterArea?.displayName === "校舎外周" &&
        !locationAssets.missionLocations.some(
          (location) => location.area.id === "area-school-perimeter"
        ) &&
        gymRooftop?.floorId === "f03" &&
        gymRooftop.displayName === "体育館屋上",
      `courtyard=${courtyardArea?.displayName ?? "なし"} / ` +
        `perimeter=${perimeterArea?.displayName ?? "なし"} / ` +
        `gymRooftop=${gymRooftop?.floorId ?? "なし"}/${gymRooftop?.displayName ?? "なし"}`
    )
  );

  const secondFloorBarriers = locationAssets.getMinimapBarriers("f02");
  const secondFloorPassages = locationAssets.getMinimapPassages("f02");
  checks.push(
    createT063Check(
      "2F cacheは家具・別階を混ぜず作者定義資産だけを使用",
      secondFloorBarriers.length > 0 &&
        secondFloorPassages.length > 0 &&
        [...secondFloorBarriers, ...secondFloorPassages].every(
          (asset) =>
            asset.floorId === "f02" && asset.mesh.name.startsWith("MAP_")
        ),
      `barriers=${secondFloorBarriers.length} / ` +
        `passages=${secondFloorPassages.length} / ` +
        `floors=${[...secondFloorBarriers, ...secondFloorPassages]
          .map((asset) => asset.floorId)
          .join(",")}`
    )
  );

  const boundaryCases = Object.freeze([
    Object.freeze({
      lowerAreaId: "area-common-f02",
      upperAreaId: "area-common-f03",
      rawExpectation: "ambiguous" as const
    }),
    Object.freeze({
      lowerAreaId: "area-stair-ne-f01-f02",
      upperAreaId: "area-stair-ne-f02-f03",
      rawExpectation: "upper-owned" as const
    })
  ]);
  const boundaryResults = boundaryCases.map((boundaryCase, index) => {
    const boundary = findAdjacentFloorBoundary(
      locationAssets,
      boundaryCase.lowerAreaId,
      boundaryCase.upperAreaId
    );
    let rawBoundaryRejected = false;
    let rawBoundaryAreaIds: readonly string[] = Object.freeze([]);
    let rawBoundaryAreaId: string | null = null;
    try {
      rawBoundaryAreaId =
        locationAssets.findArea(boundary.position)?.area.id ?? null;
    } catch (error) {
      if (error instanceof StageLocationAreaAmbiguityError) {
        rawBoundaryAreaIds = error.areaIds;
        rawBoundaryRejected =
          error.areaIds.includes(boundaryCase.lowerAreaId) &&
          error.areaIds.includes(boundaryCase.upperAreaId);
      }
    }
    const rawBoundaryContractSatisfied =
      boundaryCase.rawExpectation === "ambiguous"
        ? rawBoundaryRejected
        : rawBoundaryAreaId === boundaryCase.upperAreaId;
    const markerId = `npc-floor-boundary-${index}`;
    const boundaryFrame = controller.update(
      createUpdate(
        camera,
        boundary.position,
        north,
        2.5 + index * 0.1,
        elevatorSnapshots,
        Object.freeze([
          actor(markerId, "npc", boundary.position, true)
        ])
      )
    );
    return Object.freeze({
      rawBoundaryContractSatisfied,
      rawBoundaryRejected,
      rawBoundaryAreaIds,
      rawBoundaryAreaId,
      floorId: boundaryFrame?.floorId ?? null,
      readout: boundaryFrame?.readout ?? null,
      markerResolved:
        boundaryFrame?.actorMarkers.some(
          (marker) => marker.id === markerId
        ) ?? false
    });
  });
  checks.push(
    createT063Check(
      "階段Areaの現在位置は階範囲を重複表示しない",
      boundaryResults[1]?.floorId === "f02" &&
        boundaryResults[1].readout === "2F-3F 北東階段",
      `floor=${boundaryResults[1]?.floorId ?? "なし"}` +
        `/readout=${boundaryResults[1]?.readout ?? "なし"}`
    )
  );
  const commonF03F04Boundary = findAdjacentFloorBoundary(
    locationAssets,
    "area-common-f03",
    "area-common-f04"
  );
  let commonF03F04RawBoundaryRejected = false;
  try {
    locationAssets.findArea(commonF03F04Boundary.position);
  } catch (error) {
    commonF03F04RawBoundaryRejected =
      error instanceof StageLocationAreaAmbiguityError &&
      error.areaIds.join(",") === "area-common-f03,area-common-f04";
  }
  const sampleHeightWorldUnits =
    V2_MINIMAP_AREA_SAMPLE_HEIGHT_METERS * BLENDER_METERS_TO_WORLD_UNITS;
  const lowerPlayerPosition = commonF03F04Boundary.position.subtract(
    new Vector3(0, sampleHeightWorldUnits * 2, 0)
  );
  const bitCenterBelowBoundary = commonF03F04Boundary.position.subtract(
    new Vector3(0, sampleHeightWorldUnits, 0)
  );
  const belowBoundaryBitId = "bit-f03-f04-below-boundary";
  const belowBoundaryFrame = controller.update(
    createUpdate(
      camera,
      lowerPlayerPosition,
      north,
      2.7,
      elevatorSnapshots,
      Object.freeze([
        actor(belowBoundaryBitId, "bit", bitCenterBelowBoundary, false)
      ]),
      Object.freeze([belowBoundaryBitId])
    )
  );
  const onBoundaryBitId = "bit-f03-f04-on-boundary";
  const onBoundaryFrame = controller.update(
    createUpdate(
      camera,
      commonF03F04Boundary.position,
      north,
      2.8,
      elevatorSnapshots,
      Object.freeze([
        actor(
          onBoundaryBitId,
          "bit",
          commonF03F04Boundary.position,
          false
        )
      ]),
      Object.freeze([onBoundaryBitId])
    )
  );
  checks.push(
    createT063Check(
      "プレイヤー・NPC足元とBIT中心の全階接面解決",
      V2_MINIMAP_AREA_SAMPLE_HEIGHT_METERS === 0.05 &&
        boundaryResults.every(
          (result) =>
            result.rawBoundaryContractSatisfied &&
            result.floorId !== null &&
            result.markerResolved
        ) &&
        commonF03F04RawBoundaryRejected &&
        belowBoundaryFrame?.floorId === "f03" &&
        belowBoundaryFrame.actorMarkers.some(
          (marker) => marker.id === belowBoundaryBitId
        ) &&
        onBoundaryFrame?.floorId === "f04" &&
        onBoundaryFrame.actorMarkers.some(
          (marker) => marker.id === onBoundaryBitId
        ),
      boundaryResults
        .map(
          (result) =>
            `raw=${result.rawBoundaryRejected}` +
            `[${result.rawBoundaryAreaIds.join(",")}]` +
            `/area=${result.rawBoundaryAreaId ?? "なし"}` +
            `/floor=${result.floorId ?? "なし"}/actor=${result.markerResolved}`
        )
        .join(" | ") +
        ` | f03-f04-raw=${commonF03F04RawBoundaryRejected}` +
        `/below=${belowBoundaryFrame?.floorId ?? "なし"}` +
        `/on=${onBoundaryFrame?.floorId ?? "なし"}`
    )
  );

  const stairDirections = new Set(
    locationAssets.stairLandings.map((landing) => landing.direction)
  );
  let framesWithoutStairMarkers = 0;
  for (const landing of locationAssets.stairLandings) {
    const position = getNodePosition(landing.node);
    const frame = controller.update(
      createUpdate(
        camera,
        position,
        north,
        3 + framesWithoutStairMarkers * 0.2,
        elevatorSnapshots
      )
    );
    if (frame !== null && !("stairMarkers" in frame)) {
      framesWithoutStairMarkers += 1;
    }
  }
  checks.push(
    createT063Check(
      "階段方向metadataを維持してアイコンを描画しない",
      stairDirections.size === 3 &&
        framesWithoutStairMarkers === locationAssets.stairLandings.length,
      `directions=${[...stairDirections].join(",")} / markerless=${framesWithoutStairMarkers}/${locationAssets.stairLandings.length}`
    )
  );

  let elevatorMarkersResolved = 0;
  let unavailableMarkersResolved = 0;
  for (const landing of locationAssets.elevatorLandings) {
    const position = getNodePosition(landing.node);
    const displayStopId = landing.stop?.id ?? elevatorSnapshots[0].displayStopId;
    const frame = controller.update(
      createUpdate(
        camera,
        position,
        north,
        4 + elevatorMarkersResolved * 0.2,
        createElevatorSnapshots(locationAssets, displayStopId)
      )
    );
    const marker = frame?.elevatorMarkers.find(
      (candidate) => candidate.id === landing.id
    );
    if (
      marker &&
      marker.available === landing.available &&
      marker.displayStop === (landing.stop !== null)
    ) {
      elevatorMarkersResolved += 1;
    }
    if (marker && !landing.available && !marker.displayStop) {
      unavailableMarkersResolved += 1;
    }
  }
  checks.push(
    createT063Check(
      "全階エレベーター利用可否・表示stop",
      elevatorMarkersResolved === 4 && unavailableMarkersResolved === 2,
      `resolved=${elevatorMarkersResolved}/4 / unavailable=${unavailableMarkersResolved}/2`
    )
  );

  const elevatorPiece = locationAssets.areas
    .flatMap((area) => area.pieces)
    .find((piece) => piece.floorBinding.kind === "elevator");
  if (!elevatorPiece || elevatorPiece.floorBinding.kind !== "elevator") {
    throw new Error("fixture用のelevator Area pieceがありません。");
  }
  elevatorPiece.mesh.computeWorldMatrix(true);
  const elevatorCenter =
    elevatorPiece.mesh.getBoundingInfo().boundingBox.centerWorld.clone();
  const f04Landing = locationAssets.elevatorLandings.find(
    (landing) => landing.floorId === "f04" && landing.stop !== null
  );
  if (!f04Landing?.stop) {
    throw new Error("fixture用の4F elevator stopがありません。");
  }
  const elevatorFrame = controller.update(
    createUpdate(
      camera,
      elevatorCenter,
      north,
      5.5,
      createElevatorSnapshots(locationAssets, f04Landing.stop.id)
    )
  );
  checks.push(
    createT063Check(
      "移動中エレベーターの表示階",
      elevatorFrame?.floorId === "f04" &&
        elevatorFrame.readout.startsWith("4F "),
      `floor=${elevatorFrame?.floorId ?? "なし"} / readout=${elevatorFrame?.readout ?? "なし"}`
    )
  );

  setCamera(camera, f01Position, north);
  fixtureCameraTransformation = Matrix.Translation(
    -f01Position.x,
    -(f01Position.y + 0.12),
    -f01Position.z
  );
  const visiblePosition = findFrustumPosition(
    locationAssets,
    fixtureCamera,
    f01Position,
    true
  );
  occludedPosition = findFrustumPosition(
    locationAssets,
    fixtureCamera,
    f01Position,
    true,
    Object.freeze([visiblePosition])
  );
  const outsideFrustumPosition = findFrustumPosition(
    locationAssets,
    fixtureCamera,
    f01Position,
    false
  );
  const playerEyeY = f01Position.y + 0.12;
  const actors = Object.freeze([
    actor(
      "npc-visible",
      "npc",
      visiblePosition,
      false
    ),
    actor("npc-occluded", "npc", occludedPosition, false),
    actor(
      "npc-follower",
      "npc",
      outsideFrustumPosition,
      true
    ),
    actor(
      "npc-mission",
      "npc",
      outsideFrustumPosition.clone(),
      false
    ),
    actor(
      "npc-behind",
      "npc",
      outsideFrustumPosition.clone(),
      false
    ),
    actor(
      "bit-far-mission",
      "bit",
      new Vector3(f01Position.x + 4.6, playerEyeY, f01Position.z),
      false
    ),
    actor(
      "npc-other-floor",
      "npc",
      f02Position.add(new Vector3(0, 0.12, 0)),
      true
    )
  ]);
  const f01MissionLocation = locationAssets.missionLocations.find(
    (location) => location.floorId === "f01"
  );
  const f02MissionLocation = locationAssets.missionLocations.find(
    (location) => location.floorId === "f02"
  );
  if (!f01MissionLocation || !f02MissionLocation) {
    throw new Error("fixture用のMission Locationがありません。");
  }
  const actorFrame = controller.update(
    createUpdate(
      camera,
      f01Position,
      north,
      10,
      elevatorSnapshots,
      actors,
      Object.freeze(["npc-mission", "bit-far-mission"]),
      Object.freeze([f01MissionLocation.id, f02MissionLocation.id])
    )
  );
  const actorIds = actorFrame?.actorMarkers.map((marker) => marker.id) ?? [];
  const missionMarkerKind = actorFrame?.actorMarkers.find(
    (marker) => marker.id === "npc-mission"
  )?.kind;
  checks.push(
    createT063Check(
      "Actor・Follower・Mission表示条件",
      actorIds.includes("npc-visible") &&
        actorIds.includes("npc-follower") &&
        actorIds.includes("npc-mission") &&
        !actorIds.includes("npc-occluded") &&
        !actorIds.includes("npc-behind") &&
        !actorIds.includes("bit-far-mission") &&
        !actorIds.includes("npc-other-floor") &&
        missionMarkerKind === "mission-actor" &&
        actorFrame?.missionLocationMarkers.length === 1 &&
        actorFrame.missionLocationMarkers[0].id === f01MissionLocation.id,
      `actors=${actorIds.join(",")} / missionKind=${missionMarkerKind ?? "なし"} / ` +
        `locations=${actorFrame?.missionLocationMarkers.map((marker) => marker.id).join(",") ?? "なし"}`
    )
  );

  const diagnosticsAtFirstRefresh = controller.getDiagnostics();
  controller.update(
    createUpdate(
      camera,
      f01Position,
      north,
      10.05,
      elevatorSnapshots,
      actors
    )
  );
  const diagnosticsBeforeInterval = controller.getDiagnostics();
  const actorsAfterLeave = actors.map((entry) =>
    entry.id === "npc-follower"
      ? actor(
          entry.id,
          entry.kind,
          entry.areaPosition,
          false,
          entry.sightPosition
        )
      : entry
  );
  const frameAfterLeave = controller.update(
    createUpdate(
      camera,
      f01Position,
      north,
      10.11,
      elevatorSnapshots,
      actorsAfterLeave
    )
  );
  const diagnosticsAfterInterval = controller.getDiagnostics();
  checks.push(
    createT063Check(
      "視認10Hz・事前絞り込み・Leave解除",
      diagnosticsBeforeInterval.visibilityRefreshCount ===
        diagnosticsAtFirstRefresh.visibilityRefreshCount &&
        diagnosticsAfterInterval.visibilityRefreshCount ===
          diagnosticsAtFirstRefresh.visibilityRefreshCount + 1 &&
        diagnosticsAtFirstRefresh.lastSightCandidateCount === 2 &&
        fixtureSightCastCount === diagnosticsAfterInterval.sightCastCount &&
        !frameAfterLeave?.actorMarkers.some(
          (marker) => marker.id === "npc-follower"
        ),
      `refresh=${diagnosticsAtFirstRefresh.visibilityRefreshCount}/` +
        `${diagnosticsBeforeInterval.visibilityRefreshCount}/` +
        `${diagnosticsAfterInterval.visibilityRefreshCount} / ` +
        `candidates=${diagnosticsAtFirstRefresh.lastSightCandidateCount} / ` +
        `casts=${fixtureSightCastCount}`
    )
  );

  const roofPosition = requireFloorPosition(locationAssets, "roof");
  const roofFrame = controller.update(
    createUpdate(camera, roofPosition, north, 12, elevatorSnapshots)
  );
  const airbornePosition = findAirborneOutsideAreaPosition(
    locationAssets,
    roofPosition
  );
  const graceFrame = controller.update(
    createUpdate(
      camera,
      airbornePosition,
      north,
      12 + V2_MINIMAP_AIRBORNE_AREA_GRACE_SECONDS,
      elevatorSnapshots,
      Object.freeze([]),
      Object.freeze([]),
      Object.freeze([]),
      false
    )
  );
  const expiredFrame = controller.update(
    createUpdate(
      camera,
      airbornePosition,
      north,
      12 + V2_MINIMAP_AIRBORNE_AREA_GRACE_SECONDS + 0.01,
      elevatorSnapshots,
      Object.freeze([]),
      Object.freeze([]),
      Object.freeze([]),
      false
    )
  );
  const landingFrame = controller.update(
    createUpdate(
      camera,
      f01Position,
      north,
      12 + V2_MINIMAP_AIRBORNE_AREA_GRACE_SECONDS + 0.02,
      elevatorSnapshots
    )
  );
  checks.push(
    createT063Check(
      "屋上飛び降りの3秒保持・非表示・着地復帰",
      roofFrame?.floorId === "roof" &&
        graceFrame?.floorId === "roof" &&
        expiredFrame === null &&
        landingFrame?.floorId === "f01" &&
        canvas.style.display === "block" &&
        readout.style.display === "block",
      `roof=${roofFrame?.floorId ?? "なし"} / grace=${graceFrame?.floorId ?? "なし"} / ` +
        `expired=${expiredFrame === null} / landing=${landingFrame?.floorId ?? "なし"}`
    )
  );

  const diagnostics = controller.getDiagnostics();
  checks.push(
    createT063Check(
      "階別静的背景cache",
      diagnostics.mapCacheBuildCount === 5,
      `cache=${diagnostics.mapCacheBuildCount} / floorMaps=${locationAssets.floorMaps.length}`
    )
  );

  controller.clear();
  const clearPassed =
    canvas.style.display === "none" &&
    readout.style.display === "none" &&
    readout.textContent === "" &&
    controller.getFrame() === null;
  controller.update(
    createUpdate(
      camera,
      f01Position,
      north,
      20,
      elevatorSnapshots
    )
  );
  controller.dispose();
  let disposedRejected = false;
  try {
    controller.update(
      createUpdate(
        camera,
        f01Position,
        north,
        21,
        elevatorSnapshots
      )
    );
  } catch {
    disposedRejected = true;
  }
  checks.push(
    createT063Check(
      "clear・disposeライフサイクル",
      clearPassed &&
        disposedRejected &&
        canvas.style.display === "none" &&
        readout.style.display === "none",
      `clear=${clearPassed} / disposedRejected=${disposedRejected}`
    )
  );

  checks.push(
    createT063Check(
      "fixture Scene継続性",
      !scene.isDisposed,
      `sceneDisposed=${scene.isDisposed}`
    )
  );
  return Object.freeze(checks);
};
