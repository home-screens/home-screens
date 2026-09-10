---
title: Lists
nextjs:
  metadata:
    title: Shared to-do lists
    description: Keep the family's to-do lists on the wall. Add things from your phone, tick them off on a touchscreen or a phone, and give each list its own look on the display.
    alternates:
      canonical: /docs/lists
---

Groceries, a packing list, a before-school checklist. Type it on your phone, see it on the wall, tick it off from either. Lists live in one shared place, so the phone and every display always agree. {% .lead %}

## How the pieces fit

- **The wall** shows a **To-Do List** module. Pick which list it shows and how it looks. On a touchscreen, tap an item to tick it off right there.
- **The family remote** at `/remote` has a **Lists** tab. That is where things get added, ticked, edited, moved and removed, and where lists themselves are made.
- **The editor** picks the list for each module and can type a first list in from the laptop, so you do not need a phone to get started.

A tick on any of the three shows up on the others a few seconds later.

## 1. Put a list on a screen

In the editor, drag **To-Do List** from the **Personal** group onto a screen. In its settings, pick a **List** (or make a new one right there with **New list**) and a **View**:

- **List**: the classic checklist, with a due-day chip on anything that has a date and the initials of whoever it is for.
- **Focus**: the next three things in big type, for a small box or a sidebar.
- **Progress**: a ring with "3 of 8" in the middle and the rest in small print, easy to read from across the room.
- **Board**: every list side by side, one column each, for a wide box.
- **Compact**: a tight list with a dot per item, for busy dashboards.

When everything on a list is done, the heading shows a green tick and **All done** in every view. Items stay visible, struck through, unless you set **Done items** to **Hidden**.

**Edit items** opens the list in the editor so you can type the first few things without leaving the laptop.

## 2. Add things from your phone

Open the family remote and tap **Lists**. Your lists sit across the top as chips with a count of what is left; tap one to open it. The box above the tab bar adds something to that list: type, hit return, type the next one. It keeps focus so a whole grocery run goes in quickly.

Tap a row to tick it. Done things collect in a **Done** group at the bottom that folds away. Drag the handle on the left to reorder. The pencil on a row opens it:

- **Due**: today, tomorrow, or pick a day. The wall shows a chip, and an overdue chip turns amber.
- **Who**: the people it is for, from your family under **Settings > Family**. The row and the wall show their initials in their colours. If no one is there yet, the row says so and takes you to add someone.
- **Delete item**.

## 3. Lists themselves

The gear next to the count opens the list: rename it, give it a colour, or tidy up with **Uncheck all**, **Remove done items** and **Share** (sends the open items to any app on your phone, or copies them).

**Start fresh** unchecks everything on a schedule: **Every day** at midnight, or **Every week** on the day you pick. Good for a before-school list or a packing list you reuse; leave it on **Never** for groceries. Nothing is ever deleted by the schedule.

**Delete list** removes the list and everything on it, after asking.

## 4. Ticking off on the wall

**Tap to check off** is on for new To-Do modules. On a touchscreen a tap ticks the item, on any other display the list just shows. Turn it off in the module's settings if you would rather the wall be read-only.

## Where the data lives

Lists are kept in `data/todos.json` on the hub, next to chores and meals, and are included in backups. They are not part of the layout, so editing a screen in the editor never touches a list, and the same list can sit on as many screens as you like.

If you had To-Do modules before lists were shared, their items were moved into lists automatically the first time the new version started, one list per module, named after the module's title. Anything ticked on a touchscreen kept its tick.
