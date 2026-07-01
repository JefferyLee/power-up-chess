import { SPRITE_CFG } from './config.js';
import { loadAllAssets } from './assets.js';
import { detectApi } from './api.js';
import { initGame, initGameModule, showLoading, showLoadError, showStartScreen } from './game.js';

try {
  const savedSprites = JSON.parse(localStorage.getItem('spriteCfg') || '{}');
  Object.assign(SPRITE_CFG, savedSprites);
} catch { /* ignore */ }

const canvas = document.getElementById('game');

initGame();
initGameModule(canvas);
showLoading();

const apiOk = await detectApi();
const badge = document.getElementById('mode-badge');
if (badge) badge.textContent = apiOk ? 'Server leaderboard & online players' : 'Local leaderboard when offline';

const errors = await loadAllAssets();
if (errors.length) showLoadError(errors);
else showStartScreen();