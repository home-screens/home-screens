'use client';

import { useState } from 'react';
import { Globe, CloudSun, Cloud, Compass, Flag } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import IntegrationCard from '../shared/IntegrationCard';
import SecretField from '../shared/SecretField';
import { getProviderStatus, type WeatherProvider, type WeatherProviderId } from './providers';

const ICONS: Record<WeatherProviderId, React.ReactNode> = {
  'open-meteo': <Globe className="w-[18px] h-[18px] text-white" />,
  weatherapi: <CloudSun className="w-[18px] h-[18px] text-white" />,
  openweathermap: <Cloud className="w-[18px] h-[18px] text-white" />,
  pirateweather: <Compass className="w-[18px] h-[18px] text-white" />,
  noaa: <Flag className="w-[18px] h-[18px] text-white" />,
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
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const isFree = provider.secretKey === null;
  const { label, type } = getProviderStatus(isDefault, keyConfigured, isFree);
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
    setTestStatus('Testing...');
    try {
      const res = await editorFetch(
        `/api/weather?provider=${provider.id}&lat=${lat}&lon=${lon}&units=${units}&type=hourly`,
      );
      if (res.ok) {
        const data = await res.json();
        const hourly = data.hourly ?? data;
        if (Array.isArray(hourly) && hourly.length > 0) {
          setTestStatus(`Working! Current temp: ${Math.round(hourly[0].temp)}°`);
        } else {
          setTestStatus('Connected but no data returned');
        }
      } else {
        const err = await res.json();
        setTestStatus(`Error: ${err.error}`);
      }
    } catch (e) {
      setTestStatus(`Failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <IntegrationCard
      icon={ICONS[provider.id]}
      iconBg={provider.iconBg}
      name={provider.name}
      description={provider.tagline}
      statusLabel={label}
      statusType={cardStatusType}
      defaultOpen={isDefault}
    >
      {provider.secretKey === null ? (
        <p className="text-xs text-hs-text-muted mb-4">{provider.helperText}</p>
      ) : (
        <div className="mb-4">
          <SecretField
            label="API Key"
            secretKey={provider.secretKey}
            placeholder={provider.placeholder}
            helpText={provider.keyHint}
            status={keyConfigured}
            onSaved={onSecretSaved}
          />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {isDefault ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-hs-success/10 text-hs-success text-xs">
            Currently the default
          </span>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onSetDefault}
            disabled={!canUse}
          >
            Set as default
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing || !canUse}>
          {testing ? 'Testing...' : 'Test'}
        </Button>
        {testStatus && (
          <span
            className={`text-xs ${
              testStatus.startsWith('Working')
                ? 'text-hs-success'
                : testStatus.startsWith('Error') || testStatus.startsWith('Failed')
                  ? 'text-hs-danger'
                  : 'text-hs-text-muted'
            }`}
          >
            {testStatus}
          </span>
        )}
      </div>
    </IntegrationCard>
  );
}
