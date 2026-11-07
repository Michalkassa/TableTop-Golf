// Tabletop Golf — simulation library.
// Reuses the real rules engine (prototype/engine.js) and mirrors the game's economy (prototype/game.js):
// coins per score, coin tokens, a 6-card pro shop (4 club upgrades + 2 jokers, 40% chance of a sale, $1 reroll)
// and the jokers/tickets that the rules engine can express.
'use strict';
require('../prototype/engine.js');
const E = globalThis.Engine;

const BASE = E.clone(E.DEFAULT_CONFIG);
const CLUBS = BASE.clubs.filter((c) => c.enabled !== false);
const BAG = [...CLUBS.map((c) => c.id), 'putter'];
const MAXT = E.MAX_TIER;

// ---------------------------------------------------------------- course
// One fixed, seeded 18-hole course (par mix like a real course: 4 par 3s, 10 par 4s, 4 par 5s).
function makeCourse(seed = 18, cfg = BASE) {
  const rng = E.mulberry32(seed), want = [4, 3, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  return want.map((par) => {
    const H = E.prepHole(E.generateHole(rng, cfg, { par }));
    H.par = E.parOf(H, cfg);
    return H;
  });
}
function holePool(seed, n, cfg = BASE) {
  const rng = E.mulberry32(seed), out = [];
  for (let i = 0; i < n; i++) { const H = E.prepHole(E.generateHole(rng, cfg)); H.par = E.parOf(H, cfg); out.push(H); }
  return out;
}

// ---------------------------------------------------------------- jokers (same list and prices as the game)
const JOKERS = [
  { id: 'caddie', type: 'joker', price: 5 }, { id: 'sandshark', type: 'joker', price: 4 },
  { id: 'roughrider', type: 'joker', price: 4 }, { id: 'lumberjack', type: 'joker', price: 5 },
  { id: 'ironman', type: 'joker', price: 6 }, { id: 'wizard', type: 'joker', price: 5 },
  { id: 'bighitter', type: 'joker', price: 5 }, { id: 'laser', type: 'joker', price: 5 },
  { id: 'steady', type: 'joker', price: 4 }, { id: 'lucky7', type: 'joker', price: 4 },
  { id: 'magpie', type: 'joker', price: 3 }, { id: 'piggy', type: 'joker', price: 4 },
  { id: 'mulligan', type: 'ticket', price: 2 }, { id: 'jail', type: 'ticket', price: 3 },
];
const JK = Object.fromEntries(JOKERS.map((j) => [j.id, j]));
const SLOTS = { joker: 3, ticket: 2 };
const cfgCache = new Map();
function pcfg(p) {
  const key = p.jokers.slice().sort().join(',');
  if (cfgCache.has(key)) return cfgCache.get(key);
  const c = E.clone(BASE), has = (id) => p.jokers.includes(id);
  if (has('roughrider')) c.lieDrop.rough = 0;
  if (has('sandshark')) c.lieDrop.bunker = 0;
  if (has('lumberjack')) { c.lieDrop.trees = 0; c.rules.treesBlockLine = false; }
  if (has('steady')) for (const t in c.fans) c.fans[t] = c.fans[t].map((a) => (Math.abs(a) > 8 ? Math.sign(a) * 6 : a));
  if (has('laser')) c.putting.risky = c.putting.risky.map((t, i) => (i ? t - 1 : t));
  if (has('magpie')) c.coinTokens.radius *= 2;
  cfgCache.set(key, c);
  return c;
}
function ptiers(p) {
  const t = { ...p.tiers }, has = (id) => p.jokers.includes(id);
  for (const c of CLUBS) {
    const boost = (c.kind === 'iron' && has('ironman')) || (c.kind === 'wedge' && has('wizard')) || ((c.kind === 'driver' || c.kind === 'wood') && has('bighitter'));
    if (boost) t[c.id] = Math.min(MAXT, t[c.id] + 1);
  }
  return t;
}

// ---------------------------------------------------------------- RL shot agent (tabular Q-learning)
// State: bag tier band | lie | distance bucket (15 yd) | where the danger is (water / OB along the line)
// Actions: every legal club (+ Driver power) × aim offset (-10°, 0°, +10°). Greens: SAFE / RISKY per ring.
const AIMS = [-10, 0, 10];
const DB = 15;
function tierBand(tiers) {
  let s = 0; for (const c of CLUBS) s += tiers[c.id] || 1;
  return Math.max(1, Math.min(MAXT, Math.round(s / CLUBS.length)));
}
function danger(H, cfg, st) {
  const d = Math.max(30, E.dist(st, H.pin)), base = Math.atan2(H.pin.y - st.y, H.pin.x - st.x);
  let L = 0, R = 0;
  for (const f of [0.45, 0.7, 0.95]) for (const [deg, side] of [[-14, -1], [-24, -1], [14, 1], [24, 1]]) {
    const a = base + (deg * Math.PI) / 180, x = st.x + Math.cos(a) * d * f, y = st.y + Math.sin(a) * d * f;
    const l = E.lieAt(H, x, y);
    if (l === 'water' || l === 'ob') { if (side < 0) L = 1; else R = 1; }
  }
  return L * 1 + R * 2; // 0 none, 1 left, 2 right, 3 both
}
function stateKey(H, cfg, st, tiers) {
  if (st.onGreen) return `G|${E.ringOf(H, st)}|${tiers.putter || 1}`;
  const d = Math.min(30, Math.floor(E.dist(st, H.pin) / DB));
  return `${tierBand(tiers)}|${st.lie}|${d}|${danger(H, cfg, st)}`;
}
function actionsFor(cfg, st) {
  if (st.onGreen) return ['safe', 'risky'];
  const out = [];
  for (const c of E.allowedClubs(cfg, st.lie)) for (const p of E.powersFor(cfg, st.lie, c)) for (const a of AIMS) out.push(`${c.id}:${p}:${a}`);
  return out;
}
// Heuristic prior so learning starts sensible: expected strokes left from the landing distance.
const hLeft = (r) => (r < 12 ? 1.6 : r < 30 ? 2.1 : 2.2 + r / 170);
function prior(H, cfg, st, tiers, a) {
  if (st.onGreen) return a === 'risky' ? -1.9 : -2;
  const [id, pw, aim] = a.split(':'), c = E.getClub(cfg, id);
  const yd = E.clubDistance(cfg, c, 7, +pw, st.lie, E.isTierable(c) ? tiers[id] || 1 : 1);
  const d = E.dist(st, H.pin);
  return -1 - hLeft(Math.abs(d - yd)) - (+aim !== 0 ? 0.05 : 0);
}
class QAgent {
  constructor() { this.Q = new Map(); this.N = new Map(); }
  q(k, a, H, cfg, st, tiers) {
    const key = k + '#' + a;
    let v = this.Q.get(key);
    if (v === undefined) { v = prior(H, cfg, st, tiers, a); this.Q.set(key, v); }
    return v;
  }
  best(H, cfg, st, tiers) {
    const k = stateKey(H, cfg, st, tiers), acts = actionsFor(cfg, st);
    let ba = acts[0], bv = -Infinity;
    for (const a of acts) { const v = this.q(k, a, H, cfg, st, tiers); if (v > bv) { bv = v; ba = a; } }
    return { k, a: ba, v: bv, acts };
  }
  act(H, cfg, st, tiers, eps, rng) {
    const b = this.best(H, cfg, st, tiers);
    if (eps && rng() < eps) b.a = b.acts[Math.floor(rng() * b.acts.length)];
    return b;
  }
  update(k, a, target, alpha) {
    const key = k + '#' + a, n = (this.N.get(key) || 0) + 1;
    this.N.set(key, n);
    const lr = Math.max(alpha, 1 / n);
    this.Q.set(key, this.Q.get(key) + lr * (target - this.Q.get(key)));
  }
  toJSON() { return { Q: [...this.Q], N: [...this.N] }; }
  static from(o) { const a = new QAgent(); a.Q = new Map(o.Q); a.N = new Map(o.N); return a; }
  // visit-weighted average of several independently trained agents
  static merge(list) {
    const m = new QAgent(), sum = new Map();
    for (const ag of list) for (const [k, v] of ag.Q) {
      const n = ag.N.get(k) || 0.01, s = sum.get(k) || [0, 0];
      s[0] += v * n; s[1] += n; sum.set(k, s);
      m.N.set(k, (m.N.get(k) || 0) + (ag.N.get(k) || 0));
    }
    for (const [k, [vs, n]] of sum) m.Q.set(k, vs / n);
    return m;
  }
}
function decToShot(H, st, a) {
  if (st.onGreen) return { putt: a };
  const [club, pw, aim] = a.split(':');
  const base = Math.atan2(H.pin.y - st.y, H.pin.x - st.x) + (+aim * Math.PI) / 180, L = Math.max(E.dist(st, H.pin), 1);
  return { club, power: +pw, aim: { x: st.x + Math.cos(base) * L, y: st.y + Math.sin(base) * L }, off: +aim };
}
const roll4 = (rng) => { const r1 = E.d6(rng), r2 = E.d6(rng); return { d1: E.d6(rng), d2: E.d6(rng), r1, r2, dir: r1 + r2 }; };

// One training hole for the Q agent (uniform tiers). Returns strokes.
function trainHole(agent, H, tiers, rng, eps, alpha) {
  const cfg = BASE, max = cfg.rules.maxStrokesPerHole;
  let st = E.startState(H);
  let cur = agent.act(H, cfg, st, tiers, eps, rng);
  while (!st.holed && st.strokes < max) {
    const { state: ns } = E.playShot(H, cfg, st, decToShot(H, st, cur.a), tiers, roll4(rng));
    const cost = ns.strokes - st.strokes; // includes penalty strokes
    let target = -cost, nxt = null;
    if (!ns.holed && ns.strokes < max) { nxt = agent.act(H, cfg, ns, tiers, eps, rng); target += agent.best(H, cfg, ns, tiers).v; }
    else if (!ns.holed) target -= 2; // picked up
    agent.update(cur.k, cur.a, target, alpha);
    st = ns; cur = nxt;
  }
  return st.holed ? st.strokes : max;
}

// ---------------------------------------------------------------- shot policies used in full games
// 'rl'  = learned Q agent (greedy)   'ev' = the engine's planning bot (expert)   'beginner' = engine's naive bot
function shotPolicy(kind, agent) {
  if (kind === 'rl') return (H, cfg, st, tiers) => decToShot(H, st, agent.best(H, cfg, st, tiers).a);
  const prof = E.PROFILES.find((p) => p.id === kind);
  return (H, cfg, st, tiers, ctx) => (st.onGreen ? { putt: E.decidePutt(H, cfg, st, tiers, prof, ctx) } : E.decide(H, cfg, st, tiers, prof, ctx, false));
}

// ---------------------------------------------------------------- shop strategies
// A strategy is a set of weights: how much it wants each club group, the putter and each joker,
// plus how many coins it keeps in reserve and when it rerolls. Archetypes are hand-written; the learner evolves its own.
const GROUPS = { driver: ['driver'], woods: ['w3', 'w5'], long: ['i4', 'i5', 'i6'], short: ['i7', 'i8', 'i9'], wedges: ['pw', 'sw', 'lw'], putter: ['putter'] };
const GROUP_OF = Object.fromEntries(Object.entries(GROUPS).flatMap(([g, ids]) => ids.map((id) => [id, g])));
const PARAMS = [...Object.keys(GROUPS).map((g) => 'g_' + g), ...JOKERS.map((j) => 'j_' + j.id), 'lowTierBias', 'reserve', 'rerollBelow'];
function strat(name, o) {
  const s = { name };
  for (const k of PARAMS) s[k] = 0;
  s.lowTierBias = 0.3; s.reserve = 0; s.rerollBelow = -9;
  for (const j of JOKERS) s['j_' + j.id] = -5; // archetypes skip jokers unless told otherwise
  return Object.assign(s, o);
}
const ARCHETYPES = [
  strat('Hoarder (never buys)', { g_driver: -9, g_woods: -9, g_long: -9, g_short: -9, g_wedges: -9, g_putter: -9 }),
  strat('Even spread (cheapest first)', { g_driver: 1, g_woods: 1, g_long: 1, g_short: 1, g_wedges: 1, g_putter: 1, lowTierBias: 1.5 }),
  strat('Driver & woods first', { g_driver: 3, g_woods: 2.5, g_long: 0.5, g_short: 0.3, g_wedges: 0.2, g_putter: 0.3 }),
  strat('Irons first', { g_driver: 0.2, g_woods: 0.2, g_long: 2.5, g_short: 3, g_wedges: 1, g_putter: 0.3 }),
  strat('Short game (wedges + putter)', { g_driver: 0.1, g_woods: 0.1, g_long: 0.2, g_short: 0.8, g_wedges: 3, g_putter: 3 }),
  strat('Putter first', { g_driver: 0.5, g_woods: 0.5, g_long: 0.5, g_short: 0.5, g_wedges: 0.5, g_putter: 5, lowTierBias: 0.8 }),
  strat('Joker collector', { g_driver: 0.5, g_woods: 0.5, g_long: 0.5, g_short: 0.5, g_wedges: 0.5, g_putter: 0.5, ...Object.fromEntries(JOKERS.map((j) => ['j_' + j.id, 2.5])), rerollBelow: 1.5, reserve: 0 }),
  strat('Game CPU (random joker + cheapest)', { cpu: true }),
];
function offerScore(S, p, o) {
  if (o.joker) return S['j_' + o.id] - (S.cpu ? 0 : 0.15 * o.price);
  const t = p.tiers[o.id];
  return S['g_' + GROUP_OF[o.id]] - S.lowTierBias * (t - 1) - 0.25 * o.price + (o.was ? 0.3 : 0);
}
const cost = (p, id) => (p.tiers[id] < MAXT ? BASE.progression.tierCosts[p.tiers[id] - 1] : null);
function makeOffers(p, rng) {
  const ids = BAG.filter((id) => p.tiers[id] < MAXT);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const offers = ids.slice(0, 4).map((id) => ({ id, price: cost(p, id), was: null }));
  if (offers.length && rng() < 0.4) { const o = offers[Math.floor(rng() * offers.length)]; if (o.price > 1) { o.was = o.price; o.price -= 1; } }
  const pool = JOKERS.filter((j) => j.type === 'ticket' || !p.jokers.includes(j.id));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return offers.concat(pool.slice(0, 6 - offers.length).map((j) => ({ id: j.id, price: j.price, joker: true })));
}
const slotFree = (p, id) => (JK[id].type === 'joker' ? p.jokers : p.tickets).length < SLOTS[JK[id].type];
function shop(S, p, rng, log) {
  if (S.cpu) { // exactly what the game's CPU does
    const want = JOKERS.filter((j) => (j.type === 'joker' ? !p.jokers.includes(j.id) && p.jokers.length < SLOTS.joker : p.tickets.length < SLOTS.ticket) && p.coins >= j.price + 1);
    if (want.length && rng() < 0.6) { const j = want[Math.floor(rng() * want.length)]; p.coins -= j.price; (j.type === 'joker' ? p.jokers : p.tickets).push(j.id); log && log.push(j.id); }
    for (let g = 0; g < 30; g++) {
      const o = BAG.filter((id) => cost(p, id) != null && cost(p, id) <= p.coins).sort((a, b) => p.tiers[a] - p.tiers[b] || (a === 'putter' ? -1 : 1));
      if (!o.length) break;
      p.coins -= cost(p, o[0]); p.tiers[o[0]]++; log && log.push(o[0]);
    }
    return;
  }
  let offers = makeOffers(p, rng);
  for (let rr = 0; rr < 3; rr++) {
    for (let g = 0; g < 8; g++) {
      const cand = offers.filter((o) => !o.sold && o.price <= p.coins - S.reserve && (!o.joker || slotFree(p, o.id)) && (o.joker || p.tiers[o.id] < MAXT))
        .map((o) => ({ o, s: offerScore(S, p, o) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
      if (!cand.length) break;
      const o = cand[0].o; p.coins -= o.price; o.sold = true;
      if (o.joker) (JK[o.id].type === 'joker' ? p.jokers : p.tickets).push(o.id); else p.tiers[o.id]++;
      p.rerolls += 0; log && log.push(o.id);
    }
    const bestLeft = Math.max(-99, ...offers.filter((o) => !o.sold).map((o) => offerScore(S, p, o)));
    if (p.coins >= 2 + S.reserve && bestLeft < S.rerollBelow) { p.coins -= 1; p.rerolls++; offers = makeOffers(p, rng); } else break;
  }
}

// ---------------------------------------------------------------- one full game (a table of 1–4 players)
// players: [{ strat, shot: 'rl'|'ev'|'beginner', startJokers? }]
const coinsFor = (d) => { const c = BASE.progression.coins; return d <= -1 ? c.birdieOrBetter : d === 0 ? c.par : d === 1 ? c.bogey : c.worse; };
function playGame(course, seats, rng, agent, opts = {}) {
  const max = BASE.rules.maxStrokesPerHole;
  const P = seats.map((s, i) => ({
    i, S: s.strat, pol: shotPolicy(s.shot || 'rl', agent), tiers: Object.fromEntries(BAG.map((id) => [id, s.startTier || 1])),
    coins: 0, jokers: (s.startJokers || []).slice(), tickets: (s.startTickets || []).slice(), rerolls: 0, buys: [],
    holes: [], total: 0, earned: 0, tokens: 0,
  }));
  const ctxCache = new Map();
  const ctxFor = (cfg, tiers) => { const k = JSON.stringify(tiers) + cfg.putting.risky.join(); if (!ctxCache.has(k)) ctxCache.set(k, E.botContext(cfg, tiers)); return ctxCache.get(k); };
  const holes = opts.holes ? course.slice(0, opts.holes) : course;
  holes.forEach((H, hi) => {
    const coinsOnCourse = E.placeCoins(H, BASE, rng);
    for (const p of P) {
      const cfg = pcfg(p), tiers = ptiers(p), ctx = p.pol.length > 4 ? ctxFor(cfg, tiers) : null;
      let st = E.startState(H), caddie = false;
      const rec = { par: H.par, strokes: 0, putts: 0, long: 0, pen: 0, ob: 0, water: 0, straight: 0, tok: 0, risky: 0, safe: 0, clubs: [], gir: false, mull: 0, cad: 0 };
      E.setLieMode(cfg);
      while (!st.holed && st.strokes < max) {
        const dec = p.pol(H, cfg, st, tiers, ctx);
        let dice = roll4(rng), out = E.playShot(H, cfg, st, dec, tiers, dice);
        // tickets / caddie the same way the game's CPU uses them
        const bad = (o) => o.result.penalty || (!st.onGreen && Math.abs(o.result.angle) > 8);
        if (!st.onGreen && bad(out) && p.jokers.includes('caddie') && !caddie) { caddie = true; rec.cad++; const r1 = E.d6(rng), r2 = E.d6(rng); dice = { ...dice, r1, r2, dir: r1 + r2 }; out = E.playShot(H, cfg, st, dec, tiers, dice); }
        if (out.result.penalty && p.tickets.includes('mulligan')) { p.tickets.splice(p.tickets.indexOf('mulligan'), 1); rec.mull++; dice = roll4(rng); out = E.playShot(H, cfg, st, dec, tiers, dice); }
        const r = out.result;
        if (r.penalty && p.tickets.includes('jail')) { p.tickets.splice(p.tickets.indexOf('jail'), 1); out.state.strokes -= r.penalty; r.penalty = 0; }
        if (r.putt) { rec.putts++; if (r.choice === 'risky') rec.risky++; else rec.safe++; }
        else {
          rec.long++; rec.clubs.push(dec.club + (dec.power && dec.power < 1 ? '@' + dec.power : ''));
          if (r.angle === 0) rec.straight++;
          if (r.landLie === 'ob') rec.ob++; if (r.landLie === 'water') rec.water++;
          rec.pen += r.penalty || 0;
          if (p.jokers.includes('lucky7') && dice.d1 + dice.d2 === 7) { p.coins++; rec.tok++; }
          if (!out.state.holed) { const ci = E.coinAt(coinsOnCourse, out.state, cfg); if (ci >= 0) { coinsOnCourse[ci].taken = true; p.coins += coinsOnCourse[ci].value; rec.tok += coinsOnCourse[ci].value; } }
          if (out.state.onGreen && !rec.gir && out.state.strokes <= H.par - 2) rec.gir = true;
        }
        st = out.state;
      }
      rec.strokes = st.holed ? st.strokes : max;
      rec.diff = rec.strokes - H.par;
      const earn = coinsFor(rec.diff);
      p.coins += earn;
      if (p.jokers.includes('piggy')) { const b = Math.min(3, Math.floor(p.coins / 4)); p.coins += b; rec.tok += b; }
      rec.coins = earn + rec.tok; p.earned += rec.coins; p.tokens += rec.tok;
      rec.tierAvg = BAG.reduce((s, id) => s + p.tiers[id], 0) / BAG.length;
      rec.jokers = p.jokers.length;
      p.total += rec.strokes;
      p.holes.push(rec);
    }
    if (hi < holes.length - 1 && !opts.noShop) for (const p of P) { const log = []; shop(p.S, p, rng, log); p.buys.push(log); }
  });
  return P;
}

module.exports = {
  E, BASE, CLUBS, BAG, MAXT, JOKERS, JK, GROUPS, GROUP_OF, PARAMS, ARCHETYPES, strat,
  makeCourse, holePool, pcfg, ptiers, QAgent, trainHole, shotPolicy, stateKey, actionsFor, decToShot, roll4, playGame, shop, makeOffers,
};
