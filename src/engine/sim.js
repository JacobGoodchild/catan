// Headless game runner: bots play each other to the end.
import { newGame, step, actorsNeeded } from './rules.js';
import { botAction } from './bots.js';

export function playGame({ seed, rng, numPlayers = 4, board = 'variable', levels, maxActions = 20000, check, friendlyRobber = false } = {}) {
  const state = newGame({ numPlayers, board, friendlyRobber }, rng);
  let actions = 0;
  while (state.phase !== 'gameOver') {
    const who = actorsNeeded(state);
    const p = who[0];
    const level = levels ? levels[p] : 'normal';
    const a = botAction(state, p, rng, level);
    if (!a) throw new Error(`Bot ${p} had no action in phase ${state.phase} (seed ${seed})`);
    const res = step(state, a, rng);
    if (!res.ok) throw new Error(`Bot action rejected: ${res.error} ${JSON.stringify(a)} phase ${state.phase} (seed ${seed})`);
    if (check) check(state, a, res);
    if (++actions > maxActions) throw new Error(`Game stuck after ${actions} actions (seed ${seed}), turn ${state.turn}`);
  }
  return { state, actions };
}
