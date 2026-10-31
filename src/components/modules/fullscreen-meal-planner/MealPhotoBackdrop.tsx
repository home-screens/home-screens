'use client';

/**
 * The next meal's photo behind the full-screen Next Meal view: one still
 * picture and one plain vertical scrim, darker behind the name. No blur, no
 * fade, no animation: each full-screen animated layer costs a Pi 4 about a
 * quarter of its GPU in portrait, and a still layer costs nothing once drawn.
 */
export default function MealPhotoBackdrop({ url }: { url: string }) {
  return (
    <div aria-hidden data-testid="fmp-photo-backdrop" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.62) 28%, rgba(0,0,0,0.70) 50%, rgba(0,0,0,0.66) 74%, rgba(0,0,0,0.58) 100%)',
        }}
      />
    </div>
  );
}
