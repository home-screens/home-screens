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
| Setup time | About 2 minutes | About 10 minutes, including a Google Cloud project | About 3 minutes |
| Picking calendars | One link per calendar | A pick-list of every calendar on the account | A pick-list of every calendar on the account |
| Colours | You choose one per feed | Google's own colours | Apple's own colours |
| How fresh | Google caches its links for a few hours; others vary | Near real time | Near real time |
| Shared family calendars | Yes, when the owner shares the link | Yes | Yes |

**Rule of thumb:** start with a calendar link. Move to the Google sign-in only if you want Google's colours or the picker. For Apple calendars the iCloud sign-in is nicer than public links, because nothing has to be made public.

{% screenshot name="settings-calendar" caption="Settings > Calendar. Feeds show when they last brought in events, so a link that quietly stops working is visible here." /%}

## Paste a calendar link {% #ical-feeds %}

1. Get the link from your calendar service:
   - **Google Calendar:** on a computer, open Settings, then **Settings for my calendars**, pick a calendar, and copy the **Secret address in iCal format** ([Google's guide](https://support.google.com/calendar/answer/37648?hl=en)).
   - **Apple iCloud:** in the Calendar app, right-click the calendar, choose **Share Calendar**, and turn on **Public Calendar**.
   - **Outlook / Microsoft 365:** open Settings, then **Shared calendars**, then **Publish a calendar**, and copy the ICS link.
   - **Schools, sports teams, holidays:** look for "subscribe", "iCal" or "ICS" on their calendar page.
2. In the editor, open **Settings > Calendar** and click **Add Feed** under **iCal / ICS feeds**.
3. Paste the link, give it a name and a colour, and save.

Repeat for each calendar. Every calendar module shows all of them together, and each feed can be switched off with its tick box without deleting it.

## Sign in with Google {% #google-sign-in %}

Google asks every app to bring its own sign-in credentials, so this takes a one-time trip through Google Cloud:

1. Open the [Google Cloud console](https://console.cloud.google.com) and go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth Client ID**. For the application type, pick **TVs and Limited Input devices**, and name it anything, such as "Home Screens".
3. Copy the **Client ID** and **Client Secret** into the Google card on **Settings > API keys** in the editor.
4. Still in the Cloud console, open **APIs & Services > Library** and enable the **Google Calendar API**.
5. In the editor, open **Settings > Calendar** and click **Sign in with Google**. You get a short code and a link to `google.com/device`; open the link on any phone or computer, enter the code, and approve.
6. Tick the calendars you want on the wall.

The sign-in happens on your phone or laptop, so the Pi never needs a keyboard. **Hide events you declined** skips invitations you turned down; it applies to Google calendars only.

## Sign in with iCloud {% #icloud-sign-in %}

Apple lets you make a password just for Home Screens, so your real Apple ID password is never stored:

1. Go to [account.apple.com](https://account.apple.com), open **Sign-In and Security > App-Specific Passwords**, and create one. Name it anything.
2. In the editor, open **Settings > Calendar**, click **Add iCloud account**, and enter your Apple ID email and that new password. You can add more than one account.
3. Tick the calendars to show. Apple's colours carry over.
4. Turn on **Birthdays** if you would like a calendar built from the birthdays saved in your contacts.

## Who is who

Under **People** on the same page, add each family member with a name and a colour, and pick which calendars are theirs. The Full-Screen Calendar's **family grid** and **free time** views draw one row per person from this list. A calendar you do not give to anyone counts as shared by the whole house. The other calendar views do not use this list, so you only need it for those two.

## Public holidays

**Public holidays** adds a country's holidays to every calendar module. Pick the country and they appear alongside your own events, styled a little differently so they are easy to tell apart.

## How much to show

**Days ahead** at the top of the page is the furthest any calendar module looks. A module can narrow it further in its own settings, but not widen it.

## API keys {% #api-keys %}

Most of Home Screens needs no key at all. Keys that are needed live on **Settings > API keys**, one card per service, each showing whether it is set up. The two exceptions: weather keys go on the service's card under [Settings > Weather](/docs/weather), and the iCloud sign-in lives here on the Calendar page.

{% screenshot name="settings-api-keys" caption="Settings > API keys. Each card says what it unlocks." /%}

| Service | What it unlocks |
|---|---|
| Google | Calendar sign-in, traffic and commute times (Routes), and the Google Photos import |
| TomTom | Traffic and commute times, as an alternative to Google. Turn on the **Geocoding**, **Reverse Geocoding** and **Routing** APIs on the key itself, not just the account. |
| Immich | Photos from your own Immich photo library |
| Microsoft OneDrive | Photos from a OneDrive folder, after a one-time sign-in from the photo module (see [OneDrive photos](/docs/modules#one-drive-photos)) |
| Unsplash | Free stock photo backgrounds (50 requests an hour on the free plan) |
| NASA | The Astronomy Picture of the Day as a background. The image library search works without a key. |
| Todoist | The Todoist module |
| GitHub | Only for update checks, and only shown with **Show advanced options** on. Raises a rate limit you are unlikely to hit. |

## Next steps

- [Modules](/docs/modules#time-and-date): the calendar module's five views and the full-screen calendar's eight
- [Calendar not syncing](/docs/troubleshooting#calendar-not-syncing) if events stop arriving
- [Chores and rewards](/docs/chores) to set up the family next
