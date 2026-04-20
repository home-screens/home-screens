/* ─── Integration metadata ──────────────────── */

export interface IntegrationMeta {
  label: string;
  initials: string;
}

export const INTEGRATION_META: Record<string, IntegrationMeta> = {
  openweathermap_key: { label: 'OpenWeatherMap', initials: 'OW' },
  weatherapi_key:     { label: 'WeatherAPI',     initials: 'WA' },
  pirateweather_key:  { label: 'Pirate Weather', initials: 'PW' },
  metoffice_key:      { label: 'Met Office',     initials: 'MO' },
  unsplash_access_key:{ label: 'Unsplash',       initials: 'UN' },
  nasa_api_key:       { label: 'NASA',           initials: 'NA' },
  todoist_token:      { label: 'Todoist',        initials: 'TD' },
  google_maps_key:    { label: 'Google Maps',    initials: 'GM' },
  tomtom_key:         { label: 'TomTom',         initials: 'TT' },
  google_client_id:   { label: 'Google OAuth',   initials: 'GO' },
};

/* ─── Palette for module-type and data-dir stacked bars ──────
 * Hand-picked hex values so segments are visually distinct while the
 * overall palette stays consistent with the semantic tokens used elsewhere
 * (blue/green/violet/amber lead; then pink, light-blue, teal; "other" is
 * faint gray). Not theme-reactive — these read fine on both dark and
 * light surfaces because saturation is moderate. */
export const MODULE_PALETTE = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#a78bfa', // violet
  '#f59e0b', // amber
  '#f472b6', // pink
  '#60a5fa', // light blue
  '#10b981', // teal
];
export const MODULE_OTHER_COLOR = '#737373';

export const DATA_DIR_COLORS = {
  backgrounds: '#3b82f6',
  backups:     '#a78bfa',
  config:      '#22c55e',
};
