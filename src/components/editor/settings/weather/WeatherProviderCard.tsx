'use client';

import { useState } from 'react';
import { Globe, CloudSun, Cloud, Compass, Flag, Sunrise, Wind, Umbrella, Leaf } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import IntegrationCard from '../shared/IntegrationCard';
import SecretField, { type SecretCheck } from '../shared/SecretField';
import type { WeatherKeyCheck } from '@/app/api/weather/check-key/route';
import { getProviderStatus, type WeatherProvider, type WeatherProviderId, type ProviderStatusType } from './providers';
import { weatherProviderName } from '@/lib/weather-provider-names';
import { useTranslate, type TranslateFn } from '@/i18n';

const ICONS: Record<WeatherProviderId, React.ReactNode> = {
  'open-meteo': <Globe className="w-[18px] h-[18px] text-white" />,
  weatherapi: <CloudSun className="w-[18px] h-[18px] text-white" />,
  openweathermap: <Cloud className="w-[18px] h-[18px] text-white" />,
  pirateweather: <Compass className="w-[18px] h-[18px] text-white" />,
  noaa: <Flag className="w-[18px] h-[18px] text-white" />,
  yr: <Sunrise className="w-[18px] h-[18px] text-white" />,
  smhi: <Wind className="w-[18px] h-[18px] text-white" />,
  metoffice: <Umbrella className="w-[18px] h-[18px] text-white" />,
  envcanada: <Leaf className="w-[18px] h-[18px] text-white" />,
};

interface Props {
  provider: WeatherProvider;
  isDefault: boolean;
  keyConfigured: boolean;
  onSecretSaved: () => void;
  onSetDefault: () => void;
  lat: string;
  lon: string;
  units: string;
}

// Discriminated union — pairs a translated label with a kind so CSS branching
// stays off the message text. `kind: 'idle'` is rendered when no test has run.
// `detail` is the raw upstream text, shown behind a disclosure so the
// sentence stays readable.
type TestStatus =
  | { kind: 'success'; message: string }
  | { kind: 'info'; message: string }
  | { kind: 'error'; message: string; detail?: string };

/** Shape of an /api/weather failure body (see `errorResponse` / `setupErrorResponse`). */
interface WeatherErrorBody {
  error?: string;
  detail?: string;
  code?: string;
  setup?: { needs?: string };
}

function translateProviderStatus(type: ProviderStatusType, t: TranslateFn): string {
  switch (type) {
    case 'default-ready':
      return t('settings.weatherPage.providerCard.status.defaultReady');
    case 'default-configured':
      return t('settings.weatherPage.providerCard.status.defaultConfigured');
    case 'default-needs-setup':
      return t('settings.weatherPage.providerCard.status.defaultNeedsSetup');
    case 'ready':
      return t('settings.weatherPage.providerCard.status.ready');
    case 'configured':
      return t('settings.weatherPage.providerCard.status.configured');
    case 'needs-setup':
      return t('settings.weatherPage.providerCard.status.needsSetup');
  }
}

export default function WeatherProviderCard({
  provider,
  isDefault,
  keyConfigured,
  onSecretSaved,
  onSetDefault,
  lat,
  lon,
  units,
}: Props) {
  const t = useTranslate('editor');
  const [testStatus, setTestStatus] = useState<TestStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const providerName = weatherProviderName(provider.id);
  const isFree = provider.secretKey === null;
  const { type } = getProviderStatus(isDefault, keyConfigured, isFree);
  const label = translateProviderStatus(type, t);
  const canUse = isFree || keyConfigured;

  /**
   * Try the typed key against the provider before it is saved. A rejection
   * stays in the form with "Save anyway" (a brand-new OpenWeatherMap key
   * can take a while to activate); an outage is reported as no verdict.
   */
  async function validateKey(value: string): Promise<SecretCheck> {
    const res = await editorFetch('/api/weather/check-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: provider.id, key: value }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const verdict: WeatherKeyCheck = await res.json();
    if (verdict.ok) return { ok: true };
    return {
      ok: false,
      message: verdict.reason === 'rejected'
        ? t('settings.weatherPage.providerCard.keyCheck.rejected', { provider: providerName })
        : t('settings.weatherPage.providerCard.keyCheck.unreachable', { provider: providerName }),
      detail: verdict.detail,
      allowAnyway: true,
    };
  }

  const cardStatusType: 'connected' | 'partial' | 'none' =
    type === 'default-ready' ||
    type === 'default-configured' ||
    type === 'configured' ||
    type === 'ready'
      ? 'connected'
      : type === 'default-needs-setup'
        ? 'partial'
        : 'none';

  async function handleTest() {
    setTesting(true);
    setTestStatus({
      kind: 'info',
      message: t('settings.weatherPage.providerCard.testingButton'),
    });
    try {
      // Regional providers (e.g. SMHI) define `testCoords` inside their
      // coverage area; use those so the Test button reports integration
      // health independently of the user's configured location.
      const testLat = provider.testCoords ? provider.testCoords.lat.toString() : lat;
      const testLon = provider.testCoords ? provider.testCoords.lon.toString() : lon;
      const res = await editorFetch(
        `/api/weather?provider=${provider.id}&lat=${testLat}&lon=${testLon}&units=${units}&type=hourly`,
      );
      if (res.ok) {
        const data = await res.json();
        const hourly = data.hourly ?? data;
        if (Array.isArray(hourly) && hourly.length > 0) {
          setTestStatus({
            kind: 'success',
            message: t('settings.weatherPage.providerCard.testStatus.success', {
              temp: Math.round(hourly[0].temp),
            }),
          });
        } else {
          setTestStatus({
            kind: 'info',
            message: t('settings.weatherPage.providerCard.testStatus.connectedNoData'),
          });
        }
      } else {
        const err: WeatherErrorBody = await res.json().catch(() => ({}));
        // A rejected saved key is a setup problem with one fix; anything
        // else is "couldn't get weather" with the raw text behind Details.
        const rejectedKey = err.code === 'setup' && err.setup?.needs === 'invalidKey';
        setTestStatus({
          kind: 'error',
          message: rejectedKey
            ? t('settings.weatherPage.providerCard.testStatus.rejectedKey', { provider: providerName })
            : t('settings.weatherPage.providerCard.testStatus.failedPlain', { provider: providerName }),
          detail: [err.error, err.detail].filter((part): part is string => typeof part === 'string' && part.length > 0).join(': ') || undefined,
        });
      }
    } catch (e) {
      setTestStatus({
        kind: 'error',
        message: t('settings.weatherPage.providerCard.testStatus.failed', {
          message:
            e instanceof Error
              ? e.message
              : t('settings.weatherPage.providerCard.testStatus.unknownError'),
        }),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <IntegrationCard
      icon={ICONS[provider.id]}
      iconBg={provider.iconBg}
      name={providerName}
      description={t(provider.taglineKey)}
      statusLabel={label}
      statusType={cardStatusType}
      defaultOpen={isDefault}
      fieldId={`weather.provider.${provider.id}`}
    >
      {provider.secretKey === null ? (
        provider.helperTextKey && (
          <p className="text-xs text-hs-text-muted mb-4">{t(provider.helperTextKey)}</p>
        )
      ) : (
        <div className="mb-4">
          <SecretField
            label={t('common.apiKey')}
            secretKey={provider.secretKey}
            placeholder={provider.placeholderKey ? t(provider.placeholderKey) : ''}
            helpText={provider.keyHintKey ? t(provider.keyHintKey) : ''}
            status={keyConfigured}
            onSaved={onSecretSaved}
            validate={validateKey}
            checkingLabel={t('settings.weatherPage.providerCard.keyCheck.checking')}
          />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {isDefault ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-hs-success/10 text-hs-success text-xs">
            {t('settings.weatherPage.providerCard.currentlyDefault')}
          </span>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onSetDefault}
            disabled={!canUse}
          >
            {t('settings.weatherPage.providerCard.setAsDefault')}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing || !canUse}>
          {testing
            ? t('settings.weatherPage.providerCard.testingButton')
            : t('settings.weatherPage.providerCard.testButton')}
        </Button>
        {testStatus && (
          <span
            data-testid={`weather-test-${provider.id}`}
            className={`text-xs ${
              testStatus.kind === 'success'
                ? 'text-hs-success'
                : testStatus.kind === 'error'
                  ? 'text-hs-danger'
                  : 'text-hs-text-muted'
            }`}
          >
            {testStatus.message}
            {testStatus.kind === 'error' && testStatus.detail && (
              <details className="mt-1 text-hs-text-faint">
                <summary className="cursor-pointer">{t('settings.shared.secretField.detailsToggle')}</summary>
                <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">{testStatus.detail}</pre>
              </details>
            )}
          </span>
        )}
      </div>
    </IntegrationCard>
  );
}
