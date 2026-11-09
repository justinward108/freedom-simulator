// Freedom Simulator — tunable numbers.
// Every balance number lives here so the prototype can be retuned in one place.
// Combat: each unit rolls a six-sided die and scores a hit on a roll at or under its value.
(function (root) {
  const FS = (root.FS = root.FS || {});

  FS.POWERS = ['ga', 'china', 'russia'];

  FS.RULES = {
    version: 2, // bump when the map or rules change, so old saved games are not loaded

    // A battle lasts at most this many rounds of fire in one turn.
    maxBattleRounds: 3,

    // Infantry each fleet can carry across its sea zone in one turn.
    transportCapacity: 2,

    // Highest hit value any unit can reach after bonuses (a 6 always misses).
    maxHitValue: 5,

    // Neutral garrisons defend at this value and never move.
    neutralDefense: 2,

    defaultObjectivesToWin: 7,
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
      },
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
