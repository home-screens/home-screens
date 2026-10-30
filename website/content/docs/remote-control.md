---
title: On your phone
nextjs:
  metadata:
    title: Home Screens on your phone
    description: Two addresses for the family. The family remote lets grown-ups run chores, lists, notes, meals, timers and photos and control the wall. The kids' page lets children check off today's chores. Nothing to install.
    alternates:
      canonical: /docs/remote-control
---

Home Screens has two phone pages. Nothing needs installing; both open in the phone's browser on your home WiFi. **Settings > On your phone** in the editor shows the addresses and QR codes for both. {% .lead %}

{% screenshot name="settings-phone" caption="Settings > On your phone. Scan a code, or print both and stick them on the fridge next to the display." /%}

| | **Kids: check off chores** | **Parents: family remote** |
|---|---|---|
| Address | `/chores` | `/remote` |
| Who | Children, or a shared tablet in the kitchen | Grown-ups |
| What it does | Today's chores and the rewards store. Nothing else can be changed. | Chores, lists, notes, meals, timers, photos, and control of the wall |
| Password | Never asks for one, on purpose | Asks once you set one |

Opening the plain address (`http://home-screens.local:3000` on the pre-built image) on a phone shows a menu with both, plus the display itself.

{% screenshot name="phone-launcher" phone=true caption="The plain address on a phone." /%}

## Put it on the home screen

The pages behave like apps once they have an icon:

- **iPhone or iPad:** open the address in Safari, tap the share button, then **Add to Home Screen**.
- **Android:** open the address in Chrome, tap the three-dot menu, then **Add to Home screen**.

Do this once per phone. A kid's tablet gets the chores page; a parent's phone gets the family remote.

## Ask for a password

Until you set one, anyone on your WiFi can open the family remote and the editor. **Settings > On your phone** has **Ask for a password on the family remote**; it sets the same password the editor uses. After that the family remote and the editor ask for it, the wall keeps working, and the kids' page stays open. Sessions last 30 days, or 90 if you tick **Remember me for 90 days** when you sign in, so nobody is typing it every day.

---

## The family remote

Seven tabs along the bottom: **Control**, **Timers**, **Chores**, **Lists**, **Notes**, **Meals** and **Photos**. Chores, Lists, Notes, Meals and Photos come alive once the matching module is on a screen; until then they explain what to add.

### Control the wall

{% screenshot name="remote-control" phone=true caption="The Control tab: which screen is up, next and previous, sleep, alerts and brightness." /%}

- The card at the top says which screen the wall is showing and whether the display is **Active**, **Dimmed**, **Asleep** or **Offline**. It refreshes every few seconds, faster right after you tap something.
- **Arrows** move to the previous or next screen.
- **Sleep Display** blacks the wall out (and cuts the screen's power, if that display has **Switch the screen's power off too** turned on); the same button wakes it again.
- **Send Alert** puts a message on the wall: an info, warning or urgent banner, with a title and how long it stays. **Persistent** keeps it up until someone dismisses it.
- **Brightness** dims the wall from full down to off. The wall keeps that level until someone picks another: after dimming, sleeping or an alert it comes back to it, and tapping the wall never turns it up.
- **Slideshow** appears while the screen on show has a photo slideshow: go back a photo, pause on one, or skip ahead. A screen that rotates away and back starts playing again.
- With more than one display, a **Send to** row at the top picks which display these controls talk to, or **All displays** at once. Screen navigation works one display at a time.

### Timers

The **Timers** tab starts a big countdown that takes over the whole wall, made for kids. Tap a preset (30 seconds to 15 minutes) or type a length up to 4 hours, pick a look (**Glow ring**, **Timer face**, **Color fall** or **Star path**), and start. A soft chime can play at the end.

A **routine** is a saved list of timed steps, each with its own emoji and length: get dressed, brush teeth, shoes on. Steps run one after another; a step can instead be set to **Wait for a Done tap** on the wall before the next one starts. While a timer runs, the tab shows pause, skip, add a minute, and stop. One timer runs at a time for the whole house; starting another asks first. With more than one display, **Send to** picks which walls the timer takes over (it reads **Next timer shows on** while one is running).

### Chores, Lists, Notes, Meals, Photos

- **Chores** is where grown-ups add people, chores (from scratch or from a ready-made list) and rewards, and fix a missed day. See [Chores and rewards](/docs/chores).
- **Lists** holds the family's to-do lists: add, tick, reorder, give things a due day or a person, and make new lists. See [Lists](/docs/lists).
- **Notes** is the family notes board. Type a note in the bar above the tabs and press return to put it up for a day, or tap **+** to say who it is from, how long it stays on the wall, and whether it is pinned or important. Tap a note to change it or take it down. Notes that came down sit in **Gone** for a week, where you can post them again or delete them. See [Notes](/docs/notes). The tab's **Calendar** page holds day notes: tap a day to put a short line on it (up to three a day), and every calendar on the wall shows it on that day. See [Day notes](/docs/calendars#day-notes).
- **Meals** holds the meal library, the weekly plan and the grocery list. See [Meals](/docs/meals).
- **Photos** appears when a photo slideshow is on a screen, and opens on the folder the wall shows. Folders a wall shows come first and say which wall. Add photos and videos from the phone (big photos are made smaller before they are sent), from an iCloud link, or from Google Photos once the hub is signed in to Google from a computer. Tap a photo to see it full size, delete it, move it to another folder, or put it on the wall for a minute; **Select** picks several at once. Folders can be made, renamed and deleted here too. It is the same library **Settings > Pictures & videos** manages. A slideshow always keeps its last picture, and a photo a screen uses on its own (a background) stays put.
  Videos recorded on an iPhone in the default High Efficiency format do not play on a Raspberry Pi, so the phone turns them away; on the iPhone, open the Settings app, then **Camera** and **Formats**, and choose **Most Compatible** to record videos the wall can play.

### The gear

The gear in the top corner opens a sheet with:

- the Pi's name, uptime, memory and storage
- **Family**, the same family list as Settings > Family in the editor
- **Your icons**, the pictures your family added as icons, to add, rename or remove
- **Backup All Data** (with an **Include your icons** switch) and **Restore Backup**
- a light, dark or system theme for the remote, separate from the editor's
- **Restart Home Screens** and **Reboot Device**, each of which asks you to confirm first

After an update that needs the Pi restarted to finish, **Restart to finish the update** sits above those two, and its **Restart now** asks the same question as **Reboot Device**. Everything on this sheet needs you signed in once a password is set.

Two banners can appear above the Control tab: a reminder when you have not backed up in a while (the interval is under Settings > Backups & data in the editor), and a note when a new version is out (switched on under Settings > System & updates).

---

## The kids' page

The kids' page shows the same **Today** list, with the family's names across the top, and a trimmed **Rewards** view with just **Redeem** and **History**. It remembers which name was picked last time on that device, otherwise it opens on the first person with chores today. A **Yesterday** toggle lets a child look back a day, but yesterday cannot be changed from here. Un-checking takes a press-and-hold, so a stray tap cannot undo a sibling's work.

It stays open even when a password is set, so a bookmark on a tablet just works. That also means anyone on your WiFi could open it, which is worth knowing before you hand out the WiFi password.

---

## Details

### What needs the password

| Control | When a password is set |
|---|---|
| Screens, sleep, brightness, alerts, profiles | Signed in, or a display key in the address |
| The gear (backup, restore, restart, reboot) | Signed in |
| Chores: checking off today and spending tickets | Open to anyone on your network |
| Chores: adding or editing people, chores, rewards, balances, earlier days | Signed in |
| Lists: ticking an item | Signed in, or the wall itself |
| Lists: adding, editing, moving or removing, and making or deleting lists | Signed in |
| Notes: writing, changing, taking down or deleting a note, and day notes | Signed in |
| Meals: ticking a grocery item | Signed in, or with the display key, as [Voice Control](/docs/voice-control) does |
| Meals: the plan, the library and meal settings | Signed in |
| Photos | Signed in |

Sending you to the login page and back is automatic. Sessions last 30 days, or 90 if you tick **Remember me for 90 days**.

### Bookmarks that work without signing in

For a bookmark or a home-automation button that wakes the wall, add the display key from **Settings > Security** to the address:

```
http://home-screens.local:3000/api/display/wake?token=TOKEN
```

With more than one display, that wakes the main one; add `&display=kitchen` (the display's ID, shown under **Settings > Per display > All displays**) to wake another, or `&display=all` for every one. The token works on `/api/display/` addresses only. The full list of one-word commands is under [Display Control](/docs/api#display-control) in the API reference, and the [Voice Control](/docs/voice-control) guide drives all of them from Home Assistant.

### Profiles from the phone

If you have [profiles](/docs/profiles), they appear as pills under the brightness slider. Tap one to switch the wall to that profile's screens, or tap **All screens** to go back to showing everything. When a scheduled profile is on, its pill is the one ticked and the phone says it is on a schedule; a pill you tap then takes over when the schedule ends. With more than one display, the pills follow the display picked under **Send to**.

## Next steps

- [Chores and rewards](/docs/chores)
- [Meals](/docs/meals)
- [Your first screen](/docs/first-screen) if the wall is still empty
