---
title: Calendars
nextjs:
  metadata:
    title: Calendar setup
    description: Put your family calendars on the wall. Paste a calendar link from Google, Apple, Outlook or Fastmail, or sign in with Google or iCloud for a calendar picker with the right colours.
    alternates:
      canonical: /docs/calendars
---

Three ways to get events onto the wall. Pasting a calendar link is the quickest and works with almost every calendar service. Signing in with Google or iCloud takes a few minutes longer and gives you a picker with every calendar on the account. {% .lead %}

## Which one should I use? {% #which-option %}

| | **Calendar link** | **Google sign-in** | **iCloud sign-in** |
|---|---|---|---|
| Works with | Google, Apple, Outlook, Fastmail, school and sports calendars, anything that offers an iCal or ICS link | Google Calendar | Apple calendars, plus birthdays from your contacts |
| Setup time | About 2 minutes | About 3 minutes | About 3 minutes |
| Picking calendars | One link per calendar | A pick-list of every calendar on the account | A pick-list of every calendar on the account |
| Colours | You choose one per feed | Google's own colours | Apple's own colours |
| How fresh | Google caches its links for a few hours; others vary | Near real time | Near real time |
| Shared family calendars | Yes, when the owner shares the link | Yes | Yes |

**Rule of thumb:** start with a calendar link. Sign in with Google if you want Google's colours, the picker, or events that show up right away. For Apple calendars the iCloud sign-in is nicer than public links, because nothing has to be made public.

{% screenshot name="settings-calendar" caption="Settings > Calendar. Feeds show when they last brought in events, so a link that quietly stops working is visible here." /%}

## Paste a calendar link {% #ical-feeds %}

1. Get the link from your calendar service:
   - **Google Calendar:** on a computer, open Settings, then **Settings for my calendars**, pick a calendar, and copy the **Secret address in iCal format** ([Google's guide](https://support.google.com/calendar/answer/37648?hl=en)).
   - **Apple iCloud:** in the Calendar app, right-click the calendar, choose **Share Calendar**, and turn on **Public Calendar**.
   - **Outlook / Microsoft 365:** open Settings, then **Shared calendars**, then **Publish a calendar**, and copy the ICS link.
   - **Schools, sports teams, holidays:** look for "subscribe", "iCal" or "ICS" on their calendar page.
2. In the editor, open **Settings > Calendar** and click **Add Feed** under **iCal / ICS Feeds**.
3. Paste the link, give it a name and a colour, and save.

Repeat for each calendar. Every calendar module shows all of them together, and each feed can be switched off with its tick box without deleting it.

## Sign in with Google {% #google-sign-in %}

Nothing to set up first: Home Screens brings its own Google app.

1. In the editor, open **Settings > Calendar** and click **Sign in with Google**. You get a short code and a link to `google.com/device`.
2. Open the link on any phone or computer, enter the code, and approve. Home Screens asks to read your calendars and nothing else.
3. Tick the calendars you want on the wall.

The sign-in happens on your phone or laptop, so the Pi never needs a keyboard. **Hide events you declined** skips invitations you turned down; it applies to Google calendars only.

Your hub fetches events from Google directly. Only the sign-in itself, and the renewal of its keys about once an hour, passes through Home Screens' sign-in helper at auth.homescreens.dev, which adds the app's password on the way and keeps nothing. The [privacy policy](/privacy) has the details.

### Use your own Google app {% #own-google-app %}

If you would rather run your own Google Cloud project, you can. Open **Settings > API keys**, expand **Use your own Google app** on the Google card, and fill in the Calendar fields with a credential made like this:

1. Open the [Google Cloud console](https://console.cloud.google.com) and go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth Client ID**. For the application type, pick **TVs and Limited Input devices**, and name it anything, such as "Home Screens".
3. Copy the **Client ID** and **Client Secret** into those fields.
4. Still in the Cloud console, open **APIs & Services > Library** and enable the **Google Calendar API**.
5. Then open **Google Auth Platform > Audience** and click **Publish app**. Until you do, only accounts you list there as test users can sign in, and Google ends every sign-in after 7 days. When you sign in afterwards, Google may say it hasn't verified the app. It is your own app, so choose **Advanced** and carry on.

Then sign in on the Calendar page as above. A sign-in only works with the app it came from, so anyone already signed in with Google on this hub signs in again after you save your own app.

To go back to Home Screens' app later, flip the switch next to **Use your own Google app** off. Your details stay saved for whenever you want them again. The switch covers Google Photos too, so sign in with Google once more on the Calendar page, and in a photo module if your photo import used your own app.

## Sign in with iCloud {% #icloud-sign-in %}

Apple lets you make a password just for Home Screens, so your real Apple ID password is never stored:

1. Go to [account.apple.com](https://account.apple.com), open **Sign-In and Security > App-Specific Passwords**, and create one. Name it anything.
2. In the editor, open **Settings > Calendar**, click **Add iCloud account**, and enter your Apple ID email and that new password. You can add more than one account.
3. Tick the calendars to show. Apple's colours carry over.
4. Turn on **Birthdays** if you would like a calendar built from the birthdays saved in your contacts.

## Who is who

Add your household under **Settings > Family** (see [Family](/docs/family)), then return to **Settings > Calendar > Whose calendars?** and pick which calendars are theirs. The Full-Screen Calendar's **family grid** and **free time** views draw one row per person from this list. A calendar you do not give to anyone counts as shared by the whole house.

Taking a calendar away (removing a feed, unticking a Google or iCloud calendar, or signing out) also takes it off whoever it belonged to, and out of any calendar module's own list of calendars to show. A module that showed only that calendar goes back to showing them all. Switching a feed off with its tick box keeps its owner.

The same list drives three options on both calendar modules, under **What shows** in the module's settings:

- **Name tags** puts each person's initials, in their colour, where the calendar dot goes, so two events called "Practice" read as Ella's and Noah's. Calendars nobody owns keep a plain dot.
- **Color key** can list calendars, people or [groups](/docs/family#groups). With groups, five kids collapse to one "Kids" row drawn as a stack of their avatars, then anyone in no group, then **Everyone** for shared calendars and holidays. Only people and groups with an event in view appear.
- **Show only these people** points a screen at a few people or a group. It follows the family list, so adding someone to "Kids" adds them to every screen that shows the Kids. Shared calendars and holidays stay visible unless you untick **Also show shared calendars and holidays**. It applies together with the calendar tick boxes above it.

## Day notes {% #day-notes %}

"Picture day." "Bring boots." "Late start, school at 10." A day note is a short line for a day, written on a phone and shown on that day in every calendar on the wall, above the day's events. It is not an event: it has no time, no calendar and no person, so it never needs a calendar account. It shows on a calendar that is set to one person's events, and on a calendar module before any calendar is picked.

To write one, open the family remote on a phone, tap **Notes**, then **Calendar** at the top (the Board page has a link to it too). The page lists today and the six days after it; the arrows move a week at a time, up to a year ahead. Tap **Add a note for this day** to write one, or tap a note to change it or remove it; a removed note can be put back with **Undo** for a few seconds. A note is up to 60 characters, and a day holds up to three, each its own line on the wall. A note shows once its day is on a calendar: a calendar that shows this week does not show next week's notes yet.

Where the notes go depends on the view: under the date in the daily columns, the week grid, the schedule and the family grid; on their own lines under the day number in the month, multi-week and rolling grids (they take their room before the events are counted, so "+2 more" stays true); as the first rows under the day's heading in the agenda and the week list, where a day with only notes still gets its heading; beside the date on the full-screen calendar's Day and Free Time views, with tomorrow's at the top of Free Time's Tomorrow list; and under the date and in the Tomorrow list on Up Next.

Each calendar module has a **Day notes** switch under **What shows**, on unless you turn it off. Notes from days that have passed stay on their day for six weeks, then are tidied away. They live in `data/day-notes.json` and are included in backups.

## Public holidays

**Public Holidays** adds a country's holidays to every calendar module. Pick the country and they appear alongside your own events, styled a little differently so they are easy to tell apart.

## How much to show

**Days Ahead** at the top of the page is the furthest any calendar module looks. A module can narrow it further in its own settings, but not widen it.

## API keys {% #api-keys %}

Most of Home Screens needs no key at all. Keys that are needed live on **Settings > API keys**, one card per service, each showing whether it is set up. The two exceptions: weather keys go on the service's card under [Settings > Weather](/docs/weather), and the iCloud sign-in lives here on the Calendar page.

{% screenshot name="settings-api-keys" caption="Settings > API keys. Each card says what it unlocks." /%}

| Service | What it unlocks |
|---|---|
| Google | Nothing to add for the Calendar sign-in or the Google Photos import: both work out of the box. The card holds a Maps key for traffic and commute times (Routes), and the fields for [your own Google app](/docs/calendars#own-google-app) if you would rather use one. |
| TomTom | Traffic and commute times, as an alternative to Google. Turn on the **Geocoding**, **Reverse Geocoding** and **Routing** APIs on the key itself, not just the account. |
| Immich | Photos from your own Immich photo library |
| Microsoft OneDrive | Photos from a OneDrive folder, after a one-time sign-in from the photo module (see [OneDrive photos](/docs/modules#one-drive-photos)) |
| Unsplash | Free stock photo backgrounds (50 requests an hour on the free plan) |
| NASA | The Astronomy Picture of the Day as a background. The image library search works without a key. |
| Todoist | The Todoist module |

## Next steps

- [Modules](/docs/modules#time-and-date): the calendar module's six views, and [the full-screen calendar's nine](/docs/modules#full-screen)
- [Calendar not syncing](/docs/troubleshooting#calendar-not-syncing) if events stop arriving
- [Chores and rewards](/docs/chores) to set up the family next
