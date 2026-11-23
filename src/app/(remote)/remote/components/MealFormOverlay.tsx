'use client';

import { useState } from 'react';
import { Heart, Plus, X } from 'lucide-react';
import type { MealIngredient, GroceryCategory } from '@/types/config';
import { COURSE_KINDS } from '@/lib/meal-courses';
import type { MealFormState } from '../hooks/useMealForm';
import MealRateButton from './MealRatingSheet';
import { MEAL_TAGS, MEAL_DIFFICULTIES, FOOD_EMOJIS, normalizeTag, DIFFICULTY_COLORS } from '@/lib/meal-constants';
import { GROCERY_CATEGORY_ORDER, groceryAisle } from '@/lib/grocery-utils';
import { useTranslate } from '@/i18n';
import FormOverlay from './FormOverlay';
import SaveDeleteFooter from './SaveDeleteFooter';
import { useFormDirty } from '@/hooks/useFormDirty';
import PhoneIconPicker from '@/components/custom-icons/PhoneIconPicker';
import CustomIconsOverlay from './CustomIconsOverlay';
import ChipButton from './ChipButton';
import { withAlpha } from '@/lib/hex-color';
import { COMPACT_FIELD, COMPACT_LABEL, selectedPillStyle } from './remote-styles';

interface MealFormOverlayProps {
  form: MealFormState;
  onSave: () => Promise<void>;
  onDelete: () => void;
  saving: boolean;
  saveError: string | null;
}

/** The kinds of dish a meal can be saved as; "Add a side" lists the sides first. */

export default function MealFormOverlay({
  form,
  onSave,
  onDelete,
  saving,
  saveError,
}: MealFormOverlayProps) {
  const t = useTranslate('remote');
  // Difficulty / tags / ingredient-category labels live in `core.meal.*`
  // so /remote doesn't have to lazy-fetch the 113KB editor.json. Core is
  // already loaded by the remote layout.
  const tCore = useTranslate('core');
  const [managingIcons, setManagingIcons] = useState(false);
  // The row "Add ingredient" just made, which takes the cursor as it appears
  // so the next tap types its name rather than hunting for the box.
  const [addedRow, setAddedRow] = useState<number | null>(null);
  const {
    editingMeal,
    setEditingMeal,
    formName,
    setFormName,
    formEmoji,
    setFormEmoji,
    formPrepTime,
    setFormPrepTime,
    formCookTime,
    setFormCookTime,
    formServings,
    setFormServings,
    formDifficulty,
    setFormDifficulty,
    formCategory,
    setFormCategory,
    formTags,
    setFormTags,
    formIngredients,
    setFormIngredients,
    formRecipeUrl,
    setFormRecipeUrl,
    formNotes,
    setFormNotes,
    formFavorite,
    setFormFavorite,
    nameInputRef,
  } = form;
  const dirty = useFormDirty([
    formName, formEmoji, formPrepTime, formCookTime, formServings, formDifficulty, formCategory,
    formTags, formIngredients, formRecipeUrl, formNotes, formFavorite,
  ]);

  const footer = (
    <SaveDeleteFooter
      saveLabel={editingMeal === 'new' ? t('mealForm.addSubmit') : undefined}
      canSave={Boolean(formName.trim())}
      busy={saving}
      onSave={() => void onSave()}
      notice={saveError}
      noticeTone="danger"
      deleteLabel={editingMeal !== 'new' ? t('mealForm.deleteButton') : undefined}
      onDelete={onDelete}
    />
  );

  return (
    <>
    <FormOverlay
      title={editingMeal === 'new' ? t('mealForm.titleNew') : t('mealForm.titleEdit')}
      dirty={dirty}
      onBack={() => setEditingMeal(null)}
      footer={footer}
    >
      <div style={{ marginBottom: 24 }}>
        <div style={COMPACT_LABEL}>{t('mealForm.nameLabel')}</div>
        <input
          ref={nameInputRef}
          type="text"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder={t('mealForm.namePlaceholder')}
          style={COMPACT_FIELD}
          autoFocus
        />
      </div>

      <PhoneIconPicker
        value={formEmoji}
        onChange={setFormEmoji}
        choices={{ kind: 'emoji', emoji: FOOD_EMOJIS }}
        label={tCore('actions.icon')}
        labelStyle={COMPACT_LABEL}
        suggestedName={formName}
        labelAction={(
          <button
            type="button"
            onClick={() => setManagingIcons(true)}
            style={{ background: 'none', border: 'none', padding: '12px 0 12px 16px', margin: '-12px 0', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--hs-accent-hover)' }}
          >
            {tCore('customIcons.manage')}
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div>
          <div style={COMPACT_LABEL}>{t('mealForm.prepTimeLabel')}</div>
          <input
            type="number"
            value={formPrepTime}
            onChange={(e) => setFormPrepTime(e.target.value ? Number(e.target.value) : '')}
            placeholder={t('mealForm.minPlaceholder')}
            style={COMPACT_FIELD}
          />
        </div>
        <div>
          <div style={COMPACT_LABEL}>{t('mealForm.cookTimeLabel')}</div>
          <input
            type="number"
            value={formCookTime}
            onChange={(e) => setFormCookTime(e.target.value ? Number(e.target.value) : '')}
            placeholder={t('mealForm.minPlaceholder')}
            style={COMPACT_FIELD}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div>
          <div style={COMPACT_LABEL}>{t('mealForm.servingsLabel')}</div>
          <input
            type="number"
            value={formServings}
            onChange={(e) => setFormServings(e.target.value ? Number(e.target.value) : '')}
            placeholder={t('mealForm.servingsPlaceholder')}
            style={COMPACT_FIELD}
          />
        </div>
        <div>
          <div style={COMPACT_LABEL}>{t('mealForm.difficultyLabel')}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {MEAL_DIFFICULTIES.map((d) => {
              const hex = DIFFICULTY_COLORS[d];
              const isSelected = formDifficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setFormDifficulty(isSelected ? undefined : d)}
                  className="press-scale-sm"
                  style={{
                    flex: 1,
                    padding: '12px 4px',
                    minHeight: 48,
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 12,
                    border: isSelected ? `1px solid ${hex}` : '1px solid var(--hs-border)',
                    background: isSelected ? withAlpha(hex, 0.08) : 'var(--hs-bg-panel)',
                    color: isSelected ? hex : 'var(--hs-text-faint)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {tCore(`meal.difficulty.${d}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={COMPACT_LABEL}>{t('mealForm.kindLabel')}</div>
        <div role="radiogroup" aria-label={t('mealForm.kindLabel')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COURSE_KINDS.map((kind) => {
            const isSelected = formCategory === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setFormCategory(kind)}
                className="press-scale-sm"
                style={{
                  padding: '10px 14px',
                  minHeight: 44,
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 999,
                  ...selectedPillStyle(isSelected),
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {tCore(`meal.kind.${kind}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={COMPACT_LABEL}>{t('mealForm.tagsLabel')}</div>
        {/* The chips' 44 px targets stand 4 px clear of the drawn chip, so the rows sit closer. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 6, margin: '-4px 0' }}>
          {MEAL_TAGS.map((tag) => {
            const isActive = formTags.some((tt) => normalizeTag(tt) === tag);
            return (
              <ChipButton
                key={tag}
                selected={isActive}
                onClick={() => {
                  setFormTags((prev) =>
                    isActive ? prev.filter((tt) => normalizeTag(tt) !== tag) : [...prev, tag],
                  );
                }}
              >
                {tCore(`meal.tags.${tag}`)}
              </ChipButton>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={COMPACT_LABEL}>{t('mealForm.ingredientsLabel')}</div>
        {formIngredients.map((ing: MealIngredient, idx: number) => (
          <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              type="text"
              placeholder={t('mealForm.ingredientNamePlaceholder')}
              autoFocus={idx === addedRow}
              value={ing.name}
              onChange={(e) => {
                const next = [...formIngredients];
                next[idx] = { ...next[idx], name: e.target.value };
                setFormIngredients(next);
              }}
              style={{ ...COMPACT_FIELD, flex: 2 }}
            />
            <input
              type="text"
              placeholder={t('mealForm.ingredientAmountPlaceholder')}
              value={ing.amount ?? ''}
              onChange={(e) => {
                const next = [...formIngredients];
                next[idx] = { ...next[idx], amount: e.target.value };
                setFormIngredients(next);
              }}
              style={{ ...COMPACT_FIELD, flex: 1 }}
            />
            {/* The aisle the grocery list files it under: the one picked, else
                the one its name suggests. "Other" on every row read as if the
                list would lump them together, while it files each by its name. */}
            <select
              value={groceryAisle(ing)}
              onChange={(e) => {
                const next = [...formIngredients];
                next[idx] = { ...next[idx], category: e.target.value as GroceryCategory };
                setFormIngredients(next);
              }}
              style={{
                ...COMPACT_FIELD,
                flex: 1,
                appearance: 'none' as const,
                paddingRight: 8,
              }}
            >
              {GROCERY_CATEGORY_ORDER.map((cat) => (
                <option key={cat} value={cat}>
                  {tCore(`meal.ingredientCategories.${cat}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setFormIngredients((prev) => prev.filter((_, i) => i !== idx));
              }}
              className="press-scale-xs"
              aria-label={t('mealForm.removeIngredientAriaLabel')}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: '1px solid var(--hs-border)',
                background: 'transparent',
                color: 'var(--hs-danger)',
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setAddedRow(formIngredients.length);
            setFormIngredients((prev) => [...prev, { name: '', amount: '' }]);
          }}
          className="press-scale"
          style={{
            width: '100%',
            padding: '12px',
            minHeight: 48,
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 12,
            border: '2px dashed var(--hs-border)',
            background: 'transparent',
            color: 'var(--hs-text-faint)',
            cursor: 'pointer',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Plus size={16} aria-hidden="true" />
          {t('mealForm.addIngredientButton')}
        </button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={COMPACT_LABEL}>{t('mealForm.recipeUrlLabel')}</div>
        <input
          type="url"
          value={formRecipeUrl}
          onChange={(e) => setFormRecipeUrl(e.target.value)}
          placeholder={t('mealForm.recipeUrlPlaceholder')}
          style={COMPACT_FIELD}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={COMPACT_LABEL}>{t('mealForm.notesLabel')}</div>
        <textarea
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          placeholder={t('mealForm.notesPlaceholder')}
          rows={3}
          style={{
            ...COMPACT_FIELD,
            resize: 'none' as const,
            minHeight: 80,
          }}
        />
      </div>

      {/* The family's stars, one vote per person. A meal has to be saved
          before anyone can vote on it, so a new one has no button yet. */}
      {editingMeal && editingMeal !== 'new' && <MealRateButton meal={editingMeal} variant="wide" style={{ marginBottom: 24 }} />}

      <button
        type="button"
        onClick={() => setFormFavorite(!formFavorite)}
        className="press-scale"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          minHeight: 48,
          borderRadius: 12,
          border: formFavorite ? '1px solid color-mix(in srgb, var(--hs-danger) 30%, transparent)' : '1px solid var(--hs-border)',
          background: formFavorite ? 'color-mix(in srgb, var(--hs-danger) 8%, transparent)' : 'var(--hs-bg-panel)',
          cursor: 'pointer',
          color: 'inherit',
          transition: 'all 0.15s',
        }}
      >
        <Heart
          size={22}
          strokeWidth={2}
          fill={formFavorite ? 'currentColor' : 'none'}
          aria-hidden
          style={{ flex: 'none', color: formFavorite ? 'var(--hs-danger)' : 'var(--hs-text-faint)' }}
        />
        <span style={{ fontSize: 14, fontWeight: 600, color: formFavorite ? 'var(--hs-danger)' : 'var(--hs-text-faint)' }}>
          {formFavorite ? t('mealForm.favoriteOn') : t('mealForm.favoriteOff')}
        </span>
      </button>
    </FormOverlay>
    {managingIcons && <CustomIconsOverlay onBack={() => setManagingIcons(false)} />}
    </>
  );
}
