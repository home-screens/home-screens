import { readConfigCached } from './config-cache';

/**
 * Adopted-display-id view over the shared short-TTL config cache
 * (`config-cache.ts`).
 *
 * The reporter's `POST /api/display/hw-stats` calls `requireAdoptedDisplay`
 * on every tick; the shared cache keeps N adopted displays from driving N
 * disk reads per 30 s just to re-confirm the registry between admin edits,
 * and `config.ts` invalidates it on every write so a just-adopted display's
 * first report is accepted.
 *
 * Returns null when in legacy single-display mode (no `displays` array OR
 * empty array) — the caller decides what legacy-mode authorization means.
 * An unreadable config also returns null, which for the hw-stats caller
 * means falling back to legacy semantics: displayId `main` is ACCEPTED
 * (fail-open for that one id, matching pre-cache behavior), every other id
 * is rejected. If that trade ever changes, change it in
 * `requireAdoptedDisplay`, not by throwing here.
 */
export async function getAdoptedDisplayIds(): Promise<string[] | null> {
  try {
    const config = await readConfigCached();
    return config?.displays && config.displays.length > 0
      ? config.displays.map((d) => d.id)
      : null;
  } catch {
    return null;
  }
}
