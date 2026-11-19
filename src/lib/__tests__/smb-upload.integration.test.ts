import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { deleteFile, testDestination, uploadFile } from '../smb-upload';
import type { ShareDestination } from '../storage-destination';

/**
 * `smb-upload.ts` against a real share. Skipped unless these are set:
 *
 *   HS_SMB_TEST_HOST=127.0.0.1:1445 HS_SMB_TEST_SHARE=Backups
 *   HS_SMB_TEST_USER=taylor HS_SMB_TEST_PASS='local test pass 1'
 *
 * and, for the extra cases, HS_SMB_TEST_VIEWER / HS_SMB_TEST_VIEWER_PASS (a
 * name that may only look at the share) and HS_SMB_TEST_FULL_SHARE (a share
 * with less than 20 MB free).
 *
 * A Samba that has all of them, with podman:
 *
 *   podman run -d --rm --name hs-smb-test -p 127.0.0.1:1445:445 \
 *     --tmpfs /shares/tiny:size=20m,mode=1777 \
 *     -e ACCOUNT_taylor='local test pass 1' -e UID_taylor=1000 \
 *     -e ACCOUNT_viewer='viewer pass 1' -e UID_viewer=1001 \
 *     -e SAMBA_VOLUME_CONFIG_backups='[Backups]; path=/shares/backups; valid users = taylor viewer; read list = viewer; write list = taylor; guest ok = no; read only = no; browseable = yes' \
 *     -e SAMBA_VOLUME_CONFIG_family='[Family Backups]; path=/shares/family; valid users = taylor; guest ok = no; read only = no; browseable = yes' \
 *     -e SAMBA_VOLUME_CONFIG_tiny='[Tiny]; path=/shares/tiny; valid users = taylor; guest ok = no; read only = no; browseable = yes' \
 *     ghcr.io/servercontainers/samba:latest
 *   podman exec hs-smb-test sh -c 'mkdir -p /shares/backups /shares/family && chown taylor /shares/backups /shares/family'
 */

const env = process.env;
const ready = !!(env.HS_SMB_TEST_HOST && env.HS_SMB_TEST_SHARE && env.HS_SMB_TEST_USER && env.HS_SMB_TEST_PASS);
const [host, portText] = (env.HS_SMB_TEST_HOST ?? '').split(':');
const run = `it-${Date.now().toString(36)}`;

function dest(overrides: Partial<ShareDestination> = {}): ShareDestination {
  return {
    kind: 'smb',
    host,
    ...(portText ? { port: Number(portText) } : {}),
    share: env.HS_SMB_TEST_SHARE ?? '',
    folder: `home-screens-test/${run}`,
    username: env.HS_SMB_TEST_USER ?? '',
    password: env.HS_SMB_TEST_PASS ?? '',
    ...overrides,
  };
}

let file = '';
beforeAll(async () => {
  const dir = path.join(process.cwd(), 'data', 'smb-integration');
  await fs.mkdir(dir, { recursive: true });
  file = path.join(dir, 'copy.json');
  await fs.writeFile(file, JSON.stringify({ _type: 'home-screens-backup', filler: 'x'.repeat(3 * 1024 * 1024) }));
});

describe.skipIf(!ready)('smb-upload against a real share', () => {
  it('checks the folder, sends a copy, sends it again under the same name, and removes it', async () => {
    expect(await testDestination(dest())).toEqual({ ok: true });
    expect(await uploadFile(dest(), file, 'home-screens-auto-backup-2026-11-19-0300.json')).toEqual({ ok: true });
    // The same name again: the rename has to replace the first one.
    expect(await uploadFile(dest(), file, 'home-screens-auto-backup-2026-11-19-0300.json')).toEqual({ ok: true });
    expect(await deleteFile(dest(), 'home-screens-auto-backup-2026-11-19-0300.json')).toEqual({ ok: true });
    expect(await deleteFile(dest(), 'home-screens-auto-backup-2026-11-19-0300.json')).toEqual({ ok: true });
  });

  it('works with spaces and accents in the folder', async () => {
    const accented = dest({ folder: `home-screens-test/${run}/Sauvegardes été` });
    expect(await uploadFile(accented, file, 'copy.json')).toEqual({ ok: true });
    expect(await deleteFile(accented, 'copy.json')).toEqual({ ok: true });
  });

  it('says the name or password was not accepted, for a wrong password and for a name it does not know', async () => {
    expect(await testDestination(dest({ password: 'wrong' }))).toMatchObject({ ok: false, code: 'sign-in' });
    expect(await testDestination(dest({ username: `nobody-${run}` }))).toMatchObject({ ok: false, code: 'sign-in' });
  });

  it('offers the real shares when the name is wrong', async () => {
    const outcome = await testDestination(dest({ share: `${env.HS_SMB_TEST_SHARE}-nope` }));
    expect(outcome).toMatchObject({ ok: false, code: 'share-not-found' });
    expect('shares' in outcome && outcome.shares).toContain(env.HS_SMB_TEST_SHARE);
  });

  it.skipIf(!env.HS_SMB_TEST_VIEWER)('says a name that may only look cannot save there', async () => {
    const viewer = { username: env.HS_SMB_TEST_VIEWER ?? '', password: env.HS_SMB_TEST_VIEWER_PASS ?? '' };
    expect(await testDestination(dest(viewer))).toMatchObject({ ok: false, code: 'no-write' });
    expect(await uploadFile(dest(viewer), file, 'copy.json')).toMatchObject({ ok: false, code: 'no-write' });
  });

  it.skipIf(!env.HS_SMB_TEST_FULL_SHARE)('says a full share is out of room and leaves nothing behind', async () => {
    const big = path.join(path.dirname(file), 'big.bin');
    await fs.writeFile(big, Buffer.alloc(30 * 1024 * 1024, 1));
    const full = dest({ share: env.HS_SMB_TEST_FULL_SHARE ?? '', folder: run });
    expect(await uploadFile(full, big, 'big.bin')).toMatchObject({ ok: false, code: 'no-room' });
    // The half-sent copy was removed, so a small one fits again.
    expect(await uploadFile(full, file, 'small.json')).toEqual({ ok: true });
    expect(await deleteFile(full, 'small.json')).toEqual({ ok: true });
  });
});
