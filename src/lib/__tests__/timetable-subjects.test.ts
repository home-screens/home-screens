/**
 * Locks the built-in subject catalogues and how a locale picks one.
 *
 * Unlike the affirmations and word-of-the-day seed lists, these catalogues are
 * deliberately NOT index-aligned across locales: a German timetable has
 * Erdkunde and a Dutch one has Wereldoriëntatie, so the lists differ in length
 * and in content and no entry has a counterpart at the same index elsewhere.
 * What is checked instead is that each list stands on its own (unique ids and
 * codes, codes short enough for a narrow cell, valid colours, icons the picker
 * can draw) and that the three anchors of the shared colour language hold in
 * every language.
 *
 * The German list is fixed: it is the catalogue the module was designed
 * against, so its codes, colours and bring items are asserted literally.
 */

import { describe, it, expect } from 'vitest';
import { TIMETABLE_LIMITS } from '@/types/timetables';
import { getDefaultSubjects } from '../timetable-subjects';
import { TIMETABLE_SUBJECT_ICONS } from '../timetable-subjects/types';
import { EN_US_SUBJECTS } from '../timetable-subjects/en-US';
import { DE_DE_SUBJECTS } from '../timetable-subjects/de-DE';
import { FR_FR_SUBJECTS } from '../timetable-subjects/fr-FR';
import { ES_ES_SUBJECTS } from '../timetable-subjects/es-ES';
import { NL_NL_SUBJECTS } from '../timetable-subjects/nl-NL';
import { PT_BR_SUBJECTS } from '../timetable-subjects/pt-BR';
import { DA_DK_SUBJECTS } from '../timetable-subjects/da-DK';

const CATALOGUES = [
  { tag: 'en-US', subjects: EN_US_SUBJECTS },
  { tag: 'de-DE', subjects: DE_DE_SUBJECTS },
  { tag: 'fr-FR', subjects: FR_FR_SUBJECTS },
  { tag: 'es-ES', subjects: ES_ES_SUBJECTS },
  { tag: 'nl-NL', subjects: NL_NL_SUBJECTS },
  { tag: 'pt-BR', subjects: PT_BR_SUBJECTS },
  { tag: 'da-DK', subjects: DA_DK_SUBJECTS },
];

/** The local language subject, maths and sport carry the same colour everywhere. */
const LOCAL_LANGUAGE_COLOR = '#f26363';
const MATHS_COLOR = '#4f8ef7';
const SPORT_COLOR = '#8fdc4e';

/** House style keeps this character out of anything a person reads. */
const LONG_DASH = '\u2014';

describe('built-in subject catalogues', () => {
  for (const { tag, subjects } of CATALOGUES) {
    describe(tag, () => {
      it('is not empty', () => {
        expect(subjects.length).toBeGreaterThan(0);
      });

      it('has unique ids, each a lowercase ascii slug', () => {
        const ids = subjects.map((subject) => subject.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
          expect(id).toMatch(/^[a-z0-9]+$/);
        }
      });

      it('has unique short codes that fit a narrow cell', () => {
        const codes = subjects.map((subject) => subject.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const code of codes) {
          expect(code.trim()).toBe(code);
          expect(code.length).toBeGreaterThan(0);
          expect(code.length).toBeLessThanOrEqual(TIMETABLE_LIMITS.maxCodeLength);
        }
      });

      it('has names within the store limit', () => {
        for (const subject of subjects) {
          expect(subject.name.trim()).toBe(subject.name);
          expect(subject.name.length).toBeGreaterThan(0);
          expect(subject.name.length).toBeLessThanOrEqual(TIMETABLE_LIMITS.maxNameLength);
        }
      });

      it('colours every subject with a 6 digit hex value', () => {
        for (const subject of subjects) {
          expect(subject.color).toMatch(/^#[0-9a-f]{6}$/);
        }
      });

      it('only names icons from the shared set', () => {
        for (const subject of subjects) {
          expect(TIMETABLE_SUBJECT_ICONS).toContain(subject.icon);
        }
      });

      it('keeps bring items short and useful when present', () => {
        for (const subject of subjects) {
          if (subject.bring === undefined) continue;
          expect(subject.bring.trim()).toBe(subject.bring);
          expect(subject.bring.length).toBeGreaterThan(0);
          expect(subject.bring.length).toBeLessThanOrEqual(TIMETABLE_LIMITS.maxBringLength);
        }
      });

      it('writes no long dash in text that reaches the wall', () => {
        for (const subject of subjects) {
          expect(subject.name).not.toContain(LONG_DASH);
          expect(subject.code).not.toContain(LONG_DASH);
          expect(subject.bring ?? '').not.toContain(LONG_DASH);
        }
      });
    });
  }
});

describe('shared colour language', () => {
  for (const { tag, subjects } of CATALOGUES) {
    it(`${tag} leads with the local language in red, and has maths and sport`, () => {
      expect(subjects[0].color).toBe(LOCAL_LANGUAGE_COLOR);
      expect(subjects[0].icon).toBe('book');
      expect(subjects.some((s) => s.color === MATHS_COLOR && s.icon === 'triangle')).toBe(true);
      expect(subjects.some((s) => s.color === SPORT_COLOR && s.icon === 'ball')).toBe(true);
    });
  }
});

describe('the German catalogue', () => {
  it('is the list the module was designed against, in order', () => {
    expect(DE_DE_SUBJECTS.map((subject) => subject.code)).toEqual([
      'Deu', 'Ma', 'Eng', 'Frz', 'Lat', 'Bio', 'Ch', 'Ph', 'Ek', 'Ge', 'WiPo',
      'Sowi', 'Päd', 'Rel', 'Ku', 'Mu', 'Sp', 'If', 'SU', 'Fö', 'KR',
    ]);
  });

  it('keeps Deutsch red, Mathe blue and Englisch yellow', () => {
    const byId = new Map(DE_DE_SUBJECTS.map((subject) => [subject.id, subject]));
    expect(byId.get('deu')?.color).toBe('#f26363');
    expect(byId.get('ma')?.color).toBe('#4f8ef7');
    expect(byId.get('eng')?.color).toBe('#f2c94c');
  });

  it('packs the bag for Sport, Erdkunde and Kunst', () => {
    const bring = Object.fromEntries(
      DE_DE_SUBJECTS.filter((subject) => subject.bring).map((subject) => [subject.id, subject.bring]),
    );
    expect(bring).toEqual({ ek: 'Atlas', ku: 'Malsachen', sp: 'Sportzeug' });
  });
});

describe('getDefaultSubjects', () => {
  for (const { tag, subjects } of CATALOGUES) {
    it(`returns the ${tag} catalogue`, () => {
      expect(getDefaultSubjects(tag)).toEqual(subjects);
    });
  }

  it('reuses the German catalogue for another German-speaking region', () => {
    expect(getDefaultSubjects('de-AT')).toEqual(DE_DE_SUBJECTS);
  });

  it('falls back to en-US for a language nothing ships', () => {
    expect(getDefaultSubjects('ja-JP')).toEqual(EN_US_SUBJECTS);
  });

  it('falls back to en-US for a bare language tag, which the chain does not widen', () => {
    // resolveLocaleChain only maps a region to a sibling, so 'de' walks
    // straight to the fallback locale rather than to 'de-DE'.
    expect(getDefaultSubjects('de')).toEqual(EN_US_SUBJECTS);
  });

  it('hands out fresh entries so one household cannot rename another', () => {
    const first = getDefaultSubjects('de-DE');
    first[0].name = 'Deutsch LK';
    expect(getDefaultSubjects('de-DE')[0].name).toBe('Deutsch');
    expect(DE_DE_SUBJECTS[0].name).toBe('Deutsch');
  });
});
