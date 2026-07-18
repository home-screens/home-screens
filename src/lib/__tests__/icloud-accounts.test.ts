import { describe, it, expect } from 'vitest';
import {
  listICloudAccounts,
  listICloudAccountInfo,
  getICloudAccount,
  addICloudAccount,
  removeICloudAccount,
} from '@/lib/icloud-accounts';

describe('icloud-accounts store', () => {
  it('starts empty', async () => {
    expect(await listICloudAccounts()).toEqual([]);
  });

  it('adds an account and lists it', async () => {
    const info = await addICloudAccount('a@icloud.com', 'aaaa-bbbb-cccc-dddd');
    expect(info.appleId).toBe('a@icloud.com');
    expect(info.id).toBeTruthy();

    const accounts = await listICloudAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].appPassword).toBe('aaaa-bbbb-cccc-dddd');
  });

  it('listICloudAccountInfo never exposes the app password', async () => {
    const infos = await listICloudAccountInfo();
    expect(infos).toHaveLength(1);
    for (const info of infos) {
      expect(info).not.toHaveProperty('appPassword');
      expect(Object.keys(info).sort()).toEqual(['appleId', 'id']);
    }
  });

  it('re-adding the same Apple ID replaces credentials and keeps the id', async () => {
    const before = await getICloudAccount((await listICloudAccounts())[0].id);
    const info = await addICloudAccount('a@icloud.com', 'eeee-ffff-gggg-hhhh');

    expect(info.id).toBe(before!.id);
    const accounts = await listICloudAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].appPassword).toBe('eeee-ffff-gggg-hhhh');
  });

  it('supports multiple accounts', async () => {
    await addICloudAccount('b@icloud.com', 'iiii-jjjj-kkkk-llll');
    const accounts = await listICloudAccounts();
    expect(accounts.map((a) => a.appleId).sort()).toEqual(['a@icloud.com', 'b@icloud.com']);
  });

  it('getICloudAccount returns null for unknown ids', async () => {
    expect(await getICloudAccount('nope')).toBeNull();
  });

  it('removes an account', async () => {
    const target = (await listICloudAccounts()).find((a) => a.appleId === 'a@icloud.com')!;
    await removeICloudAccount(target.id);
    const accounts = await listICloudAccounts();
    expect(accounts.map((a) => a.appleId)).toEqual(['b@icloud.com']);
  });

  it('removing an unknown id is a no-op', async () => {
    await removeICloudAccount('nope');
    expect(await listICloudAccounts()).toHaveLength(1);
  });
});
