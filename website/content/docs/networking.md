---
title: Networking
nextjs:
  metadata:
    title: Networking
    description: Set up remote access, reverse proxies, and multi-display deployments.
    alternates:
      canonical: /docs/networking
---

Home Screens runs as a local web server on your network. This guide covers how to access it from other devices, set up remote access, and secure your deployment.

---

## Default network setup

Home Screens runs a Next.js server on **port 3000** by default. Once installed, these URLs are available on your local network:

| URL | Purpose |
|---|---|
| `http://<ip>:3000/` | Redirects to `/editor` |
| `http://<ip>:3000/display` | Fullscreen kiosk view (what the display shows) |
| `http://<ip>:3000/display/<display-id>` | A specific display in a multi-display setup |
| `http://<ip>:3000/editor` | Configuration editor |
| `http://<ip>:3000/remote` | Mobile remote control |
| `http://<ip>:3000/chores` | Kid-facing chore view, never asks for a password |

Any device on the same LAN can reach these URLs. The display view is designed for the connected screen; the editor is designed for phones, tablets, and laptops. Visiting the root URL (`/`) redirects to the editor since users navigating to the bare hostname are typically in a setup/configuration context. Pi displays are unaffected — the kiosk launches Chromium directly at `/display`.

---

## Remote access to the editor

The editor is a standard web page — open `http://<pi-ip>:3000/editor` from any browser on your network. No app install is needed. The editor works well on phones and tablets in addition to desktops.

If password protection is enabled (Settings > Security), you will be prompted to log in before accessing the editor or any write API endpoint. The display view remains accessible without authentication so your kiosk does not need credentials.

---

## Custom port configuration

You can run the server on a port other than 3000.

### During installation

Pass the `--port` flag to the install script:

```bash
~/home-screens/scripts/install.sh --port 8080
```

### After installation

Changing the port takes three steps. Write the new port number, re-run the system setup step so the change is picked up, then restart:

```bash
echo 8080 > /opt/home-screens/current/data/port.conf
bash /opt/home-screens/current/scripts/upgrade.sh setup-system
sudo systemctl restart home-screens
```

{% callout type="warning" %}
Do not skip the `setup-system` line. Writing `port.conf` on its own looks like it worked, because nothing reports an error, but the server keeps running on the old port. The kiosk browser reads `port.conf` fresh on every boot, so the mismatch does not show up until the next reboot, when Chromium opens the new port, finds nothing listening, and the screen goes to a browser error page.
{% /callout %}

### Checking the current port

`port.conf` records what the port *should* be. To see what the server is actually running on, read the service file:

```bash
grep PORT /etc/systemd/system/home-screens.service
```

If `port.conf` does not exist, the default port 3000 is in use.

### Resetting to default

```bash
rm /opt/home-screens/current/data/port.conf
bash /opt/home-screens/current/scripts/upgrade.sh setup-system
sudo systemctl restart home-screens
```

### How the port is decided

The port is chosen **when `setup-system` runs**, in this order:

1. `PORT` environment variable (if set)
2. `data/port.conf` file
3. Default: **3000**

That value is then written into the `home-screens.service` file as `Environment=PORT=`, which is what the server actually reads at startup. The running server never re-reads `port.conf`, which is why a plain `systemctl restart` is not enough on its own.

The `data/port.conf` file is preserved across upgrades and deployments, and upgrades re-run `setup-system` for you.

---

## Network settings (Settings → Network)

The editor has a **Network** page under **Settings** that configures WiFi, static IP, hostname, and connectivity diagnostics without SSH. It shells out to `nmcli` and `hostnamectl` on the Pi — Linux hosts with NetworkManager only. On other platforms the page shows an "unavailable" message explaining why.

Every network change that touches the **management interface** — the one your browser is currently talking to the Pi over — uses a two-phase commit. The editor asks you to confirm the warning, the server applies the change with a **60-second auto-rollback** scheduled against the previous settings, and the editor polls `GET /api/system/network/confirm` to prompt you when the new connection is working. If you don't confirm within 60 seconds (because the change cut off your session), the Pi reverts automatically. A connectivity watchdog timer (`wifi-watchdog.timer`) is paused during this window so it doesn't race the rollback.

### WiFi

- **Scan nearby networks** — lists SSIDs with signal strength, security type, and an "already saved" flag. Scans are rate-limited to one per interface every 15 s (`GET /api/system/network/wifi/scan`).
- **Connect** — click a network, enter the password if required, confirm the disconnect warning if you're on WiFi yourself. Supports open, WPA2, and WPA3 networks (`POST /api/system/network/wifi/connect`).
- **Saved networks** — list, autoconnect status, last-used timestamp, and passwords (readable only when editor auth is enabled, via `GET /api/system/network/wifi/saved?showPasswords=true`).
- **Forget** — `DELETE /api/system/network/wifi/saved` drops a saved profile.
- **Disconnect** — brings a saved connection down without deleting it (`POST /api/system/network/wifi/disconnect`).

### IP address

Each interface can be toggled between **DHCP (auto)** and **static (manual)**. Manual mode requires `address`, `prefix` (CIDR bits), `gateway`, and optional `dns` array. Changes go through the same management-interface confirmation + 60 s rollback as WiFi.

### Hostname

Sets the system hostname via `hostnamectl`, rewrites the `127.0.1.1` line in `/etc/hosts`, and restarts `avahi-daemon` so mDNS re-advertises under the new name. After this runs, your Pi is reachable at `http://<new-hostname>.local:3000`.

### Diagnostics

The **Diagnostics** panel pings the default gateway and `1.1.1.1`, and reports whether the `wifi-watchdog.timer` systemd unit is active. Useful first check when a display goes dark — gateway reachable + internet reachable narrows the problem to the Home Screens server; both unreachable points at the physical connection.

### Source-based routing

When a Pi has **two WiFi interfaces** (common with USB adapters for range), Home Screens configures source-based routing so both interfaces remain reachable simultaneously. The hub refreshes the routing rules after every WiFi or IP change via `ensureSourceRouting()`. Without this, Linux's default-route picking would hide one interface whenever both are up.

---

## Reverse proxy setup (nginx)

If you want to access Home Screens through a domain name or add HTTPS, place a reverse proxy in front of it. Here is an example nginx configuration:

```nginx
server {
    listen 80;
    server_name homescreens.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Not required. The display uses short 3s polls, not long-lived
        # connections, but a generous timeout is harmless.
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

The `Upgrade` and `Connection` headers are included in case you use any WebSocket-based features in the future.

{% callout type="warning" %}
Behind a proxy, every request looks like it came from the proxy. Home Screens decides who a request came from using the actual network connection, not the `X-Forwarded-For` header, so with this config in front of it **every** visitor appears to be `127.0.0.1`. That breaks the IP allowlist described below. If you use both, set `HS_TRUSTED_PROXIES` in the service environment so the forwarded address is honored; see [Restrict access by IP](#restrict-access-by-ip).
{% /callout %}

---

## HTTPS with Let's Encrypt

If your Home Screens instance is reachable from the internet (or you want HTTPS on your LAN), use Certbot with nginx:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d homescreens.example.com
```

Certbot will automatically modify your nginx config to listen on port 443 and redirect HTTP to HTTPS. Certificates renew automatically via a systemd timer.

For LAN-only setups, HTTPS is generally not required. The session cookie used for password protection is set with the `Secure` flag only when the connection is already HTTPS, so authentication works over plain HTTP on your local network.

---

## Remote display control

Home Screens includes a remote control system that lets you control the display from your phone, a script, or a home automation platform like Home Assistant.

### How it works

The server maintains an in-memory command queue. External clients push commands into the queue via the API. The display client polls `GET /api/display/commands` every 3 seconds, drains all pending commands, and executes them.

```
Phone / Home Assistant / Script
        |
        |  POST /api/display/wake
        v
   [Server command queue]
        |
        |  GET /api/display/commands (polled every 3s)
        v
   Display executes command
```

### Available commands

Simple commands (no payload needed) can be sent via GET or POST:

| Command | Description |
|---|---|
| `/api/display/wake` | Wake the display from sleep |
| `/api/display/sleep` | Put the display to sleep |
| `/api/display/next-screen` | Advance to the next screen |
| `/api/display/prev-screen` | Go to the previous screen |
| `/api/display/reload` | Force-reload the display page |
| `/api/display/clear-alerts` | Dismiss all active alerts |

The GET endpoints are bookmarkable, so you can save them as shortcuts on your phone's home screen.

### If you have set a password

**Every** `/api/display/*` endpoint on this page needs a credential once you set a password under **Settings > Security**, including the simple GET commands above. Without one they return `401`. This catches people out: the commands work fine, then stop working the day a password is set, and nothing on the phone or in Home Assistant explains why.

Home Screens generates a **display token** for exactly this purpose. Find it under **Settings > Security > Display Token**, where you can reveal, copy, and regenerate it. There are two ways to send it:

```bash
# Header form, best for scripts and automations
curl -H 'Authorization: Bearer <token>' http://<ip>:3000/api/display/wake

# Query form, for links you want to bookmark on a phone
http://<ip>:3000/api/display/wake?token=<token>
```

The `?token=` form works only on `/api/display/*` URLs, deliberately, so the token cannot leak through browser history or referrer headers on other pages. A browser already logged in to the editor works too, since a valid session is accepted anywhere the token is.

The display token covers every command on this page, including profile switching — the only writes it can make are the ones the display itself performs.

### Commands with payloads

These require a POST with a JSON body:

**Brightness** — set display brightness (0-100):

```bash
curl -X POST http://<ip>:3000/api/display/brightness \
  -H 'Content-Type: application/json' \
  -d '{"value": 50}'
```

Brightness works by fading a black layer over the page, not by changing the panel's backlight. At `0` the screen is drawn fully black but the monitor is still powered on and lit.

**Profile** — switch to a named profile:

```bash
curl -X POST http://<ip>:3000/api/display/profile \
  -H 'Content-Type: application/json' \
  -d '{"profile": "nighttime"}'
```

**Go to screen** — jump straight to a screen by its name (or id) instead of stepping through the rotation. The display matches the name against its own screen list, ignoring case, and ignores names it doesn't have:

```bash
curl -X POST http://<ip>:3000/api/display/goto-screen \
  -H 'Content-Type: application/json' \
  -d '{"screen": "calendar"}'
```

**Keep the display on** — wake and hold off the sleep schedule, dim schedule, and idle behavior for a number of minutes (up to 24 hours). A plain `wake` during a scheduled window holds the display awake for its "After a wake-up" setting (5 minutes by default); use this when you want a specific, longer duration. An explicit `sleep` cancels the hold:

```bash
curl -X POST http://<ip>:3000/api/display/sleep-override \
  -H 'Content-Type: application/json' \
  -d '{"minutes": 480}'
```

**Alert** — display an overlay alert on the screen:

```bash
curl -X POST http://<ip>:3000/api/display/alert \
  -H 'Content-Type: application/json' \
  -d '{"type": "info", "title": "Dinner is ready!", "message": "Come to the kitchen", "duration": 30000}'
```

Alert types: `info`, `warning`, `urgent`. The `duration` field is in milliseconds; `0` keeps the alert up until someone dismisses it. Optional fields: `icon` (a short piece of text or an emoji shown just before the title, for example `"🍕"`) and `dismissible` (boolean).

The colored symbol beside an alert is chosen by its `type` and cannot be replaced. Setting `icon` to an icon name such as `"AlertTriangle"` prints those letters in front of your title rather than drawing anything.

### Querying display status

The display reports its status to the server every 30 seconds and on any state change. Query it with:

```bash
curl 'http://<ip>:3000/api/display/status?display=kitchen'
```

Leave off `?display=` only on a single-display install. As soon as you have more than one display set up, each one reports under its own ID, and the bare URL has nothing to answer with, so it returns `404 {"error": "No status reported yet"}`.

Response:

```json
{
  "currentScreen": { "index": 0, "id": "abc123", "name": "Main" },
  "screenCount": 3,
  "activeProfile": null,
  "displayState": "active",
  "timestamp": 1711300000000,
  "reportedViewport": { "width": 1080, "height": 1920 },
  "hwStats": {
    "piModel": "Raspberry Pi 4 Model B Rev 1.5",
    "cpuModel": "Cortex-A72",
    "cpuCores": 4,
    "cpuTempC": 52.1,
    "load1": 0.4, "load5": 0.3, "load15": 0.25,
    "throttled": { "raw": "0x0", "active": false, "underVoltage": false, "previouslyThrottled": false },
    "memoryTotal": 4045000704,
    "memoryFree": 2100000000,
    "diskTotal": 31000000000,
    "diskFree": 24000000000,
    "reportedAt": "2026-07-25T18:00:00.000Z"
  }
}
```

The `displayState` field is one of: `active`, `dimmed`, or `asleep`. `hwStats` is present only when a per-Pi reporter is posting to the hub. Memory and disk figures are raw byte counts, and CPU load is reported as 1/5/15-minute load averages rather than a percentage. Display-only spoke Pis run `scripts/reporter.sh` on a 30-second systemd timer and POST to `/api/display/hw-stats` (adoption-gated — no bearer token, the spoke just has to appear in the hub's displays registry).

### Home Assistant integration

For the full setup — every command as a ready-made `rest_command`, voice sentences for Assist ("show the calendar", "tell everyone dinner is ready"), family Q&A sensors, and chore check-off by voice — copy the two-file package in the **[Voice Control guide](/docs/voice-control)**. The short version, if you just want a command or two, is the [RESTful Command](https://www.home-assistant.io/integrations/rest_command/) integration:

```yaml
rest_command:
  homescreens_wake:
    url: "http://192.168.1.100:3000/api/display/wake"
    method: GET
    headers:
      authorization: !secret homescreens_auth
  homescreens_sleep:
    url: "http://192.168.1.100:3000/api/display/sleep"
    method: GET
    headers:
      authorization: !secret homescreens_auth
  homescreens_next:
    url: "http://192.168.1.100:3000/api/display/next-screen"
    method: GET
    headers:
      authorization: !secret homescreens_auth
  homescreens_alert:
    url: "http://192.168.1.100:3000/api/display/alert"
    method: POST
    content_type: "application/json"
    headers:
      authorization: !secret homescreens_auth
    payload: '{"type": "info", "title": "{{ title }}", "message": "{{ message }}"}'
```

Add the header value to Home Assistant's `secrets.yaml`, including the word `Bearer`, since `!secret` substitutes the whole value:

```yaml
homescreens_auth: "Bearer your-display-token-here"
```

If you have not set a Home Screens password the `headers` blocks are simply ignored, so it is safe to include them from the start; that way your automations keep working the day you do add a password.

Then use these in automations, scripts, or dashboards.

---

## Multi-display setup

Home Screens supports a hub-and-spoke deployment where one server drives any number of Raspberry Pi displays — each with its own screens, layout, dimensions, rotation, and active profile, all served from one config file. Spoke Pis run only Chromium and the kiosk launcher (no Node.js) and are installed with `--display-only --backend <hub-url>`. See the dedicated **[Multi-display guide](/docs/multi-display)** for the install flow, the adoption flow in the editor's **Per display > All displays** page, per-display API targeting, and troubleshooting.

---

## WiFi reliability

The install script applies several WiFi reliability hardening measures for Raspberry Pi deployments, especially important for headless displays on mesh networks:

- **Infinite autoconnect retries** — NetworkManager's default of 4 retries can leave a headless display permanently offline; the installer sets unlimited retries
- **Disabled scan MAC randomization** — random MACs confuse mesh access points and can prevent reconnection
- **Disabled IPv6 on WiFi** — the Broadcom WiFi driver (`brcmfmac`) handles IPv6 multicast poorly, which can cause intermittent drops
- **Masked suspend/hibernate** — `brcmfmac` cannot recover WiFi after suspend, so power management sleep states are disabled
- **Connectivity watchdog** — a timer checks connectivity every 2 minutes and escalates through three recovery steps: NetworkManager reconnect, interface cycle, and driver reload

These changes are applied automatically by the full install and by the pre-built image. No manual configuration is needed.

Note that display-only spoke Pis installed with `--display-only` do **not** get these settings today; that install path finishes before the system-tuning step runs. Headless spokes are exactly the machines that benefit most from it, so this is a known gap rather than a deliberate choice.

### Offline indicator

When the display loses network connectivity, a WiFi-off icon appears at the lower-right corner of the screen. The indicator uses a 3-second debounce to avoid flashing during brief WiFi blips. It clears immediately when connectivity is restored.

---

## Firewall considerations

Home Screens only needs one port open (default 3000). The server binds to `0.0.0.0`, so it accepts connections from any device on the network.

### Raspberry Pi (ufw)

If you have `ufw` enabled:

```bash
sudo ufw allow 3000/tcp
```

Or for a custom port:

```bash
sudo ufw allow 8080/tcp
```

### Restricting access to LAN only

If your device has a public IP and you only want LAN access:

```bash
sudo ufw allow from 192.168.0.0/16 to any port 3000
sudo ufw allow from 10.0.0.0/8 to any port 3000
```

### Ports used

| Port | Direction | Purpose |
|---|---|---|
| 3000 (or custom) | Inbound | Home Screens web server |
| 443 / 80 | Outbound | API calls to external services (weather, calendars, stocks, etc.) |

No inbound ports beyond the web server port are required. All external service communication is outbound only, handled by the server-side API proxy.

---

## Security best practices

Password protection is **off by default**. Until you set one, anyone on your network can change your settings, edit your WiFi details, restart the Pi, and install a different version. Your API keys are never readable, but everything else is open. On a normal home network that is usually fine; if you share the network more widely, start here.

### Enable password protection

Set a password in the editor under **Settings > Security**. When enabled:

- The editor (`/editor`) requires login
- All write API endpoints (`PUT`, `POST`, `DELETE`) require a session cookie — **except** the chore-toggle endpoint (`POST /api/chores`) and the reward-redeem endpoint (`POST /api/rewards`), which are intentionally public on the LAN so the kid-facing `/chores` view keeps working without a password
- Sensitive GET endpoints (secrets, system settings, backups) require authentication
- Every display-control endpoint (`/api/display/*`) requires either a login or the display token, described under [Remote display control](#if-you-have-set-a-password)
- The display view (`/display`) remains accessible without login
- The kid-facing `/chores` view remains accessible without login and can read chore definitions, members, completions, and reward balances over the LAN
- Read-only data endpoints (weather, calendar, etc.) remain accessible for the display

Password protection is the right default for most LANs. If you want to lock things down further — including the kid view and the display itself — add an IP allowlist on top as described below.

### Restrict access by IP

In addition to (or instead of) a password, Home Screens can gate every route on the server by the caller's IP address. The editor surfaces this under **Settings > Security > IP Allowlist** and it has two independent toggles, both opt-in and both off by default.

**Bypass authentication for trusted IPs.** Add your LAN subnets (for example `192.168.1.0/24`) and check the first toggle. Any request coming from an allowlisted IP skips the password prompt and the session-cookie check, so family members on the couch don't have to type a password every time they open the editor, while a phone on cellular data still gets the login form. Display-auth routes (the ~14 cached proxy endpoints the kiosk polls, plus `requireDisplayAuth`-wrapped routes) also accept the bypass, so a trusted LAN can drive the display without a display token.

**Restrict access to allowlisted IPs only.** The second toggle is the harder wall. When enabled, Home Screens blocks every non-allowlisted IP from every route except `/login` and `/api/auth/status`; API callers receive `403 JSON`, browsers are redirected to a dedicated "Access is restricted by IP" banner on the login page. The check runs before the password gate, so an attacker who somehow knows the password still can't get in. Enabling the toggle from a client whose own IP is not in the allowlist returns `409 Conflict` without saving — the UI then shows a lockout warning and a **Save Anyway** button for the rare case where you really want to lock yourself out immediately.

**CIDR entries.** Every entry is CIDR-validated: `a.b.c.d/prefix`, prefix between `0` and `32`, no leading-zero octets (so `01.168.1.0/24` is rejected, matching Node's `net.isIPv4()` behavior). Garbage entries in a hand-edited `data/auth.json` are skipped rather than matched — bad data fails safe instead of silently matching `0.0.0.0/24`.

**Scope and caveats.**
- **IPv4 only.** Home Screens normalizes IPv4-mapped IPv6 (`::ffff:127.0.0.1` → `127.0.0.1`) before matching but cannot match raw IPv6 addresses like `::1` or `fe80::...`. If your clients connect over IPv6, the allowlist will block them and the editor shows a dedicated warning so you know to switch the client to IPv4 (or leave the restriction off). The caller's detected IP is always displayed in the settings panel so you can verify what the server sees.
- **Forwarded headers are ignored by default.** Home Screens works out who a request came from using the address of the actual network connection, and overwrites any `x-forwarded-for` or `x-real-ip` header the caller supplied, so an attacker cannot spoof their way past the allowlist. The trade-off is that a reverse proxy hides the real client: put the [nginx config above](#reverse-proxy-setup-nginx) in front and every request appears to come from `127.0.0.1`, which makes the allowlist match everyone or no one. To use both together, set `HS_TRUSTED_PROXIES` to a comma-separated list of your proxy's exact IP addresses. Home Screens then trusts the forwarded chain from those addresses only. The same applies to login rate limiting, which otherwise buckets every attempt together.

  Add it as a systemd override rather than editing the service file directly, because upgrades rewrite the service file and would discard your change:

  ```bash
  sudo systemctl edit home-screens
  ```

  Then add these two lines, and restart with `sudo systemctl restart home-screens`:

  ```ini
  [Service]
  Environment=HS_TRUSTED_PROXIES=127.0.0.1
  ```
- **Lockout recovery.** If you lock yourself out (e.g. your router handed you a new DHCP lease and the old IP was the only one in the list), SSH into the server and either edit `data/auth.json` to add your new IP, or delete the `ipAllowlist` array entirely — the feature fails open when the list is empty.
- **Allowlist survives password changes.** Setting, changing, clearing, or disabling the editor password no longer drops the IP allowlist — the restriction stays in force even during a password reset.
- **Audit logged.** Every change to the allowlist or either toggle emits an `ip_allowlist_change` audit event so you can spot unexpected edits in the audit log.

### Keep API keys server-side

API keys are stored in `data/secrets.json` and never sent to the browser. All external API calls go through server-side proxy routes under `/api/`. This means even if someone on your network accesses the display URL, they cannot extract your API keys from the page source or network requests.

### Avoid exposing to the internet

Home Screens is designed for local network use. If you need remote access, consider:

- A **VPN** (WireGuard, Tailscale) to access your home network securely
- An **SSH tunnel** for temporary access: `ssh -L 3000:localhost:3000 pi@your-pi`
- A reverse proxy with HTTPS and strong authentication if you must expose it publicly

### Backup sensitive data

The `data/` directory contains your configuration, API keys, authentication state, and Google OAuth tokens. These files are excluded from deploys and git by default.

**The simplest reliable advice is to back up the whole `data/` directory.** Everything Home Screens owns lives there, so copying the folder cannot miss anything, and new files added by future versions are covered automatically.

```bash
# Back up everything
tar -czf home-screens-backup.tar.gz -C /opt/home-screens/current data
```

If you would rather pick files individually, these are the ones that matter:

```bash
data/config.json              # Screen configuration
data/secrets.json             # API keys
data/auth.json                # Password hash and session secret
data/google-tokens.json       # Google OAuth tokens
data/icloud-accounts.json     # iCloud calendar sign-ins (app-specific passwords)
data/plugins/                 # Installed plugins themselves
data/plugin-tokens/           # Plugin account connection tokens
data/plugin-secrets/          # Plugin credentials
data/port.conf                # Custom port (if set)
data/meals.json               # Meal planner data (saved meals, weekly plan, grocery list)
data/chores.json              # Chore chart members and chore definitions
data/chore-completions.json   # Chore history: who did what, and when
data/rewards.json             # Chore rewards data (definitions, balances, redemptions)
data/todo-state.json          # Which todo items are ticked off
data/backup-state.json        # Backup reminder tracking
```

Two of these are easy to miss and painful to lose. Chore history lives in `data/chore-completions.json`, **not** in `chores.json`, and reward balances are calculated from it, so skipping it wipes everyone's earned rewards. And `data/plugins/` holds the installed plugins themselves; without it, every plugin module on your screens comes back empty after a restore.

The editor also supports config backups under **Settings > Backups & data**.
