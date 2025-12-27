import { FreeCamera, Vector3 } from "@babylonjs/core";

export type SpatialPlayOptions = {
  volume: number;
  maxDistance: number;
  loop: boolean;
  onEnded?: () => void;
};

type SpatialSlot = {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
  getPosition: () => Vector3;
  baseVolume: number;
  maxDistance: number;
  onEnded?: () => void;
  active: boolean;
  lastUsed: number;
};

export type SpatialHandle = {
  stop: () => void;
  isActive: () => boolean;
};

export type AudioCategory = "bgm" | "se" | "voice";

export class AudioManager {
  private context: AudioContext;
  private bgmGain: GainNode;
  private seGain: GainNode;
  private voiceGain: GainNode;
  private bgmAudio: HTMLAudioElement | null;
  private activeSlots: SpatialSlot[];
  private sePool: SpatialSlot[];
  private voicePool: SpatialSlot[];
  private camera: FreeCamera;

  constructor(camera: FreeCamera) {
    this.camera = camera;
    this.context = new AudioContext();
    this.bgmGain = this.context.createGain();
    this.seGain = this.context.createGain();
    this.voiceGain = this.context.createGain();
    this.bgmGain.gain.value = 0.325;
    this.seGain.gain.value = 0.9;
    this.voiceGain.gain.value = 1;
    this.bgmGain.connect(this.context.destination);
    this.seGain.connect(this.context.destination);
    this.voiceGain.connect(this.context.destination);

    this.bgmAudio = null;
    this.activeSlots = [];
    const sePoolSize = 32;
    const voicePoolSize = 16;
    this.sePool = this.createPool(sePoolSize, this.seGain);
    this.voicePool = this.createPool(voicePoolSize, this.voiceGain);
  }

  private ensureRunning() {
    if (this.context.state !== "running") {
      this.context.resume();
    }
  }

  private stopSlot(slot: SpatialSlot, callEnded: boolean) {
    if (!slot.active) {
      return;
    }
    slot.active = false;
    slot.audio.pause();
    slot.audio.currentTime = 0;
    const index = this.activeSlots.indexOf(slot);
    if (index >= 0) {
      this.activeSlots.splice(index, 1);
    }
    const onEnded = slot.onEnded;
    slot.onEnded = undefined;
    if (callEnded && onEnded) {
      onEnded();
    }
  }

  private createPool(size: number, output: GainNode) {
    const slots: SpatialSlot[] = [];
    for (let index = 0; index < size; index += 1) {
      const audio = new Audio();
      audio.preload = "auto";
      const source = this.context.createMediaElementSource(audio);
      const pan = this.context.createStereoPanner();
      const gain = this.context.createGain();
      source.connect(pan);
      pan.connect(gain);
      gain.connect(output);
      const slot: SpatialSlot = {
        audio,
        source,
        gain,
        pan,
        getPosition: () => Vector3.Zero(),
        baseVolume: 1,
        maxDistance: 1,
        active: false,
        lastUsed: 0
      };
      audio.addEventListener("ended", () => {
        this.stopSlot(slot, true);
      });
      slots.push(slot);
    }
    return slots;
  }

  private acquireSlot(pool: SpatialSlot[]) {
    const idle = pool.find((slot) => !slot.active);
    if (idle) {
      return idle;
    }
    let oldest = pool[0];
    for (const slot of pool) {
      if (slot.lastUsed < oldest.lastUsed) {
        oldest = slot;
      }
    }
    this.stopSlot(oldest, false);
    return oldest;
  }

  private getGain(category: AudioCategory) {
    if (category === "bgm") {
      return this.bgmGain;
    }
    if (category === "se") {
      return this.seGain;
    }
    return this.voiceGain;
  }

  setCategoryVolume(category: AudioCategory, volume: number) {
    this.getGain(category).gain.value = volume;
  }

  getCategoryVolume(category: AudioCategory) {
    return this.getGain(category).gain.value;
  }

  startBgm(url: string) {
    this.ensureRunning();
    if (!this.bgmAudio) {
      this.bgmAudio = new Audio(url);
      this.bgmAudio.loop = true;
      const source = this.context.createMediaElementSource(this.bgmAudio);
      source.connect(this.bgmGain);
    }
    this.bgmAudio.currentTime = 0;
    this.bgmAudio.play();
  }

  stopBgm() {
    if (!this.bgmAudio) {
      return;
    }
    this.bgmAudio.pause();
    this.bgmAudio.currentTime = 0;
  }

  private playSpatial(
    url: string,
    getPosition: () => Vector3,
    options: SpatialPlayOptions,
    pool: SpatialSlot[]
  ): SpatialHandle {
    this.ensureRunning();
    const slot = this.acquireSlot(pool);
    slot.audio.src = url;
    slot.audio.loop = options.loop;
    slot.audio.currentTime = 0;

    slot.getPosition = getPosition;
    slot.baseVolume = options.volume;
    slot.maxDistance = options.maxDistance;
    slot.onEnded = options.onEnded;
    slot.active = true;
    slot.lastUsed = performance.now();
    this.activeSlots.push(slot);
    slot.audio.play();
    return {
      stop: () => {
        this.stopSlot(slot, false);
      },
      isActive: () => slot.active
    };
  }

  playSe(
    url: string,
    getPosition: () => Vector3,
    options: SpatialPlayOptions
  ) {
    return this.playSpatial(url, getPosition, options, this.sePool);
  }

  playVoice(
    url: string,
    getPosition: () => Vector3,
    options: SpatialPlayOptions
  ) {
    return this.playSpatial(url, getPosition, options, this.voicePool);
  }

  updateSpatial() {
    if (this.activeSlots.length === 0) {
      return;
    }
    const cameraPosition = this.camera.position;
    const forward = this.camera.getDirection(new Vector3(0, 0, 1)).normalize();
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();

    for (const handle of this.activeSlots) {
      const sourcePosition = handle.getPosition();
      const toSource = sourcePosition.subtract(cameraPosition);
      const distance = toSource.length();
      const horizontal = new Vector3(toSource.x, 0, toSource.z).normalize();
      const pan = Math.max(-1, Math.min(1, Vector3.Dot(right, horizontal)));
      const normalized = Math.max(
        0,
        Math.min(1, distance / handle.maxDistance)
      );
      const inverse = 1 / (1 + normalized);
      const volume = Math.max(0, Math.min(1, (inverse - 0.5) / 0.5));
      handle.pan.pan.value = pan;
      handle.gain.gain.value = volume * handle.baseVolume;
    }
  }
}
