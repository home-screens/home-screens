'use client';

import { useCallback, useMemo } from 'react';
import {
  Globe,
  CheckCircle2,
  Send,
  Camera,
  Cloud,
} from 'lucide-react';
import SecretField, { type SecretCheck, type SecretKey, type SecretStatus } from './shared/SecretField';
import IntegrationCard from './shared/IntegrationCard';
import { useEditorStore } from '@/stores/editor-store';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate, type TranslateFn } from '@/i18n';
import { isServiceConnected, servicesForPage } from '@/lib/connectable-services';

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

function getStatusInfo(
  status: SecretStatus,
  keys: SecretKey[],
  t: TranslateFn,
): { label: string; type: 'connected' | 'partial' | 'none' } {
  const configured = keys.filter((k) => !!status[k]).length;
  if (configured === 0) {
    return { label: t('settings.integrationsPage.status.notConfigured'), type: 'none' };
  }
  if (configured === keys.length) {
    return { label: t('settings.integrationsPage.status.connected'), type: 'connected' };
  }
  return {
    label: t('settings.integrationsPage.status.partial', {
      configured,
      total: keys.length,
    }),
    type: 'partial',
  };
}

/* ─── Google card bands ───────────────────── */

const GOOGLE_CALENDAR_DOCS = 'https://homescreens.dev/docs/getting-started#calendar-setup';
const GOOGLE_PHOTOS_DOCS = 'https://homescreens.dev/docs/backgrounds';
const GOOGLE_MAPS_DOCS = 'https://homescreens.dev/docs/modules#before-some-modules-will-work';

/**
 * Heading for one group of credentials inside the Google card: what the
 * credentials are for, one sentence on how to make them, and the walkthrough.
 * Google requires you to create an OAuth client in the Cloud Console before
 * any of this works, and the card previously buried that in the tail of a
 * five-line field help string.
 */
function GoogleBand({
  title,
  help,
  docsHref,
  t,
}: {
  title: string;
  help: string;
  docsHref: string;
  t: TranslateFn;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-hs-text-body">{title}</span>
        <a
          href={docsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-hs-accent hover:underline"
        >
          {t('settings.integrationsPage.google.stepByStep')}
        </a>
      </div>
      <p className="mt-0.5 max-w-[640px] text-xs text-hs-text-faint">{help}</p>
    </div>
  );
}

/**
 * Google Client IDs always end in `.apps.googleusercontent.com`. Typing
 * anything else used to save and report "Saved successfully", so the failure
 * surfaced later as a calendar that never connected, with nothing pointing
 * back at the field. `allowAnyway` is deliberately false: a value of this
 * shape cannot work, so there is no judgement call to hand back to the user.
 */
const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

/* ─── Main component ──────────────────────── */

export default function IntegrationsSection() {
  const t = useTranslate('editor');
  const { status, loading, refetch } = useSecretStatus();

  const validateGoogleClientId = useCallback(
    async (value: string): Promise<SecretCheck> =>
      value.trim().endsWith(GOOGLE_CLIENT_ID_SUFFIX)
        ? { ok: true }
        : {
            ok: false,
            message: t('settings.integrationsPage.google.clientIdInvalid', {
              suffix: GOOGLE_CLIENT_ID_SUFFIX,
            }),
            allowAnyway: false,
          },
    [t],
  );
  const advancedMode = useEditorStore((s) => s.config?.settings?.advancedMode ?? false);

  // Memoize visible integrations + per-card status info so the labels follow
  // the active locale while the underlying brand names stay verbatim.
  const { visibleIntegrations, cardStatus } = useMemo(() => {
    const visible = servicesForPage('integrations', advancedMode);
    return {
      visibleIntegrations: visible,
      cardStatus: {
        // The Photos-import web client is optional — it must not demote a
        // fully configured Calendar+Maps setup from "Connected" to "partial".
        google: getStatusInfo(status, ['google_client_id', 'google_client_secret', 'google_maps_key'], t),
        immich: getStatusInfo(status, ['immich_url', 'immich_api_key'], t),
        microsoft: getStatusInfo(status, ['microsoft_client_id'], t),
        unsplash: getStatusInfo(status, ['unsplash_access_key'], t),
        nasa: getStatusInfo(status, ['nasa_api_key'], t),
        todoist: getStatusInfo(status, ['todoist_token'], t),
        tomtom: getStatusInfo(status, ['tomtom_key'], t),
        github: getStatusInfo(status, ['github_token'], t),
      },
    };
  }, [advancedMode, status, t]);

  if (loading) {
    return (
      <section>
        <p className="text-xs text-hs-text-faint">{t('settings.integrationsPage.loadingStatus')}</p>
      </section>
    );
  }

  // Connected means "the keys this service actually needs are present", the
  // same rule the Status page applies, so the two pages agree on the count.
  const configuredCount = visibleIntegrations.filter((service) =>
    isServiceConnected(service, Object.keys(status).filter((k) => status[k as SecretKey])),
  ).length;

  const { google, immich, microsoft, unsplash, nasa, todoist, tomtom, github } = cardStatus;

  return (
    <section>

      {/* Summary bar */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-hs-hover border border-hs-border-strong/60 rounded-lg mb-7">
        <div className={`w-2 h-2 rounded-full ${configuredCount > 0 ? 'bg-hs-success' : 'bg-hs-card'}`} />
        <span className="text-[13px] text-hs-text-muted">
          <strong className="text-hs-text-secondary">{configuredCount}</strong>
          {t('settings.integrationsPage.summary.configuredCountPart1')}
          <strong className="text-hs-text-secondary">{visibleIntegrations.length}</strong>
          {t('settings.integrationsPage.summary.configuredCountPart2')}
        </span>
      </div>

      {/* Google — full width */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          {t('settings.integrationsPage.groups.googleEcosystem')}
        </div>
        <IntegrationCard
          fieldId="integrations.google"
          icon={<GoogleIcon />}
          iconBg="linear-gradient(135deg, #4285f4 0%, #34a853 50%, #fbbc05 75%, #ea4335 100%)"
          name={t('settings.integrationsPage.google.name')}
          description={t('settings.integrationsPage.google.description')}
          statusLabel={google.label}
          statusType={google.type}
          defaultOpen={google.type !== 'none'}
        >
          {/* Three labelled bands rather than three anonymous hairline-
              separated rows. The card holds five credentials for three
              unrelated jobs, and nothing used to say which two the calendar
              needs, or that the middle pair is a different Google login. */}
          <GoogleBand
            title={t('settings.integrationsPage.google.calendarBand.title')}
            help={t('settings.integrationsPage.google.calendarBand.help')}
            docsHref={GOOGLE_CALENDAR_DOCS}
            t={t}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SecretField
              label={t('settings.integrationsPage.google.clientIdLabel')}
              secretKey="google_client_id"
              placeholder={t('settings.integrationsPage.google.clientIdPlaceholder')}
              helpText={t('settings.integrationsPage.google.clientIdHelp')}
              status={!!status.google_client_id}
              onSaved={refetch}
              validate={validateGoogleClientId}
            />
            <SecretField
              label={t('settings.integrationsPage.google.clientSecretLabel')}
              secretKey="google_client_secret"
              placeholder={t('settings.integrationsPage.google.clientSecretPlaceholder')}
              helpText={t('settings.integrationsPage.google.clientSecretHelp')}
              status={!!status.google_client_secret}
              onSaved={refetch}
            />
          </div>
          {/* Google Photos import uses a separate "Web application" OAuth
              client: the picker scope is rejected by the TV/device flow the
              calendar client uses. */}
          <div className="border-t border-hs-border-strong/60 mt-4 pt-4">
            <GoogleBand
              title={t('settings.integrationsPage.google.photosBand.title')}
              help={t('settings.integrationsPage.google.photosBand.help')}
              docsHref={GOOGLE_PHOTOS_DOCS}
              t={t}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SecretField
              label={t('settings.integrationsPage.google.webClientIdLabel')}
              secretKey="google_web_client_id"
              placeholder={t('settings.integrationsPage.google.clientIdPlaceholder')}
              helpText={t('settings.integrationsPage.google.webClientIdHelp')}
              status={!!status.google_web_client_id}
              onSaved={refetch}
              validate={validateGoogleClientId}
            />
            <SecretField
              label={t('settings.integrationsPage.google.webClientSecretLabel')}
              secretKey="google_web_client_secret"
              placeholder={t('settings.integrationsPage.google.clientSecretPlaceholder')}
              helpText={t('settings.integrationsPage.google.webClientSecretHelp')}
              status={!!status.google_web_client_secret}
              onSaved={refetch}
            />
          </div>
          <div className="border-t border-hs-border-strong/60 mt-4 pt-4">
            <GoogleBand
              title={t('settings.integrationsPage.google.mapsBand.title')}
              help={t('settings.integrationsPage.google.mapsBand.help')}
              docsHref={GOOGLE_MAPS_DOCS}
              t={t}
            />
          </div>
          <div className="lg:max-w-[calc(50%-0.5rem)]">
            <SecretField
              label={t('settings.integrationsPage.google.mapsKeyLabel')}
              secretKey="google_maps_key"
              placeholder={t('settings.integrationsPage.google.mapsKeyPlaceholder')}
              helpText={t('settings.integrationsPage.google.mapsKeyHelp')}
              status={!!status.google_maps_key}
              onSaved={refetch}
            />
          </div>
        </IntegrationCard>
      </div>

      {/* Photos & Backgrounds — 2-col masonry */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          {t('settings.integrationsPage.groups.photosAndBackgrounds')}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
          <IntegrationCard
            fieldId="integrations.immich"
            icon={<Camera className="w-[18px] h-[18px] text-white" />}
            iconBg="#4250af"
            name={t('settings.integrationsPage.immich.name')}
            description={t('settings.integrationsPage.immich.description')}
            statusLabel={immich.label}
            statusType={immich.type}
          >
            <div className="space-y-4">
              <SecretField
                label={t('settings.integrationsPage.immich.urlLabel')}
                secretKey="immich_url"
                placeholder={t('settings.integrationsPage.immich.urlPlaceholder')}
                helpText={t('settings.integrationsPage.immich.urlHelp')}
                status={!!status.immich_url}
                onSaved={refetch}
              />
              <SecretField
                label={t('common.apiKey')}
                secretKey="immich_api_key"
                placeholder={t('settings.integrationsPage.immich.apiKeyPlaceholder')}
                helpText={t('settings.integrationsPage.immich.apiKeyHelp')}
                status={!!status.immich_api_key}
                onSaved={refetch}
              />
            </div>
          </IntegrationCard>

          <IntegrationCard
            fieldId="integrations.microsoft"
            icon={<Cloud className="w-[18px] h-[18px] text-white" />}
            iconBg="#0078d4"
            name={t('settings.integrationsPage.microsoft.name')}
            description={t('settings.integrationsPage.microsoft.description')}
            statusLabel={microsoft.label}
            statusType={microsoft.type}
          >
            <SecretField
              label={t('settings.integrationsPage.microsoft.clientIdLabel')}
              secretKey="microsoft_client_id"
              placeholder={t('settings.integrationsPage.microsoft.clientIdPlaceholder')}
              helpText={t('settings.integrationsPage.microsoft.clientIdHelp')}
              status={!!status.microsoft_client_id}
              onSaved={refetch}
            />
          </IntegrationCard>

          <IntegrationCard
            fieldId="integrations.unsplash"
            icon={<UnsplashIcon />}
            iconBg="#111111"
            name={t('settings.integrationsPage.unsplash.name')}
            description={t('settings.integrationsPage.unsplash.description')}
            statusLabel={unsplash.label}
            statusType={unsplash.type}
          >
            <SecretField
              label={t('settings.integrationsPage.unsplash.accessKeyLabel')}
              secretKey="unsplash_access_key"
              placeholder={t('settings.integrationsPage.unsplash.accessKeyPlaceholder')}
              helpText={t('settings.integrationsPage.unsplash.accessKeyHelp')}
              status={!!status.unsplash_access_key}
              onSaved={refetch}
            />
          </IntegrationCard>

          <IntegrationCard
            fieldId="integrations.nasa"
            icon={<Globe className="w-[18px] h-[18px] text-white" />}
            iconBg="#0b3d91"
            name={t('settings.integrationsPage.nasa.name')}
            description={t('settings.integrationsPage.nasa.description')}
            statusLabel={nasa.label}
            statusType={nasa.type}
          >
            <SecretField
              label={t('common.apiKey')}
              secretKey="nasa_api_key"
              placeholder={t('settings.integrationsPage.nasa.apiKeyPlaceholder')}
              helpText={t('settings.integrationsPage.nasa.apiKeyHelp')}
              status={!!status.nasa_api_key}
              onSaved={refetch}
            />
          </IntegrationCard>
        </div>
      </div>

      {/* Services — 2-col masonry */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          {t('settings.integrationsPage.groups.services')}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
          <IntegrationCard
            fieldId="integrations.todoist"
            icon={<CheckCircle2 className="w-[18px] h-[18px] text-white" />}
            iconBg="#e44332"
            name={t('settings.integrationsPage.todoist.name')}
            description={t('settings.integrationsPage.todoist.description')}
            statusLabel={todoist.label}
            statusType={todoist.type}
          >
            <SecretField
              label={t('settings.integrationsPage.todoist.tokenLabel')}
              secretKey="todoist_token"
              placeholder={t('settings.integrationsPage.todoist.tokenPlaceholder')}
              helpText={t('settings.integrationsPage.todoist.tokenHelp')}
              status={!!status.todoist_token}
              onSaved={refetch}
            />
          </IntegrationCard>

          <IntegrationCard
            fieldId="integrations.tomtom"
            icon={<Send className="w-[18px] h-[18px] text-white" />}
            iconBg="#333333"
            name={t('settings.integrationsPage.tomtom.name')}
            description={t('settings.integrationsPage.tomtom.description')}
            statusLabel={tomtom.label}
            statusType={tomtom.type}
          >
            <SecretField
              label={t('common.apiKey')}
              secretKey="tomtom_key"
              placeholder={t('settings.integrationsPage.tomtom.keyPlaceholder')}
              helpText={t('settings.integrationsPage.tomtom.keyHelp')}
              status={!!status.tomtom_key}
              onSaved={refetch}
            />
          </IntegrationCard>

          {advancedMode && (
            <IntegrationCard
              fieldId="integrations.github"
              icon={<GitHubIcon />}
              iconBg="#24292e"
              name={t('settings.integrationsPage.github.name')}
              description={t('settings.integrationsPage.github.description')}
              statusLabel={github.label}
              statusType={github.type}
            >
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-hs-accent-soft text-hs-accent-hover text-[11px] mb-3">
                {t('settings.integrationsPage.github.optionalBadge')}
              </div>
              <SecretField
                label={t('settings.integrationsPage.github.tokenLabel')}
                secretKey="github_token"
                placeholder={t('settings.integrationsPage.github.tokenPlaceholder')}
                helpText={t('settings.integrationsPage.github.tokenHelp')}
                status={!!status.github_token}
                onSaved={refetch}
              />
            </IntegrationCard>
          )}
        </div>
      </div>
    </section>
  );
}
