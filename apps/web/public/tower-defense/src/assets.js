import { SPRITE_CFG, SPRITE_BASE, SFX_CFG } from './config.js?v=2';
import { initAC, setAudioBuffers } from './audio.js?v=2';

export const sprites = {};
export const audioBuffers = {};
export let assetsReady = false;
export let loadErrors = [];

export function setLoadProgress(pct) {
  const fill = document.getElementById('load-fill');
  if (fill) fill.style.width = `${pct}%`;
}

export async function loadAllAssets() {
  loadErrors = [];
  const total = Object.keys(SPRITE_CFG).length + Object.keys(SFX_CFG).length;
  let done = 0;
  const tick = () => setLoadProgress(Math.round((++done / total) * 100));

  await Promise.all(Object.entries(SPRITE_CFG).map(([name, file]) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { sprites[name] = img; tick(); resolve(); };
      img.onerror = () => {
        loadErrors.push(`sprite:${name}`);
        tick();
        resolve();
      };
      img.src = SPRITE_BASE + file;
    }),
  ));

  initAC();
  await Promise.all(Object.entries(SFX_CFG).map(async ([name, path]) => {
    try {
      const resp = await fetch(path);
      if (!resp.ok) throw new Error(String(resp.status));
      const ab = await resp.arrayBuffer();
      const { AC } = await import('./audio.js?v=2');
      if (AC) audioBuffers[name] = await AC.decodeAudioData(ab);
    } catch {
      loadErrors.push(`sfx:${name}`);
    }
    tick();
  }));

  setAudioBuffers(audioBuffers);
  assetsReady = true;
  return loadErrors;
}

export function drawSprite(ctx, name, x, y, size, angle = 0) {
  const img = sprites[name];
  if (!img) return false;
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

export function drawTileBg(ctx, name, col, row, cell) {
  const img = sprites[name];
  if (img) {
    ctx.drawImage(img, col * cell, row * cell, cell, cell);
  } else {
    ctx.fillStyle = name === 'grass' ? '#1a3a1a' : '#7c3d10';
    ctx.fillRect(col * cell, row * cell, cell, cell);
  }
}