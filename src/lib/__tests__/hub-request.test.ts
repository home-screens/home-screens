import { describe, expect, it } from 'vitest';
import { HubUnreachableError, readJson, sendJsonWrite, sendRevisionedSave } from '../hub-request';
import { RefusalError } from '../refusal';

/** An answer whose headers arrived and whose body then fails with `reason`. */
function brokenBody(reason: unknown): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"notes":['));
      controller.error(reason);
    },
  });
  return new Response(body, { status: 200 });
}

describe('readJson', () => {
  it('reads JSON, and an answer that is not JSON as nothing', async () => {
    expect(await readJson(new Response('{"notes":[]}'))).toEqual({ notes: [] });
    expect(await readJson(new Response(''))).toBeNull();
    expect(await readJson(new Response('<html>Bad gateway</html>', { status: 502 }))).toBeNull();
  });

  // A deadline that cut the body off read as an empty answer, and the phone
  // cleared its day notes and called the write saved.
  it('rejects an answer that never fully arrived', async () => {
    await expect(readJson(brokenBody(new HubUnreachableError()))).rejects.toBeInstanceOf(HubUnreachableError);
    await expect(readJson(brokenBody(new TypeError('network error')))).rejects.toBeInstanceOf(HubUnreachableError);
  });

  // Chromium ends a body the deadline cut off with a plain AbortError, not
  // the deadline's own error; it showed as "The user aborted a request."
  it('reads a body ended by an abort as the hub out of reach', async () => {
    await expect(readJson(brokenBody(new DOMException('The user aborted a request.', 'AbortError'))))
      .rejects.toBeInstanceOf(HubUnreachableError);
  });
});

describe('sendJsonWrite', () => {
  it('rejects a write whose answer was cut off rather than handing back nothing', async () => {
    const fetcher = async () => brokenBody(new HubUnreachableError());
    await expect(sendJsonWrite(fetcher, { url: '/api/day-notes', method: 'POST', body: {} }, 'Not saved'))
      .rejects.toBeInstanceOf(HubUnreachableError);
  });
});

describe('sendRevisionedSave', () => {
  interface Copy { list: string[]; revision: string }
  const asCopy = (json: unknown): Copy | null => {
    const d = json as Partial<Copy> | null;
    return d && Array.isArray(d.list) && typeof d.revision === 'string' ? { list: d.list, revision: d.revision } : null;
  };
  const answering = (status: number, body: unknown) => {
    const sent: RequestInit[] = [];
    const fetcher = async (_url: string, init?: RequestInit) => {
      sent.push(init ?? {});
      return new Response(JSON.stringify(body), { status });
    };
    return { fetcher, sent };
  };
  const request = { url: '/api/things', method: 'PUT' as const, body: { list: ['a'], revision: 'r1' } };

  it('sends the list as JSON and hands back the saved copy', async () => {
    const { fetcher, sent } = answering(200, { list: ['a'], revision: 'r2' });
    expect(await sendRevisionedSave(fetcher, request, asCopy, 'Not saved')).toEqual({ kind: 'saved', snapshot: { list: ['a'], revision: 'r2' } });
    expect(sent[0].method).toBe('PUT');
    expect(JSON.parse(sent[0].body as string)).toEqual({ list: ['a'], revision: 'r1' });
  });

  it('reports a 409 about the revision as a conflict carrying the hub\'s copy', async () => {
    const { fetcher } = answering(409, { error: 'Somebody else changed it', code: 'things.revision', reason: 'revision', list: ['b'], revision: 'r9' });
    expect(await sendRevisionedSave(fetcher, request, asCopy, 'Not saved')).toEqual({ kind: 'conflict', snapshot: { list: ['b'], revision: 'r9' } });
  });

  it('reports a conflict that came back without the copy as one with nothing to adopt', async () => {
    const { fetcher } = answering(409, { reason: 'revision' });
    expect(await sendRevisionedSave(fetcher, request, asCopy, 'Not saved')).toEqual({ kind: 'conflict', snapshot: null });
  });

  // The same routes answer 409 for a person who left the family; adopting the
  // hub's copy for that threw the change away to explain a race that never happened.
  it('rejects any other 409 as the refusal it is', async () => {
    const { fetcher } = answering(409, { error: 'Someone was removed', code: 'family.memberRemoved', reason: 'member', list: ['b'], revision: 'r9' });
    const failure = await sendRevisionedSave(fetcher, request, asCopy, 'Not saved').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(RefusalError);
    expect((failure as RefusalError).code).toBe('family.memberRemoved');
  });

  it('rejects an OK answer that is not a copy rather than calling it saved', async () => {
    const { fetcher } = answering(200, { ok: true });
    await expect(sendRevisionedSave(fetcher, request, asCopy, 'Not saved')).rejects.toThrow('Not saved');
  });

  it('rejects an answer that was cut off as the hub out of reach', async () => {
    const fetcher = async () => brokenBody(new HubUnreachableError());
    await expect(sendRevisionedSave(fetcher, request, asCopy, 'Not saved')).rejects.toBeInstanceOf(HubUnreachableError);
  });

  it('lets a client with its own error class build the refusal', async () => {
    class Mine extends Error {}
    const { fetcher } = answering(500, { error: 'Broken' });
    await expect(sendRevisionedSave(fetcher, request, asCopy, (json) => new Mine((json as { error: string }).error))).rejects.toBeInstanceOf(Mine);
  });
});
