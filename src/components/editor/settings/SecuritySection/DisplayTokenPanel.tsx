'use client';

import { useState } from 'react';
import Link from 'next/link';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { formatRelativeTime, useFormattingLocale, useTranslate } from '@/i18n';
import { useOrigin } from '@/hooks/useOrigin';
import { useCopyFlash } from '@/hooks/useCopyFlash';
import { useEditorStore } from '@/stores/editor-store';
import { findMainDisplay } from '@/lib/display-filter';
import { settingsPath } from '@/lib/settings-route';
import { wallsLetInByThemselves } from '@/lib/walls-api-types';
import { useWalls } from '@/hooks/useWalls';
import type { DisplayNode } from '@/types/config';
import FieldHint from '@/components/ui/FieldHint';
import Notice from '@/components/ui/Notice';
import type { RefusedKey } from '@/lib/display-key-refusals';
import { SettingsSubHeading } from '@/components/editor/settings/shared/SettingsPanel';
import { wallsShowing } from '@/components/editor/settings/display/WallsPanels';

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
  /** A password is set, so the key is checked. Without one it is kept ready. */
  passwordOn: boolean;
  /** The last request turned away with a key that doesn't match. */
  lastRefused: RefusedKey | null;
}

/** Reveal/copy/regenerate panel for the display auth token. */
export default function DisplayTokenPanel({ token, onTokenChange, passwordOn, lastRefused }: DisplayTokenPanelProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const origin = useOrigin();
  const displays = useEditorStore((s) => s.config?.displays);
  const exampleTarget = findMainDisplay(displays);

  const [tokenRevealed, setTokenRevealed] = useState(false);
  const { copied: tokenCopied, copy } = useCopyFlash();
  const [tokenRegenerating, setTokenRegenerating] = useState(false);
  const [tokenConfirmRegen, setTokenConfirmRegen] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);

  // Read only while the warning is open. A new key does not take out the
  // walls the changeover let in by themselves, so the warning counts them
  // and links to where they are listed: the one display they all show on,
  // or every display.
  const { data: wallsData } = useWalls({ enabled: tokenConfirmRegen });
  const letInByThemselves = wallsLetInByThemselves(wallsData?.walls ?? []);
  const theirDisplay = displays?.find((d) => wallsShowing(letInByThemselves, d.id).length === letInByThemselves.length);
  const theirList = settingsPath(theirDisplay ? { kind: 'display', displayId: theirDisplay.id, subtab: 'overview' } : { kind: 'displays' });

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
      {/* Made before any password, so Home Assistant can hold it from the
          start and keep working the day a password goes on. */}
      {!passwordOn && (
        <FieldHint className="mb-2" data-testid="display-key-not-needed">
          {t('settings.securityPage.displayToken.notNeededYet')}
        </FieldHint>
      )}
      {/* An old key fails with nothing on screen; say where it came from. */}
      {passwordOn && lastRefused && (
        <Notice tone="warning" className="mb-2" testId="display-key-refused">
          {t(lastRefused.address ? 'settings.securityPage.displayToken.refusedFrom' : 'settings.securityPage.displayToken.refused', {
            address: lastRefused.address ?? '',
            // "now" from the formatter reads oddly in a sentence; under a minute is "just now".
            when: Date.now() - lastRefused.at < 60_000
              ? tCore('relativeTime.justNow')
              : formatRelativeTime(Date.now(), lastRefused.at, { locale }),
          })}
        </Notice>
      )}
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
              {letInByThemselves.length > 0 && (
                <span data-testid="regenerate-walls-let-in-by-themselves">
                  {' '}
                  {t('settings.securityPage.displayToken.regenerateWallsLetInByThemselves', { count: letInByThemselves.length })}{' '}
                  <Link href={theirList} className="text-hs-accent hover:text-hs-accent-hover underline">
                    {t('settings.securityPage.displayToken.regenerateWallsCheck', { count: letInByThemselves.length })}
                  </Link>
                </span>
              )}
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
