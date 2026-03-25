'use client';

import { useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useListEditor } from '@/hooks/useListEditor';
import { NESTED_INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, CountdownEvent, CountdownView, CountdownConfig } from '@/types/config';
import HolidayPickerModal from '@/components/editor/HolidayPickerModal';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';

const VIEWS: { value: CountdownView; label: string }[] = [
  { value: 'all', label: 'All Events (Stacked)' },
  { value: 'next', label: 'Next Event (Single)' },
];

export function CountdownConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<CountdownConfig>(mod, screenId);
  const events = c.events ?? [];
  const view = c.view ?? 'all';

  const { add: addEvent, remove: removeEvent, update: updateEvent } = useListEditor<CountdownEvent>(
    events,
    'events',
    set,
    { name: 'New Event', date: new Date().toISOString().slice(0, 16) }
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
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">View</span>
        <select
          value={view}
          onChange={(e) => set({ view: e.target.value as CountdownView })}
          className={NESTED_INPUT_CLASS}
        >
          {VIEWS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </label>

      {/* Show Past Events — only relevant for "all" view */}
      {view === 'all' && (
        <Toggle label="Show Past Events" checked={!!c.showPastEvents} onChange={(v) => set({ showPastEvents: v })} />
      )}

      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Scale ({((c.scale ?? 1) * 100).toFixed(0)}%)</span>
        <input
          type="range"
          min="0.5"
          max="4"
          step="0.1"
          value={c.scale ?? 1}
          onChange={(e) => set({ scale: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </label>

      {/* Events header with Add + Browse Holidays */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">Events</span>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setShowHolidayPicker(true)}>Holidays...</Button>
          <Button size="sm" onClick={addEvent}>Add</Button>
        </div>
      </div>

      <p className="text-[10px] text-neutral-500 -mt-1">
        The nearest upcoming event&#39;s background image will be used as the page background.
      </p>

      {/* Event list */}
      {events.map((ev) => {
        const isHoliday = ev.source === 'holiday';
        return (
          <div key={ev.id} className="p-2 bg-neutral-800 rounded space-y-1">
            <div className="flex items-center gap-1">
              {isHoliday && (
                <span className="text-[10px] bg-emerald-800 text-emerald-200 px-1 rounded shrink-0">Holiday</span>
              )}
              <input
                type="text"
                value={ev.name}
                onChange={(e) => updateEvent(ev.id, { name: e.target.value })}
                placeholder="Name"
                className={`flex-1 ${NESTED_INPUT_CLASS}`}
                readOnly={isHoliday}
              />
              <button onClick={() => removeEvent(ev.id)} className="text-red-400 text-xs px-1">x</button>
            </div>
            {!isHoliday && (
              <>
                <input
                  type="datetime-local"
                  value={ev.date.includes('T') ? ev.date.slice(0, 16) : ev.date + 'T00:00'}
                  onChange={(e) => updateEvent(ev.id, { date: e.target.value })}
                  className={NESTED_INPUT_CLASS}
                />
                <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ev.recurring === 'yearly'}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateEvent(ev.id, { recurring: 'yearly' });
                      } else {
                        // Remove recurring key entirely instead of setting to undefined
                        const { recurring: _, ...rest } = ev;
                        set({ events: events.map((item) => (item.id === ev.id ? rest : item)) });
                      }
                    }}
                    className="accent-blue-500"
                  />
                  Repeat yearly
                </label>
              </>
            )}
            {isHoliday && (
              <p className="text-[10px] text-neutral-500">
                Recurring yearly &middot; {ev.date.slice(0, 10)}
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
                    className="text-neutral-500 hover:text-neutral-300 text-[10px]"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setImageBrowserEventId(ev.id)}
                  className="text-blue-400 hover:text-blue-300 text-[10px]"
                >
                  Set Background...
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
