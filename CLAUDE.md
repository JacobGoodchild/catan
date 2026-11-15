# Catan — working notes

## Summary (latest checkpoint)

_Updated at each checkpoint. See the checklist below for detail._

## Plan

- No build step. Plain ES modules served straight from `main` by GitHub Pages.
- `src/engine/` is pure rules logic with no DOM: `geometry.js` (hexes, intersections, paths, harbours), `rules.js` (state, `step(state, action)`), `bots.js` (computer players), `rng.js`.
- `src/ui/` draws the board (SVG), hand, panels, log and drives the game. Animations hang off the `events` that the engine returns from each action.
- Tests use Node's built-in runner (`node --test`), no dependencies. Includes a headless simulation of thousands of bot games.
- Libraries (three.js, cannon-es for dice) vendored into `vendor/` with pinned versions.

## Progress checklist

- [x] Placeholder page and `.nojekyll` pushed to `main`
- [x] Rulebook saved to `reference/catanBaseRules.pdf` and read in full
- [ ] Reference images gathered in `reference/images/` (git-ignored)
- [ ] Engine: geometry
- [ ] Engine: rules (setup, roll, production, shortage, 7/discard/robber, building, dev cards, longest road, largest army, trading, winning)
- [ ] Engine: unit tests for each tricky rule
- [ ] Engine: bots (easy, normal, hard)
- [ ] Engine: thousands-of-games simulation test
- [ ] Board art (terrain tiles, tokens, sea frame, harbours, pieces, robber)
- [ ] Playable game in browser: you against 2 or 3 bots
- [ ] Hand, cards, Building Costs card, opponent panels, log, controls
- [ ] Trading UI (bank, harbours, players, counter-offers)
- [ ] Settings behind cog, saved to localStorage
- [ ] Save and resume
- [ ] Dice overlay with physics (three.js + cannon-es)
- [ ] Card and piece animations, robber movement, special cards moving
- [ ] Sound (optional, quiet)
- [ ] Polish passes with screenshots

## Rules decisions

- **Combined trade/build phase.** The Almanac recommends it for experienced players ("Combined Trade/Build Phase"), so after rolling you can trade and build in any order.
- **Beginner map.** Uses the terrain, numbers and harbours of Illustration A, but players still place their starting settlements in snake order (the brief asks for snake setup). The fixed beginner starting positions are not used.
- **Variable map.** Terrain shuffled; harbours shuffled onto the 9 fixed frame positions; number tokens laid A–R from a random corner, anticlockwise towards the centre, skipping the desert (Almanac, "Set-up, Variable").
- **Robbing.** Any opponent with a building on the robber's hex can be chosen, even with no cards (Almanac: "If that player has no cards, you get nothing"). If only one such opponent, they're robbed automatically.
- **Win check.** Only for the player whose turn it is, after each of their actions (including the roll). Hidden VP cards count.
- **Maritime trade.** One card received per trade action (4:1, 3:1 or 2:1). Repeat to trade more. You can't receive the type you give.

## Online play later

Every change is an action `{ type, player, ... }` passed to `step(state, action, rng)`, which validates and mutates. Hidden info (hands, dev cards, the deck) lives in `state.hidden`; `viewFor(state, player)` produces the redacted view a client should see. A Cloudflare Durable Object would hold the authoritative state, run `step`, roll dice itself (ignore client-supplied dice), and push `viewFor` to each socket.

## Known issues

