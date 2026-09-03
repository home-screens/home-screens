---
title: Voice Control
nextjs:
  metadata:
    title: Voice Control
    description: Talk to your displays through Home Assistant, wake them, jump to a screen, announce dinner, check off chores, and ask what's for dinner.
    alternates:
      canonical: /docs/voice-control
---

"Show the calendar." "Tell everyone dinner is ready." "Alice finished the dishes." If you run [Home Assistant](https://www.home-assistant.io/), you can control your displays and ask about your family's day entirely by voice. {% .lead %}

Everything on this page is two YAML files you copy into your Home Assistant configuration, no add-on to install, nothing extra running on the Pi, and nothing leaves your house. It works with any [Assist](https://www.home-assistant.io/voice_control/) voice device: a [Home Assistant Voice Preview Edition](https://www.home-assistant.io/voice-pe/) speaker, the Assist button in the Home Assistant phone app, or just the Assist text box in a browser. The displays never listen to anything; your voice device talks to Home Assistant, and Home Assistant talks to the Home Screens hub over your network.

---

## What you need

- A Home Screens hub reachable from Home Assistant (you'll need its address, e.g. `192.168.1.100:3000`)
- Home Assistant with the ability to edit `configuration.yaml` (this guide was written and tested against Home Assistant 2026.7)
- Something to talk to: a Voice PE speaker, the phone app's Assist button, or the Assist text box, the text box is enough to set everything up before a speaker ever arrives
- If you've set a Home Screens password: your **display token**, from **Settings > Security** in the editor
- For the [house modes](#house-modes-change-what-the-displays-show) section only: the Home Screens **Home Assistant plugin** installed on your displays

---

## Two ways to drive a display

The package below gives you both, and they're good at different things:

- **Commands** are for doing things: wake up, next screen, show the calendar, set brightness, announce a message. They're one-shot, Home Assistant pushes a command to the hub, and each display picks it up within a few seconds.
- **Modes** are for changing what the displays *show*: cooking mode, movie mode, bedtime. A mode is ordinary Home Assistant state, so it survives restarts on both ends, if a display reboots mid-evening, it comes back still in movie mode. Modes are the recommended way to change content by voice; save commands for actions.

---

## Install

1. Make sure your Home Assistant configuration loads [packages](https://www.home-assistant.io/docs/configuration/packages/). If it doesn't already, add this to `configuration.yaml`:

   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```

2. Copy [the package file](#the-package-file) below to `<config>/packages/homescreens.yaml`.

3. Copy [the sentences file](#the-sentences-file) below to `<config>/custom_sentences/en/homescreens.yaml`.

4. In the package file, type your hub's address into the `homescreens_host` box at the top, it's the only place the address lives; every command and sensor builds its URL from it.

5. Add your display token to `secrets.yaml`, including the word `Bearer`:

   ```yaml
   homescreens_auth: "Bearer your-display-token-here"
   ```

   The token is in the Home Screens editor under **Settings > Security**. If you haven't set a Home Screens password, put any placeholder text there, the hub ignores the header until a password exists, and your setup keeps working the day you add one.

6. Reload: **Developer Tools > YAML > All**. (Later edits to the sentences file are picked up by running the `conversation.reload` action, no restart needed.)

7. In the sentences file, fill in the `display:` list at the bottom, one row per display, mapping what you say ("kitchen") to the display ID from the editor. Single-display installs can skip this: sentences that don't name a display reach your display automatically.

---

## Try it before the speaker arrives

Open **Developer Tools > Assist** and type sentences instead of saying them. It runs the exact same pipeline a voice speaker uses, so you can test every command and question, and read the responses, before any hardware is involved. Start with:

- *wake up the displays*
- *what's for dinner tonight*
- *tell everyone this is a test*

If a sentence isn't recognized after you've edited the sentences file, run the `conversation.reload` action (**Developer Tools > Actions**) and try again.

---

## What you can say

Square brackets are optional words; where a display isn't named, the command goes to every display (except "show the … screen", which targets your one display, or the display you name).

### Display commands

| Say | What happens |
|---|---|
| "wake up the [kitchen] display[s]" / "turn on the displays" | Wakes from sleep |
| "put the display[s] to sleep" / "turn off the kitchen display" | Sleeps (black screen) |
| "next screen [on the kitchen display]" | Advances one screen |
| "previous screen" / "go back a screen" | Back one screen |
| "show the calendar [screen]" / "jump to the photos screen on the kitchen display" | Jumps straight to a screen by its name |
| "keep the displays on [tonight]" | Holds off sleep, dimming, and idle for 8 hours |
| "keep the kitchen display on for 2 hours" | Same, for the time you say (up to 24 hours) |
| "dim the displays to 30 percent" / "set the display brightness to 80" | Sets brightness |
| "tell everyone dinner is ready" / "announce …" | Banner on every display |
| "clear the announcements" | Dismisses banners |

### House modes

| Say | What happens |
|---|---|
| "cooking mode [on the displays]" | Switches `display_mode` to cooking |
| "switch the house to bedtime" / "turn on movie mode" | Same, any mode you've defined |
| "turn on guest mode" / "guest mode off" | Flips the guest switch |

What each mode actually changes on screen is up to you, see [house modes](#house-modes-change-what-the-displays-show) below.

### Family questions

| Say | The answer |
|---|---|
| "what's for dinner [tonight]" / "what's for lunch tomorrow" / "what's for dinner on friday" | Reads the meal plan ("supper" works too) |
| "what's for dinner this week" | The week ahead, one meal per day |
| "what do we need for dinner [tomorrow]" | The planned meal's ingredient list, with amounts |
| "did Alice finish her chores" | An honest yes or no, "Yes! Alice finished all 4 chores today" or "Not yet, 2 of 4 done" |
| "what chores does Alice have [left] [tomorrow]" / "what's left for Alice" | The actual chore names still to do, with points |
| "who hasn't done their chores [today]" | Names anyone with nothing checked off yet |
| "how many points does Alice have" | Their reward-point balance |
| "what can Alice get with her points" | Rewards they can afford right now, or how far the closest one is |
| "what's on the grocery list" | Everything still to buy from this week's planned meals |
| "what's showing on the kitchen display" | The current screen's name, or that it's asleep |

The chore-list, chores-tomorrow, honest yes/no, and grocery answers need a hub with `/api/chores/today` and `/api/meals/grocery/list` (newer than 1.8.0). On an older hub those sentences answer "I can't check … right now", the chore yes/no falls back to a completion count, and everything else works unchanged.

### Checking things off

| Say | What happens |
|---|---|
| "Alice finished the dishes" / "mark the dishes done for Alice" | Checks it off for today and credits the points, the answer confirms them ("Nice! That's 2 points for Alice.") |
| "check off the tortillas" / "we got milk" | Ticks it on the grocery list |
| "put milk back on the list" / "we still need milk" | Unticks it |

Saying any of these twice is safe: repeats can never un-check a chore or a grocery item, the second time you just get told it's already done.

---

## The package file

Download **[homescreens-package.yaml](/files/homescreens-package.yaml)** and save it as `<config>/packages/homescreens.yaml`. Put your hub's address in the `homescreens_host` box at the top before the first reload. The first part of the file looks like this:

```yaml {% process=false %}
# Home Screens, Home Assistant package
# Voice + automation control of Home Screens displays through HA's Assist
# pipeline. Pairs with custom_sentences/en/homescreens.yaml.
# Setup guide: https://homescreens.dev/docs/voice-control
#
# Set your hub's address in the homescreens_host box below, and add to
# secrets.yaml:
#   homescreens_auth: "Bearer <display token>"
#
# Targets: every command takes an optional `display` (a display ID from the
# editor, e.g. `kitchen`). Omitted → `all` (every display). Single-display
# installs without a displays registry need no changes: `all` broadcasts
# also reach the legacy default queue that an ID-less display polls.

# ── Hub address ─────────────────────────────────────────────────────────
# Every command and sensor below builds its URL from this helper, so the
# address lives in exactly one place. Type yours here before the first
# reload (address and port, no http://, no trailing slash).
#
# `initial` only takes effect when the helper is first created. To change
# the address later, edit the helper's value in the HA UI instead
# (Settings > Devices & services > Helpers > "Home Screens hub address").
input_text:
  homescreens_host:
    name: Home Screens hub address
    icon: mdi:server-network
    initial: "192.168.1.100:3000"

# ── House modes ─────────────────────────────────────────────────────────
# The recommended way to change what the displays SHOW by voice. The mode
# lives in HA as normal state (declarative, survives reboots on both ends);
# the Home Screens HA plugin publishes it to the shared state bus, and
# modules in the editor use visibility conditions keyed on
#   plugin:home-assistant:input_select.display_mode
# e.g. a meal-planner overlay with "state equals cooking", or hiding busy
# modules with "state not equals movie". Rename/add options freely, the
# option strings are the exact values conditions compare against, so keep
# them lowercase (bus keys and enum matching are case-sensitive).
#
# The HomeScreensSetMode / HomeScreensGuestMode sentences below make both
# … the file continues; download it above for the whole package.
```

---

## The sentences file

Download **[homescreens-sentences.yaml](/files/homescreens-sentences.yaml)** and save it as `<config>/custom_sentences/en/homescreens.yaml`. After edits, run the `conversation.reload` action to pick them up. The first part of the file:

```yaml
# Home Screens, Assist custom sentences (English)
# Pairs with packages/homescreens.yaml (the matching intent_script handlers).
# Setup guide: https://homescreens.dev/docs/voice-control
#
# The `display` list at the bottom is yours to maintain: one row per
# display, where `in` is what you say and `out` is the display ID from the
# Home Screens editor. Sentences without a display name target every display.

language: "en"

intents:
  HomeScreensWake:
    data:
      - sentences:
          - "wake [up] the display[s]"
          - "wake [up] the {display} display"
          - "turn on the displays"
          - "turn on the {display} display"

  HomeScreensSleep:
    data:
      - sentences:
          - "put the display[s] to sleep"
          - "put the {display} display to sleep"
          - "turn off the displays"
          - "turn off the {display} display"

  HomeScreensNextScreen:
    data:
      - sentences:
          - "next screen"
          - "next screen on the {display} display"
          - "[go to the] next screen on the {display}"

  HomeScreensPrevScreen:
    data:
      - sentences:
          - "previous screen"
          - "previous screen on the {display} display"
          - "go back a screen [on the {display}]"
# … the file continues; download it above for all of the sentences.
```

---

## House modes: change what the displays show

Commands are fine for "wake up" and "next screen", but for "cooking mode" you don't want a one-shot command, you want the house to *be* in cooking mode until you say otherwise. That's what the `display_mode` dropdown in the package is for, and it's the recommended way to change content by voice: modes survive restarts and screen rotation because they're state, not commands.

It takes the [Home Assistant plugin](/docs/plugins) running on your displays, plus a little setup in the editor:

1. Install the Home Screens **Home Assistant plugin** and connect it to your Home Assistant (if you haven't already).
2. In the editor, select a module and open **Visibility > Conditions**.
3. Add a condition on the key `plugin:home-assistant:input_select.display_mode` and pick what each mode should show or hide.

You don't need to configure the plugin to publish the mode, the moment a condition anywhere references that key, the plugin starts sending it along, and the editor's **Live values** panel shows what it currently is.

Some starting recipes:

| What you want | Condition | Before data arrives |
|---|---|---|
| A meal-planner overlay only while cooking | value **equals** `cooking` | Hide the module |
| A chore-chart takeover at bedtime | value **equals** `bedtime` | Hide the module |
| Hide busy modules during a movie | value **does not equal** `movie` | Show the module |
| Hide personal touches for guests | `…input_boolean.guest_mode` value **does not equal** `on` | Show the module |

The third column is the condition's **Before data arrives** setting, and it's worth getting right: for modules you *add* in a mode, choose "Hide the module" so they only appear on a definite match; for modules you *remove* in a mode, choose "Show the module" so your normal dashboard stays intact even if Home Assistant is briefly unreachable. Overlays for different modes can share the same spot on the canvas, only one mode is active at a time.

{% callout type="warning" title="Mode names are case-sensitive" %}
The dropdown's option strings are the exact values conditions compare against, so keep them lowercase and make your conditions match exactly. If a condition never seems to trigger, open the editor's Live values panel next to the condition, it shows the value the display currently sees and warns about case mismatches.
{% /callout %}

Then "cooking mode on the displays", "switch the house to bedtime", and "turn on movie mode" just work, and because the mode is a normal Home Assistant dropdown, your automations and dashboards can set it too, no voice required.

---

## Make it yours

Everything in both files is meant to be edited:

- **Display names**: fill in the `display:` list in the sentences file, one row per display. The `in` side accepts alternatives: `"(living room|livingroom)"`.
- **Screen names**: "show the calendar" matches your screen's *name* in the editor, ignoring upper/lower case. Give screens short, speakable names. A screen that isn't in the display's current rotation (for example, one excluded by the active profile) is deliberately ignored.
- **Chore and kid names**: spoken names are matched against the chore chart, so keep them speakable and unique. Two chores with the same name resolve to whichever the chart lists first.
- **Modes**: rename or add options in the `input_select`, and mirror them in the sentences file's `mode:` list. Keep them lowercase.
- **Meal words**: the `meal_slot:` list already treats "supper" as dinner; add your own household vocabulary the same way.
- **Responses**: everything Assist says lives in the `speech:` templates in the package. Rewrite them to taste.
- **More sensors**: the display-status block in the package is per display; copy it for each display you want to ask about, keeping the `Home Screens display <id>` naming pattern.

After editing the sentences file, run `conversation.reload`; after editing the package, reload YAML (**Developer Tools > YAML > All**).

---

## Going further

The package's `rest_command`s work from any automation or script, not just voice. A few combinations that earn their keep:

**A chore reminder that reaches everyone.** At 7pm, if anyone has nothing checked off, put it on every display (and let your voice speaker say it too, if you like):

```yaml {% process=false %}
automation:
  - alias: "Evening chore reminder"
    triggers:
      - trigger: time
        at: "19:00:00"
    actions:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_chore_completions
      - variables:
          idle: >-
            {% set people = state_attr('sensor.home_screens_chore_roster', 'members') or [] %}
            {% set comps = state_attr('sensor.home_screens_chore_completions', 'completions') or [] %}
            {% set today = now().strftime('%Y-%m-%d') %}
            {% set done_ids = comps | selectattr('date', 'eq', today) | map(attribute='memberId') | list %}
            {{ people | rejectattr('id', 'in', done_ids) | map(attribute='name') | list }}
      - condition: template
        value_template: "{{ idle | count > 0 }}"
      - action: rest_command.homescreens_alert
        data:
          message: "{{ idle | join(', ') }}, chore time before bed!"
          type: warning
          duration: 60
```

**A bedtime scene.** One script that flips the displays to bedtime mode and turns them down, ready for "run bedtime" or a good-night automation, add your lights to the same sequence:

```yaml
script:
  bedtime_displays:
    alias: "Bedtime displays"
    sequence:
      - action: input_select.select_option
        target:
          entity_id: input_select.display_mode
        data:
          option: bedtime
      - action: rest_command.homescreens_brightness
        data:
          value: 10
```

**Doorbell on every screen.** Any automation can push a banner, it rides the same package:

```yaml
- action: rest_command.homescreens_alert
  data:
    message: "Someone's at the front door"
    type: urgent
```

---

## Troubleshooting

**"Sorry, I couldn't understand that."** The sentence has to match one of the patterns in the sentences file. Test the exact wording in **Developer Tools > Assist**, and after editing the file, run the `conversation.reload` action. If you named a display, check it has a row in the `display:` list.

**Assist answers, but nothing happens on the display.** Check the hub address in the `homescreens_host` helper, remember that after the first reload, changing it in the file does nothing; set it from the HA UI instead (Settings > Devices & services > Helpers). Then watch the Home Assistant logs for the `rest_command` result. A `401` means the hub has a password and the `homescreens_auth` secret is missing or doesn't start with `Bearer `. Displays pick commands up on a short poll, so an effect can lag a couple of seconds, that's normal.

**"Show the calendar" does nothing.** The spoken name must match a screen name on the *target* display (upper/lower case doesn't matter). Screens hidden by the active profile are ignored on purpose. On a multi-display install, name the display in the sentence or set a default display in the `HomeScreensGotoScreen` handler, this is the one command that never broadcasts to all displays.

**Answers feel out of date.** The meal and chore sensors poll every few minutes, and the chore intents refresh before answering; the worst case after checking something off elsewhere is a brief window where the spoken count lags. The check-off command itself always verifies against the hub live, so repeating yourself can't un-do a chore.

**A mode condition never triggers.** Almost always a case mismatch, see the callout in [house modes](#house-modes-change-what-the-displays-show).

For the underlying endpoints (and what each one needs once a password is set), see [Display Control](/docs/api#display-control) in the API reference.
