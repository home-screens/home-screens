import { describe, expect, it, vi } from 'vitest';
import { checkSheetLink, loadTimetables, saveTimetables } from '../timetable-client';
import type { TimetableData } from '@/types/timetables';

const DATA: TimetableData = { schools: [], subjects: [], timetables: [] };

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('loadTimetables', () => {
  it('hands back the document and the revision it has to be saved against', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(200, { data: DATA, revision: 'r1' }));
    await expect(loadTimetables(fetcher, 'fallback')).resolves.toEqual({ data: DATA, revision: 'r1' });
    expect(fetcher).toHaveBeenCalledWith('/api/timetables');
  });

  it('rejects with the reason the route gave rather than the fallback', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(500, { error: 'The saved timetables could not be read.' }));
    await expect(loadTimetables(fetcher, 'fallback')).rejects.toThrow('The saved timetables could not be read.');
  });

  it('rejects a 200 that is not a document, rather than believing it', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(200, { data: { schools: 'nope' }, revision: 'r1' }));
    await expect(loadTimetables(fetcher, 'fallback')).rejects.toThrow('fallback');
  });
});

describe('saveTimetables', () => {
  it('quotes the revision it started from', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(200, { data: DATA, revision: 'r2' }));
    const result = await saveTimetables(fetcher, { data: DATA, revision: 'r1' }, 'fallback');

    expect(result).toEqual({ kind: 'saved', snapshot: { data: DATA, revision: 'r2' } });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/timetables');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ data: DATA, revision: 'r1' });
  });

  it('reports a 409 as a conflict carrying what is saved now', async () => {
    const saved = { schools: [], subjects: [], timetables: [] };
    const fetcher = vi.fn().mockResolvedValue(reply(409, { code: 'timetables.revision', error: 'Somebody else changed them', data: saved, revision: 'r9' }));

    await expect(saveTimetables(fetcher, { data: DATA, revision: 'r1' }, 'fallback')).resolves.toEqual({
      kind: 'conflict',
      snapshot: { data: saved, revision: 'r9' },
    });
  });

  it('rejects a refusal so a debounced saver cannot report it as success', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(400, { error: 'Give the break at 09:25 a name' }));
    await expect(saveTimetables(fetcher, { data: DATA, revision: 'r1' }, 'fallback')).rejects.toThrow(
      'Give the break at 09:25 a name',
    );
  });

  // A 409 about somebody who left the family is not a conflict the window may
  // resolve by adopting the saved copy; it is a refusal with its own code.
  it('rejects a 409 that is not about the revision, carrying its code', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(409, { code: 'timetables.member', error: 'A timetable belongs to somebody who is no longer in the family.' }));
    await expect(saveTimetables(fetcher, { data: DATA, revision: 'r1' }, 'fallback')).rejects.toMatchObject({ code: 'timetables.member', status: 409 });
  });
});

describe('checkSheetLink', () => {
  it('hands back a sheet that listed no tabs as an ordinary answer, not a failure', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(200, { ok: true, tabsListed: false, tabs: [] }));
    await expect(checkSheetLink(fetcher, 'https://example.test/x', 'fallback')).resolves.toEqual({
      ok: true,
      tabsListed: false,
      tabs: [],
    });
  });

  it('hands back a message key rather than throwing on a sheet it could not read', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(200, { ok: false, messageKey: 'sheetNotShared' }));
    await expect(checkSheetLink(fetcher, 'https://example.test/x', 'fallback')).resolves.toEqual({
      ok: false,
      messageKey: 'sheetNotShared',
    });
  });

  it('rejects when the route itself refused', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(400, { error: 'Missing required field: url' }));
    await expect(checkSheetLink(fetcher, '', 'fallback')).rejects.toThrow('Missing required field: url');
  });
});
