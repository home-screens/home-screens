'use client';

import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { ModuleStyle, ShapeConfig } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';

interface ShapeModuleProps {
  config: ShapeConfig;
  style: ModuleStyle;
}

// Every shape view shares the same fill model: a solid color OR a linear
// gradient that's rendered as an SVG <linearGradient>. Glow and grid views
// build their own gradient/pattern defs inline because their shape doesn't
// match the linear case.

function gradientCoords(angleDeg: number) {
  // Convert CSS-style angle (0° = up, 90° = right) into SVG userSpaceOnUse
  // unit vector coordinates. We use objectBoundingBox so the gradient aligns
  // to the shape's bounding box regardless of viewBox.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const x1 = 0.5 - dx / 2;
  const y1 = 0.5 - dy / 2;
  const x2 = 0.5 + dx / 2;
  const y2 = 0.5 + dy / 2;
  return { x1, y1, x2, y2 };
}

function GradientDef({
  id,
  from,
  to,
  angle,
}: {
  id: string;
  from: string;
  to: string;
  angle: number;
}) {
  const { x1, y1, x2, y2 } = gradientCoords(angle);
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  );
}

type LineAxis = 'horizontal' | 'vertical' | 'diagonal';

/**
 * Compute gradient stops for a line view, encoding both the color choice
 * (solid vs. gradient) and the edge treatment (fade vs. flat) into a single
 * paint server. This replaces an earlier mask-based fade that was unstable
 * across editor zoom levels — `<mask>` plus `<linearGradient>` plus
 * percentage-based rect dimensions stacks three coordinate systems whose
 * resolution can disagree under Chromium's SVG renderer. By collapsing
 * everything into one gradient applied directly as the stroke paint, we
 * eliminate the coordinate-system argument entirely.
 */
function lineGradientStops(
  config: ShapeConfig,
): Array<{ offset: string; color: string; opacity: number }> {
  const useGradient = config.fillMode === 'gradient';
  const useFade = config.endStyle === 'fade';

  if (useGradient && useFade) {
    return [
      { offset: '0%',   color: config.gradientFrom, opacity: 0 },
      { offset: '20%',  color: config.gradientFrom, opacity: 1 },
      { offset: '80%',  color: config.gradientTo,   opacity: 1 },
      { offset: '100%', color: config.gradientTo,   opacity: 0 },
    ];
  }
  if (useGradient) {
    return [
      { offset: '0%',   color: config.gradientFrom, opacity: 1 },
      { offset: '100%', color: config.gradientTo,   opacity: 1 },
    ];
  }
  if (useFade) {
    return [
      { offset: '0%',   color: config.color, opacity: 0 },
      { offset: '20%',  color: config.color, opacity: 1 },
      { offset: '80%',  color: config.color, opacity: 1 },
      { offset: '100%', color: config.color, opacity: 0 },
    ];
  }
  return [];
}

/**
 * Linear gradient pinned to the SVG user space (the viewport). With
 * `gradientUnits="userSpaceOnUse"` the percentage stops resolve against the
 * actual SVG element dimensions — zoom-independent and immune to the
 * zero-height bounding box that horizontal `<line>` elements have.
 */
function LineGradientDef({
  id,
  axis,
  stops,
}: {
  id: string;
  axis: LineAxis;
  stops: ReturnType<typeof lineGradientStops>;
}) {
  // Anchor the gradient endpoints to the SVG viewport corners along the
  // line's primary axis. This makes the fade symmetric regardless of where
  // the line geometry falls inside the viewport.
  const x2 = axis === 'horizontal' ? '100%' : axis === 'diagonal' ? '100%' : '0%';
  const y2 = axis === 'vertical' ? '100%' : axis === 'diagonal' ? '100%' : '0%';
  return (
    <linearGradient
      id={id}
      x1="0%"
      y1="0%"
      x2={x2}
      y2={y2}
      gradientUnits="userSpaceOnUse"
    >
      {stops.map((s, i) => (
        <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
      ))}
    </linearGradient>
  );
}


/** Stroke dash pattern for solid / dashed / dotted lines. */
function dashArray(lineStyle: ShapeConfig['lineStyle'], thickness: number): string | undefined {
  if (lineStyle === 'dashed') return `${thickness * 6} ${thickness * 4}`;
  if (lineStyle === 'dotted') return `0.01 ${thickness * 3}`;
  return undefined;
}

function lineCap(lineStyle: ShapeConfig['lineStyle'], endStyle: ShapeConfig['endStyle']): 'butt' | 'round' {
  if (lineStyle === 'dotted') return 'round';
  if (endStyle === 'rounded') return 'round';
  return 'butt';
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function buildPolygonPoints(sides: number, cx: number, cy: number, r: number, rotationDeg: number): string {
  // Pointing up by default — subtract 90° so the first vertex sits at the top.
  const offset = (rotationDeg - 90) * (Math.PI / 180);
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = offset + (i * 2 * Math.PI) / sides;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x.toFixed(3)},${y.toFixed(3)}`);
  }
  return points.join(' ');
}

function buildStarPoints(
  points: number,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  rotationDeg: number,
): string {
  const offset = (rotationDeg - 90) * (Math.PI / 180);
  const total = points * 2;
  const result: string[] = [];
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = offset + (i * Math.PI) / points;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    result.push(`${x.toFixed(3)},${y.toFixed(3)}`);
  }
  return result.join(' ');
}

function buildWavePath(amplitude: number, frequency: number): string {
  // viewBox is 0..100 horizontally; amplitude is % of height (0..50), so the
  // wave centerline is y=50 and oscillates within 50 ± amplitude.
  const segments = Math.max(40, frequency * 24);
  const cmds: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = t * 100;
    const y = 50 + amplitude * Math.sin(t * frequency * 2 * Math.PI);
    cmds.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  return cmds.join(' ');
}

function buildZigzagPath(amplitude: number, frequency: number): string {
  const segments = Math.max(2, frequency * 2);
  const cmds: string[] = ['M0 50'];
  for (let i = 1; i <= segments; i++) {
    const x = (i / segments) * 100;
    const y = i % 2 === 1 ? 50 - amplitude : 50 + amplitude;
    cmds.push(`L${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  return cmds.join(' ');
}

// Each view returns either a self-contained <svg> or a wrapped element. The
// wrapper handles centering and absolute positioning at the module bounds.

interface ViewProps {
  config: ShapeConfig;
  fillId: string;
}

function DividerView({ config, fillId }: ViewProps) {
  const cap = lineCap(config.lineStyle, config.endStyle);
  const dashes = dashArray(config.lineStyle, config.thickness);

  let x1 = '0%', y1 = '50%', x2 = '100%', y2 = '50%';
  let axis: LineAxis = 'horizontal';
  if (config.orientation === 'vertical') {
    x1 = '50%'; y1 = '0%'; x2 = '50%'; y2 = '100%';
    axis = 'vertical';
  } else if (config.orientation === 'diagonal') {
    x1 = '0%'; y1 = '0%'; x2 = '100%'; y2 = '100%';
    axis = 'diagonal';
  }

  const stops = lineGradientStops(config);
  const usePaint = stops.length > 0;
  const stroke = usePaint ? `url(#${fillId})` : config.color;

  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        {usePaint && <LineGradientDef id={fillId} axis={axis} stops={stops} />}
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={stroke}
        strokeWidth={config.thickness}
        strokeLinecap={cap}
        strokeDasharray={dashes}
      />
    </svg>
  );
}

function DoubleLineView({ config, fillId }: ViewProps) {
  const cap = lineCap(config.lineStyle, config.endStyle);
  const dashes = dashArray(config.lineStyle, config.thickness);
  const isVertical = config.orientation === 'vertical';
  const offset = config.doubleLineGap / 2;
  const axis: LineAxis = isVertical ? 'vertical' : 'horizontal';

  const lineProps = (delta: number) => {
    if (isVertical) {
      return {
        x1: '50%', y1: '0%', x2: '50%', y2: '100%',
        transform: `translate(${delta}, 0)`,
      };
    }
    return {
      x1: '0%', y1: '50%', x2: '100%', y2: '50%',
      transform: `translate(0, ${delta})`,
    };
  };

  const stops = lineGradientStops(config);
  const usePaint = stops.length > 0;
  const stroke = usePaint ? `url(#${fillId})` : config.color;

  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        {usePaint && <LineGradientDef id={fillId} axis={axis} stops={stops} />}
      </defs>
      <line
        {...lineProps(-offset)}
        stroke={stroke}
        strokeWidth={config.thickness}
        strokeLinecap={cap}
        strokeDasharray={dashes}
      />
      <line
        {...lineProps(offset)}
        stroke={stroke}
        strokeWidth={config.thickness}
        strokeLinecap={cap}
        strokeDasharray={dashes}
      />
    </svg>
  );
}

function WaveView({ config, fillId }: ViewProps) {
  const cap = lineCap(config.lineStyle, config.endStyle);
  const dashes = dashArray(config.lineStyle, config.thickness);
  const path = buildWavePath(
    Math.min(45, Math.max(0, config.waveAmplitude)),
    Math.max(1, config.waveFrequency),
  );

  const stops = lineGradientStops(config);
  const usePaint = stops.length > 0;
  const stroke = usePaint ? `url(#${fillId})` : config.color;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        {usePaint && <LineGradientDef id={fillId} axis="horizontal" stops={stops} />}
      </defs>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={config.thickness}
        strokeLinecap={cap}
        strokeDasharray={dashes}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ZigzagView({ config, fillId }: ViewProps) {
  const cap = lineCap(config.lineStyle, config.endStyle);
  const dashes = dashArray(config.lineStyle, config.thickness);
  const path = buildZigzagPath(
    Math.min(45, Math.max(0, config.waveAmplitude)),
    clampInt(config.waveFrequency, 1, 20),
  );

  const stops = lineGradientStops(config);
  const usePaint = stops.length > 0;
  const stroke = usePaint ? `url(#${fillId})` : config.color;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        {usePaint && <LineGradientDef id={fillId} axis="horizontal" stops={stops} />}
      </defs>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={config.thickness}
        strokeLinejoin="round"
        strokeLinecap={cap}
        strokeDasharray={dashes}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function DottedRowView({ config, fillId }: ViewProps) {
  const isVertical = config.orientation === 'vertical';
  const count = clampInt(config.dotCount, 2, 50);
  const r = Math.max(0.5, config.dotSize);
  const axis: LineAxis = isVertical ? 'vertical' : 'horizontal';

  // Same gradient-paint approach as the other line views — but here it's
  // applied via fill (circles), not stroke. With gradientUnits="userSpaceOnUse"
  // each circle samples the gradient at its own viewport position, giving the
  // correct per-dot alpha for a fade.
  const stops = lineGradientStops(config);
  const usePaint = stops.length > 0;
  const fill = usePaint ? `url(#${fillId})` : config.color;

  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        {usePaint && <LineGradientDef id={fillId} axis={axis} stops={stops} />}
      </defs>
      {Array.from({ length: count }).map((_, i) => {
        const t = (i + 0.5) / count;
        const cx = isVertical ? '50%' : `${(t * 100).toFixed(3)}%`;
        const cy = isVertical ? `${(t * 100).toFixed(3)}%` : '50%';
        return <circle key={i} cx={cx} cy={cy} r={r} fill={fill} />;
      })}
    </svg>
  );
}

function RectangleView({ config, fillId }: ViewProps) {
  const useGradient = config.fillMode === 'gradient';
  const paint = useGradient ? `url(#${fillId})` : config.color;
  const inset = config.outline ? config.strokeWidth / 2 : 0;
  const fillProp = config.outline ? 'none' : paint;
  const strokeProp = config.outline ? paint : 'none';

  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        {useGradient && (
          <GradientDef id={fillId} from={config.gradientFrom} to={config.gradientTo} angle={config.gradientAngle} />
        )}
      </defs>
      <rect
        // CSS overrides allow calc() arithmetic in geometry props (Chrome / Pi target).
        style={{
          x: `${inset}px`,
          y: `${inset}px`,
          width: `calc(100% - ${inset * 2}px)`,
          height: `calc(100% - ${inset * 2}px)`,
        }}
        rx={config.cornerRadius}
        ry={config.cornerRadius}
        fill={fillProp}
        stroke={strokeProp}
        strokeWidth={config.outline ? config.strokeWidth : 0}
      />
    </svg>
  );
}

function CircleView({ config, fillId }: ViewProps) {
  const useGradient = config.fillMode === 'gradient';
  const paint = useGradient ? `url(#${fillId})` : config.color;
  const fillProp = config.outline ? 'none' : paint;
  const strokeProp = config.outline ? paint : 'none';
  const sw = config.outline ? Math.max(0.5, config.strokeWidth) : 0;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      <defs>
        {useGradient && (
          <GradientDef id={fillId} from={config.gradientFrom} to={config.gradientTo} angle={config.gradientAngle} />
        )}
      </defs>
      <circle
        cx="50"
        cy="50"
        r={50 - (config.outline ? 1 : 0)}
        fill={fillProp}
        stroke={strokeProp}
        strokeWidth={sw}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PolygonView({ config, fillId }: ViewProps) {
  const useGradient = config.fillMode === 'gradient';
  const paint = useGradient ? `url(#${fillId})` : config.color;
  const fillProp = config.outline ? 'none' : paint;
  const strokeProp = config.outline ? paint : 'none';
  const sw = config.outline ? Math.max(0.5, config.strokeWidth) : 0;
  const sides = clampInt(config.sides, 3, 12);
  const points = buildPolygonPoints(sides, 50, 50, 49, config.rotation);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      <defs>
        {useGradient && (
          <GradientDef id={fillId} from={config.gradientFrom} to={config.gradientTo} angle={config.gradientAngle} />
        )}
      </defs>
      <polygon
        points={points}
        fill={fillProp}
        stroke={strokeProp}
        strokeWidth={sw}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function TriangleView({ config, fillId }: ViewProps) {
  // Triangle is a polygon with sides=3 — rendered separately so the editor can
  // expose just rotation without a "sides" knob.
  return <PolygonView config={{ ...config, sides: 3 }} fillId={fillId} />;
}

function StarView({ config, fillId }: ViewProps) {
  const useGradient = config.fillMode === 'gradient';
  const paint = useGradient ? `url(#${fillId})` : config.color;
  const fillProp = config.outline ? 'none' : paint;
  const strokeProp = config.outline ? paint : 'none';
  const sw = config.outline ? Math.max(0.5, config.strokeWidth) : 0;
  const points = clampInt(config.starPoints, 3, 12);
  const inner = Math.max(0.15, Math.min(0.85, config.starInnerRatio));
  const pointStr = buildStarPoints(points, 50, 50, 49, 49 * inner, config.rotation);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      <defs>
        {useGradient && (
          <GradientDef id={fillId} from={config.gradientFrom} to={config.gradientTo} angle={config.gradientAngle} />
        )}
      </defs>
      <polygon
        points={pointStr}
        fill={fillProp}
        stroke={strokeProp}
        strokeWidth={sw}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ArrowView({ config, fillId }: ViewProps) {
  const useGradient = config.fillMode === 'gradient';
  const paint = useGradient ? `url(#${fillId})` : config.color;
  const fillProp = config.outline ? 'none' : paint;
  const strokeProp = config.outline ? paint : 'none';
  const sw = config.outline ? Math.max(0.5, config.strokeWidth) : 0;

  // Build the arrow as a horizontal right-pointing path in viewBox 100×100,
  // then rotate via transform. Simpler than four separate path strings.
  const head = Math.max(0.1, Math.min(0.6, config.arrowHeadRatio));
  const headStartX = 100 * (1 - head);
  const shaftThickness = 16; // % of height
  const shaftTop = 50 - shaftThickness / 2;
  const shaftBottom = 50 + shaftThickness / 2;
  const path = [
    `M0 ${shaftTop}`,
    `L${headStartX} ${shaftTop}`,
    `L${headStartX} 15`,
    `L100 50`,
    `L${headStartX} 85`,
    `L${headStartX} ${shaftBottom}`,
    `L0 ${shaftBottom}`,
    `Z`,
  ].join(' ');

  const rotation =
    config.arrowDirection === 'right'
      ? 0
      : config.arrowDirection === 'down'
        ? 90
        : config.arrowDirection === 'left'
          ? 180
          : 270;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      <defs>
        {useGradient && (
          <GradientDef id={fillId} from={config.gradientFrom} to={config.gradientTo} angle={config.gradientAngle} />
        )}
      </defs>
      <g transform={`rotate(${rotation} 50 50)`}>
        <path
          d={path}
          fill={fillProp}
          stroke={strokeProp}
          strokeWidth={sw}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

function GlowView({ config, fillId }: ViewProps) {
  // Soft radial blob — Stripe-style atmospheric backdrop. The radial gradient
  // fades from `intensity` at the center to fully transparent at `softness`,
  // so a high softness yields a wide soft halo and low softness yields a
  // tight bright center.
  const inner = Math.max(0, Math.min(1, config.intensity));
  const outer = Math.max(0.2, Math.min(1, config.softness));

  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={fillId} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={config.color} stopOpacity={inner} />
          <stop offset={`${outer * 100}%`} stopColor={config.color} stopOpacity="0" />
          <stop offset="100%" stopColor={config.color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${fillId})`} />
    </svg>
  );
}

function GradientPanelView({ config, fillId }: ViewProps) {
  // Linear gradient block — color wash for backdrops or content bands. Always
  // uses the gradient pair regardless of fillMode (the view IS a gradient).
  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <GradientDef
          id={fillId}
          from={config.gradientFrom}
          to={config.gradientTo}
          angle={config.gradientAngle}
        />
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${fillId})`} rx={config.cornerRadius} ry={config.cornerRadius} />
    </svg>
  );
}

function GridView({ config, fillId }: ViewProps) {
  // SVG <pattern> repeats the unit cell across the rect. We use userSpaceOnUse
  // so the spacing is in pixels, not viewBox units.
  const useGradient = config.fillMode === 'gradient';
  const paint = useGradient ? `url(#${fillId}-fill)` : config.color;
  const spacing = Math.max(4, config.gridSpacing);
  const dot = Math.max(0.5, config.gridDotSize);

  let cell: ReactNode;
  if (config.gridPattern === 'dots') {
    cell = <circle cx={spacing / 2} cy={spacing / 2} r={dot} fill={paint} />;
  } else if (config.gridPattern === 'lines') {
    cell = (
      <>
        <line x1="0" y1={spacing / 2} x2={spacing} y2={spacing / 2} stroke={paint} strokeWidth={dot} />
        <line x1={spacing / 2} y1="0" x2={spacing / 2} y2={spacing} stroke={paint} strokeWidth={dot} />
      </>
    );
  } else {
    // cross
    const arm = Math.max(2, spacing / 6);
    cell = (
      <>
        <line
          x1={spacing / 2 - arm}
          y1={spacing / 2}
          x2={spacing / 2 + arm}
          y2={spacing / 2}
          stroke={paint}
          strokeWidth={dot}
        />
        <line
          x1={spacing / 2}
          y1={spacing / 2 - arm}
          x2={spacing / 2}
          y2={spacing / 2 + arm}
          stroke={paint}
          strokeWidth={dot}
        />
      </>
    );
  }

  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        {useGradient && (
          <GradientDef id={`${fillId}-fill`} from={config.gradientFrom} to={config.gradientTo} angle={config.gradientAngle} />
        )}
        <pattern
          id={fillId}
          width={spacing}
          height={spacing}
          patternUnits="userSpaceOnUse"
        >
          {cell}
        </pattern>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${fillId})`} />
    </svg>
  );
}

function FrameView({ config, fillId }: ViewProps) {
  const useGradient = config.fillMode === 'gradient';
  const paint = useGradient ? `url(#${fillId})` : config.color;
  const sw = Math.max(0.5, config.strokeWidth);
  const inset = sw / 2;

  if (config.frameStyle === 'rectangle') {
    return (
      <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          {useGradient && (
            <GradientDef id={fillId} from={config.gradientFrom} to={config.gradientTo} angle={config.gradientAngle} />
          )}
        </defs>
        <rect
          style={{
            x: `${inset}px`,
            y: `${inset}px`,
            width: `calc(100% - ${inset * 2}px)`,
            height: `calc(100% - ${inset * 2}px)`,
          }}
          rx={config.cornerRadius}
          ry={config.cornerRadius}
          fill="none"
          stroke={paint}
          strokeWidth={sw}
        />
      </svg>
    );
  }

  // Brackets — four L-shaped corner marks. Bracket length is % of the shorter
  // adjacent side, rendered via percentage line endpoints.
  const len = Math.max(5, Math.min(50, config.bracketLength));
  const lenFrac = len / 100;
  // We draw eight line segments — two per corner — using percentage endpoints.
  // Stroke is laid out so the visible end sits at the inset edge.

  const segments: Array<{ x1: string; y1: string; x2: string; y2: string }> = [
    // top-left horizontal
    { x1: `${inset}px`, y1: `${inset}px`, x2: `${lenFrac * 100}%`, y2: `${inset}px` },
    // top-left vertical
    { x1: `${inset}px`, y1: `${inset}px`, x2: `${inset}px`, y2: `${lenFrac * 100}%` },
    // top-right horizontal
    { x1: `calc(100% - ${inset}px)`, y1: `${inset}px`, x2: `${(1 - lenFrac) * 100}%`, y2: `${inset}px` },
    // top-right vertical
    { x1: `calc(100% - ${inset}px)`, y1: `${inset}px`, x2: `calc(100% - ${inset}px)`, y2: `${lenFrac * 100}%` },
    // bottom-left horizontal
    { x1: `${inset}px`, y1: `calc(100% - ${inset}px)`, x2: `${lenFrac * 100}%`, y2: `calc(100% - ${inset}px)` },
    // bottom-left vertical
    { x1: `${inset}px`, y1: `calc(100% - ${inset}px)`, x2: `${inset}px`, y2: `${(1 - lenFrac) * 100}%` },
    // bottom-right horizontal
    { x1: `calc(100% - ${inset}px)`, y1: `calc(100% - ${inset}px)`, x2: `${(1 - lenFrac) * 100}%`, y2: `calc(100% - ${inset}px)` },
    // bottom-right vertical
    { x1: `calc(100% - ${inset}px)`, y1: `calc(100% - ${inset}px)`, x2: `calc(100% - ${inset}px)`, y2: `${(1 - lenFrac) * 100}%` },
  ];

  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        {useGradient && (
          <GradientDef id={fillId} from={config.gradientFrom} to={config.gradientTo} angle={config.gradientAngle} />
        )}
      </defs>
      {segments.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={paint}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default function ShapeModule({ config, style }: ShapeModuleProps) {
  // Per-instance ID prefix so multiple shape modules on the same screen don't
  // collide on <linearGradient>/<mask> ids.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fillId = `_sh_fill_${id}`;

  const wrapperStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'block',
  };

  const view = config.view ?? 'divider';
  const viewProps: ViewProps = { config, fillId };

  let element: ReactNode;
  switch (view) {
    case 'divider':       element = <DividerView {...viewProps} />; break;
    case 'double-line':   element = <DoubleLineView {...viewProps} />; break;
    case 'wave':          element = <WaveView {...viewProps} />; break;
    case 'zigzag':        element = <ZigzagView {...viewProps} />; break;
    case 'dotted-row':    element = <DottedRowView {...viewProps} />; break;
    case 'rectangle':     element = <RectangleView {...viewProps} />; break;
    case 'circle':        element = <CircleView {...viewProps} />; break;
    case 'triangle':      element = <TriangleView {...viewProps} />; break;
    case 'polygon':       element = <PolygonView {...viewProps} />; break;
    case 'star':          element = <StarView {...viewProps} />; break;
    case 'arrow':         element = <ArrowView {...viewProps} />; break;
    case 'glow':          element = <GlowView {...viewProps} />; break;
    case 'gradient':      element = <GradientPanelView {...viewProps} />; break;
    case 'grid':          element = <GridView {...viewProps} />; break;
    case 'frame':         element = <FrameView {...viewProps} />; break;
    default:              element = <DividerView {...viewProps} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div style={wrapperStyle} aria-hidden="true">
        {element}
      </div>
    </ModuleWrapper>
  );
}
