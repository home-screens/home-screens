/**
 * Home Screens Version Worker
 *
 * Caching proxy for the GitHub Releases API.
 * Returns the latest release version tag, cached at the edge for 1 hour.
 *
 * Deploy:
 *   cd infrastructure/version-worker
 *   wrangler deploy
 */

const GITHUB_API =
  'https://api.github.com/repos/home-screens/home-screens/releases/latest';

const CACHE_TTL = 3600; // 1 hour in seconds

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/version') {
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }

    // Use the CF Cache API with a stable cache key
    const cacheKey = new Request(new URL('/version', request.url).toString());
    const cache = caches.default;

    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from GitHub
    const ghResponse = await fetch(GITHUB_API, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'home-screens-version-worker',
      },
    });

    if (!ghResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch release' }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    const data = (await ghResponse.json()) as { tag_name: string };
    const version = data.tag_name; // e.g. "v0.19.2"

    const response = new Response(JSON.stringify({ version }), {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      },
    });

    // Store in edge cache (non-blocking)
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
} satisfies ExportedHandler;
