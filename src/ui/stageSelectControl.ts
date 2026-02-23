import type { StageSelection } from "../world/stageSelection";

type StageSelectControlOptions = {
  parent: HTMLElement;
  stages: StageSelection[];
  initialStageId: string;
  initialAlarmTrapEnabled: boolean;
  onChange: (stageId: string) => void;
  onAlarmTrapEnabledChange: (enabled: boolean) => void;
  className?: string;
};

export type StageSelectControl = {
  root: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  setSelectedStageId: (stageId: string) => void;
  getAlarmTrapEnabled: () => boolean;
  setAlarmTrapEnabled: (enabled: boolean) => void;
  setAlarmTrapEditable: (enabled: boolean) => void;
};

export const createStageSelectControl = ({
  parent,
  stages,
  initialStageId,
  initialAlarmTrapEnabled,
  onChange,
  onAlarmTrapEnabledChange,
  className
}: StageSelectControlOptions): StageSelectControl => {
  const root = document.createElement("div");
  root.className = className
    ? `stage-select-control ${className}`
    : "stage-select-control";
  root.dataset.ui = "stage-select-control";

  const title = document.createElement("div");
  title.className = "stage-select-control__title";
  title.textContent = "STAGE";
  root.appendChild(title);

  const select = document.createElement("select");
  select.className = "stage-select-control__select";
  for (const stage of stages) {
    const option = document.createElement("option");
    option.value = stage.id;
    option.textContent = stage.label;
    select.appendChild(option);
  }
  select.value = initialStageId;
  select.addEventListener("change", () => {
    onChange(select.value);
  });
  root.appendChild(select);

  const alarmRow = document.createElement("label");
  alarmRow.className = "stage-select-control__checkbox-row";
  const alarmCheckbox = document.createElement("input");
  alarmCheckbox.className = "stage-select-control__checkbox";
  alarmCheckbox.type = "checkbox";
  alarmCheckbox.checked = initialAlarmTrapEnabled;
  alarmCheckbox.addEventListener("change", () => {
    onAlarmTrapEnabledChange(alarmCheckbox.checked);
  });
  alarmRow.appendChild(alarmCheckbox);
  const alarmLabel = document.createElement("span");
  alarmLabel.className = "stage-select-control__checkbox-label";
  alarmLabel.textContent = "アラームトラップ有効化";
  alarmRow.appendChild(alarmLabel);
  root.appendChild(alarmRow);

  parent.appendChild(root);

  return {
    root,
    setVisible: (visible) => {
      root.style.display = visible ? "" : "none";
    },
    setSelectedStageId: (stageId) => {
      select.value = stageId;
    },
    getAlarmTrapEnabled: () => alarmCheckbox.checked,
    setAlarmTrapEnabled: (enabled) => {
      alarmCheckbox.checked = enabled;
      onAlarmTrapEnabledChange(enabled);
    },
    setAlarmTrapEditable: (enabled) => {
      alarmCheckbox.disabled = !enabled;
    }
  };
};
