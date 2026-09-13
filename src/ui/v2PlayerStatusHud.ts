import type { V2PlayerStaminaSnapshot } from "../v2/playerStamina";
import type { V2SurvivalFrame } from "../v2/survivalRuntime";

export const createV2PlayerStatusHud = ({
  host,
  staminaGauge
}: Readonly<{ host: HTMLElement; staminaGauge: HTMLDivElement }>) => {
  const fill = staminaGauge.querySelector("#staminaGaugeFill") as HTMLDivElement;
  staminaGauge.setAttribute("role", "meter");
  staminaGauge.setAttribute("aria-label", "ダッシュ体力");
  staminaGauge.setAttribute("aria-valuemin", "0");
  const restraintBand = host.ownerDocument.createElement("div");
  restraintBand.className = "v2-player-restraint-band";
  restraintBand.dataset.v2PlayerStatus = "no-gun-restraint";
  restraintBand.setAttribute("aria-label", "銃なしによる拘束中");
  restraintBand.hidden = true;
  host.append(restraintBand);

  const clear = () => {
    staminaGauge.style.display = "none";
    restraintBand.hidden = true;
  };

  return {
    update: ({ active, frame, stamina }: Readonly<{
      active: boolean;
      frame: Pick<V2SurvivalFrame, "phase" | "noGunRestrainedTargetIds">;
      stamina: V2PlayerStaminaSnapshot | null;
    }>) => {
      const playing = active && frame.phase === "playing";
      staminaGauge.style.display = playing && stamina !== null ? "block" : "none";
      if (stamina !== null) {
        fill.style.height = `${100 * stamina.currentTenths / stamina.maximumTenths}%`;
        fill.style.backgroundColor = stamina.brainwashed ? "#ff66b5" : "#f5f5f5";
        staminaGauge.setAttribute("aria-valuemax", String(stamina.maximumTenths / 10));
        staminaGauge.setAttribute("aria-valuenow", String(stamina.currentTenths / 10));
      }
      restraintBand.hidden = !playing || !frame.noGunRestrainedTargetIds.includes("player");
    },
    clear,
    dispose: () => {
      clear();
      restraintBand.remove();
    }
  };
};
