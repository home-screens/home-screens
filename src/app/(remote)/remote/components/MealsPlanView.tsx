'use client';

import type { MealSlotType } from '@/types/config';
import { SLOT_META, SLOT_ORDER, DEFAULT_MEAL_EMOJI, resolvePlannedMealTime } from '@/lib/meal-constants';
import type { MealsViewProps } from './meals-shared';
import MealTimeChip from '@/components/meals/MealTimeChip';

interface MealsPlanViewProps extends MealsViewProps {
  assignMealToSlot: (date: string, slot: MealSlotType, mealId: string) => Promise<void>;
  clearSlot: (date: string, slot: MealSlotType) => Promise<void>;
  setSlotTime: (date: string, slot: MealSlotType, time: string | undefined) => Promise<void>;
  clearAllPlan: () => void;
  suggestRandom: () => Promise<void>;
  copyLastWeek: () => Promise<void>;
  hasPreviousWeek: boolean;
  pickingSlot: { date: string; slot: MealSlotType } | null;
  setPickingSlot: React.Dispatch<React.SetStateAction<{ date: string; slot: MealSlotType } | null>>;
  setSubView: (v: 'library') => void;
}

export default function MealsPlanView({
  savedMeals,
  plan,
  weekDates,
  todayISO,
  getMealForSlot,
  assignMealToSlot,
  clearSlot,
  setSlotTime,
  clearAllPlan,
  suggestRandom,
  copyLastWeek,
  hasPreviousWeek,
  pickingSlot,
  setPickingSlot,
  settings,
  setSubView,
}: MealsPlanViewProps) {
  // Use chronological slot order, but only the slots the household has enabled
  const enabledSlotsOrdered = SLOT_ORDER.filter((s) => settings.enabledSlots.includes(s));
  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={suggestRandom}
          disabled={savedMeals.length === 0}
          style={{
            flex: 1,
            padding: '8px 8px',
            minHeight: 44,
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid #262626',
            cursor: savedMeals.length === 0 ? 'default' : 'pointer',
            background: '#171717',
            color: savedMeals.length === 0 ? '#333' : '#a3a3a3',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
          aria-label="Suggest random meals"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>
          Suggest
        </button>
        {hasPreviousWeek && (
          <button
            onClick={copyLastWeek}
            style={{
              flex: 1,
              padding: '8px 8px',
              minHeight: 44,
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid #262626',
              cursor: 'pointer',
              background: '#171717',
              color: '#a3a3a3',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
            aria-label="Copy last week's plan"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy Last Week
          </button>
        )}
        <button
          onClick={clearAllPlan}
          disabled={plan.length === 0}
          style={{
            flex: 1,
            padding: '8px 8px',
            minHeight: 44,
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid #262626',
            cursor: plan.length === 0 ? 'default' : 'pointer',
            background: '#171717',
            color: plan.length === 0 ? '#333' : '#a3a3a3',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
          aria-label="Clear all planned meals"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          Clear
        </button>
      </div>

      {savedMeals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ fontSize: 15, color: '#737373', marginBottom: 4 }}>No meals in your library</p>
          <p style={{ fontSize: 13, color: '#525252', marginBottom: 20 }}>
            Add meals to your library first, then plan your week.
          </p>
          <button
            onClick={() => setSubView('library')}
            style={{
              padding: '10px 24px',
              minHeight: 44,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              background: '#f59e0b',
              color: '#000',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Add Meals
          </button>
        </div>
      )}

      {/* Days grid */}
      {weekDates.map(({ date, label }) => {
        const isToday = date === todayISO;

        return (
          <div key={date} style={{ marginBottom: 20 }}>
            {/* Day label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: isToday ? '#fafafa' : '#a3a3a3' }}>
                {label}
              </span>
              {isToday && (
                <div style={{ width: 6, height: 6, borderRadius: 3, background: '#f59e0b' }} />
              )}
            </div>

            {/* Stacked slot rows — full width to make room for the time chip */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {enabledSlotsOrdered.map((slot) => {
                const { planned, meal } = getMealForSlot(date, slot);
                const hasMeal = !!(meal || planned?.customText);
                const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);

                return (
                  <div
                    key={slot}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      minHeight: 50,
                      borderRadius: 10,
                      border: hasMeal ? `1px solid ${SLOT_META[slot].color}30` : '1px dashed #262626',
                      background: hasMeal ? `${SLOT_META[slot].color}10` : 'transparent',
                      overflow: 'visible' as const,
                    }}
                  >
                    {hasMeal ? (
                      <>
                        <button
                          type="button"
                          onClick={() => clearSlot(date, slot)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flex: 1,
                            minWidth: 0,
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            textAlign: 'left' as const,
                            fontFamily: 'inherit',
                          }}
                          aria-label={`Remove ${meal?.name ?? planned?.customText ?? 'meal'} from ${SLOT_META[slot].label}`}
                        >
                          <div style={{ width: 3, height: 28, borderRadius: 2, background: SLOT_META[slot].color, flexShrink: 0 }} />
                          {meal?.emoji && <span style={{ fontSize: 18, flexShrink: 0 }}>{meal.emoji}</span>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, color: SLOT_META[slot].color, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                              {SLOT_META[slot].label}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fafafa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {meal?.name ?? planned?.customText ?? ''}
                            </div>
                          </div>
                        </button>
                        <span style={{ flexShrink: 0 }}>
                          <MealTimeChip
                            value={time}
                            onChange={(t) => setSlotTime(date, slot, t)}
                            slot={slot}
                            variant="darker"
                            align="right"
                            timeFormat={settings.timeFormat}
                          />
                        </span>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPickingSlot({ date, slot })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flex: 1,
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          color: 'inherit',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                        aria-label={`Plan ${SLOT_META[slot].label} for ${label}`}
                      >
                        <div style={{ width: 3, height: 20, borderRadius: 2, background: SLOT_META[slot].color, opacity: 0.4, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: '#525252' }}>{SLOT_META[slot].label}</span>
                        <span style={{ fontSize: 11, color: '#404040', marginLeft: 'auto' }}>+ Add meal</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Meal picker overlay */}
      {pickingSlot && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            top: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={() => setPickingSlot(null)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
            }}
          />
          {/* Picker panel */}
          <div
            style={{
              position: 'relative',
              background: '#0a0a0a',
              borderRadius: '16px 16px 0 0',
              maxHeight: '60vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#525252' }} />
            </div>
            {/* Title */}
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', padding: '8px 16px 10px', borderBottom: '1px solid #262626' }}>
              Choose a Meal
            </div>
            {/* Scrollable list */}
            <div style={{ overflow: 'auto', padding: '8px 16px', flex: 1, scrollbarWidth: 'none' as const }}>
              {savedMeals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#525252', fontSize: 13 }}>
                  No meals in library. Add some first.
                </div>
              ) : (
                savedMeals.map((meal) => (
                  <button
                    key={meal.id}
                    onClick={() => assignMealToSlot(pickingSlot.date, pickingSlot.slot, meal.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '11px 0',
                      border: 'none',
                      borderBottom: '1px solid #262626',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left' as const,
                      color: 'inherit',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{meal.emoji ?? DEFAULT_MEAL_EMOJI}</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#fafafa' }}>{meal.name}</span>
                    {meal.prepTime ? (
                      <span style={{ fontSize: 11, color: '#525252' }}>{meal.prepTime}m</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            {/* Remove Meal button */}
            <div style={{ padding: '12px 16px 24px', borderTop: '1px solid #262626' }}>
              <button
                onClick={() => {
                  clearSlot(pickingSlot.date, pickingSlot.slot);
                  setPickingSlot(null);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid #262626',
                  background: '#171717',
                  color: '#ef4444',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Remove Meal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
