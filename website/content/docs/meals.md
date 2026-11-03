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

In the editor, drag **Meal Planner** from the **Personal** group onto a screen. Its views are in the module's settings: the whole **week**, **today**, the **next meal**, a **compact** strip, a **list**, the **grocery list**, and your **recipes**. The **Full-Screen Meal Planner** fills the screen with a week, a day, a **menu board**, the next meal, the next meal's **recipe**, the grocery list, or a **recipe book**.

The planner is empty until you add meals, which you do on a phone or in the editor with **Edit Meal Plan** in the module's settings (**Edit Meal Planner** on the Full-Screen Meal Planner).

On a touchscreen, the week and the list have arrows at the top (or a sideways swipe) to see next week's plan, and back: eight weeks either way, or, while the plan lives in Mealie, three weeks ahead and one back. **Back to this week** comes straight back, and a minute after the last touch the planner slides back to this week on its own. The week your meal plan starts on is its own setting, apart from the calendars'.

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

Put the list on the wall with the **Grocery List** view of either Meal Planner module. On a touchscreen anyone can tick things off right there, and the ticks are the same ones the phone shows.

## Settings

The gear on the Meals tab, and the **Meals** page in the editor's Settings, edit the same things: which slots you use (breakfast, lunch, dinner, snack), which day your week starts on, the default time for each slot, and whether times show as 12-hour or 24-hour (or follow the household setting under Location & language). They are shared, so a change on the phone changes every meal planner on every display.

{% screenshot name="settings-meals" caption="Settings > Meals. The same settings are behind the gear on the phone." /%}

## Plan with Mealie {% #mealie %}

If your family keeps its recipes in [Mealie](https://mealie.io), Home Screens can use them directly. Your recipe library stays in Mealie: nothing is copied over.

1. In Mealie, open your profile, then **API Tokens**, and make a new token. The meal plan Home Screens shows is the one for the household of the person who made the token.
2. In the editor, go to **Settings > API keys**, fill in the **Mealie** card with your Mealie address (for example `http://192.168.1.20:9925`) and the token, and press **Test**. It says which household it found.
3. The card then asks **Use Mealie for your meal plan?** Press **Use Mealie**. You can also switch later, or switch back, in **Settings > Meals** (or the gear on the phone's Meals tab), under **Your meal plan lives in**.

From then on:

- Every meal planner on every display, and the full-screen calendar's meal rows, show the plan from Mealie, with each recipe's photo.
- Planning on the phone or in the editor writes straight to Mealie. The picker searches all your Mealie recipes as you type, with your favorites, recently made recipes and your Mealie cookbooks one tap away. Adding a side, dessert or drink opens on your Mealie category of that name when you have one. Anything you type instead of picking a recipe becomes a note in Mealie.
- The phone's **Library** shows your Mealie recipes, with your categories and cookbooks as filters.
- A meal planned in Mealie as a double batch (or any other amount) stays that way when you change it in Home Screens, and the wall's **Recipe** view and recipe card show the amounts and servings for that batch.
- Sides, desserts and drinks in Mealie show up as part of that day's dinner.
- **Suggest** fills the week's empty dinners with your Mealie recipes and never replaces a planned meal. A night covered by a meal plan rule in Mealie ("Friday is pizza night") follows the rule; otherwise Home Screens picks from your Dinner or Main category if you have one, or else from anything that isn't in a dessert, drink, side, breakfast or starter category. **Undo** right after takes those picks back out of Mealie.
- A serving time set for one meal, and the order of a meal's dishes, are kept by Home Screens, because Mealie has no place for them. Mealie will not show them.
- Each recipe shows its whole time from Mealie, prep plus cooking.
- Changes made in Mealie reach the wall within about two minutes.
- The **Grocery** tab on the phone and in the editor's meal planner shows your Mealie shopping list, sorted by the labels you set up in Mealie. Check things off as you shop and they are checked off in Mealie too; changes made in the Mealie app show up within about half a minute. Things checked off before you opened the tab fold away at the bottom, and anything put back on the list comes back up to its aisle.
- The **Grocery List** view on the wall shows that same Mealie list, and ticks made on a touchscreen go to Mealie too.
- Type something in the box at the top of the Grocery tab ("milk") and it goes on the list in Mealie, with **Undo** for a few seconds in case it went on the wrong list. Something already on the list isn't added twice, and something checked off is put back instead.
- If you keep more than one list in Mealie, pick the one you shop from at the top of the Grocery tab. It is one choice for the whole family: the phone, the editor and voice ("what's on the grocery list?") all use that list, and the tab says so with an **Undo**. Until anyone picks, it is the list you made first.

If Mealie stops answering, the wall keeps showing the last plan it had, and planning waits until Mealie is back. Switching back to **Home Screens** brings back the plan you had before; nothing in it was changed while Mealie was in charge.

Mealie 2.0 or newer is needed. Only want the meals on your calendar? Mealie 3.29 and newer can share the meal plan as a calendar link, which you can add on the [Calendar page](/docs/calendars) like any other.

## Recipes on the wall

The **Recipe** view of the Full-Screen Meal Planner shows the next meal's recipe big enough to cook from: the ingredients and the numbered steps, from Mealie or from the ingredients and notes saved with a meal. A long recipe turns its pages by itself; on a touchscreen, **Next step** moves through the steps and keeps the screen from moving on while you cook.

On a touchscreen, tapping a meal can do more too (*Tap Meal to Open Recipe* in the module's settings): **Show recipe card** opens the same recipe on a card over the wall, with a QR code to take it along on your phone when the meal has a recipe link. **Show QR code** shows just the code, and **Open recipe on display** opens a meal's recipe link right there; a meal with no link but with ingredients or notes opens the recipe card instead. A new meal planner opens the recipe card.

The recipe card is made for cooking along: tap an ingredient to tick it off as it goes in, and step through with **Next step** or tap a page's dot. Once you tick an ingredient or tap a step, the screen stays awake and the card stays open until an hour goes by with nobody touching it. A card nobody uses closes after 10 minutes.

### A recipe book on the wall

For a kitchen that cooks from the wall instead of a cookbook, the **Recipe book** view of the Full-Screen Meal Planner shows every recipe as a tile with its photo and cooking time. Chips across the top pick Favorites, Recently made, All, or one of your cookbooks or categories. Tap the search box and a keyboard comes up on the wall, in your household's language; tap a recipe and it opens on the recipe card. The tiles scroll with a finger and go back to the top on their own a minute later.

With Mealie connected the book is Mealie's recipes, even if you plan meals in Home Screens. Without Mealie it is the meals in your library that have ingredients or notes. The small Meal Planner's **Recipes** view lists the same recipes in a narrow column, and opens the whole book over the screen to search.

### Send a recipe to the wall from your phone

Searching is quickest on a phone. In Meals on the phone, every recipe in the **Library** has a wall button, and a planned meal's sheet has **Show on the wall**: the recipe opens on the wall picked at the top of the remote, on the same card you would get by tapping it there. With **All displays** picked in a home with more than one wall, the phone asks which wall the first time and remembers your answer for recipes. Sent it to the wrong place? Tap **Take it down** in the message that follows.

## Next steps

- [Chores and rewards](/docs/chores): the other half of the family remote
- [On your phone](/docs/remote-control): timers, photos, and controlling the wall
- [Modules](/docs/modules#personal): the meal planner's views
