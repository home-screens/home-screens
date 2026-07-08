'use client';

import Slider from '@/components/ui/Slider';
import { useTranslate } from '@/i18n';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';

type RefreshUnit = 'seconds' | 'minutes';

interface RefreshIntervalSliderProps {
  /** Current `refreshIntervalMs` from module config (undefined = use the default). */
  value: number | undefined;
  /** Called with the new interval in milliseconds. */
  onChange: (ms: number) => void;
  /** FETCH_KEY_REGISTRY key whose `ttlMs` supplies the default when unset. */
  fetchKey: string;
  /** Fallback default in ms if the registry has no entry for `fetchKey`. */
  fallbackMs: number;
  /** Whether the slider shows and steps in seconds or minutes. */
  unit: RefreshUnit;
  min: number;
  max: number;
  step?: number;
}

/**
 * The refresh-interval Slider shared across data-backed config sections. The
 * stored value is always milliseconds; the slider works in whole seconds or
 * minutes (per `unit`) and the default falls back to the module's registered
 * fetch TTL so the control matches how often the data actually refetches.
 */
export default function RefreshIntervalSlider({
  value,
  onChange,
  fetchKey,
  fallbackMs,
  unit,
  min,
  max,
  step,
}: RefreshIntervalSliderProps) {
  const t = useTranslate('editor');
  const divisor = unit === 'minutes' ? 60000 : 1000;
  const defaultMs = FETCH_KEY_REGISTRY[fetchKey]?.ttlMs ?? fallbackMs;
  return (
    <Slider
      label={t(unit === 'minutes' ? 'common.refreshMinutes' : 'common.refreshSeconds')}
      value={(value ?? defaultMs) / divisor}
      min={min}
      max={max}
      step={step}
      onChange={(v) => onChange(v * divisor)}
    />
  );
}
