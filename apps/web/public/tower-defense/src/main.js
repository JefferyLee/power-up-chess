import { SPRITE_CFG } from './config.js?v=2';
import { loadAllAssets } from './assets.js?v=2';
import { detectApi } from './api.js?v=2';
import { initGame, initGameModule, showLoading, showLoadError, showStartScreen } from './game.js?v=2';

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