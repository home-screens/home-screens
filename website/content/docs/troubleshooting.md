---
title: Troubleshooting
nextjs:
  metadata:
    title: Troubleshooting
    description: What to check when a Home Screens display is black, a module says Needs setup, weather or a calendar stops loading, or the family remote cannot see the wall. Every answer starts in the editor, with terminal steps last.
    alternates:
      canonical: /docs/troubleshooting
---

Every answer here starts with what to check in the editor or on the phone, then what to check on the Pi itself, and only then anything that needs a terminal. If you get stuck, **Settings > Status > Diagnostics bundle** packs up the logs and settings, with passwords and keys removed, for a bug report or a question on Discord. {% .lead %}

## Find your symptom

- [The screen is still black after the first boot](#i-flashed-the-sd-card-but-the-screen-is-still-black-after-5-minutes)
- [Wi-Fi did not connect on first boot](#wi-fi-did-not-connect-on-first-boot)
- [I cannot find the Pi on my network](#i-cannot-find-my-pi-on-the-network)
- [The display is blank or shows a faint address](#display-is-blank)
- [The display says This wall needs to be let in](#the-display-says-this-wall-needs-to-be-let-in)
- [A module says Needs setup or Location not set](#a-module-says-needs-setup)
- [Modules are not updating](#modules-not-updating)
- [Weather is not loading](#weather-not-loading)
- [The calendar is not syncing](#calendar-not-syncing)
- [The picture is sideways or upside down](#the-picture-is-sideways-or-upside-down)
- [The family remote says Waiting for display](#the-remote-says-waiting-for-display)
- [The display shows a Wi-Fi icon](#display-shows-a-wi-fi-icon-at-the-bottom)
- [The mouse cursor is showing on a touchscreen](#cursor-visible-on-touchscreen)
- [Taps land in the wrong place on a touchscreen](#taps-land-in-the-wrong-place)
- [A button is missing on a touchscreen](#a-button-is-missing-on-a-touchscreen)
- [The wall says Too many tries](#the-wall-says-too-many-tries)
- [An update failed](#upgrade-failed)
- [The automatic backup did not work](#the-automatic-backup-did-not-work)
- [A backup won't restore](#a-backup-wont-restore)
- [I want to add a second display](#i-want-to-add-a-second-display)
- [How do I update or roll back?](#how-do-i-update-or-roll-back)
- [Getting a diagnostics bundle](#getting-a-diagnostics-bundle)
- [If you are comfortable with a terminal](#if-you-are-comfortable-with-a-terminal)

---

## First boot

### I flashed the SD card but the screen is still black after 5 minutes

1. **The HDMI cable.** The Pi 4 and Pi 5 use **micro-HDMI**, the small plug. A regular HDMI cable does not fit; you need a micro-HDMI to HDMI cable or an adapter.
2. **The power supply.** A Pi 5 needs the official 27 W USB-C supply. Phone chargers cause a flickering red light and random black screens, and may not boot at all.
3. **The card.** Flash it again with a fresh download of the image. A bad write is common with cheap or old cards.
4. **Wait a little longer.** On a slow card the first boot can take up to 5 minutes. If you saw the rainbow splash and then black, it is probably still working.

### Wi-Fi did not connect on first boot

If you used `wifi.txt` and the Pi never came online:

1. Put the card back in your computer. Is `wifi.txt` still there? Then the Pi could not use it. Check the name first: it must be exactly `wifi.txt`, not `wifi.txt.txt`, which Windows likes to create. Then check the `SSID=` and `PASSWORD=` lines for typos; the password must be at least 8 characters. The Pi tries the file again on every boot, so fix it, put the card back, and boot.
2. Is `wifi.txt` gone? Then the Pi saved the network and is trying to join it. A wrong password looks like this. Boot with a cable, or write a new `wifi.txt` with the right password; the Pi replaces the saved one.
3. **Use a cable for now.** Plug in a network cable, boot, and set up Wi-Fi from the editor's **Settings > Network** page.

### I cannot find my Pi on the network

The address is on the wall until you design your first screen, and a QR code with it. Scan it, or type it.

If the wall is showing screens already, the address on the pre-built image is `http://home-screens.local:3000`. If you used the install script, the Pi kept the name it already had (usually `raspberrypi`), so try `http://raspberrypi.local:3000`.

If neither name opens (a few routers do not support these names), open your router's admin page, find a device called `home-screens` or `raspberrypi`, and use its IP address, like `http://192.168.1.50:3000`.

---

## Display is blank

**Check in the editor first**

1. **Is it asleep?** Home Screens dims and sleeps by drawing black over the picture, so the panel stays lit unless you turned on **Switch the screen's power off too**. Open **Settings > Screen > Sleep & dimming** and look at the timeline: if now is inside a sleep or dim window, that is what you are seeing. Wake it from the family remote to check.
2. **Is it empty?** A display with nothing on it shows a faint "Nothing on this screen yet" with the address to open. That is not a fault; add a screen or turn one back on. (If you would rather an empty display stayed dark, turn off **Setup message** under Settings > Screen > Rotation & appearance.)
3. **Does the hub still see it?** **Settings > Status** shows when the display last checked in. A display that has not been seen for minutes is off, unplugged from the network, or crashed.

**Screen does not come back after sleep**

With **Switch the screen's power off too** turned on, the Pi cuts the screen's signal while the display sleeps and restores it on wake. Most monitors resync within a few seconds. A few never do: some TVs drop into standby and need their own remote or an HDMI-CEC command, and one known compositor bug (labwc issue 3352) left a Pi 5 with a Philips monitor dark until the kiosk restarted. If your screen stays black after a wake, turn the setting off in **Settings > Screen > Sleep & dimming** and the display goes back to painting black over the picture. A display's page under **Per display** shows whether screen power control is working at all; a display that has never checked in needs the latest display software and the `wlopm` package.

**Screen flashes on while asleep**

If a sleeping screen lights up for a moment every few seconds, your monitor is reconnecting while it looks for a signal. Update Home Screens, and when **Settings > System & updates** shows **Restart to finish the update**, restart; the screen then stays dark until the display wakes. Many monitors also have an **auto input** (or **auto source**) setting in their own menu; turning it off stops the monitor from reconnecting in the first place.

**Check on the Pi**

4. The panel's own power light, the HDMI cable at both ends, and the Pi's power light. A blinking red light on the Pi means a weak power supply.
5. Pull the power and plug it back in. The display comes back on its own within a minute.

**If you are comfortable with a terminal**

6. Check the service and its recent log:
   ```bash
   sudo systemctl status home-screens
   journalctl -u home-screens -n 50 --no-pager
   ```
7. See whether the screen manager thinks the panel is powered:
   ```bash
   XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 wlr-randr
   ```
   Both environment variables are required; over SSH they are not set for you.

---

## The display says This wall needs to be let in

You have set a password, and Home Screens does not remember this display's browser. Nothing is broken: open the editor, go to **Settings > Displays**, and click **Let in** next to the display that is waiting. It shows its screens within a few seconds.

This happens after a display's browser data is wiped (a re-flashed SD card, a browser reset), when you open the wall in a browser that has never shown it, or when the hub's address changed and the display now reaches it under a different name.

- **Just want to look at the wall on your own computer?** Use **Just looking? Sign in** on that page. Signing in shows the wall without adding a display.
- **It asks again after every restart.** That browser is not keeping cookies: a private window, a kiosk app set to clear its data, or a Pi with the read-only file system turned on. Either let it keep cookies for the hub's address, or list its network under **Settings > Security > Allowed networks** and turn on **Let displays on these networks in without asking**.
- **The page says "This browser keeps forgetting it's a wall".** Same cause: turn on cookies for the hub's address and load the page again.

More on who is let in automatically: [Which displays are let in](/docs/networking#which-displays-are-let-in).

## A module says Needs setup

Some modules cannot show anything until they have one thing from you, and say so in the editor and on the wall.

- **Location not set** on weather, moon, sunrise, air quality or rain map: open **Settings > Location & language**, type your town or zip code, and click **Look up**. The message links there from the editor. See [Weather](/docs/weather).
- **Needs setup** on a weather provider card: that provider wants a key. Open the card on **Settings > Weather** and paste one, or leave Open-Meteo as the default; it needs none.
- **No calendars picked yet** on a calendar module: no calendar is connected. See [Calendars](/docs/calendars).
- **No Todoist key yet** (or the same for another service) on Todoist, Immich or OneDrive, or **Traffic needs a Google Maps or TomTom key** on traffic: the service needs a key on **Settings > API keys**. See [API keys](/docs/calendars#api-keys).
- **The chore chart or meal planner is empty:** they need people, chores and meals, which are added from the family remote on a phone. See [Chores and rewards](/docs/chores) and [Meals](/docs/meals).

---

## Modules not updating

**Check in the editor first**

1. **The key.** Modules that pull from a service with a key (Immich, OneDrive, Todoist, traffic) show whether the key is set on **Settings > API keys**. Weather keys are on the provider's card under **Settings > Weather**. Stocks and news need no key.
2. **The refresh interval.** Every module that fetches data has one in its settings. A long interval means slow updates; that is not a fault.
3. **Is the Pi online?** **Settings > Status** shows the display's last check-in, and the wall shows a Wi-Fi icon in the corner when it has lost the network.

**If you are comfortable with a terminal**

4. Test the internet from the Pi (the quotes matter):
   ```bash
   curl -s "https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0" | head -c 200
   ```
5. Open the module's own address in a browser where you are signed in to the editor, for example `http://home-screens.local:3000/api/weather`, to see the data or the error. From a shell with a password set, add your display key from **Settings > Security**: `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/weather`.

---

## Weather not loading

1. **Location first.** A new install has no location, and the weather module says **Location not set** until you add one under **Settings > Location & language**. If a module has its own coordinates in its settings, check those too.
2. **The key.** On **Settings > Weather**, open the card for the provider you use. OpenWeatherMap, WeatherAPI, Pirate Weather and Met Office need a key, pasted on the card; the other five do not. Click **Test** on the card.
3. **Try another provider.** Set Open-Meteo as the default for a moment; it needs no key. If that works, the problem is the other provider's key or an outage on their side.
4. **The module's source.** Each weather module has a **Weather source** setting; make sure it is **Same as Settings** or a provider that is ready.
5. **No weather data** (or **No forecast data** on the forecast views) means the service answered but sent nothing for your location. Click **Test** on that provider's card, or set the module's **Weather source** to Open-Meteo to see whether it has data there.

See the [Weather](/docs/weather) page for how the providers compare.

---

## Calendar not syncing

**Check in the editor first**

Open **Settings > Calendar**. Every connected calendar shows when it last brought in events, and a calendar that is failing says so in plain words. That tells you which one to look at.

### A pasted calendar link

1. Open the link in a browser. If it does not download a calendar file, the link is wrong, has been turned off, or needs a login. Get a fresh link from the calendar's sharing settings and paste it again.
2. Google's links are cached for a few hours on Google's side, so a new event can take a while to show. For quicker updates, [sign in with Google](/docs/calendars#google-sign-in) instead.
3. Make sure the feed's tick box is on.

### Google sign-in

1. Click **Sign in with Google** again on the Calendar page. A sign-in can lapse after a long time unused, and switching between Home Screens' Google app and your own on **Settings > API keys** always needs a fresh one.
2. Check that the calendars you want are ticked. Only ticked calendars appear.
3. If you use your own Google app, make sure the Google Calendar API is still enabled for your project in the [Google Cloud console](https://console.cloud.google.com/). If the sign-in ends every 7 days, the app is still in Testing on Google's side: open **Google Auth Platform > Audience**, click **Publish app**, and sign in once more. With the built-in sign-in there is nothing to check there.

### iCloud sign-in

1. Make a fresh app password at [account.apple.com](https://account.apple.com) under **Sign-In and Security > App-Specific Passwords**; revoking or regenerating one silently breaks the connection.
2. On the Calendar page, remove the account that stopped working and add it again with the new password.
3. Check which calendars are ticked under the account. Nothing shows until at least one is.
4. Each iCloud calendar is fetched on its own, so one blank calendar does not stop the others. Untick and re-tick it; if it stays blank, check it still exists in the Calendar app.

The [Calendars](/docs/calendars) page walks through all three ways of connecting.

### One calendar is missing on one wall only

Someone may have hidden it there. On that wall, tap the **Calendars** key (a hidden calendar is crossed out in it) and switch **Show** back on. Hiding a calendar only changes the wall it was done on. See [Hide a calendar](/docs/calendars#calendars-sheet).

---

## The picture is sideways or upside down

1. **Settings > Screen > Rotation & appearance** has the orientation. Change it and the picture turns straight away, no reboot, and the choice sticks. Start here; anything changed elsewhere is eventually replaced by this setting.
2. If the picture is the right way up but everything is squashed or cut off, the resolution on the same page does not match the panel. Pick the one that matches.
3. **Sideways only after the screen has been off** (asleep with **Switch the screen's power off too**, or switched off at the monitor): your monitor disconnects from the Pi while it is off and comes back as a new screen. Home Screens puts the rotation back when that happens. Update Home Screens, then restart the device when **Settings > System & updates** says **Restart to finish the update**. On the Pi, `sudo journalctl -b -t home-screens-kanshi` shows the rotation being put back.
4. **Sideways right after an update, and you had turned the screen outside Home Screens** (with the Pi desktop's Screen Configuration tool, or a line of your own in labwc's autostart): Home Screens now keeps the rotation itself and starts from its own setting, which was never changed. Set the orientation in step 1 and it stays. Your earlier screen setup is kept on the Pi as `~/.config/kanshi/config.before-home-screens`.

**If you are comfortable with a terminal** and cannot reach the editor, the Pi has a rotation helper. Run it on the Pi, over SSH or from a keyboard, as the normal user, not with `sudo`:

```bash
bash /opt/home-screens/current/scripts/rotate-display.sh 90   # 0, 90, 180 or 270
```

When it cannot reach the screen (no kiosk running for that user) it says the rotation is saved and takes effect at the next restart. Set the same orientation in the editor afterwards so it survives the next update. The saved value lives in `data/kiosk.conf` as `DISPLAY_TRANSFORM`.

---

## The remote says Waiting for display

The phone can reach the Pi but the display has not checked in.

1. **Is the display on?** The wall itself may be off or asleep; the remote can wake a sleeping display, but not one that is unplugged.
2. **Did the hub just restart?** Every display shows as waiting for a few seconds after an update or a restart. Give it a minute.
3. **More than one display?** Pick the right one under **Send to** at the top of the Control tab.
4. **Settings > Status** in the editor shows the same last-seen time, and **Settings > Displays** shows every display's state when you have more than one.

---

## Display shows a Wi-Fi icon at the bottom

A Wi-Fi-off icon in the lower corner means the display has lost its network. It appears after a few seconds offline and clears as soon as the network is back.

1. Check the router or access point, and that the Pi is in range. Mesh networks and weak signal cause most drops.
2. **Settings > Network** in the editor shows the connection and lets you pick another network.
3. A cable is the most reliable fix for a display that keeps dropping.

**If you are comfortable with a terminal**, see [Wi-Fi keeps disconnecting](#wi-fi-keeps-disconnecting) below.

---

## Cursor visible on touchscreen

The cursor hides on its own after a few seconds; **Hide cursor after** under **Settings > Screen > Rotation & appearance** sets how long. If it stays no matter what, the screen manager on the Pi has crashed. **Settings > System & updates > Restart the whole device** clears it.

**If you are comfortable with a terminal**, restarting the browser is quicker than a reboot. Restarting the `home-screens` service does not help here; that is only the web server:

```bash
pkill -TERM chromium
```

The Pi brings the browser and the screen manager back on their own a second later.

---

## Taps land in the wrong place

When you turn the screen in Settings, touch turns with it, so a rotated touchscreen should simply work. If taps still land somewhere else, look at **Touch alignment**. It sits with the screen rotation: under **Settings > Screen > Rotation & appearance**, or on the main display's page under **Per display** if you have more than one display.

- **Follow the screen rotation** is the normal choice.
- **Leave touch as it is** is for a touchscreen that already handles being turned on its own. Pick it if taps were right before and went wrong after an update.
- **Your own numbers** is for a panel that reports taps mirrored or a little off. It takes the six numbers of a touchscreen calibration matrix, for example `-1 0 1 0 1 0` to flip left and right.

This setting covers the screen plugged into the device that runs Home Screens. A display-only Pi keeps its own touch setup.

**If you are comfortable with a terminal**, note that Home Screens writes `~/.config/labwc/rc.xml` itself and replaces changes made by hand on every update. Put a calibration matrix in the setting above instead of in that file.

---

## A button is missing on a touchscreen

**No Draw a note, Write a note, Add or Put on the menu button?** These buttons are on for modules added since they arrived. A module you already had keeps its old look until you switch them on in its settings:

- **Draw a note** and **Write a note**: **Draw on the wall** and **Write on the wall** on the Notes module.
- **Add** under a list: **Add on the wall** on the To-Do List, with **Tap on the wall** on too.
- **Add** on the grocery list: **Add on the wall** on either Meal Planner.
- **Put on the menu**, and the plus on an empty meal: **Plan meals on the wall** on either Meal Planner.

Some views have no room for these buttons; [Notes](/docs/notes#5-draw-a-note-on-the-wall) and [Lists](/docs/lists#5-adding-on-the-wall) say which ones do.

## The wall says Too many tries

Someone typed the wrong [grown-up code](/docs/chores#what-kids-can-and-cannot-do) too often. After five wrong tries on one wall or phone, its number pad waits a minute ("Too many tries. Try again in 45 seconds."), then takes the code again. After thirty wrong tries around the house, every wall, the chores page and signed-out phones wait ten minutes. To end that wait early, click **Let them try now** under **Settings > Family** in the editor, or tap it in the family remote's gear sheet.

---

## Upgrade failed

1. **Roll back.** **Settings > System & updates**, under **If an update caused trouble**, lists earlier versions. Pick the one you were on. Rolling back downloads that release again, so it needs an internet connection and takes about as long as an update. Your settings are saved before every update, so they come through intact.
2. **Check the space.** **Settings > Status** shows storage. An update needs a little free space to download and unpack.
3. **Try again.** A dropped connection during the download is the most common cause. **Check for updates** again.

**If you are comfortable with a terminal**

4. **The update stops and asks for the device password.** The account that runs Home Screens has to be able to use `sudo` without a password prompt, and this device is not set up that way. Type the device password into the box (on the pre-built image it is `screens` unless you changed it) and the update carries on. You only do this once, and it also unblocks Wi-Fi and name changes in Settings. Older versions cannot ask, so on those sign in over SSH (user `hs`, password `screens` on the pre-built image) and run:
   ```bash
   echo "$USER ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/010_$USER-nopasswd
   sudo chmod 0440 /etc/sudoers.d/010_$USER-nopasswd
   ```
   Type the account password when `sudo` asks, then **Check for updates** again. Earlier pre-built images did not include this for `hs`.
5. Drive the same steps by hand. Home Screens installs to `/opt/home-screens/current` and runs pre-built releases, so there is nothing to compile:
   ```bash
   cd /opt/home-screens/current
   bash scripts/upgrade.sh preflight
   bash scripts/upgrade.sh download v1.8.0
   sudo systemctl stop home-screens
   bash scripts/upgrade.sh deploy
   sudo systemctl start home-screens
   bash scripts/upgrade.sh finalize-deploy
   ```
   Replace `v1.8.0` with the version you want. As a last resort, re-run the installer with `--version <tag>`.
6. Read the log: `journalctl -u home-screens -n 100 --no-pager`.
7. Put a saved copy of the settings back, even if the server cannot start. Run this as the Home Screens account, without putting `sudo` before the restore command. The command refuses root or a different account before changing files and shows how to run it as the data owner. The names include the version they came from, and `restore-backup` validates the snapshot and restores settings, family identities and inline lists together under the same lock and recovery journal as the app:
   ```bash
   ls /opt/home-screens/current/data/backups/
   cd /opt/home-screens/current
   bash scripts/upgrade.sh restore-backup config-v1.8.0-20260725-101500.json
   sudo systemctl restart home-screens
   ```
   The same thing is available without a shell under **Settings > Backups & data**. Before a settings or family migration, including one triggered at startup, Home Screens saves the original settings with `migration` in the filename. These originals are kept permanently alongside the rotating upgrade snapshots, and the same offline command can restore them.

---

## The automatic backup did not work

**Settings > Backups & data > Automatic backups** says what went wrong next to **Last backup**, and when it tries again (an hour later, up to three times a day). **Back up now** tries straight away once you have fixed it.

- **There is not enough room on this hub.** The memory card is nearly full. Lower **Keep the last**, set **Pictures** to **Leave them out**, or remove old backups from the list. A backup that only lacked room for its pictures is still saved, without them, and says how much room they needed.
- **Something went wrong while saving it.** Try **Back up now**. If it keeps happening, attach a [diagnostics bundle](#getting-a-diagnostics-bundle) to an issue: it holds the backup record, never the passwords.
- **Saved, but without your keys.** Choose a backup password under **Include my keys and connected accounts**, and set an editor password in **Settings > Security** if the page asks for one.

When the backup was saved but **could not be sent** to your storage folder, the backup is safe on the hub and Home Screens sends it again every hour. The reason is on the storage folder card:

- **The name or password was not accepted.** Click **Change** and type them again. If your storage uses two-step sign-in, make an app password there and use that.
- **That folder was not found.** Make the folder on your storage first, then check the address ends with it. A network share makes its own folder, so for a share this means the folder could not be made there.
- **There is no share called … on ….** The share name in the address is not one the storage has. **Check it works** lists the ones it does have; click one to use it.
- **Home Screens cannot save files in the … share.** The user can see the share but may not change files in it (or is not let into it at all). On your storage, let that user change files in the share. On a UniFi Drive or a Synology this is the user's setting on the shared drive or shared folder.
- **The storage is out of room** or **would not take a file this big.** Free up space there, or leave pictures out of the backups. Some Nextcloud setups limit the size of one upload.
- **Home Screens could not reach the storage** or **took too long to answer.** Check the storage is switched on and that the address works from a computer at home. If your router keeps the storage on a separate network (a VLAN or guest network) from the hub, let the hub reach it.
- **This storage only offers an old kind of sharing.** It only speaks SMB 1, which Home Screens does not use. Turn on SMB 2 or newer in the storage's settings (often called the minimum or maximum SMB protocol).
- **The storage sent Home Screens to a different address.** Open the address in a browser, see where it ends up, and use that address instead.
- **The security certificate could not be checked.** The storage uses its own certificate. Use its `http` address inside your home, or give it a proper certificate.

**Check it works** on the storage folder card tries the folder without waiting for the next backup.

## A backup won't restore

A restore from **Settings > Backups & data**, or from **Restore a backup** in the family remote's gear, can stop with one of these:

- **That file isn't a Home Screens backup.** Pick a file made with **Save a backup**, with **Back up everything** on the phone, or one from **Backups on this hub**. A file from **Share layout** is not a backup: bring it in with **Import layout** instead.
- **There isn't enough room on Home Screens for this backup** (or for the pictures in it). The hub's memory card is nearly full. Free some space, for example by removing old backups from **Backups on this hub**, or restore a backup made without pictures.
- **Couldn't reach Home Screens.** Check that the hub is switched on and connected, then try again.

## I want to add a second display

One Pi can drive several displays. The extra Pis only run a browser, so a Pi Zero 2 is enough for a clock and calendar. The [Multi-display guide](/docs/multi-display) covers the install, adding the display under **Settings > Displays**, and designing its own screens.

## How do I update or roll back?

**Settings > System & updates**. **Check for updates** installs the latest release; the list under **If an update caused trouble** goes back to any earlier one. Both need an internet connection. More in the [FAQ](/docs/faq#how-do-i-update-to-the-latest-version).

---

## Getting a diagnostics bundle

For anything you cannot work out, Home Screens can export a diagnostics bundle you can attach to a GitHub issue or share on Discord:

1. In the editor, go to **Settings > Status** and click **Diagnostics bundle**.
2. Or from a shell: `curl -O http://home-screens.local:3000/api/system/diagnostics`. With a password set this needs the session from a signed-in browser, so the button is the easier route.

The bundle holds recent logs, system information, module counts and error traces. API keys, tokens, session secrets and other secrets are removed before it is built, so it is safe to attach to a public issue. If you are unsure, unzip it and look before uploading.

---

## If you are comfortable with a terminal

The rest of this page assumes SSH access to the Pi (the pre-built image's login is under [Install](/docs/getting-started#the-pis-own-login)).

### Is the hub running?

Ask the hub directly, from the Pi or from any computer on your network:

```bash
curl http://<pi-address>:3000/api/health
```

A running hub answers with its version, for example `{"ok":true,"version":"1.13.0",...}`. This works with a password set and from an address that is not on the allowlist, so it separates "the hub is down" from "I cannot sign in". If nothing answers, check the service: `sudo systemctl status home-screens` and `journalctl -u home-screens -n 30 --no-pager`. If it answers but the display is still blank, the problem is on the screen's side; see [Display is blank](#display-is-blank).

### High memory usage on Raspberry Pi

1. **Fewer modules.** Each one uses memory; remove those you do not look at.
2. **Longer refresh intervals.** Shorter intervals mean more fetches and re-renders. Five to fifteen minutes is plenty for most modules.
3. **Watch it over time:** `watch -n 5 free -h`.
4. **Restart the service** if memory grows: `sudo systemctl restart home-screens`.
5. **Fewer screens.** Several screens full of modules multiply the memory in use.
6. **The browser** takes a large share on its own: `ps aux | grep chromium | grep -v grep`.

**Do not add swap.** The installer removes the swap file and uninstalls `dphys-swapfile` on purpose, because constant swapping wears out SD cards, and tunes the kernel to avoid swapping instead. If you are short on memory, move to a 4 GB or larger Pi or run fewer fetching modules.

### Cannot reach the editor from another device

1. Use the Pi's IP address, not `localhost`, which only works on the Pi itself: `hostname -I` prints it.
2. Check the firewall allows port 3000 (or your custom port): `sudo ufw status`.
3. If a password is set and the session seems stuck, clear the browser's cookies for the site.
4. The server should be listening on all interfaces (`0.0.0.0`), not just `127.0.0.1`.

### Wi-Fi keeps disconnecting

1. The installer sets up a connectivity watchdog that recovers on its own. Check it is active: `systemctl list-timers | grep wifi`.
2. See whether NetworkManager thinks it is online: `nmcli general status` and `nmcli device wifi list`.
3. The Broadcom Wi-Fi driver on the Pi can be flaky; look for firmware errors: `dmesg | grep brcmfmac | tail -20`.
4. Restart the connection if it is stuck: `sudo nmcli device disconnect wlan0 && sudo nmcli device connect wlan0`.

The installer applies Wi-Fi hardening (infinite reconnect retries, disabled MAC randomization, disabled IPv6 on Wi-Fi, masked suspend). See [Networking > Wi-Fi reliability](/docs/networking#wi-fi-reliability).

### Connecting to Wi-Fi fails with "key-mgmt: property is missing"

On releases before 1.15, **Connect** under **Settings > Network > Available Wi-Fi networks** failed with `802-11-wireless-security.key-mgmt: property is missing` whenever the Pi already had a saved entry for that network: reconnecting to your own network, retyping its password, or joining it from a USB adapter. The cause is a bug in the `nmcli` that ships with Raspberry Pi OS Trixie (NetworkManager 1.50 to 1.54.3), which rebuilds a reused saved entry without its security type. Update Home Screens; 1.15 creates its own saved entry per network and adapter and never reuses one. If you cannot update yet, join from a terminal instead:

```bash
sudo nmcli connection add type wifi ifname wlan0 con-name "HomeNet (wlan0)" ssid "HomeNet" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "your-password"
sudo nmcli connection up "HomeNet (wlan0)"
```

### A display is stuck on a deleted address

If you delete a display under **Settings > Displays** while its Pi is still pointed at the old address, the Pi shows a **display not found** screen with a 60-second countdown and a **Go to the main display now** button. Let it finish or click the button; it moves to the hub's default display with no power cycle. A brand-new Pi that has never been added skips the countdown and waits to be added. See the [Multi-display guide](/docs/multi-display#if-something-goes-wrong).

### Finding which Pi is reporting under a display ID

**Settings > Displays** shows each display's source IP and viewport, so you can trace which physical Pi is reporting. Two browser tabs at the same address on one Pi collapse into a single row with a `×2 tabs` badge. Two distinct IPs under one display ID show as separate rows, which means two Pis are pointed at the same display address; reinstall one with a different `--display-id`.

### A display's card is missing CPU and temperature

Display-only Pis report hardware stats to the hub every 30 seconds through a systemd timer (`home-screens-reporter.timer`). If a card under **Settings > Displays** has none:

1. On that Pi: `systemctl status home-screens-reporter.timer` and `systemctl list-timers | grep reporter`.
2. Read its log: `journalctl -u home-screens-reporter.service -n 20 --no-pager`.
3. Confirm the display has been added on the hub; reports from displays that are still waiting to be added are dropped.
4. Run the reporter by hand to see the error: `/usr/local/bin/home-screens-reporter.sh`, or `REPORTER_DRY_RUN=1 /usr/local/bin/home-screens-reporter.sh` to see what it would send.

### The settings file seems broken after hand edits

If you edited `data/config.json` by hand and the display will not load, run the built-in validator:

```bash
cd /opt/home-screens/current
npm run config:check
```

It reports each problem with a path to it (for example `screens[screen-1].modules[mod-3]`). If the file is beyond repair, see [How do I reset to factory defaults?](/docs/faq#how-do-i-reset-to-factory-defaults) to start fresh while keeping a copy of the broken file.
