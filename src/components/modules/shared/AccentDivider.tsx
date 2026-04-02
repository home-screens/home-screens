import { TEXT_OPACITY } from '@/lib/constants';

interface AccentDividerProps {
  accentColor: string;
  hasAccent: boolean;
}

/**
 * Short decorative horizontal divider that uses the module's accent color
 * when set, falling back to a neutral white line when no accent is configured.
 */
export function AccentDivider({ accentColor, hasAccent }: AccentDividerProps) {
  return (
    <div
      className="w-12 h-0.5 rounded-full"
      style={{
        backgroundColor: hasAccent ? accentColor : 'rgba(255,255,255,0.15)',
        opacity: TEXT_OPACITY.secondary,
      }}
    />
  );
}
