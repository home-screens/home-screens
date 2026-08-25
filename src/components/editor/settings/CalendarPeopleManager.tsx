'use client';

import { useState } from 'react';
import { uuid } from '@/lib/uuid';
import type { CalendarPerson } from '@/types/config';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import { useCalendarSources } from '@/components/editor/config-sections/CalendarSourceFilter';

const PERSON_COLOR_PALETTE = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c',
  '#059669', '#0891b2', '#ca8a04', '#dc2626',
];

interface CalendarPeopleManagerProps {
  people: CalendarPerson[];
  onChange: (people: CalendarPerson[]) => void;
}

/**
 * Settings > Calendar > People: a name, a color, and the calendars that
 * belong to each family member. The family grid and free time views draw one
 * row per person; a calendar picked for nobody is shared by everyone.
 */
export default function CalendarPeopleManager({ people, onChange }: CalendarPeopleManagerProps) {
  const t = useTranslate('editor');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Holidays are never a person's calendar; every other source can be.
  const { availableSources } = useCalendarSources('configSections.fullscreen-calendar');
  const sources = availableSources.filter((s) => s.id !== 'holidays');

  const nextColor = (taken: string[]) => PERSON_COLOR_PALETTE.find((c) => !taken.includes(c)) ?? PERSON_COLOR_PALETTE[people.length % PERSON_COLOR_PALETTE.length];

  function addPerson() {
    const name = newName.trim();
    if (!name) return;
    const person: CalendarPerson = { id: uuid(), name, color: nextColor(people.map((p) => p.color)), sourceIds: [] };
    onChange([...people, person]);
    setNewName('');
    setEditingId(person.id);
  }

  function update(id: string, patch: Partial<CalendarPerson>) {
    onChange(people.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function remove(id: string) {
    onChange(people.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function toggleSource(person: CalendarPerson, sourceId: string) {
    const has = person.sourceIds.includes(sourceId);
    update(person.id, { sourceIds: has ? person.sourceIds.filter((s) => s !== sourceId) : [...person.sourceIds, sourceId] });
  }

  // The area card around this manager carries the "People" title and help.
  return (
    <section>
      <div className="space-y-3">
        {people.length > 0 && (
          <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong">
            {people.map((person) => {
              const editing = editingId === person.id;
              const named = sources.filter((s) => person.sourceIds.includes(s.id)).map((s) => s.name);
              return (
                <div key={person.id} data-person-id={person.id}>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <span
                      className="w-6 h-6 rounded-full shrink-0 inline-flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: person.color }}
                      aria-hidden="true"
                    >
                      {person.name.trim().charAt(0).toLocaleUpperCase()}
                    </span>
                    <span className="text-sm text-hs-text-body truncate flex-1">{person.name}</span>
                    <span className={`text-xs truncate max-w-[40%] ${named.length > 0 ? 'text-hs-text-faint' : 'text-hs-warning'}`}>
                      {named.length > 0 ? named.join(', ') : t('settings.calendarPage.people.noCalendarsPicked')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingId(editing ? null : person.id)}
                      className="text-xs text-hs-text-faint hover:text-hs-text-secondary transition-colors"
                    >
                      {editing ? t('modals.icalFeeds.doneLowercase') : t('modals.icalFeeds.editLowercase')}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(person.id)}
                      className="text-xs text-hs-text-faint hover:text-hs-danger transition-colors"
                      aria-label={t('settings.calendarPage.people.remove', { name: person.name })}
                    >
                      &times;
                    </button>
                  </div>
                  {editing && (
                    <div className="px-3 pb-3 space-y-2">
                      <input
                        type="text"
                        value={person.name}
                        onChange={(e) => update(person.id, { name: e.target.value })}
                        className="w-full rounded-md bg-hs-panel border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
                        placeholder={t('settings.calendarPage.people.namePlaceholder')}
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-hs-text-muted mr-1">{t('fields.color')}</span>
                        {PERSON_COLOR_PALETTE.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => update(person.id, { color })}
                            className="w-5 h-5 rounded-full border-2 transition-colors"
                            style={{ backgroundColor: color, borderColor: person.color === color ? '#fff' : 'transparent' }}
                            aria-label={color}
                          />
                        ))}
                      </div>
                      <div>
                        <span className="text-xs text-hs-text-muted">{t('settings.calendarPage.people.calendars')}</span>
                        {sources.length === 0 ? (
                          <p className="text-xs text-hs-text-faint mt-1">{t('settings.calendarPage.people.noSources')}</p>
                        ) : (
                          <div className="mt-1 rounded-md bg-hs-panel border border-hs-border-strong divide-y divide-hs-border-strong max-h-40 overflow-y-auto">
                            {sources.map((src) => (
                              <label key={src.id} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover">
                                <input
                                  type="checkbox"
                                  checked={person.sourceIds.includes(src.id)}
                                  onChange={() => toggleSource(person, src.id)}
                                  className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
                                />
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                                <span className="text-sm text-hs-text-body truncate">{src.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }}
            className="flex-1 rounded-md bg-hs-panel border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
            placeholder={t('settings.calendarPage.people.namePlaceholder')}
            aria-label={t('settings.calendarPage.people.namePlaceholder')}
          />
          <Button variant="secondary" size="sm" onClick={addPerson} disabled={!newName.trim()}>
            {t('settings.calendarPage.people.addPerson')}
          </Button>
        </div>
        {people.length === 0 && (
          <p className="text-xs text-hs-text-muted">{t('settings.calendarPage.people.noPeople')}</p>
        )}
      </div>
    </section>
  );
}
