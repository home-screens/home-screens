/**
 * The module names the homepage showcase lists, by palette category.
 *
 * Plain data, kept apart from the React component so the main repo's
 * `website-stats.test.ts` can import it and assert the lists add up to
 * `MODULE_COUNT`, which the section header advertises. Health & Fitness is
 * the one registry category with no tab here: it ships no built-in modules
 * and only appears in the app once a plugin uses it.
 */
export const MODULE_SHOWCASE: Record<string, string[]> = {
  'Full Screen': [
    'Calendar',
    'Weather',
    'Chore Chart',
    'Meal Planner',
    'News',
    'Photo Viewer',
  ],
  'Time & Date': [
    'Clock',
    'Calendar',
    'Countdown',
    'Date',
    'Year Progress',
    'Multi-Month',
  ],
  'Weather & Environment': [
    'Weather',
    'Moon Phase',
    'Sunrise / Sunset',
    'Air Quality',
    'Rain Map',
  ],
  'News & Finance': ['News', 'Stock Ticker', 'Crypto', 'Sports Scores', 'Standings'],
  'Knowledge & Fun': ['Dad Joke', 'Quote', 'Word of the Day', 'This Day in History'],
  Personal: [
    'To-Do List',
    'Sticky Note',
    'Greeting',
    'Todoist',
    'Garbage Day',
    'Affirmations',
    'Meal Planner',
    'Chore Chart',
  ],
  'Media & Display': [
    'Text',
    'Image',
    'Video',
    'Photo Slideshow',
    'QR Code',
    'Web Embed',
    'Icon',
    'Shape & Divider',
    'Display Control',
  ],
  Travel: ['Traffic'],
};

/** How many modules the showcase lists in total. */
export const MODULE_SHOWCASE_TOTAL = Object.values(MODULE_SHOWCASE).reduce(
  (sum, names) => sum + names.length,
  0,
);
