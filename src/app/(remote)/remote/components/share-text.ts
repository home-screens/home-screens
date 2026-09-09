import { copyText } from '@/lib/clipboard';

/**
 * Hand a block of text to the phone's share sheet, or copy it when there is
 * no share sheet (a laptop, or a plain-HTTP page where the native share API
 * is unavailable). Used by the grocery list and the to-do lists.
 *
 * Resolves to `shared` when the share sheet took it, `copied` when it landed
 * on the clipboard, `cancelled` when the person closed the share sheet, and
 * `failed` when neither path worked (so a "Copied!" never lies).
 */
export async function shareOrCopyText(text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}
