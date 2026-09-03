---
title: Plugins
nextjs:
  metadata:
    title: Plugins
    description: Add Home Assistant, Garmin, Strava and more to your Home Screens display. Install a plugin in two clicks, sign in, and drag its modules onto a screen.
    alternates:
      canonical: /docs/plugins
---

Plugins are extra modules made for Home Screens: Home Assistant, Garmin, Strava, and whatever comes next. Installing one takes two clicks in the editor, and from then on its modules sit in the same list as the built-in ones. {% .lead %}

## Install a plugin

1. In the editor, click **Plugins** in the top right.
2. The **Browse** tab lists every plugin. Click **Install** on the one you want.
3. Close the panel. The plugin's modules are now in the module list on the left, with a small **Plugin** badge, under whichever group the plugin chose. Drag one onto a screen like anything else.

{% screenshot name="editor-plugins" caption="The Plugins panel. Browse, Installed and Updates." /%}

**Show beta plugins** reveals early versions that are still being tested. **Install from URL** takes a plugin someone shares with you as a link.

## Where a plugin's settings live

Click one of the plugin's modules on a screen and its settings open on the right, the same as any module. Two extra blocks can appear there:

- **Connection** is where you sign in to a service, such as Garmin or Strava. It shows whether you are connected and has the sign-in button.
- **Secrets** is where a plugin keeps a token or key it needs, such as a Home Assistant token. Secrets are stored on your Pi and never sent to the display.

Settings that apply to the whole plugin rather than one module are under the **Installed** tab of the Plugins panel, on the plugin's row.

## Home Assistant {% #home-assistant %}

The Home Assistant plugin shows your lights, thermostats, sensors, switches, media players, covers and locks as cards on the wall, and lets you tap them on a touchscreen: toggle a light, nudge a thermostat, pause the music, lock the door.

1. In Home Assistant, open your **Profile**, then **Security**, and create a **Long-Lived Access Token**. Copy it; it is shown once.
2. In the editor, click **Plugins** and install **Home Assistant**.
3. In the Plugins panel's **Installed** tab, open the Home Assistant row and enter your Home Assistant address (such as `http://homeassistant.local:8123`).
4. Drag a Home Assistant module onto a screen, click it, and under **Secrets** paste the token.
5. In the module's settings, pick the entities or the area to show. No YAML, no templates, no icon mapping; each entity gets a card that suits what it is.

Every request goes through your Pi, so the token never reaches the browser on the wall.

If you want it the other way round, with Home Assistant driving the wall (wake it, change screens, send an alert, or do it all by voice), see the [Voice Control](/docs/voice-control) guide.

## Garmin and Strava

Both show your activity on the wall: steps, sleep, Body Battery and your latest workout from Garmin; recent activities, goal progress, a route map and a year poster from Strava.

1. Install the plugin from the **Plugins** panel and drag one of its modules onto a screen.
2. Click the module. Under **Connection**, click **Sign in**. A browser tab opens on Garmin or Strava; sign in there and approve.
3. Back in the editor, the Connection block says **Connected**, and the module fills in. Pick a view in the module's settings.

The sign-in is remembered on your Pi. If it ever lapses, the Connection block says so and offers the sign-in again.

Strava only lets subscribers create the developer app the plugin connects through, so it needs an active Strava subscription.

{% screenshot name="plugin-garmin-summary" caption="Garmin's daily summary." /%}

{% screenshot name="plugin-strava-latest" caption="Strava's latest activity." /%}

## Updates and removal

The **Updates** tab of the Plugins panel lists plugins with a newer version and updates them in place; your settings and sign-ins stay. To remove a plugin, open the **Installed** tab and click **Uninstall** on its row. Modules from a removed plugin show a placeholder on your screens until you delete them.

## Values plugins share

Some plugins publish live values, such as a door sensor or the current house mode from Home Assistant. Any module can hide or show itself based on those values through **Conditions** in its settings, and the **Shared state** tab under Settings > Automation lists everything your plugins are sharing. See [Conditions](/docs/editor#conditions).

## Writing your own

The [Plugin development](/docs/plugin-development) reference covers the bundle, the manifest, the SDK, secrets, sign-in adapters and shared state.

## Next steps

- [Modules](/docs/modules): everything built in
- [Editor](/docs/editor#conditions): showing a module only when a value matches
- [Voice Control](/docs/voice-control): Home Assistant driving the wall
