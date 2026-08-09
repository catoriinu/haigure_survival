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

const createMissionText = (
  mission: V2MissionView,
  elapsedSeconds: number
): Readonly<{ title: string; meta: string }> => {
  const terminalLabel = mission.state === "completed" ? "完了" : "失敗";
  const remainingText =
    mission.state === "active"
      ? `残り ${Math.max(0, Math.ceil(mission.deadlineAtSeconds - elapsedSeconds))}秒`
      : terminalLabel;
  if (mission.kind === "player-follower-acquire") {
    const { acquiredCount, requiredCount } = mission.target;
    return Object.freeze({
      title: `新しいFollowerを${requiredCount}人獲得する`,
      meta:
        mission.state === "active"
          ? `獲得 ${acquiredCount} / ${requiredCount}　${remainingText}`
          : `${remainingText}　獲得 ${acquiredCount} / ${requiredCount}`
    });
  }
  if (mission.kind === "player-location") {
    return Object.freeze({
      title: `${mission.targetDisplayName}へ行く`,
      meta: remainingText
    });
  }
  return Object.freeze({
    title: mission.title,
    meta:
      mission.state === "active"
        ? `${mission.targetDisplayName}　${remainingText}`
        : `${remainingText}　${mission.targetDisplayName}`
  });
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
    display: "grid",
    gap: "2px",
    color: statusColor,
    textAlign: "left"
  });
  const text = createMissionText(mission, elapsedSeconds);
  const title = document.createElement("div");
  title.dataset.v2MissionHudRole = "mission-title";
  title.textContent = text.title;
  applyStyles(title, {
    fontSize: "13px",
    fontWeight: "600",
    letterSpacing: "0.025em",
    lineHeight: "1.35"
  });
  const meta = document.createElement("div");
  meta.dataset.v2MissionHudRole = "mission-meta";
  meta.textContent = text.meta;
  applyStyles(meta, {
    fontSize: "12px",
    letterSpacing: "0.02em",
    lineHeight: "1.35",
    opacity: "0.88"
  });
  item.replaceChildren(title, meta);
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
    width: "min(420px, calc(100vw - 36px))",
    minWidth: "290px",
    padding: "10px 12px 12px",
    border: "1px solid rgba(245, 245, 245, 0.48)",
    borderRadius: "6px",
    background: "rgba(0, 0, 0, 0.72)",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.48)",
    display: "grid",
    gap: "8px",
    fontFamily:
      '"IBM Plex Mono", "Fira Code", ui-monospace, monospace',
    pointerEvents: "none",
    zIndex: HUD_Z_INDEX
  });
  const heading = document.createElement("h2");
  heading.dataset.v2MissionHudRole = "heading";
  heading.textContent = "MISSION";
  applyStyles(heading, {
    margin: "0",
    color: "#f5f5f5",
    fontSize: "14px",
    fontWeight: "700",
    letterSpacing: "0.14em",
    lineHeight: "1.2"
  });
  const list = document.createElement("div");
  list.dataset.v2MissionHudRole = "mission-list";
  applyStyles(list, {
    display: "grid",
    gap: "9px"
  });
  host.appendChild(root);
  let disposed = false;

  const assertActive = () => {
    if (disposed) {
      throw new Error("破棄済みのV2MissionHudControllerは使用できません。");
    }
  };

  const clear = () => {
    list.replaceChildren();
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
      if (missions.length === 0) {
        clear();
        return;
      }
      list.replaceChildren(
        ...missions.map((mission) =>
          createMissionItem(document, mission, frame.elapsedSeconds)
        )
      );
      root.replaceChildren(heading, list);
      root.hidden = false;
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
