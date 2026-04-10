'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import {
  useUpgradeStream,
  useWaitForServer,
  useAccordionState,
  getStepState,
  STEP_LABELS,
  type StepState,
} from './useUpgradeStream';

/** Steps shown in the accordion for tarball upgrades */
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

const STEP_STYLES: Record<StepState, { icon: React.ReactNode; textClass: string }> = {
  done: {
    icon: <span className="text-hs-success text-xs">&#10003;</span>,
    textClass: 'text-hs-text-faint',
  },
  active: {
    icon: <span className="inline-block w-1.5 h-1.5 rounded-full bg-hs-accent-hover animate-pulse" />,
    textClass: 'text-hs-text-primary',
  },
  error: {
    icon: <span className="text-hs-danger text-xs font-bold">&#10005;</span>,
    textClass: 'text-hs-danger',
  },
  pending: {
    icon: <span className="inline-block w-1.5 h-1.5 rounded-full bg-hs-card" />,
    textClass: 'text-hs-text-faint',
  },
};

/** Steps during which the cancel button must be disabled */
const UNCANCELLABLE_STEPS = new Set(['deploy']);

interface Props {
  targetTag: string;
  isRollback: boolean;
  onComplete: () => void;
  onClose: () => void;
}

export default function UpgradeModal({ targetTag, isRollback, onComplete, onClose }: Props) {
  // Start with no steps; auto-detect tarball vs git from SSE events
  const [detectedSteps, setDetectedSteps] = useState<readonly string[]>([]);

  const { progress, done, failed, activeStep, visitedSteps, stepLogs } =
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
  const { expanded, toggleExpand } = useAccordionState(activeStep);

  const activeLogRef = useRef<HTMLDivElement>(null);
  const cancelBlocked = UNCANCELLABLE_STEPS.has(activeStep);

  const handleCancel = useCallback(async () => {
    try {
      await editorFetch('/api/system/upgrade', { method: 'DELETE' });
      // SSE will receive the error event and transition to failed state
    } catch {
      onClose();
    }
  }, [onClose]);

  // Auto-scroll the active step's output to the bottom
  useEffect(() => {
    if (activeLogRef.current) {
      activeLogRef.current.scrollTop = activeLogRef.current.scrollHeight;
    }
  }, [stepLogs, activeStep]);

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/70">
      <div className="bg-hs-panel border border-hs-border-strong rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-hs-border-strong flex-shrink-0">
          <h2 className="text-lg font-semibold text-hs-text-primary">
            {`${isRollback ? 'Rolling back' : 'Upgrading'} to ${targetTag}`}
          </h2>
        </div>

        <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Overall progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-hs-text-muted truncate mr-2">{progress.message}</span>
              <span className="text-xs text-hs-text-faint font-mono flex-shrink-0">
                {progress.progress}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-hs-card overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  failed ? 'bg-hs-danger' : done ? 'bg-hs-success' : 'bg-hs-accent'
                }`}
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>

          {/* Accordion step list */}
          <div className="space-y-1">
            {steps.map((step) => {
              const state = getStepState(step, steps, activeStep, done, failed, visitedSteps);
              const styles = STEP_STYLES[state] ?? STEP_STYLES.pending;
              const isOpen = expanded.has(step);
              const log = stepLogs[step] || '';
              const hasLog = log.length > 0;
              const canExpand = hasLog && state !== 'pending';

              return (
                <div
                  key={step}
                  className={`rounded-lg overflow-hidden border transition-colors ${
                    state === 'active'
                      ? 'border-hs-accent/30 bg-hs-card/20'
                      : state === 'error'
                        ? 'border-hs-danger/30 bg-hs-danger/10'
                        : 'border-hs-border/50'
                  }`}
                >
                  <button
                    disabled={!canExpand}
                    onClick={() => toggleExpand(step)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                      canExpand ? 'cursor-pointer hover:bg-hs-card/30' : 'cursor-default'
                    }`}
                  >
                    <span className="w-4 flex-shrink-0 text-center">
                      {styles.icon}
                    </span>
                    <span className={`flex-1 ${styles.textClass}`}>
                      {STEP_LABELS[step] ?? step}
                    </span>
                    {canExpand && (
                      <span className="text-hs-text-faint text-[10px]">{isOpen ? '▾' : '▸'}</span>
                    )}
                  </button>

                  {isOpen && hasLog && (
                    <div
                      ref={state === 'active' || state === 'error' ? activeLogRef : undefined}
                      className="border-t border-hs-border/50 bg-black/40 max-h-48 overflow-y-auto"
                    >
                      <pre className="px-3 py-2 text-[11px] leading-relaxed font-mono text-hs-text-faint whitespace-pre-wrap break-all">
                        {log}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Error detail */}
          {failed && progress.error && (
            <div className="rounded-md bg-hs-danger/20 border border-hs-danger/30 p-3">
              <p className="text-xs text-hs-danger font-mono break-all">{progress.error}</p>
            </div>
          )}

          {/* Warning */}
          {!done && !failed && (
            <p className="text-xs text-hs-warning/70 text-center">
              {cancelBlocked
                ? 'Installing update — do not close or power off the device'
                : 'Do not close this page or power off the device'}
            </p>
          )}

          {/* Success — polling for server */}
          {done && (
            <p className="text-xs text-hs-success text-center">
              {reloadStatus || 'Upgrade complete!'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-hs-border-strong flex-shrink-0">
          {!done && !failed && (
            <Button variant="danger" size="sm" onClick={handleCancel} disabled={cancelBlocked}>
              Cancel
            </Button>
          )}
          {done && (
            <Button variant="primary" onClick={onComplete}>
              Done
            </Button>
          )}
          {failed && (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
