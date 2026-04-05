---
title: Networking
nextjs:
  metadata:
    title: Networking
    description: Set up remote access, reverse proxies, and multi-display deployments.
---

Home Screens runs as a local web server on your network. This guide covers how to access it from other devices, set up remote access, and secure your deployment.

---

## Default network setup

Home Screens runs a Next.js server on **port 3000** by default. Once installed, these URLs are available on your local network:

| URL | Purpose |
|---|---|
| `http://<ip>:3000/` | Redirects to `/editor` |
| `http://<ip>:3000/display` | Fullscreen kiosk view (what the display shows) |
| `http://<ip>:3000/editor` | Configuration editor |
| `http://<ip>:3000/remote` | Mobile remote control |

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

Write the desired port number to `data/port.conf` and restart the service:

```bash
echo 8080 > /opt/home-screens/current/data/port.conf
sudo systemctl restart home-screens
```

### Checking the current port

```bash
cat /opt/home-screens/current/data/port.conf
```

If the file does not exist, the default port 3000 is in use.

### Resetting to default

```bash
rm /opt/home-screens/current/data/port.conf
sudo systemctl restart home-screens
```

### Port resolution order

The port is resolved in order of priority:

1. `PORT` environment variable (if set)
2. `data/port.conf` file
3. Default: **3000**

The `data/port.conf` file is preserved across upgrades and deployments.

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

        # The display polls /api/display/commands every 3s.
        # Keep proxy timeouts generous for long-lived connections.
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

The `Upgrade` and `Connection` headers are included in case you use any WebSocket-based features in the future.

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

### Commands with payloads

These require a POST with a JSON body:

**Brightness** — set display brightness (0-100):

```bash
curl -X POST http://<ip>:3000/api/display/brightness \
  -H 'Content-Type: application/json' \
  -d '{"value": 50}'
```

**Profile** — switch to a named profile (requires authentication if enabled):

```bash
curl -X POST http://<ip>:3000/api/display/profile \
  -H 'Content-Type: application/json' \
  -d '{"profile": "nighttime"}'
```

**Alert** — display an overlay alert on the screen:

```bash
curl -X POST http://<ip>:3000/api/display/alert \
  -H 'Content-Type: application/json' \
  -d '{"type": "info", "title": "Dinner is ready!", "message": "Come to the kitchen", "duration": 30000}'
```

Alert types: `info`, `warning`, `urgent`. The `duration` field is in milliseconds. Optional fields: `icon` (Lucide icon name), `dismissible` (boolean).

### Querying display status

The display reports its status to the server every 30 seconds and on any state change. Query it with:

```bash
curl http://<ip>:3000/api/display/status
```

Response:

```json
{
  "currentScreen": { "index": 0, "id": "abc123", "name": "Main" },
  "screenCount": 3,
  "activeProfile": null,
  "displayState": "active",
  "timestamp": 1711300000000
}
```

The `displayState` field is one of: `active`, `dimmed`, or `asleep`.

### Home Assistant integration

You can call these endpoints from Home Assistant using the [RESTful Command](https://www.home-assistant.io/integrations/rest_command/) integration:

```yaml
rest_command:
  homescreens_wake:
    url: "http://192.168.1.100:3000/api/display/wake"
    method: GET
  homescreens_sleep:
    url: "http://192.168.1.100:3000/api/display/sleep"
    method: GET
  homescreens_next:
    url: "http://192.168.1.100:3000/api/display/next-screen"
    method: GET
  homescreens_alert:
    url: "http://192.168.1.100:3000/api/display/alert"
    method: POST
    content_type: "application/json"
    payload: '{"type": "info", "title": "{{ title }}", "message": "{{ message }}"}'
```

Then use these in automations, scripts, or dashboards.

---

## Multi-display setup

### Multiple browsers, one server

The simplest multi-display setup is to point multiple browsers at the same server. Each browser opens `http://<server-ip>:3000/display` and shows the same screens from the shared configuration.

Remote commands (wake, sleep, next-screen) affect all connected displays simultaneously since they all poll the same command queue.

### Multiple servers

For independent displays that show different content, run separate Home Screens instances on different ports or different devices:

```bash
# Display 1 (kitchen) — default port
~/home-screens/scripts/install.sh

# Display 2 (office) — custom port on the same device
~/home-screens/scripts/install.sh --port 3001
```

Each instance has its own `data/config.json`, so screens, modules, and profiles are fully independent.

### Profiles for different displays

If you want a single server with different views, use the **profile system**. Create profiles in the editor (e.g. "Kitchen", "Office") and switch each display's active profile via the API:

```bash
curl -X POST http://<ip>:3000/api/display/profile \
  -H 'Content-Type: application/json' \
  -d '{"profile": "kitchen"}'
```

---

## WiFi reliability

The install script applies several WiFi reliability hardening measures for Raspberry Pi deployments, especially important for headless displays on mesh networks:

- **Infinite autoconnect retries** — NetworkManager's default of 4 retries can leave a headless display permanently offline; the installer sets unlimited retries
- **Disabled scan MAC randomization** — random MACs confuse mesh access points and can prevent reconnection
- **Disabled IPv6 on WiFi** — the Broadcom WiFi driver (`brcmfmac`) handles IPv6 multicast poorly, which can cause intermittent drops
- **Masked suspend/hibernate** — `brcmfmac` cannot recover WiFi after suspend, so power management sleep states are disabled
- **Connectivity watchdog** — a timer checks connectivity every 2 minutes and escalates through three recovery steps: NetworkManager reconnect, interface cycle, and driver reload

These changes are applied automatically by both the install script and the pre-built image. No manual configuration is needed.

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

### Enable password protection

Set a password in the editor under **Settings > Security**. When enabled:

- The editor (`/editor`) requires login
- All write API endpoints (`PUT`, `POST`, `DELETE`) require a session cookie
- Sensitive GET endpoints (secrets, system settings, backups) require authentication
- The display view (`/display`) remains accessible without login
- Read-only data endpoints (weather, calendar, etc.) remain accessible for the display

### Keep API keys server-side

API keys are stored in `data/secrets.json` and never sent to the browser. All external API calls go through server-side proxy routes under `/api/`. This means even if someone on your network accesses the display URL, they cannot extract your API keys from the page source or network requests.

### Avoid exposing to the internet

Home Screens is designed for local network use. If you need remote access, consider:

- A **VPN** (WireGuard, Tailscale) to access your home network securely
- An **SSH tunnel** for temporary access: `ssh -L 3000:localhost:3000 pi@your-pi`
- A reverse proxy with HTTPS and strong authentication if you must expose it publicly

### Backup sensitive data

The `data/` directory contains your configuration, API keys, authentication state, and Google OAuth tokens. These files are excluded from deploys and git by default. Back them up separately:

```bash
# Files to back up
data/config.json         # Screen configuration
data/secrets.json        # API keys
data/auth.json           # Password hash and session secret
data/google-tokens.json  # Google OAuth tokens
data/port.conf           # Custom port (if set)
data/meals.json          # Meal planner data (saved meals, weekly plan, grocery list)
data/chores.json         # Chore chart data (members, chores, completions)
data/rewards.json        # Chore rewards data (definitions, balances, redemptions)
data/backup-state.json   # Backup reminder tracking
```

The editor also supports config backups under **System > Backups**.
