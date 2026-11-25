'use client';

import { useCallback, useEffect, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { ServiceAttention } from '@/lib/service-attention';

/**
 * Set-up services that are not working right now (GET
 * /api/secrets/attention), by service id. Empty until it arrives and after a
 * failed request, so a hiccup shows the page as it always was rather than a
 * warning that may not be true.
 */
export function useServiceAttention(): {
  attention: Partial<Record<string, ServiceAttention>>;
  /** True until the first answer (or failure), so a page can open a troubled card on its first draw. */
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [attention, setAttention] = useState<Partial<Record<string, ServiceAttention>>>({});
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await editorFetch('/api/secrets/attention');
      const body = res.ok ? (await res.json()) as { attention?: Partial<Record<string, ServiceAttention>> } : null;
      setAttention(body?.attention ?? {});
    } catch {
      setAttention({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { attention, loading, refetch };
}
