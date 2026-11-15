import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playGame } from '../src/engine/sim.js';
import { mulberry32 } from '../src/engine/rng.js';
import { RESOURCES, victoryPoints } from '../src/engine/rules.js';

const GAMES = Number(process.env.SIM_GAMES || 2000);
const LEVELS = ['easy', 'normal', 'hard'];

test(`${GAMES} complete bot games finish with consistent cards`, () => {
  let wins = [0, 0, 0, 0];
  for (let seed = 1; seed <= GAMES; seed++) {
    const rng = mulberry32(seed);
    const n = seed % 3 === 0 ? 3 : 4;
    const levels = Array.from({ length: n }, (_, i) => LEVELS[(seed + i) % 3]);
    const { state } = playGame({
      seed, rng, numPlayers: n, board: seed % 5 === 0 ? 'beginner' : 'variable', levels,
      check: (s) => {
        for (const r of RESOURCES) {
          const held = s.hidden.hands.reduce((a, h) => a + h[r], 0);
          assert.ok(s.bank[r] >= 0, `bank ${r} negative (seed ${seed})`);
          assert.ok(s.hidden.hands.every((h) => h[r] >= 0), `hand negative (seed ${seed})`);
          assert.equal(held + s.bank[r], 19, `${r} cards do not add up (seed ${seed})`);
        }
        const devHeld = s.hidden.dev.reduce((a, d) => a + d.length, 0) + s.playedDev.reduce((a, d) => a + d.length, 0);
        assert.equal(devHeld + s.hidden.deck.length, 25, `dev cards do not add up (seed ${seed})`);
        for (const p of s.players) {
          const roads = Object.values(s.roads).filter((x) => x === p.id).length;
          assert.equal(roads + p.roadsLeft, 15);
          const setts = Object.values(s.buildings).filter((b) => b.player === p.id && b.type === 'settlement').length;
          const cities = Object.values(s.buildings).filter((b) => b.player === p.id && b.type === 'city').length;
          assert.equal(setts + p.settlementsLeft + cities + p.citiesLeft, 9);
          assert.ok(p.settlementsLeft >= 0 && p.citiesLeft >= 0 && p.roadsLeft >= 0);
        }
      },
    });
    assert.equal(state.phase, 'gameOver');
    assert.ok(victoryPoints(state, state.winner) >= state.config.vpTarget);
    wins[state.winner]++;
  }
  assert.ok(wins.every((w, i) => i === 3 || w > 0));
});
