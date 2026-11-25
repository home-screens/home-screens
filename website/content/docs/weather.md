---
title: Weather
nextjs:
  metadata:
    title: Weather setup
    description: Set up weather on your Home Screens display. Nine weather services, five of them free with no account, one location for every module that needs it.
    alternates:
      canonical: /docs/weather
---

Weather works the moment you set your location. A new install uses Open-Meteo, which is free, covers the whole world, and needs no account. This page is for choosing a different service, adding a key, and understanding which modules share the location. {% .lead %}

## Set your location

Open **Settings > Location & language**, type your town or zip code in **Your town or zip code**, and click **Look up**. **Use my internet location** guesses from your connection instead. The first town you look up also sets the **Time zone** when none is picked yet; after that the time zone stays as it is, so if you move, change **Time zone** on the same page.

One location serves every module that needs one: **Weather**, **Full-Screen Weather**, **Moon Phase**, **Sunrise / Sunset**, **Air Quality**, **Rain Map** and the **Local news** feed. Until it is set, the modules say **Location not set**, with a link to the location settings in the editor, and the **Local news** feed asks you to set it first.

## Pick a weather service

Open **Settings > Weather**. Each service has its own card with a status pill: **Ready** needs no key, **Configured** has its key saved, **Needs setup** wants a key, and **Default ·** in front marks the one your modules use unless told otherwise.

{% screenshot name="settings-weather" caption="One card per service. Open-Meteo is ready without a key; the four services that need one take it right on their card." /%}

| Service | Coverage | Key |
|---|---|---|
| Open-Meteo | Worldwide | Not needed. The default. |
| NOAA / NWS | United States | Not needed |
| Yr.no / MET Norway | Worldwide | Not needed |
| SMHI | Nordic countries | Not needed |
| Environment Canada | Canadian cities | Not needed |
| OpenWeatherMap | Worldwide | Free account key |
| WeatherAPI.com | Worldwide | Free account key (a free key sends 3 forecast days) |
| Pirate Weather | Worldwide | Free account key |
| UK Met Office | United Kingdom | Free account key from datahub.metoffice.gov.uk (subscribe to the Site-Specific API) |

**Which one?** The regional services (NOAA, Yr.no, SMHI, Met Office, Environment Canada) are usually the most accurate inside the area they cover. Open-Meteo is the easy worldwide choice. Pirate Weather adds minute-by-minute rain for the next hour, and Pirate Weather and NOAA are the two that send weather warnings.

To switch, open the card, paste the key if it asks for one, click **Test** to check it, then **Set as default**. Weather keys live on the card, not on the API keys page.

## Units

**Imperial** (°F, mph) or **Metric** (°C, km/h), at the top of the Weather page. It applies to every weather module at once.

## One module, a different service

The **Weather** and **Full-Screen Weather** modules each have a **Weather source** dropdown in their settings, set to **Same as Settings** by default. It lists every service that needs no key plus the ones whose key you have added. Pick a specific service there to compare two forecasts side by side, or to use the regional service for one module and a worldwide one for another.

If a module asks for more days than its service sends, a note under the days setting says so and offers **Use Open-Meteo for this module**, which sends a full week. The **Test** button on each service's card also tells you how many forecast days it sends.

## Air quality needs a key

The **Air Quality** module, and the **Air quality** card on Full-Screen Weather's Forecast and Conditions views, read from OpenWeatherMap even when your weather comes from somewhere else, so they need an OpenWeatherMap key on that service's card. Rain Map, Moon Phase and Sunrise / Sunset need only the location.

## Rain radar

The **Rain Map** module gets its radar pictures from [LibreWXR](https://github.com/JoshuaKimsey/LibreWXR), a free community server that covers the US, Canada, Europe and parts of Asia. It needs no key or account. It replaced RainViewer, which shut its free API in 2026.

If you run your own LibreWXR at home, enter its address under **Settings > Weather > Rain radar** and every display reads from it instead. Leave the field blank to use the community server.

### Show the rain map only when rain is likely

An empty radar is wasted space on a dry day, so the Rain Map can hide itself until rain is in the forecast. Every display with a location publishes the weather as values that a module's conditions can read: the weather and temperature right now, and the chance of rain or snow right now, in the next 6 hours and today. These always come from the service marked **Default**, even when a module has its own **Weather source**. Select the Rain Map module in the editor and press **Only show when rain is likely** at the top of its settings. That adds one condition, shows the map only when today's chance of rain or snow is 30% or more, and opens the **Conditions** section so you can see it.

To tune it, or to build it yourself:

1. Open the module's **Conditions** section.
2. Turn on **Show only when conditions match** and add a **Number is in range** condition.
3. Pick **Chance of rain or snow today** as the value, set **Above** to 30, and tick **Or equal to** if you want exactly 30 to count.
4. Leave **Before data arrives** on **Hide the module**, so the map stays out of the way until the first forecast lands.

While you edit, the badge next to the condition shows today's actual chance on that display and whether the module is currently shown. Prefer a tighter window? Pick **Chance of rain or snow in the next 6 hours** instead, or group both with **Any of…** so a late-evening shower counts too. The same values work in display rules and in Text modules as `{weather.precip_chance_today}` or `{weather.temperature}`.

Weather warnings join the list when your weather comes from Pirate Weather or NOAA, the two services that send them: **A weather warning is in force**, how serious it is, and its name. On any other service these three do not appear in the picker. A display rule on the first one can jump to a weather screen the moment a warning is issued, and a Text module can show `{weather.alert_title}`.

## Next steps

- [Modules](/docs/modules#weather-and-environment): the weather module's fourteen views and the full-screen weather wall
- [Weather not loading](/docs/troubleshooting#weather-not-loading) if the module shows an error
- [API keys](/docs/calendars#api-keys) for the other services that want one
