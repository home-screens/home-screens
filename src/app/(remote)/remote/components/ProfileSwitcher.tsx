'use client';

import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import { withDisplayId } from '@/lib/display-dispatch';
import { useTranslate } from '@/i18n';
import { useCommand, usePendingCommand } from '../hooks';
import { useDisplayTarget } from '../display-target';
import { showToast } from '../remote-toast';
import { toggleChipStyle } from './remote-styles';

interface ProfileSwitcherProps {
  profiles: Array<{ id: string; name: string }>;
  /**
   * The profile the display reports it is showing (or the saved pick, before
   * any heartbeat). '' / null = none. A scheduled profile wins over the pick.
   */
  activeProfile: string | null;
  /** True when a schedule chose `activeProfile`, so a pick made here waits for it to end. */
  scheduled: boolean;
  /** Display name for the confirmation toast. */
  displayName: string;
}

/** A profile switch is a config write; the display's heartbeat follows within a few polls. */
const PROFILE_SETTLE_MS = 15_000;

export default function ProfileSwitcher({ profiles, activeProfile, scheduled, displayName }: ProfileSwitcherProps) {
  const t = useTranslate('remote');
  const { state, execute } = useCommand();
  const { target } = useDisplayTarget();
  // The display's report wins once it names the tapped profile; until then
  // the chip the user tapped stays selected, so a stale heartbeat can't flip
  // it back.
  const pending = usePendingCommand<string>(PROFILE_SETTLE_MS, () => {});
  const actual = activeProfile ?? '';
  const { expected, settle } = pending;
  useEffect(() => {
    if (expected !== null && expected === actual) settle();
  }, [actual, expected, settle]);
  const selected = expected ?? actual;
  // While a scheduled profile runs, a tap saves the pick for later and the
  // wall keeps showing the scheduled one, so the chips and the toast say so.
  const scheduledName = scheduled ? profiles.find((p) => p.id === actual)?.name : undefined;

  const switchProfile = async (profileId: string) => {
    // Tapping the active chip is a no-op: "none" is its own chip below, so
    // nothing ever toggles off silently. While a schedule runs the ticked chip
    // is the scheduled profile, not the saved pick, so every tap saves one:
    // tapping the scheduled chip keeps that profile once its schedule ends.
    if (profileId === selected && scheduledName === undefined) return;
    // Profile switching doesn't broadcast: with "all" picked the global
    // profile is set (no displayId) and every display follows it. That is
    // why this is not `displayCommandRequest`, which would send "all".
    const displayId = target && target !== 'all' ? target : undefined;
    const res = await execute(() =>
      editorFetch('/api/display/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withDisplayId({ profile: profileId }, displayId)),
      }),
    );
    if (!res) {
      showToast(t('feedback.profileFailed', { name: displayName }), 'error');
      return;
    }
    const profile = profiles.find((p) => p.id === profileId);
    if (scheduledName !== undefined) {
      showToast(
        !profile
          ? t('feedback.profileClearedAfterSchedule', { name: displayName, scheduled: scheduledName })
          : profileId === actual
            ? t('feedback.profileKeptAfterSchedule', { name: displayName, profile: profile.name })
            : t('feedback.profileAfterSchedule', { name: displayName, profile: profile.name, scheduled: scheduledName }),
      );
      return;
    }
    pending.start(profileId);
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
              className="press-scale-sm shrink-0"
              style={{ ...toggleChipStyle(isActive), gap: 6 }}
            >
              {isActive && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />}
              {p.name}
            </button>
          );
        })}
      </div>
      {scheduledName !== undefined && (
        <p className="mt-2 text-[13px] text-hs-text-faint" data-testid="profile-scheduled-note">
          {t('profileSwitcher.scheduledNote', { profile: scheduledName })}
        </p>
      )}
    </section>
  );
}
