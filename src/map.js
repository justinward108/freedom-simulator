// Freedom Simulator — the stage-1 test map.
// A stylized Pacific theatre: real names, schematic positions. Not a map of borders or a forecast.
// x/y are positions on the drawn board (viewBox 0 0 1100 620).
(function (root) {
  const FS = (root.FS = root.FS || {});

  const MAP = {
    width: 1100,
    height: 620,

    // value = points the region adds to its holder's income each turn.
    // home = the power whose homeland it is (Russia defends harder at home).
    land: {
      eus: { name: 'Eastern United States', label: 'Washington', x: 1030, y: 390, value: 3, capital: 'ga', objective: true, home: 'ga' },
      wus: { name: 'Western United States', label: 'W. United States', x: 950, y: 235, value: 2, home: 'ga' },
      alaska: { name: 'Alaska', label: 'Alaska', x: 790, y: 90, value: 1, home: 'ga' },
      hawaii: { name: 'Hawaii', label: 'Hawaii', x: 845, y: 500, value: 1, home: 'ga' },

      beijing: { name: 'Northern China', label: 'Beijing', x: 345, y: 300, value: 3, capital: 'china', objective: true, home: 'china' },
      schina: { name: 'Southern China', label: 'S. China', x: 320, y: 470, value: 1, home: 'china' },

      moscow: { name: 'Western Russia', label: 'Moscow', x: 75, y: 150, value: 3, capital: 'russia', objective: true, home: 'russia' },
      siberia: { name: 'Siberia', label: 'Siberia', x: 215, y: 110, value: 2, home: 'russia' },
      rfe: { name: 'Russian Far East', label: 'Russian Far East', x: 430, y: 90, value: 1, home: 'russia' },

      mongolia: { name: 'Mongolia', label: 'Mongolia', x: 200, y: 280, value: 1, objective: true },
      korea: { name: 'Korea', label: 'Korea', x: 480, y: 240, value: 1, objective: true },
      japan: { name: 'Japan', label: 'Japan', x: 600, y: 285, value: 2, objective: true },
      taiwan: { name: 'Taiwan', label: 'Taiwan', x: 470, y: 430, value: 1, objective: true },
      philippines: { name: 'Philippines', label: 'Philippines', x: 545, y: 555, value: 1, objective: true },
    },

    // coasts = land regions that touch the sea zone. Fleets live in sea zones.
    sea: {
      nwp: { name: 'Northwest Pacific', label: 'NW Pacific', x: 650, y: 180, coasts: ['alaska', 'rfe', 'korea', 'beijing', 'japan'] },
      scs: { name: 'South China Sea', label: 'S. China Sea', x: 660, y: 445, coasts: ['schina', 'taiwan', 'philippines', 'japan'] },
      ep: { name: 'Eastern Pacific', label: 'E. Pacific', x: 830, y: 320, coasts: ['wus', 'alaska', 'hawaii'] },
    },

    landLinks: [
      ['moscow', 'siberia'],
      ['siberia', 'rfe'],
      ['siberia', 'mongolia'],
      ['mongolia', 'beijing'],
      ['rfe', 'beijing'],
      ['rfe', 'korea'],
      ['beijing', 'korea'],
      ['beijing', 'schina'],
      ['rfe', 'alaska'],
      ['alaska', 'wus'],
      ['wus', 'eus'],
    ],

    seaLinks: [
      ['nwp', 'ep'],
      ['scs', 'ep'],
      ['nwp', 'scs'],
    ],

    // Where each power starts. Everything not listed is neutral with the garrison shown.
    start: {
      land: {
        eus: { owner: 'ga', inf: 3, air: 1 },
        wus: { owner: 'ga', inf: 2, air: 1 },
        alaska: { owner: 'ga', inf: 1, air: 0 },
        hawaii: { owner: 'ga', inf: 1, air: 0 },
        beijing: { owner: 'china', inf: 4, air: 1 },
        schina: { owner: 'china', inf: 3, air: 1 },
        moscow: { owner: 'russia', inf: 3, air: 0 },
        siberia: { owner: 'russia', inf: 4, air: 0 },
        rfe: { owner: 'russia', inf: 3, air: 1 },
        mongolia: { owner: 'neutral', inf: 2, air: 0 },
        korea: { owner: 'neutral', inf: 2, air: 0 },
        japan: { owner: 'neutral', inf: 3, air: 0 },
        taiwan: { owner: 'neutral', inf: 2, air: 0 },
        philippines: { owner: 'neutral', inf: 2, air: 0 },
      },
      sea: {
        ep: { ga: 3 },
        scs: { china: 2 },
        nwp: { russia: 1 },
      },
    },
  };

  // ---- Lookups -------------------------------------------------------------

  function isLand(id) {
    return Object.prototype.hasOwnProperty.call(MAP.land, id);
  }

  function isSea(id) {
    return Object.prototype.hasOwnProperty.call(MAP.sea, id);
  }

  function spaceName(id) {
    if (isLand(id)) return MAP.land[id].name;
    if (isSea(id)) return MAP.sea[id].name;
    return id;
  }

  function landNeighbors(id) {
    const out = [];
    for (const [a, b] of MAP.landLinks) {
      if (a === id) out.push(b);
      else if (b === id) out.push(a);
    }
    return out;
  }

  function seaNeighbors(id) {
    const out = [];
    for (const [a, b] of MAP.seaLinks) {
      if (a === id) out.push(b);
      else if (b === id) out.push(a);
    }
    return out;
  }

  // Sea zones a land region touches.
  function seasOf(landId) {
    return Object.keys(MAP.sea).filter((s) => MAP.sea[s].coasts.includes(landId));
  }

  function isCoastal(landId) {
    return seasOf(landId).length > 0;
  }

  function sharedSeas(a, b) {
    const sa = seasOf(a);
    return seasOf(b).filter((s) => sa.includes(s));
  }

  function objectives() {
    return Object.keys(MAP.land).filter((id) => MAP.land[id].objective);
  }

  FS.MAP = MAP;
  FS.geo = { isLand, isSea, spaceName, landNeighbors, seaNeighbors, seasOf, isCoastal, sharedSeas, objectives };
})(globalThis);
