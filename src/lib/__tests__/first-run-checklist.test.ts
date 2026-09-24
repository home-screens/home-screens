import { describe, it, expect } from 'vitest';
import { resolveFirstRunChecklist } from '@/lib/first-run-checklist';
import { DEFAULT_MODULE_STYLE, type Screen } from '@/types/config';

const blank: Screen = { id: 's1', name: 'Screen 1', backgroundImage: '', modules: [] };
const filled: Screen = {
  ...blank,
  modules: [
    {
      id: 'm1',
      type: 'clock',
      position: { x: 0, y: 0 },
      size: { w: 200, h: 100 },
      zIndex: 1,
      style: { ...DEFAULT_MODULE_STYLE },
      config: {},
    },
  ],
};

/** A brand-new install: nothing placed, nothing configured. */
const fresh = {
  dismissed: false, screens: [blank], townSet: false, zoneSet: false, familySet: false, passwordSet: false,
};

describe('resolveFirstRunChecklist', () => {
  it('shows on a fresh install with every step outstanding', () => {
    const { show, steps } = resolveFirstRunChecklist(fresh);
    expect(show).toBe(true);
    expect(steps).toEqual({
      template: false, family: false, location: false, phone: false, password: false,
    });
  });

  it('stays after modules are placed, so the remaining steps are still reachable', () => {
    // Placing modules used to unmount the whole card, taking the location and
    // password nudges with it before either could be ticked.
    const { show, steps } = resolveFirstRunChecklist({ ...fresh, screens: [filled] });
    expect(show).toBe(true);
    expect(steps.template).toBe(true);
    expect(steps.location).toBe(false);
    expect(steps.password).toBe(false);
  });

  it('ticks the template step off a module on this display, not off a clicked button', () => {
    expect(resolveFirstRunChecklist({ ...fresh, screens: [blank] }).steps.template).toBe(false);
    expect(resolveFirstRunChecklist({ ...fresh, screens: [blank, filled] }).steps.template).toBe(true);
  });

  it('ticks location, family and password from what is actually configured', () => {
    const done = resolveFirstRunChecklist({
      ...fresh, townSet: true, zoneSet: true, familySet: true, passwordSet: true,
    });
    expect(done.steps.location).toBe(true);
    expect(done.steps.family).toBe(true);
    expect(done.steps.password).toBe(true);
  });

  it('needs both the town and the time zone, and says when only the zone is left', () => {
    const townOnly = resolveFirstRunChecklist({ ...fresh, townSet: true });
    expect(townOnly.steps.location).toBe(false);
    expect(townOnly.onlyZoneMissing).toBe(true);

    // Nothing saved at all is not "only the zone": the step itself says it.
    expect(resolveFirstRunChecklist(fresh).onlyZoneMissing).toBe(false);
    // A zone with no town is still an unticked step, with nothing extra to say.
    const zoneOnly = resolveFirstRunChecklist({ ...fresh, zoneSet: true });
    expect(zoneOnly.steps.location).toBe(false);
    expect(zoneOnly.onlyZoneMissing).toBe(false);

    const both = resolveFirstRunChecklist({ ...fresh, townSet: true, zoneSet: true });
    expect(both.steps.location).toBe(true);
    expect(both.onlyZoneMissing).toBe(false);
  });

  it('goes away only once the steps it can check are done', () => {
    const setUp = {
      dismissed: false, screens: [filled], townSet: true, zoneSet: true, familySet: true, passwordSet: true,
    };
    expect(resolveFirstRunChecklist(setUp).show).toBe(false);
    expect(resolveFirstRunChecklist({ ...setUp, zoneSet: false }).show).toBe(true);
    expect(resolveFirstRunChecklist({ ...setUp, familySet: false }).show).toBe(true);
    expect(resolveFirstRunChecklist({ ...setUp, passwordSet: false }).show).toBe(true);
    expect(resolveFirstRunChecklist({ ...setUp, screens: [blank] }).show).toBe(true);
  });

  it('honours a dismissal whatever else is outstanding', () => {
    expect(resolveFirstRunChecklist({ ...fresh, dismissed: true }).show).toBe(false);
  });

  it('waits for the hub before hiding, and before nagging, about the password', () => {
    // Unknown, everything else done: stay quiet rather than flash the card for
    // the length of one request on an install that needs nothing.
    expect(
      resolveFirstRunChecklist({
        dismissed: false, screens: [filled], townSet: true, zoneSet: true, familySet: true, passwordSet: null,
      }).show,
    ).toBe(false);
    // Unknown, but other steps outstanding: the install is plainly new, so show
    // at once instead of waiting on the request.
    expect(resolveFirstRunChecklist({ ...fresh, passwordSet: null }).show).toBe(true);
  });

  it('waits for the hub the same way about the household', () => {
    expect(
      resolveFirstRunChecklist({
        dismissed: false, screens: [filled], townSet: true, zoneSet: true, familySet: null, passwordSet: true,
      }).show,
    ).toBe(false);
    expect(resolveFirstRunChecklist({ ...fresh, familySet: null }).show).toBe(true);
  });

  it('renders nothing before the config has loaded', () => {
    expect(resolveFirstRunChecklist({ ...fresh, screens: null }).show).toBe(false);
  });

  it('leaves the phone step unticked, because nothing records that the remote was opened', () => {
    expect(
      resolveFirstRunChecklist({
        dismissed: false, screens: [filled], townSet: true, zoneSet: true, familySet: true, passwordSet: true,
      }).steps.phone,
    ).toBe(false);
  });
});
