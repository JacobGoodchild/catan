// The board as a real 3D scene (three.js): sculpted terrain tiles, wooden pieces, number tokens,
// harbours and the robber. Also renders small 3D pictures of pieces and resources for the interface.
import * as THREE from '../../vendor/three.module.min.js';
import { GEO, hexCentre, PIPS } from '../engine/geometry.js';

const TILE_Y = 0.14;
const R_TILE = 0.992;
const R_LAND = 0.955;
const PCOL = { red: '#c2261d', blue: '#1b55ad', white: '#f3efe4', orange: '#ec7a14' };
const TERR = {
  forest: { tex: 'forest', col: [0.16, 0.4, 0.13] },
  pasture: { tex: 'grass', col: [0.45, 0.74, 0.16] },
  fields: { tex: 'straw', col: [0.98, 0.72, 0.1] },
  hills: { tex: 'clay', col: [0.76, 0.3, 0.12] },
  mountains: { tex: 'rock', col: [0.46, 0.47, 0.56] },
  desert: { tex: 'sand', col: [0.93, 0.8, 0.5] },
};
export const RES_COLOUR = { brick: '#b9512f', lumber: '#2f6a2a', wool: '#86c046', grain: '#e7b62c', ore: '#7f8494' };

// ---------- Textures ----------
const TEX = {};
const texNames = ['grass', 'forest', 'rock', 'sand', 'clay', 'straw', 'wood', 'bark', 'fleece', 'beach', 'brick'];
function loadDetail(name) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 512, 512);
      const d = g.getImageData(0, 0, 512, 512); const p = d.data;
      let sum = 0;
      for (let i = 0; i < p.length; i += 4) sum += p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
      const mean = sum / (p.length / 4);
      for (let i = 0; i < p.length; i += 4) {
        const l = Math.max(0, Math.min(255, ((p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) / mean) * 232));
        p[i] = p[i + 1] = p[i + 2] = l;
      }
      g.putImageData(d, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
      TEX[name] = t; resolve();
    };
    img.onerror = () => resolve();
    img.src = new URL(`../../assets/tex/${name}.jpg`, import.meta.url).href;
  });
}
export const assetsReady = Promise.all(texNames.map(loadDetail));

// ---------- Noise ----------
function hash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, s, oct) {
  let v = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x, y, s + i * 17); tot += amp; x *= 2.03; y *= 2.03; amp *= 0.5; }
  return v / tot;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Height of the land at a point inside a tile. Flat at the rim (roads, buildings) and in the middle (number token).
function landHeight(type, x, z, seed) {
  const d = Math.max(Math.abs(x), Math.abs(x) * 0.5 + Math.abs(z) * 0.866) / (R_LAND * 0.866);
  const edge = smooth(0, 0.34, 1 - d);
  const cm = smooth(0.34, 0.56, Math.hypot(x, z));
  const fm = 1 - 0.7 * smooth(-0.2, 0.45, z);
  const m = edge * cm;
  switch (type) {
    case 'mountains': { const n = fbm(x * 3.4 + 9, z * 3.4, seed, 4); const ridge = 1 - Math.abs(2 * n - 1); return m * fm * (0.08 + 0.6 * ridge * ridge); }
    case 'hills': { const n = fbm(x * 4.2 + 3, z * 4.2, seed, 3); return m * (0.45 + 0.55 * fm) * (0.04 + 0.36 * smooth(0.38, 0.72, n)); }
    case 'desert': return m * 0.05 * (0.5 + 0.5 * Math.sin(x * 10 + z * 5 + fbm(x * 2, z * 2, seed, 2) * 7));
    case 'pasture': return m * 0.08 * fbm(x * 2.5, z * 2.5, seed, 2);
    case 'forest': return m * 0.07 * fbm(x * 3, z * 3, seed, 2);
    case 'fields': return edge * cm * 0.011 * (1 + Math.sin((x * 0.8 + z * 0.6) * 52));
    default: return 0;
  }
}

function landGeometry(type, seed) {
  const n = 22, s = R_LAND / n;
  const u1 = [Math.cos(Math.PI / 6) * s, Math.sin(Math.PI / 6) * s], u2 = [0, s];
  const idx = new Map(); const pos = [], col = [], uv = [];
  const base = TERR[type].col;
  for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
    if (Math.abs(a + b) > n) continue;
    const x = a * u1[0] + b * u2[0], z = a * u1[1] + b * u2[1];
    const h = landHeight(type, x, z, seed);
    idx.set(`${a},${b}`, pos.length / 3);
    pos.push(x, h, z); uv.push(x * 0.55 + 0.5, z * 0.55 + 0.5);
    let k = 0.86 + 0.28 * fbm(x * 3 + 5, z * 3 + 2, seed + 3, 3);
    let c = [base[0] * k, base[1] * k, base[2] * k];
    if (type === 'mountains') { const sn = smooth(0.3, 0.42, h + 0.05 * vnoise(x * 9, z * 9, seed)); c = c.map((v) => v + (1.05 - v) * sn); const g = smooth(0.06, 0, h) * 0.35; c = [c[0] * (1 - g) + 0.38 * g, c[1] * (1 - g) + 0.5 * g, c[2] * (1 - g) + 0.3 * g]; }
    if (type === 'fields') { const st = Math.sin((x * 0.8 + z * 0.6) * 52) > 0 ? 1.06 : 0.86; c = c.map((v) => v * st); }
    if (type === 'hills') { const t = smooth(0.02, 0.22, h); c = c.map((v, i) => v * (0.8 + 0.3 * t) + (i === 1 ? 0.05 * (1 - t) : 0)); }
    if (type === 'pasture') { const t = vnoise(x * 5, z * 5, seed + 9); c = [c[0] * (0.9 + 0.2 * t), c[1], c[2] * (0.8 + 0.3 * t)]; }
    col.push(...c);
  }
  const ind = [];
  for (let a = -n; a < n; a++) for (let b = -n; b < n; b++) {
    const p = idx.get(`${a},${b}`), q = idx.get(`${a + 1},${b}`), r = idx.get(`${a},${b + 1}`), t = idx.get(`${a + 1},${b + 1}`);
    if (p !== undefined && q !== undefined && r !== undefined) ind.push(p, r, q);
    if (q !== undefined && r !== undefined && t !== undefined) ind.push(q, r, t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind); g.computeVertexNormals();
  return g;
}

// ---------- Shared materials and shapes ----------
const mats = {};
function woodMat(colour) {
  if (!mats[colour]) {
    const map = TEX.wood ? TEX.wood.clone() : null;
    if (map) { map.repeat.set(1.6, 1.6); map.needsUpdate = true; }
    mats[colour] = new THREE.MeshStandardMaterial({ color: PCOL[colour] || colour, map, bumpMap: map, bumpScale: 0.6, roughness: 0.48 });
  }
  return mats[colour];
}
function extrude(points, depth, bevel = 0.014) {
  const sh = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2 });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g;
}
const GEOM = {};
function pieceGeom(kind) {
  if (!GEOM[kind]) {
    if (kind === 'settlement') GEOM[kind] = extrude([[-0.125, 0], [0.125, 0], [0.125, 0.14], [0, 0.25], [-0.125, 0.14]], 0.27);
    else if (kind === 'city') GEOM[kind] = extrude([[-0.2, 0], [0.2, 0], [0.2, 0.17], [0.01, 0.17], [0.01, 0.27], [-0.095, 0.38], [-0.2, 0.27]], 0.26);
    else { const g = extrude([[-0.05, 0], [0.05, 0], [0.05, 0.085], [-0.05, 0.085]], 0.5, 0.01); g.rotateY(Math.PI / 2); GEOM[kind] = g; }
  }
  return GEOM[kind];
}
function pieceMesh(kind, colour) {
  const m = new THREE.Mesh(pieceGeom(kind), woodMat(colour));
  m.castShadow = true; m.receiveShadow = true; m.scale.setScalar(kind === 'road' ? 1.12 : 1.32);
  return m;
}
function robberMesh() {
  const pts = [[0, 0], [0.15, 0], [0.16, 0.02], [0.15, 0.05], [0.12, 0.1], [0.135, 0.2], [0.13, 0.27], [0.095, 0.33], [0.07, 0.36], [0.09, 0.39], [0.11, 0.44], [0.1, 0.5], [0.065, 0.54], [0, 0.555]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 36);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#8a8a8e', map: TEX.rock || null, roughness: 0.55 }));
  m.castShadow = true; m.scale.setScalar(1.3);
  return m;
}
function addLights(scene, shadowSize = 9) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa08c6c, 1.75));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.1);
  sun.position.set(-4.5, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 1, far: 30 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun);
  return sun;
}
function makeRenderer(canvas, opts = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, ...opts });
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.NoToneMapping;
  return r;
}

// ---------- Small 3D pictures for the interface ----------
let iconR = null;
const iconCache = {};
function snapshot(key, build, size = 200, view = [1.1, 0.95, 1.7]) {
  if (iconCache[key]) return iconCache[key];
  try {
    if (!iconR) { iconR = makeRenderer(document.createElement('canvas'), { preserveDrawingBuffer: true }); }
    iconR.setSize(size, size, false);
    const scene = new THREE.Scene();
    const sun = addLights(scene, 1.5); sun.position.set(-2, 5, 3); sun.shadow.mapSize.set(512, 512);
    const obj = build(); scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3()); const rad = box.getSize(new THREE.Vector3()).length() / 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.3 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = box.min.y; floor.receiveShadow = true; scene.add(floor);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    const dir = new THREE.Vector3(...view).normalize();
    cam.position.copy(c).addScaledVector(dir, (rad / Math.sin((13 * Math.PI) / 180)) * 0.8); cam.lookAt(c);
    iconR.render(scene, cam);
    iconCache[key] = iconR.domElement.toDataURL('image/png');
  } catch (e) { iconCache[key] = ''; }
  return iconCache[key];
}
export function pieceImage(kind, colour) {
  return snapshot(`p-${kind}-${colour}`, () => { const m = pieceMesh(kind, colour); if (kind === 'road') m.rotation.y = 0.5; else m.rotation.y = -0.35; return m; }, 160);
}
export function pieceIcon(kind, colour) {
  if (kind === 'dev') return '<span class="piece-icon dev-mini"><span></span></span>';
  return `<img class="piece-icon" src="${pieceImage(kind, colour)}" alt="">`;
}
function std(color, tex, extra = {}) { return new THREE.MeshStandardMaterial({ color, map: TEX[tex] || null, bumpMap: TEX[tex] || null, bumpScale: 1.2, roughness: 0.8, ...extra }); }
function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function resourceModel(res) {
  const g = new THREE.Group(); const r = rng(res.length * 77 + 5);
  if (res === 'brick') {
    const geo = new THREE.BoxGeometry(0.5, 0.15, 0.23); const mat = std('#c9452a', 'clay');
    const put = (x, y, z, rot) => { const mm = mat.clone(); mm.color.offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.12); const m = shadowed(new THREE.Mesh(geo, mm)); m.position.set(x, y, z); m.rotation.y = rot + (r() - 0.5) * 0.12; g.add(m); };
    put(0, 0.075, -0.13, 0); put(0, 0.075, 0.13, 0); put(-0.13, 0.23, 0, Math.PI / 2); put(0.13, 0.23, 0, Math.PI / 2); put(0.02, 0.385, 0, 0.25);
  } else if (res === 'lumber') {
    const geo = new THREE.CylinderGeometry(0.13, 0.13, 0.9, 18); geo.rotateZ(Math.PI / 2);
    const side = std('#7a5433', 'bark', { bumpScale: 3 }), cap = std('#e0bb80', 'wood');
    for (const [y, z] of [[0.13, -0.14], [0.13, 0.14], [0.355, 0]]) { const m = shadowed(new THREE.Mesh(geo, [side, cap, cap])); m.position.set((r() - 0.5) * 0.08, y, z); m.rotation.x = r() * 3; g.add(m); }
  } else if (res === 'wool') {
    const wool = std('#f6f2e6', 'fleece', { bumpScale: 2, roughness: 1 }), dark = new THREE.MeshStandardMaterial({ color: '#2b2521', roughness: 0.7 });
    const sp = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < 16; i++) { const m = shadowed(new THREE.Mesh(sp, wool)); const a = r() * 6.28, b = r(); m.position.set(Math.cos(a) * 0.2 * b * 1.3, 0.36 + (r() - 0.5) * 0.14, Math.sin(a) * 0.11 * b); m.scale.setScalar(0.15 + r() * 0.05); g.add(m); }
    const head = shadowed(new THREE.Mesh(sp, dark)); head.scale.set(0.09, 0.1, 0.085); head.position.set(0.37, 0.42, 0); g.add(head);
    for (const z of [-0.07, 0.07]) { const ear = new THREE.Mesh(sp, dark); ear.scale.set(0.02, 0.045, 0.03); ear.position.set(0.34, 0.47, z * 1.5); ear.rotation.x = z * 9; g.add(ear); }
    const leg = new THREE.CylinderGeometry(0.028, 0.024, 0.24, 8);
    for (const [x, z] of [[-0.17, -0.08], [-0.17, 0.08], [0.17, -0.08], [0.17, 0.08]]) { const m = shadowed(new THREE.Mesh(leg, dark)); m.position.set(x, 0.12, z); g.add(m); }
  } else if (res === 'grain') {
    const gold = new THREE.MeshStandardMaterial({ color: '#e9b93a', roughness: 0.7 }), ear = new THREE.MeshStandardMaterial({ color: '#f1c64d', roughness: 0.8 });
    const st = new THREE.CylinderGeometry(0.009, 0.009, 0.62, 5); st.translate(0, 0.31, 0);
    const eg = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 46; i++) {
      const a = r() * 6.28, k = Math.sqrt(r());
      const p = new THREE.Group(); p.position.set(Math.cos(a) * 0.06 * k, 0, Math.sin(a) * 0.06 * k); p.rotation.set(Math.sin(a) * 0.3 * k, 0, -Math.cos(a) * 0.3 * k);
      const s = shadowed(new THREE.Mesh(st, gold)); p.add(s);
      const e = shadowed(new THREE.Mesh(eg, ear)); e.scale.set(0.024, 0.085, 0.024); e.position.y = 0.66; p.add(e); g.add(p);
    }
    const tie = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 8, 20), new THREE.MeshStandardMaterial({ color: '#8a5a2a' }))); tie.rotation.x = Math.PI / 2; tie.position.y = 0.27; g.add(tie);
  } else {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 7; i++) {
      const metal = i % 3 === 0;
      const m = shadowed(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: metal ? '#c3c8d6' : '#8d92a4', map: TEX.rock || null, flatShading: true, roughness: metal ? 0.35 : 0.8, metalness: metal ? 0.5 : 0 })));
      const s = 0.13 + r() * 0.09; m.scale.set(s * 1.2, s, s); const a = (i / 7) * 6.28;
      m.position.set(i ? Math.cos(a) * 0.24 : 0, i ? s * 0.8 : 0.3, i ? Math.sin(a) * 0.2 : 0); m.rotation.set(r() * 3, r() * 3, r() * 3); g.add(m);
    }
  }
  return g;
}
export function resImage(res) { return snapshot(`r-${res}`, () => resourceModel(res), 256, [0.9, 0.75, 1.8]); }

// ---------- The board ----------
const hexXZ = (i) => { const h = GEO.hexes[i]; return hexCentre(h.q, h.r); };
const vXZ = (v) => [GEO.vertices[v].x, GEO.vertices[v].y];

function tokenTexture(n) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(110, 100, 20, 128, 128, 128); gr.addColorStop(0, '#fbf0cf'); gr.addColorStop(1, '#e9d39d');
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 127, 0, 7); g.fill();
  g.strokeStyle = '#b89b62'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 122, 0, 7); g.stroke();
  const red = n === 6 || n === 8; g.fillStyle = red ? '#c0201c' : '#231c14';
  const size = { 2: 88, 12: 88, 3: 100, 11: 100, 4: 112, 10: 112, 5: 124, 9: 124, 6: 138, 8: 138 }[n];
  g.font = `bold ${size}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(String(n), 128, 150);
  const pips = PIPS[n];
  for (let i = 0; i < pips; i++) { g.beginPath(); g.arc(128 + (i - (pips - 1) / 2) * 24, 192, 9, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function harbourTexture(type) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#f4e8c6'; g.beginPath(); g.arc(128, 128, 127, 0, 7); g.fill();
  const any = type === 'any';
  g.save(); g.beginPath(); g.arc(128, 128, 127, 0, 7); g.clip();
  g.fillStyle = any ? '#3d6f9c' : RES_COLOUR[type]; g.fillRect(0, 148, 256, 110); g.restore();
  g.strokeStyle = '#8f7a4c'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 123, 0, 7); g.stroke();
  g.fillStyle = '#231c14'; g.textAlign = 'center'; g.font = 'bold 96px Georgia, "Times New Roman", serif'; g.fillText(any ? '3:1' : '2:1', 128, 124);
  g.fillStyle = '#fff'; g.font = 'bold 40px Georgia, "Times New Roman", serif'; g.fillText(any ? 'Any' : type[0].toUpperCase() + type.slice(1), 128, 200);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function seaMap() {
  const N = 512; const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const d = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = fbm((x / N) * 6, (y / N) * 16, 4, 4), w = fbm((x / N) * 14 + n * 3, (y / N) * 40, 9, 3);
    const k = 0.35 + 0.65 * n; const foam = smooth(0.6, 0.85, w) * 0.16; const i = (y * N + x) * 4;
    d.data[i] = 20 + 50 * k + 200 * foam; d.data[i + 1] = 105 + 70 * k + 120 * foam; d.data[i + 2] = 170 + 60 * k + 60 * foam; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(2, 2); return t;
}

export function createBoard3D(el) {
  el.innerHTML = '<canvas></canvas><div class="b-targets"></div>';
  const canvas = el.querySelector('canvas'), overlay = el.querySelector('.b-targets');
  const renderer = makeRenderer(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 100);
  const TILT0 = (27 * Math.PI) / 180;
  let TILT = TILT0, az = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const R_FRAME = 6.05;
  let staticGroup = null, staticKey = null, targetHandler = null, lastTargets = null, needs = false;
  const pieces = new Map(); const pieceGroup = new THREE.Group(); scene.add(pieceGroup);
  const glowGroup = new THREE.Group(); scene.add(glowGroup);
  const robber = robberMesh(); robber.visible = false; scene.add(robber); let robberHex = null;
  const tweens = [];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.42 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.2; floor.receiveShadow = true; scene.add(floor);

  function draw() {
    needs = false;
    const now = performance.now();
    for (let i = tweens.length - 1; i >= 0; i--) { const t = tweens[i]; const k = Math.min(1, (now - t.t0) / t.ms); t.fn(k); if (k >= 1) tweens.splice(i, 1); }
    renderer.render(scene, camera);
    if (tweens.length) request();
  }
  function request() { if (!needs) { needs = true; requestAnimationFrame(draw); } }
  function tween(ms, fn) { tweens.push({ t0: performance.now(), ms: still ? 1 : ms, fn }); request(); }

  const corners = [];
  for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; corners.push(new THREE.Vector3(R_FRAME * Math.cos(a), 0, R_FRAME * Math.sin(a))); corners.push(new THREE.Vector3(4.4 * Math.cos(a), 0.6, 4.4 * Math.sin(a))); }
  function fit() {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const tgt = new THREE.Vector3(0, 0, 0.1), dir = new THREE.Vector3(Math.sin(az) * Math.sin(TILT), Math.cos(TILT), Math.cos(az) * Math.sin(TILT)), v = new THREE.Vector3();
    const span = () => { let lo = 9, hi = -9, mx = 0; for (const c of corners) { v.copy(c).project(camera); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); mx = Math.max(mx, Math.abs(v.x)); } return [lo, hi, mx]; };
    const aim = (d) => { camera.position.copy(tgt).addScaledVector(dir, d); camera.lookAt(tgt); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); };
    for (let d = 8; d < 80; d += 0.15) {
      for (let k = 0; k < 4; k++) { aim(d); const [lo, hi] = span(); const k = ((lo + hi) * 0.5 * d * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(0.5, Math.cos(TILT)); tgt.x -= k * Math.sin(az); tgt.z -= k * Math.cos(az); }
      aim(d); const [lo, hi, mx] = span();
      if (mx < 0.99 && lo > -0.985 && hi < 0.985) break;
    }
    placeTargets(); request();
  }
  new ResizeObserver(fit).observe(el);
  // Drag the table to look around; double-click to reset the view.
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, az, tilt: TILT }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    az = drag.az - (e.clientX - drag.x) * 0.006;
    TILT = Math.max(0.02, Math.min(1.05, drag.tilt - (e.clientY - drag.y) * 0.004));
    fit();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', () => { az = 0; TILT = TILT0; fit(); });

  function project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return [(v.x * 0.5 + 0.5) * el.clientWidth, (-v.y * 0.5 + 0.5) * el.clientHeight];
  }

  function buildStatic(state) {
    if (staticGroup) { scene.remove(staticGroup); staticGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const G = (staticGroup = new THREE.Group()); scene.add(G);
    // Sea frame.
    const seaGeo = new THREE.CylinderGeometry(R_FRAME, R_FRAME, 0.18, 6); seaGeo.rotateY(Math.PI / 6);
    const sea = new THREE.Mesh(seaGeo, [new THREE.MeshStandardMaterial({ color: '#174f7d', roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: seaMap(), roughness: 0.45 })]);
    sea.position.y = -0.09; sea.receiveShadow = true; sea.castShadow = true; G.add(sea);
    // Shallows and beach under the tiles.
    const shGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.02, 6), beGeo = new THREE.CylinderGeometry(1.085, 1.11, 0.06, 6), baseGeo = new THREE.CylinderGeometry(R_TILE, R_TILE, 0.1, 6);
    const shMat = new THREE.MeshStandardMaterial({ color: '#63bfe6', transparent: true, opacity: 0.55, roughness: 0.3 });
    const beMat = new THREE.MeshStandardMaterial({ color: '#f1dfae', map: TEX.beach || null, roughness: 1 });
    const baseMat = new THREE.MeshStandardMaterial({ color: '#ead9a8', roughness: 0.9 });
    const trees = [], sheep = [], rocks = [], stacks = [], bushes = [];
    state.board.hexes.forEach((h, i) => {
      const [cx, cz] = hexXZ(i); const seed = i * 131 + 7; const r = rng(seed);
      const sh = new THREE.Mesh(shGeo, shMat); sh.position.set(cx, 0.011, cz); G.add(sh);
      const be = new THREE.Mesh(beGeo, beMat); be.position.set(cx, 0.03, cz); be.receiveShadow = true; G.add(be);
      const base = new THREE.Mesh(baseGeo, baseMat); base.position.set(cx, TILE_Y - 0.05, cz); base.receiveShadow = true; base.castShadow = true; G.add(base);
      const T = TERR[h.terrain];
      const land = new THREE.Mesh(landGeometry(h.terrain, seed), new THREE.MeshStandardMaterial({ map: TEX[T.tex] || null, vertexColors: true, roughness: 0.95, bumpMap: TEX[T.tex] || null, bumpScale: 1.5 }));
      land.position.set(cx, TILE_Y + 0.001, cz); land.receiveShadow = true; land.castShadow = true; G.add(land);
      const spot = (minR, maxR, tries, minGap, list) => {
        const out = [];
        for (let t = 0; t < tries; t++) {
          const a = r() * 6.283, rad = minR + (maxR - minR) * Math.sqrt(r()); const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
          const d = Math.max(Math.abs(x), Math.abs(x) * 0.5 + Math.abs(z) * 0.866) / (R_LAND * 0.866);
          if (d > 0.84 || Math.hypot(x, z - 0.14) < 0.5) continue;
          if (out.some((o) => Math.hypot(o[0] - x, o[1] - z) < minGap)) continue;
          out.push([x, z]); list.push({ x: cx + x, y: TILE_Y + landHeight(h.terrain, x, z, seed), z: cz + z, s: 0.8 + r() * 0.5, rot: r() * 6.283, back: z < 0, k: r() });
        }
      };
      if (h.terrain === 'forest') spot(0.38, 0.86, 300, 0.12, trees);
      if (h.terrain === 'pasture') { spot(0.42, 0.8, 9, 0.2, sheep); spot(0.42, 0.82, 7, 0.22, bushes); }
      if (h.terrain === 'fields') spot(0.5, 0.78, 5, 0.3, stacks);
      if (h.terrain === 'desert') spot(0.4, 0.8, 8, 0.2, rocks);
      if (h.terrain === 'hills') spot(0.45, 0.8, 7, 0.2, rocks);
      if (h.number) {
        const tok = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.045, 48), new THREE.MeshStandardMaterial({ color: '#e3cf9c', roughness: 0.8 }));
        tok.position.set(cx, TILE_Y + 0.0235, cz); tok.castShadow = true; tok.receiveShadow = true; G.add(tok);
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.35, 48), new THREE.MeshStandardMaterial({ map: tokenTexture(h.number), roughness: 0.85 }));
        face.rotation.x = -Math.PI / 2; face.position.set(cx, TILE_Y + 0.0465, cz); face.receiveShadow = true; G.add(face);
      }
    });
    const inst = (geo, mat, list, place, colour) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length); const o = new THREE.Object3D(); const c = new THREE.Color();
      list.forEach((t, i) => { place(o, t); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (colour) { colour(c, t); m.setColorAt(i, c); } });
      m.castShadow = true; m.receiveShadow = true; G.add(m);
    };
    const cone = new THREE.ConeGeometry(1, 1, 8); cone.translate(0, 0.5, 0);
    const leaf = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const green = (c, t) => c.setHSL(0.3 + t.k * 0.07, 0.5, 0.17 + t.k * 0.1);
    const th = (t) => t.s * (t.back ? 1.15 : 0.8);
    inst(cone, leaf, trees, (o, t) => { o.position.set(t.x, t.y, t.z); o.scale.set(0.1 * t.s, 0.26 * th(t), 0.1 * t.s); o.rotation.set(0, t.rot, 0); }, green);
    inst(cone, leaf, trees, (o, t) => { o.position.set(t.x, t.y + 0.13 * th(t), t.z); o.scale.set(0.074 * t.s, 0.23 * th(t), 0.074 * t.s); o.rotation.set(0, t.rot + 0.4, 0); }, (c, t) => c.setHSL(0.3 + t.k * 0.07, 0.5, 0.22 + t.k * 0.1));
    const sph = new THREE.SphereGeometry(1, 12, 9);
    inst(sph, new THREE.MeshStandardMaterial({ color: '#f7f3e8', map: TEX.fleece || null, roughness: 1 }), sheep, (o, t) => { o.position.set(t.x, t.y + 0.04, t.z); o.scale.set(0.062, 0.045, 0.045); o.rotation.set(0, t.rot, 0); });
    inst(sph, new THREE.MeshStandardMaterial({ color: '#2b2521', roughness: 0.8 }), sheep, (o, t) => { o.position.set(t.x + Math.cos(t.rot) * 0.06, t.y + 0.055, t.z - Math.sin(t.rot) * 0.06); o.scale.setScalar(0.022); o.rotation.set(0, 0, 0); });
    inst(sph, leaf, bushes, (o, t) => { o.position.set(t.x, t.y + 0.02, t.z); o.scale.set(0.06 * t.s, 0.045 * t.s, 0.06 * t.s); o.rotation.set(0, t.rot, 0); }, (c, t) => c.setHSL(0.27 + t.k * 0.05, 0.55, 0.22 + t.k * 0.08));
    inst(cone, new THREE.MeshStandardMaterial({ color: '#d9a531', map: TEX.straw || null, roughness: 1 }), stacks, (o, t) => { o.position.set(t.x, t.y, t.z); o.scale.set(0.075 * t.s, 0.12 * t.s, 0.075 * t.s); o.rotation.set(0, t.rot, 0); });
    const rockMat = new THREE.MeshStandardMaterial({ map: TEX.rock || null, flatShading: true, roughness: 0.9 });
    inst(new THREE.DodecahedronGeometry(1, 0), rockMat, rocks, (o, t) => { o.position.set(t.x, t.y + 0.01, t.z); o.scale.set(0.06 * t.s, 0.04 * t.s, 0.05 * t.s); o.rotation.set(t.rot, t.rot * 2, 0); }, (c, t) => c.setHSL(0.07, 0.35, 0.45 + t.k * 0.2));
    // Harbours: a jetty from each of the two corners to a marker on the sea.
    const plank = new THREE.MeshStandardMaterial({ color: '#a47a4a', map: TEX.wood || null, roughness: 0.8 });
    for (const hb of state.board.harbours) {
      const [x1, z1] = vXZ(hb.vertices[0]), [x2, z2] = vXZ(hb.vertices[1]);
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, len = Math.hypot(mx, mz), nx = mx / len, nz = mz / len;
      const px = mx + nx * 0.8, pz = mz + nz * 0.8;
      for (const [vx, vz] of [[x1, z1], [x2, z2]]) {
        const ex = px + (vx - mx) * 0.4 - nx * 0.28, ez = pz + (vz - mz) * 0.4 - nz * 0.28; const L = Math.hypot(ex - vx, ez - vz);
        const sx = vx + ((ex - vx) / L) * 0.2, sz = vz + ((ez - vz) / L) * 0.2; const L2 = L - 0.2;
        const j = new THREE.Mesh(new THREE.BoxGeometry(L2, 0.035, 0.085), plank); j.position.set((sx + ex) / 2, 0.05, (sz + ez) / 2); j.rotation.y = -Math.atan2(ez - sz, ex - sx); j.castShadow = true; j.receiveShadow = true; G.add(j);
      }
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 40), new THREE.MeshStandardMaterial({ color: '#d9c48e', roughness: 0.8 })); disc.position.set(px, 0.035, pz); disc.castShadow = true; G.add(disc);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), new THREE.MeshStandardMaterial({ map: harbourTexture(hb.type), roughness: 0.85 })); face.rotation.x = -Math.PI / 2; face.position.set(px, 0.0615, pz); face.receiveShadow = true; G.add(face);
    }
  }

  function tilt(id) { return (hash(id, 3, 11) - 0.5) * 0.24; }
  function render(state) {
    const key = JSON.stringify(state.board.hexes) + JSON.stringify(state.board.harbours.map((h) => h.type));
    let fresh = false;
    if (key !== staticKey) { buildStatic(state); staticKey = key; fresh = true; for (const m of pieces.values()) pieceGroup.remove(m); pieces.clear(); robberHex = null; }
    const colour = (p) => state.players[p].colour;
    const want = new Map();
    for (const [e, p] of Object.entries(state.roads)) want.set(`r${e}:${colour(p)}`, { kind: 'road', id: +e, colour: colour(p) });
    for (const [v, b] of Object.entries(state.buildings)) want.set(`${b.type[0]}${v}:${colour(b.player)}`, { kind: b.type, id: +v, colour: colour(b.player) });
    for (const [k, m] of pieces) if (!want.has(k)) { pieceGroup.remove(m); pieces.delete(k); }
    const first = pieces.size === 0 && want.size > 2;
    for (const [k, w] of want) {
      if (pieces.has(k)) continue;
      const m = pieceMesh(w.kind, w.colour);
      if (w.kind === 'road') { const [a, b] = GEO.edges[w.id].v; const [x1, z1] = vXZ(a), [x2, z2] = vXZ(b); m.position.set((x1 + x2) / 2, TILE_Y, (z1 + z2) / 2); m.rotation.y = -Math.atan2(z2 - z1, x2 - x1) + tilt(w.id) * 0.25; }
      else { const [x, z] = vXZ(w.id); m.position.set(x, TILE_Y, z); m.rotation.y = tilt(w.id) + (w.kind === 'city' ? 0 : 0.1); }
      pieceGroup.add(m); pieces.set(k, m);
      if (!fresh && !first) { const y0 = m.position.y; tween(380, (t) => { const e = 1 - Math.pow(1 - t, 3); m.position.y = y0 + 0.55 * (1 - e) + (t > 0.7 ? Math.sin((t - 0.7) * 10.5) * 0.02 * (1 - t) : 0); }); }
    }
    const rh = state.board.robber; const [rx, rz] = hexXZ(rh); const ry = TILE_Y + (state.board.hexes[rh].number ? 0.047 : 0.002);
    robber.visible = true;
    if (robberHex === null || fresh) robber.position.set(rx, ry, rz);
    else if (robberHex !== rh) { const from = robber.position.clone(); tween(750, (t) => { const e = t * t * (3 - 2 * t); robber.position.set(from.x + (rx - from.x) * e, from.y + (ry - from.y) * e + Math.sin(e * Math.PI) * 0.9, from.z + (rz - from.z) * e); }); }
    robberHex = rh;
    request();
  }

  function placeTargets() {
    overlay.innerHTML = '';
    const t = lastTargets; if (!t) return;
    const unit = Math.hypot(...project(1, TILE_Y, 0).map((v, i) => v - project(0, TILE_Y, 0)[i]));
    let s = '';
    for (const e of t.edges || []) {
      const [a, b] = GEO.edges[e].v; const [x1, z1] = vXZ(a), [x2, z2] = vXZ(b);
      const p1 = project(x1, TILE_Y + 0.05, z1), p2 = project(x2, TILE_Y + 0.05, z2);
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 0.6, ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      s += `<button class="tgt tgt-e" data-edge="${e}" aria-label="Road spot" style="left:${(p1[0] + p2[0]) / 2}px;top:${(p1[1] + p2[1]) / 2}px;width:${len}px;height:${unit * 0.3}px;transform:translate(-50%,-50%) rotate(${ang}rad)"></button>`;
    }
    for (const v of t.vertices || []) { const [x, z] = vXZ(v); const p = project(x, TILE_Y + 0.08, z); s += `<button class="tgt tgt-v" data-vertex="${v}" aria-label="Building spot" style="left:${p[0]}px;top:${p[1]}px;width:${unit * 0.36}px;height:${unit * 0.36}px"></button>`; }
    for (const h of t.hexes || []) { const [x, z] = hexXZ(h); const p = project(x, TILE_Y + 0.05, z); s += `<button class="tgt tgt-h" data-hex="${h}" aria-label="Hex" style="left:${p[0]}px;top:${p[1]}px;width:${unit * 1.2}px;height:${unit * 1.05}px"></button>`; }
    overlay.innerHTML = s;
  }
  function setTargets(t, onPick) { targetHandler = onPick; lastTargets = t; placeTargets(); }
  overlay.addEventListener('click', (ev) => {
    const t = ev.target.closest('.tgt'); if (!t || !targetHandler) return; const d = t.dataset;
    if (d.edge !== undefined) targetHandler({ edge: +d.edge }); else if (d.vertex !== undefined) targetHandler({ vertex: +d.vertex }); else if (d.hex !== undefined) targetHandler({ hex: +d.hex });
  });

  function glowHexes(hexes, blocked = []) {
    for (const i of hexes) {
      const [x, z] = hexXZ(i); const bad = blocked.includes(i);
      const mat = new THREE.MeshBasicMaterial({ color: bad ? '#000000' : '#fff3b0', transparent: true, opacity: 0, depthWrite: false, blending: bad ? THREE.NormalBlending : THREE.AdditiveBlending });
      const g = new THREE.RingGeometry(0.72, R_TILE, 6, 1); g.rotateZ(Math.PI / 6);
      const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, TILE_Y + 0.012, z); glowGroup.add(m);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(R_TILE, 6), mat); fill.rotation.x = -Math.PI / 2; fill.rotation.z = Math.PI / 6; fill.position.set(x, TILE_Y + 0.7, z); fill.visible = false; glowGroup.add(fill);
      tween(1400, (t) => { mat.opacity = Math.sin(Math.min(1, t * 1.15) * Math.PI) * (bad ? 0.5 : 0.85); if (t >= 1) { glowGroup.remove(m); glowGroup.remove(fill); } });
    }
  }
  function screenPos(kind, id) {
    const [x, z] = kind === 'hex' ? hexXZ(id) : vXZ(id); const r = el.getBoundingClientRect(); const p = project(x, TILE_Y, z);
    return [r.left + p[0], r.top + p[1]];
  }
  fit();
  return { render, setTargets, glowHexes, screenPos };
}
