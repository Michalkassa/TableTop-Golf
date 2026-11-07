/* Tabletop Golf — playable retro pixel-art game (pass-and-play, 1–4 players, humans or bots).
 * The course is rasterised into a low-resolution canvas and scaled up with hard pixel edges;
 * balls, flag, fan lines and labels are drawn on an SVG overlay snapped to the same pixel grid.
 * The camera follows the ball: it frames the ball and the cup, and zooms onto the green for putts. */
(function () {
  'use strict';
  const E = window.Engine;

  // ------------------------------------------------------------ helpers
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    let value;
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'value') value = v;
      else if (k === 'checked' || k === 'disabled') el[k] = !!v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k.nodeType ? k : document.createTextNode(String(k))); }
    if (value !== undefined) el.value = value;
    return el;
  }
  const fast = () => G && G.fast;
  const sleep = (ms) => new Promise((r) => setTimeout(r, fast() ? Math.min(ms, 40) : ms));
  function tween(ms, step) {
    if (fast()) ms = Math.min(ms, 40);
    return new Promise((res) => {
      const t0 = performance.now();
      const f = () => { const t = Math.min(1, (performance.now() - t0) / ms); step(t); if (t < 1) setTimeout(f, 16); else res(); };
      f();
    });
  }
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const f2 = (v) => Math.round(v * 100) / 100;
  const d6 = () => 1 + Math.floor(Math.random() * 6);
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } } };

  const stored = LS.get('ttg.cfg', null);
  const cfg = stored && stored.version === E.DEFAULT_CONFIG.version ? stored : E.clone(E.DEFAULT_CONFIG);
  E.setLieMode(cfg);

  // Retro palette
  const PAL = {
    table: '#4a3424', tableDark: '#2e2016', rough: '#3a8a3f', roughDot: '#2f7536', fairway: '#5fbd4a', fairway2: '#6fcd56',
    green: '#73d35c', green2: '#8ce872', greenEdge: '#2f8a3a', sand: '#f2d58c', sandDot: '#d9b866', water: '#3b5dc9', wave: '#73b7f2',
    tree: '#1e5631', tree2: '#2f7d3a', tree3: '#49a35a', white: '#f4f4f4', ink: '#0f101a', gold: '#ffcd75', goldDark: '#a37d00',
  };
  const KINDCOL = { driver: '#3b5dc9', wood: '#a46422', iron: '#566c86', wedge: '#ef7d57', putter: '#38b764' };
  const kindOf = (id) => (id === 'putter' ? 'putter' : (E.getClub(cfg, id) || {}).kind || 'iron');
  const clubCol = (id) => KINDCOL[kindOf(id)];
  const ZFILL = ['#3b5dc9', '#f4f4f4', '#b13e53'], ZTXT = ['#73b7f2', '#f4f4f4', '#ff8a80'];
  const dirCol = (a, outer) => (a === 0 ? '#38b764' : Math.abs(a) < Math.max(outer, 7) ? '#ffcd75' : '#ef7d57');
  const TIERCOL = ['#a46422', '#94b0c2', '#ffcd75', '#38b764', '#73eff7'];
  const TIERNAME = ['BRONZE', 'SILVER', 'GOLD', 'EMERALD', 'DIAMOND'];
  const PCOL = ['#e43b44', '#3b5dc9', '#ffcd75', '#b55088'];
  const KIND_ORDER = ['fairway', 'green', 'bunker', 'water', 'trees'];
  const ART_SCALE = 4; // screen pixels per art pixel

  // The course is rendered small on an off-screen canvas, then shown inside the SVG as a pixelated image.
  const wrap = document.getElementById('boardWrap'), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), terrainImg = document.getElementById('terrain');
  const svg = document.getElementById('board'), gover = document.getElementById('gover'), ganim = document.getElementById('ganim');
  const panel = document.getElementById('panel'), toastEl = document.getElementById('toast');

  let G = null;
  const setup = { n: 2, names: ['PLAYER 1', 'PLAYER 2', 'PLAYER 3', 'PLAYER 4'], bot: [false, true, true, true], holes: 6 };

  // ------------------------------------------------------------ game state
  function newGame() {
    const rng = E.mulberry32((Math.random() * 1e9) | 0);
    const pars = [4, 3, 4, 5, 4, 3, 4, 5, 4];
    const holes = Array.from({ length: setup.holes }, (_, i) => E.generateHole(rng, cfg, { par: pars[i % pars.length] }));
    G = {
      holes, prepped: holes.map(E.prepHole), hi: 0, cur: 0, phase: 'turn', busy: false, fast: false,
      players: Array.from({ length: setup.n }, (_, i) => ({
        name: (setup.names[i] || `PLAYER ${i + 1}`).toUpperCase(), bot: setup.bot[i], color: PCOL[i],
        tiers: Object.fromEntries(cfg.clubs.map((c) => [c.id, 1]).concat([['putter', 1]])),
        coins: 0, scores: [], st: null, trail: [], tokenCoins: 0,
      })),
      ui: { club: null, power: 1, aim: null, cloud: false }, vb: null, highlight: null, lastExplain: null, lastDice: null, coins: [],
    };
    startHole();
  }
  const H = () => G.prepped[G.hi];
  const P = () => G.players[G.cur];
  const parOf = () => E.parOf(H(), cfg);
  function startHole() {
    for (const p of G.players) { p.st = E.startState(H()); p.trail = []; p.tokenCoins = 0; }
    G.coins = E.placeCoins(H(), cfg, E.mulberry32((Math.random() * 1e9) | 0));
    G.phase = 'turn'; G.lastExplain = null; G.lastDice = null; G.vb = null;
    pickNext();
  }
  const done = (p) => p.st.holed || p.st.strokes >= cfg.rules.maxStrokesPerHole;
  function pickNext() {
    const open = G.players.map((p, i) => ({ p, i })).filter((x) => !done(x.p));
    if (!open.length) return endHole();
    open.sort((a, b) => E.dist(b.p.st, H().pin) - E.dist(a.p.st, H().pin) || a.i - b.i);
    G.cur = open[0].i;
    const p = P();
    if (p.st.onGreen) { G.ui.club = null; G.ui.power = 1; }
    else { const def = E.decide(H(), cfg, p.st, p.tiers, E.PROFILES[0], ctxFor(p), false); G.ui.club = def.club; G.ui.power = def.power; }
    G.ui.aim = null; G.phase = 'turn';
    render();
    if (p.bot) botTurn();
  }
  const ctxCache = new Map();
  function ctxFor(p) { const k = JSON.stringify(p.tiers); if (!ctxCache.has(k)) ctxCache.set(k, E.botContext(cfg, p.tiers)); return ctxCache.get(k); }

  // ------------------------------------------------------------ shots
  async function takeShot(choice) {
    if (G.busy || G.phase !== 'turn') return;
    G.busy = true;
    const p = P(), hole = H(), st = p.st;
    const dice = { d1: d6(), d2: d6(), dir: d6() };
    const dec = st.onGreen ? { putt: choice } : { club: G.ui.club, power: G.ui.power, aim: G.ui.aim || hole.pin };
    let out;
    try { out = E.playShot(hole, cfg, st, dec, p.tiers, dice); } catch (e) { G.busy = false; toast(e.message.toUpperCase()); return; }
    const r = out.result;
    G.lastRoll = { sum: dice.d1 + dice.d2, dir: dice.dir, choice, onGreen: st.onGreen, ring: st.onGreen ? E.ringOf(hole, st) : 0, jitter: [0.25 + Math.random() * 0.5, 0.25 + Math.random() * 0.5] };
    G.phase = 'rolling'; G.diceRolling = true; G.lastDice = null; G.lastExplain = null; render();
    await rollDice(st.onGreen ? [dice.d1, dice.d2] : [dice.d1, dice.d2, dice.dir], !st.onGreen);
    G.diceRolling = false; // the arrow appears only once the dice have landed
    G.lastExplain = explain(r); renderPanel();
    await sleep(500);
    if (!r.putt) {
      await setView(fitBox([r.from, r.landing, r.intended, hole.pin]), 450);
      G.highlight = r; drawAll(); await sleep(600);
    }
    G.phase = 'flying';
    await animateBall(p, r);
    p.trail.push({ from: r.from, to: r.landing, putt: !!r.putt });
    p.st = out.state;
    G.highlight = null;
    const t = resultText(r, out.state);
    const ci = r.putt || out.state.holed ? -1 : E.coinAt(G.coins, out.state, cfg);
    if (ci >= 0) {
      const c = G.coins[ci]; c.taken = true; p.coins += c.value; p.tokenCoins += c.value;
      t[1] = (t[1] ? t[1] + ' · ' : '') + `+${c.value} COIN${c.value > 1 ? 'S' : ''}!`;
      await coinPop(c);
    }
    toast(t[0], t[1]);
    drawAll();
    await sleep(r.holed ? 1500 : 1000);
    G.busy = false;
    pickNext();
  }
  async function botTurn() {
    const p = P();
    await sleep(700);
    if (G.phase !== 'turn' || P() !== p) return;
    if (p.st.onGreen) {
      const c = E.decidePutt(H(), cfg, p.st, p.tiers, E.PROFILES[1], ctxFor(p));
      G.botChoice = c; renderPanel(); await sleep(700); G.botChoice = null;
      return takeShot(c);
    }
    const d = E.decide(H(), cfg, p.st, p.tiers, E.PROFILES[1], { ...ctxFor(p), coins: G.coins.filter((c) => !c.taken), coinWorth: 0.35 }, false);
    G.ui.club = d.club; G.ui.power = d.power; G.ui.aim = { x: d.aim.x, y: d.aim.y };
    render(); await sleep(900);
    return takeShot();
  }
  function explain(r) {
    if (r.putt) return [`RING ${r.ring} · ${r.choice.toUpperCase()}: needs ${r.target <= 2 ? 'nothing' : r.target + '+'}`, `Rolled <b>${r.sum}</b> → ${r.holed ? '<b>IN!</b>' : 'miss, ball to <b>ring ' + r.destRing + '</b>'}`];
    const z = r.calc.zone;
    return [`Distance ${r.dice.d1}+${r.dice.d2} = ${r.calc.pips} → <b>${z.label.toUpperCase()}</b>${z.drop ? ` (${r.from.lie} −${z.drop})` : ''} · ${r.distance} yd`, `Direction ${r.dice.dir} → <b>${r.angle === 0 ? 'STRAIGHT' : (r.angle > 0 ? '+' : '−') + Math.abs(r.angle) + '°'}</b> line`];
  }
  function resultText(r, st) {
    if (r.holed) return [r.putt ? 'IN THE CUP!' : 'HOLE OUT!!', ''];
    if (r.putt) return [`MISS → RING ${r.destRing}`, r.choice === 'risky' ? 'it rolled past the cup' : ''];
    if (r.landLie === 'ob') return ['OUT OF BOUNDS', `+${r.penalty} stroke · play again`];
    if (r.landLie === 'water') return ['SPLASH!', `+${r.penalty} stroke · dropped on dry ground`];
    if (r.blocked) return ['TIMBER!', 'stopped by the trees'];
    const names = { green: 'ON THE GREEN!', fairway: 'FAIRWAY', rough: 'ROUGH', bunker: 'BUNKER', trees: 'TREES' };
    return [names[st.lie] || st.lie.toUpperCase(), `${r.distance} yd`];
  }
  function toast(t, sub) {
    toastEl.innerHTML = t + (sub ? `<small>${sub}</small>` : '');
    toastEl.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('on'), fast() ? 150 : 1700);
  }

  // ------------------------------------------------------------ dice (pixel)
  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  function dieSvg(face, red) {
    const fill = red ? '#b13e53' : '#f4f4f4', ink = red ? '#f4f4f4' : '#0f101a', shade = red ? '#7a2436' : '#94b0c2';
    let s = `<svg viewBox="0 0 16 16" class="die" shape-rendering="crispEdges"><rect x="1" y="1" width="14" height="14" fill="${PAL.ink}"/><rect x="2" y="2" width="12" height="12" fill="${fill}"/><rect x="2" y="12" width="12" height="2" fill="${shade}"/><rect x="12" y="2" width="2" height="12" fill="${shade}"/>`;
    for (const [a, b] of PIPS[face]) s += `<rect x="${7 + a * 3.5 - 0.5}" y="${7 + b * 3.5 - 0.5}" width="2" height="2" fill="${ink}"/>`;
    return s + '</svg>';
  }
  function staticDice() {
    const { faces, withDir } = G.lastDice, sum = faces[0] + faces[1];
    return faces.map((fc, i) => h('div', null, h('div', { html: dieSvg(fc, withDir && i === 2) }),
      h('div', { class: 'dielbl' }, withDir && i === 2 ? 'AIM' : i === 0 ? `${sum}` : '')));
  }
  async function rollDice(faces, withDir) {
    const tray = document.getElementById('dicebox');
    if (!tray) return;
    const slots = faces.map((_, i) => h('div', null, h('div', { html: dieSvg(d6(), withDir && i === 2) }), h('div', { class: 'dielbl' }, withDir && i === 2 ? 'AIM' : 'DIST')));
    tray.replaceChildren(...slots);
    const t0 = performance.now(), dur = fast() ? 40 : 900;
    while (performance.now() - t0 < dur) {
      slots.forEach((s, i) => { s.firstChild.innerHTML = dieSvg(d6(), withDir && i === 2); s.firstChild.firstChild.classList.add('tumble'); });
      await new Promise((r) => setTimeout(r, 80));
    }
    G.lastDice = { faces, withDir };
    tray.replaceChildren(...staticDice());
    await sleep(350);
  }

  // ------------------------------------------------------------ camera
  function boardBox() { const hole = H(); return [-14, -14, hole.w + 28, hole.h + 28]; }
  function fitBox(pts, minW) {
    minW = minW || 130;
    let x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
    let y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
    const pad = Math.max(30, 0.22 * Math.hypot(x1 - x0, y1 - y0));
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    let w = Math.max(minW, x1 - x0), hh = Math.max(minW, y1 - y0);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const B = boardBox();
    if (w >= B[2] && hh >= B[3]) return B;
    w = Math.min(w, B[2]); hh = Math.min(hh, B[3]);
    const x = Math.max(B[0], Math.min(B[0] + B[2] - w, cx - w / 2)), y = Math.max(B[1], Math.min(B[1] + B[3] - hh, cy - hh / 2));
    return [x, y, w, hh];
  }
  function greenBox() {
    const hole = H();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of hole.kinds.green) { const r = Math.max(g.rx, g.ry); x0 = Math.min(x0, g.cx - r); y0 = Math.min(y0, g.cy - r); x1 = Math.max(x1, g.cx + r); y1 = Math.max(y1, g.cy + r); }
    for (const q of G.players) if (q.st.onGreen && !q.st.holed) { x0 = Math.min(x0, q.st.x); x1 = Math.max(x1, q.st.x); y0 = Math.min(y0, q.st.y); y1 = Math.max(y1, q.st.y); }
    const pad = 8;
    return [x0 - pad, y0 - pad - 10, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad + 10];
  }
  // Frame the ball and the cup: the closer the ball, the tighter the view.
  function targetVB() {
    if (!G) return [0, 0, 340, 460];
    if (['holeEnd', 'shop', 'end'].includes(G.phase)) return boardBox();
    const p = P();
    if (p.st.onGreen) return greenBox();
    const pts = [p.st, H().pin];
    if (G.ui.aim) pts.push(G.ui.aim);
    if (G.ui.club && G.phase === 'turn') {
      const club = E.getClub(cfg, G.ui.club), d = E.clubDistance(cfg, club, 12, G.ui.power, p.st.lie, p.tiers[club.id] || 1);
      const aim = G.ui.aim || H().pin, a = Math.atan2(aim.y - p.st.y, aim.x - p.st.x);
      pts.push({ x: p.st.x + Math.cos(a) * d, y: p.st.y + Math.sin(a) * d });
    }
    return fitBox(pts);
  }
  let vbToken = 0;
  async function setView(to, ms) {
    const from = G.vb || to, token = ++vbToken;
    if (from.every((v, i) => Math.abs(v - to[i]) < 0.5)) { G.vb = to; drawAll(); return; }
    await tween(ms || 550, (t) => { if (token !== vbToken) return; const k = ease(t); G.vb = from.map((v, i) => v + (to[i] - v) * k); drawAll(); });
  }
  // The logical view expanded to the container's aspect ratio, plus the art-pixel grid.
  function view() {
    const cw = Math.max(50, wrap.clientWidth), ch = Math.max(50, wrap.clientHeight);
    const vb = (G && G.vb) || targetVB();
    let [x, y, w, hh] = vb;
    const a = cw / ch;
    if (w / hh > a) { const h2 = w / a; y -= (h2 - hh) / 2; hh = h2; } else { const w2 = hh * a; x -= (w2 - w) / 2; w = w2; }
    const aw = Math.round(cw / ART_SCALE), ah = Math.round(ch / ART_SCALE);
    return { x, y, w, h: hh, aw, ah, px: w / aw };
  }

  // ------------------------------------------------------------ terrain (pixel raster)
  const ell = (sh, fill, extra) => `<ellipse cx="${f2(sh.cx)}" cy="${f2(sh.cy)}" rx="${f2(sh.rx)}" ry="${f2(sh.ry)}" transform="rotate(${sh.rotation || 0} ${f2(sh.cx)} ${f2(sh.cy)})" fill="${fill}" ${extra || ''}/>`;
  function terrainSvg(V) {
    const hole = H(), px = V.px, P1 = f2(px);
    const pat = (id, size, body) => `<pattern id="${id}" width="${f2(size * px)}" height="${f2(size * px)}" patternUnits="userSpaceOnUse">${body}</pattern>`;
    const r = (x, y, w, hh, c) => `<rect x="${f2(x * px)}" y="${f2(y * px)}" width="${f2(w * px)}" height="${f2(hh * px)}" fill="${c}"/>`;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${V.aw}" height="${V.ah}" viewBox="${f2(V.x)} ${f2(V.y)} ${f2(V.w)} ${f2(V.h)}" shape-rendering="crispEdges"><defs>`;
    s += pat('rough', 6, r(0, 0, 6, 6, PAL.rough) + r(1, 1, 1, 1, PAL.roughDot) + r(4, 3, 1, 1, PAL.roughDot) + r(2, 5, 1, 1, PAL.roughDot));
    s += pat('fair', 8, r(0, 0, 8, 4, PAL.fairway) + r(0, 4, 8, 4, PAL.fairway2));
    s += pat('sand', 5, r(0, 0, 5, 5, PAL.sand) + r(1, 1, 1, 1, PAL.sandDot) + r(3, 3, 1, 1, PAL.sandDot));
    s += pat('water', 10, r(0, 0, 10, 10, PAL.water) + r(1, 2, 3, 1, PAL.wave) + r(6, 7, 3, 1, PAL.wave));
    s += pat('trees', 8, r(0, 0, 8, 8, PAL.tree) + r(1, 1, 4, 3, PAL.tree2) + r(2, 1, 2, 1, PAL.tree3) + r(5, 4, 3, 3, PAL.tree2) + r(5, 4, 1, 1, PAL.tree3));
    s += pat('table', 10, r(0, 0, 10, 10, PAL.table) + r(0, 4, 10, 1, PAL.tableDark));
    s += `<clipPath id="gc">${hole.kinds.green.map((g) => ell(g, '#000')).join('')}</clipPath></defs>`;
    s += `<rect x="${f2(V.x)}" y="${f2(V.y)}" width="${f2(V.w)}" height="${f2(V.h)}" fill="url(#table)"/>`;
    s += `<rect x="${f2(-2 * px)}" y="${f2(-2 * px)}" width="${f2(hole.w + 4 * px)}" height="${f2(hole.h + 4 * px)}" fill="${PAL.ink}"/><rect x="0" y="0" width="${hole.w}" height="${hole.h}" fill="url(#rough)"/>`;
    const fills = { fairway: 'url(#fair)', bunker: 'url(#sand)', water: 'url(#water)', trees: 'url(#trees)', green: PAL.green };
    for (const sh of hole.hole.shapes) {
      if (!KIND_ORDER.includes(sh.kind)) continue;
      if (sh.tile) {
        const parts = E.tileParts(sh);
        s += parts.map((q) => ell({ ...q, rx: q.rx + px, ry: q.ry + px }, PAL.greenEdge)).join('') + parts.map((q) => ell(q, PAL.green)).join('');
      } else s += ell(sh, fills[sh.kind]);
    }
    const pin = hole.pin, R = hole.rings, p = G && P();
    const hi = p && p.st.onGreen && !['holeEnd', 'shop', 'end'].includes(G.phase) ? E.ringOf(hole, p.st) : 0;
    s += `<g clip-path="url(#gc)"><circle cx="${pin.x}" cy="${pin.y}" r="${R[0]}" fill="${PAL.green2}"/>`;
    if (hi) {
      const inner = hi === 1 ? 0 : R[hi - 2], outer = hi === 4 ? 999 : R[hi - 1];
      s += `<path d="M ${pin.x - outer} ${pin.y} a ${outer} ${outer} 0 1 0 ${2 * outer} 0 a ${outer} ${outer} 0 1 0 ${-2 * outer} 0 ${inner ? `M ${pin.x - inner} ${pin.y} a ${inner} ${inner} 0 1 1 ${2 * inner} 0 a ${inner} ${inner} 0 1 1 ${-2 * inner} 0` : ''}" fill="${PAL.gold}" fill-opacity=".55" fill-rule="evenodd"/>`;
    }
    R.forEach((rr) => { s += `<circle cx="${pin.x}" cy="${pin.y}" r="${rr}" fill="none" stroke="${PAL.white}" stroke-width="${P1}"/>`; });
    s += `</g>`;
    s += `<rect x="${f2(hole.tee.x - 5)}" y="${f2(hole.tee.y - 3)}" width="10" height="6" fill="${PAL.white}"/><rect x="${f2(hole.tee.x - 5)}" y="${f2(hole.tee.y + 3 - px)}" width="10" height="${P1}" fill="#94b0c2"/>`;
    return s + '</svg>';
  }
  let rasterGen = 0, lastKey = '';
  function drawTerrain(V) {
    if (!G) { terrainImg.removeAttribute('href'); return; }
    const p = P();
    const key = [G.hi, f2(V.x), f2(V.y), f2(V.w), V.aw, V.ah, p && p.st.onGreen ? E.ringOf(H(), p.st) : 0, G.phase].join('|');
    if (key === lastKey) return;
    lastKey = key;
    const gen = ++rasterGen, img = new Image();
    img.onload = () => {
      if (gen !== rasterGen) return;
      if (canvas.width !== V.aw || canvas.height !== V.ah) { canvas.width = V.aw; canvas.height = V.ah; }
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, V.aw, V.ah);
      ctx.drawImage(img, 0, 0, V.aw, V.ah);
      terrainImg.setAttribute('x', f2(V.x)); terrainImg.setAttribute('y', f2(V.y)); terrainImg.setAttribute('width', f2(V.w)); terrainImg.setAttribute('height', f2(V.h));
      terrainImg.setAttribute('href', canvas.toDataURL('image/png'));
    };
    img.onerror = () => { window.__rasterErr = (window.__rasterErr || 0) + 1; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(terrainSvg(V));
  }

  // ------------------------------------------------------------ overlay (pixel-snapped SVG)
  function drawAll() {
    const V = view();
    svg.setAttribute('viewBox', `${f2(V.x)} ${f2(V.y)} ${f2(V.w)} ${f2(V.h)}`);
    drawTerrain(V);
    gover.innerHTML = G ? overlaySvg(V) : '';
  }
  const snap = (v, o, px) => o + Math.round((v - o) / px) * px;
  function pixBall(V, x, y, color, lift, op) {
    const px = V.px, sz = Math.max(4, Math.round(5 * (1 + (lift || 0) * 0.8))) * px, sx = snap(x, V.x, px), sy = snap(y - (lift || 0) * 7 * px, V.y, px);
    const o = op == null ? 1 : op;
    let s = `<rect x="${f2(snap(x, V.x, px) - sz / 2 + px)}" y="${f2(snap(y, V.y, px) + px)}" width="${f2(sz)}" height="${f2(sz / 2)}" fill="#000" opacity="${0.3 * o}"/>`;
    s += `<rect x="${f2(sx - sz / 2 - px)}" y="${f2(sy - sz / 2 - px)}" width="${f2(sz + 2 * px)}" height="${f2(sz + 2 * px)}" fill="${PAL.ink}" opacity="${o}"/>`;
    s += `<rect x="${f2(sx - sz / 2)}" y="${f2(sy - sz / 2)}" width="${f2(sz)}" height="${f2(sz)}" fill="${color}" opacity="${o}"/>`;
    s += `<rect x="${f2(sx - sz / 2)}" y="${f2(sy - sz / 2)}" width="${f2(px * 2)}" height="${f2(px * 2)}" fill="#fff" opacity="${0.6 * o}"/>`;
    return s;
  }
  function overlaySvg(V) {
    const hole = H(), px = V.px, P1 = f2(px), p = P(), pin = hole.pin;
    const txt = (x, y, t, size, color, plain) => `<text x="${f2(x)}" y="${f2(y)}" font-family="'Press Start 2P', monospace" font-size="${f2(size * px)}" fill="${color || PAL.white}" text-anchor="middle"${plain ? '' : ` stroke="${PAL.ink}" stroke-width="${f2(px * 1.2)}" paint-order="stroke"`}>${t}</text>`;
    let s = `<g shape-rendering="crispEdges">`;
    for (const q of G.players) for (const t of q.trail) s += `<line x1="${f2(t.from.x)}" y1="${f2(t.from.y)}" x2="${f2(t.to.x)}" y2="${f2(t.to.y)}" stroke="${q.color}" stroke-width="${P1}" stroke-dasharray="${f2(px * 2)} ${f2(px * 2)}" opacity=".8"/>`;
    for (const c of G.coins || []) if (!c.taken) {
      const R = cfg.coinTokens.radius, cs = Math.max(6 * px, 4), cx = snap(c.x, V.x, px), cy = snap(c.y, V.y, px);
      s += `<circle cx="${c.x}" cy="${c.y}" r="${R}" fill="${PAL.gold}" fill-opacity=".12" stroke="${PAL.gold}" stroke-width="${P1}" stroke-dasharray="${f2(px * 2)} ${f2(px * 2)}"/>`;
      s += `<rect x="${f2(cx - cs / 2 - px)}" y="${f2(cy - cs / 2 - px)}" width="${f2(cs + 2 * px)}" height="${f2(cs + 2 * px)}" fill="${PAL.ink}"/><rect x="${f2(cx - cs / 2)}" y="${f2(cy - cs / 2)}" width="${f2(cs)}" height="${f2(cs)}" fill="${PAL.gold}"/><rect x="${f2(cx - cs / 2)}" y="${f2(cy + cs / 2 - px)}" width="${f2(cs)}" height="${P1}" fill="${PAL.goldDark}"/>`;
      s += txt(cx, cy + cs * 0.3, c.value, (cs / px) * 0.75, PAL.ink, true);
    }
    if (V.w < 150) {
      const R = hole.rings, lbl = [R[0] * 0.55, (R[0] + R[1]) / 2, (R[1] + R[2]) / 2, R[2] + 2.5];
      lbl.forEach((rr, i) => {
        for (const deg of [-45, -20, -70, 0, -110, 20, -135, 45, 180, 90, 135, -160]) {
          const a = (deg * Math.PI) / 180, x = pin.x + Math.cos(a) * rr, y = pin.y + Math.sin(a) * rr;
          if (hole.kinds.green.some((g) => E.inShape(g, x, y)) && Math.hypot(x - pin.x, y - (pin.y - 6)) > 4) { s += txt(x, y + 3 * px, i + 1, 6); break; }
        }
      });
    }
    const fx = snap(pin.x, V.x, px), fy = snap(pin.y, V.y, px), fh = Math.max(18 * px, 9);
    s += `<rect x="${f2(fx - 1.5 * px)}" y="${f2(fy - px)}" width="${f2(3 * px)}" height="${f2(2 * px)}" fill="${PAL.ink}"/>`;
    s += `<rect x="${f2(fx)}" y="${f2(fy - fh)}" width="${P1}" height="${f2(fh)}" fill="${PAL.white}"/>`;
    s += `<rect x="${f2(fx + px)}" y="${f2(fy - fh)}" width="${f2(fh * 0.45)}" height="${f2(fh * 0.28)}" fill="#e43b44"/><rect x="${f2(fx + px)}" y="${f2(fy - fh + fh * 0.28)}" width="${f2(fh * 0.25)}" height="${P1}" fill="#a52a33"/>`;
    if (p && G.phase === 'turn' && !p.st.onGreen && G.ui.club) s += previewSvg(V, p, txt);
    if (G.highlight) {
      const r = G.highlight, aim = r.aim || pin, base = Math.atan2(aim.y - r.from.y, aim.x - r.from.x), a = base + (r.angle * Math.PI) / 180, L = Math.max(r.distance, 10) * 1.08;
      s += `<line x1="${f2(r.from.x)}" y1="${f2(r.from.y)}" x2="${f2(r.from.x + Math.cos(a) * L)}" y2="${f2(r.from.y + Math.sin(a) * L)}" stroke="${PAL.gold}" stroke-width="${f2(px * 2)}"/>`;
      s += `<rect x="${f2(r.intended.x - 3 * px)}" y="${f2(r.intended.y - 3 * px)}" width="${f2(6 * px)}" height="${f2(6 * px)}" fill="none" stroke="${PAL.gold}" stroke-width="${f2(px * 1.5)}"/>`;
    }
    G.players.forEach((q) => {
      if (q.st.holed || (G.anim && G.anim.player === q)) return;
      const me = q === p && !['holeEnd', 'shop', 'end'].includes(G.phase);
      if (me) s += `<rect x="${f2(snap(q.st.x, V.x, px) - 6 * px)}" y="${f2(snap(q.st.y, V.y, px) - 6 * px)}" width="${f2(12 * px)}" height="${f2(12 * px)}" fill="none" stroke="${PAL.white}" stroke-width="${P1}" stroke-dasharray="${f2(px * 2)} ${f2(px)}"><animate attributeName="opacity" values="1;0.2;1" dur="0.8s" repeatCount="indefinite" calcMode="discrete"/></rect>`;
      s += pixBall(V, q.st.x, q.st.y, q.color, 0);
    });
    return s + '</g>';
  }
  function previewSvg(V, p, txt) {
    const hole = H(), st = p.st, club = E.getClub(cfg, G.ui.club), px = V.px;
    if (!club || !E.clubAllowed(club, st.lie)) return '';
    const tier = E.isTierable(club) ? p.tiers[club.id] : 1, aim = G.ui.aim || hole.pin;
    const base = Math.atan2(aim.y - st.y, aim.x - st.x), groups = E.faceGroups(E.fanFor(cfg, club, tier));
    const zs = [...new Set([2, 7, 12].map((v) => E.clubDistance(cfg, club, v, G.ui.power, st.lie, tier)))].sort((a, b) => a - b), dmax = zs[zs.length - 1];
    let s = `<line x1="${f2(st.x)}" y1="${f2(st.y)}" x2="${f2(aim.x)}" y2="${f2(aim.y)}" stroke="${PAL.gold}" stroke-width="${f2(px)}" stroke-dasharray="${f2(px * 3)} ${f2(px * 2)}"/>`;
    for (const g of groups) {
      const a = base + (g.angle * Math.PI) / 180, ex = st.x + Math.cos(a) * dmax, ey = st.y + Math.sin(a) * dmax;
      s += `<line x1="${f2(st.x)}" y1="${f2(st.y)}" x2="${f2(ex)}" y2="${f2(ey)}" stroke="${PAL.white}" stroke-width="${f2(px)}" opacity=".85"/>`;
      s += txt(ex + Math.cos(a) * 8 * px, ey + Math.sin(a) * 8 * px + 3 * px, g.faces.join(''), 6);
    }
    const a0 = base + (groups[0].angle * Math.PI) / 180, a1 = base + (groups[groups.length - 1].angle * Math.PI) / 180;
    zs.forEach((d, i) => {
      const pts = []; for (let k = 0; k <= 18; k++) { const a = a0 - 0.03 + ((a1 - a0 + 0.06) * k) / 18; pts.push(`${f2(st.x + Math.cos(a) * d)},${f2(st.y + Math.sin(a) * d)}`); }
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${['#73b7f2', PAL.white, '#ff8a80'][i] || PAL.white}" stroke-width="${f2(px * (i === 1 ? 1.5 : 1))}" stroke-dasharray="${f2(px * 2)} ${f2(px * 2)}"/>`;
    });
    if (G.ui.cloud) for (const z of E.zonesFor(cfg, tier)) for (const g of groups) {
      const r = E.flyShot(hole, cfg, st, club.id, G.ui.power, aim, tier, z.from, g.angle);
      const col = { water: '#3b5dc9', ob: '#e43b44', bunker: '#ef7d57', trees: '#1e5631', green: '#f4f4f4', fairway: '#d8ffcc', rough: '#2f7536' }[r.landLie];
      s += `<rect x="${f2(r.landing.x - 2 * px)}" y="${f2(r.landing.y - 2 * px)}" width="${f2(4 * px)}" height="${f2(4 * px)}" fill="${col}" stroke="${PAL.ink}" stroke-width="${f2(px)}"/>`;
    }
    if (G.ui.aim) s += `<rect x="${f2(aim.x - 3 * px)}" y="${f2(aim.y - 3 * px)}" width="${f2(6 * px)}" height="${f2(6 * px)}" fill="none" stroke="${PAL.gold}" stroke-width="${f2(px)}"/>`;
    return s;
  }
  async function animateBall(p, r) {
    const from = r.from, to = r.landing;
    G.anim = { player: p }; drawAll();
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const frame = (x, y, lift, op) => { const V = view(); ganim.innerHTML = `<g shape-rendering="crispEdges">${pixBall(V, x, y, p.color, lift, op)}</g>`; };
    if (r.putt) {
      await tween(Math.min(1300, 500 + dist * 40), (t) => { const k = ease(t); frame(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, 0); });
      if (r.holed) await tween(300, (t) => frame(to.x, to.y, 0, 1 - t));
    } else {
      await tween(Math.min(1700, 600 + dist * 3.2), (t) => { const k = ease(t); frame(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, Math.sin(Math.PI * t) * (r.blocked ? 0.6 : 1)); });
      if (r.landLie === 'water') {
        await tween(450, (t) => { const V = view(), w = 2 + t * 8; ganim.innerHTML = `<rect x="${f2(to.x - w)}" y="${f2(to.y - w)}" width="${f2(2 * w)}" height="${f2(2 * w)}" fill="none" stroke="#73b7f2" stroke-width="${f2(V.px * (2 * (1 - t) + 0.5))}" shape-rendering="crispEdges"/>`; });
        await tween(450, (t) => { const k = ease(t); frame(to.x + (r.x - to.x) * k, to.y + (r.y - to.y) * k, 0, t); });
      } else if (r.landLie === 'ob') {
        await tween(300, (t) => frame(to.x, to.y, 0, 1 - t));
        await tween(400, (t) => frame(r.x, r.y, 0, t));
      } else if (r.holed) await tween(300, (t) => frame(to.x, to.y, 0, 1 - t));
    }
    ganim.innerHTML = '';
    G.anim = null;
  }
  async function coinPop(c) {
    await tween(450, (t) => { const px = view().px; ganim.innerHTML = `<g shape-rendering="crispEdges"><rect x="${f2(c.x - 3 * px)}" y="${f2(c.y - 3 * px - t * 14 * px)}" width="${f2(6 * px)}" height="${f2(6 * px)}" fill="${PAL.gold}" opacity="${1 - t}"/><text x="${c.x}" y="${f2(c.y - 6 * px - t * 14 * px)}" font-family="'Press Start 2P', monospace" font-size="${f2(7 * px)}" fill="${PAL.gold}" text-anchor="middle" opacity="${1 - t}">+${c.value}</text></g>`; });
    ganim.innerHTML = '';
  }

  function toBoard(e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: q.x, y: q.y }; }
  svg.addEventListener('pointerdown', (e) => {
    if (!G || G.phase !== 'turn' || G.busy || P().bot || P().st.onGreen) return;
    const q = toBoard(e); G.ui.aim = { x: Math.round(q.x), y: Math.round(q.y) }; drawAll();
  });
  window.addEventListener('resize', () => { lastKey = ''; drawAll(); });

  // ------------------------------------------------------------ hole end, shop, end
  function coinsFor(diff) { const c = cfg.progression.coins; return diff <= -1 ? c.birdieOrBetter : diff === 0 ? c.par : diff === 1 ? c.bogey : c.worse; }
  function scoreName(d) { return d <= -3 ? 'ALBATROSS' : d === -2 ? 'EAGLE' : d === -1 ? 'BIRDIE' : d === 0 ? 'PAR' : d === 1 ? 'BOGEY' : d === 2 ? 'DOUBLE' : `+${d}`; }
  function endHole() {
    const par = parOf();
    G.holeResult = G.players.map((p) => {
      const strokes = p.st.holed ? p.st.strokes : cfg.rules.maxStrokesPerHole, diff = strokes - par, coins = coinsFor(diff);
      p.scores[G.hi] = strokes; p.coins += coins;
      return { p, strokes, diff, coins, tokens: p.tokenCoins || 0 };
    });
    G.phase = 'holeEnd';
    render();
  }
  // Pro shop: each human player gets 3 upgrade cards for sale (one may be on sale) and can reroll.
  function goShop() {
    for (const p of G.players) if (p.bot) botShop(p);
    const order = G.players.map((p, i) => i).filter((i) => !G.players[i].bot);
    G.shop = { order, idx: 0, offers: [] };
    if (!order.length) return nextHole();
    makeOffers();
    G.phase = 'shop'; render();
  }
  const shopper = () => G.players[G.shop.order[G.shop.idx]];
  function cost(p, id) { const t = p.tiers[id]; return t < E.MAX_TIER ? cfg.progression.tierCosts[t - 1] : null; }
  function makeOffers() {
    const p = shopper();
    const ids = bagIds().filter((id) => (id === 'putter' || E.isTierable(E.getClub(cfg, id))) && p.tiers[id] < E.MAX_TIER);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    G.shop.offers = ids.slice(0, 3).map((id) => ({ id, price: cost(p, id), was: null, sold: false }));
    if (G.shop.offers.length && Math.random() < 0.4) { const o = G.shop.offers[Math.floor(Math.random() * G.shop.offers.length)]; if (o.price > 1) { o.was = o.price; o.price -= 1; } }
  }
  function buyOffer(o) { const p = shopper(); if (o.sold || p.coins < o.price) return; p.coins -= o.price; p.tiers[o.id]++; o.sold = true; render(); }
  function reroll() { const p = shopper(); if (p.coins < 1) return; p.coins -= 1; makeOffers(); render(); }
  function leaveShop() { G.shop.idx++; if (G.shop.idx >= G.shop.order.length) return nextHole(); makeOffers(); render(); }
  function botShop(p) {
    const ids = bagIds().filter((id) => id === 'putter' || E.isTierable(E.getClub(cfg, id)));
    for (let guard = 0; guard < 30; guard++) {
      const opts = ids.filter((id) => cost(p, id) != null && cost(p, id) <= p.coins).sort((a, b) => p.tiers[a] - p.tiers[b] || (a === 'putter' ? -1 : 1));
      if (!opts.length) break;
      p.coins -= cost(p, opts[0]); p.tiers[opts[0]]++;
    }
  }
  function nextHole() { if (G.hi + 1 >= G.holes.length) { G.phase = 'end'; render(); return; } G.hi++; startHole(); }

  // ------------------------------------------------------------ gamble meters
  // A number line where each outcome's width is its probability. After the dice land, a gold arrow points at the result.
  const MW = 440, MX = 10, BW = 420;
  const SUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], pSum = (s2) => (6 - Math.abs(s2 - 7)) / 36;
  function layout(items) { let x = MX; return items.map((it) => { const w = it.p * BW, c = { ...it, x, w }; x += w; return c; }); }
  const PF = `font-family="'Press Start 2P', monospace"`;
  function meterSvg(cells, groups, arrow) {
    // cells: [{v, x, w, fill, ink, label}]; groups: [{x0, x1, text, color}] drawn under the bar; arrow: {final, key} or null
    let s = `<svg viewBox="0 0 ${MW} 74" xmlns="http://www.w3.org/2000/svg" ${PF}>`;
    s += `<rect x="${MX - 3}" y="19" width="${BW + 6}" height="30" fill="${PAL.ink}"/>`;
    for (const c of cells) {
      s += `<rect x="${f2(c.x)}" y="22" width="${f2(Math.max(1, c.w - 1))}" height="24" fill="${c.fill}"/>`;
      if (c.w >= 9) s += `<text x="${f2(c.x + c.w / 2)}" y="38" text-anchor="middle" font-size="${c.w >= 16 ? 8 : 6}" fill="${c.ink}">${c.label}</text>`;
    }
    for (const g of groups) {
      s += `<rect x="${f2(g.x0)}" y="51" width="${f2(Math.max(1, g.x1 - g.x0 - 1))}" height="3" fill="${g.color}"/>`;
      s += `<text x="${f2((g.x0 + g.x1) / 2)}" y="68" text-anchor="middle" font-size="7" fill="${g.color}">${g.text}</text>`;
    }
    if (arrow) {
      const x = arrow.start != null ? arrow.start : arrow.final;
      s += `<g class="arr" data-final="${f2(arrow.final)}" transform="translate(${f2(x)} 0)"><rect x="-6" y="1" width="12" height="4" fill="${PAL.ink}"/><rect x="-5" y="2" width="10" height="2" fill="${PAL.gold}"/>`;
      for (let k = 0; k < 5; k++) s += `<rect x="${-5 + k}" y="${5 + k * 2}" width="${10 - 2 * k}" height="2" fill="${k === 4 ? PAL.ink : PAL.gold}"/><rect x="${-6 + k}" y="${5 + k * 2}" width="1" height="2" fill="${PAL.ink}"/><rect x="${5 - k}" y="${5 + k * 2}" width="1" height="2" fill="${PAL.ink}"/>`;
      s += `<rect x="-1" y="15" width="2" height="8" fill="${PAL.ink}"/></g>`;
    }
    return s + '</svg>';
  }
  function zoneGroups(cells, fn) {
    const out = [];
    for (const c of cells) { const k = fn(c); const last = out[out.length - 1]; if (last && last.k === k.k) last.x1 = c.x + c.w; else out.push({ ...k, x0: c.x, x1: c.x + c.w }); }
    return out;
  }
  function arrowFor(cells, v, jitter, live) {
    const c = cells.find((q) => q.v === v);
    return { final: c.x + c.w * jitter, start: live ? MX + Math.random() * BW : null };
  }
  function meterBox(title, svgText, key) { return h('div', { class: 'meter', 'data-k': key }, h('div', { class: 'mlabel' }, title), h('div', { html: svgText })); }
  function metersFor(p) {
    const st = p.st, hole = H(), roll = G.phase !== 'turn' && !G.diceRolling ? G.lastRoll : null, live = false;
    const out = [];
    if (st.onGreen) {
      const ring = E.ringOf(hole, st), tier = p.tiers.putter;
      const choices = roll ? [roll.choice] : ring === 1 ? ['safe'] : ['safe', 'risky'];
      for (const k of choices) {
        const t = E.puttTarget(cfg, ring, k, tier), dest = k === 'safe' ? cfg.putting.safeMissTo[ring - 1] : cfg.putting.riskyMissTo;
        const inC = k === 'safe' ? '#3b5dc9' : '#b13e53';
        const cells = layout(SUMS.map((v) => ({ v, p: pSum(v), fill: v >= t ? inC : '#333c57', ink: v >= t ? '#fff' : '#94b0c2', label: v })));
        const pin = E.pAtLeast(t);
        const groups = zoneGroups(cells, (c) => (c.v >= t ? { k: 'in', text: `IN ${Math.round(pin * 100)}%`, color: inC === '#3b5dc9' ? '#73b7f2' : '#ff8a9a' } : { k: 'miss', text: ring === 1 ? 'AGAIN' : `MISS→RING ${dest}`, color: '#94b0c2' }));
        out.push(meterBox(`${k.toUpperCase()} · 2 DICE`, meterSvg(cells, groups, roll ? arrowFor(cells, roll.sum, roll.jitter[0], live) : null), 'putt'));
      }
      return out;
    }
    const club = E.getClub(cfg, G.ui.club);
    if (!club) return out;
    const tier = p.tiers[club.id] || 1, zi = (v) => E.zoneFor(cfg, v, tier, st.lie).idx;
    const dcells = layout(SUMS.map((v) => ({ v, p: pSum(v), fill: ZFILL[zi(v)], ink: zi(v) === 1 ? PAL.ink : '#fff', label: v })));
    const pOf = (i) => SUMS.filter((v) => zi(v) === i).reduce((a, v) => a + pSum(v), 0);
    const dgroups = zoneGroups(dcells, (c) => { const i = zi(c.v); return { k: i, text: `${E.clubDistance(cfg, club, c.v, G.ui.power, st.lie, tier)}YD ${Math.round(pOf(i) * 100)}%`, color: ZTXT[i] }; });
    const drop = (cfg.lieDrop || {})[st.lie] || 0;
    out.push(meterBox(`DISTANCE · ${club.name.toUpperCase()}${club.powers ? ' ' + Math.round(G.ui.power * 100) + '%' : ''}${drop ? ` · ${st.lie.toUpperCase()} −${drop} STEP${drop > 1 ? 'S' : ''}` : ''}`, meterSvg(dcells, dgroups, roll ? arrowFor(dcells, roll.sum, roll.jitter[0], live) : null), 'dist'));
    const fan = E.fanFor(cfg, club, tier), outer = Math.max(...fan.map(Math.abs)) || 1;
    const acol = (a) => dirCol(a, 15);
    const fcells = layout([1, 2, 3, 4, 5, 6].map((v) => ({ v, p: 1 / 6, fill: acol(fan[v - 1]), ink: PAL.ink, label: v })));
    const fgroups = zoneGroups(fcells, (c) => { const a = fan[c.v - 1]; return { k: a, text: a === 0 ? 'STRAIGHT' : `${a > 0 ? '+' : '−'}${Math.abs(a)}°`, color: acol(a) }; });
    out.push(meterBox('DIRECTION · RED DIE', meterSvg(fcells, fgroups, roll ? arrowFor(fcells, roll.dir, roll.jitter[1], live) : null), 'dir'));
    return out;
  }
  // ------------------------------------------------------------ club cards (pixel art) and the deck
  // 16×16 pixel icons: g = grip, s = shaft, h = head, l = head light, d = head dark, w = ball, y = sand
  const ICONS = {
    driver: ['..............gg', '.............gg.', '............s...', '...........s....', '..........s.....', '.........s......', '........s.......', '.......s........', '..hhhhhs........', '.hlllhhhh.......', 'hllhhhhhhh......', 'hhhhhhhhhh....ww', 'dhhhhhhhhd....ww', '.ddddddd........', '................', '................'],
    wood: ['..............gg', '.............gg.', '............s...', '...........s....', '..........s.....', '.........s......', '........s.......', '.......s........', '......s.........', '...hhhh.........', '..hllhhh........', '..hhhhhh.....ww.', '..dhhhhd.....ww.', '...dddd.........', '................', '................'],
    iron: ['..............gg', '.............gg.', '............s...', '...........s....', '..........s.....', '.........s......', '........s.......', '.......s........', '......s.........', '....hhs.........', '...hlhh.........', '..hlhhh......ww.', '..hhhhd......ww.', '..dddd..........', '................', '................'],
    punch: ['..............gg', '.............gg.', '............s...', '...........s....', '..........s.....', '.........s......', '........s.......', '.......s........', '......s.........', '....hhs.........', '...hlhh.........', '..hlhhh......ww.', '..hhhhd......ww.', '..dddd..........', '................', '................'],
    wedge: ['..............gg', '.............gg.', '............s...', '...........s....', '..........s.....', '.........s......', '........s.......', '.......s........', '.....hhs........', '....hlhh........', '...hlhhh.....ww.', '...hhhhh..y..ww.', '...hhhhd.y.y....', '.yyddddyyyyyyy..', 'yyyyyyyyyyyyyyyy', '................'],
    putter: ['.........gg.....', '.........gg.....', '.........s......', '.........s......', '.........s......', '.........s......', '.........s......', '.........s......', '.........s......', '.........s......', '...hhhhhhh......', '...hlllllh...ww.', '...ddddddd...ww.', '................', 'GGGGGGGGGG..oo..', '................'],
  };
  const ICOL = { driver: ['#3b5dc9', '#73b7f2', '#1f2f75'], wood: ['#a46422', '#e0a060', '#5e3412'], iron: ['#94b0c2', '#f4f4f4', '#566c86'], punch: ['#b55088', '#e8a0c8', '#6e2a52'], wedge: ['#94b0c2', '#f4f4f4', '#566c86'], putter: ['#94b0c2', '#f4f4f4', '#566c86'] };
  function iconSvg(id) {
    const k = kindOf(id), rows = ICONS[k] || ICONS.iron, [hc, lc, dc] = ICOL[k] || ICOL.iron;
    const col = { g: '#1a1c2c', s: '#c0c8d0', h: hc, l: lc, d: dc, w: '#f4f4f4', y: '#f2d58c', G: '#38b764', o: '#0f101a' };
    let s = '<svg viewBox="0 0 16 16" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">';
    rows.forEach((row, y) => { for (let x = 0; x < 16; x++) { const c = col[row[x]]; if (c) s += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; } });
    return s + '</svg>';
  }
  const inOn = (t) => (t <= 2 ? 'IN' : t > 12 ? '–' : t === 12 ? '12' : t + '+');
  // A card shows: name, picture, tier, a distance strip (2d6 2–12: short / on target / long) and a direction strip (d6: wide / slight / straight).
  function stripsEl(id, tier) {
    if (id === 'putter') return [h('div', { class: 'gstat' }, `RISKY ${inOn(E.puttTarget(cfg, 2, 'risky', tier))}`), h('div', { class: 'gstat' }, `SAFE ${inOn(E.puttTarget(cfg, 2, 'safe', tier))}`)];
    const c = E.getClub(cfg, id), fan = E.fanFor(cfg, c, tier);
    const d = SUMS.map((v) => `<rect x="${(v - 2) * 7}" y="0" width="6" height="7" fill="${ZFILL[E.zoneFor(cfg, v, tier, 'fairway').idx]}"/>`).join('');
    const f = fan.map((a, i) => `<rect x="${i * 13}" y="0" width="12" height="7" fill="${dirCol(a, 15)}"/>`).join('');
    return [h('div', { class: 'gyd' }, c.powers ? `${c.full} YD+` : `${c.full} YD`),
      h('div', { class: 'gstrip', html: `<svg viewBox="-1 -1 78 9" shape-rendering="crispEdges"><rect x="-1" y="-1" width="78" height="9" fill="#0f101a"/>${d}</svg>` }),
      h('div', { class: 'gstrip', html: `<svg viewBox="-1 -1 79 9" shape-rendering="crispEdges"><rect x="-1" y="-1" width="79" height="9" fill="#0f101a"/>${f}</svg>` })];
  }
  function cardEl(id, tier, opts) {
    opts = opts || {};
    const full = id === 'putter' ? 'PUTTER' : E.getClub(cfg, id).name.toUpperCase();
    const name = full.length > 9 ? full.split(' ')[0][0] + '. ' + full.split(' ').slice(-1)[0] : full; // "PITCHING WEDGE" -> "P. WEDGE"
    return h('div', { class: 'gcard' + (opts.sel ? ' sel' : '') + (opts.off ? ' off' : ''), style: `--tc:${TIERCOL[tier - 1]};${opts.style || ''}`, title: opts.title, onclick: opts.onclick },
      opts.badge ? h('div', { class: 'gbadge' }, opts.badge) : null,
      h('div', { class: 'gname' }, name), h('div', { class: 'gicon', html: iconSvg(id) }),
      h('div', { class: 'gpips' }, '■'.repeat(tier) + '□'.repeat(E.MAX_TIER - tier)),
      stripsEl(id, tier), h('div', { class: 'gtier' }, TIERNAME[tier - 1]));
  }
  const bagIds = () => [...cfg.clubs.filter((c) => c.enabled !== false).map((c) => c.id), 'putter'];
  function renderDeck() {
    const deck = document.getElementById('deck');
    if (!G) { deck.replaceChildren(h('div', { class: 'who' }, 'YOUR BAG'), h('div', { class: 'hand' }, bagIds().map((id, i, a) => cardEl(id, 1, { style: `transform: rotate(${(i - (a.length - 1) / 2) * 2.5}deg) translateY(${Math.abs(i - (a.length - 1) / 2) * 3}px)` })))); return; }
    const shopper = G.phase === 'shop' && G.shop ? G.players[G.shop.order[G.shop.idx]] : null;
    const p = shopper || P(), st = p.st, ids = bagIds(), n = ids.length;
    const myTurn = !shopper && G.phase === 'turn' && !p.bot && !G.busy;
    const cards = ids.map((id, i) => {
      const off = id === 'putter' ? !st.onGreen : st.onGreen || !E.clubAllowed(E.getClub(cfg, id), st.lie);
      const sel = !shopper && (id === 'putter' ? st.onGreen : G.ui.club === id);
      const fan = `transform: rotate(${(i - (n - 1) / 2) * 2.5}deg) translateY(${Math.abs(i - (n - 1) / 2) * 3}px)`;
      return cardEl(id, p.tiers[id], {
        sel: sel && !['holeEnd', 'shop', 'end'].includes(G.phase), off: !shopper && off && !['holeEnd', 'shop', 'end'].includes(G.phase), style: fan,
        onclick: myTurn && !off && id !== 'putter' ? () => pickClub(id) : null,
      });
    });
    deck.replaceChildren(h('div', { class: 'who' }, h('span', { class: 'dot', style: `background:${p.color};margin-right:8px;vertical-align:-3px` }), `${p.name}'S BAG`, h('br'), h('span', { class: 'coin' }, `$${p.coins}`)), h('div', { class: 'hand' }, cards));
  }

  // ------------------------------------------------------------ panel
  const clubList = () => cfg.clubs.filter((c) => c.enabled !== false);
  function pickClub(id, power) {
    const c = E.getClub(cfg, id);
    G.ui.club = id; G.ui.power = c && c.powers ? (power || (G.ui.club === id ? G.ui.power : 1)) : 1;
    render();
  }
  // The shared bag ruler: one mark per club (the Driver also has power marks). Tap a mark to pick that club.
  // The chosen club shows its short / on target / long ticks.
  function rulerFor(p) {
    const st = p.st, sel = E.getClub(cfg, G.ui.club), tier = p.tiers[sel.id] || 1;
    const W = 440, Hh = 112, F = `font-family="'Press Start 2P', monospace"`, maxYd = 270, X = (d) => Math.round(22 + (d / maxYd) * 404);
    const inks = ['#3b5dc9', '#0f101a', '#b13e53'];
    let s = `<svg viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" ${F}>`;
    s += `<rect width="${W}" height="${Hh}" fill="#0f101a"/><rect x="3" y="3" width="${W - 6}" height="${Hh - 6}" fill="#f4f4f4"/>`;
    s += `<rect x="18" y="48" width="${W - 26}" height="3" fill="#0f101a"/><rect x="17" y="43" width="12" height="12" fill="#0f101a"/><rect x="20" y="46" width="6" height="6" fill="#f4f4f4"/>`;
    for (let yd = 50; yd < maxYd; yd += 50) s += `<rect x="${X(yd)}" y="51" width="1" height="4" fill="#94b0c2"/>`;
    // selected club: short / on target / long ticks
    const ticks = [...new Set([2, 7, 12].map((v) => E.clubDistance(cfg, sel, v, G.ui.power, 'fairway', tier)))];
    [E.baseDistance(cfg, sel, G.ui.power) - cfg.notchYd, E.baseDistance(cfg, sel, G.ui.power), E.baseDistance(cfg, sel, G.ui.power) + cfg.notchYd].forEach((d, i) => {
      s += `<rect x="${X(d) - 1}" y="${i === 1 ? 30 : 36}" width="${i === 1 ? 4 : 3}" height="${i === 1 ? 18 : 12}" fill="${inks[i]}"/>`;
    });
    void ticks;
    // driver power marks (top row)
    const dr = cfg.clubs.find((c) => c.powers);
    if (dr) {
      const ok = E.clubAllowed(dr, st.lie);
      for (const pw of cfg.powerLevels.slice().sort((a, b) => a - b)) {
        const x = X(E.baseDistance(cfg, dr, pw)), on = sel.id === dr.id && G.ui.power === pw;
        s += `<g data-club="${ok ? dr.id : ''}" data-power="${pw}" style="cursor:${ok ? 'pointer' : 'not-allowed'}" opacity="${ok ? 1 : 0.25}">`;
        s += `<rect x="${x - 14}" y="8" width="28" height="16" fill="${on ? '#ffcd75' : KINDCOL.driver}"/><text x="${x}" y="20" text-anchor="middle" font-size="7" fill="${on ? '#0f101a' : '#fff'}">D${Math.round(pw * 100)}</text>`;
        s += `<rect x="${x}" y="24" width="1" height="24" fill="${KINDCOL.driver}"/></g>`;
      }
    }
    // every other club (bottom rows, alternating so labels don't overlap)
    cfg.clubs.filter((c) => !c.powers && c.enabled !== false).sort((a, b) => a.full - b.full).forEach((c, i) => {
      const x = X(c.full), ok = E.clubAllowed(c, st.lie), on = sel.id === c.id, y = i % 2 ? 76 : 58;
      s += `<g data-club="${ok ? c.id : ''}" style="cursor:${ok ? 'pointer' : 'not-allowed'}" opacity="${ok ? 1 : 0.25}">`;
      s += `<rect x="${x}" y="51" width="1" height="${y - 51}" fill="${KINDCOL[c.kind]}"/>`;
      s += `<rect x="${x - 12}" y="${y}" width="24" height="16" fill="${on ? '#ffcd75' : KINDCOL[c.kind]}"/><text x="${x}" y="${y + 12}" text-anchor="middle" font-size="7" fill="${on ? '#0f101a' : '#fff'}">${c.short}</text></g>`;
    });
    s += `<text x="${W - 10}" y="${Hh - 8}" text-anchor="end" font-size="7" fill="#566c86">${sel.name.toUpperCase()} ${E.baseDistance(cfg, sel, G.ui.power)}YD · SHORT/LONG ±${cfg.notchYd}</text>`;
    s += '</svg>';
    const box = h('div', { class: 'svgbox', html: s });
    box.addEventListener('click', (e) => {
      const t = e.target.closest('[data-club]');
      if (t && t.dataset.club && !G.busy && !P().bot && G.phase === 'turn') pickClub(t.dataset.club, t.dataset.power ? +t.dataset.power : null);
    });
    return box;
  }
  function ringPx(r) {
    const R = [3, 5, 7, 9];
    let s = `<svg viewBox="0 0 18 18" class="ringpx" shape-rendering="crispEdges">`;
    for (let k = 3; k >= 0; k--) s += `<rect x="${9 - R[k]}" y="${9 - R[k]}" width="${2 * R[k]}" height="${2 * R[k]}" fill="${k + 1 === r ? PAL.gold : k % 2 ? PAL.green : PAL.green2}"/>`;
    return s + `<rect x="8" y="8" width="2" height="2" fill="${PAL.ink}"/></svg>`;
  }
  // Pixel putter card: read your ring's row, then pick SAFE or RISKY.
  function putterCardFor(p) {
    const ring = E.ringOf(H(), p.st), tier = p.tiers.putter, P0 = cfg.putting, live = !p.bot && G.phase === 'turn';
    const inTxt = (t) => (t <= 2 ? 'IN' : t > 12 ? '–' : t === 12 ? '12' : t + '+');
    const cells = (r, k) => {
      if (k === 'risky' && r === 1) return [h('td', { colspan: 2, class: 'miss' }, 'SAFE ONLY')];
      const t = E.puttTarget(cfg, r, k, tier), dest = k === 'safe' ? P0.safeMissTo[r - 1] : P0.riskyMissTo;
      const pick = live && r === ring, cls = (c) => c + (pick ? ' pick' : '');
      const on = pick ? () => { if (!G.busy) takeShot(k); } : null;
      return [h('td', { class: cls('in ' + (k === 'safe' ? 's' : 'r')), onclick: on }, inTxt(t)),
        h('td', { class: cls('miss'), onclick: on }, t <= 2 ? '—' : r === 1 ? 'AGAIN' : `→ ${dest}`)];
    };
    return h('table', { class: 'pcard' },
      h('tr', null, h('th', null, ''), h('th', { colspan: 2, class: 's' }, 'SAFE'), h('th', { colspan: 2, class: 'r' }, 'RISKY')),
      h('tr', null, h('th', null, 'BALL IN'), h('th', null, 'IN ON'), h('th', null, 'MISS'), h('th', null, 'IN ON'), h('th', null, 'MISS')),
      [1, 2, 3, 4].map((r) => h('tr', { class: r === ring ? 'cur' : 'dim' }, h('td', { class: 'ring', html: `${ringPx(r)}RING ${r}` }), cells(r, 'safe'), cells(r, 'risky'))));
  }
  function scorecard() {
    const pars = G.prepped.map((hp) => E.parOf(hp, cfg));
    const tot = (p) => p.scores.reduce((a, b) => a + (b || 0), 0), totPar = (p) => p.scores.reduce((a, b, i) => a + (b ? pars[i] : 0), 0);
    const live = !['holeEnd', 'shop', 'end'].includes(G.phase);
    return h('div', { class: 'card' }, h('h2', null, 'SCORECARD'),
      h('table', null,
        h('tr', null, h('th', null, 'HOLE'), pars.map((_, i) => h('th', { class: i === G.hi ? 'cur' : '' }, i + 1)), h('th', null, 'TOT'), h('th', null, '$')),
        h('tr', null, h('td', { class: 'meta' }, 'Par'), pars.map((pp, i) => h('td', { class: 'meta' + (i === G.hi ? ' cur' : '') }, pp)), h('td', { class: 'meta' }, pars.reduce((a, b) => a + b, 0)), h('td', null, '')),
        G.players.map((p) => h('tr', null, h('td', null, h('span', { class: 'dot', style: `width:12px;height:12px;border-width:2px;background:${p.color};margin-right:6px;vertical-align:-1px` }), p.name),
          pars.map((_, i) => h('td', { class: i === G.hi ? 'cur' : '' }, p.scores[i] != null ? p.scores[i] : i === G.hi && live ? `(${p.st.strokes})` : '')),
          h('td', null, tot(p) ? `${tot(p)} (${tot(p) - totPar(p) >= 0 ? '+' : ''}${tot(p) - totPar(p)})` : '–'), h('td', { class: 'coin' }, p.coins)))));
  }
  function render() {
    document.getElementById('hdr').textContent = G ? `HOLE ${G.hi + 1}/${G.holes.length} · PAR ${parOf()} · ${Math.round(H().length)}YD` : '';
    if (!G) { renderSetup(); renderDeck(); drawAll(); return; }
    setView(targetVB());
    renderPanel();
  }
  function renderPanel() {
    renderDeck();
    const kids = [];
    if (G.phase === 'holeEnd') kids.push(renderHoleEnd());
    else if (G.phase === 'shop') kids.push(renderShop());
    else if (G.phase === 'end') kids.push(renderEnd());
    else kids.push(...renderTurn());
    kids.push(scorecard());
    panel.replaceChildren(...kids);
  }
  function renderTurn() {
    const p = P(), st = p.st, hole = H(), out = [];
    const lieName = st.onGreen ? `green · ring ${E.ringOf(hole, st)}` : st.lie;
    out.push(h('div', { class: 'card' },
      h('div', { class: 'player' }, h('span', { class: 'dot', style: `background:${p.color}` }),
        h('div', null, h('div', { class: 'pname' }, p.name + (p.bot ? ' [CPU]' : '')), h('div', { class: 'meta' }, `Stroke ${st.strokes + 1} · ${lieName} · ${Math.round(E.dist(st, hole.pin))} yd to the cup · `, h('span', { class: 'coin' }, `$${p.coins}`)))),
      h('div', { id: 'tray' },
        h('div', { id: 'dicebox' }, G.phase !== 'turn' && G.lastDice ? staticDice() : G.phase === 'turn' ? h('div', { class: 'hint' }, p.bot ? 'Thinking…' : st.onGreen ? 'Pick SAFE or RISKY' : 'Pick a club (card or ruler mark) · tap the course to aim · ROLL') : null),
        metersFor(p)),
      G.lastExplain && G.phase !== 'turn' ? h('div', { class: 'explain' }, G.lastExplain.map((t) => h('div', { class: 'chip', html: t }))) : null));
    if (st.onGreen) {
      out.push(h('div', { class: 'card' }, h('h2', null, `PUTTER T${p.tiers.putter} · RING ${E.ringOf(hole, st)}`), putterCardFor(p),
        G.botChoice ? h('div', { class: 'chip', style: 'margin-top:8px' }, `${p.name} goes ${G.botChoice.toUpperCase()}`) : null,
        !p.bot && G.phase === 'turn' ? h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { class: 'big', style: 'background:var(--safe);color:#fff', onclick: () => takeShot('safe') }, 'SAFE'),
          E.ringOf(hole, st) > 1 ? h('button', { class: 'big', style: 'background:var(--risky);color:#fff', onclick: () => takeShot('risky') }, 'RISKY') : null) : null));
    } else {
      out.push(h('div', { class: 'card' },
        G.ui.club ? [h('h2', null, `BAG RULER · ${E.getClub(cfg, G.ui.club).name.toUpperCase()}${E.getClub(cfg, G.ui.club).powers ? ' ' + Math.round(G.ui.power * 100) + '%' : ''}`), rulerFor(p)] : h('h2', null, 'PICK A CLUB CARD BELOW'),
        (cfg.lieDrop || {})[st.lie] ? h('div', { class: 'hint' }, `In the ${st.lie}: your result drops ${cfg.lieDrop[st.lie]} step${cfg.lieDrop[st.lie] > 1 ? 's' : ''} (long → on target → short).`) : null,
        h('div', { class: 'row', style: 'margin-top:12px' },
          h('button', { class: 'big', disabled: p.bot || G.phase !== 'turn' || !G.ui.club, onclick: () => takeShot() }, 'ROLL!'),
          G.ui.aim ? h('button', { disabled: p.bot, onclick: () => { G.ui.aim = null; render(); } }, 'AIM AT FLAG') : h('span', { class: 'hint' }, 'aiming at the flag'),
          h('label', { class: 'hint' }, h('input', { type: 'checkbox', checked: G.ui.cloud, onchange: (e) => { G.ui.cloud = e.target.checked; drawAll(); } }), ' show landing spots'))));
    }
    return out;
  }
  function renderHoleEnd() {
    return h('div', { class: 'card' }, h('h2', null, `HOLE ${G.hi + 1} COMPLETE · PAR ${parOf()}`),
      h('table', null, h('tr', null, h('th', null, 'PLAYER'), h('th', null, 'SHOTS'), h('th', null, ''), h('th', null, 'SCORE $'), h('th', null, 'TOKENS $')),
        G.holeResult.map((r) => h('tr', null, h('td', null, r.p.name), h('td', null, r.strokes), h('td', null, scoreName(r.diff)), h('td', { class: 'coin' }, `+${r.coins}`), h('td', { class: 'coin' }, r.tokens ? `+${r.tokens}` : '–')))),
      h('div', { class: 'hint', style: 'margin-top:8px' }, `Birdie ${cfg.progression.coins.birdieOrBetter} · par ${cfg.progression.coins.par} · bogey ${cfg.progression.coins.bogey} · plus coins picked up on the course.`),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'big', onclick: goShop }, 'PRO SHOP ›')));
  }
  function renderShop() {
    const p = shopper();
    return h('div', null,
      h('div', { class: 'card' },
        h('div', { class: 'player' }, h('span', { class: 'dot', style: `background:${p.color}` }), h('div', { class: 'pname' }, `${p.name}'S SHOP`), h('div', { class: 'pname coin', style: 'margin-left:auto' }, `$${p.coins}`)),
        h('div', { class: 'offers' }, G.shop.offers.length ? G.shop.offers.map((o) => h('div', { class: 'offer' },
          o.sold ? h('div', { class: 'gcard off', style: `--tc:#333c57` }, h('div', { class: 'sold', style: 'margin-top:50px' }, 'SOLD')) : cardEl(o.id, p.tiers[o.id] + 1, { badge: o.was ? 'SALE' : `T${p.tiers[o.id] + 1}` }),
          o.sold ? h('div', { class: 'price' }, ' ') : h('div', { class: 'price' }, o.was ? h('s', null, `$${o.was}`) : null, `$${o.price}`),
          o.sold ? null : h('button', { class: 'big', disabled: p.coins < o.price, onclick: () => buyOffer(o) }, 'BUY'))) : h('div', { class: 'hint' }, 'Your bag is maxed out!')),
        h('div', { class: 'row', style: 'justify-content:center;margin-top:6px' },
          h('button', { disabled: p.coins < 1, onclick: reroll }, 'REROLL $1'),
          h('button', { class: 'big', onclick: leaveShop }, G.shop.idx + 1 < G.shop.order.length ? 'NEXT PLAYER ›' : G.hi + 1 >= G.holes.length ? 'RESULTS ›' : `TEE OFF HOLE ${G.hi + 2} ›`)),
        h('div', { class: 'hint', style: 'margin-top:8px;text-align:center' }, 'Buying a card upgrades that club in your bag below. CPU players shop on their own.')));
  }
  function renderEnd() {
    const pars = G.prepped.map((hp) => E.parOf(hp, cfg)), totPar = pars.reduce((a, b) => a + b, 0);
    const ranked = G.players.map((p) => ({ p, tot: p.scores.reduce((a, b) => a + b, 0) })).sort((a, b) => a.tot - b.tot);
    return h('div', { class: 'card' }, h('h2', null, 'FINAL RESULTS'),
      h('div', { class: 'pname coin', style: 'margin:6px 0 12px' }, `★ ${ranked[0].p.name} WINS! ★`),
      h('table', null, ranked.map((r, i) => h('tr', null, h('td', null, `${i + 1}. ${r.p.name}`), h('td', null, r.tot), h('td', null, `${r.tot - totPar >= 0 ? '+' : ''}${r.tot - totPar}`)))),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'big', onclick: () => { G = null; render(); } }, 'PLAY AGAIN')));
  }
  function renderSetup() {
    panel.replaceChildren(h('div', { class: 'card' }, h('h2', null, 'NEW GAME'),
      h('div', { class: 'row' }, h('span', { class: 'meta' }, 'Players'), [1, 2, 3, 4].map((n) => h('button', { class: setup.n === n ? 'on' : '', onclick: () => { setup.n = n; render(); } }, n))),
      Array.from({ length: setup.n }, (_, i) => h('div', { class: 'row' },
        h('span', { class: 'dot', style: `background:${PCOL[i]}` }),
        h('input', { type: 'text', value: setup.names[i], oninput: (e) => { setup.names[i] = e.target.value; } }),
        h('button', { class: !setup.bot[i] ? 'on' : '', onclick: () => { setup.bot[i] = false; render(); } }, 'HUMAN'),
        h('button', { class: setup.bot[i] ? 'on' : '', onclick: () => { setup.bot[i] = true; render(); } }, 'CPU'))),
      h('div', { class: 'row' }, h('span', { class: 'meta' }, 'Holes'), [3, 6, 9].map((n) => h('button', { class: setup.holes === n ? 'on' : '', onclick: () => { setup.holes = n; render(); } }, n))),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'big', onclick: newGame }, 'TEE OFF!'))),
      h('div', { class: 'card' }, h('h2', null, 'HOW TO PLAY'),
        h('div', null, '1. Pick a club, tap a power mark on its ruler, tap the course to aim.'),
        h('div', null, '2. ROLL: white dice pick the distance tick (short / middle / long), the red die picks the fan line.'),
        h('div', null, '3. On the green, tap SAFE or RISKY on your putter card.'),
        h('div', null, '4. Stop on a gold coin to grab it. Spend coins in the pro shop between holes.'),
        h('div', null, '5. Furthest from the cup plays next. Lowest total wins.')));
  }

  window.__game = { get G() { return G; }, setup, newGame, takeShot, render, terrain: () => terrainSvg(view()), fast(v) { if (G) G.fast = v; } };
  render();
})();
