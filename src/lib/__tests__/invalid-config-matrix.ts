/**
 * Configs every whole-config write path must refuse, and the error each one
 * has to name. Shared by the validator's own test and by the route tests for
 * the editor save, the backup restore and the offline snapshot restore, so
 * the three entry points cannot drift apart on what a valid config is again.
 */
const base = {
  screens: [{ id: 's1', name: 'Main', modules: [] }],
  settings: { displayWidth: 1080, displayHeight: 1920 },
};

export const INVALID_CONFIGS: { name: string; config: unknown; error: RegExp }[] = [
  { name: 'a config that is not an object', config: [], error: /must be an object/ },
  { name: 'a config with no screens', config: { settings: {} }, error: /screens/ },
  { name: 'a config with no settings', config: { screens: [] }, error: /settings/ },
  {
    name: 'calendar ownership that is not a list of ids per person',
    config: { ...base, settings: { ...base.settings, calendar: { personSources: { alice: 'cal-1' } } } },
    error: /Calendar ownership/,
  },
  {
    name: 'a calendar\'s own name that is not text',
    config: { ...base, settings: { ...base.settings, calendar: { calendarOverrides: { work: { name: 42 } } } } },
    error: /calendar's own name/,
  },
  {
    name: 'a calendar\'s own colour that is not #rrggbb',
    config: { ...base, settings: { ...base.settings, calendar: { calendarOverrides: { work: { color: 'url(x)' } } } } },
    error: /calendar's own name/,
  },
  {
    name: 'two displays with the same id',
    config: { ...base, displays: [{ id: 'kitchen', screens: [] }, { id: 'kitchen', screens: [] }] },
    error: /Duplicate display id/,
  },
  {
    name: 'a display rotation that is not one of the four real ones',
    config: { ...base, displays: [{ id: 'kitchen', screens: [], displayTransform: '$(id)' }] },
    error: /Display "kitchen" rotation must be one of/,
  },
  {
    name: 'a display rotation override that is not one of the four real ones',
    config: { ...base, displays: [{ id: 'kitchen', screens: [], settings: { displayTransform: '45' } }] },
    error: /Display "kitchen" rotation must be one of/,
  },
  {
    name: 'a screen rotation in the shared settings that is not one of the four real ones',
    config: { ...base, settings: { ...base.settings, displayTransform: '90"; id; "' } },
    error: /Screen rotation must be one of/,
  },
  {
    name: 'a display touch matrix that is not six numbers',
    config: { ...base, displays: [{ id: 'kitchen', screens: [], touchMatrix: [1, 0, 0, 0, '$(id)', 0] }] },
    error: /Display "kitchen": Touch alignment must be 6 numbers/,
  },
  {
    name: 'a touch matrix in the shared settings that is too short',
    config: { ...base, settings: { ...base.settings, touchMatrix: [1, 0, 0] } },
    error: /Touch alignment must be 6 numbers/,
  },
  {
    name: 'a screen schedule with a day outside 0-6',
    config: { ...base, screens: [{ id: 's1', name: 'Main', modules: [], schedule: { daysOfWeek: [9] } }] },
    error: /daysOfWeek/,
  },
  {
    name: 'a module visibility condition of an unknown kind',
    config: {
      ...base,
      screens: [{
        id: 's1',
        name: 'Main',
        modules: [{ id: 'm1', type: 'clock', config: {}, visibility: { conditions: [{ kind: 'bogus' }] } }],
      }],
    },
    error: /visibility condition kind/,
  },
  {
    name: 'a display whose screen schedule has a day outside 0-6',
    config: { ...base, displays: [{ id: 'kitchen', screens: [{ id: 'k1', name: 'K', modules: [], schedule: { daysOfWeek: [7] } }] }] },
    error: /daysOfWeek/,
  },
];
