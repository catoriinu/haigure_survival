import { Vector3 } from "@babylonjs/core";
import { GridLayout } from "../world/grid";

export type DrawMinimapParams = {
  cameraPosition: Vector3;
  cameraForward: Vector3;
  layout: GridLayout;
  halfWidth: number;
  halfDepth: number;
  elapsedTime: number;
  aliveCount: number;
  retryText: string | null;
  showCrosshair: boolean;
};

export type Hud = {
  setHudVisible: (visible: boolean) => void;
  setTitleVisible: (visible: boolean) => void;
  setStateInfo: (text: string | null) => void;
  setFadeOpacity: (value: number) => void;
  drawMinimap: (params: DrawMinimapParams) => void;
};

export const createHud = (): Hud => {
  const minimapCanvas = document.getElementById(
    "minimapCanvas"
  ) as HTMLCanvasElement;
  const minimapInfo = document.getElementById(
    "minimapInfo"
  ) as HTMLDivElement;
  const timeInfo = document.getElementById("timeInfo") as HTMLDivElement;
  const aliveInfo = document.getElementById("aliveInfo") as HTMLDivElement;
  const retryInfo = document.getElementById("retryInfo") as HTMLDivElement;
  const titleScreen = document.getElementById("titleScreen") as HTMLDivElement;
  const stateInfo = document.getElementById("stateInfo") as HTMLDivElement;
  const fadeOverlay = document.getElementById("fadeOverlay") as HTMLDivElement;
  const crosshair = document.getElementById("crosshair") as HTMLDivElement;
  const minimapContext = minimapCanvas.getContext(
    "2d"
  ) as CanvasRenderingContext2D;
  const minimap = {
    cells: 11,
    cellPixels: 12,
    fanRadius: 30,
    fanHalfAngle: Math.PI / 7
  };
  const minimapSize = minimap.cells * minimap.cellPixels;
  minimapCanvas.width = minimapSize;
  minimapCanvas.height = minimapSize;

  const setHudVisible = (visible: boolean) => {
    const display = visible ? "block" : "none";
    minimapCanvas.style.display = display;
    minimapInfo.style.display = display;
    timeInfo.style.display = display;
    aliveInfo.style.display = display;
    retryInfo.style.display = "none";
    crosshair.style.display = "none";
  };

  const setTitleVisible = (visible: boolean) => {
    titleScreen.style.display = visible ? "flex" : "none";
  };

  const setStateInfo = (text: string | null) => {
    if (text) {
      stateInfo.textContent = text;
      stateInfo.style.display = "block";
    } else {
      stateInfo.textContent = "";
      stateInfo.style.display = "none";
    }
  };

  const setFadeOpacity = (value: number) => {
    fadeOverlay.style.opacity = value.toFixed(2);
  };

  const drawMinimap = ({
    cameraPosition,
    cameraForward,
    layout,
    halfWidth,
    halfDepth,
    elapsedTime,
    aliveCount,
    retryText,
    showCrosshair
  }: DrawMinimapParams) => {
    const halfCells = Math.floor(minimap.cells / 2);
    const centerCol = Math.floor(
      (cameraPosition.x + halfWidth) / layout.cellSize
    );
    const centerRow = Math.floor(
      (cameraPosition.z + halfDepth) / layout.cellSize
    );
    const infoX = Math.round(cameraPosition.x * 10) / 10;
    const infoZ = Math.round(cameraPosition.z * 10) / 10;
    minimapInfo.textContent = `X:${infoX}  Z:${infoZ}\nCell:${centerRow},${centerCol}`;
    timeInfo.textContent = `Time: ${elapsedTime.toFixed(1)}s`;
    aliveInfo.textContent = `Alive: ${aliveCount}`;

    minimapContext.clearRect(0, 0, minimapSize, minimapSize);

    const theta = Math.atan2(cameraForward.z, cameraForward.x);
    const rotation = -Math.PI / 2 - theta;
    const centerX = halfCells * minimap.cellPixels + minimap.cellPixels / 2;
    const centerY = halfCells * minimap.cellPixels + minimap.cellPixels / 2;

    minimapContext.save();
    minimapContext.translate(centerX, centerY);
    minimapContext.rotate(rotation);
    minimapContext.translate(-centerX, -centerY);

    for (let rowOffset = -halfCells; rowOffset <= halfCells; rowOffset += 1) {
      for (let colOffset = -halfCells; colOffset <= halfCells; colOffset += 1) {
        const row = centerRow + rowOffset;
        const col = centerCol + colOffset;
        const isFloor =
          row >= 0 &&
          row < layout.rows &&
          col >= 0 &&
          col < layout.columns &&
          layout.cells[row][col] === "floor";

        minimapContext.fillStyle = isFloor ? "#a57bc4" : "#1b1b1b";
        minimapContext.fillRect(
          (colOffset + halfCells) * minimap.cellPixels,
          (halfCells - rowOffset) * minimap.cellPixels,
          minimap.cellPixels,
          minimap.cellPixels
        );
      }
    }

    minimapContext.restore();

    const angle = -Math.PI / 2;
    minimapContext.beginPath();
    minimapContext.moveTo(centerX, centerY);
    minimapContext.arc(
      centerX,
      centerY,
      minimap.fanRadius,
      angle - minimap.fanHalfAngle,
      angle + minimap.fanHalfAngle
    );
    minimapContext.closePath();
    minimapContext.fillStyle = "rgba(245, 245, 245, 0.25)";
    minimapContext.fill();
    minimapContext.strokeStyle = "rgba(20, 20, 20, 0.6)";
    minimapContext.lineWidth = 1;
    minimapContext.stroke();

    const markerSize = Math.max(4, Math.floor(minimap.cellPixels * 0.4));
    const markerOffset = (minimap.cellPixels - markerSize) / 2;
    minimapContext.fillStyle = "#f5f5f5";
    minimapContext.fillRect(
      halfCells * minimap.cellPixels + markerOffset,
      halfCells * minimap.cellPixels + markerOffset,
      markerSize,
      markerSize
    );

    minimapContext.strokeStyle = "#000000";
    minimapContext.lineWidth = 2;
    minimapContext.strokeRect(0, 0, minimapSize, minimapSize);

    retryInfo.style.display = retryText ? "block" : "none";
    retryInfo.textContent = retryText ?? "";

    crosshair.style.display = showCrosshair ? "block" : "none";
  };

  return { setHudVisible, setTitleVisible, setStateInfo, setFadeOpacity, drawMinimap };
};
