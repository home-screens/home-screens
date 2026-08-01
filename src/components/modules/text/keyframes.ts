// CSS keyframes and per-char effect metadata for the Text module. Kept as
// string constants so each instance injects only the rules its config needs
// (one <style> tag per module).

import type { TextConfig } from '@/types/config';

const GRADIENT_TEXT_CSS = `
[data-text-gradient] {
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  color: transparent !important;
}`;

const GRADIENT_SWEEP_CSS = `
@keyframes _textGradientSweep {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}`;

const GLOW_CSS = `
@keyframes _textGlow {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
}`;

const NEON_CSS = `
@keyframes _textNeonFlicker {
  0%, 100% { opacity: 1; }
  41% { opacity: 1; }
  42% { opacity: 0.85; }
  43% { opacity: 1; }
}`;

const MARQUEE_CSS = `
@keyframes _marqueeLeft  { from { transform: translateX(100%);  } to { transform: translateX(-100%);  } }
@keyframes _marqueeRight { from { transform: translateX(-100%); } to { transform: translateX(100%);  } }
@keyframes _marqueeUp    { from { transform: translateY(100%);  } to { transform: translateY(-100%);  } }
@keyframes _marqueeDown  { from { transform: translateY(-100%); } to { transform: translateY(100%);  } }
`;

const FADE_IN_CSS = `
@keyframes _textFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}`;

const WAVE_CSS = `
@keyframes _textWave {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-0.4em); }
}`;

const BOUNCE_CSS = `
@keyframes _textBounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-0.5em); }
}`;

const SHAKE_CSS = `
@keyframes _textShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px) rotate(-1deg); }
  40% { transform: translateX(2px) rotate(1deg); }
  60% { transform: translateX(-2px) rotate(-0.5deg); }
  80% { transform: translateX(2px) rotate(0.5deg); }
}`;

export const REVEAL_CSS = `
@keyframes _textRevealFade   { from { opacity: 0; } to { opacity: 1; } }
@keyframes _textRevealUp     { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes _textRevealDown   { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes _textRevealZoom   { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
`;

// Per-instance color-cycle keyframes (palette is dynamic, so we build the rule)
function buildColorCycleCss(name: string, palette: string[]): string {
  if (palette.length === 0) return '';
  const stops = palette
    .map((c, i) => {
      const pct = (i / palette.length) * 100;
      return `${pct.toFixed(2)}% { color: ${c}; }`;
    })
    .concat([`100% { color: ${palette[0]}; }`])
    .join(' ');
  return `@keyframes ${name} { ${stops} }`;
}

export const PER_CHAR_EFFECTS = new Set<string>(['wave', 'bounce', 'shake']);
/** Above this many code points, per-char effects fall back to whole-string animation
 *  to avoid spawning hundreds of GPU-animated spans on a Pi. */
export const PER_CHAR_MAX_LENGTH = 200;

interface CollectKeyframesParams {
  config: TextConfig;
  effect: string;
  gradientOn: boolean;
  reveal: string;
  colorCycleName: string;
  colorCyclePalette: string[];
  dropCapClass: string;
}

/** All CSS rules this instance needs, in a fixed order, ready to `.join('\n')`
 *  into a single <style> tag. */
export function collectKeyframes({
  config,
  effect,
  gradientOn,
  reveal,
  colorCycleName,
  colorCyclePalette,
  dropCapClass,
}: CollectKeyframesParams): string[] {
  const needsCSS: string[] = [];
  if (gradientOn) needsCSS.push(GRADIENT_TEXT_CSS);
  if (effect === 'gradient-sweep' && gradientOn) needsCSS.push(GRADIENT_SWEEP_CSS);
  if (effect === 'glow') needsCSS.push(GLOW_CSS);
  if (effect === 'neon') needsCSS.push(NEON_CSS);
  if (effect === 'wave') needsCSS.push(WAVE_CSS);
  if (effect === 'bounce') needsCSS.push(BOUNCE_CSS);
  if (effect === 'shake') needsCSS.push(SHAKE_CSS);
  if (effect === 'color-cycle') needsCSS.push(buildColorCycleCss(colorCycleName, colorCyclePalette));
  if (config.marquee) needsCSS.push(MARQUEE_CSS);
  if (effect === 'fade-in') needsCSS.push(FADE_IN_CSS);
  if (config.rotationEnabled && reveal !== 'none') needsCSS.push(REVEAL_CSS);

  // Drop cap uses ::first-letter, scoped to a generated class
  if (config.dropCap) {
    const dcColor = config.dropCapColor ?? config.accentColor ?? 'inherit';
    needsCSS.push(`
.${dropCapClass}::first-letter {
  font-size: 2.5em;
  font-weight: 700;
  float: left;
  line-height: 0.9;
  margin-right: 0.08em;
  margin-top: 0.05em;
  color: ${dcColor};
}`);
  }

  return needsCSS;
}
