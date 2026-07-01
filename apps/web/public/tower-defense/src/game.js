import { CELL, COLS, ROWS, CW, CH, PATH_CELLS, TDEFS, WAVES } from './config.js';
import { resumeAC, startMusic, stopMusic, sfx, setMusicOn, setSfxOn, getMusicOn, getSfxOn } from './audio.js';
import { Enemy, Tower, rebuildEnemyGrid } from './entities.js';
import { updateParticles } from './particles.js';
import { state, resetGameState } from './game-state.js';
import { render } from './render.js';
import { submitScore, showLeaderboard } from './api.js';
import { buildSpawnQueue } from './utils.js';

let canvas;
let ctx;
let msgTimer = null;

export function initGameModule(cvs) {
  canvas = cvs;
  ctx = canvas.getContext('2d');
  canvas.width = CW;
  canvas.height = CH;
  bindInput();
  bindUI();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

export function resizeCanvas() {
  const maxW = window.innerWidth - 24;
  const scale = Math.min(1, maxW / (CW + 380));
  canvas.style.width = `${CW * scale}px`;
  canvas.style.height = `${CH * scale}px`;
}

function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CW / rect.width;
  const scaleY = CH / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { col, row };
}

function setMsg(text) {
  document.getElementById('msg').textContent = text;
  if (msgTimer) clearTimeout(msgTimer);
  if (text) msgTimer = setTimeout(() => { document.getElementById('msg').textContent = ''; }, 2800);
}

function showNameError(text, id = 'name-error-start') {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '';
}

export function initGame() {
  resetGameState();
  selectTowerBtn('arrow');
  updateSelectedTowerPanel();
  updateUI();
  hideOverlayPanels();
}

function hideOverlayPanels() {
  document.getElementById('overlay').style.display = 'none';
  ['overlay-loading', 'overlay-start', 'overlay-end', 'overlay-name'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

function showPanel(id) {
  document.getElementById('overlay').style.display = 'flex';
  ['overlay-loading', 'overlay-start', 'overlay-end', 'overlay-name'].forEach((pid) => {
    const el = document.getElementById(pid);
    if (el) el.hidden = pid !== id;
  });
}

export function showLoading() {
  showPanel('overlay-loading');
}

export function showLoadError(errors) {
  const warn = document.getElementById('asset-warn');
  if (warn) {
    warn.hidden = false;
    warn.textContent = `Some assets failed to load (${errors.length}): ${errors.slice(0, 4).join(', ')}${errors.length > 4 ? '…' : ''}`;
  }
  showStartScreen();
}

export function showStartScreen() {
  showPanel('overlay-start');
  bindStartForm();
}

// When embedded in the Power Up castle, the host passes ?name=<castle name>
// so the kid is never asked to type a name — we use who they already are.
function castleName() {
  try {
    const n = new URLSearchParams(location.search).get('name');
    return n ? n.trim().slice(0, 10) : '';
  } catch { return ''; }
}

function bindStartForm() {
  const nameInput = document.getElementById('name-input');
  const startBtn = document.getElementById('start-btn');
  if (!nameInput || !startBtn) return;
  const preset = castleName();
  const doStart = () => {
    const name = preset || nameInput.value.trim();
    if (!name || name.length > 10) {
      showNameError('Enter a name (1–10 characters)');
      return;
    }
    showNameError('');
    state.playerName = name;
    hideOverlayPanels();
    resumeAC();
    startMusic();
    state.running = true;
    import('./api.js').then((api) => api.startPresence(state.playerName));
    requestAnimationFrame((ts) => { state.lastTs = ts; requestAnimationFrame(tick); });
  };
  if (preset) {
    // The castle already knows this player — hide the name field and the
    // in-game "change name" button so the castle name stays authoritative.
    nameInput.style.display = 'none';
    startBtn.textContent = 'Play';
    const chBtn = document.getElementById('chname-btn');
    if (chBtn) chBtn.style.display = 'none';
  }
  startBtn.onclick = doStart;
  nameInput.onkeydown = (e) => { if (e.key === 'Enter') doStart(); };
  if (!preset) nameInput.focus();
}

export function startWave() {
  if (state.waveActive || state.waveNum >= WAVES.length) return;
  state.waveNum++;
  state.waveActive = true;
  state.spawnTimer = 0;
  state.spawnQueue = buildSpawnQueue(WAVES[state.waveNum - 1]);
  sfx.waveStart();
  setMsg('');
  updateUI();
}

function endGame(won) {
  if (state.gameOver || state.gameWon) return;
  if (won) state.gameWon = true;
  else state.gameOver = true;
  stopMusic();
  setTimeout(() => (won ? sfx.victory() : sfx.gameOver()), 100);
  submitScore(state.playerName, state.score, state.waveNum);
  showPanel('overlay-end');
  document.getElementById('end-title').textContent = won ? '🏆 Victory!' : '💀 Defeated';
  document.getElementById('end-title').style.color = won ? '#4ade80' : '#f87171';
  document.getElementById('end-summary').textContent = won
    ? 'All 20 waves repelled! Your kingdom stands.'
    : 'The enemy horde has breached your defenses.';
  document.getElementById('end-score').textContent = String(state.score);
  document.getElementById('end-meta').textContent = `Wave ${state.waveNum}/${WAVES.length} · ${state.lives} lives remaining`;
}

function sellTowerAt(col, row) {
  const t = state.towers.find((tw) => tw.col === col && tw.row === row);
  if (!t) return;
  state.gold += t.sellValue;
  state.towers = state.towers.filter((x) => x !== t);
  if (state.selectedTower === t) {
    state.selectedTower = null;
    updateSelectedTowerPanel();
  }
  sfx.sell();
  updateUI();
  setMsg(`Sold for ${t.sellValue}g`);
}

function handleCellClick(col, row) {
  if (state.gameOver || state.gameWon || state.paused) return;
  resumeAC();
  const existing = state.towers.find((t) => t.col === col && t.row === row);
  if (existing) {
    if (state.selectedTower === existing) {
      state.selectedTower = null;
      updateSelectedTowerPanel();
      return;
    }
    state.selectedTower = existing;
    document.querySelectorAll('.tbtn').forEach((b) => b.classList.remove('sel'));
    state.selectedType = null;
    updateSelectedTowerPanel();
    return;
  }
  if (state.selectedTower) {
    state.selectedTower = null;
    updateSelectedTowerPanel();
  }
  if (!state.selectedType) return;
  if (PATH_CELLS.has(`${col},${row}`)) {
    setMsg("Can't build on path!");
    return;
  }
  const def = TDEFS.find((d) => d.id === state.selectedType);
  if (state.gold < def.cost) {
    setMsg('Not enough gold!');
    return;
  }
  state.gold -= def.cost;
  state.towers.push(new Tower(col, row, state.selectedType));
  sfx.place();
  updateUI();
  setMsg('');
}

function bindInput() {
  canvas.addEventListener('mousemove', (e) => { state.hovCell = cellFromEvent(e); });
  canvas.addEventListener('mouseleave', () => { state.hovCell = null; });
  canvas.addEventListener('click', (e) => {
    const cell = cellFromEvent(e);
    if (cell) handleCellClick(cell.col, cell.row);
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const cell = cellFromEvent(e);
    if (cell) sellTowerAt(cell.col, cell.row);
  });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const cell = cellFromEvent(t);
    if (cell) handleCellClick(cell.col, cell.row);
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      if (!state.running || state.gameOver || state.gameWon) return;
      state.paused = !state.paused;
      setMsg(state.paused ? 'Paused — press P to resume' : '');
    }
  });
}

function bindUI() {
  document.getElementById('wave-btn').addEventListener('click', () => {
    if (!state.waveActive && state.waveNum < WAVES.length && !state.gameOver && !state.gameWon && !state.paused) startWave();
  });
  document.getElementById('sell-btn').addEventListener('click', () => {
    if (state.selectedTower) sellTowerAt(state.selectedTower.col, state.selectedTower.row);
  });
  document.getElementById('upgrade-btn').addEventListener('click', () => {
    if (state.selectedTower) {
      const ok = state.selectedTower.upgrade(updateUI);
      if (!ok && state.selectedTower.level < 2) setMsg('Not enough gold!');
      updateSelectedTowerPanel();
    }
  });
  document.getElementById('deselect-btn').addEventListener('click', () => {
    state.selectedTower = null;
    updateSelectedTowerPanel();
  });
  document.getElementById('music-btn').addEventListener('click', () => {
    setMusicOn(!getMusicOn());
    const btn = document.getElementById('music-btn');
    btn.classList.toggle('on', getMusicOn());
    btn.classList.toggle('off', !getMusicOn());
    if (getMusicOn()) startMusic();
    else stopMusic();
  });
  document.getElementById('sfx-btn').addEventListener('click', () => {
    setSfxOn(!getSfxOn());
    const btn = document.getElementById('sfx-btn');
    btn.classList.toggle('on', getSfxOn());
    btn.classList.toggle('off', !getSfxOn());
  });
  document.getElementById('speed-btn').addEventListener('click', () => {
    state.gameSpeed = state.gameSpeed === 1 ? 2 : 1;
    const btn = document.getElementById('speed-btn');
    btn.classList.toggle('speed-on', state.gameSpeed === 2);
    btn.textContent = state.gameSpeed === 2 ? '⏩ 2×' : '▶▶ 2×';
  });
  document.getElementById('restart-btn').addEventListener('click', () => {
    initGame();
    startMusic();
  });
  document.getElementById('lb-btn').addEventListener('click', showLeaderboard);
  document.getElementById('chname-btn').addEventListener('click', () => {
    showPanel('overlay-name');
    const ni = document.getElementById('name-input-rename');
    ni.value = state.playerName;
    showNameError('', 'name-error-rename');
    ni.focus();
  });
  document.getElementById('rename-btn').addEventListener('click', () => {
    const ni = document.getElementById('name-input-rename');
    const n = ni.value.trim();
    if (!n || n.length > 10) {
      showNameError('Enter a name (1–10 characters)', 'name-error-rename');
      return;
    }
    state.playerName = n;
    hideOverlayPanels();
    initGame();
    startMusic();
    import('./api.js').then((api) => api.startPresence(state.playerName));
  });
  document.getElementById('lb-close').addEventListener('click', () => {
    document.getElementById('leaderboard-overlay').style.display = 'none';
  });

  const tbContainer = document.getElementById('tower-buttons');
  for (const def of TDEFS) {
    const btn = document.createElement('button');
    btn.className = 'tbtn';
    btn.dataset.id = def.id;
    btn.innerHTML = `<div class="ticon" style="background:${def.color}">${def.emoji}</div><div class="tinfo"><div class="tname">${def.name}</div><div class="tcost">💰${def.cost}</div><div class="tdesc">${def.desc}</div></div>`;
    btn.addEventListener('click', () => {
      state.selectedType = def.id;
      state.selectedTower = null;
      selectTowerBtn(def.id);
      updateSelectedTowerPanel();
    });
    tbContainer.appendChild(btn);
  }
}

function selectTowerBtn(id) {
  document.querySelectorAll('.tbtn').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
}

function updateSelectedTowerPanel() {
  const panel = document.getElementById('tower-info-panel');
  const sellBtn = document.getElementById('sell-btn');
  if (!state.selectedTower) {
    panel.style.display = 'none';
    sellBtn.style.display = 'none';
    return;
  }
  const t = state.selectedTower;
  panel.style.display = 'block';
  document.getElementById('tinfo-name').textContent = `${t.def.emoji} ${t.def.name}`;
  const stars = ['○', '○'].map((d, i) => (i < t.level ? '●' : d)).join(' ');
  document.getElementById('tinfo-level').textContent = `Level ${t.level}/2  ${stars}`;
  const chain = t._chain > 0 ? ` · Chain ${t._chain}` : '';
  const armor = t.def.armorPierce ? ' · Pierce' : '';
  const multNote = t.level > 0 ? ` <span style="color:#6b7280;font-size:.58rem">(×${t.def.upgrades[t.level - 1].dmgMult} base)</span>` : '';
  document.getElementById('tinfo-stats').innerHTML =
    `DMG: ${Math.floor(t._dmg)}${multNote}<br>Range: ${t._range.toFixed(1)} &nbsp; RoF: ${t._rate.toFixed(1)}/s` +
    (chain || armor ? `<br><span style="color:#a78bfa;font-size:.62rem">${chain}${armor}</span>` : '');
  const upBtn = document.getElementById('upgrade-btn');
  if (t.level < 2) {
    const up = t.def.upgrades[t.level];
    upBtn.style.display = 'block';
    upBtn.textContent = `▲ ${up.label} (${up.cost}g)`;
    upBtn.disabled = state.gold < up.cost;
  } else {
    upBtn.style.display = 'none';
  }
  sellBtn.style.display = 'block';
  sellBtn.textContent = `Sell ${t.def.name} (+${t.sellValue}g)`;
}

function updateUI() {
  document.getElementById('lives-val').textContent = state.lives;
  document.getElementById('lives-val').style.color = state.lives <= 5 ? '#f87171' : state.lives <= 10 ? '#fbbf24' : '#34d399';
  document.getElementById('gold-val').textContent = state.gold;
  document.getElementById('wave-val').textContent = `${state.waveNum}/${WAVES.length}`;
  document.getElementById('score-val').textContent = state.score;
  document.querySelectorAll('.tbtn').forEach((b) => b.classList.toggle('cant-afford', state.gold < TDEFS.find((d) => d.id === b.dataset.id)?.cost));
  const wb = document.getElementById('wave-btn');
  if (state.waveActive) { wb.textContent = `Wave ${state.waveNum} in progress…`; wb.disabled = true; }
  else if (state.waveNum >= WAVES.length) { wb.textContent = 'All waves done!'; wb.disabled = true; }
  else { wb.textContent = `Start Wave ${state.waveNum + 1}`; wb.disabled = state.paused; }
  if (state.selectedTower) updateSelectedTowerPanel();
}

function update(dt) {
  if (state.shakeAmt > 0) {
    state.shakeAmt = Math.max(0, state.shakeAmt - dt * 30);
    state.shakeX = (Math.random() * 2 - 1) * state.shakeAmt;
    state.shakeY = (Math.random() * 2 - 1) * state.shakeAmt;
  } else {
    state.shakeX = 0;
    state.shakeY = 0;
  }
  if (state.comboTimer > 0) { state.comboTimer -= dt; if (state.comboTimer <= 0) state.combo = 0; }
  if (state.comboDisplayTimer > 0) state.comboDisplayTimer -= dt;

  if (state.waveActive && state.spawnQueue.length > 0) {
    state.spawnTimer += dt;
    while (state.spawnQueue.length > 0 && state.spawnQueue[0].time <= state.spawnTimer) {
      state.enemies.push(new Enemy(state.spawnQueue.shift().type));
    }
  }
  rebuildEnemyGrid();
  for (const t of state.towers) t.update(dt, updateUI, endGame);
  for (const e of state.enemies) e.update(dt, updateUI, endGame);
  for (const p of state.projectiles) p.update(dt);
  updateParticles(dt);
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    if (state.projectiles[i].dead) state.projectiles.splice(i, 1);
  }
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if (state.enemies[i].dead || state.enemies[i].reached) state.enemies.splice(i, 1);
  }

  if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.waveActive = false;
    if (state.waveNum >= WAVES.length) { endGame(true); return; }
    const bonus = 15 + state.waveNum * 6;
    state.gold += bonus;
    state.score += bonus;
    sfx.waveClear();
    setMsg(`Wave ${state.waveNum} cleared! +${bonus}g — press Start Wave when ready`);
    updateUI();
  }
}

function tick(ts) {
  if (!state.running) return;
  const rawDt = Math.min((ts - state.lastTs) / 1000, 0.05);
  state.lastTs = ts;
  if (!state.gameOver && !state.gameWon && !state.paused) update(rawDt * state.gameSpeed);
  render(ctx, state.towers);
  requestAnimationFrame(tick);
}