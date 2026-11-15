// Dice overlay. Tries the 3D physics dice (dice3d.js); falls back to a flat roll if WebGL or the module fails.
import { sound } from './sound.js';

const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
export function dieFace(n, colour) {
  const pip = colour === 'red' ? '#f6e7b4' : '#c0262d';
  const dots = PIPS[n].map(([x, y]) => `<circle cx="${18 + x * 22}" cy="${18 + y * 22}" r="6.5" fill="${pip}"/>`).join('');
  return `<svg viewBox="0 0 80 80"><rect x="3" y="3" width="74" height="74" rx="14" fill="${colour === 'red' ? '#c0262d' : '#f2c531'}" stroke="${colour === 'red' ? '#7d1418' : '#a8851a'}" stroke-width="3"/>${dots}</svg>`;
}

let three = null;
let tried = false;
async function load3d() {
  if (tried) return three;
  tried = true;
  try { three = await import('./dice3d.js'); if (!three.supported()) three = null; } catch (e) { console.warn('3D dice unavailable', e); three = null; }
  return three;
}

export async function rollDice(dice, { speed = 1, sound: on = false } = {}) {
  const el = document.getElementById('dice');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.hidden = false;
  el.innerHTML = '';
  const d3 = reduce ? null : await load3d();
  if (d3) {
    try {
      await d3.throwDice(el, dice, { speed, onHit: (v) => sound.play('die', { v }) });
    } catch (e) { console.warn(e); }
  } else {
    el.innerHTML = `<div class="flat-dice"><div class="die-flat">${dieFace(dice[0], 'red')}</div><div class="die-flat">${dieFace(dice[1], 'yellow')}</div></div>`;
    if (on) { sound.play('die'); setTimeout(() => sound.play('die', { v: 0.6 }), 120); }
    await new Promise((r) => setTimeout(r, reduce ? 300 : 500 * speed));
  }
  const total = document.createElement('div');
  total.className = 'dice-total';
  total.textContent = dice[0] + dice[1];
  el.appendChild(total);
  await new Promise((r) => setTimeout(r, 650 * speed));
  el.classList.add('leaving');
  await new Promise((r) => setTimeout(r, 200));
  el.classList.remove('leaving');
  el.hidden = true;
  el.innerHTML = '';
}
