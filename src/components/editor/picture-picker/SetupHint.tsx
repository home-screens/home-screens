'use client';

import Link from 'next/link';
import { settingsPath } from '@/lib/settings-route';
import { useTranslate } from '@/i18n';

/**
 * The body of a tab whose source is not set up yet: one line saying what it
 * needs and a way to Settings > API keys. Shown rather than hiding the tab,
 * so people can tell the source is supported.
 */
export default function SetupHint({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  const t = useTranslate('editor');
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-10 text-center" data-testid="picker-setup-hint">
      <p className="max-w-xs text-xs text-hs-text-secondary">{text}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-md border border-hs-border-strong bg-hs-card px-2.5 py-1 text-xs text-hs-text-body hover:bg-hs-hover"
        >
          {action.label}
        </button>
      ) : (
        <Link
          href={settingsPath({ kind: 'defaults', page: 'integrations' })}
          className="rounded-md border border-hs-border-strong bg-hs-card px-2.5 py-1 text-xs text-hs-text-body hover:bg-hs-hover"
        >
          {t('photoSources.picker.openApiKeys')}
        </Link>
      )}
    </div>
  );
}
