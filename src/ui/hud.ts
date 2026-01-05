import { Vector3 } from "@babylonjs/core";
import { CELL_SCALE, GridLayout } from "../world/grid";

export type DrawMinimapParams = {
  cameraPosition: Vector3;
  cameraForward: Vector3;
  cameraFov: number;
  layout: GridLayout;
  minimapCellSize: number;
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
  setCrosshairVisible: (visible: boolean) => void;
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
  minimapContext.imageSmoothingEnabled = true;
  minimapContext.imageSmoothingQuality = "high";
  const minimap = {
    sizePixels: 132,
    windowCells: 40 * CELL_SCALE,
    fanCells: 12 * CELL_SCALE
  };
  const minimapSize = minimap.sizePixels;
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

  const setCrosshairVisible = (visible: boolean) => {
    crosshair.style.display = visible ? "block" : "none";
  };

  const drawMinimap = ({
    cameraPosition,
    cameraForward,
    cameraFov,
    layout,
    minimapCellSize,
    halfWidth,
    halfDepth,
    elapsedTime,
    aliveCount,
    retryText,
    showCrosshair
  }: DrawMinimapParams) => {
    const cellPixels = minimapSize / minimap.windowCells;
    const halfCells = Math.floor(minimap.windowCells / 2);
    const centerCol = Math.floor(
      (cameraPosition.x + halfWidth) / minimapCellSize
    );
    const centerRow = Math.floor(
      (cameraPosition.z + halfDepth) / minimapCellSize
    );
    const infoX = Math.round(cameraPosition.x / minimapCellSize);
    const infoZ = Math.round(cameraPosition.z / minimapCellSize);
    minimapInfo.textContent = `X:${infoX}  Z:${infoZ}\nCell:${centerRow},${centerCol}`;
    timeInfo.textContent = `Time: ${elapsedTime.toFixed(1)}s`;
    aliveInfo.textContent = `Alive: ${aliveCount}`;

    minimapContext.clearRect(0, 0, minimapSize, minimapSize);

    const theta = Math.atan2(cameraForward.z, cameraForward.x);
    const rotation = -Math.PI / 2 + theta;
    const centerX = minimapSize / 2;
    const centerY = minimapSize / 2;

    minimapContext.save();
    minimapContext.translate(centerX, centerY);
    minimapContext.rotate(rotation);
    minimapContext.translate(-centerX, -centerY);

    const minOffset = -halfCells;
    const maxOffset = minOffset + minimap.windowCells - 1;
    const cellOverlap = 0.6;
    const cellDrawSize = cellPixels + cellOverlap;
    const cellDrawOffset = cellDrawSize / 2;
    for (let rowOffset = minOffset; rowOffset <= maxOffset; rowOffset += 1) {
      const row = centerRow + rowOffset;
      const worldZ = -halfDepth + minimapCellSize / 2 + row * minimapCellSize;
      const layoutRow = Math.floor(
        (worldZ + halfDepth) / layout.cellSize
      );
      for (let colOffset = minOffset; colOffset <= maxOffset; colOffset += 1) {
        const col = centerCol + colOffset;
        const worldX =
          -halfWidth + minimapCellSize / 2 + col * minimapCellSize;
        const layoutCol = Math.floor(
          (worldX + halfWidth) / layout.cellSize
        );
        const isFloor =
          layoutRow >= 0 &&
          layoutRow < layout.rows &&
          layoutCol >= 0 &&
          layoutCol < layout.columns &&
          layout.cells[layoutRow][layoutCol] === "floor";

        minimapContext.fillStyle = isFloor ? "#a57bc4" : "#1b1b1b";
        minimapContext.fillRect(
          centerX + colOffset * cellPixels - cellDrawOffset,
          centerY - rowOffset * cellPixels - cellDrawOffset,
          cellDrawSize,
          cellDrawSize
        );
      }
    }

    minimapContext.restore();

    const angle = -Math.PI / 2;
    const fanHalfAngle = cameraFov / 2;
    const fanRadius = minimap.fanCells * cellPixels;
    minimapContext.beginPath();
    minimapContext.moveTo(centerX, centerY);
    minimapContext.arc(
      centerX,
      centerY,
      fanRadius,
      angle - fanHalfAngle,
      angle + fanHalfAngle
    );
    minimapContext.closePath();
    minimapContext.fillStyle = "rgba(245, 245, 245, 0.25)";
    minimapContext.fill();
    minimapContext.strokeStyle = "rgba(20, 20, 20, 0.6)";
    minimapContext.lineWidth = 1;
    minimapContext.stroke();

    const markerBase = cellPixels;
    const markerSize = Math.max(4, Math.floor(markerBase * 0.4));
    const markerOffset = markerSize / 2;
    minimapContext.fillStyle = "#f5f5f5";
    minimapContext.fillRect(
      centerX - markerOffset,
      centerY - markerOffset,
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

  return {
    setHudVisible,
    setTitleVisible,
    setStateInfo,
    setFadeOpacity,
    setCrosshairVisible,
    drawMinimap
  };
};
