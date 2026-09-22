import { describe, it, expect } from 'vitest';
import { flatten, loadDict } from './helpers/dict';

/**
 * Two corners of the editor dictionary were written in the vocabulary of the
 * CSS property or the data shape behind the control rather than of the person
 * moving the slider.
 *
 * The Style panel labelled its sliders Border Radius, Opacity, Padding and
 * Font Weight, which name the stored field and not what moving them does to
 * the card. The schedule's "How it repeats" offered "Every day I pick" and
 * "One stretch", neither of which says what it does when read cold.
 *
 * Only en-US is checked, as in the phone ratchet next door: every other locale
 * is a translation of these strings and the right word there is a judgement
 * call for whoever translates it.
 */

const STYLE_JARGON: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /border\s*radius/i, why: 'say what it does to the corners' },
  { pattern: /\bopacity\b/i, why: 'say how solid the card looks' },
  { pattern: /\bpadding\b/i, why: 'say it is the space inside the card' },
  { pattern: /font\s*weight/i, why: 'say it is how thick the text is' },
];

describe('the Style panel labels say what they do', () => {
  it('names no CSS property', () => {
    const dict = loadDict('en-US', 'editor');
    expect(dict).not.toBeNull();

    const fields = flatten(dict!.propertyPanel as Record<string, unknown>, 'propertyPanel');
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (!key.startsWith('propertyPanel.fields.') || typeof value !== 'string') continue;
      for (const { pattern, why } of STYLE_JARGON) {
        if (pattern.test(value)) offenders.push(`${key}: "${value}" (${why})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Settings > Screen was the other half of the same finding, and the half that
 * outlived the first fix: the page named one control twice ("Screen dots" in
 * the label, "pagination dot" in the help three lines below), and explained
 * two more in the vocabulary of the renderer rather than of the person
 * changing them.
 *
 * Scoped to the Defaults > Screen page, which is what the finding covered.
 * The two words that outlived the first sweep, "Canvas" as the section
 * heading and "field" for a setting, were renamed to "Screen area" and
 * "setting" across every locale, so the last two patterns below guard work
 * that is already done rather than describing a gap.
 */
const SCREEN_JARGON: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /pagination/i, why: 'the same dots are called "Screen dots" on the label above' },
  { pattern: /\bGPU\b/, why: 'name the effect that costs the most, not the chip it costs' },
  { pattern: /module canvas/i, why: 'say it is the area you arrange modules on' },
  { pattern: /\bfields?\b/i, why: 'say "setting", which is what the rest of the page calls it' },
];

describe('the Screen settings page says what it means', () => {
  it('names no renderer internals', () => {
    const dict = loadDict('en-US', 'editor') as Record<string, unknown>;
    const settings = dict.settings as Record<string, unknown>;
    const page = flatten(
      settings.defaultDisplayPage as Record<string, unknown>,
      'settings.defaultDisplayPage',
    );

    const offenders: string[] = [];
    for (const [key, value] of Object.entries(page)) {
      if (typeof value !== 'string') continue;
      for (const { pattern, why } of SCREEN_JARGON) {
        if (pattern.test(value)) offenders.push(`${key}: "${value}" (${why})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the schedule shape options say what they do', () => {
  const dict = loadDict('en-US', 'editor') as Record<string, unknown>;
  const scheduleEditor = dict.scheduleEditor as Record<string, string>;

  it('describes each shape in enough words to choose between them', () => {
    // "One stretch" and "Every day I pick" are the two shapes' internal names,
    // not descriptions: both are four words or fewer and neither says what
    // happens to the hours.
    for (const key of ['shapeRepeat', 'shapeSpan']) {
      const value = scheduleEditor[key];
      expect(value, key).toBeTypeOf('string');
      expect(value.split(/\s+/).length, `${key}: "${value}"`).toBeGreaterThan(4);
    }
  });

  it('tells the reader which one runs past midnight', () => {
    const both = `${scheduleEditor.shapeRepeat} ${scheduleEditor.shapeSpan}`.toLowerCase();
    expect(both).toMatch(/\bday(s)?\b/);
    expect(scheduleEditor.shapeRepeat).not.toBe(scheduleEditor.shapeSpan);
  });
});

/**
 * Automatic updates are explained to someone choosing whether their kitchen
 * wall may restart itself at night. The words for how that is built (a
 * scheduler, a cron job, a tarball, sudo) say nothing about what they get.
 */
const AUTO_UPDATE_JARGON: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bcron\b/i, why: 'say once a day, at the time picked' },
  { pattern: /schedul/i, why: 'say when it happens, not what makes it happen' },
  { pattern: /\bdaemon\b|\bservice\b/i, why: 'say Home Screens' },
  { pattern: /tarball|\bartifact\b/i, why: 'say ready-made download' },
  { pattern: /\bsudo\b|\bpermission\b/i, why: "say the device's password" },
  { pattern: /\bchannel\b/i, why: 'the section above is titled "Which updates to get"' },
];

describe('the automatic update settings say what they do', () => {
  it('names none of the machinery', () => {
    const dict = loadDict('en-US', 'editor') as Record<string, unknown>;
    const systemPage = (dict.settings as Record<string, Record<string, Record<string, unknown>>>).systemPage;
    const strings: Record<string, unknown> = {
      ...flatten(systemPage.autoUpdate, 'settings.systemPage.autoUpdate'),
      'settings.systemPage.channel.nightlyAutoUpdateNote': systemPage.channel.nightlyAutoUpdateNote,
      'settings.systemPage.advanced.autoUpdateNote': systemPage.advanced.autoUpdateNote,
    };

    const offenders: string[] = [];
    for (const [key, value] of Object.entries(strings)) {
      expect(value, key).toBeTypeOf('string');
      for (const { pattern, why } of AUTO_UPDATE_JARGON) {
        if (pattern.test(value as string)) offenders.push(`${key}: "${value}" (${why})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
