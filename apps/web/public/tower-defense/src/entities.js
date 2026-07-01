import { CELL, EDEFS, TDEFS, WAYPOINTS } from './config.js';
import { drawSprite } from './assets.js';
import { sfx } from './audio.js';
import { state } from './game-state.js';
import { spawnDmgNumber, spawnSparks, triggerShake, registerKill } from './particles.js';
import { SpatialGrid } from './spatial.js';
import { calcArmorDamage, pickTarget, wpx, wpy } from './utils.js';

export const enemyGrid = new SpatialGrid(CELL);

export function rebuildEnemyGrid() {
  enemyGrid.clear();
  for (const e of state.enemies) {
    if (!e.dead && !e.reached) enemyGrid.insert(e);
  }
}

export function applyHit(enemy, dmg, tdef, onUpdateUI, onEndGame) {
  const effective = calcArmorDamage(dmg, enemy.def.armor, tdef.armorPierce);
  enemy.hp -= effective;
  if (enemy.type !== 'swarm' || Math.random() < 0.3) {
    spawnDmgNumber(enemy.x, enemy.y - enemy.def.r - 4, effective, tdef.id);
  }
  if (tdef.slow > 0 && !enemy.def.noSlow) enemy.slowUntil = performance.now() / 1000 + 0.95;
  if (enemy.hp <= 0 && !enemy.dead) {
    enemy.dead = true;
    state.gold += enemy.def.reward;
    state.score += enemy.def.reward;
    registerKill();
    spawnSparks(enemy.x, enemy.y, enemy.def.color, enemy.type === 'boss' ? 16 : 8);
    sfx.die(enemy.type);
    if (enemy.def.split) spawnBossSplit(enemy);
    if (enemy.type === 'boss') triggerShake(8);
    onUpdateUI();
  }
}

function applySplash(hitEnemy, dmg, splashPx, tdef, onUpdateUI, onEndGame) {
  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = e.x - hitEnemy.x;
    const dy = e.y - hitEnemy.y;
    if (Math.sqrt(dx * dx + dy * dy) <= splashPx) applyHit(e, dmg, tdef, onUpdateUI, onEndGame);
  }
  state.particles.push({ type: 'ring', x: hitEnemy.x, y: hitEnemy.y, r: 0, maxR: splashPx, life: 0.4, maxLife: 0.4, color: '#fb923c' });
}

function spawnBossSplit(boss) {
  for (let i = 0; i < 3; i++) {
    const e = new Enemy('fast');
    e.x = boss.x;
    e.y = boss.y;
    e.pathDist = boss.pathDist;
    e.wpIdx = boss.wpIdx;
    state.enemies.push(e);
  }
  spawnSparks(boss.x, boss.y, '#fbbf24', 20);
  state.particles.push({ type: 'ring', x: boss.x, y: boss.y, r: 0, maxR: 70, life: 0.5, maxLife: 0.5, color: '#fbbf24' });
}

function fireTesla(tower, primary, onUpdateUI, onEndGame) {
  const chainR = tower._range * CELL * 0.75;
  const hits = [primary];
  const maxChain = tower._chain;
  const pool = state.enemies.filter((e) => !e.dead && !e.reached && e !== primary)
    .sort((a, b) => Math.hypot(a.x - primary.x, a.y - primary.y) - Math.hypot(b.x - primary.x, b.y - primary.y));
  for (const e of pool) {
    if (hits.length >= maxChain) break;
    const last = hits[hits.length - 1];
    if (Math.hypot(e.x - last.x, e.y - last.y) <= chainR) hits.push(e);
  }
  hits.forEach((e, i) => applyHit(e, Math.floor(tower._dmg * Math.pow(0.6, i)), tower.effectiveDef, onUpdateUI, onEndGame));
  state.particles.push({ type: 'beam', x0: tower.x, y0: tower.y, x1: primary.x, y1: primary.y, life: 0.12, maxLife: 0.12, color: '#818cf8' });
  for (let i = 0; i < hits.length - 1; i++) {
    state.particles.push({ type: 'chain', x0: hits[i].x, y0: hits[i].y, x1: hits[i + 1].x, y1: hits[i + 1].y, life: 0.12, maxLife: 0.12 });
  }
  sfx.tesla();
}

export class Tower {
  constructor(col, row, typeId) {
    this.col = col;
    this.row = row;
    this.x = (col + 0.5) * CELL;
    this.y = (row + 0.5) * CELL;
    this.def = TDEFS.find((d) => d.id === typeId);
    this.cd = 0;
    this.angle = -Math.PI / 2;
    this.target = null;
    this.level = 0;
    this.totalInvested = this.def.cost;
    this._dmg = this.def.damage;
    this._range = this.def.range;
    this._rate = this.def.rate;
    this._chain = this.def.chainCount || 0;
  }

  get sellValue() { return Math.floor(this.totalInvested * 0.6); }

  get effectiveDef() {
    return { ...this.def, damage: this._dmg, range: this._range, rate: this._rate, chainCount: this._chain };
  }

  upgrade(onUpdateUI) {
    if (this.level >= 2) return false;
    const up = this.def.upgrades[this.level];
    if (state.gold < up.cost) return false;
    state.gold -= up.cost;
    this.totalInvested += up.cost;
    this.level++;
    this._dmg = this.def.damage * up.dmgMult;
    this._range = this.def.range * up.rangeMult;
    this._rate = this.def.rate * up.rateMult;
    if (up.chainCount) this._chain = up.chainCount;
    sfx.place();
    onUpdateUI();
    return true;
  }

  update(dt, onUpdateUI, onEndGame) {
    if (this.cd > 0) this.cd -= dt;
    const rangePx = this._range * CELL;
    const nearby = enemyGrid.query(this.x, this.y, rangePx);
    const candidates = [];
    for (const e of nearby) {
      if (e.dead || e.reached) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (this.def.minRange && dist < this.def.minRange * CELL) continue;
      if (dist <= rangePx) candidates.push({ enemy: e, dist });
    }
    const best = pickTarget(candidates, this.def.targeting);
    this.target = best;
    if (best) {
      this.angle = Math.atan2(best.y - this.y, best.x - this.x);
      if (this.cd <= 0) {
        this.fire(onUpdateUI, onEndGame);
        this.cd = 1 / this._rate;
      }
    }
  }

  fire(onUpdateUI, onEndGame) {
    const e = this.target;
    const d = this.def;
    if (d.id === 'laser') {
      applyHit(e, this._dmg, this.effectiveDef, onUpdateUI, onEndGame);
      state.particles.push({ type: 'beam', x0: this.x, y0: this.y, x1: e.x, y1: e.y, life: 0.07, maxLife: 0.07, color: '#f87171' });
      sfx.laser();
    } else if (d.id === 'tesla') {
      fireTesla(this, e, onUpdateUI, onEndGame);
    } else {
      state.projectiles.push(new Projectile(this.x, this.y, e, this.effectiveDef, onUpdateUI, onEndGame));
      if (d.id === 'arrow') sfx.arrow();
      else if (d.id === 'cannon') sfx.cannon();
      else if (d.id === 'ice') sfx.ice();
      else if (d.id === 'mortar') sfx.mortar();
    }
  }

  draw(ctx, showRange) {
    const x = this.x;
    const y = this.y;
    const d = this.def;
    const R = CELL * 0.38;
    if (showRange) {
      ctx.beginPath();
      ctx.arc(x, y, this._range * CELL, 0, Math.PI * 2);
      ctx.strokeStyle = `${d.accent}55`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (d.minRange) {
        ctx.beginPath();
        ctx.arc(x, y, d.minRange * CELL, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef444455';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (this === state.selectedTower) {
      ctx.beginPath();
      ctx.arc(x, y, R + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#fbbf24bb';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.ellipse(x, y + R + 3, R * 0.6, R * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#00000055';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, R + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#000000aa';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = d.color;
    ctx.fill();
    if (this.level > 0) {
      for (let i = 0; i < this.level; i++) {
        ctx.beginPath();
        ctx.arc(x + (i - 0.5) * 5, y + R + 6, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
      }
    }
    const sz = R * 2.4;
    if (!drawSprite(ctx, `tower_${d.id}`, x, y, sz, this.angle + Math.PI / 2)) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.angle);
      ctx.fillStyle = d.accent;
      ctx.fillRect(0, -3.5, R + 4, 7);
      ctx.fillStyle = '#111';
      ctx.fillRect(R - 1, -2.5, 8, 5);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, R * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = d.accent;
      ctx.fill();
    }
  }
}

export class Enemy {
  constructor(type) {
    this.type = type;
    this.def = EDEFS[type];
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.x = wpx(WAYPOINTS[0]);
    this.y = wpy(WAYPOINTS[0]);
    this.pathDist = 0;
    this.wpIdx = 0;
    this.dead = false;
    this.reached = false;
    this.slowUntil = 0;
    this.angle = 0;
  }

  update(dt, onUpdateUI, onEndGame) {
    if (this.dead || this.reached) return;
    const now = performance.now() / 1000;
    const spd = this.slowUntil > now ? this.def.speed * 0.4 : this.def.speed;
    let rem = spd * dt;
    while (rem > 0 && this.wpIdx < WAYPOINTS.length - 1) {
      const tx = wpx(WAYPOINTS[this.wpIdx + 1]);
      const ty = wpy(WAYPOINTS[this.wpIdx + 1]);
      const dx = tx - this.x;
      const dy = ty - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= rem) {
        this.x = tx;
        this.y = ty;
        this.pathDist += dist;
        rem -= dist;
        this.wpIdx++;
      } else {
        const f = rem / dist;
        this.x += dx * f;
        this.y += dy * f;
        this.pathDist += rem;
        this.angle = Math.atan2(dy, dx);
        rem = 0;
      }
    }
    if (this.wpIdx >= WAYPOINTS.length - 1) {
      this.reached = true;
      state.lives = Math.max(0, state.lives - 1);
      triggerShake(5);
      sfx.lifeLost();
      if (state.lives === 0) onEndGame(false);
      else onUpdateUI();
    }
  }

  draw(ctx) {
    if (this.dead || this.reached) return;
    const now = performance.now() / 1000;
    const r = this.def.r;
    const slow = this.slowUntil > now;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r + 2, r * 0.65, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#00000055';
    ctx.fill();
    const sz = r * 2.3;
    const drew = drawSprite(ctx, `enemy_${this.type}`, this.x, this.y, sz, this.angle + Math.PI / 2);
    if (!drew) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fillStyle = slow ? '#93c5fd' : this.def.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff22';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (slow) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(147,197,253,0.35)';
      ctx.fill();
    }
    const bw = r * 2.2;
    const bh = 4;
    const bx = this.x - bw / 2;
    const by = this.y - r - 10;
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(bx, by, bw, bh);
    const frac = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = frac > 0.6 ? '#22c55e' : frac > 0.3 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.strokeStyle = '#00000044';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx, by, bw, bh);
    if (this.def.armor > 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡', this.x, by - 1);
      ctx.textAlign = 'left';
    }
  }
}

export class Projectile {
  constructor(x, y, target, tdef, onUpdateUI, onEndGame) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.tdef = { ...tdef };
    this.onUpdateUI = onUpdateUI;
    this.onEndGame = onEndGame;
    this.speed = this.tdef.id === 'mortar' ? 160 : 300;
    this.dead = false;
    this.angle = Math.atan2(target.y - y, target.x - x);
    this.arc = this.tdef.id === 'mortar' ? 1 : 0;
    this.arcH = 0;
    if (this.arc) {
      const dx = target.x - x;
      const dy = target.y - y;
      this.arcDist = Math.sqrt(dx * dx + dy * dy);
      this.arcT = 0;
      this.arcDur = this.arcDist / this.speed;
    }
  }

  update(dt) {
    if (this.dead || this.target.dead) { this.dead = true; return; }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const move = this.speed * dt;
    if (dist <= move) {
      this.x = this.target.x;
      this.y = this.target.y;
      this.dead = true;
      const d = this.tdef;
      if (d.splash > 0) applySplash(this.target, d.damage, d.splash * CELL, d, this.onUpdateUI, this.onEndGame);
      else applyHit(this.target, d.damage, d, this.onUpdateUI, this.onEndGame);
    } else {
      this.angle = Math.atan2(dy, dx);
      this.x += (dx / dist) * move;
      this.y += (dy / dist) * move;
      if (this.arc) {
        this.arcT += dt;
        this.arcH = Math.sin((this.arcT / this.arcDur) * Math.PI) * 30;
      }
    }
  }

  draw(ctx) {
    if (this.dead) return;
    const d = this.tdef;
    const spriteName = d.id === 'cannon' ? 'bullet_cannon' : d.id === 'mortar' ? 'bullet_mortar' : d.id === 'ice' ? 'bullet_ice' : 'bullet_arrow';
    const sz = d.id === 'cannon' || d.id === 'mortar' ? 12 : 8;
    ctx.save();
    if (this.arcH) ctx.translate(this.x, this.y - this.arcH);
    const px = this.arcH ? 0 : this.x;
    const py = this.arcH ? 0 : this.y;
    if (!drawSprite(ctx, spriteName, px, py, sz, this.angle)) {
      const color = d.id === 'arrow' ? '#d97706' : d.id === 'cannon' || d.id === 'mortar' ? '#6b7280' : d.id === 'ice' ? '#93c5fd' : '#f87171';
      ctx.beginPath();
      ctx.arc(px, py, d.id === 'cannon' || d.id === 'mortar' ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  }
}