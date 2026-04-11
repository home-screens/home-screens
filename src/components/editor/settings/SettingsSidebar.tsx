'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  Bell,
  BookOpen,
  Calendar,
  CloudSun,
  Database,
  Github,
  Layers,
  LayoutGrid,
  MapPin,
  Monitor,
  Moon,
  Plug,
  Plus,
  Server,
  Shield,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

const REPO_URL = 'https://github.com/home-screens/home-screens';
import { useEditorStore, orientDimensions } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import {
  DEFAULT_PAGE_IDS,
  parseSettingsRoute,
  type DefaultPageId,
} from '@/lib/settings-route';
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

interface DisplayApiEntry {
  id: string;
  lastSeen: number | null;
}

interface DisplaysApiResponse {
  displays: DisplayApiEntry[];
}

/**
 * Icon + label metadata for every Defaults page id. Typed as a
 * `Record<DefaultPageId, ...>` so adding a new page to
 * `DEFAULT_PAGE_IDS` in `lib/settings-route` without adding an entry
 * here is a compile error — and vice versa. That replaces the old
 * dual-maintenance risk where the sidebar array and the route parser's
 * canonical list could silently drift out of sync.
 */
const PAGE_META: Record<DefaultPageId, { label: string; icon: LucideIcon }> = {
  display: { label: 'Display', icon: Monitor },
  sleep: { label: 'Sleep', icon: Moon },
  alerts: { label: 'Alerts', icon: Bell },
  location: { label: 'Location', icon: MapPin },
  weather: { label: 'Weather', icon: CloudSun },
  calendar: { label: 'Calendar', icon: Calendar },
  meals: { label: 'Meals', icon: UtensilsCrossed },
  profiles: { label: 'Profiles', icon: Layers },
  integrations: { label: 'Integrations', icon: Plug },
  security: { label: 'Security', icon: Shield },
  data: { label: 'Data', icon: Database },
  stats: { label: 'Stats', icon: Activity },
  system: { label: 'System', icon: Server },
  docs: { label: 'Docs', icon: BookOpen },
};

/**
 * Canonical render order for the Defaults group. Derived from
 * `DEFAULT_PAGE_IDS` so the sidebar and the route parser can't drift —
 * reordering happens in one place.
 */
const DEFAULT_PAGES: { id: DefaultPageId; label: string; icon: LucideIcon }[] =
  DEFAULT_PAGE_IDS.map((id) => ({ id, ...PAGE_META[id] }));

/**
 * Map a heartbeat lastSeen (ms epoch) to one of the three status colors.
 * Mirrors the rule in DisplaysSection so the sidebar dot and the per-
 * display detail page header agree on a display's online state.
 */
function statusDotClass(lastSeen: number | null): string {
  if (!lastSeen) return 'bg-hs-text-faint';
  const diff = Date.now() - lastSeen;
  if (diff < 30_000) return 'bg-hs-success ring-2 ring-hs-success/20';
  if (diff < 300_000) return 'bg-hs-warning';
  return 'bg-hs-text-faint';
}

export default function SettingsSidebar({ onAddDisplay }: SettingsSidebarProps) {
  const { config } = useEditorStore();
  const displays = config?.displays ?? [];
  const isMultiDisplay = displays.length > 0;

  const router = useRouter();
  const searchParams = useSearchParams();

  const [apiData, setApiData] = useState<DisplaysApiResponse | null>(null);

  // Live heartbeat polling — only when in multi-display mode and the
  // tab is visible, every 5s. Reuses /api/displays which has a 1.5s
  // server-side cache, so two open settings tabs collapse to one disk
  // read per cycle. Pausing on hidden tabs keeps background editor
  // windows from hammering the hub Pi indefinitely.
  useEffect(() => {
    if (!isMultiDisplay) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const refresh = async () => {
      try {
        const res = await editorFetch('/api/displays');
        if (res.ok && !cancelled) {
          setApiData((await res.json()) as DisplaysApiResponse);
        }
      } catch {
        // Silent — keep the previous snapshot rather than blanking dots
      }
    };

    const start = () => {
      if (intervalId !== null) return;
      refresh();
      intervalId = setInterval(refresh, 5_000);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // `useEffect` is client-only in a `'use client'` component, so
    // `document` is always defined here. Previous iterations of this
    // block guarded every access behind `typeof document !== 'undefined'`
    // — that would only have mattered at import/SSR time, and Next
    // already splits `'use client'` modules so they never run that
    // path. The guards were load-bearing noise; removing them makes
    // the visibility-change dance one level easier to read.
    if (document.visibilityState === 'visible') start();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isMultiDisplay]);

  // Derive the active highlight from the current URL via the same
  // `parseSettingsRoute` helper the parent settings page uses to decide
  // what content to render. Routing through the parser (instead of reading
  // `section` / `page` directly off the query) means legacy `?tab=X`
  // bookmarks highlight the correct sidebar item on the very first render,
  // not one frame later after `router.replace` canonicalizes the URL.
  // `useSearchParams` re-renders on every Next route change (Link click,
  // router.push, back button), so this stays in sync automatically.
  const activeRoute = useMemo(
    () => parseSettingsRoute(new URLSearchParams(searchParams?.toString() ?? '')),
    [searchParams],
  );

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
    return (
      <nav className="w-52 shrink-0 border-r border-hs-border bg-hs-panel/40 flex flex-col">
        <div className="flex-1 overflow-y-auto py-3">
          {DEFAULT_PAGES.map((p) => (
            <SidebarItem
              key={p.id}
              icon={p.icon}
              label={p.label}
              active={activeRoute.kind === 'defaults' && activeRoute.page === p.id}
              onClick={() => navigate(`?section=defaults&page=${p.id}`)}
            />
          ))}
          <div className="mx-3.5 my-2 border-t border-hs-border" />
          <SidebarItem
            icon={LayoutGrid}
            label="Displays"
            active={activeRoute.kind === 'displays' || activeRoute.kind === 'display'}
            onClick={() => navigate('?section=displays')}
          />
        </div>
        <SidebarFooter />
      </nav>
    );
  }

  return (
    <nav className="w-60 shrink-0 border-r border-hs-border bg-hs-panel/40 flex flex-col">
      <div className="flex-1 overflow-y-auto py-3">
      {/* DEFAULTS group */}
      <div className="px-3.5 pt-3 pb-0.5 text-[10px] uppercase tracking-wider text-hs-text-faint font-semibold">
        Defaults
      </div>
      <div className="px-3.5 pb-1.5 text-[10px] text-hs-text-faint italic leading-tight">
        Used by every display until overridden.
      </div>
      {DEFAULT_PAGES.map((p) => (
        <SidebarItem
          key={p.id}
          icon={p.icon}
          label={p.label}
          // The `parseSettingsRoute` fallback is `{ kind: 'defaults',
          // page: 'display' }` for any URL that doesn't match another
          // shape — so no params at all naturally highlights `display`
          // here without a special case.
          active={activeRoute.kind === 'defaults' && activeRoute.page === p.id}
          onClick={() => navigate(`?section=defaults&page=${p.id}`)}
        />
      ))}

      {/* PER DISPLAY group */}
      <div className="flex items-center justify-between px-3.5 pt-4 pb-1 text-[10px] uppercase tracking-wider text-hs-text-faint font-semibold">
        <span>Per display</span>
        <button
          type="button"
          onClick={onAddDisplay}
          className="text-hs-text-faint hover:text-hs-text-secondary transition-colors"
          title="Add display"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      </div>

      <SidebarItem
        icon={LayoutGrid}
        label="All displays"
        active={activeRoute.kind === 'displays'}
        onClick={() => navigate('?section=displays')}
        badge={String(displays.length)}
      />

      {displays.map((display: DisplayNode) => {
        const lastSeen = heartbeats.get(display.id)?.lastSeen ?? null;
        const oriented =
          display.displayWidth && display.displayHeight
            ? orientDimensions(display.displayWidth, display.displayHeight, display.displayTransform)
            : null;
        const dimensions = oriented ? `${oriented.width}×${oriented.height}` : null;
        const isActive =
          activeRoute.kind === 'display' && activeRoute.displayId === display.id;

        return (
          <button
            key={display.id}
            type="button"
            onClick={() => navigate(`?section=display&id=${encodeURIComponent(display.id)}&subtab=overview`)}
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
      </div>
      <SidebarFooter />
    </nav>
  );
}

/**
 * Pinned footer row rendered at the bottom of the sidebar in both
 * legacy and multi-display modes. The parent `<nav>` is a flex column
 * with a `flex-1 overflow-y-auto` body above this, so the footer stays
 * visible regardless of how far the Defaults / Per display lists scroll.
 */
function SidebarFooter() {
  return (
    <div className="flex justify-end border-t border-hs-border px-3.5 py-2">
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-hs-text-faint hover:text-hs-text-body transition-colors"
        title="View on GitHub"
        aria-label="View on GitHub"
      >
        <Github className="w-4 h-4" />
      </a>
    </div>
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
