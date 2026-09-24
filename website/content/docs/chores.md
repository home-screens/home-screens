---
title: Chores and rewards
nextjs:
  metadata:
    title: Chores and rewards
    description: Set up a family chore chart on your Home Screens display. Add people and chores from your phone, let kids check them off on the wall or on their own phones, and pay out tickets for rewards.
    alternates:
      canonical: /docs/chores
---

A chore chart on the wall, a page where kids check things off, and tickets they can spend on rewards you invent. Grown-ups set it up from the family remote on a phone; kids only ever see today's list. {% .lead %}

## How the pieces fit

- **The wall** shows the **Chore Chart** module (or the **Full-Screen Chore Chart**). On a touchscreen, kids tap a chore to check it off right there.
- **The kids' page** at `/chores` is the same list on a phone or tablet. Pick your name, check off today's chores, spend your tickets. Nothing else can be changed from it, and it never asks for a password.
- **The family remote** at `/remote` is where grown-ups add people and chores, set up rewards, and fix mistakes. It asks for the password once you have set one.

All three read the same list, so a chore checked off on a phone disappears from the wall a few seconds later.

## 1. Put a chore chart on a screen

In the editor, drag **Chore Chart** from the **Personal** group onto a screen. Its seven views are in the module's settings: a **board** with one column per person, a **star chart** for the week, **today** only, a **progress** view with one bar per person, a **compact** list, a **reward history** of what has been redeemed lately, and a **rewards store** where kids spend their tickets right on the card (as a list, as tiles, or as a price list). The **Full-Screen Chore Chart** fills the whole screen and has a bigger **rewards store** view of its own. It also has three **reward history** views that show what the family has redeemed: day by day, as 30-day totals over a list, or with the newest reward in the spotlight. The store has a **History** button that opens the totals.

{% screenshot name="display-chores" caption="The chore board on the wall, with the week's dinners underneath." /%}

The chart is empty until you add people and chores, which happens on a phone.

## 2. Add your family

Open **Settings > Family** in the editor, or open the family remote and tap **Settings > Family**. Add each person with a name, an optional emoji and a colour. The same [family list](/docs/family) is used by chores, rewards and calendars; you can also edit it from **Chores > Manage > Members**.

You can add up to 64 people. Existing larger families are preserved. With five or more people, the board keeps one column each and the summary line counts how many finished today rather than trying to show a face per person.

## 3. Add chores

Still under **Manage**, add a chore with a name, an emoji, and how many **tickets** it is worth. Then decide when and who:

- **When:** every day, certain days of the week, or once on a date. Each chore also has a time of day (morning, afternoon, evening, or anytime), which is how the wall groups the list and highlights what is due now.
- **Who:** one person, several, or a [group](/docs/family#groups) such as "Kids". Give a chore to a group and everyone in it gets it, each with their own tick. Add somebody to the group later and they get it too. With several people you choose how it is shared:
  - **Fixed**: everyone listed does it every time.
  - **Rotate daily** or **rotate weekly**: it passes from one person to the next.
  - **Schedule**: a small grid, one row per person and seven day columns. Tap a cell to give that person that day. A note underneath says which days still have nobody. A schedule is for people you pick one by one, so it is not offered while a group is ticked.

{% screenshot name="remote-chores" phone=true caption="The family remote's Chores tab. Today, Manage, and Rewards." /%}

## 4. Checking things off

Kids check off chores in three places: on the wall if it is a touchscreen, on the kids' page, or on the family remote's **Today** tab. A finished chore gets a strike-through and its tickets are added to that person's balance. Finishing the last chore of the day gets a short celebration. On the Full-Screen Chore Chart a chore given to a group shows the group's name next to one ring per person, so everybody still ticks their own.

{% screenshot name="kid-view" phone=true caption="The kids' page. Pick your name, check things off. Yesterday can be looked at but not changed." /%}

Un-checking takes a press-and-hold on the kids' page, so a stray tap cannot undo a sibling's work. If a chore was done but never checked off, a grown-up can fix it later: the **Today** tab on the family remote has a strip of past days above the list. Tap a day, tick the chore, and the tickets are paid out as if it had been checked off at the time. Un-ticking an old one takes the tickets back, and the remote warns you if that would push someone's balance below zero because they already spent them.

## 5. Bonus chores and "up for grabs"

Some jobs are extras rather than duties: washing the car, sweeping the porch, reading for twenty minutes. Make them **bonus chores**. When you add a chore, switch **Kind of chore** from **Regular** to **Bonus**. A bonus chore only earns tickets. It never counts against anyone: it is left out of the day's progress, the stars and the streaks, so nobody falls behind for skipping one.

Choose who gets the tickets:

- **Up for grabs**: one person gets it. A kid taps **Grab it** to keep it for themselves, and everyone else sees whose it is ("Cleo's on it") and cannot take it. They tick it when they are done, or tap **Let it go** (under the chore's name) to put it back up for grabs. A kid who already did the job can simply tick it. Un-ticking it again gives it back to them, not to everyone.
- **Everyone can**: everyone it is open to can do it once and get the tickets, like a reading bonus.

**Who can do it** works like any chore: pick people or a group. **Comes back** says when a done bonus chore is open again: every day, every week (once someone does it, it is done until next Monday), or only when a grown-up puts it back. A chore marked "when I put it back" shows **Put it back** on its row for grown-ups once it is done, and after its day it leaves the wall and the kids' page until you do. Switching a chore between Regular and Bonus keeps everything else about it, so switching back gets its days, turns and time of day back. Bonus chores follow days of the week, not a date: a one-time chore switched to Bonus gets its date's weekday and "when I put it back", which keeps a one-off job done once someone does it.

On the Full-Screen Chore Chart, bonus chores sit in their own band under the family: two rows at most, or one row on a landscape screen (beside the date when the chart is laid out by person), with grabbed chores first. When there are more, **+N more** opens the rest. Tap **Grab it** and pick who is grabbing it; tap a grabbed chore when it is done. On the family remote they have their own **Bonus** section under each person's list.

Two household settings decide how grabbing works. They are shown in one line under the **Bonus** heading, above the bonus chores, on the family remote's **Chores > Manage** list and in the editor's chore window; tap **Change** there. They are also on **Settings > Family** in the editor:

- **How many can one person grab at once**: one at a time (the default), two, three, or no limit. It stops the fastest kid grabbing everything at breakfast.
- **When does a grab end?**: at bedtime (the default: if it isn't done that day, anyone can grab it the next time it comes up), or when the chore comes back, so a weekly one stays theirs until Monday. The second suits big jobs that take a weekend. A "when I put it back" chore's grab lasts a week, and always until the next day the chore shows up.

A grown-up can always free someone's grab: tap the **•••** next to the chore on the family remote's **Today** tab. Looking back at an earlier day of the same week, a weekly bonus chore shows the week as it stands ("Dax did it Wednesday", "Ada's on it"); it is changed from today's page, not from that day.

## 6. Not today

Sometimes a chore cannot be done: a kid is home sick, or there is no school so nobody packs a school bag. On the family remote's **Today** tab, tap the **•••** next to the chore (or press and hold it) and choose **Not today** for that person, or **Not today for everyone**. It shows a dashed ring, pays no tickets, and is left out of the day's count, so nobody's stars or streak break over it; a day where everything is "not today" reads as a day off. Tap it again if it turns out to be on after all, or use **It's on today for everyone after all** in the same menu. Kids cannot mark a chore "not today" themselves.

## 7. Rewards and tickets

Under **Chores > Rewards** on the family remote:

- **Rewards** is where you invent things to buy: a name, an emoji, a ticket price, and optionally who it is for. Movie night, pick the dinner, 30 minutes of screen time.
- **Redeem** is what kids see on their page too: pick a reward and spend the tickets. It only works when the balance covers the price.
- **Balances** shows everyone's tickets and lets a grown-up adjust them by hand.
- **History** lists every reward that has been redeemed.

Tickets are earned automatically as chores are checked off, using each chore's ticket value. Bonus chores pay the same way.

## What kids can and cannot do

The kids' page and the wall let anyone check off today's chores, grab and let go of bonus chores, look at yesterday, and spend tickets. Adding or changing people, chores or rewards, adjusting balances, and checking off earlier days all live on the family remote, behind the password once you set one. The kids' page stays open even then, so a shared tablet never needs a login. That is worth knowing before you give a guest your WiFi password.

## Next steps

- [Meals](/docs/meals): plan the week's dinners from the same phone
- [On your phone](/docs/remote-control): everything else the family remote does
- [Modules](/docs/modules#personal): the chore chart's views and settings
