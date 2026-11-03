import { SetupError } from './api-utils';
import type { SetupPage } from './fetch-error';
import { logger } from './logger';

const log = logger('upstream');

/** How much of a refused answer's body reaches the log: enough to read a
 *  JSON error, not a whole HTML error page. */
const LOGGED_TEXT_CHARS = 300;

/**
 * A keyed service refused a request for a reason other than the key. Carries
 * the status and the body so a caller can sort the answer further (traffic
 * tells "could not route it" from an outage) without reading the body twice.
 */
export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly service: string,
    public readonly status: number,
    public readonly text: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface UpstreamErrorOptions {
  /** Defaults page that holds the key; API keys unless said otherwise. */
  page?: SetupPage;
  /**
   * A body that means the key was turned down although the status is not
   * 401 or 403. Google answers an unknown key with a 400 that names it.
   */
  keyRejected?: RegExp;
}

/**
 * Sorts a refused upstream answer by who can fix it. A rejected key (401,
 * 403, or a body `keyRejected` recognizes) is a `SetupError`, which
 * `errorResponse` turns into the wall's "finish setup" card: the household
 * can fix it in the editor. Anything else is an `UpstreamError`, the service
 * having a bad moment, which the wall shows as "not updating". The service's
 * own words go to the log only: they are not something a family can act on.
 *
 * Reads the body, so the caller must not read it again.
 */
export async function upstreamError(
  res: Response,
  service: string,
  options: UpstreamErrorOptions = {},
): Promise<SetupError | UpstreamError> {
  const text = await res.text().catch(() => '');
  const excerpt = text.slice(0, LOGGED_TEXT_CHARS);
  log.warn(`${service} answered ${res.status}: ${excerpt}`);
  if (res.status === 401 || res.status === 403 || (options.keyRejected?.test(text) ?? false)) {
    // The excerpt rides as `detail`, outside the message, so a module's
    // answer never carries the service's words while the editor's key check
    // can still show the provider's own reason next to the field.
    return new SetupError(`${service} turned the key down (${res.status})`, 'invalidKey', service, options.page, excerpt || undefined);
  }
  return new UpstreamError(`${service} answered ${res.status}`, service, res.status, text);
}
