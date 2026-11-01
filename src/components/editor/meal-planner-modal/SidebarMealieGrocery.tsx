'use client';

import { useCallback, useState } from 'react';
import { ChevronRight, ExternalLink, ShoppingCart } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import { shortNameList } from '@/lib/grocery-utils';
import {
  mealieShoppingAddedWords,
  mealieShoppingErrorWords,
  mealieShoppingNoticeWords,
  mealieShoppingStaleKey,
  type MealieShoppingFailure,
  type ShoppingItem,
} from '@/lib/shopping-list';
import { useMealieLink } from '@/components/meals/useMealieLink';
import { useMealieShoppingList } from '@/components/meals/useMealieShoppingList';
import { useShoppingAddBox } from '@/components/meals/useShoppingAddBox';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useLocale, useTranslate } from '@/i18n';
import { mealSaveFailedKey } from './save-failed-words';
import { mealieProblemKey } from './mealie-problem-words';

const linkButton =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-hs-border-strong bg-hs-card text-hs-text-body hover:bg-hs-hover transition-colors whitespace-nowrap';
const primaryButton =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md bg-amber-500 text-black hover:bg-amber-400 transition-colors whitespace-nowrap';
const lineButton = 'ml-auto shrink-0 px-2 font-semibold text-hs-warning hover:underline';

/**
 * The Grocery tab while the plan lives in Mealie: the family's Mealie
 * shopping list, the same one the phone shows, tickable, with a box to add
 * to it. The list menu picks which list the family shops from, for the phone
 * and the voice answer too.
 */
export function MealieGrocery({
  planBaseUrl,
  formatTime,
  onError,
}: {
  /** Mealie's address from the plan, for Open Mealie before the list has answered. */
  planBaseUrl: string | undefined;
  /** A time Mealie answered (ms since epoch) as the household reads clock times. */
  formatTime: (at: number) => string;
  /** Shows a write Mealie did not take. */
  onError: (message: string) => void;
}) {
  const t = useTranslate('editor');
  const locale = useLocale();
  const mealieLink = useMealieLink();
  const handleError = useCallback((failure: MealieShoppingFailure) => {
    const words = mealieShoppingErrorWords(failure);
    if (!words) return;
    if (words.key === 'saveFailed') {
      onError(t(mealSaveFailedKey({ problem: words.reason }, false)));
      return;
    }
    const items = failure.items ?? [];
    onError(t(`mealPlannerModal.mealie.grocery.${words.key}`, {
      items: shortNameList(items, locale, (count) => t('mealPlannerModal.mealie.grocery.moreItems', { count })),
      count: items.length,
    }));
  }, [onError, t, locale]);
  const shopping = useMealieShoppingList(editorFetch, { onError: handleError, planBaseUrl });
  const { draft, setDraft, canAdd, submit } = useShoppingAddBox(shopping);
  const [cartOpen, setCartOpen] = useState(false);

  const list = shopping.list;
  const busy = shopping.choosing !== null;
  const href = shopping.mealieUrl ? mealieLink(shopping.mealieUrl) : null;

  if (shopping.state === 'loading') {
    return <p data-testid="mealie-grocery" className="flex-1 p-8 text-center text-sm text-hs-text-faint">{t('mealPlannerModal.mealie.grocery.loading')}</p>;
  }

  if (shopping.state === 'failed' || !list) {
    const failed = shopping.state === 'failed';
    const connection = shopping.problem === 'connection';
    const words = mealieProblemKey(shopping.problem === 'connection' ? null : shopping.problem);
    return (
      <div data-testid="mealie-grocery" data-state={failed ? 'failed' : 'no-lists'} className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
        <span className="w-11 h-11 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
          <ShoppingCart className="w-5 h-5" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-hs-text-body">
          {!failed
            ? t('mealPlannerModal.mealie.grocery.noListsTitle')
            : connection ? t('mealPlannerModal.mealie.grocery.connectionTitle') : t(`${words}Title`)}
        </p>
        <p className="text-xs text-hs-text-faint leading-relaxed max-w-[280px]">
          {!failed
            ? t('mealPlannerModal.mealie.grocery.noListsBody')
            : connection
              ? t('mealPlannerModal.mealie.grocery.connectionBody')
              : t(shopping.problem === 'unreachable' ? 'mealPlannerModal.mealie.grocery.unreachableBody' : `${words}Body`)}
        </p>
        <div className="flex gap-2">
          {failed && (
            <button type="button" onClick={() => void shopping.retry()} className={primaryButton}>
              {t('mealPlannerModal.mealie.tryAgain')}
            </button>
          )}
          {href && !connection && (
            <a href={href} target="_blank" rel="noopener noreferrer" className={failed ? linkButton : primaryButton}>
              {t('mealPlannerModal.mealie.openMealie')}
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>
    );
  }

  const { total, got } = shopping.counts;
  const { groups, folded } = shopping.view;
  const headings = groups.length > 1;
  const listFormatRecipes = new Intl.ListFormat(locale, { type: 'conjunction' });
  const added = shopping.justAdded;
  const notice = shopping.notice;
  const lineWords = ({ key, vars }: { key: string; vars: Record<string, string> }) => t(`mealPlannerModal.mealie.grocery.${key}`, vars);

  const itemRow = (item: ShoppingItem) => {
    const detail = [
      item.note,
      item.recipes.length ? t('mealPlannerModal.mealie.grocery.forRecipes', { recipes: listFormatRecipes.format(item.recipes) }) : '',
    ].filter(Boolean).join(' · ');
    const waiting = shopping.pending.has(item.id);
    return (
      <button
        key={item.id}
        type="button"
        data-testid="mealie-grocery-item"
        data-checked={item.checked ? 'true' : 'false'}
        role="checkbox"
        aria-checked={item.checked}
        aria-busy={waiting || undefined}
        onClick={() => shopping.toggle(item)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md border border-hs-border bg-hs-panel hover:bg-hs-card cursor-pointer transition mb-0.5 text-left ${item.checked ? 'opacity-40' : ''}`}
      >
        <span
          aria-hidden
          className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center text-[10px] shrink-0 transition ${
            item.checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-hs-border-strong'
          } ${waiting ? 'border-dashed opacity-50' : ''}`}
        >
          {item.checked && '✓'}
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-sm font-medium break-words ${item.checked ? 'line-through text-hs-text-faint' : 'text-hs-text-secondary'}`}>
            {item.text}
          </span>
          {detail && <span className="block text-[11px] text-hs-text-faint truncate">{detail}</span>}
        </span>
      </button>
    );
  };

  return (
    <div data-testid="mealie-grocery" data-state="ready" className="flex-1 overflow-y-auto">
      <div className="p-4">
        {shopping.lists.length > 1 ? (
          <label className="relative block">
            <span className="sr-only">{t('mealPlannerModal.mealie.grocery.list')}</span>
            <select
              data-testid="mealie-grocery-lists"
              className={`appearance-none ${MODAL_INPUT_CLASS} pr-7 cursor-pointer`}
              value={shopping.choosing ?? list.id}
              disabled={busy}
              onChange={(e) => shopping.choose(e.target.value)}
            >
              {shopping.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {t('mealPlannerModal.mealie.grocery.listOption', { list: l.name, count: l.left })}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hs-text-faint" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 6l4 4 4-4" />
            </svg>
          </label>
        ) : (
          <p className="truncate text-sm font-semibold text-hs-text-secondary">{list.name}</p>
        )}

        <div role="status" data-testid="mealie-grocery-notice" className={`flex items-center text-xs text-hs-text-muted ${notice ? 'min-h-7 mt-1' : 'min-h-2'}`}>
          {notice && (
            <>
              <span className="min-w-0">{lineWords(mealieShoppingNoticeWords(notice))}</span>
              {notice.kind === 'picked' && (
                <button type="button" onClick={notice.undo} className={lineButton}>{t('mealPlannerModal.mealie.grocery.undo')}</button>
              )}
            </>
          )}
        </div>

        {/* While a pick is on its way the list below is still the old one: nothing in it takes a click. */}
        <div aria-busy={busy || undefined} className={busy ? 'opacity-45 pointer-events-none transition-opacity' : 'transition-opacity'}>
          <form onSubmit={submit} className="flex gap-1.5 mt-1" data-testid="mealie-grocery-add">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('mealPlannerModal.mealie.grocery.addPlaceholder', { list: list.name })}
              aria-label={t('mealPlannerModal.mealie.grocery.addPlaceholder', { list: list.name })}
              maxLength={200}
              disabled={busy}
              className={`flex-1 ${MODAL_INPUT_CLASS}`}
            />
            <button type="submit" disabled={!canAdd} className={`${linkButton} disabled:opacity-50 disabled:cursor-default`}>
              {t('mealPlannerModal.mealie.grocery.add')}
            </button>
          </form>
          <div role="status" data-testid="mealie-grocery-added" className="flex items-center min-h-5 mt-1 mb-2 text-[11px] text-emerald-500">
            {added && (
              <>
                <span className="min-w-0 truncate">{lineWords(mealieShoppingAddedWords(added))}</span>
                {added.undo && <button type="button" onClick={added.undo} className={lineButton}>{t('mealPlannerModal.mealie.grocery.undo')}</button>}
              </>
            )}
          </div>

          {total === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-12 text-center">
              <p className="text-sm font-semibold text-hs-text-body">{t('mealPlannerModal.mealie.grocery.emptyTitle', { list: list.name })}</p>
              <p className="text-xs text-hs-text-faint max-w-[280px] leading-relaxed">{t('mealPlannerModal.mealie.grocery.emptyBody')}</p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  {/* What is left, like the list menu and the wall; the bar fills as things are checked off. */}
                  <span className="text-sm font-semibold text-hs-text-secondary" data-testid="mealie-grocery-count">
                    {total - got > 0 ? t('mealPlannerModal.mealie.grocery.toGet', { count: total - got }) : t('mealPlannerModal.mealie.grocery.allGot')}
                  </span>
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('mealPlannerModal.mealie.grocery.openListAria', { list: list.name })}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-hs-text-muted hover:text-hs-text-body whitespace-nowrap"
                    >
                      {t('mealPlannerModal.mealie.grocery.openList')}
                      <ExternalLink className="w-3 h-3" aria-hidden />
                    </a>
                  )}
                </div>
                <div className="h-1 bg-hs-card rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${(got / total) * 100}%` }} />
                </div>
                {shopping.stale && (
                  <p role="status" data-testid="mealie-grocery-stale" className="mt-2 text-xs text-hs-warning">
                    {shopping.fetchedAt
                      ? t(`mealPlannerModal.mealie.grocery.${mealieShoppingStaleKey(shopping.problem)}`, { time: formatTime(shopping.fetchedAt) })
                      : t(shopping.problem === 'connection' ? 'mealPlannerModal.mealie.grocery.connectionTitle' : `${mealieProblemKey(shopping.problem)}Title`)}
                  </p>
                )}
              </div>

              {groups.map((group) => (
                <div key={group.label ?? ''} className="mb-5">
                  {headings && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span role="heading" aria-level={3} className="text-[10px] font-bold uppercase tracking-wider text-hs-text-faint">
                        {group.label ?? t('mealPlannerModal.mealie.grocery.noLabel')}
                      </span>
                      {/* What is left in this group, like the count above. */}
                      <span
                        aria-label={t('mealPlannerModal.mealie.grocery.toGet', { count: group.left })}
                        className="ml-auto text-[10px] px-1.5 rounded bg-hs-card text-hs-text-faint"
                      >
                        {group.left}
                      </span>
                    </div>
                  )}
                  {group.items.map(itemRow)}
                </div>
              ))}

              {folded.length > 0 && (
                <>
                  <button
                    type="button"
                    data-testid="mealie-grocery-cart"
                    aria-expanded={cartOpen}
                    onClick={() => setCartOpen((open) => !open)}
                    className="w-full flex items-center gap-2 px-3 py-2 mb-1.5 rounded-md border border-dashed border-hs-border-strong text-sm font-semibold text-hs-text-muted hover:bg-hs-card cursor-pointer"
                  >
                    {t('mealPlannerModal.mealie.grocery.inCart', { count: folded.length })}
                    <ChevronRight aria-hidden className={`ml-auto w-4 h-4 text-hs-text-faint transition-transform ${cartOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {cartOpen && folded.map(itemRow)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
