---
title: Privacy Policy
description: What Home Screens keeps on your hub, what the Google sign-in and our small anonymous usage report involve, and what the homescreens.dev website collects.
effective: '2026-11-21'
layout: legal
nextjs:
  metadata:
    title: Privacy Policy
    description: What Home Screens keeps on your hub, what the Google sign-in and our small anonymous usage report involve, and what the homescreens.dev website collects.
    alternates:
      canonical: /privacy
---

Home Screens is free, open-source software for a wall display you run at home, made by the Home Screens project ("we"). This policy covers the Home Screens software, the sign-in helper at auth.homescreens.dev, and the homescreens.dev website.

## The short version

- Your calendars, photos, chores, lists and settings live on your own Home Screens hub, in your home. We never receive them.
- If you connect Google, your Google data goes only to your hub. If you turn on adding events, your hub changes your Google Calendar only when someone in your home adds, changes or removes an event. We don't store your Google data, sell it, show ads with it, or use it to train AI.
- Once a day, your hub sends us a small anonymous report about how the app is set up (never what's in it). You can turn this off.
- Our website uses Google Analytics to count visits.

## 1. What stays on your hub

Everything you put into Home Screens is saved in the `data` folder on the computer that runs it (usually a Raspberry Pi). That includes your layouts, settings, family members, chores, meal plans, lists, timers, photos, and the keys and sign-ins for services you connect. We have no copy. Anyone who can use your hub can see it, so set a password in Settings if other people share your home network.

## 2. Services you connect yourself

When you connect a service (a weather provider, an iCloud or other calendar, Immich, Unsplash, OneDrive and so on), your hub talks to that service directly, using keys you entered. If you turn on adding events, your hub also adds, changes and removes events on the iCloud calendars you pick, when someone does that from a phone or the wall. Those services' own privacy policies apply to what they receive.

## 3. Google Calendar and Google Photos

When you sign in with Google, Home Screens asks for only what it needs:

- **Google Calendar, showing events** (read only): the names and colors of your calendars and the events on the ones you choose, so your display can show them.
- **Google Calendar, adding events** (only if you turn it on): Google asks you once more, for permission to "View and edit events on all your calendars". With it, your hub adds, changes and removes events, but only when someone in your home does that from a phone or the wall, and only on the calendars you tick in Settings > Calendar. To fill in the form for changing an event, it fetches that one event from Google and uses its name, time, place and how it repeats. A change updates only those things; the event's notes, guests and reminders stay as they were. Each event Home Screens adds carries a hidden label in your Google Calendar that marks it as added by Home Screens; Google Calendar doesn't show it, and it holds nothing else. Home Screens never adds, changes or removes an event on its own.
- **Google Photos** (read only, only the photos you pick): when you choose photos in Google's photo picker, your hub downloads copies of those photos into your Home Screens photo library so your display can show them. Home Screens can't see any other photos in your account.

**Where it goes.** Calendar events and photos go straight from Google to your hub. An event someone adds or changes goes straight from your hub to Google, into your own Google Calendar. Your Google data is kept on your hub and in your Google account, and nowhere else.

**Signing in.** Home Screens' app passwords stay on our sign-in helper at auth.homescreens.dev, so they never ship inside the software. For Google Calendar, your hub asks Google for a short code itself; once you've typed it, your hub collects its sign-in keys through the helper. For Google Photos, and for Google Calendar once adding events is on, you sign in on Google's own page; Google gives your hub a short-lived code, and your hub trades that code for sign-in keys through the helper. Either way, the helper adds Home Screens' app password and passes the request straight to Google. It does the same when the keys need renewing, about once an hour. It does not store or log the codes or keys, and it never sees your calendar events or photos. To block abuse it counts requests per network address for one minute, and keeps nothing after that. If you connect Google with your own Google app instead, your hub talks to Google directly and the helper isn't involved.

**How your Google data is protected.** We use encryption to protect your information, and security procedures are in place to protect the confidentiality of your data:

- *In transit.* Every connection involved is encrypted with HTTPS (TLS): your hub to Google, your hub to the sign-in helper, and the helper to Google. That includes the events your hub sends to Google. Nothing is sent over plain HTTP.
- *Where it's kept.* Your Google sign-in keys are saved in two files in the `data` folder on your hub (`google-tokens.json` for Calendar, `google-picker-tokens.json` for Photos). Imported photos are saved in your hub's photo library in the same folder. Calendar events are held in your hub's memory for a few minutes at a time so the display can draw them, and are fetched again from Google when they're needed; they are not written to disk. An event someone adds or changes passes through your hub's memory on its way to Google and is not written to disk either. If Google turns a change down, the hub's log notes the kind of error, never the event. The calendars you pick, for showing and for adding, are saved by their Google calendar IDs in your hub's settings file (`config.json`).
- *Who can read it.* Only the computer running your hub. We have no copy, and the sign-in helper keeps nothing. Set a password in Settings so that only people you trust can open the editor and the phone remote, and keep the hub's own login private. If you make a backup of your hub, the backup holds these files too, so keep it somewhere safe.
- *Who can change events.* Adding events is off until you turn it on in Settings > Calendar. While it's on, people who can open the phone remote can add, change and remove events on the calendars you ticked, and so can anyone at a wall, unless you turn walls off there (for all of them, or one display at a time). Removing an event always asks first, and you can set a grown-up code that removing an event or changing every day of a repeating one asks for.
- *How long it's kept.* Sign-in keys stay until you disconnect. Imported photos stay until you delete them from your photo library. Calendar events are replaced every few minutes and are gone as soon as the hub restarts. Events added from Home Screens live in your Google Calendar like any other event, until someone removes them there or from Home Screens; disconnecting Home Screens doesn't remove them.
- *Deleting it.* Disconnecting (below) erases the keys from your hub and asks Google to cancel the sign-in (once nothing else on the hub uses it; see below). Deleting a photo in the photo library removes the file from your hub. An event can be removed from a phone, the wall, or Google Calendar itself. Wiping or reinstalling the hub removes everything on it.
- *The sign-in helper.* The helper at auth.homescreens.dev runs on Cloudflare's network. Home Screens' app passwords are stored there as encrypted secrets that only the helper's code can read. The helper does not store or log sign-in codes, keys, or anything that passes through it.
- *The code is open.* Home Screens and the helper are open source, so anyone can read exactly what happens to their data: [github.com/home-screens/home-screens](https://github.com/home-screens/home-screens).

**What we never do.** We don't sell Google data, use it for ads, share it with anyone, or use it to develop, improve or train AI or machine learning models. Data from Google Workspace APIs, such as Google Calendar, is not used to develop, improve, or train generalized or non-personalized AI or machine learning models. No person at Home Screens can read your Google data, because it never reaches us.

Home Screens' use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. The use of raw or derived user data received from Google Workspace APIs, such as Google Calendar, will adhere to the [Google User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

**Turning adding off.** Switch off **Let Home Screens add and change events** in Settings > Calendar. Your hub stops adding, changing and removing events at once, and keeps showing your calendars.

**Disconnecting.** In Home Screens, choose **Disconnect** under Google Calendar in Settings, or **Disconnect Google Photos** next to Import from Google Photos. That removes the sign-in from your hub and asks Google to cancel it. Google counts Home Screens' Calendar and Photos sign-ins as one, so while the other one is still connected on your hub, Google keeps listing Home Screens on your account until you disconnect that one too. You can also remove Home Screens at [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Photos you already imported stay in your photo library until you delete them there.

## 4. Anonymous usage report

Once a day, your hub sends a small report to our server so we know which features people use. It contains:

- a random install ID made on your hub (not linked to you)
- the app version and the kind of computer (operating system, processor type)
- display sizes and orientation
- how many screens, modules and profiles you have, and which module types
- which weather provider and screen transition you picked
- whether sleep, alerts, a password and calendar connections are turned on
- installed plugins from the plugin marketplace (other plugins are counted but never named)

It never includes names, places, addresses, calendar events, photos, keys, or anything you typed. Our server does not record your IP address. We keep only the latest report from each install, and delete it 12 months after your hub last sent one. We do keep running totals, like how many installs started on each day, but they hold no install ID and can't be traced to any hub.

To turn it off, open Settings, then Status, and switch off **Send anonymous usage data**. That stops new reports. The same card shows your install ID, and you can email us to have that ID's report deleted right away.

## 5. Updates and plugins

To check for updates and list plugins, your hub fetches public files from GitHub. GitHub sees your hub's IP address, as with any website visit; its privacy policy applies.

## 6. The homescreens.dev website

The website uses Google Analytics to count page visits and see which pages help. Google Analytics uses cookies and receives your browser's usual details (like browser type and approximate location). It keeps detailed visit records for 2 months and information tied to your browser for 14 months; after that, only totals remain. The Google sign-in return page at homescreens.dev/connect/google removes the sign-in code from the address and never sends it to Analytics. The website has no accounts and no forms.

## 7. Children

Families use Home Screens, kids included. The chore chart and the phone remote don't create accounts with us, and anything a child enters stays on the family's hub. If adding events is on, an event someone types on the wall or a phone goes to the family's own calendar, never to us. We don't knowingly collect personal information from anyone, children included.

## 8. Changes

If this policy changes, we'll update it here and change the date at the top. Big changes will also be noted in the release notes.

## 9. Contact

Questions or deletion requests: [hello@homescreens.dev](mailto:hello@homescreens.dev).
