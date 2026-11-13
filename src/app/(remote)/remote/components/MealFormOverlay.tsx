'use client';

import { FamilyMealRatingButton } from '@/components/meals/FamilyMealRating';

import { useState } from 'react';
import type { MealIngredient, GroceryCategory } from '@/types/config';
import { COURSE_KINDS } from '@/lib/meal-courses';
import type { MealFormState } from '../hooks/useMealForm';
import { INPUT_STYLE, LABEL_STYLE } from './meals-shared';
import { MEAL_TAGS, FOOD_EMOJIS, normalizeTag, DIFFICULTY_COLORS } from '@/lib/meal-constants';
import { GROCERY_CATEGORY_ORDER, groceryAisle } from '@/lib/grocery-utils';
import { emojiGridWithChosen } from '@/lib/icon-value';
import { useTranslate } from '@/i18n';
import FormOverlay from './FormOverlay';
import SaveDeleteFooter from './SaveDeleteFooter';
import { useFormDirty } from '@/hooks/useFormDirty';
import PhoneCustomIconSection, { PHONE_SUBHEAD_STYLE } from '@/components/custom-icons/PhoneCustomIconSection';
import CustomIconsOverlay from './CustomIconsOverlay';
import { withAlpha } from '@/lib/hex-color';
import { REMOTE_ACCENT, selectedPillStyle } from './chore-form-styles';

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
    formRating,
    setFormRating,
    formFavorite,
    setFormFavorite,
    nameInputRef,
  } = form;
  const dirty = useFormDirty([
    formName, formEmoji, formPrepTime, formCookTime, formServings, formDifficulty, formCategory,
    formTags, formIngredients, formRecipeUrl, formNotes, formRating, formFavorite,
  ]);

  const saveLabel = saving
    ? t('mealForm.savingSubmit')
    : editingMeal === 'new'
      ? t('mealForm.saveSubmit')
      : t('mealForm.saveChangesSubmit');

  const footer = (
    <SaveDeleteFooter
      saveLabel={saveLabel}
      canSave={Boolean(formName.trim()) && !saving}
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
        <div style={LABEL_STYLE}>{t('mealForm.nameLabel')}</div>
        <input
          ref={nameInputRef}
          type="text"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder={t('mealForm.namePlaceholder')}
          style={INPUT_STYLE}
          autoFocus
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ ...LABEL_STYLE, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span>{tCore('actions.icon')}</span>
          <button
            type="button"
            onClick={() => setManagingIcons(true)}
            style={{ background: 'none', border: 'none', padding: '12px 0 12px 16px', margin: '-12px 0', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--hs-accent-hover)' }}
          >
            {tCore('customIcons.manage')}
          </button>
        </div>
        <PhoneCustomIconSection value={formEmoji} onPick={setFormEmoji} suggestedName={formName} />
        <div style={{ ...PHONE_SUBHEAD_STYLE, marginTop: 12 }}>{tCore('customIcons.everydayEmoji')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
          {emojiGridWithChosen(FOOD_EMOJIS, formEmoji).map((emoji) => (
            <button
              key={emoji}
              onClick={() => setFormEmoji(emoji)}
              aria-label={t('mealForm.emojiSelectAriaLabel', { emoji })}
              aria-pressed={formEmoji === emoji}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 8,
                border: formEmoji === emoji ? `2px solid ${REMOTE_ACCENT}` : '2px solid transparent',
                background: formEmoji === emoji ? withAlpha(REMOTE_ACCENT, 0.12) : 'var(--hs-bg-panel)',
                cursor: 'pointer',
                fontSize: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div>
          <div style={LABEL_STYLE}>{t('mealForm.prepTimeLabel')}</div>
          <input
            type="number"
            value={formPrepTime}
            onChange={(e) => setFormPrepTime(e.target.value ? Number(e.target.value) : '')}
            placeholder={t('mealForm.minPlaceholder')}
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <div style={LABEL_STYLE}>{t('mealForm.cookTimeLabel')}</div>
          <input
            type="number"
            value={formCookTime}
            onChange={(e) => setFormCookTime(e.target.value ? Number(e.target.value) : '')}
            placeholder={t('mealForm.minPlaceholder')}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div>
          <div style={LABEL_STYLE}>{t('mealForm.servingsLabel')}</div>
          <input
            type="number"
            value={formServings}
            onChange={(e) => setFormServings(e.target.value ? Number(e.target.value) : '')}
            placeholder={t('mealForm.servingsPlaceholder')}
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <div style={LABEL_STYLE}>{t('mealForm.difficultyLabel')}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['easy', 'medium', 'hard'] as const).map((d) => {
              const hex = DIFFICULTY_COLORS[d];
              const isSelected = formDifficulty === d;
              return (
                <button
                  key={d}
                  aria-pressed={isSelected}
                  onClick={() => setFormDifficulty(isSelected ? undefined : d)}
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
        <div style={LABEL_STYLE}>{t('mealForm.kindLabel')}</div>
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
        <div style={LABEL_STYLE}>{t('mealForm.tagsLabel')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MEAL_TAGS.map((tag) => {
            const isActive = formTags.some((tt) => normalizeTag(tt) === tag);
            return (
              <button
                key={tag}
                onClick={() => {
                  setFormTags((prev) =>
                    isActive ? prev.filter((tt) => normalizeTag(tt) !== tag) : [...prev, tag],
                  );
                }}
                style={{
                  padding: '6px 14px',
                  minHeight: 36,
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 999,
                  ...selectedPillStyle(isActive),
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tCore(`meal.tags.${tag}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>{t('mealForm.ingredientsLabel')}</div>
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
              style={{ ...INPUT_STYLE, flex: 2 }}
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
              style={{ ...INPUT_STYLE, flex: 1 }}
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
                ...INPUT_STYLE,
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
              onClick={() => {
                setFormIngredients((prev) => prev.filter((_, i) => i !== idx));
              }}
              aria-label={t('mealForm.removeIngredientAriaLabel')}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: '1px solid var(--hs-border)',
                background: 'transparent',
                color: 'var(--hs-danger)',
                fontSize: 18,
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              &#215;
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            setAddedRow(formIngredients.length);
            setFormIngredients((prev) => [...prev, { name: '', amount: '' }]);
          }}
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
          }}
        >
          {t('mealForm.addIngredientButton')}
        </button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>{t('mealForm.recipeUrlLabel')}</div>
        <input
          type="url"
          value={formRecipeUrl}
          onChange={(e) => setFormRecipeUrl(e.target.value)}
          placeholder={t('mealForm.recipeUrlPlaceholder')}
          style={INPUT_STYLE}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>{t('mealForm.notesLabel')}</div>
        <textarea
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          placeholder={t('mealForm.notesPlaceholder')}
          rows={3}
          style={{
            ...INPUT_STYLE,
            resize: 'none' as const,
            minHeight: 80,
          }}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        {editingMeal && editingMeal !== 'new' && <FamilyMealRatingButton meal={editingMeal} />}
        <div style={LABEL_STYLE}>{tCore('mealRatings.originalLabel')}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setFormRating(formRating === star ? 0 : star)}
              aria-label={t('mealForm.ratingStarAriaLabel', { n: star })}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: 'none',
                background: star <= formRating ? withAlpha(REMOTE_ACCENT, 0.2) : 'var(--hs-bg-panel)',
                color: star <= formRating ? REMOTE_ACCENT : 'var(--hs-border-strong)',
                fontSize: 22,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              &#9733;
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => setFormFavorite(!formFavorite)}
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
        <span style={{ fontSize: 22, color: formFavorite ? 'var(--hs-danger)' : 'var(--hs-border-strong)' }}>
          {formFavorite ? '♥' : '♡'}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: formFavorite ? 'var(--hs-danger)' : 'var(--hs-text-faint)' }}>
          {formFavorite ? t('mealForm.favoriteOn') : t('mealForm.favoriteOff')}
        </span>
      </button>
    </FormOverlay>
    {managingIcons && <CustomIconsOverlay onBack={() => setManagingIcons(false)} />}
    </>
  );
}
