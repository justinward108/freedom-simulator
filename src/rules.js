// Freedom Simulator — tunable numbers.
// Every balance number lives here so the prototype can be retuned in one place.
// Combat: each unit rolls a six-sided die and scores a hit on a roll at or under its value.
(function (root) {
  const FS = (root.FS = root.FS || {});

  FS.POWERS = ['ga', 'china', 'russia'];

  FS.RULES = {
    version: 4, // bump when the map or rules change, so old saved games are not loaded

    // A battle lasts at most this many rounds of fire in one turn.
    maxBattleRounds: 3,

    // Infantry each fleet can carry across its sea zone in one turn.
    transportCapacity: 2,

    // Highest hit value any unit can reach after bonuses (a 6 always misses).
    maxHitValue: 5,

    // Neutral garrisons defend at this value and never move.
    neutralDefense: 2,

    defaultObjectivesToWin: 8,
    defaultRoundLimit: 15,

    unitNames: { inf: 'Infantry', fleet: 'Fleet', air: 'Air wing' },

    // Greater America: expensive, high-quality units, best at sea and in the air.
    // China: cheap mass, the most units for its points.
    // Russia: cheap infantry that defends harder on home ground, weak at sea.
    powers: {
      ga: {
        name: 'Greater America',
        command: 'Washington Command',
        short: 'GA',
        color: '#3d7fe0',
        units: {
          inf: { cost: 2, att: 2, def: 2 },
          fleet: { cost: 3, att: 3, def: 3 },
          air: { cost: 3, att: 3, def: 3 },
        },
        homeDefenseBonus: 0,
        // Research tiers this power starts with (a head start in its strengths).
        startTech: { sea: 1 },
      },
      china: {
        name: 'China',
        command: 'Beijing Command',
        short: 'CN',
        color: '#d64545',
        units: {
          inf: { cost: 1, att: 1, def: 2 },
          fleet: { cost: 2, att: 2, def: 2 },
          air: { cost: 2, att: 2, def: 2 },
        },
        homeDefenseBonus: 0,
        startTech: {},
      },
      russia: {
        name: 'Russia',
        command: 'Moscow Command',
        short: 'RU',
        color: '#d9a13b',
        units: {
          inf: { cost: 1, att: 1, def: 2 },
          fleet: { cost: 3, att: 1, def: 2 },
          air: { cost: 2, att: 2, def: 2 },
        },
        homeDefenseBonus: 1,
        startTech: { coastal: 1 },
      },
    },

    // ---- Structures ----
    // Built in a land region you hold, with points. They belong to the region: whoever holds
    // the region gets their benefit, so a captured factory pays its new owner.
    // max = how many of that structure one region can have.
    structures: {
      aa: {
        name: 'Anti-aircraft guns',
        short: 'AA guns',
        cost: 2,
        max: 3,
        blurb: 'Fire at enemy air wings over this region before any air battle. Each gun rolls one die and hits on 2 or less (better with Air Defence research).',
      },
      fort: {
        name: 'Fortifications',
        short: 'Fort',
        cost: 3,
        max: 1,
        blurb: 'Your infantry defending this region hit on 1 more.',
      },
      battery: {
        name: 'Coastal battery',
        short: 'Battery',
        cost: 4,
        max: 1,
        coastal: true,
        blurb: 'Fires at enemy fleets in every sea zone this region touches, before naval battles. Hits on 2 or less (better with Coastal Missiles research).',
      },
      factory: {
        name: 'Factory',
        short: 'Factory',
        cost: 6,
        max: 1,
        blurb: 'The region pays 2 more points a turn to whoever holds it.',
      },
      recruit: {
        name: 'Recruitment centre',
        short: 'Recruits',
        cost: 4,
        max: 1,
        blurb: 'One free infantry appears here at the end of every turn.',
      },
      airfield: {
        name: 'Airfield',
        short: 'Airfield',
        cost: 3,
        max: 1,
        blurb: 'Air wings flying from here fire in the first two rounds of a battle instead of only the first.',
      },
      navalbase: {
        name: 'Naval base',
        short: 'Naval base',
        cost: 4,
        max: 1,
        coastal: true,
        blurb: 'Your fleets in every sea zone this region touches hit on 1 more.',
      },
    },

    // ---- Research ----
    // Each field has three tiers. A tier is bought with points and takes effect from next turn.
    // One tier per field per turn. Powers start at tier 0 except their startTech.
    researchCosts: [4, 7, 10],
    research: {
      land: { name: 'Land Warfare', tiers: ['Infantry attack +1', 'Infantry defence +1', 'Infantry attack +1'] },
      air: { name: 'Air Power', tiers: ['Air wing attack +1', 'Air wing defence +1', 'Air wing attack +1'] },
      sea: { name: 'Sea Power', tiers: ['Fleet attack +1', 'Fleet defence +1', 'Each fleet carries 1 more infantry'] },
      airdef: { name: 'Air Defence', tiers: ['AA guns hit on 3 or less', 'AA guns hit on 4 or less', 'Each AA gun fires twice'] },
      coastal: { name: 'Coastal Missiles', tiers: ['Batteries hit on 3 or less', 'Batteries hit on 4 or less', 'Each battery fires twice'] },
      industry: { name: 'Industry', tiers: ['+2 points a turn', '+4 points a turn', '+6 points a turn'] },
    },

    // AI temperaments are dealt at random each game so no power has a fixed personality.
    // attackRatio: how much stronger the AI wants to be before it attacks.
    temperaments: {
      cautious: { label: 'Cautious', attackRatio: 1.6, homeGuard: 0.8 },
      balanced: { label: 'Balanced', attackRatio: 1.3, homeGuard: 0.6 },
      aggressive: { label: 'Aggressive', attackRatio: 1.05, homeGuard: 0.4 },
    },
  };
})(globalThis);
