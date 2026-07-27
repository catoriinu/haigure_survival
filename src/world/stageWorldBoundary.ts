import { Mesh, Vector3, VertexBuffer } from "@babylonjs/core";

const WORLD_BOUNDARY_EPSILON = 1e-6;
const SEGMENT_PARAMETER_EPSILON = Number.EPSILON * 32;

export type StageWorldBoundary = Readonly<{
  id: "world-limit";
  mesh: Mesh;
  contains(point: Vector3): boolean;
  findExitPoint(from: Vector3, to: Vector3): Vector3 | null;
}>;

export type OwnedStageWorldBoundary = StageWorldBoundary &
  Readonly<{
    dispose(): void;
  }>;

type Axis = "x" | "y" | "z";

const AXES: readonly Axis[] = Object.freeze(["x", "y", "z"]);

const isNear = (left: number, right: number): boolean =>
  Math.abs(left - right) <= WORLD_BOUNDARY_EPSILON;

const getWorldVertices = (mesh: Mesh): readonly Vector3[] => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions || positions.length === 0 || positions.length % 3 !== 0) {
    throw new Error(`世界境界の頂点配列が不正です: ${mesh.name}`);
  }
  const world = mesh.computeWorldMatrix(true);
  const vertices: Vector3[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    const point = Vector3.TransformCoordinates(
      Vector3.FromArray(positions, index),
      world
    );
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.z)
    ) {
      throw new Error(`世界境界のworld頂点に非有限値があります: ${mesh.name}`);
    }
    vertices.push(point);
  }
  return vertices;
};

const getBounds = (
  vertices: readonly Vector3[]
): Readonly<{ minimum: Vector3; maximum: Vector3 }> => {
  const minimum = vertices[0].clone();
  const maximum = vertices[0].clone();
  for (const point of vertices.slice(1)) {
    minimum.minimizeInPlace(point);
    maximum.maximizeInPlace(point);
  }
  for (const axis of AXES) {
    if (maximum[axis] - minimum[axis] <= WORLD_BOUNDARY_EPSILON) {
      throw new Error(`世界境界の${axis.toUpperCase()}軸範囲が退化しています`);
    }
  }
  return Object.freeze({ minimum, maximum });
};

const getCornerKey = (
  point: Vector3,
  minimum: Vector3,
  maximum: Vector3
): string => {
  const bits: number[] = [];
  for (const axis of AXES) {
    if (isNear(point[axis], minimum[axis])) {
      bits.push(0);
    } else if (isNear(point[axis], maximum[axis])) {
      bits.push(1);
    } else {
      throw new Error(
        `BND_WorldLimitは軸平行・ベベルなしの直方体である必要があります: ` +
          `${axis}=${point[axis]}`
      );
    }
  }
  return bits.join("");
};

const assertClosedAxisAlignedBox = (
  mesh: Mesh,
  vertices: readonly Vector3[],
  minimum: Vector3,
  maximum: Vector3
): void => {
  const indices = mesh.getIndices();
  if (!indices || indices.length === 0 || indices.length % 3 !== 0) {
    throw new Error(`世界境界の三角形indexが不正です: ${mesh.name}`);
  }
  const cornerKeys = vertices.map((point) =>
    getCornerKey(point, minimum, maximum)
  );
  if (new Set(cornerKeys).size !== 8) {
    throw new Error(`世界境界には8隅すべてが必要です: ${mesh.name}`);
  }

  const edgeCounts = new Map<string, number>();
  const coveredFaces = new Set<string>();
  const triangleKeys = new Set<string>();
  const faceTriangles = new Map<string, string[][]>();
  const registerEdge = (left: string, right: string): void => {
    const edge = left < right ? `${left}:${right}` : `${right}:${left}`;
    edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
  };

  for (let index = 0; index < indices.length; index += 3) {
    const vertexIndices = [
      Number(indices[index]),
      Number(indices[index + 1]),
      Number(indices[index + 2])
    ];
    if (
      vertexIndices.some(
        (vertexIndex) =>
          !Number.isInteger(vertexIndex) ||
          vertexIndex < 0 ||
          vertexIndex >= vertices.length
      )
    ) {
      throw new Error(`世界境界の三角形indexが範囲外です: ${mesh.name}`);
    }
    const triangleCornerKeys = vertexIndices.map(
      (vertexIndex) => cornerKeys[vertexIndex]
    );
    if (new Set(triangleCornerKeys).size !== 3) {
      throw new Error(`世界境界に退化三角形があります: ${mesh.name}`);
    }
    const triangleKey = [...triangleCornerKeys].sort().join(":");
    if (triangleKeys.has(triangleKey)) {
      throw new Error(`世界境界に重複三角形があります: ${mesh.name}`);
    }
    triangleKeys.add(triangleKey);
    const triangle = vertexIndices.map((vertexIndex) => vertices[vertexIndex]);
    const matchingFaces: string[] = [];
    for (const axis of AXES) {
      if (triangle.every((point) => isNear(point[axis], minimum[axis]))) {
        matchingFaces.push(`${axis}-min`);
      }
      if (triangle.every((point) => isNear(point[axis], maximum[axis]))) {
        matchingFaces.push(`${axis}-max`);
      }
    }
    if (matchingFaces.length !== 1) {
      throw new Error(
        `世界境界の全三角形は6境界面のいずれかに属する必要があります: ${mesh.name}`
      );
    }
    const face = matchingFaces[0];
    coveredFaces.add(face);
    const triangles = faceTriangles.get(face) ?? [];
    triangles.push(triangleCornerKeys);
    faceTriangles.set(face, triangles);
    registerEdge(triangleCornerKeys[0], triangleCornerKeys[1]);
    registerEdge(triangleCornerKeys[1], triangleCornerKeys[2]);
    registerEdge(triangleCornerKeys[2], triangleCornerKeys[0]);
  }

  if (coveredFaces.size !== 6) {
    throw new Error(`世界境界には6面すべてが必要です: ${mesh.name}`);
  }
  for (const face of coveredFaces) {
    const triangles = faceTriangles.get(face)!;
    const faceCorners = new Set(triangles.flat());
    const sharedCorners = triangles[0].filter((corner) =>
      triangles[1]?.includes(corner)
    );
    const sharedCornerAxisDifference =
      sharedCorners.length === 2
        ? [...sharedCorners[0]].filter(
            (bit, index) => bit !== sharedCorners[1][index]
          ).length
        : 0;
    if (
      triangles.length !== 2 ||
      faceCorners.size !== 4 ||
      sharedCorners.length !== 2 ||
      sharedCornerAxisDifference !== 2
    ) {
      throw new Error(
        `世界境界の各面は4隅を覆う2個の三角形である必要があります: ${mesh.name}/${face}`
      );
    }
  }
  for (const count of edgeCounts.values()) {
    if (count !== 2) {
      throw new Error(`世界境界は閉じた直方体である必要があります: ${mesh.name}`);
    }
  }
};

const assertContainsStageBoundary = (
  stageBoundaryMesh: Mesh,
  minimum: Vector3,
  maximum: Vector3
): void => {
  for (const point of getWorldVertices(stageBoundaryMesh)) {
    if (
      point.x < minimum.x - WORLD_BOUNDARY_EPSILON ||
      point.x > maximum.x + WORLD_BOUNDARY_EPSILON ||
      point.y < minimum.y - WORLD_BOUNDARY_EPSILON ||
      point.y > maximum.y + WORLD_BOUNDARY_EPSILON ||
      point.z < minimum.z - WORLD_BOUNDARY_EPSILON ||
      point.z > maximum.z + WORLD_BOUNDARY_EPSILON
    ) {
      throw new Error("BND_WorldLimitはBND_Stage全体を内包する必要があります");
    }
  }
};

export const createStageWorldBoundary = (
  mesh: Mesh,
  stageBoundaryMesh: Mesh
): OwnedStageWorldBoundary => {
  const vertices = getWorldVertices(mesh);
  const { minimum, maximum } = getBounds(vertices);
  assertClosedAxisAlignedBox(mesh, vertices, minimum, maximum);
  assertContainsStageBoundary(stageBoundaryMesh, minimum, maximum);

  let disposed = false;
  const assertActive = (): void => {
    if (disposed) {
      throw new Error("StageWorldBoundaryは破棄済みです");
    }
  };
  const contains = (point: Vector3): boolean => {
    assertActive();
    return (
      point.x >= minimum.x - WORLD_BOUNDARY_EPSILON &&
      point.x <= maximum.x + WORLD_BOUNDARY_EPSILON &&
      point.y >= minimum.y - WORLD_BOUNDARY_EPSILON &&
      point.y <= maximum.y + WORLD_BOUNDARY_EPSILON &&
      point.z >= minimum.z - WORLD_BOUNDARY_EPSILON &&
      point.z <= maximum.z + WORLD_BOUNDARY_EPSILON
    );
  };

  return Object.freeze({
    id: "world-limit" as const,
    mesh,
    contains,
    findExitPoint: (from: Vector3, to: Vector3): Vector3 | null => {
      assertActive();
      if (!contains(from)) {
        return null;
      }
      const direction = to.subtract(from);
      let exitParameter = Number.POSITIVE_INFINITY;
      for (const axis of AXES) {
        if (direction[axis] > WORLD_BOUNDARY_EPSILON) {
          exitParameter = Math.min(
            exitParameter,
            (maximum[axis] - from[axis]) / direction[axis]
          );
        } else if (direction[axis] < -WORLD_BOUNDARY_EPSILON) {
          exitParameter = Math.min(
            exitParameter,
            (minimum[axis] - from[axis]) / direction[axis]
          );
        }
      }
      if (
        !Number.isFinite(exitParameter) ||
        exitParameter < -SEGMENT_PARAMETER_EPSILON ||
        exitParameter > 1 + SEGMENT_PARAMETER_EPSILON
      ) {
        return null;
      }
      const segmentParameter = Math.min(1, Math.max(0, exitParameter));
      const exitPoint = from.add(direction.scale(segmentParameter));
      for (const axis of AXES) {
        if (isNear(exitPoint[axis], minimum[axis])) {
          exitPoint[axis] = minimum[axis];
        } else if (isNear(exitPoint[axis], maximum[axis])) {
          exitPoint[axis] = maximum[axis];
        }
      }
      return exitPoint;
    },
    dispose: (): void => {
      if (disposed) {
        throw new Error("StageWorldBoundaryは破棄済みです");
      }
      disposed = true;
    }
  });
};
