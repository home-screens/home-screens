import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';
import en from '@/translations/en-US/editor.json';
import {
  clearAuthCache,
  requireDisplayAuth,
  requireSession,
  setIpAllowlistConfig,
  setPassword,
} from '@/lib/auth';
import { resolveClientIp } from '@/lib/client-ip';
import { drainCommands } from '@/lib/display-commands';
import { displayCommandExample } from '@/components/editor/settings/SecuritySection/DisplayTokenPanel';
import { GET as displayCommand } from '@/app/api/display/[action]/route';
import type { DisplayNode } from '@/types/config';

/**
 * The Security page makes three factual claims about credentials and
 * addresses. Each one is checked here against the code that implements it,
 * because a sentence that is merely plausible is what sends a household off
 * checking their network settings for a fault that was never there.
 */

const copy = en.settings.securityPage;

const origCwd = process.cwd();
let tmpCwd: string;

beforeEach(async () => {
  // The queues are module-level and shared across this file's tests.
  drainCommands(undefined);
  drainCommands('main');
  tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-security-copy-'));
  await fs.mkdir(path.join(tmpCwd, 'data'), { recursive: true });
  process.chdir(tmpCwd);
  clearAuthCache();
});

afterEach(async () => {
  process.chdir(origCwd);
  clearAuthCache();
  await fs.rm(tmpCwd, { recursive: true, force: true });
});

describe('the allowed-networks toggle', () => {
  it('lets displays in without asking, never skips the password, and says so', async () => {
    await setPassword('testpassword123');
    await setIpAllowlistConfig({
      allowlist: ['192.168.1.0/24'],
      bypassAuth: true,
      restrictAccess: false,
    });
    const request = new Request('http://localhost/api/config');

    // A wall display on the trusted network gets in with no credentials...
    await expect(requireDisplayAuth(request, '192.168.1.50')).resolves.toBeUndefined();
    // ...and the editor and the phone remote still ask for the password.
    await expect(requireSession(request)).rejects.toBeInstanceOf(Response);

    const { label, help } = copy.ipAllowlist.bypassAuth;
    // Displays no longer use the key, so the label must not promise to
    // waive it; what it waives is being asked.
    expect(label).toMatch(/without asking/i);
    expect(label).not.toMatch(/key|password/i);
    expect(help).toMatch(/password/i);
  });
});

/** Follow an advertised link the way a phone bookmark would. */
async function followBookmark(example: string) {
  // No password set in this sandbox, so the token is not checked here. What is
  // being followed is the path, the action and the display the link names.
  const url = new URL(example);
  const res = await displayCommand(
    new NextRequest(example),
    { params: Promise.resolve({ action: url.pathname.split('/').pop()! }) },
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, command: 'sleep' });
}

describe('the phone bookmark hint', () => {
  it('reaches a display that is registered in the displays list', async () => {
    const displays = [
      { id: 'main', name: 'Kitchen', screens: [] },
      { id: 'playroom', name: 'Playroom', screens: [] },
    ] as DisplayNode[];
    // That display polls its own queue: /display passes findMainDisplay's id
    // to the rotator, which appends it to every poll.
    drainCommands('main');

    await followBookmark(displayCommandExample('http://home-screens.local:3000', 'the-key', displays));

    expect(drainCommands('main').map((c) => c.type)).toEqual(['sleep']);
  });

  it('reaches a single-display install that has no displays list', async () => {
    // Nothing registered, so the display polls without an id and drains the
    // legacy queue. A link with no display named is the one that reaches it.
    await followBookmark(displayCommandExample('http://home-screens.local:3000', 'the-key', undefined));

    expect(drainCommands(undefined).map((c) => c.type)).toEqual(['sleep']);
  });

  it('spells out the address it advertises', () => {
    const displays = [{ id: 'kitchen', name: 'Kitchen', screens: [] }] as DisplayNode[];
    expect(displayCommandExample('http://home-screens.local:3000', 'the-key', displays))
      .toBe('http://home-screens.local:3000/api/display/sleep?display=kitchen&token=the-key');
    expect(displayCommandExample('http://home-screens.local:3000', 'the-key', undefined))
      .toBe('http://home-screens.local:3000/api/display/sleep?token=the-key');
  });
});

describe('the trusted-networks warning', () => {
  it('does not claim a forwarded header decides who gets in', () => {
    // Default install: no trusted proxies, so the connection wins and a
    // spoofed X-Forwarded-For changes nothing.
    expect(resolveClientIp('203.0.113.7', '192.168.1.50', [])).toBe('203.0.113.7');

    const warning = Object.values(copy.ipAllowlist.trustedNetworksWarning).join(' ');
    expect(warning.toLowerCase()).not.toContain('x-forwarded-for');
    expect(warning).not.toMatch(/fake that header|spoof/i);
    // It points at the one thing on the page that can be checked instead.
    expect(warning).toMatch(/Your IP/);
  });
});
