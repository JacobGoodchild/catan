// Computer players. They only look at what their seat can see (viewFor) and never at hidden cards.
// botAction(state, player, rng, level) returns one legal action.

import { GEO } from './geometry.js';
import { PIPS } from './geometry.js';
import {
  RESOURCES, TERRAIN_RESOURCE, COSTS, viewFor, legalSettlementSpots, legalRoadSpots, legalCitySpots,
  harbourRatios, canAfford, handTotal, victoryPoints, longestRoadFor,
} from './rules.js';

const LEVELS = { easy: { noise: 0.6, trade: false, plan: false }, normal: { noise: 0.15, trade: true, plan: true }, hard: { noise: 0.02, trade: true, plan: true } };

function resourceWeights(view) {
  // Scarcity: fewer pips of a resource on the board makes it more valuable.
  const pips = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
  view.board.hexes.forEach((h) => {
    const r = TERRAIN_RESOURCE[h.terrain];
    if (r && h.number) pips[r] += PIPS[h.number];
  });
  const w = {};
  for (const r of RESOURCES) w[r] = 1 + Math.max(0, (12 - pips[r]) / 12);
  // Early game, brick and lumber matter most (Almanac, Tactics).
  w.brick *= 1.1; w.lumber *= 1.1;
  return w;
}

function vertexProduction(view, v) {
  const out = {};
  for (const h of GEO.vertices[v].hexes) {
    const hex = view.board.hexes[h];
    const r = TERRAIN_RESOURCE[hex.terrain];
    if (!r || !hex.number || h === view.board.robber) continue;
    out[r] = (out[r] || 0) + PIPS[hex.number];
  }
  return out;
}

function myProduction(view, p) {
  const prod = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
  for (const [v, b] of Object.entries(view.buildings)) {
    if (b.player !== p) continue;
    const vp = vertexProduction(view, +v);
    for (const r in vp) prod[r] += vp[r] * (b.type === 'city' ? 2 : 1);
  }
  return prod;
}

function scoreVertex(view, p, v, weights, rng, level) {
  const prod = vertexProduction(view, v);
  const have = myProduction(view, p);
  let s = 0;
  for (const r in prod) {
    const missing = have[r] === 0 ? 1.35 : 1;
    s += prod[r] * weights[r] * missing;
  }
  s += Object.keys(prod).length * 1.2;
  for (const h of view.board.harbours) {
    if (!h.vertices.includes(v)) continue;
    if (h.type === 'any') s += 1.5;
    else s += Math.min(4, (have[h.type] + (prod[h.type] || 0)) * 0.35);
  }
  return s * (1 + (rng() - 0.5) * LEVELS[level].noise);
}

function pickBest(list, score) {
  let best = null, bs = -Infinity;
  for (const x of list) {
    const s = score(x);
    if (s > bs) { bs = s; best = x; }
  }
  return best;
}

// Distance (in roads) from my network to a vertex, over free paths. Used for road planning.
function roadTowards(view, p, targets, score) {
  const legal = legalRoadSpots(view, p);
  if (!legal.length) return null;
  // Aim at the few best free spots, not just the nearest one.
  let aims = targets;
  if (score) aims = targets.map((v) => [v, score(v)]).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
  let best = null, bestS = -Infinity;
  for (const aim of aims) {
    const set = new Set([aim]);
    for (const e of legal) {
      for (const v of GEO.edges[e].v) {
        const d = bfs(view, p, v, set);
        if (d === Infinity) continue;
        const sc = (score ? score(aim) : 10) / (d + 1);
        if (sc > bestS) { bestS = sc; best = e; }
      }
    }
  }
  return best;
}
function bfs(view, p, start, targets) {
  const seen = new Set([start]);
  let frontier = [start];
  for (let d = 0; d <= 4; d++) {
    const next = [];
    for (const v of frontier) {
      if (targets.has(v)) return d;
      const b = view.buildings[v];
      if (b && b.player !== p) continue;
      for (const e of GEO.vertices[v].edges) {
        if (view.roads[e] !== undefined && view.roads[e] !== p) continue;
        const [a, c] = GEO.edges[e].v;
        const w = a === v ? c : a;
        if (!seen.has(w)) { seen.add(w); next.push(w); }
      }
    }
    frontier = next;
  }
  return Infinity;
}

function settlementTargets(view, p) {
  // Free spots satisfying the distance rule, anywhere on the board.
  const out = [];
  for (const v of GEO.vertices) {
    if (view.buildings[v.id]) continue;
    if (v.adj.some((a) => view.buildings[a])) continue;
    out.push(v.id);
  }
  return out;
}

function goal(view, p) {
  const pl = view.players[p];
  const settlements = Object.values(view.buildings).filter((b) => b.player === p && b.type === 'settlement').length;
  if (settlements > 0 && pl.citiesLeft > 0) {
    const prod = myProduction(view, p);
    if (prod.ore + prod.grain >= 6 || pl.settlementsLeft === 0) return 'city';
  }
  if (pl.settlementsLeft > 0 && legalSettlementSpots(view, p).length) return 'settlement';
  if (pl.settlementsLeft > 0 && pl.roadsLeft > 0) return 'road';
  if (pl.citiesLeft > 0 && settlements > 0) return 'city';
  return 'dev';
}

function ctr0(r, view) { for (const [k, v] of Object.entries(view.trade.responses)) if (v === r) return k; return 0; }
function needs(hand, cost) {
  const n = {};
  for (const [k, v] of Object.entries(cost)) if (hand[k] < v) n[k] = v - hand[k];
  return n;
}

function leader(view, p) {
  let best = null, bv = -1;
  for (const o of view.players) {
    if (o.id === p) continue;
    const vp = publicVP(view, o.id) + view.hidden.devCounts[o.id] * 0.3;
    if (vp > bv) { bv = vp; best = o.id; }
  }
  return best;
}
export function publicVP(view, p) {
  let vp = 0;
  for (const b of Object.values(view.buildings)) if (b.player === p) vp += b.type === 'city' ? 2 : 1;
  if (view.longestRoad === p) vp += 2;
  if (view.largestArmy === p) vp += 2;
  return vp;
}

function robberHex(view, p, rng, level) {
  const lead = leader(view, p);
  let best = null, bs = -Infinity;
  view.board.hexes.forEach((h, idx) => {
    if (idx === view.board.robber) return;
    let s = 0;
    const pips = h.number ? PIPS[h.number] : 0;
    for (const v of GEO.hexes[idx].corners) {
      const b = view.buildings[v];
      if (!b) continue;
      const mult = b.type === 'city' ? 2 : 1;
      if (b.player === p) s -= 10 * mult * (pips + 1);
      else s += pips * mult * (b.player === lead ? 2 : 1) + (view.hidden.handCounts[b.player] > 0 ? 1 : 0);
    }
    s *= 1 + (rng() - 0.5) * LEVELS[level].noise;
    if (s > bs) { bs = s; best = idx; }
  });
  return best;
}

function chooseDiscard(view, p, count) {
  const hand = { ...view.hidden.hands[p] };
  const g = goal(view, p);
  const keep = COSTS[g === 'road' ? 'road' : g] || COSTS.dev;
  const out = {};
  for (let i = 0; i < count; i++) {
    // Drop the card with the largest surplus over what the plan needs.
    const r = pickBest(RESOURCES.filter((x) => hand[x] > 0), (x) => hand[x] - (keep[x] || 0) * 1.5 + Math.random() * 0.01);
    hand[r]--;
    out[r] = (out[r] || 0) + 1;
  }
  return out;
}

// Should this bot accept the current player's offer? Returns 'accept', 'reject' or a counter.
export function judgeTrade(view, p, offer, level) {
  const L = LEVELS[level];
  const from = offer.from;
  if (publicVP(view, from) >= view.config.vpTarget - (level === 'hard' ? 3 : 2)) return 'reject';
  const hand = view.hidden.hands[p];
  if (!canAfford(hand, offer.get)) return 'reject';
  const g = goal(view, p);
  const cost = COSTS[g] || COSTS.dev;
  const value = (cards, sign) => {
    let s = 0;
    for (const [k, n] of Object.entries(cards)) {
      const want = (cost[k] || 0) - hand[k];
      s += n * (want > 0 ? 1.6 : 0.8) * sign;
    }
    return s;
  };
  // I receive offer.give, I pay offer.get.
  const gainV = value(offer.give, 1);
  let lossV = 0;
  for (const [k, n] of Object.entries(offer.get)) {
    const spare = hand[k] - (cost[k] || 0);
    lossV += n * (spare >= n ? 0.7 : 1.7);
  }
  if (gainV >= lossV + (level === 'hard' ? 0.6 : L.plan ? 0.2 : -0.3)) return 'accept';
  // Counter-offer: they want something I can't spare, but what they give is useful to me.
  // Offer my most plentiful spare resource instead (same number of cards), keeping what they give.
  if (L.trade && gainV > 0) {
    const asked = Object.values(offer.get).reduce((x, y) => x + y, 0);
    const spare = RESOURCES
      .filter((r) => !(offer.give[r] > 0) && hand[r] - (cost[r] || 0) >= asked)
      .sort((x, y) => (hand[y] - (cost[y] || 0)) - (hand[x] - (cost[x] || 0)));
    const alt = spare.find((r) => JSON.stringify({ [r]: asked }) !== JSON.stringify(offer.get));
    if (alt) return { give: { ...offer.give }, get: { [alt]: asked } };
  }
  return 'reject';
}

export function botAction(state, p, rng = Math.random, level = 'normal') {
  const view = viewFor(state, p);
  const L = LEVELS[level];
  const pl = view.players[p];
  const hand = view.hidden.hands[p];
  const weights = resourceWeights(view);
  const ph = view.phase;

  if (ph === 'discard') return { type: 'discard', player: p, cards: chooseDiscard(view, p, view.pendingDiscards[p]) };
  if (view.trade && view.trade.from !== p) {
    return { type: 'respondTrade', player: p, response: judgeTrade(view, p, view.trade, level) };
  }
  if (ph === 'setupSettlement') {
    const spots = legalSettlementSpots(view, p);
    return { type: 'buildSettlement', player: p, vertex: pickBest(spots, (v) => scoreVertex(view, p, v, weights, rng, level)) };
  }
  if (ph === 'setupRoad') {
    const spots = legalRoadSpots(view, p);
    const targets = settlementTargets(view, p);
    return { type: 'buildRoad', player: p, edge: pickBest(spots, (e) => {
      const far = GEO.edges[e].v.find((v) => v !== view.lastSetupSettlement);
      let s = 0;
      for (const w of GEO.vertices[far].adj) if (targets.includes(w)) s = Math.max(s, scoreVertex(view, p, w, weights, rng, level));
      return s + rng() * 0.5;
    }) };
  }
  const playable = (t) => view.hidden.dev[p].some((c) => c.type === t && c.turn < view.turn) && !view.devPlayedThisTurn;
  const robberOnMe = GEO.hexes[view.board.robber].corners.some((v) => view.buildings[v] && view.buildings[v].player === p);

  if (ph === 'roll') {
    if (playable('knight') && (robberOnMe || (L.plan && pl.knightsPlayed >= 2 && view.largestArmy !== p))) return { type: 'playDev', player: p, card: 'knight' };
    return { type: 'roll', player: p };
  }
  if (ph === 'robber') return { type: 'moveRobber', player: p, hex: robberHex(view, p, rng, level) };
  if (ph === 'steal') {
    return { type: 'steal', player: p, victim: pickBest(view.stealCandidates, (o) => (view.hidden.handCounts[o] > 0 ? 10 : 0) + publicVP(view, o)) };
  }
  if (ph === 'roadBuilding') {
    const e = roadTowards(view, p, settlementTargets(view, p)) ?? legalRoadSpots(view, p)[0];
    return { type: 'buildRoad', player: p, edge: e };
  }
  if (ph !== 'main') return null;

  // Waiting on my own trade offer.
  if (view.trade && view.trade.from === p) {
    const acc = Object.entries(view.trade.responses).find(([, r]) => r === 'accept');
    if (acc) return { type: 'acceptTrade', player: p, with: +acc[0] };
    const g0 = goal(view, p);
    const c0 = COSTS[g0] || COSTS.dev;
    const ctr = Object.entries(view.trade.responses).find(([, r]) => r && typeof r === 'object'
      && canAfford(hand, r.give)
      && Object.entries(r.get).some(([k]) => (c0[k] || 0) > hand[k])
      && Object.entries(r.give).every(([k, n]) => hand[k] - n >= (c0[k] || 0) - 0)
      && publicVP(view, +ctr0(r, view)) < view.config.vpTarget - 2);
    if (ctr) return { type: 'acceptTrade', player: p, with: +ctr[0] };
    return { type: 'cancelTrade', player: p };
  }

  // Development cards.
  if (playable('knight') && (robberOnMe || (pl.knightsPlayed >= 2 && view.largestArmy !== p))) return { type: 'playDev', player: p, card: 'knight' };
  const g = goal(view, p);
  const cost = COSTS[g] || COSTS.dev;
  if (playable('yearOfPlenty')) {
    const n = needs(hand, cost);
    const want = [];
    for (const [k, v] of Object.entries(n)) for (let i = 0; i < v; i++) want.push(k);
    for (const r of RESOURCES) if (want.length < 2) want.push(r === 'ore' ? 'ore' : 'grain');
    const picks = want.slice(0, 2).filter((r) => view.bank[r] > 0);
    const bankTotal = handTotal(view.bank);
    const n2 = Math.min(2, bankTotal);
    while (picks.length < n2) picks.push(RESOURCES.find((r) => view.bank[r] > (picks.includes(r) ? 1 : 0)));
    const cnt = {};
    for (const r of picks) cnt[r] = (cnt[r] || 0) + 1;
    if (picks.length === n2 && canAfford(view.bank, cnt)) return { type: 'playDev', player: p, card: 'yearOfPlenty', resources: picks };
  }
  if (playable('monopoly')) {
    // Guess which resource others hold most of from what they've been seen to receive is hard; use board production.
    const prodAll = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
    for (const o of view.players) if (o.id !== p) { const pr = myProduction(view, o.id); for (const r of RESOURCES) prodAll[r] += pr[r]; }
    const r = pickBest(RESOURCES, (x) => prodAll[x] * ((cost[x] || 0) > hand[x] ? 1.5 : 1));
    const othersCards = view.hidden.handCounts.reduce((a, b, i) => a + (i === p ? 0 : b), 0);
    if (othersCards >= 6) return { type: 'playDev', player: p, card: 'monopoly', resource: r };
  }
  if (playable('roadBuilding') && pl.roadsLeft >= 1) {
    if (roadTowards(view, p, settlementTargets(view, p)) !== null) return { type: 'playDev', player: p, card: 'roadBuilding' };
  }

  // Build.
  if (level === 'hard' && pl.settlementsLeft > 2 && canAfford(hand, COSTS.settlement)) {
    const spots = legalSettlementSpots(view, p);
    if (spots.length) return { type: 'buildSettlement', player: p, vertex: pickBest(spots, (v) => scoreVertex(view, p, v, weights, rng, level)) };
  }
  if (pl.citiesLeft > 0 && canAfford(hand, COSTS.city)) {
    const spots = legalCitySpots(view, p);
    if (spots.length) return { type: 'buildCity', player: p, vertex: pickBest(spots, (v) => scoreVertex(view, p, v, weights, rng, level)) };
  }
  if (pl.settlementsLeft > 0 && canAfford(hand, COSTS.settlement)) {
    const spots = legalSettlementSpots(view, p);
    if (spots.length) return { type: 'buildSettlement', player: p, vertex: pickBest(spots, (v) => scoreVertex(view, p, v, weights, rng, level)) };
  }
  const settleSpots = legalSettlementSpots(view, p);
  const wantRoad = pl.roadsLeft > 0 && canAfford(hand, COSTS.road) && (settleSpots.length === 0 || (pl.settlementsLeft === 0 ? false : rng() < 0.15));
  if (wantRoad && pl.settlementsLeft > 0 && !(g === 'city' && !canAfford(hand, { ...COSTS.road, ...{ grain: 2, ore: 3 } }) && hand.ore + hand.grain >= 4)) {
    const e = roadTowards(view, p, settlementTargets(view, p), L.plan ? (v) => scoreVertex(view, p, v, weights, () => 0.5, level) : null);
    if (e !== null) return { type: 'buildRoad', player: p, edge: e };
  }
  if (view.devDeckCount > 0 && canAfford(hand, COSTS.dev) && (g === 'dev' || g === 'city' && hand.ore >= 1 && hand.wool >= 1 && rng() < 0.5 || handTotal(hand) >= 7)) {
    if (g !== 'city' || !canAfford(hand, COSTS.city)) return { type: 'buyDev', player: p };
  }
  // Late game: if nothing else to do with roads, build towards longest road.
  if (pl.roadsLeft > 0 && canAfford(hand, COSTS.road) && handTotal(hand) >= 6 && L.plan) {
    const legal = legalRoadSpots(view, p);
    const before = longestRoadFor(view, p);
    const best = pickBest(legal, (e) => { view.roads[e] = p; const l = longestRoadFor(view, p); delete view.roads[e]; return l + rng() * 0.1; });
    if (best !== null) {
      view.roads[best] = p; const after = longestRoadFor(view, p); delete view.roads[best];
      if (after > before) return { type: 'buildRoad', player: p, edge: best };
    }
  }

  // Trade with the bank towards the goal.
  const n = needs(hand, cost);
  const ratios = harbourRatios(view, p);
  const wanted = Object.keys(n);
  if (wanted.length) {
    for (const r of RESOURCES) {
      const spare = hand[r] - (cost[r] || 0);
      if (spare >= ratios[r] && !wanted.includes(r)) {
        const get = wanted.find((w) => view.bank[w] > 0);
        if (get) return { type: 'bankTrade', player: p, give: r, get };
      }
    }
    // Offer a 1:1 trade to the other players, once per turn.
    const missingCount = Object.values(n).reduce((x, y) => x + y, 0);
    if (L.trade && !view.offersThisTurn && missingCount <= 2) {
      const give = RESOURCES.find((r) => hand[r] - (cost[r] || 0) >= 1 && !wanted.includes(r));
      if (give) {
        return { type: 'offerTrade', player: p, give: { [give]: 1 }, get: { [wanted[0]]: 1 } };
      }
    }
  }
  // Hard: don't end the turn holding more than 7 cards if a bank trade can shed one usefully.
  if (level === 'hard' && handTotal(hand) > 7) {
    for (const r of RESOURCES.slice().sort((x, y) => hand[y] - hand[x])) {
      if (hand[r] >= ratios[r]) {
        const get = RESOURCES.filter((w) => w !== r && view.bank[w] > 0).sort((x, y) => ((cost[y] || 0) - hand[y]) - ((cost[x] || 0) - hand[x]))[0];
        if (get) return { type: 'bankTrade', player: p, give: r, get };
      }
    }
  }
  return { type: 'endTurn', player: p };
}
