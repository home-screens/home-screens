'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { useTranslate } from '@/i18n';
import {
  buildDisplaySoftwareSetupCommand,
  buildDisplaySshCommand,
  DEFAULT_PI_SSH_USER,
  resolveDisplaySoftwareState,
} from '@/lib/display-software-status';
import type { DisplaySoftwareInfo } from '@/lib/displays-api-types';

interface DisplaySoftwareCardProps {
  displayId: string;
  displaySoftware: DisplaySoftwareInfo | undefined;
  /** The hub's own version, from the same /api/displays poll. */
  hubVersion: string | undefined;
  /** Source IP of this display's browser heartbeat, if it has checked in. */
  reporterIp?: string | null;
}

/**
 * "Display software" — the state of the small set of programs that run
 * locally on a display's Pi, as opposed to the web app it shows (which is
 * served by the hub and is therefore always current).
 *
 * Four of the five states are passive status and render as a quiet card.
 * The fifth — a Pi set up before automatic updates existed — is the only
 * thing in this feature that asks the user to *do* something, so it gets
 * the warning treatment the Displays index already uses for the same fact,
 * and its heading states the task rather than naming the panel.
 *
 * Deliberately jargon-free per the project's copy rules: no "bundle",
 * "kiosk", "spoke", or "systemd" reaches the screen.
 */
export default function DisplaySoftwareCard({
  displayId,
  displaySoftware,
  hubVersion,
  reporterIp,
}: DisplaySoftwareCardProps) {
  const t = useTranslate('editor');
  const [origin, setOrigin] = useState('');

  // Read the origin after mount: it is browser-only, and reading it during
  // render would make the server and client markup disagree.
  useEffect(() => setOrigin(window.location.origin), []);

  const state = resolveDisplaySoftwareState(displaySoftware, hubVersion);
  const setupCommand = buildDisplaySoftwareSetupCommand(origin, displayId);
  const sshCommand = buildDisplaySshCommand(reporterIp);

  if (state.kind === 'needs-setup') {
    return (
      <div className="rounded-lg border border-hs-warning/30 border-l-[3px] border-l-hs-warning bg-hs-warning/[0.07] p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-hs-warning mb-2.5">
          {t('settings.perDisplayPage.displaySoftware.heading')}
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle size={16} className="text-hs-warning shrink-0" aria-hidden="true" />
          <span className="text-[15px] font-semibold text-hs-text-primary">
            {t('settings.perDisplayPage.displaySoftware.needsSetupTitle')}
          </span>
        </div>
        <div className="text-sm text-hs-text-muted mb-3.5">
          {t('settings.perDisplayPage.displaySoftware.needsSetupBody')}
        </div>

        {sshCommand ? (
          <CommandRow
            label={t('settings.perDisplayPage.displaySoftware.connectLabel')}
            command={sshCommand}
            testId="display-software-ssh"
            t={t}
          />
        ) : (
          // No heartbeat means no address, and a command with a placeholder
          // in it is worse than no command — it copies cleanly and then fails.
          <div className="text-sm text-hs-text-muted mb-3">
            {t('settings.perDisplayPage.displaySoftware.connectUnknown', {
              user: DEFAULT_PI_SSH_USER,
            })}
          </div>
        )}

        <CommandRow
          label={t('settings.perDisplayPage.displaySoftware.runLabel')}
          command={setupCommand}
          testId="display-software-command"
          t={t}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
      <div className="text-xs font-semibold text-hs-text-secondary uppercase tracking-wider mb-3">
        {t('settings.perDisplayPage.displaySoftware.heading')}
      </div>
      <div className="flex items-center gap-2.5">
        <StatusDot kind={state.kind} />
        <div>
          <div className="text-base text-hs-text-primary font-medium">
            {state.kind === 'current' &&
              t('settings.perDisplayPage.displaySoftware.upToDate', { version: state.version })}
            {state.kind === 'outdated' &&
              t('settings.perDisplayPage.displaySoftware.updateWaiting', { version: state.version })}
            {state.kind === 'pending' && t('settings.perDisplayPage.displaySoftware.pending')}
            {state.kind === 'unreported' && t('settings.perDisplayPage.displaySoftware.unreported')}
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
    </div>
  );
}

/**
 * One labelled, copyable command.
 *
 * The command wraps rather than scrolling. These are pasted into a terminal
 * and one of them pipes to `bash` — anyone who wants to read it before
 * running it must be able to see all of it, and a horizontal scrollbar in a
 * code block is easy to miss entirely.
 */
function CommandRow({
  label,
  command,
  testId,
  t,
}: {
  label: string;
  command: string;
  testId: string;
  t: ReturnType<typeof useTranslate>;
}) {
  const [copied, setCopied] = useState(false);

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
    <div className="mb-3 last:mb-0">
      <div className="text-[11px] text-hs-text-faint mb-1.5">{label}</div>
      <div className="flex items-stretch gap-2">
        <code
          data-testid={testId}
          className="flex-1 min-w-0 whitespace-pre-wrap break-all rounded-md border border-hs-border bg-hs-bg px-3 py-2 text-xs leading-relaxed text-hs-text-primary font-mono"
        >
          {command}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 self-start inline-flex items-center gap-1.5 rounded-md border border-hs-border bg-hs-panel px-3 py-2 text-xs text-hs-text-secondary hover:text-hs-text-primary hover:border-hs-border-strong transition-colors"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied
            ? t('settings.perDisplayPage.displaySoftware.copied')
            : t('settings.perDisplayPage.displaySoftware.copy')}
        </button>
      </div>
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
