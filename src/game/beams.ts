import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  VertexBuffer,
  Vector3
} from "@babylonjs/core";
import { GridLayout } from "../world/grid";
import { Beam, BeamImpactOrb, BeamTrail, StageBounds } from "./types";

const beamDiameterBase = 0.015;
const beamDiameterScale = 1.2;
const beamTipScaleBase = 1.25;
const beamTipScaleMultiplier = 4;
const beamDiameter = beamDiameterBase * beamDiameterScale;
const beamTipScale =
  (beamTipScaleBase * beamTipScaleMultiplier) / beamDiameterScale;
export const beamTipDiameter = beamDiameter * beamTipScale;
const beamFrontDiameterScale = 0.8;
const beamBackDiameterScale = 3.0;
const beamFrontRadius = (beamDiameter * beamFrontDiameterScale) / 2;
const beamBackRadius = (beamDiameter * beamBackDiameterScale) / 2;
const beamTrailDiameterMin = 0.01;
const beamTrailDiameterMax = 0.05;
const beamTrailLifetime = 0.3;
const beamTrailIntervalMin = 0.025;
const beamTrailIntervalMax = 0.085;
const beamTrailDrag = 8.5;
const beamTrailMinScale = 0.08;
const beamTrailFadeInDuration = 0.05;
const beamImpactOrbCountMin = 2;
const beamImpactOrbCountMax = 5;
const beamImpactOrbDiameter = 0.02;
const beamImpactOrbLifetime = 1.6;
const beamImpactMinScale = 0.08;
const beamImpactOrbSpeedMin = 0.03;
const beamImpactOrbSpeedMax = 0.075;
const beamImpactBounceJitter = 1.35;
const beamImpactBounceLift = 0.7;
const beamImpactReflectBoost = 1;
const beamHitColor = new Color3(1, 0.18, 0.74);
const beamHitEffectAlpha = 0.55;
const normalBeamSpeed = 1.58;
const trapBeamSpeedScale = 2;
const trapBeamThicknessScale = 0.9;
const trapBeamBodyRadiusScale = 0.5;
const trapBeamSustainDuration = 4;
const trapBeamFadeOutDuration = 1;
const beamLength = 0.75;
const randomInRange = (min: number, max: number) =>
  min + Math.random() * (max - min);
const getRandomTrailInterval = () =>
  randomInRange(beamTrailIntervalMin, beamTrailIntervalMax);
const getRandomTrailDiameter = () =>
  randomInRange(beamTrailDiameterMin, beamTrailDiameterMax);
const getRandomTrailOffset = (direction: Vector3, radius: number) => {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * radius;
  const basis =
    Math.abs(direction.y) < 0.99 ? Vector3.Up() : Vector3.Right();
  const tangent = Vector3.Cross(direction, basis).normalize();
  const bitangent = Vector3.Cross(tangent, direction).normalize();
  return tangent
    .scale(Math.cos(angle) * distance)
    .add(bitangent.scale(Math.sin(angle) * distance));
};
const applyBeamBackFade = (beam: Mesh, length: number) => {
  const positions = beam.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  const halfLength = length / 2;
  const fadeStart = -halfLength + length / 3;
  const fadeRange = length / 3;

  for (let index = 0; index < positions.length; index += 3) {
    const y = positions[index + 1];
    const alpha =
      y >= fadeStart ? 1 : (y + halfLength) / fadeRange;
    colors.push(1, 1, 1, alpha);
  }

  beam.setVerticesData(VertexBuffer.ColorKind, colors);
  beam.useVertexColors = true;
  beam.hasVertexAlpha = true;
};

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
    material.specularColor = Color3.Black();
    material.alpha = beamHitEffectAlpha;
    orb.material = material;
    orb.isPickable = false;
    orb.position.copyFrom(center);
    orbs.push({
      mesh: orb,
      velocity: direction.scale(speed),
      timer: beamImpactOrbLifetime
    });
  }

  return orbs;
};

export const createBeamMaterial = (scene: Scene) => {
  const material = new StandardMaterial("beamMaterial", scene);
  material.emissiveColor = beamHitColor.clone();
  material.diffuseColor = beamHitColor.clone();
  material.specularColor = Color3.Black();
  material.alpha = beamHitEffectAlpha;
  material.backFaceCulling = false;
  return material;
};

type BeamBuildConfig = {
  sourceId: string | null;
  speed: number;
  diameterTop: number;
  diameterBottom: number;
  tipDiameter: number;
  tipVisible: boolean;
  bodyRadius: number;
  group: "normal" | "trap";
  persistent: boolean;
  persistentTimer: number;
  trailEnabled: boolean;
  impactEnabled: boolean;
  backFadeEnabled: boolean;
};

const createBeamInternal = (
  scene: Scene,
  position: Vector3,
  direction: Vector3,
  material: StandardMaterial,
  config: BeamBuildConfig
): Beam => {
  const beam = MeshBuilder.CreateCylinder(
    "beam",
    {
      diameterTop: config.diameterTop,
      diameterBottom: config.diameterBottom,
      height: beamLength,
      tessellation: 12,
      sideOrientation: Mesh.DOUBLESIDE
    },
    scene
  );
  beam.material = material;
  beam.isPickable = false;
  if (config.backFadeEnabled) {
    applyBeamBackFade(beam, beamLength);
  }

  const tip = MeshBuilder.CreateSphere(
    "beamTip",
    { diameter: config.tipDiameter, segments: 12 },
    scene
  );
  tip.material = material;
  tip.isPickable = false;
  tip.position.copyFrom(position);
  tip.isVisible = config.tipVisible;

  const normalizedDirection = direction.clone().normalize();
  const rotation = new Quaternion();
  Quaternion.FromUnitVectorsToRef(
    Vector3.Up(),
    normalizedDirection,
    rotation
  );
  beam.rotationQuaternion = rotation;
  beam.position = position.clone();
  beam.scaling.y = 0;
  beam.visibility = 1;

  return {
    mesh: beam,
    group: config.group,
    persistent: config.persistent,
    persistentTimer: config.persistentTimer,
    velocity: normalizedDirection.scale(config.speed),
    bodyRadius: config.bodyRadius,
    startPosition: position.clone(),
    travelDistance: 0,
    length: beamLength,
    currentLength: 0,
    retracting: false,
    retractLeadRemaining: 0,
    impactPosition: position.clone(),
    active: true,
    sourceId: config.sourceId,
    tip,
    tipRadius: config.tipDiameter / 2,
    trailTimer: config.trailEnabled
      ? Math.random() * beamTrailIntervalMax
      : Number.POSITIVE_INFINITY,
    trailEnabled: config.trailEnabled,
    impactEnabled: config.impactEnabled
  };
};

export const createBeam = (
  scene: Scene,
  position: Vector3,
  direction: Vector3,
  material: StandardMaterial,
  sourceId: string | null
): Beam => {
  const beamFrontDiameter = beamDiameter * beamFrontDiameterScale;
  const beamBackDiameter = beamDiameter * beamBackDiameterScale;
  return createBeamInternal(scene, position, direction, material, {
    sourceId,
    speed: normalBeamSpeed,
    diameterTop: beamFrontDiameter,
    diameterBottom: beamBackDiameter,
    tipDiameter: beamTipDiameter,
    tipVisible: true,
    bodyRadius: 0,
    group: "normal",
    persistent: false,
    persistentTimer: 0,
    trailEnabled: true,
    impactEnabled: true,
    backFadeEnabled: true
  });
};

export const createTrapBeam = (
  scene: Scene,
  position: Vector3,
  direction: Vector3,
  material: StandardMaterial,
  sourceId: string | null,
  cellSize: number,
  layout: GridLayout,
  bounds: StageBounds
): Beam => {
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  const toCell = (x: number, z: number) => {
    const col = Math.floor((x + halfWidth) / layout.cellSize);
    const row = Math.floor((z + halfDepth) / layout.cellSize);
    return { row, col };
  };
  const isInsideGrid = (row: number, col: number) =>
    row >= 0 && row < layout.rows && col >= 0 && col < layout.columns;
  const computeTravelDistance = () => {
    const normalized = direction.clone().normalize();
    const step = Math.max(layout.cellSize * 0.2, 0.02);
    // 床→天井の垂直ビームは、天井までの距離を厳密に使う。
    if (Math.abs(normalized.x) < 0.0001 && Math.abs(normalized.z) < 0.0001) {
      if (normalized.y > 0) {
        return Math.max(bounds.maxY - position.y, step);
      }
      return Math.max(position.y - bounds.minY, step);
    }
    const maxDistance =
      (layout.columns + layout.rows) * layout.cellSize +
      (bounds.maxY - bounds.minY) +
      2;
    let travel = 0;
    while (travel <= maxDistance) {
      const front = position.add(normalized.scale(travel));
      const frontCell = toCell(front.x, front.z);
      const insideGrid = isInsideGrid(frontCell.row, frontCell.col);
      const floorAt =
        insideGrid && layout.cells[frontCell.row][frontCell.col] === "floor";
      if (
        front.y <= bounds.minY ||
        front.y >= bounds.maxY ||
        !floorAt
      ) {
        return Math.max(travel, step);
      }
      travel += step;
    }
    return maxDistance;
  };
  const thickness = cellSize * trapBeamThicknessScale;
  const beam = createBeamInternal(scene, position, direction, material, {
    sourceId,
    speed: normalBeamSpeed * trapBeamSpeedScale,
    diameterTop: thickness,
    diameterBottom: thickness,
    tipDiameter: thickness,
    tipVisible: false,
    bodyRadius: cellSize * trapBeamBodyRadiusScale,
    group: "trap",
    persistent: true,
    persistentTimer: trapBeamSustainDuration,
    trailEnabled: false,
    impactEnabled: false,
    backFadeEnabled: false
  });
  const normalized = direction.clone().normalize();
  const travelDistance = computeTravelDistance();
  beam.travelDistance = travelDistance;
  beam.currentLength = travelDistance;
  beam.tipRadius = 0;
  const centerPosition = position.add(
    normalized.scale(travelDistance / 2)
  );
  beam.mesh.position.copyFrom(centerPosition);
  beam.mesh.scaling.y = travelDistance / beam.length;
  beam.tip.position.copyFrom(
    position.add(normalized.scale(travelDistance))
  );
  return beam;
};

export const beginBeamRetract = (
  beam: Beam,
  impactPosition: Vector3
) => {
  if (beam.persistent) {
    return;
  }
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
  impacts: BeamImpactOrb[],
  shouldProcessOrb: (position: Vector3) => boolean
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
    if (!shouldProcessOrb(trail.mesh.position)) {
      trail.mesh.dispose();
      continue;
    }
    trail.timer -= delta;
    if (trail.timer <= 0) {
      trail.mesh.dispose();
      continue;
    }
    trail.age += delta;
    trail.mesh.position.addInPlace(trail.velocity.scale(delta));
    trail.velocity.scaleInPlace(Math.exp(-beamTrailDrag * delta));
    const trailScale = trail.timer / beamTrailLifetime;
    if (trailScale <= beamTrailMinScale) {
      trail.mesh.dispose();
      continue;
    }
    const fadeIn = Math.min(
      1,
      trail.age / beamTrailFadeInDuration
    );
    trail.mesh.scaling.set(trailScale, trailScale, trailScale);
    trail.mesh.visibility = fadeIn;
    activeTrails.push(trail);
  }

  for (const orb of impacts) {
    if (!shouldProcessOrb(orb.mesh.position)) {
      orb.mesh.dispose();
      continue;
    }
    orb.timer -= delta;
    if (orb.timer <= 0) {
      orb.mesh.dispose();
      continue;
    }
    orb.mesh.position.addInPlace(orb.velocity.scale(delta));
    const impactScale = orb.timer / beamImpactOrbLifetime;
    if (impactScale <= beamImpactMinScale) {
      orb.mesh.dispose();
      continue;
    }
    orb.mesh.scaling.set(impactScale, impactScale, impactScale);
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

    if (beam.persistent) {
      beam.persistentTimer -= delta;
      if (beam.persistentTimer <= 0) {
        beam.tip.dispose();
        beam.mesh.dispose();
        continue;
      }
      if (beam.persistentTimer <= trapBeamFadeOutDuration) {
        beam.mesh.visibility = beam.persistentTimer / trapBeamFadeOutDuration;
        beam.active = false;
      } else {
        beam.mesh.visibility = 1;
        beam.active = true;
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
    if (beam.trailEnabled) {
      beam.trailTimer -= delta;
    }
    if (beam.trailEnabled && beam.trailTimer <= 0) {
      const trailRange = beam.currentLength / 2;
      const trailAdvance = randomInRange(0, trailRange);
      const trailRatio = trailAdvance / beam.length;
      const trailRadius =
        beamBackRadius +
        (beamFrontRadius - beamBackRadius) * trailRatio;
      const trailOffset = getRandomTrailOffset(
        direction,
        trailRadius
      );
      const trailPosition = tailPosition
        .add(direction.scale(trailAdvance))
        .add(trailOffset);
      if (shouldProcessOrb(trailPosition)) {
        const trail = MeshBuilder.CreateSphere(
          "beamTrail",
          { diameter: getRandomTrailDiameter(), segments: 10 },
          beam.mesh.getScene()
        );
        trail.material = beam.mesh.material;
        trail.isPickable = false;
        trail.position.copyFrom(trailPosition);
        activeTrails.push({
          mesh: trail,
          timer: beamTrailLifetime,
          velocity: beam.velocity.scale(0.5),
          age: 0
        });
      }
      beam.trailTimer = getRandomTrailInterval();
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
      if (beam.impactEnabled && shouldProcessOrb(impactPosition)) {
        activeImpacts.push(
          ...createBeamImpactOrbs(
            beam.mesh.getScene(),
            impactPosition,
            direction,
            impactNormal
          )
        );
      }
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
