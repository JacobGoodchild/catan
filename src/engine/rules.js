// Catan base game rules engine (5th edition, 2020 rulebook).
// Pure logic. Every change goes through step(state, action, rng), which validates the action,
// mutates the state and returns { ok, error, events }. Events drive the UI's animations.

import {
  GEO, HEX_COORDS, HARBOUR_SPOTS, BEGINNER_MAP, OUTER_RING, INNER_RING, TOKEN_SEQUENCE,
  hexIndex, edgeOf,
} from './geometry.js';

export const RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore'];
export const TERRAIN_RESOURCE = { hills: 'brick', forest: 'lumber', pasture: 'wool', fields: 'grain', mountains: 'ore', desert: null };
export const COLOURS = ['red', 'blue', 'white', 'orange'];
export const COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  dev: { wool: 1, grain: 1, ore: 1 },
};
export const DEV_DECK = [
  ...Array(14).fill('knight'),
  ...Array(5).fill('vp'),
  ...Array(2).fill('roadBuilding'),
  ...Array(2).fill('yearOfPlenty'),
  ...Array(2).fill('monopoly'),
];

const emptyHand = () => ({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
export const handTotal = (h) => RESOURCES.reduce((s, r) => s + (h[r] || 0), 0);

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Board setup ----------

export function makeBoard(kind, rng) {
  let hexes;
  let harbourTypes = HARBOUR_SPOTS.map((h) => h.type);
  if (kind === 'beginner') {
    hexes = BEGINNER_MAP.map(([terrain, number]) => ({ terrain, number }));
  } else {
    const tiles = shuffle([
      ...Array(4).fill('forest'), ...Array(4).fill('pasture'), ...Array(4).fill('fields'),
      ...Array(3).fill('hills'), ...Array(3).fill('mountains'), 'desert',
    ], rng);
    hexes = tiles.map((terrain) => ({ terrain, number: 0 }));
    // Tokens A–R from a random corner, anticlockwise towards the centre, skipping the desert.
    const k = Math.floor(rng() * 6);
    const order = [
      ...OUTER_RING.slice(2 * k), ...OUTER_RING.slice(0, 2 * k),
      ...INNER_RING.slice(k), ...INNER_RING.slice(0, k),
      [0, 0],
    ];
    let t = 0;
    for (const [q, r] of order) {
      const h = hexes[hexIndex(q, r)];
      if (h.terrain !== 'desert') h.number = TOKEN_SEQUENCE[t++];
    }
    harbourTypes = shuffle(harbourTypes, rng);
  }
  const harbours = HARBOUR_SPOTS.map((s, i) => {
    const edge = edgeOf(s.q, s.r, s.dir);
    return { edge, vertices: GEO.edges[edge].v.slice(), type: harbourTypes[i], q: s.q, r: s.r, dir: s.dir };
  });
  const robber = hexes.findIndex((h) => h.terrain === 'desert');
  return { hexes, harbours, robber };
}

// Starting Set-up for Beginners (Illustration A): [vertex, road edge] per colour. The second is the starred one,
// which gives the starting resources.
export const BEGINNER_START = {
  red: [[2, 9], [25, 38]],
  orange: [[13, 14], [41, 58]],
  white: [[33, 42], [14, 17]],
  blue: [[43, 56], [38, 55]],
};

// ---------- New game ----------

export function newGame(opts, rng) {
  const n = opts.numPlayers || 4;
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push({
      id: i,
      colour: (opts.colours && opts.colours[i]) || COLOURS[i],
      name: (opts.names && opts.names[i]) || COLOURS[i][0].toUpperCase() + COLOURS[i].slice(1),
      roadsLeft: 15, settlementsLeft: 5, citiesLeft: 4,
      knightsPlayed: 0,
      roadLength: 0,
    });
  }
  const fixedStart = opts.board === 'beginnerStart';
  const board = makeBoard(fixedStart ? 'beginner' : opts.board || 'beginner', rng);
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  for (let i = n - 1; i >= 0; i--) order.push(i);
  const state = {
    v: 1,
    config: { numPlayers: n, vpTarget: opts.vpTarget || 10, board: opts.board || 'beginner', friendlyRobber: !!opts.friendlyRobber },
    board,
    players,
    buildings: {}, // vertexId -> { player, type: 'settlement' | 'city' }
    roads: {}, // edgeId -> player
    bank: { brick: 19, lumber: 19, wool: 19, grain: 19, ore: 19 },
    devDeckCount: 25,
    phase: 'setupSettlement',
    setupOrder: order,
    setupIndex: 0,
    lastSetupSettlement: null,
    current: 0,
    turn: 0, // increments at every new turn in the main game
    dice: null,
    devPlayedThisTurn: false,
    pendingDiscards: null, // { playerId: count }
    robberReturn: null, // phase to return to after the robber is resolved
    stealCandidates: null,
    freeRoads: 0,
    longestRoad: null,
    largestArmy: null,
    trade: null, // { from, give, get, responses: { pid: 'accept' | 'reject' | { give, get } } }
    winner: null,
    hidden: {
      hands: players.map(() => emptyHand()),
      dev: players.map(() => []), // [{ type, turn }] unplayed cards
      deck: shuffle(DEV_DECK, rng),
    },
    playedDev: players.map(() => []), // public: types of dev cards played (knights and progress)
  };
  if (fixedStart) {
    const g = state;
    for (const pl of g.players) {
      const spots = BEGINNER_START[pl.colour];
      if (!spots) continue;
      spots.forEach(([v, e], i) => {
        g.buildings[v] = { player: pl.id, type: 'settlement' };
        g.roads[e] = pl.id;
        pl.settlementsLeft--; pl.roadsLeft--;
        if (i === 1) {
          for (const h of GEO.vertices[v].hexes) {
            const res = TERRAIN_RESOURCE[g.board.hexes[h].terrain];
            if (res) { g.hidden.hands[pl.id][res]++; g.bank[res]--; }
          }
        }
      });
      pl.roadLength = longestRoadFor(g, pl.id);
    }
    g.phase = 'roll';
    g.turn = 1;
    g.current = 0;
  }
  return state;
}

// ---------- Queries ----------

export function victoryPoints(state, p, includeHidden = true) {
  let vp = 0;
  for (const b of Object.values(state.buildings)) if (b.player === p) vp += b.type === 'city' ? 2 : 1;
  if (state.longestRoad === p) vp += 2;
  if (state.largestArmy === p) vp += 2;
  if (includeHidden) vp += state.hidden.dev[p].filter((c) => c.type === 'vp').length;
  return vp;
}

function vertexFree(state, v) {
  if (state.buildings[v]) return false;
  return GEO.vertices[v].adj.every((a) => !state.buildings[a]);
}
function playerTouchesVertexByRoad(state, p, v) {
  return GEO.vertices[v].edges.some((e) => state.roads[e] === p);
}

export function legalSettlementSpots(state, p) {
  const out = [];
  const setup = state.phase === 'setupSettlement';
  for (const v of GEO.vertices) {
    if (!vertexFree(state, v.id)) continue;
    if (!setup && !playerTouchesVertexByRoad(state, p, v.id)) continue;
    out.push(v.id);
  }
  return out;
}

export function legalCitySpots(state, p) {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.player === p && b.type === 'settlement')
    .map(([v]) => +v);
}

export function legalRoadSpots(state, p) {
  if (state.phase === 'setupRoad') {
    const v = state.lastSetupSettlement;
    return GEO.vertices[v].edges.filter((e) => state.roads[e] === undefined);
  }
  const out = [];
  for (const e of GEO.edges) {
    if (state.roads[e.id] !== undefined) continue;
    let ok = false;
    for (const v of e.v) {
      const b = state.buildings[v];
      if (b && b.player === p) { ok = true; break; }
      if (b && b.player !== p) continue; // can't build through an opponent's building
      if (GEO.vertices[v].edges.some((x) => x !== e.id && state.roads[x] === p)) { ok = true; break; }
    }
    if (ok) out.push(e.id);
  }
  return out;
}

// Hexes the robber may move to. House rule "friendly robber" (off by default): not next to an opponent
// with 2 or fewer visible points, unless that leaves nowhere to go.
export function legalRobberHexes(state, p) {
  const all = [];
  for (let h = 0; h < GEO.hexes.length; h++) if (h !== state.board.robber) all.push(h);
  if (!state.config.friendlyRobber) return all;
  const visible = (q) => victoryPoints(state, q, false);
  const ok = all.filter((h) => GEO.hexes[h].corners.every((v) => {
    const b = state.buildings[v];
    return !b || b.player === p || visible(b.player) > 2;
  }));
  return ok.length ? ok : all;
}

export function harbourRatios(state, p) {
  const r = { brick: 4, lumber: 4, wool: 4, grain: 4, ore: 4 };
  for (const h of state.board.harbours) {
    if (!h.vertices.some((v) => state.buildings[v] && state.buildings[v].player === p)) continue;
    if (h.type === 'any') for (const k of RESOURCES) r[k] = Math.min(r[k], 3);
    else r[h.type] = 2;
  }
  return r;
}

export function canAfford(hand, cost) {
  return Object.entries(cost).every(([k, n]) => hand[k] >= n);
}

// Longest continuous road for a player, not passing through opponents' buildings.
export function longestRoadFor(state, p) {
  const mine = Object.keys(state.roads).filter((e) => state.roads[e] === p).map(Number);
  if (!mine.length) return 0;
  const mineSet = new Set(mine);
  let best = 0;
  const used = new Set();
  const blocked = (v) => state.buildings[v] && state.buildings[v].player !== p;
  const dfs = (v, len) => {
    if (len > best) best = len;
    if (blocked(v)) return;
    for (const e of GEO.vertices[v].edges) {
      if (!mineSet.has(e) || used.has(e)) continue;
      used.add(e);
      const [a, b] = GEO.edges[e].v;
      dfs(a === v ? b : a, len + 1);
      used.delete(e);
    }
  };
  for (const e of mine) {
    for (const start of GEO.edges[e].v) {
      used.add(e);
      const [a, b] = GEO.edges[e].v;
      dfs(a === start ? b : a, 1);
      used.delete(e);
    }
  }
  return best;
}

// ---------- Who needs to act ----------

export function actorsNeeded(state) {
  if (state.phase === 'gameOver') return [];
  if (state.phase === 'discard') return Object.keys(state.pendingDiscards).map(Number);
  if (state.trade) {
    const waiting = state.players.map((p) => p.id).filter((id) => id !== state.current && state.trade.responses[id] === undefined);
    if (waiting.length) return waiting;
  }
  return [state.current];
}

// ---------- step ----------

export function step(state, action, rng = Math.random) {
  const events = [];
  try {
    const err = apply(state, action, rng, events);
    if (err) return { ok: false, error: err, events: [] };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e), events: [] };
  }
  return { ok: true, events };
}

function take(state, p, cost, events, reason) {
  const hand = state.hidden.hands[p];
  for (const [k, n] of Object.entries(cost)) {
    hand[k] -= n;
    state.bank[k] += n;
  }
  events.push({ type: 'pay', player: p, cards: { ...cost }, reason });
}

function gain(state, p, cards, events, extra = {}) {
  const hand = state.hidden.hands[p];
  for (const [k, n] of Object.entries(cards)) {
    hand[k] += n;
    state.bank[k] -= n;
  }
  events.push({ type: 'gain', player: p, cards: { ...cards }, ...extra });
}

function updateLongestRoad(state, events) {
  const lens = state.players.map((pl) => longestRoadFor(state, pl.id));
  state.players.forEach((pl, i) => (pl.roadLength = lens[i]));
  const max = Math.max(...lens);
  const leaders = lens.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
  const holder = state.longestRoad;
  let next;
  if (holder !== null && lens[holder] === max && max >= 5) next = holder;
  else if (max >= 5 && leaders.length === 1) next = leaders[0];
  else next = null;
  if (next !== holder) {
    state.longestRoad = next;
    events.push({ type: 'longestRoad', from: holder, to: next });
  }
}

function updateLargestArmy(state, p, events) {
  const k = state.players[p].knightsPlayed;
  const holder = state.largestArmy;
  if (k < 3 || holder === p) return;
  if (holder === null || k > state.players[holder].knightsPlayed) {
    state.largestArmy = p;
    events.push({ type: 'largestArmy', from: holder, to: p });
  }
}

function checkWin(state, events) {
  if (state.phase === 'gameOver') return;
  if (state.phase === 'setupSettlement' || state.phase === 'setupRoad') return;
  const p = state.current;
  if (victoryPoints(state, p) >= state.config.vpTarget) {
    state.phase = 'gameOver';
    state.winner = p;
    state.trade = null;
    events.push({ type: 'win', player: p, vp: victoryPoints(state, p) });
  }
}

function produce(state, roll, events) {
  // demand[res][player] = count
  const demand = {};
  const sources = [];
  state.board.hexes.forEach((h, idx) => {
    if (h.number !== roll || idx === state.board.robber) return;
    const res = TERRAIN_RESOURCE[h.terrain];
    if (!res) return;
    for (const v of GEO.hexes[idx].corners) {
      const b = state.buildings[v];
      if (!b) continue;
      const n = b.type === 'city' ? 2 : 1;
      demand[res] = demand[res] || {};
      demand[res][b.player] = (demand[res][b.player] || 0) + n;
      sources.push({ hex: idx, player: b.player, resource: res, count: n, vertex: v });
    }
  });
  const blocked = [];
  state.board.hexes.forEach((h, idx) => {
    if (h.number === roll && idx === state.board.robber) blocked.push(idx);
  });
  events.push({ type: 'production', roll, hexes: state.board.hexes.map((h, i) => (h.number === roll ? i : -1)).filter((i) => i >= 0), blocked });
  const paid = {};
  for (const res of RESOURCES) {
    const d = demand[res];
    if (!d) continue;
    const total = Object.values(d).reduce((a, b) => a + b, 0);
    const who = Object.keys(d).map(Number);
    if (total <= state.bank[res]) {
      for (const p of who) (paid[p] = paid[p] || {})[res] = d[p];
    } else if (who.length === 1) {
      // Shortage affecting only one player: they get what's left.
      if (state.bank[res] > 0) (paid[who[0]] = paid[who[0]] || {})[res] = state.bank[res];
      events.push({ type: 'shortage', resource: res, players: who, partial: true });
    } else {
      events.push({ type: 'shortage', resource: res, players: who, partial: false });
    }
  }
  for (const [p, cards] of Object.entries(paid)) {
    gain(state, +p, cards, events, { reason: 'production', sources: sources.filter((s) => s.player === +p && cards[s.resource]) });
  }
}

function startRobber(state, returnPhase, events) {
  state.robberReturn = returnPhase;
  state.phase = 'robber';
  events.push({ type: 'robberPhase', player: state.current });
}

function nextTurn(state, events) {
  state.current = (state.current + 1) % state.players.length;
  state.turn += 1;
  state.phase = 'roll';
  state.dice = null;
  state.devPlayedThisTurn = false;
  state.trade = null;
  state.offersThisTurn = 0;
  events.push({ type: 'turn', player: state.current, turn: state.turn });
  checkWin(state, events);
}

function validCards(cards) {
  if (!cards || typeof cards !== 'object') return false;
  return Object.entries(cards).every(([k, n]) => RESOURCES.includes(k) && Number.isInteger(n) && n >= 0);
}
const cardCount = (c) => Object.values(c).reduce((a, b) => a + b, 0);

function apply(state, a, rng, events) {
  if (!a || typeof a.type !== 'string') return 'Bad action';
  const p = a.player;
  if (state.phase === 'gameOver') return 'Game is over';
  if (!Number.isInteger(p) || p < 0 || p >= state.players.length) return 'Bad player';
  const pl = state.players[p];
  const hand = state.hidden.hands[p];
  const isCurrent = p === state.current;
  const ph = state.phase;

  switch (a.type) {
    // ----- Setup -----
    case 'buildSettlement': {
      if (!isCurrent) return 'Not your turn';
      const v = a.vertex;
      if (ph === 'setupSettlement') {
        if (!legalSettlementSpots(state, p).includes(v)) return 'Illegal spot';
        state.buildings[v] = { player: p, type: 'settlement' };
        pl.settlementsLeft--;
        state.lastSetupSettlement = v;
        events.push({ type: 'build', player: p, piece: 'settlement', vertex: v, free: true });
        const second = state.setupIndex >= state.players.length;
        if (second) {
          const cards = {};
          for (const h of GEO.vertices[v].hexes) {
            const res = TERRAIN_RESOURCE[state.board.hexes[h].terrain];
            if (res) cards[res] = (cards[res] || 0) + 1;
          }
          if (Object.keys(cards).length) gain(state, p, cards, events, { reason: 'setup', vertex: v });
        }
        state.phase = 'setupRoad';
        updateLongestRoad(state, events);
        return null;
      }
      if (ph !== 'main') return 'Not now';
      if (pl.settlementsLeft <= 0) return 'No settlements left';
      if (!canAfford(hand, COSTS.settlement)) return 'Cannot afford';
      if (!legalSettlementSpots(state, p).includes(v)) return 'Illegal spot';
      take(state, p, COSTS.settlement, events, 'settlement');
      state.buildings[v] = { player: p, type: 'settlement' };
      pl.settlementsLeft--;
      events.push({ type: 'build', player: p, piece: 'settlement', vertex: v });
      updateLongestRoad(state, events);
      checkWin(state, events);
      return null;
    }
    case 'buildRoad': {
      if (!isCurrent) return 'Not your turn';
      const e = a.edge;
      if (ph === 'setupRoad') {
        if (!legalRoadSpots(state, p).includes(e)) return 'Illegal spot';
        state.roads[e] = p;
        pl.roadsLeft--;
        events.push({ type: 'build', player: p, piece: 'road', edge: e, free: true });
        updateLongestRoad(state, events);
        state.setupIndex++;
        if (state.setupIndex >= state.setupOrder.length) {
          state.current = state.setupOrder[state.setupOrder.length - 1];
          state.phase = 'roll';
          state.turn = 1;
          events.push({ type: 'turn', player: state.current, turn: 1 });
        } else {
          state.current = state.setupOrder[state.setupIndex];
          state.phase = 'setupSettlement';
        }
        return null;
      }
      if (ph === 'roadBuilding') {
        if (pl.roadsLeft <= 0) return 'No roads left';
        if (!legalRoadSpots(state, p).includes(e)) return 'Illegal spot';
        state.roads[e] = p;
        pl.roadsLeft--;
        state.freeRoads--;
        events.push({ type: 'build', player: p, piece: 'road', edge: e, free: true });
        updateLongestRoad(state, events);
        if (state.freeRoads <= 0 || pl.roadsLeft <= 0 || !legalRoadSpots(state, p).length) {
          state.freeRoads = 0;
          state.phase = state.robberReturn || 'main';
          state.robberReturn = null;
        }
        checkWin(state, events);
        return null;
      }
      if (ph !== 'main') return 'Not now';
      if (pl.roadsLeft <= 0) return 'No roads left';
      if (!canAfford(hand, COSTS.road)) return 'Cannot afford';
      if (!legalRoadSpots(state, p).includes(e)) return 'Illegal spot';
      take(state, p, COSTS.road, events, 'road');
      state.roads[e] = p;
      pl.roadsLeft--;
      events.push({ type: 'build', player: p, piece: 'road', edge: e });
      updateLongestRoad(state, events);
      checkWin(state, events);
      return null;
    }
    case 'buildCity': {
      if (!isCurrent) return 'Not your turn';
      if (ph !== 'main') return 'Not now';
      if (pl.citiesLeft <= 0) return 'No cities left';
      if (!canAfford(hand, COSTS.city)) return 'Cannot afford';
      if (!legalCitySpots(state, p).includes(a.vertex)) return 'Illegal spot';
      take(state, p, COSTS.city, events, 'city');
      state.buildings[a.vertex] = { player: p, type: 'city' };
      pl.citiesLeft--;
      pl.settlementsLeft++;
      events.push({ type: 'build', player: p, piece: 'city', vertex: a.vertex });
      checkWin(state, events);
      return null;
    }
    case 'buyDev': {
      if (!isCurrent) return 'Not your turn';
      if (ph !== 'main') return 'Not now';
      if (!state.hidden.deck.length) return 'No development cards left';
      if (!canAfford(hand, COSTS.dev)) return 'Cannot afford';
      take(state, p, COSTS.dev, events, 'dev');
      const card = state.hidden.deck.pop();
      state.devDeckCount = state.hidden.deck.length;
      state.hidden.dev[p].push({ type: card, turn: state.turn });
      events.push({ type: 'buyDev', player: p, card });
      checkWin(state, events);
      return null;
    }

    // ----- Rolling -----
    case 'roll': {
      if (!isCurrent) return 'Not your turn';
      if (ph !== 'roll') return 'Not now';
      let d = a.dice;
      if (!Array.isArray(d) || d.length !== 2 || !d.every((x) => Number.isInteger(x) && x >= 1 && x <= 6)) {
        d = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
      }
      state.dice = d;
      const total = d[0] + d[1];
      if (!state.rollCounts) state.rollCounts = Array(13).fill(0);
      state.rollCounts[total]++;
      events.push({ type: 'roll', player: p, dice: d, total });
      if (total === 7) {
        const pending = {};
        state.players.forEach((x) => {
          const n = handTotal(state.hidden.hands[x.id]);
          if (n > 7) pending[x.id] = Math.floor(n / 2);
        });
        if (Object.keys(pending).length) {
          state.pendingDiscards = pending;
          state.phase = 'discard';
          events.push({ type: 'discardPhase', pending: { ...pending } });
        } else {
          startRobber(state, 'main', events);
        }
      } else {
        produce(state, total, events);
        state.phase = 'main';
      }
      checkWin(state, events);
      return null;
    }
    case 'discard': {
      if (ph !== 'discard') return 'Not now';
      const need = state.pendingDiscards[p];
      if (!need) return 'No discard needed';
      if (!validCards(a.cards) || cardCount(a.cards) !== need) return `Must discard ${need}`;
      if (!canAfford(hand, a.cards)) return 'Not in hand';
      for (const [k, n] of Object.entries(a.cards)) { hand[k] -= n; state.bank[k] += n; }
      events.push({ type: 'discard', player: p, cards: { ...a.cards }, count: need });
      delete state.pendingDiscards[p];
      if (!Object.keys(state.pendingDiscards).length) {
        state.pendingDiscards = null;
        startRobber(state, 'main', events);
      }
      return null;
    }
    case 'moveRobber': {
      if (!isCurrent) return 'Not your turn';
      if (ph !== 'robber') return 'Not now';
      const h = a.hex;
      if (!Number.isInteger(h) || h < 0 || h >= 19) return 'Bad hex';
      if (h === state.board.robber) return 'The robber must move';
      if (!legalRobberHexes(state, p).includes(h)) return 'Friendly robber: not next to a player with 2 points or fewer';
      const from = state.board.robber;
      state.board.robber = h;
      events.push({ type: 'robber', player: p, from, to: h });
      const victims = [...new Set(GEO.hexes[h].corners
        .map((v) => state.buildings[v])
        .filter((b) => b && b.player !== p)
        .map((b) => b.player))];
      if (victims.length === 0) {
        state.phase = state.robberReturn; state.robberReturn = null;
      } else if (victims.length === 1) {
        doSteal(state, p, victims[0], rng, events);
      } else {
        state.stealCandidates = victims;
        state.phase = 'steal';
      }
      return null;
    }
    case 'steal': {
      if (!isCurrent) return 'Not your turn';
      if (ph !== 'steal') return 'Not now';
      if (!state.stealCandidates.includes(a.victim)) return 'Cannot steal from them';
      doSteal(state, p, a.victim, rng, events);
      return null;
    }

    // ----- Development cards -----
    case 'playDev': {
      if (!isCurrent) return 'Not your turn';
      if (ph !== 'main' && ph !== 'roll') return 'Not now';
      if (state.devPlayedThisTurn) return 'Already played a development card this turn';
      const kind = a.card;
      if (kind === 'vp') return 'Victory point cards are not played';
      if (ph === 'roll' && kind !== 'knight') return 'Roll first';
      const idx = state.hidden.dev[p].findIndex((c) => c.type === kind && c.turn < state.turn);
      if (idx < 0) return 'No playable card of that kind';
      if (kind === 'yearOfPlenty') {
        const want = a.resources;
        const bankTotal = handTotal(state.bank);
        if (!Array.isArray(want) || want.length !== Math.min(2, bankTotal) || !want.every((r) => RESOURCES.includes(r))) return 'Choose 2 resources';
        const need = {};
        for (const r of want) need[r] = (need[r] || 0) + 1;
        if (!canAfford(state.bank, need)) return 'Bank does not have those';
        state.hidden.dev[p].splice(idx, 1);
        state.devPlayedThisTurn = true;
        state.playedDev[p].push(kind);
        events.push({ type: 'playDev', player: p, card: kind });
        gain(state, p, need, events, { reason: 'yearOfPlenty' });
        return null;
      }
      if (kind === 'monopoly') {
        if (!RESOURCES.includes(a.resource)) return 'Choose a resource';
        state.hidden.dev[p].splice(idx, 1);
        state.devPlayedThisTurn = true;
        state.playedDev[p].push(kind);
        events.push({ type: 'playDev', player: p, card: kind, resource: a.resource });
        for (const o of state.players) {
          if (o.id === p) continue;
          const n = state.hidden.hands[o.id][a.resource];
          if (n > 0) {
            state.hidden.hands[o.id][a.resource] = 0;
            hand[a.resource] += n;
            events.push({ type: 'transfer', from: o.id, to: p, cards: { [a.resource]: n }, reason: 'monopoly' });
          }
        }
        return null;
      }
      if (kind === 'roadBuilding') {
        state.hidden.dev[p].splice(idx, 1);
        state.devPlayedThisTurn = true;
        state.playedDev[p].push(kind);
        events.push({ type: 'playDev', player: p, card: kind });
        const n = Math.min(2, pl.roadsLeft);
        if (n > 0 && legalRoadSpots(state, p).length) {
          state.freeRoads = n;
          state.robberReturn = ph;
          state.phase = 'roadBuilding';
        }
        return null;
      }
      if (kind === 'knight') {
        state.hidden.dev[p].splice(idx, 1);
        state.devPlayedThisTurn = true;
        state.playedDev[p].push(kind);
        pl.knightsPlayed++;
        events.push({ type: 'playDev', player: p, card: kind });
        updateLargestArmy(state, p, events);
        startRobber(state, ph, events);
        checkWin(state, events);
        return null;
      }
      return 'Unknown card';
    }

    // ----- Trading -----
    case 'bankTrade': {
      if (!isCurrent) return 'Not your turn';
      if (ph !== 'main') return 'Not now';
      const { give, get } = a;
      if (!RESOURCES.includes(give) || !RESOURCES.includes(get)) return 'Bad resource';
      if (give === get) return 'Cannot trade like for like';
      const ratio = harbourRatios(state, p)[give];
      if (hand[give] < ratio) return 'Not enough cards';
      if (state.bank[get] < 1) return 'Bank has none';
      hand[give] -= ratio; state.bank[give] += ratio;
      hand[get] += 1; state.bank[get] -= 1;
      events.push({ type: 'bankTrade', player: p, give: { [give]: ratio }, get: { [get]: 1 }, ratio });
      return null;
    }
    case 'offerTrade': {
      if (!isCurrent) return 'Not your turn';
      if (ph !== 'main') return 'Not now';
      const err = tradeShapeError(a.give, a.get);
      if (err) return err;
      if (!canAfford(hand, a.give)) return 'Not in hand';
      state.offersThisTurn = (state.offersThisTurn || 0) + 1;
      state.trade = { from: p, give: { ...a.give }, get: { ...a.get }, responses: {}, to: Array.isArray(a.to) ? a.to.slice() : null };
      // Players not addressed reject automatically.
      if (state.trade.to) for (const o of state.players) if (o.id !== p && !state.trade.to.includes(o.id)) state.trade.responses[o.id] = 'reject';
      events.push({ type: 'offerTrade', player: p, give: { ...a.give }, get: { ...a.get } });
      return null;
    }
    case 'respondTrade': {
      if (!state.trade) return 'No offer';
      if (isCurrent) return 'You made the offer';
      if (state.trade.responses[p] !== undefined) return 'Already answered';
      let r;
      if (a.response === 'accept') {
        if (!canAfford(hand, state.trade.get)) return 'Not in hand';
        r = 'accept';
      } else if (a.response === 'reject') r = 'reject';
      else if (a.response && typeof a.response === 'object') {
        // Counter-offer, from the point of view of the current player: give/get as the current player would.
        const err = tradeShapeError(a.response.give, a.response.get);
        if (err) return err;
        if (!canAfford(hand, a.response.get)) return 'Not in hand';
        r = { give: { ...a.response.give }, get: { ...a.response.get } };
      } else return 'Bad response';
      state.trade.responses[p] = r;
      events.push({ type: 'respondTrade', player: p, response: r });
      return null;
    }
    case 'acceptTrade': {
      if (!isCurrent || !state.trade) return 'No offer';
      const o = a.with;
      const r = state.trade.responses[o];
      if (!r || r === 'reject') return 'They did not accept';
      const terms = r === 'accept' ? state.trade : r;
      const oh = state.hidden.hands[o];
      if (!canAfford(hand, terms.give) || !canAfford(oh, terms.get)) return 'Cards no longer available';
      for (const [k, n] of Object.entries(terms.give)) { hand[k] -= n; oh[k] += n; }
      for (const [k, n] of Object.entries(terms.get)) { oh[k] -= n; hand[k] += n; }
      events.push({ type: 'trade', player: p, with: o, give: { ...terms.give }, get: { ...terms.get } });
      state.trade = null;
      return null;
    }
    case 'cancelTrade': {
      if (!isCurrent || !state.trade) return 'No offer';
      state.trade = null;
      events.push({ type: 'cancelTrade', player: p });
      return null;
    }

    case 'endTurn': {
      if (!isCurrent) return 'Not your turn';
      if (ph !== 'main') return 'Not now';
      state.trade = null;
      nextTurn(state, events);
      return null;
    }
  }
  return 'Unknown action';
}

function tradeShapeError(give, get) {
  if (!validCards(give) || !validCards(get)) return 'Bad cards';
  if (cardCount(give) === 0 || cardCount(get) === 0) return 'Both sides must give something';
  for (const r of RESOURCES) if ((give[r] || 0) > 0 && (get[r] || 0) > 0) return 'Cannot trade like for like';
  return null;
}

function doSteal(state, p, victim, rng, events) {
  const vh = state.hidden.hands[victim];
  const pool = [];
  for (const r of RESOURCES) for (let i = 0; i < vh[r]; i++) pool.push(r);
  if (pool.length) {
    const res = pool[Math.floor(rng() * pool.length)];
    vh[res]--;
    state.hidden.hands[p][res]++;
    events.push({ type: 'steal', player: p, victim, resource: res });
  } else {
    events.push({ type: 'steal', player: p, victim, resource: null });
  }
  state.stealCandidates = null;
  state.phase = state.robberReturn;
  state.robberReturn = null;
  checkWin(state, events);
}

// ---------- Views ----------

// What a given player is allowed to see. Others' hands become counts; the deck becomes a count.
export function viewFor(state, viewer) {
  const s = JSON.parse(JSON.stringify(state));
  s.hidden = {
    hands: state.hidden.hands.map((h, i) => (i === viewer ? { ...h } : null)),
    handCounts: state.hidden.hands.map((h) => handTotal(h)),
    dev: state.hidden.dev.map((d, i) => (i === viewer ? d.map((c) => ({ ...c })) : null)),
    devCounts: state.hidden.dev.map((d) => d.length),
    deck: null,
  };
  return s;
}

export function events_redact(events, viewer) {
  return events.map((e) => {
    if (e.type === 'steal' && e.player !== viewer && e.victim !== viewer) return { ...e, resource: null };
    if (e.type === 'buyDev' && e.player !== viewer) return { ...e, card: null };
    if (e.type === 'discard' && e.player !== viewer) return { ...e, cards: null };
    return e;
  });
}

export { GEO, HEX_COORDS };
