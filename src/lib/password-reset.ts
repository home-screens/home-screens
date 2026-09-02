/**
 * How a household recovers from a forgotten editor password.
 *
 * Two surfaces show this advice and must show the same thing: `/login`, which
 * is where someone actually is when they're locked out, and the Security
 * settings page, which is behind the very password in question. Both names
 * below are literals — a command and a file path — so they are interpolated
 * into the translated sentence rather than being translated themselves.
 */

/** Installed by `scripts/install.sh` from `scripts/reset-password.sh`. */
export const RESET_COMMAND = 'home-screens-reset-password';

/** The file that holds the password, for installs without the command. */
export const AUTH_FILE = 'data/auth.json';
