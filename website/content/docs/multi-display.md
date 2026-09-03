---
title: Multi-display
nextjs:
  metadata:
    title: Multi-display
    description: Run more than one display from a single Home Screens Pi. A kitchen touchscreen, a bedroom monitor and a living-room TV, each with its own screens and orientation.
    alternates:
      canonical: /docs/multi-display
---

One Pi can drive every display in the house. The Pi that runs Home Screens is the **hub**; every other display is a cheaper Pi that only runs a browser pointed at the hub. Each display gets its own screens, size and orientation, so a portrait kitchen touchscreen and a landscape living-room TV live side by side. {% .lead %}

Nothing changes until you add a second display. A single-display install looks and works exactly as before.

## What you need

- Your existing Home Screens Pi, which becomes the hub
- One more Raspberry Pi per extra display. It only runs a browser, so a **Pi Zero 2** or a Pi 3 is enough for a clock and calendar; use a Pi 4 or 5 for full-screen photos and weather
- A screen and an HDMI cable for each, and the hub's address (for example `http://192.168.1.100:3000`)

## 1. Set up the extra Pi

Flash plain [Raspberry Pi OS Lite 64-bit](https://www.raspberrypi.com/software/operating-systems/) onto its card (in Raspberry Pi Imager, Lite is under **Raspberry Pi OS (other)**), boot it, and run the installer with the display-only flags:

```bash
sudo apt install git
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh --display-only --backend http://192.168.1.100:3000
```

Replace the address with your hub's. The installer asks how the screen is mounted, sets up the browser, and reboots into it. It skips everything a hub needs, so it is quick. `--display-id kitchen` gives the display a name of your choosing; otherwise one is generated. The full flag list is under [Raspberry Pi internals](/docs/raspberry-pi#installer-flags).

On boot the new Pi looks for the hub. If the hub is off, it shows a waiting screen and keeps trying; the moment the hub answers, the display comes up on its own.

## 2. Add it in the editor

The new display shows up on the hub within a few seconds. In the editor, open **Settings > Displays**.

{% screenshot name="settings-all-displays" caption="Settings > Displays. Every display in the home, and a new one waiting to be added." /%}

1. Under **waiting to be added**, click **Add** next to the new display.
2. Give it a name, such as "Kitchen" or "Bedroom TV".
3. Check the size and orientation, which are filled in from what the display reported, and save.

The display switches to its own screens a few seconds later. The first time you add a display, the editor also creates a display called **main** for the hub's own screen, holding everything you had designed so far, so you will see two displays right away. The display's ID (the short lowercase name) is fixed once added; its friendly name can change any time.

A new display starts with no screens. Click it, then **Edit screens**, and design for it the same way as your first one; the [templates](/docs/first-screen#2-pick-a-template) all come in portrait and landscape.

## 3. Design for each display

Every display has its own list of screens, designed at its own shape. In the editor toolbar, a **Display Switcher** pill shows which display you are editing; click it to switch. The canvas, the screen tabs and the panel on the right all follow.

{% screenshot name="editor-display-switcher" caption="The Display Switcher in the editor toolbar." /%}

## Shared settings and per-display settings

With more than one display, the Settings sidebar splits in two:

- **Defaults** are the pages you already know: Screen, Location & language, Weather, Calendar and the rest. Every display uses these values until you override one.
- **Per display** lists each display. Its **Overview** tab shows its status and profile; its **Overrides** tab lists every setting it can have its own value for, with an **Override** button on each row and **Reset to default** once overridden. The row always says where the value is coming from.

{% screenshot name="settings-per-display" caption="One display's Overrides tab. Size and orientation are always the display's own; the rest inherit until you press Override." /%}

Size and orientation are always per display, since every display has its own physical screen. Sleep and alerts are overridden as a whole group each, not one field at a time, so a display that wants its own bedtime sets all of its sleep settings on its own page. A Defaults page shows a banner naming any displays that override its fields, with a link to each.

## Profiles per display

Each display has its own [profiles](/docs/profiles). Switching a profile from the family remote or a home-automation script changes that one display; the others keep theirs.

## The family remote

Once there is more than one display, the family remote's Control tab gets a **Send to** row: pick a display, or **All** to send brightness, sleep, wake and alerts to every display at once. Changing screens and switching profiles work on one display at a time. Timers get a **Show on** row for the same reason.

A **Display Control** module on a touchscreen can do the same from the wall, aimed at itself, another display by name, or all of them. See [Display Control](/docs/module-reference#display-control).

## If something goes wrong

**The new display does not appear under waiting to be added.** Check that it is on and can reach the hub's address (the same one you typed into the installer). It appears within about ten seconds of booting and disappears from the list again if it has not been heard from for two minutes, so restart it and look again. On the display itself, the waiting screen names the hub address it is trying.

**A display shows "display not found" with a countdown.** Its entry was deleted from the hub. Let the countdown finish, or press **Go to the main display now**, and it shows the hub's main display; or add a display with the same ID again.

**Two displays show the same thing.** Two Pis were installed with the same display ID. Reinstall one with a different `--display-id` and add it as its own display.

**A display says Offline in Settings > Displays.** Heartbeats live only in the hub's memory, so every display shows offline for a few seconds after the hub restarts or updates. If one stays offline, it is off, disconnected from the network, or pointed at the wrong hub address.

**The Display Switcher is missing.** It only appears once a second display exists.

## Under the hood

For scripts and home automation, every display command takes a `display` parameter, and `all` broadcasts; see [Targeting a display](/docs/api#targeting-a-display-multi-display) in the API reference. The hub's list of displays and their status is at [GET /api/displays](/docs/api#get-api-displays). The configuration shape, the limits (64 displays, 256 screens each) and the reserved IDs are under [DisplayNode](/docs/configuration#display-node-multi-display) in the configuration reference, and the display-only installer and self-update mechanics are in [Raspberry Pi internals](/docs/raspberry-pi#display-only-pis).

## Next steps

- [Voice control](/docs/voice-control): drive every display from Home Assistant
- [Profiles and schedules](/docs/profiles): a different set of screens per display and time of day
- [On your phone](/docs/remote-control): the family remote's Send to row
