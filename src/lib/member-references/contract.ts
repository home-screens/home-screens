import { FamilyError } from '@/lib/family-errors';
import { validFamilyId } from '@/lib/family-merge';

/** A parsed data file: the top-level object, shape unchecked. */
export type Doc = Record<string, unknown>;

/**
 * What one data file has to say about family members, declared by the domain
 * that owns the file. Everything here is pure: the family coordinator reads
 * the file, hands the parsed document in, and writes whatever comes back
 * inside its own transaction, so a domain never touches disk or ordering.
 *
 * Every store that names a person by id registers one of these in
 * `./index.ts`. A domain that is not registered keeps its references when a
 * person is removed and is never checked on restore, which is the bug this
 * registry exists to make impossible to add by accident.
 */
export interface MemberReferenceDomain {
  /** The file the references live in, relative to the data root. */
  path: `data/${string}.json`;
  /**
   * What to do when the file cannot be read as an object. `refuse` stops the
   * family change, because the store cannot be reasoned about; `skip` leaves
   * the file exactly as it is, for a store nothing but its own page reads.
   */
  unreadable: 'refuse' | 'skip';
  /**
   * The document after these people are removed from the household. Throws a
   * `FamilyError` (409) when the document is not the shape this domain saves,
   * which stops the removal before anything is written. Returning the input
   * itself means the file is left exactly as it is.
   */
  removeMembers(doc: Doc, removed: ReadonlySet<string>): Doc;
  /**
   * Check the document against the family a restore will produce. A domain
   * may repair what its policy allows (and record it as evidence), refuse a
   * record it cannot make sense of by throwing, or report the assignments
   * that name missing people so the restore can stop with all of them named.
   * `groups` is the restored family's group ids, for a store that can hand
   * something to a group as well as to a person.
   */
  planRestore(doc: Doc, members: ReadonlySet<string>, groups: ReadonlySet<string>): RestorePlan;
}

export interface RestorePlan {
  /** The document to write instead of the input, when a repair changed it. */
  doc?: Doc;
  /** Assignments naming people or groups the restored family does not have. Any entry stops the restore. */
  missing: string[];
  /**
   * Records for the migration evidence file, keyed as they appear there.
   * Domains that share a policy may share a key; the objects are merged.
   */
  evidence: Record<string, Record<string, unknown>>;
}

export const isRecord = (value: unknown): value is Doc => !!value && typeof value === 'object' && !Array.isArray(value);

// ── Removal helpers ──────────────────────────────────────────────────

/** `ids` without the removed people; refuses a list that is not one of ids. */
export function stripIds(ids: unknown, removed: ReadonlySet<string>): string[] {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new FamilyError('family.dataInvalid', 'A saved member assignment is invalid.', { status: 409 });
  return ids.filter((id) => !removed.has(id));
}

/** A mapping keyed by member id without the removed people's entries. */
export function withoutKeys(value: unknown, removed: ReadonlySet<string>): Doc {
  if (!isRecord(value)) throw new FamilyError('family.dataInvalid', 'A saved member mapping is invalid.', { status: 409 });
  return Object.fromEntries(Object.entries(value).filter(([id]) => !removed.has(id)));
}

// ── Restore helpers ──────────────────────────────────────────────────

export function rows(value: unknown, label: string): Doc[] {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) throw new Error(`${label} must be an array of records.`);
  return value;
}

/** "data/chores.json, chores[0] "Dishes" (id "dishes")": where a record sits, for an error a person can act on. */
export function recordLabel(file: string, location: string, record: Doc): string {
  const name = record.name ?? record.text;
  return `${file}, ${location}${typeof name === 'string' ? ` ${JSON.stringify(name)}` : ''}${typeof record.id === 'string' ? ` (id ${JSON.stringify(record.id)})` : ''}`;
}

/** The ids in a saved assignment, refusing anything that is not a well-formed person id. */
export function checkedIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new FamilyError('family.dataInvalid', `${label} must be a list of person IDs.`);
  const invalid = value.filter((id) => !validFamilyId(id));
  if (invalid.length > 0) throw new FamilyError('family.dataInvalid', `${label} contains invalid person IDs: ${invalid.map((id) => JSON.stringify(id)).join(', ')}. Repair this record and retry.`);
  return value;
}

/** The `missing` entry for an assignment that names people outside the family, or nothing when it does not. */
export function missingAssignment(value: unknown, label: string, members: ReadonlySet<string>): string[] {
  const missing = [...new Set(checkedIds(value, label).filter((id) => !members.has(id)))];
  return missing.length > 0 ? [`${label}: ${missing.map((id) => JSON.stringify(id)).join(', ')}`] : [];
}
