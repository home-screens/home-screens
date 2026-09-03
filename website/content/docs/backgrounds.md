---
title: Photos and backgrounds
nextjs:
  metadata:
    title: Photos and backgrounds
    description: Put your own photos on the wall and behind every screen. Upload, import from Google Photos or an iCloud shared album, browse Unsplash and NASA, and rotate backgrounds on a schedule.
    alternates:
      canonical: /docs/backgrounds
---

Each screen can have its own background, and your photos can fill a whole screen as a slideshow. Upload your own pictures, import them from Google Photos or an iCloud shared album, browse Unsplash and NASA from the editor, or let the background change on its own every few hours. {% .lead %}

Photos and backgrounds share one library on the Pi. Anything you upload or import from a photo module is available as a background, and anything you set as a background can be shown by the **Photo Slideshow** and **Full-Screen Photo Viewer** modules. From a phone, the family remote's **Photos** tab uploads into the same library.

{% callout type="note" title="Finding the Background section" %}
The **Background** section appears in the editor's right sidebar only when no module is selected. If you can't find it, click an empty part of the canvas first to deselect whatever module you were editing. Every procedure on this page assumes you've done that.
{% /callout %}

---

## Setting a static background

To set a background in the editor:

1. Select the screen you want to customize using the **Screen Tabs** at the top
2. Click an empty part of the canvas to deselect any module
3. Open the **Background** section in the right sidebar
4. Switch to the **Local** tab to see your uploaded images
5. Click a thumbnail to apply it, or click **None** to remove the background

The picture fills the whole screen without being stretched; a landscape photo on a portrait wall is cropped at the sides.

---

## Uploading custom images

1. Click an empty part of the canvas to deselect any module
2. Open the **Background** section in the right sidebar
3. Switch to the **Local** tab
4. Click **Upload Background**
5. Select an image file from your computer

The image is saved into your library on the Pi and set as the current screen's background straight away.

The Upload Background button opens a file chooser; there is no drop zone to drag files onto. It offers image files only. Videos can be added to the same library from a photo or video module's media library browser, but they can't be used as a screen background.

### Constraints

- **Maximum file size:** 10 MB per image, 200 MB per video
- **Allowed types:** JPEG, PNG, WebP, GIF, AVIF images; MP4, WebM, MOV videos (used by the Video module and mixed-media slideshows)
- Filenames are sanitized on upload, special characters are replaced with underscores

---

## Folders

The background picker's Local tab shows the top level of your library only. Photos filed into a folder (an iCloud or Google Photos import, or a folder you made from the phone) are for the photo modules, which can point at any folder and everything inside it.

---

## Unsplash integration

Unsplash provides access to a library of high-quality, freely usable photographs. A free API key is required.

### Setup

1. Create a free account at [unsplash.com/developers](https://unsplash.com/developers)
2. Create a new application to get an **Access Key**
3. In the editor, go to **Settings > API keys** and enter the key as **Unsplash Access Key**

### Browsing and selecting

1. Click an empty part of the canvas to deselect any module, then open the **Background** section in the right sidebar
2. The **Unsplash** tab is shown by default
3. Use the search bar or click a preset category (Nature, Mountains, Ocean, Forest, Sky, Space, City, Abstract, Flowers, Seasons)
4. Click a photo to download it and set it as the screen background

When you select a photo it is downloaded once, at 1080 pixels wide, and saved into your library. The wall shows the local copy, so Unsplash is never contacted again for it.

Unsplash searches default to **portrait orientation** to match the typical display layout.

---

## NASA Astronomy Picture of the Day

NASA offers two image sources, both accessible from the **NASA** tab in the background picker.

### Setup

1. Get a free API key at [api.nasa.gov](https://api.nasa.gov)
2. In the editor, go to **Settings > API keys** and enter it as **NASA API Key**

The NASA Image Library (search) works without an API key. The Astronomy Picture of the Day (APOD) feature requires one.

### Picture of the Day

The **Picture of the Day** sub-tab shows a random selection of past APOD images (12 at a time). Click **Refresh** to load a new batch. Click any image to download the HD version and set it as your background.

### Image Library

The **Image Library** sub-tab lets you search NASA's full public image archive by keyword. Preset categories include Nebula, Galaxy, Earth, Mars, Moon, Saturn, Jupiter, Sun, Aurora, and ISS.

When you select a NASA image, it is downloaded and saved locally. Non-web image formats (such as TIFF files sometimes used by NASA) are automatically converted to JPEG.

{% callout type="note" title="Image quality" %}
Some NASA images include embedded timestamps, watermarks, or overlay text that cannot be removed. Preview the thumbnail before selecting.
{% /callout %}

---

## Immich integration

[Immich](https://immich.app) is a self-hosted Google Photos alternative. When configured, you can browse your Immich library directly from the background picker and use Immich as a source for background rotation.

### Setup

1. Install and configure an Immich server on your network
2. In Immich, go to **Account Settings → API Keys** and generate a new key
3. In the editor, go to **Settings > API keys** and enter the **Immich Server URL** (e.g. `http://192.168.1.50:2283`) and the **Immich API Key**

### Browsing and selecting

1. Click an empty part of the canvas to deselect any module, then open the **Background** section in the right sidebar
2. Switch to the **Immich** tab (only visible when both Immich keys are configured)
3. Optionally filter by album using the dropdown
4. Click **Refresh** to load a new batch of photos
5. Click a photo to download it and set it as the screen background

When you select an Immich photo, a display-sized copy is saved into your library and set as the background. If auto-rotation was on, it is switched off so your choice stays.

The Immich browser shows a grid of 20 random photos from your library at a time.

---

## iCloud shared albums

iCloud shared albums work without an Apple account or API key, all you need is the album's public link.

### Getting a shared album link

1. In Apple Photos, open (or create) a shared album
2. In the album's settings, turn on **Public Website**
3. Copy the link (it looks like `https://www.icloud.com/sharedalbum/#B0abc...`)

### Using it

- **As a rotation source**: deselect any module, open the **Background** section, enable auto-rotation, choose **iCloud Shared Album** as the source, and paste the link. The display loads photos straight from Apple's servers. Only still photos are used; any videos in the album are skipped.
- **Importing into your library**: use **Import from an iCloud link** to download everything a link contains into the selected folder. That button lives in the media library browser, which opens from the settings of an Image, Video, Photo slideshow, or Full-screen photo module, not from the Background section. This also works with one-off "Copy iCloud Link" photo links, which expire after about 30 days; importing keeps the photos even after the link dies.

---

## Google Photos

Google no longer lets apps read your photo library directly, but it does let you hand-pick photos to share, so Home Screens brings them in as an import. You choose photos in Google Photos itself, and they download into your library's `google-photos` folder as ordinary local files. After that, no Google connection is needed to display them: they keep working even if you disconnect. Re-running an import only downloads photos you haven't imported before.

### One-time setup

Google Photos needs its own sign-in credential, separate from the Google Calendar one (Google requires a different credential type for this):

1. In [Google Cloud console](https://console.cloud.google.com/apis/credentials) (the same project you may already use for Google Calendar), go to **APIs & Services > Credentials** and create an **OAuth client ID** with the type **Web application**
2. Under **Authorized redirect URIs**, add exactly `https://homescreens.dev/connect/google` (leave **Authorized JavaScript origins** empty)
3. In the **API Library**, search for **Google Photos Picker API** and enable it
4. Paste the new client ID and secret into **Settings > API keys**, in the Google card's **Photos Import** fields

The redirect page at homescreens.dev is just a message board: after you approve access, Google sends your browser there, and the page shows a code to copy back into the editor. It never sees your password, your secret, or your photos.

### Importing photos

1. Select a Photo slideshow or Full-screen photo module and click **Import from Google Photos** (under the folder picker)
2. The first time, click **Sign in with Google**, approve access, and paste the code you're given
3. Click **Choose photos**: Google Photos opens with its own photo picker
4. Pick the photos you want and confirm; the import starts on its own and shows progress as it saves

When it finishes, the module automatically points at the `google-photos` folder. To add more photos later, run the import again and pick more, existing photos are skipped, new ones are added.

Photos are saved as high-quality display-sized copies (up to 4096 pixels on the long edge), which keeps imports fast and light on the SD card. Imports are capped at 2000 photos at a time.

---

## Background rotation

Auto-rotation periodically replaces the screen background with a new image from Unsplash, NASA APOD, Immich, or an iCloud shared album.

### Enabling rotation

1. Click an empty part of the canvas to deselect any module
2. Open the **Background** section in the right sidebar
3. Toggle **Auto-rotate background** on
4. Choose a **Source**: Unsplash, NASA Picture of the Day, Immich, or iCloud Shared Album
5. For Unsplash, enter a **Search query** (default: "nature landscape")
6. For Immich, optionally filter by **Album**, **Person**, or **Favorites only**
7. For iCloud, paste the shared album link
8. Set the **Rotate every** interval

Unsplash, NASA, and Immich appear in the Source list only once their key is saved on the **Settings > API keys** page. iCloud shared albums need no key, so that option is always there. If the list looks short, a missing key is why.

### Interval options

| Interval | Best for |
|---|---|
| 15 minutes | Frequent variety |
| 30 minutes | Moderate rotation |
| 1 hour | Default for Unsplash |
| 2 hours | Balanced |
| 4 hours | Default for NASA APOD |
| 8 hours | Minimal changes |

### How it works

Every minute the wall asks the Pi whether it is time for a new background. When the interval has passed, the Pi fetches one from the source you picked, saves it into the library, and the wall switches to it.

- **Unsplash rotation** fetches a random portrait photo matching the configured query. Download tracking is triggered per the Unsplash API terms.
- **NASA APOD rotation** fetches the current Astronomy Picture of the Day. Since NASA publishes one new image per day, the display checks for updates at the chosen interval but the image only changes once daily.
- **Immich rotation** fetches a random photo from your Immich library, optionally filtered by album, person, or favorites. The server caches Immich filter parameters so changing your album or person selection immediately busts the cache and fetches a fresh photo.
- **iCloud rotation** fetches a random photo from the shared album. Only still photos are used, so any videos in the album are skipped and an album that's mostly video will cycle through a much smaller pool than you'd expect. Album contents are cached briefly, so new photos added to the album show up within a few minutes.

If a fetch fails (network error, API limit), the previous background is kept until the next successful rotation.

### Housekeeping

Rotated images are tidied up on their own: only the ones screens are currently using, plus the eight most recent, are kept. Your own uploads and imports are never touched. If a rotated photo is one you want to keep, pick it as a fixed background and it stays.

### Rotation and manual backgrounds

While rotation is on it replaces whatever fixed background the screen had. Picking a new background by hand (from Local, Unsplash or NASA) switches rotation off for that screen so your choice stays.

---

## Supported formats and recommended dimensions

### Supported image formats

| Format | Extension | MIME Type |
|---|---|---|
| JPEG | `.jpg`, `.jpeg` | `image/jpeg` |
| PNG | `.png` | `image/png` |
| WebP | `.webp` | `image/webp` |
| GIF | `.gif` | `image/gif` |
| AVIF | `.avif` | `image/avif` |

### Recommended dimensions

The display defaults to **1080 x 1920** pixels (portrait). For best results, use images that match or exceed your display's resolution. Images are scaled to fill the screen, so a landscape image is cropped at the sides on a portrait display.

| Display | Recommended Image Size |
|---|---|
| Portrait 1080p | 1080 x 1920 or larger |
| Portrait 1440p | 1440 x 2560 or larger |
| Portrait 4K | 2160 x 3840 or larger |
| Landscape 1080p | 1920 x 1080 or larger |

Portrait-oriented images work best for the default portrait display layout. Unsplash searches are pre-filtered to portrait orientation for this reason.

---

## Next steps

- [Modules](/docs/modules#media-and-display): the Photo Slideshow and Full-Screen Photo Viewer
- [On your phone](/docs/remote-control): uploading photos from the family remote
- For developers: the per-screen fields are in the [Configuration reference](/docs/configuration#screen) and the endpoints under [Backgrounds](/docs/api#backgrounds) in the API reference
