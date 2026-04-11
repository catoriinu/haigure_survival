export type SettingsPanel<TState> = {
  root: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  getSettings: () => TState;
  setSettings: (nextSettings: TState) => void;
};

type TitledSettingsPanelRootOptions = {
  blockClassName: string;
  className?: string;
  titleText: string;
  uiId?: string;
};

export const createTitledSettingsPanelRoot = ({
  blockClassName,
  className,
  titleText,
  uiId
}: TitledSettingsPanelRootOptions): HTMLDivElement => {
  const root = document.createElement("div");
  root.className = className ? `${blockClassName} ${className}` : blockClassName;
  root.dataset.ui = uiId ?? blockClassName;

  const title = document.createElement("div");
  title.className = `${blockClassName}__title`;
  title.textContent = titleText;
  root.appendChild(title);

  return root;
};

type SettingsPanelControlsOptions<TState extends object> = {
  root: HTMLDivElement;
  settings: TState;
  applySettings: (nextSettings: TState) => void;
  render: () => void;
  onChange: (settings: TState) => void;
};

export const createSettingsPanelControls = <TState extends object>({
  root,
  settings,
  applySettings,
  render,
  onChange
}: SettingsPanelControlsOptions<TState>) => {
  const emit = () => {
    onChange({ ...settings });
  };

  const setVisible = (visible: boolean) => {
    root.style.display = visible ? "" : "none";
  };

  const getSettings = () => ({ ...settings });

  const setSettings = (nextSettings: TState) => {
    applySettings(nextSettings);
    render();
    emit();
  };

  return {
    emit,
    setVisible,
    getSettings,
    setSettings
  };
};
