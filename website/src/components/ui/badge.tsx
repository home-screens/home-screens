import clsx from 'clsx';

const colorStyles = {
  cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  zinc: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
  green: 'bg-green-500/10 text-green-300 border-green-500/20',
  orange: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
};

type BadgeProps = {
  color?: keyof typeof colorStyles;
  className?: string;
  children: React.ReactNode;
};

export function Badge({ color = 'cyan', className, children }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        colorStyles[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
