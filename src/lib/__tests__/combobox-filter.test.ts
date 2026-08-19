import { describe, it, expect } from 'vitest';
import { filterComboboxOptions, type ComboboxOption } from '@/lib/combobox-filter';

const OPTIONS: ComboboxOption[] = [
  { value: '', label: 'Use display setting (Europe/Berlin)', pinned: true },
  { value: 'Europe/Berlin', label: 'Berlin', description: 'Europe/Berlin' },
  { value: 'America/New_York', label: 'New York', description: 'America/New_York' },
  { value: 'Asia/Kolkata', label: 'Mumbai', description: 'Asia/Kolkata' },
];

describe('filterComboboxOptions', () => {
  it('returns every option (in order) for an empty or whitespace-only query', () => {
    expect(filterComboboxOptions(OPTIONS, '')).toEqual(OPTIONS);
    expect(filterComboboxOptions(OPTIONS, '   ')).toEqual(OPTIONS);
  });

  it('matches a single term against label, value, or description', () => {
    // pinned survives + Europe/Berlin hits
    expect(filterComboboxOptions(OPTIONS, 'berlin').map((o) => o.value)).toEqual(['', 'Europe/Berlin']);
    // "kolkata" only appears in the value/description, not the label
    expect(filterComboboxOptions(OPTIONS, 'kolkata').map((o) => o.value)).toEqual(['', 'Asia/Kolkata']);
    expect(filterComboboxOptions(OPTIONS, 'york').map((o) => o.value)).toEqual(['', 'America/New_York']);
  });

  it('AND-combines space-separated terms — every term must hit', () => {
    expect(filterComboboxOptions(OPTIONS, 'new y').map((o) => o.value)).toEqual(['', 'America/New_York']);
    // "new" hits New York, "london" hits nothing — no real match, so even the
    // pinned row drops and the combobox shows its no-match state
    expect(filterComboboxOptions(OPTIONS, 'new london')).toEqual([]);
  });

  it('is case-insensitive in both directions', () => {
    expect(filterComboboxOptions(OPTIONS, 'NEW YORK').map((o) => o.value)).toEqual(['', 'America/New_York']);
    expect(filterComboboxOptions(OPTIONS, 'EUROPE BERLIN').map((o) => o.value)).toEqual(['', 'Europe/Berlin']);
  });

  it('keeps pinned options while at least one real option matches', () => {
    expect(filterComboboxOptions(OPTIONS, 'berlin').map((o) => o.value)).toEqual(['', 'Europe/Berlin']);
  });

  it('drops pinned options on a zero-match query so the empty state renders', () => {
    expect(filterComboboxOptions(OPTIONS, 'zzz')).toEqual([]);
  });

  it('keeps a pinned option that matches the query itself', () => {
    expect(filterComboboxOptions(OPTIONS, 'display setting').map((o) => o.value)).toEqual(['']);
  });
});
