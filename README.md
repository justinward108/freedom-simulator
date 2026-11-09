# Freedom Simulator

A three-power war game set in the Poor Camp world: Greater America, China and Russia, with
**simultaneous orders**. Every turn, each command writes its orders in secret; then every order
resolves at once, in fixed phases. Planned home: freedom.poor.camp.

Design doc: [Freedom Simulator — Design Doc (draft)](https://claude.ai/artifact/EWzgrmY9jmptfzfEe9CWhW)

## Status: stage 1 prototype

This is the first playable test of the core loop, not the real game. It answers one question:
is a three-way simultaneous-orders war fun?

- 31 land regions and 9 sea zones on a schematic world board: the Americas, Europe, Africa, the Middle East and Asia. The Atlantic wraps around the board edge. (The finished game moves to a real-looking map.)
- Infantry, fleets and air wings; every region you hold adds 1–4 points a turn to spend on builds
- All resolution phases and collision rules from the design doc, with a step-by-step reveal
- 1–3 humans on one device (pass it between commands), computer players fill the rest
- Objectives to win and the round limit are set on the start screen, so they can be tested

Not in stage 1: supply lines, manpower and mobilization, structures, technology, the broadcast
layer and Civic Trust, diplomacy, online multiplayer. See the design doc's prototype plan.

## Playing it

Open `index.html` in a browser. No build step or server is needed.

`npm run build` writes a single self-contained file to `dist/freedom-simulator.html` for sharing.

## Working on it

```
npm test            # engine tests (collision rules, transports, retreats, determinism)
npm run playtest    # 300 AI-only games: win rates and game length, a rough balance check
npm run build       # single-file build in dist/
```

| File | What it holds |
| --- | --- |
| `src/rules.js` | Every balance number: unit costs and strengths, battle rounds, transport capacity, AI temperaments |
| `src/map.js` | Regions, sea zones, links and starting positions |
| `src/rng.js` | Seeded dice, so the same seed and orders always give the same result |
| `src/engine.js` | The rules: order validation and turn resolution. Pure functions, no DOM, ready to move to a server |
| `src/ai.js` | Computer players |
| `src/ui.js` | The page: map, order entry, handover between players, reveal |
| `tests/` | Engine tests |
| `scripts/` | Playtest and single-file build |

## Balance notes (AI vs AI, 400 games, current numbers)

Roughly: Greater America 43%, China 32%, Russia 24%. Most games end at the round limit
(15 rounds, 7 of 14 objectives to win). These come from simple computer players, so treat them
as a smoke test, not a verdict.
