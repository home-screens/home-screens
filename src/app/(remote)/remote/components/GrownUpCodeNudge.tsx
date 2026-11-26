'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import IconButton from './IconButton';
import GrownUpCodeSetSheet from './GrownUpCodeSetSheet';
import { ACCENT_SOFT_BUTTON } from './remote-styles';

const DISMISSED_KEY = 'hs-grown-up-code-nudge-dismissed';

function readDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
}

/**
 * One line over the rewards a grown-up manages, while rewards exist and no
 * grown-up code is set: any child at the wall can spend any child's tickets
 * until there is one, and the code was only to be found in the editor. It
 * opens the sheet that sets it. Closing it keeps it closed on this phone.
 */
export default function GrownUpCodeNudge({ rewardCount }: { rewardCount: number }) {
  const t = useTranslate('remote');
  // null until the hub answers, so a household with a code never sees it flash.
  const [codeSet, setCodeSet] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);

  const read = useCallback(() => {
    editorFetch('/api/grown-up-code')
      .then((res) => (res.ok ? res.json() : null))
      .then((status: { set?: boolean } | null) => setCodeSet(status ? status.set === true : null))
      .catch(() => { /* say nothing rather than something that may not be true */ });
  }, []);

  useEffect(() => {
    setDismissed(readDismissed());
    read();
  }, [read]);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* private window: it comes back next time */ }
  };

  if (rewardCount === 0 || codeSet !== false || dismissed) {
    return open ? <GrownUpCodeSetSheet changing={false} onClose={() => setOpen(false)} onSaved={read} /> : null;
  }

  return (
    <div
      data-testid="grown-up-code-nudge"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, margin: '0 0 14px', padding: '12px 8px 12px 14px', borderRadius: 14,
        border: '1px solid color-mix(in srgb, var(--hs-warning) 40%, transparent)',
        background: 'color-mix(in srgb, var(--hs-warning) 10%, transparent)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--hs-text-primary)' }}>{t('grownUpCode.nudge')}</p>
        <button
          type="button"
          className="press-scale"
          onClick={() => setOpen(true)}
          data-testid="grown-up-code-nudge-set"
          style={{ ...ACCENT_SOFT_BUTTON, marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 12, fontSize: 14 }}
        >
          {t('grownUpCode.setTitle')}
        </button>
      </div>
      <IconButton label={t('grownUpCode.dismiss')} onClick={dismiss} testId="grown-up-code-nudge-close">
        <X size={16} strokeWidth={2.5} aria-hidden="true" />
      </IconButton>
      {open && <GrownUpCodeSetSheet changing={false} onClose={() => setOpen(false)} onSaved={read} />}
    </div>
  );
}
