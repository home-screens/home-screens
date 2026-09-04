'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { ArrowUp, RotateCcw, Check, X } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import ModalFrame from '@/components/ui/ModalFrame';
import { useTranslate } from '@/i18n';
import {
  useUpgradeStream,
  useWaitForServer,
  getStepState,
  STEP_LABELS,
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

/** "2s" / "1m 12s" annotation for completed steps; sub-second steps show nothing */
function formatDuration(ms: number): string | null {
  const seconds = Math.round(ms / 1000);
  if (seconds < 1) return null;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

interface Props {
  targetTag: string;
  isRollback: boolean;
  /** Version currently installed, e.g. "1.6.0" — shown as the "from" chip when known */
  currentVersion?: string | null;
  onComplete: () => void;
  onClose: () => void;
}

export default function UpgradeModal({
  targetTag,
  isRollback,
  currentVersion,
  onComplete,
  onClose,
}: Props) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');

  // Start with no steps; auto-detect tarball vs git from SSE events
  const [detectedSteps, setDetectedSteps] = useState<readonly string[]>([]);

  const { progress, done, failed, activeStep, visitedSteps, stepLogs, stepDurations } =
    useUpgradeStream(ALL_STEPS, targetTag, isRollback);

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

  // Translate step IDs via dictionary; fall back to the imported English
  // STEP_LABELS (or the raw ID for unknown plugin-introduced steps). t()
  // returns the raw key path on miss, so we compare to detect a miss
  // explicitly — `|| fallback` would silently render the dotted-path key.
  const stepLabel = useCallback(
    (step: string) => {
      const key = `upgradeModal.stepLabels.${step}`;
      const result = t(key);
      if (result !== key) return result;
      return STEP_LABELS[step] ?? step;
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

  // Auto-scroll the console while it follows the live step
  useEffect(() => {
    if (isLive && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLog, isLive]);

  const headerTitle = useMemo(
    () =>
      isRollback
        ? t('upgradeModal.titleRollback', { tag: targetTag })
        : t('upgradeModal.titleUpgrade', { tag: targetTag }),
    [isRollback, targetTag, t],
  );

  const HeaderIcon = isRollback ? RotateCcw : ArrowUp;

  const statusBadge = failed ? (
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1 rounded-full bg-hs-danger/10 text-hs-danger border border-hs-danger/30">
      <X size={11} strokeWidth={3} />
      {t('upgradeModal.status.failed')}
    </span>
  ) : done ? (
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1 rounded-full bg-hs-success/10 text-hs-success border border-hs-success/30">
      <Check size={11} strokeWidth={3} />
      {t('upgradeModal.status.complete')}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1 rounded-full bg-hs-accent-soft text-hs-accent-hover border border-hs-accent-ring">
      <span className="w-[7px] h-[7px] rounded-full bg-hs-accent-hover animate-pulse" />
      {t('upgradeModal.status.inProgress')}
    </span>
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
      <div className="bg-hs-panel border border-hs-border-strong rounded-2xl w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-hs-border-strong flex items-center gap-4 flex-shrink-0">
          <div className="w-10 h-10 rounded-[10px] bg-hs-accent-soft border border-hs-accent-ring flex items-center justify-center text-hs-accent-hover flex-shrink-0">
            <HeaderIcon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="upgrade-modal-title" className="text-[17px] font-semibold text-hs-text-primary truncate">
              {headerTitle}
            </h2>
            {currentVersion && (
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-[11px] px-2 py-px rounded-md bg-hs-card border border-hs-border-strong text-hs-text-secondary">
                  v{currentVersion}
                </span>
                <span className="text-hs-text-faint text-xs">&#10142;</span>
                <span className="font-mono text-[11px] px-2 py-px rounded-md bg-hs-accent-soft border border-hs-accent-ring text-hs-accent-hover">
                  {targetTag}
                </span>
              </div>
            )}
          </div>
          {statusBadge}
        </div>

        {/* Overall progress */}
        <div className="px-6 pt-4 pb-3.5 border-b border-hs-border flex-shrink-0">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[13px] text-hs-text-secondary truncate mr-3">
              {progress.message}
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
          <div className="w-[300px] flex-shrink-0 border-r border-hs-border overflow-y-auto py-4 pl-4 pr-3">
            {steps.map((step, idx) => {
              const state = getStepState(step, steps, activeStep, done, failed, visitedSteps);
              const styles = RAIL_STYLES[state] ?? RAIL_STYLES.pending;
              const hasLog = (stepLogs[step] || '').length > 0;
              const clickable = hasLog && state !== 'pending';
              const duration = stepDurations[step] != null ? formatDuration(stepDurations[step]) : null;
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
            </div>
          </div>
        </div>

        {/* Error detail */}
        {failed && progress.error && (
          <div className="px-6 py-3 border-t border-hs-border bg-hs-danger/10 flex-shrink-0">
            <p className="text-xs text-hs-danger font-mono break-all">{progress.error}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-t border-hs-border-strong flex-shrink-0">
          {!done && !failed && (
            <>
              <p className="text-xs text-hs-warning/70 truncate">
                {cancelBlocked
                  ? t('upgradeModal.warning.installing')
                  : t('upgradeModal.warning.inProgress')}
              </p>
              <Button variant="danger" size="sm" onClick={handleCancel} disabled={cancelBlocked}>
                {tCore('actions.cancel')}
              </Button>
            </>
          )}
          {done && (
            <>
              <p className="text-xs text-hs-success flex items-center gap-1.5 truncate">
                <Check size={12} strokeWidth={3} className="flex-shrink-0" />
                {reloadStatus || t('upgradeModal.successDefault')}
              </p>
              <Button variant="primary" onClick={onComplete}>
                {t('upgradeModal.doneButton')}
              </Button>
            </>
          )}
          {failed && (
            <>
              <span />
              <Button variant="secondary" onClick={onClose}>
                {tCore('actions.close')}
              </Button>
            </>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
