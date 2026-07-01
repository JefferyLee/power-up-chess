export class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  key(cx, cy) {
    return `${cx},${cy}`;
  }

  insert(enemy) {
    const cx = Math.floor(enemy.x / this.cellSize);
    const cy = Math.floor(enemy.y / this.cellSize);
    const k = this.key(cx, cy);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(enemy);
  }

  query(x, y, radiusPx) {
    const rCells = Math.ceil(radiusPx / this.cellSize);
    const cx0 = Math.floor(x / this.cellSize);
    const cy0 = Math.floor(y / this.cellSize);
    const result = [];
    for (let dy = -rCells; dy <= rCells; dy++) {
      for (let dx = -rCells; dx <= rCells; dx++) {
        const list = this.cells.get(this.key(cx0 + dx, cy0 + dy));
        if (list) result.push(...list);
      }
    }
    return result;
  }
}