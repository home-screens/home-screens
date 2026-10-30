'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SKY_BASES, type SkyScene } from './sky-layer';
import { useCloudSprites, CLOUD_TILE_W, CLOUD_TILE_H, DRIFT_LAYERS } from './cloud-sprites';
import { MoonImage } from './moon';
import { useBoxSize, type BoxSize } from './useBoxSize';

/**
 * The living sky: an animated background that matches the weather.
 *
 * Every layer is an absolutely positioned element animated with transform
 * and opacity only, so a Raspberry Pi's compositor does all of it. No
 * `filter`, no canvas loop, no JavaScript per frame. The rules that keep it
 * cheap and seamless:
 *
 * - Clouds: tinted sprite layers (far, mid, near, the night veil) repeated
 *   along x on a layer one tile wider than the canvas, slid by exactly one
 *   tile width, so the loop is seamless at any canvas width and parallax
 *   comes free. The sprites keep clear of the tile's ends.
 * - Fog: one generated mist sheet drawn three times at three speeds, two
 *   one way and one the other, one mirrored; clear at its ends like the
 *   clouds, so the slide carries no seam.
 * - Rain and snow: generated sprites of random drops and flakes on tiles
 *   too tall to read as a loop, one layer per depth, each one tile taller
 *   than the canvas and slid down by its own tile height; the snow layers
 *   sway on periods that share no multiple with their fall. The rain sits
 *   in a container that skews it.
 * - Lightning: a glow from behind the cloud deck every 13 s, never a
 *   full-screen white.
 * - A faint scrim over the top of the sky so white type survives a white
 *   cloud behind the hero.
 * - Every slid layer spans a whole number of tiles, never canvas plus one
 *   tile: under CSS zoom (the display page fits a wall into a smaller
 *   window with it) Firefox leaves the trailing partial copy of a repeated
 *   background unpainted on a compositor-moved element, and that blank
 *   strip crossed the screen once per cycle. The sky measures itself for
 *   that; until it has, the layers fall back to canvas plus one tile.
 *
 * A scene change cross-fades: the old stack stays underneath while the new
 * one fades in over a few seconds, then unmounts.
 */
const FADE_MS = 3000;

/**
 * `moonPlace` says where the moon may sit: beside the Forecast page's big
 * temperature (`hero`), or up in the header band where every other view
 * keeps only its place name and the clock (`header`).
 */
export default function LivingSky({ scene, moonPhase, moonPlace = 'header' }: { scene: SkyScene; moonPhase?: number; moonPlace?: 'hero' | 'header' }) {
  const [stacks, setStacks] = useState<Array<{ scene: SkyScene; id: number }>>(() => [{ scene, id: 0 }]);
  const nextId = useRef(1);
  const current = stacks[stacks.length - 1];
  useEffect(() => {
    if (current.scene.key === scene.key) return;
    setStacks((prev) => [...prev, { scene, id: nextId.current++ }]);
  }, [scene, current.scene.key]);
  // The incoming stack says when its fade is done; everything under it goes.
  // (A timer set in the effect above was cleared by its own cleanup as soon
  // as the new stack landed, and the old stacks piled up for good.)
  const settled = useCallback((id: number) => setStacks((prev) => prev.filter((s) => s.id >= id)), []);
  const root = useRef<HTMLDivElement>(null);
  const size = useBoxSize(root);

  return (
    <div ref={root} data-testid="fsw-sky" className={`fsw-sky fsw-sky-moon-${moonPlace}`} data-scene={current.scene.key} aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', containerType: 'size' }}>
      <Keyframes />
      {stacks.map((s, i) => (
        <Stack key={s.id} id={s.id} scene={s.scene} moonPhase={moonPhase} fadeIn={i > 0} onSettled={settled} size={size} />
      ))}
    </div>
  );
}

/**
 * The length a slid layer needs along its slide: whole tiles, at least one
 * more than the canvas. The fallback is the canvas plus a tile for the
 * first paint, before the sky has measured itself.
 */
function tileSpan(canvas: number | undefined, tile: number): string {
  if (canvas == null) return `calc(100% + ${tile}px)`;
  return `${Math.ceil((canvas + tile) / tile) * tile}px`;
}

function Stack({ id, scene, moonPhase, fadeIn, onSettled, size }: {
  id: number; scene: SkyScene; moonPhase?: number; fadeIn: boolean; onSettled: (id: number) => void; size: BoxSize;
}) {
  const sprites = useCloudSprites(Object.keys(scene.clouds).length || scene.mist ? scene.palette : null);
  // The fade is a CSS animation, not a state flip after a frame: animation
  // frames stop while a tab or the wall's screen is off, and a fade that
  // waited on one was cancelled when the settle timer unmounted the stack
  // beneath it, leaving the new sky at opacity 0 for good.
  useEffect(() => {
    if (!fadeIn) return;
    const timer = setTimeout(() => onSettled(id), FADE_MS + 100);
    return () => clearTimeout(timer);
  }, [fadeIn, id, onSettled]);

  return (
    <div style={{
      position: 'absolute', inset: 0, background: SKY_BASES[scene.base],
      animation: fadeIn ? `fsw-sky-fade-in ${FADE_MS}ms ease both` : undefined,
    }}>
      {scene.stars && <Stars />}
      {scene.sun && <Sun low={scene.sun === 'low'} />}
      {scene.moon && <Moon phase={moonPhase ?? 0} />}
      {scene.deck && <Deck base={scene.base} />}
      {scene.lightning && <Lightning />}
      {DRIFT_LAYERS.map((layer) => {
        const opacity = scene.clouds[layer];
        if (opacity == null) return null;
        return (
          <div key={layer} style={{
            position: 'absolute', left: 0, top: 0, height: CLOUD_TILE_H,
            width: tileSpan(size?.w, CLOUD_TILE_W),
            backgroundImage: sprites ? `url(${sprites[layer]})` : undefined,
            backgroundRepeat: 'repeat-x', backgroundSize: `${CLOUD_TILE_W}px ${CLOUD_TILE_H}px`,
            // The sprites arrive a beat after the base paints: ease them in.
            opacity: sprites ? opacity : 0, transition: 'opacity 1.5s ease',
            animation: `fsw-sky-slide ${CLOUD_SPEED_S[layer]}s linear infinite`,
            willChange: 'transform',
          }} />
        );
      })}
      {scene.mist && <Mist night={scene.base === 'fog-night'} sheet={sprites?.fog ?? null} width={size?.w} />}
      {scene.rain && <Rain height={size?.h} />}
      {scene.snow && <Snow height={size?.h} />}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: '100%', height: '40%',
        background: 'radial-gradient(55% 80% at 50% 30%, rgba(10,14,30,.26), rgba(10,14,30,0) 100%)',
      }} />
    </div>
  );
}

/** Seconds per tile width: far is slowest, near fastest, so the layers part as they drift. */
// Seconds per tile. The tile is two screens wide, so a cloud crosses a
// 1080 px wall in half of this.
const CLOUD_SPEED_S = { far: 640, mid: 400, near: 250, veil: 520 } as const;

function Keyframes() {
  return (
    <style>{`
      @keyframes fsw-sky-slide { from { transform: translate3d(0,0,0); } to { transform: translate3d(-${CLOUD_TILE_W}px,0,0); } }
      @keyframes fsw-sky-slide-back { from { transform: translate3d(-${CLOUD_TILE_W}px,0,0); } to { transform: translate3d(0,0,0); } }
      @keyframes fsw-sky-fade-in { from { opacity: 0; } to { opacity: 1; } }
      .fsw-sky { --fsw-moon-size: min(11cqw, 8cqh); --fsw-moon-left: 70cqw; --fsw-moon-top: 1.5cqh; }
      .fsw-sky-moon-hero { --fsw-moon-size: min(15cqw, 17cqh); --fsw-moon-left: 67cqw; --fsw-moon-top: 12cqh; }
      @container (orientation: landscape) {
        .fsw-sky { --fsw-moon-size: min(10cqh, 7cqw); --fsw-moon-left: 80cqw; --fsw-moon-top: 2cqh; }
        .fsw-sky-moon-hero { --fsw-moon-size: min(13cqh, 9cqw); --fsw-moon-left: 78cqw; --fsw-moon-top: 9cqh; }
      }
      ${FALL_HEIGHTS.map((h) => `@keyframes fsw-sky-fall-${h} { from { transform: translate3d(0,-${h}px,0); } to { transform: translate3d(0,0,0); } }`).join('\n      ')}
      ${SWAY_AMPS.map((a) => `@keyframes fsw-sky-sway-${a} { from { transform: translate3d(-${a}px,0,0); } to { transform: translate3d(${a}px,0,0); } }`).join('\n      ')}
      @keyframes fsw-sky-flash { 0%, 100% { opacity: 0; } 46% { opacity: 0; } 46.6% { opacity: .32; } 47.4% { opacity: .06; } 48.2% { opacity: .22; } 49.5% { opacity: 0; } }
    `}</style>
  );
}

/**
 * The star field: one generated tile (public/sky/stars.png, white on
 * transparent, from scripts/sky-sprites.mjs) repeated in both directions,
 * twice at different scales so the repeat never reads. A cool haze sits
 * behind it up and to the right.
 *
 * The stars hold still. A layer that animates is redrawn in full on every
 * frame, and two twinkling full-screen layers held a portrait Raspberry Pi 4
 * at about 40 frames a second; still, they are flattened into the sky behind
 * them and cost nothing.
 */
const STAR_LAYERS = [
  { size: '540px 960px', position: '0 0', opacity: .68 },
  { size: '918px 1632px', position: '310px 140px', opacity: .68 },
];

function Stars() {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 30% at 80% 20%, rgba(129,140,248,.22), transparent 70%)' }} />
      {STAR_LAYERS.map((l, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0, backgroundImage: 'url(/sky/stars.png)', backgroundRepeat: 'repeat',
          backgroundSize: l.size, backgroundPosition: l.position, opacity: l.opacity,
        }} />
      ))}
    </>
  );
}

/**
 * The sun: a soft glow high above the canvas by day, sitting on the horizon at
 * golden hour. It holds still: a slow swell made it a layer redrawn on every
 * frame, which held golden hour on a Raspberry Pi 4 at about 44 frames a second.
 */
function Sun({ low }: { low: boolean }) {
  return (
    <div style={{
      position: 'absolute', width: 900, height: 900, borderRadius: '50%', left: '50%', marginLeft: -450,
      top: low ? '51%' : -560,
      background: low
        ? 'radial-gradient(circle, rgba(255,236,190,1) 0%, rgba(255,170,90,.6) 12%, rgba(255,120,80,.25) 28%, transparent 60%)'
        : 'radial-gradient(circle, rgba(255,246,214,.95) 0%, rgba(255,222,140,.55) 14%, rgba(255,200,90,.22) 30%, transparent 60%)',
    }} />
  );
}

/**
 * The moon, photographed, at its real phase, placed where the phone puts it:
 * beside the temperature on the right, under the cloud layers so a veil can
 * cross it. Container units size and place it, so a portrait wall and a
 * landscape one each get a moon in proportion (the rules live in Keyframes).
 */
function Moon({ phase }: { phase: number }) {
  return <MoonImage phase={phase} size="var(--fsw-moon-size)" glow style={{ position: 'absolute', left: 'var(--fsw-moon-left)', top: 'var(--fsw-moon-top)', opacity: .95 }} />;
}

const DECKS: Partial<Record<SkyScene['base'], string>> = {
  storm: 'linear-gradient(180deg, rgba(40,46,64,.75) 0%, rgba(40,46,64,.4) 45%, rgba(40,46,64,0) 100%)',
  rain: 'linear-gradient(180deg, rgba(40,46,64,.75) 0%, rgba(40,46,64,.4) 45%, rgba(40,46,64,0) 100%)',
  snow: 'linear-gradient(180deg, rgba(210,218,232,.5) 0%, rgba(210,218,232,.25) 45%, rgba(210,218,232,0) 100%)',
  'cloudy-night': 'linear-gradient(180deg, rgba(30,34,52,.7) 0%, rgba(30,34,52,.35) 45%, rgba(30,34,52,0) 100%)',
};
const DECK_DEFAULT = 'linear-gradient(180deg, rgba(190,198,212,.5) 0%, rgba(190,198,212,.3) 40%, rgba(190,198,212,0) 100%)';

function Deck({ base }: { base: SkyScene['base'] }) {
  return <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '42%', background: DECKS[base] ?? DECK_DEFAULT }} />;
}

function Lightning() {
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: '100%', height: '55%', opacity: 0,
      background: 'radial-gradient(55% 60% at 32% 10%, rgba(226,232,255,.95), rgba(200,210,255,.4) 45%, transparent 75%)',
      animation: 'fsw-sky-flash 13s linear infinite',
    }} />
  );
}

/**
 * Fog: the generated mist sheet (public/sky/fog.png, tinted with the fog
 * palette) drawn three times, each at its own speed and offset, one of them
 * mirrored, so the bands never line up with themselves. The sheet is clear
 * at its ends, so the repeat along the slide carries no seam. The scrim
 * underneath thickens the fog toward the ground.
 */
const MIST_LAYERS = [
  { dur: 170, back: false, opacity: .85, offset: 0, mirror: false },
  { dur: 260, back: true, opacity: .7, offset: 760, mirror: true },
  { dur: 110, back: false, opacity: .5, offset: 1500, mirror: false },
];

function Mist({ night, sheet, width }: { night: boolean; sheet: string | null; width?: number }) {
  return (
    <>
      {MIST_LAYERS.map((l, i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, transform: l.mirror ? 'scale(-1, 1)' : undefined }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%', width: tileSpan(width, CLOUD_TILE_W),
            backgroundImage: sheet ? `url(${sheet})` : undefined, backgroundRepeat: 'repeat-x',
            backgroundSize: `${CLOUD_TILE_W}px 100%`, backgroundPosition: `${l.offset}px 0`,
            opacity: sheet ? (night ? l.opacity * .45 : l.opacity) : 0, transition: 'opacity 1.5s ease', willChange: 'transform',
            animation: `${l.back ? 'fsw-sky-slide-back' : 'fsw-sky-slide'} ${l.dur}s linear infinite`,
          }} />
        </div>
      ))}
      <div style={{
        position: 'absolute', inset: 0,
        background: night
          ? 'linear-gradient(180deg, rgba(60,66,82,0) 0%, rgba(60,66,82,.3) 55%, rgba(70,76,92,.62) 100%)'
          : 'linear-gradient(180deg, rgba(160,168,182,0) 0%, rgba(160,168,182,.3) 55%, rgba(178,186,200,.62) 100%)',
      }} />
    </>
  );
}

/**
 * Rain and snow fall as generated sprites (scripts/sky-sprites.mjs): random
 * drops and flakes over tiles too tall to read as a loop. Each layer has its
 * own tile height and speed, and the snow layers their own sway periods, so
 * no two ever line up and the composite never visibly repeats. A layer is
 * the tile repeated down an element spanning whole tiles, at least one more
 * than the sky, slid down by exactly one tile per cycle, which is seamless
 * by construction.
 */
const RAIN_LAYERS = [
  // The tile sizes are the generator's; the keyframes below translate by them.
  // About 310, 510 and 820 px/s: steady rain on a wall, not a downpour.
  { file: 'rain-far', w: 540, h: 1320, dur: 4.2, opacity: .5, x: 230 },
  { file: 'rain-mid', w: 540, h: 1440, dur: 2.8, opacity: .8, x: 90 },
  { file: 'rain-near', w: 540, h: 1560, dur: 1.9, opacity: 1, x: 0 },
] as const;
const SNOW_LAYERS = [
  { file: 'snow-far', w: 720, h: 1440, dur: 27, opacity: .65, x: 310, sway: 11.7, amp: 10 },
  { file: 'snow-mid', w: 720, h: 1560, dur: 17, opacity: .85, x: 120, sway: 9.1, amp: 18 },
  { file: 'snow-near', w: 720, h: 1680, dur: 10.5, opacity: 1, x: 0, sway: 7.3, amp: 28 },
] as const;
const FALL_HEIGHTS = [...new Set([...RAIN_LAYERS, ...SNOW_LAYERS].map((l) => l.h))];
const SWAY_AMPS = SNOW_LAYERS.map((l) => l.amp);

function Rain({ height }: { height?: number }) {
  return (
    <div style={{ position: 'absolute', left: '-14%', top: 0, width: '128%', height: '100%', transform: 'skewX(-7deg)' }}>
      {RAIN_LAYERS.map((l) => (
        <div key={l.file} style={{
          position: 'absolute', left: 0, top: 0, width: '100%', height: tileSpan(height, l.h),
          backgroundImage: `url(/sky/${l.file}.png)`, backgroundRepeat: 'repeat', backgroundSize: `${l.w}px ${l.h}px`, backgroundPosition: `${l.x}px 0`,
          opacity: l.opacity, willChange: 'transform', animation: `fsw-sky-fall-${l.h} ${l.dur}s linear infinite`,
        }} />
      ))}
    </div>
  );
}

function Snow({ height }: { height?: number }) {
  return (
    <>
      {SNOW_LAYERS.map((l) => (
        <div key={l.file} style={{ position: 'absolute', inset: -l.amp, animation: `fsw-sky-sway-${l.amp} ${l.sway}s ease-in-out infinite alternate` }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, width: '100%', height: tileSpan(height, l.h),
            backgroundImage: `url(/sky/${l.file}.png)`, backgroundRepeat: 'repeat', backgroundSize: `${l.w}px ${l.h}px`, backgroundPosition: `${l.x}px 0`,
            opacity: l.opacity, willChange: 'transform', animation: `fsw-sky-fall-${l.h} ${l.dur}s linear infinite`,
          }} />
        </div>
      ))}
    </>
  );
}
