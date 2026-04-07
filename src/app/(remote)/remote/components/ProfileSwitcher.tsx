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
      <h2 className="text-[13px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
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
                  ? 'bg-blue-500/[0.12] text-blue-400 border-blue-500/25'
                  : 'bg-white/[0.03] text-neutral-400 border-white/[0.06]'
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
