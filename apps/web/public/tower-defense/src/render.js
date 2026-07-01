import { CELL, COLS, ROWS, CW, CH, PATH_CELLS, TDEFS, WAYPOINTS } from './config.js?v=2';
import { drawTileBg } from './assets.js?v=2';
import { state } from './game-state.js?v=2';
import { drawParticles } from './particles.js?v=2';
import { wpx, wpy } from './utils.js?v=2';

export function drawMap(ctx) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      drawTileBg(ctx, PATH_CELLS.has(`${c},${r}`) ? 'path' : 'grass', c, r, CELL);
    }
  }
  ctx.strokeStyle = '#00000018';
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, CH);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(CW, r * CELL);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff20';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const x0 = wpx(WAYPOINTS[i]);
    const y0 = wpy(WAYPOINTS[i]);
    const x1 = wpx(WAYPOINTS[i + 1]);
    const y1 = wpy(WAYPOINTS[i + 1]);
    const len = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    const steps = Math.max(1, Math.floor(len / (CELL * 1.8)));
    const ang = Math.atan2(y1 - y0, x1 - x0);
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      const ax = x0 + (x1 - x0) * t;
      const ay = y0 + (y1 - y0) * t;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-5, -4);
      ctx.lineTo(5, 0);
      ctx.lineTo(-5, 4);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4ade8088';
  ctx.fillText('IN', CELL * 0.5, CELL * 1.5 - 2);
  ctx.fillStyle = '#f8717188';
  ctx.fillText('OUT', CELL * (COLS - 0.5), CELL * 4.5 - 2);
  ctx.textAlign = 'left';
}

export function drawHoverPreview(ctx) {
  if (!state.hovCell || state.selectedTower) return;
  const { col, row } = state.hovCell;
  const t = state.towers.find((tw) => tw.col === col && tw.row === row);
  if (t) return;
  const canPlace = !PATH_CELLS.has(`${col},${row}`);
  ctx.fillStyle = canPlace ? '#ffffff18' : '#ef444430';
  ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
  if (canPlace && state.selectedType) {
    const def = TDEFS.find((d) => d.id === state.selectedType);
    ctx.beginPath();
    ctx.arc((col + 0.5) * CELL, (row + 0.5) * CELL, def.range * CELL, 0, Math.PI * 2);
    ctx.strokeStyle = `${def.accent}44`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function drawComboOnCanvas(ctx) {
  if (state.comboDisplayTimer <= 0 || state.combo < 5) return;
  const a = Math.min(1, state.comboDisplayTimer * 1.5);
  ctx.globalAlpha = a;
  const sz = Math.min(28 + state.combo, 44);
  ctx.font = `bold ${sz}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = state.combo >= 15 ? '#f87171' : state.combo >= 8 ? '#fb923c' : '#fbbf24';
  ctx.fillText(`${state.combo}× COMBO!`, CW / 2, 70);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

export function drawPauseOverlay(ctx) {
  if (!state.paused) return;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, CW, CH);
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('PAUSED', CW / 2, CH / 2);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#d1d5db';
  ctx.fillText('Press P to resume', CW / 2, CH / 2 + 28);
  ctx.textAlign = 'left';
}

export function render(ctx, towers) {
  ctx.save();
  ctx.translate(state.shakeX, state.shakeY);
  drawMap(ctx);
  drawHoverPreview(ctx);
  drawParticles(ctx);
  for (const e of state.enemies) e.draw(ctx);
  for (const p of state.projectiles) if (!p.dead) p.draw(ctx);
  for (const t of towers) {
    const show = t === state.selectedTower || (state.hovCell && !state.selectedTower && state.hovCell.col === t.col && state.hovCell.row === t.row);
    t.draw(ctx, show);
  }
  drawComboOnCanvas(ctx);
  drawPauseOverlay(ctx);
  ctx.restore();
}