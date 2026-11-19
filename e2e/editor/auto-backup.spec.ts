import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * Settings › Backups & data › Automatic backups: switching it on, "Back up
 * now", the copies kept on the hub (download, restore, remove), the storage
 * folder against a WebDAV stub this spec runs on localhost, and the private
 * download link. The scheduler is off in E2E (`HS_DISABLE_AUTO_BACKUP`), so
 * every run here is a "Back up now".
 */

const DATA_PAGE = '/editor/settings?section=defaults&page=data';

function configWith(name: string, autoBackup: Record<string, unknown> = { enabled: true }) {
  return baseConfig({
    screens: [makeScreen('s1', name, [textModule('hello')])],
    settings: { autoBackup, backupReminder: { enabled: false, intervalDays: 7 } },
  });
}

/** Leave the worker's hub with no copies, no folder and no link. */
async function clearAutoBackups(request: APIRequestContext): Promise<void> {
  const status = await (await request.get('/api/backup/auto')).json();
  for (const copy of status.copies ?? []) {
    await request.delete(`/api/backup/auto/files/${encodeURIComponent(copy.name)}`);
  }
  await request.put('/api/backup/auto/secrets', { data: { destination: null } });
  await request.delete('/api/backup/auto/link');
}

/** A WebDAV folder at /dav/Backups/ that takes PUT and DELETE for taylor / pass-word. */
async function startWebdav(): Promise<{ url: string; files: Map<string, Buffer>; refuse: (on: boolean) => void; close: () => Promise<void> }> {
  const files = new Map<string, Buffer>();
  let refusing = false;
  const auth = `Basic ${Buffer.from('taylor:pass-word').toString('base64')}`;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (refusing || req.headers.authorization !== auth) { res.writeHead(401).end(); return; }
      const name = decodeURIComponent((req.url ?? '').replace(/^\/dav\/Backups\//, ''));
      if (req.method === 'PUT') { files.set(name, Buffer.concat(chunks)); res.writeHead(201).end(); return; }
      if (req.method === 'DELETE') { res.writeHead(files.delete(name) ? 204 : 404).end(); return; }
      res.writeHead(405).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/dav/Backups/`,
    files,
    refuse: (on) => { refusing = on; },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test.describe('Defaults › Backups & data › Automatic backups', () => {
  test.beforeEach(async ({ request }) => {
    await clearAutoBackups(request);
  });

  test('switching it on shows the schedule, and the old snapshots heading is renamed', async ({ page, request }) => {
    await putConfig(request, configWith('Kitchen', { enabled: false }));
    await page.goto(DATA_PAGE);
    const block = page.getByTestId('auto-backup');
    await expect(block.getByText('How often')).toHaveCount(0);
    await block.getByRole('switch', { name: 'Back up by itself' }).click();
    await expect(block.getByText('How often')).toBeVisible();
    await expect(block.getByText('Keep the last')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Snapshots before updates' })).toBeVisible();
    await expect.poll(async () => (await (await request.get('/api/config')).json()).settings.autoBackup?.enabled).toBe(true);

    await block.locator('[data-field-id="data.autoBackupEvery"] select').selectOption('week');
    await expect.poll(async () => (await (await request.get('/api/config')).json()).settings.autoBackup?.every).toBe('week');
  });

  test('back up now, then download, restore and remove the copy from the list', async ({ page, request }) => {
    await putConfig(request, configWith('Kitchen'));
    await page.goto(DATA_PAGE);
    const block = page.getByTestId('auto-backup');
    await expect(block.getByText('No backups yet.')).toBeVisible();

    await block.getByRole('button', { name: 'Back up now' }).click();
    const copy = block.getByTestId('auto-backup-copy');
    await expect(copy).toHaveCount(1);
    await expect(block.getByTestId('auto-backup-status')).toContainText('Last backup:');
    // Nothing has left the hub yet, so the block says so (and so would the reminder).
    await expect(block.getByText('These backups are only on this hub.', { exact: false })).toBeVisible();

    const download = page.waitForEvent('download');
    await copy.getByRole('link', { name: 'Download' }).click();
    expect((await download).suggestedFilename()).toMatch(/^home-screens-auto-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);

    // Change something, then put the copy back.
    await putConfig(request, configWith('Changed since'));
    await copy.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('This replaces all of your settings', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Restore', exact: true }).last().click();
    await expect(page.getByTestId('restore-finished')).toBeVisible();
    expect((await (await request.get('/api/config')).json()).screens[0].name).toBe('Kitchen');
    // The copy is still there after the restore.
    await expect(copy).toHaveCount(1);

    await copy.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Copies already sent somewhere else stay where they are.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
    await expect(copy).toHaveCount(0);
    expect((await (await request.get('/api/backup/auto')).json()).copies).toEqual([]);
  });

  test('a storage folder is checked, receives each backup, and shows a failure in Settings and the toast', async ({ page, request }) => {
    const dav = await startWebdav();
    try {
      await putConfig(request, configWith('Kitchen'));
      await page.goto(DATA_PAGE);
      const folder = page.getByTestId('auto-backup-folder');
      await folder.getByRole('button', { name: 'Set up' }).click();
      await folder.getByRole('radio', { name: 'WebDAV' }).check();
      await folder.getByLabel('Folder address').fill(dav.url);
      await folder.getByLabel('Name').fill('taylor');
      await folder.getByLabel('Password').fill('pass-word');
      // http on the home network: no warning.
      await expect(folder.getByText('your password could be read on the way', { exact: false })).toHaveCount(0);
      await folder.getByRole('button', { name: 'Check it works' }).click();
      await expect(folder.getByText('It works.', { exact: false })).toBeVisible();
      expect(dav.files.size).toBe(0);
      await folder.getByRole('button', { name: 'Save' }).click();
      await expect(folder).toContainText('Sending to 127.0.0.1');
      await expect(folder).toContainText('nothing sent yet');

      await page.getByRole('button', { name: 'Back up now' }).click();
      await expect(folder).toContainText('last sent today');
      expect([...dav.files.keys()]).toEqual([expect.stringMatching(/^home-screens-auto-backup-.*\.json$/)]);
      await expect(page.getByTestId('auto-backup-status')).toContainText('sent to your storage folder');

      // The storage starts refusing the password.
      dav.refuse(true);
      await page.getByRole('button', { name: 'Back up now' }).click();
      await expect(folder).toContainText('The last backup could not be sent. The name or password was not accepted.');
      await expect(folder).toContainText('Home Screens tries again every hour.');

      // The editor toast says so on the next load, and leads to Settings.
      await page.goto('/editor');
      await expect(page.getByTestId('backup-reminder-message')).toHaveText('Your backup was saved but could not be sent to your storage folder.');
      await page.getByRole('link', { name: 'See why' }).click();
      await expect(page).toHaveURL(/page=data/);
    } finally {
      await dav.close();
    }
  });

  test('a plain http address outside the home warns that the password could be read', async ({ page, request }) => {
    await putConfig(request, configWith('Kitchen'));
    await page.goto(DATA_PAGE);
    const folder = page.getByTestId('auto-backup-folder');
    await folder.getByRole('button', { name: 'Set up' }).click();
    await folder.getByRole('radio', { name: 'WebDAV' }).check();
    await folder.getByLabel('Folder address').fill('http://files.example.com/dav/Backups/');
    await expect(folder.getByText('your password could be read on the way', { exact: false })).toBeVisible();
    await folder.getByLabel('Folder address').fill('https://files.example.com/dav/Backups/');
    await expect(folder.getByText('your password could be read on the way', { exact: false })).toHaveCount(0);
  });

  test('a new storage folder starts on Network share, and pasting an address picks its kind', async ({ page, request }) => {
    await putConfig(request, configWith('Kitchen'));
    await page.goto(DATA_PAGE);
    const folder = page.getByTestId('auto-backup-folder');
    await expect(folder).toContainText('a shared folder on a NAS or a computer');
    await folder.getByRole('button', { name: 'Set up' }).click();
    await expect(folder.getByRole('radio', { name: 'Network share' })).toBeChecked();
    await folder.getByLabel('Share address').fill('https://cloud.example.com/remote.php/dav/files/taylor/Backups/');
    await expect(folder.getByRole('radio', { name: 'WebDAV' })).toBeChecked();
    await expect(folder.getByLabel('Folder address')).toHaveValue('https://cloud.example.com/remote.php/dav/files/taylor/Backups/');
    await folder.getByLabel('Folder address').fill('\\\\nas\\Backups');
    await expect(folder.getByRole('radio', { name: 'Network share' })).toBeChecked();
    await expect(folder.getByLabel('Share address')).toHaveValue('\\\\nas\\Backups');
  });

  test('a share outside the home is warned about, and an address without a share is explained', async ({ page, request }) => {
    await putConfig(request, configWith('Kitchen'));
    await page.goto(DATA_PAGE);
    const folder = page.getByTestId('auto-backup-folder');
    await folder.getByRole('button', { name: 'Set up' }).click();
    await folder.getByLabel('Share address').fill('\\\\files.example.com\\Backups');
    await expect(folder.getByText('This server is outside your home.', { exact: false })).toBeVisible();
    await folder.getByLabel('Share address').fill('\\\\nas.local');
    await expect(folder.getByText('This server is outside your home.', { exact: false })).toHaveCount(0);
    await folder.getByLabel('Name').fill('taylor');
    await folder.getByLabel('Password').fill('pass-word');
    await folder.getByRole('button', { name: 'Save' }).click();
    await expect(folder.getByRole('alert')).toHaveText("Add the share's name after the server, such as \\\\nas.local\\Backups.");
  });

  test('checking a share nobody answers on says it cannot be reached', async ({ page, request }) => {
    await putConfig(request, configWith('Kitchen'));
    await page.goto(DATA_PAGE);
    const folder = page.getByTestId('auto-backup-folder');
    await folder.getByRole('button', { name: 'Set up' }).click();
    await folder.getByLabel('Share address').fill('smb://127.0.0.1:1/Backups');
    await folder.getByLabel('Name').fill('taylor');
    await folder.getByLabel('Password').fill('pass-word');
    await folder.getByRole('button', { name: 'Check it works' }).click();
    await expect(folder.getByRole('alert')).toHaveText('Home Screens could not reach the storage.');
    // The answer was about that address; editing it takes the answer away.
    await folder.getByLabel('Share address').fill('smb://127.0.0.1:2/Backups');
    await expect(folder.getByRole('alert')).toHaveCount(0);
  });

  test('a saved share says where backups go, and moving it to another server asks for that password', async ({ page, request }) => {
    await putConfig(request, configWith('Kitchen'));
    await page.goto(DATA_PAGE);
    const folder = page.getByTestId('auto-backup-folder');
    await folder.getByRole('button', { name: 'Set up' }).click();
    await folder.getByLabel('Share address').fill('smb://nas.local/Backups/home-screens');
    await folder.getByLabel('Name').fill('taylor');
    await folder.getByLabel('Password').fill('pass-word');
    await folder.getByRole('button', { name: 'Save' }).click();
    await expect(folder).toContainText('Sending to the Backups share on nas.local as taylor');
    await expect(folder).toContainText('nothing sent yet');
    const status = await (await request.get('/api/backup/auto')).json();
    expect(status.destination).toEqual({ kind: 'smb', host: 'nas.local', share: 'Backups', folder: 'home-screens', username: 'taylor' });

    await folder.getByRole('button', { name: 'Change' }).click();
    await expect(folder.getByLabel('Share address')).toHaveValue('\\\\nas.local\\Backups\\home-screens');
    await expect(folder.getByLabel('Password')).toHaveAttribute('placeholder', 'Leave empty to keep the saved one');
    await folder.getByLabel('Share address').fill('\\\\backup-pc\\Shared');
    await expect(folder.getByLabel('Password')).toHaveAttribute('placeholder', '');
    await folder.getByRole('button', { name: 'Save' }).click();
    await expect(folder.getByRole('alert')).toHaveText('Type the password for backup-pc. A saved password is only ever sent to the server it was typed for.');
    expect((await (await request.get('/api/backup/auto')).json()).destination.host).toBe('nas.local');
  });

  test('an answer that arrives after the form changed is not shown, in the form or on the closed card', async ({ page, request }) => {
    await putConfig(request, configWith('Kitchen'));
    await page.goto(DATA_PAGE);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/backup/auto/test', async (route) => {
      await held;
      await route.fulfill({ json: { ok: true } });
    });
    const folder = page.getByTestId('auto-backup-folder');
    await folder.getByRole('button', { name: 'Set up' }).click();
    await folder.getByLabel('Share address').fill('smb://nas.local/Backups');
    await folder.getByLabel('Name').fill('taylor');
    await folder.getByLabel('Password').fill('pass-word');
    await folder.getByRole('button', { name: 'Check it works' }).click();
    await expect(folder.getByRole('button', { name: 'Checking…' })).toBeVisible();
    // Edited while the check is out: its answer is about the old address.
    await folder.getByLabel('Share address').fill('smb://backup-pc/Shared');
    release();
    await expect(folder.getByRole('button', { name: 'Check it works' })).toBeEnabled();
    await expect(folder.getByText('It works.', { exact: false })).toHaveCount(0);

    // A saved share: a check from the form, then Cancel, leaves the closed card clean.
    await page.unroute('**/api/backup/auto/test');
    await folder.getByLabel('Share address').fill('smb://nas.local/Backups');
    await folder.getByRole('button', { name: 'Save' }).click();
    await expect(folder).toContainText('Sending to the Backups share on nas.local as taylor');
    await folder.getByRole('button', { name: 'Change' }).click();
    await folder.getByLabel('Share address').fill('smb://127.0.0.1:1/Backups');
    await folder.getByLabel('Password').fill('pass-word');
    await folder.getByRole('button', { name: 'Check it works' }).click();
    await expect(folder.getByRole('alert')).toHaveText('Home Screens could not reach the storage.');
    await folder.getByRole('button', { name: 'Cancel' }).click();
    await expect(folder).toContainText('Sending to the Backups share on nas.local as taylor');
    await expect(folder.getByRole('alert')).toHaveCount(0);
  });

  test('the private download link fetches the newest backup and stops working when removed', async ({ page, request, playwright, baseURL }) => {
    await putConfig(request, configWith('Kitchen'));
    await request.post('/api/backup/auto');
    await page.goto(DATA_PAGE);
    const card = page.getByTestId('auto-backup-link');
    await card.getByRole('button', { name: 'Make a link' }).click();
    await expect(card).toContainText('Not fetched yet');
    // A link that was just made is shown straight away.
    await expect(card.getByRole('button', { name: 'Hide link' })).toBeVisible();
    const url = await page.getByTestId('auto-backup-link-url').inputValue();
    expect(url).toMatch(/\/api\/backup\/latest\?token=[A-Za-z0-9_-]{43}$/);

    // Another computer with no session.
    const outsider = await playwright.request.newContext({ baseURL });
    const fetched = await outsider.get(new URL(url).pathname + new URL(url).search);
    expect(fetched.status()).toBe(200);
    expect(fetched.headers()['content-disposition']).toMatch(/home-screens-auto-backup-/);
    expect((await outsider.get('/api/backup/latest?token=wrong')).status()).toBe(404);

    await page.reload();
    await expect(page.getByTestId('auto-backup-link')).toContainText('Last fetched today');

    await page.getByTestId('auto-backup-link').getByRole('button', { name: 'Show link' }).click();
    await page.getByRole('button', { name: 'Remove link' }).click();
    await page.getByRole('button', { name: 'Remove link' }).last().click();
    await expect(page.getByTestId('auto-backup-link').getByRole('button', { name: 'Make a link' })).toBeVisible();
    expect((await outsider.get(new URL(url).pathname + new URL(url).search)).status()).toBe(404);
    await outsider.dispose();
  });
});
