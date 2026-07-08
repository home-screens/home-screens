import { spawn } from 'child_process';
import { createServer } from 'net';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { createSandbox } from './sandbox';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

export interface HsServer {
  baseURL: string;
  sandboxDir: string;
  stop(): Promise<void>;
}

/** Boot a production Next server from a fresh sandbox. Requires `npm run build` to have run. */
export async function launchServer(dataFiles: Record<string, unknown> = {}): Promise<HsServer> {
  if (!existsSync(path.join(REPO_ROOT, '.next', 'BUILD_ID'))) {
    throw new Error('No production build found. Run `npm run build` before `npm run test:e2e`.');
  }
  const sandboxDir = createSandbox(dataFiles);
  const port = await getFreePort();
  const child = spawn(
    path.join(REPO_ROOT, 'node_modules', '.bin', 'next'),
    ['start', '-p', String(port), '-H', '127.0.0.1'],
    { cwd: sandboxDir, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' },
  );
  let stderr = '';
  child.stderr?.on('data', (d) => { stderr += String(d); });

  const baseURL = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited with code ${child.exitCode}:\n${stderr}`);
    }
    try {
      const res = await fetch(`${baseURL}/login`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`Server on ${baseURL} not ready after 30s:\n${stderr}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    baseURL,
    sandboxDir,
    async stop() {
      child.kill();
      await new Promise((r) => setTimeout(r, 300));
      rmSync(sandboxDir, { recursive: true, force: true });
    },
  };
}
