'use client';

import { GripVertical } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { dragEndIndices, useSortableSensors } from '@/hooks/useDndSensors';
import { Switch } from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import type { FullscreenWeatherCard, FullscreenWeatherView } from '@/types/config';
import {
  DEFAULT_FULLSCREEN_WEATHER_CARDS, isDefaultWeatherCards, offWeatherCards,
} from '@/lib/fullscreen-weather-cards';
import FieldHint from '@/components/ui/FieldHint';

/** The editor's name for each card, under `configSections.fullscreen-weather`. */
const CARD_LABEL: Record<FullscreenWeatherCard, string> = {
  wind: 'cardWind', sun: 'cardSun', moon: 'cardMoon', airQuality: 'cardAirQuality', uv: 'cardUV', feelsLike: 'cardFeelsLike',
  humidity: 'cardHumidity', precipitation: 'cardPrecipitation', visibility: 'cardVisibility', pressure: 'cardPressure', nowcast: 'cardNowcast',
};
/** A second line under the name for a card that needs something the household may not have. */
const CARD_NOTE: Partial<Record<FullscreenWeatherCard, string>> = {
  airQuality: 'cardAirQualityNote',
  nowcast: 'cardNowcastNote',
};

/** How many cards from the top of the list the Forecast page draws under its map in portrait. */
const FORECAST_SLOTS = 2;

interface RowProps {
  card: FullscreenWeatherCard;
  on: boolean;
  /** The card's place on the wall, from 1; absent for an off card. */
  position?: number;
  /** One of the cards Forecast draws under its map. */
  leads: boolean;
  onToggle: (on: boolean) => void;
}

/** One card. On cards drag by the grip; off cards sit below the divider with only their switch. */
function CardRow({ card, on, position, leads, onToggle }: RowProps) {
  const t = useTranslate('editor');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card, disabled: !on });
  const name = t(`configSections.fullscreen-weather.${CARD_LABEL[card]}`);
  const note = CARD_NOTE[card];
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-card={card}
      data-on={on ? 'true' : 'false'}
      className={`relative flex items-center gap-1.5 rounded-md border border-hs-border bg-hs-card pl-1 pr-2 py-1.5 ${on ? '' : 'opacity-60'}`}
    >
      {leads && (
        <span
          aria-hidden
          title={t('configSections.fullscreen-weather.cardsLeads')}
          className="absolute -left-1 top-1/2 -translate-y-1/2 h-3/5 w-[3px] rounded-sm bg-hs-accent"
        />
      )}
      <button
        type="button"
        className={`shrink-0 touch-none p-0.5 ${on ? 'cursor-grab text-hs-text-faint hover:text-hs-text-muted' : 'cursor-default text-hs-border-strong'}`}
        aria-label={t('configSections.fullscreen-weather.cardsDrag', { card: name })}
        disabled={!on}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span className="flex-1 min-w-0 text-xs text-hs-text-body leading-tight">
        {name}
        {note && <span className="block text-[10px] text-hs-text-faint">{t(`configSections.fullscreen-weather.${note}`)}</span>}
      </span>
      {position !== undefined && <span className="w-3.5 shrink-0 text-right text-[10px] tabular-nums text-hs-text-faint">{position}</span>}
      <Switch checked={on} onChange={onToggle} ariaLabel={name} />
    </li>
  );
}

interface WeatherCardsListProps {
  /** The cards that are on, in order. */
  value: FullscreenWeatherCard[];
  onChange: (next: FullscreenWeatherCard[]) => void;
  view: FullscreenWeatherView;
}

/**
 * The Forecast and Conditions cards as one list: drag an on card to move it,
 * flip its switch to turn it off, which drops it below the divider. Turning
 * a card back on appends it. The list is the saved value: the cards that
 * are on, in order (`FullscreenWeatherConfig.cards`).
 */
export function WeatherCardsList({ value, onChange, view }: WeatherCardsListProps) {
  const t = useTranslate('editor');
  const sensors = useSortableSensors();
  const off = offWeatherCards(value);
  const handleDragEnd = (event: DragEndEvent) => {
    const move = dragEndIndices(event, value);
    if (move) onChange(arrayMove(value, move.from, move.to));
  };
  const hint = view === 'forecast'
    ? t('configSections.fullscreen-weather.cardsHintForecast')
    : t('configSections.fullscreen-weather.cardsHintConditions');

  return (
    <div className="space-y-1.5" data-field-id="cards">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-hs-text-muted">{t('configSections.fullscreen-weather.cards')}</span>
        <button
          type="button"
          className="text-[11px] text-hs-accent hover:text-hs-accent-hover disabled:text-hs-text-faint"
          disabled={isDefaultWeatherCards(value)}
          onClick={() => onChange([...DEFAULT_FULLSCREEN_WEATHER_CARDS])}
        >
          {t('configSections.fullscreen-weather.cardsReset')}
        </button>
      </div>
      <FieldHint>{hint}</FieldHint>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={value} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1" aria-label={t('configSections.fullscreen-weather.cards')}>
            {value.map((card, i) => (
              <CardRow
                key={card}
                card={card}
                on
                position={i + 1}
                leads={view === 'forecast' && i < FORECAST_SLOTS}
                onToggle={() => onChange(value.filter((c) => c !== card))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {off.length > 0 && (
        <>
          <p className="pt-1 text-[10px] uppercase tracking-wide text-hs-text-faint">{t('configSections.fullscreen-weather.cardsOff')}</p>
          <ul className="space-y-1" aria-label={t('configSections.fullscreen-weather.cardsOff')}>
            {off.map((card) => (
              <CardRow key={card} card={card} on={false} leads={false} onToggle={() => onChange([...value, card])} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
