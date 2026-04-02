'use client';

import {
  GROCERY_CATEGORIES,
  GROCERY_CATEGORY_ICONS,
} from '@/lib/grocery-utils';

interface MealsGroceryViewProps {
  groceryList: Map<string, { items: Array<{ name: string; amount: string; checked: boolean }> }>;
  groceryStats: { total: number; checked: number };
  toggleGroceryItem: (itemName: string) => Promise<void>;
}

export default function MealsGroceryView({
  groceryList,
  groceryStats,
  toggleGroceryItem,
}: MealsGroceryViewProps) {
  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header stats */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>
            {groceryStats.checked} of {groceryStats.total} items
          </span>
          <button
            style={{
              padding: '6px 14px',
              minHeight: 36,
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid #262626',
              background: '#171717',
              color: '#a3a3a3',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Share
          </button>
        </div>
        {/* Progress bar */}
        <div style={{ height: 6, background: '#262626', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
          <div
            style={{
              height: '100%',
              borderRadius: 3,
              width: groceryStats.total > 0 ? `${(groceryStats.checked / groceryStats.total) * 100}%` : '0%',
              backgroundColor: '#22c55e',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: '#525252' }}>
          Auto-generated from this week&apos;s meals
        </div>
      </div>

      {/* Empty state */}
      {groceryStats.total === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <p style={{ fontSize: 15, color: '#737373', marginBottom: 4 }}>No grocery items</p>
          <p style={{ fontSize: 13, color: '#525252' }}>
            Plan meals with ingredients to see your shopping list.
          </p>
        </div>
      )}

      {/* Category groups */}
      {Array.from(groceryList.entries()).map(([catKey, { items }]) => {
        const catChecked = items.filter((i) => i.checked).length;
        return (
        <div key={catKey} style={{ marginBottom: 20 }}>
          {/* Category header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            {GROCERY_CATEGORY_ICONS[catKey] && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#525252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={GROCERY_CATEGORY_ICONS[catKey]} />
              </svg>
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {GROCERY_CATEGORIES[catKey] ?? catKey}
            </span>
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 8,
                background: '#171717',
                color: '#525252',
                fontWeight: 500,
                marginLeft: 'auto',
              }}
            >
              {catChecked}/{items.length}
            </span>
          </div>

          {/* Items */}
          {items.map((item) => (
            <button
              key={item.name}
              onClick={() => toggleGroceryItem(item.name)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 12px',
                minHeight: 44,
                marginBottom: 4,
                borderRadius: 10,
                border: '1px solid #262626',
                background: '#171717',
                cursor: 'pointer',
                opacity: item.checked ? 0.45 : 1,
                transition: 'all 0.15s',
                textAlign: 'left' as const,
                color: 'inherit',
                fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: item.checked ? '#22c55e' : 'transparent',
                  border: item.checked ? 'none' : '2px solid #525252',
                  transition: 'all 0.15s',
                }}
              >
                {item.checked && (
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>&#10003;</span>
                )}
              </div>

              {/* Name */}
              <span
                style={{
                  flex: 1,
                  fontSize: 14,
                  fontWeight: 500,
                  color: item.checked ? '#525252' : '#e5e5e5',
                  textDecoration: item.checked ? 'line-through' : 'none',
                }}
              >
                {item.name}
              </span>

              {/* Amount */}
              {item.amount && (
                <span style={{ fontSize: 12, color: '#525252', flexShrink: 0 }}>
                  {item.amount}
                </span>
              )}
            </button>
          ))}
        </div>
        );
      })}
    </div>
  );
}
