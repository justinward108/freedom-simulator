// Runs many AI-only games and prints who wins and how long games last.
// A quick balance check, not a substitute for playing. Usage: npm run playtest [-- games]
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../src/rules.js');
require('../src/map.js');
require('../src/rng.js');
require('../src/engine.js');
require('../src/ai.js');

const FS = globalThis.FS;
const games = Number(process.argv[2] || 300);
const wins = { ga: 0, china: 0, russia: 0, draw: 0 };
const reasons = {};
const byTemperament = {};
let rounds = 0;
let eliminations = 0;

for (let g = 0; g < games; g++) {
  let state = FS.engine.newGame({ seed: 'playtest-' + g, controllers: { ga: 'ai', china: 'ai', russia: 'ai' } });
  while (!state.winner) {
    const orders = {};
    for (const p of FS.POWERS) if (!state.eliminated[p]) orders[p] = FS.ai.planOrders(state, p);
    state = FS.engine.resolveTurn(state, orders).state;
  }
  wins[state.winner] += 1;
  reasons[state.winReason] = (reasons[state.winReason] || 0) + 1;
  rounds += state.lastTurn.round;
  eliminations += Object.keys(state.eliminated).length;
  if (state.winner !== 'draw') {
    const t = state.settings.temperaments[state.winner];
    byTemperament[t] = (byTemperament[t] || 0) + 1;
  }
}

const pct = (n) => ((100 * n) / games).toFixed(1) + '%';
console.log(`${games} AI-only games`);
for (const k of Object.keys(wins)) console.log(`  ${k.padEnd(7)} ${String(wins[k]).padStart(4)}  ${pct(wins[k])}`);
console.log(`  average length: ${(rounds / games).toFixed(1)} rounds`);
console.log(`  powers eliminated per game: ${(eliminations / games).toFixed(2)}`);
console.log('  how games ended:', reasons);
console.log('  winning temperaments:', byTemperament);
