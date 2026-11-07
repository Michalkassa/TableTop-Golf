#!/usr/bin/env node
// Tabletop Golf — reinforcement-learning balance run.
//   node simulations/run.js            (full run, uses every CPU core)
//   node simulations/run.js --quick    (small smoke run)
// Stage 1  Q-learning shot + putt agent (parallel workers, merged each round)
// Stage 2  Evolve a pro-shop strategy (cross-entropy method) with the learned agent swinging the clubs
// Stage 3  Tournament: thousands of 4-player tables mixing archetypes, the evolved strategy and the engine's expert bot
// Stage 4  Joker value (A/B with common dice), tier table, expert benchmark
// Writes simulations/results/*.json and simulations/REPORT.md
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os'), fs = require('fs'), path = require('path');
const L = require('./lib.js');
const { E } = L;

// ======================================================================= aggregation
function newAgg() {
  return {
    n: 0, wins: 0, tSum: 0, tSq: 0, hist: {}, hole: [], kinds: [{}, {}, {}], clubs: {}, power: {}, buys: {}, firstBuys: {},
    endJokers: {}, tickets: 0, rerolls: 0, coinsEnd: 0, earned: 0, tokens: 0, finalTier: {}, finalTierSum: 0,
  };
}
const HKEYS = ['diff', 'putts', 'long', 'pen', 'ob', 'water', 'straight', 'tok', 'coins', 'tierAvg', 'risky', 'safe', 'gir', 'jokers', 'mull', 'cad'];
const kindOf = (d) => (d <= -2 ? 'eagle+' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : d === 2 ? 'double' : 'triple+');
function addPlayer(a, p, won) {
  a.n++; a.wins += won; a.tSum += p.total; a.tSq += p.total * p.total;
  const b = Math.floor(p.total / 2) * 2; a.hist[b] = (a.hist[b] || 0) + 1;
  p.holes.forEach((h, i) => {
    const row = a.hole[i] || (a.hole[i] = Object.fromEntries(HKEYS.map((k) => [k, 0])));
    for (const k of HKEYS) row[k] += +h[k] || 0;
    const st = a.kinds[Math.min(2, Math.floor(i / 6))], k = kindOf(h.diff); st[k] = (st[k] || 0) + 1;
    for (const c of h.clubs) { const id = c.split('@')[0]; a.clubs[id] = (a.clubs[id] || 0) + 1; if (id === 'driver') { const pw = c.split('@')[1] || '1'; a.power[pw] = (a.power[pw] || 0) + 1; } }
  });
  const flat = p.buys.flat();
  flat.forEach((id, i) => { a.buys[id] = (a.buys[id] || 0) + 1; if (i < 3) a.firstBuys[id] = (a.firstBuys[id] || 0) + 1; });
  for (const j of p.jokers) a.endJokers[j] = (a.endJokers[j] || 0) + 1;
  a.rerolls += p.rerolls; a.coinsEnd += p.coins; a.earned += p.earned; a.tokens += p.tokens;
  for (const [id, t] of Object.entries(p.tiers)) a.finalTier[id] = (a.finalTier[id] || 0) + t;
}
function mergeAgg(x, y) {
  if (!x) return y;
  for (const k of ['n', 'wins', 'tSum', 'tSq', 'tickets', 'rerolls', 'coinsEnd', 'earned', 'tokens']) x[k] += y[k];
  for (const k of ['hist', 'clubs', 'power', 'buys', 'firstBuys', 'endJokers', 'finalTier']) for (const [kk, v] of Object.entries(y[k])) x[k][kk] = (x[k][kk] || 0) + v;
  y.hole.forEach((r, i) => { if (!x.hole[i]) x.hole[i] = { ...r }; else for (const k of HKEYS) x.hole[i][k] += r[k]; });
  y.kinds.forEach((s, i) => { for (const [k, v] of Object.entries(s)) x.kinds[i][k] = (x.kinds[i][k] || 0) + v; });
  return x;
}
const mergeMap = (A, B) => { for (const k in B) A[k] = mergeAgg(A[k], B[k]); return A; };

// ======================================================================= worker
if (!isMainThread) {
  const course = L.makeCourse();
  let agent = null;
  parentPort.on('message', (m) => {
    const rng = E.mulberry32(m.seed);
    if (m.agent) agent = L.QAgent.from(m.agent);
    if (m.type === 'train') {
      const ag = L.QAgent.from(m.agent), pool = L.holePool(m.seed * 7 + 1, 300).concat(course, course);
      let s = 0;
      for (let i = 0; i < m.holes; i++) {
        const H = pool[Math.floor(rng() * pool.length)], T = 1 + Math.floor(rng() * L.MAXT);
        const tiers = Object.fromEntries(L.BAG.map((id) => [id, T]));
        if (rng() < 0.5) for (const id of L.BAG) tiers[id] = Math.max(1, Math.min(L.MAXT, T + Math.floor(rng() * 3) - 1)); // mixed bags too
        s += L.trainHole(ag, H, tiers, rng, m.eps, m.alpha) - H.par;
      }
      // only send back what this worker touched
      const out = new L.QAgent();
      for (const [k, n] of ag.N) if (n > (agent && agent.N.get(k) || 0)) { out.Q.set(k, ag.Q.get(k)); out.N.set(k, n - ((agent && agent.N.get(k)) || 0)); }
      return parentPort.postMessage({ agent: out.toJSON(), avg: s / m.holes });
    }
    if (m.type === 'eval') { // fitness of shop strategies: solo 18-hole games, common seeds across candidates
      const res = m.strats.map((S) => {
        let t = 0;
        for (let g = 0; g < m.games; g++) t += L.playGame(course, [{ strat: S, shot: 'rl' }], E.mulberry32(m.seed + g), agent)[0].total;
        return t / m.games;
      });
      return parentPort.postMessage({ res });
    }
    if (m.type === 'tables') { // tournament tables
      const A = {};
      for (let g = 0; g < m.tables; g++) {
        const idx = []; while (idx.length < m.seatsPerTable) idx.push(Math.floor(rng() * m.strats.length));
        const ss = (m.fixed || idx.map((i) => m.strats[i])).map((S) => ({ strat: S, shot: S.shot || 'rl' }));
        const P = L.playGame(course, ss, rng, agent);
        const best = Math.min(...P.map((p) => p.total)), nb = P.filter((p) => p.total === best).length;
        for (const p of P) addPlayer(A[p.S.name] || (A[p.S.name] = newAgg()), p, p.total === best ? 1 / nb : 0);
      }
      return parentPort.postMessage({ A });
    }
    if (m.type === 'joker') { // marginal value of starting with one joker (same dice with and without)
      const A = {};
      for (const j of m.jokers) {
        let base = 0, withJ = 0, coinsB = 0, coinsJ = 0;
        for (let g = 0; g < m.games; g++) {
          const s = m.seed * 1000 + g;
          const a = L.playGame(course, [{ strat: m.strat, shot: m.shot }], E.mulberry32(s), agent)[0];
          const isT = L.JK[j].type === 'ticket';
          const b = L.playGame(course, [{ strat: m.strat, shot: 'rl', startJokers: isT ? [] : [j], startTickets: isT ? [j] : [], shot: m.shot }], E.mulberry32(s), agent)[0];
          base += a.total; withJ += b.total; coinsB += a.earned; coinsJ += b.earned;
        }
        A[j] = { games: m.games, base, withJ, coinsB, coinsJ };
      }
      return parentPort.postMessage({ A });
    }
    if (m.type === 'tiers') { // uniform tiers, no shop: how strong is each tier on its own?
      const A = {};
      for (const T of [1, 2, 3, 4, 5]) for (const shot of m.shots) {
        const key = `${shot}|${T}`, a = newAgg();
        const n = shot === 'rl' ? m.games : m.evGames;
        for (let g = 0; g < n; g++) { const P = L.playGame(course, [{ strat: L.ARCHETYPES[0], shot, startTier: T }], rng, agent, { noShop: true }); addPlayer(a, P[0], 0); }
        A[key] = a;
      }
      return parentPort.postMessage({ A });
    }
  });
  return;
}

// ======================================================================= main
const QUICK = process.argv.includes('--quick');
const NW = Math.max(1, os.cpus().length - 0);
const OUT = path.join(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });
const workers = Array.from({ length: NW }, () => new Worker(__filename));
const call = (w, msg) => new Promise((res) => { w.once('message', res); w.postMessage(msg); });
const all = (msgs) => Promise.all(msgs.map((m, i) => call(workers[i % NW], m)));
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const SCALE = QUICK ? 0.05 : 1;
const N = (x) => Math.max(1, Math.round(x * SCALE));

(async () => {
  const meta = { workers: NW, quick: QUICK, started: new Date().toISOString(), engine: E.DEFAULT_CONFIG.version };
  // ---------------- Stage 1: Q-learning
  const ROUNDS = QUICK ? 3 : 12, HOLES = N(60000);
  let agent = new L.QAgent();
  const curve = [];
  for (let r = 0; r < ROUNDS; r++) {
    const eps = Math.max(0.03, 0.35 * Math.pow(0.72, r)), alpha = Math.max(0.02, 0.15 * Math.pow(0.8, r));
    const res = await all(workers.map((_, i) => ({ type: 'train', seed: 1000 * r + i + 1, holes: HOLES, eps, alpha, agent: agent.toJSON() })));
    const deltas = res.map((x) => L.QAgent.from(x.agent));
    // merge: update each touched entry with the visit-weighted mean of the workers' values, keep global counts
    const merged = L.QAgent.merge(deltas);
    for (const [k, v] of merged.Q) { const n0 = agent.N.get(k) || 0, n1 = merged.N.get(k) || 0; agent.Q.set(k, n0 + n1 ? (agent.Q.has(k) ? (agent.Q.get(k) * n0 * 0.25 + v * n1) / (n0 * 0.25 + n1) : v) : v); agent.N.set(k, n0 + n1); }
    const avg = res.reduce((s, x) => s + x.avg, 0) / res.length;
    curve.push({ round: r + 1, holes: (r + 1) * HOLES * NW, eps: +eps.toFixed(3), overPar: +avg.toFixed(3), states: agent.Q.size });
    log(`Q round ${r + 1}/${ROUNDS}  ε=${eps.toFixed(2)}  avg ${avg >= 0 ? '+' : ''}${avg.toFixed(3)}/hole (with exploration)  table ${agent.Q.size}`);
  }
  const AG = agent.toJSON();
  fs.writeFileSync(path.join(OUT, 'q-agent.json'), JSON.stringify({ size: agent.Q.size }));

  // ---------------- Stage 4a: tier table (uniform tiers, no shop) — RL vs the engine's bots
  const tierRes = mergeMap({}, {});
  {
    const res = await all(workers.map((_, i) => ({ type: 'tiers', seed: 77 + i, games: N(120), evGames: N(6), shots: ['rl', 'expert', 'beginner'], agent: AG })));
    for (const x of res) mergeMap(tierRes, x.A);
    log('tier table done');
  }

  // ---------------- Stage 2: evolve a shop strategy (cross-entropy method)
  const P = L.PARAMS, POP = QUICK ? 20 : 80, ELITE = Math.round(POP / 5), GENS = QUICK ? 3 : 18, GAMES = N(48);
  const lo = { reserve: 0, rerollBelow: -3 }, hi = { reserve: 6, rerollBelow: 3 };
  let mu = Object.fromEntries(P.map((k) => [k, k === 'reserve' ? 1 : k === 'rerollBelow' ? -1 : k === 'lowTierBias' ? 0.5 : k.startsWith('j_') ? -0.5 : 1]));
  let sd = Object.fromEntries(P.map((k) => [k, k === 'reserve' ? 2 : 1.5]));
  const cemRng = E.mulberry32(4242), gauss = () => { let u = 0, v = 0; while (!u) u = cemRng(); while (!v) v = cemRng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const cem = [];
  let bestEver = null;
  for (let g = 0; g < GENS; g++) {
    const pop = Array.from({ length: POP }, (_, i) => {
      const s = L.strat(`cand${i}`, {});
      for (const k of P) { let v = mu[k] + sd[k] * gauss(); if (k in lo) v = Math.max(lo[k], Math.min(hi[k], v)); if (k === 'reserve') v = Math.round(v); s[k] = v; }
      return s;
    });
    const chunks = workers.map((_, i) => pop.filter((__, j) => j % NW === i));
    const res = await all(chunks.map((c) => ({ type: 'eval', seed: 50000 + g * 997, games: GAMES, strats: c, agent: AG })));
    const scored = [];
    chunks.forEach((c, i) => c.forEach((s, j) => scored.push({ s, f: res[i].res[j] })));
    scored.sort((a, b) => a.f - b.f);
    const el = scored.slice(0, ELITE).map((x) => x.s);
    for (const k of P) {
      const m = el.reduce((a, s) => a + s[k], 0) / ELITE;
      const v = el.reduce((a, s) => a + (s[k] - m) ** 2, 0) / ELITE;
      mu[k] = m; sd[k] = Math.max(0.15, Math.sqrt(v) * 0.9 + 0.05);
    }
    if (!bestEver || scored[0].f < bestEver.f) bestEver = { f: scored[0].f, s: scored[0].s };
    cem.push({ gen: g + 1, best: +scored[0].f.toFixed(2), eliteMean: +(scored.slice(0, ELITE).reduce((a, x) => a + x.f, 0) / ELITE).toFixed(2), popMean: +(scored.reduce((a, x) => a + x.f, 0) / POP).toFixed(2) });
    log(`CEM gen ${g + 1}/${GENS}  best ${scored[0].f.toFixed(2)}  elite ${cem[g].eliteMean}  pop ${cem[g].popMean}`);
  }
  const EVOLVED = L.strat('RL evolved shopper', Object.fromEntries(P.map((k) => [k, k === 'reserve' ? Math.round(mu[k]) : mu[k]])));

  // ---------------- Stage 3: tournament (4-player tables, random mix of strategies)
  const field = [...L.ARCHETYPES, EVOLVED];
  const tour = {};
  {
    const res = await all(workers.map((_, i) => ({ type: 'tables', seed: 9000 + i, tables: N(2500), seatsPerTable: 4, strats: field, agent: AG })));
    for (const x of res) mergeMap(tour, x.A);
    log(`tournament done: ${Object.values(tour).reduce((a, x) => a + x.n, 0)} bot-games`);
  }
  // Head-to-head: evolved shopper vs the game's own CPU shopping, both swinging with the RL agent
  const h2h = {};
  {
    const cpu = L.ARCHETYPES.find((s) => s.cpu);
    const res = await all(workers.map((_, i) => ({ type: 'tables', seed: 12000 + i, tables: N(1000), seatsPerTable: 2, strats: [EVOLVED, cpu], fixed: [EVOLVED, cpu], agent: AG })));
    for (const x of res) mergeMap(h2h, x.A);
  }
  // Expert benchmark: 4 engine expert bots with the game's CPU shopping (what a strong human table looks like)
  const expert = {};
  {
    const cpu = { ...L.ARCHETYPES.find((s) => s.cpu), name: 'Expert planner + CPU shop', shot: 'expert' };
    const res = await all(workers.map((_, i) => ({ type: 'tables', seed: 15000 + i, tables: N(24), seatsPerTable: 4, strats: [cpu], fixed: [cpu, cpu, cpu, cpu], agent: AG })));
    for (const x of res) mergeMap(expert, x.A);
    log('expert benchmark done');
  }

  // ---------------- Stage 4b: joker value
  const jok = {};
  {
    const ids = L.JOKERS.map((j) => j.id);
    const res = await all(workers.map((_, i) => ({ type: 'joker', seed: 300 + i, games: N(36), jokers: ids, strat: L.ARCHETYPES[1], shot: 'expert', agent: AG })));
    for (const x of res) for (const [k, v] of Object.entries(x.A)) { const a = jok[k] || (jok[k] = { games: 0, base: 0, withJ: 0, coinsB: 0, coinsJ: 0 }); for (const kk in v) a[kk] += v[kk]; }
    log('joker A/B done');
  }

  meta.seconds = Math.round((Date.now() - t0) / 1000);
  const course = L.makeCourse();
  const data = { meta, curve, cem, evolved: EVOLVED, tierRes, tour, h2h, expert, jok, course: course.map((h, i) => ({ hole: i + 1, par: h.par, yd: Math.round(E.dist(h.tee, h.pin)) })) };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(data, null, 1));
  require('./report.js')(data, path.join(__dirname, 'REPORT.md'));
  log('wrote simulations/results/results.json and simulations/REPORT.md');
  for (const w of workers) w.terminate();
})();
