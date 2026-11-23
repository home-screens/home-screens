import { describe, it, expect } from 'vitest';
import { LOCALES } from '@/i18n/manifest';
import en from '@/translations/en-US/remote.json';
import core from '@/translations/en-US/core.json';

/**
 * Deleting a chore removes the chore and nothing else: the rows in
 * `chore-completions.json` stay, and so do the tickets already on the kids'
 * cards. That is deliberate, because a kid should keep what they earned. The
 * confirmation used to promise the opposite ("all its completion history will
 * be removed"), which made the sheet lie about what the button does. These
 * assertions are what stops that sentence coming back.
 */
describe('the delete-a-chore confirmation', () => {
  // One sentence for the phone and the editor alike.
  const description: string = core.chores.deleteBody;

  it('does not promise to remove anything but the chore', () => {
    const lower = description.toLowerCase();
    for (const claim of ['history', 'completion', 'record']) {
      expect(lower).not.toContain(claim);
    }
  });

  it('says the tickets already earned stay', () => {
    const lower = description.toLowerCase();
    expect(lower).toContain('ticket');
    expect(lower).toMatch(/stay|keep/);
  });

  it('is short enough to read out to a child', () => {
    expect(description.length).toBeLessThan(140);
    expect(description).not.toContain('—');
  });
});

/**
 * "Tickets" is the first field of the first chore anyone makes, and the word
 * means nothing until you find the Rewards tab. One line under the field says
 * what the number buys.
 */
describe('the tickets field on the chore form', () => {
  it('explains what a ticket is by connecting the chore to a reward', () => {
    const hint: string = en.choresManage.choreForm.ticketsHint;
    expect(hint.toLowerCase()).toContain('ticket');
    expect(hint.toLowerCase()).toContain('reward');
    expect(hint.length).toBeLessThan(110);
  });

  it('is written in every language the app ships', async () => {
    for (const locale of Object.keys(LOCALES)) {
      const dict = (await import(`@/translations/${locale}/remote.json`)).default;
      expect(dict.choresManage.choreForm.ticketsHint, locale).toBeTruthy();
    }
  });
});
