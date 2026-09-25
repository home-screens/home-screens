import { heldPulseKeyframes } from '@/lib/held-pulse';

// The blinking colon every clock view shares: 1, 0.3, 1 over two seconds,
// redrawn 12 times a second rather than on every screen refresh.
export const COLON_PULSE_KEYFRAMES = heldPulseKeyframes('clock-colon-pulse', { rest: 1, peak: 0.3, periodMs: 2000 });
export const COLON_PULSE_ANIMATION = 'clock-colon-pulse 2s linear infinite';
