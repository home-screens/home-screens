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
