import clsx from 'clsx'
import { LogoMark } from '@/components/LogoMark'

function LogoIcon({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        'flex items-center justify-center rounded-xl',
        'border border-cyan-400/25 bg-[linear-gradient(160deg,#0f172a_0%,#10253d_48%,#143a58_100%)] shadow-[0_8px_24px_rgba(6,182,212,0.15)]',
        'dark:border-cyan-400/25 dark:bg-[linear-gradient(160deg,#0f172a_0%,#10253d_48%,#143a58_100%)]',
        className,
      )}
      {...props}
    >
      <LogoMark className="h-6 w-6" />
    </div>
  )
}

export function DocsLogomark(props: React.ComponentPropsWithoutRef<'div'>) {
  return <LogoIcon className="h-9 w-9" {...props} />
}

export function DocsLogo({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={clsx('flex items-center gap-3', className)} {...props}>
      <LogoIcon className="h-9 w-9" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tracking-[0.16em] uppercase text-sky-500 dark:text-cyan-300/90">
          Home
        </span>
        <span className="text-[0.95rem] font-semibold tracking-[0.08em] text-slate-900 dark:text-white">
          Screens
        </span>
      </div>
    </div>
  )
}
