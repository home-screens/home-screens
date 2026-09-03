---
title: Install
nextjs:
  metadata:
    title: Install Home Screens
    description: Install Home Screens on a Raspberry Pi with the pre-built image or the install script. Free, self-hosted smart display with a drag-and-drop editor.
    alternates:
      canonical: /docs/getting-started
---

Most people install Home Screens by flashing a ready-made image onto a memory card. That takes about 10 minutes of your time and around 30 minutes end to end, most of it waiting. If you already have a Pi running Raspberry Pi OS, the install script is quicker. {% .lead %}

| Method | When to use it | Time |
|---|---|---|
| **Pre-built image** (recommended) | A fresh Pi, or one you are happy to wipe | about 30 min, 10 hands-on |
| **Install script** | A Pi that already runs Raspberry Pi OS | about 15 min |

Need the hardware first? See [What to buy](/docs/what-to-buy). Want to try it on a laptop before buying anything? The [development setup](/docs/development#setup) runs it on a Mac, Windows, or Linux machine.

---

## Pre-built image {% .lead %}

Download a ready-to-boot SD card image, flash it, and power on. The image contains Raspberry Pi OS Lite with Home Screens already installed and set to start on its own.

Images are published for major and minor releases (v1.0.0, v1.1.0, and so on). Patch releases arrive through the built-in updater once you are running.

### Requirements

- Raspberry Pi 4 or 5 (2 GB or more)
- A microSD card (16 GB or more)
- [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on your computer
- A screen connected over HDMI

### Download and flash

1. {% latest-image-link /%}. You do not need to unzip it. Older images are on the [releases page](https://github.com/home-screens/home-screens/releases).
2. Open **Raspberry Pi Imager**.
3. Click **Choose Device** and pick your Raspberry Pi model.
4. Click **Choose OS**, scroll to the bottom, and pick **Use custom**. Select the `.img.xz` file you downloaded.
5. Click **Choose Storage** and pick your microSD card.
6. Click **Next**. When Imager asks whether to apply OS customisation, click **No**. The image is already set up.

{% callout type="warning" title="Do not click Edit Settings in Imager" %}
Imager's customisation screen does not work with this image, and if you open it you will be stuck. **No** is the right answer. Ethernet works with no setup at all; for WiFi, use the `wifi.txt` file described next.
{% /callout %}

### WiFi setup

If the Pi will be on WiFi rather than a cable, tell it your network before the first boot:

1. After flashing, take the card out and put it back in so the boot drive (labelled `bootfs`) shows up on your computer.
2. Find `wifi.txt.example` on that drive and rename it to `wifi.txt`.
3. Open `wifi.txt` in a text editor and fill it in:

```
SSID=Your Network Name
PASSWORD=your-wifi-password
COUNTRY=US
```

| Line | Required | Meaning |
|---|---|---|
| `SSID` | Yes | Your WiFi network name |
| `PASSWORD` | No | Your WiFi password. Leave the line out for an open network. |
| `COUNTRY` | No | Two-letter country code (defaults to `US`) |
| `HIDDEN` | No | `true` if your network is hidden (defaults to `false`) |

4. Save the file, eject the card, and put it in the Pi.

On its first boot the Pi reads `wifi.txt`, joins your network, and **deletes the file** so your password is not left sitting on the card.

### First boot

Put the card in the Pi and plug in the power. You will see:

1. A black screen for 30 to 90 seconds while the Pi starts up
2. The Raspberry Pi rainbow splash, briefly
3. The Home Screens splash while the card is prepared and WiFi connects
4. A dark screen with **"Nothing on this screen yet"**, the address to open, and a QR code

{% screenshot name="display-fresh" caption="A brand-new display. Scan the code or type the address on any phone or laptop on your home WiFi." /%}

That last screen means the Pi is done. Nothing is wrong; you have not designed a screen yet. Total time is 2 to 3 minutes. If it is still black after 5 minutes, see [the screen is still black](/docs/troubleshooting#i-flashed-the-sd-card-but-the-screen-is-still-black-after-5-minutes).

### Finding your Pi on the network

The address is on the wall. On the pre-built image it is:

```
http://home-screens.local:3000
```

Open it from any phone or laptop on the same WiFi. A laptop lands in the editor. A phone gets a short menu instead: the family remote, the kids' chores page, and the editor address to send to a laptop, because the editor needs a wide screen.

If `home-screens.local` does not open (a few routers do not support these names), look at the address printed on the wall, or find a device called `home-screens` in your router's admin page and use its IP address instead, like `http://192.168.1.50:3000`.

### The Pi's own login

The image switches on SSH, the way to reach the Pi from a terminal, with these details:

| | |
|---|---|
| **Username** | `hs` |
| **Password** | `screens` |
| **Hostname** | `home-screens` |

You will not need it for everyday use; everything is done in the editor. If you do use it, change the password right away with `passwd`, or switch SSH off with `sudo systemctl disable --now ssh`. Until you do, anyone on your network who knows these details can log in to the Pi.

---

## Install script {% .lead %}

If you already have a Pi running Raspberry Pi OS, or you need a patch release that has no image, the install script sets everything up: Node.js, the app, Chromium in kiosk mode, and a service that starts on boot.

### Requirements

- Raspberry Pi 4 or 5 (2 GB or more). The Pi 5 is much smoother with large screens and animations.
- [Raspberry Pi OS Lite 64-bit (Trixie)](https://www.raspberrypi.com/software/operating-systems/). Desktop works too. In Raspberry Pi Imager, Lite is under **Raspberry Pi OS (other)**.
- A screen connected over HDMI
- A network connection (cable or WiFi)

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/home-screens/home-screens/main/scripts/install.sh | bash
```

Or download the script first if you want to read it before running it:

```bash
sudo apt install git
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh
```

Running Pi OS **Desktop** rather than Lite? Add the `--desktop` flag. When you pipe the script through `bash`, flags go after `-s --`:

```bash
curl -fsSL https://raw.githubusercontent.com/home-screens/home-screens/main/scripts/install.sh | bash -s -- --desktop
```

The script asks how your screen is mounted (portrait or landscape) and picks up its resolution on its own. Every flag is listed under [Installer flags](/docs/raspberry-pi#installer-flags).

When it finishes, reboot. The display starts by itself, and the editor is at `http://<pi-ip>:3000/editor` from any other device on your network.

---

## Next steps

- [Your first screen](/docs/first-screen): pick a template, set your location, add a calendar and a chore chart
- [On your phone](/docs/remote-control): the family remote and the kids' chores page
- [Troubleshooting](/docs/troubleshooting) if something on this page did not go to plan
