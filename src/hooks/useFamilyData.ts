'use client';

import { useFetchData, publishFetchData } from '@/hooks/useFetchData';
import { displayCache } from '@/lib/display-cache';
import { familyUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import type { FamilyMember } from '@/types/family';

export interface FamilySnapshot {
  members: FamilyMember[];
  revision: string;
}

const EMPTY_MEMBERS: FamilyMember[] = [];

/** Publish a checked mutation response to every family consumer on this page. */
export function publishFamilyData(snapshot: FamilySnapshot): void {
  publishFetchData(familyUrl(), snapshot, FETCH_KEY_REGISTRY.family.ttlMs);
}

export function useFamilyData() {
  const [current, error] = useFetchData<FamilySnapshot>(familyUrl(), FETCH_KEY_REGISTRY.family.ttlMs);
  return {
    members: current?.members ?? EMPTY_MEMBERS,
    revision: current?.revision ?? null,
    loading: !current && !error,
    error,
    refresh: () => displayCache.invalidate(familyUrl()),
  };
}
