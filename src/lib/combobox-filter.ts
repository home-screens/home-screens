/**
 * Option model + AND-filter for the generic Combobox
 * (src/components/ui/Combobox.tsx). Lives in lib (pure, no React) so the
 * filtering contract is unit-testable in the node test environment.
 */
export interface ComboboxOption {
  /** Committed value ('' can be a legitimate value — e.g. a "use default" row). */
  value: string;
  /** Primary display text; also what the closed input shows. */
  label: string;
  /** Secondary text, shown faint in the dropdown and appended when closed. */
  description?: string;
  /** Always visible at the top of the list, regardless of the query. */
  pinned?: boolean;
}

/**
 * Filter options by a space-separated query: EVERY term must appear
 * (case-insensitive substring) in the option's label + value + description.
 * Terms are AND-combined — "new y" matches "New York", "new london" does not.
 * Pinned options always survive.
 */
export function filterComboboxOptions(
  options: readonly ComboboxOption[],
  query: string,
): ComboboxOption[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...options];
  return options.filter((o) => {
    if (o.pinned) return true;
    const haystack = `${o.label} ${o.value} ${o.description ?? ''}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
