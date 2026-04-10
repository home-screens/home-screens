'use client';

export default function ConnectionBanner() {
  return (
    <div role="alert" aria-live="polite" className="sticky top-0 z-20 bg-hs-danger/20 backdrop-blur-sm border-b border-hs-danger/30 px-4 py-2">
      <p className="text-sm text-hs-danger text-center">
        Display unreachable &mdash; check that the device is on and connected
      </p>
    </div>
  );
}
