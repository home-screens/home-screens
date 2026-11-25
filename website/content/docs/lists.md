---
title: Lists
nextjs:
  metadata:
    title: Shared to-do lists
    description: Keep the family's to-do lists on the wall. Add things from your phone or a touchscreen, tick them off on either, and give each list its own look on the display.
    alternates:
      canonical: /docs/lists
---

Groceries, a packing list, a before-school checklist. Type it on your phone, see it on the wall, tick it off from either. Lists live in one shared place, so the phone and every display always agree. {% .lead %}

## How the pieces fit

- **The wall** shows a **To-Do List** module. Pick which list it shows and how it looks. On a touchscreen, tap an item to tick it off right there (in the List and Board views), or tap **Add** under the list to put something on it.
- **The family remote** at `/remote` has a **Lists** tab. That is where things get added, ticked, edited, moved and removed, and where lists themselves are made.
- **The editor** picks the list for each module and can type a first list in from the laptop, so you do not need a phone to get started.

A tick on any of the three shows up on the others a few seconds later.

## 1. Put a list on a screen

In the editor, drag **To-Do List** from the **Personal** group onto a screen. In its settings, pick a **List** (or make a new one right there with **New list**) and a **View**:

- **List**: the classic checklist, with a due-day chip on anything that has a date and the initials of whoever it is for.
- **Focus**: the next three things in big type, for a small box or a sidebar.
- **Progress**: a ring with "3 of 8" in the middle and the rest in small print, easy to read from across the room.
- **Board**: every list side by side, one column each, for a wide box. Each column shows as many items as fit.
- **Compact**: a tight list with a dot per item, for busy dashboards.

When everything on a list is done, the heading shows a green tick and **All done** in every view. Items stay visible, struck through, unless you set **Done items** to **Hidden**.

**Edit list** opens the list in the editor so you can type the first few things without leaving the laptop.

## 2. Add things from your phone

Open the family remote and tap **Lists**. Your lists sit across the top as chips with a count of what is left; tap one to open it. The box above the tab bar adds something to that list: type, hit return, type the next one. It keeps focus so a whole grocery run goes in quickly.

Tap a row to tick it. Done things collect in a **Done** group at the bottom that folds away. Drag the handle on the left to reorder. The pencil on a row opens it:

- **Due**: today, tomorrow, or pick a day. The wall shows a chip, and an overdue chip turns amber.
- **Who**: the people it is for, from your family under **Settings > Family**. The row and the wall show their initials in their colours. If no one is there yet, the row says so and takes you to add someone.
- **Delete item**.

## 3. Lists themselves

The gear next to the count opens the list: rename it, give it a colour, or tidy up with **Uncheck all**, **Remove done items** and **Share** (sends the open items to any app on your phone, or copies them).

**Start fresh** unchecks everything on a schedule: **Every day** at midnight, or **Every week** on the day you pick. Good for a before-school list or a packing list you reuse; leave it on **Never** for groceries. Nothing is ever deleted by the schedule, but anything ticked more than 30 days ago is cleared off the list for you, so a grocery list left on **Never** does not grow forever.

**Delete list** removes the list and everything on it, after asking.

## 4. Ticking off on the wall

**Tap on the wall** is on for new To-Do modules. On a touchscreen a tap ticks the item in the **List** and **Board** views; the other views and any display without touch just show the list. Turn it off in the module's settings if you would rather the wall be read-only.

With it on, a **List** or **Compact** view that holds more than fits scrolls with a finger too. A **Back to the top** button shows while the list is away, and a minute after the last touch it slides back to the top on its own. With it off, the list shows what fits and says how many more there are.

## 5. Adding on the wall

**Add on the wall** is on for new To-Do modules (it sits under **Tap on the wall** in the module's settings). The **List**, **Compact** and **Board** views get an **Add to Shopping** row under the list; on the Board each column has its own **Add**.

Tap it and a sheet rises with the wall's own keyboard. Type one thing, tap **Add**, and the box empties for the next one; each thing added shows as a chip with **Undo** until you close the sheet. The first letter is a capital by itself, and **123** has numbers and the marks a list needs, for "Batteries (AA)".

A list keeps one of each thing, on the wall and on the phone alike. Typing something that is already on the list adds nothing and says so; typing something that was ticked off puts it back. Capitals and accents don't count, so "creme fraiche" finds "Crème fraîche" and the item keeps its own spelling. Danish æ, ø and å are letters of their own, so "Al" is not "Ål".

The wall only adds words. Due days, who it is for, editing and removing stay on the phone. A wall can only add to a list that one of the walls shows with this switched on.

## Where the data lives

Lists are kept on the hub, next to chores and meals, and are included in backups. They are not part of the layout, so editing a screen in the editor never touches a list, and the same list can sit on as many screens as you like.
