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
  private isFileAvailable: (url: string) => boolean;

  constructor(
    audio: AudioManager,
    getListenerPosition: () => Vector3,
    files: SfxFiles,
    options: SfxOptions,
    distance: SfxDistance,
    isFileAvailable: (url: string) => boolean
  ) {
    this.audio = audio;
    this.getListenerPosition = getListenerPosition;
    this.files = files;
    this.options = options;
    this.distance = distance;
    this.isFileAvailable = isFileAvailable;
  }

  private pickRandom(variants: string[]) {
    const available = variants.filter((file) => this.isFileAvailable(file));
    if (available.length === 0) {
      return null;
    }
    return available[Math.floor(Math.random() * available.length)];
  }

  private pickByDistance(distance: number, variants: string[]) {
    const far = variants[0] ?? null;
    const mid = variants[1] ?? null;
    const near = variants[2] ?? null;
    const candidate =
      distance >= this.distance.far
        ? far
        : distance >= this.distance.mid
          ? mid
          : near;
    if (!candidate || !this.isFileAvailable(candidate)) {
      return null;
    }
    return candidate;
  }

  playBitMove(getPosition: () => Vector3) {
    if (!this.isFileAvailable(this.files.bitMove)) {
      return;
    }
    this.audio.playSe(this.files.bitMove, getPosition, this.options.base);
  }

  playBitTarget(getPosition: () => Vector3) {
    if (!this.isFileAvailable(this.files.bitTarget)) {
      return;
    }
    this.audio.playSe(this.files.bitTarget, getPosition, this.options.base);
  }

  playAlertLoop(getPosition: () => Vector3): SpatialHandle | null {
    if (!this.isFileAvailable(this.files.bitAlert)) {
      return null;
    }
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
    if (!file) {
      return;
    }
    this.audio.playSe(file, getPosition, this.options.beam);
  }

  playBeamNonTarget(getPosition: () => Vector3) {
    const file = this.pickRandom(this.files.beamNonTarget);
    if (!file) {
      return;
    }
    this.audio.playSe(file, getPosition, this.options.beam);
  }

  playHit(getPosition: () => Vector3) {
    const file = this.pickRandom(this.files.hit);
    if (!file) {
      return;
    }
    this.audio.playSe(file, getPosition, this.options.hit);
  }
}
