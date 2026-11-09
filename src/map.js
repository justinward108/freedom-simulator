// Freedom Simulator — the stage-1 test map.
// A schematic world board: real names, simplified positions. Not a map of borders or a forecast.
// The finished game moves to a real-looking map; this board exists to test the rules.
// x/y are positions on the drawn board (viewBox 0 0 width height).
(function (root) {
  const FS = (root.FS = root.FS || {});

  const MAP = {
    width: 1500,
    height: 820,

    // value = points the region adds to its holder's income every turn. Every region is worth
    // at least 1, so the more you hold, the more you can build.
    // home = the power whose homeland it is (Russia defends harder at home).
    land: {
      // Greater America, including its Unified Territories
      eus: { name: 'Eastern United States', label: 'Washington', x: 1385, y: 340, value: 4, capital: 'ga', objective: true, home: 'ga' },
      wus: { name: 'Western United States', label: 'W. United States', x: 1235, y: 300, value: 2, home: 'ga' },
      canada: { name: 'Canada', label: 'Canada', x: 1290, y: 160, value: 2, home: 'ga' },
      alaska: { name: 'Alaska', label: 'Alaska', x: 1140, y: 80, value: 1, home: 'ga' },
      hawaii: { name: 'Hawaii', label: 'Hawaii', x: 1090, y: 530, value: 1, home: 'ga' },
      iceland: { name: 'Iceland and Greenland', label: 'Iceland & Greenland', x: 70, y: 70, value: 1, home: 'ga' },
      venezuela: { name: 'Panama and Venezuela', label: 'Panama & Venezuela', x: 1300, y: 500, value: 2, objective: true, home: 'ga' },

      // China
      beijing: { name: 'Northern China', label: 'Beijing', x: 730, y: 320, value: 4, capital: 'china', objective: true, home: 'china' },
      schina: { name: 'Southern China', label: 'S. China', x: 700, y: 480, value: 3, home: 'china' },

      // Russia
      moscow: { name: 'Western Russia', label: 'Moscow', x: 390, y: 150, value: 4, capital: 'russia', objective: true, home: 'russia' },
      siberia: { name: 'Siberia', label: 'Siberia', x: 545, y: 95, value: 2, home: 'russia' },
      rfe: { name: 'Russian Far East', label: 'Russian Far East', x: 790, y: 85, value: 1, home: 'russia' },

      // Europe
      uk: { name: 'United Kingdom', label: 'United Kingdom', x: 120, y: 190, value: 2, objective: true },
      scandinavia: { name: 'Scandinavia', label: 'Scandinavia', x: 245, y: 65, value: 1 },
      westeurope: { name: 'Western Europe', label: 'W. Europe', x: 150, y: 310, value: 3, objective: true },
      easteurope: { name: 'Eastern Europe', label: 'E. Europe', x: 300, y: 285, value: 2, objective: true },

      // Africa and the Middle East
      northafrica: { name: 'North Africa', label: 'N. Africa', x: 175, y: 490, value: 2 },
      westafrica: { name: 'West Africa', label: 'W. Africa', x: 90, y: 610, value: 1 },
      eastafrica: { name: 'East Africa', label: 'E. Africa', x: 275, y: 610, value: 1 },
      southernafrica: { name: 'Southern Africa', label: 'S. Africa', x: 200, y: 745, value: 2, objective: true },
      middleeast: { name: 'Middle East', label: 'Middle East', x: 390, y: 455, value: 3, objective: true },

      // Central and South Asia
      centralasia: { name: 'Central Asia', label: 'Central Asia', x: 500, y: 290, value: 1 },
      southasia: { name: 'South Asia', label: 'South Asia', x: 560, y: 545, value: 3, objective: true },

      // East Asia and the Pacific
      mongolia: { name: 'Mongolia', label: 'Mongolia', x: 630, y: 225, value: 1, objective: true },
      korea: { name: 'Korea', label: 'Korea', x: 860, y: 245, value: 1, objective: true },
      japan: { name: 'Japan', label: 'Japan', x: 975, y: 300, value: 2, objective: true },
      taiwan: { name: 'Taiwan', label: 'Taiwan', x: 850, y: 455, value: 1, objective: true },
      philippines: { name: 'Philippines', label: 'Philippines', x: 905, y: 590, value: 1, objective: true },
      seasia: { name: 'Southeast Asia', label: 'SE Asia', x: 730, y: 640, value: 2 },

      // South America
      brazil: { name: 'Brazil', label: 'Brazil', x: 1385, y: 630, value: 3, objective: true },
      southerncone: { name: 'Argentina and Chile', label: 'Argentina & Chile', x: 1290, y: 750, value: 2 },
    },

    // coasts = land regions that touch the sea zone. Fleets live in sea zones.
    sea: {
      nwp: { name: 'Northwest Pacific', label: 'NW Pacific', x: 1020, y: 175, coasts: ['alaska', 'rfe', 'korea', 'beijing', 'japan'] },
      scs: { name: 'South China Sea', label: 'S. China Sea', x: 1000, y: 460, coasts: ['schina', 'taiwan', 'philippines', 'japan', 'seasia'] },
      ep: { name: 'Eastern Pacific', label: 'E. Pacific', x: 1130, y: 390, coasts: ['wus', 'alaska', 'hawaii', 'venezuela'] },
      baltic: { name: 'Baltic Sea', label: 'Baltic', x: 255, y: 180, coasts: ['scandinavia', 'easteurope', 'westeurope', 'moscow'] },
      med: { name: 'Mediterranean', label: 'Mediterranean', x: 275, y: 390, coasts: ['westeurope', 'easteurope', 'northafrica', 'middleeast'] },
      indian: { name: 'Indian Ocean', label: 'Indian Ocean', x: 440, y: 680, coasts: ['eastafrica', 'southernafrica', 'middleeast', 'southasia', 'seasia'] },
      natl: { name: 'North Atlantic', label: 'N. Atlantic', x: 45, y: 290, coasts: ['iceland', 'uk', 'scandinavia', 'westeurope', 'eus', 'canada'] },
      catl: { name: 'Central Atlantic', label: 'C. Atlantic', x: 45, y: 470, coasts: ['westafrica', 'northafrica', 'eus', 'venezuela', 'brazil'] },
      satl: { name: 'South Atlantic', label: 'S. Atlantic', x: 60, y: 740, coasts: ['westafrica', 'southernafrica', 'brazil', 'southerncone'] },
    },

    landLinks: [
      // Russia
      ['moscow', 'siberia'],
      ['siberia', 'rfe'],
      ['siberia', 'mongolia'],
      ['siberia', 'centralasia'],
      ['moscow', 'centralasia'],
      ['moscow', 'easteurope'],
      ['moscow', 'scandinavia'],
      ['moscow', 'middleeast'],
      // China
      ['mongolia', 'beijing'],
      ['rfe', 'beijing'],
      ['rfe', 'korea'],
      ['beijing', 'korea'],
      ['beijing', 'schina'],
      ['beijing', 'centralasia'],
      ['schina', 'southasia'],
      ['centralasia', 'southasia'],
      ['centralasia', 'middleeast'],
      ['middleeast', 'southasia'],
      ['schina', 'seasia'],
      ['southasia', 'seasia'],
      // Europe and Africa
      ['westeurope', 'easteurope'],
      ['middleeast', 'easteurope'],
      ['middleeast', 'northafrica'],
      ['middleeast', 'eastafrica'],
      ['northafrica', 'westafrica'],
      ['northafrica', 'eastafrica'],
      ['westafrica', 'eastafrica'],
      ['eastafrica', 'southernafrica'],
      ['westafrica', 'southernafrica'],
      // The Americas
      ['alaska', 'canada'],
      ['canada', 'wus'],
      ['canada', 'eus'],
      ['wus', 'eus'],
      ['venezuela', 'brazil'],
      ['brazil', 'southerncone'],
      // Across the Bering Strait
      ['rfe', 'alaska'],
    ],

    seaLinks: [
      ['nwp', 'ep'],
      ['scs', 'ep'],
      ['nwp', 'scs'],
      ['scs', 'indian'],
      ['indian', 'satl'],
      ['natl', 'baltic'],
      ['natl', 'catl'],
      ['catl', 'satl'],
      ['catl', 'med'],
      ['catl', 'ep'], // through the Panama Canal
    ],

    // The board is flat, so the Atlantic wraps from its left edge to the Americas on the right.
    // For these [sea, space] pairs the link is drawn from the space to a small "ghost" copy of
    // the sea zone on the right-hand side, instead of across the whole board.
    wrap: [
      ['natl', 'eus'],
      ['natl', 'canada'],
      ['catl', 'eus'],
      ['catl', 'venezuela'],
      ['catl', 'brazil'],
      ['catl', 'ep'],
      ['satl', 'brazil'],
      ['satl', 'southerncone'],
    ],
    ghosts: {
      natl: { x: 1465, y: 215, label: 'N. Atlantic' },
      catl: { x: 1465, y: 470, label: 'C. Atlantic' },
      satl: { x: 1460, y: 765, label: 'S. Atlantic' },
    },

    // Where each power starts. Everything not listed is neutral with the garrison shown.
    start: {
      land: {
        eus: { owner: 'ga', inf: 3, air: 1 },
        wus: { owner: 'ga', inf: 2, air: 1 },
        canada: { owner: 'ga', inf: 1, air: 0 },
        alaska: { owner: 'ga', inf: 1, air: 0 },
        hawaii: { owner: 'ga', inf: 1, air: 0 },
        iceland: { owner: 'ga', inf: 1, air: 0 },
        venezuela: { owner: 'ga', inf: 1, air: 0 },
        beijing: { owner: 'china', inf: 5, air: 1 },
        schina: { owner: 'china', inf: 3, air: 1 },
        moscow: { owner: 'russia', inf: 4, air: 0 },
        siberia: { owner: 'russia', inf: 4, air: 0 },
        rfe: { owner: 'russia', inf: 3, air: 1 },
        uk: { owner: 'neutral', inf: 3, air: 0 },
        scandinavia: { owner: 'neutral', inf: 2, air: 0 },
        westeurope: { owner: 'russia', inf: 3, air: 0 },
        easteurope: { owner: 'russia', inf: 3, air: 1 },
        northafrica: { owner: 'neutral', inf: 2, air: 0 },
        westafrica: { owner: 'neutral', inf: 1, air: 0 },
        eastafrica: { owner: 'neutral', inf: 1, air: 0 },
        southernafrica: { owner: 'neutral', inf: 2, air: 0 },
        middleeast: { owner: 'neutral', inf: 3, air: 0 },
        centralasia: { owner: 'russia', inf: 2, air: 0 },
        southasia: { owner: 'china', inf: 3, air: 0 },
        mongolia: { owner: 'china', inf: 2, air: 0 },
        korea: { owner: 'neutral', inf: 2, air: 0 },
        japan: { owner: 'neutral', inf: 3, air: 0 },
        taiwan: { owner: 'neutral', inf: 2, air: 0 },
        philippines: { owner: 'neutral', inf: 2, air: 0 },
        seasia: { owner: 'china', inf: 2, air: 0 },
        brazil: { owner: 'neutral', inf: 3, air: 0 },
        southerncone: { owner: 'neutral', inf: 2, air: 0 },
      },
      sea: {
        ep: { ga: 3 },
        natl: { ga: 1 },
        scs: { china: 2 },
        nwp: { russia: 1 },
        baltic: { russia: 1 },
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

  // Is a link between these two spaces drawn to a ghost? Returns the sea zone being ghosted, or null.
  function wrappedSea(a, b) {
    for (const [sea, other] of MAP.wrap) {
      if ((a === sea && b === other) || (b === sea && a === other)) return sea;
    }
    return null;
  }

  FS.MAP = MAP;
  FS.geo = { isLand, isSea, spaceName, landNeighbors, seaNeighbors, seasOf, isCoastal, sharedSeas, objectives, wrappedSea };
})(globalThis);
