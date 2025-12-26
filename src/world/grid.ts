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
  cellSize: 12,
  height: 8,
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
  const roomCount = 3;
  const roomWidth = 4;
  const roomHeight = 4;
  const corridorThickness = 1;
  const spacing = Math.floor(
    (config.columns - roomCount * roomWidth) / (roomCount + 1)
  );
  const startRow = Math.floor((config.rows - roomHeight) / 2);
  const corridorRow = startRow + Math.floor(roomHeight / 2);
  const spawnRow = startRow + Math.floor(roomHeight / 2);
  const spawnCol = spacing + Math.floor(roomWidth / 2);
  let previousRoomEndCol = 0;

  for (let index = 0; index < roomCount; index += 1) {
    const startCol = spacing + index * (roomWidth + spacing);
    carveRect(cells, startCol, startRow, roomWidth, roomHeight);

    if (index > 0) {
      const corridorStartRow =
        corridorRow - Math.floor(corridorThickness / 2);
      for (let offset = 0; offset < corridorThickness; offset += 1) {
        carveCorridor(
          cells,
          corridorStartRow + offset,
          previousRoomEndCol + 1,
          startCol - 1
        );
      }
    }

    previousRoomEndCol = startCol + roomWidth - 1;
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
