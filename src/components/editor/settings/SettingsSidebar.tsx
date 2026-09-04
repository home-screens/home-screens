'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslate, type TranslateFn } from '@/i18n';
import {
  Activity,
  BookOpen,
  ChevronDown,
  ExternalLink,
  Calendar,
  CloudSun,
  Database,
  KeyRound,
  LayoutGrid,
  MapPin,
  Monitor,
  Plus,
  Search,
  Server,
  Shield,
  Smartphone,
  UtensilsCrossed,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const DOCS_URL = 'https://homescreens.dev/docs';
const GITHUB_URL = 'https://github.com/home-screens/home-screens';
const DISCORD_URL = 'https://discord.gg/KafmFuSNU';

/** lucide-react ships no GitHub or Discord brand mark, so these are inline SVGs. */
function GithubIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.089-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.42-1.305.762-1.605-2.665-.303-5.467-1.332-5.467-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .322.216.696.825.578C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function DiscordIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

/** localStorage key for the collapsed sidebar groups. */
const COLLAPSED_GROUPS_KEY = 'hs-settings-collapsed-groups';
/** Stable identity for "nothing collapsed", the default. */
const EMPTY_GROUPS: ReadonlySet<SidebarGroup> = new Set();
import { useEditorStore } from '@/stores/editor-store';
import { declaredCanvasDimensions } from '@/lib/display-filter';
import { heartbeatState } from '@/lib/display-liveness';
import { useDisplayHeartbeats } from '@/hooks/useDisplayHeartbeats';
import {
  DEFAULT_PAGE_IDS,
  parseSettingsRoute,
  settingsHref,
  type DefaultPageId,
  type SettingsRoute,
} from '@/lib/settings-route';
import { FORM_DEFAULTS } from '@/lib/settings-form';
import { getDisplayProfiles } from '@/lib/display-filter';
import {
  SETTINGS_FIELD_INDEX,
  resolveSettingsFieldLabel,
  settingsFieldRoute,
  isSettingsFieldReachable,
  type SettingsFieldEntry,
  type SettingsFieldVisibilityContext,
} from '@/lib/settings-search-index';
import type { DisplayNode } from '@/types/config';

/**
 * The settings sidebar.
 *
 * In multi-display mode the sidebar splits into two distinct groups:
 *
 *   - **Defaults** — every shared setting (display, sleep, alerts, weather,
 *     etc.) under a single header. These are the values *every* display
 *     uses until a per-display override kicks in.
 *   - **Per display** — one row per registered DisplayNode with a live
 *     status dot, plus an "All displays" landing entry and a `+` add button.
 *
 * In single-display mode (`config.displays` undefined or empty) the sidebar
 * collapses to a flat list of the legacy tab labels PLUS a single
 * "Displays" entry below a separator. That extra entry is the discovery
 * affordance for adoption: clicking it navigates to `DisplaysIndexPage`
 * (which already handles the empty state) so a legacy install can see and
 * adopt any Pi that has heartbeated into the hub's `knownDisplays` pool.
 * Crucially, visiting that page is **not** the same as entering multi-
 * display mode — the actual conversion only happens when the user clicks
 * Add / Adopt inside the page, which triggers `addDisplay` in the editor
 * store and bootstraps the `main` DisplayNode. Hiding the entry previously
 * was overly conservative: it was enforcing a softer boundary than the
 * one-way door in `editor-store.ts`, and the result was a discoverability
 * trap where unadopted Pis were invisible from the only UI a legacy user
 * would ever look at.
 *
 * The component is intentionally URL-driven, not state-driven: every nav
 * item emits a `?section=...&page=...` href and listens to `popstate` to
 * highlight the active item. That way browser back/forward, deep links,
 * and external clicks all stay in sync with the rendered content.
 */
interface SettingsSidebarProps {
  /** Called when the user clicks the `+` next to the Per display header.
   *  The parent settings page handles the actual add flow (form, save,
   *  refresh) — the sidebar only signals intent. */
  onAddDisplay: () => void;
}

/**
 * Icon + nav-label key + group metadata for every Defaults page id. Typed
 * as a `Record<DefaultPageId, ...>` so adding a new page to
 * `DEFAULT_PAGE_IDS` in `lib/settings-route` without adding an entry
 * here is a compile error — and vice versa. That replaces the old
 * dual-maintenance risk where the sidebar array and the route parser's
 * canonical list could silently drift out of sync.
 *
 * The `labelKey` is a key under `editor.settings.sidebar.navLabels`; the
 * `group` names a key under `editor.settings.sidebar.groups`. Both are
 * resolved per render via `useTranslate('editor')` so a locale change
 * re-flows the sidebar without remounting. Grouping is display-only —
 * the flat `DEFAULT_PAGE_IDS` order (which already lists group members
 * consecutively) stays the routing source of truth.
 */
type SidebarGroup = 'screen' | 'content' | 'automation' | 'admin';

const PAGE_META: Record<DefaultPageId, { labelKey: string; icon: LucideIcon; group: SidebarGroup }> = {
  screen: { labelKey: 'screen', icon: Monitor, group: 'screen' },
  location: { labelKey: 'location', icon: MapPin, group: 'screen' },
  weather: { labelKey: 'weather', icon: CloudSun, group: 'content' },
  calendar: { labelKey: 'calendar', icon: Calendar, group: 'content' },
  meals: { labelKey: 'meals', icon: UtensilsCrossed, group: 'content' },
  // Sits with the feature pages it points at, not down in Maintenance beside
  // the footer's external links: /chores and /remote are first-party surfaces,
  // and a named row here is what makes them turn up in the sidebar search.
  phone: { labelKey: 'phone', icon: Smartphone, group: 'content' },
  // API keys sit with Content, not Maintenance — the keys exist to unlock
  // content sources (photos, todo lists, traffic), so users hunting for
  // "why is my photo module empty" find them next to the feature pages.
  integrations: { labelKey: 'integrations', icon: KeyRound, group: 'content' },
  automation: { labelKey: 'automation', icon: Zap, group: 'automation' },
  security: { labelKey: 'security', icon: Shield, group: 'admin' },
  network: { labelKey: 'network', icon: Wifi, group: 'admin' },
  system: { labelKey: 'system', icon: Server, group: 'admin' },
  data: { labelKey: 'data', icon: Database, group: 'admin' },
  stats: { labelKey: 'stats', icon: Activity, group: 'admin' },
};

/**
 * Canonical render order for the Defaults group. Derived from
 * `DEFAULT_PAGE_IDS` so the sidebar and the route parser can't drift —
 * reordering happens in one place. The `label` is resolved through `t`
 * at call time so the visible string follows the active locale.
 */
function buildDefaultPages(
  t: TranslateFn,
): { id: DefaultPageId; label: string; icon: LucideIcon; group: SidebarGroup }[] {
  return DEFAULT_PAGE_IDS.map((id) => ({
    id,
    label: t(`settings.sidebar.navLabels.${PAGE_META[id].labelKey}`),
    icon: PAGE_META[id].icon,
    group: PAGE_META[id].group,
  }));
}

/**
 * Bucket the (possibly search-filtered) page list into its render groups,
 * preserving `DEFAULT_PAGE_IDS` order within and across groups. Groups
 * whose every page was filtered out disappear entirely — the group header
 * carries no information without members under it.
 */
function groupPages(
  pages: ReturnType<typeof buildDefaultPages>,
): { group: SidebarGroup; pages: ReturnType<typeof buildDefaultPages> }[] {
  const out: { group: SidebarGroup; pages: ReturnType<typeof buildDefaultPages> }[] = [];
  for (const page of pages) {
    const last = out[out.length - 1];
    if (last && last.group === page.group) last.pages.push(page);
    else out.push({ group: page.group, pages: [page] });
  }
  return out;
}

/** Map a heartbeat lastSeen (ms epoch) to one of the three status colors. */
function statusDotClass(lastSeen: number | null): string {
  switch (heartbeatState(lastSeen)) {
    case 'online':
      return 'bg-hs-success ring-2 ring-hs-success/20';
    case 'idle':
      return 'bg-hs-warning';
    case 'offline':
      return 'bg-hs-text-faint';
  }
}

export default function SettingsSidebar({ onAddDisplay }: SettingsSidebarProps) {
  const { config } = useEditorStore();
  const displays = useMemo(() => config?.displays ?? [], [config?.displays]);
  const isMultiDisplay = displays.length > 0;

  const t = useTranslate('editor');
  const defaultPages = useMemo(() => buildDefaultPages(t), [t]);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Live heartbeat polling — only when in multi-display mode. Pauses on
  // hidden tabs; see useDisplayHeartbeats for the cadence/caching contract.
  const { data: apiData } = useDisplayHeartbeats({ enabled: isMultiDisplay });

  // Client-only filter state, not reflected in the URL — mirrors
  // ModulePalette's search box (no debounce; these lists are small
  // enough that a plain `.includes()` on every keystroke is cheap).
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const filteredDefaultPages = useMemo(
    () => (query ? defaultPages.filter((p) => p.label.toLowerCase().includes(query)) : defaultPages),
    [defaultPages, query],
  );
  const filteredDisplays = useMemo(
    () => (query ? displays.filter((d) => d.name.toLowerCase().includes(query)) : displays),
    [displays, query],
  );
  const allDisplaysMatches = !query || t('settings.sidebar.allDisplays').toLowerCase().includes(query);
  const displaysEntryMatches = !query || t('settings.sidebar.displays').toLowerCase().includes(query);

  // Field-level matches — searches inside each Defaults page's content, not
  // just its nav label. A hit navigates to the owning page with `?highlight=`
  // set, which `settings/page.tsx` reads to scroll to and pulse the field
  // (matched via `data-field-id` on the field's wrapper element).
  const pageLabelById = useMemo(
    () => Object.fromEntries(defaultPages.map((p) => [p.id, p.label])) as Record<DefaultPageId, string>,
    [defaultPages],
  );
  // Conditionally-rendered fields are filtered OUT of the results rather than
  // offered and then silently failing to highlight. Advanced-mode and
  // multi-display fields are the important ones: there is nothing the user can
  // do on the destination page to make them appear, so a dead result there
  // reads as "the search is broken".
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const profilesForSelectedDisplay = useMemo(() => {
    const activeDisplay = selectedDisplayId
      ? config?.displays?.find((d) => d.id === selectedDisplayId) ?? null
      : null;
    return activeDisplay
      ? getDisplayProfiles(activeDisplay, config?.profiles)
      : config?.profiles ?? [];
  }, [config?.displays, config?.profiles, selectedDisplayId]);

  const fieldVisibility: SettingsFieldVisibilityContext = useMemo(
    () => ({
      advancedMode: config?.settings?.advancedMode ?? false,
      isMultiDisplay,
      // Resolved per selected display, mirroring ProfilesSection exactly.
      // `addDisplay` snapshots the pool onto each display and every later
      // add/delete goes only to `display.profiles`, so the global pool freezes
      // at bootstrap and divergence is the steady state, not an edge case.
      // Counting the pool broke in both directions: a display owning `[]` beside
      // a non-empty pool still offered a dead search result, and a display
      // owning profiles beside an empty pool hid a field that was on screen.
      profileCount: profilesForSelectedDisplay.length,
      // Must resolve undefined the SAME way the page does. `toFormState`
      // (settings-form.ts) falls back to FORM_DEFAULTS, so a config with no
      // `transitionEffect` renders the duration field; defaulting to 'none'
      // here would hide it from search while it sits visible on the page —
      // the same dead end this gating exists to prevent, inverted.
      transitionEffect:
        config?.settings?.transitionEffect ?? FORM_DEFAULTS.display.transitionEffect,
    }),
    [config?.settings?.advancedMode, config?.settings?.transitionEffect, profilesForSelectedDisplay, isMultiDisplay],
  );
  const filteredFields = useMemo(
    () =>
      query
        ? SETTINGS_FIELD_INDEX.filter(
            (f) =>
              resolveSettingsFieldLabel(f, t).toLowerCase().includes(query)
              && isSettingsFieldReachable(f, fieldVisibility),
          )
        : [],
    [query, t, fieldVisibility],
  );

  // Derive the active highlight from the current URL via the same
  // `parseSettingsRoute` helper the parent settings page uses to decide
  // what content to render. Routing through the parser (instead of reading
  // `section` / `page` directly off the query) keeps the sidebar's idea of
  // the active item identical to what the page actually renders.
  // `useSearchParams` re-renders on every Next route change (Link click,
  // router.push, back button), so this stays in sync automatically.
  const activeRoute = useMemo(
    () => parseSettingsRoute(new URLSearchParams(searchParams?.toString() ?? '')),
    [searchParams],
  );

  // Which groups the user has collapsed, remembered per browser. A viewing
  // preference, not a household setting, so it stays out of config.json. The
  // default is empty: every group starts expanded, exactly as the list looked
  // before this existed.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<SidebarGroup>>(EMPTY_GROUPS);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) setCollapsedGroups(new Set(parsed as SidebarGroup[]));
    } catch {
      /* Unreadable or blocked storage just means "nothing collapsed". */
    }
  }, []);

  const toggleGroup = useCallback((group: SidebarGroup) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      try {
        window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        /* Preference is best-effort; the toggle still works this session. */
      }
      return next;
    });
  }, []);

  const navigate = useCallback((href: string) => {
    // `router.push` updates history AND triggers re-render of every
    // component that reads `useSearchParams` — so the parent settings
    // page swaps content without needing a popstate workaround.
    router.push(href);
  }, [router]);

  const heartbeats = new Map(apiData?.displays.map((d) => [d.id, d]) ?? []);

  if (!isMultiDisplay) {
    // Legacy flat sidebar — every settings page as a single tab list,
    // plus a "Displays" entry below a separator as the opt-in discovery
    // point for multi-display mode.
    // The Displays entry navigates to `DisplaysIndexPage`, which is safe
    // in legacy mode: it renders an empty state ("No displays registered.
    // Add one below or adopt a Pi that has already connected.") and only
    // mutates config if the user explicitly clicks Add / Adopt inside the
    // page. Highlighting it on both `?section=displays` and `?section=display`
    // means if someone deep-links to a specific display's detail page the
    // sidebar still shows the right active row.
    const noResults =
      query.length > 0 && filteredDefaultPages.length === 0 && !displaysEntryMatches && filteredFields.length === 0;

    return (
      <nav className="w-52 shrink-0 border-r border-hs-border bg-hs-panel/40 flex flex-col">
        <div className="px-3.5 pt-3 pb-2">
          <SidebarSearchBox value={search} onChange={setSearch} placeholder={t('settings.sidebar.searchPlaceholder')} />
        </div>
        <div className="settings-sidebar-scroll flex-1 overflow-y-auto pb-3">
          {noResults ? (
            <p className="px-3.5 py-4 text-xs text-hs-text-faint text-center">{t('settings.sidebar.noResults')}</p>
          ) : (
            <>
              <GroupedPageList
                pages={filteredDefaultPages}
                grouped={query.length === 0}
                activeRoute={activeRoute}
                navigate={navigate}
                collapsedGroups={collapsedGroups}
                onToggleGroup={toggleGroup}
                t={t}
              />
              {filteredDefaultPages.length > 0 && displaysEntryMatches && (
                <div className="mx-3.5 my-2 border-t border-hs-border" />
              )}
              {displaysEntryMatches && (
                <SidebarItem
                  icon={LayoutGrid}
                  label={t('settings.sidebar.displays')}
                  active={activeRoute.kind === 'displays' || activeRoute.kind === 'display'}
                  onClick={() => navigate(settingsHref({ kind: 'displays' }))}
                />
              )}
              <MatchingFieldsSection fields={filteredFields} pageLabelById={pageLabelById} navigate={navigate} t={t} />
            </>
          )}
        </div>
        <SidebarFooter />
      </nav>
    );
  }

  const noResults =
    query.length > 0 &&
    filteredDefaultPages.length === 0 &&
    !allDisplaysMatches &&
    filteredDisplays.length === 0 &&
    filteredFields.length === 0;

  return (
    <nav className="w-60 shrink-0 border-r border-hs-border bg-hs-panel/40 flex flex-col">
      <div className="px-3.5 pt-3 pb-2">
        <SidebarSearchBox value={search} onChange={setSearch} placeholder={t('settings.sidebar.searchPlaceholder')} />
      </div>
      <div className="settings-sidebar-scroll flex-1 overflow-y-auto pb-3">
      {noResults ? (
        <p className="px-3.5 py-4 text-xs text-hs-text-faint text-center">{t('settings.sidebar.noResults')}</p>
      ) : (
        <>
      {/* DEFAULTS group */}
      {filteredDefaultPages.length > 0 && (
        <>
          <div className="px-3.5 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-hs-text-faint font-semibold">
            {t('settings.sidebar.defaults')}
          </div>
          <div className="px-3.5 pb-1.5 text-[10px] text-hs-text-faint italic leading-tight">
            {t('settings.sidebar.defaultsHelp')}
          </div>
          <GroupedPageList
            pages={filteredDefaultPages}
            grouped={query.length === 0}
            activeRoute={activeRoute}
            navigate={navigate}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            t={t}
          />
        </>
      )}

      {/* PER DISPLAY group */}
      <div className="flex items-center justify-between px-3.5 pt-4 pb-1 text-[10px] uppercase tracking-wider text-hs-text-faint font-semibold">
        <span>{t('settings.sidebar.perDisplay')}</span>
        <button
          type="button"
          onClick={onAddDisplay}
          className="text-hs-text-faint hover:text-hs-text-secondary transition-colors"
          title={t('settings.sidebar.addDisplay')}
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      </div>

      {allDisplaysMatches && (
        <SidebarItem
          icon={LayoutGrid}
          label={t('settings.sidebar.allDisplays')}
          active={activeRoute.kind === 'displays'}
          onClick={() => navigate(settingsHref({ kind: 'displays' }))}
          badge={String(displays.length)}
        />
      )}

      {filteredDisplays.map((display: DisplayNode) => {
        const lastSeen = heartbeats.get(display.id)?.lastSeen ?? null;
        const oriented =
          display.displayWidth && display.displayHeight
            ? declaredCanvasDimensions(display.displayWidth, display.displayHeight, display.displayTransform)
            : null;
        const dimensions = oriented ? `${oriented.width}×${oriented.height}` : null;
        const isActive =
          activeRoute.kind === 'display' && activeRoute.displayId === display.id;

        return (
          <button
            key={display.id}
            type="button"
            onClick={() => navigate(settingsHref({ kind: 'display', displayId: display.id, subtab: 'overview' }))}
            className={`w-full flex items-center gap-2 pl-7 pr-3.5 py-1.5 text-[13px] transition-colors border-l-2 ${
              isActive
                ? 'text-hs-text-primary bg-hs-card border-hs-accent'
                : 'text-hs-text-muted hover:text-hs-text-body hover:bg-hs-hover border-transparent'
            }`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass(lastSeen)}`} />
            <span className="flex-1 min-w-0 truncate text-left">{display.name}</span>
            {dimensions && (
              <span className="text-[10px] text-hs-text-faint tabular-nums">{dimensions}</span>
            )}
          </button>
        );
      })}

      <MatchingFieldsSection fields={filteredFields} pageLabelById={pageLabelById} navigate={navigate} t={t} />
        </>
      )}
      </div>
      <SidebarFooter />
    </nav>
  );
}

/**
 * The Defaults page list, bucketed under small group headers (Screen /
 * Content / Automation / Admin) when `grouped` is true. While a search
 * filter is active the caller passes `grouped: false` and the matches
 * render as one flat list — a header over a partial group would suggest
 * the group only contains the matching rows.
 */
function GroupedPageList({
  pages,
  grouped,
  activeRoute,
  navigate,
  collapsedGroups,
  onToggleGroup,
  t,
}: {
  pages: ReturnType<typeof buildDefaultPages>;
  grouped: boolean;
  activeRoute: SettingsRoute;
  navigate: (href: string) => void;
  collapsedGroups: ReadonlySet<SidebarGroup>;
  onToggleGroup: (group: SidebarGroup) => void;
  t: TranslateFn;
}) {
  const renderItems = (items: ReturnType<typeof buildDefaultPages>) =>
    items.map((p) => (
      <SidebarItem
        key={p.id}
        icon={p.icon}
        label={p.label}
        // The `parseSettingsRoute` fallback is `{ kind: 'defaults',
        // page: 'screen' }` for any URL that doesn't match another
        // shape — so no params at all naturally highlights `screen`
        // here without a special case.
        active={activeRoute.kind === 'defaults' && activeRoute.page === p.id}
        onClick={() => navigate(settingsHref({ kind: 'defaults', page: p.id }))}
      />
    ));

  if (!grouped) return <>{renderItems(pages)}</>;

  return (
    <>
      {groupPages(pages).map(({ group, pages: groupMembers }) => {
        // Expanded is the default and the stored state only ever narrows it:
        // nobody should arrive at a sidebar that has hidden its own contents.
        // The group holding the active page is never collapsed, so navigating
        // into a page always shows where you are.
        const holdsActive = groupMembers.some(
          (p) => activeRoute.kind === 'defaults' && activeRoute.page === p.id,
        );
        const collapsed = !holdsActive && collapsedGroups.has(group);
        return (
          <div key={group}>
            <button
              type="button"
              onClick={() => onToggleGroup(group)}
              aria-expanded={!collapsed}
              className="w-full flex items-center gap-1.5 px-3.5 pt-3 pb-0.5 text-[10px] uppercase tracking-wider text-hs-text-faint/70 font-semibold hover:text-hs-text-faint transition-colors"
            >
              <ChevronDown
                className={`w-2.5 h-2.5 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                aria-hidden="true"
              />
              <span className="flex-1 text-left">{t(`settings.sidebar.groups.${group}`)}</span>
              {collapsed && (
                <span className="tabular-nums text-hs-text-faint/70">{groupMembers.length}</span>
              )}
            </button>
            {!collapsed && renderItems(groupMembers)}
          </div>
        );
      })}
    </>
  );
}

/**
 * Pinned footer rendered at the bottom of the sidebar in both legacy and
 * multi-display modes. The parent `<nav>` is a flex column with a
 * `flex-1 overflow-y-auto` body above this, so the footer stays visible
 * regardless of how far the Defaults / Per display lists scroll.
 *
 * Labelled rows, not bare icons: a book/GitHub mark/Discord mark only carry
 * their meaning via a hover title, which is a worse affordance than a label
 * regardless of input device. (The editor itself is rarely touchscreen-only
 * — that's the kiosk display — but the labelled row still reads faster.)
 */
function SidebarFooter() {
  const t = useTranslate('editor');
  return (
    <div className="border-t border-hs-border py-1">
      <a
        href={DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] text-hs-text-muted hover:text-hs-text-body hover:bg-hs-hover transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">{t('settings.sidebar.helpAndDocs')}</span>
        <ExternalLink className="w-3 h-3 shrink-0 text-hs-text-faint" aria-hidden="true" />
      </a>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] text-hs-text-muted hover:text-hs-text-body hover:bg-hs-hover transition-colors"
      >
        <GithubIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">{t('settings.sidebar.github')}</span>
        <ExternalLink className="w-3 h-3 shrink-0 text-hs-text-faint" aria-hidden="true" />
      </a>
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] text-hs-text-muted hover:text-hs-text-body hover:bg-hs-hover transition-colors"
      >
        <DiscordIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">{t('settings.sidebar.discord')}</span>
        <ExternalLink className="w-3 h-3 shrink-0 text-hs-text-faint" aria-hidden="true" />
      </a>
    </div>
  );
}

/**
 * Live-filter search box pinned above the scrollable nav list. Mirrors
 * ModulePalette's search input (same icon placement, sizing, and border
 * classes) so the two "filter a list of labeled items" affordances in the
 * editor look and behave identically.
 */
function SidebarSearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hs-text-faint" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-3 py-1.5 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint focus:outline-none focus:border-hs-accent"
      />
    </div>
  );
}

/**
 * Field-level search results — matches from `SETTINGS_FIELD_INDEX`, shown
 * below the page/display matches so broad results surface first. Shared
 * between the legacy and multi-display branches since the field index is
 * orthogonal to display mode. Clicking a row navigates to the owning page
 * with `?highlight=<fieldId>`, which `settings/page.tsx` reads to scroll to
 * and pulse the field.
 */
function MatchingFieldsSection({
  fields,
  pageLabelById,
  navigate,
  t,
}: {
  fields: SettingsFieldEntry[];
  pageLabelById: Record<DefaultPageId, string>;
  navigate: (href: string) => void;
  t: TranslateFn;
}) {
  if (fields.length === 0) return null;
  return (
    <>
      <div className="px-3.5 pt-4 pb-1 text-[10px] uppercase tracking-wider text-hs-text-faint font-semibold">
        {t('settings.sidebar.matchingFields')}
      </div>
      {fields.map((f) => (
        <button
          key={f.fieldId}
          type="button"
          // `panel` (present on tabbed-page entries) rides along so the page
          // opens the owning tab AND stays there after `highlight` is
          // stripped post-pulse — highlight-only URLs snap back to the
          // first tab once the param disappears.
          onClick={() => navigate(settingsHref(settingsFieldRoute(f), { highlight: f.fieldId }))}
          className="w-full flex items-center gap-2 pl-7 pr-3.5 py-1.5 text-[13px] transition-colors border-l-2 border-transparent text-hs-text-muted hover:text-hs-text-body hover:bg-hs-hover"
        >
          <span className="flex-1 min-w-0 truncate text-left">{resolveSettingsFieldLabel(f, t)}</span>
          <span className="text-[10px] text-hs-text-faint truncate max-w-[72px]">{pageLabelById[f.pageId]}</span>
        </button>
      ))}
    </>
  );
}

/**
 * One row in the Defaults group of the sidebar. Extracted so the active /
 * hover styling stays in one place — without it the navigate→active state
 * easily drifts between the two groups.
 */
function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] transition-colors border-l-2 ${
        active
          ? 'text-hs-text-primary bg-hs-card border-hs-accent'
          : 'text-hs-text-muted hover:text-hs-text-body hover:bg-hs-hover border-transparent'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0 truncate text-left">{label}</span>
      {badge && <span className="text-[10px] text-hs-text-faint tabular-nums">{badge}</span>}
    </button>
  );
}
