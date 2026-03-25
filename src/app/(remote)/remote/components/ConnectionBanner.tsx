'use client';

export default function ConnectionBanner() {
  return (
    <div className="sticky top-0 z-20 bg-red-900/80 backdrop-blur-sm border-b border-red-800 px-4 py-2">
      <p className="text-sm text-red-200 text-center">
        Display unreachable &mdash; check that the device is on and connected
      </p>
    </div>
  );
}
