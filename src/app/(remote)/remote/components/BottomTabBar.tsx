'use client';

interface Tab {
  id: string;
  label: string;
  svgPath: string;
}

const CONTROL_TAB: Tab = {
  id: 'control',
  label: 'Control',
  svgPath: 'M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7',
};

const CHORES_TAB: Tab = {
  id: 'chores',
  label: 'Chores',
  svgPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

const MEALS_TAB: Tab = {
  id: 'meals',
  label: 'Meals',
  svgPath: 'M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.379a48.474 48.474 0 00-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z',
};

const PHOTOS_TAB: Tab = {
  id: 'photos',
  label: 'Photos',
  svgPath: 'm2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z',
};

interface BottomTabBarProps {
  activeTab: string;
  onChange: (tab: string) => void;
  hasChores?: boolean;
  hasMeals?: boolean;
  hasPhotos?: boolean;
}

export default function BottomTabBar({ activeTab, onChange, hasChores, hasMeals, hasPhotos }: BottomTabBarProps) {
  const tabs: Tab[] = [CONTROL_TAB];
  if (hasChores) tabs.push(CHORES_TAB);
  if (hasMeals) tabs.push(MEALS_TAB);
  if (hasPhotos) tabs.push(PHOTOS_TAB);

  if (tabs.length < 2) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-hs-body/85 backdrop-blur-xl border-t border-hs-border-subtle pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex-1 max-w-[120px] min-h-[44px] flex flex-col items-center gap-1 pt-2.5 pb-2 transition-colors ${
              activeTab === tab.id ? 'text-hs-accent' : 'text-hs-text-faint'
            }`}
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.svgPath} />
            </svg>
            <span className="text-[10px] font-semibold tracking-wide">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
