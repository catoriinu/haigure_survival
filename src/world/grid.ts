export type CellType = "floor" | "wall";

export type GridLayout = {
  columns: number;
  rows: number;
  cellSize: number;
  height: number;
  ceilingHeight: number | null;
  cellNoRender: boolean[][];
  spawn: {
    row: number;
    col: number;
  };
  noSpawnCells: { row: number; col: number }[];
  cells: CellType[][];
  cellHeights: number[][];
};

export type GridRule = "three-rooms-linear";

export type GridConfig = {
  columns: number;
  rows: number;
  cellSize: number;
  height: number;
  rule: GridRule;
};

export const CELL_SCALE = 3;

export const DEFAULT_GRID_CONFIG: GridConfig = {
  columns: 20 * CELL_SCALE,
  rows: 20 * CELL_SCALE,
  cellSize: 1 / CELL_SCALE,
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
  startRow: number,
  height: number,
  startCol: number,
  endCol: number
) => {
  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      cells[row][col] = "floor";
    }
  }
};

const buildThreeRoomsLinear = (config: GridConfig): GridLayout => {
  const cells = createFilledCells(config.rows, config.columns, "wall");
  const largeRoomWidth = 5 * CELL_SCALE;
  const largeRoomHeight = 3 * CELL_SCALE;
  const centralLargeRoomHeight = 4 * CELL_SCALE;
  const smallRoomWidth = 3 * CELL_SCALE;
  const smallRoomHeight = 2 * CELL_SCALE;
  const corridorWidth = 1 * CELL_SCALE;
  const corridorHeight = 1 * CELL_SCALE;
  const startColLarge = Math.floor((config.columns - largeRoomWidth) / 2);
  const corridorStartColDefault = startColLarge + 1 * CELL_SCALE;
  const corridorStartColShifted = startColLarge + 3 * CELL_SCALE;
  const startColSmallShifted = corridorStartColShifted - 1 * CELL_SCALE;
  const roomSpecs = [
    { width: smallRoomWidth, height: smallRoomHeight, kind: "small" as const },
    { width: largeRoomWidth, height: largeRoomHeight, kind: "large" as const },
    {
      width: largeRoomWidth,
      height: centralLargeRoomHeight,
      kind: "large" as const
    },
    { width: largeRoomWidth, height: largeRoomHeight, kind: "large" as const },
    { width: smallRoomWidth, height: smallRoomHeight, kind: "small" as const }
  ];
  const totalHeight =
    roomSpecs.reduce((sum, room) => sum + room.height, 0) +
    (roomSpecs.length - 1) * corridorHeight;
  const noSpawnCells: { row: number; col: number }[] = [];
  const cellNoRender: boolean[][] = [];
  const cellHeights: number[][] = [];
  let currentRow = Math.floor((config.rows - totalHeight) / 2);
  let spawnRow = 0;
  let spawnCol = 0;

  for (let index = 0; index < roomSpecs.length; index += 1) {
    const room = roomSpecs[index];
    const startRow = currentRow;
    const startCol =
      room.kind === "small" && index === 0 ? startColSmallShifted : startColLarge;
    carveRect(cells, startCol, startRow, room.width, room.height);

    if (room.kind === "small") {
      for (let row = startRow; row < startRow + room.height; row += 1) {
        for (let col = startCol; col < startCol + room.width; col += 1) {
          noSpawnCells.push({ row, col });
        }
      }
    }

    if (index === 0) {
      spawnRow = startRow + Math.floor(room.height / 2);
      spawnCol = startCol + Math.floor(room.width / 2);
    }

    currentRow += room.height;
    if (index < roomSpecs.length - 1) {
      const corridorStartCol =
        index <= 1 ? corridorStartColShifted : corridorStartColDefault;
      carveCorridor(
        cells,
        currentRow,
        corridorHeight,
        corridorStartCol,
        corridorStartCol + corridorWidth - 1
      );
      currentRow += corridorHeight;
    }
  }

  for (let row = 0; row < config.rows; row += 1) {
    const rowHeights: number[] = [];
    const rowNoRender: boolean[] = [];
    for (let col = 0; col < config.columns; col += 1) {
      rowHeights.push(cells[row][col] === "wall" ? config.height : 0);
      rowNoRender.push(false);
    }
    cellHeights.push(rowHeights);
    cellNoRender.push(rowNoRender);
  }

  return {
    columns: config.columns,
    rows: config.rows,
    cellSize: config.cellSize,
    height: config.height,
    ceilingHeight: config.height,
    cellNoRender,
    spawn: {
      row: spawnRow,
      col: spawnCol
    },
    noSpawnCells,
    cells,
    cellHeights
  };
};

type GridBuilder = (config: GridConfig) => GridLayout;

const gridBuilders: Record<GridRule, GridBuilder> = {
  "three-rooms-linear": buildThreeRoomsLinear
};

export const createGridLayout = (
  config: GridConfig = DEFAULT_GRID_CONFIG
): GridLayout => gridBuilders[config.rule](config);
