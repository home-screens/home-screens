'use client';

import { useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useListEditor } from '@/hooks/useListEditor';
import ViewSelect from '@/components/editor/ViewSelect';
import { NESTED_INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, CountdownEvent, CountdownView, CountdownConfig } from '@/types/config';
import HolidayPickerModal from '@/components/editor/HolidayPickerModal';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';

export function CountdownConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { config: c, set } = useModuleConfig<CountdownConfig>(mod, screenId);
  const events = c.events ?? [];
  const view = c.view ?? 'all';

  const VIEWS: { value: CountdownView; label: string }[] = [
    { value: 'all', label: t('configSections.countdown.viewAll') },
    { value: 'next', label: t('configSections.countdown.viewNext') },
  ];

  const { add: addEvent, remove: removeEvent, update: updateEvent } = useListEditor<CountdownEvent>(
    events,
    'events',
    set,
    { name: t('configSections.countdown.defaultEventName'), date: new Date().toISOString().slice(0, 16) }
  );

  const [showHolidayPicker, setShowHolidayPicker] = useState(false);
  const [imageBrowserEventId, setImageBrowserEventId] = useState<string | null>(null);

  const handleHolidayConfirm = (holidayEvents: CountdownEvent[], country: string) => {
    // Replace all holiday events with the new selection, preserving custom events
    // and carrying over backgroundImage for holidays that remain
    const nonHolidays = events.filter((e) => e.source !== 'holiday');
    const bgByName = new Map(
      events.filter((e) => e.source === 'holiday').map((e) => [e.name, e.backgroundImage])
    );
    const merged = holidayEvents.map((h) => ({ ...h, backgroundImage: bgByName.get(h.name) }));
    set({ events: [...nonHolidays, ...merged], holidayCountry: country });
  };

  const handleImageSelect = (serveUrl: string) => {
    if (imageBrowserEventId) {
      updateEvent(imageBrowserEventId, { backgroundImage: serveUrl });
    }
    setImageBrowserEventId(null);
  };

  return (
    <div className="space-y-2">
      {/* View selector */}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
        className={NESTED_INPUT_CLASS}
      />

      {/* Show Past Events — only relevant for "all" view */}
      {view === 'all' && (
        <Toggle label={t('configSections.countdown.showPastEvents')} checked={!!c.showPastEvents} onChange={(v) => set({ showPastEvents: v })} />
      )}

      <Toggle
        label={t('configSections.countdown.stayOnDay')}
        checked={!!c.stayUntilEndOfDay}
        onChange={(v) => set({ stayUntilEndOfDay: v })}
      />
      <p className="text-[10px] text-hs-text-faint -mt-1">
        {t('configSections.countdown.stayOnDayHelp')}
      </p>

      <LabeledField label={t('configSections.countdown.scalePercent', { percent: ((c.scale ?? 1) * 100).toFixed(0) })}>
        <input
          type="range"
          min="0.5"
          max="4"
          step="0.1"
          value={c.scale ?? 1}
          onChange={(e) => set({ scale: Number(e.target.value) })}
          className="w-full accent-hs-accent"
        />
      </LabeledField>

      {/* Events header with Add + Browse Holidays */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">{t('configSections.countdown.events')}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setShowHolidayPicker(true)}>{t('configSections.countdown.holidaysButton')}</Button>
          <Button size="sm" onClick={addEvent}>{tCore('actions.add')}</Button>
        </div>
      </div>

      <p className="text-[10px] text-hs-text-faint -mt-1">
        {t('configSections.countdown.backgroundImageHelp')}
      </p>

      {/* Event list */}
      {events.map((ev) => {
        const isHoliday = ev.source === 'holiday';
        return (
          <div key={ev.id} className="p-2 bg-hs-card rounded space-y-1">
            <div className="flex items-center gap-1">
              {isHoliday && (
                <span className="text-[10px] bg-emerald-800 text-emerald-200 px-1 rounded shrink-0">{t('configSections.countdown.holidayBadge')}</span>
              )}
              <input
                type="text"
                value={ev.name}
                onChange={(e) => updateEvent(ev.id, { name: e.target.value })}
                placeholder={t('configSections.countdown.namePlaceholder')}
                className={`flex-1 ${NESTED_INPUT_CLASS}`}
                readOnly={isHoliday}
              />
              <button onClick={() => removeEvent(ev.id)} className="text-hs-danger text-xs px-1">x</button>
            </div>
            {!isHoliday && (
              <>
                <input
                  type="datetime-local"
                  value={ev.date.includes('T') ? ev.date.slice(0, 16) : ev.date + 'T00:00'}
                  onChange={(e) => updateEvent(ev.id, { date: e.target.value })}
                  className={NESTED_INPUT_CLASS}
                />
                <Toggle
                  label={t('configSections.countdown.repeatYearly')}
                  checked={ev.recurring === 'yearly'}
                  onChange={(checked) => {
                    if (checked) {
                      updateEvent(ev.id, { recurring: 'yearly' });
                    } else {
                      // Remove recurring key entirely instead of setting to undefined
                      const { recurring: _, ...rest } = ev;
                      set({ events: events.map((item) => (item.id === ev.id ? rest : item)) });
                    }
                  }}
                />
              </>
            )}
            {isHoliday && (
              <p className="text-[10px] text-hs-text-faint">
                {t('configSections.countdown.holidayRecurringInfo', { date: ev.date.slice(0, 10) })}
              </p>
            )}
            {/* Background image picker */}
            <div className="flex items-center gap-1">
              {ev.backgroundImage ? (
                <>
                  <img
                    src={ev.backgroundImage}
                    alt=""
                    className="w-8 h-8 rounded object-cover"
                  />
                  <button
                    onClick={() => updateEvent(ev.id, { backgroundImage: undefined })}
                    className="text-hs-text-faint hover:text-hs-text-secondary text-[10px]"
                  >
                    {t('configSections.countdown.clear')}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setImageBrowserEventId(ev.id)}
                  className="text-hs-accent hover:text-hs-accent-hover text-[10px]"
                >
                  {t('configSections.countdown.setBackground')}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Holiday Picker Modal */}
      {showHolidayPicker && (
        <HolidayPickerModal
          initialCountry={c.holidayCountry}
          existingEvents={events}
          onConfirm={handleHolidayConfirm}
          onClose={() => setShowHolidayPicker(false)}
        />
      )}

      {/* Image Browser Modal */}
      {imageBrowserEventId && (
        <ImageBrowserModal
          mode="pick-image"
          onSelectImage={handleImageSelect}
          onClose={() => setImageBrowserEventId(null)}
        />
      )}
    </div>
  );
}
