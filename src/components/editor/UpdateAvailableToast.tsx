'use client';

import { useEditorStore } from '@/stores/editor-store';
import { useRouter } from 'next/navigation';
import { editorFetch } from '@/lib/editor-fetch';
import { useUpdateNotification } from '@/hooks/useUpdateNotification';
import { useTranslate } from '@/i18n';
import { X, Download } from 'lucide-react';

export default function UpdateAvailableToast() {
  const t = useTranslate('editor');
  const router = useRouter();

  const enabled = useEditorStore((s) => s.config?.settings?.updateNotification?.enabled ?? false);
  const channel = useEditorStore((s) => s.config?.settings?.updateChannel === 'dev' ? 'dev' : 'stable');

  const { shouldShow, latestVersion, handleDismiss } = useUpdateNotification({
    enabled,
    fetchFn: editorFetch,
    pollIntervalMs: 3_600_000,
    channel,
  });

  if (!shouldShow || !latestVersion) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] animate-[toast-slide-up_0.3s_ease-out]">
      <style>{`
        @keyframes toast-slide-up {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-hs-panel/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-black/30">
        <div className="text-hs-warning text-sm">
          {t('updateAvailable.message', { version: latestVersion })}
        </div>
        <button
          onClick={() => router.push('/editor/settings?section=defaults&page=system')}
          className="flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-3 py-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {t('updateAvailable.updateButton')}
        </button>
        <button
          onClick={handleDismiss}
          className="text-hs-text-faint hover:text-hs-text-secondary transition-colors p-0.5"
          aria-label={t('updateAvailable.dismiss')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
