import { Vector3 } from "@babylonjs/core";
import {
  BeamHitRadii,
  getBeamImpactPosition,
  isBeamHittingTargetExcludingSource
} from "./beamCollision";
import { Beam } from "./types";

export type BeamHitCandidate = {
  targetId: string;
  targetPosition: Vector3;
  targetRadii: BeamHitRadii;
  canHit?: () => boolean;
  onHit: (beam: Beam, impactPosition: Vector3) => void;
};

export const resolveBeamHits = (
  beams: Beam[],
  candidates: BeamHitCandidate[],
  shouldHandleBeam: (beam: Beam) => boolean = () => true
) => {
  for (const candidate of candidates) {
    if (candidate.canHit && !candidate.canHit()) {
      continue;
    }
    for (const beam of beams) {
      if (!beam.active || !shouldHandleBeam(beam)) {
        continue;
      }
      if (
        !isBeamHittingTargetExcludingSource(
          beam,
          beam.sourceId,
          candidate.targetId,
          candidate.targetPosition,
          candidate.targetRadii
        )
      ) {
        continue;
      }
      candidate.onHit(beam, getBeamImpactPosition(beam));
      break;
    }
  }
};

export const resolvePlayerBeamHits = (
  beams: Beam[],
  candidates: BeamHitCandidate[]
) => resolveBeamHits(beams, candidates, (beam) => beam.sourceId === "player");
