import type { FamilyResponse } from '@/types/family';
import { RefusalError, type RefusalParams } from './refusal';

/**
 * Why a family write was turned down. Each one has a sentence in the `core`
 * dictionary under `refusals.family`, which is what the family manager shows
 * on the phone and in the editor.
 */
export type FamilyRefusalCode =
  /** The roster changed since this copy was read; the answer carries it. */
  | 'family.revision'
  /** The body is not the shape a family write takes. */
  | 'family.badRequest'
  | 'family.nameTooLong'
  | 'family.tooManyMembers'
  | 'family.tooManyGroups'
  | 'family.groupNameTooLong'
  | 'family.groupNameTaken'
  /** A group names somebody who has left; the answer carries the roster. */
  | 'family.groupMemberRemoved'
  /** An edit names a person who has left the family. */
  | 'family.memberRemoved'
  /** An edit names a group that was removed. */
  | 'family.groupRemoved'
  /** A saved family file, or one that names family members, cannot be read as it is. */
  | 'family.dataInvalid'
  /** A saved file could not be read a moment ago; the next try is a minute off. */
  | 'family.dataWaiting'
  /** A backup names people or groups its own family list does not have. */
  | 'family.restoreMissing';

/** Shared error types stay independent of server stores and their import cycles. */
export class FamilyError extends RefusalError {
  readonly current?: FamilyResponse;

  constructor(
    code: FamilyRefusalCode,
    message: string,
    options: { status?: number; current?: FamilyResponse; params?: RefusalParams } = {},
  ) {
    super(options.status ?? 400, code, message, {
      ...(options.params ? { params: options.params } : {}),
      ...(options.current ? { extra: { ...options.current } } : {}),
    });
    this.name = 'FamilyError';
    if (options.current) this.current = options.current;
  }
}

export class FamilyMergeError extends Error {
  readonly status = 409;
  constructor(message: string) { super(message); this.name = 'FamilyMergeError'; }
}

export class DataTransactionError extends Error {
  readonly status: number;
  constructor(message: string, status = 503, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DataTransactionError';
    this.status = status;
  }
}

export function isFamilyDataError(error: unknown): error is FamilyError | FamilyMergeError | DataTransactionError {
  return error instanceof FamilyError || error instanceof FamilyMergeError || error instanceof DataTransactionError;
}
