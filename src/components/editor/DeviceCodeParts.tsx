'use client';

import { useCopyFlash } from '@/hooks/useCopyFlash';
import { shortSignInUrl } from '@/lib/oauth-device-flow';
import { useTranslate } from '@/i18n';

/**
 * The two pieces every "type this code on another device" sign-in shows, in
 * one place so they cannot drift again: the link to the sign-in page and the
 * code, which copies when pressed. Each panel (Google Calendar with either
 * app, a plugin's connection, OneDrive) keeps its own sentence and layout
 * and passes its own classes, since they sit in pages of different widths.
 */

/** The sign-in page, opened in a new tab. `short` shows it as people would type it. */
export function DeviceCodeLink({
  url,
  short = false,
  className,
}: {
  url: string;
  short?: boolean;
  className?: string;
}) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {short ? shortSignInUrl(url) : url}
    </a>
  );
}

/** The words a copy control shows, before and just after it is pressed. */
export function useDeviceCodeCopy(code: string | null): {
  copy: () => void;
  label: string;
  hint: string;
} {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { copied, copy } = useCopyFlash();
  const hint = t('settings.calendarPage.google.copyCode');
  return {
    copy: () => {
      if (code) void copy(code);
    },
    label: copied ? tCore('status.copied') : hint,
    hint,
  };
}

/** The code as one button that copies it, with the "Copy code" words inside. */
export function DeviceCodeButton({
  code,
  className,
  codeClassName,
  labelClassName,
  testId,
}: {
  code: string;
  className?: string;
  /** For a panel that shows the code in its own lettering, not the fixed-width one. */
  codeClassName?: string;
  labelClassName?: string;
  testId?: string;
}) {
  const { copy, label, hint } = useDeviceCodeCopy(code);
  return (
    <button
      type="button"
      onClick={copy}
      title={hint}
      aria-label={`${code}. ${hint}`}
      data-testid={testId}
      className={className}
    >
      <code className={codeClassName}>{code}</code>
      <span className={labelClassName}>{label}</span>
    </button>
  );
}
