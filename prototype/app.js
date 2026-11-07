/* Tabletop Golf — prototype UI (vanilla JS + SVG). Depends on engine.js. */
(function () {
  'use strict';
  const E = window.Engine;

  // ------------------------------------------------------------- helpers
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    let value;
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'value') value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      el.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    if (value !== undefined) el.value = value;
    return el;
  }
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; }
  function quant(v, step, min, max) {
    if (isNaN(v)) v = min;
    v = Math.min(max, Math.max(min, v));
    v = Math.round((v - min) / step) * step + min;
    return +v.toFixed(4);
  }
  const fmt = (v, d = 2) => (v == null || isNaN(v) ? '–' : v.toFixed(d));
  const sgn = (v, d = 2) => (v == null || isNaN(v) ? '–' : (v >= 0 ? '+' : '') + v.toFixed(d));
  const pct = (v, d = 0) => (v == null || isNaN(v) ? '–' : (v * 100).toFixed(d) + '%');
  const powLabel = (p) => Math.round(p * 100) + '%';
  // The 3 distance zones (long game) or putting bands, each as one representative 2d6 total + probability.
  const inOn = (t) => (t <= 2 ? 'always in' : t > 12 ? "can't go in" : t === 12 ? '12' : `${t}+`);
  function zoneRows(cfg, tier) {
    const list = E.zonesFor(cfg, tier || 1);
    return list.map((z) => {
      let p = 0; for (let x = z.from; x <= z.to; x++) p += (6 - Math.abs(x - 7)) / 36;
      return { sum: z.from, p, from: z.from, to: z.to, label: z.label || `${z.from}–${z.to}`, range: z.from === z.to ? `${z.from}` : `${z.from}–${z.to}`, z };
    });
  }
  const sec = (title, ...kids) => h('div', { class: 'sec' }, h('h3', null, title), ...kids);
  const stat = (label, val) => h('div', { class: 'stat' }, h('b', null, val), h('span', null, label));
  const row = (label, ...kids) => h('div', { class: 'row' }, label != null ? h('label', null, label) : null, ...kids);
  function download(name, obj) {
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  function pickFile(cb) {
    const inp = h('input', { type: 'file', accept: '.json,application/json', onchange: () => {
      const f = inp.files[0]; if (!f) return;
      f.text().then((t) => { try { cb(JSON.parse(t)); } catch (e) { alert('Invalid JSON: ' + e.message); } });
    } });
    inp.click();
  }
  function mergeDeep(base, over) {
    if (Array.isArray(base) || typeof base !== 'object' || base == null) return over === undefined ? base : over;
    const out = Object.assign({}, base);
    if (over && typeof over === 'object') for (const k in over) out[k] = k in base ? mergeDeep(base[k], over[k]) : over[k];
    return out;
  }

  // --------------------------------------------------------------- state
  const KIND_ORDER = ['fairway', 'green', 'bunker', 'water', 'trees'];
  const COLORS = { rough: '#a8bb82', fairway: '#79b85a', green: '#2e8a48', bunker: '#e8d6a4', water: '#4b8fd6', trees: 'url(#treePat)' };
  const DOT = { tee: '#fff', rough: '#5d6e3c', fairway: '#e9ffe0', green: '#ffffff', bunker: '#a87a20', water: '#0a3a8a', trees: '#0c2410', ob: '#e0102a' };

  const TIERS = Array.from({ length: E.MAX_TIER }, (_, i) => i + 1);
  // Bring an older config (3 tiers, single putting %) up to the current shape.
  function migrateCfg(j) {
    const D = E.DEFAULT_CONFIG, c = mergeDeep(E.clone(D), j || {});
    while (c.progression.tierCosts.length < E.MAX_TIER - 1) c.progression.tierCosts.push(D.progression.tierCosts[c.progression.tierCosts.length]);
    c.version = D.version;
    return c;
  }
  const _stored = LS.get('ttg.cfg', null);
  const cfgWasReset = !!(_stored && _stored.version !== E.DEFAULT_CONFIG.version);
  const S = {
    cfg: _stored && !cfgWasReset ? migrateCfg(_stored) : E.clone(E.DEFAULT_CONFIG),
    cfgVer: 0,
    hole: LS.get('ttg.hole', null) || E.clone(E.PRESETS[0]),
    holeVer: 0,
    tab: LS.get('ttg.tab', 'play'),
    sel: null, snap: true,
    hover: null,
    ui: { explain: null, explainBoard: true, club: 'driver', power: 1, diceMode: 'random', manual: { d1: 3, d2: 4, dir: 3 }, botProfile: 'expert', showCloud: true, mirror: true, freeUpgrades: false, genPar: 0, genSeed: 1 },
    aim: null, suggestion: null, game: null,
    lib: LS.get('ttg.lib', []),
    sim: {
      source: 'presets', randomCount: 30, seed: 1, n: 300, tierAll: 1,
      profiles: { beginner: true, average: true, expert: true, gambler: false },
      running: false, cancel: false, label: '', runs: [], latest: null, upg: null,
      sweep: { path: 'fanOuter.1', from: 9, to: 21, step: 3, profile: 'average', n: 200 }, sweepRes: null,
    },
  };
  S.cfg.version = E.DEFAULT_CONFIG.version;
  E.setLieMode(S.cfg);

  let _H = null, _Hv = -1;
  function getH() { if (_Hv !== S.holeVer) { _H = E.prepHole(S.hole); _Hv = S.holeVer; } return _H; }
  const ctxCache = new Map();
  function getCtx(tiers) {
    const k = S.cfgVer + '|' + JSON.stringify(tiers);
    if (!ctxCache.has(k)) ctxCache.set(k, E.botContext(S.cfg, tiers));
    return ctxCache.get(k);
  }
  function cfgChanged() {
    S.cfgVer++; ctxCache.clear(); E.setLieMode(S.cfg);
    LS.set('ttg.cfg', S.cfg);
    for (const c of S.cfg.clubs) if (S.game.tiers[c.id] == null) S.game.tiers[c.id] = 1;
    render();
  }
  function holeChanged(keepGame) {
    S.holeVer++; LS.set('ttg.hole', S.hole);
    if (!keepGame) resetHole();
    render();
  }
  function defaultTiers(t) { const o = { putter: t || 1 }; for (const c of S.cfg.clubs) o[c.id] = t || 1; return o; }

  // ---------------------------------------------------------------- game
  function newGame() {
    S.game = { tiers: defaultTiers(1), coins: 0, holesPlayed: 0, totalDiff: 0 };
    resetHole();
  }
  function resetHole() {
    const H = getH();
    Object.assign(S.game, { state: E.startState(H), shots: [], log: [], msg: '', holeVer: S.holeVer, scored: false });
    S.aim = null; S.suggestion = null;
    autoClub();
  }
  const clubName = (id) => (id === 'putter' ? 'Putter' : (E.getClub(S.cfg, id) || { name: id }).name);
  function scoreName(d) {
    return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : d === 3 ? 'Triple bogey' : `+${d}`;
  }
  function describe(r, n) {
    const sum = r.dice.d1 + r.dice.d2;
    if (r.putt) {
      return `#${n} Putt T${r.tier} from ring ${r.ring}: ${r.choice.toUpperCase()} (in on ${inOn(r.target)}) · 2d6 ${r.dice.d1}+${r.dice.d2}=${sum} → ${r.holed ? 'HOLED' : `missed, ball to ring ${r.destRing}`}`;
    }
    let s = `#${n} ${clubName(r.club)} ${powLabel(r.power)} T${r.tier} from ${r.from.lie}: 2d6 ${r.dice.d1}+${r.dice.d2}=${sum} → ${r.distance} yd · dir ${r.dice.dir} → ${r.angle > 0 ? '+' : ''}${r.angle}° · lands ${r.landLie}`;
    if (r.blocked) s += ' (stopped by trees)';
    if (r.penalty) s += ` · +${r.penalty} penalty`;
    if (r.drop) s += ' · dropped';
    if (r.holed) s += ' · HOLED!';
    return s;
  }
  function rollDice() {
    if (S.ui.diceMode === 'manual') return Object.assign({}, S.ui.manual);
    const r = Math.random;
    return { d1: 1 + Math.floor(r() * 6), d2: 1 + Math.floor(r() * 6), dir: 1 + Math.floor(r() * 6) };
  }
  function hit(dice, puttChoice) {
    const g = S.game, H = getH();
    if (g.state.holed) return;
    const dec = g.state.onGreen ? { putt: puttChoice || 'safe' } : { club: S.ui.club, power: S.ui.power, aim: S.aim || H.pin };
    let out;
    try { out = E.playShot(H, S.cfg, g.state, dec, g.tiers, dice || rollDice()); } catch (e) { alert(e.message); return; }
    g.shots.push(out.result);
    S.ui.explain = null;
    g.state = out.state;
    g.log.push(describe(out.result, g.shots.length));
    if (g.state.holed) finishHole();
    else if (!g.state.onGreen) autoClub();
    S.aim = null; S.suggestion = null;
  }
  // Default club/power: the one whose average (7 pips) is closest to the pin.
  function autoClub() {
    const g = S.game, d = E.dist(g.state, getH().pin);
    const dec = E.decide(getH(), S.cfg, g.state, g.tiers, E.PROFILES[0], getCtx(g.tiers), false);
    S.ui.club = dec.club; S.ui.power = dec.power;
    return d;
  }
  function finishHole() {
    const g = S.game, par = E.parOf(getH(), S.cfg), d = g.state.strokes - par, C = S.cfg.progression.coins;
    const coins = d <= -1 ? C.birdieOrBetter : d === 0 ? C.par : d === 1 ? C.bogey : C.worse;
    g.coins += coins; g.holesPlayed++; g.totalDiff += d; g.scored = true;
    g.msg = `${scoreName(d)} (${g.state.strokes} on a par ${par}) · +${coins} coins`;
  }
  function botSuggest() {
    const g = S.game, H = getH();
    if (g.state.onGreen || g.state.holed) return null;
    const prof = E.PROFILES.find((p) => p.id === S.ui.botProfile);
    const d = E.decide(H, S.cfg, g.state, g.tiers, prof, getCtx(g.tiers), true);
    S.ui.club = d.club; S.ui.power = d.power; S.aim = { x: d.aim.x, y: d.aim.y };
    S.suggestion = d;
    return d;
  }
  function botPutt() {
    const g = S.game, prof = E.PROFILES.find((p) => p.id === S.ui.botProfile);
    return E.decidePutt(getH(), S.cfg, g.state, g.tiers, prof, getCtx(g.tiers));
  }
  function botShot() { if (S.game.state.onGreen) hit(null, botPutt()); else { botSuggest(); hit(); } }
  function botFinish() { let i = 0; while (!S.game.state.holed && i++ < 30) botShot(); }

  // --------------------------------------------------------------- board
  const svg = document.getElementById('board');
  const layer = document.getElementById('layer');
  const f1 = (v) => Math.round(v * 10) / 10;
  const ell = (sh, fill, cls) => `<ellipse cx="${sh.cx}" cy="${sh.cy}" rx="${sh.rx}" ry="${sh.ry}" transform="rotate(${sh.rotation || 0} ${sh.cx} ${sh.cy})" fill="${fill}" ${cls ? `class="${cls}"` : ''}/>`;
  const line = (a, b, cls) => `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" class="${cls}"/>`;
  function arcPath(c, r, a0, a1) {
    const pts = [];
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 0.05));
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push(`${f1(c.x + Math.cos(a) * r)},${f1(c.y + Math.sin(a) * r)}`); }
    return `<polyline points="${pts.join(' ')}" class="arc"/>`;
  }
  function lieShapesInOrder(hole) {
    const shapes = hole.shapes.filter((s) => KIND_ORDER.includes(s.kind));
    if (S.cfg.rules.lieMode === 'stacking') return shapes;
    // priority mode: draw lowest priority first so the visible top matches the rule
    const pri = ['fairway', 'green', 'trees', 'bunker', 'water'];
    return shapes.slice().sort((a, b) => pri.indexOf(a.kind) - pri.indexOf(b.kind));
  }
  function handlePts(sh) {
    const t = ((sh.rotation || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const w = (lx, ly) => ({ x: sh.cx + lx * c - ly * s, y: sh.cy + lx * s + ly * c });
    if (sh.tile) {
      const ext = Math.max(...E.getTile(sh.tile).parts.map((q) => Math.hypot(q.x, q.y) + Math.max(q.rx, q.ry)));
      return [['rot', w(0, -(ext + 10))]];
    }
    return [['rx', w(sh.rx, 0)], ['ry', w(0, sh.ry)], ['rot', w(0, -(sh.ry + 14))]];
  }

  // Putting rings drawn on the green, clipped to its shape.
  function ringsSvg(H, highlight) {
    if (!H.kinds.green.length) return '';
    let s = `<defs><clipPath id="greenclip">${H.kinds.green.map((g) => ell(g, '#000')).join('')}</clipPath></defs><g clip-path="url(#greenclip)">`;
    const R = H.rings, p = H.pin;
    if (highlight) {
      const inner = highlight === 1 ? 0 : R[highlight - 2], outer = highlight === 4 ? 999 : R[highlight - 1];
      s += `<path d="M ${p.x - outer} ${p.y} a ${outer} ${outer} 0 1 0 ${2 * outer} 0 a ${outer} ${outer} 0 1 0 ${-2 * outer} 0 ${inner ? `M ${p.x - inner} ${p.y} a ${inner} ${inner} 0 1 1 ${2 * inner} 0 a ${inner} ${inner} 0 1 1 ${-2 * inner} 0` : ''}" fill="#ffd84a" fill-opacity=".35" fill-rule="evenodd"/>`;
    }
    R.forEach((r, i) => { s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${i === 0 ? '#3a9c58' : 'none'}" stroke="#fff" stroke-opacity=".8" stroke-width=".6"/>`; });
    const lbl = [R[0] * 0.55, (R[0] + R[1]) / 2, (R[1] + R[2]) / 2, R[2] + 2.5];
    lbl.forEach((r, i) => {
      for (const deg of [-45, -20, -70, 0, -110, 20, -135, 45, 180, 90, 135, -160]) {
        const a = (deg * Math.PI) / 180, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (H.kinds.green.some((g) => E.inShape(g, x, y)) && y > p.y - 9 + 0 || (H.kinds.green.some((g) => E.inShape(g, x, y)) && Math.abs(x - p.x) > 3)) {
          s += `<text x="${f1(x)}" y="${f1(y + 1.4)}" font-size="4" font-weight="700" fill="#fff" fill-opacity=".85" text-anchor="middle">${i + 1}</text>`; break;
        }
      }
    });
    return s + '</g>';
  }

  function renderBoard() {
    const H = getH(), hole = S.hole, W = hole.board.w, Hh = hole.board.h, cfg = S.cfg;
    svg.setAttribute('viewBox', `-12 -12 ${W + 24} ${Hh + 24}`);
    let s = `<rect x="0" y="0" width="${W}" height="${Hh}" fill="${COLORS.rough}" stroke="#20160e" stroke-width="2"/>`;
    for (let x = 50; x < W; x += 50) s += `<line x1="${x}" y1="0" x2="${x}" y2="${Hh}" class="grid"/>`;
    for (let y = 50; y < Hh; y += 50) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="grid"/>`;
    for (const sh of lieShapesInOrder(hole)) {
      if (sh.tile) for (const part of E.tileParts(sh)) s += ell(part, COLORS.green, 'k-green');
      else s += ell(sh, COLORS[sh.kind], 'k-' + sh.kind);
    }
    s += ringsSvg(H);
    const pin = H.pin, tee = H.tee;
    s += `<rect x="${tee.x - 4}" y="${tee.y - 3}" width="8" height="6" fill="#f3efe2" stroke="#333" stroke-width=".6"/>`;
    s += `<circle cx="${pin.x}" cy="${pin.y}" r="${Math.max(0.8, cfg.putting.cupRadius)}" fill="#111"/>`;
    s += `<line x1="${pin.x}" y1="${pin.y}" x2="${pin.x}" y2="${pin.y - 16}" stroke="#eee" stroke-width="1"/><polygon points="${pin.x},${pin.y - 16} ${pin.x + 9},${pin.y - 13} ${pin.x},${pin.y - 10}" fill="#e33"/>`;

    if (S.tab === 'play' && S.game) s += playOverlay(H);
    if (S.tab === 'edit') {
      const sh = S.hole.shapes.find((x) => x.id === S.sel);
      if (sh) {
        if (KIND_ORDER.includes(sh.kind)) {
          if (sh.tile) for (const q of E.tileParts(sh)) s += ell(q, 'none', 'sel'); else s += ell(sh, 'none', 'sel');
          const hp = handlePts(sh);
          s += line({ x: sh.cx, y: sh.cy }, hp[hp.length - 1][1], 'sel');
          for (const [, p] of hp) s += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="4" class="handle"/>`;
        } else s += `<circle cx="${sh.cx}" cy="${sh.cy}" r="9" class="sel"/>`;
      }
    }
    // scale bar
    s += `<line x1="4" y1="${Hh + 7}" x2="54" y2="${Hh + 7}" stroke="#cfc8bb" stroke-width="1.2"/><text x="58" y="${Hh + 9.5}" class="lbl">50 yd = 5 cm</text>`;
    layer.innerHTML = s;
  }

  function playOverlay(H) {
    const g = S.game, st = g.state, cfg = S.cfg;
    let s = '';
    g.shots.forEach((r, i) => {
      s += line(r.from, r.landing, 'shot');
      if (r.blocked) s += line(r.landing, r.intended, 'blocked') + `<circle cx="${f1(r.intended.x)}" cy="${f1(r.intended.y)}" r="2" fill="none" stroke="#ff5050"/>`;
      if (r.landLie === 'ob') s += `<text x="${f1(r.landing.x)}" y="${f1(r.landing.y)}" class="lbl" fill="#f44">OB</text>`;
      if (r.drop) s += line(r.landing, r.drop, 'dropline');
      s += `<circle cx="${f1(r.landing.x)}" cy="${f1(r.landing.y)}" r="1.6" fill="${DOT[r.landLie] || '#fff'}" stroke="#000" stroke-width=".4"/>`;
      s += `<text x="${f1(r.landing.x + 3)}" y="${f1(r.landing.y - 3)}" class="lbl">${i + 1}</text>`;
    });
    if (!st.holed) {
      if (st.onGreen) {
        const tier = g.tiers.putter || 1, ring = E.ringOf(H, st);
        s += ringsSvg(H, ring);
        const safe = E.resolvePutt(H, cfg, st, 'safe', tier, 1), risky = ring > 1 ? E.resolvePutt(H, cfg, st, 'risky', tier, 1) : null;
        if (safe.destRing !== ring || ring > 1) s += `<circle cx="${f1(safe.x)}" cy="${f1(safe.y)}" r="2" fill="none" stroke="#9fd0ff" stroke-width=".9"/><text x="${f1(safe.x + 3)}" y="${f1(safe.y + 1.5)}" class="lbl">safe miss</text>`;
        if (risky) s += `<circle cx="${f1(risky.x)}" cy="${f1(risky.y)}" r="2" fill="none" stroke="#ff5050" stroke-width=".9"/><text x="${f1(risky.x + 3)}" y="${f1(risky.y + 1.5)}" class="lbl">risky miss</text>`;
      } else {
        const club = E.getClub(cfg, S.ui.club);
        if (club && E.clubAllowed(club, st.lie)) {
          const tier = E.isTierable(club) ? g.tiers[club.id] || 1 : 1;
          const aim = S.aim || H.pin, base = Math.atan2(aim.y - st.y, aim.x - st.x);
          const groups = E.faceGroups(E.fanFor(cfg, club, tier));
          const dmin = E.clubDistance(cfg, club, 2, S.ui.power, st.lie, tier);
          const davg = E.clubDistance(cfg, club, 7, S.ui.power, st.lie, tier);
          const dmax = E.clubDistance(cfg, club, 12, S.ui.power, st.lie, tier);
          const a0 = base + (groups[0].angle * Math.PI) / 180, a1 = base + (groups[groups.length - 1].angle * Math.PI) / 180;
          s += line(st, aim, 'aimline');
          for (const gr of groups) {
            const a = base + (gr.angle * Math.PI) / 180;
            const end = { x: st.x + Math.cos(a) * dmax, y: st.y + Math.sin(a) * dmax };
            s += line(st, end, 'fan') + `<text x="${f1(end.x + Math.cos(a) * 5)}" y="${f1(end.y + Math.sin(a) * 5)}" class="lbl" text-anchor="middle">${gr.faces.join('')}</text>`;
          }
          zoneRows(cfg).forEach((z) => {
            const d = E.clubDistance(cfg, club, z.sum, S.ui.power, st.lie, tier);
            s += arcPath(st, d, a0 - 0.02, a1 + 0.02);
            s += `<text x="${f1(st.x + Math.cos(a1 + 0.04) * d + 2)}" y="${f1(st.y + Math.sin(a1 + 0.04) * d)}" class="lbl">${z.label} ${d} yd</text>`;
          });
          if (S.ui.showCloud) for (const sp of zoneRows(cfg)) for (const gr of groups) {
            const r = E.flyShot(H, cfg, st, club.id, S.ui.power, aim, tier, sp.sum, gr.angle);
            s += `<circle cx="${f1(r.landing.x)}" cy="${f1(r.landing.y)}" r="${f1(0.8 + sp.p * gr.p * 14)}" fill="${DOT[r.landLie]}" stroke="#000" stroke-width=".3" opacity=".9"><title>${outcomeTitle(sp, gr, r)}</title></circle>`;
          }
          if (S.aim) s += `<circle cx="${f1(aim.x)}" cy="${f1(aim.y)}" r="3" fill="none" stroke="#ffd84a" stroke-width="1"/>`;
        }
      }
    }
    if (S.ui.explainBoard && g.shots.length) s += explainOverlay(H, g.shots[explainIndex()]);
    if (S.hover && !st.holed) s += hoverOverlay(H, st);
    s += `<circle cx="${f1(st.x)}" cy="${f1(st.y)}" r="2.6" fill="#fff" stroke="#000" stroke-width=".7"/>`;
    return s;
  }
  const die = (n) => String.fromCodePoint(0x2680 + n - 1);
  const dice = (faces) => faces.map(die).join('');
  const degTxt = (a) => (a === 0 ? '0° (straight)' : `${a > 0 ? '+' : '−'}${Math.abs(a)}° ${a > 0 ? 'right' : 'left'}`);
  function outcomeTitle(sp, gr, r) {
    const p = sp.p * gr.p * 100;
    const where = `${r.landLie}${r.blocked ? ' (stopped by trees)' : ''}`;
    return `2d6 ${sp.range || sp.sum}${sp.label ? ' ' + sp.label.toLowerCase() : ''} (${(sp.p * 100).toFixed(1)}%) and direction die ${gr.faces.join(' or ')} (${(gr.p * 100).toFixed(0)}%) → ${r.distance} yd at ${degTxt(gr.angle)} → ${where} · chance ${p.toFixed(1)}%`;
  }
  function explainIndex() {
    const n = S.game.shots.length;
    return S.ui.explain == null || S.ui.explain >= n ? n - 1 : S.ui.explain;
  }
  // Draw the geometry of one played shot: aim line, angle wedge, measured distance.
  function explainOverlay(H, r) {
    if (r.putt) {
      const t = `${dice([r.dice.d1, r.dice.d2])} ${r.holed ? 'in!' : 'ring ' + r.destRing}`;
      return `<line x1="${f1(r.from.x)}" y1="${f1(r.from.y)}" x2="${f1(r.landing.x)}" y2="${f1(r.landing.y)}" stroke="#ffd84a" stroke-width=".9" stroke-dasharray="2 1.5"/><text x="${f1(r.from.x + 3)}" y="${f1(r.from.y - 3)}" class="lbl big">${t}</text>`;
    }
    const from = r.from, aim = r.aim || H.pin;
    const base = Math.atan2(aim.y - from.y, aim.x - from.x), a = base + (r.angle * Math.PI) / 180;
    const d = Math.max(r.distance, 1), rr = Math.min(28, d * 0.45);
    let s = line(from, { x: from.x + Math.cos(base) * d, y: from.y + Math.sin(base) * d }, 'aimline');
    if (r.angle !== 0) s += `<path d="M ${f1(from.x + Math.cos(base) * rr)} ${f1(from.y + Math.sin(base) * rr)} A ${f1(rr)} ${f1(rr)} 0 0 ${r.angle > 0 ? 1 : 0} ${f1(from.x + Math.cos(a) * rr)} ${f1(from.y + Math.sin(a) * rr)}" stroke="#ffd84a" stroke-width="1.2" fill="none"/>`;
    const mid = base + (r.angle * Math.PI) / 360;
    s += `<text x="${f1(from.x + Math.cos(mid) * (rr + 9))}" y="${f1(from.y + Math.sin(mid) * (rr + 9))}" class="lbl big" text-anchor="middle">${dice([r.dice.dir])} ${r.angle > 0 ? '+' : ''}${r.angle}°</text>`;
    const m = { x: from.x + Math.cos(a) * d * 0.6, y: from.y + Math.sin(a) * d * 0.6 };
    const perp = a + Math.PI / 2;
    s += `<text x="${f1(m.x + Math.cos(perp) * 9)}" y="${f1(m.y + Math.sin(perp) * 9)}" class="lbl big" text-anchor="middle">${dice([r.dice.d1, r.dice.d2])} ${r.distance} yd</text>`;
    s += `<circle cx="${f1(r.landing.x)}" cy="${f1(r.landing.y)}" r="4" fill="none" stroke="#ffd84a" stroke-width="1.2"/>`;
    return s;
  }
  function hoverOverlay(H, st) {
    const cfg = S.cfg, g = S.game;
    let r;
    if (st.onGreen) return '';
    {
      const club = E.getClub(cfg, S.ui.club);
      if (!club || !E.clubAllowed(club, st.lie)) return '';
      r = E.flyShot(H, cfg, st, club.id, S.ui.power, S.aim || H.pin, E.isTierable(club) ? g.tiers[club.id] || 1 : 1, S.hover.sum, S.hover.angle);
    }
    return `<line x1="${f1(st.x)}" y1="${f1(st.y)}" x2="${f1(r.landing.x)}" y2="${f1(r.landing.y)}" stroke="#ffd84a" stroke-width="1.6"/>` +
      `<circle cx="${f1(r.landing.x)}" cy="${f1(r.landing.y)}" r="5" fill="none" stroke="#ffd84a" stroke-width="1.6"/>`;
  }

  function renderLegend() {
    const L = document.getElementById('legend');
    const items = [['fairway', 'fairway'], ['rough', 'rough'], ['green', 'green'], ['bunker', 'bunker'], ['water', 'water'], ['trees', 'trees'], ['ob', 'OB']];
    L.innerHTML = S.tab === 'play'
      ? 'Landing dots (size = probability): ' + items.map(([k, n]) => `<span><i style="background:${DOT[k]};border:1px solid #000"></i>${n}</span>`).join('') + '<span>· labels at fan ends = die faces</span>'
      : S.tab === 'edit' ? '<span>Drag shapes to move · yellow handles: width, height, rotation · grid = 50 yd</span>' : '';
  }

  // ------------------------------------------------------- board pointer
  function toBoard(e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  }
  function hitTest(p) {
    for (const k of ['pin', 'tee']) {
      const sh = S.hole.shapes.find((s) => s.kind === k);
      if (sh && Math.hypot(p.x - sh.cx, p.y - sh.cy) < 9) return sh;
    }
    const shapes = lieShapesInOrder(S.hole).slice().reverse();
    for (const sh of shapes) {
      const parts = sh.tile ? E.tileParts(sh) : [sh];
      if (parts.some((q) => E.inShape(E.prepShape(q), p.x, p.y))) return sh;
    }
    return null;
  }
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const p = toBoard(e);
    if (S.tab === 'edit') {
      const cur = S.hole.shapes.find((s) => s.id === S.sel);
      if (cur && KIND_ORDER.includes(cur.kind)) {
        for (const [mode, hp] of handlePts(cur)) if (Math.hypot(p.x - hp.x, p.y - hp.y) < 7) {
          drag = { mode, id: cur.id }; svg.setPointerCapture(e.pointerId); return;
        }
      }
      const sh = hitTest(p);
      S.sel = sh ? sh.id : null;
      if (sh) { drag = { mode: 'move', id: sh.id, ox: p.x - sh.cx, oy: p.y - sh.cy }; svg.setPointerCapture(e.pointerId); }
      render();
    } else if (S.tab === 'play') {
      const st = S.game.state;
      if (!st.onGreen && !st.holed) { S.aim = { x: Math.round(p.x), y: Math.round(p.y) }; S.suggestion = null; render(); }
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toBoard(e), sh = S.hole.shapes.find((s) => s.id === drag.id);
    const sn = (v) => (S.snap ? Math.round(v / 5) * 5 : Math.round(v));
    if (drag.mode === 'move') { sh.cx = sn(p.x - drag.ox); sh.cy = sn(p.y - drag.oy); }
    else {
      const t = (-(sh.rotation || 0) * Math.PI) / 180, dx = p.x - sh.cx, dy = p.y - sh.cy;
      const lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t);
      if (drag.mode === 'rx') sh.rx = Math.max(3, sn(Math.abs(lx)));
      else if (drag.mode === 'ry') sh.ry = Math.max(3, sn(Math.abs(ly)));
      else { const st = S.snap ? 5 : 1; let a = (Math.atan2(dy, dx) * 180) / Math.PI + 90; a = Math.round(a / st) * st; sh.rotation = ((a % 360) + 360) % 360; }
    }
    S.holeVer++;
    renderBoard();
  });
  const endDrag = () => { if (drag) { drag = null; holeChanged(false); } };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // --------------------------------------------------------------- tabs
  const TABS = [['play', 'Play'], ['edit', 'Edit hole'], ['config', 'Rules config'], ['sim', 'Simulate'], ['print', 'Print kit'], ['about', 'Guide']];
  function renderTabs() {
    const nav = document.getElementById('tabs');
    nav.replaceChildren(...TABS.map(([id, name]) => h('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; LS.set('ttg.tab', id); render(); } }, name)));
  }

  // ---------------------------------------------------------------- play
  function renderPlay() {
    const g = S.game, H = getH(), cfg = S.cfg;
    if (g.holeVer !== S.holeVer) resetHole();
    const st = g.state, par = E.parOf(H, cfg), toPin = E.dist(st, H.pin);
    const out = [];
    out.push(sec(`${S.hole.name || 'Hole'}`,
      h('div', { class: 'stats' },
        stat('Par', par + (S.hole.parOverride ? ' (set)' : '')), stat('Length', Math.round(H.length) + ' yd'), stat('Strokes', st.strokes),
        stat('Lie', st.holed ? 'in the cup' : st.onGreen ? 'green' : st.lie), stat('To pin', toPin.toFixed(1) + ' yd'),
        stat('Coins · round', `${g.coins} · ${g.holesPlayed ? sgn(g.totalDiff, 0) : '–'}`)),
      g.msg ? h('div', { class: 'msg' }, g.msg) : null,
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { onclick: () => { resetHole(); render(); } }, 'Replay hole'),
        h('button', { onclick: () => { newRandomHole(); } }, 'New random hole'),
        h('button', { onclick: () => { if (confirm('Reset tiers, coins and round score?')) { newGame(); render(); } } }, 'New round'))));
    out.push(renderBreakdown());

    if (!st.holed) {
      const kids = [];
      if (!st.onGreen) {
        const allowed = E.allowedClubs(cfg, st.lie);
        if (!allowed.find((c) => c.id === S.ui.club)) S.ui.club = (allowed[0] || {}).id;
        const pw = E.powersFor(cfg, st.lie, E.getClub(cfg, S.ui.club));
        if (!pw.includes(S.ui.power)) S.ui.power = pw[0];
        kids.push(row('Club', ...cfg.clubs.filter((c) => c.enabled !== false).map((c) =>
          h('button', { class: S.ui.club === c.id ? 'on' : '', disabled: !E.clubAllowed(c, st.lie), onclick: () => { S.ui.club = c.id; S.suggestion = null; render(); } },
            `${c.name}${E.isTierable(c) ? ' T' + (g.tiers[c.id] || 1) : ''}`))));
        kids.push(row('Power', ...cfg.powerLevels.slice().sort((a, b) => a - b).map((p) => h('button', { class: S.ui.power === p ? 'on' : '', disabled: !pw.includes(p), onclick: () => { S.ui.power = p; S.suggestion = null; render(); } }, powLabel(p))),
          (cfg.lieDrop || {})[st.lie] ? h('span', { class: 'warn' }, `${st.lie}: result drops ${cfg.lieDrop[st.lie]} step(s)`) : null));
        kids.push(row('Aim', h('span', { class: 'muted' }, S.aim ? `(${S.aim.x}, ${S.aim.y}) · click the board to change` : 'pin · click the board to aim elsewhere'),
          S.aim ? h('button', { class: 'small', onclick: () => { S.aim = null; render(); } }, 'Aim at pin') : null));
      } else {
        const ring = E.ringOf(H, st), tier = g.tiers.putter || 1, P = cfg.putting;
        const ts = E.puttTarget(cfg, ring, 'safe', tier), tr = E.puttTarget(cfg, ring, 'risky', tier);
        kids.push(h('div', { class: 'msg' }, `Ball is in ring ${ring} · putter tier ${tier}`));
        kids.push(h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'primary', style: 'background:#2f6db5;border-color:#2f6db5', onclick: () => { hit(null, 'safe'); render(); } }, `SAFE: in on ${inOn(ts)} (${pct(E.pAtLeast(ts))}) · miss → ring ${P.safeMissTo[ring - 1]}`),
          ring > 1 ? h('button', { class: 'primary', style: 'background:#c62f24;border-color:#c62f24', onclick: () => { hit(null, 'risky'); render(); } }, `RISKY: in on ${inOn(tr)} (${pct(E.pAtLeast(tr))}) · miss → ring ${P.riskyMissTo}`) : null));
        kids.push(h('div', { class: 'hint' }, ring === 1 ? 'Ring 1 is a tap-in: only SAFE.' : 'The circles on the board show where each miss would leave the ball.'));
      }
      kids.push(row('Dice',
        h('button', { class: S.ui.diceMode === 'random' ? 'on' : '', onclick: () => { S.ui.diceMode = 'random'; render(); } }, 'Random'),
        h('button', { class: S.ui.diceMode === 'manual' ? 'on' : '', onclick: () => { S.ui.diceMode = 'manual'; render(); } }, 'Set manually'),
        S.ui.diceMode === 'manual' ? ['d1', 'd2', 'dir'].map((k) => h('span', null, k + ' ',
          h('select', { onchange: (e) => { S.ui.manual[k] = +e.target.value; }, value: String(S.ui.manual[k]) }, [1, 2, 3, 4, 5, 6].map((v) => h('option', { value: String(v) }, v))))) : null));
      kids.push(h('div', { class: 'row', style: 'margin-top:8px' },
        !st.onGreen ? h('button', { class: 'primary', onclick: () => { hit(); render(); } }, 'Hit') : null,
        h('span', { class: 'muted', style: 'margin-left:6px' }, 'Bot'),
        h('select', { onchange: (e) => { S.ui.botProfile = e.target.value; S.suggestion = null; render(); }, value: S.ui.botProfile },
          E.PROFILES.map((p) => h('option', { value: p.id }, p.name))),
        !st.onGreen ? h('button', { onclick: () => { botSuggest(); render(); } }, 'Suggest') : null,
        h('button', { onclick: () => { botShot(); render(); } }, 'Play shot'),
        h('button', { onclick: () => { botFinish(); render(); } }, 'Finish hole')));
      if (!st.onGreen) kids.push(row(null, h('label', { style: 'min-width:0' }, h('input', { type: 'checkbox', checked: S.ui.showCloud, onchange: (e) => { S.ui.showCloud = e.target.checked; render(); } }), ' show all 2d6×d6 landing spots')));
      out.push(sec(st.onGreen ? 'Putt' : 'Shot', ...kids));
      if (!st.onGreen) out.push(renderOutcomeMatrix());
      if (S.suggestion) out.push(renderSuggestion());
      out.push(st.onGreen ? renderPuttCard() : renderClubCard());
    }
    out.push(renderTiers());
    out.push(sec('Shot log', h('div', { class: 'log' }, g.log.length ? g.log.map((l, i) => h('div', {
      class: 'logline' + (i === explainIndex() ? ' on' : ''), title: 'Click to explain this shot',
      onclick: () => { S.ui.explain = i; render(); },
    }, l)) : h('div', { class: 'muted' }, 'No shots yet.'))));
    return out;
  }
  function renderSuggestion() {
    const d = S.suggestion;
    const head = `${clubName(d.club)} ${powLabel(d.power)}${d.aim.off != null ? `, aim ${d.aim.off === 0 ? 'at pin' : (d.aim.off > 0 ? d.aim.off + '° right' : -d.aim.off + '° left') + ' of pin'}` : ', aim at pin'}`;
    return sec('Bot suggestion',
      h('div', null, h('b', null, head), h('span', { class: 'muted' }, ` · expected ${fmt(d.mean)} strokes to hole out (±${fmt(d.sd)})`)),
      d.top && d.top.length ? h('table', { style: 'margin-top:6px' },
        h('tr', null, h('th', null, 'Option'), h('th', null, 'Aim'), h('th', null, 'E[strokes]'), h('th', null, 'SD'), h('th', null, 'Score')),
        d.top.map((c) => h('tr', null, h('td', null, `${clubName(c.club)} ${powLabel(c.power)}`), h('td', null, c.aim.off === 0 ? 'pin' : (c.aim.off > 0 ? '+' : '') + c.aim.off + '°'), h('td', null, fmt(c.mean)), h('td', null, fmt(c.sd)), h('td', null, fmt(c.score))))) : null,
      h('div', { class: 'hint' }, 'Score = E[strokes] + λ·SD. The value function is a heuristic, so bots can be short-sighted around hazards.'));
  }
  function renderClubCard() {
    const g = S.game, st = g.state, cfg = S.cfg, club = E.getClub(cfg, S.ui.club);
    if (!club) return null;
    const tier = E.isTierable(club) ? g.tiers[club.id] || 1 : 1;
    const groups = E.faceGroups(E.fanFor(cfg, club, tier));
    const zr = zoneRows(cfg, tier), drop = (cfg.lieDrop || {})[st.lie] || 0;
    return sec(`Club card · ${club.name} T${tier}${drop ? ` · ${st.lie}: −${drop} step` : ''}`,
      h('div', { class: 'scroll-x' }, h('table', null,
        h('tr', null, h('th', null, 'Power'), zr.map((z) => h('th', null, `${z.label} (2d6 ${z.range}, ${pct(z.p)})`))),
        E.powersFor(cfg, st.lie, club).sort((a, b) => b - a).map((p) => h('tr', null, h('td', null, powLabel(p)),
          zr.map((z) => h('td', { style: p === S.ui.power ? 'font-weight:700' : '' }, E.clubDistance(cfg, club, z.sum, p, st.lie, tier) + ' yd')))))),
      h('div', { class: 'hint' }, 'Fan T' + tier + ': ' + groups.map((gr) => `${gr.angle > 0 ? '+' : ''}${gr.angle}° (faces ${gr.faces.join(',')})`).join(' · ')));
  }
  function renderPuttCard() {
    const g = S.game, cfg = S.cfg, H = getH(), tier = g.tiers.putter || 1, P = cfg.putting;
    const RV = E.ringValues(cfg, tier), cur = E.ringOf(H, g.state);
    const prof = E.PROFILES.find((p) => p.id === S.ui.botProfile);
    const botChoice = E.decidePutt(H, cfg, g.state, g.tiers, prof, getCtx(g.tiers));
    return sec(`Putter strip · tier ${tier}`,
      h('table', null, h('tr', null, ['Ring', 'SAFE in on', 'RISKY in on', 'Best choice', 'Expected putts'].map((x) => h('th', null, x))),
        [1, 2, 3, 4].map((r) => {
          const ts = E.puttTarget(cfg, r, 'safe', tier), tr = E.puttTarget(cfg, r, 'risky', tier);
          return h('tr', { style: r === cur ? 'font-weight:700;background:var(--chip)' : '' }, h('td', null, r === cur ? `▶ ${r}` : r),
            h('td', null, `${inOn(ts)} (${pct(E.pAtLeast(ts))})`), h('td', null, r === 1 ? '—' : `${inOn(tr)} (${pct(E.pAtLeast(tr))})`),
            h('td', null, RV.best[r]), h('td', null, fmt(RV.E[r])));
        })),
      h('div', { class: 'hint' }, `SAFE miss → ring ${P.safeMissTo[1]} (from ring 4: ring ${P.safeMissTo[3]}) · RISKY miss → ring ${P.riskyMissTo}. ${prof.name} bot would play ${botChoice.toUpperCase()} here. Putter upgrades lower RISKY numbers at tiers 2 and 4, SAFE numbers at tiers 3 and 5.`));
  }
  // ---- "how the dice decided it"
  const step = (n, title, ...body) => h('div', { class: 'step' }, h('span', { class: 'stepn' }, n), h('div', null, h('b', null, title + ' '), ...body));
  const bigDice = (faces) => h('span', { class: 'die' }, dice(faces));
  function fanList(fan, chosenAngle) {
    return E.faceGroups(fan).map((gr, i) => [i ? ' · ' : '', h('span', { class: gr.angle === chosenAngle ? 'chosen' : 'muted' }, `${dice(gr.faces)} ${gr.angle > 0 ? '+' : ''}${gr.angle}°`)]);
  }
  function renderBreakdown() {
    const g = S.game;
    if (!g.shots.length) return null;
    const i = explainIndex(), r = g.shots[i], H = getH(), cfg = S.cfg;
    const { d1, d2, dir } = r.dice, sum = d1 + d2, steps = [];
    if (r.putt) {
      steps.push(step(1, 'Ring:', `the ball was in `, h('b', null, `ring ${r.ring}`), '.'));
      steps.push(step(2, 'Choice:', h('b', null, r.choice.toUpperCase()), ` — with putter T${r.tier} it goes in on ${inOn(r.target)}.`));
      steps.push(step(3, 'Roll 2d6:', bigDice([d1, d2]), ` ${d1} + ${d2} = ${sum} → `, r.holed ? h('b', null, 'in the cup!') : ['missed: the ball goes to ', h('b', null, `ring ${r.destRing}`), r.choice === 'risky' ? ' (it rolled past the cup).' : '.']));
    } else {
      const c = r.calc;
      const z = c.zone;
      const parts = `${clubName(r.club)} full ${c.full} yd${c.bonus ? ` (incl. +${c.bonus} tier bonus)` : ''} × ${powLabel(c.power)} power × ${Math.round(z.mult * 100)}% (${z.label.toLowerCase()})`;
      steps.push(step(1, 'Distance roll (2d6):', bigDice([d1, d2]), ` ${d1} + ${d2} = ${c.pips} → `, h('b', null, z.label), ` zone (${z.from}–${z.to}). ${parts} = `, h('b', null, c.rounded + ' yd'), '.'));
      const fan = E.fanFor(cfg, E.getClub(cfg, r.club), r.tier);
      steps.push(step(2, 'Direction roll (d6):', bigDice([dir]), ` face ${dir} → `, h('b', null, degTxt(r.angle)), ` of your aim line. ${clubName(r.club)} T${r.tier} fan: `, fanList(fan, r.angle)));
      steps.push(step(3, 'Measure:', `lay the fan at the ball with its centre line on your aim${r.aim && E.dist(r.aim, H.pin) > 1 ? '' : ' (the pin)'}, then measure ${r.distance} yd along the ${r.angle === 0 ? 'centre' : degTxt(r.angle)} line.`));
      let res;
      const pen = r.penalty;
      if (r.blocked) res = [`The line runs into trees after ${E.dist(r.from, r.landing).toFixed(0)} yd, so the ball stops there. Lie: `, h('b', null, r.lie), '.'];
      else if (r.landLie === 'ob') res = [h('b', { class: 'bad' }, 'Off the board: out of bounds.'), ` +${pen} penalty stroke, and you play again from the same spot.`];
      else if (r.landLie === 'water') res = [h('b', { class: 'bad' }, 'In the water.'), ` +${pen} penalty stroke. Walk back along the shot line ${E.dist(r.landing, r.drop).toFixed(0)} yd to the first dry spot and drop. Lie: `, h('b', null, r.lie), '.'];
      else if (r.holed) res = [h('b', null, 'In the cup!')];
      else res = ['Lands on ', h('b', null, r.landLie), r.lie === 'green' ? '. Next shot is a putt.' : '.'];
      steps.push(step(4, 'Result:', ...res, h('span', { class: 'muted' }, ` This shot cost ${1 + pen} stroke${pen ? 's' : ''}.`)));
    }
    return sec(`How the dice decided shot #${i + 1}${i !== g.shots.length - 1 ? ' (picked from the log)' : ''}`, ...steps,
      row(null, h('label', { style: 'min-width:0' }, h('input', { type: 'checkbox', checked: S.ui.explainBoard, onchange: (e) => { S.ui.explainBoard = e.target.checked; renderBoard(); } }), ' draw it on the board (aim line, angle, distance)')),
      h('div', { class: 'hint' }, 'Click any line in the shot log to explain that shot instead.'));
  }

  // ---- every possible outcome of the shot being set up
  const CELL = {
    fairway: ['#79b85a', '#10240a', 'fairway'], rough: ['#a8bb82', '#1d2a10', 'rough'], green: ['#2e8a48', '#fff', 'green'], bunker: ['#e8d6a4', '#4a3810', 'bunker'],
    water: ['#4b8fd6', '#fff', 'water'], trees: ['#2c5532', '#fff', 'trees'], ob: ['#c0262d', '#fff', 'OB'],
  };
  function renderOutcomeMatrix() {
    const g = S.game, st = g.state, H = getH(), cfg = S.cfg;
    let groups, rowsDef, compute, title;
    if (st.onGreen) return null;
    {
      const club = E.getClub(cfg, S.ui.club);
      if (!club || !E.clubAllowed(club, st.lie)) return null;
      const tier = E.isTierable(club) ? g.tiers[club.id] || 1 : 1;
      groups = E.faceGroups(E.fanFor(cfg, club, tier));
      rowsDef = zoneRows(cfg).map((z) => Object.assign(z, { head: `${z.label} ${z.range}`, sub: E.clubDistance(cfg, club, z.sum, S.ui.power, st.lie, tier) + ' yd' }));
      compute = (sum, angle) => E.flyShot(H, cfg, st, club.id, S.ui.power, S.aim || H.pin, tier, sum, angle);
      title = `Every possible outcome · ${club.name} T${tier} ${powLabel(S.ui.power)} from ${st.lie}`;
    }
    const totals = {}; let holedP = 0, blockedP = 0, penaltyP = 0;
    const setHover = (v) => { S.hover = v; renderBoard(); };
    const table = h('table', { class: 'mx', onmouseleave: () => setHover(null) },
      h('tr', null, h('th', null, '2d6 ↓  ·  d6 →'), groups.map((gr) => h('th', null, h('span', { class: 'die' }, dice(gr.faces)), h('br'), `${gr.angle > 0 ? '+' : ''}${gr.angle}°`, h('br'), h('span', { class: 'muted' }, pct(gr.p))))),
      rowsDef.map((rd) => h('tr', null,
        h('th', { class: 'rh' }, h('b', null, rd.head), ` ${rd.sub} `, h('span', { class: 'muted' }, pct(rd.p))),
        groups.map((gr) => {
          const r = compute(rd.sum, gr.angle), p = rd.p * gr.p;
          let txt, col;
          if (r.putt) {
            const left = E.dist(r, H.pin);
            col = r.holed ? ['#ffd84a', '#3a2e00'] : CELL.green;
            txt = r.holed ? '✓ in' : left.toFixed(1);
            if (r.holed) holedP += p;
          } else {
            col = CELL[r.landLie]; txt = CELL[r.landLie][2] + (r.blocked ? '†' : '') + (r.penalty ? ' +' + r.penalty : '');
            totals[r.landLie] = (totals[r.landLie] || 0) + p;
            if (r.blocked) blockedP += p;
            if (r.penalty) penaltyP += p;
            if (r.holed) holedP += p;
          }
          return h('td', {
            class: 'cell', style: `background:${col[0]};color:${col[1]}`, title: outcomeTitle(rd, gr, r),
            onmouseenter: () => setHover({ sum: rd.sum, angle: gr.angle }),
          }, txt);
        }))));
    let summary;
    if (st.onGreen) summary = h('div', { class: 'hint' }, `Chance to hole this putt: `, h('b', null, pct(holedP, 1)), `. Numbers = yards left from the cup.`);
    else {
      const club = E.getClub(cfg, S.ui.club);
      const ev = E.evalDecision(H, cfg, st, club, S.ui.power, S.aim || H.pin, g.tiers, getCtx(g.tiers));
      summary = h('div', null,
        h('div', { class: 'hint' }, 'Chance of landing on: ', Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v], i) => [i ? ' · ' : '', h('b', null, `${CELL[k][2]} ${pct(v)}`)])),
        h('div', { class: 'hint' }, `Penalty risk ${pct(penaltyP)}${blockedP ? ` · stopped by trees (†) ${pct(blockedP)}` : ''}${holedP ? ` · hole-out ${pct(holedP, 1)}` : ''} · bot estimate: ${fmt(ev.mean)} strokes to finish the hole with this shot`));
    }
    return sec(title,
      h('div', { class: 'hint' }, 'Each row is a 2d6 distance roll, each column a direction-die line. Cell = where the ball ends up. Hover a cell to trace it on the board.'),
      h('div', { class: 'scroll-x' }, table), summary);
  }

  function renderTiers() {
    const g = S.game, cfg = S.cfg, max = E.MAX_TIER;
    const clubs = cfg.clubs.filter((c) => c.enabled !== false && E.isTierable(c));
    const outer = (fan) => '±' + Math.max(...fan.map(Math.abs)) + '°';
    const pips = (t) => h('span', { class: 'pips' }, TIERS.map((k) => (k <= t ? '●' : '○')).join(''));
    const clubInfo = (c, t) => `${E.clubDistance(cfg, c, 2, 1, 'fairway', t)}–${E.clubDistance(cfg, c, 12, 1, 'fairway', t)} yd, ${outer(cfg.fans[t])}`;
    const puttInfo = (t) => `risky ${[2, 3, 4].map((r) => inOn(E.puttTarget(cfg, r, 'risky', t))).join(' / ')}`;
    const rowFor = (id, name, info) => {
      const t = g.tiers[id] || 1, cost = t < max ? cfg.progression.tierCosts[t - 1] : null;
      return h('tr', null, h('td', null, name), h('td', null, pips(t)), h('td', null, info(t)), h('td', { class: 'muted' }, t < max ? info(t + 1) : '—'), h('td', null, cost == null ? 'max' : cost),
        h('td', null,
          h('button', { class: 'small', disabled: t <= 1 || !S.ui.freeUpgrades, onclick: () => { g.tiers[id] = t - 1; S.suggestion = null; render(); } }, '−'), ' ',
          h('button', { class: 'small', disabled: cost == null || (!S.ui.freeUpgrades && g.coins < cost), onclick: () => { if (!S.ui.freeUpgrades) g.coins -= cost; g.tiers[id] = t + 1; S.suggestion = null; render(); } }, '▲')));
    };
    return sec(`Upgrades · ${g.coins} coins`,
      h('div', { class: 'scroll-x' }, h('table', null, h('tr', null, ['Club', 'Tier', 'Now (full, fairway)', 'Next tier', 'Cost', ''].map((x) => h('th', null, x))),
        clubs.map((c) => rowFor(c.id, c.name, (t) => clubInfo(c, t))),
        rowFor('putter', 'Putter', puttInfo))),
      h('div', { class: 'hint' }, `Each tier adds the club's tier bonus in yards and narrows its angle fan. Putter tiers alternate: RISKY numbers 1 lower at tiers 2 and 4, SAFE numbers at tiers 3 and 5. Coins: birdie ${cfg.progression.coins.birdieOrBetter}, par ${cfg.progression.coins.par}, bogey ${cfg.progression.coins.bogey}.`),
      row(null, h('label', { style: 'min-width:0' }, h('input', { type: 'checkbox', checked: S.ui.freeUpgrades, onchange: (e) => { S.ui.freeUpgrades = e.target.checked; render(); } }), ' free tier changes (debug)')));
  }
  function newRandomHole() {
    S.ui.genSeed = (Math.random() * 1e9) | 0;
    S.hole = E.generateHole(E.mulberry32(S.ui.genSeed), S.cfg, { par: S.ui.genPar || undefined });
    S.sel = null;
    holeChanged(false);
  }

  // ---------------------------------------------------------------- edit
  function renderEdit() {
    const hole = S.hole, out = [];
    out.push(sec('Hole',
      row('Name', h('input', { value: hole.name || '', onchange: (e) => { hole.name = e.target.value; holeChanged(true); } })),
      row('Par', h('select', { value: String(hole.parOverride || 0), onchange: (e) => { hole.parOverride = +e.target.value || null; holeChanged(true); } },
        h('option', { value: '0' }, `auto (${E.parOf(E.prepHole(Object.assign({}, hole, { parOverride: null })), S.cfg)})`), [3, 4, 5].map((p) => h('option', { value: String(p) }, p))),
        h('span', { class: 'muted' }, `tee→pin ${Math.round(getH().length)} yd`)),
      row('Board (yd)', numIn(hole.board.w, 100, 1000, 10, (v) => { hole.board.w = v; holeChanged(false); }), '×', numIn(hole.board.h, 100, 1000, 10, (v) => { hole.board.h = v; holeChanged(false); }),
        h('span', { class: 'muted' }, `= ${hole.board.w / 10} × ${hole.board.h / 10} cm`)),
      row('Add', ...KIND_ORDER.filter((k) => k !== 'green').map((k) => h('button', { onclick: () => addShape(k) }, '+ ' + k))),
      row('Green tile', ...E.GREEN_TILES.map((t) => h('button', { title: ['', 'easy', 'medium', 'hard'][t.difficulty], onclick: () => addTile(t.id) }, `${t.name} ${'★'.repeat(t.difficulty) + '☆'.repeat(3 - t.difficulty)}`))),
      row(null, h('label', { style: 'min-width:0' }, h('input', { type: 'checkbox', checked: S.snap, onchange: (e) => { S.snap = e.target.checked; } }), ' snap to 5 yd / 5°'))));

    const sh = hole.shapes.find((s) => s.id === S.sel);
    if (sh) {
      const isE = KIND_ORDER.includes(sh.kind), isT = !!sh.tile;
      const f = (k, min, max, step) => numIn(sh[k], min, max, step, (v) => { sh[k] = v; holeChanged(false); });
      out.push(sec(`Selected · ${isT ? 'green tile' : sh.kind}`,
        isT ? row('Tile', h('select', { value: sh.tile, onchange: (e) => { sh.tile = e.target.value; holeChanged(false); } },
          E.GREEN_TILES.map((t) => h('option', { value: t.id }, `${t.name} ${'★'.repeat(t.difficulty) + '☆'.repeat(3 - t.difficulty)} · rings ${t.rings.join('/')}`)))) : null,
        isE && !isT ? row('Kind', h('select', { value: sh.kind, onchange: (e) => { sh.kind = e.target.value; holeChanged(false); } }, KIND_ORDER.map((k) => h('option', { value: k }, k)))) : null,
        row('Centre', f('cx', -50, 1000, 1), f('cy', -50, 1000, 1)),
        isE && !isT ? row('Radii', f('rx', 2, 400, 1), f('ry', 2, 400, 1)) : null,
        isE ? row('Rotation', f('rotation', 0, 359, 1), '°') : null,
        isE ? row('Stack', h('button', { onclick: () => restack(sh, 1) }, 'Bring forward'), h('button', { onclick: () => restack(sh, -1) }, 'Send back'),
          h('button', { onclick: () => restack(sh, 99) }, 'To top'), h('button', { onclick: () => restack(sh, -99) }, 'To bottom')) : null,
        isE ? row(null, h('button', { onclick: () => { const c = Object.assign({}, sh, { id: E.uid(), cx: sh.cx + 15, cy: sh.cy + 15 }); hole.shapes.splice(hole.shapes.indexOf(sh) + 1, 0, c); S.sel = c.id; holeChanged(false); } }, 'Duplicate'),
          h('button', { onclick: () => { hole.shapes.splice(hole.shapes.indexOf(sh), 1); S.sel = null; holeChanged(false); } }, 'Delete')) : null,
        S.cfg.rules.lieMode === 'stacking' ? h('div', { class: 'hint' }, 'Lie mode is "stacking": where pieces overlap, the one on top decides the lie (e.g. a green on top of water = island green).')
          : h('div', { class: 'hint' }, 'Lie mode is "priority": water > bunker > trees > green > fairway, regardless of stacking.')));
    }
    out.push(sec('Pieces (bottom → top)', h('div', null,
      hole.shapes.map((s) => h('div', { class: 'row', style: 'margin:2px 0' },
        h('button', { class: 'small' + (S.sel === s.id ? ' on' : ''), onclick: () => { S.sel = s.id; render(); } }, s.kind),
        h('span', { class: 'muted' }, s.tile ? `${E.getTile(s.tile).name} tile (${s.cx}, ${s.cy}) @${s.rotation}°` : KIND_ORDER.includes(s.kind) ? `(${s.cx}, ${s.cy}) ${s.rx}×${s.ry} @${s.rotation}°` : `(${s.cx}, ${s.cy})`))))));

    out.push(sec('Library',
      row('Presets', ...E.PRESETS.map((p) => h('button', { onclick: () => { S.hole = E.clone(p); S.sel = null; holeChanged(false); } }, p.name))),
      row('Random', h('select', { value: String(S.ui.genPar), onchange: (e) => { S.ui.genPar = +e.target.value; } }, h('option', { value: '0' }, 'any par'), [3, 4, 5].map((p) => h('option', { value: String(p) }, 'par ' + p))),
        'seed', numIn(S.ui.genSeed, 0, 1e9, 1, (v) => { S.ui.genSeed = v; }),
        h('button', { onclick: () => { S.hole = E.generateHole(E.mulberry32(S.ui.genSeed), S.cfg, { par: S.ui.genPar || undefined }); S.sel = null; holeChanged(false); } }, 'Generate'),
        h('button', { onclick: newRandomHole }, 'New seed')),
      row('Saved', h('button', { onclick: () => {
        const name = prompt('Save hole as', S.hole.name || 'My hole'); if (!name) return;
        const c = E.clone(S.hole); c.name = name; c.id = E.uid(); S.hole.name = name;
        S.lib = S.lib.filter((x) => x.name !== name).concat([c]); LS.set('ttg.lib', S.lib); holeChanged(true);
      } }, 'Save current…'),
      h('button', { onclick: () => download((S.hole.name || 'hole') + '.json', S.hole) }, 'Export'),
      h('button', { onclick: () => pickFile((j) => { if (!j.shapes || !j.board) return alert('Not a hole file'); S.hole = j; holeChanged(false); }) }, 'Import')),
      S.lib.length ? h('div', null, S.lib.map((x, i) => h('div', { class: 'row' },
        h('button', { class: 'small', onclick: () => { S.hole = E.clone(x); S.sel = null; holeChanged(false); } }, 'Load'),
        h('button', { class: 'small', onclick: () => { S.lib.splice(i, 1); LS.set('ttg.lib', S.lib); render(); } }, '✕'), x.name))) : h('div', { class: 'hint' }, 'No saved holes yet.')));
    return out;
  }
  function addShape(kind) {
    const H = getH();
    const size = { fairway: [25, 80], green: [20, 15], bunker: [10, 7], water: [25, 18], trees: [20, 25] }[kind];
    const sh = { id: E.uid(), kind, cx: Math.round((H.tee.x + H.pin.x) / 2), cy: Math.round((H.tee.y + H.pin.y) / 2), rx: size[0], ry: size[1], rotation: 0 };
    const firstPoint = S.hole.shapes.findIndex((s) => !KIND_ORDER.includes(s.kind));
    S.hole.shapes.splice(firstPoint < 0 ? S.hole.shapes.length : firstPoint, 0, sh);
    S.sel = sh.id; holeChanged(false);
  }
  // A green tile brings its own cup, so any old pin marker is removed.
  function addTile(id) {
    const H = getH();
    S.hole.shapes = S.hole.shapes.filter((x) => x.kind !== 'pin');
    const sh = { id: E.uid(), kind: 'green', tile: id, cx: Math.round(H.pin.x), cy: Math.round(H.pin.y), rx: 0, ry: 0, rotation: 0 };
    const firstPoint = S.hole.shapes.findIndex((x) => !KIND_ORDER.includes(x.kind));
    S.hole.shapes.splice(firstPoint < 0 ? S.hole.shapes.length : firstPoint, 0, sh);
    S.sel = sh.id; holeChanged(false);
  }
  function restack(sh, dir) {
    const arr = S.hole.shapes, lie = arr.filter((s) => KIND_ORDER.includes(s.kind)), pts = arr.filter((s) => !KIND_ORDER.includes(s.kind));
    const i = lie.indexOf(sh); lie.splice(i, 1);
    const j = Math.max(0, Math.min(lie.length, i + dir));
    lie.splice(j, 0, sh);
    S.hole.shapes = lie.concat(pts);
    holeChanged(false);
  }
  function numIn(val, min, max, step, cb, cls) {
    return h('input', { type: 'number', class: 'num' + (cls ? ' ' + cls : ''), value: val, min, max, step, onchange: (e) => cb(quant(parseFloat(e.target.value), step, min, max)) });
  }

  // -------------------------------------------------------------- config
  function cnum(path, step, min, max, cls) {
    return numIn(getPath(S.cfg, path), min, max, step, (v) => { setPath(S.cfg, path, v); cfgChanged(); }, cls);
  }
  function cbool(path, label) {
    return h('label', { style: 'min-width:0' }, h('input', { type: 'checkbox', checked: !!getPath(S.cfg, path), onchange: (e) => { setPath(S.cfg, path, e.target.checked); cfgChanged(); } }), ' ' + label);
  }
  function fanSvg(fan, maxA) {
    const groups = E.faceGroups(fan);
    let s = `<svg viewBox="-60 -62 120 66" width="120" height="66">`;
    for (const g of groups) {
      const a = ((g.angle - 90) * Math.PI) / 180;
      s += `<line x1="0" y1="0" x2="${f1(Math.cos(a) * 55)}" y2="${f1(Math.sin(a) * 55)}" stroke="currentColor" stroke-width="1"/>`;
      s += `<text x="${f1(Math.cos(a) * 60)}" y="${f1(Math.sin(a) * 60)}" font-size="7" text-anchor="middle" fill="currentColor">${g.faces.join('')}</text>`;
    }
    s += '</svg>';
    const d = h('div'); d.innerHTML = s; return d.firstChild;
  }
  function fanEditor(base, tier, label) {
    const fan = getPath(S.cfg, `${base}.${tier}`);
    const distinct = new Set(fan).size, outer = Math.max(...fan.map(Math.abs));
    const warn = [];
    if (distinct > 5) warn.push('more than 5 distinct lines');
    if (outer > 30) warn.push('outermost > 30°');
    return h('div', { class: 'row', style: 'align-items:flex-start' },
      h('label', null, label),
      h('div', null,
        h('div', { class: 'fanrow' }, fan.map((v, i) => numIn(v, -45, 45, 1, (nv) => {
          fan[i] = nv;
          if (S.ui.mirror) fan[5 - i] = -nv;
          cfgChanged();
        }, 's'))),
        h('div', { class: 'hint' }, `${distinct} lines · faces 1–6${warn.length ? ' · ' : ''}`, warn.length ? h('span', { class: 'warn' }, warn.join(', ')) : null)),
      fanSvg(fan));
  }
  function configWarnings() {
    const cfg = S.cfg, w = [];
    for (let r = 2; r <= 4; r++) if (cfg.putting.risky[r - 1] > cfg.putting.safe[r - 1]) w.push(`Putting: in ring ${r} RISKY is harder to hole than SAFE`);
    for (const c of cfg.clubs) if (c.enabled !== false && !c.allowedLies.length) w.push(`${c.name} has no allowed lies`);
    for (const lie of ['tee', 'fairway', 'rough', 'bunker', 'trees']) if (!E.allowedClubs(cfg, lie).length) w.push(`No club can be played from ${lie} — the ball would be stuck`);
    if (!cfg.powerLevels.length) w.push('No power levels');
    return w;
  }
  function renderConfig() {
    const cfg = S.cfg, out = [];
    const warns = configWarnings();
    out.push(sec('Config',
      h('div', { class: 'row' },
        h('button', { onclick: () => download('tabletop-golf-config.json', cfg) }, 'Export JSON'),
        h('button', { onclick: () => pickFile((j) => { S.cfg = migrateCfg(j); cfgChanged(); }) }, 'Import JSON'),
        h('button', { onclick: () => { if (confirm('Reset all rules to the README defaults?')) { S.cfg = E.clone(E.DEFAULT_CONFIG); cfgChanged(); } } }, 'Reset to defaults')),
      cfgWasReset ? h('div', { class: 'warn' }, 'Rules were reset to the new defaults (ring putting). Import an exported JSON to bring old values back.') : null,
      warns.length ? h('div', null, warns.map((x) => h('div', { class: 'warn' }, '⚠ ' + x))) : h('div', { class: 'hint' }, 'All values are on their discrete steps. Changes apply immediately to Play and Simulate.')));

    out.push(sec('Rule variants (open questions)',
      row('Lie mode', h('select', { value: cfg.rules.lieMode, onchange: (e) => { cfg.rules.lieMode = e.target.value; cfgChanged(); } },
        h('option', { value: 'stacking' }, 'stacking — piece on top wins (physical)'), h('option', { value: 'priority' }, 'priority — water > bunker > trees > green > fairway'))),
      row(null, cbool('rules.treesBlockLine', 'trees block the shot line (ball stops at the tree edge)')),
      row(null, cbool('clubs.' + cfg.clubs.findIndex((c) => c.id === 'punch') + '.enabled', 'Punch-out shot available (short, straight, from rough/trees)')),
      row('Pick up after', cnum('rules.maxStrokesPerHole', 1, 6, 20), 'strokes')));

    out.push(sec('Clubs',
      h('div', { class: 'scroll-x' }, h('table', null,
        h('tr', null, h('th', null, 'Club'), h('th', null, 'On'), h('th', null, 'Distance (yd)'), h('th', null, 'Power levels'), h('th', null, 'Lies: tee fw rgh bnk trs')),
        cfg.clubs.map((c, i) => h('tr', null,
          h('td', null, c.name),
          h('td', null, h('input', { type: 'checkbox', checked: c.enabled !== false, onchange: (e) => { c.enabled = e.target.checked; cfgChanged(); } })),
          h('td', null, cnum(`clubs.${i}.full`, 5, 10, 400, 's')),
          h('td', null, c.powers ? 'yes' : 'full swing'),
          h('td', null, ['tee', 'fairway', 'rough', 'bunker', 'trees'].map((lie) => h('input', { type: 'checkbox', title: lie, checked: c.allowedLies.includes(lie), onchange: (e) => {
            c.allowedLies = e.target.checked ? c.allowedLies.concat([lie]) : c.allowedLies.filter((x) => x !== lie); cfgChanged();
          } }))))))),
      row('Driver power', ...cfg.powerLevels.map((p, i) => numIn(p, 0.05, 1, 0.05, (v) => { cfg.powerLevels[i] = v; cfgChanged(); }, 's')),
        h('button', { class: 'small', onclick: () => { cfg.powerLevels.push(0.25); cfgChanged(); } }, '+'),
        cfg.powerLevels.length > 1 ? h('button', { class: 'small', onclick: () => { cfg.powerLevels.pop(); cfgChanged(); } }, '−') : null),
      h('div', { class: 'hint' }, 'Distance strip per tier: SHORT if 2d6 ≤ the first number, LONG if ≥ the second, ON TARGET in between. Short / long = one notch from the club\'s mark.'),
      TIERS.map((t) => row(`Tier ${t}`, 'short ≤', cnum(`tierStrips.${t - 1}.0`, 1, 1, 6, 's'), 'long ≥', cnum(`tierStrips.${t - 1}.1`, 1, 8, 13, 's'),
        h('span', { class: 'muted' }, `on target ${pct(zoneRows(cfg, t)[1].p)}`))),
      row('Notch', cnum('notchYd', 5, 5, 30), 'yd')));

    out.push(sec('Angle fans (degrees per direction-die face)',
      row(null, h('label', { style: 'min-width:0' }, h('input', { type: 'checkbox', checked: S.ui.mirror, onchange: (e) => { S.ui.mirror = e.target.checked; } }), ' keep symmetric (face 1 = −face 6, 2 = −5, 3 = −4)')),
      TIERS.map((t) => fanEditor('fans', t, `Tier ${t}`))));

    out.push(sec('Lies',
      h('div', { class: 'hint' }, 'Lie penalty: the result drops this many steps (long → on target → short).'),
      ['tee', 'fairway', 'rough', 'bunker', 'trees'].map((lie) => row(lie, 'drop', cnum(`lieDrop.${lie}`, 1, 0, 2, 's'), 'steps'))));

    out.push(sec('Putting (rings on the green)',
      h('div', { class: 'hint' }, 'Roll 2d6: the number or more = in. SAFE misses go to ring 1, RISKY misses go to ring 2 (past the cup). 13 = can\'t go in.'),
      h('table', null, h('tr', null, ['Ring', 'SAFE in on (T1)', 'RISKY in on (T1)'].map((x) => h('th', null, x))),
        [1, 2, 3, 4].map((r) => h('tr', null, h('td', null, r), h('td', null, cnum(`putting.safe.${r - 1}`, 1, 2, 13, 's'), '+'),
          h('td', null, r === 1 ? '— (safe only)' : [cnum(`putting.risky.${r - 1}`, 1, 2, 13, 's'), '+'])))),
      row('SAFE miss from', ...[2, 3, 4].map((r) => [`ring ${r} →`, cnum(`putting.safeMissTo.${r - 1}`, 1, 1, 4, 's')])),
      row('RISKY miss', '→ ring', cnum('putting.riskyMissTo', 1, 1, 4, 's')),
      row('RISKY lower by', ...TIERS.map((t) => [`T${t}`, cnum(`putting.riskyBonus.${t - 1}`, 1, 0, 6, 's')])),
      row('SAFE lower by', ...TIERS.map((t) => [`T${t}`, cnum(`putting.safeBonus.${t - 1}`, 1, 0, 6, 's')])),
      row('Cup radius', cnum('putting.cupRadius', 0.25, 0.25, 5), 'yd (long shots finishing this close are holed)'),
      h('table', { style: 'margin-top:6px' }, h('tr', null, h('th', null, 'Expected putts'), [1, 2, 3, 4].map((r) => h('th', null, 'ring ' + r))),
        TIERS.map((t) => { const RV = E.ringValues(cfg, t); return h('tr', null, h('td', null, 'Putter T' + t), [1, 2, 3, 4].map((r) => h('td', null, `${RV.E[r].toFixed(2)} ${RV.best[r]}`))); })),
      h('div', { class: 'hint' }, 'With the best choice in each ring. If one choice never appears, it is never worth taking.')));

    out.push(sec('Penalties, par, progression, playtime',
      row('Penalty OB', cnum('penalties.ob', 1, 0, 3, 's'), 'water', cnum('penalties.water', 1, 0, 3, 's')),
      row('Par 3 below', cnum('par.par3Below', 10, 100, 400), 'par 4 below', cnum('par.par4Below', 10, 200, 700)),
      row('Coins', 'birdie+', cnum('progression.coins.birdieOrBetter', 1, 0, 9, 's'), 'par', cnum('progression.coins.par', 1, 0, 9, 's'),
        'bogey', cnum('progression.coins.bogey', 1, 0, 9, 's'), 'worse', cnum('progression.coins.worse', 1, 0, 9, 's')),
      row('Tier cost', ...TIERS.slice(0, -1).map((t) => [`${t}→${t + 1}`, cnum(`progression.tierCosts.${t - 1}`, 1, 0, 30, 's')]),
        h('span', { class: 'muted' }, `total to max one club: ${cfg.progression.tierCosts.reduce((a, b) => a + b, 0)}`)),
      row('Seconds', 'long shot', cnum('playtime.secPerLongShot', 5, 5, 180, 's'), 'putt', cnum('playtime.secPerPutt', 5, 5, 120, 's'))));
    return out;
  }

  // ------------------------------------------------------------ simulate
  let _simHolesKey = '', _simHoles = null;
  function simHoles(cfg) {
    const sm = S.sim;
    const key = [sm.source, sm.randomCount, sm.seed, S.holeVer, S.cfgVer].join('|');
    if (key === _simHolesKey && _simHoles && cfg === S.cfg) return _simHoles;
    let holes = [];
    if (sm.source === 'current') holes = [S.hole];
    if (sm.source === 'presets' || sm.source === 'presets+random') holes = holes.concat(E.PRESETS);
    if (sm.source === 'random' || sm.source === 'presets+random') {
      const rng = E.mulberry32(sm.seed * 9973 + 17);
      for (let i = 0; i < sm.randomCount; i++) holes.push(E.generateHole(rng, cfg));
    }
    E.setLieMode(cfg);
    const prepped = holes.map(E.prepHole);
    if (cfg === S.cfg) { _simHolesKey = key; _simHoles = prepped; }
    return prepped;
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function setProgress(frac, text) {
    const bar = document.getElementById('simbar'), t = document.getElementById('simtext');
    if (bar) bar.style.width = (frac * 100).toFixed(1) + '%';
    if (t) t.textContent = text || '';
  }
  async function runBatch(cfg, holes, profile, tiers, n, report) {
    E.setLieMode(cfg);
    const agg = E.newAgg(), ctx = E.botContext(cfg, tiers);
    let t = performance.now();
    for (let i = 0; i < n; i++) {
      const H = holes[i % holes.length];
      E.addAgg(agg, E.simHole(H, cfg, profile, tiers, (S.sim.seed * 7919 + i) | 0, ctx)); // same seeds for every config/profile
      if (performance.now() - t > 30) { report(i / n); await tick(); t = performance.now(); if (S.sim.cancel) break; }
    }
    E.setLieMode(S.cfg);
    return E.summarize(agg, cfg);
  }
  async function guarded(fn) {
    if (S.sim.running) return;
    S.sim.running = true; S.sim.cancel = false; render();
    try { await fn(); } catch (e) { console.error(e); alert(e.message); }
    S.sim.running = false; render();
  }
  function runSim() {
    return guarded(async () => {
      const sm = S.sim, holes = simHoles(S.cfg), tiers = defaultTiers(sm.tierAll);
      const profs = E.PROFILES.filter((p) => sm.profiles[p.id]);
      const res = {}, label = sm.label || `Run ${sm.runs.length + 1}`;
      for (let k = 0; k < profs.length; k++) {
        res[profs[k].id] = await runBatch(S.cfg, holes, profs[k], tiers, sm.n, (f) => setProgress((k + f) / profs.length, `${profs[k].name}…`));
      }
      sm.latest = { label, res, holes: holes.length, tier: sm.tierAll, source: sm.source };
      for (const p of profs) sm.runs.push({ label, profile: p.name, s: res[p.id], tier: sm.tierAll });
      sm.label = '';
    });
  }
  function runUpgrade() {
    return guarded(async () => {
      const sm = S.sim, holes = simHoles(S.cfg), prof = E.PROFILES.find((p) => p.id === sm.sweep.profile);
      const from = Math.min(sm.tierAll, E.MAX_TIER - 1);
      const items = [...S.cfg.clubs.filter((c) => c.enabled !== false && E.isTierable(c)).map((c) => c.id), 'putter'];
      const base = await runBatch(S.cfg, holes, prof, defaultTiers(from), sm.n, (f) => setProgress(f / (items.length + 1), 'baseline…'));
      const rows = [];
      for (let k = 0; k < items.length; k++) {
        const t = defaultTiers(from); t[items[k]] = from + 1;
        const s = await runBatch(S.cfg, holes, prof, t, sm.n, (f) => setProgress((k + 1 + f) / (items.length + 1), clubName(items[k]) + '…'));
        rows.push({ id: items[k], delta: base.mean - s.mean, se: Math.sqrt(base.se * base.se + s.se * s.se) });
      }
      sm.upg = { from, profile: prof.name, cost: S.cfg.progression.tierCosts[from - 1], rows, base };
    });
  }
  // numeric fields for sweeps, plus synthetic fan fields
  function sweepFields() {
    const cfg = S.cfg, list = [];
    for (const t of TIERS) {
      list.push({ path: `fanOuter.${t}`, label: `Tier ${t} fan: outer angle (faces 1/6)` });
      list.push({ path: `fanInner.${t}`, label: `Tier ${t} fan: inner angle (faces 2/5)` });
    }
    cfg.clubs.forEach((c, i) => {
      list.push({ path: `clubs.${i}.full`, label: `${c.name} distance` });
      list.push({ path: `clubs.${i}.enabled`, label: `${c.name} enabled (0/1)` });
    });
    for (const l in cfg.lieDrop) list.push({ path: `lieDrop.${l}`, label: `Lie drop: ${l}` });
    TIERS.forEach((t) => { list.push({ path: `tierStrips.${t - 1}.0`, label: `Tier ${t}: short if 2d6 ≤` }); list.push({ path: `tierStrips.${t - 1}.1`, label: `Tier ${t}: long if 2d6 ≥` }); });
    list.push({ path: 'notchYd', label: 'Short/long notch (yd)' });
    cfg.powerLevels.forEach((p, i) => list.push({ path: `powerLevels.${i}`, label: `Power level ${i + 1}` }));
    [1, 2, 3, 4].forEach((r) => list.push({ path: `putting.safe.${r - 1}`, label: `Putting: ring ${r} SAFE number` }));
    [2, 3, 4].forEach((r) => list.push({ path: `putting.risky.${r - 1}`, label: `Putting: ring ${r} RISKY number` }));
    list.push({ path: 'putting.safeMissTo.3', label: 'Putting: SAFE miss from ring 4 → ring' });
    list.push({ path: 'putting.cupRadius', label: 'Cup radius' });
    list.push({ path: 'rules.treesBlockLine', label: 'Trees block line (0/1)' });
    list.push({ path: 'penalties.water', label: 'Water penalty' }, { path: 'penalties.ob', label: 'OB penalty' });
    list.push({ path: 'rulerStepYd', label: 'Ruler step (yd)' });
    return list;
  }
  function applySweep(cfg, path, v) {
    let m;
    if ((m = path.match(/^(fanOuter|fanInner)\.(\d)$/))) {
      const fan = cfg.fans[m[2]];
      const i = m[1] === 'fanInner' ? 1 : 0;
      fan[i] = -Math.abs(v); fan[5 - i] = Math.abs(v);
      return;
    }
    const cur = getPath(cfg, path);
    setPath(cfg, path, typeof cur === 'boolean' ? !!v : v);
  }
  function runSweep() {
    return guarded(async () => {
      const sm = S.sim, sw = sm.sweep, prof = E.PROFILES.find((p) => p.id === sw.profile);
      const vals = [];
      for (let v = sw.from; v <= sw.to + 1e-9 && vals.length < 40; v += sw.step) vals.push(+v.toFixed(4));
      const rows = [];
      for (let k = 0; k < vals.length; k++) {
        const cfg = E.clone(S.cfg); applySweep(cfg, sw.path, vals[k]);
        const holes = simHoles(cfg);
        const s = await runBatch(cfg, holes, prof, defaultTiers(sm.tierAll), sw.n, (f) => setProgress((k + f) / vals.length, `${sw.path} = ${vals[k]}…`));
        rows.push({ v: vals[k], s });
      }
      const label = (sweepFields().find((f) => f.path === sw.path) || { label: sw.path }).label;
      sm.sweepRes = { label, profile: prof.name, rows, current: sw.path.startsWith('fan') ? null : getPath(S.cfg, sw.path) };
    });
  }
  function renderSim() {
    const sm = S.sim, out = [];
    const nHoles = simHoles(S.cfg).length;
    out.push(sec('Setup',
      row('Courses', h('select', { value: sm.source, onchange: (e) => { sm.source = e.target.value; render(); } },
        h('option', { value: 'presets' }, '4 reference holes'), h('option', { value: 'current' }, 'current hole only'),
        h('option', { value: 'random' }, 'random holes'), h('option', { value: 'presets+random' }, 'reference + random')),
        sm.source.includes('random') ? ['count', numIn(sm.randomCount, 1, 200, 1, (v) => { sm.randomCount = v; render(); }, 's')] : null),
      row('Holes / profile', numIn(sm.n, 10, 20000, 10, (v) => { sm.n = v; }), h('span', { class: 'muted' }, `cycling over ${nHoles} hole${nHoles === 1 ? '' : 's'}`)),
      row('Seed', numIn(sm.seed, 0, 1e6, 1, (v) => { sm.seed = v; render(); }, 's'), h('span', { class: 'muted' }, 'same seed = same dice for every config (fair A/B)')),
      row('All clubs at tier', ...TIERS.map((t) => h('button', { class: sm.tierAll === t ? 'on' : '', onclick: () => { sm.tierAll = t; render(); } }, t))),
      row('Profiles', ...E.PROFILES.map((p) => h('label', { style: 'min-width:0;margin-right:8px' },
        h('input', { type: 'checkbox', checked: sm.profiles[p.id], onchange: (e) => { sm.profiles[p.id] = e.target.checked; } }), ' ' + p.name + (p.type === 'ev' ? ` (λ ${p.lambda})` : '')))),
      row('Label', h('input', { value: sm.label, placeholder: 'e.g. fan ±12', oninput: (e) => { sm.label = e.target.value; } })),
      h('div', { class: 'row', style: 'margin-top:6px' },
        h('button', { class: 'primary', disabled: sm.running, onclick: runSim }, 'Run simulation'),
        sm.running ? h('button', { onclick: () => { sm.cancel = true; } }, 'Cancel') : null),
      h('div', { class: 'progress' }, h('div', { id: 'simbar' })), h('div', { id: 'simtext', class: 'hint' })));

    if (sm.latest) out.push(renderSimResult(sm.latest));
    if (sm.runs.length) out.push(sec('Run history (compare configs)',
      h('div', { class: 'scroll-x' }, h('table', null,
        h('tr', null, ['Run', 'Profile', 'T', 'vs par', '±SE', 'SD', 'Putts', 'OB tee', 'Water', 'Trees', 'Min/18'].map((x) => h('th', null, x))),
        sm.runs.map((r) => h('tr', null, h('td', null, r.label), h('td', null, r.profile), h('td', null, r.tier), h('td', null, sgn(r.s.mean)), h('td', { class: 'muted' }, fmt(r.s.se)),
          h('td', null, fmt(r.s.sd)), h('td', null, fmt(r.s.puttsPerHole)), h('td', null, pct(r.s.rates.obTee)), h('td', null, pct(r.s.rates.water)), h('td', null, pct(r.s.rates.trees)), h('td', null, fmt(r.s.minutesPer18, 0)))))),
      h('button', { class: 'small', onclick: () => { sm.runs = []; render(); } }, 'Clear history')));

    const fields = sweepFields();
    out.push(sec('Parameter sweep',
      h('div', { class: 'hint' }, 'Vary one rule number and watch what happens. Uses the courses, seed and tier above.'),
      row('Field', h('select', { value: sm.sweep.path, onchange: (e) => { sm.sweep.path = e.target.value; const v = getPath(S.cfg, e.target.value); if (typeof v === 'number') { sm.sweep.from = v; sm.sweep.to = v; } render(); } }, fields.map((f) => h('option', { value: f.path }, f.label)))),
      row('Values', 'from', numIn(sm.sweep.from, -1000, 1000, 0.05, (v) => { sm.sweep.from = v; }, 's'), 'to', numIn(sm.sweep.to, -1000, 1000, 0.05, (v) => { sm.sweep.to = v; }, 's'), 'step', numIn(sm.sweep.step, 0.05, 1000, 0.05, (v) => { sm.sweep.step = v; }, 's')),
      row('Bot', h('select', { value: sm.sweep.profile, onchange: (e) => { sm.sweep.profile = e.target.value; } }, E.PROFILES.map((p) => h('option', { value: p.id }, p.name))),
        'holes/value', numIn(sm.sweep.n, 10, 20000, 10, (v) => { sm.sweep.n = v; })),
      h('div', { class: 'row' },
        h('button', { class: 'primary', disabled: sm.running, onclick: runSweep }, 'Run sweep'),
        h('button', { disabled: sm.running, onclick: runUpgrade, title: 'Uses the bot and holes/value from this panel' }, 'Measure upgrade value')),
      sm.sweepRes ? renderSweep(sm.sweepRes) : null,
      sm.upg ? renderUpgrade(sm.upg) : null));
    return out;
  }
  function renderSimResult(L) {
    const ids = Object.keys(L.res), P = (id) => E.PROFILES.find((p) => p.id === id).name;
    const rowsDef = [
      ['Avg vs par / hole', (s) => sgn(s.mean) + ' ± ' + fmt(s.se)],
      ['  par 3', (s) => sgn(s.byPar[3])], ['  par 4', (s) => sgn(s.byPar[4])], ['  par 5', (s) => sgn(s.byPar[5])],
      ['Score SD (luck)', (s) => fmt(s.sd)],
      ['Shots / hole', (s) => fmt(s.shotsPerHole)], ['  long shots', (s) => fmt(s.longPerHole)], ['  putts', (s) => fmt(s.puttsPerHole)],
      ['Greens in regulation', (s) => pct(s.gir)],
      ['Penalty strokes / hole', (s) => fmt(s.penaltiesPerHole)],
      ['OB per tee shot', (s) => pct(s.rates.obTee)],
      ['Holes touching water', (s) => pct(s.rates.water)], ['  bunker', (s) => pct(s.rates.bunker)], ['  trees', (s) => pct(s.rates.trees)],
      ['  blocked by trees', (s) => pct(s.rates.blocked)],
      ['Picked up (hit max)', (s) => pct(s.pickups)],
      ['Minutes / 18 holes / player', (s) => fmt(s.minutesPer18, 0)],
    ];
    const gap = L.res.beginner && L.res.expert ? L.res.beginner.mean - L.res.expert.mean : null;
    const buckets = ['-2', '-1', '0', '1', '2', '3'], bl = { '-2': 'eagle−', '-1': 'birdie', 0: 'par', 1: 'bogey', 2: 'double', 3: 'triple+' };
    const clubs = [...new Set(ids.flatMap((id) => Object.values(L.res[id].clubUse).flatMap((o) => Object.keys(o))))];
    return sec(`Results · ${L.label} · ${L.holes} hole${L.holes === 1 ? '' : 's'}, tier ${L.tier}`,
      h('div', { class: 'scroll-x' }, h('table', null, h('tr', null, h('th', null, ''), ids.map((id) => h('th', null, P(id)))),
        rowsDef.map(([name, f]) => h('tr', null, h('td', null, name), ids.map((id) => h('td', null, f(L.res[id]))))))),
      gap != null ? h('div', { class: 'msg' }, `Skill gap (Beginner − Expert): ${sgn(gap)} strokes/hole `, h('span', { class: 'muted' }, '· target 0.6–1.2')) : null,
      h('h3', { style: 'margin-top:12px' }, 'Score distribution'),
      h('table', null, h('tr', null, h('th', null, ''), buckets.map((b) => h('th', null, bl[b]))),
        ids.map((id) => h('tr', null, h('td', null, P(id)), buckets.map((b) => {
          const v = L.res[id].buckets[b];
          return h('td', null, h('span', { class: 'bar', style: `width:${Math.round(v * 40)}px` }), ' ', pct(v));
        })))),
      h('h3', { style: 'margin-top:12px' }, 'Club usage by shot type'),
      h('div', { class: 'scroll-x' }, h('table', null, h('tr', null, h('th', null, ''), h('th', null, 'type'), clubs.map((c) => h('th', null, clubName(c)))),
        ids.flatMap((id) => ['tee', 'approach', 'recovery'].map((t, k) => h('tr', null, h('td', null, k === 0 ? P(id) : ''), h('td', { class: 'muted' }, t),
          clubs.map((c) => { const v = L.res[id].clubUse[t][c]; return h('td', { class: v != null && v < 0.1 ? 'warn' : '' }, v == null ? '·' : pct(v)); })))))),
      h('div', { class: 'hint' }, 'Orange = used on under 10% of that shot type (README target: every club ≥ 10%).'));
  }
  function renderSweep(R) {
    return h('div', { style: 'margin-top:10px' },
      h('div', null, h('b', null, R.label), h('span', { class: 'muted' }, ` · ${R.profile} bot`)),
      h('div', { class: 'scroll-x' }, h('table', null,
        h('tr', null, ['Value', 'vs par', '±SE', 'SD', 'Putts', 'GIR', 'OB tee', 'Water', 'Bunker', 'Trees', 'Blocked', 'Min/18'].map((x) => h('th', null, x))),
        R.rows.map((r) => h('tr', { style: R.current === r.v ? 'font-weight:700' : '' }, h('td', null, r.v), h('td', null, sgn(r.s.mean)), h('td', { class: 'muted' }, fmt(r.s.se)), h('td', null, fmt(r.s.sd)),
          h('td', null, fmt(r.s.puttsPerHole)), h('td', null, pct(r.s.gir)), h('td', null, pct(r.s.rates.obTee)), h('td', null, pct(r.s.rates.water)), h('td', null, pct(r.s.rates.bunker)),
          h('td', null, pct(r.s.rates.trees)), h('td', null, pct(r.s.rates.blocked)), h('td', null, fmt(r.s.minutesPer18, 0)))))),
      h('div', { class: 'hint' }, 'Differences smaller than about 2× SE are noise. Bold = current value.'));
  }
  function renderUpgrade(U) {
    const deltas = U.rows.map((r) => r.delta), mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const sd = Math.sqrt(deltas.reduce((a, b) => a + (b - mean) * (b - mean), 0) / deltas.length);
    return h('div', { style: 'margin-top:10px' },
      h('div', null, h('b', null, `Upgrade value, tier ${U.from} → ${U.from + 1}`), h('span', { class: 'muted' }, ` · ${U.profile} bot · cost ${U.cost} coins · baseline ${sgn(U.base.mean)} vs par`)),
      h('table', null, h('tr', null, ['Club', 'Strokes saved / hole', '±SE', 'per 18 holes', 'per coin (18 h)'].map((x) => h('th', null, x))),
        U.rows.map((r) => h('tr', null, h('td', null, clubName(r.id)), h('td', null, sgn(r.delta, 3)), h('td', { class: 'muted' }, fmt(r.se, 3)), h('td', null, sgn(r.delta * 18)), h('td', null, U.cost ? sgn((r.delta * 18) / U.cost) : '–')))),
      h('div', { class: 'hint' }, `Coefficient of variation across clubs: ${mean ? fmt(Math.abs(sd / mean)) : '–'} (target < 0.3 means upgrades are evenly worth it).`));
  }

  // --------------------------------------------------------------- print
  const C = window.Components;
  function svgEl(markup) { const d = document.createElement('div'); d.innerHTML = markup; return d.firstChild; }
  function downloadText(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  function printComponents(comps, title, pageSize) {
    const wide = Math.max(...comps.map((c) => c.w));
    const page = pageSize || (wide > 270 ? 'A3 landscape' : 'A4 landscape');
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: ${page}; margin: 8mm; } body { margin: 0; font: 11px Helvetica, Arial, sans-serif; }
      .item { break-inside: avoid; display: inline-block; margin: 0 ${pageSize ? '0.5mm 0.5mm' : '4mm 4mm'} 0; vertical-align: top; } .note { margin-bottom: 3mm; }
    </style></head><body><div class="note">Print at 100% ("Actual size"). This bar must measure 100 mm:
      <svg width="100mm" height="4mm" viewBox="0 0 100 4"><rect width="100" height="4" fill="#111"/></svg> · page: ${page}</div>
      ${comps.map((c) => `<div class="item">${C.wrap(c)}</div>`).join('')}
      <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script></body></html>`);
    w.document.close();
  }
  function renderPrint() {
    const cfg = S.cfg, ui = S.ui;
    const clubs = C.kitClubs(cfg);
    if (!ui.printClub || !clubs.includes(ui.printClub)) ui.printClub = 'i7';
    ui.printTier = ui.printTier || 1;
    const kit = C.clubKit(cfg, ui.printClub, ui.printTier);
    const board = C.playerBoard(cfg);
    const PX = 2.4; // on-screen pixels per mm
    const fig = (c) => h('figure', null, svgEl(C.wrap(c, PX)),
      h('figcaption', null, h('span', null, `${c.title} · ${Math.round(c.w)} × ${Math.round(c.h)} mm`),
        h('button', { class: 'small', onclick: () => downloadText(c.name + '.svg', C.wrap(c), 'image/svg+xml') }, 'SVG')));
    const usableClub = ui.printClub !== 'putter' && E.getClub(cfg, ui.printClub).allowedLies.some((l) => l === 'fairway' || l === 'tee') ? ui.printClub : 'i7';
    const diagram = C.usageDiagram(cfg, { club: usableClub, tier: ui.printTier });
    return [
      sec('Physical shot kit',
        h('div', { class: 'hint' }, 'Club system v2: one shared bag ruler and one shared fan for everyone, plus a card per club per tier. Cards show no distances: the 2d6 strip says SHORT / ON TARGET / LONG and the die strip says WIDE / SLIGHT / STRAIGHT; the bag ruler has each club\'s mark (short / long = one notch either side). Generated from the current Rules config.'),
        row('Club', ...clubs.map((id) => h('button', { class: ui.printClub === id ? 'on' : '', onclick: () => { ui.printClub = id; render(); } }, id === 'putter' ? 'Putter' : E.getClub(cfg, id).name))),
        row('Tier', ...TIERS.map((t) => h('button', { class: ui.printTier === t ? 'on' : '', onclick: () => { ui.printTier = t; render(); } }, t))),
        h('div', { class: 'row' },
          h('button', { class: 'primary', onclick: () => printComponents(kit, `${ui.printClub} tier ${ui.printTier}`) }, 'Print this club + tier'),
          h('button', { onclick: () => printComponents(TIERS.flatMap((t) => C.clubKit(cfg, ui.printClub, t)), `${ui.printClub} all tiers`) }, 'Print all tiers of this club'),
          h('button', { onclick: () => printComponents(clubs.flatMap((id) => TIERS.flatMap((t) => C.clubKit(cfg, id, t))), 'full kit') }, 'Print the full kit'),
          h('button', { onclick: () => downloadText(diagram.name + '.svg', C.wrap(diagram, 3), 'image/svg+xml') }, 'Download picture (SVG)')),
        h('div', { class: 'row' },
          h('button', { onclick: () => printComponents([board], 'player board', 'A4 landscape') }, 'Print player board'),
          h('button', { onclick: () => printComponents([C.bagRuler(cfg), C.sharedFan(cfg)], 'bag ruler and fan', 'A3 landscape') }, 'Print bag ruler + fan (A3)'),
          h('button', { onclick: () => printComponents(clubs.flatMap((id) => TIERS.map((t) => C.clubKit(cfg, id, t)[0])), 'all cards', 'A4 portrait') }, 'Print all cards')),
        h('div', { class: 'hint' }, 'The bag ruler is 31 cm long: print it on A3. Print the fan on transparency film; cards and the player board on card stock.')),
      sec('Shared pieces', h('div', { class: 'kit' }, fig(C.bagRuler(cfg)), fig(C.sharedFan(cfg)))),
      sec(`${ui.printClub === 'putter' ? 'Putter' : E.getClub(cfg, ui.printClub).name} · tiers 1–5`, h('div', { class: 'kit' }, TIERS.map((t) => fig(C.clubKit(cfg, ui.printClub, t)[0])))),
      sec('Green tiles', h('div', { class: 'hint' }, 'Flat greens with the putting rings printed on them. Easy ★ to hard ★★★: harder tiles have smaller rings and the cup near an edge.'),
        h('div', { class: 'row' }, h('button', { onclick: () => printComponents([C.greenTileSheet(cfg)], 'green tiles', 'A4 landscape') }, 'Print green tiles')),
        h('div', { class: 'kit' }, fig(C.greenTileSheet(cfg)))),
      sec('Coin tokens', h('div', { class: 'hint' }, 'Three per hole, near hazards or the edge. A ball that stops on a token takes it.'),
        h('div', { class: 'row' }, h('button', { onclick: () => printComponents([C.coinTokenSheet(cfg)], 'coin tokens', 'A4 portrait') }, 'Print coin tokens')),
        h('div', { class: 'kit' }, fig(C.coinTokenSheet(cfg)))),
      sec('Player board (one per player)', h('div', { class: 'hint' }, 'Mark a square each time you upgrade that club. Everything else is on the rulers.'), h('div', { class: 'kit' }, fig(board))),
      sec('The kit in use', h('div', { class: 'kit' }, h('figure', null, svgEl(C.wrap(diagram, 2.2))))),
    ];
  }

  // --------------------------------------------------------------- guide
  function renderAbout() {
    const Q = [
      ['Is ±15° at tier 1 too punishing?', 'Simulate → Parameter sweep → "Tier 1 fan: outer angle", 9 to 21 step 3, random holes. Watch vs par, OB and water.'],
      ['How big should each tier step be?', 'Simulate → "All clubs at tier" 1…5 and compare vs par. Sweep "Tier 2: short if 2d6 ≤" or "Tier 3 fan: outer angle". "Measure upgrade value" works from any tier to the next.'],
      ['Are upgrades worth their cost?', 'Measure upgrade value at tier 1, 2, 3 and 4. Strokes saved per coin should be similar across clubs (coefficient of variation < 0.3).'],
      ['Is the rough cap (75%) a fair penalty?', 'Sweep "Max power: rough" from 0.5 to 1 and watch vs par and how often bots land in the rough.'],
      ['Is ±10% distance luck the right amount?', 'Sweep "Zone Short multiplier" (and Long) and compare score spread (SD) and vs par.'],
      ['Do players need a punch-out?', 'Rules config → enable Punch-out. Compare "trees" rate and vs par with it off/on (sweep "Punch enabled 0/1").'],
      ['Do trees blocking the line feel right?', 'Play the Dogleg par 5 and try to cut the corner. Sweep "Trees block line (0/1)" to see the cost.'],
      ['How long is a session?', 'Minutes / 18 holes / player in the results. Multiply by player count (turns are sequential).'],
      ['Island green: priority vs stacking?', 'Rules config → Lie mode. With "priority", a green inside water is still water (unplayable).'],
    ];
    return [
      sec('How to use this prototype',
        h('div', null, h('b', null, 'Play'), ': click the board to aim (default is the pin), pick club and power, Hit. The dots show every possible landing spot; bigger = likelier, colour = lie. Use "Set manually" dice to reproduce a situation, and the bot buttons to see what an expected-value player would do.'),
        h('div', { style: 'margin-top:6px' }, h('b', null, 'Edit hole'), ': drag felt pieces, resize/rotate with the yellow handles, load presets or generate random holes, save to the library.'),
        h('div', { style: 'margin-top:6px' }, h('b', null, 'Rules config'), ': every number, on its printable step. Variants for the open questions are at the top.'),
        h('div', { style: 'margin-top:6px' }, h('b', null, 'Simulate'), ': bots play hundreds of holes. Same seed = same dice, so two configs can be compared fairly. Run history keeps every result.'),
        h('div', { class: 'hint', style: 'margin-top:8px' }, 'Everything is saved in this browser (localStorage). Export JSON to keep or share a config or hole.')),
      sec('Open questions → experiments', h('table', null, Q.map(([q, a]) => h('tr', null, h('td', { style: 'white-space:normal;vertical-align:top;font-weight:600;width:38%' }, q), h('td', { style: 'white-space:normal;text-align:left' }, a))))),
      sec('Known limits of the prototype',
        h('div', null, '• Bots use a heuristic value function (distance + lie), not a learned one, so they can be short-sighted: e.g. a risk-averse bot laying up short of an island green it must still carry.'),
        h('div', null, '• Shapes are ellipses only. Putting uses straight-line distance (no slopes).'),
        h('div', null, '• No optimizer and no print sheets yet; those are later build steps in the README.')),
    ];
  }

  // -------------------------------------------------------------- render
  function render() {
    renderTabs();
    renderBoard();
    renderLegend();
    const panel = document.getElementById('panel');
    const top = panel.scrollTop;
    document.body.classList.toggle('wide', S.tab === 'print');
    const kids = S.tab === 'play' ? renderPlay() : S.tab === 'edit' ? renderEdit() : S.tab === 'config' ? renderConfig() : S.tab === 'sim' ? renderSim() : S.tab === 'print' ? renderPrint() : renderAbout();
    panel.replaceChildren(...kids.flat().filter(Boolean));
    panel.scrollTop = top;
    if (S.tab === 'play') renderBoard(); // renderPlay may reset the hole
  }

  newGame();
  render();
})();
