// Quiet synthesised sounds (no audio files): dice on wood, cards, wooden pieces.
let ctx = null;
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } }
  return ctx;
}
function noise(c, dur, { freq = 1800, q = 1, gain = 0.08, when = 0, type = 'bandpass' } = {}) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + when);
}
function knock(c, { freq = 220, gain = 0.12, when = 0 } = {}) {
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
  const g = c.createGain();
  const t = c.currentTime + when;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.1);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.14);
  noise(c, 0.03, { freq: 2500, gain: gain * 0.5, when });
}
export const sound = {
  enabled: false,
  unlocked: false, // browsers only allow audio after the first click or key press
  unlock() { this.unlocked = true; if (this.enabled) { const c = ac(); if (c && c.state === 'suspended') c.resume(); } },
  play(kind, opts = {}) {
    if (!this.enabled || !this.unlocked) return;
    const c = ac(); if (!c) return;
    if (kind === 'card') noise(c, 0.12, { freq: 3200, q: 0.6, gain: 0.05 });
    else if (kind === 'piece') knock(c, { freq: 260, gain: 0.1 });
    else if (kind === 'road') knock(c, { freq: 340, gain: 0.07 });
    else if (kind === 'turn') {
      for (const [f, t] of [[523, 0], [659, 0.12]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = c.createGain(); const at = c.currentTime + t;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.035, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
        o.connect(g).connect(c.destination); o.start(at); o.stop(at + 0.55);
      }
    }
    else if (kind === 'die') knock(c, { freq: 500 + Math.random() * 300, gain: 0.05 * (opts.v || 1) });
  },
};

for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => sound.unlock(), { once: false, passive: true });
