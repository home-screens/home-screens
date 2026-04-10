import clsx from 'clsx';

interface HomeScreensLogoProps {
  className?: string;
  contextLabel?: string;
}

export default function HomeScreensLogo({
  className,
  contextLabel,
}: HomeScreensLogoProps) {
  return (
    <div className={clsx('flex shrink-0 items-center gap-3 text-left', className)}>
      <div
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/25 bg-[linear-gradient(160deg,#0f172a_0%,#10253d_48%,#143a58_100%)] shadow-[0_10px_30px_rgba(6,182,212,0.18)]"
      >
        <svg viewBox="0 0 48 48" className="h-7 w-7" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M9 21.5L24 10L39 21.5"
            stroke="#A5F3FC"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="11.5" y="20.5" width="25" height="16" rx="5" fill="#082F49" stroke="#67E8F9" strokeWidth="2.5" />
          <rect x="17" y="25" width="14" height="2.5" rx="1.25" fill="#A5F3FC" opacity="0.95" />
          <rect x="17" y="29.5" width="9" height="2.5" rx="1.25" fill="#CFFAFE" opacity="0.85" />
          <path d="M29 36.5V31.5H33V36.5" stroke="#E0F2FE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="flex min-w-0 items-center gap-2.5 leading-none">
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-[0.95rem] font-semibold tracking-[0.16em] uppercase text-hs-logo-wordmark">
            Home
          </span>
          <span className="text-[1.05rem] font-semibold tracking-[0.08em] text-hs-text-primary">
            Screens
          </span>
        </div>
        {contextLabel && (
          <span className="hidden rounded-full border border-hs-border-strong bg-hs-panel/80 px-2 py-1 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-hs-text-muted xl:inline-flex">
            {contextLabel}
          </span>
        )}
      </div>
    </div>
  );
}
