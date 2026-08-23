---
title: Voice Control
nextjs:
  metadata:
    title: Voice Control
    description: Talk to your displays through Home Assistant — wake them, jump to a screen, announce dinner, check off chores, and ask what's for dinner.
    alternates:
      canonical: /docs/voice-control
---

"Show the calendar." "Tell everyone dinner is ready." "Alice finished the dishes." If you run [Home Assistant](https://www.home-assistant.io/), you can control your displays and ask about your family's day entirely by voice. {% .lead %}

Everything on this page is two YAML files you copy into your Home Assistant configuration — no add-on to install, nothing extra running on the Pi, and nothing leaves your house. It works with any [Assist](https://www.home-assistant.io/voice_control/) voice device: a [Home Assistant Voice Preview Edition](https://www.home-assistant.io/voice-pe/) speaker, the Assist button in the Home Assistant phone app, or just the Assist text box in a browser. The displays never listen to anything; your voice device talks to Home Assistant, and Home Assistant talks to the Home Screens hub over your network.

---

## What you need

- A Home Screens hub reachable from Home Assistant (you'll need its address, e.g. `192.168.1.100:3000`)
- Home Assistant with the ability to edit `configuration.yaml` (this guide was written and tested against Home Assistant 2026.7)
- Something to talk to: a Voice PE speaker, the phone app's Assist button, or the Assist text box — the text box is enough to set everything up before a speaker ever arrives
- If you've set a Home Screens password: your **display token**, from **Settings > Security** in the editor
- For the [house modes](#house-modes-change-what-the-displays-show) section only: the Home Screens **Home Assistant plugin** installed on your displays

---

## Two ways to drive a display

The package below gives you both, and they're good at different things:

- **Commands** are for doing things: wake up, next screen, show the calendar, set brightness, announce a message. They're one-shot — Home Assistant pushes a command to the hub, and each display picks it up within a few seconds.
- **Modes** are for changing what the displays *show*: cooking mode, movie mode, bedtime. A mode is ordinary Home Assistant state, so it survives restarts on both ends — if a display reboots mid-evening, it comes back still in movie mode. Modes are the recommended way to change content by voice; save commands for actions.

---

## Install

1. Make sure your Home Assistant configuration loads [packages](https://www.home-assistant.io/docs/configuration/packages/). If it doesn't already, add this to `configuration.yaml`:

   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```

2. Copy [the package file](#the-package-file) below to `<config>/packages/homescreens.yaml`.

3. Copy [the sentences file](#the-sentences-file) below to `<config>/custom_sentences/en/homescreens.yaml`.

4. In the package file, type your hub's address into the `homescreens_host` box at the top — it's the only place the address lives; every command and sensor builds its URL from it.

5. Add your display token to `secrets.yaml`, including the word `Bearer`:

   ```yaml
   homescreens_auth: "Bearer your-display-token-here"
   ```

   The token is in the Home Screens editor under **Settings > Security**. If you haven't set a Home Screens password, put any placeholder text there — the hub ignores the header until a password exists, and your setup keeps working the day you add one.

6. Reload: **Developer Tools > YAML > All**. (Later edits to the sentences file are picked up by running the `conversation.reload` action — no restart needed.)

7. In the sentences file, fill in the `display:` list at the bottom — one row per display, mapping what you say ("kitchen") to the display ID from the editor. Single-display installs can skip this: sentences that don't name a display reach your display automatically.

---

## Try it before the speaker arrives

Open **Developer Tools > Assist** and type sentences instead of saying them. It runs the exact same pipeline a voice speaker uses, so you can test every command and question — and read the responses — before any hardware is involved. Start with:

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

What each mode actually changes on screen is up to you — see [house modes](#house-modes-change-what-the-displays-show) below.

### Family questions

| Say | The answer |
|---|---|
| "what's for dinner [tonight]" / "what's for lunch tomorrow" / "what's for dinner on friday" | Reads the meal plan ("supper" works too) |
| "what's for dinner this week" | The week ahead, one meal per day |
| "what do we need for dinner [tomorrow]" | The planned meal's ingredient list, with amounts |
| "did Alice finish her chores" | An honest yes or no — "Yes! Alice finished all 4 chores today" or "Not yet, 2 of 4 done" |
| "what chores does Alice have [left] [tomorrow]" / "what's left for Alice" | The actual chore names still to do, with points |
| "who hasn't done their chores [today]" | Names anyone with nothing checked off yet |
| "how many points does Alice have" | Their reward-point balance |
| "what can Alice get with her points" | Rewards they can afford right now — or how far the closest one is |
| "what's on the grocery list" | Everything still to buy from this week's planned meals |
| "what's showing on the kitchen display" | The current screen's name, or that it's asleep |

The chore-list, chores-tomorrow, honest yes/no, and grocery answers need a hub with `/api/chores/today` and `/api/meals/grocery/list` (newer than 1.8.0). On an older hub those sentences answer "I can't check … right now", the chore yes/no falls back to a completion count, and everything else works unchanged.

### Checking things off

| Say | What happens |
|---|---|
| "Alice finished the dishes" / "mark the dishes done for Alice" | Checks it off for today and credits the points — the answer confirms them ("Nice! That's 2 points for Alice.") |
| "check off the tortillas" / "we got milk" | Ticks it on the grocery list |
| "put milk back on the list" / "we still need milk" | Unticks it |

Saying any of these twice is safe: repeats can never un-check a chore or a grocery item — the second time you just get told it's already done.

---

## The package file

Save as `<config>/packages/homescreens.yaml`. Put your hub's address in the `homescreens_host` box at the top before the first reload.

```yaml {% process=false %}
# Home Screens — Home Assistant package
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
# modules with "state not equals movie". Rename/add options freely — the
# option strings are the exact values conditions compare against, so keep
# them lowercase (bus keys and enum matching are case-sensitive).
#
# The HomeScreensSetMode / HomeScreensGuestMode sentences below make both
# helpers voice-controllable out of the box (no need to expose them to
# Assist first, though exposing also works).
input_select:
  display_mode:
    name: Display mode
    icon: mdi:television-guide
    options:
      - normal
      - cooking
      - movie
      - party
      - bedtime

input_boolean:
  guest_mode:
    name: Guest mode
    icon: mdi:account-group

# ── Family data sensors ─────────────────────────────────────────────────
# Read-only views of the hub's family data so Assist can answer questions
# ("what's for dinner?", "did Tenley finish her chores?") and so the chore
# check-off intent below can resolve spoken names to ids. All endpoints
# accept the display token; polling is LAN-only and cheap.
#
# The display-status sensor is per display: copy that block once per
# display you want to ask about, keeping the naming pattern
# "Home Screens display <id>" (the HomeScreensDisplayStatus intent builds
# the entity id from the spoken display name).
rest:
  - resource_template: "http://{{ states('input_text.homescreens_host') }}/api/meals/data"
    headers:
      Authorization: !secret homescreens_auth
    scan_interval: 300
    sensor:
      - name: "Home Screens meals"
        unique_id: homescreens_meals
        icon: mdi:silverware-fork-knife
        value_template: "{{ value_json.plan | count }}"
        json_attributes:
          - plan
          - savedMeals

  - resource_template: "http://{{ states('input_text.homescreens_host') }}/api/chores/data"
    headers:
      Authorization: !secret homescreens_auth
    scan_interval: 300
    sensor:
      - name: "Home Screens chore roster"
        unique_id: homescreens_chore_roster
        icon: mdi:format-list-checks
        value_template: "{{ value_json.chores | count }}"
        json_attributes:
          - members
          - chores

  - resource_template: "http://{{ states('input_text.homescreens_host') }}/api/chores"
    headers:
      Authorization: !secret homescreens_auth
    scan_interval: 60
    sensor:
      - name: "Home Screens chore completions"
        unique_id: homescreens_chore_completions
        icon: mdi:check-circle-outline
        value_template: "{{ value_json.completions | count }}"
        json_attributes:
          - completions

  # The hub-resolved "who owes what today" list (rotation, schedule grids,
  # and frequency rules all run server-side, so this matches the chore
  # chart exactly). Needs a hub new enough to have /api/chores/today; on an
  # older hub this sensor stays unavailable and the HomeScreensChoreList
  # intent says it can't check, while everything else keeps working.
  - resource_template: "http://{{ states('input_text.homescreens_host') }}/api/chores/today"
    headers:
      Authorization: !secret homescreens_auth
    scan_interval: 60
    sensor:
      - name: "Home Screens chores today"
        unique_id: homescreens_chores_today
        icon: mdi:calendar-check
        value_template: "{{ value_json.members | map(attribute='chores') | map('count') | sum }}"
        json_attributes:
          - date
          - members

  # Same resolved list, one day ahead — lets "what chores does X have
  # tomorrow" answer. Same hub-version requirement as the today sensor.
  - resource_template: "http://{{ states('input_text.homescreens_host') }}/api/chores/today?date={{ (now() + timedelta(days=1)).strftime('%Y-%m-%d') }}"
    headers:
      Authorization: !secret homescreens_auth
    scan_interval: 300
    sensor:
      - name: "Home Screens chores tomorrow"
        unique_id: homescreens_chores_tomorrow
        icon: mdi:calendar-arrow-right
        value_template: "{{ value_json.members | map(attribute='chores') | map('count') | sum }}"
        json_attributes:
          - date
          - members

  # Reward catalog + point balances (the public kid-view endpoint; the auth
  # header is harmless there). Balances are keyed by member id — names
  # resolve through the chore roster sensor.
  - resource_template: "http://{{ states('input_text.homescreens_host') }}/api/rewards"
    headers:
      Authorization: !secret homescreens_auth
    scan_interval: 300
    sensor:
      - name: "Home Screens rewards"
        unique_id: homescreens_rewards
        icon: mdi:star-circle
        value_template: "{{ value_json.rewards | selectattr('enabled') | list | count }}"
        json_attributes:
          - rewards
          - balances

  # The hub-resolved grocery list for the current week (aisles + checked
  # state). Needs a hub new enough to have /api/meals/grocery/list; on an
  # older hub the grocery intents say they can't check, and everything
  # else keeps working.
  - resource_template: "http://{{ states('input_text.homescreens_host') }}/api/meals/grocery/list"
    headers:
      Authorization: !secret homescreens_auth
    scan_interval: 300
    sensor:
      - name: "Home Screens grocery list"
        unique_id: homescreens_grocery_list
        icon: mdi:cart-outline
        value_template: "{{ value_json.total - value_json.checked }}"
        json_attributes:
          - categories
          - total
          - checked

  # One block per display. Replace `kitchen` (both places) with your display ID.
  - resource_template: "http://{{ states('input_text.homescreens_host') }}/api/display/status?display=kitchen"
    headers:
      Authorization: !secret homescreens_auth
    scan_interval: 60
    sensor:
      - name: "Home Screens display kitchen"
        unique_id: homescreens_display_kitchen
        icon: mdi:television
        value_template: "{{ value_json.displayState | default('unknown') }}"
        json_attributes:
          - currentScreen
          - screenCount
          - activeProfile
          - displayState

rest_command:
  homescreens_wake:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/wake?display={{ display | default('all') }}"
    method: get
    headers:
      Authorization: !secret homescreens_auth

  homescreens_sleep:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/sleep?display={{ display | default('all') }}"
    method: get
    headers:
      Authorization: !secret homescreens_auth

  homescreens_next_screen:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/next-screen?display={{ display | default('all') }}"
    method: get
    headers:
      Authorization: !secret homescreens_auth

  homescreens_prev_screen:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/prev-screen?display={{ display | default('all') }}"
    method: get
    headers:
      Authorization: !secret homescreens_auth

  homescreens_reload:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/reload?display={{ display | default('all') }}"
    method: get
    headers:
      Authorization: !secret homescreens_auth

  homescreens_clear_alerts:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/clear-alerts?display={{ display | default('all') }}"
    method: get
    headers:
      Authorization: !secret homescreens_auth

  # value: 0-100 (percent)
  homescreens_brightness:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/brightness?display={{ display | default('all') }}"
    method: post
    content_type: "application/json"
    payload: '{"value": {{ value | int }}}'
    headers:
      Authorization: !secret homescreens_auth

  # message: banner text (required unless title given)
  # title:    optional headline above the message
  # type:     info | warning | urgent (default info)
  # duration: seconds on screen; omit for the type default
  #           (info 10s, warning 30s, urgent stays until dismissed).
  #           The hub API takes milliseconds — converted here.
  homescreens_alert:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/alert?display={{ display | default('all') }}"
    method: post
    content_type: "application/json"
    payload: >-
      {"message": {{ message | default('') | tojson }},
       "title": {{ title | default('') | tojson }},
       "type": {{ type | default('info') | tojson }}
       {%- if duration is defined %}, "duration": {{ (duration | float * 1000) | int }}{%- endif %}}
    headers:
      Authorization: !secret homescreens_auth

  # Jump a display to a screen by NAME or id ("show the calendar"). The
  # display client resolves the name case-insensitively against its own
  # rotation, so `screen` is whatever the screen is called in the editor.
  # No broadcast: screen sets differ per display, so the hub rejects
  # display=all — omit `display` only on a single-display install (the
  # command then goes to the legacy default queue that display polls).
  # Multi-display installs should pass a display, or change the intent
  # handler's default below to their main display's ID.
  homescreens_goto_screen:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/goto-screen"
    method: post
    content_type: "application/json"
    payload: >-
      {"screen": {{ screen | tojson }}
       {%- if display is defined and display %}, "displayId": {{ display | tojson }}{%- endif %}}
    headers:
      Authorization: !secret homescreens_auth

  # "Keep the display on tonight": wakes and suppresses the automatic sleep
  # machinery (sleep schedule, dim schedule, idle) for `minutes` (1-1440).
  # An explicit sleep command cancels the hold early. Broadcast is fine.
  homescreens_sleep_override:
    url: "http://{{ states('input_text.homescreens_host') }}/api/display/sleep-override?display={{ display | default('all') }}"
    method: post
    content_type: "application/json"
    payload: '{"minutes": {{ minutes | int }}}'
    headers:
      Authorization: !secret homescreens_auth

  # Live completions read for the HomeScreensChoreDone guard. The rest
  # SENSOR can lag up to its coordinator's refresh debounce behind reality,
  # and a stale guard would let a repeated "I finished the dishes" flip the
  # chore back OFF — so the guard must read the hub directly at decision
  # time (called with response_variable; response JSON lands in .content).
  homescreens_chores_fetch:
    url: "http://{{ states('input_text.homescreens_host') }}/api/chores"
    method: get
    headers:
      Authorization: !secret homescreens_auth

  # Checks a grocery item off (or puts it back). `direction` makes the call
  # one-way on the hub, so a repeated "check off milk" can never silently
  # un-check it.
  homescreens_grocery_toggle:
    url: "http://{{ states('input_text.homescreens_host') }}/api/meals/grocery"
    method: post
    content_type: "application/json"
    payload: >-
      {"item": {{ item | tojson }}, "direction": {{ direction | default('check') | tojson }}}
    headers:
      Authorization: !secret homescreens_auth

  # Flips one chore completion for today. The same call checks AND unchecks
  # (and credits/debits reward points), so the HomeScreensChoreDone intent
  # refreshes the completions sensor and skips the call when the chore is
  # already checked off — a repeated "I finished the dishes" must never
  # silently un-complete it.
  homescreens_chore_toggle:
    url: "http://{{ states('input_text.homescreens_host') }}/api/chores"
    method: post
    content_type: "application/json"
    payload: >-
      {"choreId": {{ chore_id | tojson }},
       "memberId": {{ member_id | tojson }},
       "date": "{{ now().strftime('%Y-%m-%d') }}"}
    headers:
      Authorization: !secret homescreens_auth

# Intent handlers for the sentences in custom_sentences/en/homescreens.yaml.
# Slot values (display, brightness, message) arrive as template variables.
# Spoken responses stay short — the effect is visible on the display.
intent_script:
  HomeScreensWake:
    action:
      - action: rest_command.homescreens_wake
        data:
          display: "{{ display | default('all') }}"
    speech:
      text: "Done"

  HomeScreensSleep:
    action:
      - action: rest_command.homescreens_sleep
        data:
          display: "{{ display | default('all') }}"
    speech:
      text: "Done"

  HomeScreensNextScreen:
    action:
      - action: rest_command.homescreens_next_screen
        data:
          display: "{{ display | default('all') }}"
    speech:
      text: "Done"

  HomeScreensPrevScreen:
    action:
      - action: rest_command.homescreens_prev_screen
        data:
          display: "{{ display | default('all') }}"
    speech:
      text: "Done"

  # "show the calendar [on the kitchen display]" — jumps straight to a
  # screen by name. Without a spoken display this targets the legacy
  # single-display queue; multi-display installs should either always say
  # the display or change default('') below to their main display's ID.
  HomeScreensGotoScreen:
    action:
      - action: rest_command.homescreens_goto_screen
        data:
          display: "{{ display | default('') }}"
          screen: "{{ screen }}"
    speech:
      text: "Done"

  # "keep the displays on [for two hours]" — plain "tonight"/"on" defaults
  # to 8 hours. The hub caps holds at 24 hours either way.
  HomeScreensSleepOverride:
    action:
      - action: rest_command.homescreens_sleep_override
        data:
          display: "{{ display | default('all') }}"
          minutes: >-
            {% if minutes is defined %}{{ minutes | int }}
            {%- elif hours is defined %}{{ (hours | int) * 60 }}
            {%- else %}480{% endif %}
    speech:
      text: >-
        {% if minutes is defined %}
          Staying on for {{ minutes | int }} minutes.
        {% elif hours is defined %}
          Staying on for {{ hours | int }} hour{{ '' if hours | int == 1 else 's' }}.
        {% else %}
          Okay, staying on.
        {% endif %}

  HomeScreensBrightness:
    action:
      - action: rest_command.homescreens_brightness
        data:
          display: "{{ display | default('all') }}"
          value: "{{ brightness }}"
    speech:
      text: "Brightness set to {{ brightness | int }} percent"

  HomeScreensAnnounce:
    action:
      - action: rest_command.homescreens_alert
        data:
          message: "{{ message }}"
          # Announcements linger longer than the 10s info default so the
          # family actually sees them. Tune to taste.
          duration: 30
    speech:
      text: "Announced"

  HomeScreensClearAlerts:
    action:
      - action: rest_command.homescreens_clear_alerts
        data:
          display: "{{ display | default('all') }}"
    speech:
      text: "Cleared"

  # "cooking mode on the displays" — sets input_select.display_mode; the
  # displays react through their visibility conditions, no command needed.
  HomeScreensSetMode:
    action:
      - action: input_select.select_option
        target:
          entity_id: input_select.display_mode
        data:
          option: "{{ mode }}"
    speech:
      text: "{{ mode | capitalize }} mode"

  HomeScreensGuestMode:
    action:
      - action: "input_boolean.turn_{{ onoff }}"
        target:
          entity_id: input_boolean.guest_mode
    speech:
      text: "Guest mode {{ onoff }}"

  # ── Family data Q&A ───────────────────────────────────────────────────

  # "what's for dinner [tonight|tomorrow|on friday]" — reads the meal plan
  # sensor. `day` arrives from the sentence list as an offset string ("0"
  # today, "1" tomorrow) or a weekday token ("w0" Monday … "w6" Sunday,
  # matching Jinja's weekday() numbering); `meal_slot` is
  # breakfast/lunch/dinner/snack.
  HomeScreensMealQuery:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_meals
    speech:
      text: >-
        {% set d = day | default('0') %}
        {% if d.startswith('w') %}
          {% set offset = ((d[1:] | int) - now().weekday()) % 7 %}
        {% else %}
          {% set offset = d | int %}
        {% endif %}
        {% set target = (now() + timedelta(days=offset)).strftime('%Y-%m-%d') %}
        {% set when = 'today' if offset == 0 else ('tomorrow' if offset == 1 else 'on ' ~ (now() + timedelta(days=offset)).strftime('%A')) %}
        {% set plan = state_attr('sensor.home_screens_meals', 'plan') or [] %}
        {% set meals = state_attr('sensor.home_screens_meals', 'savedMeals') or [] %}
        {% set matches = plan | selectattr('date', 'eq', target) | selectattr('slot', 'eq', meal_slot) | list %}
        {% if matches | count == 0 %}
          Nothing is planned for {{ meal_slot }} {{ when }} yet.
        {% else %}
          {% set entry = matches[0] %}
          {% set found = meals | selectattr('id', 'eq', entry.mealId | default('')) | list %}
          {% if found | count > 0 %}
            {{ meal_slot | capitalize }} {{ when }} is {{ found[0].name }}.
          {% elif entry.customText is defined and entry.customText %}
            {{ meal_slot | capitalize }} {{ when }} is {{ entry.customText }}.
          {% else %}
            Something is planned for {{ meal_slot }} {{ when }}, but it has no name.
          {% endif %}
        {% endif %}

  # "Tenley finished the dishes" — resolves spoken names against the roster
  # sensor (case-insensitive; duplicate names resolve to the first match),
  # then toggles today's completion. Points credit on the hub side.
  # The completions sensor is refreshed BEFORE the guard so a stale sensor
  # can't let a repeat command un-complete the chore.
  HomeScreensChoreDone:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_chore_completions
      - variables:
          chore_id: >-
            {% set roster = state_attr('sensor.home_screens_chore_roster', 'chores') or [] %}
            {% set ns = namespace(id='') %}
            {% for c in roster if ns.id == '' and c.name | lower == chore | trim | lower %}
              {% set ns.id = c.id %}
            {% endfor %}
            {{ ns.id }}
          member_id: >-
            {% set people = state_attr('sensor.home_screens_chore_roster', 'members') or [] %}
            {% set ns = namespace(id='') %}
            {% for m in people if ns.id == '' and m.name | lower == member | trim | lower %}
              {% set ns.id = m.id %}
            {% endfor %}
            {{ ns.id }}
      # The guard reads the hub LIVE — the completions sensor can lag behind
      # a toggle that just happened (coordinator refresh debounce), and a
      # stale "not done" here would flip the chore back off on a repeated
      # command. Live data makes the toggle safe; the sensor is only used
      # for the spoken response below.
      - action: rest_command.homescreens_chores_fetch
        response_variable: chores_now
      - variables:
          already_done: >-
            {% set comps = chores_now.content.completions | default([]) %}
            {% set today = now().strftime('%Y-%m-%d') %}
            {{ comps | selectattr('choreId', 'eq', chore_id)
                     | selectattr('memberId', 'eq', member_id)
                     | selectattr('date', 'eq', today) | list | count > 0 }}
      # Deliberately NO sensor refresh after the toggle: intent_script
      # renders speech with only the sentence slots (script variables are
      # out of scope there), so the speech template re-derives everything
      # from the sensors — and the completions sensor still holding the
      # PRE-toggle snapshot is what lets it tell "just checked off" apart
      # from "was already checked off". Worst case (rapid repeat inside the
      # sensor's staleness window) the response says "Nice!" twice while the
      # live guard above keeps the data correct — a duplicate cheer, never
      # an accidental un-complete.
      - choose:
          - conditions: "{{ chore_id != '' and member_id != '' and not already_done }}"
            sequence:
              - action: rest_command.homescreens_chore_toggle
                data:
                  chore_id: "{{ chore_id }}"
                  member_id: "{{ member_id }}"
    speech:
      text: >-
        {% set roster = state_attr('sensor.home_screens_chore_roster', 'chores') or [] %}
        {% set people = state_attr('sensor.home_screens_chore_roster', 'members') or [] %}
        {% set ns = namespace(cid='', cname='', pts=0, mid='', mname='') %}
        {% for c in roster if ns.cid == '' and c.name | lower == chore | trim | lower %}
          {% set ns.cid = c.id %}{% set ns.cname = c.name %}{% set ns.pts = c.points %}
        {% endfor %}
        {% for m in people if ns.mid == '' and m.name | lower == member | trim | lower %}
          {% set ns.mid = m.id %}{% set ns.mname = m.name %}
        {% endfor %}
        {% set comps = state_attr('sensor.home_screens_chore_completions', 'completions') or [] %}
        {% set today = now().strftime('%Y-%m-%d') %}
        {% set was_done = comps | selectattr('choreId', 'eq', ns.cid)
                                | selectattr('memberId', 'eq', ns.mid)
                                | selectattr('date', 'eq', today) | list | count > 0 %}
        {% if ns.cid == '' %}
          I couldn't find a chore called {{ chore }}.
        {% elif ns.mid == '' %}
          I couldn't find {{ member }} on the chore chart.
        {% elif was_done %}
          {{ ns.cname }} is already checked off for {{ ns.mname }} today.
        {% elif ns.pts | int > 0 %}
          Nice! {{ ns.cname }} is done. That's {{ ns.pts | int }} point{{ '' if ns.pts | int == 1 else 's' }} for {{ ns.mname }}.
        {% else %}
          Nice! {{ ns.cname }} is checked off for {{ ns.mname }}.
        {% endif %}

  # "did Tenley finish her chores" — an honest yes/no from the hub-resolved
  # chores-today sensor (left == 0 means genuinely done, rotation and
  # frequency rules included). On a hub too old for /api/chores/today the
  # speech falls back to the original completion-count answer, which can't
  # claim "all done" without knowing the due set.
  HomeScreensChoreProgress:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_chore_completions
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_chores_today
    speech:
      text: >-
        {% set today_st = states('sensor.home_screens_chores_today') %}
        {% if today_st not in ['unknown', 'unavailable'] %}
          {% set people = state_attr('sensor.home_screens_chores_today', 'members') or [] %}
          {% set ns = namespace(m=none) %}
          {% for p in people if ns.m is none and p.name | lower == member | trim | lower %}
            {% set ns.m = p %}
          {% endfor %}
          {% if ns.m is none %}
            I couldn't find {{ member }} on the chore chart.
          {% else %}
            {% set total = ns.m.chores | count %}
            {% set left = ns.m.chores | rejectattr('completed') | list | count %}
            {% if total == 0 %}
              {{ ns.m.name }} has no chores today.
            {% elif left == 0 %}
              Yes! {{ ns.m.name }} finished all {{ total }} chore{{ '' if total == 1 else 's' }} today.
            {% else %}
              Not yet. {{ ns.m.name }} has done {{ total - left }} of {{ total }}, with {{ left }} left.
            {% endif %}
          {% endif %}
        {% else %}
          {% set people = state_attr('sensor.home_screens_chore_roster', 'members') or [] %}
          {% set roster = state_attr('sensor.home_screens_chore_roster', 'chores') or [] %}
          {% set ns = namespace(id='', name='') %}
          {% for m in people if ns.id == '' and m.name | lower == member | trim | lower %}
            {% set ns.id = m.id %}{% set ns.name = m.name %}
          {% endfor %}
          {% if ns.id == '' %}
            I couldn't find {{ member }} on the chore chart.
          {% else %}
            {% set comps = state_attr('sensor.home_screens_chore_completions', 'completions') or [] %}
            {% set today = now().strftime('%Y-%m-%d') %}
            {% set mine = comps | selectattr('memberId', 'eq', ns.id) | selectattr('date', 'eq', today) | list %}
            {% if mine | count == 0 %}
              {{ ns.name }} hasn't checked off any chores yet today.
            {% else %}
              {% set pts = namespace(total=0) %}
              {% for comp in mine %}
                {% for c in roster if c.id == comp.choreId %}{% set pts.total = pts.total + c.points %}{% endfor %}
              {% endfor %}
              {{ ns.name }} has checked off {{ mine | count }} chore{{ '' if mine | count == 1 else 's' }} today, worth {{ pts.total }} point{{ '' if pts.total == 1 else 's' }}.
            {% endif %}
          {% endif %}
        {% endif %}

  # "what chores does Tenley have [left]" — speaks the hub-resolved list
  # from the chores-today sensor. Answers with the actual chore names, and
  # degrades to "can't check" when the sensor is missing (hub too old) or
  # the hub is unreachable.
  HomeScreensChoreList:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: "sensor.home_screens_chores_{{ 'tomorrow' if chore_day | default('0') == '1' else 'today' }}"
    speech:
      text: >-
        {% set when = 'tomorrow' if chore_day | default('0') == '1' else 'today' %}
        {% set eid = 'sensor.home_screens_chores_' ~ when %}
        {% set st = states(eid) %}
        {% if st in ['unknown', 'unavailable'] %}
          I can't check the chore chart right now.
        {% else %}
          {% set people = state_attr(eid, 'members') or [] %}
          {% set ns = namespace(m=none) %}
          {% for p in people if ns.m is none and p.name | lower == member | trim | lower %}
            {% set ns.m = p %}
          {% endfor %}
          {% if ns.m is none %}
            I couldn't find {{ member }} on the chore chart.
          {% else %}
            {% set left = ns.m.chores | rejectattr('completed') | list %}
            {% set done = ns.m.chores | selectattr('completed') | list %}
            {% if ns.m.chores | count == 0 %}
              {{ ns.m.name }} has no chores {{ when }}.
            {% elif left | count == 0 %}
              {{ ns.m.name }} is all done, {{ done | count }} chore{{ '' if done | count == 1 else 's' }} finished {{ when }}!
            {% else %}
              {% set names = left | map(attribute='name') | list %}
              {% set listed = names[:-1] | join(', ') ~ ' and ' ~ names[-1] if names | count > 1 else names[0] %}
              {% set pts = left | map(attribute='points') | sum %}
              {{ ns.m.name }} has {{ listed }} left {{ when }}{% if done | count > 0 %}, with {{ done | count }} already done{% endif %}{% if pts > 0 %}, worth {{ pts }} point{{ '' if pts == 1 else 's' }}{% endif %}.
            {% endif %}
          {% endif %}
        {% endif %}

  # "who hasn't done their chores" — members with zero completions today.
  HomeScreensChoreLaggards:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_chore_completions
    speech:
      text: >-
        {% set people = state_attr('sensor.home_screens_chore_roster', 'members') or [] %}
        {% set comps = state_attr('sensor.home_screens_chore_completions', 'completions') or [] %}
        {% set today = now().strftime('%Y-%m-%d') %}
        {% set done_ids = comps | selectattr('date', 'eq', today) | map(attribute='memberId') | list %}
        {% set idle = people | rejectattr('id', 'in', done_ids) | map(attribute='name') | list %}
        {% if people | count == 0 %}
          The chore chart is empty.
        {% elif idle | count == 0 %}
          Everyone has checked off at least one chore today.
        {% else %}
          {{ idle | join(', ') }} {{ "hasn't" if idle | count == 1 else "haven't" }} checked off any chores yet today.
        {% endif %}

  # "what's showing on the kitchen display" — refreshes the matching status
  # sensor on demand (screens rotate faster than any sane poll interval),
  # then speaks the current screen or sleep state. `display | slugify`
  # because HA slugifies the sensor name when it builds the entity id, so a
  # display ID with dashes (family-room-pi) becomes underscores there.
  # The response never speaks the display back: the slot holds the ID, and
  # IDs aren't always sayable.
  HomeScreensDisplayStatus:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: "sensor.home_screens_display_{{ display | slugify }}"
    speech:
      text: >-
        {% set eid = 'sensor.home_screens_display_' ~ (display | slugify) %}
        {% set st = states(eid) %}
        {% if st in ['unknown', 'unavailable'] %}
          I can't reach that display right now.
        {% elif st == 'asleep' %}
          That display is asleep.
        {% else %}
          {% set cur = state_attr(eid, 'currentScreen') %}
          {% set total = state_attr(eid, 'screenCount') %}
          {% if cur %}
            It's showing {{ cur.name }}{% if total %}, screen {{ cur.index | int + 1 }} of {{ total }}{% endif %}.
          {% else %}
            That display is awake, but I don't know what it's showing.
          {% endif %}
        {% endif %}

  # "how many points does Tenley have" — balances come from the rewards
  # sensor (keyed by member id); names resolve through the chore roster.
  HomeScreensRewardPoints:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_rewards
    speech:
      text: >-
        {% set people = state_attr('sensor.home_screens_chore_roster', 'members') or [] %}
        {% set ns = namespace(id='', name='') %}
        {% for m in people if ns.id == '' and m.name | lower == member | trim | lower %}
          {% set ns.id = m.id %}{% set ns.name = m.name %}
        {% endfor %}
        {% if ns.id == '' %}
          I couldn't find {{ member }} on the chore chart.
        {% else %}
          {% set balances = state_attr('sensor.home_screens_rewards', 'balances') or {} %}
          {% set pts = balances.get(ns.id, 0) | int %}
          {{ ns.name }} has {{ pts }} point{{ '' if pts == 1 else 's' }}.
        {% endif %}

  # "what can Tenley get with her points" — rewards the member can afford
  # right now (enabled, unrestricted or restricted to them, cost within
  # balance). When nothing is affordable, says how far the closest one is.
  HomeScreensRewardAfford:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_rewards
    speech:
      text: >-
        {% set people = state_attr('sensor.home_screens_chore_roster', 'members') or [] %}
        {% set ns = namespace(id='', name='') %}
        {% for m in people if ns.id == '' and m.name | lower == member | trim | lower %}
          {% set ns.id = m.id %}{% set ns.name = m.name %}
        {% endfor %}
        {% if ns.id == '' %}
          I couldn't find {{ member }} on the chore chart.
        {% else %}
          {% set balances = state_attr('sensor.home_screens_rewards', 'balances') or {} %}
          {% set pts = balances.get(ns.id, 0) | int %}
          {% set rewards = state_attr('sensor.home_screens_rewards', 'rewards') or [] %}
          {% set buckets = namespace(afford=[], locked=[]) %}
          {% for r in rewards if r.enabled and (r.memberIds | count == 0 or ns.id in r.memberIds) %}
            {% if r.cost | int <= pts %}
              {% set buckets.afford = buckets.afford + [r] %}
            {% else %}
              {% set buckets.locked = buckets.locked + [r] %}
            {% endif %}
          {% endfor %}
          {% if buckets.afford | count == 0 and buckets.locked | count == 0 %}
            There are no rewards set up yet.
          {% elif buckets.afford | count == 0 %}
            {% set closest = buckets.locked | sort(attribute='cost') | first %}
            {{ ns.name }} has {{ pts }} point{{ '' if pts == 1 else 's' }}. The closest reward is {{ closest.name }} at {{ closest.cost }}, so {{ closest.cost - pts }} more to go!
          {% else %}
            {% set fmt = namespace(l=[]) %}
            {% for r in buckets.afford | sort(attribute='cost') %}
              {% set fmt.l = fmt.l + [r.name ~ ' for ' ~ r.cost] %}
            {% endfor %}
            With {{ pts }} point{{ '' if pts == 1 else 's' }}, {{ ns.name }} can get {{ fmt.l[:6] | join(', ') }}{% if fmt.l | count > 6 %}, and {{ fmt.l | count - 6 }} more{% endif %}.
          {% endif %}
        {% endif %}

  # "what's on the grocery list" — unchecked items from the hub-resolved
  # weekly list. Capped so a huge week doesn't become a monologue.
  HomeScreensGroceryQuery:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_grocery_list
    speech:
      text: >-
        {% set st = states('sensor.home_screens_grocery_list') %}
        {% if st in ['unknown', 'unavailable'] %}
          I can't check the grocery list right now.
        {% else %}
          {% set cats = state_attr('sensor.home_screens_grocery_list', 'categories') or [] %}
          {% set left = cats | map(attribute='items') | sum(start=[]) | rejectattr('checked') | map(attribute='name') | list %}
          {% if state_attr('sensor.home_screens_grocery_list', 'total') | int == 0 %}
            The grocery list is empty. Plan some meals and it fills itself in.
          {% elif left | count == 0 %}
            Everything on the grocery list is checked off.
          {% else %}
            {{ left | count }} thing{{ '' if left | count == 1 else 's' }} to get: {{ left[:10] | join(', ') }}{% if left | count > 10 %}, and {{ left | count - 10 }} more{% endif %}.
          {% endif %}
        {% endif %}

  # "check off milk" — resolves the spoken item against the hub-resolved
  # list (case-insensitive) and checks it off one-way: `direction: check`
  # means a repeat can never un-check it. The speech re-derives the item
  # from the sensor (script variables are out of scope in speech), so a
  # rapid repeat may say "checked off" twice while the data stays correct.
  HomeScreensGroceryCheck:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_grocery_list
      - variables:
          canonical: >-
            {% set cats = state_attr('sensor.home_screens_grocery_list', 'categories') or [] %}
            {% set all = cats | map(attribute='items') | sum(start=[]) %}
            {% set ns = namespace(n='') %}
            {% for i in all if ns.n == '' and i.name | lower == item | trim | lower %}
              {% set ns.n = i.name %}
            {% endfor %}
            {{ ns.n }}
      - choose:
          - conditions: "{{ canonical != '' }}"
            sequence:
              - action: rest_command.homescreens_grocery_toggle
                data:
                  item: "{{ canonical }}"
                  direction: check
    speech:
      text: >-
        {% set st = states('sensor.home_screens_grocery_list') %}
        {% set cats = state_attr('sensor.home_screens_grocery_list', 'categories') or [] %}
        {% set all = cats | map(attribute='items') | sum(start=[]) %}
        {% set ns = namespace(i=none) %}
        {% for x in all if ns.i is none and x.name | lower == item | trim | lower %}
          {% set ns.i = x %}
        {% endfor %}
        {% if st in ['unknown', 'unavailable'] %}
          I can't check the grocery list right now.
        {% elif ns.i is none %}
          I couldn't find {{ item }} on the grocery list.
        {% elif ns.i.checked %}
          {{ ns.i.name }} was already checked off.
        {% else %}
          Checked off {{ ns.i.name }}.
        {% endif %}

  # "put milk back on the list" — the one-way opposite of GroceryCheck.
  HomeScreensGroceryUncheck:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_grocery_list
      - variables:
          canonical: >-
            {% set cats = state_attr('sensor.home_screens_grocery_list', 'categories') or [] %}
            {% set all = cats | map(attribute='items') | sum(start=[]) %}
            {% set ns = namespace(n='') %}
            {% for i in all if ns.n == '' and i.name | lower == item | trim | lower %}
              {% set ns.n = i.name %}
            {% endfor %}
            {{ ns.n }}
      - choose:
          - conditions: "{{ canonical != '' }}"
            sequence:
              - action: rest_command.homescreens_grocery_toggle
                data:
                  item: "{{ canonical }}"
                  direction: uncheck
    speech:
      text: >-
        {% set st = states('sensor.home_screens_grocery_list') %}
        {% set cats = state_attr('sensor.home_screens_grocery_list', 'categories') or [] %}
        {% set all = cats | map(attribute='items') | sum(start=[]) %}
        {% set ns = namespace(i=none) %}
        {% for x in all if ns.i is none and x.name | lower == item | trim | lower %}
          {% set ns.i = x %}
        {% endfor %}
        {% if st in ['unknown', 'unavailable'] %}
          I can't check the grocery list right now.
        {% elif ns.i is none %}
          I couldn't find {{ item }} on the grocery list.
        {% else %}
          Okay, {{ ns.i.name }} is back on the list.
        {% endif %}

  # "what's for dinner this week" — one meal per day for the next 7 days.
  HomeScreensMealWeek:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_meals
    speech:
      text: >-
        {% set plan = state_attr('sensor.home_screens_meals', 'plan') or [] %}
        {% set meals = state_attr('sensor.home_screens_meals', 'savedMeals') or [] %}
        {% set ns = namespace(parts=[]) %}
        {% for off in range(0, 7) %}
          {% set d = (now() + timedelta(days=off)).strftime('%Y-%m-%d') %}
          {% set label = 'Today' if off == 0 else ('Tomorrow' if off == 1 else (now() + timedelta(days=off)).strftime('%A')) %}
          {% set matches = plan | selectattr('date', 'eq', d) | selectattr('slot', 'eq', meal_slot) | list %}
          {% if matches | count > 0 %}
            {% set e = matches[0] %}
            {% set found = meals | selectattr('id', 'eq', e.mealId | default('')) | list %}
            {% set name = found[0].name if found | count > 0 else (e.customText | default('')) %}
            {% if name %}{% set ns.parts = ns.parts + [label ~ ': ' ~ name] %}{% endif %}
          {% endif %}
        {% endfor %}
        {% if ns.parts | count == 0 %}
          Nothing is planned for {{ meal_slot }} in the next week yet.
        {% else %}
          {{ ns.parts | join('. ') }}.
        {% endif %}

  # "what do we need for dinner [tomorrow]" — the planned meal's
  # ingredient list, with amounts where they exist.
  HomeScreensMealIngredients:
    action:
      - action: homeassistant.update_entity
        target:
          entity_id: sensor.home_screens_meals
    speech:
      text: >-
        {% set d = day | default('0') %}
        {% if d.startswith('w') %}
          {% set offset = ((d[1:] | int) - now().weekday()) % 7 %}
        {% else %}
          {% set offset = d | int %}
        {% endif %}
        {% set target = (now() + timedelta(days=offset)).strftime('%Y-%m-%d') %}
        {% set when = 'today' if offset == 0 else ('tomorrow' if offset == 1 else 'on ' ~ (now() + timedelta(days=offset)).strftime('%A')) %}
        {% set plan = state_attr('sensor.home_screens_meals', 'plan') or [] %}
        {% set meals = state_attr('sensor.home_screens_meals', 'savedMeals') or [] %}
        {% set matches = plan | selectattr('date', 'eq', target) | selectattr('slot', 'eq', meal_slot) | list %}
        {% if matches | count == 0 %}
          Nothing is planned for {{ meal_slot }} {{ when }} yet.
        {% else %}
          {% set entry = matches[0] %}
          {% set found = meals | selectattr('id', 'eq', entry.mealId | default('')) | list %}
          {% if found | count == 0 %}
            {{ meal_slot | capitalize }} {{ when }} doesn't have an ingredient list.
          {% else %}
            {% set meal = found[0] %}
            {% set ings = meal.ingredients or [] %}
            {% if ings | count == 0 %}
              {{ meal.name }} doesn't have an ingredient list.
            {% else %}
              {% set fmt = namespace(l=[]) %}
              {% for i in ings %}
                {% set fmt.l = fmt.l + [(i.name ~ (' (' ~ i.amount ~ ')' if i.amount else ''))] %}
              {% endfor %}
              For {{ meal.name }} you need: {{ fmt.l | join(', ') }}.
            {% endif %}
          {% endif %}
        {% endif %}
```

---

## The sentences file

Save as `<config>/custom_sentences/en/homescreens.yaml`. After edits, run the `conversation.reload` action to pick them up.

```yaml
# Home Screens — Assist custom sentences (English)
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

  # {screen} is a wildcard matched by NAME against the target display's
  # screens (case-insensitive) — screens need speakable names in the editor
  # for this to feel natural. On a multi-display install, say the display
  # or set a default in the package's intent handler.
  HomeScreensGotoScreen:
    data:
      - sentences:
          - "show the {screen} [screen]"
          - "show the {screen} [screen] on the {display} [display]"
          - "(go|switch|jump) to the {screen} [screen]"
          - "(go|switch|jump) to the {screen} [screen] on the {display} [display]"

  HomeScreensSleepOverride:
    data:
      - sentences:
          - "keep the display[s] (on|awake) [tonight]"
          - "keep the {display} display (on|awake) [tonight]"
          - "keep the display[s] (on|awake) for {minutes} minutes"
          - "keep the {display} display (on|awake) for {minutes} minutes"
          - "keep the display[s] (on|awake) for {hours} hour[s]"
          - "keep the {display} display (on|awake) for {hours} hour[s]"
          - "(don't|do not) let the display[s] sleep [tonight]"

  HomeScreensBrightness:
    data:
      - sentences:
          - "(dim|brighten) the display[s] to {brightness} [percent]"
          - "(dim|brighten) the {display} display to {brightness} [percent]"
          - "set the display brightness to {brightness} [percent]"
          - "set the {display} display brightness to {brightness} [percent]"

  HomeScreensAnnounce:
    data:
      - sentences:
          - "tell everyone {message}"
          - "announce {message}"

  HomeScreensClearAlerts:
    data:
      - sentences:
          - "clear the (announcements|alerts)"
          - "clear the (announcements|alerts) on the {display} display"

  HomeScreensSetMode:
    data:
      - sentences:
          - "{mode} mode [on the displays]"
          - "(set|switch) the (house|displays) to {mode} [mode]"
          - "turn on {mode} mode"

  HomeScreensGuestMode:
    data:
      - sentences:
          - "turn {onoff} guest mode"
          - "guest mode {onoff}"

  HomeScreensMealQuery:
    data:
      - sentences:
          - "(what's|what is) for {meal_slot} [{day}]"
          - "(what's|what is) planned for {meal_slot} [{day}]"
          - "what are we having for {meal_slot} [{day}]"

  # {chore} and {member} are wildcards matched against the chore chart by
  # name — chores and kids need speakable names for this to feel natural.
  HomeScreensChoreDone:
    data:
      - sentences:
          - "mark [the] {chore} [as] done for {member}"
          - "check off [the] {chore} for {member}"
          - "{member} finished [the] {chore}"
          - "{member} did [the] {chore}"

  HomeScreensChoreProgress:
    data:
      - sentences:
          - "(did|has) {member} (done|finished|do|finish) (their|the|her|his) chores [today]"
          - "how many chores has {member} (done|finished) [today]"
          - "how is {member} doing on [(their|her|his)] chores [today]"

  # Answers with the actual due chore names (hub-resolved). {chore_day}
  # covers today and tomorrow — the package has one sensor per day.
  HomeScreensChoreList:
    data:
      - sentences:
          - "what chores does {member} have [left] [{chore_day}]"
          - "which chores does {member} have [left] [{chore_day}]"
          - "what does {member} have left [to do] [{chore_day}]"
          - "what are {member}'s chores [{chore_day}]"
          - "what is left for {member} [{chore_day}]"

  HomeScreensRewardPoints:
    data:
      - sentences:
          - "how many (points|tickets) does {member} have"
          - "how many (points|tickets) has {member} earned"
          - "(what's|what is) {member}'s (point|ticket) balance"

  HomeScreensRewardAfford:
    data:
      - sentences:
          - "what can {member} (get|buy|afford) [with (their|her|his) (points|tickets)]"
          - "what rewards can {member} (get|afford)"

  HomeScreensGroceryQuery:
    data:
      - sentences:
          - "(what's|what is) on the (grocery|shopping) list"
          - "what (groceries|food) do we need [to buy]"
          - "read [me] the (grocery|shopping) list"

  # {item} resolves case-insensitively against the hub's grocery list.
  HomeScreensGroceryCheck:
    data:
      - sentences:
          - "check off [the] {item} [from the (grocery|shopping) list]"
          - "we (got|bought) [the] {item}"
          - "mark [the] {item} [as] (bought|done)"

  HomeScreensGroceryUncheck:
    data:
      - sentences:
          - "put [the] {item} back on the [grocery] list"
          - "uncheck [the] {item}"
          - "we still need {item}"

  HomeScreensMealWeek:
    data:
      - sentences:
          - "(what's|what is) for {meal_slot} this week"
          - "what {meal_slot}s (are|do we have) planned [this week]"

  HomeScreensMealIngredients:
    data:
      - sentences:
          - "what do (we|i) need for [the] {meal_slot} [{day}]"
          - "what are the ingredients for [the] {meal_slot} [{day}]"
          - "(what's|what is) in [the] {meal_slot} [{day}]"

  HomeScreensChoreLaggards:
    data:
      - sentences:
          - "who (hasn't|has not) (done|finished) [their] chores [today]"
          - "who still has chores [to do] [today]"
          - "who is behind on [their] chores [today]"

  HomeScreensDisplayStatus:
    data:
      - sentences:
          - "(what's|what is) [showing] on the {display} [display]"
          - "(what's|what is) the {display} display showing"

lists:
  display:
    values:
      # One row per display. `in` = spoken name, `out` = display ID from the
      # Home Screens editor (Settings > Per display). Examples:
      - in: "kitchen"
        out: "kitchen"
      - in: "(living room|livingroom)"
        out: "living-room"

  brightness:
    range:
      from: 1
      to: 100

  # Spoken screen name for goto — matched against the display's screen list
  # by the display itself.
  screen:
    wildcard: true

  # Sleep-override durations. The hub caps a hold at 24 hours (1440 min).
  minutes:
    range:
      from: 1
      to: 1440

  hours:
    range:
      from: 1
      to: 24

  # Must match input_select.display_mode's options exactly (lowercase —
  # these strings are what visibility conditions compare against).
  mode:
    values:
      - in: "normal"
        out: "normal"
      - in: "cooking"
        out: "cooking"
      - in: "movie"
        out: "movie"
      - in: "party"
        out: "party"
      - in: "bedtime"
        out: "bedtime"

  onoff:
    values:
      - in: "on"
        out: "on"
      - in: "off"
        out: "off"

  message:
    wildcard: true

  meal_slot:
    values:
      - in: "breakfast"
        out: "breakfast"
      - in: "lunch"
        out: "lunch"
      - in: "(dinner|supper)"
        out: "dinner"
      - in: "[a] snack"
        out: "snack"

  # Offset in days from today ("0"/"1") or a weekday token ("w0" Monday …
  # "w6" Sunday, Jinja weekday() numbering); the intent script does the
  # date math either way.
  day:
    values:
      - in: "(today|tonight|this morning)"
        out: "0"
      - in: "tomorrow"
        out: "1"
      - in: "[on] monday"
        out: "w0"
      - in: "[on] tuesday"
        out: "w1"
      - in: "[on] wednesday"
        out: "w2"
      - in: "[on] thursday"
        out: "w3"
      - in: "[on] friday"
        out: "w4"
      - in: "[on] saturday"
        out: "w5"
      - in: "[on] sunday"
        out: "w6"

  # Chore questions only cover today and tomorrow (one sensor per day).
  chore_day:
    values:
      - in: "(today|tonight)"
        out: "0"
      - in: "tomorrow"
        out: "1"

  # Spoken grocery item, matched case-insensitively against the hub's list.
  item:
    wildcard: true

  # Spoken chore and kid names, matched case-insensitively against the
  # chore chart roster by the intent scripts.
  chore:
    wildcard: true

  member:
    wildcard: true
```

---

## House modes: change what the displays show

Commands are fine for "wake up" and "next screen", but for "cooking mode" you don't want a one-shot command — you want the house to *be* in cooking mode until you say otherwise. That's what the `display_mode` dropdown in the package is for, and it's the recommended way to change content by voice: modes survive restarts and screen rotation because they're state, not commands.

It takes the [Home Assistant plugin](/docs/plugins) running on your displays, plus a little setup in the editor:

1. Install the Home Screens **Home Assistant plugin** and connect it to your Home Assistant (if you haven't already).
2. In the editor, select a module and open **Visibility > Conditions**.
3. Add a condition on the key `plugin:home-assistant:input_select.display_mode` and pick what each mode should show or hide.

You don't need to configure the plugin to publish the mode — the moment a condition anywhere references that key, the plugin starts sending it along, and the editor's **Live values** panel shows what it currently is.

Some starting recipes:

| What you want | Condition | Before data arrives |
|---|---|---|
| A meal-planner overlay only while cooking | value **equals** `cooking` | Hide the module |
| A chore-chart takeover at bedtime | value **equals** `bedtime` | Hide the module |
| Hide busy modules during a movie | value **does not equal** `movie` | Show the module |
| Hide personal touches for guests | `…input_boolean.guest_mode` value **does not equal** `on` | Show the module |

The third column is the condition's **Before data arrives** setting, and it's worth getting right: for modules you *add* in a mode, choose "Hide the module" so they only appear on a definite match; for modules you *remove* in a mode, choose "Show the module" so your normal dashboard stays intact even if Home Assistant is briefly unreachable. Overlays for different modes can share the same spot on the canvas — only one mode is active at a time.

{% callout type="warning" title="Mode names are case-sensitive" %}
The dropdown's option strings are the exact values conditions compare against, so keep them lowercase and make your conditions match exactly. If a condition never seems to trigger, open the editor's Live values panel next to the condition — it shows the value the display currently sees and warns about case mismatches.
{% /callout %}

Then "cooking mode on the displays", "switch the house to bedtime", and "turn on movie mode" just work — and because the mode is a normal Home Assistant dropdown, your automations and dashboards can set it too, no voice required.

---

## Make it yours

Everything in both files is meant to be edited:

- **Display names** — fill in the `display:` list in the sentences file, one row per display. The `in` side accepts alternatives: `"(living room|livingroom)"`.
- **Screen names** — "show the calendar" matches your screen's *name* in the editor, ignoring upper/lower case. Give screens short, speakable names. A screen that isn't in the display's current rotation (for example, one excluded by the active profile) is deliberately ignored.
- **Chore and kid names** — spoken names are matched against the chore chart, so keep them speakable and unique. Two chores with the same name resolve to whichever the chart lists first.
- **Modes** — rename or add options in the `input_select`, and mirror them in the sentences file's `mode:` list. Keep them lowercase.
- **Meal words** — the `meal_slot:` list already treats "supper" as dinner; add your own household vocabulary the same way.
- **Responses** — everything Assist says lives in the `speech:` templates in the package. Rewrite them to taste.
- **More sensors** — the display-status block in the package is per display; copy it for each display you want to ask about, keeping the `Home Screens display <id>` naming pattern.

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
          message: "{{ idle | join(', ') }} — chore time before bed!"
          type: warning
          duration: 60
```

**A bedtime scene.** One script that flips the displays to bedtime mode and turns them down, ready for "run bedtime" or a good-night automation — add your lights to the same sequence:

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

**Doorbell on every screen.** Any automation can push a banner — it rides the same package:

```yaml
- action: rest_command.homescreens_alert
  data:
    message: "Someone's at the front door"
    type: urgent
```

---

## Troubleshooting

**"Sorry, I couldn't understand that."** The sentence has to match one of the patterns in the sentences file. Test the exact wording in **Developer Tools > Assist**, and after editing the file, run the `conversation.reload` action. If you named a display, check it has a row in the `display:` list.

**Assist answers, but nothing happens on the display.** Check the hub address in the `homescreens_host` helper — remember that after the first reload, changing it in the file does nothing; set it from the HA UI instead (Settings > Devices & services > Helpers). Then watch the Home Assistant logs for the `rest_command` result. A `401` means the hub has a password and the `homescreens_auth` secret is missing or doesn't start with `Bearer `. Displays pick commands up on a short poll, so an effect can lag a couple of seconds — that's normal.

**"Show the calendar" does nothing.** The spoken name must match a screen name on the *target* display (upper/lower case doesn't matter). Screens hidden by the active profile are ignored on purpose. On a multi-display install, name the display in the sentence or set a default display in the `HomeScreensGotoScreen` handler — this is the one command that never broadcasts to all displays.

**Answers feel out of date.** The meal and chore sensors poll every few minutes, and the chore intents refresh before answering; the worst case after checking something off elsewhere is a brief window where the spoken count lags. The check-off command itself always verifies against the hub live, so repeating yourself can't un-do a chore.

**A mode condition never triggers.** Almost always a case mismatch — see the callout in [house modes](#house-modes-change-what-the-displays-show).

For the underlying endpoints (and what each one needs once a password is set), see [Display Control](/docs/api#display-control) in the API reference.
