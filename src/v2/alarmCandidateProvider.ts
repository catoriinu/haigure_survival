import { Vector3, VertexBuffer } from "@babylonjs/core";

import type { StageSpatialContext } from "../world/stageSpatialContext";
import type {
  V2AlarmCandidate,
  V2AlarmCandidateProvider
} from "./alarmSystem";

export const V2_ALARM_CANDIDATE_SPACING = 0.8;
export const V2_ALARM_CANDIDATE_RADIUS = 0.12;
export const V2_ALARM_CANDIDATE_VERTICAL_TOLERANCE = 0.06;

const MINIMUM_UPWARD_NORMAL_Y = 0.25;
const NAVIGATION_PROJECTION_DISTANCE = 0.2;
const GROUND_PROBE_HEIGHT = 0.25;
const GROUND_PROBE_DISTANCE = 0.5;
const TRIANGLE_AREA_EPSILON = 1e-10;

const isWalkableNavSource = (mesh: {
  metadata: unknown;
}): boolean => {
  const metadata = mesh.metadata as
    | {
        gltf?: {
          extras?: {
            hs_nav_role?: unknown;
          };
        };
      }
    | null;
  return metadata?.gltf?.extras?.hs_nav_role === "walkable";
};

const getSpatialCellKey = (position: Vector3) =>
  `${Math.floor(position.x / V2_ALARM_CANDIDATE_SPACING)}:` +
  `${Math.floor(position.y / V2_ALARM_CANDIDATE_SPACING)}:` +
  `${Math.floor(position.z / V2_ALARM_CANDIDATE_SPACING)}`;

const createSurfaceTangent = (normal: Vector3) => {
  const reference =
    Math.abs(Vector3.Dot(normal, Vector3.Up())) < 0.9
      ? Vector3.Up()
      : Vector3.Right();
  return Vector3.Cross(reference, normal).normalize();
};

export const createV2NavigationAlarmCandidateProvider = (
  stage: StageSpatialContext
): V2AlarmCandidateProvider => {
  const occupiedCells = new Set<string>();
  const candidates: V2AlarmCandidate[] = [];

  for (const mesh of stage.resources.navSourceMeshes) {
    if (!isWalkableNavSource(mesh)) {
      continue;
    }
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions || !indices || indices.length % 3 !== 0) {
      throw new Error(
        `アラーム候補生成には三角形NavMesh sourceが必要です: ${mesh.name}`
      );
    }
    const world = mesh.computeWorldMatrix(true);
    for (let index = 0; index < indices.length; index += 3) {
      const first = Vector3.TransformCoordinates(
        Vector3.FromArray(positions, indices[index] * 3),
        world
      );
      const second = Vector3.TransformCoordinates(
        Vector3.FromArray(positions, indices[index + 1] * 3),
        world
      );
      const third = Vector3.TransformCoordinates(
        Vector3.FromArray(positions, indices[index + 2] * 3),
        world
      );
      const triangleNormal = Vector3.Cross(
        second.subtract(first),
        third.subtract(first)
      );
      if (triangleNormal.lengthSquared() <= TRIANGLE_AREA_EPSILON) {
        throw new Error(
          `NavMesh sourceに面積ゼロの三角形があります: ${mesh.name}`
        );
      }
      triangleNormal.normalize();
      if (triangleNormal.y < MINIMUM_UPWARD_NORMAL_Y) {
        continue;
      }

      const centroid = first.add(second).add(third).scale(1 / 3);
      const navigationLocation = stage.navigation.projectPoint(
        centroid,
        NAVIGATION_PROJECTION_DISTANCE
      );
      if (!navigationLocation) {
        continue;
      }
      const cellKey = getSpatialCellKey(navigationLocation.position);
      if (occupiedCells.has(cellKey)) {
        continue;
      }

      const ground = stage.queries.sampleGround(
        navigationLocation.position.add(
          new Vector3(0, GROUND_PROBE_HEIGHT, 0)
        ),
        GROUND_PROBE_DISTANCE
      );
      if (!ground) {
        continue;
      }
      const supportNormal = ground.normal.normalize();
      if (supportNormal.y < MINIMUM_UPWARD_NORMAL_Y) {
        continue;
      }

      occupiedCells.add(cellKey);
      candidates.push(
        Object.freeze({
          id: `navigation-alarm-${String(candidates.length + 1).padStart(4, "0")}`,
          navigationLocation: Object.freeze({
            position: navigationLocation.position.clone(),
            polygonRef: navigationLocation.polygonRef
          }),
          supportNormal,
          tangent: createSurfaceTangent(supportNormal),
          radius: V2_ALARM_CANDIDATE_RADIUS,
          verticalTolerance:
            V2_ALARM_CANDIDATE_VERTICAL_TOLERANCE
        })
      );
    }
  }

  if (candidates.length === 0) {
    throw new Error("人間用NavMeshからアラーム候補を生成できません");
  }
  const frozenCandidates = Object.freeze(candidates);
  return Object.freeze({
    getCandidates: () => frozenCandidates
  });
};
