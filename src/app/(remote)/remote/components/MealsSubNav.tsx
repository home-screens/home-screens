'use client';

import { BookOpen, CalendarDays, LayoutGrid, ShoppingCart, type LucideIcon } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { MEALS_SUB_VIEWS, type MealsSubView } from './meals-shared';
import SegmentedTabs from './SegmentedTabs';

// Keyed by MealsSubView so adding a sub-view is a compile error here, not a
// missing tab at runtime.
const ICONS: Record<MealsSubView, LucideIcon> = {
  week: CalendarDays,
  plan: LayoutGrid,
  library: BookOpen,
  grocery: ShoppingCart,
};

interface MealsSubNavProps {
  subView: MealsSubView;
  setSubView: (v: MealsSubView) => void;
}

export default function MealsSubNav({ subView, setSubView }: MealsSubNavProps) {
  const t = useTranslate('remote');
  // The week tab keeps its name whichever week is shown: the dates sit
  // between the arrows below, and in the tab they wrapped onto two lines.
  return (
    <SegmentedTabs
      ariaLabel={t('mealsTab.header')}
      value={subView}
      onChange={setSubView}
      style={{ marginTop: 12, marginBottom: 16 }}
      tabs={MEALS_SUB_VIEWS.map((view) => {
        const Icon = ICONS[view];
        return { id: view, label: t(`mealsTab.subNav.${view}`), icon: <Icon size={14} strokeWidth={2} /> };
      })}
    />
  );
}
