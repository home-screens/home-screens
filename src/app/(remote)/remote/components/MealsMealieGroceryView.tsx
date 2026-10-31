'use client';

import { ExternalLink, ShoppingCart } from 'lucide-react';
import { mealieShoppingListsUrl } from '@/lib/meal-sources';
import { useTranslate } from '@/i18n';
import { CenterMessage } from './MealieRecipeParts';
import { openOutside } from './meals-shared';

/**
 * The Grocery tab while the plan lives in Mealie: the family's list lives
 * there too, so this points to it. Mealie's list is not tied to a week, so
 * the tab shows no week arrows.
 */
export default function MealsMealieGroceryView({ baseUrl }: { baseUrl: string | undefined }) {
  const t = useTranslate('remote');
  return (
    <div data-testid="mealie-grocery" style={{ paddingBottom: 80 }}>
      <CenterMessage
        icon={<ShoppingCart size={24} strokeWidth={2} />}
        title={t('mealie.grocery.title')}
        description={t('mealie.grocery.description')}
        padding="56px 16px 48px"
      >
        {baseUrl && (
          <button
            type="button"
            className="press-btn"
            onClick={() => openOutside(mealieShoppingListsUrl(baseUrl))}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 24px',
              minHeight: 44, borderRadius: 10, border: 'none', background: '#f59e0b', color: '#000',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('mealie.openMealie')}
            <ExternalLink size={15} strokeWidth={2} aria-hidden />
          </button>
        )}
      </CenterMessage>
    </div>
  );
}
