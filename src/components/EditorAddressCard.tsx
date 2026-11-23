'use client';

import { Copy, Check } from 'lucide-react';
import { useOrigin } from '@/hooks/useOrigin';
import { useCopyFlash } from '@/hooks/useCopyFlash';
import { useTranslate } from '@/i18n';

/**
 * The hub's editor address with a copy button, for a phone visitor who needs
 * to carry it to a laptop. Rendered on the phone launcher at `/` and on the
 * editor's too-narrow screen. The copy carries the plain-http fallback;
 * the address also stays in a selectable box so a long-press works when
 * even that is refused.
 */
export default function EditorAddressCard({ className }: { className?: string }) {
  const t = useTranslate('core');
  const origin = useOrigin();
  const { copied, copy: copyFlash } = useCopyFlash();
  const address = origin ? `${origin}/editor` : '';

  const copy = () => void copyFlash(address);

  return (
    <div className={className} data-testid="editor-address-card">
      <p className="text-xs text-hs-text-faint mb-1.5">{t('launcher.editorAddressHint')}</p>
      <div className="flex items-stretch gap-1.5">
        <input
          readOnly
          value={address}
          aria-label={t('launcher.editorAddressLabel')}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md bg-hs-card border border-hs-border-strong px-3 py-2 text-sm font-mono text-hs-text-body"
        />
        <button
          type="button"
          onClick={copy}
          disabled={!address}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-hs-card border border-hs-border-strong px-3 text-sm text-hs-text-body hover:bg-hs-hover disabled:opacity-50"
        >
          {copied ? <Check className="w-4 h-4 text-hs-success" /> : <Copy className="w-4 h-4" />}
          {copied ? t('status.copied') : t('launcher.copy')}
        </button>
      </div>
    </div>
  );
}
