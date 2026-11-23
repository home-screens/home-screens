'use client';

import { Calendar, CircleCheck, Clock, ImageIcon, List, Server, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { NoteIcon } from '@/components/notes/NoteGlyph';
import { REMOTE_LAYERS } from './remote-layers';

interface Tab {
  id: string;
  labelKey: string;
  icon: LucideIcon;
}

const CONTROL_TAB: Tab = { id: 'control', labelKey: 'tabs.control', icon: Server };
const TIMERS_TAB: Tab = { id: 'timers', labelKey: 'tabs.timers', icon: Clock };
const CHORES_TAB: Tab = { id: 'chores', labelKey: 'tabs.chores', icon: CircleCheck };
const LISTS_TAB: Tab = { id: 'lists', labelKey: 'tabs.lists', icon: List };
const CALENDAR_TAB: Tab = { id: 'calendar', labelKey: 'tabs.calendar', icon: Calendar };
const NOTES_TAB: Tab = { id: 'notes', labelKey: 'tabs.notes', icon: NoteIcon };
const MEALS_TAB: Tab = { id: 'meals', labelKey: 'tabs.meals', icon: UtensilsCrossed };
const PHOTOS_TAB: Tab = { id: 'photos', labelKey: 'tabs.photos', icon: ImageIcon };

interface BottomTabBarProps {
  activeTab: string;
  onChange: (tab: string) => void;
}

// Every tab, always. Chores/Lists/Notes/Meals/Photos used to be hidden until
// the matching module existed, which made a fresh install look like those
// features were not included; each one now opens on a TabNotSetUp panel
// explaining the gap. Lists, Calendar, Notes and Meals sit together: the
// things the family types.
const TABS: Tab[] = [CONTROL_TAB, TIMERS_TAB, CHORES_TAB, LISTS_TAB, CALENDAR_TAB, NOTES_TAB, MEALS_TAB, PHOTOS_TAB];

/** Room each tab keeps beside its word, for its padding and the gap to the next word. */
const TAB_ROOM_PX = 18;
/** The average letter of the tab type (Inter semibold, tight tracking) is this wide, in ems; measured across the seven languages. */
const LETTER_EM = 0.46;

export default function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  const t = useTranslate('remote');
  const tabs = TABS;
  const labels = tabs.map((tab) => t(tab.labelKey));
  // 12px on most phones; smaller on a narrow one, and smaller again in a
  // language whose seven words are long (German, Spanish, Dutch), so the
  // words keep the room between them that English has.
  const letters = Math.max(labels.join('').length, 1);
  const fontSize = `clamp(10px, min(3.2vw, (100vw - ${tabs.length * TAB_ROOM_PX}px) / ${(letters * LETTER_EM).toFixed(2)}), 12px)`;

  return (
    <nav style={{ zIndex: REMOTE_LAYERS.pageChrome }} className="fixed bottom-0 left-0 right-0 bg-hs-body/85 backdrop-blur-xl border-t border-hs-border-subtle pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-center">
        {tabs.map((tab, i) => {
          const label = labels[i];
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`press-btn flex-auto min-w-[44px] max-w-[120px] min-h-[44px] flex flex-col items-center gap-1 pt-2.5 pb-2 px-0.5 transition-colors ${
                activeTab === tab.id ? 'text-hs-accent' : 'text-hs-text-faint'
              }`}
              aria-label={label}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              <tab.icon className="w-6 h-6" strokeWidth={1.8} aria-hidden="true" />
              {/* Each tab is as wide as its word plus an equal share of the
                  room left over (`flex-auto`, not `flex-1`, which would make
                  seven equal tabs and squeeze "Mahlzeiten" or
                  "Temporizadores" against their neighbours), so the gaps
                  between words come out even. A short word still gets a
                  finger-wide tab. */}
              <span className="whitespace-nowrap font-semibold tracking-tight" style={{ fontSize }}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
