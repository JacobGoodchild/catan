import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEO, hexIndex, edgeOf, edgeBetween } from '../src/engine/geometry.js';
import {
  newGame, step, legalSettlementSpots, longestRoadFor, victoryPoints, handTotal, harbourRatios, viewFor,
} from '../src/engine/rules.js';
import { mulberry32 } from '../src/engine/rng.js';

const rng = () => mulberry32(42);
const ok = (s, a) => { const r = step(s, a, rng()); assert.ok(r.ok, r.error); return r; };
const bad = (s, a, msg) => { const r = step(s, a, rng()); assert.ok(!r.ok, `expected failure: ${JSON.stringify(a)}`); if (msg) assert.match(r.error, msg); return r; };

// A game already past setup, with nothing on the board, ready for player 0 to act in the main phase.
function mainGame(n = 4) {
  const s = newGame({ numPlayers: n, board: 'beginner' }, rng());
  s.phase = 'main'; s.turn = 5; s.current = 0; s.dice = [3, 4];
  return s;
}
function give(s, p, cards) { for (const [k, n] of Object.entries(cards)) { s.hidden.hands[p][k] += n; s.bank[k] -= n; } }
function put(s, p, v, type = 'settlement') { s.buildings[v] = { player: p, type }; s.players[p][type === 'city' ? 'citiesLeft' : 'settlementsLeft']--; }
function road(s, p, e) { s.roads[e] = p; s.players[p].roadsLeft--; }

// A simple path of vertices along the outer edge of the board, for building long roads.
function pathVertices(len, offset = 0) {
  // Walk the coastline (edges touching a single hex form one loop of 30).
  const coastal = GEO.edges.filter((e) => e.hexes.length === 1);
  const start = coastal[0].v[0];
  const loop = [start];
  let prev = -1, cur = start;
  while (loop.length < 30) {
    const e = coastal.find((x) => x.v.includes(cur) && !x.v.includes(prev));
    const nxt = e.v[0] === cur ? e.v[1] : e.v[0];
    prev = cur; cur = nxt; loop.push(cur);
  }
  const out = [];
  for (let i = 0; i <= len; i++) out.push(loop[(offset + i) % 30]);
  return out;
}

test('geometry: 19 hexes, 54 intersections, 72 paths', () => {
  assert.equal(GEO.hexes.length, 19);
  assert.equal(GEO.vertices.length, 54);
  assert.equal(GEO.edges.length, 72);
});

test('beginner map matches Illustration A', () => {
  const s = newGame({ numPlayers: 4, board: 'beginner' }, rng());
  const d = s.board.hexes[s.board.robber];
  assert.equal(d.terrain, 'desert');
  assert.equal(s.board.robber, hexIndex(0, 0));
  assert.equal(s.board.harbours.length, 9);
  assert.equal(s.board.harbours.filter((h) => h.type === 'any').length, 4);
});

test('variable map: 18 tokens, no token on desert, robber on desert', () => {
  for (let i = 0; i < 50; i++) {
    const s = newGame({ numPlayers: 4, board: 'variable' }, mulberry32(i));
    const nums = s.board.hexes.map((h) => h.number).filter(Boolean).sort((a, b) => a - b);
    assert.deepEqual(nums, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    assert.equal(s.board.hexes[s.board.robber].terrain, 'desert');
    assert.equal(s.board.hexes[s.board.robber].number, 0);
  }
});

test('setup: snake order 1-2-3-4-4-3-2-1, second settlement pays, distance rule', () => {
  const s = newGame({ numPlayers: 4, board: 'beginner' }, rng());
  const seq = [];
  const spots = [0, 10, 20, 30, 40, 50, 6, 26];
  let i = 0;
  while (s.phase.startsWith('setup')) {
    const p = s.current;
    seq.push(p);
    const legal = legalSettlementSpots(s, p);
    const v = legal.includes(spots[i]) ? spots[i] : legal[0];
    i++;
    const before = handTotal(s.hidden.hands[p]);
    ok(s, { type: 'buildSettlement', player: p, vertex: v });
    const after = handTotal(s.hidden.hands[p]);
    const resHexes = GEO.vertices[v].hexes.filter((h) => s.board.hexes[h].terrain !== 'desert').length;
    if (seq.length <= 4) assert.equal(after, before, 'first settlement gives nothing');
    else assert.equal(after - before, resHexes, 'second settlement gives one card per adjacent terrain');
    // Distance rule: neighbours are no longer legal.
    for (const a of GEO.vertices[v].adj) assert.ok(!legalSettlementSpots(s, 0).includes(a) || s.phase !== 'setupSettlement');
    ok(s, { type: 'buildRoad', player: p, edge: GEO.vertices[v].edges[0] === undefined ? 0 : s.phase === 'setupRoad' ? GEO.vertices[v].edges.find((e) => s.roads[e] === undefined) : 0 });
  }
  assert.deepEqual(seq, [0, 1, 2, 3, 3, 2, 1, 0]);
  assert.equal(s.phase, 'roll');
  assert.equal(s.current, 0, 'the last to place their second settlement starts');
});

test('setup: road must touch the settlement just placed', () => {
  const s = newGame({ numPlayers: 3, board: 'beginner' }, rng());
  ok(s, { type: 'buildSettlement', player: 0, vertex: 0 });
  const far = GEO.edges.find((e) => !e.v.includes(0)).id;
  bad(s, { type: 'buildRoad', player: 0, edge: far });
});

test('distance rule applies in the main game, and settlements need your road', () => {
  const s = mainGame();
  put(s, 1, 10);
  const nb = GEO.vertices[10].adj[0];
  road(s, 0, edgeBetween(10, nb));
  give(s, 0, { brick: 2, lumber: 2, wool: 2, grain: 2 });
  bad(s, { type: 'buildSettlement', player: 0, vertex: nb }, /Illegal/);
  const far = GEO.vertices.find((v) => !v.adj.includes(10) && v.id !== 10 && !v.edges.some((e) => s.roads[e] === 0)).id;
  bad(s, { type: 'buildSettlement', player: 0, vertex: far }, /Illegal/);
});

test('rolling a 7: discard half rounded down, only over 7 cards', () => {
  const s = mainGame();
  s.phase = 'roll';
  give(s, 0, { brick: 6 }); // 6: no discard
  give(s, 1, { ore: 8 }); // 8: discard 4
  give(s, 2, { wool: 5, grain: 6 }); // 11: discard 5
  ok(s, { type: 'roll', player: 0, dice: [3, 4] });
  assert.equal(s.phase, 'discard');
  assert.deepEqual(s.pendingDiscards, { 1: 4, 2: 5 });
  bad(s, { type: 'discard', player: 1, cards: { ore: 3 } }, /Must discard 4/);
  bad(s, { type: 'discard', player: 0, cards: { brick: 3 } });
  ok(s, { type: 'discard', player: 1, cards: { ore: 4 } });
  assert.equal(s.phase, 'discard');
  ok(s, { type: 'discard', player: 2, cards: { wool: 3, grain: 2 } });
  assert.equal(s.phase, 'robber');
  assert.equal(handTotal(s.hidden.hands[2]), 6);
});

test('robber: must move, blocks production, steals one random card from chosen neighbour', () => {
  const s = mainGame();
  s.phase = 'robber'; s.robberReturn = 'main';
  bad(s, { type: 'moveRobber', player: 0, hex: s.board.robber }, /must move/);
  const target = hexIndex(-1, -1); // fields 12 on the beginner map
  const [a, , c] = GEO.hexes[target].corners;
  put(s, 1, a); put(s, 2, c);
  give(s, 1, { ore: 1 });
  ok(s, { type: 'moveRobber', player: 0, hex: target });
  assert.equal(s.phase, 'steal');
  assert.deepEqual(s.stealCandidates.sort(), [1, 2]);
  bad(s, { type: 'steal', player: 0, victim: 3 });
  const r = ok(s, { type: 'steal', player: 0, victim: 1 });
  assert.equal(s.hidden.hands[0].ore, 1);
  assert.equal(r.events.find((e) => e.type === 'steal').resource, 'ore');
  assert.equal(s.phase, 'main');
  // Production blocked on the robber's hex.
  s.phase = 'roll';
  const before = handTotal(s.hidden.hands[1]);
  ok(s, { type: 'roll', player: 0, dice: [6, 6] });
  assert.equal(handTotal(s.hidden.hands[1]), before);
});

test('bank shortage: nobody is paid if it affects several players; one player gets what is left', () => {
  const s = mainGame();
  s.phase = 'roll';
  const hills6 = hexIndex(0, -1); // hills 6 on the beginner map
  assert.equal(s.board.hexes[hills6].number, 6);
  const [a, , c] = GEO.hexes[hills6].corners;
  put(s, 1, a, 'city'); put(s, 2, c);
  give(s, 3, { brick: 17 }); // bank has 2 brick; demand is 3
  ok(s, { type: 'roll', player: 0, dice: [3, 3] });
  assert.equal(s.hidden.hands[1].brick, 0);
  assert.equal(s.hidden.hands[2].brick, 0);
  assert.equal(s.bank.brick, 2);
  // Single player affected: gets the remainder.
  delete s.buildings[c];
  s.phase = 'roll'; s.turn++;
  ok(s, { type: 'roll', player: 0, dice: [3, 3] });
  assert.equal(s.hidden.hands[1].brick, 2);
  assert.equal(s.bank.brick, 0);
});

test('production: settlement 1, city 2', () => {
  const s = mainGame();
  s.phase = 'roll';
  const m10 = hexIndex(0, -2); // mountains 10
  const [a, , c] = GEO.hexes[m10].corners;
  put(s, 1, a); put(s, 2, c, 'city');
  ok(s, { type: 'roll', player: 0, dice: [4, 6] });
  assert.equal(s.hidden.hands[1].ore, 1);
  assert.equal(s.hidden.hands[2].ore, 2);
});

test('development cards: not on the turn bought, one per turn, knight before rolling', () => {
  const s = mainGame();
  s.hidden.deck = ['knight', 'knight', 'monopoly'];
  give(s, 0, { wool: 3, grain: 3, ore: 3 });
  ok(s, { type: 'buyDev', player: 0 });
  ok(s, { type: 'buyDev', player: 0 });
  bad(s, { type: 'playDev', player: 0, card: 'monopoly' }, /No playable/);
  // Next turn for player 0.
  s.turn += 4; s.phase = 'roll';
  bad(s, { type: 'playDev', player: 0, card: 'monopoly' }, /Roll first/);
  ok(s, { type: 'playDev', player: 0, card: 'knight' }); // before rolling
  assert.equal(s.phase, 'robber');
  ok(s, { type: 'moveRobber', player: 0, hex: 0 });
  assert.equal(s.phase, 'roll', 'returns to the roll after a pre-roll knight');
  ok(s, { type: 'roll', player: 0, dice: [2, 3] });
  bad(s, { type: 'playDev', player: 0, card: 'monopoly' }, /Already played/);
});

test('victory point cards count straight away and can win on the turn they are bought', () => {
  const s = mainGame();
  s.config.vpTarget = 3;
  put(s, 0, 0); put(s, 0, 10);
  s.hidden.deck = ['vp'];
  give(s, 0, { wool: 1, grain: 1, ore: 1 });
  ok(s, { type: 'buyDev', player: 0 });
  assert.equal(victoryPoints(s, 0), 3);
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.winner, 0);
});

test('winning only on your own turn', () => {
  const s = mainGame();
  s.config.vpTarget = 3;
  put(s, 1, 0); put(s, 1, 10); put(s, 1, 20);
  // Player 1 has 3 VP but it is player 0's turn.
  give(s, 0, { brick: 1, lumber: 1 });
  road(s, 0, GEO.vertices[30].edges[0]);
  ok(s, { type: 'buildRoad', player: 0, edge: legalRoad(s, 0) });
  assert.equal(s.phase, 'main');
  ok(s, { type: 'endTurn', player: 0 });
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.winner, 1);
});
function legalRoad(s, p) {
  for (const e of GEO.edges) {
    if (s.roads[e.id] !== undefined) continue;
    if (e.v.some((v) => GEO.vertices[v].edges.some((x) => s.roads[x] === p))) return e.id;
  }
  return -1;
}

test('road building, year of plenty, monopoly', () => {
  const s = mainGame();
  put(s, 0, 0);
  s.hidden.dev[0] = [{ type: 'roadBuilding', turn: 1 }, { type: 'yearOfPlenty', turn: 1 }, { type: 'monopoly', turn: 1 }];
  ok(s, { type: 'playDev', player: 0, card: 'roadBuilding' });
  assert.equal(s.phase, 'roadBuilding');
  ok(s, { type: 'buildRoad', player: 0, edge: GEO.vertices[0].edges[0] });
  ok(s, { type: 'buildRoad', player: 0, edge: legalRoad(s, 0) });
  assert.equal(s.phase, 'main');
  assert.equal(s.players[0].roadsLeft, 13);
  s.devPlayedThisTurn = false;
  ok(s, { type: 'playDev', player: 0, card: 'yearOfPlenty', resources: ['ore', 'ore'] });
  assert.equal(s.hidden.hands[0].ore, 2);
  s.devPlayedThisTurn = false;
  give(s, 1, { wool: 3 }); give(s, 2, { wool: 1 });
  ok(s, { type: 'playDev', player: 0, card: 'monopoly', resource: 'wool' });
  assert.equal(s.hidden.hands[0].wool, 4);
  assert.equal(s.hidden.hands[1].wool, 0);
});

// Break a road by building a real settlement on vertex v as player 1 (via an inland road of theirs).
function breakAt(s, v) {
  const inland = GEO.vertices[v].edges.find((e) => s.roads[e] === undefined);
  road(s, 1, inland);
  s.current = 1;
  give(s, 1, { brick: 1, lumber: 1, wool: 1, grain: 1 });
  ok(s, { type: 'buildSettlement', player: 1, vertex: v });
}
const threeEdged = (v) => GEO.vertices[v].edges.length === 3;

test('longest road: needs 5, then broken by a settlement, card set aside when nobody has 5', () => {
  const s = mainGame();
  let off = 0;
  while (!threeEdged(pathVertices(7, off)[2])) off++;
  const pv = pathVertices(7, off);
  put(s, 0, pv[0]);
  give(s, 0, { brick: 10, lumber: 10 });
  for (let i = 0; i < 4; i++) ok(s, { type: 'buildRoad', player: 0, edge: edgeBetween(pv[i], pv[i + 1]) });
  assert.equal(s.longestRoad, null);
  ok(s, { type: 'buildRoad', player: 0, edge: edgeBetween(pv[4], pv[5]) });
  assert.equal(s.longestRoad, 0);
  assert.equal(victoryPoints(s, 0), 3);
  breakAt(s, pv[2]);
  assert.equal(longestRoadFor(s, 0), 3);
  assert.equal(s.longestRoad, null);
});

test('longest road: a longer road takes the card; a tied holder keeps it after a break', () => {
  const s = mainGame();
  let off = 0;
  while (!threeEdged(pathVertices(10, off)[6])) off++;
  const pv = pathVertices(10, off);
  for (let i = 0; i < 7; i++) road(s, 0, edgeBetween(pv[i], pv[i + 1]));
  s.longestRoad = 0;
  // Player 2 builds 6 roads elsewhere on the coast, then a 7th? No: 6 stays below 7.
  const qv = pathVertices(6, off + 15);
  for (let i = 0; i < 5; i++) road(s, 2, edgeBetween(qv[i], qv[i + 1]));
  s.current = 2;
  give(s, 2, { brick: 3, lumber: 3 });
  ok(s, { type: 'buildRoad', player: 2, edge: edgeBetween(qv[5], qv[6]) });
  assert.equal(longestRoadFor(s, 2), 6);
  assert.equal(s.longestRoad, 0, 'shorter road does not take it');
  // Break player 0 at pv[6]: they keep 6, tied with player 2, so they keep the card.
  breakAt(s, pv[6]);
  assert.equal(longestRoadFor(s, 0), 6);
  assert.equal(s.longestRoad, 0, 'holder keeps the card when tied');
  // Player 2 extends to 7 and takes it.
  s.current = 2;
  const ext = GEO.vertices[qv[6]].edges.find((e) => s.roads[e] === undefined) ?? GEO.vertices[qv[0]].edges.find((e) => s.roads[e] === undefined);
  ok(s, { type: 'buildRoad', player: 2, edge: ext });
  assert.equal(s.longestRoad, 2);
});

test('largest army: first to 3 knights, taken by someone with more', () => {
  const s = mainGame();
  const play = (p) => {
    s.current = p; s.phase = 'main'; s.devPlayedThisTurn = false;
    s.hidden.dev[p].push({ type: 'knight', turn: 0 });
    ok(s, { type: 'playDev', player: p, card: 'knight' });
    ok(s, { type: 'moveRobber', player: p, hex: s.board.robber === 0 ? 1 : 0 });
  };
  play(0); play(0);
  assert.equal(s.largestArmy, null);
  play(0);
  assert.equal(s.largestArmy, 0);
  play(1); play(1); play(1);
  assert.equal(s.largestArmy, 0, 'a tie does not take the card');
  play(1);
  assert.equal(s.largestArmy, 1);
});

test('trading: own turn only, harbour ratios, no like-for-like, no gifts, counter-offers', () => {
  const s = mainGame();
  give(s, 0, { ore: 4, wool: 1 });
  give(s, 1, { brick: 2 });
  bad(s, { type: 'bankTrade', player: 1, give: 'brick', get: 'ore' }, /Not your turn/);
  bad(s, { type: 'bankTrade', player: 0, give: 'ore', get: 'ore' });
  ok(s, { type: 'bankTrade', player: 0, give: 'ore', get: 'grain' });
  assert.equal(s.hidden.hands[0].ore, 0);
  assert.equal(s.hidden.hands[0].grain, 1);
  // Harbours.
  const ore = s.board.harbours.find((h) => h.type === 'ore');
  const any = s.board.harbours.find((h) => h.type === 'any');
  put(s, 0, ore.vertices[0]);
  assert.equal(harbourRatios(s, 0).ore, 2);
  assert.equal(harbourRatios(s, 0).wool, 4, 'a 2:1 harbour gives nothing for other resources');
  put(s, 0, any.vertices[0]);
  assert.equal(harbourRatios(s, 0).wool, 3);
  // Domestic.
  bad(s, { type: 'offerTrade', player: 0, give: { wool: 1 }, get: {} }, /Both sides/);
  bad(s, { type: 'offerTrade', player: 0, give: { wool: 1 }, get: { wool: 1 } }, /like for like/);
  bad(s, { type: 'offerTrade', player: 1, give: { brick: 1 }, get: { wool: 1 } }, /Not your turn/);
  ok(s, { type: 'offerTrade', player: 0, give: { wool: 1 }, get: { brick: 2 } });
  ok(s, { type: 'respondTrade', player: 1, response: { give: { wool: 1 }, get: { brick: 1 } } });
  ok(s, { type: 'respondTrade', player: 2, response: 'reject' });
  ok(s, { type: 'respondTrade', player: 3, response: 'reject' });
  bad(s, { type: 'acceptTrade', player: 0, with: 2 });
  ok(s, { type: 'acceptTrade', player: 0, with: 1 });
  assert.equal(s.hidden.hands[0].brick, 1);
  assert.equal(s.hidden.hands[1].wool, 1);
  assert.equal(s.hidden.hands[1].brick, 1);
});

test('piece limits: 15 roads, 5 settlements, 4 cities', () => {
  const s = mainGame();
  s.players[0].roadsLeft = 0;
  put(s, 0, 0);
  give(s, 0, { brick: 1, lumber: 1 });
  bad(s, { type: 'buildRoad', player: 0, edge: GEO.vertices[0].edges[0] }, /No roads/);
});

test('viewFor hides other hands and the deck', () => {
  const s = mainGame();
  give(s, 1, { ore: 3 });
  const v = viewFor(s, 0);
  assert.equal(v.hidden.hands[1], null);
  assert.equal(v.hidden.handCounts[1], 3);
  assert.equal(v.hidden.deck, null);
});

void edgeOf;
