// Freedom Simulator — the page: map drawing, order entry, pass-the-device handover, and the
// step-by-step reveal. All game rules live in engine.js; this file only shows and collects.
(function (root) {
  const FS = root.FS;
  const E = FS.engine;
  const geo = FS.geo;
  const MAP = FS.MAP;
  const R = FS.RULES;

  const SAVE_KEY = 'freedom-simulator-save-v1';

  const PHASES = [
    { id: 'orders', title: 'Orders revealed', blurb: 'Every order from every power, shown at once. Nobody saw anyone else’s until now.' },
    { id: 'air', title: '1 · Air', blurb: 'Air superiority is fought out first. Whoever holds the sky over a space fires its air wings in the first round of any battle there.' },
    { id: 'sea', title: '2 · Sea', blurb: 'Fleets move and fight for sea zones. A power holds a zone when only its fleets are left in it.' },
    { id: 'transport', title: '3 · Transport', blurb: 'Infantry cross water only if their power holds the zone after the sea battles, with room aboard (2 per fleet).' },
    { id: 'land', title: '4 · Land', blurb: 'Every land move happens at once. Collisions are settled, then all battles are rolled. The map now shows the result.' },
    { id: 'return', title: '5 · Air wings return', blurb: 'Patrols fly home. If home fell, they land in a neighbouring region you hold, or are lost.' },
    { id: 'production', title: '6 · Production', blurb: 'New units appear and income is paid for next turn.' },
    { id: 'result', title: 'Result', blurb: '' },
  ];
  // Which board each reveal phase shows: before the turn, after the fighting, or final.
  const BOARD_FOR_PHASE = { orders: 'before', air: 'before', sea: 'before', transport: 'before', land: 'battles', return: 'battles', production: 'after', result: 'after' };

  const app = {
    game: null,
    screen: 'setup', // setup | handover | orders | reveal | over
    queue: [], // human powers still to give orders this round
    current: null,
    orders: {},
    selected: null,
    message: null,
    reveal: null,
  };

  // ---- Small helpers ------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const color = (p) => (p === 'neutral' ? '#70757f' : R.powers[p].color);
  const pname = (p) => E.powerName(p);
  const pos = (id) => (geo.isLand(id) ? MAP.land[id] : MAP.sea[id]);
  const radius = (id) => (geo.isSea(id) ? 46 : MAP.land[id].capital ? 32 : 27);
  const humans = () => FS.POWERS.filter((p) => app.game.settings.controllers[p] === 'human' && !app.game.eliminated[p]);

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ game: app.game }));
    } catch (e) {
      /* storage unavailable: the game still works, it just won't resume */
    }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.game || data.game.rulesVersion !== R.version) return null;
      return data.game;
    } catch (e) {
      return null;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  // ---- Map ----------------------------------------------------------------------------------

  function shorten(a, b, ra, rb) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x1: a.x + (dx / len) * ra,
      y1: a.y + (dy / len) * ra,
      x2: b.x - (dx / len) * rb,
      y2: b.y - (dy / len) * rb,
      nx: -dy / len,
      ny: dx / len,
    };
  }

  const GHOST_R = 26;

  // Where to draw a link or arrow leg between two spaces. If the link wraps around the
  // board edge, the sea zone end is drawn at its ghost marker instead.
  function legEnds(a, b) {
    const sea = geo.wrappedSea(a, b);
    const at = (id) => (id === sea ? MAP.ghosts[sea] : pos(id));
    const r = (id) => (id === sea ? GHOST_R : radius(id));
    return { pa: at(a), pb: at(b), ra: r(a), rb: r(b) };
  }

  function arrowSvg(o, power) {
    const off = (FS.POWERS.indexOf(power) - 1) * 5;
    const cls = 'arrow arrow-' + (o.kind === 'air' ? 'air' : o.unit === 'fleet' ? 'fleet' : 'inf');
    const stroke = color(power);
    const label = o.kind === 'build' ? '' : String(o.count);
    if (o.kind === 'build') {
      const p = pos(o.at);
      return `<circle class="build-mark" cx="${p.x}" cy="${p.y}" r="${radius(o.at) + 10}" stroke="${stroke}"/>`;
    }
    const legs = o.via ? [[o.from, o.via], [o.via, o.to]] : [[o.from, o.to]];
    let out = '';
    legs.forEach(([a, b], i) => {
      const last = i === legs.length - 1;
      const first = i === 0;
      const e = legEnds(a, b);
      const s = shorten(e.pa, e.pb, first ? e.ra + 2 : 0, last ? e.rb + 6 : 0);
      out += `<line class="${cls}" x1="${s.x1 + s.nx * off}" y1="${s.y1 + s.ny * off}" x2="${s.x2 + s.nx * off}" y2="${s.y2 + s.ny * off}" stroke="${stroke}"${last ? ` marker-end="url(#arrow-${power})"` : ''}/>`;
      if (last) {
        const mx = (s.x1 + s.x2) / 2 + s.nx * (off + 10);
        const my = (s.y1 + s.y2) / 2 + s.ny * (off + 10);
        out += `<text class="arrow-count" x="${mx}" y="${my + 4}" fill="${stroke}">${label}</text>`;
      }
    });
    return out;
  }

  // Hover text for a space: who holds it and exactly what is there.
  function tooltip(s, id) {
    if (geo.isSea(id)) {
      const fleets = FS.POWERS.filter((p) => s.sea[id].fleets[p] > 0).map((p) => pname(p) + ': ' + s.sea[id].fleets[p] + ' fleet' + (s.sea[id].fleets[p] > 1 ? 's' : ''));
      return MAP.sea[id].name + ' (sea zone)\n' + (fleets.length ? fleets.join('\n') : 'No fleets');
    }
    const c = s.land[id];
    const who = c.owner === 'neutral' ? 'Neutral' : pname(c.owner);
    return MAP.land[id].name + ' — ' + who + '\n' + c.inf + ' infantry' + (c.air ? ', ' + c.air + ' air wing' + (c.air > 1 ? 's' : '') : '') + '\nWorth ' + MAP.land[id].value + ' pts/turn' + (MAP.land[id].objective ? ' · objective' : '');
  }

  // opts: { state, highlight: Set, targets: Set, selected, mine: power, arrows: [{order, power}] }
  function renderMap(opts) {
    const s = opts.state;
    const highlight = opts.highlight || new Set();
    const targets = opts.targets || new Set();
    const parts = [];

    parts.push('<defs>');
    for (const p of FS.POWERS) {
      parts.push(`<marker id="arrow-${p}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${color(p)}"/></marker>`);
    }
    parts.push('</defs>');

    const link = (cls, a, b) => {
      const e = legEnds(a, b);
      return `<line class="${cls}" x1="${e.pa.x}" y1="${e.pa.y}" x2="${e.pb.x}" y2="${e.pb.y}"/>`;
    };
    for (const z of Object.keys(MAP.sea)) for (const c of MAP.sea[z].coasts) parts.push(link('link-coast', z, c));
    for (const [a, b] of MAP.seaLinks) parts.push(link('link-sea', a, b));

    // Ghost markers: the Atlantic zones again on the right-hand edge, where the board wraps.
    for (const z of Object.keys(MAP.ghosts)) {
      const gh = MAP.ghosts[z];
      const fleets = FS.POWERS.filter((p) => s.sea[z].fleets[p] > 0).map((p) => `<tspan fill="${color(p)}">${R.powers[p].short} ${s.sea[z].fleets[p]}</tspan>`).join(' ');
      const cls = ['space', 'ghost'];
      if (highlight.has(z)) cls.push('is-highlight');
      if (targets.has(z)) cls.push('is-target');
      if (opts.selected === z) cls.push('is-selected');
      parts.push(
        `<g class="${cls.join(' ')}" data-space="${z}" role="button" aria-label="${esc(MAP.sea[z].name)} (continued from the left edge)">` +
          `<title>${esc(MAP.sea[z].name)}: the same sea zone as on the left edge of the board.</title>` +
          `<circle class="ring" cx="${gh.x}" cy="${gh.y}" r="${GHOST_R + 6}"/>` +
          `<circle class="ghost-body" cx="${gh.x}" cy="${gh.y}" r="${GHOST_R}"/>` +
          `<text class="ghost-label" x="${gh.x}" y="${gh.y - 4}">⇄</text>` +
          `<text class="ghost-name" x="${gh.x}" y="${gh.y + GHOST_R + 14}">${esc(gh.label)}</text>` +
          (fleets ? `<text class="ghost-fleets" x="${gh.x}" y="${gh.y + 14}">${fleets}</text>` : '') +
          `</g>`
      );
    }
    for (const [a, b] of MAP.landLinks) {
      parts.push(`<line class="link-land" x1="${MAP.land[a].x}" y1="${MAP.land[a].y}" x2="${MAP.land[b].x}" y2="${MAP.land[b].y}"/>`);
    }

    for (const z of Object.keys(MAP.sea)) {
      const n = MAP.sea[z];
      const cls = ['space', 'sea'];
      if (highlight.has(z)) cls.push('is-highlight');
      if (targets.has(z)) cls.push('is-target');
      if (opts.selected === z) cls.push('is-selected');
      if (opts.mine && s.sea[z].fleets[opts.mine] > 0) cls.push('is-mine');
      const present = FS.POWERS.filter((p) => s.sea[z].fleets[p] > 0);
      const chipW = 34;
      const startX = n.x - (present.length * chipW) / 2;
      const chips = present
        .map((p, i) => {
          const x = startX + i * chipW + 2;
          return `<rect class="chip" x="${x}" y="${n.y + 2}" width="${chipW - 4}" height="20" rx="5" fill="${color(p)}"/><text class="chip-text" x="${x + (chipW - 4) / 2}" y="${n.y + 16}">${s.sea[z].fleets[p]}</text>`;
        })
        .join('');
      const owner = E.soleFleetPower(s.sea[z]);
      parts.push(
        `<g class="${cls.join(' ')}" data-space="${z}" tabindex="0" role="button" aria-label="${esc(n.name)}">` +
          `<title>${esc(tooltip(s, z))}</title>` +
          `<circle class="mine-ring" cx="${n.x}" cy="${n.y}" r="${radius(z) + 4}"${opts.mine ? ` style="--mc:${color(opts.mine)}"` : ''}/>` +
          `<circle class="ring" cx="${n.x}" cy="${n.y}" r="${radius(z) + 7}"/>` +
          `<circle class="sea-body" cx="${n.x}" cy="${n.y}" r="${radius(z)}"${owner ? ` stroke="${color(owner)}"` : ''}/>` +
          `<text class="sea-label" x="${n.x}" y="${n.y - 12}">${esc(n.label)}</text>` +
          (present.length ? chips + `<text class="sea-caption" x="${n.x}" y="${n.y + 34}">fleets</text>` : `<text class="sea-empty" x="${n.x}" y="${n.y + 16}">no fleets</text>`) +
          `</g>`
      );
    }

    for (const id of Object.keys(MAP.land)) {
      const n = MAP.land[id];
      const c = s.land[id];
      const r = radius(id);
      const cls = ['space', 'land'];
      if (highlight.has(id)) cls.push('is-highlight');
      if (targets.has(id)) cls.push('is-target');
      if (opts.selected === id) cls.push('is-selected');
      if (opts.mine && c.owner === opts.mine) cls.push('is-mine');
      let g = `<g class="${cls.join(' ')}" data-space="${id}" tabindex="0" role="button" aria-label="${esc(n.name)}">`;
      g += `<title>${esc(tooltip(s, id))}</title>`;
      g += `<circle class="mine-ring" cx="${n.x}" cy="${n.y}" r="${r + 10}"${opts.mine ? ` style="--mc:${color(opts.mine)}"` : ''}/>`;
      g += `<circle class="ring" cx="${n.x}" cy="${n.y}" r="${r + 7}"/>`;
      if (n.objective) g += `<circle class="objective-ring" cx="${n.x}" cy="${n.y}" r="${r + 4}"/>`;
      g += `<circle class="land-body" cx="${n.x}" cy="${n.y}" r="${r}" fill="${color(c.owner)}"/>`;
      g += `<text class="inf-count" x="${n.x}" y="${n.y + 3}">${c.inf}</text>`;
      g += `<text class="inf-caption" x="${n.x}" y="${n.y + 15}">inf</text>`;
      if (c.air > 0) {
        g += `<g class="air-badge"><rect x="${n.x + r - 16}" y="${n.y - r - 7}" width="36" height="18" rx="9"/><text x="${n.x + r + 2}" y="${n.y - r + 6}">✈ ${c.air}</text></g>`;
      }
      if (n.capital) g += `<text class="capital-star" x="${n.x - r + 2}" y="${n.y - r + 8}">★</text>`;
      g += `<text class="land-label" x="${n.x}" y="${n.y + r + 18}">${esc(n.label)}</text>`;
      g += '</g>';
      parts.push(g);
    }

    for (const a of opts.arrows || []) parts.push(arrowSvg(a.order, a.power));

    $('map').setAttribute('viewBox', '0 0 ' + MAP.width + ' ' + MAP.height);
    $('map').innerHTML = parts.join('');
  }

  function renderLegend() {
    const items = FS.POWERS.map((p) => `<span class="legend-item"><i style="background:${color(p)}"></i>${esc(pname(p))}</span>`);
    items.push(`<span class="legend-item"><i style="background:${color('neutral')}"></i>Neutral</span>`);
    items.push('<span class="legend-item"><i class="legend-objective"></i>Objective</span>');
    items.push('<span class="legend-item">★ Capital · number = infantry · ✈ = air wings · coloured chips at sea = fleets</span>');
    items.push('<span class="legend-item"><i class="legend-mine"></i>Yours (while giving orders)</span>');
    $('legend').innerHTML = items.join('');
  }

  function renderStatus() {
    // While a turn is being revealed, the bar shows the board as it stood when orders were given.
    const g = app.screen === 'reveal' && app.reveal ? app.reveal.before : app.game;
    if (!g) {
      $('status').innerHTML = '';
      return;
    }
    const need = g.settings.objectivesToWin;
    const cells = FS.POWERS.map((p) => {
      const out = g.eliminated[p] ? ' out' : '';
      return `<span class="status-power${out}" style="--pc:${color(p)}" title="${esc(pname(p))}: ${E.landOwnedBy(g, p).length} regions, earning ${E.income(g, p)} points a turn"><b>${R.powers[p].short}</b> ${E.objectivesHeld(g, p).length}/${need} obj · ${E.landOwnedBy(g, p).length} regions · +${E.income(g, p)}/turn</span>`;
    });
    const round = g.winner && g.lastTurn ? g.lastTurn.round : g.round;
    const label = app.screen === 'reveal' ? 'Round ' + round + ' · resolving' : 'Round ' + round + ' of ' + g.settings.roundLimit;
    $('status').innerHTML = `<span class="status-round">${label}</span>` + cells.join('');
  }

  // ---- Screens ------------------------------------------------------------------------------

  function showOverlay(html) {
    $('dialog').innerHTML = html;
    $('overlay').hidden = false;
  }

  function hideOverlay() {
    $('overlay').hidden = true;
    $('dialog').innerHTML = '';
  }

  function showSetup() {
    app.screen = 'setup';
    const saved = loadSave();
    const rows = FS.POWERS.map(
      (p, i) => `
      <label class="setup-row" style="--pc:${color(p)}">
        <span class="setup-power">${esc(pname(p))}</span>
        <select name="ctl-${p}">
          <option value="human"${i === 0 ? ' selected' : ''}>Human</option>
          <option value="ai"${i === 0 ? '' : ' selected'}>Computer</option>
        </select>
      </label>`
    );
    showOverlay(`
      <h1>Freedom Simulator</h1>
      <p class="lede">Ministry-licensed strategic training. Command Greater America, China or Russia in a three-way war. Every turn, all three commands write orders in secret; then every order happens at once.</p>
      <form id="setup-form" class="setup">
        <fieldset><legend>Who commands each power?</legend>${rows.join('')}
          <p class="hint">Two or three humans? You’ll pass the device between turns; each command writes its orders in private.</p>
        </fieldset>
        <fieldset class="setup-grid"><legend>Rules to test</legend>
          <label>Objectives to win <input type="number" name="objectives" min="2" max="${geo.objectives().length}" value="${R.defaultObjectivesToWin}"></label>
          <label>Round limit <input type="number" name="rounds" min="2" max="40" value="${R.defaultRoundLimit}"></label>
          <label>Seed <input type="text" name="seed" value="${Math.floor(Math.random() * 1e6)}"></label>
        </fieldset>
        <p class="hint">${geo.objectives().length} objectives on this map: ${esc(geo.objectives().map((id) => MAP.land[id].label).join(', '))}. Win by holding the target number at the end of a round, or have the most when the round limit is reached. Every region you hold adds its value to your income each turn, so the more you take, the more you can build.</p>
        <div class="actions">
          ${saved ? `<button type="button" class="ghost" data-action="resume">Resume saved game (round ${saved.round})</button>` : ''}
          <button type="submit" class="primary">Start the war</button>
        </div>
      </form>`);
    $('setup-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const controllers = {};
      for (const p of FS.POWERS) controllers[p] = f.get('ctl-' + p);
      startGame({
        controllers,
        objectivesToWin: clamp(Number(f.get('objectives')), 2, geo.objectives().length, R.defaultObjectivesToWin),
        roundLimit: clamp(Number(f.get('rounds')), 2, 40, R.defaultRoundLimit),
        seed: String(f.get('seed') || Date.now()),
      });
    });
  }

  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  function clamp(n, lo, hi, fallback) {
    if (!Number.isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, Math.round(n)));
  }

  function showHelp() {
    showOverlay(`
      <h2>How a turn works</h2>
      <ol class="help-steps">
        <li><b>Plan in secret.</b> Each command gives orders to its units. Units without orders hold. Nobody sees anyone else’s orders.</li>
        <li><b>Lock in.</b> When every command has locked in, all orders happen at once, in fixed phases:</li>
      </ol>
      <ol class="help-phases">
        <li><b>Air:</b> air wings on patrol over the same space fight for air superiority. The winner’s wings fire in the first round of any battle there.</li>
        <li><b>Sea:</b> fleets move and fight. You hold a zone when only your fleets are left.</li>
        <li><b>Transport:</b> infantry crossing water need you to hold the zone, with 2 infantry per fleet. Otherwise the landing is called off and they stay home.</li>
        <li><b>Land:</b> every move happens at once, then battles are rolled.</li>
        <li><b>Production:</b> builds appear; income (the value of regions you hold) is paid for next turn.</li>
      </ol>
      <h3>When moves collide</h3>
      <table class="help-table">
        <tr><td>Move into an empty region nobody else enters</td><td>You take it</td></tr>
        <tr><td>Move in as the defender moves out</td><td>You walk in unopposed</td></tr>
        <tr><td>Two or three powers move into the same region</td><td>They all fight there</td></tr>
        <tr><td>Two armies trade places</td><td>They meet on the border and fight; the survivor carries on, or both fall back</td></tr>
        <tr><td>An attack fails against a defender who holds</td><td>Survivors fall back home, unless home was lost this turn, in which case they are destroyed</td></tr>
      </table>
      <h3>Battles</h3>
      <p>Each unit rolls a die and hits on its value or less, for up to ${R.maxBattleRounds} rounds. Each hit lands on whichever enemy has the most units left.</p>
      <table class="help-table">
        <tr><th></th><th>Infantry</th><th>Fleet</th><th>Air wing</th></tr>
        ${FS.POWERS.map((p) => {
          const u = R.powers[p].units;
          const cell = (k) => `${u[k].cost} pt${u[k].cost === 1 ? '' : 's'} · att ${u[k].att} / def ${u[k].def}`;
          return `<tr><td style="color:${color(p)}"><b>${esc(pname(p))}</b></td><td>${cell('inf')}</td><td>${cell('fleet')}</td><td>${cell('air')}</td></tr>`;
        }).join('')}
      </table>
      <p class="hint">Russia’s infantry defend at +${R.powers.russia.homeDefenseBonus} on Russian soil. Neutral garrisons defend at ${R.neutralDefense} and never move.</p>
      <div class="actions"><button class="primary" data-action="close-overlay">Back to the war</button></div>`);
  }

  function startGame(settings) {
    app.game = E.newGame(settings);
    save();
    hideOverlay();
    beginRound();
  }

  function resumeGame() {
    const g = loadSave();
    if (!g) return showSetup();
    app.game = g;
    hideOverlay();
    if (g.winner) return showGameOver();
    beginRound();
  }

  function beginRound() {
    app.orders = {};
    for (const p of FS.POWERS) app.orders[p] = [];
    app.queue = humans();
    app.selected = null;
    app.message = null;
    if (app.queue.length === 0) return resolve(); // all computer powers: watch mode
    nextHuman();
  }

  function nextHuman() {
    app.current = app.queue.shift();
    app.selected = null;
    app.message = null;
    if (humans().length > 1) {
      app.screen = 'handover';
      render();
      const p = app.current;
      showOverlay(`
        <div class="handover" style="--pc:${color(p)}">
          <p class="eyebrow">Round ${app.game.round}</p>
          <h2>Pass the device to ${esc(R.powers[p].command)}</h2>
          <p>Everyone else, look away. Orders stay secret until every command has locked in.</p>
          <div class="actions"><button class="primary" data-action="take-command">I’m ${esc(pname(p))}. Show my orders.</button></div>
        </div>`);
      return;
    }
    app.screen = 'orders';
    render();
  }

  function resolve() {
    const g = app.game;
    const orders = {};
    for (const p of FS.POWERS) {
      if (g.eliminated[p]) continue;
      orders[p] = g.settings.controllers[p] === 'human' ? app.orders[p] : FS.ai.planOrders(g, p);
    }
    const result = E.resolveTurn(g, orders);
    app.reveal = { before: g, battles: result.afterBattles, after: result.state, events: result.events, orders: result.state.lastTurn.orders, step: 0, focus: null };
    app.game = result.state;
    save();
    app.screen = 'reveal';
    app.selected = null;
    render();
  }

  function showGameOver() {
    app.screen = 'over';
    render();
    const g = app.game;
    const rows = FS.POWERS.map((p) => {
      const held = E.objectivesHeld(g, p).map((id) => MAP.land[id].label).join(', ') || 'none';
      const ai = g.settings.controllers[p] === 'ai' ? ` <span class="hint">(computer, ${esc(R.temperaments[g.settings.temperaments[p]].label.toLowerCase())})</span>` : '';
      return `<tr><td style="color:${color(p)}"><b>${esc(pname(p))}</b>${ai}</td><td>${E.objectivesHeld(g, p).length}</td><td>${esc(held)}</td><td>${E.income(g, p)}</td></tr>`;
    });
    const title = g.winner === 'draw' ? 'The war ends in a draw' : `${esc(pname(g.winner))} wins`;
    showOverlay(`
      <h2>${title}</h2>
      <p class="lede">${esc(capitalize(g.winReason || ''))}, after ${g.lastTurn ? g.lastTurn.round : g.round} rounds.</p>
      <table class="help-table"><tr><th>Power</th><th>Objectives</th><th>Held</th><th>Income</th></tr>${rows.join('')}</table>
      <div class="actions">
        <button class="ghost" data-action="close-overlay">Look at the board</button>
        <button class="primary" data-action="new-game">New game</button>
      </div>`);
  }

  // ---- Panel: orders ----------------------------------------------------------------------

  function targetOptions(p, id) {
    return E.infTargets(app.game, p, id).map((t) => ({
      value: t.to + '|' + (t.via || ''),
      label: MAP.land[t.to].label + (t.via ? ' — by sea across the ' + MAP.sea[t.via].label : ''),
    }));
  }

  function selectHtml(name, options) {
    return `<select name="${name}">${options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`;
  }

  function countInput(max) {
    return `<input type="number" name="count" min="1" max="${max}" value="${max}" aria-label="How many">`;
  }

  function selectionTargets() {
    const p = app.current;
    const id = app.selected;
    const set = new Set();
    if (!id || app.screen !== 'orders') return set;
    if (geo.isLand(id) && app.game.land[id].owner === p) {
      for (const t of E.infTargets(app.game, p, id)) set.add(t.to);
    } else if (geo.isSea(id) && app.game.sea[id].fleets[p] > 0) {
      for (const z of E.fleetTargets(app.game, p, id)) set.add(z);
    }
    return set;
  }

  function spaceInfo(id) {
    const g = app.game;
    if (geo.isSea(id)) {
      const n = MAP.sea[id];
      const fleets = FS.POWERS.filter((p) => g.sea[id].fleets[p] > 0).map((p) => `<span style="color:${color(p)}">${esc(pname(p))} ${g.sea[id].fleets[p]}</span>`);
      const holder = E.soleFleetPower(g.sea[id]);
      return `<h3>${esc(n.name)}</h3><p class="meta">Sea zone · ${holder ? 'held by ' + esc(pname(holder)) : fleets.length ? 'contested' : 'empty'} · touches ${n.coasts.map((c) => esc(MAP.land[c].label)).join(', ')}</p>${fleets.length ? `<p>Fleets: ${fleets.join(' · ')}</p>` : ''}`;
    }
    const n = MAP.land[id];
    const c = g.land[id];
    const tags = [];
    if (n.capital) tags.push('capital of ' + esc(pname(n.capital)));
    if (n.objective) tags.push('objective');
    tags.push('worth ' + n.value + ' pts/turn');
    return `<h3 style="color:${color(c.owner)}">${esc(n.name)}</h3><p class="meta">${esc(c.owner === 'neutral' ? 'Neutral' : pname(c.owner))} · ${tags.join(' · ')}</p><p>${c.inf} infantry${c.air ? ' · ' + c.air + ' air wing' + (c.air > 1 ? 's' : '') : ''}</p>`;
  }

  function unitCount(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  // Unique list of place names, joined for a sentence.
  function nameList(ids) {
    const seen = [];
    for (const id of ids) if (!seen.includes(id)) seen.push(id);
    return seen.map((id) => (geo.isLand(id) ? MAP.land[id].label : MAP.sea[id].label)).join(', ');
  }

  // The overview shown when nothing is selected: totals, then every place you have units.
  function forcesOverview(rem) {
    const g = app.game;
    const p = app.current;
    const myLand = E.landOwnedBy(g, p);
    const mySeas = Object.keys(g.sea).filter((z) => g.sea[z].fleets[p] > 0);
    const totals = {
      inf: myLand.reduce((n, id) => n + g.land[id].inf, 0),
      air: myLand.reduce((n, id) => n + g.land[id].air, 0),
      fleet: mySeas.reduce((n, z) => n + g.sea[z].fleets[p], 0),
    };
    let html = `
      <section class="totals">
        <div><b>${totals.inf}</b><span>infantry</span></div>
        <div><b>${totals.air}</b><span>air wings</span></div>
        <div><b>${totals.fleet}</b><span>fleets</span></div>
        <div><b>${rem.points}</b><span>points to spend</span></div>
      </section>
      <p class="income-line">You hold <b>${myLand.length} regions</b>, earning <b>${E.income(g, p)} points a turn</b>. Every region you take adds its value (1–3) to that.</p>
      <details class="howto"${app.game.round === 1 ? ' open' : ''}>
        <summary>How to give orders</summary>
        <ol>
          <li>Pick one of your places below, or click it on the map. Your places have a coloured outline.</li>
          <li>Choose what its units do: <b>infantry</b> move or attack, <b>air wings</b> patrol over a battle to add firepower, <b>fleets</b> sail or stay to carry infantry, and any place can <b>build</b> new units with points.</li>
          <li>Press <b>Lock in</b> when you’re done. Anything without orders stays where it is and defends.</li>
        </ol>
      </details>
      <section class="forces"><h4>Your forces</h4>`;

    for (const id of myLand) {
      const c = g.land[id];
      const free = rem.land[id];
      const enemyTargets = E.infTargets(g, p, id).filter((t) => g.land[t.to].owner !== p).map((t) => t.to);
      const parts = [unitCount(c.inf, 'infantry', 'infantry')];
      if (c.air) parts.push(unitCount(c.air, 'air wing', 'air wings'));
      const ordered = c.inf - free.inf + (c.air - free.air);
      let can;
      if (c.inf === 0 && c.air === 0) can = 'Empty. You can build here.';
      else if (enemyTargets.length) can = 'Can attack: ' + nameList(enemyTargets);
      else can = 'Nothing to attack from here. Move toward the front, or hold.';
      html += `<button class="force-row" data-action="select" data-space="${id}" style="--pc:${color(p)}">
        <span class="force-name">${esc(MAP.land[id].label)}${MAP.land[id].capital === p ? ' ★' : ''}</span>
        <span class="force-units">${esc(parts.join(' · '))}${ordered > 0 ? ` <em>(${ordered} ordered)</em>` : ''}</span>
        <span class="force-can">${esc(can)}</span>
      </button>`;
    }
    for (const z of mySeas) {
      const n = g.sea[z].fleets[p];
      const coasts = MAP.sea[z].coasts.filter((c) => g.land[c].owner === p);
      const can = 'Can sail to: ' + nameList(E.fleetTargets(g, p, z)) + (coasts.length ? '. If they stay, they carry up to ' + n * R.transportCapacity + ' infantry from ' + nameList(coasts) + '.' : '.');
      html += `<button class="force-row" data-action="select" data-space="${z}" style="--pc:${color(p)}">
        <span class="force-name">${esc(MAP.sea[z].name)}</span>
        <span class="force-units">${unitCount(n, 'fleet', 'fleets')}${n - rem.sea[z] > 0 ? ` <em>(${n - rem.sea[z]} ordered)</em>` : ''}</span>
        <span class="force-can">${esc(can)}</span>
      </button>`;
    }
    html += '</section>';
    return html;
  }

  // For a place you don't hold: which of your units could reach it this turn.
  function reachableFrom(id) {
    const g = app.game;
    const p = app.current;
    const lines = [];
    if (geo.isLand(id)) {
      for (const from of E.landOwnedBy(g, p)) {
        if (!g.land[from].inf) continue;
        const ways = E.infTargets(g, p, from).filter((t) => t.to === id);
        for (const w of ways) lines.push(MAP.land[from].label + ' (' + g.land[from].inf + ' infantry' + (w.via ? ', by sea across the ' + MAP.sea[w.via].label : '') + ')');
        if (g.land[from].air && E.airTargets(g, p, from, 'patrol').includes(id)) lines.push(MAP.land[from].label + ' (' + unitCount(g.land[from].air, 'air wing', 'air wings') + ' can patrol over it)');
      }
    } else {
      for (const z of Object.keys(g.sea)) if (g.sea[z].fleets[p] > 0 && E.fleetTargets(g, p, z).includes(id)) lines.push(MAP.sea[z].name + ' (' + unitCount(g.sea[z].fleets[p], 'fleet', 'fleets') + ')');
    }
    if (!lines.length) {
      let tip = '';
      if (geo.isLand(id) && geo.isCoastal(id)) {
        const seas = geo.seasOf(id).filter((z) => MAP.sea[z].coasts.some((c) => c !== id && g.land[c].owner === p));
        if (seas.length) tip = ' To land here, first get a fleet into the ' + seas.map((z) => MAP.sea[z].name).join(' or the ') + '. A fleet that stays there next turn can carry infantry from your coast on that sea.';
      }
      return `<p class="hint">None of your units can reach it this turn.${esc(tip)}</p>`;
    }
    return `<p class="reach-title">Your units that can reach it:</p><ul class="reach">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p class="hint">Select one of those to give the order.</p>`;
  }

  function renderOrdersPanel() {
    const g = app.game;
    const p = app.current;
    const rem = E.remaining(g, p, app.orders[p]);
    const costs = R.powers[p].units;
    let html = `
      <div class="power-head" style="--pc:${color(p)}">
        <p class="eyebrow">Round ${g.round} of ${g.settings.roundLimit} · orders</p>
        <h2>${esc(pname(p))}</h2>
        <p class="meta">${esc(R.powers[p].command)} · ${rem.points} of ${g.points[p]} pts left · ${E.objectivesHeld(g, p).length}/${g.settings.objectivesToWin} objectives</p>
      </div>`;

    if (app.message) html += `<p class="notice">${esc(app.message)}</p>`;

    const id = app.selected;
    if (!id) {
      html += forcesOverview(rem);
    } else {
      html += `<button class="ghost small back" data-action="deselect">← All your forces</button>`;
      html += `<section class="selected">${spaceInfo(id)}`;
      if (geo.isLand(id) && g.land[id].owner === p) {
        const free = rem.land[id];
        if (free.inf > 0) {
          html += `<div class="order-form" data-form="inf"><h4>Move or attack with infantry · ${free.inf} free</h4>
            <p class="explain">Send them into a neighbouring region. If you hold it, they reinforce it. If anyone else holds it, it’s an attack. Regions across water need one of your fleets in that sea zone.</p>
            <div class="form-row">Send ${countInput(free.inf)} to ${selectHtml('dest', targetOptions(p, id))}</div>
            <button class="primary small" data-action="add-inf">Order move</button></div>`;
        } else if (g.land[id].inf > 0) {
          html += '<p class="hint">All infantry here already have orders.</p>';
        }
        if (free.air > 0) {
          const patrol = E.airTargets(g, p, id, 'patrol').map((t) => ({ value: t, label: geo.spaceName(t) + (t === id ? ' (stay over home)' : '') }));
          const rebase = E.airTargets(g, p, id, 'rebase').map((t) => ({ value: t, label: MAP.land[t].label }));
          html += `<div class="order-form" data-form="air-patrol"><h4>Air wings · ${free.air} free</h4>
            <p class="explain"><b>Patrol</b> over a place where there will be a battle: if you win the sky there, they add firepower in the first round. They fly home after. Air wings left at home help defend it.</p>
            <div class="form-row">Send ${countInput(free.air)} to patrol over ${selectHtml('dest', patrol)}</div>
            <button class="primary small" data-action="add-air" data-mode="patrol">Order patrol</button></div>`;
          if (rebase.length) {
            html += `<div class="order-form" data-form="air-rebase">
              <p class="explain"><b>Rebase</b> moves air wings to another of your regions for good, to get them nearer the fighting.</p>
              <div class="form-row">Move ${countInput(free.air)} to ${selectHtml('dest', rebase)}</div>
              <button class="ghost small" data-action="add-air" data-mode="rebase">Order rebase</button></div>`;
          }
        }
        html += `<div class="order-form"><h4>Build here · ${rem.points} pts left</h4>
          <p class="explain">New units appear at the end of the turn, so they can act next turn.</p>
          <div class="form-row">
          <button class="ghost small" data-action="build" data-unit="inf" data-at="${id}"${costs.inf.cost > rem.points ? ' disabled' : ''}>+ Infantry · ${costs.inf.cost} pts</button>
          <button class="ghost small" data-action="build" data-unit="air" data-at="${id}"${costs.air.cost > rem.points ? ' disabled' : ''}>+ Air wing · ${costs.air.cost} pts</button>
        </div></div>`;
      } else if (geo.isSea(id)) {
        const free = rem.sea[id];
        if (free > 0) {
          const opts = E.fleetTargets(g, p, id).map((z) => ({ value: z, label: MAP.sea[z].name }));
          html += `<div class="order-form" data-form="fleet"><h4>Your fleets · ${free} free</h4>
            <p class="explain">Sail to a neighbouring sea zone, fighting any enemy fleets there. Or give no order: fleets that stay hold this zone and can carry 2 infantry each to any coast it touches.</p>
            <div class="form-row">Send ${countInput(free)} to ${selectHtml('dest', opts)}</div>
            <button class="primary small" data-action="add-fleet">Order move</button></div>`;
        } else if (g.sea[id].fleets[p] > 0) {
          html += '<p class="hint">All your fleets here already have orders.</p>';
        } else {
          html += reachableFrom(id);
        }
        if (E.buildSpots(g, p, 'fleet').includes(id)) {
          html += `<div class="order-form"><h4>Build here · ${rem.points} pts left</h4>
            <p class="explain">New fleets appear at the end of the turn.</p>
            <div class="form-row"><button class="ghost small" data-action="build" data-unit="fleet" data-at="${id}"${costs.fleet.cost > rem.points ? ' disabled' : ''}>+ Fleet · ${costs.fleet.cost} pts</button></div></div>`;
        }
      } else {
        html += reachableFrom(id);
      }
      html += '</section>';
    }

    const list = app.orders[p];
    html += `<section class="order-list"><h4>Your orders this turn (${list.length})</h4>`;
    html += list.length
      ? '<ol>' + list.map((o, i) => `<li><span>${esc(E.describeOrder(o))}</span><button class="icon" data-action="remove-order" data-index="${i}" aria-label="Remove order">✕</button></li>`).join('') + '</ol>'
      : '<p class="hint">No orders yet. Everything will stay put and defend.</p>';
    html += '</section>';

    const lockLabel = app.queue.length ? 'Lock in and pass on' : 'Lock in orders';
    html += `<div class="actions sticky"><button class="primary" data-action="lock-in">${lockLabel}</button></div>`;
    $('panel').innerHTML = html;
  }

  function addOrder(order) {
    const p = app.current;
    const next = app.orders[p].concat([order]);
    const v = E.validateOrders(app.game, p, next);
    if (v.rejected.length) {
      app.message = 'That order can’t be given: ' + v.rejected[0].reason + '.';
    } else {
      app.orders[p] = next;
      app.message = null;
    }
    render();
  }

  function formValues(button) {
    const form = button.closest('.order-form');
    return {
      count: Number(form.querySelector('[name=count]').value),
      dest: form.querySelector('[name=dest]').value,
    };
  }

  // ---- Panel: reveal ----------------------------------------------------------------------

  function revealSteps() {
    return PHASES.filter((ph) => app.reveal.events.some((e) => e.phase === ph.id));
  }

  function revealArrows(stepId) {
    const out = [];
    const orders = app.reveal.orders;
    for (const p of FS.POWERS) {
      for (const o of orders[p] || []) {
        const show =
          stepId === 'orders' ||
          (stepId === 'air' && o.kind === 'air') ||
          (stepId === 'sea' && o.kind === 'move' && o.unit === 'fleet') ||
          (stepId === 'transport' && o.kind === 'move' && o.unit === 'inf' && o.via) ||
          (stepId === 'land' && o.kind === 'move' && o.unit === 'inf') ||
          (stepId === 'production' && o.kind === 'build');
        if (show) out.push({ order: o, power: p });
      }
    }
    return out;
  }

  function renderRevealPanel() {
    const rv = app.reveal;
    const steps = revealSteps();
    const step = steps[rv.step];
    const events = rv.events.map((e, i) => Object.assign({ i }, e)).filter((e) => e.phase === step.id);
    const last = rv.step === steps.length - 1;
    const dots = steps
      .map((s, i) => `<button class="step-dot${i === rv.step ? ' on' : ''}" data-action="goto-step" data-step="${i}" title="${esc(s.title)}">${i + 1}</button>`)
      .join('');
    $('panel').innerHTML = `
      <div class="power-head">
        <p class="eyebrow">Round ${rv.before.round} · resolving</p>
        <h2>${esc(step.title)}</h2>
        <p class="meta">${esc(step.blurb)}</p>
      </div>
      <div class="step-dots">${dots}</div>
      <ul class="events">${events
        .map((e) => `<li class="event${rv.focus === e.i ? ' focus' : ''}" style="--pc:${e.power ? color(e.power) : '#8a8f99'}" data-action="focus-event" data-i="${e.i}">${esc(e.text)}</li>`)
        .join('')}</ul>
      <p class="hint">Click an entry to point it out on the map.</p>
      <div class="actions sticky">
        <button class="ghost" data-action="prev-step"${rv.step === 0 ? ' disabled' : ''}>Back</button>
        <button class="primary" data-action="next-step">${last ? (app.game.winner ? 'See the result' : 'Start round ' + app.game.round) : 'Next phase'}</button>
      </div>`;
  }

  // ---- Render -------------------------------------------------------------------------------

  function render() {
    renderStatus();
    const g = app.game;
    if (!g) return;
    if (app.screen === 'reveal') {
      const rv = app.reveal;
      const steps = revealSteps();
      const step = steps[rv.step];
      const board = rv[BOARD_FOR_PHASE[step.id]];
      const highlight = new Set();
      const focused = rv.focus != null ? [rv.events[rv.focus]] : rv.events.filter((e) => e.phase === step.id);
      for (const e of focused) for (const sp of e.spaces) highlight.add(sp);
      renderMap({ state: board, highlight, arrows: revealArrows(step.id) });
      renderRevealPanel();
      return;
    }
    if (app.screen === 'orders') {
      const p = app.current;
      renderMap({
        state: g,
        selected: app.selected,
        mine: p,
        targets: selectionTargets(),
        arrows: app.orders[p].map((o) => ({ order: o, power: p })),
      });
      renderOrdersPanel();
      return;
    }
    renderMap({ state: g });
    if (app.screen === 'over') {
      $('panel').innerHTML = `<div class="power-head"><h2>${g.winner === 'draw' ? 'Draw' : esc(pname(g.winner)) + ' wins'}</h2><p class="meta">${esc(g.winReason || '')}</p></div><div class="actions"><button class="primary" data-action="new-game">New game</button></div>`;
    } else {
      $('panel').innerHTML = '';
    }
  }

  // ---- Events -------------------------------------------------------------------------------

  function onAction(el) {
    const action = el.dataset.action;
    const p = app.current;
    switch (action) {
      case 'resume':
        return resumeGame();
      case 'close-overlay':
        return hideOverlay();
      case 'new-game':
        clearSave();
        app.game = null;
        renderMap({ state: E.newGame({ seed: 'preview' }) });
        $('panel').innerHTML = '';
        renderStatus();
        return showSetup();
      case 'select':
        app.selected = el.dataset.space;
        app.message = null;
        return render();
      case 'deselect':
        app.selected = null;
        app.message = null;
        return render();
      case 'take-command':
        hideOverlay();
        app.screen = 'orders';
        return render();
      case 'add-inf': {
        const v = formValues(el);
        const [to, via] = v.dest.split('|');
        return addOrder({ kind: 'move', unit: 'inf', from: app.selected, to, via: via || null, count: v.count });
      }
      case 'add-fleet': {
        const v = formValues(el);
        return addOrder({ kind: 'move', unit: 'fleet', from: app.selected, to: v.dest, count: v.count });
      }
      case 'add-air': {
        const v = formValues(el);
        return addOrder({ kind: 'air', mode: el.dataset.mode, from: app.selected, to: v.dest, count: v.count });
      }
      case 'build': {
        const list = app.orders[p];
        const existing = list.findIndex((o) => o.kind === 'build' && o.unit === el.dataset.unit && o.at === el.dataset.at);
        if (existing >= 0) {
          const next = list.map((o, i) => (i === existing ? Object.assign({}, o, { count: o.count + 1 }) : o));
          const v = E.validateOrders(app.game, p, next);
          if (v.rejected.length) app.message = 'Not enough points.';
          else app.orders[p] = next;
          return render();
        }
        return addOrder({ kind: 'build', unit: el.dataset.unit, at: el.dataset.at, count: 1 });
      }
      case 'remove-order':
        app.orders[p] = app.orders[p].filter((_, i) => i !== Number(el.dataset.index));
        app.message = null;
        return render();
      case 'lock-in':
        app.selected = null;
        if (app.queue.length) return nextHuman();
        return resolve();
      case 'focus-event': {
        const i = Number(el.dataset.i);
        app.reveal.focus = app.reveal.focus === i ? null : i;
        return render();
      }
      case 'goto-step':
        app.reveal.step = Number(el.dataset.step);
        app.reveal.focus = null;
        return render();
      case 'prev-step':
        app.reveal.step = Math.max(0, app.reveal.step - 1);
        app.reveal.focus = null;
        return render();
      case 'next-step': {
        const steps = revealSteps();
        if (app.reveal.step < steps.length - 1) {
          app.reveal.step += 1;
          app.reveal.focus = null;
          return render();
        }
        if (app.game.winner) return showGameOver();
        return beginRound();
      }
      case 'help':
        return showHelp();
      default:
        return undefined;
    }
  }

  function onSpaceClick(id) {
    if (app.screen !== 'orders') return;
    app.selected = app.selected === id ? null : id;
    app.message = null;
    render();
  }

  function init() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (el && !el.disabled) onAction(el);
    });
    $('map').addEventListener('click', (e) => {
      const g = e.target.closest('[data-space]');
      if (g) onSpaceClick(g.dataset.space);
    });
    $('map').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const g = e.target.closest('[data-space]');
      if (g) {
        e.preventDefault();
        onSpaceClick(g.dataset.space);
      }
    });
    renderLegend();
    renderMap({ state: E.newGame({ seed: 'preview' }) });
    showSetup();
  }

  FS.ui = { init };
})(globalThis);
