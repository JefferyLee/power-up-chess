export const state = {
  gold: 120,
  lives: 20,
  score: 0,
  waveNum: 0,
  waveCountdown: 0,
  gameOver: false,
  gameWon: false,
  waveActive: false,
  paused: false,
  towers: [],
  enemies: [],
  projectiles: [],
  particles: [],
  selectedType: 'arrow',
  hovCell: null,
  selectedTower: null,
  spawnQueue: [],
  spawnTimer: 0,
  lastTs: 0,
  running: false,
  gameSpeed: 1,
  combo: 0,
  comboTimer: 0,
  comboDisplayTimer: 0,
  shakeAmt: 0,
  shakeX: 0,
  shakeY: 0,
  playerName: '',
};

export function resetGameState() {
  state.gold = 120;
  state.lives = 20;
  state.score = 0;
  state.waveNum = 0;
  state.waveCountdown = 0;
  state.gameOver = false;
  state.gameWon = false;
  state.waveActive = false;
  state.paused = false;
  state.towers = [];
  state.enemies = [];
  state.projectiles = [];
  state.particles = [];
  state.spawnQueue = [];
  state.spawnTimer = 0;
  state.selectedType = 'arrow';
  state.hovCell = null;
  state.selectedTower = null;
  state.combo = 0;
  state.comboTimer = 0;
  state.comboDisplayTimer = 0;
  state.shakeAmt = 0;
  state.shakeX = 0;
  state.shakeY = 0;
  state.gameSpeed = 1;
}