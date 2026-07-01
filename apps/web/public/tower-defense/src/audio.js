import { MUSIC_SRC } from './config.js?v=2';

let audioBuffersRef = {};
export function setAudioBuffers(bufs) { audioBuffersRef = bufs; }

export let AC = null;
let masterVol, musicVol, sfxVol;
let bgmAudio = null;
let musicLoopTimer = null;
let musicNextAt = 0;
let musicOn = true;
let sfxOn = true;
const _sfxT = {};

const BPM = 108;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const LOOP_BARS = 8;
const LOOP = BAR * LOOP_BARS;
const N = { D2: 73.42, A2: 110, C3: 130.81, D3: 146.83, F3: 174.61, G3: 196, A3: 220, Bb3: 233.08, C4: 261.63, D4: 293.66, F4: 349.23 };
const MELODY = [
  [N.D4, 0, 0.4], [N.C4, 0.5, 0.4], [N.A3, 1, 0.9], [N.G3, 2, 0.4], [N.A3, 2.5, 0.4], [N.C4, 3, 0.9],
  [N.D4, 4, 1.4], [N.A3, 5.5, 0.4], [N.G3, 6, 0.9], [N.F3, 7, 0.9],
  [N.F4, 8, 0.4], [N.D4, 8.5, 0.4], [N.C4, 9, 0.9], [N.D4, 10, 0.4], [N.C4, 10.5, 0.4], [N.A3, 11, 0.9],
  [N.G3, 12, 0.9], [N.A3, 13, 0.4], [N.C4, 13.5, 0.4], [N.D4, 14, 1.9],
  [N.G3, 16, 0.4], [N.A3, 16.5, 0.4], [N.C4, 17, 0.4], [N.D4, 17.5, 0.4], [N.C4, 18, 0.9], [N.A3, 19, 0.9],
  [N.G3, 20, 0.4], [N.F3, 20.5, 0.4], [N.G3, 21, 0.9], [N.A3, 22, 0.9], [N.C4, 23, 0.9],
  [N.D4, 24, 0.4], [N.C4, 24.5, 0.4], [N.Bb3, 25, 0.4], [N.A3, 25.5, 0.4], [N.G3, 26, 0.4], [N.A3, 26.5, 0.4], [N.C4, 27, 0.9],
  [N.D4, 28, 1.9], [N.A3, 30, 0.4], [N.G3, 30.5, 0.4], [N.F3, 31, 0.4], [N.D3, 31.5, 0.4],
];
const BASS_PAT = [[0, 0.7], [1, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5]];
const BASS_FREQS = [N.D2, N.A2, N.D2, N.C3, N.A2];
const PADS = [[[N.D3, N.F3, N.A3], 0, 15.9], [[N.G3, N.Bb3, N.D4], 16, 7.9], [[N.A3, N.C4], 24, 7.9]];

export function getMusicOn() { return musicOn; }
export function getSfxOn() { return sfxOn; }
export function setMusicOn(v) { musicOn = v; }
export function setSfxOn(v) { sfxOn = v; }

export function initAC() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  masterVol = AC.createGain();
  masterVol.gain.value = 1;
  masterVol.connect(AC.destination);
  musicVol = AC.createGain();
  musicVol.gain.value = 0.28;
  musicVol.connect(masterVol);
  sfxVol = AC.createGain();
  sfxVol.gain.value = 0.55;
  sfxVol.connect(masterVol);
}

export function resumeAC() {
  if (AC?.state === 'suspended') AC.resume();
}

function mkOsc(freq, type, t0, t1, peak, dest) {
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t1);
  o.connect(g);
  g.connect(dest || sfxVol);
  o.start(t0);
  o.stop(t1 + 0.05);
}

function mkNoise(dur, t0, peak, fType, fFreq, dest) {
  const n = (AC.sampleRate * dur) | 0;
  const buf = AC.createBuffer(1, n, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource();
  src.buffer = buf;
  const filt = AC.createBiquadFilter();
  filt.type = fType;
  filt.frequency.value = fFreq;
  const g = AC.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(dest || sfxVol);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function playBuf(name, vol = 1) {
  if (!AC || !sfxOn || !audioBuffersRef[name]) return false;
  const src = AC.createBufferSource();
  const g = AC.createGain();
  src.buffer = audioBuffersRef[name];
  g.gain.value = vol;
  src.connect(g);
  g.connect(sfxVol);
  src.start();
  return true;
}

function throttled(id, gap, fn) {
  const now = AC ? AC.currentTime : 0;
  if ((_sfxT[id] || 0) + gap > now) return;
  _sfxT[id] = now;
  fn();
}

function scheduleLoop(t0) {
  if (!musicOn || !AC) return;
  for (const [freq, bOff, bDur] of MELODY) {
    mkOsc(freq, 'triangle', t0 + bOff * BEAT, t0 + (bOff + bDur) * BEAT * 0.9, 0.16, musicVol);
  }
  for (let bar = 0; bar < LOOP_BARS; bar++) {
    for (let i = 0; i < BASS_PAT.length; i++) {
      const [bOff, bDur] = BASS_PAT[i];
      const t = t0 + (bar * 4 + bOff) * BEAT;
      const dur = bDur * BEAT * 0.85;
      const o = AC.createOscillator();
      const lp = AC.createBiquadFilter();
      const g = AC.createGain();
      o.type = 'sawtooth';
      o.frequency.value = BASS_FREQS[i];
      lp.type = 'lowpass';
      lp.frequency.value = 200;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(lp);
      lp.connect(g);
      g.connect(musicVol);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
  for (const [freqs, bStart, bDur] of PADS) {
    for (const freq of freqs) {
      const t = t0 + bStart * BEAT;
      const end = t + bDur * BEAT;
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.055, t + 0.4);
      g.gain.setValueAtTime(0.055, end - 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, end);
      o.connect(g);
      g.connect(musicVol);
      o.start(t);
      o.stop(end + 0.05);
    }
  }
}

function stopMusicLoop() {
  if (musicLoopTimer) {
    clearTimeout(musicLoopTimer);
    musicLoopTimer = null;
  }
}

function loopTick() {
  if (!AC || !musicOn) return;
  scheduleLoop(musicNextAt);
  musicNextAt += LOOP;
  musicLoopTimer = setTimeout(loopTick, (LOOP - 1.2) * 1000);
}

function startMusicLoop() {
  if (!AC || !musicOn) return;
  stopMusicLoop();
  const now = AC.currentTime;
  scheduleLoop(now + 0.1);
  musicNextAt = now + 0.1 + LOOP;
  musicLoopTimer = setTimeout(loopTick, (LOOP - 1.2) * 1000);
}

export function startMusic() {
  if (!musicOn) return;
  if (!bgmAudio) {
    bgmAudio = new Audio(MUSIC_SRC);
    bgmAudio.loop = true;
    bgmAudio.volume = 0.28;
  }
  bgmAudio.play().catch(() => startMusicLoop());
}

export function stopMusic() {
  if (bgmAudio) {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
  }
  stopMusicLoop();
}

export const sfx = {
  arrow() {
    if (!AC || !sfxOn) return;
    if (!playBuf('arrow', 0.6)) throttled('arrow', 0.12, () => { const t = AC.currentTime; mkNoise(0.09, t, 0.18, 'highpass', 3000); mkOsc(700, 'sine', t, t + 0.05, 0.07); });
  },
  cannon() {
    if (!AC || !sfxOn) return;
    if (!playBuf('cannon', 0.8)) throttled('cannon', 0.2, () => { const t = AC.currentTime; const o = AC.createOscillator(); const g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(18, t + 0.38); g.gain.setValueAtTime(0.75, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42); o.connect(g); g.connect(sfxVol); o.start(t); o.stop(t + 0.46); mkNoise(0.3, t, 0.3, 'lowpass', 450); });
  },
  ice() {
    if (!AC || !sfxOn) return;
    if (!playBuf('ice', 0.5)) throttled('ice', 0.15, () => { const t = AC.currentTime; [0, 0.03, 0.06].forEach((off, i) => mkOsc(1100 + i * 380, 'sine', t + off, t + off + 0.12, 0.1)); });
  },
  laser() {
    if (!AC || !sfxOn) return;
    throttled('laser', 0.08, () => { const t = AC.currentTime; const o = AC.createOscillator(); const g = AC.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.09); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(g); g.connect(sfxVol); o.start(t); o.stop(t + 0.12); });
  },
  mortar() {
    if (!AC || !sfxOn) return;
    if (!playBuf('explosion', 0.9)) sfx.cannon();
  },
  tesla() {
    if (!AC || !sfxOn) return;
    throttled('tesla', 0.1, () => { const t = AC.currentTime; const o = AC.createOscillator(); const g = AC.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(1200, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.15); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(sfxVol); o.start(t); o.stop(t + 0.2); mkNoise(0.12, t, 0.2, 'highpass', 4000); });
  },
  die(type) {
    if (!AC || !sfxOn) return;
    if (playBuf(`die_${type}`, 0.8)) return;
    const t = AC.currentTime;
    if (type === 'boss') {
      mkNoise(0.6, t, 0.7, 'lowpass', 350);
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(85, t);
      o.frequency.exponentialRampToValueAtTime(14, t + 0.55);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g);
      g.connect(sfxVol);
      o.start(t);
      o.stop(t + 0.65);
    } else if (type === 'tank' || type === 'armored') {
      mkNoise(0.25, t, 0.45, 'lowpass', 600);
      mkOsc(55, 'sine', t, t + 0.22, 0.55);
    } else if (type === 'fast' || type === 'swarm') {
      mkOsc(500, 'sine', t, t + 0.05, 0.2);
      mkOsc(700, 'sine', t + 0.02, t + 0.07, 0.12);
    } else {
      mkOsc(220, 'sine', t, t + 0.08, 0.28);
      mkNoise(0.07, t, 0.15, 'bandpass', 900);
    }
  },
  lifeLost() {
    if (!AC || !sfxOn) return;
    const t = AC.currentTime;
    mkOsc(220, 'sawtooth', t, t + 0.28, 0.38);
    mkOsc(110, 'sine', t + 0.1, t + 0.38, 0.45);
  },
  place() {
    if (!AC || !sfxOn) return;
    if (!playBuf('place', 0.7)) { const t = AC.currentTime; mkNoise(0.1, t, 0.25, 'bandpass', 800); mkOsc(280, 'sine', t, t + 0.09, 0.18); }
  },
  sell() {
    if (!AC || !sfxOn) return;
    if (!playBuf('sell', 0.6)) { const t = AC.currentTime; mkOsc(523, 'sine', t, t + 0.08, 0.18); mkOsc(659, 'sine', t + 0.07, t + 0.15, 0.18); }
  },
  waveStart() {
    if (!AC || !sfxOn) return;
    const t = AC.currentTime;
    [220, 277, 330].forEach((f, i) => mkOsc(f, 'sawtooth', t + i * 0.1, t + i * 0.1 + 0.22, 0.22));
  },
  waveClear() {
    if (!AC || !sfxOn) return;
    const t = AC.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => mkOsc(f, 'sine', t + i * 0.11, t + i * 0.11 + 0.28, 0.22));
  },
  gameOver() {
    if (!AC || !sfxOn) return;
    if (playBuf('gameover', 0.8)) return;
    const t = AC.currentTime;
    [330, 277, 220, 185, 147].forEach((f, i) => mkOsc(f, 'sawtooth', t + i * 0.22, t + i * 0.22 + 0.35, 0.22));
  },
  victory() {
    if (!AC || !sfxOn) return;
    if (playBuf('victory', 0.8)) return;
    const t = AC.currentTime;
    [[392, 0], [392, 0.14], [392, 0.28], [523, 0.48], [659, 0.68], [523, 0.88], [659, 1.1], [784, 1.3]].forEach(([f, off]) => {
      mkOsc(f, 'sine', t + off, t + off + 0.2, 0.25);
      mkOsc(f / 2, 'sine', t + off, t + off + 0.2, 0.12);
    });
  },
};