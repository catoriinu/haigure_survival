import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";
import { GridLayout } from "../world/grid";
import { Beam, BeamImpactOrb, BeamTrail, StageBounds } from "./types";

const beamDiameterBase = 0.18;
const beamDiameterScale = 1.2;
const beamTipScaleBase = 1.25;
const beamTipScaleMultiplier = 4;
const beamDiameter = beamDiameterBase * beamDiameterScale;
const beamTipScale =
  (beamTipScaleBase * beamTipScaleMultiplier) / beamDiameterScale;
const beamTrailDiameter = 0.22;
const beamTrailLifetime = 0.25;
const beamTrailInterval = 0.12;
const beamImpactOrbCount = 5;
const beamImpactOrbDiameter = 0.24;
const beamImpactOrbLifetime = 2;
const beamImpactOrbSpeedMin = 0.12;
const beamImpactOrbSpeedMax = 0.32;
const beamHitColor = new Color3(1, 0.18, 0.74);
const beamHitEffectAlpha = 0.45;

export const createBeamImpactOrbs = (
  scene: Scene,
  center: Vector3
) => {
  const orbs: BeamImpactOrb[] = [];

  for (let index = 0; index < beamImpactOrbCount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const vertical = (Math.random() - 0.5) * 0.4;
    const direction = new Vector3(
      Math.cos(angle),
      vertical,
      Math.sin(angle)
    ).normalize();
    const speed =
      beamImpactOrbSpeedMin +
      Math.random() * (beamImpactOrbSpeedMax - beamImpactOrbSpeedMin);
    const orb = MeshBuilder.CreateSphere(
      "beamImpactOrb",
      { diameter: beamImpactOrbDiameter, segments: 10 },
      scene
    );
    const material = new StandardMaterial("beamImpactMat", scene);
    material.emissiveColor = beamHitColor.clone();
    material.diffuseColor = beamHitColor.clone();
    material.alpha = beamHitEffectAlpha;
    orb.material = material;
    orb.isPickable = false;
    orb.position.copyFrom(center);
    orbs.push({
      mesh: orb,
      velocity: direction.scale(speed),
      timer: beamImpactOrbLifetime,
      baseAlpha: beamHitEffectAlpha
    });
  }

  return orbs;
};

export const createBeamMaterial = (scene: Scene) => {
  const material = new StandardMaterial("beamMaterial", scene);
  material.emissiveColor = beamHitColor.clone();
  material.diffuseColor = beamHitColor.clone();
  material.alpha = beamHitEffectAlpha;
  material.backFaceCulling = false;
  return material;
};

export const createBeam = (
  scene: Scene,
  position: Vector3,
  direction: Vector3,
  material: StandardMaterial,
  sourceId: string | null
): Beam => {
  const beamLength = 4.8;
  const beam = MeshBuilder.CreateCylinder(
    "beam",
    {
      diameter: beamDiameter,
      height: beamLength,
      tessellation: 12,
      sideOrientation: Mesh.DOUBLESIDE
    },
    scene
  );
  beam.material = material;
  beam.isPickable = false;

  const tipDiameter = beamDiameter * beamTipScale;
  const tip = MeshBuilder.CreateSphere(
    "beamTip",
    { diameter: tipDiameter, segments: 12 },
    scene
  );
  tip.material = material;
  tip.isPickable = false;
  tip.parent = beam;
  tip.position.y = beamLength / 2 + tipDiameter / 2;

  const rotation = new Quaternion();
  Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, rotation);
  beam.rotationQuaternion = rotation;
  beam.position = position.add(direction.scale(beamLength / 2));

  return {
    mesh: beam,
    velocity: direction.scale(19),
    length: beamLength,
    active: true,
    sourceId,
    tip,
    tipRadius: tipDiameter / 2,
    trailTimer: Math.random() * beamTrailInterval
  };
};

export const updateBeams = (
  layout: GridLayout,
  beams: Beam[],
  bounds: StageBounds,
  delta: number,
  trails: BeamTrail[],
  impacts: BeamImpactOrb[]
) => {
  const margin = 6;
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  const survivors: Beam[] = [];
  const activeTrails: BeamTrail[] = [];
  const activeImpacts: BeamImpactOrb[] = [];
  const isFloorAt = (x: number, z: number) => {
    const col = Math.floor((x + halfWidth) / layout.cellSize);
    const row = Math.floor((z + halfDepth) / layout.cellSize);
    if (row < 0 || row >= layout.rows || col < 0 || col >= layout.columns) {
      return false;
    }
    return layout.cells[row][col] === "floor";
  };

  for (const trail of trails) {
    trail.timer -= delta;
    if (trail.timer <= 0) {
      trail.mesh.dispose();
      continue;
    }
    activeTrails.push(trail);
  }

  for (const orb of impacts) {
    orb.timer -= delta;
    if (orb.timer <= 0) {
      orb.mesh.dispose();
      continue;
    }
    orb.mesh.position.addInPlace(orb.velocity.scale(delta));
    const material = orb.mesh.material as StandardMaterial;
    material.alpha = orb.baseAlpha * (orb.timer / beamImpactOrbLifetime);
    activeImpacts.push(orb);
  }

  for (const beam of beams) {
    if (!beam.active) {
      continue;
    }
    const direction = Vector3.Normalize(beam.velocity);
    beam.mesh.position.addInPlace(beam.velocity.scale(delta));
    beam.trailTimer -= delta;
    if (beam.trailTimer <= 0) {
      const trailPosition = beam.mesh.position.subtract(
        direction.scale(beam.length / 2)
      );
      const trail = MeshBuilder.CreateSphere(
        "beamTrail",
        { diameter: beamTrailDiameter, segments: 10 },
        beam.mesh.getScene()
      );
      trail.material = beam.mesh.material;
      trail.isPickable = false;
      trail.position.copyFrom(trailPosition);
      activeTrails.push({ mesh: trail, timer: beamTrailLifetime });
      beam.trailTimer = beamTrailInterval;
    }
    const front = beam.mesh.position.add(
      direction.scale(beam.length / 2)
    );

    if (
      front.y <= bounds.minY ||
      front.y >= bounds.maxY ||
      !isFloorAt(front.x, front.z)
    ) {
      activeImpacts.push(
        ...createBeamImpactOrbs(beam.mesh.getScene(), front)
      );
      beam.tip.dispose();
      beam.mesh.dispose();
      beam.active = false;
      continue;
    }

    if (
      front.x < bounds.minX - margin ||
      front.x > bounds.maxX + margin ||
      front.z < bounds.minZ - margin ||
      front.z > bounds.maxZ + margin ||
      front.y < bounds.minY - margin ||
      front.y > bounds.maxY + margin
    ) {
      activeImpacts.push(
        ...createBeamImpactOrbs(beam.mesh.getScene(), front)
      );
      beam.tip.dispose();
      beam.mesh.dispose();
      beam.active = false;
      continue;
    }

    survivors.push(beam);
  }

  beams.length = 0;
  beams.push(...survivors);
  trails.length = 0;
  trails.push(...activeTrails);
  impacts.length = 0;
  impacts.push(...activeImpacts);
};
