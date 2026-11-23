'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import LabeledField from '@/components/ui/LabeledField';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import type { WeatherProviderOption } from '@/types/config';
import { settingsPath } from '@/lib/settings-route';
import {
  DEFAULT_WEATHER_PROVIDER,
  WEATHER_PROVIDER_IDS,
  configuredWeatherProviders,
  weatherProviderCaps,
  weatherProviderSecret,
  type WeatherProviderCaps,
} from '@/lib/weather-providers';
import Notice from '@/components/ui/Notice';

/**
 * The sources a module may pick: every keyless one, plus each keyed one
 * whose key is saved. Empty until a good key status has landed, so a picker
 * is never rendered without the saved provider among its options (a change
 * event on such a picker would overwrite the real value).
 */
export function useConfiguredWeatherProviders(): { providers: string[]; known: boolean } {
  const { status: secrets, loading, error, hasStatus } = useSecretStatus();
  const providers = useMemo<string[]>(() => {
    // A failed refetch after a good status keeps using that last snapshot.
    if (loading || (error && !hasStatus)) return [];
    return configuredWeatherProviders(secrets);
  }, [secrets, loading, error, hasStatus]);
  return { providers, known: hasStatus && !loading };
}

export interface ModuleWeatherSource {
  /** The module has no source of its own and follows the household's. */
  followsHousehold: boolean;
  /** The source the wall will actually read for this module. */
  effectiveProvider: string;
  /** What that source's payload can carry. */
  caps: WeatherProviderCaps;
  /** The sources a module may pick with the keys saved so far. */
  configuredProviders: string[];
  /**
   * The module's source needs an API key and none is saved. Only judged once
   * a real key status has landed, so a slow first fetch never flashes a warning.
   */
  apiKeyMissing: boolean;
}

/**
 * Where a weather module's data comes from, worked out once for the Weather
 * and Full-Screen Weather sections: an absent or `global` source follows the
 * household's, and a keyed source with no key is flagged so the panel can say
 * so next to the module (see `WeatherApiKeyMissingRow`).
 */
export function useModuleWeatherSource(provider: WeatherProviderOption | undefined): ModuleWeatherSource {
  const globalProvider = useEditorStore((s) => s.config?.settings?.weather?.provider);
  const { providers: configuredProviders, known } = useConfiguredWeatherProviders();
  const followsHousehold = !provider || provider === 'global';
  const effectiveProvider = followsHousehold ? (globalProvider ?? DEFAULT_WEATHER_PROVIDER) : provider;
  const apiKeyMissing = known
    && weatherProviderSecret(effectiveProvider) !== null
    && !configuredProviders.includes(effectiveProvider);
  return {
    followsHousehold,
    effectiveProvider,
    caps: weatherProviderCaps(effectiveProvider),
    configuredProviders,
    apiKeyMissing,
  };
}

/**
 * A keyed source with no key draws only a setup card on the wall. This says
 * so in the panel, next to the module, with a link to where the key goes.
 */
export function WeatherApiKeyMissingRow() {
  const t = useTranslate('editor');
  return (
    <Notice tone="warning" size="sm" testId="weather-api-key-row">
      <p className="text-hs-text-body">{t('configSections.weather.apiKeyMissing')}</p>
      <Link
        href={settingsPath({ kind: 'defaults', page: 'weather' })}
        className="mt-1 inline-block font-medium text-hs-accent hover:underline"
      >
        {t('configSections.weather.addApiKey')}
      </Link>
    </Notice>
  );
}

/** The picker's label key for a source; only Open-Meteo's id is not its key. */
const optionKey = (id: string) => (id === 'open-meteo' ? 'openMeteo' : id);

interface Props {
  value: WeatherProviderOption;
  onChange: (provider: WeatherProviderOption) => void;
  /** The sources to offer, already narrowed to what the current view can use. */
  providers: string[];
  /** Whether "Same as Settings" is an option; a view needing a capability only some sources have drops it. */
  allowGlobal?: boolean;
}

/**
 * The per-module weather source picker, shared by the Weather and
 * Full-Screen Weather sections so both modules read the same control.
 */
export function WeatherSourceSelect({ value, onChange, providers, allowGlobal = true }: Props) {
  const t = useTranslate('editor');
  if (providers.length === 0) return null;
  return (
    <LabeledField label={t('configSections.weather.dataProvider')}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as WeatherProviderOption)}
        className={INPUT_CLASS}
        data-testid="weather-source-select"
      >
        {allowGlobal && <option value="global">{t('configSections.weather.providers.global')}</option>}
        {WEATHER_PROVIDER_IDS.filter((p) => providers.includes(p)).map((p) => (
          <option key={p} value={p}>{t(`configSections.weather.providers.${optionKey(p)}`)}</option>
        ))}
      </select>
    </LabeledField>
  );
}
