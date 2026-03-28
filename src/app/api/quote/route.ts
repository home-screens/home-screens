import { cachedProxyRoute } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const { GET, cache } = cachedProxyRoute({
  auth: 'display',
  ttlMs: 60 * 60 * 1000,
  url: 'https://zenquotes.io/api/random',
  transform: (data) => {
    const item = (data as Array<{ q: string; a: string }>)[0];
    return { quote: item.q, author: item.a };
  },
  errorMessage: 'Failed to fetch quote',
});

/** @internal */
export { GET, cache };
