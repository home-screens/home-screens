'use client';

interface Tab {
  id: string;
  label: string;
}

interface SegmentedControlProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export default function SegmentedControl({ tabs, activeTab, onChange }: SegmentedControlProps) {
  return (
    <div className="flex gap-1 mx-4 mb-3 p-1 rounded-[10px]" style={{ background: 'rgba(255,255,255,0.06)' }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="flex-1 py-2.5 min-h-[44px] text-sm font-semibold rounded-lg transition-all duration-200 active:scale-[0.98]"
          style={{
            background: tab.id === activeTab ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: tab.id === activeTab ? '#fafafa' : '#737373',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
