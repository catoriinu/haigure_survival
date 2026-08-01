import {
  Color3,
  Matrix,
  Mesh,
  Scene,
  StandardMaterial,
  Vector3,
  VertexData
} from "@babylonjs/core";
import "@babylonjs/core/Meshes/thinInstanceMesh";

import type {
  V2AlarmFloorSnapshot,
  V2AlarmFrame
} from "./alarmSystem";

export const V2_ALARM_FLOOR_VISUALIZATION_ENABLED = true;
export const V2_ALARM_FLOOR_VISUAL_RANGE_WORLD_UNITS = 3;

const RING_SEGMENTS = 32;
const RING_INNER_RADIUS_RATIO = 0.72;
const FLOOR_OFFSET_WORLD_UNITS = 0.003;
const ACTIVE_ALPHA_MINIMUM = 0.22;
const ACTIVE_ALPHA_MAXIMUM = 0.42;
const ACTIVE_PULSE_SECONDS = 2.5;
const TRIGGERED_CYAN_ALPHA = 0.72;
const TRIGGERED_BLACK_ALPHA = 0.68;
const ALARM_CYAN = new Color3(0.4, 0.91, 1);
const ALARM_BLACK = new Color3(0.02, 0.02, 0.02);

export type V2AlarmFloorVisualUpdateInput = Readonly<{
  frame: V2AlarmFrame;
  playerFootPosition: Vector3;
  elapsedSeconds: number;
}>;

export type V2AlarmFloorVisualDiagnostics = Readonly<{
  activeInstanceCount: number;
  triggeredCyanInstanceCount: number;
  triggeredBlackInstanceCount: number;
  activeAlpha: number;
}>;

export interface V2AlarmFloorVisualSystem {
  update(input: V2AlarmFloorVisualUpdateInput): void;
  getDiagnostics(): V2AlarmFloorVisualDiagnostics;
  dispose(): void;
}

type RingGroup = {
  mesh: Mesh;
  candidateIds: string[];
};

const createRingMesh = (
  name: string,
  material: StandardMaterial,
  scene: Scene
): Mesh => {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
    const angle = (segment / RING_SEGMENTS) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    positions.push(cosine, sine, 0);
    positions.push(
      cosine * RING_INNER_RADIUS_RATIO,
      sine * RING_INNER_RADIUS_RATIO,
      0
    );
    normals.push(0, 0, 1, 0, 0, 1);
  }
  for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
    const next = (segment + 1) % RING_SEGMENTS;
    const outer = segment * 2;
    const inner = outer + 1;
    const nextOuter = next * 2;
    const nextInner = nextOuter + 1;
    indices.push(outer, nextOuter, inner, inner, nextOuter, nextInner);
  }

  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.checkCollisions = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isVisible = false;
  return mesh;
};

const createMaterial = (
  name: string,
  color: Color3,
  alpha: number,
  scene: Scene
): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color;
  material.specularColor = Color3.Black();
  material.alpha = alpha;
  material.disableLighting = true;
  material.backFaceCulling = false;
  return material;
};

const haveSameCandidateIds = (
  left: readonly string[],
  right: readonly V2AlarmFloorSnapshot[]
): boolean =>
  left.length === right.length &&
  left.every(
    (candidateId, index) => candidateId === right[index].candidateId
  );

const createFloorMatrix = (
  floor: V2AlarmFloorSnapshot
): Matrix => {
  const bitangent = Vector3.Cross(
    floor.supportNormal,
    floor.tangent
  ).normalize();
  const position = floor.position.add(
    floor.supportNormal.scale(FLOOR_OFFSET_WORLD_UNITS)
  );
  return Matrix.FromValues(
    floor.tangent.x * floor.radius,
    floor.tangent.y * floor.radius,
    floor.tangent.z * floor.radius,
    0,
    bitangent.x * floor.radius,
    bitangent.y * floor.radius,
    bitangent.z * floor.radius,
    0,
    floor.supportNormal.x,
    floor.supportNormal.y,
    floor.supportNormal.z,
    0,
    position.x,
    position.y,
    position.z,
    1
  );
};

const updateRingGroup = (
  group: RingGroup,
  floors: readonly V2AlarmFloorSnapshot[]
): void => {
  if (haveSameCandidateIds(group.candidateIds, floors)) {
    return;
  }
  group.candidateIds = floors.map((floor) => floor.candidateId);
  if (floors.length === 0) {
    group.mesh.thinInstanceSetBuffer("matrix", null);
    group.mesh.isVisible = false;
    return;
  }
  const matrices = new Float32Array(floors.length * 16);
  floors.forEach((floor, index) => {
    createFloorMatrix(floor).copyToArray(matrices, index * 16);
  });
  group.mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
  group.mesh.isVisible = true;
  group.mesh.thinInstanceRefreshBoundingInfo(true);
};

const isFloorNearby = (
  floor: V2AlarmFloorSnapshot,
  playerFootPosition: Vector3
): boolean =>
  Vector3.DistanceSquared(floor.position, playerFootPosition) <=
  V2_ALARM_FLOOR_VISUAL_RANGE_WORLD_UNITS ** 2;

export const createV2AlarmFloorVisualSystem = (
  scene: Scene
): V2AlarmFloorVisualSystem => {
  const activeMaterial = createMaterial(
    "v2AlarmFloorActiveMaterial",
    ALARM_CYAN,
    ACTIVE_ALPHA_MINIMUM,
    scene
  );
  const triggeredCyanMaterial = createMaterial(
    "v2AlarmFloorTriggeredCyanMaterial",
    ALARM_CYAN,
    TRIGGERED_CYAN_ALPHA,
    scene
  );
  const triggeredBlackMaterial = createMaterial(
    "v2AlarmFloorTriggeredBlackMaterial",
    ALARM_BLACK,
    TRIGGERED_BLACK_ALPHA,
    scene
  );
  const activeGroup: RingGroup = {
    mesh: createRingMesh(
      "v2AlarmFloorActiveInstances",
      activeMaterial,
      scene
    ),
    candidateIds: []
  };
  const triggeredCyanGroup: RingGroup = {
    mesh: createRingMesh(
      "v2AlarmFloorTriggeredCyanInstances",
      triggeredCyanMaterial,
      scene
    ),
    candidateIds: []
  };
  const triggeredBlackGroup: RingGroup = {
    mesh: createRingMesh(
      "v2AlarmFloorTriggeredBlackInstances",
      triggeredBlackMaterial,
      scene
    ),
    candidateIds: []
  };
  const nearbyActiveFloors: V2AlarmFloorSnapshot[] = [];
  const triggeredCyanFloors: V2AlarmFloorSnapshot[] = [];
  const triggeredBlackFloors: V2AlarmFloorSnapshot[] = [];
  let disposed = false;
  let activeInstanceCount = 0;
  let triggeredCyanInstanceCount = 0;
  let triggeredBlackInstanceCount = 0;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error(
        "破棄済みのV2AlarmFloorVisualSystemは使用できません。"
      );
    }
  };

  return {
    update: ({ frame, playerFootPosition, elapsedSeconds }) => {
      assertActive();
      nearbyActiveFloors.length = 0;
      triggeredCyanFloors.length = 0;
      triggeredBlackFloors.length = 0;
      for (const floor of frame.activeFloors) {
        if (isFloorNearby(floor, playerFootPosition)) {
          nearbyActiveFloors.push(floor);
        }
      }
      for (const blink of frame.blinks) {
        if (!isFloorNearby(blink, playerFootPosition)) {
          continue;
        }
        (blink.visible
          ? triggeredCyanFloors
          : triggeredBlackFloors
        ).push(blink);
      }
      updateRingGroup(activeGroup, nearbyActiveFloors);
      updateRingGroup(triggeredCyanGroup, triggeredCyanFloors);
      updateRingGroup(triggeredBlackGroup, triggeredBlackFloors);

      const pulse =
        (Math.sin(
          (elapsedSeconds / ACTIVE_PULSE_SECONDS) * Math.PI * 2
        ) +
          1) /
        2;
      activeMaterial.alpha =
        ACTIVE_ALPHA_MINIMUM +
        (ACTIVE_ALPHA_MAXIMUM - ACTIVE_ALPHA_MINIMUM) * pulse;
      activeInstanceCount = nearbyActiveFloors.length;
      triggeredCyanInstanceCount = triggeredCyanFloors.length;
      triggeredBlackInstanceCount = triggeredBlackFloors.length;
    },
    getDiagnostics: () => {
      assertActive();
      return Object.freeze({
        activeInstanceCount,
        triggeredCyanInstanceCount,
        triggeredBlackInstanceCount,
        activeAlpha: activeMaterial.alpha
      });
    },
    dispose: () => {
      assertActive();
      activeGroup.mesh.dispose();
      triggeredCyanGroup.mesh.dispose();
      triggeredBlackGroup.mesh.dispose();
      activeMaterial.dispose();
      triggeredCyanMaterial.dispose();
      triggeredBlackMaterial.dispose();
      disposed = true;
    }
  };
};
