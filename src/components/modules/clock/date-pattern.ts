import { fullDatePattern } from '@/i18n';

/**
 * The date line's pattern: the clock's own when it has one, otherwise the
 * whole date in the language's own order ("Monday, November 2", "fredag den
 * 25. september"). An empty pattern means "the language's usual date".
 */
export function clockDatePattern(dateFormat: string | undefined, locale: string): string {
  return dateFormat || fullDatePattern(locale);
}
