import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

import { GET, PUT } from '../route';
import { familyRevision, readFamilyData } from '@/lib/family-data';

const now = '2026-09-09T12:00:00.000Z';
const member = (id: string, name = id) => ({ id, name, color: '#60a5fa', createdAt: now, updatedAt: now });
let root: string;
const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data, null, 2));
const request = (body: unknown) => new NextRequest('http://localhost/api/family', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-family-route-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await put('family.json', { members: [member('a', 'Alex'), member('b', 'Bo')], migrated: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('/api/family', () => {
  it('serves the roster with the revision a write has to quote back', async () => {
    const response = await GET(new NextRequest('http://localhost/api/family'), undefined);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.members.map((entry: { name: string }) => entry.name)).toEqual(['Alex', 'Bo']);
    expect(body.revision).toBe(familyRevision(await readFamilyData()));
  });

  it('saves a checked edit and answers with the roster and its new revision', async () => {
    const { revision } = await (await GET(new NextRequest('http://localhost/api/family'), undefined)).json();
    const response = await PUT(request({ members: [member('a', 'Alexandra'), member('b', 'Bo')], revision, removedIds: [] }), undefined);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.members[0].name).toBe('Alexandra');
    expect(body.revision).not.toBe(revision);
    expect((await readFamilyData()).members[0].name).toBe('Alexandra');
  });

  // FamilyManager reads `members` and `revision` straight off the 409 body to
  // republish the roster; a bare `{ error }` would leave it showing stale data.
  it('returns the current roster alongside a stale-revision conflict', async () => {
    const response = await PUT(request({ members: [member('a', 'Alex')], revision: 'stale', removedIds: ['b'] }), undefined);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('Refresh and apply your changes again');
    expect(body.members.map((entry: { id: string }) => entry.id)).toEqual(['a', 'b']);
    expect(body.revision).toBe(familyRevision(await readFamilyData()));
    expect((await readFamilyData()).members).toHaveLength(2);
  });

  // The route has no try/catch of its own: these assert that errorResponse
  // still surfaces the actionable text instead of the generic fallback. The
  // revision is checked first, so anything testing a later guard has to send
  // a valid one.
  const cases: [label: string, patch: Record<string, unknown>, message: string][] = [
    ['a missing revision', {}, 'A revision is required'],
    ['an empty revision', { revision: '' }, 'A revision is required'],
    ['removedIds that are not a list', { revision: 'VALID', removedIds: 'b' }, 'Include the updated member list'],
    ['a member that is not a record', { revision: 'VALID', members: ['nope'] }, 'unique identity, name and color'],
    ['a malformed color', { revision: 'VALID', members: [{ ...member('a', 'Alex'), color: 'blue' }] }, 'unique identity, name and color'],
    ['an unconfirmed removal', { revision: 'VALID', removedIds: [] }, 'Confirm exactly which people should be removed'],
  ];
  it.each(cases)('refuses %s with its own message', async (_label, patch, message) => {
    const { revision } = await (await GET(new NextRequest('http://localhost/api/family'), undefined)).json();
    const body: Record<string, unknown> = { members: [member('a', 'Alex')], removedIds: ['b'], ...patch };
    if (body.revision === 'VALID') body.revision = revision;
    const response = await PUT(request(body), undefined);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(message);
    expect((await readFamilyData()).members).toHaveLength(2);
  });

  it('reports a pending recovery as a retryable service state, not a generic failure', async () => {
    await put('family-transaction.json', { version: 1, id: 'x', kind: 'broken', decision: 'commit', changes: [], fingerprints: {}, checksum: 'wrong' });
    const response = await GET(new NextRequest('http://localhost/api/family'), undefined);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('Preserve it for recovery');
  });

  it('refuses a body that is not an object', async () => {
    const response = await PUT(request('everyone'), undefined);
    expect(response.status).toBe(400);
  });
});
