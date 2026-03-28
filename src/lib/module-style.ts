/** Build the box-shadow CSS value for a module card. */
export function buildModuleShadow(shadowSize: number, scale = 1): string {
  if (shadowSize <= 0) return 'none';
  const offset = Math.round((shadowSize / 2) * scale);
  const blur = shadowSize * scale;
  const ambient = Math.round((shadowSize / 2) * scale);
  return `inset 0 ${scale}px 0 rgba(255, 255, 255, 0.12), 0 ${offset}px ${blur}px rgba(0, 0, 0, 0.8), 0 0 ${ambient}px rgba(255, 255, 255, 0.04)`;
}
