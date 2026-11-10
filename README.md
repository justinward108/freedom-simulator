# Freedom Simulator

A three-power war game set in the Poor Camp world: Greater America, China and Russia, with
**simultaneous orders**. Every turn, each command writes its orders in secret; then every order
resolves at once, in fixed phases. Planned home: freedom.poor.camp.

Design doc: [Freedom Simulator — Design Doc (draft)](https://claude.ai/artifact/EWzgrmY9jmptfzfEe9CWhW)

## Status: stage 1 prototype

This is the first playable test of the core loop, not the real game. It answers one question:
is a three-way simultaneous-orders war fun?

- 32 land regions and 9 sea zones on a schematic world board: the Americas, Europe, Africa, the Middle East and Asia. The Atlantic wraps around the board edge. (The finished game moves to a real-looking map.)
- Infantry, fleets and air wings; every region you hold adds 1–4 points a turn to spend
- Seven structures (anti-aircraft guns, fortifications, coastal batteries, factories, recruitment
  centres, airfields, naval bases) and six research fields with three tiers each
- Objectives explained on screen, distinct unit icons, and hover tooltips on the map and panel
- All resolution phases and collision rules from the design doc, with a step-by-step reveal
- 1–3 humans on one device (pass it between commands), computer players fill the rest
- Objectives to win and the round limit are set on the start screen, so they can be tested

Not in yet: supply lines, manpower and mobilization, the broadcast layer and Civic Trust,
diplomacy, online multiplayer. See the design doc's prototype plan.

## Playing it

Open `index.html` in a browser. No build step or server is needed.

`npm run build` writes a single self-contained file to `dist/freedom-simulator.html` for sharing.

## Deploying to Netlify (freedom.poor.camp)

Two ways, both serve the same files:

- **Drag and drop:** run `npm run package`, then upload `dist/freedom-simulator-netlify.zip` in Netlify's deploy screen.
- **Linked to GitHub:** connect this repo in Netlify. `netlify.toml` tells it to run the package script and serve `dist/site`, so every push to `main` deploys.

Only the game ships: `index.html`, `styles.css`, `src/` and `assets/`. Tests, scripts and docs stay out.

## Images

Images go in `assets/` (`units/`, `structures/`, `regions/`, `ui/`; see `assets/README.md`). The package
script includes everything there automatically.

## Working on it

```
npm test            # engine tests (collision rules, transports, retreats, determinism)
npm run playtest    # 300 AI-only games: win rates and game length, a rough balance check
npm run build       # single-file build in dist/
npm run package     # Netlify site in dist/site and a deploy zip
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
Asia; China holds Mongolia, India and Southeast Asia. Greater America starts with Sea Power
tier 1 and Russia with Coastal Missiles tier 1. Over 600 all-computer games: Greater America 33%,
China 37%, Russia 30%.

What mattered: before research and structures, Greater America's edge was structural (shipping
troops straight across the North Atlantic), fixed with stronger garrisons in Britain, Western
Europe and Brazil and a second Russian Baltic fleet. Once coastal batteries arrived they punished
Greater America's navy hard (it fell to 15%); batteries now cost 4 and Greater America starts
ahead in Sea Power, which the design calls for anyway.

These numbers come from simple computer players, so they show the board isn't lopsided. They don't
prove it's balanced for humans. Rerun with `npm run playtest -- 600 <any-name>` after changes.
