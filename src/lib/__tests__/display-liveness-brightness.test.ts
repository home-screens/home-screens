import { describe, it, expect } from 'vitest';
import { agreedBrightness, REMOTE_OFFLINE_AFTER_MS } from '../display-liveness';

const NOW = 1_800_000_000_000;
const live = (brightness?: number | null) => ({ lastSeen: NOW - 2_000, brightness });

describe('agreedBrightness', () => {
  it('is not known with nothing to go on', () => {
    expect(agreedBrightness([], NOW)).toBeNull();
    expect(agreedBrightness([live()], NOW)).toBeNull();
    expect(agreedBrightness([live(null)], NOW)).toBeNull();
  });

  it('is the one level the answering displays share', () => {
    expect(agreedBrightness([live(80)], NOW)).toBe(80);
    expect(agreedBrightness([live(80), live(80)], NOW)).toBe(80);
    expect(agreedBrightness([live(0), live(0)], NOW)).toBe(0);
  });

  it('is not known when two answering displays differ', () => {
    expect(agreedBrightness([live(80), live(40)], NOW)).toBeNull();
  });

  it('leaves out a display that has stopped answering, whatever it last said', () => {
    const unplugged = { lastSeen: NOW - REMOTE_OFFLINE_AFTER_MS - 1, brightness: 40 };
    expect(agreedBrightness([live(80), unplugged], NOW)).toBe(80);
    expect(agreedBrightness([unplugged], NOW)).toBeNull();
    // Right at the edge of the band it still counts.
    expect(agreedBrightness([{ lastSeen: NOW - REMOTE_OFFLINE_AFTER_MS, brightness: 40 }], NOW)).toBe(40);
  });

  it('leaves out a display that has never checked in', () => {
    expect(agreedBrightness([live(80), { lastSeen: null, brightness: 40 }], NOW)).toBe(80);
    expect(agreedBrightness([live(80), { lastSeen: undefined }], NOW)).toBe(80);
  });

  it('skips an answering display that has not reported a level yet', () => {
    expect(agreedBrightness([live(80), live()], NOW)).toBe(80);
  });
});
