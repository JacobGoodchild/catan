// Physical dice: three.js for drawing, cannon-es for the throw.
// The result is chosen first (crypto, in app.js). We simulate the throw off-screen, see which face ends up on top,
// then number the faces so that face shows the chosen value (opposite faces still add to 7), and replay the throw.
import * as THREE from '../../vendor/three.module.min.js';
import * as CANNON from '../../vendor/cannon-es.js';

let renderer, scene, camera, dice = [], shadowPlane, light;
const SIZE = 1;

export function supported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function faceTexture(n, colour) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const body = colour === 'red' ? '#b91f26' : '#f0c22c';
  const pip = colour === 'red' ? '#f7ecc8' : '#b41d22';
  g.fillStyle = body;
  g.fillRect(0, 0, s, s);
  // Subtle grain so it reads as a real object.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${colour === 'red' ? '0,0,0' : '120,80,0'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  const P = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] }[n];
  for (const [x, y] of P) {
    const cx = s * (0.25 + x * 0.25), cy = s * (0.25 + y * 0.25);
    const grd = g.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 22);
    grd.addColorStop(0, pip);
    grd.addColorStop(1, colour === 'red' ? '#d9cfa8' : '#8e1418');
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(cx + 1.5, cy + 2, 21, 0, Math.PI * 2); g.fill();
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A box whose edges and corners are rounded, keeping BoxGeometry's per-face groups and UVs.
function roundedBox(size, radius, seg = 6) {
  const geo = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3(), inner = new THREE.Vector3();
  const h = size / 2 - radius;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z)));
    v.sub(inner).normalize().multiplyScalar(radius).add(inner);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// BoxGeometry material order: +x, -x, +y, -y, +z, -z. Opposites: 0-1, 2-3, 4-5.
const LOCAL_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OPP = [1, 0, 3, 2, 5, 4];
const BASE_VALUES = [1, 6, 2, 5, 3, 4];

function init(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 13, 5);
  camera.lookAt(0, 0, 0.4);
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x6b5a40, 1.15));
  light = new THREE.DirectionalLight(0xffffff, 1.9);
  light.position.set(-4, 12, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  light.shadow.radius = 4;
  scene.add(light);
  shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.32 }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);
  const geo = roundedBox(SIZE, 0.14);
  for (const colour of ['red', 'yellow']) {
    const textures = [1, 2, 3, 4, 5, 6].map((n) => faceTexture(n, colour));
    const mats = BASE_VALUES.map((n) => new THREE.MeshStandardMaterial({ map: textures[n - 1], roughness: 0.45, metalness: 0 }));
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    mesh.userData.textures = textures;
    scene.add(mesh);
    dice.push(mesh);
  }
}

function resize(container) {
  const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// Visible half-extents of the floor (y = 0), roughly, for the walls.
function floorBounds() {
  const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.y * 0.82;
  const halfW = halfH * camera.aspect;
  return { x: Math.min(halfW, 9) * 0.7, z: halfH * 0.62 };
}

function simulate(rand) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) });
  world.allowSleep = true;
  const floorMat = new CANNON.Material('floor'), dieMat = new CANNON.Material('die');
  world.addContactMaterial(new CANNON.ContactMaterial(floorMat, dieMat, { friction: 0.25, restitution: 0.42 }));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.1, restitution: 0.5 }));
  const floor = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const b = floorBounds();
  const wall = (x, z, ry) => {
    const w = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
    w.position.set(x, 0, z);
    w.quaternion.setFromEuler(0, ry, 0);
    world.addBody(w);
  };
  wall(-b.x, 0, Math.PI / 2); wall(b.x, 0, -Math.PI / 2); wall(0, -b.z, 0); wall(0, b.z, Math.PI);
  const bodies = [0, 1].map((i) => {
    const body = new CANNON.Body({ mass: 1, material: dieMat, shape: new CANNON.Box(new CANNON.Vec3(SIZE / 2, SIZE / 2, SIZE / 2)), sleepSpeedLimit: 0.15, sleepTimeLimit: 0.25 });
    body.linearDamping = 0.1; body.angularDamping = 0.12;
    body.position.set(-b.x + 0.8 + rand() * 0.6, 2.2 + i * 0.9 + rand(), (i ? 0.9 : -0.9) + (rand() - 0.5));
    body.quaternion.setFromEuler(rand() * 6.3, rand() * 6.3, rand() * 6.3);
    body.velocity.set(9 + rand() * 4, 1 + rand() * 2, (rand() - 0.5) * 5);
    body.angularVelocity.set((rand() - 0.5) * 30, (rand() - 0.5) * 30, (rand() - 0.5) * 30);
    world.addBody(body);
    return body;
  });
  const frames = [];
  const hits = [];
  let frame = 0;
  for (const body of bodies) body.addEventListener('collide', (e) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 1.5) hits.push({ frame, v: Math.min(1, v / 10) });
  });
  for (; frame < 60 * 5; frame++) {
    world.step(1 / 60);
    frames.push(bodies.map((bd) => [bd.position.x, bd.position.y, bd.position.z, bd.quaternion.x, bd.quaternion.y, bd.quaternion.z, bd.quaternion.w]));
    if (frame > 30 && bodies.every((bd) => bd.sleepState === CANNON.Body.SLEEPING)) break;
  }
  // Which face is up on each die?
  const up = bodies.map((bd) => {
    const q = new THREE.Quaternion(bd.quaternion.x, bd.quaternion.y, bd.quaternion.z, bd.quaternion.w);
    let best = 0, by = -2;
    LOCAL_NORMALS.forEach((n, i) => { const w = new THREE.Vector3(...n).applyQuaternion(q); if (w.y > by) { by = w.y; best = i; } });
    return best;
  });
  return { frames, hits, up };
}

function assignFaces(mesh, topFace, value) {
  const vals = BASE_VALUES.slice();
  const f = vals.indexOf(value);
  if (f !== topFace) {
    const t = topFace;
    if (f === OPP[t]) { [vals[t], vals[OPP[t]]] = [vals[OPP[t]], vals[t]]; }
    else {
      const a = vals[t], ao = vals[OPP[t]];
      vals[t] = value; vals[OPP[t]] = 7 - value;
      vals[f] = a; vals[OPP[f]] = ao;
    }
  }
  vals.forEach((n, i) => { mesh.material[i].map = mesh.userData.textures[n - 1]; mesh.material[i].needsUpdate = true; });
}

export async function throwDice(container, values, { speed = 1, onHit } = {}) {
  if (!renderer) init(container);
  container.appendChild(renderer.domElement);
  resize(container);
  const rand = Math.random; // only shapes the throw; the result is already fixed
  const { frames, hits, up } = simulate(rand);
  dice.forEach((m, i) => assignFaces(m, up[i], values[i]));
  const playRate = Math.max(0.6, Math.min(1.6, 1 / speed));
  return new Promise((resolve) => {
    const t0 = performance.now();
    let hitIdx = 0;
    const tick = (now) => {
      const f = Math.max(0, Math.min(frames.length - 1, Math.floor(((now - t0) / 1000) * 60 * playRate)));
      frames[f].forEach((p, i) => { dice[i].position.set(p[0], p[1], p[2]); dice[i].quaternion.set(p[3], p[4], p[5], p[6]); });
      while (hitIdx < hits.length && hits[hitIdx].frame <= f) { if (onHit) onHit(hits[hitIdx].v); hitIdx++; }
      renderer.render(scene, camera);
      if (f >= frames.length - 1) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
