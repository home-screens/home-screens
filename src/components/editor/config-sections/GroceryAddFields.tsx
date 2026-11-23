'use client';

import { useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useEditorData } from '@/hooks/useEditorData';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import { mealsDataUrl, todoListsUrl } from '@/lib/fetch-keys';
import { saveGroceryExtrasList } from '@/lib/meal-client';
import { normalizeMealSettings } from '@/lib/meal-constants';
import type { MealSettings } from '@/types/config';
import type { TodoList } from '@/types/todos';
import FieldHint from '@/components/ui/FieldHint';

/**
 * The grocery view's "Add on the wall" switch. While the plan lives in Mealie
 * it adds to the Mealie list the family shops from; while it is kept here it
 * adds to one of the family's to-do lists, picked right under the switch, so
 * the one setup step is where the switch is. The pick is a shared meal
 * setting (`MealSettings.groceryExtrasListId`): every grocery card and the
 * phone's Grocery tab read the same list, and Settings > Meals shows it too.
 */
export function GroceryAddFields({ wallAdd, onWallAdd }: { wallAdd: boolean; onWallAdd: (on: boolean) => void }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [saved, setSaved] = useState<MealSettings | null>(null);
  const { data: meals } = useEditorData<{ settings?: unknown }>(mealsDataUrl());
  const { data: todos } = useEditorData<{ lists: TodoList[] }>(wallAdd ? todoListsUrl() : null);
  const [failed, setFailed] = useState(false);

  const settings = saved ?? (meals ? normalizeMealSettings(meals.settings) : null);
  const mealie = settings?.planSource === 'mealie';
  const lists = todos?.lists ?? [];
  const picked = settings?.groceryExtrasListId && lists.some((l) => l.id === settings.groceryExtrasListId) ? settings.groceryExtrasListId : '';

  const pick = async (listId: string) => {
    setFailed(false);
    try {
      setSaved(await saveGroceryExtrasList(editorFetch, listId || undefined));
    } catch {
      setFailed(true);
    }
  };

  return (
    <>
      <Toggle label={t('configSections.meal-planner.wallAdd')} checked={wallAdd} onChange={onWallAdd} />
      {wallAdd && settings && (
        <FieldHint>
          {t(mealie ? 'configSections.meal-planner.wallAddHelpMealie' : 'configSections.meal-planner.wallAddHelpLocal')}
        </FieldHint>
      )}
      {wallAdd && settings && !mealie && (
        <div className="pl-3 border-l-2 border-hs-border flex flex-col gap-1">
          <LabeledSelect
            label={t('configSections.meal-planner.extrasList')}
            value={picked}
            onChange={(v) => void pick(v)}
            options={[
              { value: '', label: t('configSections.meal-planner.extrasListNone') },
              ...lists.map((l) => ({ value: l.id, label: l.name })),
            ]}
            hint={t('configSections.meal-planner.extrasListHelp')}
          />
          {failed && <p role="alert" className="text-xs text-hs-danger">{tCore('refusals.saveFailed')}</p>}
        </div>
      )}
    </>
  );
}
