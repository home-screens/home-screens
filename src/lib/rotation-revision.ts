/**
 * A revision for the background rotation's answers, carried on the wall's
 * heartbeat (`readDisplayRevisions`). The rotate route bumps it whenever a
 * screen gets a new picture (an interval that passed, or Refresh now in the
 * editor), so a wall re-asks within a beat or two instead of on its own
 * minute-long poll.
 */
import { createHubRevision } from './hub-revision';

const revision = createHubRevision('rotation');

/** Record that some screen's rotating background changed. */
export const bumpRotationRevision = revision.bump;

/** The current revision; a different string means a rotation answered anew. */
export const rotationRevision = revision.current;
