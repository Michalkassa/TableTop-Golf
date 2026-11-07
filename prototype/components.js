/* Tabletop Golf — physical components generated from the rules config.
 * Every piece is an SVG at true scale (1 user unit = 1 mm). Long game: 1 mm = 1 yd.
 * Distances come from Engine.clubDistance, so the printed tools match the simulation exactly.
 * Works in the browser (after engine.js) and in node (require engine.js first). */
(function (root) {
  'use strict';
  const E = root.Engine;

  const CLUB_COLORS = { driver: '#1f4e9c', wood: '#8a5a2b', iron: '#4f5d68', wedge: '#c0501f', punch: '#6b3fa0', putter: '#1e7a45' };
  const LIE_TINT = { tee: '#e4efd9', fairway: '#e4efd9', rough: '#eef0d8', trees: '#dde8dc', bunker: '#f6ecd2' };
  const kindOf = (id) => (id === 'putter' ? 'putter' : (E.getClub && E.getClub(root.__cfgForKind || E.DEFAULT_CONFIG, id) || {}).kind || id);
  const colorOf = (id) => CLUB_COLORS[id] || CLUB_COLORS[kindOf(id)] || '#444';
  const f = (v) => Math.round(v * 100) / 100;
  const POW = (p) => ({ 1: 'Full', 0.75: '¾', 0.5: '½', 0.25: '¼' }[p] || Math.round(p * 100) + '%');
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const FONT = 'font-family="Helvetica, Arial, sans-serif"';
  const pipProb = (p) => (6 - Math.abs(p - 7)) / 36;

  function dieIcon(cx, cy, s, face, fill, ink) {
    fill = fill || '#fff'; ink = ink || '#111';
    const r = s * 0.1, o = s * 0.26;
    const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[face];
    let s2 = `<rect x="${f(cx - s / 2)}" y="${f(cy - s / 2)}" width="${f(s)}" height="${f(s)}" rx="${f(s * 0.18)}" fill="${fill}" stroke="${ink}" stroke-width="${f(s * 0.06)}"/>`;
    for (const [a, b] of P) s2 += `<circle cx="${f(cx + a * o)}" cy="${f(cy + b * o)}" r="${f(r)}" fill="${ink}"/>`;
    return s2;
  }
  function tierPips(x, y, tier, size, color, ring) {
    let s = '';
    for (let i = 1; i <= E.MAX_TIER; i++) s += `<circle cx="${f(x + (i - 1) * size * 1.45)}" cy="${f(y)}" r="${f(size / 2)}" fill="${i <= tier ? color : 'none'}" stroke="${ring || color}" stroke-width="${f(size * 0.16)}"/>`;
    return s;
  }
  function wrap(c, pxPerMm) {
    const size = pxPerMm ? `width="${f(c.w * pxPerMm)}" height="${f(c.h * pxPerMm)}"` : `width="${f(c.w)}mm" height="${f(c.h)}mm"`;
    return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="${f(c.x)} ${f(c.y)} ${f(c.w)} ${f(c.h)}" ${FONT}>${c.body}</svg>`;
  }

  // A row of labelled ticks. items: [{x, label, weight 0..1}]. Pills that would overlap go to a second lane.
  function tickRow(y0, rowH, items, color) {
    let s = '';
    const lanes = [-1e9, -1e9];
    const ph = 3.1, fs = 2.3;
    const laneY = [y0 + rowH * 0.45, y0 + rowH * 0.45 + ph + 0.3];
    items.sort((a, b) => a.x - b.x);
    for (const it of items) {
      const w = 3.3 + (it.label.length - 1) * 1.25;
      let lane = it.x - w / 2 >= lanes[0] + 0.4 ? 0 : 1;
      if (lane === 1 && it.x - w / 2 < lanes[1] + 0.4) lane = 0;
      lanes[lane] = it.x + w / 2;
      const cy = rowH > 8 ? laneY[lane] : y0 + rowH * 0.55;
      const op = Math.min(0.92, 0.22 + it.weight * 4.2);
      s += `<line x1="${f(it.x)}" y1="${f(y0)}" x2="${f(it.x)}" y2="${f(cy - ph / 2)}" stroke="${color}" stroke-width="0.3"/>`;
      s += `<rect x="${f(it.x - w / 2)}" y="${f(cy - ph / 2)}" width="${f(w)}" height="${ph}" rx="${ph / 2}" fill="${color}" fill-opacity="${f(op)}"/>`;
      s += `<text x="${f(it.x)}" y="${f(cy + fs * 0.36)}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${op > 0.45 ? '#fff' : '#111'}">${it.label}</text>`;
    }
    return s;
  }
  function groupLabel(pips) {
    if (pips.length === 1) return String(pips[0]);
    if (pips.length === 2) return pips.join('·');
    return `${pips[0]}–${pips[pips.length - 1]}`;
  }
  function edgeScale(L, unitMm, labelEvery, labelUnit) {
    // ticks above the measuring edge (y=0), one every unit
    let s = '';
    const n = Math.floor((L - 2) / unitMm);
    for (let i = 1; i <= n; i++) {
      const x = i * unitMm, big = i % labelEvery === 0, mid = i % (labelEvery / 5) === 0 || i % 2 === 0;
      const len = big ? 4 : mid ? 2.4 : 1.4;
      s += `<line x1="${f(x)}" y1="0" x2="${f(x)}" y2="${-len}" stroke="#222" stroke-width="${big ? 0.3 : 0.16}"/>`;
      if (big) s += `<text x="${f(x + 0.6)}" y="-4.4" font-size="2.5" fill="#222">${i * labelUnit}</text>`;
    }
    return s;
  }

  // ------------------------------------------------------- v2: bag ruler
  // One shared ruler (1 mm = 1 yd) with a named mark for every club, plus D25–D100 for the Driver.
  // Notches every 10 yd: SHORT is one notch before a club's mark, LONG one notch past it. No other numbers.
  const SHORTS = { tee: 'TEE', fairway: 'FAIRWAY', rough: 'ROUGH', bunker: 'BUNKER', trees: 'TREES' };
  function bagRuler(cfg) {
    const tail = 26, top = 16, L = 290, H = 46, notch = cfg.notchYd || 10;
    let s = `<rect x="${-tail}" y="${-top}" width="${tail + L}" height="${H}" rx="3" fill="#fbfaf5" stroke="#1a1a1a" stroke-width="0.35"/>`;
    s += `<path d="M ${-tail + 3} ${-top} H ${-tail + 10} V ${H - top} H ${-tail + 3} A 3 3 0 0 1 ${-tail} ${H - top - 3} V ${-top + 3} A 3 3 0 0 1 ${-tail + 3} ${-top} Z" fill="#1b1b1b"/>`;
    s += `<text transform="translate(${-tail + 6.6} ${f(-top + H / 2)}) rotate(-90)" text-anchor="middle" font-size="3.6" font-weight="800" fill="#fff" letter-spacing="0.5">BAG RULER</text>`;
    s += `<line x1="-4" y1="0" x2="${L - 2}" y2="0" stroke="#111" stroke-width="0.45"/>`;
    for (let x = notch; x < L - 3; x += notch) s += `<line x1="${x}" y1="0" x2="${x}" y2="${x % 50 === 0 ? 2.6 : 1.6}" stroke="#555" stroke-width="0.2"/>`;
    // distances change with the club's tier, so they're printed on the cards; the ruler is plain yardage
    for (let x = 50; x < L - 3; x += 50) s += `<text x="${x}" y="-3" text-anchor="middle" font-size="3.2" font-weight="800" fill="#333">${x}</text>`;
    for (let x = 10; x < L - 3; x += 10) if (x % 50) s += `<text x="${x}" y="-2.6" text-anchor="middle" font-size="1.8" fill="#888">${x}</text>`;
    s += `<circle cx="0" cy="0" r="2.2" fill="#fff" stroke="#111" stroke-width="0.35"/><circle cx="0" cy="0" r="0.5" fill="#111"/>`;
    s += `<text x="0" y="-3.2" text-anchor="middle" font-size="1.9" font-weight="700" fill="#111">BALL</text>`;
    const drops = Object.entries(cfg.lieDrop || {}).filter(([, d]) => d).map(([l, d]) => `${SHORTS[l] || l} −${d}`).join('  ·  ');
    s += `<text x="4" y="${H - top - 3.4}" font-size="2.3" fill="#333"><tspan font-weight="800">SHORT</tspan> = 10 yd less than the card · <tspan font-weight="800">LONG</tspan> = 10 yd more · from the rough / bunker / trees the result drops steps: ${drops}</text>`;
    return { x: -tail, y: -top, w: tail + L, h: H, body: s, name: 'bag-ruler', title: 'Bag ruler (shared)' };
  }

  // ------------------------------------------------------- v2: shared fan
  // Five lines, no numbers: the club card says which die faces go WIDE, SLIGHT or STRAIGHT.
  const DIRCOL = { verywide: '#c83a3a', wide: '#e07a3f', slight: '#e8b630', straight: '#2e9a4f' };
  const DIRNAME = { verywide: 'VERY WIDE', wide: 'WIDE', slight: 'SLIGHT', straight: 'STRAIGHT' };
  function sharedFan(cfg) {
    const angles = [...new Set(Object.values(cfg.fans).flat())].sort((a, b) => a - b);
    const outer = Math.max(...angles.map(Math.abs)), R = 105, hub = 16, half = outer + 7;
    const rad = (d) => ((d - 90) * Math.PI) / 180, pt = (d, r) => [f(r * Math.cos(rad(d))), f(r * Math.sin(rad(d)))];
    const kind = (a) => E.dirKind(a);
    let s = '';
    const [ax, ay] = pt(-half, hub), [bx, by] = pt(-half, R), [cx, cy] = pt(half, R), [dx, dy] = pt(half, hub);
    s += `<path d="M ${ax} ${ay} L ${bx} ${by} A ${R} ${R} 0 0 1 ${cx} ${cy} L ${dx} ${dy} Z" fill="#888" fill-opacity="0.06" stroke="#555" stroke-width="0.35"/>`;
    for (const a of angles) {
      const k = kind(a), [x1, y1] = pt(a, hub + 2), [x2, y2] = pt(a, R), [tx, ty] = pt(a, R + 6);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${DIRCOL[k]}" stroke-width="${a === 0 ? 1.1 : 0.8}"/>`;
      s += `<text transform="translate(${tx} ${ty}) rotate(${a})" text-anchor="middle" font-size="2.6" font-weight="800" fill="${DIRCOL[k]}">${DIRNAME[k]}</text>`;
    }
    s += `<circle cx="0" cy="0" r="${hub}" fill="#fff" stroke="#555" stroke-width="0.35"/><text x="0" y="-6" text-anchor="middle" font-size="3.2" font-weight="800" fill="#333">FAN</text>`;
    s += `<text x="0" y="8" text-anchor="middle" font-size="2" fill="#555">centre line on your aim</text>`;
    s += `<circle cx="0" cy="0" r="2.2" fill="#fff" stroke="#111" stroke-width="0.35"/><circle cx="0" cy="0" r="0.5" fill="#111"/>`;
    const halfW = R * Math.sin((half * Math.PI) / 180) + 10;
    return { x: -halfW, y: -(R + 12), w: halfW * 2, h: R + 12 + hub + 4, body: s, name: 'shared-fan', title: 'Fan (shared)' };
  }

  // ------------------------------------------------------- v2: club cards
  // A card shows only: name, picture, tier, a distance strip (2d6 totals: short / on target / long)
  // and a direction strip (die faces: wide / slight / straight). Distances live on the bag ruler.
  const ZCOL = ['#3b5dc9', '#f4f2ea', '#c0392b'], ZINK = ['#fff', '#222', '#fff'];
  function clubCard(cfg, id, tier) {
    const club = E.getClub(cfg, id), T = TIER_STYLE[tier], uid = `${id}${tier}`, W = 63, Hc = 88, kind = club.kind;
    let s = `<defs><linearGradient id="fr${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.a}"/><stop offset="1" stop-color="${T.b}"/></linearGradient>
      <clipPath id="art${uid}"><rect x="4" y="14.5" width="55" height="29" rx="2"/></clipPath></defs>`;
    s += `<rect width="${W}" height="${Hc}" rx="3.5" fill="url(#fr${uid})"/><rect x="2.2" y="2.2" width="${W - 4.4}" height="${Hc - 8.6}" rx="2.4" fill="#fffdf7"/>`;
    s += `<text x="5" y="10.6" font-size="${club.name.length > 9 ? 4.2 : 5.4}" font-weight="800" fill="#1b1b1b">${club.name.toUpperCase()}</text>`;
    const yd = E.baseDistance(cfg, club, 1, tier);
    s += `<rect x="38" y="38" width="20" height="7.5" rx="2" fill="#1b1b1b" fill-opacity="0.85"/><text x="48" y="43.6" text-anchor="middle" font-size="4.2" font-weight="800" fill="#fff">${yd} YD</text>`;
    s += `<circle cx="54" cy="8.3" r="4.4" fill="url(#fr${uid})" stroke="#fff" stroke-width="0.6"/><text x="54" y="10.1" text-anchor="middle" font-size="4.8" font-weight="800" fill="#fff">${tier}</text>`;
    s += `<g clip-path="url(#art${uid})"><g transform="translate(4 14.5)">${clubArt(kind === 'driver' ? 'driver' : kind, tier, uid)}</g></g>`;
    s += `<rect x="4" y="14.5" width="55" height="29" rx="2" fill="none" stroke="${T.b}" stroke-width="0.5"/>`;
    // distance strip
    s += `<text x="5" y="49" font-size="2.4" font-weight="800" fill="#333" letter-spacing="0.3">DISTANCE · 2 DICE</text>`;
    for (let v = 2; v <= 12; v++) {
      const z = E.zoneFor(cfg, v, tier, 'fairway').idx, x = 4 + (v - 2) * 5;
      s += `<rect x="${x}" y="50.5" width="4.6" height="7" rx="0.6" fill="${ZCOL[z]}" stroke="#333" stroke-width="0.25"/><text x="${f(x + 2.3)}" y="55.2" text-anchor="middle" font-size="${v >= 10 ? 2.2 : 2.7}" font-weight="800" fill="${ZINK[z]}">${v}</text>`;
    }
    s += `<text x="5" y="61" font-size="2.1" fill="${ZCOL[0]}" font-weight="800">SHORT</text><text x="31.5" y="61" text-anchor="middle" font-size="2.1" fill="#555" font-weight="800">ON TARGET</text><text x="58" y="61" text-anchor="end" font-size="2.1" fill="${ZCOL[2]}" font-weight="800">LONG</text>`;
    // direction strip
    s += `<text x="5" y="66.4" font-size="2.4" font-weight="800" fill="#333" letter-spacing="0.3">DIRECTION · 2 RED DICE</text>`;
    const fan = E.fanFor(cfg, club, tier), outer = Math.max(...Object.values(cfg.fans).flat().map(Math.abs));
    fan.forEach((a, i) => {
      const k = E.dirKind(a), x = 4 + i * 5, v = i + 2;
      s += `<rect x="${x}" y="67.8" width="4.6" height="7" rx="0.6" fill="${DIRCOL[k]}" stroke="#333" stroke-width="0.25"/><text x="${f(x + 2.3)}" y="72.5" text-anchor="middle" font-size="${v >= 10 ? 2.2 : 2.7}" font-weight="800" fill="#fff">${v}</text>`;
    });
    s += `<text x="5" y="78.4" font-size="2.1" fill="${DIRCOL.verywide}" font-weight="800">WIDE</text><text x="31.5" y="78.4" text-anchor="middle" font-size="2.1" fill="${DIRCOL.straight}" font-weight="800">STRAIGHT</text><text x="58" y="78.4" text-anchor="end" font-size="2.1" fill="${DIRCOL.verywide}" font-weight="800">WIDE</text>`;
    s += `<text x="31.5" y="${Hc - 2.6}" text-anchor="middle" font-size="2.3" font-weight="800" fill="#fff" letter-spacing="0.6">${T.name.toUpperCase()}${club.powers ? ' · 4 POWER MARKS' : ''}</text>`;
    return { x: 0, y: 0, w: W, h: Hc, body: s, name: `${id}-t${tier}-card`, title: `${club.name} T${tier} card` };
  }

  // --------------------------------------------------------- putter strip
  // Ring putting: one strip per putter tier with the go-for-it number for each ring.
  function ringIcon(cx, cy, ring, scale) {
    const R = [2, 3.6, 5.2, 6.8].map((r) => r * (scale || 1));
    let s = `<circle cx="${cx}" cy="${cy}" r="${R[3]}" fill="#2e8a48"/>`;
    const inner = ring === 1 ? 0 : R[ring - 2], outer = R[ring - 1];
    s += `<path d="M ${f(cx - outer)} ${cy} a ${outer} ${outer} 0 1 0 ${f(2 * outer)} 0 a ${outer} ${outer} 0 1 0 ${f(-2 * outer)} 0 ${inner ? `M ${f(cx - inner)} ${cy} a ${inner} ${inner} 0 1 1 ${f(2 * inner)} 0 a ${inner} ${inner} 0 1 1 ${f(-2 * inner)} 0` : ''}" fill="#ffd84a" fill-rule="evenodd"/>`;
    for (const r of R.slice(0, 3)) s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-width="0.35"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="0.7" fill="#111"/>`;
    return s;
  }
  // One card per putter tier. Read it row by row: find your ring, then read across.
  // Each choice has two boxes: the roll that puts it IN, and where the ball goes if you MISS.
  // opts.ring highlights one row; opts.interactive adds clickable areas (data-choice) on that row.
  function putterStrip(cfg, tier, opts) {
    opts = opts || {};
    const color = colorOf('putter'), P = cfg.putting, SAFE = '#2f6db5', RISKY = '#c62f24';
    const tail = 22, top = 3, L = 132, headH = 15, rowH = 14.5, H = top + headH + 4 * rowH + 4;
    const inTxt = (t) => (t <= 2 ? 'IN' : t > 12 ? '–' : t === 12 ? '12' : t + '+');
    let s = `<rect x="${-tail}" y="${-top}" width="${tail + L}" height="${H}" rx="3" fill="#fbfaf5" stroke="#1a1a1a" stroke-width="0.35"/>`;
    s += `<path d="M ${-tail + 3} ${-top} H ${-tail + 11} V ${H - top} H ${-tail + 3} A 3 3 0 0 1 ${-tail} ${H - top - 3} V ${-top + 3} A 3 3 0 0 1 ${-tail + 3} ${-top} Z" fill="${color}"/>`;
    s += `<text transform="translate(${-tail + 7} ${f(-top + H / 2)}) rotate(-90)" text-anchor="middle" font-size="4.4" font-weight="800" fill="#fff" letter-spacing="0.8">PUTTER</text>`;
    s += `<text x="-5.5" y="${f(H / 2 - 5)}" font-size="4.4" font-weight="800" fill="${color}" text-anchor="middle">T${tier}</text>`;
    for (let k = 0; k < E.MAX_TIER; k++) s += `<circle cx="-5.5" cy="${f(H / 2 - 1 + k * 3)}" r="1" fill="${k < tier ? color : 'none'}" stroke="${color}" stroke-width="0.3"/>`;
    // columns
    const X = { ring: 0, safeIn: 33, safeMiss: 56, riskyIn: 83, riskyMiss: 106 }, cw = 22, bw = 45;
    // header
    s += `<rect x="${X.safeIn}" y="0" width="${bw}" height="7" rx="2" fill="${SAFE}"/><text x="${X.safeIn + bw / 2}" y="5.1" text-anchor="middle" font-size="4" font-weight="800" fill="#fff">SAFE</text>`;
    s += `<rect x="${X.riskyIn}" y="0" width="${bw}" height="7" rx="2" fill="${RISKY}"/><text x="${X.riskyIn + bw / 2}" y="5.1" text-anchor="middle" font-size="4" font-weight="800" fill="#fff">RISKY</text>`;
    for (const [x, t] of [[X.safeIn, 'IN on'], [X.safeMiss, 'MISS →'], [X.riskyIn, 'IN on'], [X.riskyMiss, 'MISS →']]) {
      s += `<text x="${x + cw / 2}" y="12.4" text-anchor="middle" font-size="2.8" font-weight="800" fill="#555">${t}</text>`;
    }
    s += `<text x="${X.ring + 2}" y="12.4" font-size="2.8" font-weight="800" fill="#555">BALL IN</text>`;
    const ringBadge = (cx, cy, n) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="3.4" fill="#2e8a48"/><text x="${f(cx)}" y="${f(cy + 1.5)}" text-anchor="middle" font-size="4.2" font-weight="800" fill="#fff">${n}</text>`;
    for (let r = 1; r <= 4; r++) {
      const y = top + headH + (r - 1) * rowH - 2, cy = y + rowH / 2;
      const on = opts.ring === r, dim = opts.ring && !on;
      s += `<g opacity="${dim ? 0.35 : 1}">`;
      if (on) s += `<rect x="-1.5" y="${f(y - 0.6)}" width="${L - 1}" height="${f(rowH + 0.2)}" rx="2.5" fill="#ffd84a" fill-opacity="0.45"/>`;
      else if (r % 2 === 0) s += `<rect x="-1.5" y="${f(y - 0.6)}" width="${L - 1}" height="${f(rowH + 0.2)}" rx="2.5" fill="#000" fill-opacity="0.03"/>`;
      s += ringIcon(f(X.ring + 7), f(cy), r, 0.8);
      s += `<text x="${X.ring + 14.5}" y="${f(cy + 1.6)}" font-size="4.6" font-weight="800" fill="#1b1b1b">RING ${r}</text>`;
      const cellBox = (x, col, fillOp) => `<rect x="${x}" y="${f(y + 0.6)}" width="${cw}" height="${f(rowH - 2.4)}" rx="2" fill="${col}" fill-opacity="${fillOp}" stroke="${col}" stroke-width="0.45"/>`;
      for (const [k, col, xin, xmiss] of [['safe', SAFE, X.safeIn, X.safeMiss], ['risky', RISKY, X.riskyIn, X.riskyMiss]]) {
        if (k === 'risky' && r === 1) {
          s += `<rect x="${xin}" y="${f(y + 0.6)}" width="${bw}" height="${f(rowH - 2.4)}" rx="2" fill="#e6e3da"/><text x="${xin + bw / 2}" y="${f(cy + 1.2)}" text-anchor="middle" font-size="2.8" fill="#888">tap-in: SAFE only</text>`;
          continue;
        }
        const t = E.puttTarget(cfg, r, k, tier), dest = k === 'safe' ? P.safeMissTo[r - 1] : P.riskyMissTo;
        s += cellBox(xin, col, 0.14) + `<text x="${xin + cw / 2}" y="${f(cy + 2.3)}" text-anchor="middle" font-size="${t <= 2 ? 5.6 : 6.4}" font-weight="800" fill="${col}">${inTxt(t)}</text>`;
        if (t <= 2) s += cellBox(xmiss, '#999', 0.06) + `<text x="${xmiss + cw / 2}" y="${f(cy + 1.2)}" text-anchor="middle" font-size="3" fill="#888">no miss</text>`;
        else if (r === 1 && dest === 1) s += cellBox(xmiss, '#999', 0.06) + `<text x="${xmiss + cw / 2}" y="${f(cy + 1.2)}" text-anchor="middle" font-size="3" fill="#555">try again</text>`;
        else s += cellBox(xmiss, '#999', 0.06) + ringBadge(xmiss + cw / 2, cy, dest);
        if (opts.interactive && on) s += `<rect class="pc-hit" data-choice="${k}" x="${xin - 0.5}" y="${f(y)}" width="${bw + 1}" height="${f(rowH - 1.2)}" rx="2.5" fill="transparent" stroke="${col}" stroke-width="0.9" style="cursor:pointer"/>`;
      }
      s += `</g>`;
    }
    return { x: -tail, y: -top, w: tail + L, h: H, body: s, name: `putter-t${tier}-strip`, title: `Putter T${tier} card` };
  }

  // ---------------------------------------------------------- green tiles
  // True scale (1 mm = 1 yd), rings and ring numbers printed on the tile.
  function greenTileBody(t, ox, oy, uid) {
    const ext = Math.max(...t.parts.map((q) => Math.max(Math.abs(q.x) + Math.max(q.rx, q.ry), Math.abs(q.y) + Math.max(q.rx, q.ry))));
    const ell = (q, fill, extra) => `<ellipse cx="${f(ox + q.x)}" cy="${f(oy + q.y)}" rx="${q.rx}" ry="${q.ry}" transform="rotate(${q.rot || 0} ${f(ox + q.x)} ${f(oy + q.y)})" fill="${fill}" ${extra || ''}/>`;
    let s = `<defs><clipPath id="gt${uid}">${t.parts.map((q) => ell(q, '#000')).join('')}</clipPath></defs>`;
    s += t.parts.map((q) => ell(q, '#1e6b38', 'stroke="#1e6b38" stroke-width="1.6"')).join('');
    s += t.parts.map((q) => ell(q, '#2e8a48')).join('');
    const cx = ox + t.cup.x, cy = oy + t.cup.y;
    s += `<g clip-path="url(#gt${uid})">`;
    for (let i = 1; i < 6; i++) s += `<line x1="${f(ox - ext + i * ext / 3)}" y1="${f(oy - ext)}" x2="${f(ox - ext + i * ext / 3 + ext)}" y2="${f(oy + ext)}" stroke="#35964f" stroke-width="${f(ext / 7)}" opacity="0.5"/>`;
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${t.rings[0]}" fill="#3a9c58"/>`;
    t.rings.forEach((r) => { s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r}" fill="none" stroke="#fff" stroke-width="0.45"/>`; });
    const prepped = t.parts.map((q) => E.prepShape({ cx: ox + q.x, cy: oy + q.y, rx: q.rx, ry: q.ry, rotation: q.rot || 0 }));
    const onTile = (x, y) => prepped.some((q) => E.inShape(q, x, y));
    const lbl = [t.rings[0] * 0.58, (t.rings[0] + t.rings[1]) / 2, (t.rings[1] + t.rings[2]) / 2, t.rings[2] + 2.4];
    lbl.forEach((r, i) => {
      for (const deg of [-45, -20, -70, 0, -110, 20, -135, 45, 180, 90, 135, -160]) {
        const a = (deg * Math.PI) / 180, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (onTile(x, y - 1) && onTile(x, y + 1) && Math.abs(x - cx) + Math.abs(y - cy - 4.5) > 3) { s += `<text x="${f(x)}" y="${f(y + 1.1)}" text-anchor="middle" font-size="3" font-weight="800" fill="#fff">${i + 1}</text>`; break; }
      }
    });
    s += `</g>`;
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="1.1" fill="#111"/><line x1="${f(cx)}" y1="${f(cy)}" x2="${f(cx)}" y2="${f(cy - 9)}" stroke="#fff" stroke-width="0.4"/><path d="M ${f(cx)} ${f(cy - 9)} l 4 1.2 l -4 1.2 z" fill="#e33"/>`;
    return { s, ext };
  }
  function greenTileSheet(cfg) {
    const tiles = E.GREEN_TILES, pad = 6, W = 270;
    let x = pad, y = pad, rowH = 0, s = '', maxY = 0;
    const span = (q, axis) => { const e = q.rot ? Math.max(q.rx, q.ry) : axis === 'x' ? q.rx : q.ry; return [q[axis] - e, q[axis] + e]; };
    const items = tiles.map((t) => {
      const xs = t.parts.flatMap((q) => span(q, 'x')), ys = t.parts.flatMap((q) => span(q, 'y'));
      return { t, x0: Math.min(...xs) - 2, x1: Math.max(...xs) + 2, y0: Math.min(...ys, t.cup.y - 11) - 2, y1: Math.max(...ys) + 2 };
    });
    items.forEach(({ t, x0, x1, y0, y1 }, k) => {
      const w = Math.max(x1 - x0, 30), hgt = y1 - y0 + 10;
      if (x + w > W - pad) { x = pad; y += rowH + 4; rowH = 0; }
      const ox = x + (w - (x1 - x0)) / 2 - x0, oy = y - y0;
      const b = greenTileBody(t, ox, oy, 'sheet' + k);
      s += b.s;
      s += `<text x="${f(x + w / 2)}" y="${f(y + (y1 - y0) + 4)}" text-anchor="middle" font-size="3.2" font-weight="800" fill="#1b1b1b">${t.name.replace('&', '&amp;')}</text>`;
      s += `<text x="${f(x + w / 2)}" y="${f(y + (y1 - y0) + 8)}" text-anchor="middle" font-size="3" fill="#c49a1a">${'★'.repeat(t.difficulty)}<tspan fill="#ccc">${'★'.repeat(3 - t.difficulty)}</tspan></text>`;
      x += w + 6; rowH = Math.max(rowH, hgt); maxY = Math.max(maxY, y + hgt);
    });
    const H = maxY + pad;
    const head = `<rect x="0" y="0" width="${W}" height="${H}" rx="3" fill="#fbfaf5" stroke="#1a1a1a" stroke-width="0.35"/>`;
    const note = `<text x="${W - pad}" y="${H - 3}" text-anchor="end" font-size="2.3" fill="#666">Green tiles · 1 mm = 1 yd · cut out along the dark edge · the flag marks the cup · rings 1–4 for putting</text>`;
    return { x: 0, y: 0, w: W, h: H, body: head + s + note, name: 'green-tiles', title: 'Green tiles (all)' };
  }

  // ------------------------------------------------------- kit for a club
  function clubKit(cfg, clubId, tier) {
    if (clubId === 'putter') return [putterStrip(cfg, tier)];
    return [clubCard(cfg, clubId, tier)];
  }
  function kitClubs(cfg) {
    return cfg.clubs.filter((c) => c.enabled !== false).map((c) => c.id).concat(['putter']);
  }

  // --------------------------------------------- picture: the kit in use
  function usageDiagram(cfg, opts) {
    opts = opts || {};
    const club = E.getClub(cfg, opts.club || 'i7'), tier = opts.tier || 1;
    const fanArr = E.fanFor(cfg, club, tier), r1 = opts.r1 || 6, r2 = opts.r2 || 4, dirFace = r1 + r2, d1 = opts.d1 || 3, d2 = opts.d2 || 4, sum = d1 + d2;
    const angle = fanArr[dirFace - 2], zone = E.zoneFor(cfg, sum, tier, 'fairway'), dist = E.clubDistance(cfg, club, sum, 1, 'fairway', tier);
    const B = { x: 40, y: 300 }, th = -80, toR = (d) => (d * Math.PI) / 180;
    const at = (deg, r) => ({ x: B.x + Math.cos(toR(deg)) * r, y: B.y + Math.sin(toR(deg)) * r });
    const pin = at(th, dist + 22), land = at(th + angle, dist);
    const ruler = bagRuler(cfg), fan = sharedFan(cfg), card = clubCard(cfg, club.id, tier);
    const W = 400, Hh = 340, P = 210;
    let s = `<rect width="${W}" height="${Hh}" fill="#a8bb82"/>`;
    const fc = at(th, 110);
    s += `<ellipse cx="${f(fc.x)}" cy="${f(fc.y)}" rx="32" ry="140" transform="rotate(${th + 90} ${f(fc.x)} ${f(fc.y)})" fill="#79b85a"/>`;
    s += `<ellipse cx="${f(pin.x)}" cy="${f(pin.y)}" rx="22" ry="16" fill="#2e8a48"/><line x1="${f(pin.x)}" y1="${f(pin.y)}" x2="${f(pin.x)}" y2="${f(pin.y - 16)}" stroke="#eee" stroke-width="1"/><polygon points="${f(pin.x)},${f(pin.y - 16)} ${f(pin.x + 9)},${f(pin.y - 13)} ${f(pin.x)},${f(pin.y - 10)}" fill="#e33"/>`;
    s += `<g transform="translate(${B.x} ${B.y}) rotate(${th + angle}) scale(0.62)">${ruler.body}</g>`;
    s += `<g transform="translate(${B.x} ${B.y}) rotate(${th + 90}) scale(0.62)" opacity="0.95">${fan.body}</g>`;
    s += `<circle cx="${B.x}" cy="${B.y}" r="2.6" fill="#fff" stroke="#111" stroke-width="0.6"/>`;
    s += `<circle cx="${f(land.x)}" cy="${f(land.y)}" r="5" fill="none" stroke="#ffd84a" stroke-width="1.4"/><circle cx="${f(land.x)}" cy="${f(land.y)}" r="2.6" fill="#fff" stroke="#111" stroke-width="0.6"/>`;
    s += `<rect x="${P}" y="0" width="${W - P}" height="${Hh}" fill="#fbfaf5"/><line x1="${P}" y1="0" x2="${P}" y2="${Hh}" stroke="#d8d4c6"/>`;
    s += `<g transform="translate(${P + 10} 14) scale(0.9)">${card.body}</g>`;
    const tx = P + 74, lines = [
      ['Playing a shot', 7, 800], [`${club.name}, tier ${tier}`, 3.6, 400], ['', 3, 400],
      ['1  Aim the fan', 4.4, 800], ['   centre line where you aim', 3.6, 400],
      [`2  Roll: ${d1} + ${d2} = ${sum}`, 4.4, 800], [`   card says ${zone.label.toUpperCase()}`, 3.6, 400],
      [`3  Red dice: ${r1} + ${r2} = ${dirFace}`, 4.4, 800], [`   card says ${angle === 0 ? 'STRAIGHT' : Math.abs(angle) >= 15 ? 'WIDE' : 'SLIGHT'}`, 3.6, 400],
      ['4  Lay the bag ruler', 4.4, 800], ['   on that fan line, find the', 3.6, 400], [`   ${club.short} mark${zone.idx === 1 ? '' : zone.idx === 0 ? ' − 1 notch' : ' + 1 notch'}: ball there`, 3.6, 400],
    ];
    lines.forEach(([t, fs, fw], i) => { s += `<text x="${tx}" y="${22 + i * 8}" font-size="${fs}" font-weight="${fw}" fill="#111">${t}</text>`; });
    s += `<text x="${P + 10}" y="${Hh - 30}" font-size="3.6" fill="#444">No distances on the cards: one shared bag ruler and one fan.</text>`;
    s += `<text x="${P + 10}" y="${Hh - 24}" font-size="3.6" fill="#444">Upgrading = the next tier's card: more ON TARGET and STRAIGHT.</text>`;
    s += `<text x="${P + 10}" y="${Hh - 10}" font-size="3" fill="#777">Illustration · pieces print at 1 mm = 1 yd</text>`;
    return { x: 0, y: 0, w: W, h: Hh, body: s, name: `kit-in-use-${club.id}-t${tier}`, title: 'The kit in use' };
  }

  // ------------------------------------------------------- shared artwork
  const TIERS_ = Array.from({ length: E.MAX_TIER }, (_, i) => i + 1);
  const TIER_STYLE = {
    1: { name: 'Bronze', a: '#d9955a', b: '#8a4f22' },
    2: { name: 'Silver', a: '#dfe5ea', b: '#7d8894' },
    3: { name: 'Gold', a: '#f5d55c', b: '#a67c0c' },
    4: { name: 'Emerald', a: '#5fd69a', b: '#17704a' },
    5: { name: 'Diamond', a: '#b9ccff', b: '#5a3fc0' },
  };
  function sparkle(x, y, r, color) {
    return `<path d="M ${f(x)} ${f(y - r)} Q ${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Q ${f(x)} ${f(y)} ${f(x)} ${f(y + r)} Q ${f(x)} ${f(y)} ${f(x - r)} ${f(y)} Q ${f(x)} ${f(y)} ${f(x)} ${f(y - r)} Z" fill="${color}"/>`;
  }
  // Club illustrations in a 55 × 31 box.
  function clubArt(id, tier, uid) {
    const T = TIER_STYLE[tier], putter = id === 'putter';
    let s = `<defs><linearGradient id="sky${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0ff"/><stop offset="1" stop-color="#f2f8ff"/></linearGradient>
      <linearGradient id="steel${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="0.5" stop-color="#b9c2ca"/><stop offset="1" stop-color="#6f7a84"/></linearGradient>
      <radialGradient id="head${uid}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#5a6574"/><stop offset="1" stop-color="#11161d"/></radialGradient>
      <radialGradient id="wood${uid}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#c58a50"/><stop offset="1" stop-color="#5a3315"/></radialGradient>
      <radialGradient id="glow${uid}" cx="0.4" cy="0.75" r="0.6"><stop offset="0" stop-color="${T.a}" stop-opacity="${0.15 + tier * 0.1}"/><stop offset="1" stop-color="${T.a}" stop-opacity="0"/></radialGradient></defs>`;
    if (putter) {
      s += `<rect width="55" height="31" fill="#3d9a57"/><path d="M0 0 H55 V9 Q 30 13 0 8 Z" fill="#bfe0ff"/><path d="M0 8 Q 30 13 55 9 V13 Q 28 17 0 12 Z" fill="#2f8a48"/>`;
      for (let i = 0; i < 6; i++) s += `<path d="M ${-4 + i * 12} 31 L ${4 + i * 12} 13" stroke="#48a862" stroke-width="3.2" opacity="0.5"/>`;
    } else {
      s += `<rect width="55" height="31" fill="url(#sky${uid})"/>`;
      s += `<circle cx="46" cy="7" r="3.4" fill="#fff6c4"/>`;
      s += `<path d="M0 20 Q 12 15 26 19 T 55 17 V31 H0 Z" fill="#8fcf6a"/><path d="M0 25 Q 18 20 34 24 T 55 23 V31 H0 Z" fill="#62ad49"/>`;
      if (id === 'wedge') s += `<ellipse cx="22" cy="29" rx="18" ry="4" fill="#ecdcab"/>`;
    }
    s += `<rect width="55" height="31" fill="url(#glow${uid})"/>`;
    const shaft = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d6dbe0" stroke-width="1.1"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${T.b}" stroke-width="0.35" opacity="0.8"/>` +
      `<line x1="${f(x2 - (x2 - x1) * 0.28)}" y1="${f(y2 - (y2 - y1) * 0.28)}" x2="${x2}" y2="${y2}" stroke="#1b1b1b" stroke-width="2"/>`;
    const ball = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#9aa" stroke-width="0.2"/><circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.3)}" r="${f(r * 0.18)}" fill="#e3e8ea"/><circle cx="${f(x + r * 0.25)}" cy="${f(y + r * 0.1)}" r="${f(r * 0.15)}" fill="#e3e8ea"/>`;
    if (id === 'driver' || id === 'wood') {
      const big = id === 'driver', rx = big ? 11 : 8, ry = big ? 6.2 : 4.8, cx = 19, cy = big ? 22.5 : 23.5;
      s += shaft(cx + rx * 0.62, cy - ry * 0.7, 54, -3);
      s += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(-12 ${cx} ${cy})" fill="url(#${big ? 'head' : 'wood'}${uid})" stroke="#0b0e12" stroke-width="0.3"/>`;
      s += `<ellipse cx="${cx - rx * 0.2}" cy="${cy - ry * 0.45}" rx="${rx * 0.55}" ry="${ry * 0.22}" transform="rotate(-12 ${cx} ${cy})" fill="#fff" opacity="0.25"/>`;
      s += `<path d="M ${f(cx - rx * 0.95)} ${f(cy + ry * 0.2)} Q ${f(cx)} ${f(cy + ry * 1.2)} ${f(cx + rx * 0.9)} ${f(cy + ry * 0.05)}" stroke="${T.a}" stroke-width="0.6" fill="none"/>`;
      if (big) s += `<line x1="40" y1="25" x2="40" y2="29.5" stroke="#f0e6cf" stroke-width="0.9"/>` + ball(40, 23.4, 2.2);
      else s += ball(38, 25.6, 2.1);
    } else if (id === 'iron' || id === 'punch' || id === 'wedge') {
      const w = id === 'wedge';
      const pts = w ? '9,17 27,12.5 30,24.5 12,28.5' : '11,19 30,16 31,25.5 13,28';
      s += shaft(w ? 27 : 29.5, w ? 13 : 16.3, 54, -3);
      s += `<polygon points="${pts}" fill="${id === 'punch' ? '#b9a2e0' : 'url(#steel' + uid + ')'}" stroke="#4b545c" stroke-width="0.35" stroke-linejoin="round"/>`;
      const P = pts.split(' ').map((q) => q.split(',').map(Number));
      for (let i = 1; i <= (w ? 6 : 5); i++) {
        const t = i / (w ? 7 : 6);
        const a = [P[0][0] + (P[3][0] - P[0][0]) * t + 2, P[0][1] + (P[3][1] - P[0][1]) * t], b = [P[1][0] + (P[2][0] - P[1][0]) * t - 2.5, P[1][1] + (P[2][1] - P[1][1]) * t];
        s += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#5b656e" stroke-width="0.3"/>`;
      }
      s += `<line x1="${P[3][0]}" y1="${P[3][1]}" x2="${P[2][0]}" y2="${P[2][1]}" stroke="${T.b}" stroke-width="0.9"/>`;
      if (w) for (let i = 0; i < 9; i++) s += `<circle cx="${f(33 + (i % 3) * 2.2 + (i > 5 ? 1 : 0))}" cy="${f(23 - Math.floor(i / 3) * 2)}" r="0.45" fill="#d9c58b"/>`;
      s += ball(w ? 37 : 39, 25.5, 2.1);
    } else if (putter) {
      s += shaft(27, 21, 38, -3);
      s += `<rect x="13" y="21" width="22" height="5.4" rx="1.2" fill="url(#steel${uid})" stroke="#4b545c" stroke-width="0.35"/>`;
      s += `<line x1="24" y1="21.3" x2="24" y2="26.1" stroke="#fff" stroke-width="0.6"/><line x1="13" y1="26.4" x2="35" y2="26.4" stroke="${T.b}" stroke-width="0.9"/>`;
      s += `<ellipse cx="48" cy="26.5" rx="3.6" ry="1.4" fill="#123d20"/><line x1="48" y1="26.4" x2="48" y2="14" stroke="#eee" stroke-width="0.5"/><path d="M48 14 L54 15.6 L48 17.2 Z" fill="#e33"/>`;
      s += ball(41, 25.6, 1.9);
    }
    for (let i = 1; i < tier; i++) s += sparkle(5 + i * 4.2, 5 + (i % 2) * 2, 1.5, '#fff');
    return s;
  }
  const LIE_ICON = {
    tee: (x, y) => `<line x1="${x}" y1="${f(y + 0.6)}" x2="${x}" y2="${f(y + 2.4)}" stroke="#a0805a" stroke-width="0.6"/><circle cx="${x}" cy="${f(y - 0.3)}" r="1.1" fill="#fff" stroke="#999" stroke-width="0.2"/>`,
    fairway: (x, y) => `<rect x="${f(x - 2)}" y="${f(y - 1.6)}" width="4" height="3.2" rx="0.6" fill="#79b85a"/><line x1="${f(x - 2)}" y1="${y}" x2="${f(x + 2)}" y2="${y}" stroke="#9fd07f" stroke-width="0.8"/>`,
    rough: (x, y) => `<rect x="${f(x - 2)}" y="${f(y - 1.6)}" width="4" height="3.2" rx="0.6" fill="#a8bb82"/>` + [-1.2, 0, 1.2].map((d) => `<path d="M ${f(x + d)} ${f(y + 1.2)} l -0.4 -2 M ${f(x + d)} ${f(y + 1.2)} l 0.5 -1.8" stroke="#55702f" stroke-width="0.3"/>`).join(''),
    bunker: (x, y) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="1.5" fill="#e8d6a4" stroke="#c8b27a" stroke-width="0.2"/><circle cx="${f(x - 0.6)}" cy="${f(y - 0.2)}" r="0.25" fill="#b89b5a"/><circle cx="${f(x + 0.7)}" cy="${f(y + 0.3)}" r="0.25" fill="#b89b5a"/>`,
    trees: (x, y) => `<line x1="${x}" y1="${f(y + 0.4)}" x2="${x}" y2="${f(y + 1.8)}" stroke="#6b4423" stroke-width="0.6"/><circle cx="${x}" cy="${f(y - 0.6)}" r="1.7" fill="#2f6b36"/>`,
    green: (x, y) => `<ellipse cx="${x}" cy="${f(y + 0.6)}" rx="2.2" ry="1.2" fill="#2e8a48"/><line x1="${x}" y1="${f(y + 0.6)}" x2="${x}" y2="${f(y - 1.9)}" stroke="#333" stroke-width="0.25"/><path d="M ${x} ${f(y - 1.9)} l 1.4 0.4 l -1.4 0.4 z" fill="#e33"/>`,
  };
  // ---------------------------------------------------------- coin tokens
  // Discs sized to the pick-up radius: a ball that stops on the disc takes it.
  function coinTokenSheet(cfg) {
    const R = (cfg.coinTokens && cfg.coinTokens.radius) || 10, cols = 8, gap = 4, W = cols * (2 * R + gap) + gap;
    const items = [...Array(16).fill(cfg.coinTokens.value || 1), ...Array(8).fill(cfg.coinTokens.riskyValue || 2)];
    const rows = Math.ceil(items.length / cols), H = rows * (2 * R + gap) + gap + 8;
    let s = `<rect x="0" y="0" width="${W}" height="${H}" rx="3" fill="#fbfaf5" stroke="#1a1a1a" stroke-width="0.35"/>`;
    items.forEach((v, i) => {
      const cx = gap + R + (i % cols) * (2 * R + gap), cy = gap + R + Math.floor(i / cols) * (2 * R + gap);
      const two = v > 1;
      s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${two ? '#f0b400' : '#f5c518'}" stroke="#a37d00" stroke-width="0.6"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${R - 1.6}" fill="none" stroke="#a37d00" stroke-width="0.35" stroke-dasharray="1 0.8"/>`;
      s += `<text x="${cx}" y="${cy + R * 0.38}" text-anchor="middle" font-size="${R * 1.1}" font-weight="800" fill="#5a4300">${v}</text>`;
    });
    s += `<text x="${gap}" y="${H - 3}" font-size="2.6" fill="#555">Coin tokens · put 3 on each hole near hazards or the edge (2s next to water/edge) · a ball that stops on a token takes it</text>`;
    return { x: 0, y: 0, w: W, h: H, body: s, name: 'coin-tokens', title: 'Coin tokens' };
  }

  // ---------------------------------------------------------- player board
  // Visual only: each club's picture and 5 empty squares to mark its tier.
  function playerBoard(cfg) {
    const clubs = kitClubs(cfg), W = 270, rowH = 21, top = 24, cols = 2, perCol = Math.ceil(clubs.length / cols), H = top + perCol * rowH + 6, colW = (W - 12) / cols;
    let s = `<rect x="0" y="0" width="${W}" height="${H}" rx="5" fill="#fffdf6" stroke="#1a1a1a" stroke-width="0.5"/>`;
    s += `<rect x="3" y="3" width="${W - 6}" height="16" rx="3" fill="#2e8a48"/><text x="10" y="14.2" font-size="8" font-weight="800" fill="#fff" letter-spacing="0.6">MY BAG</text>`;
    s += `<rect x="${W / 2}" y="6.2" width="${W / 2 - 9}" height="9.6" rx="2" fill="#fff" fill-opacity="0.92"/>`;
    clubs.forEach((id, i) => {
      const c = Math.floor(i / perCol), r = i % perCol, x0 = 6 + c * colW, y = top + r * rowH, col = colorOf(id);
      const name = id === 'putter' ? 'Putter' : E.getClub(cfg, id).name;
      s += `<rect x="${x0}" y="${y}" width="${colW - 4}" height="${rowH - 3}" rx="3" fill="${col}" fill-opacity="0.07" stroke="${col}" stroke-opacity="0.35" stroke-width="0.35"/>`;
      s += `<svg x="${x0 + 3}" y="${y + 1.5}" width="27" height="15" viewBox="0 0 55 31">${clubArt(id === 'putter' ? 'putter' : E.getClub(cfg, id).kind, 1, 'pb' + id)}</svg>`;
      s += `<text x="${x0 + 34}" y="${f(y + rowH / 2 + 0.4)}" font-size="${name.length > 9 ? 3.4 : 4.4}" font-weight="800" fill="#1b1b1b">${name.toUpperCase()}</text>`;
      TIERS_.forEach((t, k) => {
        const T = TIER_STYLE[t], sx = x0 + colW - 4 - (5 - k) * 12.2, sy = y + 2.5;
        s += `<rect x="${f(sx)}" y="${f(sy)}" width="11" height="11" rx="1.6" fill="#fff" stroke="${T.b}" stroke-width="0.8"/>`;
      });
    });
    return { x: 0, y: 0, w: W, h: H, body: s, name: 'player-board', title: 'Player board' };
  }

  root.Components = { bagRuler, sharedFan, clubCard, putterStrip, greenTileSheet, coinTokenSheet, clubKit, kitClubs, usageDiagram, playerBoard, TIER_STYLE, wrap, dieIcon, colorOf, CLUB_COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
