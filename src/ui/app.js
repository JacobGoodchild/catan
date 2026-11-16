// Game controller: owns the engine state, runs the computer players, renders the interface.
import {
  newGame, step, actorsNeeded, legalSettlementSpots, legalRoadSpots, legalCitySpots, canAfford, COSTS,
  RESOURCES, handTotal, harbourRatios, victoryPoints, COLOURS, legalRobberHexes,
} from '../engine/rules.js';
import { botAction, publicVP } from '../engine/bots.js';
import { cryptoRandom, cryptoDie } from '../engine/rng.js';
import { GEO } from '../engine/geometry.js';
import { createBoard3D, pieceIcon, pieceImage, assetsReady } from './board3d.js';
import { PLAYER_COLOURS } from './art.js';
import { resourceCard, miniRes, devCard, cardBack, buildingCostsCard, specialCard, RES_NAME, DEV_INFO } from './cards.js';
import { rollDice, preloadDice } from './dice.js';
import { sound } from './sound.js';

const $ = (s) => document.querySelector(s);
await assetsReady;
let board;
try { board = createBoard3D($('#board')); } catch (e) {
  console.error(e);
  $('#board').innerHTML = '<p class="no-gl">This game needs WebGL to draw the board. Try another browser or switch on hardware acceleration.</p>';
  board = { render() {}, setTargets() {}, glowHexes() {}, screenPos() { return [innerWidth / 2, innerHeight / 2]; } };
}
const AUTO = new URLSearchParams(location.search).has('auto');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Settings ----------
const DEFAULTS = { opponents: 3, difficulty: 'normal', speed: 'normal', board: 'beginner', vpTarget: 10, sound: true, friendlyRobber: false };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('catan.settings') || '{}') }; } catch { return { ...DEFAULTS }; }
}
function saveSettings() { try { localStorage.setItem('catan.settings', JSON.stringify(settings)); } catch { /* ignore */ } }
let settings = loadSettings();
const SPEED = { slow: 1.6, normal: 1, fast: 0.45 };
const wait = (ms) => (reduceMotion ? ms * 0.5 : ms) * SPEED[settings.speed];

// ---------- Game state ----------
let game = null;
let human = 0;
let logLines = [];
let mode = null; // 'road' | 'settlement' | 'city' while choosing a spot
let botTimer = null;
let busy = false; // an animation the game should wait for (dice)
let tradeDraft = null;
let lastHand = null;

const nameOf = (p) => (p === human ? 'You' : game.players[p].name);
const subj = (p) => nameOf(p);
const possessive = (p) => (p === human ? 'Your' : `${game.players[p].name}’s`);

function startGame() {
  clearTimeout(botTimer);
  const n = 1 + Number(settings.opponents);
  human = Math.floor(cryptoRandom() * n);
  const others = ['blue', 'white', 'orange'].slice(0, n - 1);
  const colours = [];
  let k = 0;
  for (let i = 0; i < n; i++) colours.push(i === human ? 'red' : others[k++]);
  const names = colours.map((c) => c[0].toUpperCase() + c.slice(1));
  game = newGame({ numPlayers: n, board: settings.board, vpTarget: Number(settings.vpTarget) || 10, colours, names, friendlyRobber: settings.friendlyRobber }, cryptoRandom);
  game.levels = colours.map(() => settings.difficulty);
  logLines = [];
  mode = null;
  tradeDraft = null;
  lastHand = null;
  addLog(`New game. ${n} players, ${game.config.vpTarget} points to win.`);
  if (game.phase === 'roll') addLog(`Starting positions from the beginner set-up. ${nameOf(game.current)} ${game.current === human ? 'start' : 'starts'}.`);
  else addLog(`${nameOf(game.current)} ${game.current === human ? 'place' : 'places'} first.`);
  advance();
}

function save() {
  if (AUTO) return;
  try {
    if (!game || game.phase === 'gameOver') localStorage.removeItem('catan.save');
    else localStorage.setItem('catan.save', JSON.stringify({ game, human, logLines }));
  } catch { /* ignore */ }
}
function resume() {
  try {
    const s = JSON.parse(localStorage.getItem('catan.save') || 'null');
    if (s && s.game && s.game.v === 1) { game = s.game; human = s.human; logLines = s.logLines || []; return true; }
  } catch { /* ignore */ }
  return false;
}

// ---------- Log ----------
function addLog(text, cls = '') {
  logLines.push({ text, cls });
  if (logLines.length > 400) logLines.shift();
  const li = document.createElement('li');
  li.textContent = text;
  if (cls) li.className = cls;
  const ol = $('#log');
  ol.appendChild(li);
  ol.scrollTop = ol.scrollHeight;
  if (cls !== 'turn' && cls !== 'hint') setTicker(text);
}
let tickerT;
function setTicker(text) {
  const el = $('#ticker');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(tickerT);
  tickerT = setTimeout(() => el.classList.remove('show'), 5000);
}
function renderLog() {
  const ol = $('#log');
  ol.innerHTML = '';
  for (const l of logLines) { const li = document.createElement('li'); li.textContent = l.text; if (l.cls) li.className = l.cls; ol.appendChild(li); }
  ol.scrollTop = ol.scrollHeight;
}
const cardsText = (cards) => Object.entries(cards).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${r}`).join(', ');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- Acting ----------
function act(action) {
  const res = step(game, action, cryptoRandom);
  if (!res.ok) { flashStatus(res.error); return false; }
  handleEvents(res.events);
  advance();
  return true;
}

function handleEvents(events) {
  const gains = {};
  for (const e of events) {
    switch (e.type) {
      case 'roll': addLog(`${subj(e.player)} rolled ${e.total}.`, 'roll'); break;
      case 'production':
        board.glowHexes(e.hexes, e.blocked);
        if (e.blocked.length) addLog('The robber blocks production.');
        break;
      case 'gain':
        if (e.reason === 'production' || e.reason === 'setup') {
          gains[e.player] = gains[e.player] || {};
          for (const [r, n] of Object.entries(e.cards)) gains[e.player][r] = (gains[e.player][r] || 0) + n;
          flyGain(e);
        } else if (e.reason === 'yearOfPlenty') {
          addLog(`${subj(e.player)} took ${cardsText(e.cards)} from the bank.`);
          flyGain(e);
        }
        break;
      case 'shortage':
        addLog(e.partial ? `The bank is short of ${e.resource}. ${subj(e.players[0])} took what was left.` : `The bank is short of ${e.resource}. No one receives ${e.resource}.`);
        break;
      case 'pay': flyPay(e); break;
      case 'build': {
        const what = e.piece === 'city' ? 'a city' : e.piece === 'road' ? 'a road' : 'a settlement';
        addLog(`${subj(e.player)} built ${what}.`);
        sound.play(e.piece === 'road' ? 'road' : 'piece');
        break;
      }
      case 'buyDev':
        addLog(e.player === human ? `You bought a development card: ${DEV_INFO[e.card].title}.` : `${subj(e.player)} bought a development card.`);
        flyDev(e.player, e.player === human ? e.card : null);
        sound.play('card');
        break;
      case 'playDev': {
        const t = DEV_INFO[e.card].title;
        addLog(`${subj(e.player)} played ${t === 'Knight' ? 'a Knight' : t}${e.resource ? ` on ${e.resource}` : ''}.`, 'dev');
        showPlayedCard(e.card);
        break;
      }
      case 'transfer': addLog(`${subj(e.to)} took ${cardsText(e.cards)} from ${e.from === human ? 'you' : nameOf(e.from)}.`); flyBetween(e.from, e.to, Object.keys(e.cards)[0], true); break;
      case 'robber': addLog(`${subj(e.player)} moved the robber.`); sound.play('piece'); break;
      case 'robberPhase': if (e.player === human) addLog('Move the robber.', 'hint'); break;
      case 'steal': {
        const thief = e.player, victim = e.victim;
        if (e.resource === null) addLog(`${subj(thief)} had nothing to steal from ${victim === human ? 'you' : nameOf(victim)}.`);
        else if (thief === human) addLog(`You stole ${e.resource} from ${nameOf(victim)}.`);
        else if (victim === human) addLog(`${subj(thief)} stole ${e.resource} from you.`);
        else addLog(`${subj(thief)} stole a card from ${nameOf(victim)}.`);
        if (e.resource) flyBetween(victim, thief, e.resource, thief === human || victim === human);
        break;
      }
      case 'discardPhase':
        if (e.pending[human]) addLog(`You must discard ${e.pending[human]} cards.`, 'hint');
        break;
      case 'discard': addLog(`${subj(e.player)} discarded ${plural(e.count, 'card')}.`); break;
      case 'bankTrade': addLog(`${subj(e.player)} traded ${cardsText(e.give)} for ${cardsText(e.get)} ${e.ratio < 4 ? 'at a harbour' : 'with the bank'}.`); sound.play('card'); break;
      case 'offerTrade': addLog(`${subj(e.player)} ${e.player === human ? 'offer' : 'offers'} ${cardsText(e.give)} for ${cardsText(e.get)}.`); break;
      case 'respondTrade':
        if (e.player !== human && e.response !== 'reject') addLog(`${subj(e.player)} ${e.response === 'accept' ? 'accepts' : `counters: ${cardsText(e.response.get)} for ${cardsText(e.response.give)}`}.`);
        break;
      case 'trade': addLog(`${subj(e.player)} traded ${cardsText(e.give)} for ${cardsText(e.get)} with ${e.with === human ? 'you' : nameOf(e.with)}.`); sound.play('card'); break;
      case 'cancelTrade': addLog('No trade.'); break;
      case 'longestRoad': flySpecial('longestRoad', e.from, e.to); addLog(e.to === null ? 'Longest Road is set aside.' : `${subj(e.to)} ${e.to === human ? 'take' : 'takes'} Longest Road.`, 'special'); break;
      case 'largestArmy': flySpecial('largestArmy', e.from, e.to); addLog(`${subj(e.to)} ${e.to === human ? 'take' : 'takes'} Largest Army.`, 'special'); break;
      case 'turn': addLog(`${possessive(e.player)} turn.`, 'turn'); if (e.player === human) { sound.play('turn'); flash('Your turn'); } break;
      case 'win': addLog(`${subj(e.player)} ${e.player === human ? 'win' : 'wins'} with ${e.vp} points.`, 'win'); break;
    }
  }
  for (const [p, cards] of Object.entries(gains)) addLog(`${subj(+p)} ${+p === human ? 'receive' : 'receives'} ${cardsText(cards)}.`);
}

// ---------- Main loop ----------
function advance() {
  render();
  save();
  clearTimeout(botTimer);
  if (game.phase === 'gameOver') { if (!AUTO) showGameOver(); return; }
  if (busy || !home.hidden) return;
  const actors = actorsNeeded(game);
  const bot = actors.find((p) => AUTO || p !== human);
  if (bot !== undefined) {
    const a = botAction(game, bot, cryptoRandom, game.levels[bot]);
    const delay = botDelay(a);
    botTimer = setTimeout(() => runBot(bot, a), delay);
  }
}

function botDelay(a) {
  if (!a) return 0;
  const base = { roll: 500, buildSettlement: 800, buildRoad: 650, buildCity: 800, buyDev: 700, moveRobber: 900, steal: 600, discard: 400,
    respondTrade: 650, offerTrade: 900, acceptTrade: 600, cancelTrade: 500, bankTrade: 700, playDev: 900, endTurn: 650 }[a.type] || 500;
  return wait(base);
}

async function runBot(p, a) {
  if (!a) return;
  if (a.type === 'roll') {
    a.dice = [cryptoDie(), cryptoDie()];
    busy = true;
    await rollDice(a.dice, { speed: SPEED[settings.speed], sound: settings.sound });
    busy = false;
  }
  if (!act(a)) {
    // Should not happen; fall back so the game never stalls.
    console.warn('Bot action rejected', a, game.phase);
    const fb = game.phase === 'main' ? { type: 'endTurn', player: p } : botAction(game, p, cryptoRandom, 'easy');
    act(fb);
  }
}

async function humanRoll() {
  if (busy) return;
  const dice = [cryptoDie(), cryptoDie()];
  busy = true;
  render();
  await rollDice(dice, { speed: SPEED[settings.speed], sound: settings.sound });
  busy = false;
  act({ type: 'roll', player: human, dice });
}

// ---------- Rendering ----------
function render() {
  board.render(game);
  renderStatus();
  renderPlayers();
  renderBank();
  renderHand();
  renderActions();
  renderTargets();
  renderPrompt();
  $('#bc').innerHTML = buildingCostsCard(game.players[human].colour);
  markBuildable();
}

const PHASE_TEXT = {
  setupSettlement: 'Place a settlement', setupRoad: 'Place a road', roll: 'Roll the dice', main: 'Trade and build',
  discard: 'Discarding', robber: 'Move the robber', steal: 'Choose who to rob', roadBuilding: 'Place free roads', gameOver: 'Game over',
};
function renderStatus() {
  const p = game.current;
  const c = PLAYER_COLOURS[game.players[p].colour];
  const mine = p === human;
  const over = game.phase === 'gameOver';
  const who = over ? `${nameOf(game.winner)} ${game.winner === human ? 'win' : 'wins'}` : mine ? 'Your turn' : `${game.players[p].name}’s turn`;
  let phase = over ? 'Game over' : PHASE_TEXT[game.phase];
  if (!over && game.phase === 'discard') phase = game.pendingDiscards[human] ? 'Discard half your cards' : 'Waiting for discards';
  if (!over && !mine && game.phase === 'main') phase = 'Trading and building';
  if (!over && !mine && game.phase === 'roll') phase = 'Rolling';
  if (!over && mine) {
    if (game.phase === 'setupSettlement') phase = 'Place a settlement on a white dot';
    else if (game.phase === 'setupRoad') phase = 'Place a road next to it';
    else if (game.phase === 'robber') phase = 'Move the robber to another hex';
    else if (game.phase === 'steal') phase = 'Choose who to rob';
    else if (game.phase === 'roadBuilding') phase = `Place a free road (${game.freeRoads} left)`;
    else if (game.phase === 'main' && mode) phase = `Choose where to build your ${mode}`;
    else if (game.phase === 'main') phase = 'Trade, build, or end your turn';
  }
  const el = $('#status');
  el.className = `banner ${mine && !over ? 'mine' : ''}`;
  el.style.setProperty('--pc', c.base);
  el.style.setProperty('--pcd', c.dark);
  el.style.setProperty('--pct', game.players[p].colour === 'white' ? '#2b241c' : '#fff');
  el.innerHTML = `<span class="b-who">${who}</span><span class="b-phase">${phase}</span>${game.dice && game.phase !== 'roll' ? diceMini(game.dice) : ''}`;
}
function diceMini(d) {
  const face = (n, cls) => `<span class="die-mini ${cls}">${n}</span>`;
  return `<span class="dice-mini">${face(d[0], 'red')}${face(d[1], 'yellow')}<span class="dice-sum">${d[0] + d[1]}</span></span>`;
}
let flashT;
function flashStatus(msg) {
  const el = $('#prompt');
  el.hidden = false;
  el.innerHTML = `<span class="error">${msg}</span>`;
  clearTimeout(flashT);
  flashT = setTimeout(renderPrompt, 1600);
}

function renderPlayers() {
  const order = game.players.map((p) => p.id);
  $('#players').innerHTML = order.map((id) => {
    const pl = game.players[id];
    const c = PLAYER_COLOURS[pl.colour];
    const isMe = id === human;
    const vp = isMe ? victoryPoints(game, id) : publicVP(game, id);
    const cards = handTotal(game.hidden.hands[id]);
    const devs = game.hidden.dev[id].length;
    const active = id === game.current && game.phase !== 'gameOver';
    return `<div class="player panel ${active ? 'active' : ''} ${isMe ? 'me' : ''}" data-player="${id}" style="--pc:${c.base};--pcd:${c.dark};--pct:${pl.colour === 'white' ? '#2b241c' : '#fff'}">
      <div class="p-head"><img class="p-icon" src="${pieceImage('settlement', pl.colour)}" alt="">
        <span class="p-name">${isMe ? 'You' : pl.name}${active ? '<span class="p-turn">Playing</span>' : ''}</span>
        <span class="p-vp" title="Victory points${isMe ? ' (including hidden cards)' : ' (visible)'}">${vp}<small>/${game.config.vpTarget}</small></span></div>
      <div class="p-stats">
        <span title="Resource cards" class="${cards > 7 ? 'over7' : ''}"><b>${cards}</b>Cards</span>
        <span title="Development cards"><b>${devs}</b>Dev</span>
        <span title="Knights played"><b>${pl.knightsPlayed}</b>Knights</span>
        <span title="Longest road"><b>${pl.roadLength}</b>Road</span>
      </div>
      <div class="p-special">${game.longestRoad === id ? specialCard('longestRoad') : ''}${game.largestArmy === id ? specialCard('largestArmy') : ''}</div>
    </div>`;
  }).join('');
}

function renderBank() {
  const b = game.bank;
  $('#bank').innerHTML = `<div class="panel-title">Bank</div><div class="bank-row">
    ${RESOURCES.map((r) => `<div class="bank-stack" data-bank="${r}" title="${RES_NAME[r]}: ${b[r]} left">${miniRes(r)}<span>${b[r]}</span></div>`).join('')}
    <div class="bank-stack dev" data-bank="dev" title="Development cards: ${game.devDeckCount} left">${cardBack('dev')}<span>${game.devDeckCount}</span></div>
    </div>
    <div class="bank-special">${game.longestRoad === null ? specialCard('longestRoad') : ''}${game.largestArmy === null ? specialCard('largestArmy') : ''}</div>`;
}

function renderHand() {
  const hand = game.hidden.hands[human];
  const devs = game.hidden.dev[human];
  let html = '<div class="res-group">';
  for (const r of RESOURCES) {
    const n = hand[r];
    const prev = lastHand ? lastHand[r] : n;
    if (!n) continue;
    const shown = Math.min(n, 4);
    let stack = '';
    for (let i = 0; i < shown; i++) stack += `<div class="stack-card" style="--i:${i}">${resourceCard(r)}</div>`;
    html += `<div class="hand-stack ${n > prev ? 'grew' : ''}" data-res="${r}" style="--n:${shown}">${stack}<span class="count">${n}</span></div>`;
  }
  if (!handTotal(hand)) html += '<div class="hand-empty">No resource cards</div>';
  html += '</div><div class="dev-group">';
  const canPlay = (c) => c.type !== 'vp' && c.turn < game.turn && !game.devPlayedThisTurn && game.current === human
    && (game.phase === 'main' || (game.phase === 'roll' && c.type === 'knight')) && !busy;
  devs.forEach((c, i) => {
    html += `<button class="dev-slot ${canPlay(c) ? 'playable' : ''} ${c.turn === game.turn ? 'new' : ''}" data-play="${c.type}" ${canPlay(c) ? '' : 'disabled'} title="${DEV_INFO[c.type].title}${c.type === 'vp' ? ' (counts automatically)' : c.turn === game.turn ? ' (bought this turn)' : ''}">${devCard(c.type, { index: i })}</button>`;
  });
  html += '</div>';
  const handEl = $('#hand');
  handEl.innerHTML = html;
  // Shrink the cards rather than let a big hand run under the buttons.
  let z = 1.4;
  handEl.style.setProperty('--hz', z);
  while (z > 0.55 && handEl.scrollWidth > handEl.clientWidth + 1) { z -= 0.08; handEl.style.setProperty('--hz', z.toFixed(2)); }
  lastHand = { ...hand };
}

function renderActions() {
  const me = game.current === human && game.phase !== 'gameOver';
  const main = me && game.phase === 'main' && !game.trade && !busy;
  const hand = game.hidden.hands[human];
  const pl = game.players[human];
  const keys = { roll: 'R', end: 'E', trade: 'T', dev: 'D' };
  const btn = (id, label, enabled, extra = '') => `<button class="button ${extra} ${mode === id ? 'pressed' : ''}" data-act="${id}" ${enabled ? '' : 'disabled'}${keys[id] ? ` title="${label.replace(/<[^>]+>/g, ' ').replace(/Dev card/, '').trim()} (${keys[id]})"` : ''}>${label}</button>`;
  const can = {
    roll: me && game.phase === 'roll' && !busy,
    road: main && pl.roadsLeft > 0 && canAfford(hand, COSTS.road) && legalRoadSpots(game, human).length > 0,
    settlement: main && pl.settlementsLeft > 0 && canAfford(hand, COSTS.settlement) && legalSettlementSpots(game, human).length > 0,
    city: main && pl.citiesLeft > 0 && canAfford(hand, COSTS.city) && legalCitySpots(game, human).length > 0,
    dev: main && game.devDeckCount > 0 && canAfford(hand, COSTS.dev),
    trade: main && handTotal(hand) > 0,
    end: main,
  };
  const col = pl.colour;
  const tile = (id, label, enabled, icon) => `<button class="tile ${mode === id ? 'pressed' : ''}" data-act="${id}" ${enabled ? '' : 'disabled'} title="${label}${keys[id] ? ` (${keys[id]})` : ''}">${icon}<span>${label}</span></button>`;
  const tradeIcon = '<svg viewBox="0 0 36 36" class="piece-icon"><path d="M6 13h20l-5-5M30 23H10l5 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const rollPhase = me && game.phase === 'roll';
  $('#actions').innerHTML = `<div class="tiles">${[
    tile('road', 'Road', can.road, pieceIcon('road', col)),
    tile('settlement', 'Settlement', can.settlement, pieceIcon('settlement', col)),
    tile('city', 'City', can.city, pieceIcon('city', col)),
    tile('dev', 'Dev card', can.dev, pieceIcon('dev', col)),
    tile('trade', 'Trade', can.trade, tradeIcon),
  ].join('')}</div>${rollPhase
    ? `<button class="button primary main-act" data-act="roll" ${can.roll ? '' : 'disabled'} title="Roll dice (R)">Roll dice</button>`
    : `<button class="button primary main-act" data-act="end" ${can.end ? '' : 'disabled'} title="End turn (E)">End turn</button>`}`;
  $('#supply').innerHTML = `<div class="panel-title">Your pieces left</div><div class="supply-row">
    <span title="Roads left">${pieceIcon('road', col)}<b>${pl.roadsLeft}</b></span><span title="Settlements left">${pieceIcon('settlement', col)}<b>${pl.settlementsLeft}</b></span><span title="Cities left">${pieceIcon('city', col)}<b>${pl.citiesLeft}</b></span></div>`;
}

function markBuildable() {
  const hand = game.hidden.hands[human];
  for (const row of document.querySelectorAll('.bc-row')) {
    const k = row.dataset.build;
    row.classList.toggle('affordable', canAfford(hand, COSTS[k]));
  }
}

function renderTargets() {
  const me = game.current === human;
  if (!me || busy || game.phase === 'gameOver') { board.setTargets(null); return; }
  const ph = game.phase;
  if (ph === 'setupSettlement') return board.setTargets({ vertices: legalSettlementSpots(game, human) }, ({ vertex }) => act({ type: 'buildSettlement', player: human, vertex }));
  if (ph === 'setupRoad' || ph === 'roadBuilding') return board.setTargets({ edges: legalRoadSpots(game, human) }, ({ edge }) => act({ type: 'buildRoad', player: human, edge }));
  if (ph === 'robber') return board.setTargets({ hexes: legalRobberHexes(game, human) }, ({ hex }) => act({ type: 'moveRobber', player: human, hex }));
  if (ph === 'steal') {
    const vs = GEO.hexes[game.board.robber].corners.filter((v) => game.buildings[v] && game.stealCandidates.includes(game.buildings[v].player));
    return board.setTargets({ vertices: vs }, ({ vertex }) => act({ type: 'steal', player: human, victim: game.buildings[vertex].player }));
  }
  if (ph === 'main' && mode) {
    if (mode === 'road') return board.setTargets({ edges: legalRoadSpots(game, human) }, ({ edge }) => { mode = null; act({ type: 'buildRoad', player: human, edge }); });
    if (mode === 'settlement') return board.setTargets({ vertices: legalSettlementSpots(game, human) }, ({ vertex }) => { mode = null; act({ type: 'buildSettlement', player: human, vertex }); });
    if (mode === 'city') return board.setTargets({ vertices: legalCitySpots(game, human) }, ({ vertex }) => { mode = null; act({ type: 'buildCity', player: human, vertex }); });
  }
  board.setTargets(null);
}

function renderPrompt() {
  const el = $('#prompt');
  const me = game.current === human;
  let html = '';
  if (AUTO) { /* the bot plays this seat */ }
  else if (game.phase === 'discard' && game.pendingDiscards[human]) { openDiscard(); }
  else if (me && game.phase === 'roll' && !busy) html = '<button class="button primary cta" data-roll>Roll the dice</button>';
  else if (me && game.phase === 'steal') {
    html = `Steal from: ${game.stealCandidates.map((p) => `<button class="button small" data-steal="${p}">${nameOf(p)} (${plural(handTotal(game.hidden.hands[p]), 'card')})</button>`).join(' ')}`;
  }
  else if (game.phase === 'discard') html = 'Waiting for discards.';
  else if (game.trade && game.trade.from === human) html = tradeStatusHtml();
  else if (game.trade && game.trade.responses[human] === undefined && game.phase !== 'gameOver') {
    const t = game.trade;
    const canAcc = canAfford(game.hidden.hands[human], t.get);
    html = `${game.players[t.from].name} offers ${cardsText(t.give)} for your ${cardsText(t.get)}.
      <button class="button small primary" data-in-accept ${canAcc ? '' : 'disabled'}>Accept</button>
      <button class="button small" data-in-reject>Decline</button>
      <button class="button small" data-in-counter>Counter-offer</button>`;
  }
  el.hidden = !html;
  el.innerHTML = html;
}

// ---------- Card animations ----------
function centreOf(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
function flyCard(html, from, to, { delay = 0, duration = 650 } = {}) {
  if (reduceMotion || !from || !to) return;
  const fx = $('#fx');
  const el = document.createElement('div');
  el.className = 'flying';
  el.innerHTML = html;
  el.style.left = `${from[0]}px`; el.style.top = `${from[1]}px`;
  fx.appendChild(el);
  const d = duration * SPEED[settings.speed];
  el.animate([
    { transform: 'translate(-50%,-50%) scale(0.7)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.15 },
    { transform: `translate(calc(-50% + ${to[0] - from[0]}px), calc(-50% + ${to[1] - from[1]}px)) scale(0.85)`, opacity: 1 },
  ], { duration: d, delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).onfinish = () => el.remove();
}
function playerTarget(p) {
  if (p === human) return null;
  const el = document.querySelector(`.player[data-player="${p}"] .p-stats`);
  return el ? centreOf(el) : null;
}
function handTarget(res) {
  const el = document.querySelector(`.hand-stack[data-res="${res}"]`) || $('#hand');
  return centreOf(el);
}
function flyGain(e) {
  let i = 0;
  const srcs = e.sources && e.sources.length ? e.sources : null;
  for (const [r, n] of Object.entries(e.cards)) {
    for (let k = 0; k < n; k++) {
      const src = srcs ? srcs.find((s) => s.resource === r) : null;
      const from = src ? board.screenPos('hex', src.hex) : centreOf(document.querySelector(`[data-bank="${r}"]`));
      const to = e.player === human ? handTarget(r) : playerTarget(e.player);
      flyCard(e.player === human ? resourceCard(r) : cardBack(), from, to, { delay: 120 * i++ });
    }
  }
  if (i) sound.play('card');
}
function flyPay(e) {
  if (e.player !== human) {
    let i = 0;
    for (const [r, n] of Object.entries(e.cards)) for (let k = 0; k < n; k++) flyCard(resourceCard(r), playerTarget(e.player), centreOf(document.querySelector(`[data-bank="${r}"]`)), { delay: 80 * i++, duration: 550 });
    return;
  }
  let i = 0;
  for (const [r, n] of Object.entries(e.cards)) for (let k = 0; k < n; k++) flyCard(resourceCard(r), handTarget(r), centreOf(document.querySelector(`[data-bank="${r}"]`)), { delay: 80 * i++, duration: 550 });
}
function flyDev(p, card) {
  const from = centreOf(document.querySelector('[data-bank="dev"]'));
  const to = p === human ? centreOf($('.dev-group') || $('#hand')) : playerTarget(p);
  flyCard(card ? devCard(card) : cardBack('dev'), from, to, { duration: 750 });
}
function flyBetween(from, to, res, faceUp) {
  const a = from === human ? handTarget(res) : playerTarget(from);
  const b = to === human ? handTarget(res) : playerTarget(to);
  flyCard(faceUp ? resourceCard(res) : cardBack(), a, b, { duration: 800 });
}
function flySpecial(kind, from, to) {
  const at = (p) => {
    if (p === null) return centreOf($('#bank'));
    const el = document.querySelector(`.player[data-player="${p}"]`);
    return el ? centreOf(el) : null;
  };
  flyCard(specialCard(kind), at(from), at(to), { duration: 1000 });
}
function showPlayedCard(type) {
  if (reduceMotion) return;
  const el = document.createElement('div');
  el.className = 'played-card';
  el.innerHTML = devCard(type);
  $('#fx').appendChild(el);
  sound.play('card');
  setTimeout(() => el.remove(), 1500 * SPEED[settings.speed]);
}

function flash(text) {
  if (AUTO) return;
  const el = document.createElement('div');
  el.className = 'flash';
  el.textContent = text;
  $('.board-area').appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ---------- Dialogs ----------
const dlg = $('#dlg');
function openDialog(html, onClick) {
  dlg.innerHTML = html;
  dlg.onclick = onClick;
  if (!dlg.open) dlg.showModal();
}
function closeDialog() { if (dlg.open) dlg.close(); dlg.onclick = null; }
dlg.addEventListener('cancel', (e) => { if (dlg.dataset.locked) e.preventDefault(); });

function stepper(prefix, r, val, max) {
  return `<div class="stepper" data-res="${r}">${resourceCard(r)}<div class="step-ctl"><button class="icon-button small" data-${prefix}-minus="${r}" ${val <= 0 ? 'disabled' : ''} aria-label="Less ${r}">−</button><span>${val}</span><button class="icon-button small" data-${prefix}-plus="${r}" ${val >= max ? 'disabled' : ''} aria-label="More ${r}">+</button></div></div>`;
}

let discardSel = null;
function openDiscard() {
  const need = game.pendingDiscards[human];
  if (!discardSel) discardSel = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
  const hand = game.hidden.hands[human];
  const chosen = handTotal(discardSel);
  dlg.dataset.locked = '1';
  openDialog(`<div class="dialog-head"><h2>Discard ${need} cards</h2></div>
    <div class="steppers">${RESOURCES.filter((r) => hand[r] > 0).map((r) => stepper('d', r, discardSel[r], hand[r])).join('')}</div>
    <div class="dialog-foot"><span>${chosen} of ${need} chosen</span><button class="button primary" data-discard ${chosen === need ? '' : 'disabled'}>Discard</button></div>`, (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.dPlus) { if (handTotal(discardSel) < need) discardSel[t.dataset.dPlus]++; openDiscard(); }
    else if (t.dataset.dMinus) { discardSel[t.dataset.dMinus]--; openDiscard(); }
    else if (t.dataset.discard !== undefined) {
      const cards = Object.fromEntries(Object.entries(discardSel).filter(([, n]) => n > 0));
      discardSel = null; delete dlg.dataset.locked; closeDialog();
      act({ type: 'discard', player: human, cards });
    }
  });
}

function openPick(title, count, onDone) {
  const sel = [];
  const draw = () => {
    openDialog(`<div class="dialog-head"><h2>${title}</h2></div>
      <div class="pick-row">${RESOURCES.map((r) => `<button class="pick" data-pick="${r}" ${count > 1 && game.bank[r] - sel.filter((x) => x === r).length <= 0 ? 'disabled' : ''}>${resourceCard(r)}<span>${sel.filter((x) => x === r).length || ''}</span></button>`).join('')}</div>
      <div class="dialog-foot"><span>${count > 1 ? `${sel.length} of ${count} chosen` : ''}</span><button class="button" data-close>Cancel</button></div>`, (ev) => {
      const t = ev.target.closest('button');
      if (!t) return;
      if (t.dataset.close !== undefined) { closeDialog(); return; }
      if (t.dataset.pick) {
        sel.push(t.dataset.pick);
        if (sel.length >= count) { closeDialog(); onDone(sel); } else draw();
      }
    });
  };
  draw();
}

// Trade dialog: bank/harbour trades and offers to the other players.
function openTrade() {
  if (!tradeDraft) tradeDraft = { give: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 }, get: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 } };
  const hand = game.hidden.hands[human];
  const ratios = harbourRatios(game, human);
  const g = tradeDraft.give, w = tradeDraft.get;
  const validOffer = handTotal(g) > 0 && handTotal(w) > 0 && RESOURCES.every((r) => !(g[r] && w[r]));
  // Bank trades possible with the current "give" selection: exactly one type, a multiple of its ratio.
  const giveTypes = RESOURCES.filter((r) => g[r] > 0);
  const getTypes = RESOURCES.filter((r) => w[r] > 0);
  let bankOk = false, bankText = '';
  if (giveTypes.length === 1 && getTypes.length === 1 && giveTypes[0] !== getTypes[0]) {
    const r = giveTypes[0], ratio = ratios[r];
    bankOk = g[r] === ratio * w[getTypes[0]] && game.bank[getTypes[0]] >= w[getTypes[0]];
    bankText = `${ratio}:1`;
  }
  const bg = tradeDraft.bankGive;
  const bankRow = `<div class="panel-title">Bank and harbours: choose what to give, then what to take</div>
    <div class="bank-trade">
      <div class="bt-side">${RESOURCES.map((r) => `<button class="bt ${bg === r ? 'sel' : ''}" data-bg="${r}" ${hand[r] >= ratios[r] ? '' : 'disabled'} title="Give ${ratios[r]} ${r}">${resourceCard(r)}<span>${ratios[r]}:1</span></button>`).join('')}</div>
      <span class="bt-arrow">→</span>
      <div class="bt-side">${RESOURCES.map((r) => `<button class="bt" data-bget="${r}" ${bg && bg !== r && game.bank[r] > 0 ? '' : 'disabled'} title="Get 1 ${r}">${resourceCard(r)}<span>1</span></button>`).join('')}</div>
    </div>
    <div class="panel-title" style="margin-top:18px">Or make an offer to the other players</div>`;
  openDialog(`<div class="dialog-head"><h2>Trade</h2><button class="icon-button" data-close aria-label="Close">×</button></div>
    ${bankRow}
    <div class="trade-cols">
      <div><div class="panel-title">You give</div><div class="steppers">${RESOURCES.map((r) => stepper('g', r, g[r], hand[r])).join('')}</div></div>
      <div><div class="panel-title">You get</div><div class="steppers">${RESOURCES.map((r) => stepper('w', r, w[r], 19)).join('')}</div></div>
    </div>
    <div class="dialog-foot">
      <button class="button" data-clear>Clear</button>
      <span class="spacer"></span>
      <button class="button primary" data-offer ${validOffer ? '' : 'disabled'}>Offer to players</button>
    </div>`, (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.close !== undefined) { closeDialog(); return; }
    if (d.bg) { tradeDraft.bankGive = tradeDraft.bankGive === d.bg ? null : d.bg; openTrade(); return; }
    if (d.bget) {
      const give = tradeDraft.bankGive;
      tradeDraft.bankGive = null;
      act({ type: 'bankTrade', player: human, give, get: d.bget });
      if (game.current === human && game.phase === 'main' && handTotal(game.hidden.hands[human]) > 0) openTrade(); else closeDialog();
      return;
    }
    if (d.gPlus) { g[d.gPlus]++; w[d.gPlus] = 0; }
    else if (d.gMinus) g[d.gMinus]--;
    else if (d.wPlus) { w[d.wPlus]++; g[d.wPlus] = 0; }
    else if (d.wMinus) w[d.wMinus]--;
    else if (d.clear !== undefined) tradeDraft = null;
    else if (d.bank !== undefined) {
      const give = giveTypes[0], get = getTypes[0];
      const times = w[get];
      closeDialog();
      tradeDraft = null;
      for (let i = 0; i < times; i++) if (!act({ type: 'bankTrade', player: human, give, get })) break;
      return;
    } else if (d.offer !== undefined) {
      const give = Object.fromEntries(Object.entries(g).filter(([, n]) => n > 0));
      const get = Object.fromEntries(Object.entries(w).filter(([, n]) => n > 0));
      closeDialog();
      act({ type: 'offerTrade', player: human, give, get });
      return;
    }
    openTrade();
  });
}

function tradeStatusHtml() {
  const t = game.trade;
  const parts = game.players.filter((p) => p.id !== human).map((p) => {
    const r = t.responses[p.id];
    if (r === undefined) return `<span class="resp">${p.name}: thinking</span>`;
    if (r === 'reject') return `<span class="resp">${p.name}: no</span>`;
    if (r === 'accept') return `<button class="button small primary" data-accept="${p.id}">Trade with ${p.name}</button>`;
    return `<button class="button small" data-accept="${p.id}">${p.name} offers ${cardsText(r.get)} for ${cardsText(r.give)}</button>`;
  });
  return `Offer: ${cardsText(t.give)} for ${cardsText(t.get)}. ${parts.join(' ')} <button class="button small" data-cancel-trade>Cancel</button>`;
}

let incomingShown = null;
function openIncomingTrade() {
  const t = game.trade;
  const key = JSON.stringify(t.give) + JSON.stringify(t.get) + t.from;
  if (incomingShown === key && dlg.open) return;
  incomingShown = key;
  const hand = game.hidden.hands[human];
  const canAcc = canAfford(hand, t.get);
  const counter = { give: { ...t.give }, get: { ...t.get } };
  const draw = () => {
    openDialog(`<div class="dialog-head"><h2>${game.players[t.from].name} offers a trade</h2><button class="icon-button" data-x aria-label="Close">×</button></div>
      <div class="offer"><div><div class="panel-title">You get</div><div class="offer-cards">${cardsRow(t.give)}</div></div>
      <div><div class="panel-title">You give</div><div class="offer-cards">${cardsRow(t.get)}</div></div></div>
      <details class="counter" open><summary>Counter-offer</summary>
        <div class="trade-cols"><div><div class="panel-title">You give</div><div class="steppers">${RESOURCES.map((r) => stepper('cg', r, counter.get[r] || 0, hand[r])).join('')}</div></div>
        <div><div class="panel-title">You get</div><div class="steppers">${RESOURCES.map((r) => stepper('cw', r, counter.give[r] || 0, 19)).join('')}</div></div></div>
        <div class="dialog-foot"><span class="spacer"></span><button class="button" data-counter>Send counter-offer</button></div>
      </details>
      <div class="dialog-foot"><span class="spacer"></span><button class="button" data-reject>Decline</button><button class="button primary" data-acc ${canAcc ? '' : 'disabled'}>Accept</button></div>`, (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.x !== undefined) { closeDialog(); return; }
      const respond = (response) => { closeDialog(); act({ type: 'respondTrade', player: human, response }); };
      if (d.acc !== undefined) return respond('accept');
      if (d.reject !== undefined) return respond('reject');
      if (d.counter !== undefined) {
        const give = Object.fromEntries(Object.entries(counter.give).filter(([, n]) => n > 0));
        const get = Object.fromEntries(Object.entries(counter.get).filter(([, n]) => n > 0));
        const res = step(structuredClone(game), { type: 'respondTrade', player: human, response: { give, get } });
        if (!res.ok) { flashStatus(res.error); return; }
        return respond({ give, get });
      }
      if (d.cgPlus) { counter.get[d.cgPlus] = (counter.get[d.cgPlus] || 0) + 1; counter.give[d.cgPlus] = 0; }
      if (d.cgMinus) counter.get[d.cgMinus]--;
      if (d.cwPlus) { counter.give[d.cwPlus] = (counter.give[d.cwPlus] || 0) + 1; counter.get[d.cwPlus] = 0; }
      if (d.cwMinus) counter.give[d.cwMinus]--;
      draw();
    });
  };
  draw();
}
function rollChart() {
  const c = game.rollCounts;
  if (!c) return '';
  const max = Math.max(1, ...c);
  const bars = [];
  for (let n = 2; n <= 12; n++) {
    bars.push(`<div class="rc-col" title="${n}: rolled ${plural(c[n], 'time')}"><span class="rc-n">${c[n] || ''}</span><div class="rc-bar ${n === 7 ? 'seven' : ''}" style="height:${(c[n] / max) * 70}px"></div><span class="rc-label">${n}</span></div>`);
  }
  return `<div class="panel-title" style="margin-top:14px">Dice rolls</div><div class="roll-chart">${bars.join('')}</div>`;
}
function cardsRow(cards) {
  return Object.entries(cards).flatMap(([r, n]) => Array(n).fill(resourceCard(r))).join('');
}

function showGameOver() {
  const w = game.winner;
  const rows = game.players.slice().sort((a, b) => victoryPoints(game, b.id) - victoryPoints(game, a.id)).map((p) => `<tr><td><span class="swatch" style="background:${PLAYER_COLOURS[p.colour].base}"></span>${nameOf(p.id)}</td><td>${victoryPoints(game, p.id)}</td><td>${game.hidden.dev[p.id].filter((c) => c.type === 'vp').length}</td></tr>`).join('');
  setTimeout(() => openDialog(`<div class="dialog-head"><h2>${nameOf(w)} ${w === human ? 'win' : 'wins'}</h2></div>
    <table class="scores"><thead><tr><th>Player</th><th>Points</th><th>VP cards</th></tr></thead><tbody>${rows}</tbody></table>
    ${rollChart()}
    <div class="dialog-foot"><span class="spacer"></span><button class="button" data-close>Close</button><button class="button" data-menu>Main menu</button><button class="button primary" data-new>Play again</button></div>`, (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    closeDialog();
    if (b.dataset.new !== undefined) startGame();
    if (b.dataset.menu !== undefined) showHome();
  }), 900);
}

// ---------- Input ----------
$('#actions').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  sound.unlock();
  if (a === 'roll') return humanRoll();
  if (a === 'road' || a === 'settlement' || a === 'city') { mode = mode === a ? null : a; render(); return; }
  mode = null;
  if (a === 'dev') return act({ type: 'buyDev', player: human });
  if (a === 'trade') return openTrade();
  if (a === 'end') return act({ type: 'endTurn', player: human });
});
$('#bc').addEventListener('click', (ev) => {
  const row = ev.target.closest('.bc-row');
  if (!row) return;
  const btn = document.querySelector(`#actions [data-act="${row.dataset.build}"]`);
  if (btn && !btn.disabled) btn.click();
});
$('#hand').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-play]');
  if (!b || b.disabled) return;
  const card = b.dataset.play;
  mode = null;
  if (card === 'yearOfPlenty') return openPick('Year of Plenty: choose 2 resources', Math.min(2, handTotal(game.bank)), (resources) => act({ type: 'playDev', player: human, card, resources }));
  if (card === 'monopoly') return openPick('Monopoly: choose a resource', 1, ([resource]) => act({ type: 'playDev', player: human, card, resource }));
  act({ type: 'playDev', player: human, card });
});
$('#prompt').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.roll !== undefined) { sound.unlock(); humanRoll(); return; }
  if (b.dataset.steal) act({ type: 'steal', player: human, victim: +b.dataset.steal });
  if (b.dataset.cancel !== undefined) { mode = null; render(); }
  if (b.dataset.accept) act({ type: 'acceptTrade', player: human, with: +b.dataset.accept });
  if (b.dataset.cancelTrade !== undefined) act({ type: 'cancelTrade', player: human });
  if (b.dataset.inAccept !== undefined) act({ type: 'respondTrade', player: human, response: 'accept' });
  if (b.dataset.inReject !== undefined) act({ type: 'respondTrade', player: human, response: 'reject' });
  if (b.dataset.inCounter !== undefined) { incomingShown = null; openIncomingTrade(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mode) { mode = null; render(); return; }
  if (dlg.open || e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  const map = { r: 'roll', e: 'end', t: 'trade', d: 'dev' };
  const k = map[e.key.toLowerCase()];
  if (!k) return;
  const b = document.querySelector(`#actions [data-act="${k}"]`);
  if (b && !b.disabled) { e.preventDefault(); b.click(); }
});

// ---------- Main menu ----------
const home = $('#home');
function hasSave() { try { return !!localStorage.getItem('catan.save'); } catch { return false; } }
function syncHome() {
  for (const seg of home.querySelectorAll('.seg')) {
    const k = seg.dataset.set;
    for (const b of seg.children) b.classList.toggle('on', String(settings[k]) === b.dataset.v);
  }
  const cont = game && game.phase !== 'gameOver';
  $('#homeContinue').hidden = !cont;
  $('#homeStart').classList.toggle('primary', !cont);
  $('#homeContinue').classList.toggle('primary', !!cont);
}
function showHome() {
  clearTimeout(botTimer);
  menu.hidden = true;
  syncHome();
  home.hidden = false;
}
home.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || b.disabled) return;
  const seg = b.closest('.seg');
  if (seg) {
    const k = seg.dataset.set;
    settings[k] = k === 'opponents' || k === 'vpTarget' ? Number(b.dataset.v) : b.dataset.v;
    saveSettings(); syncHome(); return;
  }
  sound.unlock();
  if (b.id === 'homeStart') { home.hidden = true; startGame(); }
  if (b.id === 'homeContinue') { home.hidden = true; advance(); }
});
$('#homeBtn').addEventListener('click', showHome);

$('#logToggle').addEventListener('click', () => {
  const box = $('#logBox');
  box.classList.toggle('collapsed');
  $('#logToggle').setAttribute('aria-expanded', String(!box.classList.contains('collapsed')));
  $('#log').scrollTop = 1e9;
});

// Settings.
const cog = $('#cogBtn'), menu = $('#settings');
function syncSettingsForm() {
  $('#setOpp').value = settings.opponents; $('#setDiff').value = settings.difficulty; $('#setSpeed').value = settings.speed;
  $('#setBoard').value = settings.board; $('#setVp').value = settings.vpTarget; $('#setSound').checked = settings.sound; $('#setFriendly').checked = settings.friendlyRobber;
}
cog.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = menu.hidden;
  menu.hidden = !open;
  cog.setAttribute('aria-expanded', String(open));
  syncSettingsForm();
});
document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== cog) { menu.hidden = true; cog.setAttribute('aria-expanded', 'false'); } });
menu.addEventListener('change', () => {
  settings.opponents = Number($('#setOpp').value); settings.difficulty = $('#setDiff').value; settings.speed = $('#setSpeed').value;
  settings.board = $('#setBoard').value; settings.vpTarget = Math.max(3, Math.min(20, Number($('#setVp').value) || 10)); settings.sound = $('#setSound').checked; settings.friendlyRobber = $('#setFriendly').checked;
  sound.enabled = settings.sound;
  if (game) game.levels = game.levels.map((l, i) => (i === human ? l : settings.difficulty));
  saveSettings();
});
// ---------- Boot ----------
sound.enabled = settings.sound;
setTimeout(preloadDice, 2000);
if (AUTO) startGame();
else { if (resume()) { renderLog(); render(); } showHome(); }
window.__catan = { get game() { return game; }, get human() { return human; }, act, render, showGameOver, COLOURS };
