// Board geometry for the base game: 19 land hexes (pointy-top), 54 intersections, 72 paths.
// Pure data, no DOM. Pixel coordinates use hex "size" 1 (centre to corner).

export const SQRT3 = Math.sqrt(3);

// Axial coordinates of land hexes, ordered by row (top to bottom), then left to right.
export const HEX_COORDS = [];
for (let r = -2; r <= 2; r++) {
  for (let q = -2; q <= 2; q++) {
    if (Math.abs(q + r) <= 2) HEX_COORDS.push([q, r]);
  }
}

// Edge directions of a pointy-top hex. Edge i runs from corner i to corner i+1.
// Corner i sits at angle (60*i - 90) degrees: 0 top, 1 upper right, 2 lower right, 3 bottom, 4 lower left, 5 upper left.
export const DIRS = ['NE', 'E', 'SE', 'SW', 'W', 'NW'];
export const NEIGHBOUR = { NE: [1, -1], E: [1, 0], SE: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [0, -1] };

export function hexCentre(q, r) {
  return [SQRT3 * (q + r / 2), 1.5 * r];
}
export function cornerPos(q, r, i) {
  const [cx, cy] = hexCentre(q, r);
  const a = (Math.PI / 180) * (60 * i - 90);
  return [cx + Math.cos(a), cy + Math.sin(a)];
}

const key = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

function build() {
  const vertices = []; // { id, x, y, hexes: [hexIdx], adj: [vertexId], edges: [edgeId] }
  const edges = []; // { id, v: [a, b], hexes: [hexIdx] }
  const vByKey = new Map();
  const eByKey = new Map();
  const hexes = HEX_COORDS.map(([q, r], idx) => ({ idx, q, r, corners: [], edges: [] }));

  for (const h of hexes) {
    for (let i = 0; i < 6; i++) {
      const [x, y] = cornerPos(h.q, h.r, i);
      const k = key(x, y);
      let v = vByKey.get(k);
      if (!v) {
        v = { id: vertices.length, x, y, hexes: [], adj: [], edges: [] };
        vertices.push(v);
        vByKey.set(k, v);
      }
      v.hexes.push(h.idx);
      h.corners.push(v.id);
    }
  }
  for (const h of hexes) {
    for (let i = 0; i < 6; i++) {
      const a = h.corners[i], b = h.corners[(i + 1) % 6];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let e = eByKey.get(k);
      if (!e) {
        e = { id: edges.length, v: [Math.min(a, b), Math.max(a, b)], hexes: [] };
        edges.push(e);
        eByKey.set(k, e);
        vertices[a].adj.push(b);
        vertices[b].adj.push(a);
        vertices[a].edges.push(e.id);
        vertices[b].edges.push(e.id);
      }
      e.hexes.push(h.idx);
      h.edges.push(e.id);
    }
  }
  return { hexes, vertices, edges, eByKey };
}

export const GEO = build();

export function hexIndex(q, r) {
  return GEO.hexes.findIndex((h) => h.q === q && h.r === r);
}
export function edgeOf(q, r, dir) {
  return GEO.hexes[hexIndex(q, r)].edges[DIRS.indexOf(dir)];
}
export function edgeBetween(a, b) {
  const e = GEO.eByKey.get(a < b ? `${a}-${b}` : `${b}-${a}`);
  return e ? e.id : -1;
}

// The 9 harbour positions on the frame (clockwise from top left), as coastal edges.
// Read from Illustration A of the 2020 rulebook. The `type` here is the beginner map's harbour.
export const HARBOUR_SPOTS = [
  { q: 0, r: -2, dir: 'NW', type: 'any' },
  { q: 1, r: -2, dir: 'NE', type: 'grain' },
  { q: 2, r: -1, dir: 'NE', type: 'ore' },
  { q: 2, r: 0, dir: 'E', type: 'any' },
  { q: 1, r: 1, dir: 'SE', type: 'wool' },
  { q: -1, r: 2, dir: 'SE', type: 'any' },
  { q: -2, r: 2, dir: 'SW', type: 'any' },
  { q: -2, r: 1, dir: 'W', type: 'brick' },
  { q: -2, r: 0, dir: 'NW', type: 'lumber' },
];

// Beginner map (Illustration A): rows top to bottom.
export const BEGINNER_MAP = [
  ['mountains', 10], ['pasture', 2], ['forest', 9],
  ['fields', 12], ['hills', 6], ['pasture', 4], ['hills', 10],
  ['fields', 9], ['forest', 11], ['desert', 0], ['forest', 3], ['mountains', 8],
  ['forest', 8], ['mountains', 3], ['fields', 4], ['pasture', 5],
  ['hills', 5], ['fields', 6], ['pasture', 11],
];

// Outer and inner rings, anticlockwise (on screen) from the top-left corner hex.
export const OUTER_RING = [[0, -2], [-1, -1], [-2, 0], [-2, 1], [-2, 2], [-1, 2], [0, 2], [1, 1], [2, 0], [2, -1], [2, -2], [1, -2]];
export const INNER_RING = [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]];
// Number tokens A to R.
export const TOKEN_SEQUENCE = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

export const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
