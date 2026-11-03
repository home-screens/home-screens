/**
 * Default subject catalogues, one per locale.
 *
 * A household that has never saved a timetable still needs subjects to paint
 * with, so the store hands out the catalogue for the configured language. The
 * lists are content rather than UI chrome, so they live here in their own
 * files instead of in `src/translations/*.json`, the same way the affirmations
 * and word-of-the-day seed lists do.
 *
 * These are not translations of each other. Every locale lists the subjects
 * its own country's schools teach, with the short codes those schools write on
 * a timetable, so the lists differ in length and in content. `types.ts`
 * describes the colour language and the icon vocabulary they all share.
 *
 * `getDefaultSubjects(tag)` returns the closest match, walking the same locale
 * fallback chain as the rest of the i18n runtime, so `de-AT` starts from the
 * German list. A locale with no catalogue falls back to en-US.
 */

import { resolveLocaleChain } from '@/i18n/fallback';
import { EN_US_SUBJECTS } from './en-US';
import { DE_DE_SUBJECTS } from './de-DE';
import { FR_FR_SUBJECTS } from './fr-FR';
import { ES_ES_SUBJECTS } from './es-ES';
import { NL_NL_SUBJECTS } from './nl-NL';
import { PT_BR_SUBJECTS } from './pt-BR';
import { DA_DK_SUBJECTS } from './da-DK';
import type { DefaultSubject } from './types';

export { hyphenateSubjectName, SUBJECT_BREAK_MARKS } from './hyphenation';

const SUBJECTS_BY_LOCALE: Record<string, DefaultSubject[]> = {
  'en-US': EN_US_SUBJECTS,
  'de-DE': DE_DE_SUBJECTS,
  'fr-FR': FR_FR_SUBJECTS,
  'es-ES': ES_ES_SUBJECTS,
  'nl-NL': NL_NL_SUBJECTS,
  'pt-BR': PT_BR_SUBJECTS,
  'da-DK': DA_DK_SUBJECTS,
};

/**
 * The starting subject list for `locale`.
 *
 * Callers own what they get back: the catalogue seeds a household's editable
 * subject list, so every call returns fresh entries and a household's renames
 * can never reach the next caller.
 */
export function getDefaultSubjects(locale: string): DefaultSubject[] {
  for (const tag of resolveLocaleChain(locale)) {
    const subjects = SUBJECTS_BY_LOCALE[tag];
    if (subjects) return subjects.map((subject) => ({ ...subject }));
  }
  return EN_US_SUBJECTS.map((subject) => ({ ...subject }));
}
