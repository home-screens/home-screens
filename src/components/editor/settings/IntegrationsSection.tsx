'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Globe,
  CheckCircle2,
  Send,
  Camera,
  Cloud,
} from 'lucide-react';
import SecretField, { type SecretKey } from './shared/SecretField';
import IntegrationCard from './shared/IntegrationCard';
import GoogleIntegrationCard from './GoogleIntegrationCard';
import MealieIntegrationCard, { MEALIE_CARD_FIELD_ID } from './MealieIntegrationCard';
import { getStatusInfo } from './shared/integration-status';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useGoogleApps } from '@/hooks/useGoogleApps';
import { useTranslate } from '@/i18n';
import { isServiceConnected, servicesForPage } from '@/lib/connectable-services';

/* ─── Service icons (inline SVG for branded ones) ── */

function UnsplashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M7.5 6.75V0h9v6.75h-9zm9 3.75H24V24H0V10.5h7.5v6.75h9V10.5z" />
    </svg>
  );
}

/* ─── Main component ──────────────────────── */

export default function IntegrationsSection() {
  const t = useTranslate('editor');
  const { status, loading, refetch } = useSecretStatus();
  // The Meals page links here to the Mealie card; arriving that way opens it
  // so the address and token are right under the highlight.
  const arrivingAt = useSearchParams()?.get('highlight') ?? null;
  // Which Google app signs in decides both the Google card and whether
  // Google counts as connected, so it is re-read whenever a key is saved.
  const { apps, loading: appsLoading, refetch: refetchApps } = useGoogleApps();
  const refetchGoogle = useCallback(() => {
    refetch();
    void refetchApps();
  }, [refetch, refetchApps]);
  // Memoize visible integrations + per-card status info so the labels follow
  // the active locale while the underlying brand names stay verbatim.
  const { visibleIntegrations, cardStatus } = useMemo(() => {
    const visible = servicesForPage('integrations');
    return {
      visibleIntegrations: visible,
      cardStatus: {
        immich: getStatusInfo(status, ['immich_url', 'immich_api_key'], t),
        microsoft: getStatusInfo(status, ['microsoft_client_id'], t),
        unsplash: getStatusInfo(status, ['unsplash_access_key'], t),
        nasa: getStatusInfo(status, ['nasa_api_key'], t),
        todoist: getStatusInfo(status, ['todoist_token'], t),
        tomtom: getStatusInfo(status, ['tomtom_key'], t),
      },
    };
  }, [status, t]);

  if (loading || appsLoading) {
    return (
      <section>
        <p className="text-xs text-hs-text-faint">{t('settings.integrationsPage.loadingStatus')}</p>
      </section>
    );
  }

  // Connected means "the keys this service actually needs are present" (or,
  // for Google, that Home Screens' own app signs Calendar in), the same rule
  // the Status page applies, so the two pages agree on the count.
  const configuredCount = visibleIntegrations.filter((service) =>
    isServiceConnected(service, Object.keys(status).filter((k) => status[k as SecretKey]), apps),
  ).length;

  const { immich, microsoft, unsplash, nasa, todoist, tomtom } = cardStatus;

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
        <GoogleIntegrationCard status={status} onSaved={refetchGoogle} apps={apps} />
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
          <MealieIntegrationCard
            status={status}
            onSaved={refetch}
            defaultOpen={arrivingAt === MEALIE_CARD_FIELD_ID}
          />

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
        </div>
      </div>
    </section>
  );
}
