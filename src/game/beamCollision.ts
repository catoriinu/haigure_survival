import { Vector3 } from "@babylonjs/core";

export type BeamCollisionShape = {
  persistent: boolean;
  velocity: Vector3;
  bodyRadius: number;
  startPosition: Vector3;
  travelDistance: number;
  length: number;
  currentLength: number;
  tipRadius: number;
};

export type BeamHitRadii = {
  x: number;
  y: number;
  z: number;
};

export const createBeamHitRadii = (
  width: number,
  height: number
): BeamHitRadii => ({
  x: width * 0.5,
  y: height * 0.5,
  z: width * 0.5
});

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const isPointInsideEllipsoid = (
  point: Vector3,
  center: Vector3,
  radii: BeamHitRadii
) => {
  const dx = (point.x - center.x) / radii.x;
  const dy = (point.y - center.y) / radii.y;
  const dz = (point.z - center.z) / radii.z;
  return dx * dx + dy * dy + dz * dz <= 1;
};

const isSegmentHittingEllipsoid = (
  start: Vector3,
  end: Vector3,
  center: Vector3,
  radii: BeamHitRadii
) => {
  const ax = (start.x - center.x) / radii.x;
  const ay = (start.y - center.y) / radii.y;
  const az = (start.z - center.z) / radii.z;
  const abx = (end.x - start.x) / radii.x;
  const aby = (end.y - start.y) / radii.y;
  const abz = (end.z - start.z) / radii.z;
  const abLengthSq = abx * abx + aby * aby + abz * abz;

  if (abLengthSq === 0) {
    return ax * ax + ay * ay + az * az <= 1;
  }

  const t = clamp(-(ax * abx + ay * aby + az * abz) / abLengthSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const cz = az + abz * t;
  return cx * cx + cy * cy + cz * cz <= 1;
};

const expandRadii = (targetRadii: BeamHitRadii, margin: number): BeamHitRadii => ({
  x: targetRadii.x + margin,
  y: targetRadii.y + margin,
  z: targetRadii.z + margin
});

const getBeamDirection = (beam: BeamCollisionShape) =>
  Vector3.Normalize(beam.velocity);

const buildBeamCollisionGeometry = (beam: BeamCollisionShape) => {
  const direction = getBeamDirection(beam);
  const tailDistance = beam.persistent
    ? 0
    : Math.max(0, beam.travelDistance - beam.length);
  const segmentStart = beam.startPosition.add(
    direction.scale(tailDistance)
  );
  const segmentEnd = segmentStart.add(
    direction.scale(beam.currentLength)
  );
  const tipCenterPosition = beam.persistent
    ? segmentEnd
    : segmentEnd.add(direction.scale(beam.tipRadius));
  return {
    direction,
    segmentStart,
    segmentEnd,
    tipCenterPosition
  };
};

export const getBeamTipCenterPosition = (beam: BeamCollisionShape) => {
  const { tipCenterPosition } = buildBeamCollisionGeometry(beam);
  return tipCenterPosition;
};

export const getBeamImpactPosition = (beam: BeamCollisionShape) => {
  const { direction, tipCenterPosition } = buildBeamCollisionGeometry(beam);
  if (beam.tipRadius <= 0) {
    return tipCenterPosition;
  }
  return tipCenterPosition.add(direction.scale(beam.tipRadius));
};

export const isBeamHittingTarget = (
  beam: BeamCollisionShape,
  targetPosition: Vector3,
  targetRadii: BeamHitRadii
) => {
  const { segmentStart, segmentEnd, tipCenterPosition } =
    buildBeamCollisionGeometry(beam);
  const bodyRadii = expandRadii(targetRadii, beam.bodyRadius);
  if (
    isSegmentHittingEllipsoid(
      segmentStart,
      segmentEnd,
      targetPosition,
      bodyRadii
    )
  ) {
    return true;
  }

  const tipRadii = expandRadii(targetRadii, beam.tipRadius);
  return isPointInsideEllipsoid(tipCenterPosition, targetPosition, tipRadii);
};

export const isBeamHittingTargetExcludingSource = (
  beam: BeamCollisionShape,
  beamSourceId: string | null,
  targetId: string,
  targetPosition: Vector3,
  targetRadii: BeamHitRadii
) => {
  if (beamSourceId === targetId) {
    return false;
  }
  return isBeamHittingTarget(beam, targetPosition, targetRadii);
};
