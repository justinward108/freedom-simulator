// Engine tests. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/rules.js');
require('../src/map.js');
require('../src/rng.js');
require('../src/engine.js');

const FS = globalThis.FS;
const E = FS.engine;

// A blank board: every region neutral and empty, no fleets. Tests place exactly what they need.
function blankState(seed) {
  const s = E.newGame({ seed: seed || 'test' });
  for (const id of Object.keys(s.land)) s.land[id] = { owner: 'neutral', inf: 0, air: 0 };
  for (const z of Object.keys(s.sea)) for (const p of FS.POWERS) s.sea[z].fleets[p] = 0;
  // Give each power a far-away home so nobody is eliminated mid-test.
  s.land.eus = { owner: 'ga', inf: 0, air: 0 };
  s.land.schina = { owner: 'china', inf: 0, air: 0 };
  s.land.moscow = { owner: 'russia', inf: 0, air: 0 };
  return s;
}

const move = (from, to, count, via) => ({ kind: 'move', unit: 'inf', from, to, count, via: via || null });
const fleet = (from, to, count) => ({ kind: 'move', unit: 'fleet', from, to, count });

test('moving into an empty region nobody else enters takes it', () => {
  const s = blankState();
  s.land.siberia = { owner: 'russia', inf: 3, air: 0 };
  const { state } = E.resolveTurn(s, { russia: [move('siberia', 'mongolia', 2)] });
  assert.equal(state.land.mongolia.owner, 'russia');
  assert.equal(state.land.mongolia.inf, 2);
  assert.equal(state.land.siberia.inf, 1);
});

test('a defender that moves out as you move in leaves the region to you', () => {
  const s = blankState();
  s.land.rfe = { owner: 'russia', inf: 2, air: 0 };
  s.land.beijing = { owner: 'china', inf: 4, air: 0 };
  s.land.korea = { owner: 'neutral', inf: 0, air: 0 };
  const { state } = E.resolveTurn(s, {
    china: [move('beijing', 'rfe', 4)],
    russia: [move('rfe', 'korea', 2)],
  });
  assert.equal(state.land.rfe.owner, 'china', 'China walks into the vacated Russian Far East');
  assert.equal(state.land.rfe.inf, 4);
  assert.equal(state.land.korea.owner, 'russia');
});

test('a closed circle of moves all succeed', () => {
  const s = blankState();
  s.land.rfe = { owner: 'russia', inf: 1, air: 0 };
  s.land.korea = { owner: 'russia', inf: 1, air: 0 };
  s.land.beijing = { owner: 'russia', inf: 1, air: 0 };
  const { state } = E.resolveTurn(s, {
    russia: [move('rfe', 'korea', 1), move('korea', 'beijing', 1), move('beijing', 'rfe', 1)],
  });
  for (const id of ['rfe', 'korea', 'beijing']) {
    assert.equal(state.land[id].owner, 'russia');
    assert.equal(state.land[id].inf, 1);
  }
});

test('two armies swapping places fight on the border; the survivor carries on', () => {
  const s = blankState('swap');
  s.land.alaska = { owner: 'ga', inf: 6, air: 0 };
  s.land.rfe = { owner: 'russia', inf: 1, air: 0 };
  const { state, events } = E.resolveTurn(s, {
    ga: [move('alaska', 'rfe', 6)],
    russia: [move('rfe', 'alaska', 1)],
  });
  assert.ok(events.some((e) => /trade places/.test(e.text)), 'a border battle is reported');
  assert.equal(state.land.alaska.owner, 'ga', 'Russia never reaches Alaska');
  assert.equal(state.land.rfe.owner, 'ga', 'Greater America carries on into the Russian Far East');
});

test('two powers moving into the same empty region fight there', () => {
  const s = blankState('clash');
  s.land.rfe = { owner: 'russia', inf: 3, air: 0 };
  s.land.beijing = { owner: 'china', inf: 3, air: 0 };
  const { events } = E.resolveTurn(s, {
    russia: [move('rfe', 'korea', 3)],
    china: [move('beijing', 'korea', 3)],
  });
  assert.ok(events.some((e) => e.phase === 'land' && /Battle for Korea/.test(e.text)));
});

test('a three-way battle includes all three sides', () => {
  const s = blankState('three');
  s.land.korea = { owner: 'neutral', inf: 2, air: 0 };
  s.land.rfe = { owner: 'russia', inf: 3, air: 0 };
  s.land.beijing = { owner: 'china', inf: 3, air: 0 };
  s.land.japan = { owner: 'ga', inf: 3, air: 0 };
  s.sea.nwp.fleets.ga = 2;
  const { events } = E.resolveTurn(s, {
    russia: [move('rfe', 'korea', 3)],
    china: [move('beijing', 'korea', 3)],
    ga: [move('japan', 'korea', 3, 'nwp')],
  });
  const battle = events.find((e) => /Battle for Korea/.test(e.text));
  assert.ok(battle, 'battle reported');
  for (const n of ['Greater America', 'China', 'Russia', 'Neutral garrison']) assert.match(battle.text, new RegExp(n));
});

test('a landing is called off when the power does not control the sea zone', () => {
  // The only fleet that could carry them sails away the same turn.
  const s = blankState('landing');
  s.land.japan = { owner: 'ga', inf: 2, air: 0 };
  s.land.taiwan = { owner: 'neutral', inf: 1, air: 0 };
  s.sea.scs.fleets.ga = 1;
  const { state, events } = E.resolveTurn(s, { ga: [move('japan', 'taiwan', 2, 'scs'), fleet('scs', 'ep', 1)] });
  assert.equal(state.land.japan.inf, 2, 'the infantry stay home');
  assert.equal(state.land.taiwan.owner, 'neutral');
  assert.ok(events.some((e) => e.phase === 'transport' && /called off/.test(e.text)));
});

test('transport capacity limits how many infantry cross', () => {
  const s = blankState();
  s.land.japan = { owner: 'ga', inf: 5, air: 0 };
  s.sea.scs.fleets.ga = 1; // carries 2
  const { state } = E.resolveTurn(s, { ga: [move('japan', 'philippines', 5, 'scs')] });
  assert.equal(state.land.philippines.owner, 'ga');
  assert.equal(state.land.philippines.inf, 2);
  assert.equal(state.land.japan.inf, 3);
});

test('attackers whose origin was lost this turn have nowhere to retreat', () => {
  // One round of fire so both sides survive: China holds Beijing and Russia must fall back.
  // But Greater America lands in the Korea that Russia just emptied, so the retreat has nowhere to go.
  const saved = FS.RULES.maxBattleRounds;
  FS.RULES.maxBattleRounds = 1;
  try {
    const s = blankState('cutoff');
    s.land.korea = { owner: 'russia', inf: 10, air: 0 };
    s.land.beijing = { owner: 'china', inf: 10, air: 0 };
    s.land.japan = { owner: 'ga', inf: 2, air: 0 };
    s.sea.nwp.fleets.ga = 1;
    const { state, events } = E.resolveTurn(s, {
      russia: [move('korea', 'beijing', 10)],
      ga: [move('japan', 'korea', 2, 'nwp')],
    });
    assert.equal(state.land.beijing.owner, 'china');
    assert.equal(state.land.korea.owner, 'ga');
    assert.ok(events.some((e) => /nowhere to fall back/.test(e.text)));
  } finally {
    FS.RULES.maxBattleRounds = saved;
  }
});

test('the same seed and orders always give the same result', () => {
  const a = E.newGame({ seed: 'repeat' });
  const orders = { ga: [move('alaska', 'rfe', 1)], russia: [move('rfe', 'korea', 2)], china: [move('beijing', 'korea', 3)] };
  const r1 = E.resolveTurn(a, orders);
  const r2 = E.resolveTurn(a, orders);
  assert.deepEqual(r1.state, r2.state);
});

test('invalid orders are dropped, valid ones still run', () => {
  const s = E.newGame({ seed: 'v' });
  const v = E.validateOrders(s, 'ga', [move('alaska', 'rfe', 99), move('alaska', 'rfe', 1), move('beijing', 'korea', 1)]);
  assert.equal(v.accepted.length, 1);
  assert.equal(v.rejected.length, 2);
});

test('builds cost points and appear at the end of the turn', () => {
  const s = E.newGame({ seed: 'b' });
  const before = s.points.china;
  const { state } = E.resolveTurn(s, { china: [{ kind: 'build', unit: 'inf', at: 'beijing', count: 3 }] });
  assert.equal(state.land.beijing.inf, s.land.beijing.inf + 3);
  assert.equal(state.points.china, before - 3 + E.income(state, 'china'));
});

test('holding enough objectives wins', () => {
  const s = blankState();
  s.settings.objectivesToWin = 2;
  s.land.japan = { owner: 'ga', inf: 1, air: 0 };
  s.land.eus = { owner: 'ga', inf: 1, air: 0 };
  const { state } = E.resolveTurn(s, {});
  assert.equal(state.winner, 'ga');
});

test('opposing air patrols over the same space fight an air battle first', () => {
  const s = blankState('air');
  s.land.alaska = { owner: 'ga', inf: 3, air: 2 };
  s.land.rfe = { owner: 'russia', inf: 1, air: 1 };
  const { events } = E.resolveTurn(s, {
    ga: [{ kind: 'air', mode: 'patrol', from: 'alaska', to: 'rfe', count: 2 }, move('alaska', 'rfe', 3)],
    russia: [{ kind: 'air', mode: 'patrol', from: 'rfe', to: 'rfe', count: 1 }],
  });
  assert.ok(events.some((e) => e.phase === 'air' && /Air battle over Russian Far East/.test(e.text)));
});

test('a full AI-free game runs to the round limit without crashing', () => {
  let s = E.newGame({ seed: 'idle', roundLimit: 5 });
  for (let i = 0; i < 10 && !s.winner; i++) s = E.resolveTurn(s, {}).state;
  assert.ok(s.winner, 'a winner (or draw) is declared at the round limit');
});

// ---- Structures and research ----

test('research takes effect at the end of the turn and costs points', () => {
  const s = E.newGame({ seed: 'r' });
  const before = s.points.ga;
  const { state } = E.resolveTurn(s, { ga: [{ kind: 'research', field: 'industry' }] });
  assert.equal(state.tech.ga.industry, 1);
  assert.equal(state.points.ga, before - FS.RULES.researchCosts[0] + E.income(state, 'ga'));
  assert.equal(E.income(state, 'ga'), E.income(s, 'ga') + 2, 'Industry tier 1 adds 2 points a turn');
});

test('only one tier of a research field per turn', () => {
  const s = E.newGame({ seed: 'r2' });
  const v = E.validateOrders(s, 'china', [{ kind: 'research', field: 'land' }, { kind: 'research', field: 'land' }]);
  assert.equal(v.accepted.length, 1);
  assert.equal(v.rejected.length, 1);
});

test('research raises unit values', () => {
  const s = E.newGame({ seed: 'r3' });
  const base = E.unitValue('china', 'inf', 'att', s);
  s.tech.china.land = 1;
  assert.equal(E.unitValue('china', 'inf', 'att', s), base + 1);
  s.tech.ga.sea = 3;
  assert.equal(E.carryPerFleet(s, 'ga'), FS.RULES.transportCapacity + 1);
});

test('a factory adds 2 points a turn and a recruitment centre adds an infantry', () => {
  const s = E.newGame({ seed: 'f' });
  s.points.russia = 20;
  const { state } = E.resolveTurn(s, {
    russia: [
      { kind: 'build', unit: 'factory', at: 'moscow', count: 1 },
      { kind: 'build', unit: 'recruit', at: 'siberia', count: 1 },
    ],
  });
  assert.equal(state.land.moscow.structures.factory, 1);
  assert.equal(E.income(state, 'russia'), E.income(s, 'russia') + 2);
  const next = E.resolveTurn(state, {}).state;
  assert.equal(next.land.siberia.inf, state.land.siberia.inf + 1);
});

test('a region cannot exceed a structure limit', () => {
  const s = E.newGame({ seed: 'lim' });
  s.points.ga = 50;
  const v = E.validateOrders(s, 'ga', [{ kind: 'build', unit: 'fort', at: 'eus', count: 1 }, { kind: 'build', unit: 'fort', at: 'eus', count: 1 }]);
  assert.equal(v.accepted.length, 1);
  const c = E.validateOrders(s, 'ga', [{ kind: 'build', unit: 'battery', at: 'canada', count: 1 }]);
  assert.equal(c.accepted.length, 1, 'Canada is coastal');
});

test('anti-aircraft guns fire at enemy air wings over their region', () => {
  const s = blankState('aa');
  s.tech = { ga: {}, china: { airdef: 3 }, russia: {} };
  s.land.alaska = { owner: 'ga', inf: 0, air: 3, structures: {} };
  s.land.rfe = { owner: 'china', inf: 1, air: 0, structures: { aa: 3 } };
  const { events } = E.resolveTurn(s, { ga: [{ kind: 'air', mode: 'patrol', from: 'alaska', to: 'rfe', count: 3 }] });
  assert.ok(events.some((e) => e.phase === 'air' && /anti-aircraft guns over Russian Far East fire 6 shots/.test(e.text)));
});

test('coastal batteries fire at enemy fleets in the zone', () => {
  const s = blankState('bat');
  s.tech = { ga: {}, china: { coastal: 3 }, russia: {} };
  s.land.beijing = { owner: 'china', inf: 1, air: 0, structures: { battery: 1 } };
  s.sea.nwp.fleets.ga = 3;
  const { events } = E.resolveTurn(s, {});
  assert.ok(events.some((e) => e.phase === 'sea' && /coastal battery at Northern China fires into the Northwest Pacific/.test(e.text)));
});
