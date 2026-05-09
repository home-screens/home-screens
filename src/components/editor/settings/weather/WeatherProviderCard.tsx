'use client';

import { useState } from 'react';
import { Globe, CloudSun, Cloud, Compass, Flag, Sunrise, Wind, Umbrella, Leaf } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import IntegrationCard from '../shared/IntegrationCard';
import SecretField from '../shared/SecretField';
import { getProviderStatus, type WeatherProvider, type WeatherProviderId, type ProviderStatusType } from './providers';
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
type TestStatus =
  | { kind: 'success'; message: string }
  | { kind: 'info'; message: string }
  | { kind: 'error'; message: string };

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

  const isFree = provider.secretKey === null;
  const { type } = getProviderStatus(isDefault, keyConfigured, isFree);
  const label = translateProviderStatus(type, t);
  const canUse = isFree || keyConfigured;

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
      const res = await editorFetch(
        `/api/weather?provider=${provider.id}&lat=${lat}&lon=${lon}&units=${units}&type=hourly`,
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
        const err = await res.json();
        const msg = err.detail
          ? t('settings.weatherPage.providerCard.testStatus.errorWithDetail', {
              error: err.error,
              detail: err.detail,
            })
          : t('settings.weatherPage.providerCard.testStatus.errorOnly', {
              error: err.error,
            });
        setTestStatus({ kind: 'error', message: msg });
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
      name={provider.name}
      description={t(provider.taglineKey)}
      statusLabel={label}
      statusType={cardStatusType}
      defaultOpen={isDefault}
    >
      {provider.secretKey === null ? (
        provider.helperTextKey && (
          <p className="text-xs text-hs-text-muted mb-4">{t(provider.helperTextKey)}</p>
        )
      ) : (
        <div className="mb-4">
          <SecretField
            label={t('settings.weatherPage.providerCard.apiKeyLabel')}
            secretKey={provider.secretKey}
            placeholder={provider.placeholderKey ? t(provider.placeholderKey) : ''}
            helpText={provider.keyHintKey ? t(provider.keyHintKey) : ''}
            status={keyConfigured}
            onSaved={onSecretSaved}
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
            className={`text-xs ${
              testStatus.kind === 'success'
                ? 'text-hs-success'
                : testStatus.kind === 'error'
                  ? 'text-hs-danger'
                  : 'text-hs-text-muted'
            }`}
          >
            {testStatus.message}
          </span>
        )}
      </div>
    </IntegrationCard>
  );
}
