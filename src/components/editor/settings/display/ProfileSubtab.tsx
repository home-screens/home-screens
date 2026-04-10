'use client';

import Link from 'next/link';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { collapseAllowlist } from '@/lib/display-profile-allowlist';

interface ProfileSubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

/**
 * Display detail "Profile" — picks which profile this display is showing
 * right now and (optionally) restricts which profiles it's allowed to
 * choose from.
 *
 * Profile *definitions* live on the shared `Defaults → Profiles` page —
 * the per-display Profile subtab only handles the per-display
 * `activeProfile` field and the `profileIds` allowlist. This split was
 * a load-bearing part of the redesign: the legacy ProfilesSection had a
 * display switcher because "active profile is per-display" but the user
 * was simultaneously editing profile definitions (shared), conflating two
 * very different jobs into one tab.
 *
 * The "owned profiles" mode (display.profiles is set) is a different
 * flow — its profile definitions live on this display, not in the
 * shared pool. We render whichever pool is in effect; the
 * `getDisplayProfiles`-style precedence is the same one
 * `filterConfigForDisplay` uses on the server.
 */
export default function ProfileSubtab({ config, display }: ProfileSubtabProps) {
  const { updateDisplay, saveConfig } = useEditorStore();
  const profilePool = display.profiles ?? config.profiles ?? [];
  const allowedProfileIds = display.profileIds ?? null; // null = no allowlist (everything allowed)
  const activeProfileId = display.activeProfile ?? config.settings.activeProfile ?? '';
  const ownsProfiles = !!display.profiles;

  // The active profile must always be a member of the allowlist (or the
  // allowlist must be absent). `validateDisplays` in display-filter.ts
  // rejects any config where `activeProfile` isn't in `profileIds`, so
  // the select options must be restricted to the current allowed set —
  // otherwise the user could pick an out-of-list profile and the next
  // save would fail validation. Owned-profile displays skip the allowlist
  // concept entirely and see the full pool.
  const selectablePool =
    !ownsProfiles && allowedProfileIds != null
      ? profilePool.filter((p) => allowedProfileIds.includes(p.id))
      : profilePool;

  const handleActiveProfileChange = async (value: string) => {
    updateDisplay(display.id, { activeProfile: value || undefined });
    await saveConfig();
  };

  const toggleAllowed = async (id: string) => {
    if (ownsProfiles) return; // Owned profiles bypass the allowlist concept
    const current = allowedProfileIds ?? profilePool.map((p) => p.id);
    const next = current.includes(id) ? current.filter((pid) => pid !== id) : [...current, id];
    // `collapseAllowlist` enforces the "no allowlist" fallback for BOTH
    // the all-on and all-off cases. Previously only the all-on case was
    // handled, and unchecking every profile left the display with
    // `profileIds: []` — getDisplayProfiles returns nothing and the
    // display softlocks with no selectable profiles. The fix is behind
    // a pure helper so the collapse rule can be unit-tested directly.
    const nextAllowlist = collapseAllowlist(next, profilePool.length);
    // If the shrunk allowlist would exclude the current active profile,
    // clear it in the same update. Otherwise `validateDisplays` would
    // reject the save with `activeProfile 'X' is not in its profileIds
    // list` and the user's toggle would silently fail. `undefined`
    // means "inherit the global active profile" which is always valid.
    const updates: Parameters<typeof updateDisplay>[1] = { profileIds: nextAllowlist };
    if (
      display.activeProfile &&
      nextAllowlist != null &&
      !nextAllowlist.includes(display.activeProfile)
    ) {
      updates.activeProfile = undefined;
    }
    updateDisplay(display.id, updates);
    await saveConfig();
  };

  return (
    <div className="rounded-lg border border-hs-border bg-hs-panel/40">
      <div className="px-4 py-3.5 border-b border-hs-border">
        <label className="block">
          <span className="text-xs text-hs-text-muted">Active profile</span>
          <select
            value={activeProfileId}
            onChange={(e) => handleActiveProfileChange(e.target.value)}
            className="mt-1.5 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
          >
            <option value="">— None —</option>
            {selectablePool.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-hs-text-faint mt-1.5">
            Which profile {display.name} is currently displaying. Profile definitions live on{' '}
            <Link
              href="?section=defaults&page=profiles"
              className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
            >
              Defaults → Profiles
            </Link>
            .
          </p>
        </label>
      </div>
      {!ownsProfiles && (
        <div className="px-4 py-3.5">
          <span className="text-xs text-hs-text-muted">Allowed profiles</span>
          <p className="text-[11px] text-hs-text-faint mt-1 mb-2.5">
            Restrict which shared profiles {display.name} can switch to. Leave them all checked to
            allow every profile.
          </p>
          {profilePool.length === 0 ? (
            <div className="text-xs text-hs-text-faint italic">No profiles defined yet.</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {profilePool.map((p) => {
                const checked = allowedProfileIds == null || allowedProfileIds.includes(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-hs-text-secondary">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAllowed(p.id)}
                      className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
                    />
                    {p.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
