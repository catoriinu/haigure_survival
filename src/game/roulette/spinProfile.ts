import { RouletteSpinProfile } from "./types";

const rouletteSpinDuration = 8;
const rouletteSpinAccelDuration = 1;
const rouletteSpinDecelStartMin = 4;
const rouletteSpinDecelStartMax = 5;
const rouletteSpinGlideDurationMin = 1.0;
const rouletteSpinGlideDurationMax = 1.3;
const rouletteSpinFinalBrakeDurationMin = 0.8;
const rouletteSpinFinalBrakeDurationMax = 1.1;
const rouletteSpinGlideSpeedRatioMin = 0.08;
const rouletteSpinGlideSpeedRatioMax = 0.14;

export const createRouletteSpinProfile = (
  random: () => number
): RouletteSpinProfile => {
  const decelStart =
    rouletteSpinDecelStartMin +
    random() * (rouletteSpinDecelStartMax - rouletteSpinDecelStartMin);
  const glideDuration =
    rouletteSpinGlideDurationMin +
    random() * (rouletteSpinGlideDurationMax - rouletteSpinGlideDurationMin);
  const finalBrakeDuration =
    rouletteSpinFinalBrakeDurationMin +
    random() * (rouletteSpinFinalBrakeDurationMax - rouletteSpinFinalBrakeDurationMin);
  const glideSpeedRatio =
    rouletteSpinGlideSpeedRatioMin +
    random() * (rouletteSpinGlideSpeedRatioMax - rouletteSpinGlideSpeedRatioMin);
  const finalBrakeStart = rouletteSpinDuration - finalBrakeDuration;
  const glideStart = finalBrakeStart - glideDuration;
  return {
    duration: rouletteSpinDuration,
    accelDuration: rouletteSpinAccelDuration,
    decelStart,
    glideStart,
    finalBrakeStart,
    glideSpeedRatio
  };
};

export const sampleRouletteSpinAngle = (
  profile: RouletteSpinProfile,
  elapsed: number,
  totalAngle: number
) => {
  const t = Math.max(0, Math.min(profile.duration, elapsed));
  const cruiseDuration = profile.decelStart - profile.accelDuration;
  const decelDuration = profile.glideStart - profile.decelStart;
  const glideDuration = profile.finalBrakeStart - profile.glideStart;
  const finalBrakeDuration = profile.duration - profile.finalBrakeStart;
  const angleScale =
    profile.accelDuration * 0.5 +
    cruiseDuration +
    decelDuration * (1 + profile.glideSpeedRatio) * 0.5 +
    glideDuration * profile.glideSpeedRatio +
    finalBrakeDuration * profile.glideSpeedRatio * 0.5;
  const omegaMax = totalAngle / angleScale;
  const omegaGlide = omegaMax * profile.glideSpeedRatio;
  const accelAngle = omegaMax * profile.accelDuration * 0.5;
  const cruiseAngle = omegaMax * cruiseDuration;
  const decelAngle = (omegaMax + omegaGlide) * decelDuration * 0.5;
  const glideAngle = omegaGlide * glideDuration;
  if (t <= profile.accelDuration) {
    const accel = omegaMax / profile.accelDuration;
    return 0.5 * accel * t * t;
  }
  if (t <= profile.decelStart) {
    return accelAngle + omegaMax * (t - profile.accelDuration);
  }
  if (t <= profile.glideStart) {
    const u = t - profile.decelStart;
    const decelPerSecond = (omegaMax - omegaGlide) / decelDuration;
    return (
      accelAngle +
      cruiseAngle +
      omegaMax * u -
      0.5 * decelPerSecond * u * u
    );
  }
  if (t <= profile.finalBrakeStart) {
    return (
      accelAngle +
      cruiseAngle +
      decelAngle +
      omegaGlide * (t - profile.glideStart)
    );
  }
  const v = t - profile.finalBrakeStart;
  const finalBrakePerSecond = omegaGlide / finalBrakeDuration;
  return (
    accelAngle +
    cruiseAngle +
    decelAngle +
    glideAngle +
    omegaGlide * v -
    0.5 * finalBrakePerSecond * v * v
  );
};

export const sampleRouletteSpinLoopVolume = (
  profile: RouletteSpinProfile,
  elapsed: number
) => {
  if (elapsed <= profile.finalBrakeStart) {
    return 1;
  }
  const finalBrakeDuration = profile.duration - profile.finalBrakeStart;
  const progress = Math.min(
    1,
    (elapsed - profile.finalBrakeStart) / finalBrakeDuration
  );
  return Math.max(0, 1 - progress);
};
