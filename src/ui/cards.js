// Card artwork as HTML + inline SVG. Layout follows the 5th edition cards:
// cream parchment frame, picture panel, title bar (dev cards), short text, cost icons.
import { terrainArt, resourceIcon, settlementSVG, citySVG, roadSVG, PLAYER_COLOURS } from './art.js';

const RES_TERRAIN = { brick: 'hills', lumber: 'forest', wool: 'pasture', grain: 'fields', ore: 'mountains' };
export const RES_NAME = { brick: 'Brick', lumber: 'Lumber', wool: 'Wool', grain: 'Grain', ore: 'Ore' };
export const DEV_INFO = {
  knight: { title: 'Knight', frame: 'knight', text: 'Move the robber. Steal 1 resource from the owner of a settlement or city adjacent to the robber’s new hex.' },
  roadBuilding: { title: 'Road Building', frame: 'progress', text: 'Place 2 new roads as if you had just built them.' },
  yearOfPlenty: { title: 'Year of Plenty', frame: 'progress', text: 'Take any 2 resources from the bank.' },
  monopoly: { title: 'Monopoly', frame: 'progress', text: 'Announce 1 type of resource. All other players must give you all of their resources of that type.' },
  vp: { title: 'Victory Point', frame: 'vp', text: '1 Victory Point. Reveal this card on your turn if, with it, you reach the number of points required for victory.' },
};
const VP_NAMES = ['Library', 'Market', 'Chapel', 'Great Hall', 'University'];

let uid = 0;
function picture(inner, terrain, seed = 3) {
  const id = `cp${uid++}`;
  return `<svg class="card-pic" viewBox="-50 -42 100 84" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <clipPath id="${id}"><rect x="-50" y="-42" width="100" height="84"/></clipPath>
    <g clip-path="url(#${id})"><g transform="scale(0.62)">${terrainArt(terrain, seed)}</g>${inner}</g></svg>`;
}

export function resourceCard(res, extraClass = '') {
  return `<div class="card res res-${res} ${extraClass}" data-res="${res}" title="${RES_NAME[res]}">
    ${picture(`<ellipse cx="0" cy="-2" rx="34" ry="26" fill="#fff8e0" opacity="0.38" filter="url(#soft)"/><g transform="translate(0,-2) scale(1.55)" filter="url(#shadow)">${resourceIcon(res)}</g>`, RES_TERRAIN[res])}
    <div class="card-badge"><svg viewBox="-14 -14 28 28">${resourceIcon(res, 0.85)}</svg></div>
  </div>`;
}

export function cardBack(kind = 'res') {
  if (kind === 'dev') {
    return `<div class="card back dev-back"><svg viewBox="-20 -20 40 40"><circle r="13" fill="#e7b62c" stroke="#8a6416" stroke-width="1"/><path d="M-13,0 A13,13 0 0 0 13,0 Z" fill="#c0262d"/><path d="M-11.3,6.5 A13,13 0 0 0 11.3,6.5 Z" fill="#1f5fae"/><circle r="13" fill="none" stroke="#6b4a1e" stroke-width="1.4"/></svg></div>`;
  }
  return `<div class="card back res-back"><svg viewBox="-20 -28 40 56">
    <path d="M-4,-22 C4,-24 10,-16 9,-8 C14,-2 12,6 7,10 C9,16 4,23 -3,22 C-9,21 -8,14 -11,9 C-15,4 -12,-3 -9,-7 C-12,-13 -10,-20 -4,-22 Z" fill="#d9c27a" stroke="#f3e3a8" stroke-width="1.2"/>
    <path d="M-2,-16 C3,-15 6,-10 5,-5 C8,-1 6,4 3,7 C4,12 1,16 -3,15 C-6,14 -5,9 -7,6 C-9,2 -7,-3 -5,-6 C-7,-10 -6,-15 -2,-16 Z" fill="#6f9a3e"/>
    <circle cx="0" cy="-2" r="2.4" fill="#a8552a"/><circle cx="-3" cy="8" r="1.8" fill="#8d8aa0"/>
  </svg></div>`;
}

const VP_PICS = [
  // Library: columns and a pediment.
  `<g transform="translate(0,8)"><polygon points="-30,-14 0,-30 30,-14" fill="#d9cdb0" stroke="#7a6a4a"/><rect x="-28" y="-14" width="56" height="5" fill="#cbbd9b"/>
    ${[-22, -11, 0, 11, 22].map((x) => `<rect x="${x - 2.5}" y="-9" width="5" height="24" fill="#efe6cf" stroke="#9c8a62" stroke-width="0.6"/>`).join('')}<rect x="-30" y="15" width="60" height="5" fill="#b8a986"/></g>`,
  // Market: stalls with striped awnings.
  `<g transform="translate(0,10)">${[-20, 4].map((x, i) => `<g transform="translate(${x},0)"><rect x="-2" y="-6" width="20" height="18" fill="#b98d5a"/><path d="M-4,-6 L20,-6 L22,-14 L-6,-14 Z" fill="${i ? '#2f6c9a' : '#a2262b'}"/><path d="M2,-14 L0,-6 M10,-14 L10,-6 M18,-14 L20,-6" stroke="#f3e9cf" stroke-width="2.5"/><circle cx="4" cy="6" r="3" fill="#e2b13a"/><circle cx="11" cy="6" r="3" fill="#7f9a3e"/></g>`).join('')}</g>`,
  // Chapel: nave and steeple.
  `<g transform="translate(0,10)"><rect x="-22" y="-8" width="30" height="20" fill="#d9cdb0" stroke="#7a6a4a"/><polygon points="-25,-8 -7,-20 11,-8" fill="#8e4a2a"/>
    <rect x="8" y="-22" width="12" height="34" fill="#cbbd9b" stroke="#7a6a4a"/><polygon points="6,-22 14,-38 22,-22" fill="#8e4a2a"/><path d="M14,-44 V-38 M11,-41 H17" stroke="#3b2a18" stroke-width="1.5"/><rect x="-12" y="0" width="7" height="12" rx="3.5" fill="#3b2a18"/></g>`,
  // Great Hall: long timbered hall.
  `<g transform="translate(0,10)"><rect x="-34" y="-8" width="68" height="20" fill="#e6d8b8" stroke="#6d4e2b"/><polygon points="-38,-8 -28,-24 28,-24 38,-8" fill="#7d4a2a"/>
    ${[-26, -13, 0, 13, 26].map((x) => `<path d="M${x},-8 V12" stroke="#6d4e2b" stroke-width="2"/>`).join('')}<rect x="-4" y="0" width="8" height="12" fill="#3b2a18"/></g>`,
  // University: domed building.
  `<g transform="translate(0,10)"><rect x="-30" y="-6" width="60" height="18" fill="#e3d6b5" stroke="#7a6a4a"/><rect x="-12" y="-16" width="24" height="10" fill="#d4c6a2" stroke="#7a6a4a"/>
    <path d="M-12,-16 A12,12 0 0 1 12,-16 Z" fill="#6f8f9e" stroke="#435a64"/><path d="M0,-28 V-34" stroke="#3b2a18" stroke-width="1.5"/>
    ${[-24, -14, 14, 24].map((x) => `<rect x="${x - 3}" y="-2" width="6" height="9" fill="#3b2a18"/>`).join('')}<rect x="-4" y="0" width="8" height="12" fill="#3b2a18"/></g>`,
];

function devPicture(type, seed) {
  const pics = {
    knight: `<g transform="translate(-2,8)">
      <ellipse cx="0" cy="25" rx="30" ry="4" fill="#3d3016" opacity="0.35"/>
      <g fill="#5a3b22" stroke="#2e1d10" stroke-width="0.8">
        <path d="M-22,4 C-24,-6 -14,-10 0,-9 C8,-9 14,-10 18,-16 L22,-24 L27,-22 L25,-14 L29,-10 L26,-7 L20,-9 C18,-2 16,4 14,6 Z"/>
        <path d="M-20,4 L-23,24 L-19,24 L-15,8 Z"/><path d="M-12,6 L-13,24 L-9,24 L-7,8 Z"/>
        <path d="M6,6 L5,24 L9,24 L11,7 Z"/><path d="M12,4 L16,24 L20,24 L16,3 Z"/>
        <path d="M-22,0 C-30,2 -32,10 -30,16 C-27,8 -24,6 -21,6 Z"/>
      </g>
      <path d="M-14,-8 L10,-8 L8,4 L-12,4 Z" fill="#a2262b"/>
      <path d="M-6,-10 L-8,-26 L2,-28 L4,-10 Z" fill="#8e8f96" stroke="#4a4b52" stroke-width="0.6"/>
      <circle cx="-2" cy="-32" r="5.5" fill="#a7a8af" stroke="#4a4b52" stroke-width="0.6"/><rect x="-4" y="-33" width="5" height="1.4" fill="#2a2a2e"/>
      <path d="M-12,-22 C-18,-20 -18,-10 -12,-6 C-6,-10 -6,-20 -12,-22 Z" fill="#e7b62c" stroke="#6b4a1e" stroke-width="0.8"/>
      <line x1="2" y1="-18" x2="34" y2="-40" stroke="#3b2a18" stroke-width="1.8"/><path d="M30,-42 L38,-44 L33,-37 Z" fill="#c0262d"/>
    </g>`,
    roadBuilding: `<path d="M-50,30 C-20,20 0,10 10,-10 C18,-25 30,-30 50,-32" stroke="#a88a55" stroke-width="12" fill="none"/><path d="M-50,30 C-20,20 0,10 10,-10 C18,-25 30,-30 50,-32" stroke="#d9c08a" stroke-width="7" fill="none"/>
      <g transform="translate(-12,10) rotate(-25)"><rect x="-10" y="-4" width="20" height="7" fill="#7a4f2a"/><circle cx="-7" cy="5" r="4" fill="#4a2e16"/><circle cx="7" cy="5" r="4" fill="#4a2e16"/></g>`,
    yearOfPlenty: `<g transform="translate(0,6)"><path d="M-26,10 C-20,-14 10,-22 24,-18 L18,-6 C6,-10 -10,-4 -14,14 Z" fill="#c48a2e" stroke="#7a521a"/>
      <g transform="translate(-6,4)">${resourceIcon('grain', 1.4)}</g><g transform="translate(12,10)">${resourceIcon('wool', 1)}</g><g transform="translate(-20,14)">${resourceIcon('ore', 0.9)}</g></g>`,
    monopoly: `<g transform="translate(0,4)"><rect x="-30" y="-24" width="60" height="44" rx="3" fill="#efe0b6" stroke="#9c7d44"/>
      <path d="M-22,-14 H22 M-22,-6 H18 M-22,2 H20 M-22,10 H8" stroke="#8a7550" stroke-width="2"/>
      <circle cx="18" cy="12" r="6" fill="#a2262b"/></g>`,
    vp: `<g transform="translate(0,6)"><rect x="-30" y="-10" width="60" height="30" fill="#b89366" stroke="#6d4e2b"/>
      <polygon points="-34,-10 0,-34 34,-10" fill="#8e4a2a" stroke="#5b2e18"/>
      <rect x="-22" y="-2" width="8" height="12" fill="#3b2a18"/><rect x="-4" y="-2" width="8" height="22" fill="#3b2a18"/><rect x="14" y="-2" width="8" height="12" fill="#3b2a18"/></g>`,
  };
  const terrain = type === 'knight' ? 'pasture' : type === 'vp' ? 'fields' : type === 'monopoly' ? 'desert' : type === 'yearOfPlenty' ? 'fields' : 'pasture';
  const art = type === 'vp' ? VP_PICS[(seed - 11) % VP_PICS.length] : pics[type];
  return picture(`<rect x="-50" y="-42" width="100" height="84" fill="#fff" opacity="0.18"/>${art}`, terrain, seed);
}

export function devCard(type, opts = {}) {
  const info = DEV_INFO[type];
  const title = type === 'vp' ? VP_NAMES[(opts.index || 0) % VP_NAMES.length] : info.title;
  return `<div class="card dev dev-${info.frame} ${opts.extraClass || ''}" data-dev="${type}" title="${info.title}">
    <div class="dev-title">${title}</div>
    ${devPicture(type, (opts.index || 0) + 11)}
    <div class="dev-text">${type === 'vp' ? '<b>1 Victory Point</b>' : info.text}</div>
  </div>`;
}

const costRow = (cost) => Object.entries(cost).flatMap(([r, n]) => Array(n).fill(`<span class="cost-res cost-${r}"><svg viewBox="-14 -14 28 28">${resourceIcon(r, 0.9)}</svg></span>`)).join('');

export function buildingCostsCard(colour) {
  const c = PLAYER_COLOURS[colour];
  const pieceSvg = (inner, vb = '-20 -20 40 40') => `<svg viewBox="${vb}" class="bc-piece">${inner}</svg>`;
  return `<div class="bc-card" style="--pc:${c.base};--pcd:${c.dark}">
    <div class="bc-head">Building Costs</div>
    <div class="bc-row" data-build="road"><span class="bc-name">Road</span><span class="bc-cost">${costRow({ brick: 1, lumber: 1 })}</span>${pieceSvg(roadSVG(colour, -20, 8, 20, -8))}<span class="bc-vp">0 VP</span></div>
    <div class="bc-row" data-build="settlement"><span class="bc-name">Settlement</span><span class="bc-cost">${costRow({ brick: 1, lumber: 1, wool: 1, grain: 1 })}</span>${pieceSvg(settlementSVG(colour, 0, 2, 1.2))}<span class="bc-vp">1 VP</span></div>
    <div class="bc-row" data-build="city"><span class="bc-name">City</span><span class="bc-cost">${costRow({ grain: 2, ore: 3 })}</span>${pieceSvg(citySVG(colour, 0, 4, 1))}<span class="bc-vp">2 VP</span></div>
    <div class="bc-row" data-build="dev"><span class="bc-name">Development card</span><span class="bc-cost">${costRow({ wool: 1, grain: 1, ore: 1 })}</span><span class="bc-devback">${cardBack('dev')}</span><span class="bc-vp">?</span></div>
  </div>`;
}

export function specialCard(kind) {
  const longest = kind === 'longestRoad';
  const pic = longest
    ? `<path d="M-50,34 C-10,20 10,0 50,-14" stroke="#c8ad78" stroke-width="16" fill="none"/><g transform="translate(-4,6)"><rect x="-16" y="-10" width="30" height="12" fill="#7a4f2a"/><circle cx="-10" cy="4" r="6" fill="#4a2e16"/><circle cx="8" cy="4" r="6" fill="#4a2e16"/><ellipse cx="24" cy="-2" rx="9" ry="5" fill="#8a6a4a"/></g>`
    : `<g transform="translate(0,8)">${[-22, 0, 22].map((x) => `<g transform="translate(${x},0)"><path d="M-8,14 L-6,-2 L8,-4 L10,14 Z" fill="#6b4a2e"/><path d="M-2,-4 L-3,-16 L4,-16 L4,-4 Z" fill="#a2262b"/><circle cx="0" cy="-20" r="4" fill="#a7a8af"/><line x1="6" y1="-30" x2="6" y2="10" stroke="#3b2a18" stroke-width="1.5"/></g>`).join('')}</g>`;
  return `<div class="card special" data-special="${kind}">
    ${picture(pic, longest ? 'pasture' : 'fields', longest ? 4 : 9)}
    <div class="sp-title">${longest ? 'Longest Road' : 'Largest Army'}</div>
    <div class="sp-text">2 Victory Points</div>
  </div>`;
}
