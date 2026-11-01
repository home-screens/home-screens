// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import core from '@/translations/de-DE/core.json';
import modules from '@/translations/de-DE/modules.json';
import { I18nProvider } from '@/i18n/provider';
import type { SavedMeal } from '@/types/config';
import { mealieMealId } from '@/lib/mealie-map';
import { MealMetaPills } from '../MealMetaPills';

const MEALIE_ID = mealieMealId('0f2c9a4e-1b7d-4c55-9e3a-5d6f7a8b9c0d');

afterEach(cleanup);

function pills(meal: SavedMeal | null) {
  return render(
    <I18nProvider locale="de-DE" blob={{ core, modules }}>
      <MealMetaPills meal={meal} showPrepTime showDifficulty showTags pillStyle={{}} gap={8} />
    </I18nProvider>,
  );
}

describe('MealMetaPills', () => {
  /* A German wall printed "kid-friendly · easy" where the phone says
   * "Kid-Friendly · Einfach". */
  it('words the difficulty and the tags as the phone does', () => {
    const { container } = pills({ id: 'tacos', name: 'Tacos', difficulty: 'easy', tags: ['kid-friendly'] });
    expect(container.textContent).toContain('Einfach');
    expect(container.textContent).toContain('Kid-Friendly');
    expect(container.textContent).not.toContain('easy');
    expect(container.textContent).not.toContain('kid-friendly');
  });

  it("shows a Mealie recipe's tags as typed", () => {
    const { container } = pills({ id: MEALIE_ID, name: 'Chili', tags: ['weeknight dinners'] });
    expect(container.textContent).toContain('weeknight dinners');
  });

  it('draws nothing for a dish with nothing to show', () => {
    expect(pills({ id: 'plain', name: 'Plain' }).container.textContent).toBe('');
    expect(pills(null).container.textContent).toBe('');
  });
});
