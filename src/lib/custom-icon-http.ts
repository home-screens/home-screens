import { mintWindowedMediaToken } from '@/lib/media-token';
import type { CustomIcon, CustomIconEntry } from '@/lib/custom-icons';

/** Every icon URL is bound to this one resource, so a single token covers
 *  the whole library and one catalog fetch hands the wall all of it. */
export const CUSTOM_ICON_TOKEN_RESOURCE = 'custom-icons';

export async function withUrls(icons: readonly CustomIcon[]): Promise<CustomIconEntry[]> {
  const token = await mintWindowedMediaToken(CUSTOM_ICON_TOKEN_RESOURCE);
  // The hash is in the URL, so a picture never changes behind it and the
  // serve route can let the browser keep it for good.
  return icons.map((icon) => ({
    ...icon,
    url: `/api/custom-icons/serve?h=${icon.hash}${token ? `&mt=${encodeURIComponent(token)}` : ''}`,
  }));
}
