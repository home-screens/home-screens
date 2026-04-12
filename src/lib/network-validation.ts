/**
 * Input validators for network settings.
 *
 * Every user-supplied value that will eventually reach an nmcli shell
 * command MUST pass through one of these validators first. Each returns
 * a typed `ValidationResult` so API routes can relay specific error
 * messages to the client.
 *
 * These validators are the first line of defense. The shell execution
 * layer (network-commands.ts) uses `execFile` with explicit argv as the
 * second — user input never touches a shell string.
 */

/* ─── Result type ─────────────────────────────── */

export interface ValidationResult {
  valid: boolean;
  /** Human-readable error message when `valid` is false. */
  error?: string;
}

const ok: ValidationResult = Object.freeze({ valid: true });
const fail = (error: string): ValidationResult => ({ valid: false, error });

/* ─── SSID ────────────────────────────────────── */

/**
 * Validate an SSID (network name).
 *
 * Wi-Fi SSIDs are 1-32 bytes of arbitrary octets (IEEE 802.11), but in
 * practice they're UTF-8 strings. We reject null bytes because nmcli
 * cannot represent them in command arguments.
 */
export function validateSSID(ssid: string): ValidationResult {
  if (typeof ssid !== 'string' || ssid.length === 0) {
    return fail('SSID must not be empty');
  }
  if (ssid.includes('\0')) {
    return fail('SSID must not contain null bytes');
  }
  const byteLength = new TextEncoder().encode(ssid).length;
  if (byteLength > 32) {
    return fail(`SSID must be at most 32 bytes (got ${byteLength})`);
  }
  return ok;
}

/* ─── WPA Password ────────────────────────────── */

/**
 * Validate a WPA/WPA2 password (pre-shared key).
 *
 * WPA-PSK passwords must be 8-63 printable ASCII characters (0x20-0x7e).
 * 64-character hex strings are raw PMKs, which we don't support here.
 */
export function validateWPAPassword(pass: string): ValidationResult {
  if (typeof pass !== 'string') {
    return fail('Password must be a string');
  }
  if (pass.length < 8) {
    return fail(`Password must be at least 8 characters (got ${pass.length})`);
  }
  if (pass.length > 63) {
    return fail(`Password must be at most 63 characters (got ${pass.length})`);
  }
  for (let i = 0; i < pass.length; i++) {
    const code = pass.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return fail(
        `Password must contain only printable ASCII characters (found 0x${code.toString(16).padStart(2, '0')} at position ${i})`,
      );
    }
  }
  return ok;
}

/* ─── Interface name ──────────────────────────── */

/**
 * Regex-only fallback for interface name validation.
 *
 * Linux interface names: start with a letter, then up to 14 more
 * alphanumeric, hyphen, or underscore characters (max 15 total, per
 * IFNAMSIZ). This is a pre-flight check; prefer `validateInterface`
 * with a known-interfaces whitelist for full validation.
 */
const IFACE_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{0,14}$/;

export function validateInterfaceRegex(iface: string): ValidationResult {
  if (typeof iface !== 'string' || iface.length === 0) {
    return fail('Interface name must not be empty');
  }
  if (!IFACE_REGEX.test(iface)) {
    return fail(
      'Interface name must start with a letter, contain only alphanumeric characters, hyphens, or underscores, and be at most 15 characters',
    );
  }
  return ok;
}

/**
 * Validate an interface name against a known-interfaces whitelist.
 *
 * This is the primary validation path. The `knownInterfaces` array
 * should come from `nmcli -t -f DEVICE device status` or similar.
 * Falls back to regex validation when the interface is not in the list.
 */
export function validateInterface(
  iface: string,
  knownInterfaces: string[],
): ValidationResult {
  // Always run regex validation first to catch malformed names
  const regexResult = validateInterfaceRegex(iface);
  if (!regexResult.valid) return regexResult;

  if (!knownInterfaces.includes(iface)) {
    // Safe to interpolate `iface` here because the regex gate above constrains
    // it to [a-zA-Z][a-zA-Z0-9_-]{0,14} — no shell metacharacters, no HTML.
    return fail(
      `Unknown interface "${iface}". Known interfaces: ${knownInterfaces.join(', ') || '(none)'}`,
    );
  }
  return ok;
}

/* ─── Connection UUID ─────────────────────────── */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate an nmcli connection UUID.
 */
export function validateUUID(uuid: string): ValidationResult {
  if (typeof uuid !== 'string' || uuid.length === 0) {
    return fail('UUID must not be empty');
  }
  if (!UUID_REGEX.test(uuid)) {
    return fail('UUID must be a valid v4-style UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
  }
  return ok;
}

/* ─── IPv4 address ────────────────────────────── */

/**
 * Validate a dotted-decimal IPv4 address.
 *
 * Requires exactly 4 octets, each 0-255, with no leading zeros
 * (to avoid octal interpretation ambiguity).
 */
export function validateIPv4(ip: string): ValidationResult {
  if (typeof ip !== 'string' || ip.length === 0) {
    return fail('IPv4 address must not be empty');
  }
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return fail(`IPv4 address must have exactly 4 octets (got ${parts.length})`);
  }
  for (let i = 0; i < 4; i++) {
    const part = parts[i];
    // Must be a non-empty numeric string
    if (!/^\d+$/.test(part)) {
      return fail(`IPv4 octet ${i + 1} is not a valid number: "${part}"`);
    }
    // Reject leading zeros (e.g. "01", "007") to avoid octal ambiguity
    if (part.length > 1 && part[0] === '0') {
      return fail(`IPv4 octet ${i + 1} has a leading zero: "${part}"`);
    }
    const num = parseInt(part, 10);
    if (num < 0 || num > 255) {
      return fail(`IPv4 octet ${i + 1} is out of range (0-255): ${num}`);
    }
  }
  return ok;
}

/* ─── CIDR prefix ─────────────────────────────── */

/**
 * Validate an IPv4 CIDR prefix length.
 */
export function validateCIDRPrefix(prefix: number): ValidationResult {
  if (typeof prefix !== 'number' || !Number.isInteger(prefix)) {
    return fail('CIDR prefix must be an integer');
  }
  if (prefix < 1 || prefix > 32) {
    return fail(`CIDR prefix must be between 1 and 32 (got ${prefix})`);
  }
  return ok;
}

/* ─── Hostname ────────────────────────────────── */

/**
 * Validate an RFC 1123 hostname label.
 *
 * Hostnames must:
 * - Be 1-63 characters
 * - Start and end with an alphanumeric character
 * - Contain only alphanumeric characters and hyphens
 */
const HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export function validateHostname(hostname: string): ValidationResult {
  if (typeof hostname !== 'string' || hostname.length === 0) {
    return fail('Hostname must not be empty');
  }
  if (hostname.length > 63) {
    return fail(`Hostname must be at most 63 characters (got ${hostname.length})`);
  }
  if (!HOSTNAME_REGEX.test(hostname)) {
    return fail(
      'Hostname must start and end with an alphanumeric character and contain only alphanumeric characters and hyphens',
    );
  }
  return ok;
}
