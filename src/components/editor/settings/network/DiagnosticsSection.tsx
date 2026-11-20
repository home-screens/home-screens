'use client';

import { useState, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useLocale, useTranslate, type TranslateFn } from '@/i18n';
import { relativeTimeFormatter } from '@/i18n/formatters';
import type { DiagnosticsResult } from '@/lib/network-types';

/* ─── Helpers ──────────────────────────────── */

function formatLatency(ms: number | null, t: TranslateFn): string {
  if (ms === null) return '';
  return ms < 1
    ? t('settings.networkPage.diagnostics.host.latencyUnderOneMs')
    : t('settings.networkPage.diagnostics.host.latencyMs', { ms: Math.round(ms) });
}

/** "45 seconds ago", "1 minute ago", "3 hours ago" in the editor's language, counting whole units. */
function formatLastRun(lastRun: string | null, t: TranslateFn, locale: string): string {
  if (!lastRun) return t('settings.networkPage.diagnostics.watchdog.never');
  const at = new Date(lastRun).getTime();
  if (isNaN(at)) return lastRun;
  try {
    const rtf = relativeTimeFormatter(locale, 'always', 'long');
    const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
    if (seconds < 60) return rtf.format(-seconds, 'second');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    return rtf.format(-Math.floor(minutes / 60), 'hour');
  } catch {
    return lastRun;
  }
}

/* ─── Sub-components ───────────────────────── */

function StatusDot({ reachable }: { reachable: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
        reachable ? 'bg-hs-success' : 'bg-red-500'
      }`}
    />
  );
}

function HostRow({
  label,
  ip,
  reachable,
  latencyMs,
  t,
}: {
  label: string;
  ip: string;
  reachable: boolean;
  latencyMs: number | null;
  t: TranslateFn;
}) {
  const latencyStr = reachable ? formatLatency(latencyMs, t) : null;
  let statusText: string;
  if (!reachable) {
    statusText = t('settings.networkPage.diagnostics.host.unreachable');
  } else if (latencyStr) {
    statusText = t('settings.networkPage.diagnostics.host.reachableWithLatency', { latency: latencyStr });
  } else {
    statusText = t('settings.networkPage.diagnostics.host.reachable');
  }
  return (
    <div className="flex items-center gap-2">
      <StatusDot reachable={reachable} />
      <span className="text-sm text-hs-text-primary">
        {label}{' '}
        <span className="text-hs-text-muted text-xs">({ip})</span>
      </span>
      <span className="ml-auto text-xs text-hs-text-muted">
        {statusText}
      </span>
    </div>
  );
}

/* ─── Component ────────────────────────────── */

export default function DiagnosticsSection() {
  const t = useTranslate('editor');
  const locale = useLocale();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = useCallback(async () => {
    setRunning(true);
    setError(null);

    try {
      const res = await editorFetch('/api/system/network/diagnostics');
      if (res.ok) {
        const data: DiagnosticsResult = await res.json();
        setResult(data);
      } else {
        setError(t('settings.networkPage.diagnostics.requestFailed'));
      }
    } catch {
      setError(t('common.serverUnreachable'));
    } finally {
      setRunning(false);
    }
  }, [t]);

  const watchdog = result?.watchdog;

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.networkPage.diagnostics.heading')}
      </h3>

      <div className="bg-hs-card rounded-lg border border-hs-border p-4 space-y-3">
        {/* Watchdog status — shown when we have a result */}
        {watchdog !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusDot reachable={watchdog.active} />
              <span className="text-sm text-hs-text-primary">
                {t('settings.networkPage.diagnostics.watchdog.label')}{' '}
                <span className={watchdog.active ? 'text-hs-success' : 'text-hs-text-muted'}>
                  {watchdog.active
                    ? t('settings.networkPage.diagnostics.watchdog.active')
                    : t('settings.networkPage.diagnostics.watchdog.inactive')}
                </span>
              </span>
            </div>
            <p className="text-xs text-hs-text-muted pl-4">
              {t('settings.networkPage.diagnostics.watchdog.lastRun', { time: formatLastRun(watchdog.lastRun, t, locale) })}
            </p>
          </div>
        )}

        {/* Results */}
        {result?.available && (
          <div className="space-y-2">
            {result.gateway && (
              <HostRow
                label={t('settings.networkPage.diagnostics.host.gatewayLabel')}
                ip={result.gateway.ip}
                reachable={result.gateway.reachable}
                latencyMs={result.gateway.latencyMs}
                t={t}
              />
            )}
            {result.internet && (
              <HostRow
                label={t('settings.networkPage.diagnostics.host.internetLabel')}
                ip={result.internet.ip}
                reachable={result.internet.reachable}
                latencyMs={result.internet.latencyMs}
                t={t}
              />
            )}
          </div>
        )}

        {/* Not available */}
        {result && !result.available && (
          <p className="text-xs text-hs-text-muted">
            {t('settings.networkPage.diagnostics.unavailable')}
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-hs-danger">{error}</p>
        )}

        {/* Test button — at the bottom so content flows naturally */}
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            disabled={running}
          >
            {running ? (
              <span className="flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {t('settings.networkPage.diagnostics.testingButton')}
              </span>
            ) : (
              t('settings.networkPage.diagnostics.testButton')
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
