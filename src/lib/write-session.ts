/**
 * One surface's optimistic writes against a hub store that answers every
 * write with its whole copy (to-do lists, the notes board, the calendar's
 * day notes). Beside `ChoreSession` (whole-list saves quoting a revision)
 * and `MealSession` (edits re-applied to the hub's newer copy).
 *
 * What it keeps, so a phone tab or an editor window keeps only its request
 * builders, its domain mutations and its presentation:
 *
 * - The hub's last copy, with every pending change replayed on top. A change
 *   shows at once and is replayed over each newer answer until its own
 *   request lands, so a tap on an item whose add has not come back yet is
 *   neither lost nor flashed away by the add's answer.
 * - Writes go out one at a time in the order they were asked for, so a tick
 *   and an untick a moment apart land in that order.
 * - Temp ids: a new row shows under a temp id until the hub names it; every
 *   request resolves its ids when it is sent, not when it was queued.
 * - Polls are held off for one period after a write and while one is in
 *   flight (`holdPollsUntil`, `idle`), and an answer that was on its way
 *   while a write landed is dropped, so a read that raced the write cannot
 *   flash the old copy back.
 * - A refused write drops its change, reports the refusal, and the hub's
 *   copy is fetched again once nothing else is out, so whatever the refusal
 *   reflects (another phone deleted the note) shows without waiting for the
 *   next poll.
 */

const TEMP_PREFIX = 'tmp-';

/** The hub's id for a row made here once the hub has named it, any other id as it is. */
export type ResolveId = (id: string) => string;

/** A local change replayed over the hub's copy until its request lands. */
export type Mutation<T> = (data: T, resolveId: ResolveId) => T;

/** A request, or one built when the write's turn comes so its ids are resolved then. */
export type RequestOf<R> = R | ((resolveId: ResolveId) => R);

export type RefreshOutcome =
  /** The hub's copy was taken. */
  | 'adopted'
  /** The answer was not used: a write was out or had just landed, or sign-in is on its way. */
  | 'dropped'
  /** The hub refused or answered with something unusable; what is shown stays. */
  | 'failed';

export interface WriteSessionOptions<T, R, C> {
  /** The hub's copy, or `null` when the answer is unusable (a failed load, never an empty copy). */
  load: () => Promise<T | null>;
  /** Send one request; resolves with the hub's copy after it and whatever the route says it made, rejects with the refusal. */
  send: (request: R) => Promise<{ data: T; created?: C }>;
  /** How long polls are held off after a write: one poll period. */
  holdMs: number;
  /**
   * Whether a pending change the newer hub copy no longer allows (another
   * phone deleted the note) is skipped rather than thrown when replayed. Its
   * own request answers for it. The same test refuses a change before it is
   * sent when the rules refuse it on what is shown now (a full day, say).
   */
  tolerates?: (err: unknown) => boolean;
  /** An error that means sign-in is already on its way: dropped without a word. */
  expired?: (err: unknown) => boolean;
  /** What to show changed. */
  onChange: (shown: T) => void;
  /** A load or a poll came back. */
  onLoad?: (outcome: RefreshOutcome) => void;
  /** A write was refused (never for an expired session), before or after it was sent. */
  onRefused?: (err: unknown) => void;
  /** A write went through. */
  onSaved?: () => void;
}

export function tempId(): string {
  return `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Whether `candidate` is the row asked for by `wanted`, under either its temp id or the hub's. */
export function sameId(candidate: string, wanted: string, resolveId: ResolveId): boolean {
  return candidate === wanted || candidate === resolveId(wanted);
}

export class WriteSession<T, R, C = unknown> {
  private server: T;
  private hasLoaded = false;
  private pending: Array<{ apply: Mutation<T> }> = [];
  private readonly ids = new Map<string, string>();
  private tail: Promise<unknown> = Promise.resolve();
  private holdUntil = 0;
  private inFlight = 0;
  /** Writes answered so far; a load that started before one is older than it. */
  private answered = 0;
  private reconcileWanted = false;

  constructor(private readonly opts: WriteSessionOptions<T, R, C>, initial: T) {
    this.server = initial;
  }

  readonly resolveId: ResolveId = (id) => this.ids.get(id) ?? id;

  /** Point a row's temp id at the id the hub gave it. */
  mapId(temp: string, real: string): void {
    this.ids.set(temp, real);
  }

  /** The hub's last copy, before any pending change. */
  get current(): T {
    return this.server;
  }

  /** Whether the hub has ever answered. */
  get loaded(): boolean {
    return this.hasLoaded;
  }

  /** No write is queued or out. */
  get idle(): boolean {
    return this.inFlight === 0;
  }

  /** Until when (ms since the epoch) a poll's answer is not worth taking. */
  get holdPollsUntil(): number {
    return this.holdUntil;
  }

  /** The hub's copy with every pending change on top. */
  shown(): T {
    return this.pending.reduce((data, p) => {
      try {
        return p.apply(data, this.resolveId);
      } catch (err) {
        if (this.opts.tolerates?.(err)) return data;
        throw err;
      }
    }, this.server);
  }

  /**
   * Ask the hub for its copy. A poll (`force` false) is not sent while a
   * write is out or in the hold after one, and its answer is dropped if a
   * write landed meanwhile. A forced read (a retry, the reconcile after a
   * refusal) is always sent, and dropped only when a write landed meanwhile:
   * that write's answer is newer than what the read delivers.
   */
  async refresh(force = false): Promise<RefreshOutcome> {
    if (!force && this.held()) return 'dropped';
    const answeredBefore = this.answered;
    let loaded: T | null;
    try {
      loaded = await this.opts.load();
    } catch (err) {
      return this.settle(this.opts.expired?.(err) ? 'dropped' : 'failed');
    }
    if (loaded === null) return this.settle('failed');
    if (this.answered !== answeredBefore || (!force && this.held())) return this.settle('dropped');
    this.server = loaded;
    this.hasLoaded = true;
    this.render();
    return this.settle('adopted');
  }

  /**
   * Queue one write. `apply` shows the change at once (null for a write
   * whose effect only the answer shows); `request` is sent when the write's
   * turn comes, built then when it is a builder; `onSuccess` sees what the
   * hub made, before the change is shown again, so a temp id can be mapped
   * first. Resolves with the hub's copy, or null when the write was refused,
   * not sent, or the session expired.
   */
  write(apply: Mutation<T> | null, request: RequestOf<R>, onSuccess?: (created?: C) => void): Promise<T | null> {
    const entry = apply ? { apply } : null;
    if (entry) {
      try {
        entry.apply(this.shown(), this.resolveId);
      } catch (err) {
        if (!this.opts.tolerates?.(err)) throw err;
        this.opts.onRefused?.(err);
        return Promise.resolve(null);
      }
      this.pending.push(entry);
      this.render();
    }
    this.inFlight += 1;

    const run = async (): Promise<T | null> => {
      try {
        const req = typeof request === 'function' ? (request as (resolveId: ResolveId) => R)(this.resolveId) : request;
        const { data, created } = await this.opts.send(req);
        this.holdUntil = Date.now() + this.opts.holdMs;
        this.answered += 1;
        this.server = data;
        this.hasLoaded = true;
        if (entry) this.drop(entry);
        onSuccess?.(created);
        this.opts.onSaved?.();
        this.render();
        return data;
      } catch (err) {
        if (entry) this.drop(entry);
        if (this.opts.expired?.(err)) return null;
        this.render();
        this.opts.onRefused?.(err);
        // Whatever this write changed locally was refused: the hub's copy is
        // fetched once the other requests are done with it.
        this.reconcileWanted = true;
        return null;
      } finally {
        this.inFlight -= 1;
        if (this.inFlight === 0 && this.reconcileWanted) {
          this.reconcileWanted = false;
          void this.refresh(true);
        }
      }
    };

    const result = this.tail.then(run, run);
    this.tail = result;
    return result;
  }

  private held(): boolean {
    return this.inFlight > 0 || Date.now() < this.holdUntil;
  }

  private drop(entry: { apply: Mutation<T> }): void {
    this.pending = this.pending.filter((p) => p !== entry);
  }

  private render(): void {
    this.opts.onChange(this.shown());
  }

  private settle(outcome: RefreshOutcome): RefreshOutcome {
    this.opts.onLoad?.(outcome);
    return outcome;
  }
}
