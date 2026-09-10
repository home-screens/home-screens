import type { FamilyResponse } from '@/types/family';

/** Shared error types stay independent of server stores and their import cycles. */
export class FamilyError extends Error {
  constructor(message: string, public readonly status = 400, public readonly current?: FamilyResponse) {
    super(message);
    this.name = 'FamilyError';
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
