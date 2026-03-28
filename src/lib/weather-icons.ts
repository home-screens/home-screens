import {
  Sun, Moon, Cloud, CloudSun, CloudMoon, CloudRain, CloudDrizzle,
  CloudSnow, CloudLightning, CloudFog, Snowflake, Thermometer, CloudHail,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { WeatherIconSet } from '@/types/config';
import { colorIconComponents } from './weather-icons-color';

type WeatherIconId =
  | 'sun' | 'moon' | 'cloud' | 'cloud-sun' | 'cloud-moon'
  | 'cloud-rain' | 'cloud-drizzle' | 'cloud-snow' | 'cloud-lightning'
  | 'cloud-fog' | 'snowflake' | 'thermometer' | 'cloud-hail';

const outlineIcons: Record<WeatherIconId, LucideIcon> = {
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  'cloud-sun': CloudSun,
  'cloud-moon': CloudMoon,
  'cloud-rain': CloudRain,
  'cloud-drizzle': CloudDrizzle,
  'cloud-snow': CloudSnow,
  'cloud-lightning': CloudLightning,
  'cloud-fog': CloudFog,
  snowflake: Snowflake,
  thermometer: Thermometer,
  'cloud-hail': CloudHail,
};

const iconLabels: Record<WeatherIconId, string> = {
  sun: 'Sunny',
  moon: 'Clear night',
  cloud: 'Cloudy',
  'cloud-sun': 'Partly cloudy',
  'cloud-moon': 'Partly cloudy night',
  'cloud-rain': 'Rain',
  'cloud-drizzle': 'Drizzle',
  'cloud-snow': 'Snow',
  'cloud-lightning': 'Thunderstorm',
  'cloud-fog': 'Fog',
  snowflake: 'Snow',
  thermometer: 'Temperature',
  'cloud-hail': 'Hail',
};

export function getWeatherIconLabel(id: string): string {
  return iconLabels[id as WeatherIconId] ?? 'Weather';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WeatherIcon = ComponentType<any>;

export function getWeatherIcon(id: string, iconSet?: WeatherIconSet): WeatherIcon {
  if (iconSet === 'color') {
    return colorIconComponents[id as WeatherIconId] ?? colorIconComponents.thermometer;
  }
  return outlineIcons[id as WeatherIconId] ?? Thermometer;
}
