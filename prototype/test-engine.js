// Run: node prototype/test-engine.js
require('./engine.js');
const E = globalThis.Engine;
const cfg = E.clone(E.DEFAULT_CONFIG);
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
// rule tests use tier 3 (100% distance, straight on 6-8); tier effects are tested separately
const tiers = Object.fromEntries(cfg.clubs.map((c) => [c.id, 3]).concat([['putter', 1]]));

const mk = (shapes) => E.prepHole({ board: { w: 340, h: 460 }, shapes, parOverride: null });
const sh = (kind, cx, cy, rx, ry, rotation = 0) => ({ id: kind + cx, kind, cx, cy, rx, ry, rotation });

console.log('rules');
{
  const H = mk([sh('tee', 170, 440, 4, 4), sh('pin', 170, 40, 4, 4), sh('green', 170, 40, 20, 15),
    sh('fairway', 170, 250, 30, 150), sh('bunker', 170, 250, 10, 10), sh('water', 170, 100, 60, 20)]);
  ok(E.lieAt(H, 170, 250) === 'bunker', 'lie priority: bunker over fairway');
  ok(E.lieAt(H, 170, 300) === 'fairway', 'fairway lie');
  ok(E.lieAt(H, 10, 10) === 'rough', 'bare table is rough');
  ok(E.lieAt(H, -1, 10) === 'ob', 'off board is ob');
  ok(E.parOf(H, cfg) === 4, 'par from 400 yd = 4');

  const s0 = E.startState(H);
  let threw = false;
  try { E.playShot(H, cfg, { ...s0, lie: 'fairway' }, { club: 'driver', power: 1, aim: H.pin }, tiers, { d1: 3, d2: 4, dir: 7 }); } catch (e) { threw = true; }
  ok(threw, 'driver only from tee');
  threw = false;
  try { E.playShot(H, cfg, { ...s0, lie: 'bunker' }, { club: 'w3', power: 1, aim: H.pin }, tiers, { d1: 3, d2: 4, dir: 7 }); } catch (e) { threw = true; }
  ok(threw, 'no wood from bunker');

  // driver 7 pips straight: 250 yd -> y=190 (fairway, past bunker centre 250? 440-250=190 -> fairway)
  const a = E.playShot(H, cfg, s0, { club: 'driver', power: 1, aim: H.pin }, tiers, { d1: 3, d2: 4, dir: 7 });
  ok(Math.abs(a.state.y - 190) < 1e-6 && a.state.strokes === 1 && a.state.lie === 'fairway', 'driver 250 yd straight lands on fairway');

  // OB: aim sideways
  const b = E.playShot(H, cfg, s0, { club: 'driver', power: 1, aim: { x: 500, y: 440 } }, tiers, { d1: 6, d2: 6, dir: 7 });
  ok(b.result.landLie === 'ob' && b.state.x === 170 && b.state.y === 440 && b.state.strokes === 2, 'OB: +1 and replay from same spot');

  // water: 7-iron from y=230, short result (2d6 = 4) = 140 yd -> y=90, in the water (y 80..120)
  const st = { ...s0, y: 230, lie: 'fairway' };
  const c = E.playShot(H, cfg, st, { club: 'i7', power: 1, aim: H.pin }, tiers, { d1: 2, d2: 2, dir: 7 });
  ok(c.result.landLie === 'water' && E.lieAt(H, c.state.x, c.state.y) !== 'water' && c.state.strokes === 2, 'water: +1, drop not in water');
  ok(c.state.y > 120, 'water drop walks back toward the shot origin');
}

console.log('lie modes');
{
  const H = mk([sh('tee', 170, 440, 4, 4), sh('pin', 170, 250, 4, 4), sh('water', 170, 250, 60, 45), sh('green', 170, 250, 20, 15)]);
  E.setLieMode({ rules: { lieMode: 'stacking' } });
  ok(E.lieAt(H, 170, 250) === 'green', 'stacking: green on top of water is an island');
  E.setLieMode({ rules: { lieMode: 'priority' } });
  ok(E.lieAt(H, 170, 250) === 'water', 'priority: water beats green');
  E.setLieMode(cfg);
}

console.log('trees block the line');
{
  const H = mk([sh('tee', 170, 440, 4, 4), sh('pin', 170, 40, 4, 4), sh('green', 170, 40, 20, 15), sh('trees', 170, 300, 20, 20)]);
  const r = E.playShot(H, cfg, E.startState(H), { club: 'driver', power: 1, aim: H.pin }, tiers, { d1: 3, d2: 4, dir: 7 });
  ok(r.result.blocked && r.state.lie === 'trees' && r.state.y > 300, 'ball stops at the near edge of the trees');
  const inside = { x: 170, y: 300, lie: 'trees', onGreen: false, holed: false, strokes: 1, putts: 0 };
  const r2 = E.playShot(H, cfg, inside, { club: 'i7', power: 1, aim: H.pin }, tiers, { d1: 3, d2: 4, dir: 7 });
  ok(!r2.result.blocked && r2.state.lie !== 'trees', 'playing out of trees ignores the trees you start in');
}

console.log('ring putting');
{
  const H = mk([sh('tee', 170, 440, 4, 4), sh('pin', 170, 40, 4, 4), sh('green', 170, 40, 30, 30)]); // legacy green: rings 4/9/14
  const st = { x: 170, y: 50, lie: 'green', onGreen: true, holed: false, strokes: 2, putts: 0 };
  ok(E.ringOf(H, st) === 3, '10 yd from the cup is ring 3');
  const go = (d1, d2, choice, t) => E.playShot(H, cfg, st, { putt: choice }, { ...tiers, putter: t || 1 }, { d1, d2, dir: 1 });
  ok(go(4, 5, 'risky').state.holed, 'risky from ring 3: 9 holes it');
  const b = go(4, 4, 'risky');
  ok(!b.state.holed && E.ringOf(H, b.state) === 2 && b.state.y < 40, 'risky miss rolls past the cup into ring 2');
  ok(!go(5, 6, 'safe').state.holed && go(6, 6, 'safe').state.holed, 'safe from ring 3: only a 12 drops');
  const c = go(2, 3, 'safe');
  ok(E.ringOf(H, c.state) === 1 && c.state.y > 40, 'safe miss → ring 1, same side');
  ok(go(3, 4, 'risky', 5).state.holed && !go(3, 3, 'risky', 5).state.holed, 'putter tier 5: risky from ring 3 needs 7 (9 − 2)');
  const far = { x: 170, y: 57, lie: 'green', onGreen: true, holed: false, strokes: 2, putts: 0 };
  ok(E.ringOf(H, far) === 4 && E.ringOf(H, E.playShot(H, cfg, far, { putt: 'safe' }, tiers, { d1: 1, d2: 1, dir: 1 }).state) === 2, 'SAFE miss from ring 4 → ring 2');
  const r1 = { x: 170, y: 43, lie: 'green', onGreen: true, holed: false, strokes: 2, putts: 0 };
  ok(E.playShot(H, cfg, r1, { putt: 'risky' }, tiers, { d1: 1, d2: 2, dir: 1 }).state.holed, 'ring 1 tap-in: 3+ drops');
  const RV = E.ringValues(cfg, 1);
  ok(RV.E[1] < RV.E[2] && RV.E[2] <= RV.E[3] && RV.E[3] <= RV.E[4], `expected putts by ring: ${RV.E.slice(1).map((v) => v.toFixed(2)).join(' / ')} · best: ${RV.best.slice(1).join(' ')}`);
  const RV5 = E.ringValues(cfg, 5);
  ok(RV5.E[3] < RV.E[3], `tier 5 putts by ring: ${RV5.E.slice(1).map((v) => v.toFixed(2)).join(' / ')} · best: ${RV5.best.slice(1).join(' ')}`);
}

console.log('green tiles');
{
  for (const t of E.GREEN_TILES) {
    const hole = { board: { w: 340, h: 460 }, parOverride: null, shapes: [{ id: 't', kind: 'green', tile: t.id, cx: 170, cy: 200, rx: 0, ry: 0, rotation: 37 }, sh('tee', 170, 440, 4, 4)] };
    const H = E.prepHole(hole);
    ok(E.lieAt(H, H.pin.x, H.pin.y) === 'green', `${t.name}: cup on the tile, rings ${t.rings.join('/')}`);
  }
}

console.log('club system v2');
{
  const H = mk([sh('tee', 170, 440, 4, 4), sh('pin', 170, 40, 4, 4), sh('green', 170, 40, 20, 15)]);
  const s0 = E.startState(H), i7 = E.getClub(cfg, 'i7'), dr = E.getClub(cfg, 'driver');
  const D = (club, pips, lie, tier, power) => E.clubDistance(cfg, club, pips, power || 1, lie || 'fairway', tier || 3);
  ok(cfg.clubs.length === 12 && cfg.clubs.filter((c) => c.powers).map((c) => c.id).join() === 'driver', '12 clubs, only the Driver has power levels');
  ok(D(i7, 3, 'fairway', 3) === 140 && D(i7, 7) === 150 && D(i7, 11) === 160, '7-iron at tier 3: short 140 / on target 150 / long 160');
  ok(D(i7, 7, 'fairway', 1) === 115 && D(i7, 7, 'fairway', 5) === 190 && D(dr, 7, 'tee', 1) === 190 && D(dr, 7, 'tee', 5) === 315, 'distance grows with tier: 7-iron 115 -> 190, Driver 190 -> 315 (75% -> 125%)');
  ok(E.zoneFor(cfg, 4, 1, 'fairway').idx === 0 && E.zoneFor(cfg, 4, 2, 'fairway').idx === 1 && E.zoneFor(cfg, 3, 4, 'fairway').idx === 1, 'upgrades widen on target (2d6 4 from tier 2, 3 from tier 4)');
  ok(D(i7, 7, 'rough') === 140 && D(i7, 11, 'rough') === 150 && D(i7, 11, 'bunker') === 140, 'rough drops one step, bunker two');
  ok(D(dr, 7, 'tee', 3, 0.5) === 125 && D(dr, 7, 'tee', 1, 0.5) === 95, 'Driver power levels scale with tier: 50% = 125 at tier 3, 95 at tier 1');
  const dirAt = (t, v) => E.playShot(H, cfg, s0, { club: 'i7', power: 1, aim: H.pin }, { ...tiers, i7: t }, { d1: 3, d2: 4, dir: v }).result.angle;
  ok(dirAt(1, 7) === 0 && dirAt(1, 6) === -6 && dirAt(1, 4) === -14 && dirAt(1, 12) === 24 && dirAt(5, 4) === 0 && dirAt(5, 12) === 6, 'direction: Bronze straight only on 7, very wide on 2/12; Diamond straight 4-10, never wider than slight');
  const pS = (t) => E.faceGroups(cfg.fans[t]).filter((g) => g.angle === 0).reduce((a, g) => a + g.p, 0);
  ok([1, 2, 3, 4, 5].map((t) => Math.round(pS(t) * 100)).join() === '17,17,44,67,83', `straight chance by tier: ${[1, 2, 3, 4, 5].map((t) => Math.round(pS(t) * 100) + '%').join(' / ')}`);
  const a = E.playShot(H, cfg, s0, { club: 'i7', power: 0.5, aim: H.pin }, tiers, { d1: 3, d2: 4, dir: 7 });
  ok(a.result.distance === 150, 'non-driver clubs ignore power (always full swing)');
  ok(a.result.calc.zone.label === 'On target' && a.result.faces.join() === '6,7,8', 'shot carries its zone and direction totals');
  ok(E.allowedClubs(cfg, 'bunker').map((c) => c.id).join() === 'i9,pw,sw,lw', 'from a bunker: 9-iron and wedges only');
}

console.log('bots + speed');
for (const preset of E.PRESETS) {
  const H = E.prepHole(preset);
  const ctx = E.botContext(cfg, tiers);
  for (const prof of E.PROFILES) {
    const agg = E.newAgg();
    const t = Date.now();
    for (let i = 0; i < 60; i++) E.addAgg(agg, E.simHole(H, cfg, prof, tiers, 1000 + i, ctx));
    const s = E.summarize(agg, cfg);
    console.log(`  ${preset.name.padEnd(20)} ${prof.name.padEnd(9)} par ${E.parOf(H, cfg)}  avg ${s.mean >= 0 ? '+' : ''}${s.mean.toFixed(2)}  putts ${s.puttsPerHole.toFixed(2)}  pickups ${(s.pickups * 100).toFixed(0)}%  ${((Date.now() - t) / 60).toFixed(1)} ms/hole`);
  }
}

console.log('generator');
{
  const rng = E.mulberry32(7);
  const pars = { 3: 0, 4: 0, 5: 0 };
  for (let i = 0; i < 60; i++) { const h = E.generateHole(rng, cfg); const H = E.prepHole(h); pars[E.parOf(H, cfg)]++; if (E.lieAt(H, H.pin.x, H.pin.y) !== 'green') fails++; }
  ok(true, `60 random holes, par mix ${JSON.stringify(pars)}, pins all on green`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
