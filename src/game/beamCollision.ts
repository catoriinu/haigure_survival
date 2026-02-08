import { Mesh, Vector3 } from "@babylonjs/core";

export type BeamCollisionShape = {
  mesh: Mesh;
  velocity: Vector3;
  bodyRadius: number;
  length: number;
  currentLength: number;
  tip: Mesh;
  tipRadius: number;
};

export const isBeamHittingTarget = (
  beam: BeamCollisionShape,
  targetPosition: Vector3,
  targetRadius: number
) => {
  const direction = Vector3.Normalize(beam.velocity);
  const halfLength = beam.currentLength / 2;
  const toTarget = targetPosition.subtract(beam.mesh.position);
  const projection =
    toTarget.x * direction.x +
    toTarget.y * direction.y +
    toTarget.z * direction.z;
  const clamped = Math.max(-halfLength, Math.min(halfLength, projection));
  const closest = beam.mesh.position.add(direction.scale(clamped));
  const distanceSq = Vector3.DistanceSquared(targetPosition, closest);
  const bodyRadius = targetRadius + beam.bodyRadius;
  const tipPosition = beam.tip.getAbsolutePosition();
  const tipRadius = targetRadius + beam.tipRadius;
  const tipDistanceSq = Vector3.DistanceSquared(targetPosition, tipPosition);

  return (
    distanceSq <= bodyRadius * bodyRadius ||
    tipDistanceSq <= tipRadius * tipRadius
  );
};

export const isBeamHittingTargetExcludingSource = (
  beam: BeamCollisionShape,
  beamSourceId: string | null,
  targetId: string,
  targetPosition: Vector3,
  targetRadius: number
) => {
  if (beamSourceId === targetId) {
    return false;
  }
  return isBeamHittingTarget(beam, targetPosition, targetRadius);
};
