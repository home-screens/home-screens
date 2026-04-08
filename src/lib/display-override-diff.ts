import type { DisplayNodeSettings } from '@/types/config';

/**
 * Produce the `Partial<DisplayNodeSettings>` to pass to
 * `updateDisplaySettings` on Save, given:
 *   - `saved`: the display's persisted override object (from config)
 *   - `form`:  the editor form's current override state
 *
 * The diff uses "explicit undefined means delete" semantics so that keys
 * the user "Reset to inherited" (dropped from the form) become
 * `{ key: undefined }` in the result — which `updateDisplaySettings`
 * converts into a key deletion. Without the explicit-undefined delete,
 * the reset would be silently dropped and the override would stick
 * around on disk.
 *
 * Every key currently present in `form` is emitted as an upsert, even
 * if its value happens to match `saved`. That keeps the diff trivial
 * and matches the original inline-in-handleSave behavior; the per-save
 * cost is one extra shallow merge that the dirty-flag gate prevents
 * from running on globals-only saves anyway.
 */
export function diffDisplayOverrides(
  saved: DisplayNodeSettings,
  form: DisplayNodeSettings,
): Partial<DisplayNodeSettings> {
  const diff: Partial<DisplayNodeSettings> = {};
  // Upserts: every key currently in the form becomes an explicit set.
  for (const k of Object.keys(form) as Array<keyof DisplayNodeSettings>) {
    (diff as Record<string, unknown>)[k] = form[k];
  }
  // Deletes: keys present in the saved state but missing from the form
  // are explicit resets.
  for (const k of Object.keys(saved) as Array<keyof DisplayNodeSettings>) {
    if (!(k in form)) {
      (diff as Record<string, unknown>)[k] = undefined;
    }
  }
  return diff;
}
