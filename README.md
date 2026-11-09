# Freedom Simulator

A three-power war game set in the Poor Camp world: Greater America, China and Russia, with
**simultaneous orders**. Every turn, each command writes its orders in secret; then every order
resolves at once, in fixed phases. Planned home: freedom.poor.camp.

Design doc: [Freedom Simulator — Design Doc (draft)](https://claude.ai/artifact/EWzgrmY9jmptfzfEe9CWhW)

## Status: stage 1 prototype

This is the first playable test of the core loop, not the real game. It answers one question:
is a three-way simultaneous-orders war fun?

- 32 land regions and 9 sea zones on a schematic world board: the Americas, Europe, Africa, the Middle East and Asia. The Atlantic wraps around the board edge. (The finished game moves to a real-looking map.)
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

## Balance notes (AI vs AI, current numbers)

Starting position: each power earns 13 points a turn. Russia holds continental Europe and Central
Asia; China holds Mongolia, South Asia and Southeast Asia. Tuned with all-computer games until the
three came out even: over 600 games, Greater America 36%, China 32%, Russia 31%, draws 2%.

What mattered: Greater America's edge was structural, not economic. It could ship troops straight
across the North Atlantic into Britain and Western Europe, which Russia barely defended. Cutting its
income or raising its unit costs changed almost nothing. Stronger garrisons in Britain, Western
Europe and Brazil, a second Russian Baltic fleet, and a stronger Chinese start in Southeast Asia
evened it out. The computer players also no longer leave huge stacks idle on a quiet border.

These numbers come from simple computer players, so they show the board isn't lopsided. They don't
prove it's balanced for humans. Rerun with `npm run playtest -- 600 <any-name>` after changes.
