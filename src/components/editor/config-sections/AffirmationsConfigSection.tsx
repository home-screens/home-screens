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
import { hasValidLocation } from '@/lib/location';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, AffirmationsView, AffirmationsCategory, CustomAffirmation } from '@/types/config';

export function AffirmationsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
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

  const VIEWS: { value: AffirmationsView; label: string }[] = [
    { value: 'elegant', label: t('configSections.affirmations.viewElegant') },
    { value: 'card', label: t('configSections.affirmations.viewCard') },
    { value: 'minimal', label: t('configSections.affirmations.viewMinimal') },
    { value: 'typewriter', label: t('configSections.affirmations.viewTypewriter') },
  ];

  const CATEGORIES: { value: AffirmationsCategory; label: string }[] = [
    { value: 'affirmations', label: t('configSections.affirmations.categoryAffirmations') },
    { value: 'compliments', label: t('configSections.affirmations.categoryCompliments') },
    { value: 'motivational', label: t('configSections.affirmations.categoryMotivational') },
    { value: 'gratitude', label: t('configSections.affirmations.categoryGratitude') },
    { value: 'mindfulness', label: t('configSections.affirmations.categoryMindfulness') },
  ];

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
        <span className="text-xs text-hs-text-muted">{t('configSections.affirmations.contentCategories')}</span>
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
        label={t('configSections.affirmations.rotationSeconds')}
        value={(c.rotationIntervalMs ?? 15000) / 1000}
        min={(c.view ?? 'elegant') === 'typewriter' ? 10 : 5}
        max={120}
        onChange={(v) => set({ rotationIntervalMs: v * 1000 })}
      />

      {/* Toggles */}
      <Toggle
        label={t('configSections.affirmations.timeAware')}
        checked={c.timeAware ?? true}
        onChange={(v) => set({ timeAware: v })}
      />
      <WeatherAwareToggle
        checked={c.weatherAware ?? true}
        onChange={(v) => set({ weatherAware: v })}
      />
      <Toggle
        label={t('configSections.affirmations.showCategoryLabel')}
        checked={c.showCategoryLabel ?? false}
        onChange={(v) => set({ showCategoryLabel: v })}
      />

      {/* Accent Color */}
      {(c.view ?? 'elegant') !== 'minimal' && (
        <ColorPicker
          label={t('configSections.affirmations.accentColor')}
          value={c.accentColor ?? '#a78bfa'}
          onChange={(v) => set({ accentColor: v })}
        />
      )}

      {/* Custom Entries */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-hs-text-muted">{t('configSections.affirmations.customEntriesCount', { count: customEntries.length })}</span>
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
          placeholder={t('configSections.affirmations.newEntryPlaceholder')}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          className={INPUT_CLASS}
        />
        <input
          type="text"
          placeholder={t('configSections.affirmations.attributionPlaceholder')}
          value={newAttribution}
          onChange={(e) => setNewAttribution(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          className={INPUT_CLASS}
        />
        <Button variant="secondary" className="text-xs" onClick={addCustom}>
          {t('configSections.affirmations.addEntry')}
        </Button>
      </div>
    </>
  );
}

function WeatherAwareToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslate('editor');
  const lat = useEditorStore((s) => s.config?.settings?.latitude ?? s.config?.settings?.weather?.latitude);
  const lon = useEditorStore((s) => s.config?.settings?.longitude ?? s.config?.settings?.weather?.longitude);
  const hasLocation = hasValidLocation(lat, lon);

  return (
    <>
      <Toggle label={t('configSections.affirmations.weatherAware')} checked={checked} onChange={onChange} />
      {checked && !hasLocation && (
        <p className="text-xs text-hs-warning">
          {t('configSections.affirmations.weatherAwareLocationWarning')}
        </p>
      )}
    </>
  );
}
