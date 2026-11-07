/* Balatro-style pixel-art cards, drawn pixel by pixel at native resolution (no anti-aliasing),
 * returned as PNG data URLs and cached. Show them with `image-rendering: pixelated` at an integer scale.
 *   PixelCards.club({...})  -> 96 × 128 club card
 *   PixelCards.joker({...}) -> 96 × 128 joker / ticket card (or 64 × 86 when mini) */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- canvas
  const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };
  class PX {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
      this.ctx = this.c.getContext('2d');
      this.img = this.ctx.createImageData(w, h); this.d = this.img.data;
    }
    set(x, y, col) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const c = typeof col === 'string' ? hex(col) : col, i = (y * this.w + x) * 4, d = this.d;
      if (c[3] === 255) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; return; }
      const a = c[3] / 255;
      d[i] = d[i] * (1 - a) + c[0] * a; d[i + 1] = d[i + 1] * (1 - a) + c[1] * a; d[i + 2] = d[i + 2] * (1 - a) + c[2] * a; d[i + 3] = Math.max(d[i + 3], c[3]);
    }
    get(x, y) { const i = (y * this.w + x) * 4; return this.d[i + 3]; }
    rect(x, y, w, h, col) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, col); }
    ellipse(cx, cy, rx, ry, col) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, col);
      }
    }
    roundRect(x, y, w, h, r, col) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const cx = i < r ? r - i - 0.5 : i >= w - r ? i - (w - r) + 0.5 : 0, cy = j < r ? r - j - 0.5 : j >= h - r ? j - (h - r) + 0.5 : 0;
        if (cx * cx + cy * cy <= r * r + 0.5) this.set(x + i, y + j, col);
      }
    }
    poly(pts, col) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, col);
      }
    }
    line(x0, y0, x1, y1, col, t) {
      t = t || 1;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
      for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n; this.rect(Math.round(x - (t - 1) / 2), Math.round(y - (t - 1) / 2), t, t, col); }
    }
    // 1-px outline around everything already drawn
    outline(col) {
      const add = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) > 0) continue;
        if ((x > 0 && this.get(x - 1, y)) || (x < this.w - 1 && this.get(x + 1, y)) || (y > 0 && this.get(x, y - 1)) || (y < this.h - 1 && this.get(x, y + 1))) add.push([x, y]);
      }
      for (const [x, y] of add) this.set(x, y, col);
    }
    blit(src, ox, oy, flip) {
      for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
        const sx = flip ? src.w - 1 - x : x, sy = flip ? src.h - 1 - y : y, i = (sy * src.w + sx) * 4;
        if (src.d[i + 3]) this.set(ox + x, oy + y, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
      }
    }
    url() { this.ctx.putImageData(this.img, 0, 0); return this.c.toDataURL('image/png'); }
  }

  // ------------------------------------------------------------------ fonts
  const F5 = {
    0: [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '], 1: ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
    2: [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'], 3: ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
    4: ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '], 5: ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
    6: ['  ## ', ' #   ', '#    ', '#### ', '#   #', '#   #', ' ### '], 7: ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
    8: [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '], 9: [' ### ', '#   #', '#   #', ' ####', '    #', '   # ', ' ##  '],
    C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '], D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
    E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'], I: [' ### ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
    J: ['  ###', '   # ', '   # ', '   # ', '   # ', '#  # ', ' ##  '], K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
    L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'], O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
    P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '], R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
    S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '], T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
    U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '], W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'],
    Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
    A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'], F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
    N: ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'], '-': ['     ', '     ', '     ', '#####', '     ', '     ', '     '], '+': ['     ', '  #  ', '  #  ', '#####', '  #  ', '  #  ', '     '], ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
  };
  const F3 = { 0: ['###', '# #', '# #', '# #', '###'], 1: [' # ', '## ', ' # ', ' # ', '###'], 2: ['###', '  #', '###', '#  ', '###'], 3: ['###', '  #', '###', '  #', '###'], 4: ['# #', '# #', '###', '  #', '  #'],
    5: ['###', '#  ', '###', '  #', '###'], 6: ['###', '#  ', '###', '# #', '###'], 7: ['###', '  #', '  #', '  #', '  #'], 8: ['###', '# #', '###', '# #', '###'], 9: ['###', '# #', '###', '  #', '###'] };
  function text(px, str, x, y, col, font) {
    font = font || F5;
    const w = font === F5 ? 5 : 3;
    for (const ch of String(str).toUpperCase()) {
      const g = font[ch] || font[' '] || [];
      g.forEach((row, j) => { for (let i = 0; i < w; i++) if (row[i] === '#') px.set(x + i, y + j, col); });
      x += w + 1;
    }
  }
  const textW = (str, font) => String(str).length * ((font === F3 ? 3 : 5) + 1) - 1;

  // "suits" for club types, 7×7
  const SUIT = {
    driver: ['   #   ', '  ###  ', ' ##### ', '#######', '#######', '   #   ', '  ###  '],
    wood: ['  ###  ', '  ###  ', '## # ##', '#######', '## # ##', '   #   ', '  ###  '],
    iron: ['   #   ', '  ###  ', ' ##### ', '#######', ' ##### ', '  ###  ', '   #   '],
    wedge: [' ## ## ', '#######', '#######', '#######', ' ##### ', '  ###  ', '   #   '],
    putter: ['##     ', '####   ', '#####  ', '##     ', '#      ', '#      ', '###    '],
  };
  function suit(px, kind, x, y, col) { (SUIT[kind] || SUIT.iron).forEach((row, j) => { for (let i = 0; i < 7; i++) if (row[i] === '#') px.set(x + i, y + j, col); }); }

  // ------------------------------------------------------------ club sprites
  const INK = '#2a2433';
  function clubSprite(kind) {
    const s = new PX(60, 50);
    const shaft = (x0, y0) => { s.line(x0, y0, 52, 6, '#aab4c0', 2); s.line(x0 + 1, y0, 53, 6, '#e3e8ee', 1); s.line(49, 9, 55, 3, '#3d3550', 3); s.line(50, 9, 55, 4, '#5e5478', 1); };
    const ball = (cx, cy) => { s.ellipse(cx, cy, 5, 5, '#f2f2f2'); s.ellipse(cx + 1, cy + 1, 4, 4, '#d7dbe2'); s.ellipse(cx - 0.5, cy - 0.5, 4, 4, '#ffffff'); s.set(cx - 2, cy - 2, '#e6e9ee'); s.set(cx + 1, cy - 1, '#e6e9ee'); s.set(cx - 1, cy + 1, '#e6e9ee'); };
    if (kind === 'driver' || kind === 'wood') {
      const big = kind === 'driver', base = big ? '#3f63c4' : '#b06a32', hi = big ? '#7f9df0' : '#e0a066', sh = big ? '#283f86' : '#7a4520', rx = big ? 16 : 12, ry = big ? 10 : 8, cx = big ? 20 : 20, cy = big ? 34 : 36;
      shaft(cx + rx - 6, cy - ry + 1);
      s.ellipse(cx, cy, rx, ry, sh); s.ellipse(cx - 1, cy - 1, rx - 1, ry - 1.5, base);
      s.ellipse(cx - rx * 0.35, cy - ry * 0.45, rx * 0.45, ry * 0.28, hi); s.rect(Math.round(cx - rx * 0.55), Math.round(cy - ry * 0.55), 2, 1, '#ffffff');
      s.line(cx - rx + 3, cy + 3, cx + rx - 4, cy + 5, sh, 1);
      ball(big ? 50 : 48, 42);
    } else if (kind === 'iron' || kind === 'wedge') {
      const w = kind === 'wedge';
      if (w) { s.ellipse(26, 46, 24, 4, '#e8cf8a'); s.ellipse(26, 45, 22, 3, '#f5df9e'); }
      shaft(w ? 28 : 30, w ? 22 : 24);
      const P = w ? [[6, 26], [28, 20], [32, 36], [10, 42]] : [[8, 28], [30, 23], [32, 36], [10, 40]];
      s.poly(P, '#7d8894'); s.poly(P.map(([x, y], i) => [x + (i === 1 || i === 2 ? -1 : 1), y + (i < 2 ? 1 : -1)]), '#c3ccd5');
      s.poly([[P[0][0] + 2, P[0][1] + 1], [P[1][0] - 2, P[1][1] + 1], [P[1][0] - 2, P[1][1] + 4], [P[0][0] + 2, P[0][1] + 4]], '#eef2f6');
      for (let k = 0; k < (w ? 4 : 3); k++) s.line(P[0][0] + 4, P[0][1] + 7 + k * 3, P[1][0] - 3, P[1][1] + 7 + k * 3, '#8f9aa6', 1);
      s.line(P[3][0], P[3][1], P[2][0], P[2][1], '#5a6470', 1);
      ball(w ? 46 : 48, w ? 40 : 42);
    } else if (kind === 'putter') {
      s.ellipse(30, 45, 28, 5, '#4fae5e'); s.ellipse(30, 44, 26, 3.5, '#6fca7a');
      s.line(32, 34, 32, 3, '#aab4c0', 2); s.line(33, 34, 33, 3, '#e3e8ee', 1); s.line(32, 3, 32, 11, '#3d3550', 3);
      s.roundRect(12, 32, 34, 9, 4, '#7d8894'); s.roundRect(13, 32, 32, 7, 3, '#c3ccd5'); s.rect(16, 33, 26, 2, '#eef2f6'); s.rect(28, 33, 2, 7, '#e85a5a');
      s.ellipse(52, 38, 3.5, 1.6, '#1d3a24'); ball(46, 37);
    }
    s.outline(INK);
    return s;
  }

  // ------------------------------------------------------------------ cards
  const FACE = { 1: '#f1e4d2', 2: '#e9eef3', 3: '#fbefc6', 4: '#dcf1e2', 5: '#ece6fb' };
  const TIERCOL = { 1: '#b8753a', 2: '#8a9aac', 3: '#d9a21a', 4: '#2f9e5c', 5: '#7d63e8' };
  const KINDCOL = { driver: '#3150a8', wood: '#9a5a26', iron: '#56616e', wedge: '#c4452f', putter: '#2a8a45' };
  const ZONE = ['#4f7fe0', '#ffffff', '#e05050'], DIR = { straight: '#46b86a', slight: '#f2c230', wide: '#f07f3a' };
  const cache = new Map();

  function cardBase(W, H, face) {
    const px = new PX(W, H);
    px.roundRect(0, 0, W, H, 5, INK);
    px.roundRect(1, 1, W - 2, H - 2, 4, '#ffffff');
    px.roundRect(2, 2, W - 4, H - 4, 3, face);
    return px;
  }
  function polychrome(px, W, H) {
    const cols = ['#ffd1dc', '#ffe9b0', '#c9f5d0', '#c6e6ff', '#e2d1ff'];
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) if ((x + y) % 2 === 0) px.set(x, y, hex(cols[Math.floor((x + y) / 14) % cols.length]).slice(0, 3).concat(150));
  }
  function star(px, x, y, filled, col) {
    const S = ['  #  ', ' ### ', '#####', ' ### ', ' # # '];
    S.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === '#') px.set(x + i, y + j, filled ? col : '#c9c2d4'); });
  }

  // o = { key, code, kind, tier, distance (string), dist: [11 zone idx for 2..12], dir: [6 kinds], boost, putt: [line1, line2] }
  function club(o) {
    if (cache.has(o.key)) return cache.get(o.key);
    const W = 96, H = 128, px = cardBase(W, H, FACE[o.tier]);
    if (o.tier === 5) polychrome(px, W, H);
    const kc = KINDCOL[o.kind] || INK;
    // corner index: code + suit (top-left), mirrored bottom-right
    const idx = new PX(16, 18);
    text(idx, o.code, 0, 0, kc); suit(idx, o.kind, 0, 9, kc);
    px.blit(idx, 6, 6); px.blit(idx, W - 6 - 16, H - 6 - 18, true);
    px.blit(clubSprite(o.kind), 18, 12);
    if (o.boost) { star(px, W - 13, 6, true, '#ff5c8a'); }
    // distance and tier stars
    const dw = textW(o.distance);
    text(px, o.distance, Math.round((W - dw) / 2), 64, INK);
    for (let k = 0; k < 5; k++) star(px, 31 + k * 7, 73, k < o.tier, TIERCOL[o.tier]);
    if (o.putt) {
      o.putt.forEach((t, i) => { const tw = textW(t); text(px, t, Math.round((W - tw) / 2), 84 + i * 11, i ? '#3b5dc9' : '#c4452f'); });
    } else {
      // distance strip: 2d6 totals 2-12
      o.dist.forEach((z, i) => {
        const x = 4 + i * 8, v = i + 2;
        px.rect(x, 82, 9, 11, INK); px.rect(x + 1, 83, 7, 9, ZONE[z]); // shared 1-px dividers: 7-px cells
        const ink = z === 1 ? INK : '#ffffff';
        if (v >= 10) { px.rect(x + 2, 85, 1, 5, ink); text(px, v % 10, x + 4, 85, ink, F3); } // narrow "1" so 10-12 fit
        else text(px, v, x + 3, 85, ink, F3);
      });
      // direction strip: red 2d6 totals 2-12
      o.dir.forEach((k, i) => {
        const x = 4 + i * 8, v = i + 2;
        px.rect(x, 95, 9, 11, INK); px.rect(x + 1, 96, 7, 9, DIR[k]);
        if (v >= 10) { px.rect(x + 2, 98, 1, 5, INK); text(px, v % 10, x + 4, 98, INK, F3); }
        else text(px, v, x + 3, 98, INK, F3);
      });
    }
    const url = px.url();
    cache.set(o.key, url);
    return url;
  }

  // Emoji rendered tiny and snapped to hard pixels = a crisp pixel sprite.
  function emojiSprite(emoji, size, fallback, col) {
    const tmp = document.createElement('canvas'); tmp.width = size; tmp.height = size;
    const t = tmp.getContext('2d');
    t.textAlign = 'center'; t.textBaseline = 'middle';
    t.font = `${Math.round(size * 0.86)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    t.fillText(emoji, size / 2, size / 2 + size * 0.06);
    const data = t.getImageData(0, 0, size, size).data, s = new PX(size + 2, size + 2);
    let n = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (data[i + 3] > 120) { n++; const q = (v) => Math.min(255, Math.round(v / 24) * 24); s.set(x + 1, y + 1, [q(data[i]), q(data[i + 1]), q(data[i + 2]), 255]); }
    }
    if (n < size * 2 && fallback) { // no emoji font: scale up the 8×8 icon
      const k = Math.floor(size / 8);
      fallback.forEach((row, j) => { for (let i = 0; i < 8; i++) if (row[i] === 'x') s.rect(1 + i * k, 1 + j * k, k, k, col || '#ffffff'); });
    }
    s.outline(INK);
    return s;
  }
  // o = { key, emoji, fallback, col, type: 'joker'|'ticket', mini }
  function joker(o) {
    const key = o.key + (o.mini ? ':mini' : '');
    if (cache.has(key)) return cache.get(key);
    const W = o.mini ? 64 : 96, H = o.mini ? 86 : 128;
    const px = cardBase(W, H, '#ffffff');
    const a = o.type === 'ticket' ? ['#2fa59a', '#22857c'] : ['#7b55d6', '#5e3eb4'];
    px.roundRect(4, 4, W - 8, H - 8, 3, a[1]);
    for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) if (y < H * 0.55 || (x + y) % 2) px.set(x, y, a[0]);
    const sz = o.mini ? 36 : 56, sp = emojiSprite(o.emoji, sz, o.fallback, o.col);
    px.blit(sp, Math.round((W - sp.w) / 2), Math.round(H * (o.mini ? 0.18 : 0.16)));
    if (!o.mini) {
      const label = o.type === 'ticket' ? 'TICKET' : 'JOKER', tw = textW(label);
      px.roundRect(Math.round((W - tw) / 2) - 4, H - 22, tw + 8, 11, 3, '#ffffff');
      text(px, label, Math.round((W - tw) / 2), H - 20, a[1]);
    }
    const url = px.url();
    cache.set(key, url);
    return url;
  }

  root.PixelCards = { club, joker };
})(window);
