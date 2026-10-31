'use client';

import { useCallback, useState, type CSSProperties, type FormEvent } from 'react';
import { ChevronRight, ExternalLink, Plus, ShoppingCart } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import { HubUnreachableError, MealClientError } from '@/lib/meal-client';
import { mealieShoppingListUrl, mealieShoppingListsUrl } from '@/lib/meal-sources';
import { shoppingShareText, type ShoppingItem } from '@/lib/shopping-list';
import { useLocale, useTranslate } from '@/i18n';
import { useMealieLink } from '@/components/meals/useMealieLink';
import {
  useMealieShoppingList,
  type MealieShoppingAction,
  type MealieShoppingProblem,
} from '@/components/meals/useMealieShoppingList';
import { CenterMessage } from './MealieRecipeParts';
import { mealieProblemWords, RetryButton, useCopyTime } from './MealsMealieStatus';
import { openOutside } from './meals-shared';
import { shareOrCopyText } from './share-text';

/** The warning colour of the theme in use: amber in the dark theme, a darker amber that reads on the light one. */
const WARN = 'var(--hs-warning)';
const AMBER = '#f59e0b';

/** The key (under `remote`) for "not saved" and "out of date" lines, by why. */
const REASON: Record<MealieShoppingProblem, string> = {
  unreachable: 'Unreachable',
  token: 'Token',
  'not-connected': 'NotConnected',
  connection: 'Connection',
};

/** A text button inside a status line (Undo). */
const lineButton: CSSProperties = {
  flex: 'none', minHeight: 44, padding: '0 12px', marginLeft: 'auto', border: 'none', background: 'none',
  color: WARN, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
};

/**
 * The Grocery tab while the plan lives in Mealie: the family's Mealie
 * shopping list, grouped by the labels they set up there, tickable, with a
 * box to add to it. Ticks and new items land in Mealie. A Mealie list is not
 * tied to a week, so the tab shows no week arrows.
 */
export default function MealsMealieGroceryView({
  baseUrl: planBaseUrl,
  todayISO,
  onError,
}: {
  /** Mealie's address from the plan, for Open Mealie before the list has answered. */
  baseUrl: string | undefined;
  todayISO: string;
  /** Shows a write Mealie did not take. */
  onError: (message: string) => void;
}) {
  const t = useTranslate('remote');
  const locale = useLocale();
  const mealieLink = useMealieLink();
  const listFormat = useCallback((names: string[]) => {
    const shown = names.length > 3 ? [...names.slice(0, 3), t('mealie.grocery.moreItems', { count: names.length - 3 })] : names;
    return new Intl.ListFormat(locale, { type: 'conjunction' }).format(shown);
  }, [locale, t]);
  const handleError = useCallback((err: unknown, action: MealieShoppingAction, items?: string[]) => {
    if (err instanceof MealClientError && err.kind === 'conflict') {
      if (action !== 'tick') onError(t('mealie.grocery.listGone'));
      return;
    }
    const reason = REASON[err instanceof HubUnreachableError ? 'connection' : (err instanceof MealClientError && err.problem) || 'unreachable'];
    if (items?.length) onError(t(`mealie.grocery.notSaved${reason}`, { items: listFormat(items), count: items.length }));
    else onError(t(reason === 'Connection' ? 'mealie.grocery.noConnection' : `mealie.saveFailed.${{ Unreachable: 'unreachable', Token: 'token', NotConnected: 'notConnected' }[reason]}`));
  }, [onError, t, listFormat]);
  const shopping = useMealieShoppingList(editorFetch, { onError: handleError });
  const copyTime = useCopyTime(shopping.stale ? shopping.fetchedAt : null, todayISO);
  const [draft, setDraft] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [shared, setShared] = useState(false);

  const baseUrl = shopping.baseUrl ?? planBaseUrl;
  const list = shopping.list;
  const busy = shopping.choosing !== null;
  const openMealie = () => {
    if (baseUrl) openOutside(mealieLink(list ? mealieShoppingListUrl(baseUrl, list.id) : mealieShoppingListsUrl(baseUrl)));
  };
  const labelFor = (label: string | null) => label ?? t('mealie.grocery.noLabel');
  const forRecipes = (recipes: string[]) => t('mealie.grocery.forRecipes', {
    recipes: new Intl.ListFormat(locale, { type: 'conjunction' }).format(recipes),
  });

  // The box empties as the words are sent, so whatever is typed next is kept;
  // words Mealie did not take come back only into an empty box.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const words = draft;
    if (!words.trim() || shopping.adding || busy) return;
    setDraft('');
    if (!(await shopping.add(words))) setDraft((current) => (current.trim() ? current : words));
  };

  const share = async () => {
    if (!list) return;
    const outcome = await shareOrCopyText(shoppingShareText(list, {
      heading: list.name,
      complete: t('mealsGrocery.shareCompleteMessage'),
      labelFor,
    }));
    if (outcome !== 'copied') return;
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const openButton = (primary: boolean) => baseUrl ? (
    <button
      type="button"
      className="press-btn"
      onClick={openMealie}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 24px',
        minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        ...(primary
          ? { border: 'none', background: AMBER, color: '#000' }
          : { border: '1px solid var(--hs-border)', background: 'var(--hs-bg-panel)', color: 'var(--hs-text-body)' }),
      }}
    >
      {t('mealie.openMealie')}
      <ExternalLink size={15} strokeWidth={2} aria-hidden />
    </button>
  ) : null;

  if (shopping.state === 'loading') {
    return (
      <div data-testid="mealie-grocery" style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--hs-text-faint)' }}>
        {t('mealie.grocery.loading')}
      </div>
    );
  }

  if (shopping.state === 'failed') {
    const connection = shopping.problem === 'connection';
    const words = mealieProblemWords(shopping.problem === 'connection' ? null : shopping.problem);
    return (
      <div data-testid="mealie-grocery" data-state="failed" style={{ paddingBottom: 80 }}>
        <CenterMessage
          icon={<ShoppingCart size={24} strokeWidth={2} />}
          title={connection ? t('mealie.grocery.connectionTitle') : t(`${words}.title`)}
          description={connection
            ? t('mealie.grocery.connectionDescription')
            : t(shopping.problem === 'unreachable' ? 'mealie.grocery.unreachableDescription' : `${words}.description`)}
          padding="56px 16px 48px"
        >
          {/* Trying again is what anyone can do; Open Mealie asks a grown-up to sign in. */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <RetryButton onRetry={shopping.retry} style={{ padding: '0 18px', background: AMBER, color: '#000' }} />
            {!connection && openButton(false)}
          </div>
        </CenterMessage>
      </div>
    );
  }

  if (!list) {
    return (
      <div data-testid="mealie-grocery" data-state="no-lists" style={{ paddingBottom: 80 }}>
        <CenterMessage
          icon={<ShoppingCart size={24} strokeWidth={2} />}
          title={t('mealie.grocery.noListsTitle')}
          description={t('mealie.grocery.noListsDescription')}
          padding="56px 16px 48px"
        >
          {openButton(true)}
        </CenterMessage>
      </div>
    );
  }

  const { total, got } = shopping.counts;
  const { groups, folded } = shopping.view;
  const headings = groups.length > 1;
  const added = shopping.justAdded;
  const notice = shopping.notice;
  const reason = shopping.problem ? REASON[shopping.problem] : 'Unreachable';

  const itemRow = (item: ShoppingItem) => {
    const detail = [item.note, item.recipes.length ? forRecipes(item.recipes) : ''].filter(Boolean).join(' · ');
    const waiting = shopping.pending.has(item.id);
    return (
      <button
        key={item.id}
        type="button"
        data-testid="mealie-grocery-item"
        data-checked={item.checked ? 'true' : 'false'}
        aria-pressed={item.checked}
        aria-busy={waiting || undefined}
        onClick={() => shopping.toggle(item)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', minHeight: 44,
          marginBottom: 4, borderRadius: 10, border: '1px solid var(--hs-border)', background: 'var(--hs-bg-panel)',
          cursor: 'pointer', opacity: item.checked ? 0.45 : 1, transition: 'opacity 0.15s', textAlign: 'left',
          color: 'inherit', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: item.checked ? 'var(--hs-success)' : 'transparent',
            border: item.checked ? 'none' : `2px ${waiting ? 'dashed' : 'solid'} var(--hs-text-faint)`,
            // Still on its way to Mealie: not shown as done yet.
            opacity: waiting ? 0.5 : 1,
          }}
        >
          {item.checked && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>&#10003;</span>}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block', fontSize: 14, fontWeight: 500, lineHeight: 1.3,
              color: item.checked ? 'var(--hs-text-faint)' : 'var(--hs-text-body)',
              textDecoration: item.checked ? 'line-through' : 'none', overflowWrap: 'anywhere',
            }}
          >
            {item.text}
          </span>
          {detail && (
            <span style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {detail}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div data-testid="mealie-grocery" data-state="ready" style={{ paddingBottom: 80 }}>
      {shopping.lists.length > 1 && (
        <div
          role="group"
          aria-label={t('mealie.grocery.lists')}
          data-testid="mealie-grocery-lists"
          style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px 8px', padding: '0 16px', scrollbarWidth: 'none' }}
        >
          {shopping.lists.map((l) => {
            const on = (shopping.choosing ?? list.id) === l.id;
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                aria-label={t('mealie.grocery.listLeft', { list: l.name, count: l.left })}
                onClick={() => shopping.choose(l.id)}
                style={{
                  flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '0 14px',
                  borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${on ? `color-mix(in srgb, ${WARN} 55%, transparent)` : 'var(--hs-border)'}`,
                  background: on ? `color-mix(in srgb, ${WARN} 12%, transparent)` : 'var(--hs-bg-panel)',
                  color: on ? WARN : 'var(--hs-text-muted)',
                }}
              >
                {l.name}
                <span
                  aria-hidden
                  style={{
                    fontSize: 11, padding: '1px 7px', borderRadius: 99,
                    background: on ? `color-mix(in srgb, ${WARN} 18%, transparent)` : 'var(--hs-bg-card)',
                    color: on ? WARN : 'var(--hs-text-faint)',
                  }}
                >
                  {l.left}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div role="status" data-testid="mealie-grocery-notice" style={{ display: 'flex', alignItems: 'center', minHeight: notice ? 44 : 4, fontSize: 13, color: 'var(--hs-text-muted)' }}>
        {notice && (
          <>
            <span style={{ minWidth: 0 }}>
              {notice.kind === 'picked'
                ? t('mealie.grocery.picked', { list: notice.list })
                : notice.kind === 'moved'
                  ? t('mealie.grocery.moved', { list: notice.list })
                  : t('mealie.grocery.gone', { from: notice.from, list: notice.list })}
            </span>
            {notice.kind === 'picked' && (
              <button type="button" onClick={notice.undo} style={lineButton}>{t('mealie.grocery.undo')}</button>
            )}
          </>
        )}
      </div>

      {/* While a pick is on its way the list below is still the old one: nothing in it takes a tap. */}
      <div aria-busy={busy || undefined} style={{ opacity: busy ? 0.45 : 1, pointerEvents: busy ? 'none' : undefined, transition: 'opacity 0.15s' }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8 }} data-testid="mealie-grocery-add">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('mealie.grocery.addPlaceholder', { list: list.name })}
            aria-label={t('mealie.grocery.addPlaceholder', { list: list.name })}
            maxLength={200}
            enterKeyHint="done"
            disabled={busy}
            style={{
              flex: 1, minWidth: 0, height: 44, borderRadius: 10, border: '1px solid var(--hs-border)',
              background: 'var(--hs-bg-input)', color: 'var(--hs-text-body)', fontSize: 16, padding: '0 12px',
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button
            type="submit"
            className="press-btn"
            disabled={!draft.trim() || shopping.adding || busy}
            aria-label={t('mealie.grocery.addButton')}
            style={{
              width: 44, height: 44, flex: 'none', borderRadius: 10, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: draft.trim() ? AMBER : 'var(--hs-bg-card)', color: draft.trim() ? '#000' : 'var(--hs-text-faint)',
              cursor: draft.trim() && !shopping.adding ? 'pointer' : 'default', opacity: shopping.adding ? 0.6 : 1,
            }}
          >
            <Plus size={20} strokeWidth={2.4} aria-hidden />
          </button>
        </form>
        <div role="status" data-testid="mealie-grocery-added" style={{ display: 'flex', alignItems: 'center', minHeight: added?.undo ? 44 : 18, margin: '4px 2px 6px', fontSize: 12, color: 'var(--hs-success)' }}>
          {added && (
            <>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {added.kind === 'already'
                  ? t('mealie.grocery.already', { item: added.text, list: added.list })
                  : added.kind === 'putBack'
                    ? t('mealie.grocery.putBack', { item: added.text, list: added.list })
                    : added.label
                      ? t('mealie.grocery.addedUnder', { item: added.text, list: added.list, label: added.label })
                      : t('mealie.grocery.added', { item: added.text, list: added.list })}
              </span>
              {added.undo && <button type="button" onClick={added.undo} style={lineButton}>{t('mealie.grocery.undo')}</button>}
            </>
          )}
        </div>

        {total === 0 ? (
          <CenterMessage
            icon={<ShoppingCart size={24} strokeWidth={2} />}
            title={t('mealie.grocery.emptyTitle', { list: list.name })}
            description={t('mealie.grocery.emptyDescription')}
            padding="40px 16px"
          />
        ) : (
          <>
            <div style={{ margin: '6px 0 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--hs-text-body)' }} data-testid="mealie-grocery-count">
                  {t(total === 1 ? 'mealsGrocery.itemsCountSingular' : 'mealsGrocery.itemsCountPlural', { checked: got, total })}
                </span>
                <button
                  type="button"
                  onClick={share}
                  style={{
                    padding: '6px 14px', minHeight: 44, fontSize: 13, fontWeight: 600, borderRadius: 8,
                    border: '1px solid var(--hs-border)', background: 'var(--hs-bg-panel)',
                    color: shared ? 'var(--hs-success)' : 'var(--hs-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {shared ? t('mealsGrocery.shareCopiedButton') : t('mealsGrocery.shareButton')}
                </button>
              </div>
              <div style={{ height: 6, background: 'var(--hs-border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${(got / total) * 100}%`, backgroundColor: 'var(--hs-success)', transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--hs-text-faint)' }}>
                <span>{t('mealie.grocery.hint')}</span>
                {baseUrl && (
                  <button
                    type="button"
                    onClick={openMealie}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44, padding: 0, border: 'none', background: 'none',
                      color: 'var(--hs-text-muted)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {t('mealie.openMealie')}
                    <ExternalLink size={13} strokeWidth={2} aria-hidden />
                  </button>
                )}
              </div>
              {shopping.stale && (
                <p role="status" data-testid="mealie-grocery-stale" style={{ margin: '6px 0 0', fontSize: 12, color: WARN }}>
                  {copyTime
                    ? t(`mealie.grocery.stale${reason}`, { time: copyTime })
                    : t(shopping.problem === 'connection' ? 'mealie.grocery.connectionTitle' : `${mealieProblemWords(shopping.problem)}.title`)}
                </p>
              )}
            </div>

            {groups.map((group) => (
              <div key={group.label ?? ''} style={{ marginBottom: 20 }}>
                {headings && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--hs-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {labelFor(group.label)}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'var(--hs-bg-panel)', color: 'var(--hs-text-faint)', fontWeight: 500 }}>
                      {group.items.filter((i) => i.checked).length}/{group.items.length}
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
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 12, minHeight: 48, marginBottom: 8,
                    borderRadius: 10, border: '1px dashed var(--hs-border-strong)', background: 'transparent',
                    color: 'var(--hs-text-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {t('mealie.grocery.inCart', { count: folded.length })}
                  <ChevronRight
                    size={16}
                    strokeWidth={2.2}
                    aria-hidden
                    style={{ marginLeft: 'auto', color: 'var(--hs-text-faint)', transform: cartOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                  />
                </button>
                {cartOpen && folded.map(itemRow)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
