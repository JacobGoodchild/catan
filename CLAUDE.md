# Catan — working notes

## Summary (latest checkpoint)

**Done:** a complete, playable game against 2 or 3 computer players, start to finish, on the live site. The rules engine is pure logic with one `step(state, action)` entry point, 27 rule tests and a 2,000-game bot simulation (all pass). Full games have also been played through the real browser interface by an automated clicker, with no errors. The board, pieces, tokens, harbours, robber and cards are drawn in SVG to match the 5th edition. The dice are 3D (three.js + cannon-es) with fair results from `crypto`. There are card flight animations, a collapsible log, trading with the bank, harbours and players (including counter-offers both ways), settings behind the cog, and automatic save and resume.

**Still to do:** see the unticked items below. Mainly: more art polish (resource card pictures, development card illustrations), smarter Hard bots, a fuller tablet layout, and more play-testing by hand.

**Worth testing:** a full game on each difficulty; rolling a 7 with more than 7 cards; trading (offer, counter, bank and harbour); playing each development card; Longest Road changing hands; reload mid-game to check resume.

**Dev tools:** `tools/board-preview.html` (board only, `?b=variable` for a random board) and `tools/dice-preview.html?v=6,3`. Add `?auto` to the main page to let a bot play your seat (soak test; doesn't save). Tests: `npm test` (set `SIM_GAMES=200` for a quicker run).

## Plan

- No build step. Plain ES modules served straight from `main` by GitHub Pages.
- `src/engine/` is pure rules logic with no DOM: `geometry.js` (hexes, intersections, paths, harbours), `rules.js` (state, `step(state, action)`), `bots.js` (computer players), `rng.js`.
- `src/ui/` draws the board (SVG), hand, panels, log and drives the game. Animations hang off the `events` that the engine returns from each action.
- Tests use Node's built-in runner (`node --test`), no dependencies. Includes a headless simulation of thousands of bot games.
- Libraries (three.js, cannon-es for dice) vendored into `vendor/` with pinned versions.

## Progress checklist

- [x] Placeholder page and `.nojekyll` pushed to `main`
- [x] Rulebook saved to `reference/catanBaseRules.pdf` and read in full
- [x] Reference images gathered in `reference/images/` (git-ignored): Wikimedia Commons table photos plus high-resolution crops of the 2020 rulebook art
- [x] Engine: geometry
- [x] Engine: rules (setup, roll, production, shortage, 7/discard/robber, building, dev cards, longest road, largest army, trading, winning)
- [x] Engine: unit tests for each tricky rule
- [x] Engine: bots (easy, normal, hard)
- [x] Engine: thousands-of-games simulation test
- [x] Board art (terrain tiles, tokens, sea frame, harbours, pieces, robber)
- [x] Playable game in browser: you against 2 or 3 bots
- [x] Hand, cards, Building Costs card, opponent panels, log, controls
- [x] Trading UI (bank, harbours, players, counter-offers)
- [x] Settings behind cog, saved to localStorage
- [x] Save and resume
- [x] Dice overlay with physics (three.js + cannon-es)
- [x] Card and piece animations, robber movement, special cards moving
- [x] Sound (optional, quiet)
- [ ] Polish passes with screenshots (two done: board vs rulebook, tablet width)
- [ ] Richer resource and development card illustrations
- [ ] Hard bots: now clearly stronger than Normal in simulation (about 95 v 68 wins in 200 mixed games; Easy 37), but still simple heuristics. More planning would help (e.g. aiming for specific harbours, holding back cards from the leader).
- [ ] Tablet layout: works at 1024 wide but the action row wraps
- [x] Production animation from hex to hand: checked by screenshot mid-flight
- [x] Starting Set-up for Beginners option (fixed pieces)
- [x] Direct bank/harbour trade row; incoming offers in the prompt bar, not a modal
- [x] Keyboard shortcuts: R roll, E end turn, T trade, D development card (shown in button tooltips)
- [x] House rule: Friendly robber (off by default). More could follow the same pattern: a flag in `state.config`, checked in `step`.
- [x] Dark theme for the interface via `prefers-color-scheme` (board and cards keep their real colours)

## Rules decisions

- **Combined trade/build phase.** The Almanac recommends it for experienced players ("Combined Trade/Build Phase"), so after rolling you can trade and build in any order.
- **Beginner map.** Two options: "Beginner map" uses the terrain, numbers and harbours of Illustration A with normal snake-order placement (the brief asks for snake setup). "Beginner map and pieces" is the rulebook's Starting Set-up for Beginners: the 8 fixed settlements and roads from Illustration A, starting resources from the starred settlements, and the first player rolls straight away. Positions were read from the illustration and checked against the rulebook's example (Blue gets brick, lumber and ore). With 3 players the rulebook drops red, but you are always red here, so orange's pieces are the ones left off.
- **Variable map.** Terrain shuffled; harbours shuffled onto the 9 fixed frame positions; number tokens laid A–R from a random corner, anticlockwise towards the centre, skipping the desert (Almanac, "Set-up, Variable").
- **Robbing.** Any opponent with a building on the robber's hex can be chosen, even with no cards (Almanac: "If that player has no cards, you get nothing"). If only one such opponent, they're robbed automatically.
- **Win check.** Only for the player whose turn it is, after each of their actions (including the roll). Hidden VP cards count.
- **Friendly robber (house rule, off).** Counts visible points only (not hidden VP cards). If every hex is ruled out, any hex is allowed.
- **Maritime trade.** One card received per trade action (4:1, 3:1 or 2:1). Repeat to trade more. You can't receive the type you give.

## Online play later

Every change is an action `{ type, player, ... }` passed to `step(state, action, rng)`, which validates and mutates. Hidden info (hands, dev cards, the deck) lives in `state.hidden`; `viewFor(state, player)` produces the redacted view a client should see. A Cloudflare Durable Object would hold the authoritative state, run `step`, roll dice itself (ignore client-supplied dice), and push `viewFor` to each socket.

## Known issues

- Sound is synthesised with Web Audio (no files). It's off by default; switch on in settings.
- The 3D dice fall back to flat dice if WebGL is missing; a 6-second safety timeout stops a dice failure from stalling the game.
- In the browser the full state (including bots' hands) lives in memory. Bots only ever read `viewFor(state, seat)`, so they don't cheat, but a curious player could peek in the console. Fine for single player; the server version will fix it.

## Other decisions

- **Static board drawn once.** Sea, tiles, harbours and tokens are rendered into one SVG image (blob URL) when the board is created; pieces, robber, glows and highlights are live SVG on top. Raised the frame rate with highlights showing from about 42 to 56 in headless Chromium.

- **Dice fairness.** `cryptoDie()` rejection-samples `crypto.getRandomValues` for each die. The throw is simulated off-screen with cannon-es, then the die faces are renumbered (opposite faces still add to 7) so the face that lands up shows the chosen value, and the recorded throw is replayed.
- **Bot names.** Bots are named by colour (Blue, White, Orange) and you are always red, in a random seat, so you don't always go first.
- **No build step.** three.js 0.160.0 and cannon-es 0.20.0 are vendored in `vendor/`.

