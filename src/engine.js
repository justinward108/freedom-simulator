// Freedom Simulator — the rules engine.
//
// Pure functions only: no DOM, no clock, no Math.random. Given a state and every power's
// orders, resolveTurn returns the next state and a list of events describing what happened.
// That keeps it ready to move onto a server later, where it would be the single source of truth.
//
// A turn resolves in fixed phases, the same for every player:
//   1. Air        air superiority is fought out over every space with air wings on patrol
//   2. Sea        fleets move and fight for sea zones
//   3. Transport  infantry crossing water need their power to control the zone, with room aboard
//   4. Land       every land move happens at once; collisions are settled; battles are rolled
//   5. Return     air wings fly home (or relocate if home fell)
//   6. Production builds appear and income is paid
//   7. Result     elimination and victory checks
(function (root) {
  const FS = (root.FS = root.FS || {});

  // ---- Small helpers ---------------------------------------------------------

  const clone = (x) => JSON.parse(JSON.stringify(x));

  function powerName(p) {
    if (p === 'neutral') return 'Neutral garrison';
    return FS.RULES.powers[p].name;
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function unitWords(unit, n) {
    if (unit === 'inf') return plural(n, 'infantry', 'infantry');
    if (unit === 'fleet') return plural(n, 'fleet', 'fleets');
    if (unit === 'air') return plural(n, 'air wing', 'air wings');
    const st = FS.RULES.structures[unit];
    return st ? (n > 1 ? n + ' × ' : '') + st.name.toLowerCase() : unit;
  }

  function isStructure(kind) {
    return Object.prototype.hasOwnProperty.call(FS.RULES.structures, kind);
  }

  function techLevel(state, power, field) {
    return (state && state.tech && state.tech[power] && state.tech[power][field]) || 0;
  }

  // Research bonuses on top of a power's base unit values.
  function techBonus(state, power, unit, role) {
    if (!state) return 0;
    const field = unit === 'inf' ? 'land' : unit === 'air' ? 'air' : 'sea';
    const t = techLevel(state, power, field);
    if (role === 'att') return (t >= 1 ? 1 : 0) + (t >= 3 && unit !== 'fleet' ? 1 : 0);
    return t >= 2 ? 1 : 0;
  }

  // A unit's hit value. Pass the state to include research.
  function unitValue(power, unit, role, state) {
    const v = FS.RULES.powers[power].units[unit][role] + techBonus(state, power, unit, role);
    return Math.min(v, FS.RULES.maxHitValue);
  }

  // Infantry each of this power's fleets can carry.
  function carryPerFleet(state, power) {
    return FS.RULES.transportCapacity + (techLevel(state, power, 'sea') >= 3 ? 1 : 0);
  }

  function structuresIn(state, id) {
    return state.land[id].structures || {};
  }

  function soleFleetPower(seaCell) {
    const present = FS.POWERS.filter((p) => seaCell.fleets[p] > 0);
    return present.length === 1 ? present[0] : null;
  }

  function landOwnedBy(state, power) {
    return Object.keys(state.land).filter((id) => state.land[id].owner === power);
  }

  // Points a power earns each turn: the value of every region it holds, plus factories and Industry research.
  function income(state, power) {
    let total = 0;
    for (const id of landOwnedBy(state, power)) total += FS.MAP.land[id].value + (structuresIn(state, id).factory ? 2 : 0);
    return total + 2 * techLevel(state, power, 'industry');
  }

  function objectivesHeld(state, power) {
    return FS.geo.objectives().filter((id) => state.land[id].owner === power);
  }

  // ---- New game ---------------------------------------------------------------

  function newGame(options) {
    const opts = options || {};
    const seed = String(opts.seed != null && opts.seed !== '' ? opts.seed : Date.now());
    const controllers = Object.assign({ ga: 'human', china: 'ai', russia: 'ai' }, opts.controllers || {});

    const dealer = FS.rng.makeRng(FS.rng.hashSeed(seed, 'temperaments'));
    const temperamentKeys = Object.keys(FS.RULES.temperaments);
    const temperaments = {};
    for (const p of FS.POWERS) temperaments[p] = dealer.pick(temperamentKeys);

    const land = {};
    for (const id of Object.keys(FS.MAP.land)) {
      const s = FS.MAP.start.land[id];
      land[id] = { owner: s.owner, inf: s.inf, air: s.air || 0, structures: {} };
    }

    const sea = {};
    for (const id of Object.keys(FS.MAP.sea)) {
      const fleets = {};
      for (const p of FS.POWERS) fleets[p] = (FS.MAP.start.sea[id] && FS.MAP.start.sea[id][p]) || 0;
      sea[id] = { fleets };
    }

    const state = {
      rulesVersion: FS.RULES.version,
      seed,
      round: 1,
      settings: {
        controllers,
        temperaments,
        objectivesToWin: opts.objectivesToWin || FS.RULES.defaultObjectivesToWin,
        roundLimit: opts.roundLimit || FS.RULES.defaultRoundLimit,
      },
      land,
      sea,
      points: {},
      tech: {},
      eliminated: {},
      winner: null,
      winReason: null,
      lastTurn: null,
    };
    for (const p of FS.POWERS) {
      state.tech[p] = {};
      for (const f of Object.keys(FS.RULES.research)) state.tech[p][f] = (FS.RULES.powers[p].startTech || {})[f] || 0;
      state.points[p] = income(state, p);
    }
    return state;
  }

  // ---- Legal targets (shared by validation, the UI and the AI) ----------------------

  // Where infantry in `from` may go: adjacent land, or by sea across a zone where the
  // power has at least one fleet when the turn starts.
  function infTargets(state, power, from) {
    const out = [];
    for (const to of FS.geo.landNeighbors(from)) out.push({ to, via: null });
    for (const via of FS.geo.seasOf(from)) {
      if (!(state.sea[via].fleets[power] > 0)) continue;
      for (const to of FS.MAP.sea[via].coasts) {
        if (to === from) continue;
        out.push({ to, via });
      }
    }
    return out;
  }

  function fleetTargets(state, power, from) {
    return FS.geo.seaNeighbors(from);
  }

  // Patrol: over the base itself, an adjacent land region, or a sea zone the base touches.
  // Rebase: to another of the power's own regions that is adjacent or shares a sea zone.
  function airTargets(state, power, from, mode) {
    if (mode === 'rebase') {
      return Object.keys(state.land).filter(
        (id) =>
          id !== from &&
          state.land[id].owner === power &&
          (FS.geo.landNeighbors(from).includes(id) || FS.geo.sharedSeas(from, id).length > 0)
      );
    }
    return [from].concat(FS.geo.landNeighbors(from), FS.geo.seasOf(from));
  }

  // Infantry and air build in any held land region; fleets in a sea zone touching a held coast.
  // Structures build in a held land region (coastal ones on a coast) that isn't already at the limit.
  function buildSpots(state, power, unit) {
    if (unit === 'fleet') {
      return Object.keys(state.sea).filter((s) => FS.MAP.sea[s].coasts.some((c) => state.land[c].owner === power));
    }
    if (isStructure(unit)) {
      const spec = FS.RULES.structures[unit];
      return landOwnedBy(state, power).filter((id) => (!spec.coastal || FS.geo.isCoastal(id)) && (structuresIn(state, id)[unit] || 0) < spec.max);
    }
    return landOwnedBy(state, power);
  }

  function costOf(power, unit) {
    return isStructure(unit) ? FS.RULES.structures[unit].cost : FS.RULES.powers[power].units[unit].cost;
  }

  function researchCost(state, power, field) {
    return FS.RULES.researchCosts[techLevel(state, power, field)];
  }

  // ---- Order validation ---------------------------------------------------------

  // Checks orders in sequence against what the power actually has. Bad orders are dropped
  // with a reason rather than failing the whole set, so one mistake never voids a turn.
  function validateOrders(state, power, orders) {
    const accepted = [];
    const rejected = [];
    const used = { inf: {}, air: {}, fleet: {} };
    let pointsUsed = 0;

    const reject = (order, reason) => rejected.push({ order, reason });

    const researched = {};
    const structuresPending = {};
    for (const raw of orders || []) {
      const o = Object.assign({}, raw);
      if (o.kind === 'research') o.count = 1;
      const count = Number(o.count);
      if (!Number.isInteger(count) || count < 1) {
        reject(o, 'the count must be a whole number of at least 1');
        continue;
      }
      o.count = count;

      if (o.kind === 'move' && o.unit === 'inf') {
        const cell = state.land[o.from];
        if (!cell || cell.owner !== power) { reject(o, 'infantry can only move out of a region you hold'); continue; }
        const left = cell.inf - (used.inf[o.from] || 0);
        if (count > left) { reject(o, 'not enough infantry in ' + FS.geo.spaceName(o.from)); continue; }
        const via = o.via || null;
        const legal = infTargets(state, power, o.from).some((t) => t.to === o.to && t.via === via);
        if (!legal) { reject(o, FS.geo.spaceName(o.to) + ' is not reachable from ' + FS.geo.spaceName(o.from)); continue; }
        o.via = via;
        used.inf[o.from] = (used.inf[o.from] || 0) + count;
        accepted.push(o);
      } else if (o.kind === 'move' && o.unit === 'fleet') {
        const cell = state.sea[o.from];
        if (!cell) { reject(o, 'fleets move between sea zones'); continue; }
        const left = cell.fleets[power] - (used.fleet[o.from] || 0);
        if (count > left) { reject(o, 'not enough fleets in ' + FS.geo.spaceName(o.from)); continue; }
        if (!fleetTargets(state, power, o.from).includes(o.to)) { reject(o, 'fleets can only move to an adjacent sea zone'); continue; }
        used.fleet[o.from] = (used.fleet[o.from] || 0) + count;
        accepted.push(o);
      } else if (o.kind === 'air') {
        const cell = state.land[o.from];
        if (!cell || cell.owner !== power) { reject(o, 'air wings fly from a region you hold'); continue; }
        const left = cell.air - (used.air[o.from] || 0);
        if (count > left) { reject(o, 'not enough air wings in ' + FS.geo.spaceName(o.from)); continue; }
        const mode = o.mode === 'rebase' ? 'rebase' : 'patrol';
        if (!airTargets(state, power, o.from, mode).includes(o.to)) { reject(o, FS.geo.spaceName(o.to) + ' is out of range'); continue; }
        o.mode = mode;
        used.air[o.from] = (used.air[o.from] || 0) + count;
        accepted.push(o);
      } else if (o.kind === 'build') {
        if (!FS.RULES.powers[power].units[o.unit] && !isStructure(o.unit)) { reject(o, 'unknown unit'); continue; }
        const cost = costOf(power, o.unit) * count;
        if (pointsUsed + cost > state.points[power]) { reject(o, 'not enough points'); continue; }
        if (!buildSpots(state, power, o.unit).includes(o.at)) { reject(o, 'cannot build that there'); continue; }
        if (isStructure(o.unit)) {
          const key = o.at + '|' + o.unit;
          const already = (structuresIn(state, o.at)[o.unit] || 0) + (structuresPending[key] || 0);
          if (already + count > FS.RULES.structures[o.unit].max) { reject(o, 'a region can have at most ' + FS.RULES.structures[o.unit].max + ' ' + FS.RULES.structures[o.unit].short); continue; }
          structuresPending[key] = (structuresPending[key] || 0) + count;
        }
        pointsUsed += cost;
        accepted.push(o);
      } else if (o.kind === 'research') {
        const field = FS.RULES.research[o.field];
        if (!field) { reject(o, 'unknown research field'); continue; }
        if (techLevel(state, power, o.field) >= field.tiers.length) { reject(o, field.name + ' is fully researched'); continue; }
        if (researched[o.field]) { reject(o, 'one tier of ' + field.name + ' per turn'); continue; }
        const cost = researchCost(state, power, o.field);
        if (pointsUsed + cost > state.points[power]) { reject(o, 'not enough points'); continue; }
        researched[o.field] = true;
        pointsUsed += cost;
        accepted.push(o);
      } else {
        reject(o, 'unknown order');
      }
    }
    return { accepted, rejected, pointsUsed };
  }

  // What a power still has free once a list of orders is counted. Used by the order screen.
  function remaining(state, power, orders) {
    const v = validateOrders(state, power, orders);
    const land = {};
    const sea = {};
    for (const id of Object.keys(state.land)) land[id] = { inf: state.land[id].inf, air: state.land[id].air };
    for (const id of Object.keys(state.sea)) sea[id] = state.sea[id].fleets[power];
    for (const o of v.accepted) {
      if (o.kind === 'move' && o.unit === 'inf') land[o.from].inf -= o.count;
      if (o.kind === 'move' && o.unit === 'fleet') sea[o.from] -= o.count;
      if (o.kind === 'air') land[o.from].air -= o.count;
    }
    return { land, sea, points: state.points[power] - v.pointsUsed, accepted: v.accepted, rejected: v.rejected };
  }

  function describeOrder(o, power) {
    const who = power ? powerName(power) + ': ' : '';
    const name = FS.geo.spaceName;
    if (o.kind === 'move' && o.unit === 'inf') {
      return who + unitWords('inf', o.count) + ' ' + name(o.from) + ' → ' + name(o.to) + (o.via ? ' (by sea across the ' + name(o.via) + ')' : '');
    }
    if (o.kind === 'move' && o.unit === 'fleet') return who + unitWords('fleet', o.count) + ' ' + name(o.from) + ' → ' + name(o.to);
    if (o.kind === 'air' && o.mode === 'rebase') return who + unitWords('air', o.count) + ' rebase ' + name(o.from) + ' → ' + name(o.to);
    if (o.kind === 'air') return who + unitWords('air', o.count) + ' from ' + name(o.from) + ' patrol over ' + name(o.to);
    if (o.kind === 'build') return who + 'build ' + unitWords(o.unit, o.count) + ' in ' + name(o.at);
    if (o.kind === 'research') {
      const f = FS.RULES.research[o.field];
      return who + 'research ' + (f ? f.name : o.field);
    }
    return who + 'unknown order';
  }

  function orderSpaces(o) {
    if (o.kind === 'build') return [o.at];
    if (o.kind === 'research') return [];
    return [o.from, o.to].concat(o.via ? [o.via] : []);
  }

  // ---- Battles ----------------------------------------------------------------------

  // A side in a battle: one power's units, possibly from several origins (kept apart so
  // survivors can retreat to where they came from). `support` = air wings that fire in the
  // first round only and cannot be hit there.
  function makeSide(power, role, forces, value, support) {
    return { power, role, forces: forces.filter((f) => f.count > 0).map((f) => Object.assign({}, f)), value, support: support || [] };
  }

  function sideTotal(side) {
    return side.forces.reduce((n, f) => n + f.count, 0);
  }

  function removeCasualties(side, n) {
    for (let i = 0; i < n; i++) {
      let biggest = null;
      for (const f of side.forces) if (f.count > 0 && (!biggest || f.count > biggest.count)) biggest = f;
      if (!biggest) return;
      biggest.count -= 1;
    }
  }

  // Every side fires at once each round. Each hit lands on whichever enemy side has the most
  // units left, so in a three-way battle the biggest force draws the most fire.
  function fight(sides, rng) {
    for (let round = 1; round <= FS.RULES.maxBattleRounds; round++) {
      const alive = sides.filter((s) => sideTotal(s) > 0);
      if (alive.length < 2) break;

      const hits = alive.map((s) => {
        let h = 0;
        const n = sideTotal(s);
        for (let i = 0; i < n; i++) if (rng.d6() <= s.value) h++;
        for (const sup of s.support) {
          if (round > (sup.rounds || 1)) continue;
          for (let i = 0; i < sup.count; i++) if (rng.d6() <= sup.value) h++;
        }
        return h;
      });

      const pending = new Map(alive.map((s) => [s, 0]));
      alive.forEach((s, i) => {
        for (let k = 0; k < hits[i]; k++) {
          let target = null;
          let most = 0;
          for (const t of alive) {
            if (t === s) continue;
            const left = sideTotal(t) - pending.get(t);
            if (left > most) { target = t; most = left; }
          }
          if (!target) break;
          pending.set(target, pending.get(target) + 1);
        }
      });
      for (const [s, n] of pending) removeCasualties(s, n);
    }
  }

  // Who holds the space after a battle: a surviving defender always holds; otherwise the
  // only surviving attacker, or the largest one. A tie between attackers means nobody takes it.
  function decideHolder(sides) {
    const alive = sides.filter((s) => sideTotal(s) > 0);
    if (alive.length === 0) return null;
    const def = alive.find((s) => s.role === 'def');
    if (def) return def.power;
    if (alive.length === 1) return alive[0].power;
    const sorted = alive.slice().sort((a, b) => sideTotal(b) - sideTotal(a));
    if (sideTotal(sorted[0]) === sideTotal(sorted[1])) return null;
    return sorted[0].power;
  }

  function battleSummary(before, sides) {
    return sides.map((s, i) => powerName(s.power) + ' ' + before[i] + ' → ' + sideTotal(s)).join(', ');
  }

  // Combine orders that move the same units along the same route.
  function aggregateMoves(moves) {
    const byKey = new Map();
    for (const m of moves) {
      const key = [m.power, m.unit, m.from, m.to, m.via || ''].join('|');
      if (byKey.has(key)) byKey.get(key).count += m.count;
      else byKey.set(key, Object.assign({}, m));
    }
    return Array.from(byKey.values());
  }

  // Two forces trading places meet on the border and fight there first. If one side is
  // wiped out the other carries on; if both survive, both fall back to where they started.
  function resolveSwaps(state, moves, unit, rng, ev, phase) {
    const bounced = [];
    for (const a of moves) {
      if (a.count <= 0 || a.via) continue;
      for (const b of moves) {
        if (b === a || b.count <= 0 || b.via || b.power === a.power || a.count <= 0) continue;
        if (!(b.from === a.to && b.to === a.from)) continue;
        const sa = makeSide(a.power, 'att', [{ origin: a.from, count: a.count }], unitValue(a.power, unit, 'att', state));
        const sb = makeSide(b.power, 'att', [{ origin: b.from, count: b.count }], unitValue(b.power, unit, 'att', state));
        const before = [a.count, b.count];
        fight([sa, sb], rng);
        const ca = sideTotal(sa);
        const cb = sideTotal(sb);
        let text = powerName(a.power) + ' and ' + powerName(b.power) + ' tried to trade places between ' +
          FS.geo.spaceName(a.from) + ' and ' + FS.geo.spaceName(a.to) + ' and met on the way: ' + battleSummary(before, [sa, sb]) + '.';
        if (ca > 0 && cb > 0) {
          bounced.push({ power: a.power, origin: a.from, count: ca });
          bounced.push({ power: b.power, origin: b.from, count: cb });
          a.count = 0;
          b.count = 0;
          text += ' Neither broke through; both fall back.';
        } else {
          a.count = ca;
          b.count = cb;
          const winner = ca > 0 ? a : cb > 0 ? b : null;
          text += winner ? ' ' + powerName(winner.power) + ' carries on.' : ' Both forces were destroyed.';
        }
        ev(phase, text, [a.from, a.to]);
      }
    }
    return bounced;
  }

  // An air wing whose base fell flies to the nearest held region, or is lost.
  function relocateAir(state, power, near, count, ev) {
    const options = landOwnedBy(state, power).filter(
      (id) => FS.geo.landNeighbors(near).includes(id) || FS.geo.sharedSeas(near, id).length > 0
    );
    if (options.length === 0) {
      ev('return', powerName(power) + ' lost ' + unitWords('air', count) + ': ' + FS.geo.spaceName(near) + ' fell and there was nowhere to land.', [near]);
      return;
    }
    options.sort((a, b) => state.land[b].inf - state.land[a].inf);
    state.land[options[0]].air += count;
    ev('return', powerName(power) + ' ' + unitWords('air', count) + ' could not return to ' + FS.geo.spaceName(near) + ' and landed in ' + FS.geo.spaceName(options[0]) + '.', [near, options[0]]);
  }

  // ---- Turn resolution ------------------------------------------------------------------

  function resolveTurn(prev, ordersByPower) {
    const state = clone(prev);
    const rng = FS.rng.makeRng(FS.rng.hashSeed(state.seed, 'round', state.round));
    const events = [];
    const ev = (phase, text, spaces, power) => events.push({ phase, text, spaces: spaces || [], power: power || null });
    const name = FS.geo.spaceName;
    const alive = FS.POWERS.filter((p) => !state.eliminated[p]);

    // ---- 0. Orders revealed ----
    const orders = {};
    for (const p of FS.POWERS) {
      orders[p] = [];
      if (state.eliminated[p]) continue;
      const v = validateOrders(prev, p, ordersByPower[p] || []);
      orders[p] = v.accepted;
      for (const o of v.accepted) ev('orders', describeOrder(o, p), orderSpaces(o), p);
      for (const r of v.rejected) ev('orders', powerName(p) + ': an order was dropped (' + r.reason + ').', [], p);
      if (v.accepted.length === 0) ev('orders', powerName(p) + ' gave no orders. Every unit holds.', [], p);
    }

    // ---- 1. Air ----
    const flights = [];
    const rebases = [];
    for (const p of alive) {
      for (const o of orders[p]) {
        if (o.kind !== 'air') continue;
        state.land[o.from].air -= o.count;
        if (o.mode === 'rebase') rebases.push({ power: p, from: o.from, to: o.to, count: o.count });
        else flights.push({ power: p, from: o.from, to: o.to, count: o.count, survive: 0 });
      }
    }

    const airOver = {};
    for (const f of flights) {
      airOver[f.to] = airOver[f.to] || {};
      airOver[f.to][f.power] = (airOver[f.to][f.power] || 0) + f.count;
    }
    // Anti-aircraft guns fire first, at every enemy air wing over their region.
    for (const space of Object.keys(airOver)) {
      if (!FS.geo.isLand(space)) continue;
      const gunsOwner = state.land[space].owner;
      const guns = structuresIn(state, space).aa || 0;
      if (!guns || gunsOwner === 'neutral') continue;
      const targets = Object.keys(airOver[space]).filter((p) => p !== gunsOwner && airOver[space][p] > 0);
      if (!targets.length) continue;
      const tier = techLevel(state, gunsOwner, 'airdef');
      const dice = guns * (tier >= 3 ? 2 : 1);
      const hitOn = 2 + Math.min(tier, 2);
      let hits = 0;
      for (let i = 0; i < dice; i++) if (rng.d6() <= hitOn) hits++;
      const downed = {};
      for (let k = 0; k < hits; k++) {
        const t = targets.filter((p) => airOver[space][p] > 0).sort((a, b) => airOver[space][b] - airOver[space][a])[0];
        if (!t) break;
        airOver[space][t] -= 1;
        downed[t] = (downed[t] || 0) + 1;
      }
      const list = Object.keys(downed).map((p) => unitWords('air', downed[p]) + ' of ' + powerName(p));
      ev('air', powerName(gunsOwner) + ' anti-aircraft guns over ' + name(space) + ' fire ' + dice + ' shot' + (dice > 1 ? 's' : '') + (list.length ? ' and bring down ' + list.join(' and ') + '.' : ' and miss.'), [space], gunsOwner);
    }

    const superiority = {}; // space -> power
    const airLeft = {}; // space -> { power: survivors }
    for (const space of Object.keys(airOver)) {
      const powers = Object.keys(airOver[space]).filter((p) => airOver[space][p] > 0);
      if (powers.length === 0) {
        airLeft[space] = {};
        continue;
      }
      if (powers.length === 1) {
        superiority[space] = powers[0];
        airLeft[space] = Object.assign({}, airOver[space]);
        ev('air', powerName(powers[0]) + ' patrols over ' + name(space) + ' unopposed and holds air superiority there.', [space], powers[0]);
        continue;
      }
      const sides = powers.map((p) => makeSide(p, 'att', [{ origin: null, count: airOver[space][p] }], unitValue(p, 'air', 'att', state)));
      const before = sides.map(sideTotal);
      fight(sides, rng);
      airLeft[space] = {};
      for (const s of sides) airLeft[space][s.power] = sideTotal(s);
      const left = sides.filter((s) => sideTotal(s) > 0);
      let text = 'Air battle over ' + name(space) + ': ' + battleSummary(before, sides) + '.';
      if (left.length === 1) {
        superiority[space] = left[0].power;
        text += ' ' + powerName(left[0].power) + ' wins air superiority.';
      } else {
        text += ' The skies stay contested.';
      }
      ev('air', text, [space]);
    }
    for (const space of Object.keys(airLeft)) {
      for (const p of Object.keys(airLeft[space])) {
        let s = airLeft[space][p];
        for (const f of flights) {
          if (f.to !== space || f.power !== p) continue;
          f.survive = Math.min(f.count, s);
          s -= f.survive;
        }
      }
    }
    // The power holding the sky over a space adds its surviving patrols to battles there.
    // Wings that flew from an airfield fire for two rounds instead of one.
    const airSupport = (space, power) => {
      if (superiority[space] !== power) return [];
      const out = [];
      for (const f of flights) {
        if (f.to !== space || f.power !== power || f.survive <= 0) continue;
        out.push({ count: f.survive, value: unitValue(power, 'air', 'att', state), rounds: structuresIn(state, f.from).airfield ? 2 : 1 });
      }
      return out;
    };

    // ---- 2. Sea ----
    const seaControlAtStart = {};
    for (const z of Object.keys(prev.sea)) seaControlAtStart[z] = soleFleetPower(prev.sea[z]);

    const fleetMoves = aggregateMoves(
      alive.flatMap((p) => orders[p].filter((o) => o.kind === 'move' && o.unit === 'fleet').map((o) => Object.assign({ power: p }, o)))
    );
    for (const m of fleetMoves) state.sea[m.from].fleets[m.power] -= m.count;
    const seaBounced = resolveSwaps(state, fleetMoves, 'fleet', rng, ev, 'sea');
    for (const b of seaBounced) state.sea[b.origin].fleets[b.power] += b.count;

    const seaRetreats = [];
    for (const z of Object.keys(state.sea)) {
      const forcesBy = {};
      for (const p of alive) {
        const staying = state.sea[z].fleets[p];
        const arriving = fleetMoves.filter((m) => m.power === p && m.to === z && m.count > 0).map((m) => ({ origin: m.from, count: m.count }));
        const forces = (staying > 0 ? [{ origin: z, count: staying, home: true }] : []).concat(arriving);
        if (forces.length) forcesBy[p] = makeSide(p, 'att', forces, 0);
      }

      // Coastal batteries on every shore of the zone fire at enemy fleets in it first.
      for (const c of FS.MAP.sea[z].coasts) {
        const gunner = state.land[c].owner;
        const batteries = structuresIn(state, c).battery || 0;
        if (!batteries || gunner === 'neutral') continue;
        const targets = Object.keys(forcesBy).filter((p) => p !== gunner && sideTotal(forcesBy[p]) > 0);
        if (!targets.length) continue;
        const tier = techLevel(state, gunner, 'coastal');
        const dice = batteries * (tier >= 3 ? 2 : 1);
        const hitOn = 2 + Math.min(tier, 2);
        let hits = 0;
        for (let i = 0; i < dice; i++) if (rng.d6() <= hitOn) hits++;
        const sunk = {};
        for (let k = 0; k < hits; k++) {
          const t = targets.filter((p) => sideTotal(forcesBy[p]) > 0).sort((a, b) => sideTotal(forcesBy[b]) - sideTotal(forcesBy[a]))[0];
          if (!t) break;
          removeCasualties(forcesBy[t], 1);
          sunk[t] = (sunk[t] || 0) + 1;
        }
        const list = Object.keys(sunk).map((p) => unitWords('fleet', sunk[p]) + ' of ' + powerName(p));
        ev('sea', powerName(gunner) + ' coastal battery at ' + name(c) + ' fires into the ' + name(z) + (list.length ? ' and sinks ' + list.join(' and ') + '.' : ' and misses.'), [c, z], gunner);
      }
      for (const p of Object.keys(forcesBy)) if (sideTotal(forcesBy[p]) === 0) state.sea[z].fleets[p] = 0;

      // A naval base on any shore of the zone makes its owner's fleets there hit on 1 more.
      const baseBonus = (p) => (FS.MAP.sea[z].coasts.some((c) => state.land[c].owner === p && structuresIn(state, c).navalbase) ? 1 : 0);
      const sides = [];
      for (const p of Object.keys(forcesBy)) {
        const f = forcesBy[p];
        if (sideTotal(f) === 0) continue;
        const staying = f.forces.filter((x) => x.home).reduce((n, x) => n + x.count, 0);
        const role = seaControlAtStart[z] === p && staying > 0 ? 'def' : 'att';
        const value = Math.min(FS.RULES.maxHitValue, unitValue(p, 'fleet', role, state) + baseBonus(p));
        sides.push(makeSide(p, role, f.forces, value, airSupport(z, p)));
      }
      if (sides.length === 0) continue;
      if (sides.length === 1) {
        const s = sides[0];
        state.sea[z].fleets[s.power] = sideTotal(s);
        if (seaControlAtStart[z] !== s.power) ev('sea', powerName(s.power) + ' fleets enter the ' + name(z) + ' unopposed.', [z], s.power);
        continue;
      }
      const before = sides.map(sideTotal);
      fight(sides, rng);
      const holder = decideHolder(sides);
      let text = 'Naval battle in the ' + name(z) + ': ' + battleSummary(before, sides) + '.';
      for (const s of sides) {
        const home = s.forces.filter((f) => f.home).reduce((n, f) => n + f.count, 0);
        if (s.power === holder) {
          state.sea[z].fleets[s.power] = sideTotal(s);
        } else {
          // Fleets already in the zone stay (it remains contested); arrivals fall back.
          state.sea[z].fleets[s.power] = home;
          for (const f of s.forces) if (!f.home && f.count > 0) seaRetreats.push({ power: s.power, origin: f.origin, count: f.count, from: z });
        }
      }
      text += holder ? ' ' + powerName(holder) + ' holds the zone.' : ' Nobody holds the zone.';
      ev('sea', text, [z]);
    }
    for (const r of seaRetreats) {
      state.sea[r.origin].fleets[r.power] += r.count;
      ev('sea', powerName(r.power) + ' ' + unitWords('fleet', r.count) + ' fall back from the ' + name(r.from) + ' to the ' + name(r.origin) + '.', [r.from, r.origin], r.power);
    }

    // ---- 3. Transport ----
    const infMoves = aggregateMoves(
      alive.flatMap((p) => orders[p].filter((o) => o.kind === 'move' && o.unit === 'inf').map((o) => Object.assign({ power: p }, o)))
    );
    const lift = {};
    for (const m of infMoves) {
      if (!m.via) continue;
      const controller = soleFleetPower(state.sea[m.via]);
      const key = m.power + '|' + m.via;
      const capacity = state.sea[m.via].fleets[m.power] * carryPerFleet(state, m.power);
      const used = lift[key] || 0;
      if (controller !== m.power) {
        ev('transport', powerName(m.power) + ' landing at ' + name(m.to) + ' called off: it does not control the ' + name(m.via) + '. ' + unitWords('inf', m.count) + ' stay in ' + name(m.from) + '.', [m.from, m.via, m.to], m.power);
        m.count = 0;
        continue;
      }
      if (used + m.count > capacity) {
        const room = Math.max(0, capacity - used);
        ev('transport', powerName(m.power) + ' had room for ' + room + ' of ' + m.count + ' infantry crossing the ' + name(m.via) + ' (' + carryPerFleet(state, m.power) + ' per fleet). The rest stay in ' + name(m.from) + '.', [m.from, m.via, m.to], m.power);
        m.count = room;
      }
      lift[key] = used + m.count;
      if (m.count > 0) ev('transport', powerName(m.power) + ' carries ' + unitWords('inf', m.count) + ' from ' + name(m.from) + ' toward ' + name(m.to) + '.', [m.from, m.via, m.to], m.power);
    }

    // ---- 4. Land ----
    for (const m of infMoves) state.land[m.from].inf -= m.count;
    const landBounced = resolveSwaps(state, infMoves, 'inf', rng, ev, 'land');
    for (const b of landBounced) state.land[b.origin].inf += b.count;

    const landRetreats = [];
    const captured = [];
    for (const r of Object.keys(state.land)) {
      const cell = state.land[r];
      const owner = cell.owner;
      const arrivalsBy = {};
      for (const m of infMoves) {
        if (m.to !== r || m.count <= 0) continue;
        arrivalsBy[m.power] = arrivalsBy[m.power] || [];
        arrivalsBy[m.power].push({ origin: m.from, count: m.count });
      }

      const sides = [];
      const ownerArrivals = owner !== 'neutral' ? arrivalsBy[owner] || [] : [];
      if (cell.inf > 0 || ownerArrivals.length > 0) {
        let value;
        let support = [];
        if (owner === 'neutral') {
          value = FS.RULES.neutralDefense;
        } else {
          const bonus = FS.MAP.land[r].home === owner ? FS.RULES.powers[owner].homeDefenseBonus : 0;
          const fort = structuresIn(state, r).fort ? 1 : 0;
          value = Math.min(FS.RULES.maxHitValue, unitValue(owner, 'inf', 'def', state) + bonus + fort);
          support = airSupport(r, owner);
          // Air wings left at home help defend it (for two rounds from an airfield).
          if (cell.air > 0) support = support.concat([{ count: cell.air, value: unitValue(owner, 'air', 'def', state), rounds: structuresIn(state, r).airfield ? 2 : 1 }]);
        }
        sides.push(makeSide(owner, 'def', [{ origin: r, count: cell.inf, home: true }].concat(ownerArrivals), value, support));
      }
      for (const p of Object.keys(arrivalsBy)) {
        if (p === owner) continue;
        sides.push(makeSide(p, 'att', arrivalsBy[p], unitValue(p, 'inf', 'att', state), airSupport(r, p)));
      }
      if (sides.length === 0) continue;

      if (sides.length === 1) {
        const s = sides[0];
        cell.inf = sideTotal(s);
        if (s.power !== owner) {
          captured.push({ region: r, from: owner, to: s.power });
          cell.owner = s.power;
          ev('land', powerName(s.power) + ' moves into ' + name(r) + ' unopposed and takes it.', [r], s.power);
        }
        continue;
      }

      const before = sides.map(sideTotal);
      fight(sides, rng);
      const holder = decideHolder(sides);
      let text = 'Battle for ' + name(r) + ': ' + battleSummary(before, sides) + '.';
      for (const s of sides) {
        if (s.power === holder || s.role === 'def') continue;
        for (const f of s.forces) if (f.count > 0) landRetreats.push({ power: s.power, origin: f.origin, count: f.count, from: r });
      }
      if (holder) {
        cell.inf = sideTotal(sides.find((s) => s.power === holder));
        if (holder !== owner) {
          captured.push({ region: r, from: owner, to: holder });
          cell.owner = holder;
          text += ' ' + powerName(holder) + ' takes ' + name(r) + '.';
        } else {
          text += ' ' + powerName(holder) + ' holds.';
        }
      } else {
        cell.inf = 0;
        text += ' Nobody holds the ground; it stays ' + (owner === 'neutral' ? 'neutral' : 'with ' + powerName(owner)) + ', empty.';
      }
      ev('land', text, [r]);
    }

    for (const t of landRetreats) {
      if (state.land[t.origin].owner === t.power) {
        state.land[t.origin].inf += t.count;
        ev('land', powerName(t.power) + ' ' + unitWords('inf', t.count) + ' fall back from ' + name(t.from) + ' to ' + name(t.origin) + '.', [t.from, t.origin], t.power);
      } else {
        ev('land', powerName(t.power) + ' ' + unitWords('inf', t.count) + ' had nowhere to fall back to — ' + name(t.origin) + ' was lost — and are destroyed.', [t.from, t.origin], t.power);
      }
    }

    // Air wings based in a captured region scramble to a neighbouring held region.
    for (const c of captured) {
      const cell = state.land[c.region];
      if (cell.air > 0 && c.from !== 'neutral') {
        const n = cell.air;
        cell.air = 0;
        relocateAir(state, c.from, c.region, n, ev);
      } else {
        cell.air = 0;
      }
    }

    // ---- 5. Air wings return ----
    for (const f of flights) {
      if (f.survive <= 0) continue;
      if (state.land[f.from].owner === f.power) state.land[f.from].air += f.survive;
      else relocateAir(state, f.power, f.from, f.survive, ev);
    }
    for (const r of rebases) {
      if (state.land[r.to].owner === r.power) {
        state.land[r.to].air += r.count;
        ev('return', powerName(r.power) + ' ' + unitWords('air', r.count) + ' rebase to ' + name(r.to) + '.', [r.from, r.to], r.power);
      } else if (state.land[r.from].owner === r.power) {
        state.land[r.from].air += r.count;
        ev('return', powerName(r.power) + ' rebase to ' + name(r.to) + ' called off; it was lost this turn.', [r.from, r.to], r.power);
      } else {
        relocateAir(state, r.power, r.from, r.count, ev);
      }
    }

    // Snapshot after the fighting, before builds appear, so the reveal can show each stage.
    const afterBattles = clone(state);

    // ---- 6. Production ----
    for (const p of alive) {
      let spent = 0;
      for (const o of orders[p]) {
        if (o.kind === 'research') {
          const cost = researchCost(state, p, o.field);
          state.tech[p][o.field] += 1;
          spent += cost;
          const f = FS.RULES.research[o.field];
          ev('production', powerName(p) + ' completes ' + f.name + ' research, tier ' + state.tech[p][o.field] + ': ' + f.tiers[state.tech[p][o.field] - 1] + '.', [], p);
          continue;
        }
        if (o.kind !== 'build') continue;
        if (!buildSpots(state, p, o.unit).includes(o.at)) {
          ev('production', powerName(p) + ' build in ' + name(o.at) + ' cancelled: the region was lost. No points spent.', [o.at], p);
          continue;
        }
        if (o.unit === 'fleet') state.sea[o.at].fleets[p] += o.count;
        else if (isStructure(o.unit)) {
          const st = (state.land[o.at].structures = state.land[o.at].structures || {});
          st[o.unit] = Math.min(FS.RULES.structures[o.unit].max, (st[o.unit] || 0) + o.count);
        } else state.land[o.at][o.unit] += o.count;
        spent += costOf(p, o.unit) * o.count;
        ev('production', powerName(p) + ' builds ' + unitWords(o.unit, o.count) + ' in ' + name(o.at) + '.', [o.at], p);
      }

      // Recruitment centres raise one infantry each, wherever the power still holds them.
      const recruited = landOwnedBy(state, p).filter((id) => structuresIn(state, id).recruit);
      for (const id of recruited) state.land[id].inf += 1;
      if (recruited.length) {
        ev('production', powerName(p) + ' recruitment centres raise ' + unitWords('inf', recruited.length) + ' (' + recruited.map((id) => FS.MAP.land[id].label).join(', ') + ').', recruited, p);
      }

      const earned = income(state, p);
      state.points[p] = prev.points[p] - spent + earned;
      ev('production', powerName(p) + ' earns ' + earned + ' points (' + state.points[p] + ' to spend next turn).', [], p);
    }

    // ---- 7. Result ----
    for (const p of alive) {
      if (landOwnedBy(state, p).length === 0) {
        state.eliminated[p] = true;
        for (const z of Object.keys(state.sea)) state.sea[z].fleets[p] = 0;
        ev('result', powerName(p) + ' holds no territory and is out of the war.', [], p);
      }
    }
    const standing = FS.POWERS.filter((p) => !state.eliminated[p]);
    const rank = (list) => {
      const scored = list.map((p) => ({ p, obj: objectivesHeld(state, p).length, inc: income(state, p) }));
      scored.sort((a, b) => b.obj - a.obj || b.inc - a.inc);
      if (scored.length > 1 && scored[0].obj === scored[1].obj && scored[0].inc === scored[1].inc) return 'draw';
      return scored[0].p;
    };
    if (standing.length === 1) {
      state.winner = standing[0];
      state.winReason = 'last power standing';
    } else if (standing.length === 0) {
      state.winner = 'draw';
      state.winReason = 'no power left standing';
    } else {
      const reached = standing.filter((p) => objectivesHeld(state, p).length >= state.settings.objectivesToWin);
      if (reached.length > 0) {
        state.winner = rank(reached);
        state.winReason = 'held ' + state.settings.objectivesToWin + ' objectives';
      } else if (state.round >= state.settings.roundLimit) {
        state.winner = rank(standing);
        state.winReason = 'most objectives when the round limit was reached';
      }
    }
    if (state.winner) {
      ev('result', state.winner === 'draw' ? 'The war ends in a draw.' : powerName(state.winner) + ' wins: ' + state.winReason + '.', [], state.winner === 'draw' ? null : state.winner);
    }

    state.lastTurn = { round: prev.round, orders, events };
    if (!state.winner) state.round += 1;
    return { state, events, afterBattles };
  }

  FS.engine = {
    newGame,
    resolveTurn,
    validateOrders,
    remaining,
    infTargets,
    fleetTargets,
    airTargets,
    buildSpots,
    describeOrder,
    orderSpaces,
    income,
    objectivesHeld,
    landOwnedBy,
    soleFleetPower,
    unitValue,
    powerName,
    techLevel,
    carryPerFleet,
    structuresIn,
    isStructure,
    costOf,
    researchCost,
    // exposed for tests
    _internal: { fight, decideHolder, makeSide, sideTotal },
  };
})(globalThis);
