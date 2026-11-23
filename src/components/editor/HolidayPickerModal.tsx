'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { getSupplementalHolidays } from '@/lib/supplemental-holidays';
import { isoDateInTZ } from '@/lib/timezone';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import type { CountdownEvent } from '@/types/config';
import { useFormattingLocale, useLocale, useTranslate } from '@/i18n';
import { localizedHolidayCountries } from '@/lib/holiday-countries';
import { CHECKBOX_CLASS, MODAL_INPUT_CLASS } from '@/components/ui/input-classes';

interface HolidayInfo {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD
}

/**
 * A holiday's calendar day in the household's words ("Sat, Oct 31"), with the
 * year only when it is not this one. The day is a plain `YYYY-MM-DD` with no
 * zone, so it is read and written at UTC midnight to keep it the same day on
 * any laptop.
 */
export function formatHolidayDay(isoDay: string, thisYear: number, locale: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  if (!y || !m || !d) return isoDay;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(y !== thisYear ? { year: 'numeric' } : {}),
  });
}

interface Country {
  countryCode: string;
  name: string;
}

interface HolidayPickerModalProps {
  initialCountry?: string;
  existingEvents: CountdownEvent[];
  onConfirm: (events: CountdownEvent[], country: string) => void;
  onClose: () => void;
}

export default function HolidayPickerModal({
  initialCountry,
  existingEvents,
  onConfirm,
  onClose,
}: HolidayPickerModalProps) {
  const t = useTranslate('editor');
  const locale = useLocale();
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState(initialCountry ?? '');
  const formattingLocale = useFormattingLocale();
  const [holidays, setHolidays] = useState<HolidayInfo[]>([]);
  const [thisYear, setThisYear] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = useEditorHouseholdTimezone();

  useEffect(() => {
    async function load() {
      try {
        const res = await editorFetch('/api/holidays?countries');
        if (res.ok) {
          setCountries(await res.json());
        } else {
          setError(t('holidayPickerModal.errors.loadCountries'));
        }
      } catch {
        setError(t('holidayPickerModal.errors.loadCountries'));
      }
    }
    load();
  }, [t]);

  // stale-response guard
  const tokenRef = useRef(0);
  const fetchHolidays = useCallback(async (code: string) => {
    const token = ++tokenRef.current;
    if (!code) { setHolidays([]); setSelectedIds(new Set()); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      // Today on the household's own calendar, not the laptop's or UTC's: a
      // holiday happening at home right now stays in the list.
      const today = isoDateInTZ(new Date(), timezone);
      const year = Number(today.slice(0, 4));
      const [res1, res2] = await Promise.all([
        editorFetch(`/api/holidays?country=${code}&year=${year}`),
        editorFetch(`/api/holidays?country=${code}&year=${year + 1}`),
      ]);
      if (token !== tokenRef.current) return; // stale response, discard

      const h1: HolidayInfo[] = res1.ok ? await res1.json() : [];
      const h2: HolidayInfo[] = res2.ok ? await res2.json() : [];

      // Merge supplemental holidays (Easter, Valentine's, etc.)
      const supplemental = getSupplementalHolidays(code, [year, year + 1], today);

      // Deduplicate by title (same holiday across years) — keep the next upcoming
      const seen = new Map<string, HolidayInfo>();
      for (const h of [...h1, ...h2, ...supplemental]) {
        if (h.start >= today && !seen.has(h.title)) {
          seen.set(h.title, h);
        }
      }
      const unique = Array.from(seen.values()).sort((a, b) => a.start.localeCompare(b.start));
      setHolidays(unique);
      setThisYear(year);

      const existingNames = new Set(
        existingEvents
          .filter((e) => e.source === 'holiday')
          .map((e) => e.name)
      );
      const preSelected = new Set<string>();
      for (const h of unique) {
        if (existingNames.has(h.title)) preSelected.add(h.id);
      }
      setSelectedIds(preSelected);
    } catch {
      if (token === tokenRef.current) setError(t('holidayPickerModal.errors.loadHolidays'));
    } finally {
      if (token === tokenRef.current) setLoading(false);
    }
  }, [existingEvents, timezone, t]);

  useEffect(() => {
    fetchHolidays(country);
  }, [country, fetchHolidays]);

  const toggleHoliday = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === holidays.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(holidays.map((h) => h.id)));
    }
  };

  const handleConfirm = () => {
    const selected = holidays.filter((h) => selectedIds.has(h.id));
    const events: CountdownEvent[] = selected.map((h) => ({
      id: `holiday-${country}-${h.title.toLowerCase().replace(/\s+/g, '-')}`,
      name: h.title,
      date: `${h.start}T00:00`,
      recurring: 'yearly' as const,
      source: 'holiday' as const,
    }));
    onConfirm(events, country);
    onClose();
  };

  const allSelected = selectedIds.size === holidays.length && holidays.length > 0;
  const addLabel =
    selectedIds.size === 0
      ? t('holidayPickerModal.addEmpty')
      : selectedIds.size === 1
        ? t('holidayPickerModal.addCountSingular', { count: 1 })
        : t('holidayPickerModal.addCountPlural', { count: selectedIds.size });

  return (
    <ModalFrame
      labelledBy="holiday-picker-title"
      onClose={onClose}
      className="w-full max-w-md"
    >
      <ModalPanel>
        <ModalHeader titleId="holiday-picker-title" title={t('holidayPickerModal.title')} onClose={onClose} />

        <ModalBody className="space-y-3">
          {/* Country selector */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-hs-text-muted">{t('holidayPickerModal.countryLabel')}</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={MODAL_INPUT_CLASS}
            >
              <option value="">{t('holidayPickerModal.countryPlaceholder')}</option>
              {localizedHolidayCountries(countries, locale).map((c) => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {loading && <p className="text-xs text-hs-text-faint">{t('holidayPickerModal.loadingHolidays')}</p>}

          {!loading && holidays.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-hs-text-muted">
                  {t('holidayPickerModal.selectionCount', {
                    selected: selectedIds.size,
                    total: holidays.length,
                  })}
                </span>
                <button onClick={toggleAll} className="text-xs text-hs-accent hover:text-hs-accent-hover">
                  {allSelected
                    ? t('holidayPickerModal.deselectAll')
                    : t('holidayPickerModal.selectAll')}
                </button>
              </div>
              <div className="space-y-1">
                {holidays.map((h) => (
                  <label
                    key={h.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-hs-card cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(h.id)}
                      onChange={() => toggleHoliday(h.id)}
                      className={CHECKBOX_CLASS}
                    />
                    <span className="text-sm text-hs-text-body flex-1">{h.title}</span>
                    <span className="text-xs text-hs-text-faint">{formatHolidayDay(h.start, thisYear, formattingLocale)}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-hs-danger">{error}</p>
          )}

          {!loading && !error && country && holidays.length === 0 && (
            <p className="text-xs text-hs-text-faint">{t('holidayPickerModal.noHolidays')}</p>
          )}
        </ModalBody>

        <ModalFooter onCancel={onClose} primary={{ label: addLabel, onClick: handleConfirm, disabled: selectedIds.size === 0 }} />
      </ModalPanel>
    </ModalFrame>
  );
}
