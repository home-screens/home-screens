/**
 * Next.js instrumentation hook — runs once when the server boots.
 * Installs the client-IP stamping patch so security decisions
 * (IP allowlist, IP-restrict gate, login rate limiting) see the real
 * TCP peer address instead of spoofable proxy headers.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { pinDataRoot, getDataRoot } = await import('./lib/data-transaction');
    pinDataRoot();
    // Before anything takes the lock: clears staging files left beside it by
    // writers that died partway through taking it. Nothing else removes them.
    const { sweepAbandonedLockFiles } = await import('./lib/data-lock');
    await sweepAbandonedLockFiles(`${getDataRoot()}.data.lock`).catch(() => {});
    const { installClientIpStamping } = await import('./lib/server-ip-patch');
    installClientIpStamping();
    // Clear temp files from a write that died mid-flight (a full card, a
    // power cut). Nothing else ever removes them.
    const { sweepStaleTempFiles } = await import('./lib/json-store');
    await sweepStaleTempFiles().catch(() => {});
  }
}
