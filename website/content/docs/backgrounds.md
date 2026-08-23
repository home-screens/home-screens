---
title: Backgrounds
nextjs:
  metadata:
    title: Backgrounds
    description: Customize screen backgrounds with uploads, Unsplash, NASA APOD, Immich, iCloud shared albums, and auto-rotation.
    alternates:
      canonical: /docs/backgrounds
---

Each screen in Home Screens can have its own background image. You can upload your own photos, browse Unsplash, NASA, or Immich imagery directly from the editor, pull from an iCloud shared album, and optionally enable auto-rotation to keep things fresh.

{% callout type="note" title="Finding the Background section" %}
The **Background** section appears in the editor's right sidebar only when no module is selected. If you can't find it, click an empty part of the canvas first to deselect whatever module you were editing. Every procedure on this page assumes you've done that.
{% /callout %}

---

## Setting a static background

Every screen has a `backgroundImage` field that points to a locally stored image. To set a background in the editor:

1. Select the screen you want to customize using the **Screen Tabs** at the top
2. Click an empty part of the canvas to deselect any module
3. Open the **Background** section in the right sidebar
4. Switch to the **Local** tab to see your uploaded images
5. Click a thumbnail to apply it, or click **None** to remove the background

The selected image fills the entire screen using CSS `cover` sizing, so it scales to fill the display without distortion.

---

## Uploading custom images

1. Click an empty part of the canvas to deselect any module
2. Open the **Background** section in the right sidebar
3. Switch to the **Local** tab
4. Click **Upload Background**
5. Select an image file from your computer

The image is saved to `public/backgrounds/` on the server and immediately available for use. Uploading an image automatically sets it as the current screen's background.

The Upload Background button opens a file chooser; there is no drop zone to drag files onto. It offers image files only. Videos can be added to the same library from a photo or video module's media library browser, but they can't be used as a screen background.

### Constraints

- **Maximum file size:** 10 MB per image, 200 MB per video
- **Allowed types:** JPEG, PNG, WebP, GIF, AVIF images; MP4, WebM, MOV videos (used by the Video module and mixed-media slideshows)
- Filenames are sanitized on upload — special characters are replaced with underscores

---

## Where background files live

Backgrounds must sit **directly in `public/backgrounds/`** to appear in the editor's Local tab. The picker doesn't browse folders, so anything filed into a subdirectory disappears from it.

Subdirectories still work for the photo modules' media library browser and for the [backgrounds API](/docs/api#backgrounds), which takes a `directory` parameter on upload, list, and delete.

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

When you select a photo, it is downloaded from Unsplash at the `regular` resolution (1080px wide) and saved locally to `public/backgrounds/` as a JPEG. The display serves the local copy — there are no ongoing requests to Unsplash during display mode.

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

When you select an Immich photo, the preview-quality image is downloaded through the server proxy, saved locally to `public/backgrounds/`, and set as a static background. If auto-rotation was enabled, it is automatically disabled so your choice is preserved.

The Immich browser shows a grid of 20 random photos from your library at a time.

---

## iCloud shared albums

iCloud shared albums work without an Apple account or API key — all you need is the album's public link.

### Getting a shared album link

1. In Apple Photos, open (or create) a shared album
2. In the album's settings, turn on **Public Website**
3. Copy the link (it looks like `https://www.icloud.com/sharedalbum/#B0abc...`)

### Using it

- **As a rotation source** — deselect any module, open the **Background** section, enable auto-rotation, choose **iCloud Shared Album** as the source, and paste the link. The display loads photos straight from Apple's servers. Only still photos are used; any videos in the album are skipped.
- **Importing into your library** — use **Import from an iCloud link** to download everything a link contains into the selected folder. That button lives in the media library browser, which opens from the settings of an Image, Video, Photo slideshow, or Full-screen photo module, not from the Background section. This also works with one-off "Copy iCloud Link" photo links, which expire after about 30 days; importing keeps the photos even after the link dies.

---

## Google Photos

Google no longer lets apps read your photo library directly, but it does let you hand-pick photos to share — so Home Screens brings them in as an import. You choose photos in Google Photos itself, and they download into your library's `google-photos` folder as ordinary local files. After that, no Google connection is needed to display them: they keep working even if you disconnect. Re-running an import only downloads photos you haven't imported before.

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
3. Click **Choose photos** — Google Photos opens with its own photo picker
4. Pick the photos you want and confirm; the import starts on its own and shows progress as it saves

When it finishes, the module automatically points at the `google-photos` folder. To add more photos later, run the import again and pick more — existing photos are skipped, new ones are added.

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

The display client polls the server every 60 seconds. The server maintains a cache (`data/background-cache.json`) that tracks when each screen last fetched a new background. When the configured interval has elapsed, the server fetches a new image from the selected source, saves it locally, and returns the new path.

- **Unsplash rotation** fetches a random portrait photo matching the configured query. Download tracking is triggered per the Unsplash API terms.
- **NASA APOD rotation** fetches the current Astronomy Picture of the Day. Since NASA publishes one new image per day, the display checks for updates at the chosen interval but the image only changes once daily.
- **Immich rotation** fetches a random photo from your Immich library, optionally filtered by album, person, or favorites. The server caches Immich filter parameters so changing your album or person selection immediately busts the cache and fetches a fresh photo.
- **iCloud rotation** fetches a random photo from the shared album. Only still photos are used, so any videos in the album are skipped and an album that's mostly video will cycle through a much smaller pool than you'd expect. Album contents are cached briefly, so new photos added to the album show up within a few minutes.

If a fetch fails (network error, API limit), the previous background is kept until the next successful rotation.

### Housekeeping

Rotated images are saved into `public/backgrounds/` with a `rotation-` prefix, and tidied up automatically after each rotation: only the ones screens are currently using, plus the eight most recent, are kept. Your own uploads and iCloud imports are never touched. If you see a rotated photo you want to keep for good, download it and upload it again as a regular background.

### Rotation and manual backgrounds

When rotation is enabled, it overrides the static `backgroundImage` setting. If you manually select a new background (from Local, Unsplash browse, or NASA browse), rotation is automatically disabled for that screen so your choice is preserved.

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

The display defaults to **1080 x 1920** pixels (portrait). For best results, use images that match or exceed your configured display resolution. Images are scaled with `cover` sizing, so landscape images will be cropped to fill a portrait display.

| Display | Recommended Image Size |
|---|---|
| Portrait 1080p | 1080 x 1920 or larger |
| Portrait 1440p | 1440 x 2560 or larger |
| Portrait 4K | 2160 x 3840 or larger |
| Landscape 1080p | 1920 x 1080 or larger |

Portrait-oriented images work best for the default portrait display layout. Unsplash searches are pre-filtered to portrait orientation for this reason.

---

## Background configuration in JSON

Backgrounds are stored per-screen on the `Screen` object: `backgroundImage` for a static image and `backgroundRotation` for the rotation settings. Field-by-field types are in the [Configuration reference](/docs/configuration#screen).

---

## API reference

Every backgrounds, Unsplash, and NASA endpoint is documented under [Backgrounds](/docs/api#backgrounds) in the API reference.
