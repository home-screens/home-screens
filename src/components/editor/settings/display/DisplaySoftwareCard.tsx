'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslate } from '@/i18n';
import {
  buildDisplaySoftwareSetupCommand,
  resolveDisplaySoftwareState,
} from '@/lib/display-software-status';
import type { DisplaySoftwareInfo } from '@/lib/displays-api-types';

interface DisplaySoftwareCardProps {
  displayId: string;
  displaySoftware: DisplaySoftwareInfo | undefined;
  /** The hub's own version, from the same /api/displays poll. */
  hubVersion: string | undefined;
}

/**
 * "Display software" — the state of the small set of programs that run
 * locally on a display's Pi, as opposed to the web app it shows (which is
 * served by the hub and is therefore always current).
 *
 * Status only, no controls. Displays follow the hub on their own: the user
 * updates the hub and every display comes along. The one exception is a Pi
 * set up before automatic updates existed, which needs a single command run
 * on it once — that is the only actionable branch here.
 *
 * Deliberately jargon-free per the project's copy rules: no "bundle",
 * "kiosk", "spoke", or "systemd" reaches the screen.
 */
export default function DisplaySoftwareCard({
  displayId,
  displaySoftware,
  hubVersion,
}: DisplaySoftwareCardProps) {
  const t = useTranslate('editor');
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  // Read the origin after mount: it is browser-only, and reading it during
  // render would make the server and client markup disagree.
  useEffect(() => setOrigin(window.location.origin), []);

  const state = resolveDisplaySoftwareState(displaySoftware, hubVersion);
  const command = buildDisplaySoftwareSetupCommand(origin, displayId);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // The hub is usually reached over plain HTTP on the LAN, where the
      // async clipboard API is unavailable — fall back to the old selection
      // trick rather than leaving the button dead.
      const ta = document.createElement('textarea');
      ta.value = command;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
      <div className="text-xs font-semibold text-hs-text-secondary uppercase tracking-wider mb-3">
        {t('settings.perDisplayPage.displaySoftware.heading')}
      </div>

      {state.kind === 'needs-setup' && (
        <>
          <div className="text-sm text-hs-text-muted mb-3">
            {t('settings.perDisplayPage.displaySoftware.needsSetupBody')}
          </div>
          <div className="flex items-stretch gap-2">
            <code
              data-testid="display-software-command"
              className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap rounded-md border border-hs-border bg-hs-bg px-3 py-2 text-xs text-hs-text-primary font-mono"
            >
              {command}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-hs-border bg-hs-panel px-3 text-xs text-hs-text-secondary hover:text-hs-text-primary hover:border-hs-border-strong transition-colors"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied
                ? t('settings.perDisplayPage.displaySoftware.copied')
                : t('settings.perDisplayPage.displaySoftware.copy')}
            </button>
          </div>
        </>
      )}

      {state.kind !== 'needs-setup' && (
        <div className="flex items-center gap-2.5">
          <StatusDot kind={state.kind} />
          <div>
            <div className="text-base text-hs-text-primary font-medium">
              {state.kind === 'current' &&
                t('settings.perDisplayPage.displaySoftware.upToDate', { version: state.version })}
              {state.kind === 'outdated' &&
                t('settings.perDisplayPage.displaySoftware.updateWaiting', {
                  version: state.version,
                })}
              {state.kind === 'pending' &&
                t('settings.perDisplayPage.displaySoftware.pending')}
              {state.kind === 'unreported' &&
                t('settings.perDisplayPage.displaySoftware.unreported')}
            </div>
            {state.kind === 'outdated' && (
              <div className="text-sm text-hs-text-muted mt-0.5">
                {t('settings.perDisplayPage.displaySoftware.updateWaitingHint', {
                  version: state.hubVersion,
                })}
              </div>
            )}
            {state.kind === 'pending' && (
              <div className="text-sm text-hs-text-muted mt-0.5">
                {t('settings.perDisplayPage.displaySoftware.pendingHint')}
              </div>
            )}
            {state.kind === 'unreported' && (
              <div className="text-sm text-hs-text-muted mt-0.5">
                {t('settings.perDisplayPage.displaySoftware.unreportedHint')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ kind }: { kind: 'current' | 'outdated' | 'pending' | 'unreported' }) {
  const color =
    kind === 'current'
      ? 'bg-emerald-500'
      : kind === 'outdated'
        ? 'bg-amber-500'
        : kind === 'pending'
          ? 'bg-sky-500'
          : 'bg-hs-text-faint';
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} aria-hidden="true" />;
}
