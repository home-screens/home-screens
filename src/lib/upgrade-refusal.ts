/**
 * The `code` on the 409 the hub gives a request to update or go back a
 * version while another one is running. The update window reads it to tell
 * "one is already running", which it then follows, from a start that failed.
 * Kept apart from the route so the browser can import it.
 */
export const UPGRADE_RUNNING_CODE = 'upgrade_running';
