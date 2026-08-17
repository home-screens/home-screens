import type {
  DefaultPageId,
  PanelIdFor,
  SettingsRoute,
  TabbedPageId,
} from '@/lib/settings-route';

/**
 * One searchable field on a `Defaults → X` page. `fieldId` matches the
 * `data-field-id` attribute on the field's wrapper element in the section
 * component, so the settings page can scroll to and highlight it after a
 * search-result click. `labelKey` is resolved through `t()` at search time
 * (not stored as literal text) so the index never drifts from what's
 * actually rendered under the active locale. A few fields (e.g. weather
 * provider brand names) render a literal, untranslated string instead of
 * an i18n key — those use `label` instead of `labelKey`. Exactly one of
 * the two must be set.
 *
 * `panel` names the owning tab on tabbed pages (Screen, Automation). The
 * sidebar puts it in the result link as `?panel=…` so the page opens the
 * right tab AND stays on it — without it, the tab is only inferred from
 * `?highlight=`, and when the settings page strips that param after the
 * pulse the page snaps back to its first tab. Fields on untabbed pages
 * omit it.
 */
/**
 * What the destination page needs to be true for a conditionally-rendered
 * field to actually exist in the DOM.
 *
 * Without this, a search hit for a hidden field navigated to its page, polled
 * for `[data-field-id=...]` for three seconds, and then gave up silently — no
 * highlight, no message, no explanation. Worst for the advanced-mode and
 * multi-display cases, where there is nothing the user can do ON the
 * destination page to make the field appear.
 */
export interface SettingsFieldVisibilityContext {
  advancedMode: boolean;
  isMultiDisplay: boolean;
  profileCount: number;
  transitionEffect: string;
}

/**
 * `pageId` correlated with the panel union that page owns (mirroring
 * `DefaultsRoute`), so a row pairing an untabbed page with a panel — or a
 * tabbed page with another page's panel — is a compile error rather than a
 * search result whose link the canonicalizer strips.
 */
type SettingsFieldPageBinding = {
  [P in DefaultPageId]: { pageId: P } & (P extends TabbedPageId
    ? { panel?: PanelIdFor<P> }
    : { panel?: never });
}[DefaultPageId];

interface SettingsFieldEntryBase {
  fieldId: string;
  /**
   * Omitted for the ~90% of fields that always render. When set, the field is
   * only offered as a search result while the predicate holds.
   */
  visibleWhen?: (ctx: SettingsFieldVisibilityContext) => boolean;
}

export type SettingsFieldEntry = SettingsFieldPageBinding &
  SettingsFieldEntryBase &
  ({ labelKey: string; label?: undefined } | { labelKey?: undefined; label: string });

/**
 * Route for a field's destination page + owning tab. The cast is sound —
 * `SettingsFieldPageBinding` enforces the same page↔panel correlation
 * `DefaultsRoute` encodes; TS just can't track it through the two separate
 * property reads.
 */
export function settingsFieldRoute(entry: SettingsFieldEntry): SettingsRoute {
  return { kind: 'defaults', page: entry.pageId, panel: entry.panel } as SettingsRoute;
}

/** Resolves an entry's visible label — translated if `labelKey` is set, verbatim if `label` is set. */
export function resolveSettingsFieldLabel(entry: SettingsFieldEntry, t: (key: string) => string): string {
  return entry.label ?? t(entry.labelKey);
}

/** True when the field will actually be rendered on its destination page. */
export function isSettingsFieldReachable(
  entry: SettingsFieldEntry,
  ctx: SettingsFieldVisibilityContext,
): boolean {
  return entry.visibleWhen ? entry.visibleWhen(ctx) : true;
}

// Named predicates so the intent reads at each use site and the conditions
// stay in one place if a guard changes.
const singleDisplayOnly = (ctx: SettingsFieldVisibilityContext) => !ctx.isMultiDisplay;
const advancedOnly = (ctx: SettingsFieldVisibilityContext) => ctx.advancedMode;
const hasProfiles = (ctx: SettingsFieldVisibilityContext) => ctx.profileCount > 0;
const hasTransition = (ctx: SettingsFieldVisibilityContext) => ctx.transitionEffect !== 'none';

export const SETTINGS_FIELD_INDEX: SettingsFieldEntry[] = [
  { pageId: 'screen', fieldId: 'display.canvasOrientation', labelKey: 'common.orientation', panel: 'appearance', visibleWhen: singleDisplayOnly },
  { pageId: 'screen', fieldId: 'display.canvasResolution', labelKey: 'common.resolution', panel: 'appearance', visibleWhen: singleDisplayOnly },
  { pageId: 'screen', fieldId: 'display.canvasFlip', labelKey: 'settings.defaultDisplayPage.canvas.flipLabel', panel: 'appearance', visibleWhen: singleDisplayOnly },
  { pageId: 'screen', fieldId: 'display.rotationInterval', labelKey: 'settings.defaultDisplayPage.fields.rotationIntervalLabel', panel: 'appearance' },
  { pageId: 'screen', fieldId: 'display.pauseEnabled', labelKey: 'settings.defaultDisplayPage.fields.pauseEnabledLabel', panel: 'appearance' },
  { pageId: 'screen', fieldId: 'display.swipeEnabled', labelKey: 'settings.defaultDisplayPage.fields.swipeEnabledLabel', panel: 'appearance' },
  { pageId: 'screen', fieldId: 'display.transitionEffect', labelKey: 'settings.defaultDisplayPage.fields.transitionEffectLabel', panel: 'appearance' },
  { pageId: 'screen', fieldId: 'display.transitionDuration', labelKey: 'settings.defaultDisplayPage.fields.transitionDurationLabel', panel: 'appearance', visibleWhen: hasTransition },
  { pageId: 'screen', fieldId: 'display.cursorHideSeconds', labelKey: 'settings.defaultDisplayPage.fields.cursorHideLabel', panel: 'appearance' },
  { pageId: 'screen', fieldId: 'display.fullscreenTheme', labelKey: 'settings.defaultDisplayPage.fields.fullscreenThemeLabel', panel: 'appearance' },

  // The sleep rows deliberately carry no `visibleWhen`: every gate that can
  // hide one of these fields (`sleepEnabled`, `idleDimEnabled`,
  // `somethingDims`) is a toggle the user can flip right there on the
  // destination page, and the mechanism is scoped to fields with nothing the
  // user can do on the page to make them appear (see the design comment
  // above). Search may land on a field that's currently collapsed; the
  // control that reveals it is adjacent.
  { pageId: 'screen', fieldId: 'sleep.sleepEnabled', labelKey: 'settings.sleepFormFields.enableLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.idleDimEnabled', labelKey: 'settings.sleepFormFields.idleDimLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.dimAfterMinutes', labelKey: 'settings.sleepFormFields.dimAfterLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.sleepAfterMinutes', labelKey: 'settings.sleepFormFields.sleepAfterLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.dimBrightness', labelKey: 'settings.sleepFormFields.dimBrightnessLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.screensaverMode', labelKey: 'settings.sleepFormFields.screensaverLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.dimScheduleEnabled', labelKey: 'settings.sleepFormFields.dimScheduleLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.dimStartTime', labelKey: 'settings.sleepFormFields.dimAtLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.dimEndTime', labelKey: 'settings.sleepFormFields.brightenAtLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.sleepScheduleEnabled', labelKey: 'settings.sleepFormFields.sleepScheduleLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.sleepStartTime', labelKey: 'settings.sleepFormFields.sleepAtLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.sleepEndTime', labelKey: 'settings.sleepFormFields.wakeAtLabel', panel: 'sleep' },
  { pageId: 'screen', fieldId: 'sleep.wakeHoldMinutes', labelKey: 'settings.sleepFormFields.wakeHoldLabel', panel: 'sleep' },

  { pageId: 'screen', fieldId: 'alerts.enabled', labelKey: 'settings.alertFormFields.enableLabel', panel: 'alerts' },
  { pageId: 'screen', fieldId: 'alerts.position', labelKey: 'settings.alertFormFields.positionLabel', panel: 'alerts' },
  { pageId: 'screen', fieldId: 'alerts.maxVisible', labelKey: 'settings.alertFormFields.maxVisibleLabel', panel: 'alerts' },
  { pageId: 'screen', fieldId: 'alerts.defaultDuration', labelKey: 'settings.alertFormFields.defaultDurationLabel', panel: 'alerts' },
  { pageId: 'screen', fieldId: 'alerts.scale', labelKey: 'settings.alertFormFields.alertSizeLabel', panel: 'alerts' },

  { pageId: 'location', fieldId: 'location.timezone', labelKey: 'settings.locationPage.timezoneLabel' },
  { pageId: 'location', fieldId: 'location.latitude', labelKey: 'settings.locationPage.latitudeLabel' },
  { pageId: 'location', fieldId: 'location.longitude', labelKey: 'settings.locationPage.longitudeLabel' },
  { pageId: 'location', fieldId: 'location.language', labelKey: 'languageAndRegion.languageLabel' },
  { pageId: 'location', fieldId: 'location.formattingLocale', labelKey: 'languageAndRegion.formattingLocaleLabel' },
  { pageId: 'location', fieldId: 'location.timeFormat', labelKey: 'languageAndRegion.timeFormatLabel' },

  { pageId: 'weather', fieldId: 'weather.units', labelKey: 'settings.weatherPage.unitsLabel' },
  { pageId: 'weather', fieldId: 'weather.provider.open-meteo', label: 'Open-Meteo' },
  { pageId: 'weather', fieldId: 'weather.provider.weatherapi', label: 'WeatherAPI.com' },
  { pageId: 'weather', fieldId: 'weather.provider.openweathermap', label: 'OpenWeatherMap' },
  { pageId: 'weather', fieldId: 'weather.provider.pirateweather', label: 'Pirate Weather' },
  { pageId: 'weather', fieldId: 'weather.provider.noaa', label: 'NOAA / NWS' },
  { pageId: 'weather', fieldId: 'weather.provider.yr', label: 'Yr.no / MET Norway' },
  { pageId: 'weather', fieldId: 'weather.provider.smhi', label: 'SMHI' },
  { pageId: 'weather', fieldId: 'weather.provider.metoffice', label: 'UK Met Office' },
  { pageId: 'weather', fieldId: 'weather.provider.envcanada', label: 'Environment Canada' },

  { pageId: 'calendar', fieldId: 'calendar.holidayCountry', labelKey: 'settings.calendarPage.holidays.heading' },
  { pageId: 'calendar', fieldId: 'calendar.maxEvents', labelKey: 'settings.calendarPage.shared.maxEventsLabel' },
  { pageId: 'calendar', fieldId: 'calendar.daysAhead', labelKey: 'settings.calendarPage.shared.daysAheadLabel' },

  { pageId: 'meals', fieldId: 'meals.enabledSlots', labelKey: 'settings.mealsPage.slots.heading' },
  { pageId: 'meals', fieldId: 'meals.weekStartDay', labelKey: 'settings.mealsPage.weekStart.heading' },
  { pageId: 'meals', fieldId: 'meals.timeFormat', labelKey: 'settings.mealsPage.timeFormat.heading' },
  { pageId: 'meals', fieldId: 'meals.defaultSlotTimes', labelKey: 'settings.mealsPage.defaultTimes.heading' },

  { pageId: 'automation', fieldId: 'profiles.activeProfile', labelKey: 'settings.profilesPage.active.label', panel: 'profiles', visibleWhen: hasProfiles },

  { pageId: 'integrations', fieldId: 'integrations.google', labelKey: 'settings.integrationsPage.google.name' },
  { pageId: 'integrations', fieldId: 'integrations.immich', labelKey: 'settings.integrationsPage.immich.name' },
  { pageId: 'integrations', fieldId: 'integrations.unsplash', labelKey: 'settings.integrationsPage.unsplash.name' },
  { pageId: 'integrations', fieldId: 'integrations.nasa', labelKey: 'settings.integrationsPage.nasa.name' },
  { pageId: 'integrations', fieldId: 'integrations.todoist', labelKey: 'settings.integrationsPage.todoist.name' },
  { pageId: 'integrations', fieldId: 'integrations.tomtom', labelKey: 'settings.integrationsPage.tomtom.name' },
  { pageId: 'integrations', fieldId: 'integrations.github', labelKey: 'settings.integrationsPage.github.name', visibleWhen: advancedOnly },

  { pageId: 'network', fieldId: 'network.hiddenNetworkConnect', labelKey: 'settings.networkPage.hiddenNetwork.connectButton' },
  { pageId: 'network', fieldId: 'network.hostname', labelKey: 'settings.networkPage.hostname.heading' },

  { pageId: 'data', fieldId: 'data.shareLayoutExport', labelKey: 'settings.dataPage.shareLayout.exportButton' },
  { pageId: 'data', fieldId: 'data.shareLayoutImport', labelKey: 'settings.dataPage.shareLayout.importButton' },
  { pageId: 'data', fieldId: 'data.templatesBrowse', labelKey: 'settings.dataPage.templates.browseButton' },
  { pageId: 'data', fieldId: 'data.fullBackupExport', labelKey: 'settings.dataPage.fullBackup.backupButton' },
  { pageId: 'data', fieldId: 'data.fullBackupRestore', labelKey: 'settings.dataPage.fullBackup.restoreButton' },
  { pageId: 'data', fieldId: 'data.configBackups', labelKey: 'settings.dataPage.configBackups.heading' },
  { pageId: 'data', fieldId: 'data.backupReminderEnabled', labelKey: 'settings.dataPage.backupReminder.enableLabel' },
  { pageId: 'data', fieldId: 'data.backupReminderInterval', labelKey: 'settings.dataPage.backupReminder.remindAfterLabel' },

  { pageId: 'system', fieldId: 'system.advancedMode', labelKey: 'settings.systemPage.advanced.toggleLabel' },
  { pageId: 'system', fieldId: 'system.version', labelKey: 'settings.systemPage.version.heading' },
  { pageId: 'system', fieldId: 'system.checkForUpdates', labelKey: 'settings.systemPage.version.checkButton' },
  { pageId: 'system', fieldId: 'system.updateChannel', labelKey: 'settings.systemPage.version.stableChannel', visibleWhen: advancedOnly },
  { pageId: 'system', fieldId: 'system.updateNotification', labelKey: 'settings.systemPage.updateNotification.enableLabel' },
  { pageId: 'system', fieldId: 'system.changelog', labelKey: 'settings.systemPage.changelog.heading' },
  { pageId: 'system', fieldId: 'system.rollback', labelKey: 'settings.systemPage.history.heading' },
  
  { pageId: 'system', fieldId: 'system.restartService', labelKey: 'settings.systemPage.actions.restartService' },
  { pageId: 'system', fieldId: 'system.rebootSystem', labelKey: 'settings.systemPage.actions.rebootSystem' },

  { pageId: 'security', fieldId: 'security.changePassword', labelKey: 'settings.securityPage.actions.changePassword' },
  { pageId: 'security', fieldId: 'security.ipAllowlistBypassAuth', labelKey: 'settings.securityPage.ipAllowlist.bypassAuth.label' },
  { pageId: 'security', fieldId: 'security.ipAllowlistRestrictAccess', labelKey: 'settings.securityPage.ipAllowlist.restrictAccess.label' },
  { pageId: 'security', fieldId: 'security.ipAllowlistAddEntry', labelKey: 'settings.securityPage.ipAllowlist.addPlaceholder' },
  { pageId: 'security', fieldId: 'security.displayTokenReveal', labelKey: 'settings.securityPage.displayToken.reveal' },
  { pageId: 'security', fieldId: 'security.displayTokenRegenerate', labelKey: 'settings.securityPage.displayToken.regenerateButton' },
  { pageId: 'security', fieldId: 'security.revokeSessions', labelKey: 'settings.securityPage.revokeSessions.button' },
];
