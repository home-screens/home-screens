/**
 * Tiny synthesized chimes for the timer overlay — no audio assets, one lazy
 * AudioContext. Everything is wrapped in try/catch: kiosk Chromium runs with
 * autoplay allowed, but a locked-down browser (or the editor preview) must
 * never crash the overlay over a sound.
 *
 * The palette is deliberately gentle — the whole point of a visual timer is
 * pre-transition nudges instead of alarms.
 */

type TimerSoundKind = 'nudge' | 'step' | 'done';

let ctx: AudioContext | null = null;

function note(frequency: number, startAt: number, duration: number, peak: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const t0 = ctx.currentTime + startAt;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export function playTimerSound(kind: TimerSoundKind): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    switch (kind) {
      case 'nudge':
        note(660, 0, 0.5, 0.06);
        break;
      case 'step':
        note(523.25, 0, 0.35, 0.09);
        note(659.25, 0.18, 0.5, 0.09);
        break;
      case 'done':
        note(523.25, 0, 0.35, 0.1);
        note(659.25, 0.16, 0.35, 0.1);
        note(783.99, 0.32, 0.7, 0.1);
        break;
    }
  } catch {
    // No audio available — the visual states carry the feature.
  }
}
