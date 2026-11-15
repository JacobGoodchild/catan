// Seeded generator for tests and simulations; the browser uses crypto-backed randomness.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cryptoRandom() {
  const b = new Uint32Array(1);
  globalThis.crypto.getRandomValues(b);
  return b[0] / 4294967296;
}

// Fair die from crypto, by rejection sampling.
export function cryptoDie() {
  const b = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(b);
    if (b[0] < 252) return 1 + (b[0] % 6);
  }
}
