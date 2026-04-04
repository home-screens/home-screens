'use client';

import type { MealIngredient, GroceryCategory } from '@/types/config';
import type { MealFormState } from '../hooks/useMealForm';
import { TAG_OPTIONS, INPUT_STYLE, LABEL_STYLE } from './meals-shared';
import { FOOD_EMOJIS } from '@/components/modules/meal-planner/types';
import {
  GROCERY_CATEGORIES,
  GROCERY_CATEGORY_ORDER,
} from '@/lib/grocery-utils';
import FormOverlay from './FormOverlay';

interface MealFormOverlayProps {
  form: MealFormState;
  onSave: () => Promise<void>;
  onDelete: () => void;
  saving: boolean;
  saveError: string | null;
}

export default function MealFormOverlay({
  form,
  onSave,
  onDelete,
  saving,
  saveError,
}: MealFormOverlayProps) {
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

  const footer = (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid #1a1a1a',
      }}
    >
      {saveError && (
        <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 8, textAlign: 'center' }}>
          {saveError}
        </div>
      )}
      <button
        onClick={onSave}
        disabled={!formName.trim() || saving}
        style={{
          width: '100%',
          padding: '14px 24px',
          minHeight: 50,
          fontSize: 15,
          fontWeight: 700,
          borderRadius: 12,
          border: 'none',
          cursor: formName.trim() && !saving ? 'pointer' : 'default',
          background: formName.trim() && !saving ? '#f59e0b' : '#525252',
          color: formName.trim() && !saving ? '#000' : '#888',
          opacity: formName.trim() && !saving ? 1 : 0.5,
          transition: 'all 0.15s',
        }}
      >
        {saving ? 'Saving...' : editingMeal === 'new' ? 'Save Meal' : 'Save Changes'}
      </button>
      {editingMeal !== 'new' && (
        <button
          onClick={onDelete}
          style={{
            width: '100%',
            padding: '12px',
            minHeight: 44,
            marginTop: 8,
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 10,
            border: 'none',
            background: 'rgba(239,68,68,0.12)',
            color: '#ef4444',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Delete Meal
        </button>
      )}
    </div>
  );

  return (
    <FormOverlay
      title={editingMeal === 'new' ? 'Add Meal' : 'Edit Meal'}
      onBack={() => setEditingMeal(null)}
      footer={footer}
    >
      {/* Name */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Meal Name</div>
        <input
          ref={nameInputRef}
          type="text"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g. Chicken Stir Fry"
          style={INPUT_STYLE}
          autoFocus
        />
      </div>

      {/* Emoji picker */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Emoji</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
          {FOOD_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => setFormEmoji(emoji)}
              aria-label={`Select ${emoji}`}
              aria-pressed={formEmoji === emoji}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 8,
                border: formEmoji === emoji ? '2px solid #f59e0b' : '2px solid transparent',
                background: formEmoji === emoji ? 'rgba(245,158,11,0.12)' : '#1a1a1a',
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

      {/* Prep time + Cook time */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div>
          <div style={LABEL_STYLE}>Prep Time</div>
          <input
            type="number"
            value={formPrepTime}
            onChange={(e) => setFormPrepTime(e.target.value ? Number(e.target.value) : '')}
            placeholder="min"
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <div style={LABEL_STYLE}>Cook Time</div>
          <input
            type="number"
            value={formCookTime}
            onChange={(e) => setFormCookTime(e.target.value ? Number(e.target.value) : '')}
            placeholder="min"
            style={INPUT_STYLE}
          />
        </div>
      </div>

      {/* Servings + Difficulty */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div>
          <div style={LABEL_STYLE}>Servings</div>
          <input
            type="number"
            value={formServings}
            onChange={(e) => setFormServings(e.target.value ? Number(e.target.value) : '')}
            placeholder="4"
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <div style={LABEL_STYLE}>Difficulty</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['easy', 'medium', 'hard'] as const).map((d) => {
              const diffColors: Record<typeof d, { color: string; bg: string; border: string }> = {
                easy:   { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: '#10b981' },
                medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: '#f59e0b' },
                hard:   { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: '#ef4444' },
              };
              const isSelected = formDifficulty === d;
              return (
                <button
                  key={d}
                  onClick={() => setFormDifficulty(d)}
                  style={{
                    flex: 1,
                    padding: '12px 4px',
                    minHeight: 48,
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 12,
                    border: isSelected ? `1px solid ${diffColors[d].border}` : '1px solid #2a2a2a',
                    background: isSelected ? diffColors[d].bg : '#1a1a1a',
                    color: isSelected ? diffColors[d].color : '#525252',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {d === 'easy' ? 'Easy' : d === 'medium' ? 'Med' : 'Hard'}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tags */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TAG_OPTIONS.map((tag) => {
            const isActive = formTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => {
                  setFormTags((prev) =>
                    isActive ? prev.filter((t) => t !== tag) : [...prev, tag],
                  );
                }}
                style={{
                  padding: '6px 14px',
                  minHeight: 36,
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: isActive ? '1px solid #f59e0b' : '1px solid #2a2a2a',
                  background: isActive ? 'rgba(245,158,11,0.15)' : '#1a1a1a',
                  color: isActive ? '#f59e0b' : '#525252',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ingredients */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Ingredients</div>
        {formIngredients.map((ing: MealIngredient, idx: number) => (
          <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              type="text"
              placeholder="Name"
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
              placeholder="Amount"
              value={ing.amount ?? ''}
              onChange={(e) => {
                const next = [...formIngredients];
                next[idx] = { ...next[idx], amount: e.target.value };
                setFormIngredients(next);
              }}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            <select
              value={ing.category ?? 'other'}
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
                  {GROCERY_CATEGORIES[cat]}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setFormIngredients((prev) => prev.filter((_, i) => i !== idx));
              }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: '1px solid #2a2a2a',
                background: 'transparent',
                color: '#ef4444',
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
          onClick={() => setFormIngredients((prev) => [...prev, { name: '', amount: '', category: 'other' }])}
          style={{
            width: '100%',
            padding: '12px',
            minHeight: 48,
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 12,
            border: '2px dashed #2a2a2a',
            background: 'transparent',
            color: '#525252',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          + Add ingredient
        </button>
      </div>

      {/* Recipe URL */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Recipe URL</div>
        <input
          type="url"
          value={formRecipeUrl}
          onChange={(e) => setFormRecipeUrl(e.target.value)}
          placeholder="https://..."
          style={INPUT_STYLE}
        />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Notes</div>
        <textarea
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          placeholder="Any notes about this meal..."
          rows={3}
          style={{
            ...INPUT_STYLE,
            resize: 'none' as const,
            minHeight: 80,
          }}
        />
      </div>

      {/* Rating */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Rating</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setFormRating(formRating === star ? 0 : star)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: 'none',
                background: star <= formRating ? 'rgba(245,158,11,0.2)' : '#1a1a1a',
                color: star <= formRating ? '#f59e0b' : '#333',
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

      {/* Favorite */}
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
          border: formFavorite ? '1px solid rgba(239,68,68,0.3)' : '1px solid #2a2a2a',
          background: formFavorite ? 'rgba(239,68,68,0.08)' : '#1a1a1a',
          cursor: 'pointer',
          color: 'inherit',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 22, color: formFavorite ? '#ef4444' : '#333' }}>
          {formFavorite ? '\u2665' : '\u2661'}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: formFavorite ? '#ef4444' : '#525252' }}>
          {formFavorite ? 'Favorited' : 'Add to Favorites'}
        </span>
      </button>
    </FormOverlay>
  );
}
