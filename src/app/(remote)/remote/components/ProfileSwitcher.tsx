'use client';

import { useCommand } from '../hooks';
import { useDisplayTarget } from '../display-target';

interface ProfileSwitcherProps {
  profiles: Array<{ id: string; name: string }>;
  activeProfile: string | null;
}

export default function ProfileSwitcher({ profiles, activeProfile }: ProfileSwitcherProps) {
  const { state, execute } = useCommand();
  const { target } = useDisplayTarget();

  const switchProfile = async (profileId: string) => {
    const id = profileId === activeProfile ? '' : profileId;
    // Profile switching doesn't broadcast — when targeting "all" we fall back
    // to the global profile (no displayId) so every display follows it.
    const displayId = target && target !== 'all' ? target : undefined;
    await execute(() =>
      fetch('/api/display/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: id, ...(displayId ? { displayId } : {}) }),
      }),
    );
  };

  return (
    <section className="mt-7 mx-5">
      <h2 className="text-[13px] font-semibold text-hs-text-faint uppercase tracking-wider mb-3">
        Profiles
      </h2>

      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {profiles.map((p) => {
          const isActive = p.id === activeProfile;
          return (
            <button
              key={p.id}
              onClick={() => switchProfile(p.id)}
              disabled={state === 'pending'}
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
