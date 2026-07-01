import { esc } from './utils.js';

const SCORES_KEY = 'td_scores';
const SESSION_ID = Math.random().toString(36).slice(2);
const MAX_LOCAL_SCORES = 50;

export let userLocation = 'Unknown';
export let apiAvailable = false;
export let presenceInterval = null;
export let pollInterval = null;

async function tryFetch(path, options) {
  try {
    const resp = await fetch(path, options);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function detectApi() {
  const loc = await tryFetch('/api/location');
  if (loc) {
    apiAvailable = true;
    userLocation = loc.location || 'Unknown';
    return true;
  }
  apiAvailable = false;
  return false;
}

function getLocalScores() {
  try {
    return JSON.parse(localStorage.getItem(SCORES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalScores(rows) {
  localStorage.setItem(SCORES_KEY, JSON.stringify(rows.slice(0, MAX_LOCAL_SCORES)));
}

export async function submitScore(name, score, wave) {
  if (!name) return;
  const payload = { name, score, wave, location: userLocation, played_at: new Date().toISOString() };
  if (apiAvailable) {
    await tryFetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return;
  }
  const rows = getLocalScores();
  rows.push(payload);
  rows.sort((a, b) => b.score - a.score);
  saveLocalScores(rows);
}

export async function fetchScores() {
  if (apiAvailable) {
    const rows = await tryFetch('/api/scores');
    if (rows) return rows;
  }
  return getLocalScores();
}

export function startPresence(playerName) {
  stopPresence();
  if (!apiAvailable) {
    document.getElementById('online-panel')?.classList.add('hidden');
    return;
  }
  document.getElementById('online-panel')?.classList.remove('hidden');
  const heartbeat = () => {
    if (!playerName) return;
    tryFetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, name: playerName, location: userLocation }),
    });
  };
  heartbeat();
  presenceInterval = setInterval(heartbeat, 15000);
  pollInterval = setInterval(pollOnline, 5000);
  pollOnline();
}

export function stopPresence() {
  if (presenceInterval) clearInterval(presenceInterval);
  if (pollInterval) clearInterval(pollInterval);
  presenceInterval = null;
  pollInterval = null;
}

async function pollOnline() {
  const users = await tryFetch('/api/presence');
  if (!users) return;
  document.getElementById('online-count').textContent = users.length;
  const list = document.getElementById('online-list');
  list.innerHTML = users.map((u) => `<div class="online-item"><span class="online-name">${esc(u.name)}</span><span class="online-loc">${esc(u.location)}</span></div>`).join('');
}

export async function showLeaderboard() {
  const ol = document.getElementById('leaderboard-overlay');
  const body = document.getElementById('lb-body');
  body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6b7280">Loading…</td></tr>';
  ol.style.display = 'flex';
  try {
    const rows = await fetchScores();
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6b7280">No scores yet</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td style="color:#fbbf24">${r.score}</td><td>${r.wave || '-'}</td><td style="color:#6b7280">${esc(r.location || 'Local')}</td><td style="color:#6b7280">${(r.played_at || '').slice(0, 10)}</td></tr>`).join('');
  } catch {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#f87171">Failed to load</td></tr>';
  }
}