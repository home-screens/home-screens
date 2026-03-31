'use client';

interface BottomTabBarProps {
  activeTab: string;
  onChange: (tab: string) => void;
}

export default function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/85 backdrop-blur-xl border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-center">
        <button
          onClick={() => onChange('control')}
          className={`flex-1 max-w-[120px] min-h-[44px] flex flex-col items-center gap-1 pt-2.5 pb-2 transition-colors ${
            activeTab === 'control' ? 'text-blue-500' : 'text-neutral-500'
          }`}
          aria-label="Control"
          aria-current={activeTab === 'control' ? 'page' : undefined}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7" />
          </svg>
          <span className="text-[10px] font-semibold tracking-wide">Control</span>
        </button>

        <button
          onClick={() => onChange('chores')}
          className={`flex-1 max-w-[120px] min-h-[44px] flex flex-col items-center gap-1 pt-2.5 pb-2 transition-colors ${
            activeTab === 'chores' ? 'text-blue-500' : 'text-neutral-500'
          }`}
          aria-label="Chores"
          aria-current={activeTab === 'chores' ? 'page' : undefined}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] font-semibold tracking-wide">Chores</span>
        </button>
      </div>
    </nav>
  );
}
