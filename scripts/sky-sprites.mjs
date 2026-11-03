#!/usr/bin/env node
/**
 * Renders the sprites the full-screen weather module's living sky drifts
 * across the screen: public/sky/clouds-{far,mid,near}.png (cumulus),
 * public/sky/clouds-veil.png (the thin night stratus), public/sky/fog.png
 * (mist bands), public/sky/stars.png (the star field), and the falling
 * weather, public/sky/rain-{far,mid,near}.png and snow-{far,mid,near}.png.
 * Everything falling or drifting is seeded random over a tile too tall or
 * wide to read as a loop, with every mark that crosses a tile edge drawn
 * again on the far side so the repeat is seamless.
 *
 *   node scripts/sky-sprites.mjs
 *
 * Each sprite is a 2160x640 grey-plus-alpha PNG: the grey channel is how lit
 * each pixel is (1 = the crown in full light, 0 = the deepest shade) and the
 * alpha is the cloud's coverage. The module tints a sprite once per sky
 * palette at load (white over blue-grey by day, peach over mauve at golden
 * hour, dim indigo at night) and never touches it again, so the Pi pays a
 * single pass of pixel math and then only composites.
 *
 * How a cloud is built:
 *   1. Silhouette: a dome of circles along an arch with an off-centre crown,
 *      two smaller lobes riding on each big one, and a skirt row tucked under
 *      so the underside is flat. The circles join with a smooth maximum, never
 *      a sum, so the interior is one solid mass and only the outline carries
 *      the lobes. A flat base with a slow wobble cuts the field.
 *   2. Outline: four octaves of gradient noise move the outline in and out;
 *      the body alpha is a wide smoothstep across that edge, so the rim is
 *      soft, not furry. A low-alpha halo sits just outside it.
 *   3. Light: how much cloud sits above and slightly left of each pixel, read
 *      from two blurred copies of the alpha mask sampled with an upward
 *      offset. The large blur gives the bright-crown to shaded-underside sweep
 *      across the whole mass; the medium one puts a soft rim on each lobe.
 *   4. Seams: every cloud keeps clear of the tile's edges, and the script
 *      refuses to write a sprite with any alpha in its first or last row or
 *      column, because the module repeats the tile along x.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sky');

// Sprites are designed in half-resolution units and rendered at S times that.
const S = 2;
const TW = 1080 * S;
const TH = 320 * S;

// ── Noise ───────────────────────────────────────────────────────────────────

/** Gradient (Perlin-style) noise with a quintic fade: no grid artefacts. */
function makeNoise(seed) {
  const perm = new Uint8Array(512);
  let x = seed >>> 0 || 1;
  const rnd = () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = rnd() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(px, py) {
    const X = Math.floor(px);
    const Y = Math.floor(py);
    const fx = px - X;
    const fy = py - Y;
    const h = (ix, iy) => perm[(perm[ix & 255] + iy) & 255];
    const d = (ix, iy, dx, dy) => {
      const g = h(ix, iy);
      return gx[g] * dx + gy[g] * dy;
    };
    const u = fade(fx);
    const v = fade(fy);
    const a = d(X, Y, fx, fy);
    const b = d(X + 1, Y, fx - 1, fy);
    const c = d(X, Y + 1, fx, fy - 1);
    const e = d(X + 1, Y + 1, fx - 1, fy - 1);
    const n = a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
    return Math.min(1, Math.max(0, n * 0.72 + 0.5));
  }
  function fbm(px, py, oct) {
    let s = 0;
    let a = 0.5;
    let f = 1;
    let n = 0;
    for (let o = 0; o < oct; o++) {
      s += a * n2(px * f, py * f);
      n += a;
      a *= 0.5;
      f *= 2.03;
      px += 17.3;
      py += 9.1;
    }
    return s / n;
  }
  return { n2, fbm };
}

const sm = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Smooth maximum: the union of two circles without a valley where they meet. */
const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

// ── Shapes ──────────────────────────────────────────────────────────────────

/**
 * A cumulus as a dome of circles: n puffs along an arch of width w and height
 * h over a flat base at baseY, big in the middle and smaller toward the ends.
 * Coordinates are half-resolution units.
 */
function dome(cx, baseY, w, h, n, j) {
  const puffs = [];
  for (let i = 0; i < n; i++) {
    // The crown sits a little off centre so no cloud is symmetric.
    const t = n === 1 ? 0.5 : i / (n - 1);
    const peak = 0.5 + 0.12 * Math.sin(j * 2.3);
    const along = t < peak ? t / (2 * peak) : 0.5 + (t - peak) / (2 * (1 - peak));
    const arch = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, along))), 1.5);
    const jx = Math.sin(j * 7.3 + i * 2.1) * w * 0.04;
    const jy = Math.cos(j * 3.7 + i * 1.3) * h * 0.06;
    const r = w * (0.09 + 0.14 * arch);
    const x = cx + (t - 0.5) * w * 0.78 + jx;
    const y = baseY - h * (0.36 + 0.56 * arch) + jy;
    puffs.push([x, y, r]);
    // Cauliflower: two smaller lobes riding on each big one.
    const a1 = j * 1.9 + i * 2.4;
    const a2 = a1 + 2.2;
    puffs.push([x + Math.cos(a1) * r * 0.6, y - Math.abs(Math.sin(a1)) * r * 0.55 - r * 0.15, r * 0.55]);
    puffs.push([x + Math.cos(a2) * r * 0.7, y - Math.abs(Math.sin(a2)) * r * 0.5 - r * 0.1, r * 0.45]);
  }
  // A skirt of puffs so the underside is full and flat, overlapping the arch
  // so it never hangs below the body as its own lump.
  for (let i = 0; i < n - 1; i++) {
    const t = (i + 0.5) / (n - 1);
    puffs.push([cx + (t - 0.5) * w * 0.62, baseY - h * 0.34, w * 0.14]);
  }
  return { baseY, puffs, h };
}

// Every cloud keeps well clear of the tile's left and right edges, so the
// repeat seam never cuts one (the edge check below enforces it). A tile is
// two screens wide and no two clouds in it share a size, so a wall never
// shows the same silhouette twice at once: small fragments, long flat
// banks and tall towers mixed through each layer.
const LAYOUTS = {
  far: { seed: 11, clouds: [
    dome(120, 104, 120, 52, 4, 1), dome(300, 84, 70, 30, 3, 2), dome(430, 126, 96, 44, 3, 3),
    dome(610, 124, 140, 34, 6, 8), dome(790, 118, 56, 26, 2, 9), dome(940, 112, 100, 44, 4, 10),
  ] },
  mid: { seed: 23, clouds: [
    dome(130, 156, 160, 80, 5, 4), dome(390, 132, 150, 72, 5, 5),
    dome(650, 150, 240, 68, 7, 11), dome(890, 138, 100, 58, 3, 12),
  ] },
  near: { seed: 37, clouds: [
    dome(190, 244, 270, 146, 6, 6), dome(470, 268, 150, 86, 4, 7),
    dome(720, 256, 320, 118, 8, 13), dome(985, 262, 86, 48, 3, 14),
  ] },
};

// ── Raster ──────────────────────────────────────────────────────────────────

/** Separable box blur, repeated (three passes is close to Gaussian). */
function blur(src, w, h, r, passes) {
  let a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / (2 * r + 1);
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

/** Grey (how lit) and alpha (coverage) for one layer, both 0..1 per pixel. */
function renderLayer(layer) {
  const { seed, clouds } = LAYOUTS[layer];
  const N = makeNoise(seed);
  const A = new Float32Array(TW * TH);
  const V = new Float32Array(TW * TH);
  const H = new Float32Array(TW * TH);
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      // Signed distance-like field: positive inside the cloud.
      let v = -1e9;
      let hBest = 0;
      let vBest = -1e9;
      for (const c of clouds) {
        let vc = -1e9;
        for (const [px, py, r] of c.puffs) {
          const dx = x - px * S;
          const dy = (y - py * S) * 1.08;
          vc = smax(vc, r * S - Math.hypot(dx, dy), 18 * S);
        }
        // Flat base with a slow wobble.
        const baseY = c.baseY * S + 4 * S * (N.n2(x / (60 * S), 7.7) - 0.5);
        vc = Math.min(vc, (baseY - y) * 0.9 + 6 * S);
        if (vc > vBest) {
          vBest = vc;
          hBest = Math.min(1, Math.max(0, (baseY - y) / (c.h * S)));
        }
        v = smax(v, vc, 10 * S);
      }
      // Erode the outline only: large soft billows plus a fine ragged edge.
      const e = (N.fbm(x / (50 * S) + 5, y / (50 * S), 4) - 0.5) * 20 * S
        + (N.n2(x / (12 * S), y / (12 * S) + 3) - 0.5) * 2.5 * S;
      v += e;
      const k = y * TW + x;
      V[k] = v;
      H[k] = hBest;
      A[k] = sm(-9 * S, 5 * S, v);
    }
  }
  // Occlusion lighting at two scales (see the file comment).
  const BL = blur(A, TW, TH, Math.round(34 * S), 3);
  const BM = blur(A, TW, TH, Math.round(9 * S), 2);
  const at = (B, x, y) => B[Math.min(TH - 1, Math.max(0, y)) * TW + Math.min(TW - 1, Math.max(0, x))];
  const oxL = Math.round(12 * S);
  const oyL = Math.round(44 * S);
  const oxM = Math.round(4 * S);
  const oyM = Math.round(12 * S);

  const grey = new Uint8Array(TW * TH);
  const alpha = new Uint8Array(TW * TH);
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      const k = y * TW + x;
      const body = A[k];
      const veil = sm(-22 * S, -4 * S, V[k]) * 0.2; // soft halo just outside the outline
      let a = 1 - (1 - body) * (1 - veil);
      if (a < 0.004) continue;
      const L = 1 - 0.55 * at(BL, x - oxL, y - oyL) - 0.28 * at(BM, x - oxM, y - oyM);
      let lit = 0.12 + 0.74 * L // light from above: crowns bright, hollows shaded
        + 0.18 * H[k] - 0.06 // a gentle fall-off toward the base
        + 0.1 * (1 - body); // the halo is backlit
      lit = Math.min(1, Math.max(0, lit));
      a *= 0.86 + 0.14 * H[k];
      grey[k] = Math.round(lit * 255);
      alpha[k] = Math.round(a * 255);
    }
  }
  return { grey, alpha };
}

// ── Night veils ─────────────────────────────────────────────────────────────

/**
 * The thin stratus of a partly cloudy night: long horizontal streaks that the
 * moon and stars show through. Three bands across the tile, each wandering
 * up and down with low-frequency noise and textured along its length with
 * fibre noise stretched twelve to one, fading out before the tile's ends so
 * the repeat never cuts a streak. Same grey-plus-alpha contract as the
 * cumulus: the grey is how lit the fibre is, the alpha its coverage, and the
 * alpha never exceeds .55 so the sky always reads through it.
 */
const VEIL_BANDS = [
  // [centre as a fraction of the height, half thickness, seed offset, strength]
  [0.20, 0.085, 1.3, 0.9],
  [0.44, 0.11, 4.1, 1.0],
  [0.70, 0.08, 7.9, 0.75],
];
function renderVeil() {
  const N = makeNoise(53);
  const A = new Float32Array(TW * TH);
  const G = new Float32Array(TW * TH);
  for (let y = 0; y < TH; y++) {
    const v = y / TH;
    for (let x = 0; x < TW; x++) {
      const u = x / TW;
      let a = 0;
      let lit = 0.8;
      for (const [cy, th, sp, strength] of VEIL_BANDS) {
        const wobble = (N.fbm(u * 2.2 + sp, v * 1.5 + sp * 3, 3) - 0.5) * 0.18;
        const d = Math.abs(v - cy - wobble) / th;
        if (d >= 1) continue;
        const profile = Math.pow(1 - d * d, 1.5);
        // Fibres: slow along x, faster along y, but coarse enough to read as
        // smears rather than lines (the blur below finishes the job).
        const fibre = N.fbm(u * 5 + sp * 5, v * 26 + sp, 3);
        // Whole stretches thin out and vanish, so a band is a chain of wisps.
        const gaps = N.fbm(u * 2.6 + sp * 2, v * 4, 2);
        const presence = N.fbm(u * 1.1 + sp * 4, 0.37 + sp, 2);
        const band = profile * sm(0.34, 0.72, fibre) * sm(0.36, 0.66, gaps) * sm(0.3, 0.6, presence) * strength;
        if (band > a) {
          a = band;
          lit = 0.6 + 0.32 * fibre;
        }
      }
      // Clear ends: the tile repeats along x.
      a *= sm(0, 0.08, u) * sm(1, 0.92, u);
      const k = y * TW + x;
      A[k] = a;
      G[k] = lit;
    }
  }
  // Soften: a veil has no edges.
  const BA = blur(A, TW, TH, Math.round(3.5 * S), 2);
  const BG = blur(G, TW, TH, Math.round(3 * S), 1);
  const grey = new Uint8Array(TW * TH);
  const alpha = new Uint8Array(TW * TH);
  for (let k = 0; k < A.length; k++) {
    const a = Math.min(0.5, BA[k] * 0.62);
    if (a < 0.004) continue;
    grey[k] = Math.round(Math.min(1, Math.max(0, BG[k])) * 255);
    alpha[k] = Math.round(a * 255);
  }
  return { grey, alpha };
}

// ── Stars ───────────────────────────────────────────────────────────────────

/**
 * A star field tile, white on transparent, repeated in both directions. Most
 * stars are a pixel or two; a handful carry a soft halo so the field has
 * depth the way the phone's does. Stars keep off the tile's edges so the
 * repeat never shows half of one.
 */
const STAR_W = 540;
const STAR_H = 960;
function renderStars() {
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const acc = new Float32Array(STAR_W * STAR_H);
  const dot = (cx, cy, r, bright) => {
    const reach = Math.ceil(r * 3);
    const sig2 = 2 * (r * 0.62) * (r * 0.62);
    for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(STAR_H - 1, Math.ceil(cy + reach)); y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(STAR_W - 1, Math.ceil(cx + reach)); x++) {
        const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        const k = y * STAR_W + x;
        acc[k] = Math.max(acc[k], bright * Math.exp(-d2 / sig2));
      }
    }
  };
  const margin = 6;
  for (let i = 0; i < 460; i++) {
    const x = margin + rand() * (STAR_W - 2 * margin);
    const y = margin + rand() * (STAR_H - 2 * margin);
    const t = rand();
    const r = 0.55 + t * t * t * 1.9;
    dot(x, y, r, 0.45 + rand() * 0.55);
  }
  for (let i = 0; i < 14; i++) {
    const x = 12 + rand() * (STAR_W - 24);
    const y = 12 + rand() * (STAR_H - 24);
    dot(x, y, 7.5, 0.16); // halo
    dot(x, y, 2.4, 1);
  }
  const grey = new Uint8Array(STAR_W * STAR_H).fill(255);
  const alpha = new Uint8Array(STAR_W * STAR_H);
  for (let k = 0; k < acc.length; k++) alpha[k] = Math.round(Math.min(1, acc[k]) * 255);
  return { grey, alpha };
}

// ── Fog ─────────────────────────────────────────────────────────────────────

/**
 * Mist as horizontal bands over the whole height: five bands of stretched
 * noise, thinning to nothing in stretches, softened with a blur, and clear
 * at the tile's ends so the repeat never shows. Grey plus alpha like the
 * clouds; the module tints it with the fog palette.
 */
const FOG_W = 2160;
const FOG_H = 1080;
function renderFog() {
  const N = makeNoise(97);
  const A = new Float32Array(FOG_W * FOG_H);
  const G = new Float32Array(FOG_W * FOG_H);
  const BANDS = [
    // [centre, half thickness, seed, strength]
    [0.12, 0.09, 1.1, 0.55], [0.32, 0.12, 3.7, 0.8], [0.52, 0.11, 6.3, 0.9], [0.74, 0.13, 8.9, 1.0], [0.94, 0.12, 11.3, 1.0],
  ];
  for (let y = 0; y < FOG_H; y++) {
    const v = y / FOG_H;
    for (let x = 0; x < FOG_W; x++) {
      const u = x / FOG_W;
      let a = 0;
      let lit = 0.85;
      for (const [cy, th, sp, strength] of BANDS) {
        const wobble = (N.fbm(u * 1.8 + sp, v * 1.2 + sp * 2, 3) - 0.5) * 0.2;
        const d = Math.abs(v - cy - wobble) / th;
        if (d >= 1) continue;
        const profile = Math.pow(1 - d * d, 1.3);
        const fibre = N.fbm(u * 3.5 + sp * 5, v * 14 + sp, 3);
        const presence = N.fbm(u * 1.3 + sp * 4, 0.21 + sp, 2);
        const band = profile * sm(0.3, 0.75, fibre) * sm(0.32, 0.6, presence) * strength;
        if (band > a) { a = band; lit = 0.72 + 0.28 * fibre; }
      }
      a *= sm(0, 0.07, u) * sm(1, 0.93, u);
      const k = y * FOG_W + x;
      A[k] = a; G[k] = lit;
    }
  }
  const BA = blur(A, FOG_W, FOG_H, 9, 2);
  const BG = blur(G, FOG_W, FOG_H, 7, 1);
  const grey = new Uint8Array(FOG_W * FOG_H);
  const alpha = new Uint8Array(FOG_W * FOG_H);
  for (let k = 0; k < A.length; k++) {
    const a = Math.min(0.6, BA[k] * 0.7);
    if (a < 0.004) continue;
    grey[k] = Math.round(Math.min(1, Math.max(0, BG[k])) * 255);
    alpha[k] = Math.round(a * 255);
  }
  return { grey, alpha, w: FOG_W, h: FOG_H };
}

// ── Rain and snow ───────────────────────────────────────────────────────────

/** A small seeded random source, so a sprite is the same on every run. */
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/** Add a soft mark at (cx, cy) wrapping across both tile edges. */
function wrapped(acc, W, H, cx, cy, reach, draw) {
  for (const ox of [0, -W, W]) {
    for (const oy of [0, -H, H]) {
      const x0 = cx + ox, y0 = cy + oy;
      if (x0 + reach < 0 || x0 - reach > W || y0 + reach < 0 || y0 - reach > H) continue;
      draw(x0, y0);
    }
  }
}

/**
 * `count` points over a W x H tile: one in each cell of a grid, placed at
 * random inside its cell, in a random order. Plain random draws clump and
 * leave holes hundreds of pixels tall, which on the wall read as rain or
 * snow arriving in bursts; a jittered grid is as irregular up close and
 * even at every larger scale.
 */
function scatter(r, W, H, count) {
  const cols = Math.max(1, Math.round(Math.sqrt(count * W / H)));
  const rows = Math.max(1, Math.round(count / cols));
  const pts = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pts.push([(i + r()) * W / cols, (j + r()) * H / rows]);
  for (let k = pts.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [pts[k], pts[m]] = [pts[m], pts[k]]; }
  return pts;
}

/**
 * Rain: thin vertical streaks, each its own length, weight and brightness,
 * scattered evenly over a tall tile. The streak is soft across and fades
 * at both ends, so it reads as a drop moving, not a ruled line. The module
 * slants and speeds the layers; near drops are longer and brighter.
 */
function renderRain({ seed, W, H, count, len, thick, alpha, blurR }) {
  const r = rng(seed);
  const acc = new Float32Array(W * H);
  const dot = (x0, y0, L, t, a) => {
    const sig2 = 2 * (t * 0.55) * (t * 0.55);
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y0 + L)); y++) {
      const f = (y - y0) / L;
      const end = Math.min(1, f * 6) * Math.min(1, (1 - f) * 3); // sharp head, soft tail
      for (let x = Math.max(0, Math.floor(x0 - t * 2)); x <= Math.min(W - 1, Math.ceil(x0 + t * 2)); x++) {
        const dx = x + 0.5 - x0;
        const v = a * end * Math.exp(-(dx * dx) / sig2);
        const k = y * W + x;
        if (v > acc[k]) acc[k] = v;
      }
    }
  };
  for (const [cx, cy] of scatter(r, W, H, count)) {
    const L = len[0] + r() * (len[1] - len[0]);
    const t = thick[0] + r() * (thick[1] - thick[0]);
    const a = alpha[0] + r() * (alpha[1] - alpha[0]);
    wrapped(acc, W, H, cx, cy, L + 4, (x0, y0) => dot(x0, y0, L, t, a));
  }
  const soft = blurR ? blur(acc, W, H, blurR, 1) : acc;
  const grey = new Uint8Array(W * H).fill(255);
  const al = new Uint8Array(W * H);
  for (let k = 0; k < al.length; k++) al[k] = Math.round(Math.min(1, soft[k]) * 255);
  return { grey, alpha: al, w: W, h: H };
}

/**
 * Snow: round flakes in a spread of sizes, the far ones small and soft, the
 * near ones larger with a bright core, scattered evenly over a tall tile.
 */
function renderSnow({ seed, W, H, count, radius, alpha, blurR }) {
  const r = rng(seed);
  const acc = new Float32Array(W * H);
  const dot = (x0, y0, R, a) => {
    const sig2 = 2 * (R * 0.6) * (R * 0.6);
    const reach = Math.ceil(R * 2.2);
    for (let y = Math.max(0, Math.floor(y0 - reach)); y <= Math.min(H - 1, Math.ceil(y0 + reach)); y++) {
      for (let x = Math.max(0, Math.floor(x0 - reach)); x <= Math.min(W - 1, Math.ceil(x0 + reach)); x++) {
        const d2 = (x + 0.5 - x0) ** 2 + (y + 0.5 - y0) ** 2;
        const v = a * Math.exp(-d2 / sig2);
        const k = y * W + x;
        if (v > acc[k]) acc[k] = v;
      }
    }
  };
  for (const [cx, cy] of scatter(r, W, H, count)) {
    const R = radius[0] + r() * (radius[1] - radius[0]);
    const a = alpha[0] + r() * (alpha[1] - alpha[0]);
    wrapped(acc, W, H, cx, cy, R * 2.5, (x0, y0) => dot(x0, y0, R, a));
  }
  const soft = blurR ? blur(acc, W, H, blurR, 1) : acc;
  const grey = new Uint8Array(W * H).fill(255);
  const al = new Uint8Array(W * H);
  for (let k = 0; k < al.length; k++) al[k] = Math.round(Math.min(1, soft[k]) * 255);
  return { grey, alpha: al, w: W, h: H };
}

/**
 * The falling layers. Tile heights differ per layer and share no small
 * common multiple with each other or with the sway periods in LivingSky, so
 * the composite never visibly repeats. These sizes are what the module's
 * keyframes translate by; change them together.
 */
const RAIN_LAYERS = {
  'rain-far': { seed: 101, W: 540, H: 1320, count: 300, len: [12, 26], thick: [0.9, 1.3], alpha: [0.25, 0.55], blurR: 1 },
  'rain-mid': { seed: 211, W: 540, H: 1440, count: 190, len: [22, 44], thick: [1.1, 1.7], alpha: [0.35, 0.75], blurR: 0 },
  'rain-near': { seed: 307, W: 540, H: 1560, count: 120, len: [36, 76], thick: [1.4, 2.4], alpha: [0.5, 1], blurR: 0 },
};
const SNOW_LAYERS = {
  'snow-far': { seed: 401, W: 720, H: 1440, count: 300, radius: [1.1, 2], alpha: [0.35, 0.7], blurR: 1 },
  'snow-mid': { seed: 503, W: 720, H: 1560, count: 170, radius: [2, 3.4], alpha: [0.5, 0.9], blurR: 0 },
  'snow-near': { seed: 607, W: 720, H: 1680, count: 90, radius: [3.4, 6.5], alpha: [0.7, 1], blurR: 0 },
};

// ── PNG ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** An 8-bit grey-plus-alpha PNG (colour type 4). */
function encodeGreyAlphaPng(width, height, grey, alpha) {
  const raw = Buffer.alloc((width * 2 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 2 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      raw[row + 1 + x * 2] = grey[k];
      raw[row + 2 + x * 2] = alpha[k];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 4; // grey + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Main ────────────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });
for (const layer of Object.keys(LAYOUTS)) {
  const started = Date.now();
  const { grey, alpha } = renderLayer(layer);
  // Seam check: the first and last columns and rows must be empty, or the
  // repeat would cut a cloud.
  const touched = [];
  for (let y = 0; y < TH; y++) {
    if (alpha[y * TW]) touched.push(`left at y=${(y / S).toFixed(0)}`);
    if (alpha[y * TW + TW - 1]) touched.push(`right at y=${(y / S).toFixed(0)}`);
  }
  for (let x = 0; x < TW; x++) {
    if (alpha[x]) touched.push(`top at x=${(x / S).toFixed(0)}`);
    if (alpha[(TH - 1) * TW + x]) touched.push(`bottom at x=${(x / S).toFixed(0)}`);
  }
  if (touched.length) {
    console.error(`clouds-${layer}: a cloud touches the tile edge (${touched[0]}, ${touched.length} px); move it inward`);
    process.exit(1);
  }
  const png = encodeGreyAlphaPng(TW, TH, grey, alpha);
  const file = join(OUT_DIR, `clouds-${layer}.png`);
  writeFileSync(file, png);
  console.log(`${file}  ${(png.length / 1024).toFixed(0)} KB  ${Date.now() - started} ms`);
}
{
  const started = Date.now();
  const { grey, alpha } = renderVeil();
  let edge = 0;
  for (let y = 0; y < TH; y++) edge = Math.max(edge, alpha[y * TW], alpha[y * TW + TW - 1]);
  if (edge > 0) {
    console.error(`clouds-veil: a streak touches the tile edge (alpha ${edge}); widen the end fade`);
    process.exit(1);
  }
  const png = encodeGreyAlphaPng(TW, TH, grey, alpha);
  const file = join(OUT_DIR, 'clouds-veil.png');
  writeFileSync(file, png);
  console.log(`${file}  ${(png.length / 1024).toFixed(0)} KB  ${Date.now() - started} ms`);
}
for (const [name, spec] of [...Object.entries(RAIN_LAYERS).map(([n, sp]) => [n, renderRain(sp)]), ...Object.entries(SNOW_LAYERS).map(([n, sp]) => [n, renderSnow(sp)]), ['fog', renderFog()]]) {
  const started = Date.now();
  const png = encodeGreyAlphaPng(spec.w, spec.h, spec.grey, spec.alpha);
  const file = join(OUT_DIR, `${name}.png`);
  writeFileSync(file, png);
  console.log(`${file}  ${(png.length / 1024).toFixed(0)} KB  ${Date.now() - started} ms`);
}
{
  const started = Date.now();
  const { grey, alpha } = renderStars();
  const png = encodeGreyAlphaPng(STAR_W, STAR_H, grey, alpha);
  const file = join(OUT_DIR, 'stars.png');
  writeFileSync(file, png);
  console.log(`${file}  ${(png.length / 1024).toFixed(0)} KB  ${Date.now() - started} ms`);
}
