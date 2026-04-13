'use client';

import { useState, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';

/* ─── Types ────────────────────────────────── */

interface GatewayResult {
  ip: string;
  reachable: boolean;
  latencyMs: number | null;
}

interface InternetResult {
  ip: string;
  reachable: boolean;
  latencyMs: number | null;
}

interface WatchdogResult {
  active: boolean;
  lastRun: string | null;
}

interface DiagnosticsResult {
  available: boolean;
  gateway?: GatewayResult;
  internet?: InternetResult;
  watchdog?: WatchdogResult;
}

/* ─── Helpers ──────────────────────────────── */

function formatLatency(ms: number | null): string {
  if (ms === null) return '';
  return ms < 1 ? '<1ms' : `${Math.round(ms)}ms`;
}

function formatLastRun(lastRun: string | null): string {
  if (!lastRun) return 'Never';
  try {
    const d = new Date(lastRun);
    if (isNaN(d.getTime())) return lastRun;
    const diffMs = Date.now() - d.getTime();
    const diffS = Math.floor(diffMs / 1000);
    if (diffS < 60) return `${diffS} seconds ago`;
    const diffM = Math.floor(diffS / 60);
    if (diffM < 60) return `${diffM} minute${diffM === 1 ? '' : 's'} ago`;
    const diffH = Math.floor(diffM / 60);
    return `${diffH} hour${diffH === 1 ? '' : 's'} ago`;
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
}: {
  label: string;
  ip: string;
  reachable: boolean;
  latencyMs: number | null;
}) {
  const latencyStr = reachable ? formatLatency(latencyMs) : null;
  return (
    <div className="flex items-center gap-2">
      <StatusDot reachable={reachable} />
      <span className="text-sm text-hs-text-primary">
        {label}{' '}
        <span className="text-hs-text-muted text-xs">({ip})</span>
      </span>
      <span className="ml-auto text-xs text-hs-text-muted">
        {reachable
          ? latencyStr
            ? `Reachable (${latencyStr})`
            : 'Reachable'
          : 'Unreachable'}
      </span>
    </div>
  );
}

/* ─── Component ────────────────────────────── */

export default function DiagnosticsSection() {
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
        setError('Diagnostics request failed');
      }
    } catch {
      setError('Failed to reach server');
    } finally {
      setRunning(false);
    }
  }, []);

  const watchdog = result?.watchdog;

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        Diagnostics
      </h3>

      <div className="bg-hs-card rounded-lg border border-hs-border p-4 space-y-3">
        {/* Watchdog status — shown when we have a result */}
        {watchdog !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusDot reachable={watchdog.active} />
              <span className="text-sm text-hs-text-primary">
                WiFi watchdog:{' '}
                <span className={watchdog.active ? 'text-hs-success' : 'text-hs-text-muted'}>
                  {watchdog.active ? 'Active' : 'Inactive'}
                </span>
              </span>
            </div>
            <p className="text-xs text-hs-text-muted pl-4">
              Last watchdog run: {formatLastRun(watchdog.lastRun)}
            </p>
          </div>
        )}

        {/* Results */}
        {result?.available && (
          <div className="space-y-2">
            {result.gateway && (
              <HostRow
                label="Gateway"
                ip={result.gateway.ip}
                reachable={result.gateway.reachable}
                latencyMs={result.gateway.latencyMs}
              />
            )}
            {result.internet && (
              <HostRow
                label="Internet"
                ip={result.internet.ip}
                reachable={result.internet.reachable}
                latencyMs={result.internet.latencyMs}
              />
            )}
          </div>
        )}

        {/* Not available */}
        {result && !result.available && (
          <p className="text-xs text-hs-text-muted">
            Diagnostics are not available on this device.
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
                Testing...
              </span>
            ) : (
              'Test Connection'
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
