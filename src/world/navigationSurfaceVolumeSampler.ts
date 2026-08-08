import { Vector3, VertexBuffer } from "@babylonjs/core";

import type { NavigationSurfaceTriangle } from "./navigationWorld";
import { createStageBoundaryContainsQuery } from "./stageSpatialQueries";
import type { StageVolume } from "./stageSpatialQueries";

export type NavigationSurfaceVolumeSource = Readonly<{
  volume: StageVolume;
  triangles: readonly NavigationSurfaceTriangle[];
}>;

export type NavigationSurfaceVolumeArea = Readonly<{
  volumeId: string;
  area: number;
}>;

export type NavigationSurfaceVolumeSample = Readonly<{
  volumeId: string;
  point: Vector3;
}>;

export interface NavigationSurfaceVolumeSampler {
  readonly areas: readonly NavigationSurfaceVolumeArea[];
  readonly totalArea: number;
  sample(random: () => number): NavigationSurfaceVolumeSample;
}

type WeightedTriangle = Readonly<{
  a: Vector3;
  b: Vector3;
  c: Vector3;
  volumeId: string;
  cumulativeArea: number;
}>;

type ConvexVolumePlane = Readonly<{
  normal: Vector3;
  maximumDot: number;
}>;

const CLIP_EPSILON = 1e-7;
const AREA_EPSILON = 1e-10;
const CONVEXITY_EPSILON = 1e-5;

const requireRandom = (random: () => number) => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(
      `NavMesh面積抽選randomは0以上1未満が必要です: ${value}`
    );
  }
  return value;
};

const clipPolygon = (
  polygon: readonly Vector3[],
  plane: ConvexVolumePlane
) => {
  if (polygon.length === 0) {
    return [];
  }
  const result: Vector3[] = [];
  const signedDistance = (point: Vector3) =>
    Vector3.Dot(plane.normal, point) - plane.maximumDot;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentDistance = signedDistance(current) - CLIP_EPSILON;
    const previousDistance = signedDistance(previous) - CLIP_EPSILON;
    const currentInside = currentDistance <= 0;
    const previousInside = previousDistance <= 0;
    if (currentInside !== previousInside) {
      const denominator = previousDistance - currentDistance;
      if (Math.abs(denominator) > AREA_EPSILON) {
        const ratio = previousDistance / denominator;
        result.push(Vector3.Lerp(previous, current, ratio));
      }
    }
    if (currentInside) {
      result.push(current.clone());
    }
  }
  return result;
};

const createConvexVolumePlanes = (
  volume: StageVolume
): readonly ConvexVolumePlane[] => {
  const positions = volume.mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = volume.mesh.getIndices();
  if (!positions || !indices || indices.length === 0 || indices.length % 3 !== 0) {
    throw new Error(
      `NavMesh面積抽選VolumeのMesh形状が不正です: ${volume.id}`
    );
  }
  volume.mesh.computeWorldMatrix(true);
  const worldMatrix = volume.mesh.getWorldMatrix();
  const vertices: Vector3[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    vertices.push(
      Vector3.TransformCoordinates(
        Vector3.FromArray(positions, index),
        worldMatrix
      )
    );
  }
  const center = vertices
    .reduce((sum, vertex) => sum.addInPlace(vertex), Vector3.Zero())
    .scaleInPlace(1 / vertices.length);
  const planes: ConvexVolumePlane[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    const a = vertices[indices[index]];
    const b = vertices[indices[index + 1]];
    const c = vertices[indices[index + 2]];
    if (!a || !b || !c) {
      throw new Error(
        `NavMesh面積抽選VolumeのMesh indexが不正です: ${volume.id}`
      );
    }
    const normal = Vector3.Cross(b.subtract(a), c.subtract(a));
    if (normal.lengthSquared() <= AREA_EPSILON) {
      continue;
    }
    normal.normalize();
    let maximumDot = Vector3.Dot(normal, a);
    if (Vector3.Dot(normal, center) > maximumDot) {
      normal.scaleInPlace(-1);
      maximumDot = Vector3.Dot(normal, a);
    }
    planes.push(Object.freeze({ normal, maximumDot }));
  }
  if (planes.length === 0) {
    throw new Error(
      `NavMesh面積抽選Volumeに有効な面がありません: ${volume.id}`
    );
  }
  for (const plane of planes) {
    if (
      vertices.some(
        (vertex) =>
          Vector3.Dot(plane.normal, vertex) - plane.maximumDot >
          CONVEXITY_EPSILON
      )
    ) {
      throw new Error(
        `NavMesh面積抽選Volumeは凸Meshである必要があります: ${volume.id}`
      );
    }
  }
  return Object.freeze(planes);
};

const clipTriangleToVolume = (
  triangle: NavigationSurfaceTriangle,
  planes: readonly ConvexVolumePlane[]
) => {
  let polygon: readonly Vector3[] = [triangle.a, triangle.b, triangle.c];
  for (const plane of planes) {
    polygon = clipPolygon(polygon, plane);
  }
  return polygon;
};

const triangleArea = (a: Vector3, b: Vector3, c: Vector3) =>
  Vector3.Cross(b.subtract(a), c.subtract(a)).length() / 2;

export const createNavigationSurfaceVolumeSampler = (
  sources: readonly NavigationSurfaceVolumeSource[]
): NavigationSurfaceVolumeSampler => {
  if (sources.length === 0) {
    throw new Error("NavMesh面積抽選のVolumeがありません。");
  }
  const sourceIds = new Set<string>();
  const weightedTriangles: WeightedTriangle[] = [];
  const areas: NavigationSurfaceVolumeArea[] = [];
  let cumulativeArea = 0;

  for (const source of sources) {
    if (sourceIds.has(source.volume.id)) {
      throw new Error(
        `NavMesh面積抽選のVolume IDが重複しています: ${source.volume.id}`
      );
    }
    sourceIds.add(source.volume.id);
    const planes = createConvexVolumePlanes(source.volume);
    const contains = createStageBoundaryContainsQuery(source.volume.mesh);
    const areaAtStart = cumulativeArea;
    for (const triangle of source.triangles) {
      const polygon = clipTriangleToVolume(triangle, planes);
      if (polygon.length < 3) {
        continue;
      }
      for (let index = 1; index < polygon.length - 1; index += 1) {
        const a = polygon[0];
        const b = polygon[index];
        const c = polygon[index + 1];
        const area = triangleArea(a, b, c);
        if (area <= AREA_EPSILON) {
          continue;
        }
        const center = a.add(b).add(c).scale(1 / 3);
        if (!contains(center)) {
          throw new Error(
            `NavMesh面クリップ結果がVolume外です: ${source.volume.id}`
          );
        }
        cumulativeArea += area;
        weightedTriangles.push(
          Object.freeze({
            a: a.clone(),
            b: b.clone(),
            c: c.clone(),
            volumeId: source.volume.id,
            cumulativeArea
          })
        );
      }
    }
    const area = cumulativeArea - areaAtStart;
    if (area <= AREA_EPSILON) {
      throw new Error(
        `Volumeとbaked NavMeshの交差面積がありません: ${source.volume.id}`
      );
    }
    areas.push(Object.freeze({ volumeId: source.volume.id, area }));
  }

  const frozenAreas = Object.freeze(areas);
  const frozenTriangles = Object.freeze(weightedTriangles);
  return Object.freeze({
    areas: frozenAreas,
    totalArea: cumulativeArea,
    sample: (random: () => number) => {
      if (typeof random !== "function") {
        throw new Error("NavMesh面積抽選randomには関数が必要です。");
      }
      const areaTarget = requireRandom(random) * cumulativeArea;
      let minimumIndex = 0;
      let maximumIndex = frozenTriangles.length - 1;
      while (minimumIndex < maximumIndex) {
        const middleIndex = Math.floor((minimumIndex + maximumIndex) / 2);
        if (areaTarget < frozenTriangles[middleIndex].cumulativeArea) {
          maximumIndex = middleIndex;
        } else {
          minimumIndex = middleIndex + 1;
        }
      }
      const triangle = frozenTriangles[minimumIndex];
      const root = Math.sqrt(requireRandom(random));
      const ratio = requireRandom(random);
      return Object.freeze({
        volumeId: triangle.volumeId,
        point: triangle.a
          .scale(1 - root)
          .add(triangle.b.scale(root * (1 - ratio)))
          .add(triangle.c.scale(root * ratio))
      });
    }
  });
};
