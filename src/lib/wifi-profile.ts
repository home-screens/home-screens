/**
 * Rules for the Wi-Fi profiles Home Screens creates.
 *
 * Joining a network used to run `nmcli device wifi connect`, which reuses any
 * saved profile for the SSID. In nmcli 1.50 through 1.54.3 that path rebuilds
 * the profile's security setting with only the password and NetworkManager
 * rejects it ("802-11-wireless-security.key-mgmt: property is missing"), so
 * every rejoin of a known network fails on a Trixie image. Home Screens now
 * owns one profile per network per adapter, named `<ssid> (<adapter>)` and
 * pinned to the adapter, and brings it up by UUID. These helpers are the pure
 * part of that: the name, the nmcli argument lists, and the parse of nmcli's
 * "successfully added" line.
 */

/** Autoconnect priority for pinned profiles, so at boot they beat an unpinned profile for the same SSID. */
export const WIFI_PROFILE_PRIORITY = 10;

/** The saved-profile name for a network on one adapter. */
export function wifiProfileName(ssid: string, iface: string): string {
  return `${ssid} (${iface})`;
}

/**
 * Pull the UUID out of nmcli's confirmation line:
 * `Connection 'HomeNet (wlan1)' (3dedc095-8d54-4c45-aba4-486c1d87c9a2) successfully added.`
 */
export function parseAddedConnectionUuid(stdout: string): string | null {
  const match = stdout.match(/\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\s+successfully added/i);
  return match ? match[1].toLowerCase() : null;
}

export type WifiKeyManagement = 'open' | 'wpa-psk' | 'sae';

/** Whether the scan's SECURITY column says the network wants a password. */
export function isSecuredNetwork(security: string | undefined): boolean {
  const s = (security ?? '').trim();
  return s !== '' && s.toUpperCase() !== 'OPEN';
}

/**
 * Decide the key management from the scan's SECURITY column and whether a
 * password was typed. WPA3-only networks use SAE; anything else with a
 * password is WPA-PSK; no password means open. WEP and 802.1X are not
 * supported and fall through to WPA-PSK, where NetworkManager reports the
 * mismatch. A secured network with no password is not a valid spec; the
 * route either keeps the saved password or refuses before this is reached.
 */
export function wifiKeyManagement(security: string | undefined, password: string | undefined): WifiKeyManagement {
  if (!password) return 'open';
  const s = (security ?? '').toUpperCase();
  const wpa3Only = s.includes('WPA3') && !s.includes('WPA2') && !s.includes('WPA1');
  return wpa3Only ? 'sae' : 'wpa-psk';
}

/** The `wifi-sec.*` arguments for a secured network; empty for an open one. */
export function wifiSecurityArgs(keyMgmt: WifiKeyManagement, password: string | undefined): string[] {
  if (keyMgmt === 'open' || !password) return [];
  return ['wifi-sec.key-mgmt', keyMgmt, 'wifi-sec.psk', password];
}

export interface WifiProfileSpec {
  ssid: string;
  iface: string;
  password?: string;
  security?: string;
  hidden?: boolean;
}

/** The IPv4 settings an older profile for the same network carried, so a new pinned one keeps them. */
export interface InheritedIpv4 {
  method: 'auto' | 'manual';
  addresses?: string;
  gateway?: string;
  dns?: string;
}

/**
 * `ipv4.*` arguments that carry a static address over to a replacement
 * profile. A DHCP profile needs nothing: `auto` is nmcli's default. A manual
 * one without an address is not worth copying; it could not have worked.
 */
export function ipv4Args(ipv4: InheritedIpv4 | null | undefined): string[] {
  if (!ipv4 || ipv4.method !== 'manual' || !ipv4.addresses) return [];
  return [
    'ipv4.method', 'manual',
    'ipv4.addresses', ipv4.addresses,
    ...(ipv4.gateway ? ['ipv4.gateway', ipv4.gateway] : []),
    ...(ipv4.dns ? ['ipv4.dns', ipv4.dns] : []),
  ];
}

/**
 * `nmcli connection add ...` for a network Home Screens has no pinned profile
 * for yet. `inheritIpv4` is the address setup of the profile this one
 * replaces (the Imager's `preconfigured`, or one the old connect command
 * made), so a Pi on a static address does not silently fall back to DHCP.
 */
export function buildAddProfileArgs(spec: WifiProfileSpec, inheritIpv4?: InheritedIpv4 | null): string[] {
  const keyMgmt = wifiKeyManagement(spec.security, spec.password);
  return [
    'connection', 'add',
    'type', 'wifi',
    'ifname', spec.iface,
    'con-name', wifiProfileName(spec.ssid, spec.iface),
    'ssid', spec.ssid,
    'connection.autoconnect-priority', String(WIFI_PROFILE_PRIORITY),
    ...wifiSecurityArgs(keyMgmt, spec.password),
    ...(spec.hidden ? ['802-11-wireless.hidden', 'yes'] : []),
    ...ipv4Args(inheritIpv4),
  ];
}

/**
 * The `nmcli connection modify` calls that bring an existing Home Screens
 * profile in line with a new request. Modify, never delete, so a UUID captured
 * for rollback survives a retry with a corrected password. Going from secured
 * to open needs the whole security setting removed; emptying `key-mgmt` would
 * leave the exact broken shape this module exists to avoid, so that is a
 * separate call.
 *
 * `keepSecurity` leaves the saved password and key management untouched: a
 * secured network rejoined with the password field empty means "use what you
 * have", never "make it open".
 */
export function buildModifyProfileArgs(
  uuid: string,
  spec: WifiProfileSpec,
  options: { keepSecurity?: boolean } = {},
): string[][] {
  const keyMgmt = wifiKeyManagement(spec.security, spec.password);
  const calls: string[][] = [];
  if (keyMgmt === 'open' && !options.keepSecurity) {
    calls.push(['connection', 'modify', uuid, 'remove', '802-11-wireless-security']);
  }
  calls.push([
    'connection', 'modify', uuid,
    ...(options.keepSecurity ? [] : wifiSecurityArgs(keyMgmt, spec.password)),
    '802-11-wireless.hidden', spec.hidden ? 'yes' : 'no',
    'connection.autoconnect-priority', String(WIFI_PROFILE_PRIORITY),
  ]);
  return calls;
}

/**
 * Which saved profile a new pinned one takes over from: the same network,
 * pinned to this adapter or to none. A profile pinned to another adapter is
 * someone else's and is left alone.
 */
export function isPredecessorProfile(
  profile: { ssid: string; iface?: string; name: string },
  ssid: string,
  iface: string,
): boolean {
  if (profile.name === wifiProfileName(ssid, iface)) return false;
  return profile.ssid === ssid && (!profile.iface || profile.iface === iface);
}

/**
 * Whether a saved profile is the one Home Screens made for this network on
 * this adapter. The name alone is not proof: a hand-made profile could carry
 * the same name with another SSID or another adapter, and modifying and
 * activating that would touch a connection the management check never saw.
 */
export function isOwnProfile(
  profile: { ssid: string; iface?: string; name: string },
  ssid: string,
  iface: string,
): boolean {
  return profile.name === wifiProfileName(ssid, iface) && profile.ssid === ssid && profile.iface === iface;
}

/** Seconds `nmcli connection up` waits for the join before giving up. */
export const WIFI_UP_WAIT_SECONDS = 45;

/** `nmcli --wait N connection up uuid <uuid>`. */
export function buildUpArgs(uuid: string): string[] {
  return ['--wait', String(WIFI_UP_WAIT_SECONDS), 'connection', 'up', 'uuid', uuid];
}

/**
 * Turn nmcli's activation failure into a sentence a parent can act on. nmcli
 * prints its own hints ("use 'journalctl -xe ...'", "cannot ask without
 * '--ask'") that mean nothing on a settings page; the three failures a
 * household actually hits get a plain line and anything else keeps nmcli's
 * first error sentence.
 */
export function describeJoinFailure(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (/Secrets were required|secrets were required|key-mgmt: property is missing/i.test(text)) {
    return 'The password was not accepted. Check it and try again.';
  }
  if (/could not be found|No network with SSID|not found/i.test(text)) {
    return 'That network could not be found. Check the name and that it is in range.';
  }
  if (/Timeout|timed out|timeout expired/i.test(text)) {
    return 'The network did not answer in time. Try again in a moment.';
  }
  // Keep the first "Error: ..." sentence, dropping nmcli's journalctl hint
  const error = text.match(/Error:\s*([^.]+)\.?/);
  if (error) return error[1].trim() + '.';
  return text || 'Connection failed';
}
