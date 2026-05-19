'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import {
  Globe,
  CheckCircle2,
  Send,
  Camera,
} from 'lucide-react';
import SecretField, { type SecretKey, type SecretStatus } from './shared/SecretField';
import IntegrationCard from './shared/IntegrationCard';
import { useEditorStore } from '@/stores/editor-store';

/* ─── Service icons (inline SVG for branded ones) ── */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function UnsplashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M7.5 6.75V0h9v6.75h-9zm9 3.75H24V24H0V10.5h7.5v6.75h9V10.5z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

/* ─── Helpers ──────────────────────────────── */

type Integration = {
  name: string;
  keys: SecretKey[];
};

const INTEGRATIONS: Integration[] = [
  { name: 'Google', keys: ['google_client_id', 'google_client_secret', 'google_maps_key'] },
  { name: 'Immich', keys: ['immich_url', 'immich_api_key'] },
  { name: 'Unsplash', keys: ['unsplash_access_key'] },
  { name: 'NASA', keys: ['nasa_api_key'] },
  { name: 'Todoist', keys: ['todoist_token'] },
  { name: 'TomTom', keys: ['tomtom_key'] },
  { name: 'GitHub', keys: ['github_token'] },
];

function getStatusInfo(
  status: SecretStatus,
  keys: SecretKey[],
): { label: string; type: 'connected' | 'partial' | 'none' } {
  const configured = keys.filter((k) => !!status[k]).length;
  if (configured === 0) return { label: 'Not configured', type: 'none' };
  if (configured === keys.length) return { label: 'Connected', type: 'connected' };
  return { label: `${configured} of ${keys.length}`, type: 'partial' };
}

/* ─── Main component ──────────────────────── */

export default function IntegrationsSection() {
  const [status, setStatus] = useState<SecretStatus>({});
  const [loading, setLoading] = useState(true);
  const advancedMode = useEditorStore((s) => s.config?.settings?.advancedMode ?? false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await editorFetch('/api/secrets');
      if (res.ok) {
        const data: SecretStatus = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.debug('Failed to fetch secret status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading) {
    return (
      <section>
        <p className="text-xs text-hs-text-faint">Loading integration status...</p>
      </section>
    );
  }

  const visibleIntegrations = advancedMode
    ? INTEGRATIONS
    : INTEGRATIONS.filter((i) => i.name !== 'GitHub');
  const configuredCount = visibleIntegrations.filter((i) =>
    i.keys.some((k) => !!status[k]),
  ).length;

  const google = getStatusInfo(status, ['google_client_id', 'google_client_secret', 'google_maps_key']);
  const immich = getStatusInfo(status, ['immich_url', 'immich_api_key']);
  const unsplash = getStatusInfo(status, ['unsplash_access_key']);
  const nasa = getStatusInfo(status, ['nasa_api_key']);
  const todoist = getStatusInfo(status, ['todoist_token']);
  const tomtom = getStatusInfo(status, ['tomtom_key']);
  const github = getStatusInfo(status, ['github_token']);

  return (
    <section>
      {/* Header */}
      <div className="mb-7">
        <h2 className="text-lg font-semibold text-hs-text-primary mb-1.5">Integrations</h2>
        <p className="text-[13px] text-hs-text-faint">
          Connect external services to unlock additional modules and features. API keys are stored locally and never leave your device.
        </p>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-hs-hover border border-hs-border-strong/60 rounded-lg mb-7">
        <div className={`w-2 h-2 rounded-full ${configuredCount > 0 ? 'bg-hs-success' : 'bg-hs-card'}`} />
        <span className="text-[13px] text-hs-text-muted">
          <strong className="text-hs-text-secondary">{configuredCount}</strong> of{' '}
          <strong className="text-hs-text-secondary">{visibleIntegrations.length}</strong> integrations configured
        </span>
      </div>

      {/* Google — full width */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          Google Ecosystem
        </div>
        <IntegrationCard
          icon={<GoogleIcon />}
          iconBg="linear-gradient(135deg, #4285f4 0%, #34a853 50%, #fbbc05 75%, #ea4335 100%)"
          name="Google"
          description="Calendar, Maps"
          statusLabel={google.label}
          statusType={google.type}
          defaultOpen={google.type !== 'none'}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SecretField
              label="OAuth Client ID"
              secretKey="google_client_id"
              placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
              helpText="Create at console.cloud.google.com → APIs & Services → Credentials. Use type: TVs and Limited Input devices."
              status={!!status.google_client_id}
              onSaved={fetchStatus}
            />
            <SecretField
              label="OAuth Client Secret"
              secretKey="google_client_secret"
              placeholder="e.g. GOCSPX-..."
              helpText="The client secret from the same OAuth credential above."
              status={!!status.google_client_secret}
              onSaved={fetchStatus}
            />
          </div>
          <div className="border-t border-hs-border-strong/60 mt-4 pt-4 lg:max-w-[calc(50%-0.5rem)]">
            <SecretField
              label="Maps API Key"
              secretKey="google_maps_key"
              placeholder="Paste your Google Maps API key"
              helpText="Optional — for traffic/commute widget. Enable the Routes API in the same Cloud Console project."
              status={!!status.google_maps_key}
              onSaved={fetchStatus}
            />
          </div>
        </IntegrationCard>
      </div>

      {/* Photos & Backgrounds — 2-col masonry */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          Photos &amp; Backgrounds
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
          <IntegrationCard
            icon={<Camera className="w-[18px] h-[18px] text-white" />}
            iconBg="#4250af"
            name="Immich"
            description="Self-hosted photo library"
            statusLabel={immich.label}
            statusType={immich.type}
          >
            <div className="space-y-4">
              <SecretField
                label="Server URL"
                secretKey="immich_url"
                placeholder="e.g. http://192.168.1.50:2283"
                helpText="The base URL of your Immich instance."
                status={!!status.immich_url}
                onSaved={fetchStatus}
              />
              <SecretField
                label="API Key"
                secretKey="immich_api_key"
                placeholder="Paste your Immich API key"
                helpText="Create at Immich → Account Settings → API Keys."
                status={!!status.immich_api_key}
                onSaved={fetchStatus}
              />
            </div>
          </IntegrationCard>

          <IntegrationCard
            icon={<UnsplashIcon />}
            iconBg="#111111"
            name="Unsplash"
            description="HD photo backgrounds by category"
            statusLabel={unsplash.label}
            statusType={unsplash.type}
          >
            <SecretField
              label="Access Key"
              secretKey="unsplash_access_key"
              placeholder="Paste your Unsplash access key"
              helpText="Free at unsplash.com/developers — 50 requests/hour on free tier."
              status={!!status.unsplash_access_key}
              onSaved={fetchStatus}
            />
          </IntegrationCard>

          <IntegrationCard
            icon={<Globe className="w-[18px] h-[18px] text-white" />}
            iconBg="#0b3d91"
            name="NASA"
            description="Astronomy Picture of the Day"
            statusLabel={nasa.label}
            statusType={nasa.type}
          >
            <SecretField
              label="API Key"
              secretKey="nasa_api_key"
              placeholder="Paste your NASA API key"
              helpText="Free at api.nasa.gov — 1,000 requests/hour. Image Library search works without a key."
              status={!!status.nasa_api_key}
              onSaved={fetchStatus}
            />
          </IntegrationCard>
        </div>
      </div>

      {/* Services — 2-col masonry */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          Services
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
          <IntegrationCard
            icon={<CheckCircle2 className="w-[18px] h-[18px] text-white" />}
            iconBg="#e44332"
            name="Todoist"
            description="Display tasks from your projects"
            statusLabel={todoist.label}
            statusType={todoist.type}
          >
            <SecretField
              label="API Token"
              secretKey="todoist_token"
              placeholder="Paste your Todoist API token"
              helpText="Get your token from app.todoist.com/app/settings/integrations/developer. Validated on save."
              status={!!status.todoist_token}
              onSaved={fetchStatus}
            />
          </IntegrationCard>

          <IntegrationCard
            icon={<Send className="w-[18px] h-[18px] text-white" />}
            iconBg="#333333"
            name="TomTom"
            description="Traffic & commute times"
            statusLabel={tomtom.label}
            statusType={tomtom.type}
          >
            <SecretField
              label="API Key"
              secretKey="tomtom_key"
              placeholder="Paste your TomTom API key"
              helpText="Free at developer.tomtom.com. On your key, enable Geocoding API, Reverse Geocoding API, and Routing API (per-key, not just account-wide). Alternative to Google Maps."
              status={!!status.tomtom_key}
              onSaved={fetchStatus}
            />
          </IntegrationCard>

          {advancedMode && (
            <IntegrationCard
              icon={<GitHubIcon />}
              iconBg="#24292e"
              name="GitHub"
              description="Higher rate limit for version checks"
              statusLabel={github.label}
              statusType={github.type}
            >
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-hs-accent-soft text-hs-accent-hover text-[11px] mb-3">
                Optional
              </div>
              <SecretField
                label="Personal Access Token"
                secretKey="github_token"
                placeholder="Paste your GitHub token"
                helpText="Increases rate limit from 60 to 5,000 req/hr. Create at github.com/settings/tokens (no scopes needed)."
                status={!!status.github_token}
                onSaved={fetchStatus}
              />
            </IntegrationCard>
          )}
        </div>
      </div>
    </section>
  );
}
