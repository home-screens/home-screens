---
title: Notes
nextjs:
  metadata:
    title: Family notes board
    description: Put short notes on the wall from your phone. Say who it is from, pin the ones that matter, mark the urgent ones, and let each note come down on its own when it is no longer needed.
    alternates:
      canonical: /docs/notes
---

"Dentist tomorrow at 3:40, I am picking you up." "Grandma gets here Friday." "Dishwasher is clean." Type a note on your phone and it is on the wall a few seconds later, with who wrote it and how long ago. Each note comes down on its own after the time you pick, so the board never fills up with last week. {% .lead %}

## How the pieces fit

- **The wall** shows a **Notes** module. Pick one of twenty-two views, from a full board or a single line along the bottom of the screen to a chalkboard or a neon sign. The wall only shows notes; nothing can be changed from it.
- **The family remote** at `/remote` has a **Notes** tab. That is where most notes are written, changed, taken down and posted again.
- **The editor** puts the board on a screen and picks how it looks. Its **Manage notes** button writes and changes notes from the computer too.

There is one board for the whole house. Put the Notes module on as many screens and displays as you like, each in its own view, and they all show the same notes.

## 1. Put the board on a screen

In the editor, drag **Notes** from the **Personal** group onto a screen, then pick a **View** in its settings. **Board** is the default: one row per note, newest first, with pinned notes on top. The settings below the view change with it, so you only see the ones that view uses. The [views](#the-views) are described further down.

Until someone writes a note, the module says "Nothing on the board. Write a note on your phone and it shows up here."

## 2. Write a note on your phone

You can write a note from a phone, or [from the editor](#4-write-notes-from-the-editor). On a phone, open the family remote and tap **Notes**. The tab shows every note on the wall right now, in the same order as the wall, with how long each one has left ("22 h left", "4 days left", or "Keeps"). A note with less than an hour to go shows its time in amber.

The **Write a note** bar sits above the tab bar. For a quick one, type it and press return: it goes straight on the wall, from whoever you last picked on this phone, for 1 day. For anything more, tap the **+** beside the bar. It opens the note sheet with what you typed already in it.

- **Note**: up to 500 characters of plain text. The counter shows how many you have used.
- **From**: who wrote it. Pick a person from your family under **Settings > Family**, or **Nobody** for a note from the whole house. Your phone remembers the last pick, so your next note is already from you, and so is a quick note from the bar. A note from nobody shows on the wall as from "Someone".
- **Show for**: how long it stays on the wall. **12 hours**, **1 day** (the default), **3 days**, **1 week**, or **Keep**, which stays until you take it down. Good for the WiFi password or the babysitter's number.
- **Pin to top**: keeps the note above all the others, with a pin, in every view that has an order.
- **Important**: shows the note in red on the wall, for the things nobody can miss.

Tap **Put it on the wall**. The wall picks it up within a few seconds.

## 3. Change a note or take it down

Tap a note on the Notes tab to open the same sheet with that note in it. Change the words, who it is from, pinned or important, and tap **Save**. Tap a length under **Show for** to start the count again from now, even the one already chosen. Changing the words alone leaves the timing as it was.

**Take it down now** takes the note off the wall straight away. It is not deleted. It moves to **Gone** at the bottom of the tab, where notes that came down on their own also go. Gone is folded away until you tap it. Each note in it has:

- **Post again**: puts it back on the wall as if it had just been posted, for the same length of time as before.
- **Delete**: removes it for good, after asking.

Notes stay in Gone for a week, then they are cleared away for you.

## 4. Write notes from the editor

Select the Notes module in the editor and press **Manage notes** at the top of its settings. The **Family notes** window has the same choices as the phone:

- **New note** at the top: type the note, pick **From** and **Show for**, switch on **Pin to top** or **Important** if you want them, and press **Post**. Ctrl+Enter, or Cmd+Enter on a Mac, posts too. The editor remembers who you last posted as.
- **On the wall** lists every note that is up now. Click into a note's words to change them. Each note also has its own **From** and **Show for**, a pin and an important switch, and **Take down**. Changing **Show for** starts its time over from now.
- **Gone** lists the notes that came down in the last week, each with **Post again** and **Delete**. Delete asks first.

The canvas shows the change straight away, and the wall a few seconds later.

## The views

Every view shows the same notes in the same order: pinned first, then newest first. Important notes always stand out and pinned notes always carry a pin. The view picker lists fourteen layouts first, then eight materials.

### Layouts

The layouts sit on the module's own card, which follows the **Style** section like any other module.

- **Board**: one row per note with the writer's initial in their colour, their name, how long ago, and up to two lines of the note. The default, and the one most families want.
- **Cards**: each note on its own card. A wider module gets more columns, up to three, and a pinned note spans the whole row.
- **Sticky**: paper notes in each person's colour, each leaning a little, like a fridge door. Important notes are on red paper.
- **Bubbles**: the family group chat. Newest at the bottom, the name in the writer's colour.
- **Spotlight**: one note at a time in large type, with "2 of 6" underneath. Moves on every few seconds, and pinned or important notes stay up for two turns.
- **Compact**: one line per note, cut short if it is long, with the age on the right. Fits a lot in a small box next to a clock.
- **Count**: a tile with how many notes are up, small bubbles for who wrote them, and how many are important. For a wall that keeps the full board on another screen.
- **Strip**: a one-line bar for the top or bottom of a screen. One note at a time, with "3 of 6", moving on like Spotlight. A long note is cut short so the bar never scrolls.
- **Ticker**: every note in one slow, continuous crawl across a bar, with a dot between notes.
- **Timeline**: notes under **Today**, **Yesterday** and earlier days, newest first. Pinned notes do not jump to the top here, so it answers "what happened since this morning".
- **Focus**: the first note large, the next two as single lines below, then "and 3 more".
- **By person**: one row per family member with their newest note and how many they have. Someone with nothing up shows **No notes** rather than vanishing, so a kid always finds their own row. Notes from nobody get a last **Someone** row.
- **Pinned and new**: two columns for a wide box. Pinned notes on the left, everything else newest first on the right. With nothing pinned, the left column says **Nothing pinned**.
- **Latest**: the newest note alone, large. No stepping and no counter.

### Materials

A material turns the whole card into something from around the house, with its own colours and lettering. Because it brings its own look, the editor hides the card's **Background**, **Text Color**, **Border Color**, **Border Width**, **Font Family** and **Frosted glass** for it. The rest of the Style section, such as **Text size**, corner rounding, space inside, **Solid** and shadow, still works.

- **Chalkboard**: a slate in a wooden frame with a chalk tray. Notes in chalk handwriting, names in a lighter version of each person's colour, a star on the pinned note and yellow chalk for an important one.
- **Letterboard**: black felt in an oak frame with chunky white plastic letters, like a hallway letter board. One note at a time, moving on like Spotlight, with a small letter tag for who wrote it.
- **Whiteboard**: a glossy whiteboard with a marker tray. Each note in its writer's marker colour, with a round magnet for who wrote it. An important note is in red marker, underlined.
- **Fridge**: the fridge door. Paper scraps held up by magnets in each person's colour, each leaning a touch. The pinned note gets two magnets and an important one is on pink paper.
- **Notebook**: a spiral notebook page with blue lines and a red margin. Notes written in blue pen with the writer's initial in the margin, red pen for an important one, a star on the pinned one.
- **Receipt**: a shop receipt in typewriter capitals, with dashed lines, a total at the bottom and a barcode. Pinned notes are marked [PIN] and important ones ***. The whole board fits in a narrow strip.
- **Neon**: a dark wall with the note glowing as a neon sign in its writer's colour and their name as a small sign of its own. One note at a time, moving on like Spotlight. Nothing flickers. Made for a dark kitchen at night.
- **Headline**: a newspaper front page. The pinned note is the headline, the rest sit in two columns, and an important one gets a red "Important:". The newspaper's name is the **Heading** setting, and reads "The Family Times" while the heading is empty.

## Settings

Most views use every setting below. The editor hides the ones a view does not use.

- **Heading** and **Show title**: the name at the top of the board. Leave it empty to show "Notes". On Headline it is the newspaper's name. Strip, Ticker, Count, Latest, Letterboard, Fridge, Notebook and Neon have no heading.
- **Which notes**: **Every note**, **Pinned only** or **Important only**. Handy for a second board that only shows what really matters. Timeline and By person always show every note.
- **Notes to show**: how many notes fit before the rest become "and 3 more", from 1 to 20. Five unless you change it. Used by Board, Cards, Sticky, Bubbles, Compact, Timeline, Focus, Pinned and new, Chalkboard, Whiteboard, Fridge, Notebook, Receipt and Headline. Spotlight, Strip, Ticker, Letterboard and Neon go through every note in turn.
- **Show who** and **Show how long ago**: the writer's initial and name, and the age of each note ("25m ago", "2h ago", then the day of the week, then the date once it is a week old). Both on unless you turn them off. Count and By person do not have these switches, because they are about who wrote what.
- **Seconds per note**: how long Spotlight, Strip, Letterboard and Neon stay on each note before moving on, from 5 to 60. Ten unless you change it.
- **Scroll speed (seconds per note)**: how slowly Ticker crawls, from 3 to 30. A higher number is slower.

## Show the board only when there is something on it

An empty board is wasted space, so every display shares how many notes are up as values a module's conditions can read: **Notes on the board**, **Important notes on the board** and **Pinned notes on the board**. They are there whether or not that screen has a Notes module on it. To hide the board while it is empty:

1. Select the Notes module in the editor and open its **Conditions** section.
2. Turn on **Show only when conditions match** and add a **Number is in range** condition.
3. Pick **Notes on the board** under **What to check** and set **Above** to 0.

The same values work in [display rules](/docs/profiles#display-rules), for example to jump to a notes screen when **Important notes on the board** goes above 0. A [Text module](/docs/module-reference#text) can show them too: type `Notes on the board: {notes.count}`, or use `{notes.important}` and `{notes.pinned}`.

## Who can post

Notes are written on the family remote or in the editor. Once you [set a password](/docs/remote-control#ask-for-a-password), that means a phone or computer that is signed in. The kids' page at `/chores` cannot post notes, so a kid who wants something on the wall asks a grown-up's phone. The wall itself only shows them.

## When someone leaves the family

Removing a person under **Settings > Family** keeps every note they wrote. Their notes stay on the wall, shown as from "Someone".

## Where the data lives

Notes are kept on the hub in `data/notes.json`, next to lists, chores and meals, and are included in backups. They are not part of the layout, so editing a screen in the editor never touches a note.

## Next steps

- [On your phone](/docs/remote-control): everything else the family remote does
- [Lists](/docs/lists): shared to-do lists, written the same way
- [Modules](/docs/modules#personal): the Notes module next to the other family modules
