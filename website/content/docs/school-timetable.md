---
title: School timetable
nextjs:
  metadata:
    title: School timetables on the wall
    description: Put each child's school week on the display. Bell times, subjects, the day that is on now, and what to pack, typed in or imported from a spreadsheet.
    alternates:
      canonical: /docs/school-timetable
---

One card per child with their school week on it and today lit up. The card turns to next week once Friday's last lesson is over, and says "no school" through the holidays. {% .lead %}

Timetables are typed in the editor, in the module's own settings panel. There is no timetables tab on your phone: a school week is typed in once or twice a year, so it lives where you build the screen rather than with the things you tick off every day. Once a week is in, every display that shows a timetable shows it.

## First, add everyone in Family

The timetable module never creates a person. It shows the people who are already in your family, and it takes their name, colour and picture from there, so a child you rename once is renamed everywhere.

Add everyone first in the editor under **Settings > Family**, or on your phone at `/remote` under **Settings > Family**. See [Family](/docs/family). Then come back and give them a timetable.

## 1. Put it on a screen

In the editor, drag **School Timetable** from the **Personal** group onto a screen. Its settings panel lists everyone in your family:

- Somebody who already has a timetable gets a tick box. Tick them to put their card on this screen.
- Somebody who has none gets **Add**, which opens the timetables window on them.

Cards appear in the order Family lists people in, so moving somebody up there moves their card. The rest of the panel decides how the cards look:

- **Layout**: **Side by side** or **Stacked**. The module keeps what you pick and never rearranges itself to fit the box.
- **Detail**: **Less**, **Some** or **More**. Less keeps the short subject codes and suits three or more children side by side. Some adds full names, and the room on the day that is showing. More adds start and end times, after-school care, the week letter, and a line saying what to pack today.
- **Show start times** puts the time each period starts next to its number. At **More** it shows the start and the end.
- **Show next week from Friday** turns the card to next week once the last lesson of the week is over, instead of showing an empty weekend.

For a heading above the cards, set **Title** at the top of the same panel to **My own words** and type them, for example "School week".

Colour, background and font come from the **Style** section above. One thing to know before picking a strong background: every lesson takes its colour from its subject and mixes it into the card's background, so a deep, saturated background flattens the subject colours into much the same shade. A plain light or dark background keeps them apart.

## 2. Open the timetables window

**Edit timetables** in the same panel opens the timetables window. There is no Save button: changes save as you make them, and **Done** closes the window. It has four tabs: **Timetables**, **Schools & times**, **Subjects** and **Dates**.

### Schools and bell times

**Schools & times** is where a school day is described once. Everyone at that school shares it, so brothers and sisters at the same school are only typed in once.

Choose **Add school**, give it a name, and start from one of the ready-made days (short lessons with a long day, short lessons with a shorter day, or hour-long lessons), or from a blank one and type your own. Every period and every time can be changed afterwards.

- **Period** adds a numbered lesson, **Break** adds a named gap such as Break or Lunch. Breaks show on the wall as a band across the week.
- **After-school care**: give it a name and the time it runs until, one time per day. Leave a day empty when there is no care that day.

Two more things belong to the school and sit in the right-hand column of this tab: whether its weeks alternate, and its days off. Both have a section of their own below.

### Painting a week

**Timetables** shows one child at a time, with the family down the left. Pick their school and type their class, then pick a subject from the palette and click or drag across the grid to fill lessons in. **Clear** wipes periods back to free, the **Lunch** brush marks a lunch period, and **Add subject** adds a subject without leaving the grid. **Show subject icons** draws a small picture in every lesson, which helps younger readers.

#### Rooms and course groups

A lesson that already has a subject gets a small pencil in its corner. That opens two extra boxes for the lesson.

- **Room** is free text, such as `112` or `Bio 1`, and shows under the subject on the card.
- **Course group** is a short badge for the set or stream a lesson belongs to, up to six characters. Schools that split a year group into different levels for a subject use this: in Germany it is usually `LK` or `GK`, in the UK something like `Higher` or `Foundation`, and elsewhere often just a set number. Leave it empty if your school does not split classes this way, which most do not.

Underneath there is a **Copy to every …, both weeks** button, so giving one Chemistry lesson its room fills in every other Chemistry lesson at once, in both the A and the B week. That is usually how a real school works. It copies only the boxes you have filled in, so an empty box never wipes what the other lessons already have.

### Subjects

Subjects are shared by everybody, so giving one a different colour changes it on every card. Each one has a short code for narrow cells, a full name, a colour, a picture, and an optional **Bring along** note such as a gym kit.

The short code is what a card falls back to when a cell is too narrow for the full name, so keep it recognisable at a glance. It can be up to six characters.

Your household starts with the common subjects for your language, ready to paint with. Add, rename or recolour them as you like. Removing one takes it off every timetable that used it, after asking.

## 3. Import from a spreadsheet

If school hands the timetable out as a spreadsheet, import it instead of painting it in. **Import from a spreadsheet** in the timetables window takes either a Google Sheet link or a file off this computer.

### From a Google Sheet

1. In Google Sheets press **Share**, set it so anyone with the link can view, and copy that link. You do not need to publish the sheet. A sheet that is still private comes back asking you to share it.
2. Paste the link and press **Check**. Nothing is saved at this point.
3. The tabs in the sheet are listed with a summary of each one. A tab named after somebody in your family is matched to them; for the rest, say who the tab is for or skip it. A tab for somebody who is not in Family yet cannot be imported, so add them on the Family page first.
4. Codes in the sheet that are not in your subjects are listed. Each one is matched to the closest subject you already have, and you can pick a different one or add it as new.
5. **Keep in sync with the sheet**, at the foot of the screen, is off unless you turn it on. What it does is below.
6. **Import** fills the weeks in.

Some sheets will not list their tabs. That is not a failure: the screen asks for one link per person instead, which you copy from the address bar with that person's tab open.

### From a file on this computer

Under the link box, **Or pick a file from this computer** takes a CSV saved out of Excel, Numbers or Google Sheets. **Choose a file** lets you pick one, or one for each child at once, and then the screen works exactly as it does for a link: a summary of what was found, the subjects to confirm, and **Import**.

Name each file after the person it is for, like `Taylor.csv`, and it finds them. Any file it cannot place you point at the right person yourself, the same way you would a tab.

Nothing is uploaded anywhere. Your browser reads the text out of the file and sends that on, and the file itself never leaves your machine. A file also carries no link to go back to, so there is nothing to keep in sync with: the week is simply yours from the moment it lands.

### What the spreadsheet should look like

Either way, the shape it reads is the one most schools use: the days across the top, one row for each lesson, and the times down the left. **Download a sample sheet** on the import screen gives you a small example to copy, and the screen draws the same shape while it waits for a link or a file. A row named Break or Lunch becomes a break, an empty cell is a free period, and a cell written as `Math / A107` puts that lesson in room A107. Use whatever you already call each subject. Anything it does not recognise is left out rather than guessed at.

An import only fills in timetables for people who are already in Family. It never adds anyone.

### Keeping up with the sheet

**Keep in sync with the sheet** has Home Screens look at the sheet about once an hour, while a display is showing the timetable, and put a new week up on its own. A timetable changes about twice a year, so importing once is usually enough; turn it on if your school keeps editing the sheet through the term.

Three things it will not do:

- **A failed look never blanks a week.** If Google cannot be reached, or the sheet has been moved or unshared, the week you already have stays exactly as it is and the wall keeps showing it. The window says when the last look failed, and it keeps trying every hour.
- **Editing a week by hand takes it off the sheet.** Paint one cell and the hourly look switches itself off, so it can never throw away what you typed. The window says so when it happens, and **Undo** puts the week back on its sheet if that is what you meant. Turning the switch on again does the same, and the next look brings the sheet's week back.
- **Only the week the sheet holds is replaced.** A second week you built by hand for an A and B school is yours, and a code in the sheet you have no subject for leaves that lesson empty rather than guessing at one.

A week that came from a link gets a **From a spreadsheet** button above the grid on the **Timetables** tab, saying **In sync**, **Checking…**, **Couldn't check**, or **Not following the sheet**. Open it for the link itself, when it was read and when it was last looked at, and the buttons to look now, to import again, or to open the sheet. **Check now** looks while you wait and says whether the sheet had a new week; after a look that failed the same button says **Try now**. The switch sits at the bottom of the same panel, so a week can be put back on its sheet or let off it at any time.

## 4. A and B weeks

Some schools run two different timetables and alternate between them, so the lessons in one week are not the lessons in the next. The two are usually called the A week and the B week. If your school gives every week the same timetable, you can skip this section entirely: leave the setting **Off** and nothing changes.

In **Schools & times**, under **A and B weeks**, say which weeks are the A week, or leave it **Off**. The choice is between **Odd week numbers are A** and **Even week numbers are A**, counted from the start of the year, which is how schools that do this usually publish it. The window then tells you which letter this week is and which one next week is, so you can check that against the school's own calendar before you paint anything.

This setting belongs to the school, not to one child, so turning it on changes the rule for every brother and sister at that school.

In **Timetables**, set **Weeks** to **A and B** for a child whose two weeks really differ, and use **Editing week** to switch between them while you paint. A child whose week is the same every time stays on **Same each week**.

On the wall the week letter shows at the More detail level, and the card names the lessons that differ between the two weeks underneath the grid.

## 5. Days off

Two kinds of day off reach the card, and both belong to the school. You set them in **Schools & times**, one under the other in the right-hand column.

**School holidays** sits between **A and B weeks** and **Days that are different**. Say whose holidays this school follows and they arrive on their own. During a holiday the card says no school, names the holiday, and shows the day school starts again. Public holidays close a day too.

It belongs to the school because a school is in a place. If your children are at schools in two different states, or two different countries, each card gets its own dates right, and the window asks you about each school in turn. A school with nothing picked follows no holidays at all, which is where a new school starts, and in the picker that is **None**.

What there is to pick depends on what your country publishes. The row shows you which case you are in rather than leaving you to find out:

- **A list of regions.** Pick the one your school is in, and both school holidays and public holidays close a day.
- **The same list, with a line saying only public holidays show as days off.** Your country lists regions, but nobody publishes its school holiday dates.
- **Your country, as the only thing to pick.** Some countries publish one set of school holidays for the whole country and no regions at all, so there is nothing to narrow down.
- **Nothing to pick, and a line saying there are no holiday dates for your country.** Mark those days yourself under **Days that are different**, below.
- **A box to type a region code into**, such as `DE-NW`. That is what you get when your country could not be worked out, or when the holiday list could not be reached just now.

Which country falls into which case comes from the holiday service and does change, so take the row as the answer for yours. As this is written, Germany, France and the Netherlands have both kinds of dates, Spain lists regions but no school holiday dates, and the United States, Denmark and Brazil have neither. The United States is worth a word: school closures there are set district by district and there is no national list to read, so this is not something waiting to be added. **Days that are different** is how a household in the US marks a day off.

The word the row uses for the thing you are picking is your country's own, so a household in Germany is asked about a federal state and one in Spain about an autonomous community.

The country all of this is worked out from is the one you set for public holidays under **Settings > Calendar**. With none set it follows the location you saved under **Settings > Location & language**, and failing that the language the display is set to.

**Days that are different** are the ones only your school knows about: a carnival Monday off, or a morning that ends after period 3. They sit just below School holidays. Give each one the date, what it is called, and whether the whole day is off or it ends after a period.

## What the card shows

- The day that is on now is the wide column, with the rest of the week beside it. That is today while school is open, and the next school day at the weekend or in the holidays.
- Once the last lesson of the school week is over, the card turns to next week. At the weekend it shows next week with Monday to the front.
- A holiday, a public holiday or one of your own days off closes that day, and a holiday that is running now takes the card straight to the week school starts again.
- At Some and More, the going-home time sits under the last lesson of the day that is on.
- At Less and Some, a lesson with something to pack shows a small note on it when there is room. At More, everything for that day collects into one Bring line at the foot of the card, and after-school care gets a row of its own.

## The day view

Set **View** to **Day** and the module shows the whole family's next school day on one clock instead of a week per person. Every person gets a row with when they start on the left, their lessons laid out by the hour, and when they are done on the right, with after-school care running on after the last lesson. Under the rows a packing card says what goes in each bag, read off the subjects' **Bring** lines. Somebody with nothing extra to bring says so, and somebody whose school is shut that day says why.

Before **Show tomorrow after** (4 pm unless you change it) the card shows today, which makes it a good breakfast screen. From that time on it shows the next school day, so in the evening it already has tomorrow up. Friday evening and the weekend show Monday, and a holiday for everyone skips to the first day back.

**Layout** means something different here. **Stacked** puts each person on a row, one under the other, which suits a television. **Side by side** gives each person a column with time running down, which suits a portrait wall, with the bag list in each column's head. **Detail** works as it does for the week: **Less** keeps short subject codes, **Some** adds full names and rooms, **More** adds start times and the school under each name.

A day that ends early stays on the clock: the lessons that are not happening fade, a dashed line marks the new end, and the end column shows the usual time underneath. While the card shows today, a line across the clock marks the current time, with the time on the ruler beside it; **Show a line at the current time** turns it off.

A common setup is the week view on the everyday screen and the day view on an evening screen. Give the evening screen a schedule, or put it in a profile, and the display turns the page for you.

## Tests, things to bring, and cancelled lessons

The **Dates** tab in the Timetables window is for the things that change every week: a test, a one-off thing to bring, or a lesson that is off. Pick who, pick the day, and the form tells you what that day already is for them (Friday, week A, school 07:50 to 13:15). A test picks one of the subjects they have that day; a lesson that is off ticks one or more of that day's lessons, and the form says straight away when they are now done. Something to bring works on any day, even one with no school, for a trip or a party.

On the wall, a test puts a pencil on that lesson and a pill on the packing card. A lesson that is off fades, the going-home time moves, and the usual time shows underneath. At More, the week card's footer also says what tomorrow brings ("Tomorrow: maths test"). Dates clear themselves two weeks after they have passed.

## Where the data lives

Timetables are kept on the hub, next to chores and meals, and are included in backups. A timetable belongs to one person, so removing somebody under **Settings > Family** deletes their timetable along with the rest of their records. The confirmation says so before anything happens.

Holiday dates that have been looked up are saved on the hub too, so if the internet or the holiday service is down, the wall keeps showing the dates it already has.
