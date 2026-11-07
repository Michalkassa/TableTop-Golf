/* Tabletop Golf — rules engine, bots, simulation, course generator.
 * Pure JS, no DOM. Loaded by index.html and by test-engine.js (node). */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- config
  const DEFAULT_CONFIG = {
    version: '2.2',
    board: { w: 340, h: 460 },
    rulerStepYd: 5,
    // CLUB SYSTEM v2. Each club hits one fixed distance; only the Driver has power levels.
    powerLevels: [1, 0.75, 0.5, 0.25], // Driver only
    notchYd: 10,                        // a SHORT result is one notch before the club's mark, LONG one notch past
    // Distance strip per tier: [short if 2d6 <= a, long if 2d6 >= b], on target in between. Upgrades widen "on target".
    tierStrips: [[4, 10], [3, 11], [3, 11], [2, 12], [2, 12]],
    // Lie penalty: the result drops this many steps (long -> on target -> short).
    lieDrop: { tee: 0, fairway: 0, rough: 1, bunker: 2, trees: 2 },
    clubs: [
      { id: 'driver', name: 'Driver', short: 'DR', kind: 'driver', full: 250, powers: true, allowedLies: ['tee'] },
      { id: 'w3', name: '3 Wood', short: '3W', kind: 'wood', full: 220, allowedLies: ['tee', 'fairway', 'rough'] },
      { id: 'w5', name: '5 Wood', short: '5W', kind: 'wood', full: 200, allowedLies: ['tee', 'fairway', 'rough'] },
      { id: 'i4', name: '4 Iron', short: '4i', kind: 'iron', full: 180, allowedLies: ['tee', 'fairway', 'rough', 'trees'] },
      { id: 'i5', name: '5 Iron', short: '5i', kind: 'iron', full: 170, allowedLies: ['tee', 'fairway', 'rough', 'trees'] },
      { id: 'i6', name: '6 Iron', short: '6i', kind: 'iron', full: 160, allowedLies: ['tee', 'fairway', 'rough', 'trees'] },
      { id: 'i7', name: '7 Iron', short: '7i', kind: 'iron', full: 150, allowedLies: ['tee', 'fairway', 'rough', 'trees'] },
      { id: 'i8', name: '8 Iron', short: '8i', kind: 'iron', full: 140, allowedLies: ['tee', 'fairway', 'rough', 'trees'] },
      { id: 'i9', name: '9 Iron', short: '9i', kind: 'iron', full: 130, allowedLies: ['tee', 'fairway', 'rough', 'bunker', 'trees'] },
      { id: 'pw', name: 'Pitching Wedge', short: 'PW', kind: 'wedge', full: 115, allowedLies: ['tee', 'fairway', 'rough', 'bunker', 'trees'] },
      { id: 'sw', name: 'Sand Wedge', short: 'SW', kind: 'wedge', full: 90, allowedLies: ['tee', 'fairway', 'rough', 'bunker', 'trees'] },
      { id: 'lw', name: 'Lob Wedge', short: 'LW', kind: 'wedge', full: 40, allowedLies: ['tee', 'fairway', 'rough', 'bunker', 'trees'] },
    ],
    // Direction is a 2d6 roll too (two red dice). fans[tier] = angle for red totals 2..12 (11 entries).
    // Bell curve: most rolls go straight. Upgrades widen the straight band and remove wide misses.
    fans: {
      1: [-15, -6, -6, 0, 0, 0, 0, 0, 6, 6, 15],
      2: [-15, -6, -6, 0, 0, 0, 0, 0, 6, 6, 15],
      3: [-6, -6, 0, 0, 0, 0, 0, 0, 0, 6, 6],
      4: [-6, -6, 0, 0, 0, 0, 0, 0, 0, 6, 6],
      5: [-6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6],
    },
    // Ring putting on flat green tiles. The ring the ball is in sets the putt.
    // SAFE: small chance to hole, a miss leaves the ball in ring 1.
    // RISKY: bigger chance to hole, a miss leaves the ball in ring 2.
    putting: {
      safe: [3, 11, 12, 13],      // 2d6 needed to hole with SAFE from ring 1..4 at putter tier 1 (13 = can't go in)
      risky: [0, 7, 9, 11],       // 2d6 needed with RISKY from ring 1..4 (ring 1 is SAFE only)
      safeMissTo: [1, 1, 1, 2],   // SAFE miss from ring 1..4 → this ring (ring 4 is a long putt: back to ring 2)
      riskyMissTo: 2,
      // How much lower the numbers are at putter tier 1..5. Upgrades alternate: RISKY at tiers 2 and 4, SAFE at 3 and 5.
      riskyBonus: [0, 1, 1, 2, 2],
      safeBonus: [0, 0, 1, 1, 2],
      cupRadius: 1,               // a long shot finishing this close is holed
    },
    penalties: { ob: 1, water: 1 },
    par: { par3Below: 250, par4Below: 470 },
    progression: { coins: { birdieOrBetter: 5, par: 3, bogey: 2, worse: 1 }, tierCosts: [1, 2, 2, 3] },
    // Coin tokens on the course: stop your ball on one (within radius) to take it.
    coinTokens: { perHole: 3, radius: 15, riskyValue: 2, value: 1 }, // 15 yd = 3 cm disc
    rules: {
      // 'stacking': the felt piece on top wins (physical). 'priority': water > bunker > trees > green > fairway.
      lieMode: 'stacking',
      treesBlockLine: true,
      maxStrokesPerHole: 12,
    },
    playtime: { secPerLongShot: 40, secPerPutt: 20 },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const MAX_TIER = 5;

  // ------------------------------------------------------------------- rng
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const d6 = (rng) => 1 + Math.floor(rng() * 6);

  // -------------------------------------------------------------- geometry
  const LIE_KINDS = ['water', 'bunker', 'trees', 'green', 'fairway']; // priority order
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function prepShape(s) {
    const r = (-(s.rotation || 0) * Math.PI) / 180;
    return Object.assign({}, s, {
      _c: Math.cos(r), _s: Math.sin(r),
      _irx2: 1 / (s.rx * s.rx), _iry2: 1 / (s.ry * s.ry),
      _R: Math.max(s.rx, s.ry),
    });
  }
  function inShape(p, x, y) {
    const dx = x - p.cx, dy = y - p.cy;
    const lx = dx * p._c - dy * p._s, ly = dx * p._s + dy * p._c;
    return lx * lx * p._irx2 + ly * ly * p._iry2 <= 1;
  }

  // ------------------------------------------------------------ green tiles
  // Flat green tiles with putting rings drawn around a fixed cup. Units: yards, tile-local coordinates.
  // rings = outer radius of ring 1, 2 and 3; ring 4 is the rest of the green.
  const GREEN_TILES = [
    { id: 'round', name: 'Round', difficulty: 1, parts: [{ x: 0, y: 0, rx: 20, ry: 20 }], cup: { x: 0, y: 0 }, rings: [5, 10, 15] },
    { id: 'oval', name: 'Big oval', difficulty: 1, parts: [{ x: 0, y: 0, rx: 28, ry: 18 }], cup: { x: 0, y: 0 }, rings: [5, 11, 17] },
    { id: 'long', name: 'Long & narrow', difficulty: 2, parts: [{ x: 0, y: 0, rx: 30, ry: 10 }], cup: { x: 17, y: 0 }, rings: [4, 8, 13] },
    { id: 'banana', name: 'Banana', difficulty: 2, parts: [{ x: -15, y: 5, rx: 11, ry: 9, rot: -25 }, { x: 0, y: -1, rx: 12, ry: 10 }, { x: 15, y: 5, rx: 11, ry: 9, rot: 25 }], cup: { x: 15, y: 5 }, rings: [4, 9, 14] },
    { id: 'dogleg', name: 'Dogleg', difficulty: 3, parts: [{ x: -8, y: 7, rx: 17, ry: 8 }, { x: 7, y: -6, rx: 8, ry: 17 }], cup: { x: 8, y: -15 }, rings: [4, 8, 13] },
    { id: 'peanut', name: 'Peanut', difficulty: 3, parts: [{ x: -10, y: 0, rx: 13, ry: 12 }, { x: 11, y: 1, rx: 9, ry: 8 }], cup: { x: 13, y: 1 }, rings: [3, 7, 11] },
    { id: 'small', name: 'Small round', difficulty: 3, parts: [{ x: 0, y: 0, rx: 13, ry: 13 }], cup: { x: 4, y: -3 }, rings: [3, 6, 10] },
  ];
  const DEFAULT_RINGS = [4, 9, 14];
  const getTile = (id) => GREEN_TILES.find((t) => t.id === id) || GREEN_TILES[0];
  function tileXf(s, x, y) {
    const a = ((s.rotation || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    return { x: s.cx + x * c - y * sn, y: s.cy + x * sn + y * c };
  }
  // World-space ellipses and cup for a green-tile shape.
  function tileParts(s) {
    const t = getTile(s.tile);
    return t.parts.map((p, i) => { const c = tileXf(s, p.x, p.y); return { id: s.id + ':' + i, kind: 'green', cx: c.x, cy: c.y, rx: p.rx, ry: p.ry, rotation: (p.rot || 0) + (s.rotation || 0) }; });
  }
  const tileCup = (s) => tileXf(s, getTile(s.tile).cup.x, getTile(s.tile).cup.y);

  function prepHole(hole) {
    const H = { w: hole.board.w, h: hole.board.h, kinds: {}, stack: [], tee: null, pin: null, rings: DEFAULT_RINGS, tile: null, hole };
    for (const k of LIE_KINDS) H.kinds[k] = [];
    let pinShape = null;
    for (const s of hole.shapes) {
      if (s.kind === 'tee') H.tee = { x: s.cx, y: s.cy };
      else if (s.kind === 'pin') pinShape = { x: s.cx, y: s.cy };
      else if (s.kind === 'green' && s.tile) {
        for (const part of tileParts(s)) { const p = prepShape(part); H.kinds.green.push(p); H.stack.push(p); }
        if (!H.tile) { H.tile = s; H.pin = tileCup(s); H.rings = getTile(s.tile).rings; }
      } else if (H.kinds[s.kind]) { const p = prepShape(s); H.kinds[s.kind].push(p); H.stack.push(p); }
    }
    H.stack.reverse(); // topmost first
    if (!H.pin) H.pin = pinShape;
    if (!H.tee) H.tee = { x: H.w / 2, y: H.h - 20 };
    if (!H.pin) H.pin = { x: H.w / 2, y: 20 };
    H.length = dist(H.tee, H.pin);
    return H;
  }
  const offBoard = (H, x, y) => x < 0 || y < 0 || x > H.w || y > H.h;
  function inKind(H, k, x, y) {
    for (const s of H.kinds[k]) if (inShape(s, x, y)) return true;
    return false;
  }
  let _lieMode = 'stacking';
  function lieAt(H, x, y) {
    if (offBoard(H, x, y)) return 'ob';
    if (_lieMode === 'stacking') {
      for (const s of H.stack) if (inShape(s, x, y)) return s.kind;
      return 'rough';
    }
    for (const k of LIE_KINDS) if (inKind(H, k, x, y)) return k;
    return 'rough';
  }
  const setLieMode = (cfg) => { _lieMode = (cfg.rules && cfg.rules.lieMode) || 'priority'; };
  function parOf(H, cfg) {
    if (H.hole.parOverride) return H.hole.parOverride;
    const d = H.length;
    return d < cfg.par.par3Below ? 3 : d < cfg.par.par4Below ? 4 : 5;
  }

  // ----------------------------------------------------------------- rules
  const roundStep = (v, s) => (s > 0 ? Math.round(v / s) * s : v);
  const getClub = (cfg, id) => cfg.clubs.find((c) => c.id === id);
  // ---- v2 distance: club mark ± one notch, chosen by the card's distance strip
  const ZONE_LABELS = ['Short', 'On target', 'Long'];
  const maxPower = () => 1; // v2: no power caps by lie
  const powersFor = (cfg, lie, club) => (club && club.powers ? cfg.powerLevels.slice() : [1]);
  function zonesFor(cfg, tier) {
    const [a, b] = cfg.tierStrips[Math.min(5, tier || 1) - 1];
    return [{ idx: 0, from: 2, to: a, label: 'Short' }, { idx: 1, from: a + 1, to: b - 1, label: 'On target' }, { idx: 2, from: b, to: 12, label: 'Long' }];
  }
  function zoneFor(cfg, pips, tier, lie) {
    const zs = zonesFor(cfg, tier), raw = zs.find((z) => pips >= z.from && pips <= z.to) || zs[1];
    const drop = (cfg.lieDrop && cfg.lieDrop[lie]) || 0, idx = Math.max(0, raw.idx - drop);
    return { idx, raw: raw.idx, drop, from: raw.from, to: raw.to, label: ZONE_LABELS[idx] };
  }
  const zoneOf = (cfg, pips) => zoneFor(cfg, pips, 1, 'fairway');
  const baseDistance = (cfg, club, power) => (club.powers ? roundStep(club.full * (power || 1), 5) : club.full);
  const clubFull = (club) => club.full;
  const clubAllowed = (club, lie) => club.enabled !== false && club.allowedLies.includes(lie);
  const allowedClubs = (cfg, lie) => cfg.clubs.filter((c) => clubAllowed(c, lie));
  const isTierable = () => true;
  function clubDistance(cfg, club, pips, power, lie, tier) {
    const z = zoneFor(cfg, pips, tier, lie);
    return Math.max(0, baseDistance(cfg, club, power) + (z.idx - 1) * cfg.notchYd);
  }
  const fanFor = (cfg, club, tier) => cfg.fans[Math.min(5, tier || 1)];
  // Same formula as clubDistance, but returns every intermediate number (for explaining a shot).
  function shotCalc(cfg, club, pips, power, lie, tier) {
    const zone = zoneFor(cfg, pips, tier, lie), base = baseDistance(cfg, club, power);
    return { base, full: base, bonus: 0, tier: tier || 1, pips, power: club.powers ? power : 1, zone, lie, notch: cfg.notchYd, raw: base, step: cfg.notchYd, rounded: Math.max(0, base + (zone.idx - 1) * cfg.notchYd) };
  }


  const SUM_PROBS = [];
  for (let s = 2; s <= 12; s++) SUM_PROBS.push({ sum: s, p: (6 - Math.abs(s - 7)) / 36 });

  const _fgCache = new Map();
  function faceGroups(fan) {
    const key = fan.join(',');
    let g = _fgCache.get(key);
    if (g) return g;
    const m = new Map();
    // 11 entries = 2d6 totals 2..12 (bell curve); 6 entries = one die (legacy configs)
    const two = fan.length === 11;
    fan.forEach((a, i) => {
      if (!m.has(a)) m.set(a, { angle: a, faces: [], p: 0 });
      const e = m.get(a), face = two ? i + 2 : i + 1;
      e.faces.push(face); e.p += two ? (6 - Math.abs(face - 7)) / 36 : 1 / 6;
    });
    g = [...m.values()].sort((a, b) => a.angle - b.angle);
    _fgCache.set(key, g);
    return g;
  }

  // Returns distance along the line where trees stop the ball, or -1.
  function treeBlock(H, from, ux, uy, len, startInTrees) {
    const trees = H.kinds.trees;
    if (!trees.length) return -1;
    let near = false;
    for (const s of trees) {
      const t = Math.max(0, Math.min(len, (s.cx - from.x) * ux + (s.cy - from.y) * uy));
      if (Math.hypot(from.x + ux * t - s.cx, from.y + uy * t - s.cy) <= s._R) { near = true; break; }
    }
    if (!near) return -1;
    const step = 2;
    let escaping = startInTrees;
    for (let t = step; t <= len; t += step) {
      const x = from.x + ux * t, y = from.y + uy * t;
      const inT = _lieMode === 'stacking' ? lieAt(H, x, y) === 'trees' : inKind(H, 'trees', x, y);
      if (escaping) { if (!inT) escaping = false; continue; }
      if (inT) return t;
    }
    return -1;
  }

  // Resolve where a ball comes to rest at `end` after being played from `from`.
  function settle(H, cfg, from, end, info) {
    setLieMode(cfg);
    const lie = lieAt(H, end.x, end.y);
    const r = Object.assign({}, info, {
      landing: end, landLie: lie, penalty: 0, x: end.x, y: end.y, lie, onGreen: false, holed: false, drop: null,
    });
    if (lie === 'ob') {
      r.penalty = cfg.penalties.ob;
      r.x = from.x; r.y = from.y; r.lie = from.lie; r.onGreen = !!from.onGreen;
      return r;
    }
    if (lie === 'water') {
      r.penalty = cfg.penalties.water;
      const L = dist(from, end);
      const bx = (from.x - end.x) / L, by = (from.y - end.y) / L;
      let x = end.x, y = end.y, moved = 0, found = false;
      while (moved < L) {
        x += bx; y += by; moved += 1;
        const l = lieAt(H, x, y);
        if (l !== 'water' && l !== 'ob') { found = true; break; }
      }
      if (!found) { x = from.x; y = from.y; r.lie = from.lie; } else r.lie = lieAt(H, x, y);
      r.x = x; r.y = y; r.drop = { x, y };
    }
    if (r.lie === 'green') r.onGreen = true;
    if (r.penalty === 0 && dist(r, H.pin) <= cfg.putting.cupRadius) r.holed = true;
    return r;
  }

  function flyShot(H, cfg, from, clubId, power, aim, tier, pips, angle) {
    setLieMode(cfg);
    const club = getClub(cfg, clubId);
    const d = clubDistance(cfg, club, pips, power, from.lie, tier);
    let hx = aim.x - from.x, hy = aim.y - from.y;
    if (hx === 0 && hy === 0) { hx = H.pin.x - from.x; hy = H.pin.y - from.y; }
    const a = Math.atan2(hy, hx) + (angle * Math.PI) / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const intended = { x: from.x + ux * d, y: from.y + uy * d };
    let end = intended, blocked = false;
    if (cfg.rules.treesBlockLine && d > 0) {
      const t = treeBlock(H, from, ux, uy, d, from.lie === 'trees');
      if (t >= 0) { end = { x: from.x + ux * t, y: from.y + uy * t }; blocked = true; }
    }
    return settle(H, cfg, from, end, { distance: d, pips, angle, intended, blocked });
  }

  // ---------------------------------------------------------- ring putting
  function ringOf(H, p) {
    const d = dist(p, H.pin), R = H.rings;
    return d <= R[0] ? 1 : d <= R[1] ? 2 : d <= R[2] ? 3 : 4;
  }
  const pAtLeast = (k) => { let p = 0; for (const sp of SUM_PROBS) if (sp.sum >= k) p += sp.p; return p; };
  // 2d6 needed to hole; choice 'safe' or 'risky'.
  function puttTarget(cfg, ring, choice, tier) {
    const P = cfg.putting, list = choice === 'risky' ? P.risky : P.safe;
    const bonus = (choice === 'risky' ? P.riskyBonus : P.safeBonus)[Math.min(tier || 1, 5) - 1] || 0;
    return list[ring - 1] - bonus;
  }
  // Put the ball in the middle of a ring band, on the same side as `from` (side 1) or past the cup (side -1).
  function placeInRing(H, from, ring, side) {
    const R = H.rings;
    const inner = ring === 1 ? 0 : R[ring - 2], outer = ring === 4 ? R[2] + 6 : R[ring - 1];
    const radii = ring === 4 ? [(inner + outer) / 2, inner + 1.5] : [(inner + outer) / 2];
    let ux = from.x - H.pin.x, uy = from.y - H.pin.y;
    const L = Math.hypot(ux, uy) || 1;
    let a0 = Math.atan2(uy / L, ux / L) + (side < 0 ? Math.PI : 0);
    if (L < 1e-6) a0 = Math.PI / 2;
    const offs = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3, 1.8, -1.8, 2.4, -2.4, Math.PI];
    for (const r of radii) for (const o of offs) {
      const x = H.pin.x + Math.cos(a0 + o) * r, y = H.pin.y + Math.sin(a0 + o) * r;
      if (lieAt(H, x, y) === 'green') return { x, y };
    }
    return { x: from.x, y: from.y };
  }
  // choice: 'safe' or 'risky'. sum = 2d6 total.
  function resolvePutt(H, cfg, from, choice, tier, sum) {
    setLieMode(cfg);
    const ring = ringOf(H, from), P = cfg.putting;
    if (choice !== 'safe' && choice !== 'risky') choice = choice === 'go' ? 'risky' : 'safe';
    if (ring === 1) choice = 'safe';
    const target = puttTarget(cfg, ring, choice, tier);
    const holed = sum >= target;
    const dest = holed ? null : choice === 'safe' ? P.safeMissTo[ring - 1] : P.riskyMissTo;
    const side = choice === 'risky' ? -1 : 1; // a risky miss rolls past the cup
    const end = holed ? { x: H.pin.x, y: H.pin.y } : dest === ring && choice === 'safe' ? { x: from.x, y: from.y } : placeInRing(H, from, dest, side);
    return {
      putt: true, choice, ring, target, sum, destRing: dest, holed,
      distance: dist(from, end), angle: 0, intended: end, blocked: false,
      landing: end, landLie: 'green', penalty: 0, x: end.x, y: end.y, lie: 'green', onGreen: true, drop: null,
    };
  }
  // Expected putts from each ring (optimal choices) and the best choice per ring.
  function ringValues(cfg, tier) {
    const P = cfg.putting, E = [0, 1, 1, 1, 1], best = [null, 'safe', 'safe', 'safe', 'safe'];
    const p = (r, c) => pAtLeast(puttTarget(cfg, r, c, tier));
    for (let it = 0; it < 300; it++) {
      for (let r = 1; r <= 4; r++) {
        const safe = 1 + (1 - p(r, 'safe')) * E[P.safeMissTo[r - 1]];
        const risky = r === 1 ? Infinity : 1 + (1 - p(r, 'risky')) * E[P.riskyMissTo];
        E[r] = Math.min(safe, risky, 30); best[r] = risky < safe ? 'risky' : 'safe';
      }
    }
    return { E, best, safe: [0, 1, 2, 3, 4].map((r) => (r ? p(r, 'safe') : 0)), risky: [0, 1, 2, 3, 4].map((r) => (r > 1 ? p(r, 'risky') : 0)) };
  }


  function startState(H) {
    return { x: H.tee.x, y: H.tee.y, lie: 'tee', onGreen: false, holed: false, strokes: 0, putts: 0 };
  }

  // decision = { club, power, aim:{x,y} } (ignored on the green); dice = { d1, d2, dir }
  function playShot(H, cfg, state, decision, tiers, dice) {
    const sum = dice.d1 + dice.d2;
    let r;
    if (state.onGreen) {
      const tier = tiers.putter || 1;
      r = resolvePutt(H, cfg, state, (decision && decision.putt) || 'safe', tier, sum);
      r.club = 'putter'; r.tier = tier;
    } else {
      const club = getClub(cfg, decision.club);
      if (!club || !clubAllowed(club, state.lie)) throw new Error(`${decision.club} not allowed from ${state.lie}`);
      if (!club.powers) decision = Object.assign({}, decision, { power: 1 });
      const tier = isTierable(club) ? tiers[club.id] || 1 : 1;
      const fan = fanFor(cfg, club, tier);
      r = flyShot(H, cfg, state, club.id, decision.power, decision.aim, tier, sum, fan[dice.dir - (fan.length === 11 ? 2 : 1)]);
      r.club = club.id; r.power = decision.power; r.aim = decision.aim; r.tier = tier;
      r.calc = shotCalc(cfg, club, sum, decision.power, state.lie, tier);
      r.faces = faceGroups(fan).find((g) => g.angle === r.angle).faces;
    }
    r.dice = dice;
    r.from = { x: state.x, y: state.y, lie: state.lie, onGreen: state.onGreen };
    const ns = Object.assign({}, state, {
      x: r.x, y: r.y, lie: r.lie, onGreen: r.onGreen, holed: r.holed,
      strokes: state.strokes + 1 + r.penalty,
      putts: state.putts + (state.onGreen ? 1 : 0),
    });
    return { state: ns, result: r };
  }

  // ------------------------------------------------------------------ bots
  const LIE_DIFF = { tee: 0, fairway: 0, rough: 0.08, bunker: 0.2, trees: 0.3, green: 0 };

  // Heuristic value function V = expected strokes to hole out.
  function botContext(cfg, tiers) {
    const RV = ringValues(cfg, tiers.putter || 1), RE = RV.E;
    const R = {};
    for (const lie of ['tee', 'fairway', 'rough', 'bunker', 'trees']) {
      let best = 0;
      for (const c of allowedClubs(cfg, lie)) {
        best = Math.max(best, clubDistance(cfg, c, 7, maxPower(cfg, lie), lie, isTierable(c) ? tiers[c.id] || 1 : 1));
      }
      R[lie] = best || 30;
    }
    const Rfw = R.fairway || 150;
    function V(H, pos) {
      const d = dist(pos, H.pin);
      if (pos.onGreen) return RE[ringOf(H, pos)];
      const Rl = R[pos.lie] || Rfw;
      const leave = RE[2] + (RE[3] - RE[2]) * Math.min(1, Math.min(d, Rl) / 150); // longer approaches finish further out
      return 1 + (LIE_DIFF[pos.lie] || 0) + Math.max(0, d - Rl) / Rfw + leave;
    }
    return { V, RV, R };
  }

  const AIM_OFFSETS = [0, -4, 4, -8, 8, -12, 12, -18, 18, -25, 25, -35, 35, -50, 50];

  function evalDecision(H, cfg, state, club, power, aim, tiers, ctx) {
    const tier = isTierable(club) ? tiers[club.id] || 1 : 1;
    const groups = faceGroups(fanFor(cfg, club, tier));
    let m = 0, m2 = 0;
    for (const sp of SUM_PROBS) {
      for (const g of groups) {
        const r = flyShot(H, cfg, state, club.id, power, aim, tier, sp.sum, g.angle);
        let v = r.penalty + (r.holed ? 0 : ctx.V(H, r));
        if (ctx.coins && !r.penalty && !r.holed) { const ci = coinAt(ctx.coins, r, cfg); if (ci >= 0) v -= ctx.coins[ci].value * (ctx.coinWorth || 0.3); }
        const w = sp.p * g.p;
        m += w * v; m2 += w * v * v;
      }
    }
    return { mean: 1 + m, sd: Math.sqrt(Math.max(0, m2 - m * m)) };
  }

  const PROFILES = [
    { id: 'beginner', name: 'Beginner', type: 'beginner', lambda: 0 },
    { id: 'average', name: 'Average', type: 'ev', lambda: 0.5 },
    { id: 'expert', name: 'Expert', type: 'ev', lambda: 0 },
    { id: 'gambler', name: 'Gambler', type: 'ev', lambda: -0.3 },
  ];

  function decidePutt(H, cfg, state, tiers, profile, ctx) {
    const ring = ringOf(H, state);
    if (ring === 1) return 'safe';
    if (profile.id === 'beginner') return ring <= 2 ? 'risky' : 'safe';
    if (profile.id === 'gambler') return 'risky';
    return (ctx.RV || ringValues(cfg, tiers.putter || 1)).best[ring];
  }
  function decide(H, cfg, state, tiers, profile, ctx, wantTop) {
    const clubs = allowedClubs(cfg, state.lie);
    const d = dist(state, H.pin);
    if (profile.type === 'beginner') {
      let best = null;
      for (const c of clubs) for (const p of powersFor(cfg, state.lie, c)) {
        const avg = clubDistance(cfg, c, 7, p, state.lie, isTierable(c) ? tiers[c.id] || 1 : 1);
        const err = Math.abs(avg - d);
        if (!best || err < best.err) best = { club: c.id, power: p, err };
      }
      const aim = { x: H.pin.x, y: H.pin.y };
      const ev = evalDecision(H, cfg, state, getClub(cfg, best.club), best.power, aim, tiers, ctx);
      return { club: best.club, power: best.power, aim, mean: ev.mean, sd: ev.sd, score: ev.mean, top: wantTop ? [] : undefined };
    }
    const base = Math.atan2(H.pin.y - state.y, H.pin.x - state.x);
    const L = Math.max(d, 1);
    const all = [];
    let best = null;
    for (const off of AIM_OFFSETS) {
      const a = base + (off * Math.PI) / 180;
      const aim = { x: state.x + Math.cos(a) * L, y: state.y + Math.sin(a) * L, off };
      for (const c of clubs) for (const p of powersFor(cfg, state.lie, c)) {
        const ev = evalDecision(H, cfg, state, c, p, aim, tiers, ctx);
        const score = ev.mean + profile.lambda * ev.sd;
        const cand = { club: c.id, power: p, aim, mean: ev.mean, sd: ev.sd, score };
        if (wantTop) all.push(cand);
        if (!best || score < best.score - 1e-9) best = cand;
      }
    }
    if (wantTop) best.top = all.sort((a, b) => a.score - b.score).slice(0, 8);
    return best;
  }

  // ---------------------------------------------------------- coin tokens
  // Tempting spots: just outside hazards or near the board edge, never on the green, reachable from the tee-pin corridor.
  function placeCoins(H, cfg, rng) {
    setLieMode(cfg);
    const T = cfg.coinTokens, out = [];
    if (!T || !T.perHole) return out;
    const cands = [];
    const tx = H.pin.x - H.tee.x, ty = H.pin.y - H.tee.y, L = Math.hypot(tx, ty) || 1;
    const offLine = (x, y) => Math.abs((x - H.tee.x) * ty - (y - H.tee.y) * tx) / L;
    const along = (x, y) => ((x - H.tee.x) * tx + (y - H.tee.y) * ty) / L;
    const nearDanger = (x, y) => {
      for (let a = 0; a < 12; a++) {
        const xx = x + Math.cos((a * Math.PI) / 6) * 14, yy = y + Math.sin((a * Math.PI) / 6) * 14;
        const l = lieAt(H, xx, yy); if (l === 'water' || l === 'ob') return true;
      }
      return false;
    };
    const ok = (x, y) => {
      const l = lieAt(H, x, y);
      if (l === 'water' || l === 'ob' || l === 'green') return false;
      const a = along(x, y);
      return a > 60 && a < L - 15 && offLine(x, y) < 90 && dist({ x, y }, H.pin) > 25;
    };
    for (const k of ['water', 'bunker', 'trees']) for (const sh of H.kinds[k]) {
      for (let i = 0; i < 10; i++) {
        const a = rng() * Math.PI * 2, R = Math.max(sh.rx, sh.ry) + 6 + rng() * 8;
        const x = sh.cx + Math.cos(a) * R, y = sh.cy + Math.sin(a) * R;
        if (ok(x, y)) cands.push({ x, y, w: k === 'water' ? 3 : 2 });
      }
    }
    for (let i = 0; i < 40; i++) {
      const t = 0.25 + rng() * 0.65, side = rng() < 0.5 ? -1 : 1, off = 30 + rng() * 60;
      const x = H.tee.x + tx * t + (-ty / L) * off * side, y = H.tee.y + ty * t + (tx / L) * off * side;
      if (ok(x, y)) cands.push({ x, y, w: x < 22 || y < 22 || x > H.w - 22 || y > H.h - 22 ? 2.5 : 1 });
    }
    while (out.length < T.perHole && cands.length) {
      let tot = cands.reduce((a, c) => a + c.w, 0), r = rng() * tot, idx = 0;
      for (; idx < cands.length - 1; idx++) { r -= cands[idx].w; if (r <= 0) break; }
      const c = cands.splice(idx, 1)[0];
      if (out.some((o) => dist(o, c) < 35)) continue;
      out.push({ x: Math.round(c.x), y: Math.round(c.y), value: nearDanger(c.x, c.y) ? T.riskyValue : T.value, taken: false });
    }
    return out;
  }
  function coinAt(coins, pos, cfg) {
    const R = cfg.coinTokens ? cfg.coinTokens.radius : 10;
    return coins.findIndex((c) => !c.taken && dist(c, pos) <= R);
  }

  // ------------------------------------------------------------ simulation
  function shotType(state) {
    if (state.onGreen) return 'putt';
    if (state.lie === 'tee') return 'tee';
    if (state.lie === 'bunker' || state.lie === 'trees') return 'recovery';
    return 'approach';
  }

  function simHole(H, cfg, profile, tiers, seed, ctx) {
    const rng = mulberry32(seed);
    const par = parOf(H, cfg);
    const max = cfg.rules.maxStrokesPerHole;
    let st = startState(H);
    const out = {
      par, strokes: 0, putts: 0, longShots: 0, penalties: 0, teeShots: 0, obTee: 0,
      flags: { ob: false, water: false, bunker: false, trees: false, blocked: false },
      clubShots: [], pickedUp: false, gir: false, reachedGreenAt: null,
    };
    while (!st.holed && st.strokes < max) {
      const r1 = d6(rng), r2 = d6(rng), dice = { d1: d6(rng), d2: d6(rng), r1, r2, dir: r1 + r2 }; // drawn before deciding: common random numbers
      const type = shotType(st);
      let dec = null;
      dec = st.onGreen ? { putt: decidePutt(H, cfg, st, tiers, profile, ctx) } : decide(H, cfg, st, tiers, profile, ctx, false);
      const { state: ns, result: r } = playShot(H, cfg, st, dec, tiers, dice);
      if (type !== 'putt') {
        out.longShots++;
        out.clubShots.push({ type, club: r.club });
        if (type === 'tee') { out.teeShots++; if (r.landLie === 'ob') out.obTee++; }
      }
      if (r.landLie === 'ob') out.flags.ob = true;
      if (r.landLie === 'water') out.flags.water = true;
      if (r.landLie === 'bunker') out.flags.bunker = true;
      if (r.landLie === 'trees') out.flags.trees = true;
      if (r.blocked) out.flags.blocked = true;
      out.penalties += r.penalty;
      if (ns.onGreen && out.reachedGreenAt == null) out.reachedGreenAt = ns.strokes;
      st = ns;
    }
    out.strokes = st.holed ? st.strokes : max;
    out.pickedUp = !st.holed;
    out.putts = st.putts;
    out.gir = out.reachedGreenAt != null && out.reachedGreenAt <= par - 2;
    return out;
  }

  function newAgg() {
    return {
      n: 0, sumDiff: 0, sumDiff2: 0,
      byPar: { 3: { n: 0, s: 0 }, 4: { n: 0, s: 0 }, 5: { n: 0, s: 0 } },
      buckets: { '-2': 0, '-1': 0, '0': 0, '1': 0, '2': 0, '3': 0 },
      putts: 0, longShots: 0, penalties: 0, teeShots: 0, obTee: 0, gir: 0, pickups: 0,
      holesWith: { ob: 0, water: 0, bunker: 0, trees: 0, blocked: 0 },
      clubUse: { tee: {}, approach: {}, recovery: {} },
    };
  }
  function addAgg(a, res) {
    const d = res.strokes - res.par;
    a.n++; a.sumDiff += d; a.sumDiff2 += d * d;
    a.byPar[res.par].n++; a.byPar[res.par].s += d;
    a.buckets[String(Math.max(-2, Math.min(3, d)))]++;
    a.putts += res.putts; a.longShots += res.longShots; a.penalties += res.penalties;
    a.teeShots += res.teeShots; a.obTee += res.obTee;
    if (res.gir) a.gir++;
    if (res.pickedUp) a.pickups++;
    for (const k in res.flags) if (res.flags[k]) a.holesWith[k]++;
    for (const cs of res.clubShots) a.clubUse[cs.type][cs.club] = (a.clubUse[cs.type][cs.club] || 0) + 1;
  }
  function summarize(a, cfg) {
    const n = Math.max(1, a.n);
    const mean = a.sumDiff / n;
    const sd = Math.sqrt(Math.max(0, a.sumDiff2 / n - mean * mean));
    const byPar = {};
    for (const p of [3, 4, 5]) byPar[p] = a.byPar[p].n ? a.byPar[p].s / a.byPar[p].n : null;
    const buckets = {};
    for (const k in a.buckets) buckets[k] = a.buckets[k] / n;
    const clubUse = {};
    for (const t in a.clubUse) {
      const tot = Object.values(a.clubUse[t]).reduce((x, y) => x + y, 0);
      clubUse[t] = {};
      for (const c in a.clubUse[t]) clubUse[t][c] = a.clubUse[t][c] / Math.max(1, tot);
    }
    const rates = {};
    for (const k in a.holesWith) rates[k] = a.holesWith[k] / n;
    rates.obTee = a.obTee / Math.max(1, a.teeShots);
    const secPerHole = (a.longShots * cfg.playtime.secPerLongShot + a.putts * cfg.playtime.secPerPutt) / n;
    return {
      n: a.n, mean, sd, se: sd / Math.sqrt(n), byPar, buckets, clubUse, rates,
      shotsPerHole: (a.longShots + a.putts) / n, longPerHole: a.longShots / n, puttsPerHole: a.putts / n,
      penaltiesPerHole: a.penalties / n, gir: a.gir / n, pickups: a.pickups / n,
      minutesPer18: (secPerHole * 18) / 60,
    };
  }

  // -------------------------------------------------------- course library
  let _uid = 0;
  const uid = () => 's' + Date.now().toString(36) + (_uid++).toString(36);
  const E_ = (kind, cx, cy, rx, ry, rotation) => ({ id: uid(), kind, cx, cy, rx, ry, rotation: rotation || 0 });
  const P_ = (kind, cx, cy) => ({ id: uid(), kind, cx, cy, rx: 4, ry: 4, rotation: 0 });

  const PRESETS = [
    {
      id: 'straight4', name: 'Straight par 4', board: { w: 340, h: 460 }, parOverride: null,
      shapes: [
        E_('fairway', 170, 235, 26, 165),
        E_('bunker', 197, 72, 10, 7, 20), E_('bunker', 140, 195, 12, 9),
        E_('trees', 228, 250, 24, 45), E_('water', 108, 300, 20, 32), { id: uid(), kind: 'green', tile: 'oval', cx: 170, cy: 48, rx: 0, ry: 0, rotation: 0 },
        P_('tee', 170, 440),
      ],
    },
    {
      id: 'island3', name: 'Island-green par 3', board: { w: 340, h: 460 }, parOverride: null,
      shapes: [
        E_('trees', 62, 330, 30, 42), E_('bunker', 230, 300, 10, 8),
        E_('water', 170, 255, 62, 46), { id: uid(), kind: 'green', tile: 'round', cx: 170, cy: 250, rx: 0, ry: 0, rotation: 0 },
        P_('tee', 170, 420),
      ],
    },
    {
      id: 'dogleg5', name: 'Dogleg par 5', board: { w: 340, h: 460 }, parOverride: null,
      shapes: [
        E_('fairway', 65, 320, 25, 125, 8), E_('fairway', 190, 120, 125, 25, -35),
        E_('trees', 175, 235, 38, 50),
        E_('bunker', 270, 62, 10, 7), E_('water', 255, 255, 34, 48), { id: uid(), kind: 'green', tile: 'peanut', cx: 292, cy: 42, rx: 0, ry: 0, rotation: 30 },
        P_('tee', 40, 445),
      ],
    },
    {
      id: 'carry4', name: 'Water-carry par 4', board: { w: 340, h: 460 }, parOverride: null,
      shapes: [
        E_('fairway', 188, 227, 110, 25, -62), E_('water', 132, 333, 22, 120, -62),
        E_('bunker', 280, 120, 9, 7), E_('trees', 80, 220, 28, 50), { id: uid(), kind: 'green', tile: 'long', cx: 250, cy: 112, rx: 0, ry: 0, rotation: -62 },
        P_('tee', 80, 430),
      ],
    },
  ];

  function generateHole(rng, cfg, opts) {
    opts = opts || {};
    const W = (opts.board || cfg.board).w, Hh = (opts.board || cfg.board).h;
    const r = (a, b) => a + rng() * (b - a);
    const pickW = (items, ws) => { let x = rng() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x <= 0) return items[i]; } return items[items.length - 1]; };
    setLieMode(cfg);
    const par = opts.par || pickW([3, 4, 5], [0.25, 0.5, 0.25]);
    for (let tries = 0; tries < 800; tries++) {
      const lo = par === 3 ? 120 : par === 4 ? cfg.par.par3Below + 30 : cfg.par.par4Below + 10;
      const hi = par === 3 ? cfg.par.par3Below - 15 : par === 4 ? cfg.par.par4Below - 20 : cfg.par.par4Below + 60;
      const len = r(lo, hi);
      const tee = { x: r(25, W - 25), y: r(Hh - 40, Hh - 18) };
      const ang = -Math.PI / 2 + r(par === 5 ? -1.0 : -0.75, par === 5 ? 1.0 : 0.75);
      const pin = { x: tee.x + Math.cos(ang) * len, y: tee.y + Math.sin(ang) * len };
      if (pin.x < 25 || pin.x > W - 25 || pin.y < 22 || pin.y > Hh - 25) continue;
      const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
      const deg = (ang * 180) / Math.PI;
      const at = (t, off) => ({ x: tee.x + ux * t + nx * off, y: tee.y + uy * t + ny * off });
      const shapes = [];
      if (par >= 4) {
        if (par === 4) {
          const a = 110, b = len - 25, c = at((a + b) / 2, r(-10, 10));
          shapes.push(E_('fairway', c.x, c.y, (b - a) / 2, r(18, 30), deg));
        } else {
          const s1 = at((110 + len * 0.55) / 2, r(-25, 25)), s2 = at((len * 0.5 + len - 25) / 2, r(-25, 25));
          shapes.push(E_('fairway', s1.x, s1.y, (len * 0.55 - 110) / 2, r(18, 28), deg + r(-8, 8)));
          shapes.push(E_('fairway', s2.x, s2.y, (len * 0.5 - 25) / 2, r(18, 28), deg + r(-8, 8)));
        }
      }
            const tile = pickW(GREEN_TILES, GREEN_TILES.map((t) => (t.difficulty === 1 ? 3 : t.difficulty === 2 ? 2 : 1.5)));
      const rot = r(0, 360), ra = (rot * Math.PI) / 180;
      const ox = pin.x - (tile.cup.x * Math.cos(ra) - tile.cup.y * Math.sin(ra)), oy = pin.y - (tile.cup.x * Math.sin(ra) + tile.cup.y * Math.cos(ra));
      const green = { id: uid(), kind: 'green', tile: tile.id, cx: ox, cy: oy, rx: 0, ry: 0, rotation: rot };
      const hazards = [];
      if (rng() < 0.2) { // carry water across the line
        const c = at(r(60, len - 60), 0);
        hazards.push(E_('water', c.x, c.y, r(10, 20), r(40, 90), deg));
      }
      const nh = 1 + Math.floor(rng() * (par === 3 ? 3 : 5));
      for (let i = 0; i < nh; i++) {
        const kind = pickW(['water', 'bunker', 'trees'], [0.3, 0.45, 0.25]);
        const greenside = par === 3 || rng() < 0.45;
        const side = rng() < 0.5 ? -1 : 1;
        const c = greenside ? at(len + r(-15, 10), side * r(22, 35)) : at(Math.min(len - 40, r(200, 260)), side * r(25, 50));
        const size = kind === 'bunker' ? [r(7, 14), r(5, 10)] : kind === 'water' ? [r(15, 35), r(10, 25)] : [r(12, 30), r(12, 30)];
        hazards.push(E_(kind, c.x, c.y, size[0], size[1], r(0, 180)));
      }
      shapes.push(...hazards, green, P_('tee', Math.round(tee.x), Math.round(tee.y)));
      for (const s of shapes) for (const k of ['cx', 'cy', 'rx', 'ry', 'rotation']) s[k] = Math.round(s[k]);
      // tile edges must stay on the board
      const parts = tileParts(green);
      if (parts.some((p) => p.cx - Math.max(p.rx, p.ry) < 2 || p.cy - Math.max(p.rx, p.ry) < 2 || p.cx + Math.max(p.rx, p.ry) > W - 2 || p.cy + Math.max(p.rx, p.ry) > Hh - 2)) continue;
      const hole = { id: uid(), name: `Random par ${par}`, board: { w: W, h: Hh }, parOverride: null, shapes };
      // validity: pin on green, tee not in a hazard; drop hazards that cover pin or tee
      let H = prepHole(hole);
      if (lieAt(H, H.pin.x, H.pin.y) !== 'green') {
        hole.shapes = shapes.filter((s) => !(hazards.includes(s) && inShape(prepShape(s), H.pin.x, H.pin.y)));
        H = prepHole(hole);
        if (lieAt(H, H.pin.x, H.pin.y) !== 'green') continue;
      }
      const tl = lieAt(H, H.tee.x, H.tee.y);
      if (tl === 'water' || tl === 'bunker' || tl === 'trees') continue;
      if (parOf(H, cfg) !== par) continue;
      return hole;
    }
    const fb = clone(PRESETS[0]); fb.id = uid(); return fb;
  }

  root.Engine = {
    DEFAULT_CONFIG, MAX_TIER, shotCalc, clone, mulberry32, d6, dist, roundStep,
    prepHole, prepShape, inShape, lieAt, parOf, setLieMode,
    getClub, maxPower, powersFor, zoneOf, zoneFor, zonesFor, baseDistance, ZONE_LABELS, clubFull, allowedClubs, clubAllowed, isTierable, clubDistance, fanFor, faceGroups, SUM_PROBS,
    flyShot, playShot, startState,
    placeCoins, coinAt, GREEN_TILES, getTile, tileParts, tileCup, ringOf, puttTarget, resolvePutt, ringValues, pAtLeast, decidePutt,
    botContext, evalDecision, decide, PROFILES, shotType,
    simHole, newAgg, addAgg, summarize,
    PRESETS, generateHole, uid,
  };
})(typeof window !== 'undefined' ? window : globalThis);
