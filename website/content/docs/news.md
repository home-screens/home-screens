---
title: News feeds
nextjs:
  metadata:
    title: News feeds
    description: Show headlines from any news site, blog, YouTube channel, or subreddit on your smart display. Local news, topics to follow, family-friendly filters, and a full-screen front page.
    alternates:
      canonical: /docs/news
---

The **News Headlines** module and its full-screen sibling **Full-Screen News** turn any feed into a headline tile, a scrolling ticker, a photo grid, or a whole front page. This guide covers picking feeds, the shortcuts for local news and topics, the filters that keep a family display family-friendly, and what happens when someone taps a story.

---

## Picking feeds

Drop a **News Headlines** module on the canvas and it starts with one well-known feed. Open the module's settings and you'll see the **Feeds** list at the top. Add as many as you like (up to 12); stories from every feed are merged into one list, newest first, with duplicates removed.

Under **Add a feed** you can:

- **Pick a preset.** A curated list of publishers and sections (top stories, world, business, technology, science, sports, health, entertainment) for the display's language. Switch on *All languages* to browse every preset.
- **Paste any feed link.** RSS, Atom, and JSON feeds all work, so that means almost every news site, blog, podcast, and newsletter. If a site has a feed link on its page, it will work here.
- **Local news.** Adds a feed of stories about the place you set under **Settings > Location & language**. Change the location and the feed follows.
- **Follow a topic.** Type a few words (your school district, a sports team, a company) and get a feed of stories that mention them.
- **YouTube channel.** Paste a channel link and the module shows the channel's latest uploads, thumbnails included.
- **Subreddit.** Type a subreddit name to follow its newest posts.

Every feed row has a **label** (shown as the story's source; leave it empty to use the feed's own name), an optional **colour** for the little source dot, a **Max stories** cap so one chatty feed doesn't crowd out the rest, and a **Check** button that fetches the feed right away and tells you how many stories it found or, in plain words, why it didn't work.

{% callout type="note" title="Feeds on your home network" %}
If you run your own reader (FreshRSS, Miniflux, Tiny Tiny RSS), turn on **Home network** for that feed. Without it the hub refuses to fetch from private addresses, which is what keeps this feature from being used to poke around inside your network.
{% /callout %}

---

## Views

- **Headline** rotates through stories one at a time, with the story picture, a "3 of 12" counter, and an optional summary.
- **List** stacks stories with a thumbnail, headline, source, and time. When they don't all fit, the list turns pages instead of cutting the last one off.
- **Ticker** scrolls headlines across the tile, cable-news style. A touch pauses it for a moment so you can read, or tap, a story.
- **Compact** is one line per story: source, headline, time.
- **Cards** is a photo grid. Choose one to three columns; the module fits as many rows as the tile allows and pages through the rest.

**Full-Screen News** has two views of its own: **Story** shows one story at a time with its photo filling the top of the screen and the same photo blurred behind everything, and **Front page** lays out a lead story plus the next five like a newspaper. Both follow the same feed list and filters as the tile.

---

## Filters

Filters live in every news module's settings and apply after the feeds are merged, so they work the same for presets, custom links, and topics.

- **Hide stories with these words** hides any story whose headline or summary mentions one of the words. Handy on a kitchen display: a few words keep the grimmest headlines off the wall where kids read them.
- **Only show stories with these words** turns a broad feed into a narrow one.
- **Hide stories older than** drops anything older than a few hours or days, so a weekly blog never looks like today's news.
- **Keep feed order** shows each feed's stories in the order the publisher chose instead of sorting everything newest first.

The **Just in** option marks stories under an hour old, and **Mark new stories** dots the ones that arrived since the display last refreshed, so a glance tells you something changed.

---

## Tapping a story

On a touch display, tapping a story shows a **QR code** that opens it on your phone. Switch **When a story is tapped** to *Show the summary* to read the story's summary right on the display (with a smaller code in the corner), or to *Do nothing*. The overlay closes on the next tap or after thirty seconds on its own.

Home Assistant and other scripts can also move the module along: `POST /api/display/module-command` with `{ "module": "news", "action": "next" }` shows the next story (or page); `prev`, `details`, and `dismiss` work too. See the [API reference](/docs/api#post-api-display-module-command).

---

## When a feed doesn't load

One broken feed never blanks the module: its stories are simply missing and a small line at the bottom names the feeds that didn't answer. Use the feed row's **Check** button to see the reason. The usual ones:

- **Not a feed.** The link is a normal web page. Look for an RSS or Atom link on the site, often in the footer.
- **Blocked address.** The link points at a private or local address. Turn on **Home network** for that feed if it really is on your network.
- **Set your location first.** The *Local news* feed needs a location under **Settings > Location & language**.
- **No response.** The site is down or slow; the module will try again on its next refresh.

---

## Next steps

- [Modules](/docs/modules#news-and-finance): the other news and finance modules
- [Editor](/docs/editor#module-scheduling): show the news only at breakfast
- [Weather](/docs/weather): set the location the local news feed uses
