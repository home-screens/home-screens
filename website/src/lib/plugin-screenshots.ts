import type { RegistryScreenshot } from './plugin-registry-types'

/**
 * Pictures the website keeps for a plugin, under
 * `public/images/plugins/<id>/`. The homepage's fitness section and the
 * plugin pages both read this list, so a caption is written once.
 *
 * Every file here is a real module render (1280 x 840) captured off a live
 * display. A registry entry that carries its own `screenshots` list wins
 * over this table on the plugin page.
 */
export const SCREENSHOT_WIDTH = 1280
export const SCREENSHOT_HEIGHT = 840

export const LOCAL_SCREENSHOTS: Record<string, RegistryScreenshot[]> = {
  strava: [
    { src: '/images/plugins/strava/route-map.webp', caption: 'Route map' },
    { src: '/images/plugins/strava/latest-hero.webp', caption: 'Latest activity' },
    { src: '/images/plugins/strava/recent-activities.webp', caption: 'Recent activities' },
    { src: '/images/plugins/strava/training-volume.webp', caption: 'Training volume' },
    { src: '/images/plugins/strava/year-poster.webp', caption: 'Year so far' },
    { src: '/images/plugins/strava/goal-progress.webp', caption: 'Goal progress' },
  ],
  garmin: [
    { src: '/images/plugins/garmin/summary.webp', caption: 'Daily summary' },
    { src: '/images/plugins/garmin/body-battery.webp', caption: 'Body Battery' },
    { src: '/images/plugins/garmin/sleep.webp', caption: 'Sleep' },
    { src: '/images/plugins/garmin/weekly.webp', caption: 'Weekly training' },
    { src: '/images/plugins/garmin/latest-activity.webp', caption: 'Latest activity' },
    { src: '/images/plugins/garmin/training-readiness.webp', caption: 'Training readiness' },
  ],
}
