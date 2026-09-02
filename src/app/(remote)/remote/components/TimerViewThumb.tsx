import type { TimerView } from '@/types/timers';

/**
 * Postage-stamp preview of what a timer look actually puts on the wall.
 *
 * "Glow ring", "Timer face", "Color fall" and "Star path" are evocative names
 * that tell you nothing until you have started one and walked to the display,
 * so each chip carries a 24px drawing of its view: the same shapes and colors
 * the real views use (`src/components/display/timer-views/`).
 */
export default function TimerViewThumb({ view }: { view: TimerView }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true } as const;

  switch (view) {
    case 'ring':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#0d151f" />
          <circle cx="12" cy="12" r="6.5" fill="none" stroke="#1e3040" strokeWidth="2.5" />
          <circle
            cx="12"
            cy="12"
            r="6.5"
            fill="none"
            stroke="#2dd4bf"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="30 41"
            transform="rotate(-90 12 12)"
          />
        </svg>
      );
    case 'face':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#f4efe6" />
          <circle cx="12" cy="12" r="7" fill="#fff" stroke="#d8cfc0" strokeWidth="1" />
          <path d="M12 12 L12 5 A7 7 0 0 1 18.3 15.1 Z" fill="#e8503a" />
        </svg>
      );
    case 'cascade':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#0c0f14" />
          <path d="M0 10 h24 v8 a6 6 0 0 1 -6 6 h-12 a6 6 0 0 1 -6 -6 Z" fill="#ea7a2b" />
          <rect x="0" y="10" width="24" height="1.5" fill="#fcd9a0" />
        </svg>
      );
    case 'path':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#101433" />
          <path
            d="M4 17 C 8 17, 8 8, 12 8 S 16 15, 20 15"
            fill="none"
            stroke="#4c5ba8"
            strokeWidth="1.5"
            strokeDasharray="2 2"
            strokeLinecap="round"
          />
          <circle cx="4" cy="17" r="1.8" fill="#6f7cc7" />
          <circle cx="20" cy="15" r="1.8" fill="#6f7cc7" />
          <path d="M12 4.2 l1.5 3.1 3.4 .5 -2.5 2.4 .6 3.4 -3 -1.6 -3 1.6 .6 -3.4 -2.5 -2.4 3.4 -.5 Z" fill="#fbbf24" />
        </svg>
      );
  }
}
