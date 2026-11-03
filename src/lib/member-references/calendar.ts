import { FamilyError } from '@/lib/family-errors';
import { isRecord, withoutKeys, type MemberReferenceDomain } from './contract';

/**
 * Calendar ownership in `config.json`: `settings.calendar.personSources`
 * maps a person to the calendar sources that are theirs.
 *
 * Restore has nothing to check here because `planFamilyMerge` owns that
 * mapping on the way in: it folds legacy people into the family and settles
 * which sources each restored person keeps.
 */
export const calendarReferences: MemberReferenceDomain = {
  path: 'data/config.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = structuredClone(doc);
    if (!isRecord(next.settings)) throw new FamilyError('family.dataInvalid', 'The saved configuration is invalid.', { status: 409 });
    if (isRecord(next.settings.calendar) && next.settings.calendar.personSources !== undefined) {
      next.settings.calendar.personSources = withoutKeys(next.settings.calendar.personSources, removed);
    }
    return next;
  },
  planRestore: () => ({ missing: [], evidence: {} }),
};
