import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: 'standalone',
  // `next dev` otherwise appends a block of AI-agent rules to CLAUDE.md on
  // every start, dirtying the file that carries this project's own guidance.
  agentRules: false,
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
  serverExternalPackages: ['node-ical', 'googleapis'],
  experimental: {
    workerThreads: false,
    cpus: 2,
    // The proxy (src/proxy.ts) buffers request bodies with a 10MB default cap
    // and silently TRUNCATES anything larger, which made >10MB video uploads
    // die in formData() parsing with a 500. Sized above the 200MB per-video
    // upload limit (plus multipart overhead) so /api/backgrounds' own friendly
    // 413 is the only size gate a user ever hits.
    proxyClientMaxBodySize: '205mb',
  },
  outputFileTracingIncludes: {
    '/api/calendar': ['./node_modules/temporal-polyfill/**/*'],
    // Counters the './docs/**' exclude below, which the tracer applies as an
    // unanchored substring match and would otherwise delete the Google Docs
    // API out of googleapis, making the whole module fail to load at runtime
    // (broke calendar in v1.11.0-rc.1). Verified: includes are applied after
    // excludes, so this wins.
    '/api/calendars': ['./node_modules/googleapis/build/src/apis/docs/**/*'],
  },
  // Next's file tracer sweeps trees the server never reads from disk into
  // the standalone output: source, tests, docs, the marketing site,
  // historical release notes. Only src/translations/*.json is a real runtime
  // dependency (src/i18n/file-reader.ts reads it for /api/i18n), so
  // everything else under src/ is safe to drop.
  //
  // INERT ON THIS BUILD: Next 16 skips collect-build-traces entirely for
  // Turbopack builds, and that module is the only thing that reads these
  // two options, so neither the excludes below nor the includes above have
  // any effect on `next build`. The tarball is pruned in
  // .github/workflows/build-tarball.yml instead. Kept here so the intent
  // survives if the Turbopack tracer ever grows the same hook.
  //
  // CAUTION if it ever goes live again: the tracer matches these globs as
  // unanchored substrings (picomatch contains: true), so a pattern like
  // './docs/**' also deletes any node_modules path containing a 'docs/'
  // segment. That stripped the Google Docs API out of googleapis and broke
  // calendar in v1.11.0-rc.1 (countered by the googleapis entry in
  // outputFileTracingIncludes above). The '/**' key (all routes) also
  // avoids Next's internal 'next-server' entry, which a bare '*' key would
  // additionally match.
  outputFileTracingExcludes: {
    '/**': [
      './src/app/**',
      './src/components/**',
      './src/contexts/**',
      './src/hooks/**',
      './src/i18n/**',
      './src/lib/**',
      './src/stores/**',
      './src/types/**',
      './src/*.ts',
      './docs/**',
      './e2e/**',
      './website/**',
      './mockups/**',
      './scripts/**',
      './RELEASE_NOTES/**',
      './infrastructure/**',
      './README.md',
      './LICENSE',
      './CLAUDE.md',
      './tsconfig.tsbuildinfo',
    ],
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
              // Mirrors img-src: slideshow video plays straight from remote CDNs
              // (iCloud shared albums serve raw Apple-signed URLs, no proxy).
              // Without this, <video> falls back to default-src 'self' and every
              // cross-origin clip is blocked.
              "media-src 'self' blob: https: http: data:",
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
