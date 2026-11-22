import { CalendarDays, CalendarRange, Columns3, Grid3X3, Repeat, ScrollText, type LucideIcon } from 'lucide-react';
import type { CalendarViewMode } from '@/types/config';

/**
 * What each Calendar card view's button on the wall says (a `modules` key) and
 * shows. The editor lists the same words, so its ticks name the wall's buttons.
 */
export const CARD_VIEW_BUTTONS: Record<CalendarViewMode, { labelKey: string; icon: LucideIcon }> = {
  daily: { labelKey: 'calendar.viewLabels.daily', icon: Columns3 },
  agenda: { labelKey: 'calendar.viewLabels.agenda', icon: ScrollText },
  week: { labelKey: 'calendar.viewLabels.week', icon: CalendarDays },
  'multi-week': { labelKey: 'calendar.viewLabels.multiWeek', icon: CalendarRange },
  rolling: { labelKey: 'calendar.viewLabels.rolling', icon: Repeat },
  month: { labelKey: 'calendar.viewLabels.month', icon: Grid3X3 },
};
