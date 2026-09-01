import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import { readConfig, writeConfig } from './config';
import { migrateUp, getLatestSchemaVersion } from './migrations';
import { hasReleaseTarball, GITHUB_REPO } from './version';

/** Explicit APP_DIR — safe to use after the atomic swap when process.cwd() is stale.
 *  Reads HOME_SCREENS_DIR env var to support non-default install paths. */
const APP_DIR = process.env.HOME_SCREENS_DIR || '/opt/home-screens/current';

type UpgradeStep =
  | 'idle'
  | 'preflight'
  | 'backup'
  | 'download'
  | 'migrate-remote'
  | 'fetch'
  | 'stash'
  | 'checkout'
  | 'install'
  | 'build'
  | 'migrate'
  | 'deploy'
  | 'setup-system'
  | 'restart'
  | 'cleanup'
  | 'complete'
  | 'error';

interface UpgradeProgress {
  step: UpgradeStep;
  progress: number;
  message: string;
  error?: string;
}

/** Discriminated union for SSE events */
export type UpgradeEvent =
  | ({ type: 'progress' } & UpgradeProgress)
  | { type: 'output'; step: UpgradeStep; line: string };

type EventCallback = (event: UpgradeEvent) => void;

/** Return the last N non-empty lines of text */
function lastLines(text: string, n: number): string {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .slice(-n)
    .join('\n');
}

/**
 * Spawn upgrade.sh with the given action and stream stdout/stderr
 * line-by-line via the onLine callback.
 */
function runUpgradeScript(
  action: string,
  args: string[] = [],
  onLine?: (line: string) => void,
  options?: { cwd?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const cwd = options?.cwd ?? APP_DIR;
    const scriptPath = path.join(cwd, 'scripts', 'upgrade.sh');
    const child = spawn('bash', [scriptPath, action, ...args], { cwd });
    currentUpgrade.childProcess = child;

    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = () => {
      settled = true;
      currentUpgrade.childProcess = null;
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settle();
        rl.close();
        child.kill();
        reject(new Error(`${action} timed out after 10 minutes`));
      }
    }, 600000);

    // Stream stdout line by line
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      stdout += line + '\n';
      onLine?.(line);
    });

    // Stream stderr line by line
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split('\n')) {
        if (line.trim()) onLine?.(line);
      }
    });

    child.on('error', (err) => {
      if (!settled) {
        settle();
        clearTimeout(timer);
        reject(new Error(`${action} failed: ${err.message}`));
      }
    });

    child.on('close', (code, signal) => {
      rl.close();
      if (!settled) {
        settle();
        clearTimeout(timer);
        if (signal) {
          // Process was killed by a signal (e.g. OOM killer sends SIGKILL)
          reject(
            new Error(
              `${action} was killed by ${signal}${signal === 'SIGKILL' ? ' (possible out-of-memory)' : ''}`,
            ),
          );
        } else if (code !== 0) {
          // The bash script uses `2>&1` so stderr is often empty — the real
          // error text ends up on stdout. Include stdout tail for context.
          const detail = stderr || lastLines(stdout, 10) || `exit code ${code}`;
          reject(new Error(`${action} failed: ${detail}`));
        } else {
          resolve(stdout.trim());
        }
      }
    });
  });
}

function parseResult(output: string): Record<string, unknown> {
  const lines = output.split('\n');
  const lastLine = lines[lines.length - 1];
  try {
    return JSON.parse(lastLine);
  } catch {
    return { ok: false, error: `Unexpected output: ${output}` };
  }
}

// Global upgrade state — only one upgrade can run at a time
const currentUpgrade: {
  running: boolean;
  cancelled: boolean;
  childProcess: ChildProcess | null;
  progress: UpgradeProgress;
  listeners: Set<EventCallback>;
  /** True once the deploy step is active — cancel must be blocked */
  deploying: boolean;
} = {
  running: false,
  cancelled: false,
  childProcess: null,
  progress: { step: 'idle', progress: 0, message: 'Idle' },
  listeners: new Set(),
  deploying: false,
};

export function isUpgradeRunning(): boolean {
  return currentUpgrade.running;
}

/** Returns true if the deploy step is active and cancel should be blocked */
export function isDeploying(): boolean {
  return currentUpgrade.deploying;
}

export function subscribeToEvents(cb: EventCallback): () => void {
  currentUpgrade.listeners.add(cb);
  // Send current state immediately
  cb({ type: 'progress', ...currentUpgrade.progress });
  return () => {
    currentUpgrade.listeners.delete(cb);
  };
}

function emit(progress: UpgradeProgress) {
  currentUpgrade.progress = progress;
  for (const cb of currentUpgrade.listeners) {
    try {
      cb({ type: 'progress', ...progress });
    } catch {
      // ignore listener errors
    }
  }
}

function emitOutput(step: UpgradeStep, line: string) {
  for (const cb of currentUpgrade.listeners) {
    try {
      cb({ type: 'output', step, line });
    } catch {
      // ignore listener errors
    }
  }
}

/** Helper: create an onLine callback that emits output for a given step */
function streamTo(step: UpgradeStep) {
  return (line: string) => emitOutput(step, line);
}

interface PipelineStep {
  step: UpgradeStep;
  progress: number;
  message: string;
  run: () => Promise<void>;
}

/** Run an array of pipeline steps sequentially, emitting progress for each */
async function runPipeline(steps: PipelineStep[]): Promise<void> {
  for (const { step, progress, message, run } of steps) {
    emit({ step, progress, message });
    await run();
  }
}

// ─── Step Factories ───

function preflightStep(
  progress: number,
  onResult?: (result: Record<string, unknown>) => void,
): PipelineStep {
  return {
    step: 'preflight',
    progress,
    message: 'Running pre-flight checks...',
    run: async () => {
      const preflightOut = await runUpgradeScript('preflight', [], streamTo('preflight'));
      const preflight = parseResult(preflightOut);
      if (!preflight.ok) {
        throw new Error(preflight.error as string);
      }
      if (preflight.warning) {
        emitOutput('preflight', `Warning: ${preflight.warning}`);
      }
      onResult?.(preflight);
    },
  };
}

function backupStep(progress: number): PipelineStep {
  return {
    step: 'backup',
    progress,
    message: 'Backing up configuration...',
    run: async () => {
      const backupOut = await runUpgradeScript('backup', [], streamTo('backup'));
      const backup = parseResult(backupOut);
      if (!backup.ok) {
        throw new Error(`Backup failed: ${backup.error}`);
      }
    },
  };
}

function migrateStep(progress: number): PipelineStep {
  return {
    step: 'migrate',
    progress,
    message: 'Migrating configuration...',
    run: async () => {
      const config = await readConfig();
      const targetSchemaVersion = getLatestSchemaVersion();
      if ((config.version ?? 0) < targetSchemaVersion) {
        const { config: migrated, migrationsRun } = migrateUp(config, targetSchemaVersion);
        await writeConfig(migrated);
        emitOutput('migrate', `Ran ${migrationsRun.length} migration(s): ${migrationsRun.join(', ')}`);
      } else {
        emitOutput('migrate', 'Schema is up to date — no migration needed');
      }
    },
  };
}

function setupSystemStep(progress: number): PipelineStep {
  return {
    step: 'setup-system',
    progress,
    message: 'Applying system configuration...',
    run: async () => {
      // After the atomic swap, process.cwd() points to the rollback tree.
      // Use the explicit APP_DIR constant to run setup-system on the new code.
      await runUpgradeScript('setup-system', [], streamTo('setup-system'), { cwd: APP_DIR });
    },
  };
}

function restartStep(progress: number): PipelineStep {
  return {
    step: 'restart',
    progress,
    message: 'Restarting service...',
    run: async () => {
      const restartOut = await runUpgradeScript('restart', [], streamTo('restart'), { cwd: APP_DIR });
      const restart = parseResult(restartOut);
      if (restart.method === 'systemctl') {
        emit({ step: 'restart', progress: 95, message: 'Server will restart momentarily...' });
        emitOutput('restart', 'Server restart scheduled — client will reconnect automatically');
      }
    },
  };
}

function completeStep(message: string): PipelineStep {
  return {
    step: 'complete',
    progress: 100,
    message,
    run: async () => {},
  };
}

// ─── Legacy git step factories (for pre-tarball releases) ───

function installStep(progress: number, message = 'Installing dependencies...'): PipelineStep {
  return {
    step: 'install',
    progress,
    message,
    run: async () => {
      await runUpgradeScript('install', [], streamTo('install'));
    },
  };
}

function buildStep(progress: number, message = 'Building application...'): PipelineStep {
  return {
    step: 'build',
    progress,
    message,
    run: async () => {
      await runUpgradeScript('build', [], streamTo('build'));
    },
  };
}

// ─── Pipeline Guard ───

interface GuardedPipelineOptions {
  steps: PipelineStep[];
  onError?: () => Promise<void>;
}

async function runGuardedPipeline({ steps, onError }: GuardedPipelineOptions): Promise<void> {
  if (currentUpgrade.running) {
    throw new Error('An upgrade is already in progress');
  }
  currentUpgrade.running = true;
  currentUpgrade.cancelled = false;
  currentUpgrade.deploying = false;

  try {
    await runPipeline(steps);
  } catch (error) {
    // Skip emitting if cancelUpgrade() already emitted the error
    if (!currentUpgrade.cancelled) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ step: 'error', progress: 0, message, error: message });
    }

    if (onError) {
      await onError();
    }

    throw error;
  } finally {
    currentUpgrade.running = false;
    currentUpgrade.cancelled = false;
    currentUpgrade.deploying = false;
  }
}

/** Cancel a running upgrade — kills the child process and resets state */
export function cancelUpgrade(): boolean {
  if (!currentUpgrade.running) return false;

  // Block cancel during the atomic deploy swap
  if (currentUpgrade.deploying) return false;

  const child = currentUpgrade.childProcess;
  if (child && !child.killed) {
    child.kill('SIGTERM');
  }

  currentUpgrade.cancelled = true;
  currentUpgrade.childProcess = null;

  emit({
    step: 'error',
    progress: 0,
    message: 'Upgrade cancelled by user',
    error: 'Upgrade cancelled by user',
  });

  // Don't set running = false here — let the pipeline's finally block
  // be the sole owner of that flag to prevent a race where a new upgrade
  // starts while the old pipeline's onError cleanup is still running.

  return true;
}

// ─── Public Pipeline Functions ───

export async function runUpgrade(targetTag: string): Promise<void> {
  // Determine whether a pre-built tarball is available for this tag
  const useTarball = await hasReleaseTarball(targetTag);

  if (useTarball) {
    await runTarballUpgrade(targetTag);
  } else {
    // For tarball-based installs (no .git), falling through to the git
    // pipeline would produce confusing errors. Surface a clear message.
    const { promises: fsPromises } = await import('fs');
    const isGit = await fsPromises.access(path.join(APP_DIR, '.git')).then(() => true, () => false);
    if (!isGit) {
      throw new Error(
        'No release tarball found for this version and no git repository is available. ' +
        'Check network connectivity or try a different version.',
      );
    }
    await runGitUpgrade(targetTag);
  }
}

/**
 * Recover from an interrupted deploy. Two scenarios:
 *   1. APP_DIR is missing but rollback exists → atomic swap was interrupted,
 *      restore APP_DIR from rollback.
 *   2. APP_DIR is fine but a stale .staging dir exists → a previous deploy
 *      was interrupted before the swap. The staging dir may contain
 *      stranded user data (data/, public/backgrounds/) from the data-move
 *      phase. Move that data back to APP_DIR if missing, then remove staging.
 */
async function recoverFromInterruptedDeploy(): Promise<void> {
  const { promises: fsPromises } = await import('fs');
  const rollbackDir = `${APP_DIR}.rollback`;
  const stagingDir = `${APP_DIR}.staging`;

  // Scenario 1: missing APP_DIR — restore from rollback
  try {
    await fsPromises.access(APP_DIR);
  } catch {
    try {
      await fsPromises.rename(rollbackDir, APP_DIR);
    } catch {
      // No rollback either — nothing to recover
    }
  }

  // Scenario 2: stale staging dir — reconcile any stranded user data
  try {
    await fsPromises.access(stagingDir);
    // staging dir exists; check for stranded data and restore it if APP_DIR
    // is missing the corresponding directories
    for (const rel of ['data', 'public/backgrounds']) {
      const src = `${stagingDir}/${rel}`;
      const dst = `${APP_DIR}/${rel}`;
      try {
        await fsPromises.access(src);
      } catch {
        continue; // staging doesn't have this subdir
      }
      try {
        await fsPromises.access(dst);
        // dst already exists — staging copy is stale, leave it for cleanup
      } catch {
        // dst missing — restore from staging
        try {
          await fsPromises.mkdir(path.dirname(dst), { recursive: true });
          await fsPromises.rename(src, dst);
        } catch {
          // best-effort recovery
        }
      }
    }
    // Remove the (now reconciled) staging directory
    await fsPromises.rm(stagingDir, { recursive: true, force: true });
  } catch {
    // No staging dir — nothing to reconcile
  }
}

/** Tarball-based upgrade: download → migrate → deploy → setup-system → restart */
async function runTarballUpgrade(targetTag: string): Promise<void> {
  // Recover from a previously interrupted deploy before starting
  await recoverFromInterruptedDeploy();

  const steps: PipelineStep[] = [
    preflightStep(5),
    backupStep(10),
    {
      step: 'download',
      progress: 20,
      message: 'Downloading update...',
      run: async () => {
        const downloadOut = await runUpgradeScript('download', [targetTag, GITHUB_REPO], streamTo('download'));
        const download = parseResult(downloadOut);
        if (!download.ok) {
          throw new Error(download.error as string);
        }
        emitOutput('download', `Downloaded and extracted ${targetTag}`);
      },
    },
    // Migrate runs BEFORE deploy — process.cwd() is still valid at this point.
    // After the atomic swap, process.cwd() would resolve to the rollback tree.
    migrateStep(50),
    {
      step: 'deploy',
      progress: 60,
      message: 'Installing update...',
      run: async () => {
        currentUpgrade.deploying = true;
        try {
          const deployOut = await runUpgradeScript('deploy', [], streamTo('deploy'));
          const deploy = parseResult(deployOut);
          if (!deploy.ok) {
            throw new Error(deploy.error as string);
          }
        } finally {
          currentUpgrade.deploying = false;
        }
        emitOutput('deploy', 'Atomic swap complete');
      },
    },
    setupSystemStep(75),
    // NOTE: cleanup-rollback is intentionally NOT a separate pipeline step.
    // It would run BEFORE the new release proves it can boot, leaving
    // nothing to recover from if startup fails. Instead, the `restart`
    // action below schedules a detached background job that polls the new
    // server's health and only then removes the rollback directory.
    restartStep(92),
    completeStep(`Upgrade to ${targetTag} complete!`),
  ];

  await runGuardedPipeline({
    steps,
    onError: async () => {
      // Clean up staging directory on failure to prevent stranded user data
      try {
        const { promises: fs } = await import('fs');
        await fs.rm(`${APP_DIR}.staging`, { recursive: true, force: true });
      } catch {
        // Staging dir may not exist or already cleaned up
      }
    },
  });
}

/** Legacy git-based upgrade: fetch → checkout → install → build → migrate → restart */
async function runGitUpgrade(targetTag: string): Promise<void> {
  let stashed = false;
  let isDirty = false;

  const steps: PipelineStep[] = [
    preflightStep(5, (result) => {
      isDirty = result.dirty as boolean;
    }),
    backupStep(10),
    {
      step: 'migrate-remote',
      progress: 15,
      message: 'Checking repository remote...',
      run: async () => {
        await runUpgradeScript('migrate-remote', [], streamTo('migrate-remote'));
      },
    },
    {
      step: 'fetch',
      progress: 20,
      message: 'Fetching latest code...',
      run: async () => {
        await runUpgradeScript('fetch', [], streamTo('fetch'));
      },
    },
    {
      step: 'stash',
      progress: 25,
      message: 'Stashing local changes...',
      run: async () => {
        if (!isDirty) return;
        const stashOut = await runUpgradeScript('stash', [], streamTo('stash'));
        const stashResult = parseResult(stashOut);
        stashed = (stashResult.stashed as boolean) ?? false;
      },
    },
    {
      step: 'checkout',
      progress: 30,
      message: `Checking out ${targetTag}...`,
      run: async () => {
        const checkoutOut = await runUpgradeScript('checkout', [targetTag], streamTo('checkout'));
        const checkout = parseResult(checkoutOut);
        if (!checkout.ok) {
          throw new Error(`Checkout failed: ${checkout.error}`);
        }
      },
    },
    installStep(40),
    buildStep(55, 'Building application (this may take a few minutes)...'),
    migrateStep(80),
    {
      step: 'cleanup',
      progress: 85,
      message: 'Restoring local changes...',
      run: async () => {
        if (!stashed) return;
        await runUpgradeScript('stash-pop', [], streamTo('cleanup'));
      },
    },
    setupSystemStep(88),
    restartStep(92),
    completeStep(`Upgrade to ${targetTag} complete!`),
  ];

  await runGuardedPipeline({
    steps,
    onError: async () => {
      if (stashed) {
        try {
          await runUpgradeScript('stash-pop');
        } catch (stashErr) {
          const stashMsg = stashErr instanceof Error ? stashErr.message : String(stashErr);
          emitOutput(
            currentUpgrade.progress.step,
            `Warning: failed to restore stashed changes: ${stashMsg}`,
          );
          emitOutput(
            currentUpgrade.progress.step,
            'Your local changes are saved in git stash. Run "git stash pop" manually to recover them.',
          );
        }
      }
    },
  });
}

export async function runRollback(targetTag: string): Promise<void> {
  const useTarball = await hasReleaseTarball(targetTag);

  if (useTarball) {
    // Tarball-based rollback — same as upgrade, just a different tag
    await runTarballUpgrade(targetTag);
    return;
  }

  // Legacy git-based rollback
  const steps: PipelineStep[] = [
    {
      step: 'backup',
      progress: 10,
      message: 'Backing up current configuration...',
      run: async () => {
        await runUpgradeScript('backup', [], streamTo('backup'));
      },
    },
    {
      step: 'checkout',
      progress: 30,
      message: `Rolling back to ${targetTag}...`,
      run: async () => {
        await runUpgradeScript('rollback', [targetTag], streamTo('checkout'));
      },
    },
    installStep(45),
    buildStep(60),
    setupSystemStep(78),
    restartStep(85),
    completeStep(`Rolled back to ${targetTag} successfully!`),
  ];

  await runGuardedPipeline({ steps });
}
