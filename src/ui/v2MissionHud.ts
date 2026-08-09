import type {
  V2MissionFrame,
  V2MissionView
} from "../v2/missionRuntime";

export type V2MissionHudUpdate = Readonly<{
  active: boolean;
  frame: V2MissionFrame;
}>;

export type V2MissionHudControllerOptions = Readonly<{
  host: HTMLElement;
}>;

export interface V2MissionHudController {
  update(update: V2MissionHudUpdate): void;
  clear(): void;
  dispose(): void;
}

const HUD_Z_INDEX = "24";

const applyStyles = (
  element: HTMLElement,
  styles: Readonly<Partial<CSSStyleDeclaration>>
) => {
  Object.assign(element.style, styles);
};

const compareMission = (left: V2MissionView, right: V2MissionView) =>
  left.startedAtSeconds - right.startedAtSeconds ||
  left.id.localeCompare(right.id);

const selectVisibleMissions = (
  missions: readonly V2MissionView[]
): readonly V2MissionView[] => {
  const activeNormal = missions
    .filter(
      (mission) =>
        mission.state === "active" && mission.source === "normal"
    )
    .sort(compareMission)
    .slice(0, 3);
  const activeSituation = missions
    .filter(
      (mission) =>
        mission.state === "active" && mission.source === "situation"
    )
    .sort(compareMission)
    .slice(0, 1);
  const terminal = missions
    .filter(
      (
        mission
      ): mission is V2MissionView &
        Readonly<{
          state: "completed" | "failed";
          terminalAtSeconds: number;
        }> =>
        mission.state === "completed" || mission.state === "failed"
    )
    .sort(
      (left, right) =>
        right.terminalAtSeconds - left.terminalAtSeconds ||
        left.id.localeCompare(right.id)
    );
  return Object.freeze([
    ...activeNormal,
    ...activeSituation,
    ...terminal
  ]);
};

const createMissionItem = (
  document: Document,
  mission: V2MissionView,
  elapsedSeconds: number
) => {
  const item = document.createElement("div");
  item.dataset.v2MissionHudRole = "mission-item";
  item.dataset.v2MissionId = mission.id;
  item.dataset.v2MissionState = mission.state;
  const statusColor =
    mission.state === "completed"
      ? "#9cff57"
      : mission.state === "failed"
        ? "#ff7777"
        : mission.source === "situation"
          ? "#ffca66"
          : "#f5f5f5";
  applyStyles(item, {
    minWidth: "290px",
    maxWidth: "420px",
    padding: "7px 10px",
    border: `1px solid ${statusColor}`,
    borderRadius: "4px",
    background: "rgba(0, 0, 0, 0.72)",
    color: statusColor,
    boxShadow: `0 0 7px ${statusColor}33`,
    fontFamily:
      '"IBM Plex Mono", "Fira Code", ui-monospace, monospace',
    fontSize: "13px",
    letterSpacing: "0.025em",
    lineHeight: "1.35",
    textAlign: "left"
  });
  if (mission.state === "active") {
    const remainingSeconds = Math.max(
      0,
      Math.ceil(mission.deadlineAtSeconds - elapsedSeconds)
    );
    item.textContent = `${mission.title}｜${mission.targetDisplayName}｜残り ${remainingSeconds}秒`;
  } else {
    item.textContent = `${mission.state === "completed" ? "完了" : "失敗"}｜${mission.title}｜${mission.targetDisplayName}`;
  }
  return item;
};

export const createV2MissionHudController = ({
  host
}: V2MissionHudControllerOptions): V2MissionHudController => {
  const document = host.ownerDocument;
  const root = document.createElement("section");
  root.dataset.v2MissionHud = "root";
  root.hidden = true;
  applyStyles(root, {
    position: "fixed",
    top: "18px",
    right: "18px",
    display: "grid",
    gap: "6px",
    justifyItems: "end",
    pointerEvents: "none",
    zIndex: HUD_Z_INDEX
  });
  host.appendChild(root);
  let disposed = false;

  const assertActive = () => {
    if (disposed) {
      throw new Error("破棄済みのV2MissionHudControllerは使用できません。");
    }
  };

  const clear = () => {
    root.replaceChildren();
    root.hidden = true;
  };

  return {
    update: ({ active, frame }) => {
      assertActive();
      if (!active) {
        clear();
        return;
      }
      const missions = selectVisibleMissions(frame.playerMissions);
      root.replaceChildren(
        ...missions.map((mission) =>
          createMissionItem(document, mission, frame.elapsedSeconds)
        )
      );
      root.hidden = missions.length === 0;
    },
    clear: () => {
      assertActive();
      clear();
    },
    dispose: () => {
      assertActive();
      clear();
      disposed = true;
      root.remove();
    }
  };
};
