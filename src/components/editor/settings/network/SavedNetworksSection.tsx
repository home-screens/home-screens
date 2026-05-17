'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate, useFormattingLocale, type TranslateFn } from '@/i18n';
import type { SavedNetwork } from './types';

/* ─── Helpers ──────────────────────────────── */

function formatLastUsed(iso: string, t: TranslateFn, formattingLocale: string): string {
  if (iso === 'never') return t('settings.networkPage.savedNetworks.neverUsed');
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const formatted = d.toLocaleDateString(formattingLocale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return t('settings.networkPage.savedNetworks.lastUsed', { date: formatted });
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
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const [networks, setNetworks] = useState<SavedNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forgettingId, setForgettingId] = useState<string | null>(null);
  const [confirmForgetId, setConfirmForgetId] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);

  /* ── Fetch saved networks ──────────────────── */

  const fetchSaved = useCallback(
    async (withPasswords = false) => {
      try {
        const qs = withPasswords ? '?showPasswords=true' : '';
        const res = await editorFetch(`/api/system/network/wifi/saved${qs}`);
        if (res.ok) {
          const data: SavedNetwork[] = await res.json();
          setNetworks(data);
          setError(null);
        } else {
          setError(t('settings.networkPage.savedNetworks.loadError'));
        }
      } catch {
        setError(t('common.serverUnreachable'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    fetchSaved(showPasswords);
  }, [fetchSaved, refreshKey, showPasswords]);

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
          {t('settings.networkPage.savedNetworks.heading')}
        </h3>
        <p className="text-xs text-hs-text-faint">
          {t('settings.networkPage.savedNetworks.loading')}
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.networkPage.savedNetworks.heading')}
        </h3>
        <p className="text-xs text-hs-danger">{error}</p>
      </section>
    );
  }

  if (networks.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.networkPage.savedNetworks.heading')}
        </h3>
        <p className="text-xs text-hs-text-faint">
          {t('settings.networkPage.savedNetworks.empty')}
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-hs-text-secondary uppercase tracking-wider">
          {t('settings.networkPage.savedNetworks.heading')}
        </h3>
        <button
          type="button"
          onClick={() => setShowPasswords(!showPasswords)}
          className="text-xs text-hs-text-muted hover:text-hs-text-body transition-colors"
        >
          {showPasswords
            ? t('settings.networkPage.savedNetworks.hidePasswords')
            : t('settings.networkPage.savedNetworks.showPasswords')}
        </button>
      </div>
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
                <span>{formatLastUsed(network.lastUsed, t, formattingLocale)}</span>
                {network.autoconnect && (
                  <>
                    <span className="text-hs-text-faint">&middot;</span>
                    <span>{t('settings.networkPage.savedNetworks.autoConnect')}</span>
                  </>
                )}
              </div>
              {showPasswords && network.password && (
                <div className="mt-1 text-xs font-mono text-hs-text-muted bg-hs-bg px-2 py-0.5 rounded inline-block">
                  {network.password}
                </div>
              )}
            </div>

            {/* Forget button / confirmation */}
            {confirmForgetId === network.id ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-hs-text-muted">
                  {t('settings.networkPage.savedNetworks.forgetPrompt')}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={forgettingId === network.id}
                  onClick={() => handleForget(network.id)}
                >
                  {forgettingId === network.id
                    ? t('settings.networkPage.savedNetworks.forgettingButton')
                    : t('settings.networkPage.savedNetworks.forgetConfirmYes')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmForgetId(null)}
                >
                  {t('settings.networkPage.savedNetworks.forgetConfirmNo')}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmForgetId(network.id)}
                className="shrink-0"
              >
                {t('settings.networkPage.savedNetworks.forgetButton')}
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
