import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteSession, sameId, tempId, type RefreshOutcome } from '../write-session';

interface Row { id: string; text: string; done?: boolean }
interface Req { kind: 'add' | 'tick' | 'remove'; id?: string; text?: string }

/** A hand-held answer: the test decides when the hub replies. */
function deferred<V>() {
  let resolve!: (v: V) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<V>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class Expired extends Error {}

function harness(opts: { holdMs?: number; tolerates?: (e: unknown) => boolean } = {}) {
  const shown: Row[][] = [];
  const loads: RefreshOutcome[] = [];
  const refused: unknown[] = [];
  let saved = 0;
  const load = vi.fn<() => Promise<Row[] | null>>();
  const send = vi.fn<(req: Req) => Promise<{ data: Row[]; created?: { id: string } }>>();
  const session = new WriteSession<Row[], Req, { id: string }>({
    load,
    send,
    holdMs: opts.holdMs ?? 5_000,
    tolerates: opts.tolerates,
    expired: (e) => e instanceof Expired,
    onChange: (rows) => shown.push(rows),
    onLoad: (outcome) => loads.push(outcome),
    onRefused: (e) => refused.push(e),
    onSaved: () => { saved += 1; },
  }, []);
  return { session, shown, loads, refused, load, send, last: () => shown.at(-1), savedCount: () => saved };
}

const tick = (id: string) => (rows: Row[], r: (id: string) => string) =>
  rows.map((row) => (sameId(row.id, id, r) ? { ...row, done: true } : row));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('WriteSession', () => {
  it('takes a load and shows it', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    expect(h.session.loaded).toBe(false);
    expect(await h.session.refresh()).toBe('adopted');
    expect(h.session.loaded).toBe(true);
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk' }]);
    expect(h.loads).toEqual(['adopted']);
  });

  it('reports a load the hub refused or could not answer, and keeps what is shown', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    h.load.mockResolvedValueOnce(null);
    expect(await h.session.refresh()).toBe('failed');
    h.load.mockRejectedValueOnce(new Error('offline'));
    expect(await h.session.refresh()).toBe('failed');
    h.load.mockRejectedValueOnce(new Expired());
    expect(await h.session.refresh()).toBe('dropped');
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk' }]);
    expect(h.loads).toEqual(['adopted', 'failed', 'failed', 'dropped']);
  });

  it('sends writes one at a time, in the order they were asked for', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    const first = deferred<{ data: Row[] }>();
    const second = deferred<{ data: Row[] }>();
    h.send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const p1 = h.session.write(tick('a'), { kind: 'tick', id: 'a' });
    const p2 = h.session.write((rows) => rows.filter((r) => r.id !== 'a'), { kind: 'remove', id: 'a' });
    await vi.advanceTimersByTimeAsync(0);
    // Both show at once; only the first has gone out.
    expect(h.last()).toEqual([]);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.session.idle).toBe(false);

    first.resolve({ data: [{ id: 'a', text: 'Milk', done: true }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls.map(([req]) => req.kind)).toEqual(['tick', 'remove']);
    // The first answer is shown with the second change still on top.
    expect(h.last()).toEqual([]);

    second.resolve({ data: [] });
    expect(await p1).toEqual([{ id: 'a', text: 'Milk', done: true }]);
    expect(await p2).toEqual([]);
    expect(h.session.idle).toBe(true);
    expect(h.savedCount()).toBe(2);
  });

  it('replays a pending change over the newer answer it was not part of', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    const add = deferred<{ data: Row[]; created?: { id: string } }>();
    h.send.mockReturnValueOnce(add.promise);
    void h.session.write((rows) => [...rows, { id: 'b', text: 'Eggs' }], { kind: 'add', text: 'Eggs' });
    const tickAnswer = deferred<{ data: Row[] }>();
    h.send.mockReturnValueOnce(tickAnswer.promise);
    void h.session.write(tick('a'), { kind: 'tick', id: 'a' });
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }, { id: 'b', text: 'Eggs' }]);

    // The add's answer does not carry the tick, which has not been sent; the tick stays on top.
    add.resolve({ data: [{ id: 'a', text: 'Milk' }, { id: 'b', text: 'Eggs' }], created: { id: 'b' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }, { id: 'b', text: 'Eggs' }]);
    tickAnswer.resolve({ data: [{ id: 'a', text: 'Milk', done: true }, { id: 'b', text: 'Eggs' }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }, { id: 'b', text: 'Eggs' }]);
  });

  it('resolves a temp id when the request is sent, not when it was queued', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([]);
    await h.session.refresh();
    const temp = tempId();
    expect(temp.startsWith('tmp-')).toBe(true);
    const add = deferred<{ data: Row[]; created?: { id: string } }>();
    h.send.mockReturnValueOnce(add.promise);
    void h.session.write(
      (rows) => [...rows, { id: temp, text: 'Eggs' }],
      { kind: 'add', text: 'Eggs' },
      (created) => { if (created) h.session.mapId(temp, created.id); },
    );
    // Ticked before the hub has named it: the tick is queued and built later.
    h.send.mockResolvedValueOnce({ data: [{ id: 'srv-1', text: 'Eggs', done: true }] });
    const ticked = h.session.write(tick(temp), (r) => ({ kind: 'tick', id: r(temp) }));
    expect(h.last()).toEqual([{ id: temp, text: 'Eggs', done: true }]);
    expect(h.session.resolveId(temp)).toBe(temp);

    add.resolve({ data: [{ id: 'srv-1', text: 'Eggs' }], created: { id: 'srv-1' } });
    await ticked;
    expect(h.session.resolveId(temp)).toBe('srv-1');
    expect(h.send.mock.calls[1][0]).toEqual({ kind: 'tick', id: 'srv-1' });
    expect(h.last()).toEqual([{ id: 'srv-1', text: 'Eggs', done: true }]);
    // The tick's change was replayed over the add's answer under the hub's id in between.
    expect(h.shown.some((rows) => rows[0]?.id === 'srv-1' && rows[0]?.done === true)).toBe(true);
  });

  it('holds polls off while a write is out and for one period after it', async () => {
    const h = harness({ holdMs: 5_000 });
    h.load.mockResolvedValue([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    const answer = deferred<{ data: Row[] }>();
    h.send.mockReturnValueOnce(answer.promise);
    void h.session.write(tick('a'), { kind: 'tick', id: 'a' });

    // Not even sent while the write is out.
    expect(await h.session.refresh()).toBe('dropped');
    expect(h.load).toHaveBeenCalledTimes(1);

    answer.resolve({ data: [{ id: 'a', text: 'Milk', done: true }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.session.holdPollsUntil).toBe(Date.now() + 5_000);
    expect(await h.session.refresh()).toBe('dropped');
    expect(h.load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk', done: true }]);
    expect(await h.session.refresh()).toBe('adopted');
    expect(h.load).toHaveBeenCalledTimes(2);
  });

  it('drops a poll whose answer was on its way while a write landed', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    const stale = deferred<Row[] | null>();
    h.load.mockReturnValueOnce(stale.promise);
    const poll = h.session.refresh();
    h.send.mockResolvedValueOnce({ data: [{ id: 'a', text: 'Milk', done: true }] });
    await h.session.write(tick('a'), { kind: 'tick', id: 'a' });
    stale.resolve([{ id: 'a', text: 'Milk' }]);
    expect(await poll).toBe('dropped');
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }]);
  });

  it('drops a forced read too when a write landed meanwhile: the write answered newer', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    const stale = deferred<Row[] | null>();
    h.load.mockReturnValueOnce(stale.promise);
    const retry = h.session.refresh(true);
    h.send.mockResolvedValueOnce({ data: [{ id: 'a', text: 'Milk', done: true }] });
    await h.session.write(tick('a'), { kind: 'tick', id: 'a' });
    stale.resolve([{ id: 'a', text: 'Milk' }]);
    expect(await retry).toBe('dropped');
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }]);
  });

  it('sends a forced read while a write is out and takes its answer under the pending change', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    const answer = deferred<{ data: Row[] }>();
    h.send.mockReturnValueOnce(answer.promise);
    void h.session.write(tick('a'), { kind: 'tick', id: 'a' });
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }, { id: 'b', text: 'Eggs' }]);
    expect(await h.session.refresh(true)).toBe('adopted');
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }, { id: 'b', text: 'Eggs' }]);
    answer.resolve({ data: [{ id: 'a', text: 'Milk', done: true }, { id: 'b', text: 'Eggs' }] });
  });

  it('drops a refused change, reports it, and reads the hub again once nothing is out', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    h.send.mockRejectedValueOnce(new Error('The list is full.'));
    const second = deferred<{ data: Row[] }>();
    h.send.mockReturnValueOnce(second.promise);
    const truth = deferred<Row[] | null>();
    h.load.mockReturnValueOnce(truth.promise);

    const refusedWrite = h.session.write((rows) => [...rows, { id: 'b', text: 'Eggs' }], { kind: 'add', text: 'Eggs' });
    const queued = h.session.write(tick('a'), { kind: 'tick', id: 'a' });
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }, { id: 'b', text: 'Eggs' }]);
    expect(await refusedWrite).toBeNull();
    expect(h.refused.map((e) => (e as Error).message)).toEqual(['The list is full.']);
    // The refused add is gone from what is shown; the queued tick stays.
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }]);
    // No read yet: the tick is still out.
    expect(h.load).toHaveBeenCalledTimes(1);

    second.resolve({ data: [{ id: 'a', text: 'Milk', done: true }] });
    await queued;
    await vi.advanceTimersByTimeAsync(0);
    expect(h.load).toHaveBeenCalledTimes(2);
    truth.resolve([{ id: 'a', text: 'Milk', done: true }, { id: 'c', text: 'Bread' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }, { id: 'c', text: 'Bread' }]);
    expect(h.loads).toEqual(['adopted', 'adopted']);
    expect(h.savedCount()).toBe(1);
  });

  it('drops a write quietly when the session expired', async () => {
    const h = harness();
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    h.send.mockRejectedValueOnce(new Expired());
    expect(await h.session.write(tick('a'), { kind: 'tick', id: 'a' })).toBeNull();
    expect(h.refused).toEqual([]);
    expect(h.load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.load).toHaveBeenCalledTimes(1);
  });

  it('refuses before sending a change the rules refuse on what is shown now', async () => {
    const rule = new Error('A day holds 3 notes');
    const h = harness({ tolerates: (e) => e === rule });
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    expect(await h.session.write(() => { throw rule; }, { kind: 'add' })).toBeNull();
    expect(h.refused).toEqual([rule]);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.session.idle).toBe(true);
  });

  it('skips a pending change the newer hub copy no longer allows, and throws any other', async () => {
    const gone = new Error('No such note');
    const h = harness({ tolerates: (e) => e === gone });
    h.load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }]);
    await h.session.refresh();
    const answer = deferred<{ data: Row[] }>();
    h.send.mockReturnValueOnce(answer.promise);
    void h.session.write((rows) => {
      if (!rows.some((r) => r.id === 'a')) throw gone;
      return rows.map((r) => (r.id === 'a' ? { ...r, done: true } : r));
    }, { kind: 'tick', id: 'a' });
    expect(h.last()).toEqual([{ id: 'a', text: 'Milk', done: true }]);
    // Another phone deleted the note; the pending tick is skipped, not thrown.
    h.load.mockResolvedValueOnce([]);
    expect(await h.session.refresh(true)).toBe('adopted');
    expect(h.last()).toEqual([]);
    answer.resolve({ data: [] });

    const bug = new TypeError('oops');
    h.send.mockReturnValueOnce(deferred<{ data: Row[] }>().promise);
    expect(() => h.session.write(() => { throw bug; }, { kind: 'add' })).toThrow(bug);
  });

  it('writes before the first load against what is shown, and the answer counts as loaded', async () => {
    const h = harness();
    h.send.mockResolvedValueOnce({ data: [{ id: 'srv-1', text: 'Eggs' }], created: { id: 'srv-1' } });
    expect(await h.session.write((rows) => [...rows, { id: 'tmp', text: 'Eggs' }], { kind: 'add', text: 'Eggs' })).toEqual([{ id: 'srv-1', text: 'Eggs' }]);
    expect(h.session.loaded).toBe(true);
    expect(h.session.current).toEqual([{ id: 'srv-1', text: 'Eggs' }]);
  });
});
