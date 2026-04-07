'use client';

import { useState, useEffect, useCallback } from 'react';
import { Monitor, Trash2, Pencil, Plus, RefreshCw, ExternalLink, Check, X } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import Button from '@/components/ui/Button';
import { editorFetch } from '@/lib/editor-fetch';
import type { DisplayNode } from '@/types/config';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

interface UnadoptedDisplay {
  id: string;
  lastSeen: number | null;
}

interface DisplaysApiResponse {
  displays: Array<DisplayNode & {
    lastSeen: number | null;
    status: { displayState?: string; activeProfile?: string | null } | null;
  }>;
  unadopted: UnadoptedDisplay[];
}

/** "5s ago", "3m ago", "2h ago", "—" */
function formatLastSeen(lastSeen: number | null): string {
  if (!lastSeen) return '—';
  const diff = Date.now() - lastSeen;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

/** Online if a heartbeat arrived in the last 30s, idle within 5min, otherwise offline. */
function statusDot(lastSeen: number | null): string {
  if (!lastSeen) return 'bg-neutral-700';
  const diff = Date.now() - lastSeen;
  if (diff < 30_000) return 'bg-green-500';
  if (diff < 300_000) return 'bg-amber-500';
  return 'bg-neutral-600';
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ─── Add / edit form ──────────────────────────────── */

interface DisplayFormProps {
  initial?: DisplayNode;
  prefilledId?: string;
  onCancel: () => void;
  onSubmit: (display: DisplayNode) => void;
  takenIds: Set<string>;
}

function DisplayForm({ initial, prefilledId, onCancel, onSubmit, takenIds }: DisplayFormProps) {
  const { config } = useEditorStore();
  const [name, setName] = useState(initial?.name ?? '');
  const [id, setId] = useState(initial?.id ?? prefilledId ?? '');
  const [idTouched, setIdTouched] = useState(!!initial || !!prefilledId);
  const [screenIds, setScreenIds] = useState<string[]>(
    initial?.screenIds ?? config?.screens.map((s) => s.id) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  // Auto-derive ID from name until the user types into the ID field
  useEffect(() => {
    if (!idTouched && !initial) {
      setId(slugify(name));
    }
  }, [name, idTouched, initial]);

  const screens = config?.screens ?? [];

  const toggleScreen = (sid: string) => {
    setScreenIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
    );
  };

  const handleSubmit = () => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    if (!id || !SLUG_RE.test(id)) {
      setError('ID must be lowercase letters, digits, and hyphens (e.g. "kitchen")');
      return;
    }
    if (!initial && takenIds.has(id)) {
      setError(`A display with ID "${id}" already exists`);
      return;
    }
    onSubmit({
      ...initial,
      id,
      name: trimmedName,
      screenIds,
    });
  };

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-neutral-200">
          {initial ? 'Edit Display' : 'Add Display'}
        </h4>
        <button
          onClick={onCancel}
          className="text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="block">
        <span className="text-xs text-neutral-400">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Kitchen Touchscreen"
          className="mt-1 block w-full rounded-md bg-neutral-900 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
        />
      </label>

      <label className="block">
        <span className="text-xs text-neutral-400">
          ID <span className="text-neutral-600">(used in URL: /display/&lt;id&gt;)</span>
        </span>
        <input
          type="text"
          value={id}
          // Lock the ID for both edits and adoptions: editing breaks existing
          // bookmarks, and adopting under a different ID would silently fail
          // because the polling Pi keeps using its original ID.
          disabled={!!initial || !!prefilledId}
          onChange={(e) => {
            setId(e.target.value);
            setIdTouched(true);
          }}
          placeholder="kitchen"
          className="mt-1 block w-full rounded-md bg-neutral-900 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
        />
        {prefilledId && !initial && (
          <p className="text-[11px] text-neutral-500 mt-1">
            ID is locked to match the polling display.
          </p>
        )}
      </label>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-neutral-400">
            Screens
            <span className="ml-2 text-neutral-600 tabular-nums">
              {screenIds.length} / {screens.length}
            </span>
          </span>
          {screens.length > 0 && (
            <div className="flex items-center gap-3 text-[11px]">
              <button
                type="button"
                onClick={() => setScreenIds(screens.map((s) => s.id))}
                disabled={screenIds.length === screens.length}
                className="text-blue-400 hover:text-blue-300 disabled:text-neutral-600 disabled:cursor-default"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setScreenIds([])}
                disabled={screenIds.length === 0}
                className="text-neutral-400 hover:text-neutral-200 disabled:text-neutral-600 disabled:cursor-default"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto rounded-md border border-neutral-700 p-2">
          {screens.length === 0 && (
            <p className="text-xs text-neutral-500 px-2 py-1">No screens defined yet.</p>
          )}
          {screens.map((screen) => {
            const checked = screenIds.includes(screen.id);
            return (
              <label
                key={screen.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800/60 cursor-pointer text-sm text-neutral-300"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleScreen(screen.id)}
                  className="rounded border-neutral-600 bg-neutral-900"
                />
                <span className="truncate flex-1">{screen.name}</span>
                {screen.enabled === false && (
                  <span className="text-[10px] text-amber-500/70">disabled</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit}>
          {initial ? 'Save changes' : 'Add display'}
        </Button>
      </div>
    </div>
  );
}

/* ─── Main section ────────────────────────────────── */

export default function DisplaysSection() {
  const { config, addDisplay, updateDisplay, removeDisplay, saveConfig } = useEditorStore();

  const [apiData, setApiData] = useState<DisplaysApiResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await editorFetch('/api/displays');
      if (res.ok) {
        const data = (await res.json()) as DisplaysApiResponse;
        setApiData(data);
      }
    } catch {
      // Ignore — keep previous data
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial load + 5s refresh while the tab is open. The route reads config
  // through a tiny per-process cache (~1.5s TTL) so concurrent polls from the
  // editor and unadopted Pis collapse to a single disk read.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!config) return null;

  const displays = config.displays ?? [];
  const takenIds = new Set(displays.map((d) => d.id));
  const unadopted = apiData?.unadopted ?? [];
  const heartbeats = new Map(apiData?.displays.map((d) => [d.id, d]) ?? []);

  /**
   * Run a local mutation and immediately persist it to disk. Display CRUD
   * auto-saves (unlike profiles, which use a separate Save button) because
   * the user's mental model is "I added this display, now it exists" — and
   * anything less means a navigation to `/display/<id>` reads stale config
   * from disk and hits DisplayNotFound even though the UI shows success.
   */
  const mutateAndSave = async (mutate: () => void) => {
    mutate();
    setSaving(true);
    setSaveMessage(null);
    try {
      await saveConfig();
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(null), 2000);
      refresh();
    } catch {
      setSaveMessage('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (display: DisplayNode) => {
    setAdding(false);
    setAdoptingId(null);
    await mutateAndSave(() => addDisplay(display));
  };

  const handleUpdate = async (id: string, display: DisplayNode) => {
    setEditingId(null);
    await mutateAndSave(() => updateDisplay(id, display));
  };

  const handleDelete = async (display: DisplayNode) => {
    if (await useConfirmStore.getState().confirm(`Remove display "${display.name}"?`)) {
      await mutateAndSave(() => removeDisplay(display.id));
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-neutral-300 uppercase tracking-wider">
          Displays
        </h3>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1 disabled:opacity-50"
          title="Refresh heartbeats"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        Run multiple Pis from a single hub. Each display has its own screens
        and settings, but shares chores, meals, calendars and API keys with
        the rest of your home. Leave the list empty to keep running as a
        single-display install (no migration needed).
      </p>

      {/* Registered displays */}
      <div className="space-y-2 mb-4">
        {displays.map((display) => {
          const heartbeat = heartbeats.get(display.id);
          const lastSeen = heartbeat?.lastSeen ?? null;
          const editing = editingId === display.id;

          if (editing) {
            return (
              <DisplayForm
                key={display.id}
                initial={display}
                takenIds={new Set([...takenIds].filter((id) => id !== display.id))}
                onCancel={() => setEditingId(null)}
                onSubmit={(updated) => handleUpdate(display.id, updated)}
              />
            );
          }

          return (
            <div
              key={display.id}
              className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 flex items-center gap-3"
            >
              <Monitor className="w-5 h-5 text-neutral-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-200 truncate">
                    {display.name}
                  </span>
                  <code className="text-[10px] text-neutral-500 font-mono">
                    {display.id}
                  </code>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDot(lastSeen)}`} />
                    {formatLastSeen(lastSeen)}
                  </span>
                  <span>{display.screenIds.length} screen{display.screenIds.length === 1 ? '' : 's'}</span>
                  {heartbeat?.status?.displayState && (
                    <span className="capitalize">{heartbeat.status.displayState}</span>
                  )}
                </div>
              </div>
              <a
                href={`/display/${display.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
                title="Open display URL"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => setEditingId(display.id)}
                className="text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(display)}
                className="text-neutral-600 hover:text-red-400 transition-colors shrink-0"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        {displays.length === 0 && !adding && (
          <div className="rounded-md border border-dashed border-neutral-700 px-3 py-4 text-xs text-neutral-500 text-center">
            No displays registered. Add one below or adopt a Pi that has already connected.
          </div>
        )}
      </div>

      {/* Add form */}
      {adding && !adoptingId && (
        <div className="mb-4">
          <DisplayForm
            takenIds={takenIds}
            onCancel={() => setAdding(false)}
            onSubmit={handleAdd}
          />
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mb-4"
        >
          <Plus className="w-3.5 h-3.5" />
          Add display
        </button>
      )}

      {/* Unadopted */}
      {unadopted.length > 0 && (
        <div className="border-t border-neutral-700 pt-4 mt-4">
          <h4 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Unadopted Displays
          </h4>
          <p className="text-xs text-neutral-500 mb-3">
            These Pis are connected to the hub but have not been registered yet.
            Click <strong>Adopt</strong> to assign them screens.
          </p>
          <div className="space-y-2">
            {unadopted.map((un) => {
              const isAdopting = adoptingId === un.id;
              if (isAdopting) {
                return (
                  <DisplayForm
                    key={un.id}
                    prefilledId={un.id}
                    takenIds={takenIds}
                    onCancel={() => setAdoptingId(null)}
                    onSubmit={handleAdd}
                  />
                );
              }
              return (
                <div
                  key={un.id}
                  className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center gap-3"
                >
                  <Check className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono text-amber-200">{un.id}</code>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      Last seen {formatLastSeen(un.lastSeen)}
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => setAdoptingId(un.id)}>
                    Adopt
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-save status toast */}
      {(saving || saveMessage) && (
        <div className="flex items-center gap-2 mt-6 border-t border-neutral-700 pt-4 text-xs">
          {saving && <span className="text-neutral-500">Saving…</span>}
          {!saving && saveMessage && (
            <span className={saveMessage === 'Saved' ? 'text-green-400' : 'text-red-400'}>
              {saveMessage}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
