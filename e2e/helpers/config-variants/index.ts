import type { ConfigVariant } from './types';
import { CORE_VARIANTS } from './core';
import { FULLSCREEN_CALENDAR_VARIANTS } from './fullscreen-calendar';
import { TEXT_VARIANTS } from './text';
import { ICON_VARIANTS } from './icon';
import { TIME_DATE_VARIANTS } from './time-date';
import { WEATHER_ENVIRONMENT_VARIANTS } from './weather-environment';
import { NEWS_FINANCE_VARIANTS } from './news-finance';
import { PERSONAL_VARIANTS } from './personal';
import { MEDIA_FULLSCREEN_VARIANTS } from './media-fullscreen';
import { FULLSCREEN_FAMILY_VARIANTS } from './fullscreen-family';
import { FULLSCREEN_WEATHER_VARIANTS } from './fullscreen-weather';

export type { ConfigVariant } from './types';

/**
 * The combined config-variant matrix. Rows are grouped into per-batch files so
 * coverage work on different module families never contends for one file; the
 * spec and the meta ratchets consume only this concatenation, so file layout is
 * invisible to them.
 */
export const CONFIG_VARIANTS: ConfigVariant[] = [
  ...CORE_VARIANTS,
  ...FULLSCREEN_CALENDAR_VARIANTS,
  ...TEXT_VARIANTS,
  ...ICON_VARIANTS,
  ...TIME_DATE_VARIANTS,
  ...WEATHER_ENVIRONMENT_VARIANTS,
  ...NEWS_FINANCE_VARIANTS,
  ...PERSONAL_VARIANTS,
  ...MEDIA_FULLSCREEN_VARIANTS,
  ...FULLSCREEN_FAMILY_VARIANTS,
  ...FULLSCREEN_WEATHER_VARIANTS,
];
