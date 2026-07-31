import clsx from 'clsx';
import { LogoMark } from '@/components/LogoMark';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={clsx('flex shrink-0 items-center gap-3', className)}>
      <div
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/25 bg-[linear-gradient(160deg,#0f172a_0%,#10253d_48%,#143a58_100%)] shadow-[0_8px_24px_rgba(6,182,212,0.15)]"
      >
        <LogoMark className="h-6 w-6" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tracking-[0.16em] uppercase text-cyan-300/90">
          Home
        </span>
        <span className="text-[0.95rem] font-semibold tracking-[0.08em] text-neutral-50">
          Screens
        </span>
      </div>
    </div>
  );
}
