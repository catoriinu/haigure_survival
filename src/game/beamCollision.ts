import { Mesh, Vector3 } from "@babylonjs/core";

export type BeamCollisionShape = {
  mesh: Mesh;
  velocity: Vector3;
  length: number;
  tip: Mesh;
  tipRadius: number;
};

export const isBeamHittingTarget = (
  beam: BeamCollisionShape,
  targetPosition: Vector3,
  targetRadius: number
) => {
  const direction = Vector3.Normalize(beam.velocity);
  const halfLength = beam.length / 2;
  const toTarget = targetPosition.subtract(beam.mesh.position);
  const projection =
    toTarget.x * direction.x +
    toTarget.y * direction.y +
    toTarget.z * direction.z;
  const clamped = Math.max(-halfLength, Math.min(halfLength, projection));
  const closest = beam.mesh.position.add(direction.scale(clamped));
  const distanceSq = Vector3.DistanceSquared(targetPosition, closest);
  const tipPosition = beam.tip.getAbsolutePosition();
  const tipRadius = targetRadius + beam.tipRadius;
  const tipDistanceSq = Vector3.DistanceSquared(targetPosition, tipPosition);

  return (
    distanceSq <= targetRadius * targetRadius ||
    tipDistanceSq <= tipRadius * tipRadius
  );
};
