---
title: How to Choose Smart Display Software for Your Raspberry Pi (2026)
description: A plainspoken decision guide for picking between MagicMirror, Dakboard, and Home Screens — based on time, budget, and how much DIY you actually want.
date: '2026-04-29'
category: Guides
author: Bryan
image: /images/blog/choosing-smart-display.webp
slug: choosing-smart-display-software
layout: blog
nextjs:
  metadata:
    title: How to Choose Smart Display Software for Raspberry Pi (2026)
    description: A decision guide for MagicMirror vs Dakboard vs Home Screens — pick the right smart display software based on cost, setup time, and self-hosting.
    alternates:
      canonical: /blog/choosing-smart-display-software
---

## Quick answer

**Home Screens is the right choice for most households** — a polished visual editor, no monthly subscription, multi-display support built in, and your data stays on your Pi. Pick **MagicMirror** instead if you genuinely enjoy editing config files and want the largest community widget library. Pick **Dakboard** if you want managed cloud hosting and don't mind paying $6/month for two screens.

## Which question are you actually asking?

Most people Googling "smart display for Raspberry Pi" are really asking one of three different questions. The right software depends on which one applies to you.

- **"How cheap can I make this?"** → MagicMirror. Free forever, but you'll spend hours in config files.
- **"How fast can I get this on the wall?"** → Dakboard. Sign up, paste a URL into a browser, done. Costs money every month.
- **"Can I have both?"** → Home Screens. Free, self-hosted, with a drag-and-drop editor.

If you're not sure which question you're asking, keep reading.

## What does each option actually cost?

Pricing is the cleanest filter, so start here.

| Software   | Cost                                                  | Where data lives          | Subscription?      |
|------------|-------------------------------------------------------|---------------------------|--------------------|
| MagicMirror | Free (open source, donations welcome)                | Local on your Pi          | No                 |
| Dakboard    | Free (1 screen, branded) or $6/mo for 2 screens      | Dakboard cloud servers    | Yes (paid tiers)   |
| Home Screens | Free (open source)                                  | Local on your Pi          | No                 |

Dakboard's free tier exists, but it limits you to 1 screen, displays Dakboard branding, and refreshes calendars only every 60 minutes. The Essential tier at $6/month (or $5/month billed annually) unlocks 2 custom screens, all integrations, and custom CSS. Each additional screen costs extra. The Plus tier ($10/month, or $8/month annual) gets you 3 screens, unlimited calendars, and a 500 MB media library.

MagicMirror and Home Screens have no paid tiers because both are free, open source projects. The only cost is the Pi itself (~$50–$80 for a Pi 4 or 5 with 2GB or more memory).

## How much setup time does each one need?

This is the second-biggest filter and the one most people underestimate.

**MagicMirror:** Typically 2–6 hours of first-time setup. You install the software, then configure widgets by editing a config file. Each widget has its own instructions and quirks. Expect to spend an evening getting the layout right, and another evening tweaking widgets that don't behave like you expected. Long-term maintenance means editing config files from a terminal.

**Dakboard:** Typically 15–30 minutes. You sign up, drag widgets onto a canvas in their web editor, and load the URL on your Pi's display. The UI is polished and the experience is smooth — this is what you're paying for.

**Home Screens:** Typically 10–20 minutes — the fastest of the three. A one-line install script does everything: sets up the app and configures your Pi to display it full-screen. The visual editor runs in any browser on your home network. Drag modules onto the canvas like Dakboard, but everything stays on your Pi. [See the installation guide](/docs/getting-started) for the full one-liner.

## Where does my data actually go?

This matters more than people realize, especially for family calendars and photos.

- **MagicMirror** stores everything on your Pi. Calendar logins, account keys, and photos all stay in local files. Nothing leaves your home network unless a widget needs to fetch outside data — like a weather forecast or a sports score.
- **Dakboard** stores your screen layout, widget configuration, and (depending on tier) media in their cloud. Your displays talk to Dakboard's servers, which talk to your Google Calendar, weather provider, and so on. If Dakboard goes down or you stop paying, your displays stop working.
- **Home Screens** stores everything locally on your Pi. Your displays talk to the Pi directly over your home network — no internet required for normal use. Anonymous usage data is collected by default and can be turned off in settings.

If you care about privacy, vendor lock-in, or keeping your displays working without an internet connection, self-hosted (MagicMirror or Home Screens) is the right answer.

## How much does adding more displays cost?

This is where the pricing math diverges sharply.

| Setup                | MagicMirror | Dakboard                                     | Home Screens |
|----------------------|-------------|----------------------------------------------|--------------|
| 1 display            | $0          | $0 (with branding) or $6/mo                  | $0           |
| 2 displays           | $0          | $6/mo (Essential covers 2)                   | $0           |
| 3 displays           | $0          | $10/mo (Plus covers 3) or $11/mo (Essential + 1 add-on) | $0           |
| 5 displays           | $0          | ~$20–$25/mo depending on tier and add-ons    | $0           |

For a single display, the choice mostly comes down to setup style. For multi-display households — a kitchen hub, a hallway display, a kid-facing chore screen — Home Screens has a structural advantage: every additional display is free, and the multi-display hub is built in, not a paid upgrade.

## Can I extend it later?

All three are extensible, but the bar to do so is different.

| Software   | How you extend it                              | Skill required                       |
|------------|------------------------------------------------|--------------------------------------|
| MagicMirror | Write a custom widget in JavaScript           | Comfortable with code and a terminal |
| Dakboard   | Custom styling, embedded web pages, Zapier integrations | A little CSS for visual tweaks |
| Home Screens | Drop in a custom plugin                      | Basic JavaScript; a [starter template](https://github.com/home-screens/home-screens-plugin-template) is provided |

MagicMirror has the largest community module library — hundreds of third-party modules, though quality varies. Home Screens ships with [{% $stats.moduleCount %} built-in modules](/docs/modules) covering most common needs (weather, calendars, news, sports, meal planning, chore charts) and a plugin system for the rest.

## What does each one do best?

Strip the marketing copy and here's what each tool actually wins at:

- **Home Screens wins at:** a polished visual editor without a subscription, running multiple displays from one Pi at no extra cost, and family-friendly features like chore charts, meal planning, and a kid-mode chore view.
- **MagicMirror wins at:** rock-bottom cost, the largest community widget library, and being endlessly customizable for people who enjoy tinkering.
- **Dakboard wins at:** zero-friction onboarding and managing displays in locations you'll never physically touch.

If you enjoy tinkering and want the lowest price possible, MagicMirror is hard to beat. If you want fully managed cloud hosting and don't mind paying monthly, Dakboard is the easiest path. For most households, Home Screens is the practical pick.

## Frequently asked questions

### Is MagicMirror still actively maintained?

Yes. As of 2026, MagicMirror² (the current version) ships regular updates and has an active community of contributors. The project is free, open source, and run by volunteers.

### Why would I pay for Dakboard if free options exist?

Convenience. Dakboard's setup is genuinely faster and the UI is more polished than MagicMirror's. If your time is worth more than $72/year (a single Essential plan) and you don't enjoy editing config files, the math works for one or two displays. For three or more displays, the monthly cost adds up.

### What's the difference between Home Screens and Dakboard?

Both have visual drag-and-drop editors and similar widget catalogs. The main differences: Home Screens is free and self-hosted (your data stays on your Pi); Dakboard is paid and cloud-hosted (your data and configuration live on Dakboard's servers). Home Screens also includes built-in chore charts, meal planning, and a kid-friendly remote control surface that Dakboard doesn't ship.

### Can I switch between them later?

Yes, but not painlessly. None of these tools share a config format, so switching means rebuilding your screen layout. The hardware (Raspberry Pi + monitor) is universal — the software is what locks you in.

### Do I need a Raspberry Pi specifically?

No, but it's the easiest option. The Raspberry Pi is the most common choice because it's cheap (~$50), low-power, silent, and stays on 24/7 without complaint. All three options also work on any always-on computer — a mini PC, an old laptop you're not using, or even a Mac or Windows desktop you leave running. Dakboard only needs a browser on the display side, so anything that opens a web page works.

## What to do next

If you've decided:

- **Home Screens:** [the install script](/docs/getting-started) takes about 10 minutes. Or [see the full feature comparison](/vs) if you want a side-by-side first.
- **MagicMirror:** start at [magicmirror.builders](https://magicmirror.builders/) and budget an evening for setup.
- **Dakboard:** start at [dakboard.com](https://dakboard.com/) and pick a tier based on screen count.
