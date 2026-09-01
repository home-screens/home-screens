/** Mini cache stat tile. `gap-2` keeps label and value apart at narrow widths;
 * `truncate` on the label means it loses characters before the value wraps. */
export function CacheStatTile({ label, value, tone = 'neutral' }: {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'neutral';
}) {
  const valueClass =
    tone === 'success' ? 'text-hs-success' :
    tone === 'warning' ? 'text-hs-warning' : 'text-hs-text-body';
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-2 rounded-md border border-hs-border-strong min-w-0">
      <span className="text-[11px] text-hs-text-faint uppercase tracking-wider truncate">
        {label}
      </span>
      <span className={`text-xs font-mono tabular-nums whitespace-nowrap ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
