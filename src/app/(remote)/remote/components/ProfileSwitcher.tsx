'use client';

import { useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { useCommand, usePendingCommand } from '../hooks';
import { useDisplayTarget } from '../display-target';
import { showToast } from '../remote-toast';

interface ProfileSwitcherProps {
  profiles: Array<{ id: string; name: string }>;
  /** Active profile id as the display last reported it (or config, before any heartbeat). '' / null = none. */
  activeProfile: string | null;
  /** Display name for the confirmation toast. */
  displayName: string;
}

/** A profile switch is a config write; the display's heartbeat follows within a few polls. */
const PROFILE_SETTLE_MS = 15_000;

export default function ProfileSwitcher({ profiles, activeProfile, displayName }: ProfileSwitcherProps) {
  const t = useTranslate('remote');
  const { state, execute } = useCommand();
  const { target } = useDisplayTarget();
  // The saved value wins once the display reports it; until then the chip
  // the user tapped stays selected, so a stale heartbeat can't flip it back.
  const pending = usePendingCommand<string>(PROFILE_SETTLE_MS, () => {});
  const actual = activeProfile ?? '';
  const { expected, settle } = pending;
  useEffect(() => {
    if (expected !== null && expected === actual) settle();
  }, [actual, expected, settle]);
  const selected = expected ?? actual;

  const switchProfile = async (profileId: string) => {
    // Tapping the active chip is a no-op: "none" is its own chip below, so
    // nothing ever toggles off silently.
    if (profileId === selected) return;
    // Profile switching doesn't broadcast — when targeting "all" we fall back
    // to the global profile (no displayId) so every display follows it.
    const displayId = target && target !== 'all' ? target : undefined;
    const res = await execute(() =>
      editorFetch('/api/display/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: profileId, ...(displayId ? { displayId } : {}) }),
      }),
    );
    if (!res) {
      showToast(t('feedback.profileFailed', { name: displayName }), 'error');
      return;
    }
    pending.start(profileId);
    const profile = profiles.find((p) => p.id === profileId);
    showToast(
      profile
        ? t('feedback.profileSwitched', { name: displayName, profile: profile.name })
        : t('feedback.profileCleared', { name: displayName }),
    );
  };

  const chips = [{ id: '', name: t('profileSwitcher.noProfile') }, ...profiles];

  return (
    <section className="mt-7 mx-5" data-testid="profile-switcher">
      <h2 className="text-[13px] font-semibold text-hs-text-faint uppercase tracking-wider mb-3">
        {t('profileSwitcher.heading')}
      </h2>

      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {chips.map((p) => {
          const isActive = p.id === selected;
          return (
            <button
              key={p.id || '__none__'}
              onClick={() => switchProfile(p.id)}
              disabled={state === 'pending'}
              aria-pressed={isActive}
              className={`shrink-0 px-[18px] py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-all active:scale-[0.97] border ${
                isActive
                  ? 'bg-hs-accent-soft text-hs-accent-hover border-hs-accent/25'
                  : 'bg-hs-card text-hs-text-muted border-hs-border-strong'
              }`}
            >
              {isActive && <span className="mr-1">&#10003;</span>}
              {p.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
