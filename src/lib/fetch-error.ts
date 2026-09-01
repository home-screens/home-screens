/**
 * Classified fetch failures, shared by the API routes that emit them and the
 * display code that renders them.
 *
 * A `setup` error is something the household can fix in the editor: a missing
 * or rejected API key, a service that was never connected. A `transient`
 * error is everything else (upstream outage, timeout, bad request). The
 * distinction matters on the wall: setup errors get a calm "finish setup"
 * card, transient errors are never printed at all.
 */

export type SetupNeed = 'key' | 'invalidKey' | 'connection';

/** Which Defaults page holds the field the household needs to fill in. */
export type SetupPage = 'integrations' | 'weather';

export interface SetupInfo {
  needs: SetupNeed;
  /** Human-readable service name ("OpenWeatherMap", "Immich"). */
  service: string;
  /** Weather provider keys live on the Weather page; everything else on API keys. */
  page?: SetupPage;
}

export type FetchErrorKind = 'setup' | 'transient';

export interface FetchError {
  kind: FetchErrorKind;
  /** Developer-facing detail; logged and shown in the editor, never on the wall. */
  message: string;
  setup?: SetupInfo;
}

/** Wire shape of a classified setup error body from an API route. */
export interface SetupErrorBody {
  error: string;
  code: 'setup';
  setup: SetupInfo;
}

export function transientError(message: string): FetchError {
  return { kind: 'transient', message };
}

export function setupError(needs: SetupNeed, service: string, opts?: { message?: string; page?: SetupPage }): FetchError {
  const setup: SetupInfo = { needs, service, ...(opts?.page ? { page: opts.page } : {}) };
  return { kind: 'setup', message: opts?.message ?? `${service} needs setup`, setup };
}

/** Structural equality, so a repeated failure can keep the previous state object. */
export function sameFetchError(a: FetchError | null, b: FetchError | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.message === b.message
    && a.setup?.needs === b.setup?.needs && a.setup?.service === b.setup?.service && a.setup?.page === b.setup?.page;
}

/**
 * Classify a non-OK API response. Reads the JSON body once; a body without a
 * `setup` code (or no JSON body at all) is transient.
 */
export async function readFetchError(res: Response, fallbackMessage: string): Promise<FetchError> {
  let msg = fallbackMessage;
  try {
    const body = await res.json() as Partial<SetupErrorBody> & { detail?: string };
    if (body.error) msg = body.error;
    if (body.detail) msg = `${msg}: ${body.detail}`;
    if (body.code === 'setup' && body.setup && typeof body.setup.service === 'string') {
      const page = body.setup.page === 'weather' ? 'weather' : undefined;
      return { kind: 'setup', message: msg, setup: { needs: body.setup.needs, service: body.setup.service, ...(page ? { page } : {}) } };
    }
  } catch {
    // no JSON body: use the fallback message
  }
  return transientError(msg);
}
