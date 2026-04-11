import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Pin the file-tracing root to this project directory. Without this, Next.js
  // walks upward looking for the first parent lockfile and picks THAT as the
  // implicit workspace root — so if a stray package-lock.json sits in
  // /Users/bryan/Github/ (or wherever this repo is cloned), traced paths get a
  // `./home-screens/` prefix, the standalone bundle nests one level deep, and
  // Turbopack's cache keys end up wrong. Pinning the root here makes the
  // project self-contained regardless of parent-directory state.
  outputFileTracingRoot: projectRoot,
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  serverExternalPackages: ['node-ical'],
  experimental: {
    workerThreads: false,
    cpus: 2,
  },
  outputFileTracingIncludes: {
    '/api/calendar': ['./node_modules/temporal-polyfill/**/*'],
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: https: http: data:",
              "connect-src 'self' https: http://localhost:*",
              "frame-src 'self' https: http:",
              "font-src 'self' data:",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
};

export default nextConfig;
