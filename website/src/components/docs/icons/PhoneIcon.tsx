import { DarkMode, Gradient, LightMode } from '@/components/docs/Icon'

export function PhoneIcon({
  id,
  color,
}: {
  id: string
  color?: React.ComponentProps<typeof Gradient>['color']
}) {
  return (
    <>
      <defs>
        <Gradient
          id={`${id}-gradient`}
          color={color}
          gradientTransform="matrix(0 21 -21 0 12 3)"
        />
        <Gradient
          id={`${id}-gradient-dark`}
          color={color}
          gradientTransform="matrix(0 21 -21 0 16 7)"
        />
      </defs>
      <LightMode>
        <circle cx={12} cy={12} r={12} fill={`url(#${id}-gradient)`} />
        <rect
          x={11}
          y={6}
          width={12}
          height={22}
          rx={2.5}
          fillOpacity={0.5}
          className="fill-(--icon-background) stroke-(--icon-foreground)"
          strokeWidth={2}
        />
        <path
          d="M15 24h4"
          className="stroke-(--icon-foreground)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </LightMode>
      <DarkMode>
        <rect
          x={10}
          y={4}
          width={12}
          height={24}
          rx={3}
          fill={`url(#${id}-gradient-dark)`}
          stroke={`url(#${id}-gradient-dark)`}
          strokeWidth={2}
        />
        <path
          d="M14 24h4"
          stroke="#0f172a"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </DarkMode>
    </>
  )
}
