import type {
  V2MissionFrame,
  V2MissionView
} from "../v2/missionRuntime";

export type V2MissionHudUpdate = Readonly<{
  mode: "hidden" | "missions" | "results";
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
      ? mission.deadlineAtSeconds === null
        ? "時間制限なし"
        : `${mission.kind === "player-follower-escort" ? "達成まで" : "失敗まで"} ${Math.max(0, Math.ceil(mission.deadlineAtSeconds - elapsedSeconds))}秒`
      : terminalLabel;
  if (mission.kind === "player-follower-acquire") {
    const { acquiredCount, requiredCount } = mission.target;
    return Object.freeze({
      title: `新しい同行者を${requiredCount}人同行させる`,
      meta:
        mission.state === "active"
          ? `同行 ${acquiredCount} / ${requiredCount}　${remainingText}\n${mission.target.candidateLocationDisplayName}`
          : `${remainingText}　同行 ${acquiredCount} / ${requiredCount}\n${mission.target.candidateLocationDisplayName}`
    });
  }
  if (mission.kind === "player-brainwash-target") {
    const { brainwashedCount, requiredCount } = mission.target;
    return Object.freeze({
      title: `${requiredCount}人洗脳する`,
      meta:
        mission.state === "active"
          ? `洗脳 ${brainwashedCount} / ${requiredCount}　${remainingText}\n${mission.target.candidateLocationDisplayName}`
          : `${remainingText}　洗脳 ${brainwashedCount} / ${requiredCount}\n${mission.target.candidateLocationDisplayName}`
    });
  }
  if (mission.kind === "player-location") {
    return Object.freeze({
      title: `${mission.targetDisplayName}へ行く`,
      meta: remainingText
    });
  }
  if (mission.kind === "player-last-unbrainwashed") {
    return Object.freeze({
      title: mission.title,
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
    lineHeight: "1.35",
    whiteSpace: "nowrap"
  });
  const meta = document.createElement("div");
  meta.dataset.v2MissionHudRole = "mission-meta";
  meta.textContent = text.meta;
  applyStyles(meta, {
    fontSize: "12px",
    letterSpacing: "0.02em",
    lineHeight: "1.35",
    opacity: "0.88",
    whiteSpace: "pre-line"
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
    width: "min(350px, calc(100vw - 36px))",
    padding: "10px 12px 12px",
    border: "1px solid rgba(245, 245, 245, 0.48)",
    borderRadius: "6px",
    background: "rgba(0, 0, 0, 0.72)",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.48)",
    display: "none",
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
  let displayOrderIds: readonly string[] = Object.freeze([]);

  const assertActive = () => {
    if (disposed) {
      throw new Error("破棄済みのV2MissionHudControllerは使用できません。");
    }
  };

  const clear = () => {
    displayOrderIds = Object.freeze([]);
    list.replaceChildren();
    root.replaceChildren();
    root.hidden = true;
    root.style.display = "none";
  };

  return {
    update: ({ mode, frame }) => {
      assertActive();
      if (mode === "hidden") {
        clear();
        return;
      }
      if (mode === "results") {
        displayOrderIds = Object.freeze([]);
        heading.textContent = "MISSION RESULT";
        const createResultRow = (
          label: string,
          result: Readonly<{ completed: number; failed: number }>
        ) => {
          const row = document.createElement("div");
          row.dataset.v2MissionHudRole = "result-row";
          row.textContent = `${label}　完了 ${result.completed}　失敗 ${result.failed}`;
          applyStyles(row, {
            color: "#f5f5f5",
            fontSize: "13px",
            lineHeight: "1.5"
          });
          return row;
        };
        list.replaceChildren(
          createResultRow("未洗脳時", frame.playerMissionResults.unbrainwashed),
          createResultRow("洗脳済み時", frame.playerMissionResults.brainwashed)
        );
        root.replaceChildren(heading, list);
        root.hidden = false;
        root.style.display = "grid";
        return;
      }
      heading.textContent = "MISSION";
      const selectedMissions = selectVisibleMissions(frame.playerMissions);
      if (selectedMissions.length === 0) {
        clear();
        return;
      }
      const selectedById = new Map(
        selectedMissions.map((mission) => [mission.id, mission] as const)
      );
      const displayedMissionDisappeared = displayOrderIds.some(
        (missionId) => !selectedById.has(missionId)
      );
      if (displayedMissionDisappeared) {
        displayOrderIds = Object.freeze(
          selectedMissions.map((mission) => mission.id)
        );
      } else {
        const existingIds = new Set(displayOrderIds);
        displayOrderIds = Object.freeze([
          ...displayOrderIds,
          ...selectedMissions
            .filter((mission) => !existingIds.has(mission.id))
            .map((mission) => mission.id)
        ]);
      }
      const missions = displayOrderIds.map((missionId) => {
        const mission = selectedById.get(missionId);
        if (!mission) {
          throw new Error(`表示中Missionが選択結果にありません: ${missionId}`);
        }
        return mission;
      });
      list.replaceChildren(
        ...missions.map((mission) =>
          createMissionItem(document, mission, frame.elapsedSeconds)
        )
      );
      root.replaceChildren(heading, list);
      root.hidden = false;
      root.style.display = "grid";
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
