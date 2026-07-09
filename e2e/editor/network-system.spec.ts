import { test, expect } from '../fixtures';
import type { Page, Route } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';

/**
 * UI smoke tests for the Network and System settings pages
 * (`?section=defaults&page=network` / `&page=system`).
 *
 * These pages talk exclusively to the api/system routes, which on a real Pi
 * shell out to nmcli, systemctl, reboot, the upgrade pipeline, etc. The
 * CI/dev box has no such hardware and MUST NEVER run a power/upgrade/wifi
 * command, so every one of these tests installs a blanket catch-all
 * interceptor (`setupSystemStubs`) that fulfills every api/system request at
 * the browser boundary. Because Playwright matches route handlers
 * last-registered-first, the catch-all is registered FIRST and each specific
 * stub registered AFTER it wins for its own path — the catch-all only ever
 * fires for a route a test forgot to stub, and it records that fact so
 * `assertNoRealSystemCall` can flag it. Net effect: the real Next server never
 * receives a single system call.
 *
 * The low-level command logic (nmcli parsing, power/upgrade guards) already has
 * Vitest coverage; this suite covers only the rendered UI layer.
 */

/* ─── Stub response fixtures ───────────────────────────────────────────── */

const NETWORK_OVERVIEW = {
  available: true,
  hostname: 'home-screens',
  interfaces: [
    {
      device: 'wlan0',
      type: 'wifi',
      state: 'connected',
      connection: 'HomeNet',
      connectionUuid: 'uuid-wlan0',
      hwAddress: 'aa:bb:cc:dd:ee:ff',
      ipv4: { address: '192.168.1.50', prefix: 24, gateway: '192.168.1.1', dns: ['1.1.1.1'], method: 'auto' },
      wifi: { ssid: 'HomeNet', signal: 72, frequency: 2437, security: 'WPA2' },
      driver: 'brcmfmac',
      isManagementInterface: false,
    },
  ],
};

const SCAN_RESULTS = [
  { ssid: 'HomeNet', bssid: 'aa:bb:cc:dd:ee:01', signal: 80, frequency: 2437, security: 'WPA2', inUse: true, saved: true },
  { ssid: 'Neighbor Wi-Fi', bssid: 'aa:bb:cc:dd:ee:02', signal: 45, frequency: 5180, security: 'WPA2', inUse: false, saved: false },
  { ssid: 'OpenCafe', bssid: 'aa:bb:cc:dd:ee:03', signal: 30, frequency: 2412, security: '', inUse: false, saved: false },
];

const SAVED_NETWORKS = [
  { id: 'uuid-wlan0', name: 'HomeNet', ssid: 'HomeNet', autoconnect: true, lastUsed: 'never' },
  { id: 'uuid-cafe', name: 'Cafe', ssid: 'Cafe', autoconnect: false, lastUsed: 'never' },
];

const DIAGNOSTICS = {
  available: true,
  gateway: { ip: '192.168.1.1', reachable: true, latencyMs: 2 },
  internet: { ip: '1.1.1.1', reachable: true, latencyMs: 15 },
  watchdog: { active: true, lastRun: null },
};

const VERSION_UP_TO_DATE = {
  current: '1.2.3',
  currentCommit: 'abc1234',
  latest: null,
  latestCommit: null,
  updateAvailable: false,
  installedVia: 'git',
  channel: 'main',
  tags: [
    { tag: 'v1.2.3', version: '1.2.3', commit: 'abc1234' },
    { tag: 'v1.2.2', version: '1.2.2', commit: 'def5678' },
  ],
  upgradeRunning: false,
};

const VERSION_UPDATE_AVAILABLE = {
  ...VERSION_UP_TO_DATE,
  latest: '1.3.0',
  latestCommit: 'aaa9999',
  updateAvailable: true,
};

const BACKUPS = {
  backups: [
    { name: 'config-backup-2026-07-01.json', size: 4096, modified: '2026-07-01T12:00:00Z' },
  ],
};

/* ─── Stub harness ─────────────────────────────────────────────────────── */

interface SystemStubHandle {
  /** Requests that fell through to the catch-all (i.e. a test forgot to stub them). */
  unstubbed: string[];
  /** POST bodies captured per path, so a test can assert what the UI sent. */
  posted: Record<string, unknown[]>;
  /**
   * Count of GET /api/system/network/confirm calls. The RollbackOverlay is
   * dismissed by its parent the instant it resolves (its confirmed/reverted
   * screens never stay mounted long enough to assert on), so a test proves the
   * overlay ran by observing that it polled this endpoint.
   */
  confirmPolls: number;
}

type Overrides = {
  network?: unknown;
  version?: unknown;
  /** Response body for PUT /api/system/network/ip — a test returns a rollbackId here to drive the RollbackOverlay. */
  ip?: unknown;
  /** GET /api/system/network/confirm `pending` flag; `false` reports no pending rollback, driving the auto-revert branch. */
  confirmPending?: boolean;
};

/**
 * Install the blanket system interceptor plus every specific stub the two
 * pages touch. Returns a handle a test can inspect to prove no real command
 * ran and to check what the UI POSTed.
 */
async function setupSystemStubs(page: Page, overrides: Overrides = {}): Promise<SystemStubHandle> {
  const handle: SystemStubHandle = { unstubbed: [], posted: {}, confirmPolls: 0 };

  const record = (route: Route) => {
    const req = route.request();
    if (req.method() === 'POST' || req.method() === 'DELETE' || req.method() === 'PUT') {
      const path = new URL(req.url()).pathname;
      let body: unknown = null;
      try {
        body = req.postDataJSON();
      } catch {
        body = req.postData();
      }
      (handle.posted[path] ??= []).push(body);
    }
  };

  // Catch-all safety net — registered FIRST so every specific stub below wins
  // for its own path. Anything landing here is a route a test failed to stub;
  // we still fulfill it so the real server is never hit, and record it.
  await page.route('**/api/system/**', (route) => {
    handle.unstubbed.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: {} });
  });

  // Network overview (polled on mount + every 10s)
  await page.route('**/api/system/network', (route) =>
    route.fulfill({ json: overrides.network ?? NETWORK_OVERVIEW }),
  );

  // Wi-Fi scan (has ?iface= query)
  await page.route('**/api/system/network/wifi/scan**', (route) =>
    route.fulfill({ json: SCAN_RESULTS }),
  );

  // Saved networks: GET lists, DELETE forgets
  await page.route('**/api/system/network/wifi/saved**', (route) => {
    record(route);
    if (route.request().method() === 'DELETE') return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: SAVED_NETWORKS });
  });

  // Connect / disconnect
  await page.route('**/api/system/network/wifi/connect', (route) => {
    record(route);
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/system/network/wifi/disconnect', (route) => {
    record(route);
    return route.fulfill({ json: { ok: true } });
  });

  // Diagnostics
  await page.route('**/api/system/network/diagnostics', (route) =>
    route.fulfill({ json: DIAGNOSTICS }),
  );

  // Hostname change (PUT)
  await page.route('**/api/system/network/hostname', (route) => {
    record(route);
    return route.fulfill({ json: { ok: true } });
  });

  // Static-IP apply (PUT). The response is test-configurable so a test can
  // return a rollbackId and drive the RollbackOverlay confirm/revert flow.
  await page.route('**/api/system/network/ip', (route) => {
    record(route);
    return route.fulfill({ json: overrides.ip ?? { ok: true } });
  });

  // Rollback verification endpoint: GET reports the pending state the overlay
  // polls, POST confirms the change. `confirmPending: false` makes the GET
  // report no pending rollback — which is exactly how the real server signals
  // that connectivity was lost and the change was auto-reverted, so the revert
  // branch is driven deterministically through the same mechanism, no fake
  // timers required.
  await page.route('**/api/system/network/confirm', (route) => {
    record(route);
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { ok: true } });
    }
    handle.confirmPolls += 1;
    if (overrides.confirmPending === false) {
      return route.fulfill({ json: { pending: false } });
    }
    return route.fulfill({ json: { pending: true, rollbackId: 'rb-e2e', remainingMs: 45_000 } });
  });

  // System page routes
  await page.route('**/api/system/version**', (route) =>
    route.fulfill({ json: overrides.version ?? VERSION_UP_TO_DATE }),
  );
  await page.route('**/api/system/backups', (route) => {
    record(route);
    if (route.request().method() === 'POST') return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: BACKUPS });
  });
  await page.route('**/api/system/changelog**', (route) =>
    route.fulfill({ json: { releases: [] } }),
  );
  // Power — stubbed as a hard safety net. Tests only exercise restart-service.
  await page.route('**/api/system/power', (route) => {
    record(route);
    return route.fulfill({ json: { ok: true, message: 'Service restart scheduled' } });
  });

  // Version rollback trigger (POST) — the UpgradeModal fires this after the
  // Version History confirm dialog. A real trigger would checkout an old tag
  // and restart; the stub records the tag and returns ok.
  await page.route('**/api/system/rollback', (route) => {
    record(route);
    return route.fulfill({ json: { ok: true } });
  });
  // SSE progress stream the UpgradeModal opens via EventSource. Fulfilled
  // locally (never the real server) with an inert idle event. The modal
  // renders its header synchronously — which is all the rollback test asserts —
  // so we don't need to script a full progress sequence.
  await page.route('**/api/system/status', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: 'event: progress\ndata: {"step":"idle","progress":0,"message":""}\n\n',
    }),
  );

  return handle;
}

/** No `/api/system/**` request should have fallen through to the catch-all. */
function assertNoRealSystemCall(handle: SystemStubHandle) {
  expect(handle.unstubbed, `unstubbed system routes hit the catch-all: ${handle.unstubbed.join(', ')}`).toEqual([]);
}

/* ─── Network page ─────────────────────────────────────────────────────── */

test.describe('Defaults › Network', () => {
  test('renders interfaces, hostname, and diagnostics from the stubbed overview', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=network');

    // Interface card from the overview stub. ('wlan0' also appears in the
    // WifiScan "Scanning wlan0" hint, so match the interface span exactly.)
    await expect(page.getByText('wlan0', { exact: true })).toBeVisible();
    await expect(page.getByText('Connected to "HomeNet" (192.168.1.50)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'IP Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();

    // Hostname section pre-filled from overview.
    await expect(page.getByRole('heading', { name: 'Hostname' })).toBeVisible();

    // Diagnostics section renders its Test Connection button without error.
    await expect(page.getByRole('button', { name: 'Test Connection' })).toBeVisible();

    assertNoRealSystemCall(stubs);
  });

  test('WifiScanSection lists stubbed networks after a scan', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=network');

    await expect(page.getByText('Click Scan to search for nearby Wi-Fi networks.')).toBeVisible();
    await page.getByRole('button', { name: 'Scan', exact: true }).click();

    // All three stubbed SSIDs render as rows, with the connected/saved badges.
    await expect(page.getByRole('button', { name: /Neighbor Wi-Fi/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /OpenCafe/ })).toBeVisible();
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();

    assertNoRealSystemCall(stubs);
  });

  test('clicking a scanned network opens the WifiConnectModal', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=network');
    await page.getByRole('button', { name: 'Scan', exact: true }).click();

    // A secured network opens the modal with a password field.
    await page.getByRole('button', { name: /Neighbor Wi-Fi/ }).click();
    await expect(page.getByRole('heading', { name: 'Connect to "Neighbor Wi-Fi"' })).toBeVisible();
    // The password input has no htmlFor association (label is a sibling), so
    // target it by placeholder.
    await expect(page.getByPlaceholder('Enter password')).toBeVisible();

    // Cancel closes it without any connect call.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Connect to "Neighbor Wi-Fi"' })).toBeHidden();

    assertNoRealSystemCall(stubs);
    expect(stubs.posted['/api/system/network/wifi/connect']).toBeUndefined();
  });

  test('connecting to an open network POSTs and closes the modal', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=network');
    await page.getByRole('button', { name: 'Scan', exact: true }).click();

    // OpenCafe has empty security → the modal shows no password field and
    // Connect is immediately enabled.
    await page.getByRole('button', { name: /OpenCafe/ }).click();
    await expect(page.getByRole('heading', { name: 'Connect to "OpenCafe"' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter password')).toBeHidden();

    await page.getByRole('button', { name: 'Connect', exact: true }).click();

    // Stub returns { ok: true } → modal closes.
    await expect(page.getByRole('heading', { name: 'Connect to "OpenCafe"' })).toBeHidden();

    assertNoRealSystemCall(stubs);
    const posted = stubs.posted['/api/system/network/wifi/connect'] as Array<{ ssid: string }>;
    expect(posted?.[0]?.ssid).toBe('OpenCafe');
  });

  test('SavedNetworksSection lists saved networks with a Forget action', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=network');

    await expect(page.getByRole('heading', { name: 'Saved Networks' })).toBeVisible();
    // 'Cafe' is unique to the saved list (HomeNet also appears in interfaces/scan).
    await expect(page.getByText('Cafe', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forget' }).first()).toBeVisible();

    assertNoRealSystemCall(stubs);
  });

  test('DiagnosticsSection renders gateway/internet results after Test Connection', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=network');

    await page.getByRole('button', { name: 'Test Connection' }).click();

    await expect(page.getByText('Gateway')).toBeVisible();
    await expect(page.getByText('Internet')).toBeVisible();
    await expect(page.getByText('Wi-Fi watchdog:')).toBeVisible();
    // Both hosts reachable (with latency) from the stub.
    await expect(page.getByText(/Reachable \(2ms\)/)).toBeVisible();

    assertNoRealSystemCall(stubs);
  });

  test('shows the unavailable state when the device has no NetworkManager', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page, {
      network: { available: false, reason: 'nmcli not found' },
    });

    await page.goto('/editor/settings?section=defaults&page=network');

    await expect(
      page.getByText('Network settings are only available on the display device.'),
    ).toBeVisible();

    assertNoRealSystemCall(stubs);
  });

  test('saving a new hostname PUTs the value and shows the success message', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=network');

    // Scope to the Hostname section — the field's placeholder ("home-screens")
    // matches its own value, so target the input by its section instead.
    const hostnameSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Hostname' }),
    });
    await hostnameSection.getByRole('textbox').fill('living-room-pi');
    await hostnameSection.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Hostname updated')).toBeVisible({ timeout: 15_000 });

    assertNoRealSystemCall(stubs);
    const posted = stubs.posted['/api/system/network/hostname'] as Array<{ hostname: string }>;
    expect(posted?.[0]?.hostname).toBe('living-room-pi');
  });

  test('Disconnect posts the active connection id', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=network');

    await page.getByRole('button', { name: 'Disconnect' }).click();

    await expect
      .poll(() => stubs.posted['/api/system/network/wifi/disconnect']?.length ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(0);

    assertNoRealSystemCall(stubs);
    const posted = stubs.posted['/api/system/network/wifi/disconnect'] as Array<{ connectionId: string }>;
    expect(posted?.[0]?.connectionId).toBe('uuid-wlan0');
  });

  test('applying a static IP confirms connectivity through the rollback overlay', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    // The apply returns a rollbackId → the overlay mounts and verifies.
    const stubs = await setupSystemStubs(page, { ip: { ok: true, rollbackId: 'rb-e2e' } });

    await page.goto('/editor/settings?section=defaults&page=network');

    // Open the IP panel for wlan0, switch to a static address, and apply.
    await page.getByRole('button', { name: 'IP Settings' }).click();
    await expect(page.getByRole('heading', { name: 'IP Settings (wlan0)' })).toBeVisible();
    await page.getByRole('radio', { name: 'Static (manual)' }).check();
    await page.getByPlaceholder('192.168.1.50').fill('192.168.1.99');
    await page.getByRole('button', { name: 'Apply' }).click();

    // The apply returned a rollbackId → the overlay mounts, polls confirm
    // (pending), then POSTs to confirm and cancel the auto-revert. The parent
    // dismisses the overlay the instant it resolves, so we assert on the calls
    // it made rather than its transient "confirmed" screen.
    const confirmPosts = () => (stubs.posted['/api/system/network/confirm'] as Array<{ rollbackId: string }>) ?? [];
    await expect.poll(() => confirmPosts().length, { timeout: 15_000 }).toBeGreaterThan(0);

    assertNoRealSystemCall(stubs);
    expect(stubs.confirmPolls).toBeGreaterThan(0);
    const ipPost = stubs.posted['/api/system/network/ip'] as Array<{ method: string; address: string }>;
    expect(ipPost?.[0]?.method).toBe('manual');
    expect(ipPost?.[0]?.address).toBe('192.168.1.99');
    expect(confirmPosts()[0]?.rollbackId).toBe('rb-e2e');
  });

  test('a static IP that loses connectivity reverts through the rollback overlay', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    // confirmPending:false → the GET reports no pending rollback, exactly how the
    // server signals it already auto-reverted after connectivity was lost.
    const stubs = await setupSystemStubs(page, {
      ip: { ok: true, rollbackId: 'rb-e2e' },
      confirmPending: false,
    });

    await page.goto('/editor/settings?section=defaults&page=network');

    await page.getByRole('button', { name: 'IP Settings' }).click();
    await expect(page.getByRole('heading', { name: 'IP Settings (wlan0)' })).toBeVisible();
    await page.getByRole('radio', { name: 'Static (manual)' }).check();
    await page.getByPlaceholder('192.168.1.50').fill('192.168.1.99');
    await page.getByRole('button', { name: 'Apply' }).click();

    // The overlay's first poll sees pending:false — the server's signal that
    // the change already auto-reverted — so it takes the revert path and never
    // POSTs a confirm. Wait for the overlay to have polled, then assert it did
    // not confirm.
    await expect.poll(() => stubs.confirmPolls, { timeout: 15_000 }).toBeGreaterThan(0);
    // Give any (erroneous) confirm POST a beat to have fired before asserting absence.
    await expect
      .poll(() => (stubs.posted['/api/system/network/ip'] as unknown[])?.length ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(0);

    assertNoRealSystemCall(stubs);
    const ipPost = stubs.posted['/api/system/network/ip'] as Array<{ method: string }>;
    expect(ipPost?.[0]?.method).toBe('manual');
    // The revert path must NOT have confirmed the change.
    expect(stubs.posted['/api/system/network/confirm']).toBeUndefined();
  });

  test('Forget removes a saved network after confirming', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=network');

    await expect(page.getByText('Cafe', { exact: true })).toBeVisible();
    // SAVED_NETWORKS lists HomeNet then Cafe → Cafe owns the second Forget button.
    await page.getByRole('button', { name: 'Forget' }).nth(1).click();
    // Inline confirmation ("Forget?" with Yes/No).
    await page.getByRole('button', { name: 'Yes' }).click();

    // The DELETE resolved ok → Cafe drops out of the list.
    await expect(page.getByText('Cafe', { exact: true })).toBeHidden({ timeout: 15_000 });

    assertNoRealSystemCall(stubs);
    const posted = stubs.posted['/api/system/network/wifi/saved'] as Array<{ connectionId: string }>;
    expect(posted?.[0]?.connectionId).toBe('uuid-cafe');
  });
});

/* ─── System page ──────────────────────────────────────────────────────── */

test.describe('Defaults › System', () => {
  test('renders version, backups, and system-action buttons', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=system');

    // Version section from the stub. (The current-version <p> renders
    // "v1.2.3 (abc1234)", so match the standalone history tag span exactly.)
    await expect(page.getByText('v1.2.3', { exact: true })).toBeVisible();
    await expect(page.getByText("You're on the latest version")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check for Updates' })).toBeVisible();

    // Backups section lists the stubbed backup with Restore/Download actions.
    await expect(page.getByRole('heading', { name: 'Config Backups' })).toBeVisible();
    await expect(page.getByText('config-backup-2026-07-01.json')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();

    // System Actions render but are NOT clicked here.
    await expect(page.getByRole('button', { name: 'Restart Service' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reboot System' })).toBeVisible();

    assertNoRealSystemCall(stubs);
  });

  test('shows an Update Now button when an update is available', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page, { version: VERSION_UPDATE_AVAILABLE });

    await page.goto('/editor/settings?section=defaults&page=system');

    await expect(page.getByText('Update available: v1.3.0')).toBeVisible();
    // Present but deliberately NOT clicked — clicking would mount the upgrade
    // pipeline. Rendering is the smoke assertion.
    await expect(page.getByRole('button', { name: 'Update Now' })).toBeVisible();

    assertNoRealSystemCall(stubs);
  });

  test('restoring a backup confirms, POSTs to the stub, and reports success', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=system');

    await page.getByRole('button', { name: 'Restore' }).click();

    // Confirm dialog (ConfirmModal, mounted in the editor layout).
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Restore' }).click();

    // Stub returns { ok: true } → success message.
    await expect(page.getByText('Restored! Reload the editor to see changes.')).toBeVisible();

    assertNoRealSystemCall(stubs);
    // The UI POSTed the backup name to the (stubbed) restore route.
    const posted = stubs.posted['/api/system/backups'] as Array<{ name: string }>;
    expect(posted?.[0]?.name).toBe('config-backup-2026-07-01.json');
  });

  test('restart-service confirms, hits the stubbed power route, and shows scheduled status', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=system');

    await page.getByRole('button', { name: 'Restart Service' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The confirm button label is "Restart".
    await dialog.getByRole('button', { name: 'Restart', exact: true }).click();

    await expect(
      page.getByText('Service restart scheduled. The page will reload momentarily…'),
    ).toBeVisible();

    // Prove the real systemctl never ran: the request was intercepted by our
    // specific stub, and its body carried the restart-service action.
    assertNoRealSystemCall(stubs);
    const posted = stubs.posted['/api/system/power'] as Array<{ action: string }>;
    expect(posted?.[0]?.action).toBe('restart-service');
  });

  test('rolling back to an older version confirms and fires the rollback trigger', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    const stubs = await setupSystemStubs(page);

    await page.goto('/editor/settings?section=defaults&page=system');

    // Version History lists v1.2.2 (not current) with a Rollback action.
    await expect(page.getByRole('heading', { name: 'Version History' })).toBeVisible();
    await page.getByRole('button', { name: 'Rollback' }).click();

    // Confirm dialog (ConfirmModal).
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Roll Back' }).click();

    // The UpgradeModal replaces the settings page and renders its header.
    await expect(page.getByRole('heading', { name: 'Rolling back to v1.2.2' })).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => stubs.posted['/api/system/rollback']?.length ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The real checkout+restart never ran — the trigger was intercepted, and its
    // body carried the target tag.
    assertNoRealSystemCall(stubs);
    const posted = stubs.posted['/api/system/rollback'] as Array<{ tag: string }>;
    expect(posted?.[0]?.tag).toBe('v1.2.2');
  });
});
