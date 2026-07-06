'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Button from '@/components/ui/Button';
import { editorFetch } from '@/lib/editor-fetch';
import { getSupplementalHolidays } from '@/lib/supplemental-holidays';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import type { CountdownEvent } from '@/types/config';
import { useTranslate } from '@/i18n';

interface HolidayInfo {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD
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
  const tCore = useTranslate('core');
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState(initialCountry ?? '');
  const [holidays, setHolidays] = useState<HolidayInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose);

  // Fetch available countries on mount
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

  // Fetch holidays when country changes (with stale-response guard)
  const tokenRef = useRef(0);
  const fetchHolidays = useCallback(async (code: string) => {
    const token = ++tokenRef.current;
    if (!code) { setHolidays([]); setSelectedIds(new Set()); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const year = new Date().getFullYear();
      // Fetch current year and next year
      const [res1, res2] = await Promise.all([
        editorFetch(`/api/holidays?country=${code}&year=${year}`),
        editorFetch(`/api/holidays?country=${code}&year=${year + 1}`),
      ]);
      if (token !== tokenRef.current) return; // stale response, discard

      const h1: HolidayInfo[] = res1.ok ? await res1.json() : [];
      const h2: HolidayInfo[] = res2.ok ? await res2.json() : [];

      // Merge supplemental holidays (Easter, Valentine's, etc.)
      const supplemental = getSupplementalHolidays(code, [year, year + 1]);

      // Deduplicate by title (same holiday across years) — keep the next upcoming
      const seen = new Map<string, HolidayInfo>();
      for (const h of [...h1, ...h2, ...supplemental]) {
        if (h.start >= new Date().toISOString().slice(0, 10) && !seen.has(h.title)) {
          seen.set(h.title, h);
        }
      }
      const unique = Array.from(seen.values()).sort((a, b) => a.start.localeCompare(b.start));
      setHolidays(unique);

      // Pre-check holidays already in events list
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
  }, [existingEvents, t]);

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
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-hs-panel border border-hs-border-strong rounded-xl w-full max-w-md flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hs-border-strong">
          <h2 className="text-sm font-semibold text-hs-text-primary">{t('holidayPickerModal.title')}</h2>
          <button
            onClick={onClose}
            aria-label={t('modal.closeAriaLabel')}
            className="text-hs-text-muted hover:text-hs-text-body text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Country selector */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-hs-text-muted">{t('holidayPickerModal.countryLabel')}</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="bg-hs-card border border-hs-border-strong rounded px-2 py-1.5 text-sm text-hs-text-primary"
            >
              <option value="">{t('holidayPickerModal.countryPlaceholder')}</option>
              {countries.map((c) => (
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
                      className="accent-hs-accent"
                    />
                    <span className="text-sm text-hs-text-body flex-1">{h.title}</span>
                    <span className="text-xs text-hs-text-faint">{h.start}</span>
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-hs-border-strong">
          <Button size="sm" variant="secondary" onClick={onClose}>{tCore('actions.cancel')}</Button>
          <Button size="sm" onClick={handleConfirm} disabled={selectedIds.size === 0}>
            {addLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
