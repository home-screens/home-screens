import { useState, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { editorFetch } from '@/lib/editor-fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressData {
  step: string;
  progress: number;
  message: string;
  error?: string;
}

export type StepState = 'done' | 'active' | 'pending' | 'error';

export interface UpgradeStreamState {
  progress: ProgressData;
  started: boolean;
  done: boolean;
  failed: boolean;
  activeStep: string;
  visitedSteps: Set<string>;
  stepLogs: Record<string, string>;
  stepDurations: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Step state derivation (pure function)
// ---------------------------------------------------------------------------

export function getStepState(
  step: string,
  steps: readonly string[],
  activeStep: string,
  done: boolean,
  failed: boolean,
  visitedSteps: Set<string>,
): StepState {
  const stepIdx = steps.indexOf(step);
  const activeIdx = steps.indexOf(activeStep);

  // Only mark steps done if actually visited — unvisited steps must not show as complete.
  if (done) return visitedSteps.has(step) ? 'done' : 'pending';

  // If activeStep is not in the visible steps list (e.g. internal-only steps
  // like 'stash'), fall back to visitedSteps to determine state
  if (activeIdx === -1) {
    return visitedSteps.has(step) ? 'done' : 'pending';
  }

  if (failed && stepIdx === activeIdx) return 'error';
  if (stepIdx < activeIdx) return 'done';
  if (stepIdx === activeIdx && !failed) return 'active';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Step labels (shared constant)
// ---------------------------------------------------------------------------

export const STEP_LABELS: Record<string, string> = {
  preflight: 'Pre-flight checks',
  backup: 'Back up configuration',
  download: 'Download update',
  migrate: 'Migrate configuration',
  deploy: 'Install update',
  'setup-system': 'Apply system configuration',
  restart: 'Restart service',
  cleanup: 'Finalize',
  // Legacy git-based steps (shown for fallback upgrades)
  fetch: 'Download latest code',
  checkout: 'Switch to new version',
  install: 'Install dependencies',
  build: 'Build application',
};

// ---------------------------------------------------------------------------
// useUpgradeStream — SSE connection + upgrade trigger
// ---------------------------------------------------------------------------

/**
 * Everything the SSE handlers need from the hook. Built once inside the
 * mount effect so the handlers stay module-level named functions instead
 * of one inline mega-effect; refs (not state) cross the closure boundary
 * for values read at event time.
 */
interface StreamContext {
  es: EventSource;
  steps: readonly string[];
  hasSeenRealStep: RefObject<boolean>;
  progressRef: RefObject<ProgressData>;
  activeStepRef: RefObject<string>;
  setProgress: (p: ProgressData) => void;
  setActiveStep: (s: string) => void;
  setDone: (b: boolean) => void;
  setFailed: (b: boolean) => void;
}

/** Progress events — step transitions. */
function handleProgressEvent(ctx: StreamContext, event: MessageEvent): void {
  try {
    const data = JSON.parse(event.data) as ProgressData & { type: string };

    // Ignore the server's idle state — no upgrade is running yet.
    // This arrives from subscribeToEvents() before our POST triggers the upgrade.
    if (data.step === 'idle') return;

    // Track whether we've seen any real pipeline step (not a terminal state).
    // This prevents a stale 'complete' from subscribeToEvents closing the SSE
    // before the upgrade has started.
    if (data.step !== 'complete' && data.step !== 'error') {
      ctx.hasSeenRealStep.current = true;
    }

    ctx.setProgress({
      step: data.step,
      progress: data.progress,
      message: data.message,
      error: data.error,
    });

    if (
      data.step !== 'error' &&
      data.step !== 'complete' &&
      ctx.steps.includes(data.step)
    ) {
      // Only update activeStep for visible steps — hidden steps like
      // 'stash'/'cleanup' would make indexOf return -1 and break the
      // accordion state.
      ctx.setActiveStep(data.step);
    }

    if (data.step === 'complete' && ctx.hasSeenRealStep.current) {
      ctx.setDone(true);
      ctx.es.close();
    } else if (data.step === 'error' && ctx.hasSeenRealStep.current) {
      ctx.setFailed(true);
      ctx.es.close();
    }
  } catch {
    // ignore parse errors
  }
}

/** Output events — streaming log lines accumulated per step. */
function handleOutputEvent(
  setStepLogs: Dispatch<SetStateAction<Record<string, string>>>,
  event: MessageEvent,
): void {
  try {
    const data = JSON.parse(event.data) as { step: string; line: string };
    setStepLogs((prev) => ({
      ...prev,
      [data.step]: (prev[data.step] || '') + data.line + '\n',
    }));
  } catch {
    // ignore parse errors
  }
}

/** SSE connection loss — expected during restart, an error anywhere else. */
function handleStreamError(ctx: StreamContext): void {
  ctx.es.close();
  const current = ctx.progressRef.current;
  const currentActive = ctx.activeStepRef.current;

  if (
    current.step === 'restart' ||
    current.step === 'cleanup' ||
    currentActive === 'restart' ||
    currentActive === 'cleanup'
  ) {
    // SSE connection lost during restart/cleanup — expected, the server is restarting
    ctx.setProgress({
      step: 'complete',
      progress: 100,
      message: 'Server restarted. Reconnecting...',
    });
    ctx.setDone(true);
  } else if (!ctx.hasSeenRealStep.current) {
    // SSE failed before any upgrade events arrived — connection issue, not a step failure
    ctx.setFailed(true);
    ctx.setProgress({
      step: 'error',
      progress: 0,
      message: 'Failed to connect to upgrade stream',
      error:
        'Could not establish a connection to monitor the upgrade. Try refreshing the page.',
    });
  } else if (current.step !== 'complete' && current.step !== 'error') {
    // Unexpected disconnect mid-upgrade — show which step was active
    const stepLabel = STEP_LABELS[currentActive] || currentActive;
    ctx.setFailed(true);
    ctx.setProgress({
      step: 'error',
      progress: 0,
      message: `Connection lost during "${stepLabel}"`,
      error:
        'The server connection was lost unexpectedly. The upgrade may still be running — check server logs and try refreshing the page.',
    });
  }
}

/** POST the upgrade/rollback trigger; a failed trigger tears down the stream. */
async function triggerUpgrade(
  ctx: StreamContext,
  isRollback: boolean,
  targetTag: string,
): Promise<void> {
  const endpoint = isRollback ? '/api/system/rollback' : '/api/system/upgrade';
  try {
    const res = await editorFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: targetTag }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      ctx.es.close();
      ctx.setFailed(true);
      ctx.setProgress({
        step: 'error',
        progress: 0,
        message: 'Failed to start upgrade',
        error: body.error || `Server returned ${res.status}`,
      });
    }
  } catch {
    ctx.es.close();
    ctx.setFailed(true);
    ctx.setProgress({
      step: 'error',
      progress: 0,
      message: 'Failed to start upgrade',
      error: 'Could not connect to server',
    });
  }
}

export function useUpgradeStream(
  steps: readonly string[],
  targetTag: string,
  isRollback: boolean,
): UpgradeStreamState {
  const firstStep = steps[0];

  const [progress, setProgress] = useState<ProgressData>({
    step: firstStep,
    progress: 0,
    message: 'Starting...',
  });
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  // Track the last real step (not 'error' or 'complete')
  const [activeStep, setActiveStep] = useState(firstStep);
  // Track which steps were actually visited (for rollback correctness)
  const [visitedSteps, setVisitedSteps] = useState<Set<string>>(new Set([firstStep]));
  // Per-step accumulated log output
  const [stepLogs, setStepLogs] = useState<Record<string, string>>({});

  // Guards against a stale 'complete'/'idle' event closing the SSE early.
  const hasSeenRealStep = useRef(false);

  const progressRef = useRef(progress);
  const activeStepRef = useRef(activeStep);
  progressRef.current = progress;
  activeStepRef.current = activeStep;

  // Per-step wall-clock durations, derived client-side from activeStep
  // transitions (the SSE payload carries no timing data). The first step's
  // timer starts in the mount effect below, when the upgrade is triggered.
  const [stepDurations, setStepDurations] = useState<Record<string, number>>({});
  const stepStartRef = useRef<Record<string, number>>({});
  const prevDurationStepRef = useRef(firstStep);

  // Track visited steps whenever activeStep changes
  useEffect(() => {
    setVisitedSteps((prev) => {
      const next = new Set(prev);
      next.add(activeStep);
      return next;
    });
  }, [activeStep]);

  // Close out the previous step's timer on each transition
  useEffect(() => {
    const prev = prevDurationStepRef.current;
    if (prev === activeStep) return;
    const now = Date.now();
    const startedAt = stepStartRef.current[prev];
    if (startedAt != null) {
      setStepDurations((d) => ({ ...d, [prev]: now - startedAt }));
    }
    stepStartRef.current[activeStep] ??= now;
    prevDurationStepRef.current = activeStep;
  }, [activeStep]);

  // Finalize the last active step's timer when the upgrade completes
  useEffect(() => {
    if (!done) return;
    const step = prevDurationStepRef.current;
    const startedAt = stepStartRef.current[step];
    if (startedAt == null) return;
    setStepDurations((d) => (d[step] != null ? d : { ...d, [step]: Date.now() - startedAt }));
  }, [done]);

  // Connect SSE and trigger upgrade. Deliberately ONE mount-only effect —
  // the EventSource lifecycle (open, wire handlers, trigger, close on
  // unmount) is a single resource; the handler bodies live in the named
  // module-level functions above.
  useEffect(() => {
    if (started) return;
    setStarted(true);

    stepStartRef.current[firstStep] = Date.now();

    const es = new EventSource('/api/system/status');
    const ctx: StreamContext = {
      es,
      steps,
      hasSeenRealStep,
      progressRef,
      activeStepRef,
      setProgress,
      setActiveStep,
      setDone,
      setFailed,
    };

    es.addEventListener(
      'progress',
      ((event: MessageEvent) => handleProgressEvent(ctx, event)) as EventListener,
    );
    es.addEventListener(
      'output',
      ((event: MessageEvent) => handleOutputEvent(setStepLogs, event)) as EventListener,
    );
    es.onerror = () => handleStreamError(ctx);

    triggerUpgrade(ctx, isRollback, targetTag);

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time SSE connection on mount; deps are stable refs
  }, []);

  return { progress, started, done, failed, activeStep, visitedSteps, stepLogs, stepDurations };
}

// ---------------------------------------------------------------------------
// useWaitForServer — poll for server availability after upgrade completes
// ---------------------------------------------------------------------------

export function useWaitForServer(done: boolean): string | null {
  const [reloadStatus, setReloadStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!done) return;
    let cancelled = false;

    async function waitForServer() {
      setReloadStatus('Server is shutting down...');
      // Wait past the nohup restart delay (3s) plus buffer
      await new Promise((r) => setTimeout(r, 4000));

      const start = Date.now();
      const deadline = start + 60000; // 60s max wait
      let serverResponded = false;

      while (!cancelled && Date.now() < deadline) {
        const elapsed = Math.round((Date.now() - start) / 1000);

        if (!serverResponded) {
          setReloadStatus(`Waiting for new server to start... (${elapsed}s)`);
        }

        try {
          // Poll /api/system/version which returns { upgradeRunning }.
          // The OLD server (still alive during nohup delay) returns
          // upgradeRunning: true. The NEW server starts fresh with
          // upgradeRunning: false — so we only reload once the new
          // server is confirmed ready.
          const res = await editorFetch('/api/system/version', { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (!data.upgradeRunning) {
              setReloadStatus('New server is ready — reloading page...');
              window.location.reload();
              return;
            }
            // Old server still running — update message
            serverResponded = true;
            setReloadStatus(`Waiting for old server to finish... (${elapsed}s)`);
          }
        } catch {
          // Server not responding yet — expected during restart
          serverResponded = false;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Fallback: reload anyway after timeout
      if (!cancelled) {
        setReloadStatus('Reloading...');
        window.location.reload();
      }
    }

    waitForServer();
    return () => {
      cancelled = true;
    };
  }, [done]);

  return reloadStatus;
}

