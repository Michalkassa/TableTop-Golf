/* Tabletop Golf — physical components generated from the rules config.
 * Every piece is an SVG at true scale (1 user unit = 1 mm). Long game: 1 mm = 1 yd.
 * Distances come from Engine.clubDistance, so the printed tools match the simulation exactly.
 * Works in the browser (after engine.js) and in node (require engine.js first). */
(function (root) {
  'use strict';
  const E = root.Engine;

  const CLUB_COLORS = { driver: '#1f4e9c', wood: '#8a5a2b', iron: '#4f5d68', wedge: '#c0501f', punch: '#6b3fa0', putter: '#1e7a45' };
  const LIE_TINT = { tee: '#e4efd9', fairway: '#e4efd9', rough: '#eef0d8', trees: '#dde8dc', bunker: '#f6ecd2' };
  const colorOf = (id) => CLUB_COLORS[id] || '#444';
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

  // ------------------------------------------------------------ club ruler
  // One row of power marks. Each mark = 3 colour-coded ticks; the 2d6 roll picks which one the ball goes on.
  // Everything a player needs for this club and tier is printed on the ruler itself.
  const ZONE_INK = ['#2f6db5', '#111111', '#c62f24']; // short, middle, long
  const capLies = (cfg, club, p) => ['rough', 'bunker', 'trees'].filter((l) => club.allowedLies.includes(l) && Math.abs(E.maxPower(cfg, l) - p) < 1e-9);
  function clubRuler(cfg, clubId, tier) {
    const club = E.getClub(cfg, clubId), color = colorOf(clubId);
    const zones = cfg.distanceZones, powers = cfg.powerLevels.slice().sort((a, b) => a - b);
    const tail = 30, top = 6, markH = 19, infoH = 15, foot = 9;
    let maxD = 0;
    for (const p of powers) for (const z of zones) maxD = Math.max(maxD, E.clubDistance(cfg, club, z.from, p, 'fairway', tier));
    const L = Math.max(150, Math.ceil((maxD + 12) / 10) * 10), H = top + markH + infoH + foot;
    let s = '';
    s += `<rect x="${-tail}" y="${-top}" width="${tail + L}" height="${H}" rx="3" fill="#fbfaf5" stroke="#1a1a1a" stroke-width="0.35"/>`;
    s += `<path d="M ${-tail + 3} ${-top} H ${-tail + 12} V ${H - top} H ${-tail + 3} A 3 3 0 0 1 ${-tail} ${H - top - 3} V ${-top + 3} A 3 3 0 0 1 ${-tail + 3} ${-top} Z" fill="${color}"/>`;
    s += `<text transform="translate(${-tail + 7.7} ${f(-top + H / 2)}) rotate(-90)" text-anchor="middle" font-size="4.4" font-weight="700" fill="#fff" letter-spacing="0.6">${club.name.toUpperCase()}</text>`;
    s += `<text x="-10.2" y="8" font-size="4" font-weight="800" fill="${color}" text-anchor="middle">T${tier}</text>` + tierPips(-14.6, 12.5, tier, 1.5, color);
    for (let x = 10; x < L - 2; x += 10) s += `<line x1="${x}" y1="0" x2="${x}" y2="${x % 50 === 0 ? -2.4 : -1.3}" stroke="#999" stroke-width="0.15"/>`;
    s += `<line x1="-4" y1="0" x2="${L}" y2="0" stroke="#111" stroke-width="0.4"/>`;
    // power marks
    for (const p of powers) {
      const xs = zones.map((z) => E.clubDistance(cfg, club, z.from, p, 'fairway', tier)), mid = xs[Math.floor(xs.length / 2)];
      s += `<rect x="${f(xs[0] - 0.8)}" y="0.4" width="${f(xs[xs.length - 1] - xs[0] + 1.6)}" height="7.6" rx="1" fill="${color}" fill-opacity="0.12"/>`;
      xs.forEach((x, i) => {
        const isMid = i === Math.floor(xs.length / 2);
        s += `<line x1="${f(x)}" y1="0" x2="${f(x)}" y2="${isMid ? 7.8 : 6}" stroke="${ZONE_INK[i] || '#111'}" stroke-width="${isMid ? 0.75 : 0.6}"/>`;
      });
      s += `<rect x="${f(mid - 5.4)}" y="9.4" width="10.8" height="4.8" rx="2.4" fill="${color}"/>`;
      s += `<text x="${f(mid)}" y="12.9" text-anchor="middle" font-size="3.1" font-weight="800" fill="#fff">${Math.round(p * 100)}%</text>`;
      const cl = capLies(cfg, club, p);
      if (cl.length) {
        const w = cl.length * 4.2;
        cl.forEach((l, k) => { s += `<g transform="translate(${f(mid - w / 2 + 2.1 + k * 4.2)} 16.6) scale(0.7)">${LIE_ICON[l](0, 0)}</g>`; });
        s += `<text x="${f(mid + w / 2 + 0.8)}" y="17.4" font-size="1.9" fill="#b4541a" font-weight="700">max</text>`;
      }
    }
    // info strip
    const y0 = markH;
    s += `<rect x="-17" y="${y0}" width="${L + 15.5}" height="${infoH - 1.2}" rx="1.5" fill="#f1efe7"/>`;
    // 1) dice key
    let x = -14;
    s += `<text x="${x}" y="${y0 + 4.6}" font-size="2.3" font-weight="800" fill="#222">ROLL 2d6 →</text>`;
    x += 15;
    zones.forEach((z, i) => {
      s += `<line x1="${x}" y1="${y0 + 2}" x2="${x}" y2="${y0 + 5.4}" stroke="${ZONE_INK[i]}" stroke-width="${i === 1 ? 0.75 : 0.6}"/>`;
      s += `<text x="${x + 1.2}" y="${y0 + 4.6}" font-size="2.3" fill="${ZONE_INK[i]}" font-weight="700">${z.from}–${z.to} ${z.label.toLowerCase()}</text>`;
      x += 19;
    });
    // 2) lies this club can play from
    let lx = -14;
    s += `<text x="${lx}" y="${y0 + 11}" font-size="2.3" font-weight="800" fill="#222">PLAY FROM</text>`;
    lx += 15.5;
    for (const l of ['tee', 'fairway', 'rough', 'bunker', 'trees']) {
      const ok = club.allowedLies.includes(l), mp = E.maxPower(cfg, l);
      s += `<g opacity="${ok ? 1 : 0.3}"><g transform="translate(${f(lx + 1.6)} ${y0 + 10.2}) scale(0.7)">${LIE_ICON[l](0, 0)}</g>`;
      const label = l + (ok && mp < 1 ? ` ${Math.round(mp * 100)}%` : '');
      s += `<text x="${f(lx + 3.8)}" y="${y0 + 11}" font-size="2.1" fill="${ok && mp < 1 ? '#b4541a' : '#222'}">${label}</text></g>`;
      if (!ok) s += `<line x1="${f(lx)}" y1="${y0 + 10.3}" x2="${f(lx + 4 + l.length * 1.1)}" y2="${y0 + 10.3}" stroke="#888" stroke-width="0.25"/>`;
      lx += 5.8 + label.length * 1.15;
    }
    // 3) upgrade
    const cost = tier < E.MAX_TIER ? cfg.progression.tierCosts[tier - 1] : null;
    const up = cost == null ? 'MAX TIER' : `UPGRADE → T${tier + 1}: ${cost} coins`;
    s += `<text x="${L - 4}" y="${y0 + 4.6}" text-anchor="end" font-size="2.3" font-weight="800" fill="${color}">${up}</text>`;
    // pivot
    s += `<circle cx="0" cy="0" r="2.2" fill="#fff" stroke="#111" stroke-width="0.35"/><circle cx="0" cy="0" r="0.5" fill="#111"/>`;
    s += `<text x="0" y="-2.8" text-anchor="middle" font-size="1.8" font-weight="700" fill="#111">BALL</text>`;
    // how to + hazards
    const fy = markH + infoH + 1.6;
    s += `<text x="-17" y="${fy}" font-size="2.1" fill="#333"><tspan font-weight="800">HOW: </tspan>pin through BALL · ruler edge on the fan line · choose a power mark · roll 2d6 · put the ball on the edge above that colour tick</text>`;
    s += `<text x="-17" y="${fy + 3.2}" font-size="2.1" fill="#333"><tspan font-weight="800">HAZARDS: </tspan>water +${cfg.penalties.water}, drop back along this line on dry ground · off the board +${cfg.penalties.ob}, play again${cfg.rules.treesBlockLine ? ' · a line through trees stops at the trees' : ''}</text>`;
    return { x: -tail, y: -top, w: tail + L, h: H, body: s, name: `${club.id}-t${tier}-ruler`, title: `${club.name} T${tier} ruler` };
  }

  // ------------------------------------------------------------------ fan
  function fanTemplate(cfg, clubId, tier) {
    const isPutter = clubId === 'putter';
    const club = isPutter ? { id: 'putter', name: 'Putter' } : E.getClub(cfg, clubId);
    const fan = E.fanFor(cfg, club, tier);
    const groups = E.faceGroups(fan), color = colorOf(club.id);
    const outer = Math.max(4, ...fan.map(Math.abs));
    const R = 105, half = outer + 7, hub = 17, ds = 4.6, dstep = 5.5;
    const rad = (d) => ((d - 90) * Math.PI) / 180;
    const pt = (d, r) => [f(r * Math.cos(rad(d))), f(r * Math.sin(rad(d)))];
    let s = '';
    const [ax, ay] = pt(-half, hub), [bx, by] = pt(-half, R), [cx, cy] = pt(half, R), [dx, dy] = pt(half, hub);
    s += `<circle cx="0" cy="0" r="${hub + 3}" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-width="0.35"/>`;
    s += `<path d="M ${ax} ${ay} L ${bx} ${by} A ${R} ${R} 0 0 1 ${cx} ${cy} L ${dx} ${dy} Z" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-width="0.35"/>`;
    // 10 mm rim ticks every degree for orientation
    for (let d = -Math.floor(half); d <= Math.floor(half); d++) {
      const [x1, y1] = pt(d, R), [x2, y2] = pt(d, R - (d % 5 === 0 ? 3 : 1.5));
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="0.18"/>`;
    }
    let maxStack = 1;
    for (const g of groups) {
      const [x1, y1] = pt(g.angle, hub + 2), [x2, y2] = pt(g.angle, R);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="${g.angle === 0 ? 0.55 : 0.4}"${g.angle === 0 ? '' : ''}/>`;
      g.faces.forEach((face, k) => { const [x, y] = pt(g.angle, R + 4 + k * dstep); s += dieIcon(x, y, ds, face); });
      maxStack = Math.max(maxStack, g.faces.length);
      const [tx, ty] = pt(g.angle, R - 9);
      s += `<text transform="translate(${tx} ${ty}) rotate(${g.angle})" text-anchor="middle" font-size="2.5" font-weight="700" fill="#111" stroke="#fff" stroke-width="0.9" paint-order="stroke">${g.angle > 0 ? '+' : g.angle < 0 ? '−' : ''}${Math.abs(g.angle)}°</text>`;
    }
    // aim tail behind the pivot
    s += `<line x1="0" y1="${hub + 3}" x2="0" y2="${hub + 9}" stroke="#111" stroke-width="0.55"/>`;
    s += `<text x="0" y="${hub + 12}" text-anchor="middle" font-size="2.3" font-weight="700" fill="#111">AIM LINE</text>`;
    s += `<circle cx="0" cy="0" r="${hub}" fill="#fff" fill-opacity="0.85" stroke="${color}" stroke-width="0.35"/>`;
    s += `<text x="0" y="-7.5" text-anchor="middle" font-size="3.6" font-weight="700" fill="${color}">${club.name.toUpperCase()}</text>`;
    s += `<text x="0" y="-3.4" text-anchor="middle" font-size="2.3" fill="#333">TIER ${tier} FAN</text>`;
    s += tierPips(-5.8, 9.5, tier, 2.2, color);
    s += `<circle cx="0" cy="0" r="2.2" fill="#fff" stroke="#111" stroke-width="0.35"/><circle cx="0" cy="0" r="0.5" fill="#111"/>`;
    s += `<text x="0" y="5.2" text-anchor="middle" font-size="1.9" font-weight="700" fill="#111">BALL</text>`;
    const halfW = Math.max(hub + 5, R * Math.sin((half * Math.PI) / 180) + 8);
    const topY = -(R + 4 + (maxStack - 1) * dstep + ds / 2 + 3);
    return { x: -halfW, y: topY, w: halfW * 2, h: -topY + hub + 15, body: s, name: `${club.id}-t${tier}-fan`, title: `${club.name} T${tier} fan` };
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
    return [clubRuler(cfg, clubId, tier), fanTemplate(cfg, clubId, tier)];
  }
  function kitClubs(cfg) {
    return cfg.clubs.filter((c) => c.enabled !== false).map((c) => c.id).concat(['putter']);
  }

  // --------------------------------------------- picture: the kit in use
  function usageDiagram(cfg, opts) {
    opts = opts || {};
    const clubId = opts.club || 'iron', tier = opts.tier || 1;
    const club = E.getClub(cfg, clubId);
    const fanArr = E.fanFor(cfg, club, tier);
    const dirFace = opts.dir || 5, d1 = opts.d1 || 3, d2 = opts.d2 || 4, sum = d1 + d2;
    const angle = fanArr[dirFace - 1];
    const lie = club.allowedLies.includes('fairway') ? 'fairway' : 'tee';
    const dist = E.clubDistance(cfg, club, sum, 1, lie, tier), zone = E.zoneOf(cfg, sum);
    const B = { x: 56, y: 296 };
    const th = -80; // aim heading in degrees (screen coords)
    const toR = (d) => (d * Math.PI) / 180;
    const at = (deg, r) => ({ x: B.x + Math.cos(toR(deg)) * r, y: B.y + Math.sin(toR(deg)) * r });
    const pin = at(th, dist + 24), land = at(th + angle, dist);
    const ruler = clubRuler(cfg, clubId, tier), fan = fanTemplate(cfg, clubId, tier);
    const W = 380, Hh = 362, P = 214;
    let s = '';
    s += `<rect x="0" y="0" width="${W}" height="${Hh}" fill="#a8bb82"/>`;
    const fc = at(th, 120);
    s += `<ellipse cx="${f(fc.x)}" cy="${f(fc.y)}" rx="36" ry="150" transform="rotate(${th + 90} ${f(fc.x)} ${f(fc.y)})" fill="#79b85a"/>`;
    s += `<ellipse cx="${f(pin.x)}" cy="${f(pin.y)}" rx="24" ry="18" fill="#2e8a48"/>`;
    s += `<ellipse cx="${f(pin.x - 32)}" cy="${f(pin.y + 10)}" rx="11" ry="8" fill="#e8d6a4"/>`;
    s += `<line x1="${f(pin.x)}" y1="${f(pin.y)}" x2="${f(pin.x)}" y2="${f(pin.y - 18)}" stroke="#eee" stroke-width="1"/><polygon points="${f(pin.x)},${f(pin.y - 18)} ${f(pin.x + 10)},${f(pin.y - 15)} ${f(pin.x)},${f(pin.y - 12)}" fill="#e33"/><circle cx="${f(pin.x)}" cy="${f(pin.y)}" r="1.2" fill="#111"/>`;
    // ruler swung onto the rolled line, clear fan on top aimed at the pin
    s += `<g transform="translate(${B.x} ${B.y}) rotate(${th + angle})">${ruler.body}</g>`;
    s += `<g transform="translate(${B.x} ${B.y}) rotate(${th + 90})">${fan.body}</g>`;
    const aimEnd = at(th, dist + 12);
    s += `<line x1="${f(at(th, 126).x)}" y1="${f(at(th, 126).y)}" x2="${f(aimEnd.x)}" y2="${f(aimEnd.y)}" stroke="#ffd84a" stroke-width="0.9" stroke-dasharray="3 2"/>`;
    s += `<circle cx="${B.x}" cy="${B.y}" r="2.6" fill="#fff" stroke="#111" stroke-width="0.6"/>`;
    s += `<circle cx="${f(land.x)}" cy="${f(land.y)}" r="5.5" fill="none" stroke="#ffd84a" stroke-width="1.4"/><circle cx="${f(land.x)}" cy="${f(land.y)}" r="2.6" fill="#fff" stroke="#111" stroke-width="0.6"/>`;
    // numbered markers in the scene, explanations in the panel
    const marker = (n, p) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="5.2" fill="#111" stroke="#ffd84a" stroke-width="0.9"/><text x="${f(p.x)}" y="${f(p.y + 2)}" text-anchor="middle" font-size="5.6" font-weight="700" fill="#fff">${n}</text>`;
    const m1 = at(th - 34, 30), m2 = at(th + angle, 131), m3 = at(th + angle + 9, 60), m4 = { x: land.x - 13, y: land.y };
    s += marker(1, m1) + marker(2, m2) + marker(3, m3) + marker(4, m4);
    s += `<rect x="${P}" y="0" width="${W - P}" height="${Hh}" fill="#fbfaf5"/><line x1="${P}" y1="0" x2="${P}" y2="${Hh}" stroke="#d8d4c6"/>`;
    const tx = P + 12;
    const block = (n, y, title, lines, icons) => {
      let c = marker(n, { x: tx, y: y - 1.6 });
      c += `<text x="${tx + 10}" y="${y}" font-size="5" font-weight="700" fill="#111">${title}</text>`;
      let yy = y + 7;
      if (icons) { c += icons(tx + 10, yy + 2); yy += 13; }
      lines.forEach((l) => { c += `<text x="${tx + 10}" y="${yy}" font-size="4.1" fill="#222">${l}</text>`; yy += 5.6; });
      return c;
    };
    s += `<text x="${tx - 4}" y="26" font-size="8" font-weight="700" fill="#111">Playing a shot</text>`;
    s += `<text x="${tx - 4}" y="35" font-size="4.1" fill="#555">${club.name} tier ${tier}, 100% power, from the ${lie}</text>`;
    s += block(1, 56, 'Aim the fan', ['Push the pin through the ball.', 'Turn the clear fan so its centre', 'line points where you aim.']);
    s += block(2, 104, 'Roll the direction die', [`Face ${dirFace} → the ${angle > 0 ? '+' : ''}${angle}° line.`], (x, y) => dieIcon(x + 4.5, y, 9, dirFace));
    s += block(3, 146, 'Swing the ruler onto it', ['Same pin, so the ruler turns', 'around the ball until its edge', 'lies on the rolled line.']);
    const zi = cfg.distanceZones.indexOf(zone), zcol = ['blue', 'black', 'red'][zi] || '';
    s += block(4, 194, `Roll 2d6 = ${sum}: ${zone.label.toLowerCase()}`, [`Under the 100% mark, take the`, `${zcol} (${zone.label.toLowerCase()}) tick: ${dist} yd.`, 'Put the ball on the edge there.'], (x, y) => dieIcon(x + 4.5, y, 9, d1) + dieIcon(x + 15.5, y, 9, d2));
    const notes = ['You choose the power (25/50/75/100%)', 'before you roll. Each power mark has', '3 ticks: blue 2–4, black 5–9, red 10–12.', '', 'Rough: max 75%. Bunker, trees: 50%', '(printed on the ruler).', '', "Upgrade = next tier's ruler (longer)", 'and fan (narrower).'];
    notes.forEach((l, i) => { s += `<text x="${tx - 4}" y="${246 + i * 5.6}" font-size="4.1" fill="#444">${l}</text>`; });
    s += `<text x="${tx - 4}" y="${Hh - 10}" font-size="3.4" fill="#777">Illustration · pieces print at 1 mm = 1 yd</text>`;
    return { x: 0, y: 0, w: W, h: Hh, body: s, name: `kit-in-use-${clubId}-t${tier}`, title: 'The kit in use' };
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
    const clubs = kitClubs(cfg), W = 200, rowH = 25, top = 24, H = top + clubs.length * rowH + 6;
    let s = `<defs><linearGradient id="pbbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#f1eee2"/></linearGradient></defs>`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" rx="5" fill="url(#pbbg)" stroke="#1a1a1a" stroke-width="0.5"/>`;
    s += `<rect x="3" y="3" width="${W - 6}" height="16" rx="3" fill="#2e8a48"/>`;
    s += `<path d="M 9 16 L 9 6 L 15 8 L 9 10" stroke="#fff" stroke-width="0.8" fill="#e33"/><ellipse cx="9" cy="16" rx="3" ry="0.9" fill="#174f28"/>`;
    s += `<text x="20" y="14.2" font-size="8" font-weight="800" fill="#fff" letter-spacing="0.6">MY BAG</text>`;
    s += `<rect x="95" y="6.2" width="98" height="9.6" rx="2" fill="#fff" fill-opacity="0.92"/>`;
    TIERS_.forEach((t, k) => { const T = TIER_STYLE[t]; s += `<text x="${f(105 + k * 17 + 7.5)}" y="${top - 1.4}" text-anchor="middle" font-size="2.4" font-weight="800" fill="${T.b}" letter-spacing="0.3">${T.name.toUpperCase()}</text>`; });
    clubs.forEach((id, i) => {
      const y = top + i * rowH, color = colorOf(id);
      const name = id === 'putter' ? 'Putter' : E.getClub(cfg, id).name;
      s += `<rect x="6" y="${y}" width="${W - 12}" height="${rowH - 3}" rx="3" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-opacity="0.35" stroke-width="0.35"/>`;
      s += `<rect x="6" y="${y}" width="3" height="${rowH - 3}" rx="1.5" fill="${color}"/>`;
      s += `<svg x="12" y="${y + 1.5}" width="34" height="19" viewBox="0 0 55 31">${clubArt(id, 1, 'pb' + id)}</svg>`;
      s += `<rect x="12" y="${y + 1.5}" width="34" height="19" rx="1.6" fill="none" stroke="${color}" stroke-width="0.4"/>`;
      s += `<text x="52" y="${f(y + rowH / 2 + 1)}" font-size="7" font-weight="800" fill="#1b1b1b">${name.toUpperCase()}</text>`;
      TIERS_.forEach((t, k) => {
        const T = TIER_STYLE[t], sx = 105 + k * 17, sy = y + (rowH - 3 - 15) / 2;
        s += `<rect x="${sx}" y="${f(sy)}" width="15" height="15" rx="2" fill="#fff" stroke="${T.b}" stroke-width="0.9"/>`;
        s += `<rect x="${sx + 0.9}" y="${f(sy + 0.9)}" width="13.2" height="13.2" rx="1.4" fill="none" stroke="${T.a}" stroke-width="0.4"/>`;
      });
    });
    return { x: 0, y: 0, w: W, h: H, body: s, name: 'player-board', title: 'Player board' };
  }

  root.Components = { clubRuler, fanTemplate, putterStrip, greenTileSheet, coinTokenSheet, clubKit, kitClubs, usageDiagram, playerBoard, TIER_STYLE, wrap, dieIcon, colorOf, CLUB_COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
