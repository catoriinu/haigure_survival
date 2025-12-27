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

export const createAudioManager = (camera: FreeCamera) => {
  const context = new AudioContext();
  const bgmGain = context.createGain();
  const seGain = context.createGain();
  const voiceGain = context.createGain();
  bgmGain.gain.value = 0.325;
  seGain.gain.value = 0.9;
  voiceGain.gain.value = 1;
  bgmGain.connect(context.destination);
  seGain.connect(context.destination);
  voiceGain.connect(context.destination);

  let bgmAudio: HTMLAudioElement | null = null;
  const activeSlots: SpatialSlot[] = [];
  const sePoolSize = 32;
  const voicePoolSize = 16;

  const ensureRunning = () => {
    if (context.state !== "running") {
      context.resume();
    }
  };

  const stopSlot = (slot: SpatialSlot, callEnded: boolean) => {
    if (!slot.active) {
      return;
    }
    slot.active = false;
    slot.audio.pause();
    slot.audio.currentTime = 0;
    const index = activeSlots.indexOf(slot);
    if (index >= 0) {
      activeSlots.splice(index, 1);
    }
    const onEnded = slot.onEnded;
    slot.onEnded = undefined;
    if (callEnded && onEnded) {
      onEnded();
    }
  };

  const createPool = (size: number, output: GainNode) => {
    const slots: SpatialSlot[] = [];
    for (let index = 0; index < size; index += 1) {
      const audio = new Audio();
      audio.preload = "auto";
      const source = context.createMediaElementSource(audio);
      const pan = context.createStereoPanner();
      const gain = context.createGain();
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
        stopSlot(slot, true);
      });
      slots.push(slot);
    }
    return slots;
  };

  const sePool = createPool(sePoolSize, seGain);
  const voicePool = createPool(voicePoolSize, voiceGain);

  const acquireSlot = (pool: SpatialSlot[]) => {
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
    stopSlot(oldest, false);
    return oldest;
  };

  const startBgm = (url: string) => {
    ensureRunning();
    if (!bgmAudio) {
      bgmAudio = new Audio(url);
      bgmAudio.loop = true;
      const source = context.createMediaElementSource(bgmAudio);
      source.connect(bgmGain);
    }
    bgmAudio.currentTime = 0;
    bgmAudio.play();
  };

  const stopBgm = () => {
    if (!bgmAudio) {
      return;
    }
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
  };

  const playSpatial = (
    url: string,
    getPosition: () => Vector3,
    options: SpatialPlayOptions,
    pool: SpatialSlot[]
  ): SpatialHandle => {
    ensureRunning();
    const slot = acquireSlot(pool);
    slot.audio.src = url;
    slot.audio.loop = options.loop;
    slot.audio.currentTime = 0;

    slot.getPosition = getPosition;
    slot.baseVolume = options.volume;
    slot.maxDistance = options.maxDistance;
    slot.onEnded = options.onEnded;
    slot.active = true;
    slot.lastUsed = performance.now();
    activeSlots.push(slot);
    slot.audio.play();
    return {
      stop: () => {
        stopSlot(slot, false);
      },
      isActive: () => slot.active
    };
  };

  const playSe = (
    url: string,
    getPosition: () => Vector3,
    options: SpatialPlayOptions
  ) => playSpatial(url, getPosition, options, sePool);

  const playVoice = (
    url: string,
    getPosition: () => Vector3,
    options: SpatialPlayOptions
  ) => playSpatial(url, getPosition, options, voicePool);

  const updateSpatial = () => {
    if (activeSlots.length === 0) {
      return;
    }
    const cameraPosition = camera.position;
    const forward = camera.getDirection(new Vector3(0, 0, 1)).normalize();
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();

    for (const handle of activeSlots) {
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
  };

  return { startBgm, stopBgm, playSe, playVoice, updateSpatial };
};
