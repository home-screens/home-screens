'use client';

import { forwardRef, useId } from 'react';

interface IconProps {
  size?: string | number;
  className?: string;
  strokeWidth?: number;
  'aria-label'?: string;
  role?: string;
}

function createColorIcon(
  displayName: string,
  render: (uid: string) => React.ReactNode,
) {
  const Component = forwardRef<SVGSVGElement, IconProps>(({ size, className, 'aria-label': ariaLabel, role }, ref) => {
    const uid = useId();
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size ?? 24}
        height={size ?? 24}
        viewBox="0 0 64 64"
        fill="none"
        className={className}
        style={{ display: 'inline-block', verticalAlign: 'middle' }}
        aria-label={ariaLabel}
        role={ariaLabel ? 'img' : role}
      >
        {render(uid)}
      </svg>
    );
  });
  Component.displayName = displayName;
  return Component;
}

// ─── Sun ────────────────────────────────────────────

const ColorSun = createColorIcon('ColorSun', (uid) => (
  <>
    <defs>
      <radialGradient id={`${uid}-sun`}>
        <stop offset="0%" stopColor="#FFE066" />
        <stop offset="100%" stopColor="#FFA726" />
      </radialGradient>
    </defs>
    <circle cx="32" cy="32" r="14" fill={`url(#${uid}-sun)`} />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
      <line
        key={deg}
        x1="32" y1="8" x2="32" y2="14"
        stroke="#FFA726" strokeWidth="3" strokeLinecap="round"
        transform={`rotate(${deg} 32 32)`}
      />
    ))}
  </>
));

// ─── Moon ───────────────────────────────────────────

const ColorMoon = createColorIcon('ColorMoon', (uid) => (
  <>
    <defs>
      <radialGradient id={`${uid}-moon`} cx="40%" cy="40%">
        <stop offset="0%" stopColor="#F0E6D3" />
        <stop offset="100%" stopColor="#C9B99A" />
      </radialGradient>
    </defs>
    <path
      d="M38 12a20 20 0 1 0 14 34A22 22 0 0 1 38 12z"
      fill={`url(#${uid}-moon)`}
    />
  </>
));

// ─── Cloud ──────────────────────────────────────────

const CloudShape = ({ y = 0, opacity = 1 }: { y?: number; opacity?: number }) => (
  <g opacity={opacity} transform={`translate(0 ${y})`}>
    <ellipse cx="32" cy="38" rx="18" ry="10" fill="#B0BEC5" />
    <circle cx="24" cy="30" r="10" fill="#B0BEC5" />
    <circle cx="36" cy="26" r="12" fill="#CFD8DC" />
    <circle cx="28" cy="28" r="9" fill="#CFD8DC" />
  </g>
);

const ColorCloud = createColorIcon('ColorCloud', () => <CloudShape />);

// ─── Cloud + Sun ────────────────────────────────────

const ColorCloudSun = createColorIcon('ColorCloudSun', (uid) => (
  <>
    <defs>
      <radialGradient id={`${uid}-csun`}>
        <stop offset="0%" stopColor="#FFE066" />
        <stop offset="100%" stopColor="#FFA726" />
      </radialGradient>
    </defs>
    <circle cx="46" cy="18" r="10" fill={`url(#${uid}-csun)`} />
    {[0, 60, 120, 180, 240, 300].map((deg) => (
      <line
        key={deg}
        x1="46" y1="4" x2="46" y2="7"
        stroke="#FFA726" strokeWidth="2.5" strokeLinecap="round"
        transform={`rotate(${deg} 46 18)`}
      />
    ))}
    <CloudShape y={4} />
  </>
));

// ─── Cloud + Moon ───────────────────────────────────

const ColorCloudMoon = createColorIcon('ColorCloudMoon', (uid) => (
  <>
    <defs>
      <radialGradient id={`${uid}-cmoon`} cx="40%" cy="40%">
        <stop offset="0%" stopColor="#F0E6D3" />
        <stop offset="100%" stopColor="#C9B99A" />
      </radialGradient>
    </defs>
    <path
      d="M50 8a12 12 0 1 0 8 20A13 13 0 0 1 50 8z"
      fill={`url(#${uid}-cmoon)`}
    />
    <CloudShape y={4} />
  </>
));

// ─── Rain drops helper ──────────────────────────────

const RainDrops = ({ heavy = false }: { heavy?: boolean }) => (
  <g>
    {(heavy
      ? [{ x: 22, d: 10 }, { x: 30, d: 13 }, { x: 38, d: 11 }, { x: 26, d: 8 }, { x: 34, d: 9 }]
      : [{ x: 24, d: 10 }, { x: 32, d: 12 }, { x: 40, d: 9 }]
    ).map(({ x, d }, i) => (
      <line
        key={i}
        x1={x} y1={46} x2={x - 2} y2={46 + d}
        stroke={heavy ? '#2196F3' : '#64B5F6'}
        strokeWidth={heavy ? 2.5 : 2}
        strokeLinecap="round"
      />
    ))}
  </g>
);

// ─── Cloud Rain ─────────────────────────────────────

const ColorCloudRain = createColorIcon('ColorCloudRain', () => (
  <>
    <CloudShape y={-2} />
    <RainDrops heavy />
  </>
));

// ─── Cloud Drizzle ──────────────────────────────────

const ColorCloudDrizzle = createColorIcon('ColorCloudDrizzle', () => (
  <>
    <CloudShape y={-2} />
    <RainDrops />
  </>
));

// ─── Cloud Snow ─────────────────────────────────────

const ColorCloudSnow = createColorIcon('ColorCloudSnow', () => (
  <>
    <CloudShape y={-4} />
    {[{ x: 24, y: 46 }, { x: 34, y: 50 }, { x: 40, y: 44 }, { x: 28, y: 52 }].map(({ x, y }, i) => (
      <circle key={i} cx={x} cy={y} r="2" fill="#E3F2FD" />
    ))}
  </>
));

// ─── Snowflake ──────────────────────────────────────

const ColorSnowflake = createColorIcon('ColorSnowflake', () => (
  <g>
    {[0, 60, 120].map((deg) => (
      <g key={deg} transform={`rotate(${deg} 32 32)`}>
        <line x1="32" y1="10" x2="32" y2="54" stroke="#90CAF9" strokeWidth="3" strokeLinecap="round" />
        <line x1="32" y1="16" x2="26" y2="12" stroke="#90CAF9" strokeWidth="2" strokeLinecap="round" />
        <line x1="32" y1="16" x2="38" y2="12" stroke="#90CAF9" strokeWidth="2" strokeLinecap="round" />
        <line x1="32" y1="48" x2="26" y2="52" stroke="#90CAF9" strokeWidth="2" strokeLinecap="round" />
        <line x1="32" y1="48" x2="38" y2="52" stroke="#90CAF9" strokeWidth="2" strokeLinecap="round" />
      </g>
    ))}
  </g>
));

// ─── Cloud Lightning ────────────────────────────────

const ColorCloudLightning = createColorIcon('ColorCloudLightning', () => (
  <>
    <CloudShape y={-4} />
    <polygon points="34,40 28,50 32,50 28,58 38,48 34,48 38,40" fill="#FFD54F" />
  </>
));

// ─── Cloud Fog ──────────────────────────────────────

const ColorCloudFog = createColorIcon('ColorCloudFog', () => (
  <>
    <CloudShape y={-6} />
    {[42, 48, 54].map((y, i) => (
      <line
        key={i}
        x1="16" y1={y} x2="48" y2={y}
        stroke="#B0BEC5" strokeWidth="2.5" strokeLinecap="round"
        opacity={0.7 - i * 0.15}
      />
    ))}
  </>
));

// ─── Cloud Hail ─────────────────────────────────────

const ColorCloudHail = createColorIcon('ColorCloudHail', () => (
  <>
    <CloudShape y={-4} />
    {[{ x: 24, y: 46 }, { x: 34, y: 50 }, { x: 40, y: 44 }, { x: 28, y: 53 }].map(({ x, y }, i) => (
      <circle key={i} cx={x} cy={y} r="2.5" fill="#B3E5FC" stroke="#81D4FA" strokeWidth="0.5" />
    ))}
  </>
));

// ─── Thermometer (fallback) ─────────────────────────

const ColorThermometer = createColorIcon('ColorThermometer', () => (
  <>
    <rect x="28" y="10" width="8" height="34" rx="4" fill="#ECEFF1" stroke="#B0BEC5" strokeWidth="1.5" />
    <rect x="30" y="24" width="4" height="18" rx="2" fill="#EF5350" />
    <circle cx="32" cy="48" r="6" fill="#EF5350" />
    <circle cx="32" cy="48" r="4" fill="#E53935" />
  </>
));

// ─── Export map ─────────────────────────────────────

export const colorIconComponents: Record<string, typeof ColorSun> = {
  sun: ColorSun,
  moon: ColorMoon,
  cloud: ColorCloud,
  'cloud-sun': ColorCloudSun,
  'cloud-moon': ColorCloudMoon,
  'cloud-rain': ColorCloudRain,
  'cloud-drizzle': ColorCloudDrizzle,
  'cloud-snow': ColorCloudSnow,
  'cloud-lightning': ColorCloudLightning,
  'cloud-fog': ColorCloudFog,
  snowflake: ColorSnowflake,
  thermometer: ColorThermometer,
  'cloud-hail': ColorCloudHail,
};
