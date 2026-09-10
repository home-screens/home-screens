import { test as base, expect } from '@playwright/test';
import { launchServer, type HsServer } from './helpers/server';
import { baseConfig } from './helpers/config-fixtures';

type WorkerFixtures = { server: HsServer };

// First type param redeclares the built-in `baseURL` option (string is
// assignable to its string|undefined) so the override below typechecks.
// `sandboxDir` exposes the worker server's private data/ root so a spec can
// drop files (e.g. a fixture plugin) into it before navigating.
export const test = base.extend<{ baseURL: string; sandboxDir: string; resetFamily: void; isolateFamily: boolean }, WorkerFixtures>({
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
  isolateFamily: [true, { option: true }],
  // The roster is global now. A prior chore fixture must not introduce people
  // into an unrelated calendar test in this worker's persistent sandbox.
  resetFamily: [async ({ request, isolateFamily }, use) => {
    // Auth suites deliberately share a signed-out, password-protected server
    // between cases. They do not seed family data or authorize roster writes.
    if (!isolateFamily) { await use(); return; }
    const response = await request.get('/api/family');
    expect(response.ok()).toBe(true);
    const family = await response.json() as { members: Array<{ id: string }>; revision: string };
    if (family.members.length) {
      // Use the real cascade so prior chore assignments, completions and
      // balances cannot outlive the identities removed by test isolation.
      const cleared = await request.put('/api/family', { data: {
        members: [], revision: family.revision, removedIds: family.members.map((member) => member.id),
      } });
      expect(cleared.ok()).toBe(true);
    }
    await use();
  }, { auto: true }],
  // The To-Do module shows a one-shot "Tap a box" pill on a display that has
  // never seen it, for 4s plus a fade. Every spec gets a fresh browser
  // profile, so without this it would be on screen during the first seconds
  // of every render: the style matrix would compare screenshots against a
  // fading overlay and gallery captures would bake it in. Specs that want
  // the hint remove the flag themselves.
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try { window.localStorage.setItem('hs:todo-tap-hint-seen', '1'); } catch { /* storage blocked */ }
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
