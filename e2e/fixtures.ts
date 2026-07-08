import { test as base } from '@playwright/test';
import { launchServer, type HsServer } from './helpers/server';
import { baseConfig } from './helpers/config-fixtures';

type WorkerFixtures = { server: HsServer };

// First type param redeclares the built-in `baseURL` option (string is
// assignable to its string|undefined) so the override below typechecks.
// `sandboxDir` exposes the worker server's private data/ root so a spec can
// drop files (e.g. a fixture plugin) into it before navigating.
export const test = base.extend<{ baseURL: string; sandboxDir: string }, WorkerFixtures>({
  server: [
    async ({}, use) => {
      const server = await launchServer({ 'config.json': baseConfig() });
      await use(server);
      await server.stop();
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ server }, use) => {
    await use(server.baseURL);
  },
  sandboxDir: async ({ server }, use) => {
    await use(server.sandboxDir);
  },
});

export { expect } from '@playwright/test';
