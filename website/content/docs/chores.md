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

In the editor, drag **Chore Chart** from the **Personal** group onto a screen. Its five views are in the module's settings: a **board** with one column per person, a **star chart** for the week, **today** only, a **progress** view with one bar per person, and a **compact** list. The **Full-Screen Chore Chart** fills the whole screen and adds a **rewards store** view where kids browse what their tickets can buy.

{% screenshot name="display-chores" caption="The chore board on the wall, with the week's dinners underneath." /%}

The chart is empty until you add people and chores, which happens on a phone.

## 2. Add your family

Open the family remote (Settings > On your phone shows the address and a QR code), tap **Chores**, then **Manage**. Add each person with a name, an emoji and a colour. The colour follows them everywhere: the board column, the phone pill, the progress bar.

There is no limit on people. The wall and the phone are built for big families; with five or more, the board keeps one column each and the summary line counts how many finished today rather than trying to show a face per person.

## 3. Add chores

Still under **Manage**, add a chore with a name, an emoji, and how many **tickets** it is worth. Then decide when and who:

- **When:** every day, certain days of the week, or once on a date. Each chore also has a time of day (morning, afternoon, evening, or anytime), which is how the wall groups the list and highlights what is due now.
- **Who:** one person, or several. With several people you choose how it is shared:
  - **Fixed**: everyone listed does it every time.
  - **Rotate daily** or **rotate weekly**: it passes from one person to the next.
  - **Schedule**: a small grid, one row per person and seven day columns. Tap a cell to give that person that day. A note underneath says which days still have nobody.

{% screenshot name="remote-chores" phone=true caption="The family remote's Chores tab. Today, Manage, and Rewards." /%}

## 4. Checking things off

Kids check off chores in three places: on the wall if it is a touchscreen, on the kids' page, or on the family remote's **Today** tab. A finished chore gets a strike-through and its tickets are added to that person's balance. Finishing the last chore of the day gets a short celebration.

{% screenshot name="kid-view" phone=true caption="The kids' page. Pick your name, check things off. Yesterday can be looked at but not changed." /%}

Un-checking takes a press-and-hold on the kids' page, so a stray tap cannot undo a sibling's work. If a chore was done but never checked off, a grown-up can fix it later: the **Today** tab on the family remote has a strip of past days above the list. Tap a day, tick the chore, and the tickets are paid out as if it had been checked off at the time. Un-ticking an old one takes the tickets back, and the remote warns you if that would push someone's balance below zero because they already spent them.

## 5. Rewards and tickets

Under **Chores > Rewards** on the family remote:

- **Rewards** is where you invent things to buy: a name, an emoji, a ticket price, and optionally who it is for. Movie night, pick the dinner, 30 minutes of screen time.
- **Redeem** is what kids see on their page too: pick a reward and spend the tickets. It only works when the balance covers the price.
- **Balances** shows everyone's tickets and lets a grown-up adjust them by hand.
- **History** lists every reward that has been redeemed.

Tickets are earned automatically as chores are checked off, using each chore's ticket value.

## What kids can and cannot do

The kids' page and the wall let anyone check off today's chores, look at yesterday, and spend tickets. Adding or changing people, chores or rewards, adjusting balances, and checking off earlier days all live on the family remote, behind the password once you set one. The kids' page stays open even then, so a shared tablet never needs a login. That is worth knowing before you give a guest your WiFi password.

## Next steps

- [Meals](/docs/meals): plan the week's dinners from the same phone
- [On your phone](/docs/remote-control): everything else the family remote does
- [Modules](/docs/modules#personal): the chore chart's views and settings
