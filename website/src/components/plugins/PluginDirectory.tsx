'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { ChevronDown, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { PluginCard } from '@/components/plugins/PluginCard'
import { Button } from '@/components/ui/button'
import {
  categoryCounts,
  countLine,
  DEFAULT_DIRECTORY_STATE,
  DIRECTORY_SORTS,
  filterPlugins,
  parseDirectoryState,
  serializeDirectoryState,
  sortPlugins,
  type DirectoryCard,
  type DirectorySort,
  type DirectoryState,
} from '@/lib/plugin-directory'

/**
 * The browser side of /plugins: search, category chips, the two toggles, the
 * sort menu and the grid. State mirrors the URL (`?q=&category=&verified=1&
 * beta=1&sort=`) so a filtered view can be shared; it is read once on mount
 * and written back with replaceState, never pushed, so Back still leaves the
 * page.
 */
export function PluginDirectory({
  plugins,
  icons,
  categories,
}: {
  plugins: DirectoryCard[]
  /** Rendered icon per plugin id, from the server. */
  icons: Record<string, ReactNode>
  /** Category order for the chips. */
  categories: readonly string[]
}) {
  const [state, setState] = useState<DirectoryState>(DEFAULT_DIRECTORY_STATE)
  const searchRef = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)

  useEffect(() => {
    setState(parseDirectoryState(new URLSearchParams(window.location.search), categories))
    mounted.current = true
  }, [categories])

  useEffect(() => {
    if (!mounted.current) return
    const next = `${window.location.pathname}${serializeDirectoryState(state)}${window.location.hash}`
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', next)
    }
  }, [state])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (event.key === '/' && !typing) {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.key === 'Escape' && target === searchRef.current) {
        setState((s) => ({ ...s, q: '' }))
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const update = useCallback((patch: Partial<DirectoryState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  const chips = useMemo(() => categoryCounts(plugins, state, categories), [plugins, state, categories])
  const allCount = useMemo(
    () => filterPlugins(plugins, { ...state, q: '', category: null }).length,
    [plugins, state],
  )
  const shown = useMemo(() => sortPlugins(filterPlugins(plugins, state), state.sort), [plugins, state])
  const count = countLine(shown, state)
  const hintTags = useMemo(() => pickHintTags(plugins), [plugins])

  return (
    <div>
      {/* Search */}
      <div className="mx-auto mt-9 max-w-[640px]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            type="search"
            value={state.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search plugins by name, tag or author"
            aria-label="Search plugins"
            className="h-[52px] w-full rounded-xl border border-[#333] bg-[#161616] pl-[46px] pr-11 text-base text-white outline-none placeholder:text-neutral-500 focus:border-cyan-400/50 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.12)] [&::-webkit-search-cancel-button]:hidden"
          />
          {state.q ? (
            <button
              type="button"
              onClick={() => {
                update({ q: '' })
                searchRef.current?.focus()
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-500 hover:text-white"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-[#333] px-[7px] py-px font-mono text-xs text-neutral-500 sm:block">
              /
            </kbd>
          )}
        </div>
        {hintTags.length > 0 && (
          <p className="mt-2.5 text-[13px] text-neutral-500">
            Try{' '}
            {hintTags.map((tag, i) => (
              <span key={tag}>
                {i > 0 && (i === hintTags.length - 1 ? ' or ' : ', ')}
                <button
                  type="button"
                  onClick={() => update({ q: tag })}
                  className="font-medium text-neutral-300 hover:text-white"
                >
                  {tag}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Chips */}
      <div className="mt-10 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        <Chip active={state.category === null} count={allCount} onClick={() => update({ category: null })}>
          All
        </Chip>
        {chips.map(({ category, count }) => (
          <Chip
            key={category}
            active={state.category === category}
            count={count}
            onClick={() =>
              update({
                category: state.category === category ? null : category,
              })
            }
          >
            {category}
          </Chip>
        ))}
      </div>

      {/* Toggles, sort, count */}
      <div className="mt-4 flex flex-col gap-3 border-t border-[#1a1a1a] pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="order-2 m-0 text-[13px] text-neutral-500 sm:order-1">
          <span className="font-medium text-neutral-300">{count.lead}</span>
          {count.rest}
        </p>
        <div className="order-1 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-sm text-neutral-400 sm:order-2 sm:shrink-0">
          <Toggle checked={state.verified} onChange={(verified) => update({ verified })}>
            Verified only
          </Toggle>
          <Toggle checked={state.beta} onChange={(beta) => update({ beta })}>
            Show beta
          </Toggle>
          <label className="relative inline-flex items-center">
            <span className="sr-only">Sort by</span>
            <select
              value={state.sort}
              onChange={(e) => update({ sort: e.target.value as DirectorySort })}
              className="appearance-none rounded-lg border border-[#333] bg-[#161616] py-[7px] pl-3 pr-8 text-sm text-neutral-200 outline-none focus:border-cyan-400/50"
            >
              {DIRECTORY_SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 h-4 w-4 text-neutral-400"
              aria-hidden="true"
            />
          </label>
        </div>
      </div>

      {/* Grid */}
      {shown.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[#2e2e2e] px-6 py-16 text-center">
          <p className="text-base text-neutral-300">
            Nothing matches {state.q.trim() ? <>&ldquo;{state.q.trim()}&rdquo;</> : 'these filters'}.
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            Try a tag like{' '}
            <button
              type="button"
              onClick={() => update({ q: 'smart home', category: null })}
              className="text-cyan-300 hover:text-cyan-200"
            >
              smart home
            </button>
            , or{' '}
            <Link href="/plugins/submit" className="text-cyan-300 hover:text-cyan-200">
              submit the plugin you wish existed
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={() => update({ q: '', category: null, verified: false })}
            className="mt-5 text-sm text-neutral-400 underline-offset-4 hover:text-white hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {shown.map((plugin) => (
            <PluginCard key={plugin.id} plugin={plugin} icon={icons[plugin.id]} />
          ))}
          <div className="flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#2e2e2e] p-[22px] text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] bg-[#0f0f0f] text-neutral-400">
              <Plus className="h-[22px] w-[22px]" aria-hidden="true" />
            </div>
            <h3 className="mt-3.5 text-[17px] font-semibold text-white">Submit your plugin</h3>
            <p className="mb-4 mt-1.5 text-sm leading-[22px] text-neutral-500">
              Built something for your own wall? Paste the repo link and we prepare the listing.
            </p>
            <Button href="/plugins/submit" variant="outline">
              Submit a plugin
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean
  count: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-white/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)]'
          : 'text-neutral-400 hover:text-white',
      )}
    >
      {children}
      <span className={clsx('font-mono text-xs', active ? 'text-neutral-300' : 'text-neutral-500')}>
        {count}
      </span>
    </button>
  )
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
    >
      <span
        className={clsx(
          'relative h-5 w-[34px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-cyan-500' : 'bg-[#2a2a2a]',
        )}
      >
        <span
          className={clsx(
            'absolute top-[3px] h-3.5 w-3.5 rounded-full transition-[left,background-color]',
            checked ? 'left-[17px] bg-[#0a0a0a]' : 'left-[3px] bg-[#888]',
          )}
        />
      </span>
      {children}
    </button>
  )
}

/** Three tags worth suggesting: the most common ones that are a word or two long. */
function pickHintTags(plugins: readonly DirectoryCard[]): string[] {
  const counts = new Map<string, number>()
  for (const plugin of plugins) {
    for (const tag of plugin.tags) {
      const pretty = tag.replace(/-/g, ' ')
      counts.set(pretty, (counts.get(pretty) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
    .slice(0, 3)
}
