'use client';

import { useState } from 'react';
import { uuid } from '@/lib/uuid';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, AffirmationsView, AffirmationsCategory, CustomAffirmation } from '@/types/config';

const VIEWS: { value: AffirmationsView; label: string }[] = [
  { value: 'elegant', label: 'Elegant (Accent Lines)' },
  { value: 'card', label: 'Card (Gradient Tint)' },
  { value: 'minimal', label: 'Minimal (Text Only)' },
  { value: 'typewriter', label: 'Typewriter (Animated)' },
];

const CATEGORIES: { value: AffirmationsCategory; label: string }[] = [
  { value: 'affirmations', label: 'Affirmations' },
  { value: 'compliments', label: 'Compliments' },
  { value: 'motivational', label: 'Motivational' },
  { value: 'gratitude', label: 'Gratitude Prompts' },
  { value: 'mindfulness', label: 'Mindfulness' },
];

export function AffirmationsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{
    view?: AffirmationsView;
    categories?: AffirmationsCategory[];
    rotationIntervalMs?: number;
    showCategoryLabel?: boolean;
    timeAware?: boolean;
    weatherAware?: boolean;
    customEntries?: CustomAffirmation[];
    accentColor?: string;
  }>(mod, screenId);

  const [newText, setNewText] = useState('');
  const [newAttribution, setNewAttribution] = useState('');

  const categories = c.categories ?? ['affirmations', 'compliments', 'motivational'];
  const customEntries = c.customEntries ?? [];

  const toggleCategory = (cat: AffirmationsCategory) => {
    const has = categories.includes(cat);
    const next = has ? categories.filter((c) => c !== cat) : [...categories, cat];
    // Don't allow empty — keep at least one
    if (next.length > 0) set({ categories: next });
  };

  const addCustom = () => {
    if (!newText.trim()) return;
    const entry: CustomAffirmation = {
      id: uuid(),
      text: newText.trim(),
      attribution: newAttribution.trim() || undefined,
    };
    set({ customEntries: [...customEntries, entry] });
    setNewText('');
    setNewAttribution('');
  };

  const removeCustom = (id: string) => {
    set({ customEntries: customEntries.filter((e) => e.id !== id) });
  };

  return (
    <>
      {/* View Mode */}
      <ViewSelect
        value={c.view ?? 'elegant'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Categories */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-hs-text-muted">Content Categories</span>
        {CATEGORIES.map((cat) => (
          <Toggle
            key={cat.value}
            label={cat.label}
            checked={categories.includes(cat.value)}
            onChange={() => toggleCategory(cat.value)}
          />
        ))}
      </div>

      {/* Rotation Speed — typewriter needs more time to finish typing */}
      <Slider
        label="Rotation (seconds)"
        value={(c.rotationIntervalMs ?? 15000) / 1000}
        min={(c.view ?? 'elegant') === 'typewriter' ? 10 : 5}
        max={120}
        onChange={(v) => set({ rotationIntervalMs: v * 1000 })}
      />

      {/* Toggles */}
      <Toggle
        label="Time-Aware Content"
        checked={c.timeAware ?? true}
        onChange={(v) => set({ timeAware: v })}
      />
      <WeatherAwareToggle
        checked={c.weatherAware ?? true}
        onChange={(v) => set({ weatherAware: v })}
      />
      <Toggle
        label="Show Category Label"
        checked={c.showCategoryLabel ?? false}
        onChange={(v) => set({ showCategoryLabel: v })}
      />

      {/* Accent Color */}
      {(c.view ?? 'elegant') !== 'minimal' && (
        <ColorPicker
          label="Accent Color"
          value={c.accentColor ?? '#a78bfa'}
          onChange={(v) => set({ accentColor: v })}
        />
      )}

      {/* Custom Entries */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-hs-text-muted">Custom Entries ({customEntries.length})</span>
        {customEntries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-1 text-xs bg-hs-card rounded p-1.5">
            <span className="flex-1 text-hs-text-secondary leading-snug">{entry.text}</span>
            <button
              type="button"
              onClick={() => removeCustom(entry.id)}
              className="text-hs-text-faint hover:text-hs-danger shrink-0"
            >
              &times;
            </button>
          </div>
        ))}
        <input
          type="text"
          placeholder="New affirmation text…"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          className={INPUT_CLASS}
        />
        <input
          type="text"
          placeholder="Attribution (optional)"
          value={newAttribution}
          onChange={(e) => setNewAttribution(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          className={INPUT_CLASS}
        />
        <Button variant="secondary" className="text-xs" onClick={addCustom}>
          Add Entry
        </Button>
      </div>
    </>
  );
}

function WeatherAwareToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const lat = useEditorStore((s) => s.config?.settings?.latitude ?? s.config?.settings?.weather?.latitude);
  const lon = useEditorStore((s) => s.config?.settings?.longitude ?? s.config?.settings?.weather?.longitude);
  const hasLocation = lat != null && lon != null && !(lat === 0 && lon === 0);

  return (
    <>
      <Toggle label="Weather-Aware Content" checked={checked} onChange={onChange} />
      {checked && !hasLocation && (
        <p className="text-xs text-hs-warning">
          Set your location in Settings &gt; Weather to enable weather-aware content.
        </p>
      )}
    </>
  );
}
