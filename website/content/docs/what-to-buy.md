---
title: What to buy
nextjs:
  metadata:
    title: What to buy
    description: The hardware for a Home Screens display. A Raspberry Pi 4 or 5, a microSD card, the right HDMI cable, and any screen you already own. About $90 from scratch.
    alternates:
      canonical: /docs/what-to-buy
---

A Raspberry Pi, a memory card, a cable, and any screen with an HDMI socket. If you already have a monitor or a TV lying around, the rest comes to about $90. {% .lead %}

## The shopping list

| Item | Notes | Approx. cost |
|---|---|---|
| **Raspberry Pi 5 (4 GB)** | A Pi 4 works too. The Pi 5 is noticeably smoother with animations and bigger screens. | $60 |
| **Official 27 W USB-C power supply** | The Pi 5 needs this one. Phone chargers do not deliver enough power and cause random black screens. | $12 |
| **32 GB microSD card (A1 class)** | Any 16 GB or larger A1-class card works. SanDisk Ultra is a safe pick. | $8 |
| **Micro-HDMI to HDMI cable** | The Pi 4 and Pi 5 use **micro-HDMI**, not the full-size plug. Your old HDMI cable will not fit without this. | $8 |
| **A screen** | Any TV or monitor with HDMI. A portrait 1080 x 1920 panel suits the default layout, but any 1080p screen turned on its side is fine. | varies |

Total: **about $90** plus the screen.

## Which screen?

- **A repurposed monitor** on a kitchen wall is the classic setup. Turn it portrait for the default layout, or leave it landscape and pick the landscape version of any template.
- **A small TV** works the same way. Turn off its sleep timer so it stays on.
- **A touchscreen** is a bonus, not a requirement. With one, kids can check off chores and tap through screens on the wall itself. Without one, they do the same from a phone.
- **Brightness matters more than resolution.** Text on the wall is read from across the room, so a bright 1080p panel beats a dim 4K one.

## Pi 4 or Pi 5?

Both run Home Screens. The Pi 5 handles the full-screen weather and photo modules, screen transitions, and larger screens with more headroom, and it stays that way as you add modules. A Pi 4 with 2 GB or more is fine for a clock, weather, calendar, and chore chart. The Pi Zero and older models are too slow for the display, though a Pi Zero 2 can act as an [extra display](/docs/multi-display) driven by a bigger Pi.

## Already have a Pi running something?

You do not have to wipe it. Home Screens can be installed onto an existing Raspberry Pi OS setup with one command; see [the install script](/docs/getting-started#install-script). A fresh card with the ready-made image is still the smoother path.

## Next steps

- [Install](/docs/getting-started): flash the card and boot for the first time
- [Your first screen](/docs/first-screen): from a blank display to a working one in ten minutes
- [On your phone](/docs/remote-control): the family remote and the kids' chores page
