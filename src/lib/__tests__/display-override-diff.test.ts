import { describe, it, expect } from 'vitest';
import { diffDisplayOverrides } from '@/lib/display-override-diff';
import type { DisplayNodeSettings } from '@/types/config';

describe('diffDisplayOverrides', () => {
  it('emits pure upserts when saved is empty', () => {
    // Fresh fork: no prior overrides, user has ticked a few fields.
    const saved: DisplayNodeSettings = {};
    const form: DisplayNodeSettings = {
      cursorHideSeconds: 10,
      pauseEnabled: false,
    };
    expect(diffDisplayOverrides(saved, form)).toEqual({
      cursorHideSeconds: 10,
      pauseEnabled: false,
    });
  });

  it('emits explicit undefined for keys present in saved but missing from form', () => {
    // This is the "Reset to inherited" path: the user dropped the key
    // from the form. The diff has to surface it as undefined so
    // updateDisplaySettings deletes it — otherwise the override sticks
    // around on disk silently.
    const saved: DisplayNodeSettings = {
      cursorHideSeconds: 10,
      rotationIntervalMs: 60_000,
    };
    const form: DisplayNodeSettings = {
      rotationIntervalMs: 60_000,
    };
    const diff = diffDisplayOverrides(saved, form);
    expect(diff.rotationIntervalMs).toBe(60_000);
    expect(diff.cursorHideSeconds).toBeUndefined();
    expect('cursorHideSeconds' in diff).toBe(true);
  });

  it('handles mixed upserts and deletes in one call', () => {
    const saved: DisplayNodeSettings = {
      cursorHideSeconds: 10,
      pauseEnabled: true,
    };
    const form: DisplayNodeSettings = {
      // cursorHideSeconds was reset
      pauseEnabled: false, // changed
      fullscreenTheme: 'charcoal', // new fork
    };
    const diff = diffDisplayOverrides(saved, form);
    expect(diff.pauseEnabled).toBe(false);
    expect(diff.fullscreenTheme).toBe('charcoal');
    expect('cursorHideSeconds' in diff).toBe(true);
    expect(diff.cursorHideSeconds).toBeUndefined();
  });

  it('returns an empty diff when both saved and form are empty', () => {
    // The Save path early-returns on `Object.keys(diff).length === 0`,
    // so an empty diff is the correct "do nothing" signal.
    expect(diffDisplayOverrides({}, {})).toEqual({});
  });

  it('re-emits unchanged keys as upserts (matches handleSave inline behavior)', () => {
    // The original inline loop emits every form key as an upsert even
    // if unchanged. That's intentional — diffing deeper would mean
    // value-comparing nested objects like `alerts`. This test locks in
    // the shallow behavior so a future "optimization" doesn't silently
    // break equality semantics for full-replacement nested objects.
    const saved: DisplayNodeSettings = { cursorHideSeconds: 10 };
    const form: DisplayNodeSettings = { cursorHideSeconds: 10 };
    expect(diffDisplayOverrides(saved, form)).toEqual({ cursorHideSeconds: 10 });
  });

  it('preserves nested-object values without deep-copying', () => {
    // Nested-object overrides (sleep, screensaver, alerts) are
    // full-replacement. The diff must pass the reference through so
    // updateDisplaySettings sees the exact object the form produced.
    const alerts = { enabled: false, position: 'bottom' as const, maxVisible: 1, defaultDuration: 5000 };
    const diff = diffDisplayOverrides({}, { alerts });
    expect(diff.alerts).toBe(alerts);
  });
});
