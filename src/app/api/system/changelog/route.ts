import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getChannelReleases, GITHUB_REPO, releasePageUrl } from '@/lib/version';
import type { ChangelogRelease } from '@/lib/version';
import { channelIncludes, parseUpdateChannel } from '@/lib/semver';
import { fetchWithTimeout, withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest) => {
  const channel = parseUpdateChannel(request.nextUrl.searchParams.get('channel'));

  // The channel-scoped release feed is the same cached lookup the version
  // check uses, so the changelog and the update banner always agree on
  // which builds exist, including the stable that `releases/latest` carries
  // when the release page is full of nightlies. The page is required here:
  // a history answered by `releases/latest` alone is one entry long.
  try {
    const releases = await getChannelReleases(channel, { requirePage: true });
    if (releases.length > 0) {
      return NextResponse.json({
        releases: releases.map(
          (r): ChangelogRelease => ({
            tag: r.tag_name,
            name: r.name || r.tag_name,
            body: r.body || '',
            published: r.published_at,
            url: r.html_url || releasePageUrl(r.tag_name),
          }),
        ),
      });
    }
  } catch {
    // Fall through to the tags listing
  }

  // Fallback: bare tags, which exist even when no release was ever published
  const tagsRes = await fetchWithTimeout(
    `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=30`,
    {
      headers: { Accept: 'application/vnd.github.v3+json' },
      next: { revalidate: 3600 },
    },
  );

  if (!tagsRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch changelog' }, { status: 502 });
  }

  const allTags: { name: string }[] = await tagsRes.json();
  const visible = allTags.filter((tag) => channelIncludes(channel, tag.name.replace(/^v/, '')));
  return NextResponse.json({
    releases: visible.map(
      (tag): ChangelogRelease => ({
        tag: tag.name,
        name: tag.name,
        body: '',
        published: null,
        url: releasePageUrl(tag.name),
      }),
    ),
  });
}, 'Failed to fetch changelog');
