// Kept visually identical everywhere it's used.
export default function PluginBetaBadge({ label }: { label: string }) {
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-hs-accent/20 text-hs-accent-hover rounded">
      {label}
    </span>
  );
}
