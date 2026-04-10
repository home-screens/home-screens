'use client';

interface BackupReminderBannerProps {
  shouldShow: boolean;
  daysSinceBackup: number | null;
  busy: boolean;
  onBackup: () => void;
  onDismiss: () => void;
}

export default function BackupReminderBanner({
  shouldShow,
  daysSinceBackup,
  busy,
  onBackup,
  onDismiss,
}: BackupReminderBannerProps) {
  if (!shouldShow) return null;

  return (
    <div className="mx-4 mt-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-hs-warning">
          You haven&#x2019;t backed up in {daysSinceBackup} day{daysSinceBackup === 1 ? '' : 's'}.
        </div>
      </div>
      <button
        onClick={onBackup}
        disabled={busy}
        className="shrink-0 rounded-lg bg-amber-600 active:bg-amber-500 text-white text-xs font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
      >
        {busy ? 'Saving\u2026' : 'Backup'}
      </button>
      <button
        onClick={onDismiss}
        className="shrink-0 text-hs-text-faint active:text-hs-text-secondary transition-colors p-1"
        aria-label="Dismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
