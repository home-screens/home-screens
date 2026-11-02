import { describe, expect, it } from 'vitest';
import { HubUnreachableError, readJson, sendJsonWrite } from '../hub-request';

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
