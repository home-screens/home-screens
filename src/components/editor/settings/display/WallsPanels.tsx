'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Info, Monitor } from 'lucide-react';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import FieldHint from '@/components/ui/FieldHint';
import { useLocale, useTranslate } from '@/i18n';
import { useConfirmStore } from '@/stores/confirm-store';
import { buildDeleteConfirm } from '@/lib/delete-confirmations';
import { isMainDisplay } from '@/lib/display-filter';
import { formatLastSeen } from '@/lib/time-format';
import { wallBrowserName } from '@/lib/wall-names';
import { wallsLetInByThemselves, type WallApiEntry, type WallsApiResponse } from '@/lib/walls-api-types';
import { formatClientAddress } from '@/lib/client-address';

/**
 * The walls of one display. A wall that names no display is the main one's:
 * that is what `/display` shows.
 */
export function wallsShowing(walls: readonly WallApiEntry[], displayId: string | null): WallApiEntry[] {
  return walls
    .filter((w) => w.status === 'in')
    .filter((w) => displayId === null || w.displayId === displayId || (w.displayId === null && isMainDisplay(displayId)))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

function WallFacts({ wall, time }: { wall: WallApiEntry; time: string }) {
  const address = wall.hubScreen ? null : formatClientAddress(wall.address);
  return (
    <div className="flex items-center gap-3 text-[11px] text-hs-text-faint mt-0.5 flex-wrap">
      {wall.viewport && (
        <span className="tabular-nums">
          {wall.viewport.width}×{wall.viewport.height}
        </span>
      )}
      {address && <span className="font-mono">{address}</span>}
      <span>{time}</span>
    </div>
  );
}

const ROW_CLASS = 'rounded-md border border-hs-border-strong bg-hs-card px-3 py-2.5 flex items-center gap-3';

/**
 * Browsers that opened the wall and are waiting for a grown-up, each with
 * one button. `displayName` turns a display's id into the name the editor
 * shows for it; a hub with one display has no names to show.
 */
export function WaitingWallsNotice({
  walls,
  displayName,
  onLetIn,
}: {
  walls: readonly WallApiEntry[];
  displayName: (displayId: string | null) => string | null;
  onLetIn: (id: string) => Promise<boolean>;
}) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const locale = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const waiting = walls.filter((w) => w.status === 'waiting').sort((a, b) => a.createdAt - b.createdAt);
  if (waiting.length === 0) return null;

  const letIn = async (id: string) => {
    setBusy(id);
    setFailed(false);
    const ok = await onLetIn(id);
    setBusy(null);
    if (!ok) setFailed(true);
  };

  return (
    <Notice tone="warning" icon={Monitor} className="mb-4" testId="waiting-walls" title={t('settings.walls.waitingTitle', { count: waiting.length })}>
      <FieldHint className="mb-3">{t('settings.walls.waitingHint')}</FieldHint>
      <div className="space-y-2">
        {waiting.map((wall) => {
          const forDisplay = displayName(wall.displayId);
          return (
            <div key={wall.id} className={ROW_CLASS} data-testid={`waiting-wall-${wall.id}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-hs-text-primary">
                  {wallBrowserName(tCore, wall)}
                  {forDisplay && <span className="font-normal text-hs-text-muted"> {t('settings.walls.forDisplay', { name: forDisplay })}</span>}
                </div>
                <WallFacts wall={wall} time={t('settings.walls.askingSince', { time: formatLastSeen(wall.createdAt, locale) })} />
                {wall.looksFamiliar && <div className="text-[11px] text-hs-success mt-1">{t('settings.walls.looksFamiliar')}</div>}
              </div>
              <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => letIn(wall.id)}>
                {t('settings.walls.letIn')}
              </Button>
            </div>
          );
        })}
      </div>
      {failed && <p className="text-xs text-hs-danger mt-2" role="alert">{t('settings.walls.letInFailed')}</p>}
    </Notice>
  );
}

/** The small amber tag on a wall the changeover let in with no click. */
function LetInByItselfTag() {
  const t = useTranslate('editor');
  return (
    <span className="ml-2 rounded-full border border-hs-warning/40 px-1.5 py-px text-[10px] font-medium text-hs-warning-ink">
      {t('settings.walls.letInByItself')}
    </span>
  );
}

/**
 * Shown for the 30 days after the update, while any wall was let in with no
 * click: a grown-up should glance at those and see they are theirs.
 */
export function WindowWallsNotice({ data, places }: {
  data: WallsApiResponse;
  /**
   * The displays whose own pages list those walls, on a hub with several
   * displays: the rows are not on the page this notice sits on, so it links
   * to each one. Left out where the list is right underneath.
   */
  places?: { id: string; name: string; href: string }[];
}) {
  const t = useTranslate('editor');
  const count = wallsLetInByThemselves(data.walls).length;
  if (!data.windowOpen || count === 0 || data.windowEndsAt === null) return null;
  const days = Math.max(1, Math.ceil((data.windowEndsAt - Date.now()) / (24 * 60 * 60 * 1000)));
  return (
    <Notice tone="info" icon={Info} className="mb-4" testId="window-walls" title={t('settings.walls.windowTitle', { count })}>
      {t('settings.walls.windowBody', { tag: t('settings.walls.letInByItself'), count: days })}
      {places && places.length > 0 && (
        <span className="mt-1 block" data-testid="window-walls-places">
          {t('settings.walls.windowWhere')}{' '}
          {places.map((place, i) => (
            <span key={place.id}>
              {i > 0 && ', '}
              <Link href={place.href} className="text-hs-accent hover:text-hs-accent-hover underline">{place.name}</Link>
            </span>
          ))}
        </span>
      )}
    </Notice>
  );
}

/**
 * Where one display is showing: a row per browser that has been let in,
 * with Remove. `displayId: null` lists every wall, for a hub with one
 * display.
 */
export function WallsBlock({
  walls,
  displayId,
  onRemove,
  className,
}: {
  walls: readonly WallApiEntry[];
  displayId: string | null;
  onRemove: (id: string) => Promise<boolean>;
  className?: string;
}) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const locale = useLocale();
  const [failed, setFailed] = useState(false);
  const showing = wallsShowing(walls, displayId);
  if (showing.length === 0) return null;

  const remove = async (wall: WallApiEntry) => {
    // The hub's own screen and an allowed network's walls are let straight
    // back in, so for them Remove only clears the entry.
    const consequence = t(wall.comesBack ? 'settings.walls.removeComesBack' : 'settings.walls.removeConsequence');
    const ok = await useConfirmStore.getState().confirm(
      buildDeleteConfirm({ verb: 'remove', name: wallBrowserName(tCore, wall), consequence }, tCore),
    );
    if (!ok) return;
    setFailed(!(await onRemove(wall.id)));
  };

  return (
    <div className={`rounded-lg border border-hs-border bg-hs-panel/40 px-4 py-3.5 ${className ?? ''}`} data-testid="walls-block">
      <div className="text-[13px] font-semibold text-hs-text-primary">{t('settings.walls.showingIn', { count: showing.length })}</div>
      <FieldHint className="mb-3">{t('settings.walls.showingHint')}</FieldHint>
      <div className="space-y-2">
        {showing.map((wall) => (
          <div key={wall.id} className={ROW_CLASS} data-testid={`wall-${wall.id}`}>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-hs-text-primary">
                {wallBrowserName(tCore, wall)}
                {wall.letInByItself && <LetInByItselfTag />}
              </div>
              <WallFacts wall={wall} time={t('settings.walls.seen', { time: formatLastSeen(wall.lastSeenAt, locale) })} />
            </div>
            <Button variant="ghost" size="sm" className="!text-hs-danger" onClick={() => remove(wall)}>
              {tCore('actions.remove')}
            </Button>
          </div>
        ))}
      </div>
      {failed && <p className="text-xs text-hs-danger mt-2" role="alert">{t('settings.walls.removeFailed')}</p>}
    </div>
  );
}
