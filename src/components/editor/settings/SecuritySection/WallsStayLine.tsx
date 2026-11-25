'use client';

import Link from 'next/link';
import { useTranslate } from '@/i18n';
import { useWalls } from '@/hooks/useWalls';
import { useEditorStore } from '@/stores/editor-store';
import { settingsPath } from '@/lib/settings-route';
import { wallsShowing } from '@/components/editor/settings/display/WallsPanels';

/**
 * "Your displays stay let in", with a link to where they are listed: the
 * line under a password change and under "Sign everyone out", so nobody
 * expects the wall to go dark. Says nothing while no wall has been let in.
 */
export default function WallsStayLine({ testId }: { testId: string }) {
  const t = useTranslate('editor');
  const displays = useEditorStore((s) => s.config?.displays);
  const { data } = useWalls();
  const letIn = wallsShowing(data?.walls ?? [], null);
  if (letIn.length === 0) return null;
  // The one display they all show on, or every display.
  const theirDisplay = displays?.find((d) => wallsShowing(letIn, d.id).length === letIn.length);
  const theirList = settingsPath(theirDisplay ? { kind: 'display', displayId: theirDisplay.id, subtab: 'overview' } : { kind: 'displays' });
  return (
    <span data-testid={testId}>
      {t('settings.securityPage.modal.wallsStay', { count: letIn.length })}{' '}
      <Link href={theirList} className="text-hs-accent hover:text-hs-accent-hover underline">
        {t('settings.securityPage.modal.wallsSeeList')}
      </Link>
    </span>
  );
}
