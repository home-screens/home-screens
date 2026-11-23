'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { ArrowUp, RotateCcw, Check, X, Info } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import { formatShortDuration } from '@/lib/duration-format';
import ModalFrame, { ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import SudoPasswordPrompt from './SudoPasswordPrompt';
import StatusPill from '@/components/ui/StatusPill';
import { useTranslate } from '@/i18n';
import {
  useUpgradeStream,
  useWaitForServer,
  getStepState,
  type StepState,
} from './useUpgradeStream';

/** Steps shown in the rail for tarball upgrades */
const TARBALL_STEPS = [
  'preflight',
  'backup',
  'download',
  'migrate',
  'deploy',
  'setup-system',
  'restart',
  'cleanup',
] as const;

/** Steps shown for legacy git-based upgrades */
const GIT_STEPS = [
  'preflight',
  'backup',
  'fetch',
  'checkout',
  'install',
  'build',
  'migrate',
  'setup-system',
  'restart',
] as const;

/** All possible steps — the modal auto-detects which set is active based on SSE events */
const ALL_STEPS = [...new Set([...TARBALL_STEPS, ...GIT_STEPS])];

/** Steps during which the cancel button must be disabled */
const UNCANCELLABLE_STEPS = new Set(['deploy']);

/**
 * How long the console may hear nothing before it says so. The pulsing dot
 * and the shimmer on the bar are animations, so they keep moving whether or
 * not the install does; a line that counts the silence is the one thing on
 * the window that could not be there if the page had stopped hearing from
 * the server.
 */
const QUIET_AFTER_MS = 30_000;

/** The current time, refreshed once a second while `running`. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now;
}

/** Rail row styling per step state */
const RAIL_STYLES: Record<StepState, { row: string; connector: string }> = {
  done: {
    row: 'text-hs-text-muted',
    connector: 'bg-hs-success/40',
  },
  active: {
    row: 'text-hs-text-primary font-semibold bg-hs-accent-soft',
    connector: 'bg-hs-success/40',
  },
  error: {
    row: 'text-hs-danger bg-hs-danger/10',
    connector: 'bg-hs-danger/40',
  },
  pending: {
    row: 'text-hs-text-faint',
    connector: 'bg-hs-border-strong',
  },
};

function StepDot({ state }: { state: StepState }) {
  const base =
    'w-[22px] h-[22px] rounded-full flex-shrink-0 flex items-center justify-center z-[1]';
  switch (state) {
    case 'done':
      return (
        <span className={`${base} bg-hs-success/15 border border-hs-success/40 text-hs-success`}>
          <Check size={11} strokeWidth={3} />
        </span>
      );
    case 'active':
      return (
        <span className={`${base} bg-hs-accent-soft border border-hs-accent/50`}>
          <span className="w-2 h-2 rounded-full bg-hs-accent-hover animate-pulse" />
        </span>
      );
    case 'error':
      return (
        <span className={`${base} bg-hs-danger/15 border border-hs-danger/40 text-hs-danger`}>
          <X size={11} strokeWidth={3} />
        </span>
      );
    default:
      return <span className={`${base} bg-hs-card border border-hs-border-strong`} />;
  }
}

interface Props {
  targetTag: string;
  isRollback: boolean;
  /** Version currently installed, e.g. "1.6.0" — shown as the "from" chip when known */
  currentVersion?: string | null;
  onComplete: () => void;
  onClose: () => void;
}

/**
 * The stream hook connects and triggers on mount only, so a fresh attempt
 * (after the device password prompt wrote the sudo grant) is a remount of
 * the body with a new key rather than a restart inside the hook.
 */
export default function UpgradeModal(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return (
    <UpgradeAttempt key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />
  );
}

function UpgradeAttempt({
  targetTag,
  isRollback,
  currentVersion,
  onComplete,
  onClose,
  onRetry,
}: Props & { onRetry: () => void }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');

  // Start with no steps; auto-detect tarball vs git from SSE events
  const [detectedSteps, setDetectedSteps] = useState<readonly string[]>([]);

  const {
    progress,
    done,
    failed,
    activeStep,
    visitedSteps,
    stepLogs,
    stepDurations,
    activeStepStartedAt,
    lastEventAt,
    reconnecting,
    alreadyRunning,
  } = useUpgradeStream(ALL_STEPS, targetTag, isRollback);
  const running = !done && !failed;
  const now = useNow(running);

  // Auto-detect tarball vs git based on which steps appear
  useEffect(() => {
    if (visitedSteps.has('download') || visitedSteps.has('deploy')) {
      setDetectedSteps([...TARBALL_STEPS]);
    } else if (visitedSteps.has('fetch') || visitedSteps.has('checkout') || visitedSteps.has('install')) {
      setDetectedSteps([...GIT_STEPS]);
    } else if (visitedSteps.size > 0 && detectedSteps.length === 0) {
      // Default to tarball once any step arrives (preflight/backup are shared)
      setDetectedSteps([...TARBALL_STEPS]);
    }
  }, [visitedSteps, detectedSteps.length]);

  const steps = detectedSteps;
  const reloadStatus = useWaitForServer(done);

  // Console selection: null = follow the active step live; a step id pins
  // the console to that step's log until the user clicks back to the live one
  const [pinnedStep, setPinnedStep] = useState<string | null>(null);
  const consoleStep = pinnedStep ?? activeStep;
  const isLive = consoleStep === activeStep && !done && !failed;

  // Translate step IDs via the dictionary; a step it does not know shows its
  // raw ID. t() returns the raw key path on a miss, so we compare to detect
  // one explicitly: `|| fallback` would silently render the dotted-path key.
  const stepLabel = useCallback(
    (step: string) => {
      const key = `upgradeModal.stepLabels.${step}`;
      const result = t(key);
      return result !== key ? result : step;
    },
    [t],
  );

  const consoleRef = useRef<HTMLDivElement>(null);
  const cancelBlocked = UNCANCELLABLE_STEPS.has(activeStep);

  const handleCancel = useCallback(async () => {
    try {
      await editorFetch('/api/system/upgrade', { method: 'DELETE' });
      // SSE will receive the error event and transition to failed state
    } catch {
      onClose();
    }
  }, [onClose]);

  const consoleLog = stepLogs[consoleStep] || '';

  // Nothing heard for a while: say so under the log, and keep counting.
  // A dropped stream has its own line; the silence it causes is not news.
  const quietMs = now - lastEventAt;
  const quietLine =
    isLive && !reconnecting && quietMs >= QUIET_AFTER_MS
      ? t('upgradeModal.console.stillWorking', { duration: formatShortDuration(quietMs) ?? '' })
      : null;
  const reconnectingLine = isLive && reconnecting ? t('upgradeModal.console.reconnecting') : null;
  const activeElapsed =
    running && activeStepStartedAt != null ? formatShortDuration(now - activeStepStartedAt) : null;

  // Auto-scroll the console while it follows the live step
  useEffect(() => {
    if (isLive && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLog, isLive, quietLine]);

  const headerTitle = useMemo(
    () =>
      isRollback
        ? t('upgradeModal.titleRollback', { tag: targetTag })
        : t('upgradeModal.titleUpgrade', { tag: targetTag }),
    [isRollback, targetTag, t],
  );

  // Going back a version is not an upgrade, and must not read like one.
  const finishedLine = isRollback
    ? t('upgradeModal.successRollback', { tag: targetTag })
    : t('upgradeModal.successDefault');

  // The line over the bar and the box under the steps, in the household's
  // words. The hub's own progress sentences are English; the step's name
  // says the same thing. A failure the window ran into itself is a notice.
  const notice = progress.notice;
  const statusLine = done
    ? finishedLine
    : notice === 'connectionLost' ? t('upgradeModal.errors.connectionLost', { step: stepLabel(activeStep) })
      : notice === 'noStream' ? t('upgradeModal.errors.noStream')
        : notice === 'startFailed' ? t('upgradeModal.errors.startFailed')
          : failed ? t('upgradeModal.errors.stoppedAt', { step: stepLabel(activeStep) })
            : `${stepLabel(activeStep)}…`;
  const failureDetail = notice === 'connectionLost' ? t('upgradeModal.errors.connectionLostHelp')
    : notice === 'noStream' ? t('upgradeModal.errors.noStreamHelp')
      : notice === 'startFailed' ? t('upgradeModal.errors.startFailedHelp')
        : progress.error;

  const HeaderIcon = isRollback ? RotateCcw : ArrowUp;

  const statusBadge = failed ? (
    <StatusPill tone="danger" icon={X}>{t('upgradeModal.status.failed')}</StatusPill>
  ) : done ? (
    <StatusPill tone="success" icon={Check}>{t('upgradeModal.status.complete')}</StatusPill>
  ) : (
    <StatusPill tone="info" dot="pulse">{t('upgradeModal.status.inProgress')}</StatusPill>
  );

  return (
    // Escape and the backdrop stay inert while the install is running, so a
    // stray keypress can't drop the only view of a half-finished upgrade.
    // Once it is done or failed the footer's own exit is mirrored by Escape.
    <ModalFrame
      labelledBy="upgrade-modal-title"
      onClose={onClose}
      closable={done || failed}
      className="w-full max-w-[880px]"
    >
      <ModalPanel className="overflow-hidden">
        <ModalHeader
          titleId="upgrade-modal-title"
          icon={
            <div className="w-8 h-8 rounded-lg bg-hs-accent-soft border border-hs-accent-ring flex items-center justify-center text-hs-accent-hover flex-shrink-0">
              <HeaderIcon size={16} aria-hidden />
            </div>
          }
          title={headerTitle}
          subtitle={currentVersion ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-[11px] px-2 py-px rounded-md bg-hs-card border border-hs-border-strong text-hs-text-secondary">
                v{currentVersion}
              </span>
              <span className="text-hs-text-faint text-xs" aria-hidden>&#10142;</span>
              <span className="font-mono text-[11px] px-2 py-px rounded-md bg-hs-accent-soft border border-hs-accent-ring text-hs-accent-hover">
                {targetTag}
              </span>
            </span>
          ) : undefined}
          actions={statusBadge}
          onClose={onClose}
          closable={done || failed}
          closeBlockedHint={t('upgradeModal.warning.inProgress')}
        />

        {/* Overall progress */}
        <div className="px-6 pt-4 pb-3.5 border-b border-hs-border flex-shrink-0">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[13px] text-hs-text-secondary truncate mr-3">
              {statusLine}
            </span>
            <span
              className={`text-[13px] font-mono font-semibold flex-shrink-0 ${
                failed ? 'text-hs-danger' : done ? 'text-hs-success' : 'text-hs-accent-hover'
              }`}
            >
              {progress.progress}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-hs-card overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden ${
                failed
                  ? 'bg-hs-danger'
                  : done
                    ? 'bg-hs-success'
                    : 'bg-gradient-to-r from-hs-accent to-hs-accent-hover'
              }`}
              style={{ width: `${progress.progress}%` }}
            >
              {!done && !failed && (
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[hs-shimmer_1.8s_linear_infinite]" />
              )}
            </div>
          </div>
        </div>

        {/* Step rail + console */}
        <div className="flex flex-1 min-h-0 h-[min(420px,55vh)]">
          {/* Step rail */}
          <div className="w-[320px] flex-shrink-0 border-r border-hs-border overflow-y-auto py-4 pl-4 pr-3">
            {steps.map((step, idx) => {
              const state = getStepState(step, steps, activeStep, done, failed, visitedSteps);
              const styles = RAIL_STYLES[state] ?? RAIL_STYLES.pending;
              const hasLog = (stepLogs[step] || '').length > 0;
              const clickable = hasLog && state !== 'pending';
              const duration = stepDurations[step] != null ? formatShortDuration(stepDurations[step]) : null;
              const isConsoleTarget = consoleStep === step;

              return (
                <button
                  key={step}
                  disabled={!clickable}
                  onClick={() => setPinnedStep(step === activeStep ? null : step)}
                  className={`relative w-full flex items-center gap-3 px-3 py-[9px] mt-0.5 first:mt-0 rounded-[9px] text-[13.5px] text-left transition-colors ${styles.row} ${
                    clickable ? 'cursor-pointer hover:bg-hs-card/50' : 'cursor-default'
                  } ${isConsoleTarget && pinnedStep ? 'ring-1 ring-hs-border-strong bg-hs-card/40' : ''}`}
                >
                  {idx > 0 && (
                    <span
                      className={`absolute left-[22px] -top-[12px] w-0.5 h-4 ${styles.connector}`}
                    />
                  )}
                  <StepDot state={state} />
                  <span className="flex-1 min-w-0 truncate">{stepLabel(step)}</span>
                  {duration && state === 'done' && (
                    <span className="text-[11px] font-mono text-hs-text-faint flex-shrink-0">
                      {duration}
                    </span>
                  )}
                  {activeElapsed && state === 'active' && (
                    <span
                      data-testid="upgrade-step-elapsed"
                      className="text-[11px] font-mono font-normal text-hs-text-faint flex-shrink-0 tabular-nums"
                    >
                      {activeElapsed}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Console — always dark, terminal-style, in both themes */}
          <div className="flex-1 min-w-0 flex flex-col bg-[#0d0d0d]">
            <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/10 flex-shrink-0">
              <span className="flex gap-1.5" aria-hidden>
                <span className="w-[9px] h-[9px] rounded-full bg-white/10" />
                <span className="w-[9px] h-[9px] rounded-full bg-white/10" />
                <span className="w-[9px] h-[9px] rounded-full bg-white/10" />
              </span>
              <span className="text-xs text-neutral-400 truncate">{stepLabel(consoleStep)}</span>
              {isLive && (
                <span className="ml-auto flex items-center gap-1.5 text-[11px] font-mono text-hs-accent-hover">
                  <span className="w-1.5 h-1.5 rounded-full bg-hs-accent-hover animate-pulse" />
                  {t('upgradeModal.console.live')}
                </span>
              )}
            </div>
            <div ref={consoleRef} className="flex-1 overflow-y-auto">
              {consoleLog ? (
                <pre className="px-4 py-3 text-[11.5px] leading-[1.7] font-mono text-neutral-500 whitespace-pre-wrap break-all">
                  {consoleLog}
                </pre>
              ) : (
                <p className="px-4 py-3 text-[11.5px] font-mono text-neutral-600">
                  {t('upgradeModal.console.waiting')}
                </p>
              )}
              {quietLine && (
                <p
                  data-testid="upgrade-console-quiet"
                  className="px-4 pb-3 -mt-2 text-[11.5px] leading-[1.7] font-mono text-neutral-400 flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-hs-accent-hover animate-pulse flex-shrink-0" aria-hidden />
                  {quietLine}
                </p>
              )}
              {reconnectingLine && (
                <p
                  data-testid="upgrade-console-reconnecting"
                  className="px-4 pb-3 -mt-2 text-[11.5px] leading-[1.7] font-mono text-hs-warning-ink flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-hs-warning animate-pulse flex-shrink-0" aria-hidden />
                  {reconnectingLine}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Error detail, or the device password prompt when that is the fix */}
        {failed && progress.needsSudoPassword ? (
          <div className="px-6 py-3 border-t border-hs-border flex-shrink-0">
            <SudoPasswordPrompt onGranted={onRetry} />
          </div>
        ) : (
          failed &&
          failureDetail && (
            <div className="px-6 py-3 border-t border-hs-border bg-hs-danger/10 flex-shrink-0">
              {/* The window's own words read as a sentence; the hub's error is a log line. */}
              <p className={`text-xs text-hs-danger ${notice ? '' : 'font-mono break-all'}`}>{failureDetail}</p>
            </div>
          )
        )}

        {/* This window's own start was turned down, and it is showing the
            update that was already under way. Said while that one runs. */}
        {alreadyRunning && running && (
          <div
            data-testid="upgrade-already-running"
            className="flex items-start gap-2.5 px-6 py-3 border-t border-hs-border bg-hs-accent-soft flex-shrink-0"
          >
            <Info size={14} className="text-hs-accent-hover flex-shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs text-hs-accent-hover">{t('upgradeModal.alreadyRunning')}</p>
          </div>
        )}

        {/* The page reloads as soon as the new version answers, onto the
            System page, which offers the restart. This only says what comes
            next; a button here would meet a server that is restarting. */}
        {done && progress.restartNeeded && (
          <div
            data-testid="upgrade-restart-needed"
            className="flex items-start gap-2.5 px-6 py-3 border-t border-hs-border bg-hs-accent-soft flex-shrink-0"
          >
            <Info size={14} className="text-hs-accent-hover flex-shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs text-hs-accent-hover">{t('upgradeModal.restartNeeded')}</p>
          </div>
        )}

        {!done && !failed && (
          <ModalFooter
            hint={<span className="text-hs-warning-ink">{cancelBlocked ? t('upgradeModal.warning.installing') : t('upgradeModal.warning.inProgress')}</span>}
            primary={{ label: t('upgradeModal.stopButton'), onClick: handleCancel, disabled: cancelBlocked, variant: 'danger' }}
          />
        )}
        {done && (
          <ModalFooter
            hint={
              <span className="text-hs-success flex items-center gap-1.5">
                <Check size={12} strokeWidth={3} className="flex-shrink-0" aria-hidden />
                {reloadStatus || finishedLine}
              </span>
            }
            primary={{ label: t('upgradeModal.doneButton'), onClick: onComplete }}
          />
        )}
        {failed && <ModalFooter onCancel={onClose} cancelLabel={tCore('actions.close')} />}
      </ModalPanel>
    </ModalFrame>
  );
}
