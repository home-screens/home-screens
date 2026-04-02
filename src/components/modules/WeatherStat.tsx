import type { LucideIcon } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';

export function WeatherStat({ icon: Icon, value, unit, visible, fontSize = '0.7em' }: {
  icon: LucideIcon;
  value: number | null | undefined;
  visible?: boolean;
  unit?: string;
  fontSize?: string;
}) {
  if (!visible || value == null) return null;
  return (
    <span className="flex items-center gap-0.5" style={{ fontSize, opacity: TEXT_OPACITY.dim }}>
      <Icon size="1em" aria-hidden="true" />{Math.round(value)}{unit}
    </span>
  );
}
