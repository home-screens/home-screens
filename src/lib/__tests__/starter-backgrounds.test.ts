import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FULLSCREEN_THEMES } from '../fullscreen-themes';
import {
  STARTER_BACKGROUNDS,
  STARTER_BACKGROUNDS_DIR,
  starterBackgroundForTheme,
  starterBackgroundsIn,
} from '../starter-backgrounds';
import { buildStarterBackgroundSvg, parseGradientLayers } from '../starter-background-svg';

// The suite runs with cwd moved into a sandbox (vitest.setup.ts); resolve the
// repo from this file so the committed SVGs are the ones compared.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const svgDir = path.join(repoRoot, STARTER_BACKGROUNDS_DIR);

describe('starter background catalog', () => {
  it('has unique ids and paths', () => {
    const ids = STARTER_BACKGROUNDS.map((bg) => bg.id);
    const paths = STARTER_BACKGROUNDS.map((bg) => bg.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keeps the original eight walls at their shipped paths', () => {
    for (const id of ['midnight', 'dusk', 'forest', 'deep-blue', 'charcoal', 'sunrise', 'plum', 'aurora']) {
      expect(STARTER_BACKGROUNDS.find((bg) => bg.id === id)?.path).toBe(`/backgrounds/themes/${id}.svg`);
    }
  });

  it('ships one wall per fullscreen theme, painted from that theme', () => {
    for (const theme of FULLSCREEN_THEMES) {
      const wall = starterBackgroundForTheme(theme.id);
      expect(wall, `theme ${theme.id} has no wall`).toBeDefined();
      expect(wall?.group).toBe('theme');
      expect(wall?.paint).toEqual({ bg: theme.tokens.bg, bgImage: theme.tokens.bgImage });
    }
    expect(starterBackgroundsIn('theme')).toHaveLength(FULLSCREEN_THEMES.length);
    expect(starterBackgroundForTheme('no-such-theme')).toBeUndefined();
    expect(starterBackgroundForTheme(undefined)).toBeUndefined();
  });
});

describe('committed SVG files', () => {
  it('match the catalog (run `npm run backgrounds:build` after editing it or a theme background)', () => {
    for (const bg of STARTER_BACKGROUNDS) {
      const onDisk = readFileSync(path.join(svgDir, bg.file), 'utf8');
      expect(onDisk, `${bg.file} is stale`).toBe(buildStarterBackgroundSvg(bg.paint));
    }
  });

  it('has no orphan files', () => {
    const wanted = new Set(STARTER_BACKGROUNDS.map((bg) => bg.file));
    const orphans = readdirSync(svgDir).filter((name) => name.endsWith('.svg') && !wanted.has(name));
    expect(orphans).toEqual([]);
  });
});

describe('CSS gradient to SVG conversion', () => {
  it('maps the four axis-aligned CSS angles onto box fractions', () => {
    const [down] = parseGradientLayers('linear-gradient(180deg, #000000 0%, #ffffff 100%)');
    expect(down).toMatchObject({ kind: 'linear', x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
    const [right] = parseGradientLayers('linear-gradient(90deg, #000, #fff)');
    expect(right).toMatchObject({ kind: 'linear', x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    const [up] = parseGradientLayers('linear-gradient(0deg, #000, #fff)');
    expect(up).toMatchObject({ kind: 'linear', x1: 0.5, y1: 1, x2: 0.5, y2: 0 });
    const [left] = parseGradientLayers('linear-gradient(-90deg, #000, #fff)');
    expect(left).toMatchObject({ kind: 'linear', x1: 1, y1: 0.5, x2: 0, y2: 0.5 });
  });

  it('rejects a diagonal CSS angle, whose direction would change with the wall aspect', () => {
    expect(() => parseGradientLayers('linear-gradient(160deg,#0f2027,#2c5364)')).toThrow(/not axis-aligned/);
    expect(() => parseGradientLayers('linear-gradient(45deg,#000,#fff)')).toThrow(/SlopePaint/);
  });

  it('paints a slope wall along its box-fraction vector', () => {
    const svg = buildStarterBackgroundSvg({ bg: '#0f2027', vector: [0, 0, 0.65, 1], stops: ['#0f2027', '#203a43 55%', '#2c5364'] });
    expect(svg).toContain('<linearGradient id="l0" x1="0" y1="0" x2="0.65" y2="1">');
    expect(svg).toContain('<stop offset="0.55" stop-color="#203a43"/>');
  });

  it('spreads unpositioned stops evenly and reads rgba opacity', () => {
    const [layer] = parseGradientLayers('linear-gradient(90deg,#0f2027,#203a43,#2c5364)');
    expect(layer.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    const [radial] = parseGradientLayers('radial-gradient(102% 41% at 100% 0%, rgba(194,65,12,0.10), transparent 60%)');
    expect(radial).toMatchObject({ kind: 'radial', cx: 1, cy: 0, rx: 1.02, ry: 0.41 });
    // `transparent` fades the same colour out, so the wash never turns grey.
    expect(radial.stops).toEqual([
      { color: 'rgb(194,65,12)', opacity: 0.1, offset: 0 },
      { color: 'rgb(194,65,12)', opacity: 0, offset: 0.6 },
    ]);
  });

  it('paints CSS layers top-first, so the SVG draws them in reverse', () => {
    const svg = buildStarterBackgroundSvg({
      bg: '#000000',
      bgImage: 'radial-gradient(50% 50% at 0% 0%, #ff0000, transparent 100%), linear-gradient(180deg, #00ff00, #0000ff)',
    });
    // l0 is the linear (bottom) layer, l1 the radial (top) layer.
    expect(svg.indexOf('<linearGradient id="l0"')).toBeLessThan(svg.indexOf('<radialGradient id="l1"'));
    expect(svg.indexOf('fill="url(#l0)"')).toBeLessThan(svg.indexOf('fill="url(#l1)"'));
    // No intrinsic size, so the file stretches to any wall.
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg">')).toBe(true);
    expect(svg).not.toContain('viewBox');
  });

  it('rejects CSS the themes do not use rather than emitting a wrong wall', () => {
    expect(() => parseGradientLayers('conic-gradient(#000, #fff)')).toThrow(/Unsupported background layer/);
    expect(() => parseGradientLayers('linear-gradient(to right, #000, #fff)')).toThrow(/angle/);
    expect(() => parseGradientLayers('radial-gradient(circle, #000, #fff)')).toThrow(/W% H% at X% Y%/);
    expect(() => parseGradientLayers('linear-gradient(90deg, red, blue)')).toThrow(/Unsupported colour/);
  });

  it('builds pattern walls in pixel units so the texture stays the same size on any wall', () => {
    const svg = buildStarterBackgroundSvg({ pattern: 'diagonal', bg: '#1c1c1e', ink: 'rgba(255,255,255,0.05)', pitch: 18 });
    expect(svg).toContain('patternUnits="userSpaceOnUse"');
    expect(svg).toContain('patternTransform="rotate(45)"');
    expect(svg).toContain('fill="#1c1c1e"');
  });
});
