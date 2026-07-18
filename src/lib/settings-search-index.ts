import type { DefaultPageId } from '@/lib/settings-route';

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
 */
export type SettingsFieldEntry =
  | { pageId: DefaultPageId; fieldId: string; labelKey: string; label?: undefined }
  | { pageId: DefaultPageId; fieldId: string; labelKey?: undefined; label: string };

/** Resolves an entry's visible label — translated if `labelKey` is set, verbatim if `label` is set. */
export function resolveSettingsFieldLabel(entry: SettingsFieldEntry, t: (key: string) => string): string {
  return entry.label ?? t(entry.labelKey);
}

export const SETTINGS_FIELD_INDEX: SettingsFieldEntry[] = [
  { pageId: 'display', fieldId: 'display.canvasOrientation', labelKey: 'common.orientation' },
  { pageId: 'display', fieldId: 'display.canvasResolution', labelKey: 'common.resolution' },
  { pageId: 'display', fieldId: 'display.canvasFlip', labelKey: 'settings.defaultDisplayPage.canvas.flipLabel' },
  { pageId: 'display', fieldId: 'display.rotationInterval', labelKey: 'settings.defaultDisplayPage.fields.rotationIntervalLabel' },
  { pageId: 'display', fieldId: 'display.pauseEnabled', labelKey: 'settings.defaultDisplayPage.fields.pauseEnabledLabel' },
  { pageId: 'display', fieldId: 'display.transitionEffect', labelKey: 'settings.defaultDisplayPage.fields.transitionEffectLabel' },
  { pageId: 'display', fieldId: 'display.transitionDuration', labelKey: 'settings.defaultDisplayPage.fields.transitionDurationLabel' },
  { pageId: 'display', fieldId: 'display.cursorHideSeconds', labelKey: 'settings.defaultDisplayPage.fields.cursorHideLabel' },
  { pageId: 'display', fieldId: 'display.fullscreenTheme', labelKey: 'settings.defaultDisplayPage.fields.fullscreenThemeLabel' },

  { pageId: 'sleep', fieldId: 'sleep.sleepEnabled', labelKey: 'settings.sleepFormFields.enableLabel' },
  { pageId: 'sleep', fieldId: 'sleep.dimAfterMinutes', labelKey: 'settings.sleepFormFields.dimAfterLabel' },
  { pageId: 'sleep', fieldId: 'sleep.sleepAfterMinutes', labelKey: 'settings.sleepFormFields.sleepAfterLabel' },
  { pageId: 'sleep', fieldId: 'sleep.dimBrightness', labelKey: 'settings.sleepFormFields.dimBrightnessLabel' },
  { pageId: 'sleep', fieldId: 'sleep.screensaverMode', labelKey: 'settings.sleepFormFields.screensaverLabel' },
  { pageId: 'sleep', fieldId: 'sleep.dimScheduleEnabled', labelKey: 'settings.sleepFormFields.dimScheduleLabel' },
  { pageId: 'sleep', fieldId: 'sleep.dimStartTime', labelKey: 'settings.sleepFormFields.dimAtLabel' },
  { pageId: 'sleep', fieldId: 'sleep.dimEndTime', labelKey: 'settings.sleepFormFields.brightenAtLabel' },
  { pageId: 'sleep', fieldId: 'sleep.sleepScheduleEnabled', labelKey: 'settings.sleepFormFields.sleepScheduleLabel' },
  { pageId: 'sleep', fieldId: 'sleep.sleepStartTime', labelKey: 'settings.sleepFormFields.sleepAtLabel' },
  { pageId: 'sleep', fieldId: 'sleep.sleepEndTime', labelKey: 'settings.sleepFormFields.wakeAtLabel' },

  { pageId: 'alerts', fieldId: 'alerts.enabled', labelKey: 'settings.alertFormFields.enableLabel' },
  { pageId: 'alerts', fieldId: 'alerts.position', labelKey: 'settings.alertFormFields.positionLabel' },
  { pageId: 'alerts', fieldId: 'alerts.maxVisible', labelKey: 'settings.alertFormFields.maxVisibleLabel' },
  { pageId: 'alerts', fieldId: 'alerts.defaultDuration', labelKey: 'settings.alertFormFields.defaultDurationLabel' },
  { pageId: 'alerts', fieldId: 'alerts.scale', labelKey: 'settings.alertFormFields.alertSizeLabel' },

  { pageId: 'location', fieldId: 'location.timezone', labelKey: 'settings.locationPage.timezoneLabel' },
  { pageId: 'location', fieldId: 'location.latitude', labelKey: 'settings.locationPage.latitudeLabel' },
  { pageId: 'location', fieldId: 'location.longitude', labelKey: 'settings.locationPage.longitudeLabel' },
  { pageId: 'location', fieldId: 'location.language', labelKey: 'languageAndRegion.languageLabel' },
  { pageId: 'location', fieldId: 'location.formattingLocale', labelKey: 'languageAndRegion.formattingLocaleLabel' },

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

  { pageId: 'profiles', fieldId: 'profiles.activeProfile', labelKey: 'settings.profilesPage.active.label' },

  { pageId: 'integrations', fieldId: 'integrations.google', labelKey: 'settings.integrationsPage.google.name' },
  { pageId: 'integrations', fieldId: 'integrations.immich', labelKey: 'settings.integrationsPage.immich.name' },
  { pageId: 'integrations', fieldId: 'integrations.unsplash', labelKey: 'settings.integrationsPage.unsplash.name' },
  { pageId: 'integrations', fieldId: 'integrations.nasa', labelKey: 'settings.integrationsPage.nasa.name' },
  { pageId: 'integrations', fieldId: 'integrations.todoist', labelKey: 'settings.integrationsPage.todoist.name' },
  { pageId: 'integrations', fieldId: 'integrations.tomtom', labelKey: 'settings.integrationsPage.tomtom.name' },
  { pageId: 'integrations', fieldId: 'integrations.github', labelKey: 'settings.integrationsPage.github.name' },

  { pageId: 'network', fieldId: 'network.hiddenNetworkConnect', labelKey: 'settings.networkPage.hiddenNetwork.connectButton' },
  { pageId: 'network', fieldId: 'network.hostname', labelKey: 'settings.networkPage.hostname.heading' },

  { pageId: 'data', fieldId: 'data.shareLayoutExport', labelKey: 'settings.dataPage.shareLayout.exportButton' },
  { pageId: 'data', fieldId: 'data.shareLayoutImport', labelKey: 'settings.dataPage.shareLayout.importButton' },
  { pageId: 'data', fieldId: 'data.templatesBrowse', labelKey: 'settings.dataPage.templates.browseButton' },
  { pageId: 'data', fieldId: 'data.fullBackupExport', labelKey: 'settings.dataPage.fullBackup.backupButton' },
  { pageId: 'data', fieldId: 'data.fullBackupRestore', labelKey: 'settings.dataPage.fullBackup.restoreButton' },
  { pageId: 'data', fieldId: 'data.backupReminderEnabled', labelKey: 'settings.dataPage.backupReminder.enableLabel' },
  { pageId: 'data', fieldId: 'data.backupReminderInterval', labelKey: 'settings.dataPage.backupReminder.remindAfterLabel' },

  { pageId: 'system', fieldId: 'system.advancedMode', labelKey: 'settings.systemPage.advanced.toggleLabel' },
  { pageId: 'system', fieldId: 'system.version', labelKey: 'settings.systemPage.version.heading' },
  { pageId: 'system', fieldId: 'system.checkForUpdates', labelKey: 'settings.systemPage.version.checkButton' },
  { pageId: 'system', fieldId: 'system.updateChannel', labelKey: 'settings.systemPage.version.stableChannel' },
  { pageId: 'system', fieldId: 'system.updateNotification', labelKey: 'settings.systemPage.updateNotification.enableLabel' },
  { pageId: 'system', fieldId: 'system.changelog', labelKey: 'settings.systemPage.changelog.heading' },
  { pageId: 'system', fieldId: 'system.rollback', labelKey: 'settings.systemPage.history.heading' },
  { pageId: 'system', fieldId: 'system.backups', labelKey: 'settings.systemPage.backups.heading' },
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
