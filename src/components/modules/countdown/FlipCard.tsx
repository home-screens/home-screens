import { TEXT_OPACITY } from '@/lib/constants';

export function FlipCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center" style={{ gap: '0.2em' }}>
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.12) 49.5%, rgba(0,0,0,0.15) 49.5%, rgba(0,0,0,0.15) 50.5%, rgba(255,255,255,0.08) 50.5%, rgba(255,255,255,0.08) 100%)',
          minWidth: '1.8em',
          height: '2.2em',
          padding: '0 0.25em',
          borderRadius: '0.2em',
          boxShadow: '0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        <span
          className="font-bold tabular-nums leading-none"
          style={{ fontSize: '1.3em', letterSpacing: '-0.02em' }}
        >
          {value}
        </span>
      </div>
      <span className="uppercase tracking-widest leading-none" style={{ fontSize: '0.3em', opacity: TEXT_OPACITY.tertiary }}>
        {label}
      </span>
    </div>
  );
}

export function FlipSeparator() {
  return (
    <div className="flex flex-col items-center justify-center self-stretch" style={{ paddingBottom: '1em', width: '0.4em' }}>
      <div className="flex flex-col items-center" style={{ gap: '0.25em' }}>
        <div className="rounded-full" style={{ width: '0.22em', height: '0.22em', background: 'rgba(255,255,255,0.3)' }} />
        <div className="rounded-full" style={{ width: '0.22em', height: '0.22em', background: 'rgba(255,255,255,0.3)' }} />
      </div>
    </div>
  );
}
