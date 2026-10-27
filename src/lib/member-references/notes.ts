import { FamilyError } from '@/lib/family-errors';
import { validateNotesData } from '@/lib/notes-data';
import { missingAssignment, recordLabel, rows, type Doc, type MemberReferenceDomain, type RestorePlan } from './contract';

/**
 * The notes board: a note may carry `authorId`. Removal takes the person
 * off their notes; the notes stay, because they are the family's, and the
 * wall shows them as from "Someone". Restore refuses a note that names a
 * missing person, the to-do policy.
 */
export const notesReferences: MemberReferenceDomain = {
  path: 'data/notes.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = structuredClone(doc);
    if (!Array.isArray(next.notes)) throw new FamilyError('The saved notes are invalid.', 409);
    next.notes = next.notes.map((note: Doc) => {
      if (typeof note.authorId !== 'string' || !removed.has(note.authorId)) return note;
      const { authorId: _author, ...rest } = note;
      return rest;
    });
    return next;
  },
  planRestore(doc, members): RestorePlan {
    const invalid = validateNotesData(doc);
    if (invalid) throw new Error(invalid);
    const missing: string[] = [];
    for (const [index, note] of rows(doc.notes, 'Notes').entries()) {
      if (note.authorId !== undefined) {
        missing.push(...missingAssignment([note.authorId], `${recordLabel('data/notes.json', `notes[${index}]`, note)}, authorId`, members));
      }
    }
    return { missing, evidence: {} };
  },
};
