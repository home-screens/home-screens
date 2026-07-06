/**
 * Browser-side console ring buffer. Wraps window.console.log|warn|error so
 * every call is also recorded to an in-memory array. The diagnostics bundle
 * endpoint solicits a snapshot via the `dump-console-log` display command;
 * no data is POSTed on every heartbeat.
 *
 * Runs in the client only — never called from server components.
 */

import type { ConsoleLogEntry } from '@/lib/hardware-stats';

interface BufferOptions {
  /** Hard cap on number of entries (defaults to 500). */
  maxEntries?: number;
  /** Hard cap on total serialized byte size (defaults to 256 KB). */
  maxBytes?: number;
}

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_MAX_BYTES = 256 * 1024;

let buffer: ConsoleLogEntry[] = [];
let totalBytes = 0;
let installed = false;
let maxEntries = DEFAULT_MAX_ENTRIES;
let maxBytes = DEFAULT_MAX_BYTES;

function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(a);
  } catch {
    // Circular reference — fall back to String() which gives [object Object]
    return String(a);
  }
}

function record(level: 'log' | 'warn' | 'error', args: unknown[]): void {
  const message = args.map(stringifyArg).join(' ');
  const entry: ConsoleLogEntry = {
    level,
    message,
    timestamp: Date.now(),
  };
  const size = message.length + 32; // rough overhead per entry
  buffer.push(entry);
  totalBytes += size;

  while (buffer.length > maxEntries) {
    const dropped = buffer.shift();
    if (dropped) totalBytes -= dropped.message.length + 32;
  }
  // Keep at least the most recent entry even if it alone exceeds the byte cap.
  while (totalBytes > maxBytes && buffer.length > 1) {
    const dropped = buffer.shift();
    if (dropped) totalBytes -= dropped.message.length + 32;
  }
}

/**
 * Install the wrapper. Idempotent — calling twice is safe. Returns an
 * uninstall function that restores the original console methods.
 */
export function installConsoleBuffer(options: BufferOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  if (installed) return () => {};
  installed = true;
  maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: unknown[]) => { record('log', args); origLog(...args); };
  console.warn = (...args: unknown[]) => { record('warn', args); origWarn(...args); };
  console.error = (...args: unknown[]) => { record('error', args); origError(...args); };

  return () => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    installed = false;
  };
}

/** Return a shallow copy of the current buffer — does not clear it. */
export function snapshotConsoleBuffer(): ConsoleLogEntry[] {
  return buffer.slice();
}

/** Test-only reset. */
export function __resetConsoleBufferForTests(): void {
  buffer = [];
  totalBytes = 0;
  installed = false;
}
