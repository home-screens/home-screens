/**
 * Next.js instrumentation hook — runs once when the server boots.
 * Installs the client-IP stamping patch so security decisions
 * (IP allowlist, IP-restrict gate, login rate limiting) see the real
 * TCP peer address instead of spoofable proxy headers.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installClientIpStamping } = await import('./lib/server-ip-patch');
    installClientIpStamping();
  }
}
