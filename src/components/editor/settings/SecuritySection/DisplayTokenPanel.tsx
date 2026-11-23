'use client';

import { useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import { useOrigin } from '@/hooks/useOrigin';
import { useCopyFlash } from '@/hooks/useCopyFlash';
import { useEditorStore } from '@/stores/editor-store';
import { findMainDisplay } from '@/lib/display-filter';
import type { DisplayNode } from '@/types/config';
import FieldHint from '@/components/ui/FieldHint';
import { SettingsSubHeading } from '@/components/editor/settings/shared/SettingsPanel';

/**
 * The address a phone bookmark points at. `/api/display/<command>` takes the
 * display key as a query parameter for the handful of commands it serves over
 * GET (sleep, wake, reload, next-screen, prev-screen), so the hint can show a
 * working link rather than describe one.
 *
 * The display has to be named, because commands are queued per display and a
 * link that names nobody lands in the legacy queue that only an install with
 * no `displays` list ever drains. Once displays are registered, every one of
 * them polls its own queue, the main display included: `/display` hands
 * `findMainDisplay`'s id to the rotator. So the example targets that same
 * display, and an install with no registry gets the link with no display in
 * it, which is the one its display drains.
 */
export function displayCommandExample(
  origin: string,
  token: string,
  displays: DisplayNode[] | undefined,
): string {
  const target = findMainDisplay(displays);
  const query = new URLSearchParams();
  if (target) query.set('display', target.id);
  query.set('token', token);
  return `${origin}/api/display/sleep?${query.toString()}`;
}

/** Stand-in shown until the key is revealed, so the key never leaks onto a shared screen. */
const KEY_PLACEHOLDER = 'YOUR-KEY';

interface DisplayTokenPanelProps {
  token: string;
  /** New token after a regenerate. */
  onTokenChange: (token: string) => void;
}

/** Reveal/copy/regenerate panel for the display auth token. */
export default function DisplayTokenPanel({ token, onTokenChange }: DisplayTokenPanelProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const origin = useOrigin();
  const displays = useEditorStore((s) => s.config?.displays);
  const exampleTarget = findMainDisplay(displays);

  const [tokenRevealed, setTokenRevealed] = useState(false);
  const { copied: tokenCopied, copy } = useCopyFlash();
  const [tokenRegenerating, setTokenRegenerating] = useState(false);
  const [tokenConfirmRegen, setTokenConfirmRegen] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);

  async function handleCopyToken() {
    if (!(await copy(token))) {
      setTokenStatus(t('settings.securityPage.displayToken.errorCopy'));
    }
  }

  async function handleRegenerateToken() {
    setTokenRegenerating(true);
    setTokenStatus(null);
    try {
      const res = await editorFetch('/api/auth/display-token', { method: 'POST' });
      if (res.ok) {
        const { displayToken } = await res.json();
        onTokenChange(displayToken);
        setTokenConfirmRegen(false);
        setTokenRevealed(true);
      } else {
        setTokenStatus(t('settings.securityPage.displayToken.errorRegenerate'));
      }
    } catch {
      setTokenStatus(tCore('refusals.unreachable'));
    } finally {
      setTokenRegenerating(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-hs-border">
      <SettingsSubHeading className="mb-2">
        {t('settings.securityPage.displayToken.heading')}
      </SettingsSubHeading>
      <FieldHint className="mb-2">
        {t('settings.securityPage.displayToken.description')}
      </FieldHint>
      <div className="flex items-center gap-2">
        {/* Addressed by test id, not by its classes: this panel holds more
            than one <code>, and styling is not an address. */}
        <code
          data-testid="display-key-value"
          className="flex-1 text-xs bg-hs-card border border-hs-border-strong rounded px-2 py-1.5 text-hs-text-secondary font-mono truncate select-all"
        >
          {tokenRevealed ? token : token.slice(0, 8) + '•'.repeat(16)}
        </code>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setTokenRevealed(!tokenRevealed)}
          data-field-id="security.displayTokenReveal"
        >
          {tokenRevealed
            ? t('settings.securityPage.displayToken.hide')
            : t('settings.securityPage.displayToken.reveal')}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleCopyToken}>
          {tokenCopied
            ? tCore('status.copied')
            : t('settings.securityPage.displayToken.copy')}
        </Button>
      </div>
      <div className="mt-2">
        {!tokenConfirmRegen ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setTokenConfirmRegen(true)}
            data-field-id="security.displayTokenRegenerate"
          >
            {t('settings.securityPage.displayToken.regenerateButton')}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-hs-warning-ink">
              {t('settings.securityPage.displayToken.regenerateWarning')}
            </span>
            <Button
              variant="danger"
              size="sm"
              onClick={handleRegenerateToken}
              disabled={tokenRegenerating}
            >
              {tokenRegenerating
                ? t('settings.securityPage.displayToken.regenerating')
                : t('settings.securityPage.displayToken.regenerateConfirm')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTokenConfirmRegen(false)}
            >
              {t('settings.securityPage.displayToken.regenerateCancel')}
            </Button>
          </div>
        )}
        {tokenStatus && (
          <p
            className="text-xs text-hs-danger mt-1"
            aria-live="polite"
            role="alert"
          >
            {tokenStatus}
          </p>
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        <FieldHint>
          {t('settings.securityPage.displayToken.phoneHintIntro')}
        </FieldHint>
        <code
          data-testid="display-key-bookmark-url"
          className="block text-[11px] bg-hs-card border border-hs-border-strong rounded px-2 py-1.5 text-hs-text-secondary font-mono break-all select-all"
        >
          {displayCommandExample(origin, tokenRevealed ? token : KEY_PLACEHOLDER, displays)}
        </code>
        <FieldHint>
          {t('settings.securityPage.displayToken.phoneHintOutro')}
        </FieldHint>
        {/* Only worth saying once there is more than one display to aim at:
            the link can only name one of them. */}
        {exampleTarget && (displays?.length ?? 0) > 1 && (
          <FieldHint>
            {t('settings.securityPage.displayToken.phoneHintDisplayNote', {
              name: exampleTarget.name,
              display: exampleTarget.id,
            })}
          </FieldHint>
        )}
      </div>
    </div>
  );
}
