export type CellType = "floor" | "wall";

export type GridLayout = {
  columns: number;
  rows: number;
  cellSize: number;
  height: number;
  spawn: {
    row: number;
    col: number;
  };
  noSpawnCells: { row: number; col: number }[];
  cells: CellType[][];
};

export type GridRule = "three-rooms-linear";

export type GridConfig = {
  columns: number;
  rows: number;
  cellSize: number;
  height: number;
  rule: GridRule;
};

export const DEFAULT_GRID_CONFIG: GridConfig = {
  columns: 20,
  rows: 20,
  cellSize: 1,
  height: 1,
  rule: "three-rooms-linear"
};

const createFilledCells = (
  rows: number,
  columns: number,
  fill: CellType
): CellType[][] => {
  const cells: CellType[][] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowCells: CellType[] = [];
    for (let col = 0; col < columns; col += 1) {
      rowCells.push(fill);
    }
    cells.push(rowCells);
  }

  return cells;
};

const carveRect = (
  cells: CellType[][],
  startCol: number,
  startRow: number,
  width: number,
  height: number
) => {
  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col < startCol + width; col += 1) {
      cells[row][col] = "floor";
    }
  }
};

const carveCorridor = (
  cells: CellType[][],
  row: number,
  startCol: number,
  endCol: number
) => {
  for (let col = startCol; col <= endCol; col += 1) {
    cells[row][col] = "floor";
  }
};

const buildThreeRoomsLinear = (config: GridConfig): GridLayout => {
  const cells = createFilledCells(config.rows, config.columns, "wall");
  const largeRoomWidth = 4;
  const largeRoomHeight = 4;
  const smallRoomWidth = 2;
  const smallRoomHeight = 3;
  const corridorWidth = 1;
  const startRowLarge = Math.floor((config.rows - largeRoomHeight) / 2);
  const corridorRow = startRowLarge + Math.floor(largeRoomHeight / 2);
  const startRowSmall = corridorRow - Math.floor(smallRoomHeight / 2);
  const roomSpecs = [
    { width: smallRoomWidth, height: smallRoomHeight, kind: "small" as const },
    { width: largeRoomWidth, height: largeRoomHeight, kind: "large" as const },
    { width: largeRoomWidth, height: largeRoomHeight, kind: "large" as const },
    { width: largeRoomWidth, height: largeRoomHeight, kind: "large" as const },
    { width: smallRoomWidth, height: smallRoomHeight, kind: "small" as const }
  ];
  const noSpawnCells: { row: number; col: number }[] = [];
  let currentCol = 0;
  let spawnRow = corridorRow;
  let spawnCol = 0;

  for (let index = 0; index < roomSpecs.length; index += 1) {
    const room = roomSpecs[index];
    const startRow = room.kind === "small" ? startRowSmall : startRowLarge;
    carveRect(cells, currentCol, startRow, room.width, room.height);

    if (room.kind === "small") {
      for (let row = startRow; row < startRow + room.height; row += 1) {
        for (let col = currentCol; col < currentCol + room.width; col += 1) {
          noSpawnCells.push({ row, col });
        }
      }
    }

    if (index === 0) {
      spawnRow = startRow + Math.floor(room.height / 2);
      spawnCol = currentCol + Math.floor(room.width / 2);
    }

    currentCol += room.width;
    if (index < roomSpecs.length - 1) {
      carveCorridor(
        cells,
        corridorRow,
        currentCol,
        currentCol + corridorWidth - 1
      );
      currentCol += corridorWidth;
    }
  }

  return {
    columns: config.columns,
    rows: config.rows,
    cellSize: config.cellSize,
    height: config.height,
    spawn: {
      row: spawnRow,
      col: spawnCol
    },
    noSpawnCells,
    cells
  };
};

type GridBuilder = (config: GridConfig) => GridLayout;

const gridBuilders: Record<GridRule, GridBuilder> = {
  "three-rooms-linear": buildThreeRoomsLinear
};

export const createGridLayout = (
  config: GridConfig = DEFAULT_GRID_CONFIG
): GridLayout => gridBuilders[config.rule](config);
