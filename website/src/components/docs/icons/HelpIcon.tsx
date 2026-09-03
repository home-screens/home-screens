import { DarkMode, Gradient, LightMode } from '@/components/docs/Icon'

export function HelpIcon({
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
        <circle
          cx={19}
          cy={19}
          r={9}
          fillOpacity={0.5}
          className="fill-(--icon-background) stroke-(--icon-foreground)"
          strokeWidth={2}
        />
        <path
          d="M16.5 17a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5M19 24h.01"
          className="stroke-(--icon-foreground)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </LightMode>
      <DarkMode>
        <circle
          cx={16}
          cy={16}
          r={12}
          fill={`url(#${id}-gradient-dark)`}
          stroke={`url(#${id}-gradient-dark)`}
          strokeWidth={2}
        />
        <path
          d="M13 13.5a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.8M16 22h.01"
          stroke="#0f172a"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </DarkMode>
    </>
  )
}
