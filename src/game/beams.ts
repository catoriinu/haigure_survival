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
const beamImpactOrbCountMin = 2;
const beamImpactOrbCountMax = 5;
const beamImpactOrbDiameter = 0.24;
const beamImpactOrbLifetime = 1.6;
const beamImpactOrbSpeedMin = 0.35;
const beamImpactOrbSpeedMax = 0.9;
const beamImpactBounceJitter = 1.35;
const beamImpactBounceLift = 0.7;
const beamImpactReflectBoost = 1;
const beamHitColor = new Color3(1, 0.18, 0.74);
const beamHitEffectAlpha = 0.55;

export const createBeamImpactOrbs = (
  scene: Scene,
  center: Vector3,
  incomingDirection: Vector3,
  surfaceNormal: Vector3
) => {
  const orbs: BeamImpactOrb[] = [];
  const normal = surfaceNormal.clone().normalize();
  const incoming = incomingDirection.clone().normalize();
  const dot = Vector3.Dot(incoming, normal);
  const reflected = incoming.subtract(normal.scale(2 * dot)).normalize();
  const count =
    beamImpactOrbCountMin +
    Math.floor(
      Math.random() * (beamImpactOrbCountMax - beamImpactOrbCountMin + 1)
    );

  for (let index = 0; index < count; index += 1) {
    const jitter = new Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    )
      .normalize()
      .scale(beamImpactBounceJitter);
    const direction = reflected
      .scale(beamImpactReflectBoost)
      .add(jitter)
      .add(normal.scale(beamImpactBounceLift * (0.7 + Math.random() * 0.6)))
      .normalize();
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
  tip.position.copyFrom(position);

  const rotation = new Quaternion();
  Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, rotation);
  beam.rotationQuaternion = rotation;
  beam.position = position.clone();
  beam.scaling.y = 0;

  return {
    mesh: beam,
    velocity: direction.scale(19),
    startPosition: position.clone(),
    travelDistance: 0,
    length: beamLength,
    currentLength: 0,
    retracting: false,
    retractLeadRemaining: 0,
    impactPosition: position.clone(),
    active: true,
    sourceId,
    tip,
    tipRadius: tipDiameter / 2,
    trailTimer: Math.random() * beamTrailInterval
  };
};

export const beginBeamRetract = (
  beam: Beam,
  impactPosition: Vector3
) => {
  beam.active = false;
  beam.retracting = true;
  beam.impactPosition.copyFrom(impactPosition);
  const direction = Vector3.Normalize(beam.velocity);
  const tailDistance = Math.max(0, beam.travelDistance - beam.length);
  const tailPosition = beam.startPosition.add(
    direction.scale(tailDistance)
  );
  const frontPosition = tailPosition.add(
    direction.scale(beam.currentLength)
  );
  const leadDistance = Vector3.Dot(
    impactPosition.subtract(frontPosition),
    direction
  );
  beam.retractLeadRemaining = Math.max(0, leadDistance);
  beam.tip.isVisible = false;
};

export const updateBeams = (
  layout: GridLayout,
  beams: Beam[],
  bounds: StageBounds,
  delta: number,
  trails: BeamTrail[],
  impacts: BeamImpactOrb[]
) => {
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  const cellSize = layout.cellSize;
  const survivors: Beam[] = [];
  const activeTrails: BeamTrail[] = [];
  const activeImpacts: BeamImpactOrb[] = [];
  const toCell = (x: number, z: number) => {
    const col = Math.floor((x + halfWidth) / cellSize);
    const row = Math.floor((z + halfDepth) / cellSize);
    return { row, col };
  };
  const isInsideGrid = (row: number, col: number) =>
    row >= 0 && row < layout.rows && col >= 0 && col < layout.columns;

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
    if (beam.retracting) {
      const direction = Vector3.Normalize(beam.velocity);
      const speed = beam.velocity.length();
      const shrink = speed * delta;
      beam.currentLength = Math.max(0, beam.currentLength - shrink);
      beam.retractLeadRemaining = Math.max(
        0,
        beam.retractLeadRemaining - shrink
      );
      const frontPosition = beam.impactPosition.subtract(
        direction.scale(beam.retractLeadRemaining)
      );
      const centerPosition = frontPosition.subtract(
        direction.scale(beam.currentLength / 2)
      );
      beam.mesh.position.copyFrom(centerPosition);
      beam.mesh.scaling.y = beam.currentLength / beam.length;
      if (beam.currentLength <= 0) {
        beam.tip.dispose();
        beam.mesh.dispose();
        continue;
      }
      survivors.push(beam);
      continue;
    }

    if (!beam.active) {
      continue;
    }
    const direction = Vector3.Normalize(beam.velocity);
    const speed = beam.velocity.length();
    beam.travelDistance += speed * delta;
    const currentLength = Math.min(beam.length, beam.travelDistance);
    beam.currentLength = currentLength;
    const tailDistance = Math.max(0, beam.travelDistance - beam.length);
    const tailPosition = beam.startPosition.add(
      direction.scale(tailDistance)
    );
    const centerPosition = tailPosition.add(
      direction.scale(currentLength / 2)
    );
    beam.mesh.position.copyFrom(centerPosition);
    beam.mesh.scaling.y = currentLength / beam.length;
    const tipPosition = tailPosition.add(
      direction.scale(currentLength + beam.tipRadius)
    );
    beam.tip.position.copyFrom(tipPosition);
    beam.trailTimer -= delta;
    if (beam.trailTimer <= 0) {
      const trailPosition = tailPosition.clone();
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
    const front = tipPosition.add(
      direction.scale(beam.tipRadius)
    );
    const frontCell = toCell(front.x, front.z);
    const insideGrid = isInsideGrid(frontCell.row, frontCell.col);
    const floorAt =
      insideGrid && layout.cells[frontCell.row][frontCell.col] === "floor";

    if (
      front.y <= bounds.minY ||
      front.y >= bounds.maxY ||
      !floorAt
    ) {
      const impactPosition = front.clone();
      let impactNormal = new Vector3(0, 1, 0);
      if (front.y <= bounds.minY) {
        impactPosition.y = bounds.minY;
      } else if (front.y >= bounds.maxY) {
        impactPosition.y = bounds.maxY;
        impactNormal = new Vector3(0, -1, 0);
      } else if (!insideGrid) {
        if (front.x <= bounds.minX) {
          impactPosition.x = bounds.minX;
          impactNormal = new Vector3(1, 0, 0);
        } else if (front.x >= bounds.maxX) {
          impactPosition.x = bounds.maxX;
          impactNormal = new Vector3(-1, 0, 0);
        } else if (front.z <= bounds.minZ) {
          impactPosition.z = bounds.minZ;
          impactNormal = new Vector3(0, 0, 1);
        } else {
          impactPosition.z = bounds.maxZ;
          impactNormal = new Vector3(0, 0, -1);
        }
      } else {
        const useX = Math.abs(direction.x) >= Math.abs(direction.z);
        if (useX) {
          impactPosition.x =
            -halfWidth +
            Math.round((front.x + halfWidth) / cellSize) * cellSize;
          impactNormal = new Vector3(direction.x > 0 ? -1 : 1, 0, 0);
        } else {
          impactPosition.z =
            -halfDepth +
            Math.round((front.z + halfDepth) / cellSize) * cellSize;
          impactNormal = new Vector3(0, 0, direction.z > 0 ? -1 : 1);
        }
      }
      activeImpacts.push(
        ...createBeamImpactOrbs(
          beam.mesh.getScene(),
          impactPosition,
          direction,
          impactNormal
        )
      );
      beginBeamRetract(beam, impactPosition);
      survivors.push(beam);
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
