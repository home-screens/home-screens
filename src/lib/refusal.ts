/**
 * A refusal the hub can explain in the family's own language.
 *
 * Every store that turns an edit down (lists, notes, day notes, timetables,
 * family, icons, the photo library, timers) throws one of these. The route
 * wrapper answers `{ error, code, params }`: `error` is the English sentence
 * for logs and the API docs, `code` names the refusal (`lists.nameTooLong`)
 * and `params` carries what the sentence quotes (a limit, a name). A phone or
 * editor maps the code to its own dictionary (`refusals.<code>`) and never
 * shows the English, which is what let a German household read "A day holds
 * 3 notes" straight off the hub.
 *
 * Pure and free of server imports, so the rules that also run on the phone
 * (notes, day notes) throw the same class and their toasts go the same way.
 */

export type RefusalParams = Record<string, string | number>;

export interface RefusalOptions {
  /** What the sentence quotes, so the translated one can quote it too. */
  params?: RefusalParams;
  /**
   * Fields the answer carries beside the refusal: a conflict's current copy
   * (the family roster, the saved timetables), or a `reason` an older client
   * keys on. Spread into the body at the top level.
   */
  extra?: Record<string, unknown>;
}

export class RefusalError extends Error {
  readonly status: number;
  readonly code: string;
  readonly params?: RefusalParams;
  readonly extra?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, options: RefusalOptions = {}) {
    super(message);
    this.name = 'RefusalError';
    this.status = status;
    this.code = code;
    if (options.params) this.params = options.params;
    if (options.extra) this.extra = options.extra;
  }
}

/** The JSON a refused request answers with. */
export interface RefusalBody {
  error: string;
  code: string;
  params?: RefusalParams;
}

/** The body for `error`, extra fields included. */
export function refusalBody(error: RefusalError): RefusalBody & Record<string, unknown> {
  return {
    error: error.message,
    code: error.code,
    ...(error.params ? { params: error.params } : {}),
    ...(error.extra ?? {}),
  };
}

/** Whether a parsed answer names a refusal code. */
export function isRefusalBody(json: unknown): json is RefusalBody & Record<string, unknown> {
  if (!json || typeof json !== 'object') return false;
  const { code } = json as { code?: unknown };
  return typeof code === 'string' && code.length > 0;
}

/**
 * The refusal a hub answer describes, as the error a client throws: the code
 * and params travel, the English sentence rides along as the message for
 * logs only. `null` when the answer names no code.
 */
export function refusalFromBody(json: unknown, status: number, fallback: string): RefusalError | null {
  if (!isRefusalBody(json)) return null;
  const params = json.params && typeof json.params === 'object' ? json.params : undefined;
  const message = typeof json.error === 'string' && json.error ? json.error : fallback;
  return new RefusalError(status, json.code, message, params ? { params } : {});
}
