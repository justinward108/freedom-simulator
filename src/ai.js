// Freedom Simulator — computer-controlled powers.
//
// Deliberately simple and readable. Because orders are simultaneous, the AI never reacts
// mid-turn: it looks at the board, guesses, and commits, exactly like a human.
// Each AI power gets a temperament dealt at random per game (see RULES.temperaments),
// so no power has a fixed personality.
(function (root) {
  const FS = (root.FS = root.FS || {});

  const BUILD_PREFERENCES = {
    ga: ['fleet', 'inf', 'air', 'inf'],
    china: ['inf', 'inf', 'inf', 'fleet', 'air'],
    russia: ['inf', 'inf', 'air', 'inf'],
  };

  function planOrders(state, power) {
    const E = FS.engine;
    const geo = FS.geo;
    const R = FS.RULES;
    const MAP = FS.MAP;
    const dealt = R.temperaments[state.settings.temperaments[power]] || R.temperaments.balanced;
    // Near the round limit every AI stops hoarding and goes for objectives.
    const lateGame = state.round >= state.settings.roundLimit - 2;
    const temper = lateGame
      ? { attackRatio: Math.min(dealt.attackRatio, 1.0), homeGuard: Math.min(dealt.homeGuard, 0.3) }
      : dealt;
    const orders = [];
    const mine = E.landOwnedBy(state, power);
    const isMine = (id) => state.land[id].owner === power;
    const infAtt = E.unitValue(power, 'inf', 'att');

    // ---- How dangerous is each region? ----
    // Enemy infantry next door, plus enemy infantry that enemy fleets could land here.
    function threat(r) {
      let t = 0;
      for (const n of geo.landNeighbors(r)) {
        const c = state.land[n];
        if (c.owner === power || c.owner === 'neutral') continue;
        // An enemy stack next to several of our regions can only hit one of them with its full weight.
        const fronts = geo.landNeighbors(n).filter((x) => state.land[x].owner === power).length || 1;
        t += (c.inf * E.unitValue(c.owner, 'inf', 'att')) / Math.sqrt(fronts);
      }
      for (const z of geo.seasOf(r)) {
        for (const p of FS.POWERS) {
          if (p === power || !state.sea[z].fleets[p]) continue;
          let carry = 0;
          for (const c of MAP.sea[z].coasts) if (c !== r && state.land[c].owner === p) carry += state.land[c].inf;
          t += Math.min(state.sea[z].fleets[p] * R.transportCapacity, carry) * E.unitValue(p, 'inf', 'att');
        }
      }
      return t;
    }

    function defenseOf(r) {
      const c = state.land[r];
      if (c.owner === 'neutral') return c.inf * R.neutralDefense;
      const bonus = MAP.land[r].home === c.owner ? R.powers[c.owner].homeDefenseBonus : 0;
      return c.inf * Math.min(R.maxHitValue, E.unitValue(c.owner, 'inf', 'def') + bonus) + c.air * E.unitValue(c.owner, 'air', 'def');
    }

    // ---- Keep a guard at home, free the rest ----
    const free = {};
    for (const id of mine) {
      const myDef = Math.min(R.maxHitValue, E.unitValue(power, 'inf', 'def') + (MAP.land[id].home === power ? R.powers[power].homeDefenseBonus : 0));
      let need = Math.ceil((threat(id) * temper.homeGuard) / myDef);
      if (MAP.land[id].capital === power) need = Math.max(need, 1);
      // A very large stack never sits entirely idle: at most half of it stays on guard.
      if (state.land[id].inf >= 12) need = Math.min(need, Math.ceil(state.land[id].inf / 2));
      free[id] = state.land[id].inf - Math.min(state.land[id].inf, need);
    }

    // ---- Fleets ----
    const enemyFleets = (z) => FS.POWERS.filter((p) => p !== power).reduce((n, p) => n + state.sea[z].fleets[p], 0);
    const enemyFleetDefense = (z) =>
      FS.POWERS.filter((p) => p !== power).reduce((n, p) => n + state.sea[z].fleets[p] * E.unitValue(p, 'fleet', 'def'), 0);
    const unownedCoasts = (z) => MAP.sea[z].coasts.filter((c) => !isMine(c)).length;
    const fleetStay = {};
    const fleetAttacks = [];
    for (const z of Object.keys(state.sea)) {
      const n = state.sea[z].fleets[power];
      if (!n) continue;
      const myStrength = n * E.unitValue(power, 'fleet', 'att');
      if (enemyFleets(z) > 0) { fleetStay[z] = n; continue; }

      let best = null;
      for (const nz of geo.seaNeighbors(z)) {
        const d = enemyFleetDefense(nz);
        if (d > 0 && myStrength >= d * temper.attackRatio && (!best || d > best.d)) best = { z: nz, d };
      }
      if (best) {
        // Send what the attack needs; the rest stay to escort landings from this zone.
        const fleetAtt = E.unitValue(power, 'fleet', 'att');
        const send = unownedCoasts(z) > 0 ? Math.min(n, Math.ceil((best.d * temper.attackRatio) / fleetAtt) + 1) : n;
        orders.push({ kind: 'move', unit: 'fleet', from: z, to: best.z, count: send });
        fleetAttacks.push(best.z);
        if (send < n) fleetStay[z] = n - send;
        continue;
      }
      // A big idle fleet splits: half heads for a neighbouring zone with targets and no bigger navy.
      if (n >= 4) {
        const half = Math.floor(n / 2);
        const halfStrength = half * E.unitValue(power, 'fleet', 'att');
        const spread = geo.seaNeighbors(z)
          .filter((nz) => unownedCoasts(nz) > 0 && enemyFleetDefense(nz) * temper.attackRatio <= halfStrength && state.sea[nz].fleets[power] === 0)
          .sort((a, b) => unownedCoasts(b) - unownedCoasts(a));
        if (spread.length && unownedCoasts(z) > 0) {
          orders.push({ kind: 'move', unit: 'fleet', from: z, to: spread[0], count: half });
          if (enemyFleets(spread[0]) > 0) fleetAttacks.push(spread[0]);
          fleetStay[z] = n - half;
          continue;
        }
      }
      if (unownedCoasts(z) === 0) {
        const next = geo.seaNeighbors(z).filter((nz) => unownedCoasts(nz) > 0 && enemyFleetDefense(nz) < myStrength);
        if (next.length) {
          next.sort((a, b) => unownedCoasts(b) - unownedCoasts(a));
          orders.push({ kind: 'move', unit: 'fleet', from: z, to: next[0], count: n });
          continue;
        }
      }
      fleetStay[z] = n;
    }

    // Zones we expect to control after the sea phase: our fleets stay and clearly outgun
    // anything else there (a landing is called off if we lose the zone).
    const liftLeft = {};
    for (const z of Object.keys(fleetStay)) {
      const ours = fleetStay[z] * E.unitValue(power, 'fleet', 'att');
      if (enemyFleetDefense(z) === 0 || ours >= enemyFleetDefense(z) * 2) liftLeft[z] = fleetStay[z] * R.transportCapacity;
    }

    // ---- Who is winning? ----
    // In a three-way war the two trailing powers should lean on the leader, or the leader runs away with it.
    const objectiveCount = (p) => E.objectivesHeld(state, p).length * 10 + E.income(state, p) / 10;
    const rivals = FS.POWERS.filter((p) => p !== power && !state.eliminated[p]);
    const leader = rivals.slice().sort((a, b) => objectiveCount(b) - objectiveCount(a))[0];
    const leaderIsAhead = leader && objectiveCount(leader) > objectiveCount(power);

    // ---- Land attacks ----
    const candidates = [];
    for (const t of Object.keys(state.land)) {
      if (isMine(t)) continue;
      const sources = [];
      for (const n of geo.landNeighbors(t)) if (isMine(n)) sources.push({ from: n, via: null });
      for (const z of geo.seasOf(t)) {
        if (!liftLeft[z]) continue;
        for (const c of MAP.sea[z].coasts) if (c !== t && isMine(c)) sources.push({ from: c, via: z });
      }
      if (!sources.length) continue;
      const info = MAP.land[t];
      let worth = info.value + (info.objective ? 2 : 0) + (info.capital ? 2 : 0);
      if (leaderIsAhead && state.land[t].owner === leader) worth += 3;
      candidates.push({ t, sources, def: defenseOf(t), worth });
    }
    candidates.sort((a, b) => b.worth / (b.def + 1) - a.worth / (a.def + 1));

    // Air wings that could patrol over a target add first-round fire (counted at half weight).
    const airNear = (t) =>
      mine.reduce((n, b) => n + (E.airTargets(state, power, b, 'patrol').includes(t) ? state.land[b].air : 0), 0) *
      E.unitValue(power, 'air', 'att') * 0.5;

    const attackTargets = [];
    for (const c of candidates) {
      const need = c.def > 0 ? c.def * temper.attackRatio + infAtt : infAtt;
      let strength = airNear(c.t);
      const picks = [];
      for (const s of c.sources) {
        let avail = free[s.from] || 0;
        if (s.via) avail = Math.min(avail, liftLeft[s.via] || 0);
        const take = Math.min(avail, Math.ceil((need - strength) / infAtt));
        if (take <= 0) continue;
        picks.push({ s, take });
        strength += take * infAtt;
        free[s.from] -= take;
        if (s.via) liftLeft[s.via] -= take;
        if (strength >= need) break;
      }
      if (strength >= need) {
        for (const p of picks) orders.push({ kind: 'move', unit: 'inf', from: p.s.from, to: c.t, count: p.take, via: p.s.via });
        attackTargets.push(c.t);
      } else {
        for (const p of picks) {
          free[p.s.from] += p.take;
          if (p.s.via) liftLeft[p.s.via] += p.take;
        }
      }
    }

    // ---- Air wings ----
    for (const base of mine) {
      const n = state.land[base].air;
      if (!n) continue;
      const inRange = E.airTargets(state, power, base, 'patrol');
      const target =
        attackTargets.find((t) => inRange.includes(t)) ||
        fleetAttacks.find((z) => inRange.includes(z)) ||
        (threat(base) > 0 ? base : null);
      if (target) {
        orders.push({ kind: 'air', mode: 'patrol', from: base, to: target, count: n });
        continue;
      }
      // Nothing to do here: move toward the front.
      const options = E.airTargets(state, power, base, 'rebase');
      const frontness = (id) => threat(id) + geo.landNeighbors(id).filter((x) => !isMine(x)).length * 2;
      options.sort((a, b) => frontness(b) - frontness(a));
      if (options.length && frontness(options[0]) > frontness(base)) {
        orders.push({ kind: 'air', mode: 'rebase', from: base, to: options[0], count: n });
      }
    }

    // ---- Move idle infantry toward the front ----
    const distance = distanceToFront(state, power);
    for (const id of mine) {
      if (!(free[id] > 0) || distance[id] === 0) continue;
      const step = geo.landNeighbors(id).filter((n) => isMine(n) && distance[n] < distance[id]);
      if (step.length) orders.push({ kind: 'move', unit: 'inf', from: id, to: step[0], count: free[id] });
    }

    // ---- Builds ----
    let points = state.points[power];
    const prefs = BUILD_PREFERENCES[power];
    const costs = R.powers[power].units;
    const cheapest = Math.min(costs.inf.cost, costs.fleet.cost, costs.air.cost);
    const builds = {};
    // Coasts on a sea zone where we have fleets and something to invade are staging areas.
    const staging = (id) => geo.seasOf(id).some((z) => state.sea[z].fleets[power] > 0 && unownedCoasts(z) > 0);
    // Danger matters, but capped, so a quiet region next to a juicy target still gets reinforcements.
    const landScore = (id) =>
      Math.min(threat(id) * 0.5, 8) +
      (geo.landNeighbors(id).some((x) => !isMine(x)) ? 3 : 0) +
      (staging(id) ? 3 : 0) +
      (geo.landNeighbors(id).some((x) => !isMine(x) && MAP.land[x].objective) ? 5 : 0) +
      (MAP.land[id].capital === power ? 1 : 0);
    for (let i = 0; i < 40 && points >= cheapest; i++) {
      let unit = prefs[i % prefs.length];
      if (costs[unit].cost > points) unit = 'inf';
      if (costs[unit].cost > points) break;
      const spots = E.buildSpots(state, power, unit);
      if (!spots.length) { if (unit === 'inf') break; continue; }
      if (unit === 'fleet') {
        // Build where fleets will be useful and safe: next to targets, not under a bigger enemy navy.
        const fleetScore = (z) => {
          const ours = state.sea[z].fleets[power] * E.unitValue(power, 'fleet', 'def');
          return unownedCoasts(z) * 2 + state.sea[z].fleets[power] - (enemyFleetDefense(z) > ours ? 10 : 0);
        };
        const bestZone = spots.slice().sort((a, b) => fleetScore(b) - fleetScore(a))[0];
        if (fleetScore(bestZone) >= 0) {
          const key = 'fleet|' + bestZone;
          builds[key] = (builds[key] || 0) + 1;
          points -= costs.fleet.cost;
          continue;
        }
        // Every zone is under a bigger enemy navy: a lone new fleet would just be sunk. Build infantry.
        unit = 'inf';
      }
      const landSpots = E.buildSpots(state, power, unit);
      if (!landSpots.length) break;
      // Each unit already placed somewhere makes that spot a little less attractive, so builds spread out.
      const placed = (id) => Object.keys(builds).filter((k) => k.endsWith('|' + id)).reduce((n, k) => n + builds[k], 0);
      const at = landSpots.slice().sort((a, b) => landScore(b) - placed(b) * 2 - (landScore(a) - placed(a) * 2))[0];
      const key = unit + '|' + at;
      builds[key] = (builds[key] || 0) + 1;
      points -= costs[unit].cost;
    }
    for (const key of Object.keys(builds)) {
      const [unit, at] = key.split('|');
      orders.push({ kind: 'build', unit, at, count: builds[key] });
    }

    return E.validateOrders(state, power, orders).accepted;
  }

  // Land steps from each held region to the nearest region the power does not hold.
  function distanceToFront(state, power) {
    const geo = FS.geo;
    const dist = {};
    const queue = [];
    for (const id of Object.keys(state.land)) {
      if (state.land[id].owner !== power) continue;
      // The front: next to something we don't hold, or a coast where our fleets can carry troops out.
      const front =
        geo.landNeighbors(id).some((n) => state.land[n].owner !== power) ||
        geo.seasOf(id).some((z) => state.sea[z].fleets[power] > 0);
      if (front) { dist[id] = 0; queue.push(id); }
    }
    while (queue.length) {
      const id = queue.shift();
      for (const n of geo.landNeighbors(id)) {
        if (state.land[n].owner !== power || n in dist) continue;
        dist[n] = dist[id] + 1;
        queue.push(n);
      }
    }
    for (const id of Object.keys(state.land)) if (state.land[id].owner === power && !(id in dist)) dist[id] = 0;
    return dist;
  }

  FS.ai = { planOrders };
})(globalThis);
