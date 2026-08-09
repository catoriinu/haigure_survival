import {
  Frustum,
  Matrix,
  Vector3,
  type Camera,
  type FreeCamera,
  type Scene
} from "@babylonjs/core";

import {
  createV2MinimapController,
  projectV2MinimapPoint,
  type V2MinimapUpdate
} from "../../../src/ui/v2Minimap";
import type { StageElevatorSnapshot } from "../../../src/world/stageElevatorRuntime";
import {
  STAGE_LOCATION_FLOOR_IDS,
  type StageLocationAssetRegistry,
  type StageLocationFloorId,
  type StageStairLandingDirection
} from "../../../src/world/stageLocationAssets";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import type { StageSpatialQueries } from "../../../src/world/stageSpatialQueries";
import type { V2MinimapActorSnapshot } from "../../../src/v2/survivalRuntime";
import { createT063Check, type T063TestResult } from "./testUtils";

type TestInput = Readonly<{
  scene: Scene;
  camera: FreeCamera;
  canvas: HTMLCanvasElement;
  readout: HTMLElement;
  stage: StageSpatialContext;
}>;

const getNodePosition = (node: { computeWorldMatrix(force?: boolean): unknown; getAbsolutePosition(): Vector3 }) => {
  node.computeWorldMatrix(true);
  return node.getAbsolutePosition().clone();
};

const requireLocationAssets = (
  stage: StageSpatialContext
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
  missionTargetLocationIds: readonly string[] = Object.freeze([])
): V2MinimapUpdate =>
  Object.freeze({
    active: true,
    elapsedSeconds,
    playerFootPosition: footPosition,
    playerEyePosition: setCamera(camera, footPosition, forward),
    forward,
    actors,
    elevators,
    missionTargetActorIds,
    missionTargetLocationIds
  });

const actor = (
  id: string,
  kind: "npc" | "bit",
  position: Vector3,
  follower: boolean
): V2MinimapActorSnapshot =>
  Object.freeze({ id, kind, position, follower });

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
  checks.push(
    createT063Check(
      "進行方向上の座標投影",
      Math.abs(northProjection.x - 90) < 1.0e-6 &&
        northProjection.y < 90 &&
        Math.abs(eastProjection.x - 90) < 1.0e-6 &&
        eastProjection.y < 90,
      `north=(${northProjection.x.toFixed(2)},${northProjection.y.toFixed(2)}) / ` +
        `east=(${eastProjection.x.toFixed(2)},${eastProjection.y.toFixed(2)})`
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
      readout: frame?.readout ?? ""
    });
  });
  checks.push(
    createT063Check(
      "5階層Map・現在地表示",
      floorResults.every(
        (result) =>
          result.floorId === result.resolvedFloorId && result.readout.length > 3
      ),
      floorResults
        .map((result) => `${result.floorId}:${result.readout}`)
        .join(" / ")
    )
  );

  const stairDirections = new Set<StageStairLandingDirection>();
  let stairMarkersResolved = 0;
  for (const landing of locationAssets.stairLandings) {
    if (stairDirections.has(landing.direction)) {
      continue;
    }
    stairDirections.add(landing.direction);
    const position = getNodePosition(landing.node);
    const frame = controller.update(
      createUpdate(
        camera,
        position,
        north,
        3 + stairDirections.size * 0.2,
        elevatorSnapshots
      )
    );
    if (
      frame?.stairMarkers.some(
        (marker) =>
          marker.id === landing.id && marker.direction === landing.direction
      )
    ) {
      stairMarkersResolved += 1;
    }
  }
  checks.push(
    createT063Check(
      "階段の上り・下り・双方向",
      stairDirections.size === 3 && stairMarkersResolved === 3,
      `directions=${[...stairDirections].join(",")} / markers=${stairMarkersResolved}`
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
      new Vector3(f01Position.x + 2.3, playerEyeY, f01Position.z),
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
      ? actor(entry.id, entry.kind, entry.position, false)
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
