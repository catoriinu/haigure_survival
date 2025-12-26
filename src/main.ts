import "./style.css";
import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  HemisphericLight,
  Color3
} from "@babylonjs/core";
import { createGridLayout } from "./world/grid";
import { createStageFromGrid } from "./world/stage";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

const layout = createGridLayout();
const room = {
  width: layout.columns * layout.cellSize,
  depth: layout.rows * layout.cellSize,
  height: layout.height
};
const eyeHeight = 1.6;
const halfWidth = room.width / 2;
const halfDepth = room.depth / 2;
const spawnPosition = new Vector3(
  -halfWidth + layout.cellSize / 2 + layout.spawn.col * layout.cellSize,
  eyeHeight,
  -halfDepth + layout.cellSize / 2 + layout.spawn.row * layout.cellSize
);

const camera = new FreeCamera(
  "camera",
  spawnPosition,
  scene
);
camera.setTarget(spawnPosition.add(new Vector3(0, 0, 1)));
camera.attachControl(canvas, true);
camera.speed = 0.25;
camera.angularSensibility = 1500;
camera.keysUp = [87];
camera.keysDown = [83];
camera.keysLeft = [65];
camera.keysRight = [68];
camera.checkCollisions = true;
camera.ellipsoid = new Vector3(0.5, 0.9, 0.5);

canvas.addEventListener("click", () => {
  canvas.requestPointerLock();
});

const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
light.intensity = 1.2;
scene.ambientColor = new Color3(0.45, 0.45, 0.45);
scene.collisionsEnabled = true;

createStageFromGrid(scene, layout, {
  floorColor: new Color3(0.55, 0.2, 0.75),
  ceilingColor: new Color3(0.88, 0.88, 0.88),
  wallBaseColor: new Color3(0.88, 0.88, 0.88),
  floorGridColor: new Color3(0.07, 0.07, 0.07),
  wallGridColor: new Color3(0.07, 0.07, 0.07),
  gridSpacingWorld: 2,
  gridCellsPerTexture: 8,
  gridLineWidthPx: 3,
  gridTextureSize: 512,
  enableCollisions: true
});

const minimapCanvas = document.getElementById(
  "minimapCanvas"
) as HTMLCanvasElement;
const minimapInfo = document.getElementById(
  "minimapInfo"
) as HTMLDivElement;
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

const drawMinimap = () => {
  const halfCells = Math.floor(minimap.cells / 2);
  const centerCol = Math.floor(
    (camera.position.x + halfWidth) / layout.cellSize
  );
  const centerRow = Math.floor(
    (camera.position.z + halfDepth) / layout.cellSize
  );
  const infoX = Math.round(camera.position.x * 10) / 10;
  const infoZ = Math.round(camera.position.z * 10) / 10;
  minimapInfo.textContent = `X:${infoX}  Z:${infoZ}\nCell:${centerRow},${centerCol}`;

  minimapContext.clearRect(0, 0, minimapSize, minimapSize);

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

  const centerX = halfCells * minimap.cellPixels + minimap.cellPixels / 2;
  const centerY = halfCells * minimap.cellPixels + minimap.cellPixels / 2;
  const forward = camera.getDirection(new Vector3(0, 0, 1));
  const angle = -Math.atan2(forward.z, forward.x);
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
};

scene.onBeforeRenderObservable.add(() => {
  camera.position.y = eyeHeight;
  drawMinimap();
});

engine.runRenderLoop(() => {
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
