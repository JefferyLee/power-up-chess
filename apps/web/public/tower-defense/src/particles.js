import { state } from './game-state.js?v=2';

export function triggerShake(amount) {
  state.shakeAmt = Math.max(state.shakeAmt, amount);
}

export function registerKill() {
  state.combo++;
  state.comboTimer = 2.0;
  state.comboDisplayTimer = 1.8;
  if (state.combo >= 5) state.score += Math.min(Math.floor(state.combo * 0.4), 8);
}

export function spawnSparks(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 100;
    state.particles.push({
      type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      color, r: 1.5 + Math.random() * 2.5, life: 0.4 + Math.random() * 0.3, maxLife: 0.4 + Math.random() * 0.3,
    });
  }
}

export function spawnDmgNumber(x, y, val, towerId) {
  const colors = { arrow: '#d97706', cannon: '#9ca3af', ice: '#60a5fa', laser: '#f87171', mortar: '#fb923c', tesla: '#a78bfa' };
  state.particles.push({
    type: 'dmg', x, y, val: String(val),
    vx: (Math.random() - 0.5) * 18, vy: -60 - Math.random() * 20,
    color: colors[towerId] || '#fff',
    size: val >= 100 ? 13 : val >= 50 ? 11 : 9,
    life: 0.85, maxLife: 0.85,
  });
}

export function updateParticles(dt) {
  for (const p of state.particles) {
    p.life -= dt;
    if (p.type === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 80 * dt; }
    if (p.type === 'ring') p.r = p.maxR * (1 - p.life / p.maxLife);
    if (p.type === 'dmg') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 35 * dt; }
  }
  for (let i = state.particles.length - 1; i >= 0; i--) {
    if (state.particles[i].life <= 0) state.particles.splice(i, 1);
  }
}

export function drawParticles(ctx) {
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    if (p.type === 'spark') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    } else if (p.type === 'ring') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.strokeStyle = p.color || '#fbbf24';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (p.type === 'beam') {
      ctx.beginPath();
      ctx.moveTo(p.x0, p.y0);
      ctx.lineTo(p.x1, p.y1);
      ctx.strokeStyle = p.color || '#f87171';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x0, p.y0);
      ctx.lineTo(p.x1, p.y1);
      ctx.strokeStyle = `${p.color || '#f87171'}66`;
      ctx.lineWidth = 6;
      ctx.stroke();
    } else if (p.type === 'chain') {
      ctx.beginPath();
      ctx.moveTo(p.x0, p.y0);
      const mx = (p.x0 + p.x1) / 2 + (Math.random() - 0.5) * 16;
      const my = (p.y0 + p.y1) / 2 + (Math.random() - 0.5) * 16;
      ctx.quadraticCurveTo(mx, my, p.x1, p.y1);
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (p.type === 'dmg') {
      ctx.font = `bold ${p.size}px sans-serif`;
      ctx.fillStyle = p.color;
      ctx.textAlign = 'center';
      ctx.fillText(p.val, p.x, p.y);
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}