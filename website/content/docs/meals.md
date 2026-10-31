---
title: Meals
nextjs:
  metadata:
    title: Meal planning
    description: Plan the week's meals from your phone and show them on the wall. A meal library, a weekly plan, and a grocery list built from the ingredients.
    alternates:
      canonical: /docs/meals
---

Plan the week's dinners on your phone, see them on the wall, and take the grocery list to the shop. Meals live in one shared list, so the phone and every display always agree. {% .lead %}

## 1. Put a meal planner on a screen

In the editor, drag **Meal Planner** from the **Personal** group onto a screen. Its views are in the module's settings: the whole **week**, **today**, the **next meal**, a **compact** strip, and a **list**. The **Full-Screen Meal Planner** fills the screen with a week, a day, a **menu board**, or the next meal.

The planner is empty until you add meals, which you do on a phone or in the editor with **Edit Meal Plan** in the module's settings (**Edit Meal Planner** on the Full-Screen Meal Planner).

{% screenshot name="display-meals" caption="The Full-Screen Meal Planner on the wall." /%}

## 2. Build a meal library

Open the family remote (Settings > On your phone shows the address), tap **Meals**, then **Library**. Add the meals your family actually eats: a name and an emoji are enough. Prep and cook time, difficulty, servings, a recipe link, notes, a star rating, a favorite heart and tags (quick, healthy, vegetarian and more) are all optional, and ingredients are what feed the grocery list later. A meal shows its prep and cook time added together, so whoever cooks knows when to start.

## 3. Plan the week

Under **Plan**, tap a day and a slot and pick a meal from the library, or type one in ("Tacos") for a night that does not need a saved meal. Three shortcuts fill a week fast: **Copy Last Week**, **Suggest** (random picks from the library), and **Clear**.

**Week** shows the result, and arrows move to other weeks. The wall updates a few seconds after you save.

A meal is marked **Now** from a quarter of an hour before its serving time until an hour and a half after, on the phone and on the wall. A meal with no time of its own goes by the usual time for that meal from the meal settings, or 7:30 AM for breakfast, noon for lunch, 3:30 PM for a snack and 6 PM for dinner when none is set. Then the next meal takes over, so late in the evening the wall already shows tomorrow's breakfast.

{% screenshot name="remote-meals" phone=true caption="This week's dinners on the family remote. Today is marked and the next meal is highlighted." /%}

## Sides, desserts and drinks

A meal can have more than one dish. Tap a planned meal on the **Plan** tab to open it, then **Add a side**, **Add a dessert**, **Add a drink**, or **Add another main** for a night with two dinners. Each one is a meal from the library or something you type. The arrows move them up and down, and the cross takes one away.

On the wall, views with room list every dish under the main one ("Side: Garlic bread"). The full-screen Week and the List view name them on a line under the main dish ("with Garlic bread and Brownies"); the Week grid and Compact views, which are tight on space, show a count instead, like **+3**. Sides and desserts go on the grocery list like any other meal.

A meal saved as a side, dessert or drink (its **Kind of dish**) says so in the library, and the **Sides**, **Desserts** and **Drinks** filters there show only those.

## 4. The grocery list

**Grocery** builds a shopping list from the ingredients of every meal in the week you are looking at, grouped by aisle. Tap an item to tick it off; ticks show up on every phone and stay with that week's list, so next week's list starts fresh. **Share** sends the unticked items to your phone's share sheet, or copies them if sharing is not available.

You cannot type straight into the list. To add something, add it as an ingredient to a meal in the library.

## Settings

The gear on the Meals tab, and the **Meals** page in the editor's Settings, edit the same things: which slots you use (breakfast, lunch, dinner, snack), which day your week starts on, the default time for each slot, and whether times show as 12-hour or 24-hour (or follow the household setting under Location & language). They are shared, so a change on the phone changes every meal planner on every display.

{% screenshot name="settings-meals" caption="Settings > Meals. The same settings are behind the gear on the phone." /%}

## Plan with Mealie {% #mealie %}

If your family keeps its recipes in [Mealie](https://mealie.io), Home Screens can use them directly. Your recipe library stays in Mealie: nothing is copied over.

1. In Mealie, open your profile, then **API Tokens**, and make a new token. The meal plan Home Screens shows is the one for the household of the person who made the token.
2. In the editor, go to **Settings > API keys**, fill in the **Mealie** card with your Mealie address (for example `http://192.168.1.20:9925`) and the token, and press **Test**. It says which household it found.
3. In **Settings > Meals** (or the gear on the phone's Meals tab), set **Your meal plan lives in** to **Mealie**.

From then on:

- Every meal planner on every display, and the full-screen calendar's meal rows, show the plan from Mealie, with each recipe's photo.
- Planning on the phone or in the editor writes straight to Mealie. The picker searches all your Mealie recipes as you type, with your favorites and recently made recipes one tap away. Adding a side, dessert or drink opens on your Mealie category of that name when you have one. Anything you type instead of picking a recipe becomes a note in Mealie.
- Sides, desserts and drinks in Mealie show up as part of that day's dinner.
- **Suggest** fills the week's empty dinners with your Mealie recipes and never replaces a planned meal. A night covered by a meal plan rule in Mealie ("Friday is pizza night") follows the rule; otherwise Home Screens picks from your Dinner or Main category if you have one, or else from anything that isn't in a dessert, drink, side, breakfast or starter category. **Undo** right after takes those picks back out of Mealie.
- A serving time set for one meal, and the order of a meal's dishes, are kept by Home Screens, because Mealie has no place for them. Mealie will not show them.
- Each recipe shows its whole time from Mealie, prep plus cooking.
- Changes made in Mealie reach the wall within about two minutes.
- The grocery list stays in Mealie. The phone's **Grocery** tab has a button that opens it.

If Mealie stops answering, the wall keeps showing the last plan it had, and planning waits until Mealie is back. Switching back to **Home Screens** brings back the plan you had before; nothing in it was changed while Mealie was in charge.

Mealie 2.0 or newer is needed. Only want the meals on your calendar? Mealie 3.29 and newer can share the meal plan as a calendar link, which you can add on the [Calendar page](/docs/calendars) like any other.

## Recipes on the wall

A meal with a recipe link does more on a touchscreen: tap it and the wall shows a QR code that opens the recipe on your phone, or opens the page right there on the display.

## Next steps

- [Chores and rewards](/docs/chores): the other half of the family remote
- [On your phone](/docs/remote-control): timers, photos, and controlling the wall
- [Modules](/docs/modules#personal): the meal planner's views
