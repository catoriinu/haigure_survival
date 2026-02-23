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
  surviveTime: number | null;
  trapBeamCount: number | null;
  trapSurviveCount: number | null;
  rouletteRoundCount: number | null;
  rouletteSurviveCount: number | null;
  aliveCount: number;
  retryText: string | null;
  showCrosshair: boolean;
  trackedNpcPositions: Vector3[];
};

export type Hud = {
  setHudVisible: (visible: boolean) => void;
  setTitleVisible: (visible: boolean) => void;
  setTitleText: (text: string) => void;
  setStateInfo: (text: string | null) => void;
  setFadeOpacity: (value: number) => void;
  setMinimapReadoutVisible: (visible: boolean) => void;
  setCrosshairVisible: (visible: boolean) => void;
  drawMinimap: (params: DrawMinimapParams) => void;
};

export const createHud = (): Hud => {
  const minimapCanvas =
    document.getElementById("minimapCanvas") as unknown as HTMLCanvasElement;
  const minimapReadout =
    document.getElementById("minimapReadout") as unknown as HTMLDivElement;
  const statusInfo =
    document.getElementById("statusInfo") as unknown as HTMLDivElement;
  const helpPanel =
    document.getElementById("helpPanel") as unknown as HTMLDivElement;
  const titleOverlay =
    document.getElementById("titleOverlay") as unknown as HTMLDivElement;
  const titleMessage =
    document.getElementById("titleMessage") as unknown as HTMLDivElement;
  const overlayHelp =
    document.getElementById("overlayHelp") as unknown as HTMLDivElement;
  const fadeOverlay =
    document.getElementById("fadeOverlay") as unknown as HTMLDivElement;
  const crosshair =
    document.getElementById("crosshair") as unknown as HTMLDivElement;
  const minimapContext = minimapCanvas.getContext(
    "2d"
  ) as CanvasRenderingContext2D;
  minimapContext.imageSmoothingEnabled = true;
  minimapContext.imageSmoothingQuality = "high";
  let hudVisible = true;
  let minimapReadoutVisible = false;
  const minimap = {
    sizePixels: 180,
    windowCells: 18 * CELL_SCALE,
    fanCells: 6 * CELL_SCALE
  };
  const minimapSize = minimap.sizePixels;
  minimapCanvas.width = minimapSize;
  minimapCanvas.height = minimapSize;

  const applyMinimapReadoutDisplay = () => {
    minimapReadout.style.display =
      hudVisible && minimapReadoutVisible ? "block" : "none";
  };

  const setHudVisible = (visible: boolean) => {
    hudVisible = visible;
    const display = visible ? "block" : "none";
    minimapCanvas.style.display = display;
    statusInfo.style.display = display;
    helpPanel.style.display = "none";
    crosshair.style.display = "none";
    applyMinimapReadoutDisplay();
  };

  const setTitleVisible = (visible: boolean) => {
    titleOverlay.style.display = visible ? "flex" : "none";
  };

  const setTitleText = (text: string) => {
    titleMessage.textContent = text;
  };

  const setStateInfo = (text: string | null) => {
    if (text) {
      overlayHelp.textContent = text;
      overlayHelp.style.display = "block";
    } else {
      overlayHelp.textContent = "";
      overlayHelp.style.display = "none";
    }
  };

  const setFadeOpacity = (value: number) => {
    fadeOverlay.style.opacity = value.toFixed(2);
  };

  const setMinimapReadoutVisible = (visible: boolean) => {
    minimapReadoutVisible = visible;
    applyMinimapReadoutDisplay();
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
    surviveTime,
    trapBeamCount,
    trapSurviveCount,
    rouletteRoundCount,
    rouletteSurviveCount,
    aliveCount,
    retryText,
    showCrosshair,
    trackedNpcPositions
  }: DrawMinimapParams) => {
    const cellPixels = minimapSize / minimap.windowCells;
    const halfCells = Math.floor(minimap.windowCells / 2);
    const drawHalfCells = Math.ceil(halfCells * Math.SQRT2) + 1;
    const centerCol = Math.floor(
      (cameraPosition.x + halfWidth) / minimapCellSize
    );
    const centerRow = Math.floor(
      (cameraPosition.z + halfDepth) / minimapCellSize
    );
    const infoX = Math.round(cameraPosition.x / minimapCellSize);
    const infoZ = Math.round(cameraPosition.z / minimapCellSize);
    minimapReadout.textContent = `X:${infoX}  Z:${infoZ}\nCell:${centerRow},${centerCol}`;
    const infoLines = [`未洗脳者数: ${aliveCount}人`];
    let timeLine = `経過時間: ${elapsedTime.toFixed(1)}秒`;
    if (surviveTime !== null) {
      timeLine += `  生存時間: ${surviveTime.toFixed(1)}秒`;
    }
    infoLines.push(timeLine);
    if (trapBeamCount !== null) {
      let trapLine = `トラップ発射回数: ${trapBeamCount}回`;
      if (trapSurviveCount !== null) {
        trapLine += `  生存回数: ${trapSurviveCount}回`;
      }
      infoLines.push(trapLine);
    }
    if (rouletteRoundCount !== null) {
      let rouletteLine = `ルーレット回数: ${rouletteRoundCount}回`;
      if (rouletteSurviveCount !== null) {
        rouletteLine += `  生存回数: ${rouletteSurviveCount}回`;
      }
      infoLines.push(rouletteLine);
    }
    statusInfo.textContent = infoLines.join("\n");

    minimapContext.clearRect(0, 0, minimapSize, minimapSize);

    const theta = Math.atan2(cameraForward.z, cameraForward.x);
    const rotation = -Math.PI / 2 + theta;
    const centerX = minimapSize / 2;
    const centerY = minimapSize / 2;
    const borderWidth = 2;
    const minimapRadius = minimapSize / 2 - borderWidth * 0.5;

    minimapContext.save();
    minimapContext.beginPath();
    minimapContext.arc(
      centerX,
      centerY,
      minimapRadius,
      0,
      Math.PI * 2
    );
    minimapContext.clip();

    minimapContext.save();
    minimapContext.translate(centerX, centerY);
    minimapContext.rotate(rotation);
    minimapContext.translate(-centerX, -centerY);

    const minOffset = -drawHalfCells;
    const maxOffset = drawHalfCells;
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

    const trackedMarkerSize = Math.max(3, Math.floor(cellPixels * 0.35));
    const trackedMarkerOffset = trackedMarkerSize / 2;
    minimapContext.fillStyle = "#66e8ff";
    for (const npcPosition of trackedNpcPositions) {
      const trackedCol = Math.floor(
        (npcPosition.x + halfWidth) / minimapCellSize
      );
      const trackedRow = Math.floor(
        (npcPosition.z + halfDepth) / minimapCellSize
      );
      const colOffset = trackedCol - centerCol;
      const rowOffset = trackedRow - centerRow;
      minimapContext.fillRect(
        centerX + colOffset * cellPixels - trackedMarkerOffset,
        centerY - rowOffset * cellPixels - trackedMarkerOffset,
        trackedMarkerSize,
        trackedMarkerSize
      );
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

    minimapContext.restore();

    minimapContext.strokeStyle = "#000000";
    minimapContext.lineWidth = borderWidth;
    minimapContext.beginPath();
    minimapContext.arc(
      centerX,
      centerY,
      minimapRadius,
      0,
      Math.PI * 2
    );
    minimapContext.stroke();

    const northAngle = theta;
    const northFontSize = 12;
    const northRadius = minimapRadius - northFontSize * 0.5;
    const northX = centerX + Math.cos(northAngle) * northRadius;
    const northY = centerY + Math.sin(northAngle) * northRadius;
    minimapContext.font = `bold ${northFontSize}px ui-monospace, monospace`;
    minimapContext.textAlign = "center";
    minimapContext.textBaseline = "middle";
    minimapContext.lineWidth = 2;
    minimapContext.strokeStyle = "rgba(0, 0, 0, 0.7)";
    minimapContext.strokeText("N", northX, northY);
    minimapContext.fillStyle = "#f5f5f5";
    minimapContext.fillText("N", northX, northY);

    helpPanel.style.display = retryText ? "block" : "none";
    helpPanel.textContent = retryText ?? "";

    crosshair.style.display = showCrosshair ? "block" : "none";
  };

  applyMinimapReadoutDisplay();

  return {
    setHudVisible,
    setTitleVisible,
    setTitleText,
    setStateInfo,
    setFadeOpacity,
    setMinimapReadoutVisible,
    setCrosshairVisible,
    drawMinimap
  };
};
