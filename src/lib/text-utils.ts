/**
 * Pure utility functions for the Text module.
 * Extracted for testability — used by TextModule.tsx.
 */

import { DEFAULT_LOCALE } from '@/i18n/manifest';
import { UI_MONO_STACK } from '@/lib/font-registry';

// ---------------------------------------------------------------------------
// HTML escaping (XSS prevention)
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Lightweight markdown → HTML (bold, italic, strikethrough, code, linebreaks)
// ---------------------------------------------------------------------------

export function parseMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(
      /`(.+?)`/g,
      `<code style="background:rgba(255,255,255,0.1);padding:0 0.25em;border-radius:3px;font-family:${UI_MONO_STACK}">$1</code>`,
    )
    .replace(/\n/g, '<br/>');
}

// ---------------------------------------------------------------------------
// Template variable resolution
// ---------------------------------------------------------------------------

/**
 * Resolve `{{date}}` / `{{day}}` / `{{month}}` / etc. template variables
 * inside `text`. The greeting branches stay English-only — the localized
 * versions live in the `core` namespace and are wired up by Tasks 4–5
 * when TextModule itself is migrated.
 *
 * `locale` is the BCP-47 tag used by the Intl formatters — defaults to
 * `DEFAULT_LOCALE` (en-US) so out-of-scope callers keep working. Pass
 * the value from `useFormattingLocale()` for locale-aware output.
 */
export function resolveTemplateVariables(
  text: string,
  timezone?: string,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!text.includes('{{')) return text;

  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = timezone ? { timeZone: timezone } : {};

  // Hour extraction is locale-INDEPENDENT — we parse the integer back
  // out, so we keep 'en-US' here to guarantee ASCII digits regardless
  // of the user-facing locale.
  const parts = new Intl.DateTimeFormat('en-US', { ...opts, hour: 'numeric', hour12: false }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);

  const greeting =
    hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 17
        ? 'Good afternoon'
        : hour >= 17 && hour < 21
          ? 'Good evening'
          : 'Good night';

  return text
    .replace(/\{\{time\}\}/g, new Intl.DateTimeFormat(locale, { ...opts, hour: '2-digit', minute: '2-digit', hour12: false }).format(now))
    .replace(/\{\{time12\}\}/g, new Intl.DateTimeFormat(locale, { ...opts, hour: '2-digit', minute: '2-digit', hour12: true }).format(now))
    .replace(/\{\{date\}\}/g, new Intl.DateTimeFormat(locale, { ...opts, month: 'long', day: 'numeric', year: 'numeric' }).format(now))
    .replace(/\{\{day\}\}/g, new Intl.DateTimeFormat(locale, { ...opts, weekday: 'long' }).format(now))
    .replace(/\{\{month\}\}/g, new Intl.DateTimeFormat(locale, { ...opts, month: 'long' }).format(now))
    .replace(/\{\{year\}\}/g, new Intl.DateTimeFormat(locale, { ...opts, year: 'numeric' }).format(now))
    .replace(/\{\{greeting\}\}/g, greeting);
}

// ---------------------------------------------------------------------------
// Content rotation splitting
// ---------------------------------------------------------------------------

export function splitRotationContent(content: string, separator: string): string[] {
  return content
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
}
