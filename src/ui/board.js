// Renders the board as one SVG and handles clicks on highlighted spots.
import { GEO, hexCentre } from '../engine/geometry.js';
import { terrainArt, numberToken, harbour, settlementSVG, citySVG, roadSVG, robberSVG, hexPoints } from './art.js';

const S = 100; // hex size in SVG units
export const hexXY = (i) => { const h = GEO.hexes[i]; const [x, y] = hexCentre(h.q, h.r); return [x * S, y * S]; };
export const vXY = (v) => [GEO.vertices[v].x * S, GEO.vertices[v].y * S];

export function createBoard(svg) {
  const R = 590; // sea frame radius (flat-top hexagon)
  let staticKey = null;
  let known = new Set();
  let targetHandler = null;

  svg.setAttribute('viewBox', `${-R - 10} ${-R * 0.866 - 10} ${2 * R + 20} ${R * 1.732 + 20}`);
  svg.innerHTML = `<g id="b-static"></g><g id="b-glow"></g><g id="b-roads"></g><g id="b-buildings"></g><g id="b-robber"></g><g id="b-targets"></g>`;
  const $ = (id) => svg.querySelector(id);

  function drawStatic(state) {
    const parts = [];
    // Sea frame: a flat-topped hexagon, darker rim, painted waves.
    const frame = [];
    for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; frame.push(`${R * Math.cos(a)},${R * Math.sin(a)}`); }
    parts.push(`<polygon points="${frame.join(' ')}" fill="#1d6fa6" transform="translate(4,6)" opacity="0.5"/>`);
    parts.push(`<polygon points="${frame.join(' ')}" fill="url(#seaGrad)" stroke="#1b5f8f" stroke-width="4"/>`);
    parts.push(`<polygon points="${frame.join(' ')}" fill="#fff" filter="url(#waves)" opacity="0.35" style="mix-blend-mode:soft-light"/>`);
    const inner = [];
    for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; inner.push(`${(R - 14) * Math.cos(a)},${(R - 14) * Math.sin(a)}`); }
    parts.push(`<polygon points="${inner.join(' ')}" fill="none" stroke="#7cc6ec" stroke-width="1.5" opacity="0.6"/>`);
    // Shallow water and sandy coast under the tiles.
    for (let i = 0; i < 19; i++) { const [x, y] = hexXY(i); parts.push(`<polygon points="${hexPoints(x, y, 128)}" fill="#6cc0e6" opacity="0.55"/>`); }
    parts.push(`<g filter="url(#blur6)" opacity="0.8">${[...Array(19).keys()].map((i) => { const [x, y] = hexXY(i); return `<polygon points="${hexPoints(x, y, 118)}" fill="#e9f6fb"/>`; }).join('')}</g>`);
    for (let i = 0; i < 19; i++) { const [x, y] = hexXY(i); parts.push(`<polygon points="${hexPoints(x, y, 113)}" fill="#e6cf92"/>`); }
    for (let i = 0; i < 19; i++) { const [x, y] = hexXY(i); parts.push(`<polygon points="${hexPoints(x, y, 108)}" fill="#efdcab"/>`); }
    // Tiles.
    state.board.hexes.forEach((h, i) => {
      const [x, y] = hexXY(i);
      parts.push(`<clipPath id="clip-h${i}"><polygon points="${hexPoints(0, 0, 93)}"/></clipPath>`);
      parts.push(`<g transform="translate(${x},${y})" data-hex="${i}">
        <polygon points="${hexPoints(0, 0, 100)}" fill="#e9d7a4" stroke="#b49b62" stroke-width="1.5"/>
        <g clip-path="url(#clip-h${i})"><g filter="url(#paint)">${terrainArt(h.terrain, i * 7 + h.terrain.length)}</g>
          <polygon points="${hexPoints(0, 0, 93)}" fill="url(#sheen)"/><polygon points="${hexPoints(0, 0, 93)}" fill="url(#vig)"/></g>
        <polygon points="${hexPoints(0, 0, 93)}" fill="none" stroke="#f3e6bf" stroke-width="2" opacity="0.7"/>
      </g>`);
    });
    // Harbours.
    for (const h of state.board.harbours) {
      const [x1, y1] = vXY(h.vertices[0]);
      const [x2, y2] = vXY(h.vertices[1]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const len = Math.hypot(mx, my);
      const sx = mx + (mx / len) * 72, sy = my + (my / len) * 72;
      parts.push(harbour(h, x1, y1, x2, y2, sx, sy));
    }
    // Number tokens.
    state.board.hexes.forEach((h, i) => { if (h.number) { const [x, y] = hexXY(i); parts.push(numberToken(h.number, x, y)); } });
    $('#b-static').innerHTML = parts.join('');
  }

  function render(state) {
    const key = JSON.stringify(state.board.hexes) + JSON.stringify(state.board.harbours.map((h) => h.type));
    if (key !== staticKey) { drawStatic(state); staticKey = key; known = new Set(); }
    const colour = (p) => state.players[p].colour;
    const now = new Set();
    let roads = '';
    for (const [e, p] of Object.entries(state.roads)) {
      const [a, b] = GEO.edges[e].v;
      const [x1, y1] = vXY(a), [x2, y2] = vXY(b);
      const k = `r${e}`;
      now.add(k);
      roads += `<g class="${known.has(k) ? '' : 'placed'}">${roadSVG(colour(p), x1, y1, x2, y2)}</g>`;
    }
    $('#b-roads').innerHTML = roads;
    let bs = '';
    const sorted = Object.entries(state.buildings).sort((a, b) => vXY(+a[0])[1] - vXY(+b[0])[1]);
    for (const [v, b] of sorted) {
      const [x, y] = vXY(+v);
      const k = `${b.type[0]}${v}`;
      now.add(k);
      const art = b.type === 'city' ? citySVG(colour(b.player), x, y - 4, 1.9) : settlementSVG(colour(b.player), x, y - 3, 1.9);
      bs += `<g class="${known.has(k) ? '' : 'placed'}">${art}</g>`;
    }
    $('#b-buildings').innerHTML = bs;
    known = now;
    const [rx, ry] = hexXY(state.board.robber);
    const rob = $('#b-robber');
    if (!rob.firstChild) rob.innerHTML = `<g class="robber-wrap">${robberSVG(0, 0, 1.6)}</g>`;
    rob.firstChild.style.transform = `translate(${rx - 38}px, ${ry - 4}px)`;
  }

  // Highlight legal spots. kinds: { vertices: [], edges: [], hexes: [], colour }
  function setTargets(t, onPick) {
    targetHandler = onPick;
    const g = $('#b-targets');
    if (!t) { g.innerHTML = ''; svg.classList.remove('picking'); return; }
    svg.classList.add('picking');
    let s = '';
    for (const e of t.edges || []) {
      const [a, b] = GEO.edges[e].v;
      const [x1, y1] = vXY(a), [x2, y2] = vXY(b);
      s += `<g class="target target-edge" data-edge="${e}"><line x1="${x1 + (x2 - x1) * 0.2}" y1="${y1 + (y2 - y1) * 0.2}" x2="${x1 + (x2 - x1) * 0.8}" y2="${y1 + (y2 - y1) * 0.8}" class="hit"/><line x1="${x1 + (x2 - x1) * 0.2}" y1="${y1 + (y2 - y1) * 0.2}" x2="${x1 + (x2 - x1) * 0.8}" y2="${y1 + (y2 - y1) * 0.8}" class="mark"/></g>`;
    }
    for (const v of t.vertices || []) {
      const [x, y] = vXY(v);
      s += `<g class="target target-vertex" data-vertex="${v}"><circle cx="${x}" cy="${y}" r="22" class="hit"/><circle cx="${x}" cy="${y}" r="10" class="mark"/></g>`;
    }
    for (const h of t.hexes || []) {
      const [x, y] = hexXY(h);
      s += `<g class="target target-hex" data-hex="${h}"><polygon points="${hexPoints(x, y, 90)}" class="hit"/><polygon points="${hexPoints(x, y, 86)}" class="mark"/></g>`;
    }
    g.innerHTML = s;
  }

  svg.addEventListener('click', (ev) => {
    const t = ev.target.closest('.target');
    if (!t || !targetHandler) return;
    const d = t.dataset;
    if (d.edge !== undefined) targetHandler({ edge: +d.edge });
    else if (d.vertex !== undefined) targetHandler({ vertex: +d.vertex });
    else if (d.hex !== undefined) targetHandler({ hex: +d.hex });
  });

  function glowHexes(hexes, blocked = []) {
    const g = $('#b-glow');
    g.innerHTML = hexes.map((i) => { const [x, y] = hexXY(i); return `<polygon class="${blocked.includes(i) ? 'glow blocked' : 'glow'}" points="${hexPoints(x, y, 93)}"/>`; }).join('');
    clearTimeout(glowHexes.t);
    glowHexes.t = setTimeout(() => (g.innerHTML = ''), 1400);
  }

  // Screen position of a hex or vertex, for flying-card animations.
  function screenPos(kind, id) {
    const [x, y] = kind === 'hex' ? hexXY(id) : vXY(id);
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const p = pt.matrixTransform(svg.getScreenCTM());
    return [p.x, p.y];
  }

  return { render, setTargets, glowHexes, screenPos };
}
