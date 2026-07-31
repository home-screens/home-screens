interface LogoMarkProps {
  /** Tailwind sizing for on-page use (e.g. "h-6 w-6"). */
  className?: string;
  /** Explicit pixel size, for renderers that ignore CSS classes. */
  size?: number;
  /**
   * Satori (the OG image renderer) does not honour `opacity` on shapes, so the
   * OG card needs `fillOpacity` instead. Everything else keeps `opacity`.
   *
   * This flag is the only legitimate difference between the three renderings of
   * the mark. Before it existed the OG card carried a hand-maintained copy that
   * had drifted: it was missing the stand entirely and shipped that way.
   */
  forSatori?: boolean;
}

/**
 * The Home Screens brand mark: a roof, a screen body, two text lines, and a
 * stand. Single source of truth for the site header, the docs header, and the
 * Open Graph card.
 */
export function LogoMark({ className, size, forSatori = false }: LogoMarkProps) {
  const fade = (value: number) =>
    forSatori ? { fillOpacity: value } : { opacity: value };

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...(className ? { className } : {})}
      {...(size ? { width: size, height: size } : {})}
    >
      {/* Roof */}
      <path
        d="M9 21.5L24 10L39 21.5"
        stroke="#A5F3FC"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Screen body */}
      <rect
        x="11.5"
        y="20.5"
        width="25"
        height="16"
        rx="5"
        fill="#082F49"
        stroke="#67E8F9"
        strokeWidth={2.5}
      />
      {/* Two lines of content on the screen */}
      <rect x="17" y="25" width="14" height="2.5" rx="1.25" fill="#A5F3FC" {...fade(0.95)} />
      <rect x="17" y="29.5" width="9" height="2.5" rx="1.25" fill="#CFFAFE" {...fade(0.85)} />
      {/* Stand */}
      <path
        d="M29 36.5V31.5H33V36.5"
        stroke="#E0F2FE"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
