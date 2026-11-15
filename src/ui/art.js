// Hand-drawn SVG artwork for the board and components, in the style of the 5th edition.
// Everything is generated from code with a seeded generator, so each tile has its own detail.

import { PIPS } from '../engine/geometry.js';

export const PLAYER_COLOURS = {
  red: { base: '#c3262b', light: '#e0484a', dark: '#7f1418', text: '#fff' },
  blue: { base: '#1f5fae', light: '#3d80cf', dark: '#123a6e', text: '#fff' },
  white: { base: '#eeebe2', light: '#ffffff', dark: '#8f8777', text: '#2a2620' },
  orange: { base: '#e5762a', light: '#f5964c', dark: '#a24d14', text: '#fff' },
};

function seeded(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + size * Math.cos(a)).toFixed(1)},${(cy + size * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// Shared <defs>: texture filters and gradients.
export function sharedDefs() {
  return `
  <filter id="paint" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.34 0" result="a"/>
    <feComposite in="a" in2="SourceGraphic" operator="in" result="t"/>
    <feBlend in="SourceGraphic" in2="t" mode="multiply"/>
  </filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2.5"/><feOffset dx="2.5" dy="3.5" result="o"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="waves" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves="3" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.1 -0.45"/>
  </filter>
  <radialGradient id="tokenGrad" cx="40%" cy="35%" r="70%">
    <stop offset="0" stop-color="#f6e6bd"/><stop offset="0.65" stop-color="#e8cf98"/><stop offset="1" stop-color="#cfae6c"/>
  </radialGradient>
  <radialGradient id="robberGrad" cx="35%" cy="30%" r="75%">
    <stop offset="0" stop-color="#d6d6d4"/><stop offset="0.55" stop-color="#9a9b99"/><stop offset="1" stop-color="#5d5e5c"/>
  </radialGradient>
  <radialGradient id="vig" cx="50%" cy="45%" r="58%">
    <stop offset="0.55" stop-color="#2a1a08" stop-opacity="0"/><stop offset="1" stop-color="#2a1a08" stop-opacity="0.38"/>
  </radialGradient>
  <radialGradient id="sheen" cx="35%" cy="25%" r="60%">
    <stop offset="0" stop-color="#fff8dc" stop-opacity="0.22"/><stop offset="1" stop-color="#fff8dc" stop-opacity="0"/>
  </radialGradient>
  <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
  <linearGradient id="seaGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2f97d4"/><stop offset="0.5" stop-color="#3aa6dd"/><stop offset="1" stop-color="#2486c4"/>
  </linearGradient>
  <linearGradient id="woodGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#a9784a"/><stop offset="1" stop-color="#6e4723"/>
  </linearGradient>`;
}

// ---------- Terrain ----------

function tree(x, y, s, r, kind) {
  const g = ['#1f3f1b', '#29501f', '#335f26', '#3f7230', '#4d8238'];
  const c = g[Math.floor(r() * g.length)];
  const hi = '#6a9c45';
  if (kind === 'pine') {
    return `<g><ellipse cx="${x + s * 0.25}" cy="${y + s * 0.95}" rx="${s * 0.55}" ry="${s * 0.18}" fill="#152b12" opacity="0.35"/>
      <polygon points="${x},${y - s * 1.1} ${x + s * 0.62},${y + s * 0.8} ${x - s * 0.62},${y + s * 0.8}" fill="${c}"/>
      <polygon points="${x},${y - s * 1.1} ${x - s * 0.62},${y + s * 0.8} ${x - s * 0.1},${y + s * 0.8}" fill="${hi}" opacity="0.35"/></g>`;
  }
  return `<g><ellipse cx="${x + s * 0.3}" cy="${y + s * 0.6}" rx="${s * 0.75}" ry="${s * 0.3}" fill="#152b12" opacity="0.35"/>
    <circle cx="${x}" cy="${y}" r="${s * 0.72}" fill="${c}"/>
    <circle cx="${x - s * 0.22}" cy="${y - s * 0.25}" r="${s * 0.36}" fill="${hi}" opacity="0.45"/></g>`;
}

function sheep(x, y, s) {
  return `<g><ellipse cx="${x + 1.5}" cy="${y + s * 0.55}" rx="${s * 0.9}" ry="${s * 0.25}" fill="#3d6b1f" opacity="0.35"/>
    <ellipse cx="${x}" cy="${y}" rx="${s * 0.85}" ry="${s * 0.55}" fill="#f6f3e8"/>
    <circle cx="${x + s * 0.8}" cy="${y - s * 0.15}" r="${s * 0.28}" fill="#3a332b"/></g>`;
}

const TERRAIN_BASE = {
  forest: '#2f5a26', pasture: '#8cc14a', fields: '#d8a935', hills: '#a95a2b', mountains: '#9b97ab', desert: '#e4cf9c',
};

// Returns SVG for the painted interior of a tile centred at (0,0), size 100. Clip outside.
export function terrainArt(terrain, seed) {
  const r = seeded(seed + 1);
  const parts = [];
  const base = TERRAIN_BASE[terrain];
  parts.push(`<rect x="-110" y="-110" width="220" height="220" fill="${base}"/>`);
  if (terrain === 'forest') {
    parts.push(`<circle cx="-20" cy="-30" r="70" fill="#3a6b2e" opacity="0.6" filter="url(#soft)"/>`);
    const items = [];
    for (let i = 0; i < 70; i++) {
      const x = -95 + r() * 190, y = -95 + r() * 190;
      items.push([x, y, 9 + r() * 7, r() < 0.55 ? 'pine' : 'round']);
    }
    items.sort((a, b) => a[1] - b[1]);
    for (const [x, y, s, k] of items) parts.push(tree(x, y, s, r, k));
  } else if (terrain === 'pasture') {
    parts.push(`<ellipse cx="-25" cy="-20" rx="60" ry="40" fill="#a8d462" opacity="0.7" filter="url(#soft)"/>`);
    parts.push(`<ellipse cx="35" cy="35" rx="50" ry="30" fill="#77ad3c" opacity="0.6" filter="url(#soft)"/>`);
    parts.push(`<path d="M-90,20 C-40,0 20,40 90,10" stroke="#b9dc7a" stroke-width="5" fill="none" opacity="0.6"/>`);
    for (let i = 0; i < 40; i++) {
      const x = -90 + r() * 180, y = -90 + r() * 180;
      parts.push(`<path d="M${x},${y} l2,-5 l2,5" stroke="#5f9630" stroke-width="1.4" fill="none" opacity="0.7"/>`);
    }
    parts.push(tree(-48, -42, 10, r, 'round'), tree(55, -10, 9, r, 'round'));
    const flock = [[-10, 5], [12, -18], [28, 22], [-30, 35], [-5, 45], [40, -45]];
    for (const [x, y] of flock) parts.push(sheep(x + r() * 8, y + r() * 8, 6));
  } else if (terrain === 'fields') {
    const patches = [
      { a: -28, dx: -40, dy: -30, c1: '#e8c04a', c2: '#c9952b' },
      { a: 18, dx: 35, dy: 30, c1: '#f0cd5a', c2: '#d2a136' },
      { a: -60, dx: 30, dy: -45, c1: '#dcb041', c2: '#b9862a' },
    ];
    for (const p of patches) {
      let s = `<g transform="translate(${p.dx},${p.dy}) rotate(${p.a})">`;
      for (let i = -6; i < 6; i++) s += `<rect x="-80" y="${i * 9}" width="160" height="5" fill="${i % 2 ? p.c1 : p.c2}" opacity="0.85"/>`;
      parts.push(s + '</g>');
    }
    parts.push(`<path d="M-100,-5 C-40,-20 30,15 100,-10" stroke="#7d6a2c" stroke-width="3" fill="none" opacity="0.5"/>`);
    for (let i = 0; i < 6; i++) {
      const x = -60 + r() * 120, y = -60 + r() * 120;
      parts.push(`<g><ellipse cx="${x + 2}" cy="${y + 6}" rx="6" ry="2" fill="#6b4f16" opacity="0.4"/><path d="M${x - 4},${y + 5} L${x},${y - 7} L${x + 4},${y + 5} Z" fill="#f2d679" stroke="#a7802a" stroke-width="0.8"/></g>`);
    }
  } else if (terrain === 'hills') {
    for (let i = 0; i < 26; i++) parts.push(`<ellipse cx="${-90 + r() * 180}" cy="${-90 + r() * 180}" rx="${10 + r() * 22}" ry="${6 + r() * 12}" fill="${r() < 0.5 ? '#c27238' : '#8d4721'}" opacity="0.45" filter="url(#soft)"/>`);
    parts.push(`<ellipse cx="5" cy="5" rx="62" ry="48" fill="#86421f" opacity="0.8" filter="url(#soft)"/>`);
    for (let i = 0; i < 4; i++) {
      parts.push(`<ellipse cx="5" cy="${5 + i * 3}" rx="${55 - i * 12}" ry="${40 - i * 9}" fill="none" stroke="${i % 2 ? '#d78a50' : '#9a5228'}" stroke-width="${6 - i}" opacity="${0.35 + i * 0.08}" stroke-dasharray="${30 + i * 10} ${8 + i * 4}"/>`);
    }
    parts.push(`<ellipse cx="8" cy="12" rx="14" ry="9" fill="#6e3518"/>`);
    // Brick stacks and a kiln.
    const stack = (x, y) => {
      let s = '';
      for (let row = 0; row < 3; row++) for (let c = 0; c < 3 - row; c++) s += `<rect x="${x + c * 6 + row * 3}" y="${y - row * 4}" width="5.5" height="3.6" fill="#a8401f" stroke="#5e2410" stroke-width="0.5"/>`;
      return s;
    };
    parts.push(stack(-62, 40), stack(45, -48), stack(50, 45));
    parts.push(`<g transform="translate(-55,-40)"><rect x="-8" y="-6" width="16" height="12" fill="#8c5a35"/><polygon points="-10,-6 0,-14 10,-6" fill="#5b3a22"/><rect x="2" y="-18" width="3" height="8" fill="#5b3a22"/></g>`);
    for (let i = 0; i < 18; i++) parts.push(`<circle cx="${-90 + r() * 180}" cy="${-90 + r() * 180}" r="${1 + r() * 2.5}" fill="#e0a06a" opacity="0.6"/>`);
  } else if (terrain === 'mountains') {
    const peaks = [];
    for (let i = 0; i < 9; i++) peaks.push([-80 + r() * 160, -70 + r() * 150, 30 + r() * 30]);
    peaks.sort((a, b) => a[1] - b[1]);
    for (const [x, y, s] of peaks) {
      const top = [x + (r() - 0.5) * 10, y - s];
      parts.push(`<polygon points="${x - s},${y + s * 0.35} ${top[0]},${top[1]} ${x + s},${y + s * 0.35}" fill="#7c778f"/>`);
      parts.push(`<polygon points="${x - s},${y + s * 0.35} ${top[0]},${top[1]} ${x - s * 0.05},${y + s * 0.35}" fill="#c6c2d3"/>`);
      parts.push(`<polygon points="${top[0]},${top[1]} ${top[0] - s * 0.28},${top[1] + s * 0.4} ${top[0] - 2},${top[1] + s * 0.3} ${top[0] + s * 0.22},${top[1] + s * 0.38}" fill="#f4f3f8"/>`);
    }
    parts.push(`<path d="M-30,70 C-10,40 20,50 25,10" stroke="#e9e7ef" stroke-width="2" fill="none" opacity="0.6"/>`);
  } else if (terrain === 'desert') {
    for (let i = 0; i < 7; i++) {
      const y = -80 + i * 26 + r() * 8;
      parts.push(`<path d="M-100,${y} C-50,${y - 14} 0,${y + 14} 100,${y - 6}" stroke="${i % 2 ? '#d3b97f' : '#f2e3bb'}" stroke-width="7" fill="none" opacity="0.55"/>`);
    }
    for (let i = 0; i < 4; i++) {
      const x = -60 + r() * 120, y = -60 + r() * 120;
      parts.push(`<path d="M${x},${y} l-5,-6 M${x},${y} l4,-7 M${x},${y} l0,-8" stroke="#8a6d3f" stroke-width="1.2"/>`);
    }
  }
  return parts.join('');
}

// ---------- Number tokens ----------

export function numberToken(n, x, y, scale = 1) {
  const red = n === 6 || n === 8;
  const pips = PIPS[n];
  const size = { 2: 17, 3: 19, 4: 21, 5: 23, 6: 26, 8: 26, 9: 23, 10: 21, 11: 19, 12: 17 }[n];
  const col = red ? '#c0262d' : '#2b241c';
  let dots = '';
  for (let i = 0; i < pips; i++) dots += `<circle cx="${(i - (pips - 1) / 2) * 5.2}" cy="13" r="1.9" fill="${col}"/>`;
  return `<g class="token" transform="translate(${x},${y}) scale(${scale})">
    <circle r="27" cx="1.5" cy="2.5" fill="#000" opacity="0.28"/>
    <circle r="27" fill="url(#tokenGrad)" stroke="#b89b62" stroke-width="1.2"/>
    <circle r="23.5" fill="none" stroke="#e8d6a8" stroke-width="1"/>
    <text y="${red ? 7 : 6}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${size}" fill="${col}">${n}</text>
    ${dots}</g>`;
}

// ---------- Resource icons ----------

export function resourceIcon(res, s = 1) {
  const g = (inner) => `<g transform="scale(${s})">${inner}</g>`;
  switch (res) {
    case 'brick': return g(`<g stroke="#5e2410" stroke-width="0.8"><rect x="-11" y="2" width="10" height="5" fill="#b4472a"/><rect x="0" y="2" width="10" height="5" fill="#a63e22"/><rect x="-6" y="-3.5" width="10" height="5" fill="#c0532f"/><rect x="5" y="-3.5" width="6" height="5" fill="#a63e22"/><rect x="-11" y="-3.5" width="4" height="5" fill="#b4472a"/><rect x="-5" y="-9" width="10" height="5" fill="#b4472a"/></g>`);
    case 'lumber': return g(`<g stroke="#3e2410" stroke-width="0.8"><rect x="-11" y="-1" width="22" height="6" rx="3" fill="#9a6532"/><rect x="-11" y="-7" width="22" height="6" rx="3" fill="#a87140"/><circle cx="11" cy="2" r="3" fill="#e2b981"/><circle cx="11" cy="-4" r="3" fill="#e2b981"/><path d="M-4,-14 l4,7 l4,-7 z" fill="#2f5a26" stroke="none"/></g>`);
    case 'wool': return g(`<ellipse cx="0" cy="0" rx="10" ry="7" fill="#f6f3e8" stroke="#8a8170" stroke-width="0.8"/><circle cx="9" cy="-3" r="3.6" fill="#3a332b"/><rect x="-6" y="5" width="2" height="5" fill="#3a332b"/><rect x="4" y="5" width="2" height="5" fill="#3a332b"/>`);
    case 'grain': return g(`<g stroke="#8a6416" stroke-width="0.8"><path d="M0,10 L-6,-10 M0,10 L0,-12 M0,10 L6,-10" fill="none"/><ellipse cx="-6" cy="-10" rx="2.6" ry="5" fill="#f0cf5c"/><ellipse cx="0" cy="-12" rx="2.6" ry="5" fill="#f5d96a"/><ellipse cx="6" cy="-10" rx="2.6" ry="5" fill="#f0cf5c"/><rect x="-4" y="1" width="8" height="2.5" fill="#c58f2a"/></g>`);
    case 'ore': return g(`<g stroke="#3d3a4a" stroke-width="0.8"><polygon points="-11,8 -6,-4 1,-1 4,8" fill="#7f7a92"/><polygon points="-2,8 3,-8 11,-2 11,8" fill="#a19db3"/><polygon points="3,-8 6,-4 11,-2" fill="#d9d6e3"/></g>`);
  }
  return '';
}

// ---------- Harbours ----------

export function harbour(h, x1, y1, x2, y2, sx, sy) {
  const label = h.type === 'any' ? '3:1' : '2:1';
  const icon = h.type === 'any'
    ? `<text y="9" text-anchor="middle" font-family="Georgia, serif" font-size="12" font-weight="700" fill="#2d5aa0">?</text>`
    : `<g transform="translate(0,5)">${resourceIcon(h.type, 0.62)}</g>`;
  // Piers from the two harbour intersections towards the ship.
  const pier = (ax, ay) => {
    const mx = ax + (sx - ax) * 0.55, my = ay + (sy - ay) * 0.55;
    return `<line x1="${ax}" y1="${ay}" x2="${mx}" y2="${my}" stroke="#6b4a2a" stroke-width="7" stroke-linecap="round"/>
      <line x1="${ax}" y1="${ay}" x2="${mx}" y2="${my}" stroke="#b08454" stroke-width="4.5" stroke-dasharray="3 1.5"/>`;
  };
  return `<g class="harbour">${pier(x1, y1)}${pier(x2, y2)}
    <g transform="translate(${sx},${sy}) scale(1.5)" filter="url(#shadow)">
      <path d="M-20,4 Q0,18 20,4 L16,12 Q0,20 -16,12 Z" fill="#7a4f2a" stroke="#4a2e16" stroke-width="1"/>
      <line x1="0" y1="8" x2="0" y2="-26" stroke="#4a2e16" stroke-width="1.6"/>
      <path d="M-15,-24 Q0,-28 15,-24 L14,2 Q0,-1 -14,2 Z" fill="#f4ecd6" stroke="#9c8a62" stroke-width="1"/>
      <text y="-13" text-anchor="middle" font-family="Georgia, serif" font-size="9.5" font-weight="700" fill="#2b241c">${label}</text>
      <g transform="translate(0,-10) scale(0.85)">${icon}</g>
    </g></g>`;
}

// ---------- Wooden pieces ----------

export function settlementSVG(colour, x, y, s = 1) {
  const c = PLAYER_COLOURS[colour];
  return `<g class="piece" transform="translate(${x},${y}) scale(${s})" filter="url(#shadow)">
    <polygon points="-9,-1 -9,12 5,12 5,-1 -2,-9" fill="${c.base}" stroke="${c.dark}" stroke-width="0.8"/>
    <polygon points="5,-1 12,-6 12,7 5,12" fill="${c.dark}" stroke="${c.dark}" stroke-width="0.8"/>
    <polygon points="-2,-9 5,-14 12,-6 5,-1" fill="${c.light}" stroke="${c.dark}" stroke-width="0.8"/>
    <polygon points="-9,-1 -2,-9 -1,-8 -8,0" fill="#fff" opacity="0.25"/>
  </g>`;
}

export function citySVG(colour, x, y, s = 1) {
  const c = PLAYER_COLOURS[colour];
  return `<g class="piece" transform="translate(${x},${y}) scale(${s})" filter="url(#shadow)">
    <polygon points="-15,2 -15,13 9,13 9,2" fill="${c.base}" stroke="${c.dark}" stroke-width="0.8"/>
    <polygon points="9,2 15,-2 15,9 9,13" fill="${c.dark}" stroke="${c.dark}" stroke-width="0.8"/>
    <polygon points="-15,2 -9,-2 15,-2 9,2" fill="${c.light}" stroke="${c.dark}" stroke-width="0.8"/>
    <polygon points="-3,2 -3,-12 3,-20 9,-12 9,2" fill="${c.base}" stroke="${c.dark}" stroke-width="0.8"/>
    <polygon points="9,-12 15,-16 15,-2 9,2" fill="${c.dark}" stroke="${c.dark}" stroke-width="0.8"/>
    <polygon points="3,-20 9,-24 15,-16 9,-12" fill="${c.light}" stroke="${c.dark}" stroke-width="0.8"/>
  </g>`;
}

export function roadSVG(colour, x1, y1, x2, y2) {
  const c = PLAYER_COLOURS[colour];
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const L = len * 0.62;
  return `<g class="piece road" transform="translate(${mx},${my}) rotate(${ang})" filter="url(#shadow)">
    <rect x="${-L / 2}" y="-4" width="${L}" height="13" rx="2" fill="${c.dark}"/>
    <rect x="${-L / 2}" y="-8" width="${L}" height="12" rx="2" fill="${c.base}" stroke="${c.dark}" stroke-width="1"/>
    <rect x="${-L / 2 + 1.5}" y="-6.5" width="${L - 3}" height="3" rx="1" fill="#fff" opacity="0.22"/>
  </g>`;
}

export function robberSVG(x, y, s = 1) {
  return `<g class="robber" transform="translate(${x},${y}) scale(${s})" filter="url(#shadow)">
    <ellipse cx="0" cy="22" rx="16" ry="6" fill="#6d6e6c"/>
    <path d="M-15,21 C-14,6 -10,-4 -8,-10 L8,-10 C10,-4 14,6 15,21 Z" fill="url(#robberGrad)"/>
    <ellipse cx="0" cy="-10" rx="10" ry="4" fill="#8d8e8c"/>
    <circle cx="0" cy="-20" r="11" fill="url(#robberGrad)"/>
  </g>`;
}

// Icons for the Building Costs card and buttons.
export function pieceIcon(kind, colour) {
  const vb = '-18 -20 36 36';
  const inner = kind === 'settlement' ? settlementSVG(colour, 0, 0, 1.1)
    : kind === 'city' ? citySVG(colour, 0, 2, 0.95)
    : kind === 'road' ? roadSVG(colour, -24, 6, 24, -6)
    : devBackMini();
  return `<svg viewBox="${vb}" class="piece-icon" aria-hidden="true">${inner}</svg>`;
}
function devBackMini() {
  return `<g><rect x="-10" y="-14" width="20" height="28" rx="2.5" fill="#f3e9cf" stroke="#9c8a62"/><circle r="7" fill="#e7b62c"/><path d="M-7,0 A7,7 0 0 0 7,0 Z" fill="#c0262d"/><path d="M-6,3.5 A7,7 0 0 0 6,3.5 Z" fill="#1f5fae"/></g>`;
}
