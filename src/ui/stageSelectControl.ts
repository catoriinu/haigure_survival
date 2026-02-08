import type { StageSelection } from "../world/stageSelection";

type StageSelectControlOptions = {
  parent: HTMLElement;
  stages: StageSelection[];
  initialStageId: string;
  onChange: (stageId: string) => void;
  className?: string;
};

export type StageSelectControl = {
  root: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  setSelectedStageId: (stageId: string) => void;
};

export const createStageSelectControl = ({
  parent,
  stages,
  initialStageId,
  onChange,
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

  parent.appendChild(root);

  return {
    root,
    setVisible: (visible) => {
      root.style.display = visible ? "" : "none";
    },
    setSelectedStageId: (stageId) => {
      select.value = stageId;
    }
  };
};
