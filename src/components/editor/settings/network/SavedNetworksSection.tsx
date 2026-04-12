'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import type { SavedNetwork } from './types';

/* ─── Helpers ──────────────────────────────── */

function formatLastUsed(iso: string): string {
  if (iso === 'never') return 'Never used';
  try {
    const d = new Date(iso);
    return `Last used ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch {
    return iso;
  }
}

/* ─── Props ────────────────────────────────── */

interface SavedNetworksSectionProps {
  /** Re-fetch trigger — increment to force refresh */
  refreshKey: number;
}

/* ─── Component ────────────────────────────── */

export default function SavedNetworksSection({ refreshKey }: SavedNetworksSectionProps) {
  const [networks, setNetworks] = useState<SavedNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forgettingId, setForgettingId] = useState<string | null>(null);
  const [confirmForgetId, setConfirmForgetId] = useState<string | null>(null);

  /* ── Fetch saved networks ──────────────────── */

  const fetchSaved = useCallback(async () => {
    try {
      const res = await editorFetch('/api/system/network/wifi/saved');
      if (res.ok) {
        const data: SavedNetwork[] = await res.json();
        setNetworks(data);
        setError(null);
      } else {
        setError('Failed to load saved networks');
      }
    } catch {
      setError('Failed to reach server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved, refreshKey]);

  /* ── Forget a network ──────────────────────── */

  const handleForget = useCallback(
    async (connectionId: string) => {
      setForgettingId(connectionId);
      try {
        const res = await editorFetch('/api/system/network/wifi/saved', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId }),
        });
        if (res.ok) {
          setNetworks((prev) => prev.filter((n) => n.id !== connectionId));
        }
      } catch {
        // Silently fail — network will remain in list
      } finally {
        setForgettingId(null);
        setConfirmForgetId(null);
      }
    },
    [],
  );

  if (loading) {
    return (
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          Saved Networks
        </h3>
        <p className="text-xs text-hs-text-faint">Loading saved networks...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          Saved Networks
        </h3>
        <p className="text-xs text-hs-danger">{error}</p>
      </section>
    );
  }

  if (networks.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          Saved Networks
        </h3>
        <p className="text-xs text-hs-text-faint">No saved WiFi networks.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        Saved Networks
      </h3>
      <div className="space-y-1">
        {networks.map((network) => (
          <div
            key={network.id}
            className="flex items-center gap-3 rounded-md px-3 py-2 bg-hs-input border border-hs-border"
          >
            {/* Network info */}
            <div className="flex-1 min-w-0">
              <span className="text-sm text-hs-text-primary truncate block">
                {network.name}
              </span>
              <div className="flex items-center gap-2 text-xs text-hs-text-muted">
                <span>{formatLastUsed(network.lastUsed)}</span>
                {network.autoconnect && (
                  <>
                    <span className="text-hs-text-faint">&middot;</span>
                    <span>Auto-connect</span>
                  </>
                )}
              </div>
            </div>

            {/* Forget button / confirmation */}
            {confirmForgetId === network.id ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-hs-text-muted">Forget?</span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={forgettingId === network.id}
                  onClick={() => handleForget(network.id)}
                >
                  {forgettingId === network.id ? 'Removing...' : 'Yes'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmForgetId(null)}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmForgetId(network.id)}
                className="shrink-0"
              >
                Forget
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
