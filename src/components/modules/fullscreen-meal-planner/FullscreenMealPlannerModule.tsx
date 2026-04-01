'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { useFetchData } from '@/hooks/useFetchData';
import type { FullscreenMealPlannerConfig, SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import type { ModuleStyle } from '@/types/config';

interface MealDataResponse {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  groceryChecked: string[];
}

// ─── Types ───

interface FullscreenMealPlannerModuleProps {
  config: FullscreenMealPlannerConfig;
  style: ModuleStyle;
  timezone?: string;
  fullscreenTheme?: string;
}

// ─── Constants ───

const SLOT_META: Record<MealSlotType, { label: string; color: string }> = {
  breakfast: { label: 'Breakfast', color: '#f59e0b' },
  lunch:     { label: 'Lunch',     color: '#10b981' },
  dinner:    { label: 'Dinner',    color: '#6366f1' },
  snack:     { label: 'Snack',     color: '#ec4899' },
};

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLOT_ORDER: MealSlotType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const SLOT_WINDOWS: Record<MealSlotType, { start: number; end: number }> = {
  breakfast: { start: 5, end: 10 },
  lunch:     { start: 10, end: 14 },
  snack:     { start: 14, end: 17 },
  dinner:    { start: 17, end: 21 },
};

// ─── Helpers ───

function getDensityMultiplier(density: string): number {
  return density === 'cozy' ? 1.2 : 1.0;
}

function getTypoMultiplier(size: string): number {
  if (size === 'small') return 0.85;
  if (size === 'large') return 1.15;
  if (size === 'extra-large') return 1.35;
  return 1.0;
}

function getOrderedDays(weekStartDay: 'sunday' | 'monday'): number[] {
  if (weekStartDay === 'monday') return [1, 2, 3, 4, 5, 6, 0];
  return [0, 1, 2, 3, 4, 5, 6];
}

function resolveMeal(
  day: number,
  slot: MealSlotType,
  planArr: PlannedMeal[],
  meals: SavedMeal[],
): SavedMeal | null {
  const planned = planArr.find((p) => p.day === day && p.slot === slot);
  if (!planned) return null;
  if (planned.mealId) {
    return meals.find((m) => m.id === planned.mealId) ?? null;
  }
  return null;
}

function getActiveSlot(hour: number, slots: MealSlotType[]): MealSlotType | null {
  const active = SLOT_ORDER.filter((s) => slots.includes(s));
  for (const s of active) {
    const w = SLOT_WINDOWS[s];
    if (hour >= w.start && hour < w.end) return s;
  }
  return null;
}

function getNextMeal(
  now: Date,
  planArr: PlannedMeal[],
  meals: SavedMeal[],
  slots: MealSlotType[],
): { meal: SavedMeal; slot: MealSlotType; context: 'now' | 'upcoming' | 'tomorrow'; day: number } | null {
  const hour = now.getHours();
  const today = now.getDay();
  const activeOrder = SLOT_ORDER.filter((s) => slots.includes(s));
  if (activeOrder.length === 0) return null;

  // Currently in a slot window
  for (const s of activeOrder) {
    const w = SLOT_WINDOWS[s];
    if (hour >= w.start && hour < w.end) {
      const meal = resolveMeal(today, s, planArr, meals);
      if (meal) return { meal, slot: s, context: 'now', day: today };
    }
  }

  // Next upcoming slot today
  for (const s of activeOrder) {
    if (hour < SLOT_WINDOWS[s].start) {
      const meal = resolveMeal(today, s, planArr, meals);
      if (meal) return { meal, slot: s, context: 'upcoming', day: today };
    }
  }

  // First slot tomorrow
  const tomorrow = (today + 1) % 7;
  for (const s of activeOrder) {
    const meal = resolveMeal(tomorrow, s, planArr, meals);
    if (meal) return { meal, slot: s, context: 'tomorrow', day: tomorrow };
  }

  return null;
}

function countPlanned(
  planArr: PlannedMeal[],
  totalSlots: number,
): { filled: number; total: number; pct: number } {
  const filled = planArr.filter((p) => p.mealId).length;
  return { filled, total: totalSlots, pct: totalSlots > 0 ? Math.round((filled / totalSlots) * 100) : 0 };
}

// ─── Component ───

export default function FullscreenMealPlannerModule({
  config,
  style: _style,
  timezone: _timezone,
  fullscreenTheme,
}: FullscreenMealPlannerModuleProps) {
  // ── Data fetching ──
  const [mealData] = useFetchData<MealDataResponse>('/api/meals/data', 60_000);
  const savedMeals = useMemo(() => mealData?.savedMeals ?? [], [mealData?.savedMeals]);
  const plan = useMemo(() => mealData?.plan ?? [], [mealData?.plan]);

  // ── Scale system ──
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1080, h: 1920 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDims({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ── Theme ──
  const theme = getThemeTokens(config.theme ?? fullscreenTheme);

  const bu = Math.min(dims.w, dims.h) / 100;
  const typoMul = getTypoMultiplier(config.typographySize ?? 'medium');
  const densityMul = getDensityMultiplier(config.density ?? 'snug');
  const s = bu * typoMul;
  const d = densityMul;

  // ── Current time ──
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const currentHour = now.getHours();
  const slots = useMemo(() => config.slots ?? ['breakfast', 'lunch', 'dinner'], [config.slots]);
  const activeSlot = getActiveSlot(currentHour, slots);
  const view = config.view ?? 'week';
  const showEmoji = config.showEmoji ?? true;
  const showPrepTime = config.showPrepTime ?? true;
  const showTags = config.showTags ?? true;
  const showDifficulty = config.showDifficulty ?? false;

  const pad = s * 2 * d;
  const headerFont = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";
  const bodyFont = "'Inter', sans-serif";

  // ── CSS custom properties ──
  const cssVars = {
    '--fmp-bg': theme.bg,
    '--fmp-surface': theme.surface,
    '--fmp-text': theme.text,
    '--fmp-text-2': theme.textSecondary,
    '--fmp-text-3': theme.textMuted,
    '--fmp-border': theme.border,
    '--fmp-border-sub': theme.borderSubtle,
    '--fmp-accent': config.accentColor ?? '#f59e0b',
    '--fmp-card-shadow': theme.cardShadow,
    '--fmp-past-op': String(theme.pastOpacity),
  } as React.CSSProperties;

  // ── Render views ──

  const renderWeekView = useCallback(() => {
    const days = getOrderedDays(config.weekStartDay ?? 'sunday');
    const dateNow = now;
    const todayDow = dateNow.getDay();

    // Compute start-of-week date for the date range header
    let startOffset = days[0] - todayDow;
    if (startOffset > 0) startOffset -= 7;
    const weekStart = new Date(dateNow);
    weekStart.setDate(dateNow.getDate() + startOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const formatShort = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dateRange = `${formatShort(weekStart)} – ${formatShort(weekEnd)}`;

    const { filled, total, pct } = countPlanned(plan, days.length * slots.length);

    // Determine past days using position within the ordered week
    const todayIndex = days.indexOf(todayDow);
    const isPast = (day: number) => days.indexOf(day) < todayIndex;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: bodyFont }}>
        {/* Header */}
        <div style={{
          padding: `${pad}px ${pad}px ${pad * 0.3}px`,
          flexShrink: 0,
        }}>
          <div style={{ fontFamily: headerFont, fontSize: s * 2.8, fontWeight: 400, color: 'var(--fmp-text)' }}>
            This Week&rsquo;s Meals
          </div>
          <div style={{ fontSize: s * 1.1, color: 'var(--fmp-text-3)', marginTop: s * 0.3 }}>
            {dateRange}, {weekStart.getFullYear()}
          </div>
        </div>

        {/* Day rows */}
        <div className="fmp-scroll" style={{ flex: 1, minHeight: 0, padding: `0 ${pad}px`, display: 'flex', flexDirection: 'column', gap: s * 0.6 }}>
          {days.map((day) => {
            const isToday = day === todayDow;
            const dayPast = isPast(day);
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + days.indexOf(day));
            const dateNum = dayDate.getDate();

            return (
              <div
                key={day}
                style={{
                  opacity: dayPast && !isToday ? `var(--fmp-past-op)` : 1,
                  background: isToday ? `color-mix(in srgb, var(--fmp-accent) 6%, transparent)` : 'transparent',
                  border: isToday ? `1px solid color-mix(in srgb, var(--fmp-accent) 20%, transparent)` : '1px solid transparent',
                  borderRadius: bu * 0.8,
                  padding: `${s * 0.6}px ${s * 0.8}px`,
                } as React.CSSProperties}
              >
                {/* Day label row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: s * 0.5, marginBottom: s * 0.8 }}>
                  <span style={{
                    fontSize: s * 1.2, fontWeight: 700, textTransform: 'uppercase' as const,
                    letterSpacing: '0.06em', color: isToday ? 'var(--fmp-accent)' : 'var(--fmp-text-2)',
                  }}>
                    {DAY_NAMES_SHORT[day]}
                  </span>
                  <span style={{ fontSize: s * 1.1, color: 'var(--fmp-text-3)', fontWeight: 500 }}>
                    {dayDate.toLocaleDateString('en-US', { month: 'short' })} {dateNum}
                  </span>
                  {isToday && (
                    <span style={{
                      fontSize: s * 0.8, fontWeight: 700, color: 'var(--fmp-accent)',
                      background: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`,
                      padding: `${s * 0.15}px ${s * 0.6}px`, borderRadius: s * 0.3,
                      textTransform: 'uppercase' as const, letterSpacing: '0.08em',
                      marginLeft: 'auto',
                    }}>
                      Today
                    </span>
                  )}
                </div>

                {/* Meal cards row */}
                <div style={{ display: 'flex', gap: s * 0.6 }}>
                  {slots.map((slot) => {
                    const meal = resolveMeal(day, slot, plan, savedMeals);
                    const meta = SLOT_META[slot];
                    const isActiveSlot = isToday && slot === activeSlot;

                    const slotLabel = (
                      <span style={{
                        fontSize: s * 0.7, fontWeight: 700,
                        textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                        color: meta.color, opacity: 0.85,
                      }}>
                        {meta.label}
                      </span>
                    );

                    if (!meal) {
                      return (
                        <div key={slot} style={{
                          flex: 1, minWidth: 0,
                          border: `1.5px dashed var(--fmp-border)`,
                          borderRadius: s * 0.8,
                          padding: `${s * 0.6}px ${s * 0.5}px ${s * 1}px`,
                          display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
                          justifyContent: 'center', gap: s * 0.4,
                          textAlign: 'center' as const,
                        }}>
                          {slotLabel}
                          <span style={{ color: 'var(--fmp-text-3)', fontSize: s * 1.6, fontWeight: 300, lineHeight: 1 }}>+</span>
                        </div>
                      );
                    }

                    return (
                      <div key={slot} style={{
                        flex: 1, minWidth: 0,
                        background: 'var(--fmp-surface)',
                        borderRadius: s * 0.8,
                        border: isActiveSlot
                          ? `2px solid var(--fmp-accent)`
                          : '1px solid var(--fmp-border-sub)',
                        borderTop: `3px solid ${meta.color}`,
                        boxShadow: isActiveSlot
                          ? `0 0 0 2px var(--fmp-accent), var(--fmp-card-shadow)`
                          : 'var(--fmp-card-shadow)',
                        padding: `${s * 0.5}px ${s * 0.5}px ${s * 0.8}px`,
                        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
                        gap: s * 0.15,
                        position: 'relative' as const,
                        textAlign: 'center' as const,
                      }}>
                        {isActiveSlot && (
                          <span className="fmp-now-dot" style={{
                            position: 'absolute' as const, top: s * 0.5, right: s * 0.5,
                            width: s * 0.5, height: s * 0.5, borderRadius: '50%',
                            background: 'var(--fmp-accent)',
                          }} />
                        )}
                        {slotLabel}
                        {showEmoji && meal.emoji && (
                          <span style={{ fontSize: s * 3.2, lineHeight: 1.2 }}>
                            {meal.emoji}
                          </span>
                        )}
                        <span style={{
                          fontSize: s * 1.1, fontWeight: 600, color: 'var(--fmp-text)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          maxWidth: '100%',
                        }}>
                          {meal.name}
                        </span>
                        {showPrepTime && meal.prepTime && (
                          <span style={{ fontSize: s * 0.9, color: 'var(--fmp-text-3)' }}>
                            {meal.prepTime} min
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: `${pad * 0.6}px ${pad}px ${pad}px`, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: s * 1,
        }}>
          <span style={{ fontSize: s * 1, color: 'var(--fmp-text-3)', fontWeight: 500, whiteSpace: 'nowrap' as const }}>
            {filled} of {total} meals planned
          </span>
          <div style={{
            width: s * 6, height: s * 0.25, background: 'var(--fmp-border-sub)',
            borderRadius: s * 0.15, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', background: 'var(--fmp-accent)',
              borderRadius: s * 0.15, width: `${pct}%`, transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      </div>
    );
  }, [config.weekStartDay, now, plan, savedMeals, slots, activeSlot, bu, s, pad, showEmoji, showPrepTime]);

  const renderTodayView = useCallback(() => {
    const todayDow = now.getDay();
    const activeOrder = SLOT_ORDER.filter((sl) => slots.includes(sl));

    // Find current/hero meal
    const heroSlot = activeSlot ?? activeOrder[0] ?? 'dinner';
    const heroMeal = resolveMeal(todayDow, heroSlot, plan, savedMeals);
    const heroMeta = SLOT_META[heroSlot];

    // Other meals (non-hero)
    const otherSlots = activeOrder.filter((sl) => sl !== heroSlot);

    // Determine if a slot is past
    const isSlotPast = (sl: MealSlotType) => {
      const w = SLOT_WINDOWS[sl];
      return currentHour >= w.end;
    };

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        fontFamily: bodyFont, padding: pad,
      }}>
        {/* Header */}
        <div style={{
          fontFamily: headerFont, fontSize: s * 2.2, fontWeight: 400,
          color: 'var(--fmp-text)', marginBottom: s * 1.5,
        }}>
          Today&rsquo;s Meals
        </div>

        {/* Hero card */}
        <div style={{
          background: 'var(--fmp-surface)',
          borderRadius: bu * 1,
          padding: `${s * 2}px`,
          boxShadow: `0 0 ${s * 2}px color-mix(in srgb, var(--fmp-accent) 15%, transparent)`,
          border: `1px solid color-mix(in srgb, var(--fmp-accent) 25%, transparent)`,
          display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: s * 0.8,
        }}>
          {/* Badge */}
          <span style={{
            fontSize: s * 0.65, fontWeight: 600, textTransform: 'uppercase' as const,
            letterSpacing: '0.1em', color: 'var(--fmp-accent)',
            background: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`,
            padding: `${s * 0.15}px ${s * 0.6}px`, borderRadius: s * 0.3,
          }}>
            ⚡ Now &mdash; {heroMeta.label}
          </span>

          {heroMeal ? (
            <>
              {showEmoji && heroMeal.emoji && (
                <span style={{ fontSize: s * 3.5, lineHeight: 1 }}>{heroMeal.emoji}</span>
              )}
              <span style={{
                fontFamily: headerFont, fontSize: s * 1.8, fontWeight: 400,
                color: 'var(--fmp-text)', textAlign: 'center' as const,
              }}>
                {heroMeal.name}
              </span>
              {heroMeal.notes && (
                <span style={{
                  fontSize: s * 0.8, fontStyle: 'italic', color: 'var(--fmp-text-2)',
                  textAlign: 'center' as const, maxWidth: '80%',
                }}>
                  {heroMeal.notes}
                </span>
              )}
              {/* Meta pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: s * 0.4, justifyContent: 'center' }}>
                {showPrepTime && heroMeal.prepTime && (
                  <span style={{
                    fontSize: s * 0.65, color: 'var(--fmp-text-3)',
                    background: 'var(--fmp-border-sub)', padding: `${s * 0.1}px ${s * 0.5}px`,
                    borderRadius: s * 0.3,
                  }}>
                    &#9201; {heroMeal.prepTime}m
                  </span>
                )}
                {showDifficulty && heroMeal.difficulty && (() => {
                  const dc = heroMeal.difficulty === 'easy' ? '#10b981' : heroMeal.difficulty === 'medium' ? '#f59e0b' : heroMeal.difficulty === 'hard' ? '#ef4444' : undefined;
                  return (
                    <span style={{
                      fontSize: s * 0.65,
                      color: dc ?? 'var(--fmp-text-3)',
                      background: 'var(--fmp-border-sub)',
                      border: dc ? `1px solid ${dc}40` : undefined,
                      padding: `${s * 0.1}px ${s * 0.5}px`,
                      borderRadius: s * 0.3,
                    }}>
                      {heroMeal.difficulty}
                    </span>
                  );
                })()}
                {showTags && heroMeal.tags?.map((tag) => (
                  <span key={tag} style={{
                    fontSize: s * 0.6, color: 'var(--fmp-text-3)',
                    background: 'var(--fmp-border-sub)', padding: `${s * 0.1}px ${s * 0.5}px`,
                    borderRadius: s * 0.3,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span style={{ fontSize: s * 1.2, color: 'var(--fmp-text-3)', padding: `${s * 2}px 0` }}>
              No meal planned
            </span>
          )}
        </div>

        {/* Also Today */}
        {otherSlots.length > 0 && (
          <>
            <div style={{
              fontSize: s * 0.75, fontWeight: 600, textTransform: 'uppercase' as const,
              letterSpacing: '0.08em', color: 'var(--fmp-text-3)',
              marginTop: s * 2, marginBottom: s * 0.8,
            }}>
              Also Today
            </div>
            <div style={{ display: 'flex', gap: s * 0.6, flexWrap: 'wrap' as const }}>
              {otherSlots.map((sl) => {
                const meal = resolveMeal(todayDow, sl, plan, savedMeals);
                const meta = SLOT_META[sl];
                const past = isSlotPast(sl);

                return (
                  <div key={sl} style={{
                    flex: 1, minWidth: s * 10,
                    background: 'var(--fmp-surface)', borderRadius: bu * 0.8,
                    border: '1px solid var(--fmp-border-sub)',
                    padding: `${s * 0.8}px ${s * 1}px`,
                    display: 'flex', alignItems: 'center', gap: s * 0.6,
                    opacity: past ? `var(--fmp-past-op)` : 1,
                  } as React.CSSProperties}>
                    {/* Slot color bar */}
                    <span style={{
                      width: s * 0.3, height: s * 2, borderRadius: s * 0.15,
                      background: meta.color, flexShrink: 0,
                    }} />
                    {showEmoji && meal?.emoji && (
                      <span style={{ fontSize: s * 1.2, lineHeight: 1, flexShrink: 0 }}>{meal.emoji}</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: s * 0.55, fontWeight: 600, textTransform: 'uppercase' as const,
                        letterSpacing: '0.06em', color: meta.color, marginBottom: s * 0.1,
                      }}>
                        {meta.label}
                      </div>
                      <div style={{
                        fontSize: s * 0.8, fontWeight: 600, color: 'var(--fmp-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                      }}>
                        {meal?.name ?? 'Not planned'}
                      </div>
                    </div>
                    {showPrepTime && meal?.prepTime && (
                      <span style={{ fontSize: s * 0.6, color: 'var(--fmp-text-3)', flexShrink: 0 }}>
                        {meal.prepTime}m
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }, [now, plan, savedMeals, slots, activeSlot, currentHour, bu, s, pad, showEmoji, showPrepTime, showTags, showDifficulty]);

  const renderMenuBoardView = useCallback(() => {
    const todayDow = now.getDay();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const activeOrder = SLOT_ORDER.filter((sl) => slots.includes(sl));

    // Only show slots that have a meal planned
    const courses = activeOrder
      .map((sl) => ({ slot: sl, meal: resolveMeal(todayDow, sl, plan, savedMeals), meta: SLOT_META[sl] }))
      .filter((c) => c.meal !== null) as { slot: MealSlotType; meal: SavedMeal; meta: { label: string; color: string } }[];

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', fontFamily: bodyFont,
        padding: pad, textAlign: 'center' as const,
      }}>
        {/* Ornamental top */}
        <div style={{ fontSize: s * 1, color: 'var(--fmp-text-3)', letterSpacing: '0.5em', marginBottom: s * 1 }}>
          &#10022; &#10022; &#10022;
        </div>

        {/* Title */}
        <div style={{
          fontFamily: headerFont, fontSize: s * 2.4, fontWeight: 400,
          color: 'var(--fmp-text)', marginBottom: s * 0.5,
        }}>
          Today&rsquo;s Menu
        </div>

        {/* Date */}
        <div style={{ fontSize: s * 0.85, color: 'var(--fmp-text-3)', marginBottom: s * 1.5 }}>
          {dateStr}
        </div>

        {/* Decorative divider */}
        <div style={{
          width: '60%', display: 'flex', alignItems: 'center', gap: s * 0.5,
          marginBottom: s * 1.5,
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--fmp-border)' }} />
          <span style={{ fontSize: s * 0.7, color: 'var(--fmp-text-3)' }}>&#9670;</span>
          <div style={{ flex: 1, height: 1, background: 'var(--fmp-border)' }} />
        </div>

        {/* Courses */}
        <div className="fmp-scroll" style={{
          display: 'flex', flexDirection: 'column', gap: s * 1.5,
          width: '100%', maxWidth: s * 40, flex: courses.length > 3 ? 1 : undefined, minHeight: 0,
        }}>
          {courses.length === 0 ? (
            <div style={{ color: 'var(--fmp-text-3)', fontSize: s * 1, padding: `${s * 3}px 0` }}>
              No meals planned for today
            </div>
          ) : courses.map((course, i) => (
            <div key={course.slot}>
              {/* Slot pill */}
              <div style={{ marginBottom: s * 0.5 }}>
                <span style={{
                  fontSize: s * 0.6, fontWeight: 700, textTransform: 'uppercase' as const,
                  letterSpacing: '0.12em', color: course.meta.color,
                  background: `${course.meta.color}1a`,
                  padding: `${s * 0.15}px ${s * 0.6}px`, borderRadius: s * 0.3,
                }}>
                  {course.meta.label}
                </span>
              </div>

              {/* Emoji */}
              {showEmoji && course.meal.emoji && (
                <div style={{ fontSize: s * 2, lineHeight: 1, marginBottom: s * 0.3 }}>
                  {course.meal.emoji}
                </div>
              )}

              {/* Meal name */}
              <div style={{
                fontFamily: headerFont, fontSize: s * 1.6, fontWeight: 400,
                color: 'var(--fmp-text)', marginBottom: s * 0.3,
              }}>
                {course.meal.name}
              </div>

              {/* Notes */}
              {course.meal.notes && (
                <div style={{
                  fontSize: s * 0.75, fontStyle: 'italic', color: 'var(--fmp-text-2)',
                  marginBottom: s * 0.3, maxWidth: '80%', marginLeft: 'auto', marginRight: 'auto',
                }}>
                  {course.meal.notes}
                </div>
              )}

              {/* Meta */}
              {(showPrepTime || showDifficulty) && (course.meal.prepTime || course.meal.difficulty) && (
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: s * 0.8,
                  fontSize: s * 0.65, color: 'var(--fmp-text-3)',
                }}>
                  {showPrepTime && course.meal.prepTime && (
                    <span>&#128339; {course.meal.prepTime} min</span>
                  )}
                  {showDifficulty && course.meal.difficulty && (() => {
                    const dc = course.meal.difficulty === 'easy' ? '#10b981' : course.meal.difficulty === 'medium' ? '#f59e0b' : course.meal.difficulty === 'hard' ? '#ef4444' : undefined;
                    return <span style={{ color: dc ?? undefined }}>{course.meal.difficulty}</span>;
                  })()}
                </div>
              )}

              {/* Divider between courses */}
              {i < courses.length - 1 && (
                <div style={{
                  width: '40%', height: 1, background: 'var(--fmp-border-sub)',
                  margin: `${s * 1}px auto 0`,
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Bottom ornament */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: s * 0.5,
          width: '60%', marginTop: s * 1.5,
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--fmp-border)' }} />
          <span style={{ fontSize: s * 0.7, color: 'var(--fmp-text-3)' }}>&#9670;</span>
          <div style={{ flex: 1, height: 1, background: 'var(--fmp-border)' }} />
        </div>
        <div style={{ fontSize: s * 1, color: 'var(--fmp-text-3)', letterSpacing: '0.5em', marginTop: s * 1 }}>
          &#10022; &#10022; &#10022;
        </div>
      </div>
    );
  }, [now, plan, savedMeals, slots, s, pad, showEmoji, showPrepTime, showDifficulty]);

  const renderNextMealView = useCallback(() => {
    const next = getNextMeal(now, plan, savedMeals, slots);

    if (!next) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', fontFamily: bodyFont,
          gap: s * 1, color: 'var(--fmp-text-3)',
        }}>
          <span style={{ fontSize: s * 3, lineHeight: 1, opacity: 0.3 }}>&#127869;</span>
          <span style={{ fontSize: s * 1.2, fontWeight: 500 }}>No upcoming meals planned</span>
        </div>
      );
    }

    const { meal, slot, context } = next;
    const meta = SLOT_META[slot];

    const contextStyles: Record<string, { color: string; bg: string; label: string; icon: string }> = {
      now:       { color: 'var(--fmp-accent)', bg: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`, label: 'Now', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
      upcoming:  { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', label: 'Coming Up', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z' },
      tomorrow:  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', label: 'Tomorrow', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z' },
    };
    const ctx = contextStyles[context] ?? contextStyles.now;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', fontFamily: bodyFont,
        padding: pad, gap: s * 0.8,
      }}>
        {/* Context badge */}
        <span style={{
          fontSize: s * 0.7, fontWeight: 700, textTransform: 'uppercase' as const,
          letterSpacing: '0.12em', color: ctx.color, background: ctx.bg,
          padding: `${s * 0.2}px ${s * 0.8}px`, borderRadius: s * 0.4,
          display: 'inline-flex', alignItems: 'center', gap: s * 0.3,
        }}>
          <svg width={s * 0.8} height={s * 0.8} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d={ctx.icon} />
          </svg>
          {ctx.label}
        </span>

        {/* Slot label */}
        <span style={{
          fontSize: s * 0.8, fontWeight: 600, textTransform: 'uppercase' as const,
          letterSpacing: '0.1em', color: 'var(--fmp-text-3)',
        }}>
          {meta.label}
        </span>

        {/* Giant emoji */}
        {showEmoji && meal.emoji && (
          <span style={{ fontSize: s * 5.5, lineHeight: 1, margin: `${s * 0.5}px 0` }}>
            {meal.emoji}
          </span>
        )}

        {/* Meal name */}
        <span style={{
          fontFamily: headerFont, fontSize: s * 2.5, fontWeight: 400,
          color: 'var(--fmp-text)', textAlign: 'center' as const,
          lineHeight: 1.2,
        }}>
          {meal.name}
        </span>

        {/* Notes */}
        {meal.notes && (
          <span style={{
            fontSize: s * 0.85, fontStyle: 'italic', color: 'var(--fmp-text-2)',
            textAlign: 'center' as const, maxWidth: '80%',
          }}>
            {meal.notes}
          </span>
        )}

        {/* Meta pills */}
        {(showPrepTime || showDifficulty) && (meal.prepTime || meal.difficulty) && (
          <div style={{
            display: 'flex', gap: s * 0.5, marginTop: s * 0.3,
          }}>
            {showPrepTime && meal.prepTime && (
              <span style={{
                fontSize: s * 0.7, color: 'var(--fmp-text-3)',
                background: 'var(--fmp-border-sub)', padding: `${s * 0.15}px ${s * 0.6}px`,
                borderRadius: s * 0.3,
              }}>
                &#9201; {meal.prepTime} min
              </span>
            )}
            {showDifficulty && meal.difficulty && (() => {
              const dc = meal.difficulty === 'easy' ? '#10b981' : meal.difficulty === 'medium' ? '#f59e0b' : meal.difficulty === 'hard' ? '#ef4444' : undefined;
              return (
                <span style={{
                  fontSize: s * 0.7,
                  color: dc ?? 'var(--fmp-text-3)',
                  background: 'var(--fmp-border-sub)',
                  border: dc ? `1px solid ${dc}40` : undefined,
                  padding: `${s * 0.15}px ${s * 0.6}px`,
                  borderRadius: s * 0.3,
                }}>
                  {meal.difficulty}
                </span>
              );
            })()}
          </div>
        )}

        {/* Tags */}
        {showTags && meal.tags && meal.tags.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap' as const, gap: s * 0.4,
            justifyContent: 'center', marginTop: s * 0.3,
          }}>
            {meal.tags.map((tag) => (
              <span key={tag} style={{
                fontSize: s * 0.6, color: 'var(--fmp-text-2)',
                background: 'var(--fmp-border-sub)', padding: `${s * 0.1}px ${s * 0.5}px`,
                borderRadius: s * 0.3,
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }, [now, plan, savedMeals, slots, s, pad, showEmoji, showPrepTime, showTags, showDifficulty]);

  // ── Main render ──

  return (
    <div
      ref={containerRef}
      className="fmp-root"
      style={{
        width: '100%',
        height: '100%',
        fontFamily: bodyFont,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        colorScheme: theme.isDark ? 'dark' : 'light',
        ...cssVars,
      } as React.CSSProperties}
    >
      <style>{`
        .fmp-root {
          background: var(--fmp-bg);
          color: var(--fmp-text);
        }
        @keyframes fmpPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .fmp-now-dot {
          animation: fmpPulse 2s ease-in-out infinite;
        }
        .fmp-scroll {
          overflow-y: auto;
          scrollbar-width: none;
        }
        .fmp-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {view === 'week' && renderWeekView()}
      {view === 'today' && renderTodayView()}
      {view === 'menu-board' && renderMenuBoardView()}
      {view === 'next-meal' && renderNextMealView()}
    </div>
  );
}
