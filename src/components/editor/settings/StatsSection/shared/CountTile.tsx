/** Small numeric summary tile (Screens / Modules / Profiles).
 * `overflow-hidden` + `truncate` on the label defends against narrow
 * grid columns at minimum browser width — the label shortens before
 * anything bleeds past the border. The number row is `whitespace-nowrap`
 * so big counts like "1024" never break mid-digit. */
export function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-hs-hover border border-hs-border-strong px-3 py-2.5 min-w-0 overflow-hidden">
      <p className="text-[10px] text-hs-text-faint uppercase tracking-wider truncate">{label}</p>
      <p className="text-xl font-semibold text-hs-text-primary tabular-nums mt-0.5 whitespace-nowrap">
        {value}
      </p>
    </div>
  );
}
