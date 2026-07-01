import { CELL } from './config.js';

export function wpx(wp) { return (wp[0] + 0.5) * CELL; }
export function wpy(wp) { return (wp[1] + 0.5) * CELL; }

export function buildPathCells(waypoints, cols, rows) {
  const s = new Set();
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [c0, r0] = waypoints[i];
    const [c1, r1] = waypoints[i + 1];
    if (r0 === r1) {
      for (let c = Math.max(0, Math.min(c0, c1)); c <= Math.min(cols - 1, Math.max(c0, c1)); c++) {
        s.add(`${c},${r0}`);
      }
    } else {
      for (let r = Math.max(0, Math.min(r0, r1)); r <= Math.min(rows - 1, Math.max(r0, r1)); r++) {
        s.add(`${c0},${r}`);
      }
    }
  }
  return s;
}

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function applyUpgradeMult(base, mult) {
  return base * mult;
}

export function effectiveDamage(baseDamage, level, upgrades) {
  if (level <= 0) return baseDamage;
  return applyUpgradeMult(baseDamage, upgrades[level - 1].dmgMult);
}

export function calcArmorDamage(dmg, armor, armorPierce) {
  const effectiveArmor = armorPierce ? 0 : (armor || 0);
  return Math.max(1, Math.floor(dmg * (1 - effectiveArmor)));
}

export function buildSpawnQueue(waveGroups) {
  const spawnQueue = [];
  let t = 0;
  for (const g of waveGroups) {
    const startT = g.delay !== undefined ? g.delay : t;
    for (let i = 0; i < g.count; i++) {
      spawnQueue.push({ time: startT + i * g.gap, type: g.type });
    }
    if (g.delay === undefined) t += g.count * g.gap + 1.0;
    else t = Math.max(t, g.delay + g.count * g.gap + 1.0);
  }
  spawnQueue.sort((a, b) => a.time - b.time);
  return spawnQueue;
}

export function pickTarget(candidates, mode) {
  if (!candidates.length) return null;
  switch (mode) {
    case 'closest':
      return candidates.reduce((a, b) => (a.dist <= b.dist ? a : b)).enemy;
    case 'strongest':
      return candidates.reduce((a, b) => (a.enemy.hp >= b.enemy.hp ? a : b)).enemy;
    case 'last':
      return candidates.reduce((a, b) => (a.enemy.pathDist <= b.enemy.pathDist ? a : b)).enemy;
    case 'first':
    default:
      return candidates.reduce((a, b) => (a.enemy.pathDist >= b.enemy.pathDist ? a : b)).enemy;
  }
}

export function removeDead(items, isDead) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (isDead(items[i])) items.splice(i, 1);
  }
}