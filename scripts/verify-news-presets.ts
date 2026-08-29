/**
 * Fetch and parse every curated news preset so a dead URL is caught before a
 * release instead of on someone's kitchen display.
 *
 *   npx tsx scripts/verify-news-presets.ts            # all presets
 *   npx tsx scripts/verify-news-presets.ts de-DE      # one locale
 *
 * Exit code 1 when any preset fails. Network access required.
 */
import { NEWS_PRESETS } from '../src/lib/news-presets';
import { parseFeed, decodeFeedBody } from '../src/lib/news/parse-feed';

const USER_AGENT = 'HomeScreens/1.0 (+https://homescreens.dev)';
const only = process.argv[2];

async function check(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = decodeFeedBody(await res.arrayBuffer(), res.headers.get('content-type'));
    const feed = parseFeed(body);
    if (feed.items.length === 0) return { ok: false, detail: `${feed.format}: 0 items` };
    const withImages = feed.items.filter((i) => i.imageUrl).length;
    const dated = feed.items.filter((i) => i.timestamp !== null).length;
    return {
      ok: true,
      detail: `${feed.format} "${feed.title}" ${feed.items.length} items, ${dated} dated, ${withImages} with images; first: ${feed.items[0].title.slice(0, 60)}`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const presets = only ? NEWS_PRESETS.filter((p) => p.locale === only) : NEWS_PRESETS;
  let failures = 0;
  const results = await Promise.all(presets.map(async (p) => ({ p, r: await check(p.url) })));
  for (const { p, r } of results) {
    if (!r.ok) failures++;
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${p.locale} ${p.id.padEnd(24)} ${r.detail}`);
  }
  console.log(`\n${presets.length - failures}/${presets.length} presets healthy`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
