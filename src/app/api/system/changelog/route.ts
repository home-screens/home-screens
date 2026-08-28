import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchGitHubReleases, GITHUB_REPO, releasePageUrl } from '@/lib/version';
import type { ChangelogRelease } from '@/lib/version';
import { fetchWithTimeout, withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest) => {
  const includePrerelease = request.nextUrl.searchParams.get('channel') === 'dev';

  // Try cached GitHub releases first
  try {
    const releases = await fetchGitHubReleases({ includePrerelease });
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
    // Fall through to direct API call
  }

  // Fallback: direct API call (may hit rate limit if releases cache failed)
  const res = await fetchWithTimeout(
    `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`,
    {
      headers: { Accept: 'application/vnd.github.v3+json' },
      next: { revalidate: 3600 },
    },
  );

  if (!res.ok) {
    // Fall back to tags if no releases
    const tagsRes = await fetchWithTimeout(
      `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=10`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        next: { revalidate: 3600 },
      },
    );

    if (!tagsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch changelog' }, { status: 502 });
    }

    const allTags = await tagsRes.json();
    const filteredTags = includePrerelease
      ? allTags
      : allTags.filter((tag: { name: string }) => !tag.name.replace(/^v/, '').includes('-'));
    return NextResponse.json({
      releases: filteredTags.map(
        (tag: { name: string }): ChangelogRelease => ({
          tag: tag.name,
          name: tag.name,
          body: '',
          published: null,
          url: releasePageUrl(tag.name),
        }),
      ),
    });
  }

  const allReleases = await res.json();
  const filteredReleases = includePrerelease
    ? allReleases.filter((r: { draft: boolean }) => !r.draft)
    : allReleases.filter((r: { draft: boolean; prerelease: boolean }) => !r.draft && !r.prerelease);
  return NextResponse.json({
    releases: filteredReleases.map(
      (r: {
        tag_name: string;
        name: string;
        body: string;
        published_at: string;
        html_url?: string;
      }): ChangelogRelease => ({
        tag: r.tag_name,
        name: r.name || r.tag_name,
        body: r.body || '',
        published: r.published_at,
        url: r.html_url || releasePageUrl(r.tag_name),
      }),
    ),
  });
}, 'Failed to fetch changelog');
