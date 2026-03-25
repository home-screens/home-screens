'use client';

import { useCommand } from '../RemoteClient';

interface ProfileSwitcherProps {
  profiles: Array<{ id: string; name: string }>;
  activeProfile: string | null;
  needsAuth: boolean;
  onAuthFailure: () => void;
}

export default function ProfileSwitcher({
  profiles,
  activeProfile,
  needsAuth,
  onAuthFailure,
}: ProfileSwitcherProps) {
  const { state, execute } = useCommand();

  const switchProfile = async (profileId: string) => {
    const id = profileId === activeProfile ? '' : profileId;
    const res = await execute(() =>
      fetch('/api/display/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: id }),
      }),
    );
    if (!res && needsAuth) onAuthFailure();
  };

  return (
    <section>
      <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        Profiles
      </h2>

      {needsAuth ? (
        <a
          href="/login?from=/remote"
          className="block text-sm text-blue-400 bg-neutral-900 rounded-lg p-3 text-center"
        >
          Sign in to switch profiles
        </a>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {profiles.map((p) => {
            const isActive = p.id === activeProfile;
            return (
              <button
                key={p.id}
                onClick={() => switchProfile(p.id)}
                disabled={state === 'pending'}
                className={`shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                }`}
              >
                {isActive && <span className="mr-1">&check;</span>}
                {p.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
