'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';

/**
 * A Copy button's two halves in one place: put the text on the clipboard
 * (through `copyText`, which carries the plain-HTTP fallback) and show a
 * "copied" state for a moment, only when the copy really happened.
 *
 * `copy` answers whether it worked, so a caller with somewhere to say
 * "that did not copy" can say it.
 */
export function useCopyFlash(ms = 2000): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      if (!ok) return false;
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), ms);
      return true;
    },
    [ms],
  );

  return { copied, copy };
}
