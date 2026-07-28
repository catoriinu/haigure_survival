import {
  ArcRotateCamera,
  Color3,
  Engine,
  HemisphericLight,
  Logger,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";
import { exportNavMesh } from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";

import schoolGlbUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.glb?url";
import schoolNavmeshUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin?url";
import schoolBitNavmeshUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.bit-flight.navmesh.bin?url";
import schoolRoomVariantNavmeshUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.room-variants.navmesh.bin?url";
import {
  BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND,
  createBitFlightAgent
} from "../../../src/world/bitFlightAgent";
import {
  BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
  createBitFlightBandRef,
  createBitFlightNavigationWorld,
  toBitFlightBandId,
  toBitFlightZoneId,
  type BitFlightBand,
  type BitFlightBandRef,
  type BitFlightNavMeshPayload,
  type BitFlightNavigationDefinition,
  type BitFlightNavigationWorld,
  type BitFlightTransitionDefinition,
  type BitFlightZone
} from "../../../src/world/bitFlightNavigation";
import {
  decodeBitFlightNavBundle,
  encodeBitFlightNavBundle
} from "../../../src/world/bitFlightNavBundle";
import {
  BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
  type BitFlightSafety
} from "../../../src/world/bitFlightSafety";
import { initializeNavigationRuntime } from "../../../src/world/navigationWorld";
import {
  SCHOOL_STAGE,
  type StageCatalogEntry
} from "../../../src/world/stageCatalog";
import {
  SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
} from "../../../src/world/schoolRuntimeSettings";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../../../src/world/stageSpatialContext";
import type { StageVolume } from "../../../src/world/stageSpatialQueries";
import { createStageWorldBoundary } from "../../../src/world/stageWorldBoundary";
import { createV2BeamSystem } from "../../../src/v2/beamCollision";
import { createV2BitSystem } from "../../../src/v2/bitSystem";
import type { V2HumanTargetSnapshot } from "../../../src/v2/combatTypes";
import { createV2HitEffectSystem } from "../../../src/v2/hitEffectSystem";
import {
  runAlertCoordinatorTests
} from "./alertCoordinator.test";
import { runAlarmSystemTests } from "./alarmSystem.test";
import { runAssemblyLayoutTests } from "./assemblyLayout.test";
import { runBeamCombatTests } from "./beamCombat.test";
import { runBitCombatIntegrationTests } from "./bitCombatIntegration.test";
import { runBitCombatProfileTests } from "./bitCombatProfile.test";
import { runBitFlightAgentTests } from "./bitFlightAgent.test";
import { runBitFlightSafetyTests } from "./bitFlightSafety.test";
import { runBitFlightSurfaceVariantTests } from "./bitFlightSurfaceVariant.test";
import { runBitFlightTacticsTests } from "./bitFlightTactics.test";
import {
  runBitSystemAcceptanceTests,
  type BitSystemAcceptanceFixture,
  type BitSystemAcceptanceMode
} from "./bitSystemAcceptance.test";
import { runCharacterStateSystemTests } from "./characterStateSystem.test";
import { runHitEffectSystemTests } from "./hitEffectSystem.test";
import { runNpcCombatTests } from "./npcCombat.test";
import { runPerformanceScenarioTests } from "./performanceScenario.test";
import { runPublicExecutionSystemTests } from "./publicExecutionSystem.test";
import { runSurvivalRulesTests } from "./survivalRules.test";
import {
  runPerformanceDiagnosticsLifecycleTests,
  runSurvivalRuntimeLifecycleTests
} from "./survivalRuntimeLifecycle.test";
import { createDynamicStageSpatialQueryFixture } from "./stageSpatialQueryFixture";
import { runWorldBoundaryTests } from "./worldBoundary.test";

import "./style.css";

const requestedAcceptanceMode = new URLSearchParams(location.search).get(
  "acceptance"
);
const requestedValidationProbe = new URLSearchParams(location.search).get(
  "validationProbe"
);
const acceptanceMode: BitSystemAcceptanceMode =
  requestedAcceptanceMode === "core" ||
  requestedAcceptanceMode === "school"
    ? requestedAcceptanceMode
    : "all";

const toStageRelativeAssetUrl = (url: string) =>
  url.startsWith("/") ? url.slice(1) : url;

const SCHOOL_VALIDATION_STAGE: StageCatalogEntry = Object.freeze({
  ...SCHOOL_STAGE,
  glbUrl: toStageRelativeAssetUrl(schoolGlbUrl),
  navmeshUrl: toStageRelativeAssetUrl(schoolNavmeshUrl),
  bitNavmeshUrl: toStageRelativeAssetUrl(schoolBitNavmeshUrl),
  roomVariantNavmesh: Object.freeze({
    mode: "required",
    url: toStageRelativeAssetUrl(schoolRoomVariantNavmeshUrl),
    sha256: "78a0f481aae3abd6a6e403c60fc0debc1c70941c8b7956f17e35006df10c3afd"
  })
});

type ValidationCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type T05ValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly ValidationCheck[];
}>;

declare global {
  interface Window {
    __T05_VALIDATION__: T05ValidationState;
  }
}

const browserErrors: string[] = [];
const browserWarnings: string[] = [];
const formatBrowserIssue = (value: unknown) =>
  value instanceof Error
    ? `${value.name}: ${value.message}`
    : String(value);
const failCompletedValidation = (detail: string): void => {
  if (document.documentElement.dataset.validationStatus !== "passed") {
    return;
  }
  const failedCheck = Object.freeze({
    name: "完了後ブラウザ異常監視",
    ok: false,
    detail
  });
  const checks = Object.freeze([
    ...window.__T05_VALIDATION__.checks,
    failedCheck
  ]);
  window.__T05_VALIDATION__ = Object.freeze({
    status: "failed",
    checks
  });
  document.documentElement.dataset.validationStatus = "failed";
  summary!.dataset.state = "failed";
  summary!.textContent =
    `${checks.filter((check) => check.ok).length} / ` +
    `${checks.length} 項目がPASSしました。`;
  renderChecks(checks);
};
window.addEventListener("error", (event) => {
  const detail = formatBrowserIssue(event.error ?? event.message);
  browserErrors.push(detail);
  failCompletedValidation(`error: ${detail}`);
});
window.addEventListener("unhandledrejection", (event) => {
  const detail =
    `unhandledrejection: ${formatBrowserIssue(event.reason)}`;
  browserErrors.push(detail);
  failCompletedValidation(detail);
});
const originalConsoleError = console.error.bind(console);
console.error = (...values: unknown[]) => {
  const detail = values.map(formatBrowserIssue).join(" ");
  browserErrors.push(detail);
  failCompletedValidation(`console.error: ${detail}`);
  originalConsoleError(...values);
};
const originalConsoleWarn = console.warn.bind(console);
console.warn = (...values: unknown[]) => {
  const detail = values.map(formatBrowserIssue).join(" ");
  browserWarnings.push(detail);
  failCompletedValidation(`console.warn: ${detail}`);
  originalConsoleWarn(...values);
};

const canvas = document.getElementById(
  "render-canvas"
) as unknown as HTMLCanvasElement;
const summary = document.querySelector<HTMLElement>("#summary");
const metrics = document.querySelector<HTMLDListElement>("#metrics");
const checkResults =
  document.querySelector<HTMLOListElement>("#check-results");
const runButton =
  document.querySelector<HTMLButtonElement>("#run-validation");

if (!canvas || !summary || !metrics || !checkResults || !runButton) {
  throw new Error("T05検証UIの必須要素がありません。");
}

const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
scene.clearColor.set(0.025, 0.055, 0.085, 1);

const camera = new ArcRotateCamera(
  "T05Camera",
  -Math.PI / 2.5,
  Math.PI / 2.8,
  13,
  new Vector3(0, 2.5, 0),
  scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 5;
camera.upperRadiusLimit = 24;

const light = new HemisphericLight(
  "T05Light",
  new Vector3(0.4, 1, -0.2),
  scene
);
light.intensity = 0.92;

const exteriorZoneId = toBitFlightZoneId("open-courtyard");
const atriumZoneId = toBitFlightZoneId("civic-atrium");
const depthsZoneId = toBitFlightZoneId("service-depths");

const courtyardBandId = toBitFlightBandId("courtyard-air");
const concourseBandId = toBitFlightBandId("concourse");
const mezzanineBandId = toBitFlightBandId("mezzanine-deck");
const galleryBandId = toBitFlightBandId("upper-gallery");
const passageBandId = toBitFlightBandId("subterranean-passage");

const courtyardRef = createBitFlightBandRef(
  exteriorZoneId,
  courtyardBandId
);
const concourseRef = createBitFlightBandRef(atriumZoneId, concourseBandId);
const mezzanineRef = createBitFlightBandRef(atriumZoneId, mezzanineBandId);
const galleryRef = createBitFlightBandRef(atriumZoneId, galleryBandId);
const passageRef = createBitFlightBandRef(depthsZoneId, passageBandId);

const createBandKey = (ref: BitFlightBandRef) =>
  JSON.stringify([ref.zoneId, ref.bandId]);

const zones: readonly BitFlightZone[] = Object.freeze([
  Object.freeze({ id: exteriorZoneId, spaceKind: "outdoor" }),
  Object.freeze({ id: atriumZoneId, spaceKind: "indoor" }),
  Object.freeze({ id: depthsZoneId, spaceKind: "indoor" })
]);

const bands: readonly BitFlightBand[] = Object.freeze([
  Object.freeze({
    zoneId: exteriorZoneId,
    id: courtyardBandId,
    minimumCenterHeight: 1,
    maximumCenterHeight: 1.8
  }),
  Object.freeze({
    zoneId: atriumZoneId,
    id: concourseBandId,
    minimumCenterHeight: 1,
    maximumCenterHeight: 1.8
  }),
  Object.freeze({
    zoneId: atriumZoneId,
    id: mezzanineBandId,
    minimumCenterHeight: 3.35,
    maximumCenterHeight: 4.05
  }),
  Object.freeze({
    zoneId: atriumZoneId,
    id: galleryBandId,
    minimumCenterHeight: 6.65,
    maximumCenterHeight: 7.55
  }),
  Object.freeze({
    zoneId: depthsZoneId,
    id: passageBandId,
    minimumCenterHeight: -2,
    maximumCenterHeight: -1.2
  })
]);

const centerHeightByBand = new Map(
  bands.map((band) => [
    createBandKey({ zoneId: band.zoneId, bandId: band.id }),
    (band.minimumCenterHeight + band.maximumCenterHeight) / 2
  ])
);

const pointInBand = (
  ref: BitFlightBandRef,
  x: number,
  z: number
): Vector3 => {
  const centerHeight = centerHeightByBand.get(createBandKey(ref));
  if (centerHeight === undefined) {
    throw new Error(`fixtureの飛行帯がありません: ${ref.zoneId}/${ref.bandId}`);
  }
  return new Vector3(x, centerHeight, z);
};

const createAabbTransitionRegion = (
  minimum: Vector3,
  maximum: Vector3
) => {
  const contains = (point: Vector3) =>
    point.x >= minimum.x &&
    point.x <= maximum.x &&
    point.y >= minimum.y &&
    point.y <= maximum.y &&
    point.z >= minimum.z &&
    point.z <= maximum.z;
  return Object.freeze({
    minimum,
    maximum,
    contains,
    containsSegment: (from: Vector3, to: Vector3) =>
      contains(from) && contains(to)
  });
};

const transitions: readonly BitFlightTransitionDefinition[] = Object.freeze([
  Object.freeze({
    id: "courtyard-opening",
    kind: "aperture",
    from: courtyardRef,
    to: concourseRef,
    bidirectional: true,
    affordances: Object.freeze(["indoor-access", "outdoor-access"] as const),
    fromPosition: pointInBand(courtyardRef, -1.8, 0),
    toPosition: pointInBand(concourseRef, -1.8, 0),
    traversalPoints: Object.freeze([]),
    region: null,
    projectionDistance: 0.35
  }),
  Object.freeze({
    id: "atrium-lift-volume",
    kind: "vertical",
    from: concourseRef,
    to: mezzanineRef,
    bidirectional: true,
    affordances: Object.freeze(["search-vantage"] as const),
    fromPosition: pointInBand(concourseRef, 0, 0),
    toPosition: pointInBand(mezzanineRef, 0, 0),
    traversalPoints: Object.freeze([
      new Vector3(0, 2.4, 0),
      new Vector3(0, 3.2, 0)
    ]),
    region: createAabbTransitionRegion(
      new Vector3(-0.8, -1.2, -0.8),
      new Vector3(0.8, 4.2, 0.8)
    ),
    projectionDistance: 0.35
  }),
  Object.freeze({
    id: "gallery-ramp",
    kind: "surface-route",
    from: mezzanineRef,
    to: galleryRef,
    bidirectional: true,
    affordances: Object.freeze(["stair-route", "search-vantage"] as const),
    fromPosition: pointInBand(mezzanineRef, 1.5, 0.8),
    toPosition: pointInBand(galleryRef, 1.5, -0.8),
    traversalPoints: Object.freeze([
      new Vector3(1.5, 4.8, 0.4),
      new Vector3(1.5, 5.8, -0.2)
    ]),
    region: createAabbTransitionRegion(
      new Vector3(1.0, 3.3, -1.0),
      new Vector3(2.0, 7.6, 1.0)
    ),
    projectionDistance: 0.35
  }),
  Object.freeze({
    id: "service-drop",
    kind: "boundary",
    from: passageRef,
    to: concourseRef,
    bidirectional: false,
    affordances: Object.freeze(["indoor-access"] as const),
    fromPosition: pointInBand(passageRef, -1.2, -1.2),
    toPosition: pointInBand(concourseRef, -1.2, -1.2),
    traversalPoints: Object.freeze([new Vector3(-1.2, 0, -1.2)]),
    region: createAabbTransitionRegion(
      new Vector3(-1.6, -2.0, -1.6),
      new Vector3(-0.8, 1.8, -0.8)
    ),
    projectionDistance: 0.35
  })
]);

const definition: BitFlightNavigationDefinition = Object.freeze({
  zones,
  bands,
  transitions
});

const navParameters = Object.freeze({
  cs: 0.05,
  ch: 0.025,
  walkableSlopeAngle: 45,
  walkableHeight: 18,
  walkableClimb: 2,
  walkableRadius: 2,
  maxEdgeLen: 24,
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1
});

const createPlaneGeometry = (height: number) => ({
  positions: [
    -3, height, -3,
    3, height, -3,
    3, height, 3,
    -3, height, 3
  ],
  indices: [0, 3, 2, 0, 2, 1]
});

const bakePayload = (
  band: BitFlightBand
): BitFlightNavMeshPayload => {
  const ref = createBitFlightBandRef(band.zoneId, band.id);
  const centerHeight = centerHeightByBand.get(createBandKey(ref));
  if (centerHeight === undefined) {
    throw new Error(`fixtureの中心高度がありません: ${band.zoneId}/${band.id}`);
  }
  const geometry = createPlaneGeometry(centerHeight);
  const result = generateSoloNavMesh(
    geometry.positions,
    geometry.indices,
    navParameters
  );
  if (!result.success) {
    throw new Error(result.error);
  }
  try {
    return Object.freeze({
      zoneId: band.zoneId,
      bandId: band.id,
      data: exportNavMesh(result.navMesh)
    });
  } finally {
    result.navMesh.destroy();
  }
};

const projectRequired = (
  world: BitFlightNavigationWorld,
  ref: BitFlightBandRef,
  x: number,
  z: number
) => {
  const location = world.projectPointInBand(
    ref,
    pointInBand(ref, x, z),
    0.35
  );
  if (!location) {
    throw new Error(`fixture位置を投影できません: ${ref.zoneId}/${ref.bandId}`);
  }
  return location;
};

const transitionIds = (
  world: BitFlightNavigationWorld,
  from: BitFlightBandRef,
  to: BitFlightBandRef
) => {
  const route = world.findRoute(
    projectRequired(world, from, -2.3, 1.5),
    projectRequired(world, to, 2.3, -1.5),
    BIT_FLIGHT_SHORTEST_ROUTE_POLICY
  );
  return route
    ? route.steps.flatMap((step) =>
        step.kind === "transition" ? [step.traversal.transition.id] : []
      )
    : null;
};

const captureRejectedMessage = async (operation: () => Promise<unknown>) => {
  try {
    await operation();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const captureThrownMessage = (operation: () => unknown) => {
  try {
    operation();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const renderChecks = (checks: readonly ValidationCheck[]) => {
  checkResults.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.dataset.ok = String(check.ok);
      const title = document.createElement("strong");
      title.textContent = `${check.ok ? "PASS" : "FAIL"}: ${check.name}`;
      const detail = document.createElement("span");
      detail.textContent = check.detail;
      item.append(title, detail);
      return item;
    })
  );
};

const setMetric = (label: string, value: string) => {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  metrics.append(term, description);
};

const layerColors = [
  new Color3(0.18, 0.55, 0.95),
  new Color3(0.18, 0.85, 0.6),
  new Color3(0.95, 0.72, 0.18),
  new Color3(0.86, 0.35, 0.82),
  new Color3(0.42, 0.5, 0.65)
];

bands.forEach((band, index) => {
  const centerHeight =
    (band.minimumCenterHeight + band.maximumCenterHeight) / 2;
  const layer = MeshBuilder.CreateGround(
    `FixtureBand_${band.zoneId}_${band.id}`,
    { width: 5.6, height: 5.6 },
    scene
  );
  layer.position.y = centerHeight - 0.025;
  const material = new StandardMaterial(
    `FixtureBandMaterial_${index}`,
    scene
  );
  material.diffuseColor = layerColors[index];
  material.emissiveColor = layerColors[index].scale(0.18);
  material.alpha = 0.18;
  material.backFaceCulling = false;
  layer.material = material;
});

transitions.forEach((transition, index) => {
  const points = [
    transition.fromPosition,
    ...transition.traversalPoints,
    transition.toPosition
  ];
  const line = MeshBuilder.CreateLines(
    `FixtureTransition_${transition.id}`,
    { points },
    scene
  );
  line.color = layerColors[index % layerColors.length];
});

const showcaseWorldMesh = MeshBuilder.CreateBox(
  "T05V_Showcase_WorldBoundary",
  { size: 8 },
  scene
);
showcaseWorldMesh.position.y = 2.5;
showcaseWorldMesh.isVisible = false;
showcaseWorldMesh.computeWorldMatrix(true);
const showcaseStageBoundaryMesh = MeshBuilder.CreateBox(
  "T05V_Showcase_StageBoundary",
  { size: 7 },
  scene
);
showcaseStageBoundaryMesh.position.y = 2.5;
showcaseStageBoundaryMesh.isVisible = false;
showcaseStageBoundaryMesh.computeWorldMatrix(true);
const showcaseBlocker = MeshBuilder.CreateBox(
  "T05V_Showcase_Blocker",
  { width: 0.15, height: 1.4, depth: 1.2 },
  scene
);
showcaseBlocker.position.set(0, 2.5, -2);
showcaseBlocker.computeWorldMatrix(true);
const showcaseBlockerMaterial = new StandardMaterial(
  "T05V_Showcase_BlockerMaterial",
  scene
);
showcaseBlockerMaterial.diffuseColor.set(0.08, 0.24, 0.32);
showcaseBlockerMaterial.emissiveColor.set(0.03, 0.18, 0.25);
showcaseBlocker.material = showcaseBlockerMaterial;
const showcaseWorldBoundary = createStageWorldBoundary(
  showcaseWorldMesh,
  showcaseStageBoundaryMesh
);
const showcaseMovementColliders = Object.freeze({
  player: Object.freeze([showcaseBlocker]),
  npc: Object.freeze([showcaseBlocker]),
  bit: Object.freeze([showcaseBlocker])
});
const showcaseSpatial = createDynamicStageSpatialQueryFixture(
  scene,
  {
    movementColliders: showcaseMovementColliders,
    groundColliders: Object.freeze([]),
    beamBlockers: Object.freeze([showcaseBlocker]),
    sightBlockers: Object.freeze([showcaseBlocker]),
    bitObstacles: showcaseMovementColliders.bit
  },
  { volumes: Object.freeze([]) }
);
const showcaseQueries = showcaseSpatial.queries;
const showcaseStage = Object.freeze({
  resources: Object.freeze({
    beamBlockers: Object.freeze([showcaseBlocker]),
    sightBlockers: Object.freeze([showcaseBlocker])
  }),
  worldBoundary: showcaseWorldBoundary,
  dynamicVariants: showcaseSpatial.dynamicVariants,
  queries: showcaseQueries
}) as unknown as StageSpatialContext;
let showcaseRandomState = 0xa511e9b3;
const showcaseRandom = () => {
  showcaseRandomState =
    (Math.imul(showcaseRandomState, 1664525) + 1013904223) >>> 0;
  return showcaseRandomState / 0x1_0000_0000;
};
const showcaseBeamSystem = createV2BeamSystem({
  scene,
  stage: showcaseStage,
  getHumanTargets: () => Object.freeze([]),
  random: showcaseRandom,
  getOrbVisibilityPredicate: () => () => true
});
const showcaseHitEffectSystem = createV2HitEffectSystem({
  scene,
  random: showcaseRandom,
  isIndirectLightVisible: () => true
});
const showcaseTarget: V2HumanTargetSnapshot = Object.freeze({
  id: "t05v-showcase-target",
  kind: "player",
  footPosition: new Vector3(-1.25, 2.05, 0),
  aimPosition: new Vector3(-1.25, 2.5, 0),
  hitShape: Object.freeze({
    center: new Vector3(-1.25, 2.5, 0),
    radii: new Vector3(0.1, 0.24, 0.1)
  }),
  state: "hit-a",
  alive: false,
  brainwashed: false
});
const showcaseOriginKinds = Object.freeze([
  "bit-chase",
  "bit-fixed",
  "bit-random",
  "bit-carpet",
  "npc-gun",
  "player-gun",
  "execution-bit",
  "execution-npc",
  "execution-player"
] as const);
let showcaseOriginIndex = 0;
let showcaseBoundaryCooldownSeconds = 0;
let showcaseBlockerCooldownSeconds = 0.45;
let showcaseHitCooldownSeconds = 0;
let showcaseActive = false;
let showcasePreparation: Promise<void> | null = null;
const prepareShowcase = () => {
  showcasePreparation ??= Promise.all([
    showcaseBeamSystem.prepareVisualResources(),
    showcaseHitEffectSystem.prepareVisualResources()
  ]).then(() => {});
  return showcasePreparation;
};
const showcaseObserver = scene.onBeforeRenderObservable.add(() => {
  if (!showcaseActive) {
    return;
  }
  const deltaSeconds = engine.getDeltaTime() / 1000;
  showcaseBoundaryCooldownSeconds -= deltaSeconds;
  showcaseBlockerCooldownSeconds -= deltaSeconds;
  showcaseHitCooldownSeconds -= deltaSeconds;
  if (showcaseBoundaryCooldownSeconds <= 0) {
    showcaseBeamSystem.spawn({
      sourceId: "t05v-boundary-showcase",
      originKind:
        showcaseOriginKinds[
          showcaseOriginIndex % showcaseOriginKinds.length
        ],
      targetPolicy: Object.freeze({ kind: "alive-humans" }),
      origin: new Vector3(-3.5, 3.1, 2),
      direction: Vector3.Right(),
      speed: 5,
      maximumLifetime: 10
    });
    showcaseOriginIndex += 1;
    showcaseBoundaryCooldownSeconds = 1.8;
  }
  if (showcaseBlockerCooldownSeconds <= 0) {
    showcaseBeamSystem.spawn({
      sourceId: "t05v-blocker-showcase",
      originKind: "npc-gun",
      targetPolicy: Object.freeze({ kind: "alive-humans" }),
      origin: new Vector3(-3.5, 2.5, -2),
      direction: Vector3.Right(),
      speed: 5,
      maximumLifetime: 10
    });
    showcaseBlockerCooldownSeconds = 1.15;
  }
  if (showcaseHitCooldownSeconds <= 0) {
    showcaseHitEffectSystem.start(showcaseTarget);
    showcaseHitCooldownSeconds = 4.2;
  }
  showcaseBeamSystem.update(deltaSeconds);
  showcaseHitEffectSystem.update(
    deltaSeconds,
    Object.freeze([showcaseTarget]),
    () => true
  );
});
let showcaseDisposed = false;
const disposeShowcase = () => {
  if (showcaseDisposed) {
    return;
  }
  scene.onBeforeRenderObservable.remove(showcaseObserver);
  showcaseHitEffectSystem.dispose();
  showcaseBeamSystem.dispose();
  showcaseSpatial.dispose();
  showcaseWorldBoundary.dispose();
  showcaseBlocker.dispose(false, false);
  showcaseStageBoundaryMesh.dispose(false, false);
  showcaseWorldMesh.dispose(false, false);
  showcaseBlockerMaterial.dispose();
  showcaseDisposed = true;
};

let activeWorld: BitFlightNavigationWorld | null = null;
let validationRunning = false;
let validationHasRun = false;

const disposeActiveWorld = () => {
  activeWorld?.dispose();
  activeWorld = null;
};

const runValidation = async () => {
  if (validationRunning) {
    return;
  }
  validationRunning = true;
  if (validationHasRun) {
    browserErrors.length = 0;
    browserWarnings.length = 0;
  }
  validationHasRun = true;
  const loggerErrorsAtStart = Logger.errorsCount;
  runButton.disabled = true;
  summary.dataset.state = "running";
  summary.textContent = "非学校fixtureを生成して検証しています。";
  document.documentElement.dataset.validationStatus = "running";
  window.__T05_VALIDATION__ = Object.freeze({
    status: "running",
    checks: Object.freeze([])
  });
  metrics.replaceChildren();
  checkResults.replaceChildren();
  disposeActiveWorld();
  showcaseActive = false;
  showcaseBeamSystem.clear();
  showcaseHitEffectSystem.clear();

  const checks: ValidationCheck[] = [];
  const temporaryWorlds: BitFlightNavigationWorld[] = [];
  try {
    const initializationStartedAt = performance.now();
    await initializeNavigationRuntime();
    const initializationMs = performance.now() - initializationStartedAt;

    const bakeStartedAt = performance.now();
    const bakedPayloads = bands.map(bakePayload);
    const bakeMs = performance.now() - bakeStartedAt;
    const bundle = encodeBitFlightNavBundle(
      bakedPayloads.map((payload) => ({
        zoneId: payload.zoneId,
        bandId: payload.bandId,
        data: payload.data
      }))
    );
    const decodedPayloads = decodeBitFlightNavBundle(bundle).map((entry) => ({
      zoneId: toBitFlightZoneId(entry.zoneId),
      bandId: toBitFlightBandId(entry.bandId),
      data: entry.data
    }));
    activeWorld = await createBitFlightNavigationWorld(
      definition,
      decodedPayloads
    );
    activeWorld.createDebugMeshes(scene);

    const spawnVolumeMesh = MeshBuilder.CreateBox(
      "FixtureBitSpawn",
      { width: 5, height: 0.8, depth: 5 },
      scene
    );
    spawnVolumeMesh.position.y = 1.4;
    spawnVolumeMesh.computeWorldMatrix(true);
    const spawnVolume: StageVolume = Object.freeze({
      id: "fixture-bit-spawn",
      role: "bit_spawn",
      bitFlightBand: courtyardRef,
      mesh: spawnVolumeMesh
    });
    const runtimeStage = Object.freeze({
      bitNavigation: activeWorld,
      volumes: Object.freeze({
        all: Object.freeze([spawnVolume]),
        getById: (id: string) => (id === spawnVolume.id ? spawnVolume : null),
        getByRole: (role: StageVolume["role"]) =>
          role === "bit_spawn"
            ? Object.freeze([spawnVolume])
            : Object.freeze([])
      }),
      worldBoundary: null,
      queries: Object.freeze({
        castMovementSegment: () => null,
        castMovementSphere: () => null,
        castBeamSegment: () => null,
        castSightSegment: () => null,
        sampleGround: () => null,
        containsVolume: () => false,
        dispose: () => {}
      })
    }) as unknown as StageSpatialContext;
    let randomState = 0x6d2b79f5;
    const runtimeRandom = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 0x1_0000_0000;
    };
    const bitSystem = createV2BitSystem(scene, runtimeStage, {
      combatEnabled: false,
      initialBitCount: 99,
      minimumSpawnDistance: 0.08,
      spawnMaxAttempts: 1024,
      spawnProjectionMaxDistance: 0.75,
      random: runtimeRandom
    });
    try {
      const initialActors =
        bitSystem.getFrameView().actorSpheres;
      let previousFlightStates = new Map(
        bitSystem
          .getFrameView()
          .flightStates.map(
            (state) => [state.bitId, state] as const
          )
      );
      let observedVerticalSearch = false;
      let observedDiagonalSearch = false;
      let verticalSearchStayedWithinSpeed = true;
      let maximumVerticalSearchDelta = 0;
      const verticalSearchStepLimit = 0.06 * 0.1 + 1e-6;
      for (let frameIndex = 0; frameIndex < 30; frameIndex += 1) {
        bitSystem.update({
          deltaSeconds: 0.1,
          elapsedSeconds: frameIndex * 0.1,
          targets: Object.freeze([]),
          externalAlerts: Object.freeze([])
        });
        const currentFlightStates =
          bitSystem.getFrameView().flightStates;
        for (const state of currentFlightStates) {
          const previous = previousFlightStates.get(state.bitId);
          if (
            !previous ||
            previous.zoneId === null ||
            previous.bandId === null ||
            state.zoneId !== previous.zoneId ||
            state.bandId !== previous.bandId ||
            state.safeCenterHeight === null ||
            previous.safeCenterHeight === null ||
            state.routePurpose !== "search"
          ) {
            continue;
          }
          const verticalDelta = Math.abs(
            state.safeCenterHeight - previous.safeCenterHeight
          );
          const horizontalDelta = Math.hypot(
            state.position.x - previous.position.x,
            state.position.z - previous.position.z
          );
          if (verticalDelta <= 1e-6) {
            continue;
          }
          if (horizontalDelta <= 1e-6) {
            observedVerticalSearch = true;
            maximumVerticalSearchDelta = Math.max(
              maximumVerticalSearchDelta,
              verticalDelta
            );
            verticalSearchStayedWithinSpeed =
              verticalSearchStayedWithinSpeed &&
              verticalDelta <= verticalSearchStepLimit;
          } else {
            observedDiagonalSearch = true;
          }
        }
        previousFlightStates = new Map(
          currentFlightStates.map((state) => [state.bitId, state] as const)
        );
      }
      const performanceSamples: number[] = [];
      for (let frameIndex = 0; frameIndex < 300; frameIndex += 1) {
        const startedAt = performance.now();
        bitSystem.update({
          deltaSeconds: 0.1,
          elapsedSeconds: 3 + frameIndex * 0.1,
          targets: Object.freeze([]),
          externalAlerts: Object.freeze([])
        });
        performanceSamples.push(performance.now() - startedAt);
      }
      const sortedPerformanceSamples = [...performanceSamples].sort(
        (left, right) => left - right
      );
      const percentile = (ratio: number) =>
        sortedPerformanceSamples[
          Math.max(
            0,
            Math.ceil(sortedPerformanceSamples.length * ratio) - 1
          )
        ];
      const performanceP50 = percentile(0.5);
      const performanceP95 = percentile(0.95);
      const performanceMaximum = Math.max(...performanceSamples);
      const updatedActors =
        bitSystem.getFrameView().actorSpheres;
      checks.push({
        name: "人間用NavMeshなしの99体探索を30+300 tick計測",
        ok:
          initialActors.length === 99 &&
          updatedActors.length === 99 &&
          performanceSamples.length === 300 &&
          performanceSamples.every(
            (sample) => Number.isFinite(sample) && sample >= 0
          ) &&
          updatedActors.every(
            (actor) =>
              Number.isFinite(actor.center.x) &&
              Number.isFinite(actor.center.y) &&
              Number.isFinite(actor.center.z)
          ),
        detail:
          `warmup=30 / measured=${performanceSamples.length} / ` +
          `initial=${initialActors.length} / updated=${updatedActors.length} / ` +
          `p50=${performanceP50.toFixed(3)}ms / ` +
          `p95=${performanceP95.toFixed(3)}ms / ` +
          `max=${performanceMaximum.toFixed(3)}ms`
      });
      setMetric(
        "99体探索 update",
        `p50 ${performanceP50.toFixed(3)} / ` +
          `p95 ${performanceP95.toFixed(3)} / ` +
          `max ${performanceMaximum.toFixed(3)} ms`
      );
      checks.push({
        name: "99体探索で上下・斜め移動を実行し純verticalを0.06に制限",
        ok:
          observedVerticalSearch &&
          observedDiagonalSearch &&
          verticalSearchStayedWithinSpeed,
        detail:
          `vertical=${observedVerticalSearch} / ` +
          `diagonal=${observedDiagonalSearch} / ` +
          `maxVerticalDelta=${maximumVerticalSearchDelta.toFixed(6)} / ` +
          `limit=${verticalSearchStepLimit.toFixed(6)}`
      });
    } finally {
      bitSystem.dispose();
      spawnVolumeMesh.dispose(false, false);
    }

    const transitionSpawnMesh = MeshBuilder.CreateBox(
      "FixtureTransitionBitSpawn",
      { width: 0.04, height: 0.1, depth: 0.04 },
      scene
    );
    transitionSpawnMesh.position.copyFrom(pointInBand(concourseRef, 0, 0));
    transitionSpawnMesh.computeWorldMatrix(true);
    const transitionSpawnVolume: StageVolume = Object.freeze({
      id: "fixture-transition-bit-spawn",
      role: "bit_spawn",
      bitFlightBand: concourseRef,
      mesh: transitionSpawnMesh
    });
    const transitionRuntimeStage = Object.freeze({
      bitNavigation: activeWorld,
      volumes: Object.freeze({
        all: Object.freeze([transitionSpawnVolume]),
        getById: (id: string) =>
          id === transitionSpawnVolume.id ? transitionSpawnVolume : null,
        getByRole: (role: StageVolume["role"]) =>
          role === "bit_spawn"
            ? Object.freeze([transitionSpawnVolume])
            : Object.freeze([])
      }),
      worldBoundary: null,
      queries: Object.freeze({
        castMovementSegment: () => null,
        castMovementSphere: () => null,
        castBeamSegment: () => null,
        castSightSegment: () => Object.freeze({ blocked: true }),
        sampleGround: () => null,
        containsVolume: () => false,
        dispose: () => {}
      })
    }) as unknown as StageSpatialContext;
    const transitionBitSystem = createV2BitSystem(
      scene,
      transitionRuntimeStage,
      {
        combatEnabled: false,
        initialBitCount: 1,
        minimumSpawnDistance: 0,
        spawnMaxAttempts: 8,
        spawnProjectionMaxDistance: 0.35,
        random: () => 0.5
      }
    );
    try {
      const target = Object.freeze({
        id: "fixture-transition-target",
        kind: "npc" as const,
        footPosition: new Vector3(0, 3.35, 0),
        aimPosition: pointInBand(mezzanineRef, 0, 0),
        hitShape: Object.freeze({
          center: pointInBand(mezzanineRef, 0, 0),
          radii: new Vector3(0.1, 0.2, 0.1)
        }),
        state: "normal" as const,
        alive: true,
        brainwashed: false
      });
      const alert = Object.freeze({
        leaderId: "fixture-external-leader",
        targetId: target.id,
        remainingSeconds: 2
      });
      transitionBitSystem.update({
        deltaSeconds: 0,
        elapsedSeconds: 0,
        targets: Object.freeze([target]),
        externalAlerts: Object.freeze([alert])
      });
      transitionBitSystem.update({
        deltaSeconds: 1,
        elapsedSeconds: 1,
        targets: Object.freeze([target]),
        externalAlerts: Object.freeze([])
      });
      const activeTransitionState =
        transitionBitSystem.getFrameView().flightStates[0];
      transitionBitSystem.update({
        deltaSeconds: 0.1,
        elapsedSeconds: 1.1,
        targets: Object.freeze([]),
        externalAlerts: Object.freeze([])
      });
      const clearingState =
        transitionBitSystem.getFrameView().flightStates[0];
      const clearedTargetState =
        transitionBitSystem.getFrameView().targetStates[0];
      const clearMovement = Vector3.Distance(
        activeTransitionState.position,
        clearingState.position
      );
      const maximumClearMovement =
        BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND * 0.1 +
        1e-6;
      checks.push({
        name: "遷移中の標的喪失は近い遷移端へ1m/sで安全離脱",
        ok:
          activeTransitionState.agentState === "transition" &&
          activeTransitionState.activeTransition?.id ===
            "atrium-lift-volume" &&
          activeTransitionState.zoneId === null &&
          clearingState.agentState === "clearing-transition" &&
          clearingState.activeTransition?.id ===
            "atrium-lift-volume" &&
          clearingState.routePurpose === "escape" &&
          clearedTargetState.targetId === null &&
          clearMovement > 0 &&
          clearMovement <= maximumClearMovement,
        detail:
          `before=${activeTransitionState.agentState} / ` +
          `after=${clearingState.agentState} / ` +
          `move=${clearMovement.toFixed(4)} / ` +
          `max=${maximumClearMovement.toFixed(4)}`
      });
    } finally {
      transitionBitSystem.dispose();
      transitionSpawnMesh.dispose(false, false);
    }

    checks.push({
      name: "不均一高度・opaque ID・bundle往復",
      ok:
        decodedPayloads.length === bands.length &&
        activeWorld.zones.length === 3 &&
        activeWorld.bands.length === 5 &&
        bands.every((band) => !/\d/.test(band.id)),
      detail: `${activeWorld.zones.length} zones / ${activeWorld.bands.length} bands / ${bundle.byteLength} bytes`
    });

    const completeRouteIds = transitionIds(
      activeWorld,
      courtyardRef,
      galleryRef
    );
    checks.push({
      name: "屋内外開口・吹き抜け上下・surface-route完全経路",
      ok:
        completeRouteIds?.join("|") ===
        "courtyard-opening|atrium-lift-volume|gallery-ramp",
      detail: completeRouteIds?.join(" > ") ?? "経路なし"
    });
    const transitionCost = 2.5;
    const weightedRoute = activeWorld.findRoute(
      projectRequired(activeWorld, courtyardRef, -2.3, 1.5),
      projectRequired(activeWorld, galleryRef, 2.3, -1.5),
      Object.freeze({
        ...BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
        additionalTransitionCost: () => transitionCost
      })
    );
    const weightedTransitionCount =
      weightedRoute?.steps.filter((step) => step.kind === "transition")
        .length ?? 0;
    checks.push({
      name: "経路探索時のpolicy込み確定コストを純距離と分離して保持",
      ok:
        weightedRoute !== null &&
        weightedTransitionCount > 0 &&
        Math.abs(
          weightedRoute.totalCost -
            (weightedRoute.distance +
              weightedTransitionCount * transitionCost)
        ) <= 1e-6,
      detail:
        `distance=${weightedRoute?.distance.toFixed(3) ?? "none"} / ` +
        `total=${weightedRoute?.totalCost.toFixed(3) ?? "none"} / ` +
        `transitions=${weightedTransitionCount}`
    });

    const verticalTransition = activeWorld.transitions.find(
      (transition) => transition.id === "atrium-lift-volume"
    );
    checks.push({
      name: "連続遷移Volumeの候補領域を保持",
      ok:
        verticalTransition?.region !== null &&
        verticalTransition?.region.minimum.x === -0.8 &&
        verticalTransition.region.maximum.x === 0.8,
      detail: verticalTransition?.region
        ? `${verticalTransition.region.minimum.toString()} .. ${verticalTransition.region.maximum.toString()}`
        : "領域なし"
    });

    const offCenterStart = projectRequired(
      activeWorld,
      concourseRef,
      0.7,
      0.6
    );
    const offCenterDestination = projectRequired(
      activeWorld,
      mezzanineRef,
      0.7,
      0.6
    );
    const offCenterTraversal = activeWorld
      .getTransitionsFrom(concourseRef)
      .find(
        (traversal) =>
          traversal.transition.id === "atrium-lift-volume" &&
          !traversal.reversed
      );
    let verticalSafetyCheckCount = 0;
    const offCenterRoute = offCenterTraversal
      ? activeWorld.findRouteThroughTransition(
          offCenterStart,
          offCenterTraversal,
          offCenterDestination,
          Object.freeze({
            canUseTransition:
              BIT_FLIGHT_SHORTEST_ROUTE_POLICY.canUseTransition,
            canUseRouteStep: (step) => {
              if (
                step.kind !== "transition" ||
                step.traversal.transition.id !== "atrium-lift-volume"
              ) {
                return true;
              }
              verticalSafetyCheckCount += 1;
              const region = step.traversal.transition.region!;
              return (
                Math.abs(step.entry.surface.position.x - 0.7) < 0.05 &&
                Math.abs(step.entry.surface.position.z - 0.6) < 0.05 &&
                step.points.every((point) => region.contains(point))
              );
            },
            additionalSurfaceCruiseHeights:
              BIT_FLIGHT_SHORTEST_ROUTE_POLICY.additionalSurfaceCruiseHeights,
            additionalTransitionCost:
              BIT_FLIGHT_SHORTEST_ROUTE_POLICY.additionalTransitionCost
          })
        )
      : null;
    const offCenterTransitionStep = offCenterRoute?.steps.find(
      (step) =>
        step.kind === "transition" &&
        step.traversal.transition.id === "atrium-lift-volume"
    );
    const offCenterEntry =
      offCenterTransitionStep?.kind === "transition"
        ? offCenterTransitionStep.entry.surface.position
        : null;
    const offCenterExit =
      offCenterTransitionStep?.kind === "transition"
        ? offCenterTransitionStep.exit.surface.position
        : null;
    const transitionRegion = verticalTransition?.region ?? null;
    const isInsideTransitionRegion = (
      position: Vector3 | null,
      safeCenterHeight: number
    ) =>
      position !== null &&
      transitionRegion !== null &&
      position.x >= transitionRegion.minimum.x &&
      position.x <= transitionRegion.maximum.x &&
      position.z >= transitionRegion.minimum.z &&
      position.z <= transitionRegion.maximum.z &&
      transitionRegion.contains(
        new Vector3(position.x, safeCenterHeight, position.z)
      );
    checks.push({
      name: "vertical遷移はVolume内の非固定候補を選択",
      ok:
        isInsideTransitionRegion(
          offCenterEntry,
          offCenterTransitionStep?.kind === "transition"
            ? offCenterTransitionStep.entry.safeCenterHeight
            : Number.NaN
        ) &&
        isInsideTransitionRegion(
          offCenterExit,
          offCenterTransitionStep?.kind === "transition"
            ? offCenterTransitionStep.exit.safeCenterHeight
            : Number.NaN
        ) &&
        Math.abs((offCenterEntry?.x ?? 0) - 0.7) < 0.05 &&
        Math.abs((offCenterEntry?.z ?? 0) - 0.6) < 0.05 &&
        Math.abs((offCenterExit?.x ?? 0) - 0.7) < 0.05 &&
        Math.abs((offCenterExit?.z ?? 0) - 0.6) < 0.05 &&
        verticalSafetyCheckCount > 0 &&
        offCenterRoute?.steps.filter(
          (step) => step.kind === "transition"
        ).length === 1 &&
        offCenterRoute.steps.every(
          (step) =>
            step.kind !== "transition" ||
            step.traversal.transition.id === "atrium-lift-volume"
        ),
      detail: `entry=${offCenterEntry?.toString() ?? "none"} / exit=${offCenterExit?.toString() ?? "none"} / safetyChecks=${verticalSafetyCheckCount}`
    });

    const sameBandStart = projectRequired(
      activeWorld,
      courtyardRef,
      -1,
      -1
    );
    const sameBandDestination = projectRequired(
      activeWorld,
      courtyardRef,
      1,
      1
    );
    const sameBandRoute = activeWorld.findSurfaceRoute(
      sameBandStart,
      sameBandDestination,
      BIT_FLIGHT_SHORTEST_ROUTE_POLICY
    );
    checks.push({
      name: "同帯専用経路は接続グラフの遷移を含まない",
      ok:
        sameBandRoute !== null &&
        sameBandRoute.steps.length > 0 &&
        sameBandRoute.steps.every((step) => step.kind === "surface"),
      detail:
        `steps=${sameBandRoute?.steps.length ?? 0} / ` +
        `transitions=${sameBandRoute?.steps.filter((step) => step.kind === "transition").length ?? 0}`
    });
    if (!sameBandRoute) {
      throw new Error("確定済み経路owner検証用の同帯経路がありません。");
    }
    const preparedRouteSafety: BitFlightSafety = {
      envelopeRadius: BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
      findMovementCollision: () => null,
      isCenterSafe: () => true,
      inspectVerticalClearance: () => {
        throw new Error("確定済み経路owner検証では高度照会を使用しません。");
      },
      selectBandCenterHeight: () => {
        throw new Error("確定済み経路owner検証では高度選択を使用しません。");
      },
      selectLowCeilingCenterHeight: () => {
        throw new Error("確定済み経路owner検証では低天井選択を使用しません。");
      },
      findLowCeilingCruiseHeights: () => Object.freeze([])
    };
    const preparedRouteAgent = createBitFlightAgent(
      activeWorld,
      preparedRouteSafety,
      { waypointTolerance: 0.01 }
    );
    const wrongStartAgent = createBitFlightAgent(
      activeWorld,
      preparedRouteSafety,
      { waypointTolerance: 0.01 }
    );
    const foreignPreparedWorld = await createBitFlightNavigationWorld(
      definition,
      decodedPayloads
    );
    temporaryWorlds.push(foreignPreparedWorld);
    const foreignStart = projectRequired(
      foreignPreparedWorld,
      courtyardRef,
      -1,
      -1
    );
    const foreignAgent = createBitFlightAgent(
      foreignPreparedWorld,
      preparedRouteSafety,
      { waypointTolerance: 0.01 }
    );
    try {
      const acceptedPreparedRoute = preparedRouteAgent.setPreparedRoute(
        sameBandStart,
        sameBandRoute,
        "verify"
      );
      const wrongStartMessage = captureThrownMessage(() =>
        wrongStartAgent.setPreparedRoute(
          sameBandDestination,
          sameBandRoute,
          "verify"
        )
      );
      const foreignWorldMessage = captureThrownMessage(() =>
        foreignAgent.setPreparedRoute(
          foreignStart,
          sameBandRoute,
          "verify"
        )
      );
      checks.push({
        name: "確定済み経路は同一World・同一起点だけが受理される",
        ok:
          acceptedPreparedRoute &&
          wrongStartMessage?.includes("同一起点") === true &&
          foreignWorldMessage !== null,
        detail:
          `accepted=${acceptedPreparedRoute} / ` +
          `wrongStart=${wrongStartMessage ?? "例外なし"} / ` +
          `foreign=${foreignWorldMessage ?? "例外なし"}`
      });
    } finally {
      foreignAgent.dispose();
      wrongStartAgent.dispose();
      preparedRouteAgent.dispose();
    }

    const lowerToUpperIds = transitionIds(
      activeWorld,
      concourseRef,
      galleryRef
    );
    checks.push({
      name: "明示接続のない帯間を直接短絡しない",
      ok:
        lowerToUpperIds?.join("|") ===
        "atrium-lift-volume|gallery-ramp",
      detail: lowerToUpperIds?.join(" > ") ?? "経路なし"
    });

    const serviceForward = transitionIds(
      activeWorld,
      passageRef,
      concourseRef
    );
    const serviceReverse = transitionIds(
      activeWorld,
      concourseRef,
      passageRef
    );
    checks.push({
      name: "片方向boundaryの逆走禁止",
      ok:
        serviceForward?.join("|") === "service-drop" &&
        serviceReverse === null,
      detail: `forward=${serviceForward?.join(" > ") ?? "none"} / reverse=${serviceReverse?.join(" > ") ?? "none"}`
    });

    const stackedLower = projectRequired(
      activeWorld,
      concourseRef,
      0.8,
      -0.8
    );
    const stackedUpper = projectRequired(
      activeWorld,
      galleryRef,
      0.8,
      -0.8
    );
    checks.push({
      name: "同一X/Zの多層NavMeshを帯IDで分離",
      ok:
        Math.abs(stackedLower.surface.position.x - stackedUpper.surface.position.x) <
          1e-6 &&
        Math.abs(stackedLower.surface.position.z - stackedUpper.surface.position.z) <
          1e-6 &&
        Math.abs(
          stackedLower.safeCenterHeight - stackedUpper.safeCenterHeight
        ) > 5,
      detail: `lower=${stackedLower.safeCenterHeight.toFixed(2)} / upper=${stackedUpper.safeCenterHeight.toFixed(2)}`
    });

    const stackedLowerBand = activeWorld.getBand(stackedLower)!;
    const lowCeilingHeight =
      stackedLowerBand.minimumCenterHeight - 0.1;
    const lowCeilingLocation = activeWorld.applyHeightSelection(
      stackedLower,
      Object.freeze({
        center: new Vector3(
          stackedLower.surface.position.x,
          lowCeilingHeight,
          stackedLower.surface.position.z
        ),
        heightMode: "low-ceiling"
      })
    );
    const lowCeilingMoved = activeWorld.constrainMovement(
      lowCeilingLocation,
      new Vector3(
        lowCeilingLocation.surface.position.x + 0.1,
        lowCeilingHeight,
        lowCeilingLocation.surface.position.z
      ),
      "low-ceiling"
    );
    const lowCeilingRoute = lowCeilingMoved
      ? activeWorld.findRoute(
          lowCeilingLocation,
          lowCeilingMoved,
          BIT_FLIGHT_SHORTEST_ROUTE_POLICY
        )
      : null;
    checks.push({
      name: "低天井許可位置をNavMesh拘束と経路で保持",
      ok:
        lowCeilingLocation.heightMode === "low-ceiling" &&
        lowCeilingMoved?.heightMode === "low-ceiling" &&
        lowCeilingMoved.safeCenterHeight === lowCeilingHeight &&
        lowCeilingRoute !== null &&
        lowCeilingRoute.steps.every(
          (step) =>
            step.kind !== "surface" ||
            step.points.every(
              (point) => point.heightMode === "low-ceiling"
            )
        ),
      detail: `mode=${lowCeilingLocation.heightMode} / moved=${lowCeilingMoved?.heightMode ?? "none"} / route=${lowCeilingRoute ? "yes" : "none"}`
    });

    const reorderedDefinition: BitFlightNavigationDefinition = Object.freeze({
      zones: Object.freeze([...zones].reverse()),
      bands: Object.freeze([...bands].reverse()),
      transitions: Object.freeze([...transitions].reverse())
    });
    const reorderedWorld = await createBitFlightNavigationWorld(
      reorderedDefinition,
      [...decodedPayloads].reverse()
    );
    temporaryWorlds.push(reorderedWorld);
    const reorderedIds = transitionIds(
      reorderedWorld,
      courtyardRef,
      galleryRef
    );
    checks.push({
      name: "配列順変更で接続結果が不変",
      ok: reorderedIds?.join("|") === completeRouteIds?.join("|"),
      detail: `original=${completeRouteIds?.join(" > ")} / reordered=${reorderedIds?.join(" > ")}`
    });
    const reorderedLower = projectRequired(
      reorderedWorld,
      concourseRef,
      0.8,
      -0.8
    );
    const foreignLocationMessage = captureThrownMessage(() =>
      reorderedWorld.findRoute(
        stackedLower,
        reorderedLower,
        BIT_FLIGHT_SHORTEST_ROUTE_POLICY
      )
    );
    const invalidHeight = Object.freeze({
      ...stackedLower,
      safeCenterHeight: Number.NaN
    });
    const activeNavigation = activeWorld;
    const invalidHeightMessage = captureThrownMessage(() =>
      activeNavigation.constrainMovement(
        invalidHeight,
        new Vector3(0.8, 0, -0.8),
        "band"
      )
    );
    checks.push({
      name: "別world位置・非有限高度を拒否",
      ok:
        foreignLocationMessage?.includes("この飛行帯ナビゲーション") === true &&
        invalidHeightMessage?.includes("有限値") === true,
      detail: `foreign=${foreignLocationMessage ?? "例外なし"} / height=${invalidHeightMessage ?? "例外なし"}`
    });

    const danglingDefinition: BitFlightNavigationDefinition = Object.freeze({
      zones,
      bands,
      transitions: Object.freeze([
        ...transitions,
        Object.freeze({
          ...transitions[0],
          id: "dangling",
          to: createBitFlightBandRef(
            atriumZoneId,
            toBitFlightBandId("missing-band")
          )
        })
      ])
    });
    const danglingMessage = await captureRejectedMessage(() =>
      createBitFlightNavigationWorld(danglingDefinition, decodedPayloads)
    );
    checks.push({
      name: "dangling from/to IDを読込失敗",
      ok: danglingMessage?.includes("未登録帯") === true,
      detail: danglingMessage ?? "例外なし"
    });

    const outsideVolumeRouteDefinition: BitFlightNavigationDefinition =
      Object.freeze({
        zones,
        bands,
        transitions: Object.freeze(
          transitions.map((transition) =>
            transition.id === "gallery-ramp"
              ? Object.freeze({
                  ...transition,
                  region: Object.freeze({
                    minimum: new Vector3(-10, -10, -10),
                    maximum: new Vector3(10, 10, 10),
                    contains: () => true,
                    containsSegment: () => false
                  })
                })
              : transition
          )
        )
      });
    const outsideVolumeRouteMessage = await captureRejectedMessage(() =>
      createBitFlightNavigationWorld(
        outsideVolumeRouteDefinition,
        decodedPayloads
      )
    );
    checks.push({
      name: "Volume外へ出るsurface-route線分を読込失敗",
      ok:
        outsideVolumeRouteMessage?.includes(
          "Volume遷移の基準経路"
        ) === true,
      detail: outsideVolumeRouteMessage ?? "例外なし"
    });

    const duplicateDefinition: BitFlightNavigationDefinition = Object.freeze({
      zones,
      bands: Object.freeze([...bands, bands[0]]),
      transitions
    });
    const duplicateDefinitionMessage = await captureRejectedMessage(() =>
      createBitFlightNavigationWorld(duplicateDefinition, decodedPayloads)
    );
    const duplicateBundleMessage = captureThrownMessage(() =>
      encodeBitFlightNavBundle([
        {
          zoneId: decodedPayloads[0].zoneId,
          bandId: decodedPayloads[0].bandId,
          data: decodedPayloads[0].data
        },
        {
          zoneId: decodedPayloads[0].zoneId,
          bandId: decodedPayloads[0].bandId,
          data: decodedPayloads[0].data
        }
      ])
    );
    checks.push({
      name: "重複帯・重複bundle entryを読込失敗",
      ok:
        duplicateDefinitionMessage?.includes("重複") === true &&
        duplicateBundleMessage?.includes("重複") === true,
      detail: `definition=${duplicateDefinitionMessage ?? "例外なし"} / bundle=${duplicateBundleMessage ?? "例外なし"}`
    });

    const missingMessage = await captureRejectedMessage(() =>
      createBitFlightNavigationWorld(definition, decodedPayloads.slice(1))
    );
    const extraMessage = await captureRejectedMessage(() =>
      createBitFlightNavigationWorld(definition, [
        ...decodedPayloads,
        {
          zoneId: toBitFlightZoneId("unknown-zone"),
          bandId: toBitFlightBandId("unknown-band"),
          data: decodedPayloads[0].data
        }
      ])
    );
    checks.push({
      name: "欠落・余分NavMesh payloadを読込失敗",
      ok:
        missingMessage?.includes("ありません") === true &&
        extraMessage?.includes("存在しない") === true,
      detail: `missing=${missingMessage ?? "例外なし"} / extra=${extraMessage ?? "例外なし"}`
    });

    const corruptBundle = bundle.slice();
    corruptBundle[0] ^= 0xff;
    const corruptBundleMessage = captureThrownMessage(() =>
      decodeBitFlightNavBundle(corruptBundle)
    );
    const corruptPayloadMessage = await captureRejectedMessage(() =>
      createBitFlightNavigationWorld(definition, [
        { ...decodedPayloads[0], data: Uint8Array.of(1, 2, 3) },
        ...decodedPayloads.slice(1)
      ])
    );
    checks.push({
      name: "破損bundle・破損NavMeshを読込失敗",
      ok:
        corruptBundleMessage?.includes("magic") === true &&
        corruptPayloadMessage !== null,
      detail: `bundle=${corruptBundleMessage ?? "例外なし"} / nav=${corruptPayloadMessage ?? "例外なし"}`
    });

    const disposableWorld = await createBitFlightNavigationWorld(
      definition,
      decodedPayloads
    );
    disposableWorld.dispose();
    const disposedMessage = captureThrownMessage(() =>
      disposableWorld.getZone(atriumZoneId)
    );
    checks.push({
      name: "dispose後の参照使用を拒否",
      ok: disposedMessage?.includes("破棄済み") === true,
      detail: disposedMessage ?? "例外なし"
    });

    const surfaceVariantResults =
      await runBitFlightSurfaceVariantTests();
    checks.push(
      ...surfaceVariantResults.map((result) => ({
        name: `T05-1B 高度別経路: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      }))
    );

    const bitSystemFixture: BitSystemAcceptanceFixture = Object.freeze({
      scene,
      navigation: activeWorld,
      definition,
      payloads: decodedPayloads,
      courtyardRef,
      concourseRef,
      mezzanineRef,
      pointInBand
    });
    const bitSystemAcceptance = await runBitSystemAcceptanceTests(
      bitSystemFixture,
      acceptanceMode
    );
    checks.push(...bitSystemAcceptance.checks);
    bitSystemAcceptance.metrics.forEach((metric) =>
      setMetric(metric.label, metric.value)
    );

    const runtimeLifecycleResults: ValidationCheck[] = [];
    if (acceptanceMode !== "core") {
      document.title = "T05学校受入: Survival lifecycle";
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      let lifecycleStage: StageSpatialContext | null = null;
      try {
        lifecycleStage = await loadStageSpatialContext(
          scene,
          SCHOOL_VALIDATION_STAGE,
          {
            roomVariantSelections:
              SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
          }
        );
        runtimeLifecycleResults.push(
          ...(await runSurvivalRuntimeLifecycleTests(
            scene,
            lifecycleStage
          )).map((result) => ({
            name: `T05-2 Survival lifecycle: ${result.name}`,
            ok: result.ok,
            detail: result.detail
          })),
          ...(await runPerformanceDiagnosticsLifecycleTests(
            engine,
            scene
          )).map((result) => ({
            name: `T05-2 計測 lifecycle: ${result.name}`,
            ok: result.ok,
            detail: result.detail
          }))
        );
      } catch (error) {
        runtimeLifecycleResults.push({
          name: "T05-2 Survival・計測 lifecycle統合",
          ok: false,
          detail:
            error instanceof Error
              ? error.stack ?? error.message
              : String(error)
        });
      } finally {
        lifecycleStage?.dispose();
      }
    }

    checks.push(
      ...runBitFlightSafetyTests().map((result) => ({
        name: `T05-1B 安全: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runBitFlightAgentTests().map((result) => ({
        name: `T05-1B 経路実行: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runBitFlightTacticsTests().map((result) => ({
        name: `T05-1B 探索・追跡・逃走: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      }))
    );

    const combatSystemResults = [
      ...runAlertCoordinatorTests().map((result) => ({
        name: `T05-2 Alert共有: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runAlarmSystemTests().map((result) => ({
        name: `T05-2 アラーム: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runAssemblyLayoutTests().map((result) => ({
        name: `T05-2 集合配置: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runBeamCombatTests().map((result) => ({
        name: `T05-2 光線: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runBitCombatProfileTests().map((result) => ({
        name: `T05-2 bit戦闘profile: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runBitCombatIntegrationTests(bitSystemFixture).map((result) => ({
        name: `T05-2 bit戦闘統合: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runCharacterStateSystemTests().map((result) => ({
        name: `T05-2 キャラクター状態: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runHitEffectSystemTests().map((result) => ({
        name: `T05-2 命中演出: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runWorldBoundaryTests().map((result) => ({
        name: `T05-2V 世界境界: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runNpcCombatTests().map((result) => ({
        name: `T05-2 NPC戦闘: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runPerformanceScenarioTests().map((result) => ({
        name: `T05-2 性能シナリオ: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runPublicExecutionSystemTests().map((result) => ({
        name: `T05-2 公開処刑: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runSurvivalRulesTests().map((result) => ({
        name: `T05-2 survival統合契約: ${result.name}`,
        ok: result.ok,
        detail: result.detail
      })),
      ...runtimeLifecycleResults
    ];
    checks.push(...combatSystemResults);

    setMetric("Recast初期化", `${initializationMs.toFixed(2)} ms`);
    setMetric("5帯ベイク", `${bakeMs.toFixed(2)} ms`);
    setMetric("bundle", `${bundle.byteLength} bytes`);
    setMetric("fixture", "3 zones / 5 bands / 4 transitions");
    setMetric("T05-2単体検証", `${combatSystemResults.length} 項目`);
  } catch (error) {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push({ name: "検証処理", ok: false, detail: message });
  } finally {
    temporaryWorlds.forEach((world) => world.dispose());
    let showcaseReady = false;
    try {
      await prepareShowcase();
      await scene.whenReadyAsync(true);
      showcaseReady = true;
    } catch (error) {
      checks.push({
        name: "描画準備・完了確認",
        ok: false,
        detail:
          error instanceof Error
            ? error.stack ?? error.message
            : String(error)
      });
    }
    const loggerErrorCount =
      Logger.errorsCount - loggerErrorsAtStart;
    checks.push({
      name: "ブラウザ・console・Babylon異常監視",
      ok:
        browserErrors.length === 0 &&
        browserWarnings.length === 0 &&
        loggerErrorCount === 0,
      detail:
        `Babylon Logger=${loggerErrorCount} / ` +
        `errors=${browserErrors.join(" | ") || "なし"} / ` +
        `warnings=${browserWarnings.join(" | ") || "なし"}`
    });
    renderChecks(checks);
    const passed = checks.filter((check) => check.ok).length;
    const status =
      passed === checks.length ? "passed" : "failed";
    summary.dataset.state = status;
    summary.textContent = `${passed} / ${checks.length} 項目がPASSしました。`;
    document.documentElement.dataset.validationStatus = status;
    window.__T05_VALIDATION__ = Object.freeze({
      status,
      checks: Object.freeze([...checks])
    });
    showcaseRandomState = 0xa511e9b3;
    showcaseOriginIndex = 0;
    showcaseBoundaryCooldownSeconds = 0;
    showcaseBlockerCooldownSeconds = 0.45;
    showcaseHitCooldownSeconds = 0;
    showcaseActive = showcaseReady;
    if (requestedValidationProbe === "post-completion-warning") {
      console.warn("T05完了後console監視probe");
    }
    validationRunning = false;
    runButton.disabled = false;
  }
};

runButton.addEventListener("click", () => {
  void runValidation();
});

window.addEventListener("resize", () => engine.resize());
window.addEventListener("beforeunload", () => {
  disposeActiveWorld();
  disposeShowcase();
});

engine.runRenderLoop(() => scene.render());
void runValidation();
