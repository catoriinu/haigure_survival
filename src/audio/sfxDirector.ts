import { Vector3 } from "@babylonjs/core";
import { AudioManager, SpatialHandle, SpatialPlayOptions } from "./audio";

export type SfxFiles = {
  bitMove: string;
  bitAlert: string;
  bitTarget: string;
  beamNonTarget: string[];
  beamTarget: string[];
  hit: string[];
};

export type SfxOptions = {
  base: SpatialPlayOptions;
  alertLoop: SpatialPlayOptions;
  beam: SpatialPlayOptions;
  hit: SpatialPlayOptions;
};

export type SfxDistance = {
  far: number;
  mid: number;
};

export class SfxDirector {
  private audio: AudioManager;
  private getListenerPosition: () => Vector3;
  private files: SfxFiles;
  private options: SfxOptions;
  private distance: SfxDistance;

  constructor(
    audio: AudioManager,
    getListenerPosition: () => Vector3,
    files: SfxFiles,
    options: SfxOptions,
    distance: SfxDistance
  ) {
    this.audio = audio;
    this.getListenerPosition = getListenerPosition;
    this.files = files;
    this.options = options;
    this.distance = distance;
  }

  private pickRandom(variants: string[]) {
    return variants[Math.floor(Math.random() * variants.length)];
  }

  private pickByDistance(distance: number, variants: string[]) {
    if (distance >= this.distance.far) {
      return variants[0];
    }
    if (distance >= this.distance.mid) {
      return variants[1];
    }
    return variants[2];
  }

  playBitMove(getPosition: () => Vector3) {
    this.audio.playSe(this.files.bitMove, getPosition, this.options.base);
  }

  playBitTarget(getPosition: () => Vector3) {
    this.audio.playSe(this.files.bitTarget, getPosition, this.options.base);
  }

  playAlertLoop(getPosition: () => Vector3): SpatialHandle {
    return this.audio.playSe(
      this.files.bitAlert,
      getPosition,
      this.options.alertLoop
    );
  }

  playBitBeam(getPosition: () => Vector3, targetingPlayer: boolean) {
    const sourcePosition = getPosition();
    const distance = Vector3.Distance(
      this.getListenerPosition(),
      sourcePosition
    );
    const variants = targetingPlayer
      ? this.files.beamTarget
      : this.files.beamNonTarget;
    const file = this.pickByDistance(distance, variants);
    this.audio.playSe(file, getPosition, this.options.beam);
  }

  playBeamNonTarget(getPosition: () => Vector3) {
    const file = this.pickRandom(this.files.beamNonTarget);
    this.audio.playSe(file, getPosition, this.options.beam);
  }

  playHit(getPosition: () => Vector3) {
    const file = this.pickRandom(this.files.hit);
    this.audio.playSe(file, getPosition, this.options.hit);
  }
}
