'use client';

import { useEditorStore } from '@/stores/editor-store';
import { useRouter } from 'next/navigation';
import { editorFetch } from '@/lib/editor-fetch';
import { settingsPath } from '@/lib/settings-route';
import { useUpdateNotification } from '@/hooks/useUpdateNotification';
import { useTranslate } from '@/i18n';
import { parseUpdateChannel } from '@/lib/semver';
import { Download } from 'lucide-react';
import Toast from '@/components/ui/Toast';

export default function UpdateAvailableToast() {
  const t = useTranslate('editor');
  const router = useRouter();

  const enabled = useEditorStore((s) => s.config?.settings?.updateNotification?.enabled ?? false);
  const channel = useEditorStore((s) => parseUpdateChannel(s.config?.settings?.updateChannel));

  const { shouldShow, latestVersion, handleDismiss } = useUpdateNotification({
    enabled,
    fetchFn: editorFetch,
    pollIntervalMs: 3_600_000,
    channel,
  });

  if (!shouldShow || !latestVersion) return null;

  return (
    <Toast
      tone="warning"
      message={t('updateAvailable.message', { version: latestVersion })}
      action={{
        label: t('updateAvailable.updateButton'),
        icon: Download,
        onClick: () => router.push(settingsPath({ kind: 'defaults', page: 'system' })),
      }}
      onDismiss={handleDismiss}
      dismissLabel={t('updateAvailable.dismiss')}
    />
  );
}
