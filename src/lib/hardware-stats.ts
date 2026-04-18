/**
 * Shared types and validators for per-Pi hardware stats and per-display
 * browser stats. Both are optional additions on the existing DisplayStatus
 * record (see display-commands.ts).
 */

export interface ThrottledInfo {
  /** The raw `vcgencmd get_throttled` output (e.g. "0x50005"). */
  raw: string;
  /** A throttling condition is currently active. */
  active: boolean;
  /** Currently under-voltage. */
  underVoltage: boolean;
  /** A throttling condition has occurred since last boot. */
  previouslyThrottled: boolean;
}

export interface HardwareStats {
  /** /sys/firmware/devicetree/base/model — null on non-Pi systems. */
  piModel: string | null;
  /** /proc/cpuinfo "model name" — null if unavailable. */
  cpuModel: string | null;
  cpuCores: number;
  /** /sys/class/thermal/thermal_zone0/temp in degrees Celsius — null on macOS / non-Pi. */
  cpuTempC: number | null;
  load1: number;
  load5: number;
  load15: number;
  /** null when vcgencmd is not available. */
  throttled: ThrottledInfo | null;
  memoryTotal: number;
  memoryFree: number;
  diskTotal: number;
  diskFree: number;
  /** ISO 8601 timestamp at which the reporter collected this snapshot. */
  reportedAt: string;
}

export interface BrowserStats {
  userAgent: string;
  chromiumVersion: string | null;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  hardwareConcurrency: number | null;
  /** navigator.deviceMemory (GB) — undefined/null in many browsers. */
  deviceMemory: number | null;
  /** WebGL UNMASKED_RENDERER_WEBGL value — null when WebGL is unavailable. */
  webglRenderer: string | null;
  reportedAt: string;
}

const MAX_UA_LEN = 1024;
const MAX_STRING_LEN = 256;

function asFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function asNonNegativeFinite(v: unknown): number | null {
  const n = asFiniteNumber(v);
  return n !== null && n >= 0 ? n : null;
}
function asPositiveFinite(v: unknown): number | null {
  const n = asFiniteNumber(v);
  return n !== null && n > 0 ? n : null;
}
function asOptionalString(v: unknown, max = MAX_STRING_LEN): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  return v.slice(0, max);
}
function asIsoString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return v.slice(0, 64);
}

function validateThrottled(v: unknown): ThrottledInfo | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const raw = asOptionalString(o.raw, 32);
  if (raw === null) return null;
  return {
    raw,
    active: Boolean(o.active),
    underVoltage: Boolean(o.underVoltage),
    previouslyThrottled: Boolean(o.previouslyThrottled),
  };
}

export function validateHardwareStats(input: unknown): HardwareStats | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;

  const cpuCores = asPositiveFinite(o.cpuCores);
  const load1 = asNonNegativeFinite(o.load1);
  const load5 = asNonNegativeFinite(o.load5);
  const load15 = asNonNegativeFinite(o.load15);
  const memoryTotal = asNonNegativeFinite(o.memoryTotal);
  const memoryFree = asNonNegativeFinite(o.memoryFree);
  const diskTotal = asNonNegativeFinite(o.diskTotal);
  const diskFree = asNonNegativeFinite(o.diskFree);
  const reportedAt = asIsoString(o.reportedAt);

  if (
    cpuCores === null || load1 === null || load5 === null || load15 === null ||
    memoryTotal === null || memoryFree === null ||
    diskTotal === null || diskFree === null ||
    reportedAt === null
  ) {
    return null;
  }

  const cpuTempC = o.cpuTempC === null || o.cpuTempC === undefined
    ? null
    : asFiniteNumber(o.cpuTempC);

  return {
    piModel: asOptionalString(o.piModel),
    cpuModel: asOptionalString(o.cpuModel),
    cpuCores,
    cpuTempC,
    load1, load5, load15,
    throttled: validateThrottled(o.throttled),
    memoryTotal, memoryFree, diskTotal, diskFree,
    reportedAt,
  };
}

export function validateBrowserStats(input: unknown): BrowserStats | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;

  const userAgent = asOptionalString(o.userAgent, MAX_UA_LEN);
  const viewportWidth = asPositiveFinite(o.viewportWidth);
  const viewportHeight = asPositiveFinite(o.viewportHeight);
  const devicePixelRatio = asPositiveFinite(o.devicePixelRatio);
  const reportedAt = asIsoString(o.reportedAt);

  if (
    userAgent === null || viewportWidth === null || viewportHeight === null ||
    devicePixelRatio === null || reportedAt === null
  ) {
    return null;
  }

  return {
    userAgent,
    chromiumVersion: asOptionalString(o.chromiumVersion, 64),
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    hardwareConcurrency: o.hardwareConcurrency === null || o.hardwareConcurrency === undefined
      ? null
      : asPositiveFinite(o.hardwareConcurrency),
    deviceMemory: o.deviceMemory === null || o.deviceMemory === undefined
      ? null
      : asPositiveFinite(o.deviceMemory),
    webglRenderer: asOptionalString(o.webglRenderer),
    reportedAt,
  };
}

/** Fields the bundle composer uses to label a per-display directory in the zip. */
export interface ConsoleLogEntry {
  level: 'log' | 'warn' | 'error';
  message: string;
  /** ms since epoch when the line was captured on the display. */
  timestamp: number;
}
