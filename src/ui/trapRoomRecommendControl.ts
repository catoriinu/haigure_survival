export type TrapRoomRecommendControl = {
  root: HTMLButtonElement;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
};

type TrapRoomRecommendControlOptions = {
  parent: HTMLElement;
  onApply: () => void;
};

export const createTrapRoomRecommendControl = ({
  parent,
  onApply
}: TrapRoomRecommendControlOptions): TrapRoomRecommendControl => {
  const root = document.createElement("button");
  root.className = "title-trap-room-recommend-button";
  root.type = "button";
  root.dataset.ui = "trap-room-recommend-button";
  root.textContent = "トラップルーム推奨設定を適用する";
  root.style.display = "none";

  const handleClick = () => {
    onApply();
  };

  root.addEventListener("click", handleClick);
  parent.appendChild(root);

  return {
    root,
    setVisible: (visible) => {
      root.style.display = visible ? "block" : "none";
    },
    dispose: () => {
      root.removeEventListener("click", handleClick);
      root.remove();
    }
  };
};
