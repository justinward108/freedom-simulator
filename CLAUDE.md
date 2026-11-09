# Freedom Simulator

A three-power simultaneous-orders war game set in the Poor Camp world (Greater America, China,
Russia). Design doc: https://claude.ai/artifact/EWzgrmY9jmptfzfEe9CWhW

## Spoiler rules (hard)

The game uses only the premise: Greater America is at war with China, Russia is the third great
power, and the broadcast lies. It must never preview where the Poor Camp books take the war.

- No scripted alliances or side-switches. Pacts form and break only through play.
- No nuclear weapons, bioweapons or coups, in units, tech or events.
- Starting territory is Justin's call (Nov 2026: Russia starts with continental Europe and Central Asia;
  China with Mongolia, South Asia and Southeast Asia). Everything else starts neutral. No other preset outcomes.
- No leader characters. Enemy commands are faceless (Beijing Command, Moscow Command).
- No fixed AI personality per power. Temperaments are dealt at random each game.
- Capitals are the real capitals: Washington, D.C., Beijing, Moscow.

## Engineering

- Simple and readable beats clever. The project will grow for years; keep files small and plain.
- `src/engine.js` stays pure: no DOM, no clock, no `Math.random`. All dice come from `src/rng.js`
  seeded by game seed and round, so results are reproducible and the engine can move to a server.
- Every balance number lives in `src/rules.js` (and region values and starts in `src/map.js`).
- Plain scripts sharing a `globalThis.FS` namespace, so `index.html` opens straight from disk.
- Run `npm test` after engine changes, and `npm run playtest` after balance or AI changes.
