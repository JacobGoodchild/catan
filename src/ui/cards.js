// Cards as HTML. Resource pictures are small 3D renders; development cards carry open-access museum paintings.
import { PLAYER_COLOURS } from './art.js';
import { pieceIcon, resImage } from './board3d.js';

export const RES_NAME = { brick: 'Brick', lumber: 'Lumber', wool: 'Wool', grain: 'Grain', ore: 'Ore' };
export const DEV_INFO = {
  knight: { title: 'Knight', frame: 'knight', text: 'Move the robber. Steal 1 resource from the owner of a settlement or city adjacent to the robber’s new hex.' },
  roadBuilding: { title: 'Road Building', frame: 'progress', text: 'Place 2 new roads as if you had just built them.' },
  yearOfPlenty: { title: 'Year of Plenty', frame: 'progress', text: 'Take any 2 resources from the bank.' },
  monopoly: { title: 'Monopoly', frame: 'progress', text: 'Announce 1 type of resource. All other players must give you all of their resources of that type.' },
  vp: { title: 'Victory Point', frame: 'vp', text: '1 Victory Point. Reveal this card on your turn if, with it, you reach the number of points required for victory.' },
};
const VP_NAMES = ['Library', 'Market', 'Chapel', 'Great Hall', 'University'];
const VP_ART = ['library', 'market', 'chapel', 'hall', 'university'];
const DEV_ART = { knight: 'knight', roadBuilding: 'roadbuilding', yearOfPlenty: 'plenty', monopoly: 'monopoly' };
const art = (n) => new URL(`../../assets/art/${n}.jpg`, import.meta.url).href;

export function resourceCard(res, extraClass = '') {
  return `<div class="card res res-${res} ${extraClass}" data-res="${res}" title="${RES_NAME[res]}"><img class="card-pic" src="${resImage(res)}" alt=""><span class="card-name">${RES_NAME[res]}</span></div>`;
}
export function miniRes(res) {
  return `<span class="mini-res res-${res}" title="${RES_NAME[res]}"><img src="${resImage(res)}" alt="${RES_NAME[res]}"></span>`;
}
export function cardBack(kind = 'res') {
  return `<div class="card back ${kind === 'dev' ? 'dev-back' : 'res-back'}"><span class="back-mark"></span></div>`;
}
export function devCard(type, opts = {}) {
  const info = DEV_INFO[type];
  const i = (opts.index || 0) % VP_NAMES.length;
  const title = type === 'vp' ? VP_NAMES[i] : info.title;
  return `<div class="card dev dev-${info.frame} ${opts.extraClass || ''}" data-dev="${type}" title="${info.title}">
    <div class="dev-title">${title}</div>
    <img class="card-pic" src="${art(type === 'vp' ? VP_ART[i] : DEV_ART[type])}" alt="">
    <div class="dev-text">${type === 'vp' ? '<b>1 Victory Point</b>' : info.text}</div>
  </div>`;
}
const costRow = (cost) => Object.entries(cost).flatMap(([r, n]) => Array(n).fill(miniRes(r))).join('');
export function buildingCostsCard(colour) {
  const c = PLAYER_COLOURS[colour];
  return `<div class="bc-card" style="--pc:${c.base};--pcd:${c.dark}">
    <div class="bc-head">Building Costs</div>
    <div class="bc-row" data-build="road"><span class="bc-piece">${pieceIcon('road', colour)}</span><span class="bc-name">Road</span><span class="bc-cost">${costRow({ brick: 1, lumber: 1 })}</span><span class="bc-vp">0 VP</span></div>
    <div class="bc-row" data-build="settlement"><span class="bc-piece">${pieceIcon('settlement', colour)}</span><span class="bc-name">Settlement</span><span class="bc-cost">${costRow({ brick: 1, lumber: 1, wool: 1, grain: 1 })}</span><span class="bc-vp">1 VP</span></div>
    <div class="bc-row" data-build="city"><span class="bc-piece">${pieceIcon('city', colour)}</span><span class="bc-name">City</span><span class="bc-cost">${costRow({ grain: 2, ore: 3 })}</span><span class="bc-vp">2 VP</span></div>
    <div class="bc-row" data-build="dev"><span class="bc-piece">${pieceIcon('dev', colour)}</span><span class="bc-name">Development card</span><span class="bc-cost">${costRow({ wool: 1, grain: 1, ore: 1 })}</span><span class="bc-vp">?</span></div>
  </div>`;
}
export function specialCard(kind) {
  const longest = kind === 'longestRoad';
  return `<div class="card special" data-special="${kind}">
    <img class="card-pic" src="${art(longest ? 'longroad' : 'army')}" alt="">
    <div class="sp-title">${longest ? 'Longest Road' : 'Largest Army'}</div>
    <div class="sp-text">2 Victory Points</div>
  </div>`;
}
