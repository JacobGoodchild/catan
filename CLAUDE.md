# Catan — working notes

## Session 2: interface overhaul

- **Main menu** on every visit (`#home`): play against the computer (opponents, difficulty, board, points to win), Continue game when a save exists, and a "Play with friends" card marked as not built yet. The house button in the top left returns to it; the game pauses while it is open.
- **Layout**: three columns on a wooden table. Players and log on the left, the board centred, bank / Building Costs / pieces left on the right, and a dock along the bottom with the hand (bigger cards) and large action tiles.
- **Turn banner** above the board: whose turn (in their colour), what to do in plain words, and the dice. A ticker under it shows the latest log line for five seconds.
- **Roll dice**: a large pulsing button on the board plus the main button in the dock, which switches between "Roll dice" and "End turn". Text-only prompts moved into the banner so nothing covers the legal spots.
- **Art**: terrain goes through a painterly filter (wobbled edges, watercolour blotches, grain); pieces get wood grain and are larger; number tokens are larger.
- Dark theme removed: the wooden table is one consistent look.
- Worked on branch `claude/intelligent-babbage-ypnaa7` (the session could not push to `main`). Merge it into `main` to publish.

## Summary (latest checkpoint, end of session 1)

**Done.** A complete, playable game against 2 or 3 computer players, start to finish, live at https://jacobgoodchild.github.io/catan/.
- Rules engine: pure logic, one `step(state, action)` entry point, hidden info kept apart in `state.hidden`. 27 rule tests plus a 2,000-game bot simulation (card totals, bank, piece counts and dev deck checked after every action). All pass.
- Look: board, pieces, tokens, harbours, robber and all cards drawn in SVG after the 2020 rulebook art; 3D physics dice (three.js + cannon-es) with fair `crypto` results; a calm interface frame in the style of Groundwork, with a dark theme.
- Play: beginner map (with or without the fixed beginner pieces) or variable board; trading with the bank, harbours and players, with counter-offers both ways; all development cards; Longest Road and Largest Army with the rulebook's tie rules; custom points target; Friendly robber house rule (off); save and resume; keyboard shortcuts.
- Feel: cards fly from tiles to hands and back to the bank, dev cards flip in, played cards are revealed, the robber slides, special cards move to their owner, pieces settle, quiet synthesised sound (on, low volume; can be switched off), and reduced motion is respected.
- Whole games have been played through the real browser interface by an automated clicker (setup, robber, discards, trades, dev cards, game over) with no errors.

**Still to do.** See the unticked items below: richer card illustrations, smarter Hard bots, more tablet polish, and play-testing by a person rather than a script.

**Please test.** A full game on Normal; rolling a 7 while holding more than 7 cards; proposing a trade and accepting a bot's counter-offer; each development card; Longest Road changing hands; reloading mid-game; the "Beginner map and pieces" option; dark mode if your system uses it.

**Dev tools.** `tools/board-preview.html` (`?b=variable` for a random board), `tools/cards-preview.html`, `tools/dice-preview.html?v=6,3`. Add `?auto` to the main page to let a bot play your seat (soak test; doesn't save). Tests: `npm test` (`SIM_GAMES=200 npm test` for a quicker run).

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
- [ ] Polish passes with screenshots (several done: board vs rulebook, cards, tablet width, dark mode, side panel). Keep going.
- [ ] Richer card illustrations: Knight and the five VP buildings redrawn; resource and progress cards could still be more painterly
- [ ] Hard bots: stronger than Normal in simulation (roughly 86–95 v 68–78 wins across runs of 200 mixed games; Easy 33–41), but still simple heuristics. More planning would help (e.g. aiming for specific harbours, holding back cards from the leader).
- [x] Tablet layout at 1024×768: actions on one row, compact Building Costs card. (Phone widths stack but haven't been polished.)
- [x] Production animation from hex to hand: checked by screenshot mid-flight
- [x] Starting Set-up for Beginners option (fixed pieces)
- [x] Direct bank/harbour trade row; incoming offers in the prompt bar, not a modal
- [x] Keyboard shortcuts: R roll, E end turn, T trade, D development card (shown in button tooltips)
- [x] House rule: Friendly robber (off by default). More could follow the same pattern: a flag in `state.config`, checked in `step`.
- [x] Dice roll chart and sorted scores on the end-of-game screen
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

- Sound is synthesised with Web Audio (no files), on by default at a low volume (the brief: "optional and quiet by default"); switch off in settings. It starts after the first click, as browsers require.
- The 3D dice fall back to flat dice if WebGL is missing; a 6-second safety timeout stops a dice failure from stalling the game.
- In the browser the full state (including bots' hands) lives in memory. Bots only ever read `viewFor(state, seat)`, so they don't cheat, but a curious player could peek in the console. Fine for single player; the server version will fix it.

## Other decisions

- **Public card tally (`state.seen`).** Tracks what the table has seen each player collect, spend, trade and discard, as players do in the real game. Steals are hidden, so it drifts (about 0.37 cards out per card held in simulation). Bots use it for Monopoly. It's public, so it's safe to send to every client later.

- **Static board drawn once.** Sea, tiles, harbours and tokens are rendered into one SVG image (blob URL) when the board is created; pieces, robber, glows and highlights are live SVG on top. Raised the frame rate with highlights showing from about 42 to 56 in headless Chromium.

- **Dice fairness.** `cryptoDie()` rejection-samples `crypto.getRandomValues` for each die. The throw is simulated off-screen with cannon-es, then the die faces are renumbered (opposite faces still add to 7) so the face that lands up shows the chosen value, and the recorded throw is replayed.
- **Bot names.** Bots are named by colour (Blue, White, Orange) and you are always red, in a random seat, so you don't always go first.
- **No build step.** three.js 0.160.0 and cannon-es 0.20.0 are vendored in `vendor/`.

