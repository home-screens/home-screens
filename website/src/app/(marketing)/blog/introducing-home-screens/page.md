---
title: Introducing Home Screens
description: A free, open-source smart display system for Raspberry Pi — built to replace Dakboard and MagicMirror with a modern, self-hosted alternative.
date: '2026-04-11'
category: Updates
author: Bryan
image: /images/blog/home-display.webp
slug: introducing-home-screens
layout: blog
nextjs:
  metadata:
    title: Introducing Home Screens
    description: A free, open-source smart display system for Raspberry Pi — built to replace Dakboard and MagicMirror with a modern, self-hosted alternative.
    alternates:
      canonical: /blog/introducing-home-screens
---

## Why we built it

Our family wanted a central display in the kitchen. We wanted weather, a shared calendar, a meal planner, and a chore chart — all in one place. 

We built Home Screens because the existing options for smart home displays felt limiting. We started with MagicMirror which requires a lot of manual, time consuming, setup. Not everyone in the house was capable of doing this.  We switched to Dakboard which locks useful features behind limiting subscriptions that are not family friendly.  

So we built our own.  That's the image above.  The larger display is a Samsung Frame TV and flips through all the main screens.  The smaller display underneath is a touchscreen panel so the kids can interact and complete their chores and redeem rewards.

We believe Home Screens is different. It's a free, self-hosted web app that runs on a Raspberry Pi and turns any monitor into a smart display - with a drag-and-drop editor, {% $stats.moduleCount %} built-in modules, and beautiful full-screen dashboards.

## What makes it different

**A real visual editor.** Drag modules onto a canvas, resize them, rearrange them. No config files, no terminal. The editor runs in your browser and saves changes instantly.

**{% $stats.moduleCount %} built-in modules.** Weather (with {% $stats.weatherProviderCount %} providers), calendars, clocks, news, sports scores, stock tickers, meal planners, chore charts, photo slideshows, and more. Each module has multiple views — the clock alone has {% $stats.clockViewCount %} different styles.

**Your data stays local.** No cloud accounts, no telemetry you can't disable, no subscriptions. Everything is stored in a single JSON file on your Pi. You own your data completely.

**Multi-display support.** Run one hub pi and connect multiple displays around your home. Each display gets its own layout, dimensions, and rotation but share data for consistency. Manage them all from one editor.

**A plugin system.** Extend Home Screens with custom modules. Plugins are simple JavaScript bundles that load at runtime — no need to fork the project or rebuild.

## Control everything from your phone

Home Screens includes a remote control panel at `/remote` that turns any phone or tablet into a command center for your displays. No app to install — just open the URL in your browser when on your home network.

**Display control.** Switch screens, change profiles, reload displays, and trigger commands from across the house. If you're running multiple displays, you can target individual ones or broadcast to all of them.

**Chore management.** Create chores, assign them to family members, set daily or weekly schedules, and track completion. Kids get their own simplified view at `/chores` where they can check off today's tasks without needing a login. Parents manage everything — members, chores, rewards — from the remote panel.

**Meal planning.** Plan the week's meals, build a recipe library, and generate grocery lists. The meal planner syncs across all displays and the remote panel, so anyone in the family can update the plan from their phone while they're at the store.

**Rewards.** Set up a points-based reward system tied to chores. Kids earn stars for completing tasks and can redeem them for rewards you define. It's a simple way to keep everyone motivated.

## Getting started

Home Screens runs on any Raspberry Pi 4 or 5 with 2GB+ RAM. Installation takes about five minutes and you can one-shot the install like:

```bash
curl -fsSL https://raw.githubusercontent.com/home-screens/home-screens/main/scripts/install.sh | bash

```

Or clone the repo first if you prefer to inspect the script before running it:

```
sudo apt install git
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh
```

Or clone the repo and run it on any machine with Node.js:

```bash
git clone https://github.com/home-screens/home-screens.git
cd home-screens
npm install
npm run build
npm start
```

Then open your browser to the editor and start building your display.

## What's next

We're actively developing Home Screens and shipping updates regularly. Check the [changelog](/changelog) for the latest releases, or browse the [documentation](/docs) to learn more about what you can build.

Home Screens is MIT-licensed and open source. We'd love your feedback — [open an issue](https://github.com/home-screens/home-screens/issues) or star the repo if you find it useful.
