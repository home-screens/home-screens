/**
 * Dashboards shown in the homepage showcase, in display order.
 * Images live in public/images/dashboards/<image>.{jpg,webp} (640x1138,
 * 2x the rendered card width). Every screenshot is a real render of the app.
 */
export interface Dashboard {
  /** File stem under /images/dashboards */
  image: string;
  title: string;
  /** Scene time of day, shown in the eyebrow */
  when: string;
  description: string;
  modules: string[];
}

export const DASHBOARDS: Dashboard[] = [
  {
    image: "01-family-hub",
    title: "Family hub",
    when: "Friday 7:42 AM",
    description:
      "The all-rounder: digital clock, combined weather, a color-coded week grid, the chore board, trash pickup, and a countdown, all frosted over a mountain-lake photo.",
    modules: ["Clock", "Weather", "Calendar (week)", "Chore chart (compact)", "Garbage day", "Countdown", "Affirmations"],
  },
  {
    image: "02-chore-chart",
    title: "Chore chart",
    when: "Friday 4:20 PM",
    description:
      "Fullscreen chore chart in the Mist light theme with five kids, morning/afternoon/evening bands, per-kid completion dots, ticket counts, and the weekly star chart.",
    modules: ["Fullscreen chore chart"],
  },
  {
    image: "03-weather-station",
    title: "Weather station",
    when: "Friday 7:42 AM, storm day",
    description:
      "Every weather view at once: hero current conditions, hourly strip, 7-day forecast, a live severe-thunderstorm alert, the sunrise/sunset circle, moon phase, next-hour rain, and air quality.",
    modules: ["Weather (current", "hourly", "daily", "alerts", "precipitation)", "Sunrise & sunset (circle", "sky theme)", "Moon phase", "Air quality"],
  },
  {
    image: "04-morning-light",
    title: "Morning, light",
    when: "Friday 7:15 AM",
    description:
      "A soft sky gradient instead of a photo: greeting and big clock straight on the ground, then a 6-day forecast, a 3-day agenda, a before-we-leave checklist, commute times, and a quote.",
    modules: ["Greeting", "Clock (classic)", "Date (stacked)", "Weather (daily)", "Calendar (agenda)", "Todo", "Traffic", "Quote"],
  },
  {
    image: "05-cinematic",
    title: "Cinematic",
    when: "Friday 9:07 PM",
    description:
      "One giant flip clock on near-black with Bebas labels, an amber rule, current conditions, tomorrow's first events, and a quiet news ticker pinned to the bottom edge.",
    modules: ["Text", "Clock (flip)", "Date (minimal)", "Shape (divider)", "Weather (compact)", "Calendar (agenda)", "News (ticker)"],
  },
  {
    image: "06-photo-frame",
    title: "Photo frame",
    when: "Friday 5:20 PM",
    description:
      "A digital photo frame first: the slideshow fills the top two-thirds edge to edge, and a clean white footer carries the clock, conditions, and the next two days.",
    modules: ["Photo slideshow", "Clock (classic)", "Weather (compact)", "Shape (divider)", "Calendar (agenda)"],
  },
  {
    image: "07-markets-news",
    title: "Markets & news",
    when: "Friday 3:05 PM",
    description:
      "World clock for London and Tokyo, year progress, six stock cards with sparklines, a crypto strip, a headline list with summaries, and On This Day, over a dark aerial shot.",
    modules: ["Clock (world)", "Year progress", "Stock ticker (cards)", "Crypto (compact)", "News (list)", "History"],
  },
  {
    image: "08-minimal-light",
    title: "Minimal, light",
    when: "Friday 9:40 AM",
    description:
      "The airy one on a blush gradient: a word clock in a single dark card as the focal point, editorial date, compact weather, a two-day agenda, and the sunrise arc.",
    modules: ["Clock (word)", "Date (editorial)", "Weather (compact)", "Calendar (agenda)", "Sunrise & sunset (arc)"],
  },
  {
    image: "09-month-grid",
    title: "Month grid",
    when: "Friday, August 2026",
    description:
      "Fullscreen calendar in Midnight: a full month with birthdays and holidays rendered as their own kinds, shaded weekends, and a legend in the header.",
    modules: ["Fullscreen calendar (month grid)"],
  },
  {
    image: "10-three-day-schedule",
    title: "Three-day schedule",
    when: "Friday 10:12 AM",
    description:
      "Fullscreen calendar in the Linen light theme, a three-day schedule with the now line, forecast pills in the day headers, and a source legend in the footer.",
    modules: ["Fullscreen calendar (schedule view)"],
  },
  {
    image: "11-synthwave",
    title: "Synthwave",
    when: "Friday 11:14 PM",
    description:
      "Neon on deep violet with a soft glow behind the clock, a Bebas wordmark with the neon text effect, hourly weather, crypto cards, and two ticker tapes.",
    modules: ["Shape (glow)", "Clock (neon)", "Text (neon effect)", "Weather (hourly)", "Crypto (cards)", "Stock ticker (ticker)", "News (ticker)"],
  },
  {
    image: "12-bento",
    title: "Bento",
    when: "Friday 12:30 PM",
    description:
      "Solid tinted tiles on a flat light ground, iOS-widget style: a blue split clock, yellow weather, white two-day calendar, pink countdown, indigo moon, green chore rings, blue year progress, a guest Wi-Fi QR code, and a peach dad joke.",
    modules: ["Clock (split)", "Weather (current)", "Calendar (daily)", "Countdown (flip)", "Moon phase", "Chore chart (progress)", "Year progress", "QR code (Wi-Fi)", "Dad joke"],
  },
  {
    image: "13-morning-briefing",
    title: "Morning briefing",
    when: "Friday 6:52 AM",
    description:
      "Weather-aware greeting, a big classic clock, commute times, today and tomorrow with countdown pills, Todoist grouped by project, headlines, and an affirmation, over a moody dawn.",
    modules: ["Greeting", "Clock (classic)", "Date (stacked)", "Traffic", "Calendar (daily)", "Todoist", "News (compact)", "Affirmations (card)"],
  },
  {
    image: "14-kitchen-light",
    title: "Kitchen, light",
    when: "Friday 4:45 PM",
    description:
      "Kitchen command post over golden grass: clock and current weather, the whole week of meals, what is for dinner next, a yellow sticky note, today and tomorrow, trash day, and family chore progress rings.",
    modules: ["Clock", "Weather (current)", "Meal planner (week", "next meal)", "Sticky note", "Calendar (daily)", "Garbage day", "Chore chart (progress)"],
  },
  {
    image: "15-ambient",
    title: "Ambient",
    when: "Friday 8:31 PM",
    description:
      "The quiet one: an analog clock in a translucent dial and an editorial date over the photo, a serif quote in a faint card, and a sunrise/sunset arc at the bottom.",
    modules: ["Clock (analog)", "Date (editorial)", "Quote", "Sunrise & sunset (arc)"],
  },
  {
    image: "16-playroom",
    title: "Playroom",
    when: "Friday 3:30 PM",
    description:
      "For the kids: Caveat handwriting, a candy-blob ground, a fuzzy clock (half past three), the weekly star chart, a real sticky note, a birthday flip countdown, typewriter compliments, and what's for snack.",
    modules: ["Greeting", "Clock (fuzzy)", "Weather (current)", "Chore chart (star chart)", "Sticky note", "Countdown (flip)", "Affirmations (typewriter)", "Meal planner (next meal)"],
  },
  {
    image: "17-panels",
    title: "Panels",
    when: "Friday 8:30 AM",
    description:
      "Product-UI treatment: flat charcoal panels with hairline borders, no photo, no blur, one green accent. Digital clock, sun times, a forecast table, a four-week calendar grid, Todoist inbox, commute, air quality, and a compact stock list.",
    modules: ["Clock (digital)", "Sunrise & sunset", "Weather (table)", "Calendar (multi-week", "clean)", "Todoist", "Traffic", "Air quality", "Stock ticker (compact)"],
  },
  {
    image: "18-menu-board",
    title: "Menu board",
    when: "Week of August 17",
    description:
      "Fullscreen meal planner in the Paper theme: a full week of breakfast, lunch, dinner, and snack cards with emoji, serving times, and prep times; today highlighted.",
    modules: ["Fullscreen meal planner (week view)"],
  },
  {
    image: "19-game-night",
    title: "Game night",
    when: "Friday 7:48 PM",
    description:
      "Neon clock, countdown to kickoff, four games with one live, the AFC West table with playoff line, a sports headline feed, and a dad joke.",
    modules: ["Clock (neon)", "Countdown", "Sports (cards)", "Standings (table)", "News (list)", "Dad joke"],
  },
  {
    image: "20-editorial",
    title: "Editorial",
    when: "Friday 8:05 AM",
    description:
      "Newspaper, not dashboard: cream paper, Playfair and Lora throughout, hairline rules instead of cards. Date banner, clock and conditions on one line, a four-day agenda, word of the day, On This Day, and a quote.",
    modules: ["Date (banner)", "Shape (rules)", "Clock (classic)", "Weather (compact)", "Calendar (agenda)", "Word of the day", "History", "Quote"],
  },
  {
    image: "21-family-hub-light",
    title: "Family hub, light",
    when: "Friday 7:42 AM",
    description:
      "The family hub rebuilt on white glass with dark ink over a bright coastal meadow: same clock, weather, week grid, chores, trash day, and countdown.",
    modules: ["Clock (minimal)", "Weather (combined)", "Calendar (week)", "Chore chart (compact)", "Garbage day", "Countdown", "Affirmations"],
  },
];
