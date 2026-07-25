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

---

## Setting a static background

Every screen has a `backgroundImage` field that points to a locally stored image. To set a background in the editor:

1. Select the screen you want to customize using the **Screen Tabs** at the top
2. Open the **Background** section in the right sidebar
3. Switch to the **Local** tab to see your uploaded images
4. Click a thumbnail to apply it, or click **None** to remove the background

The selected image fills the entire screen using CSS `cover` sizing, so it scales to fill the display without distortion.

---

## Uploading custom images

### From the editor

1. Open the **Background** section in the right sidebar
2. Switch to the **Local** tab
3. Click **Upload Background**
4. Select an image file from your computer

The image is saved to `public/backgrounds/` on the server and immediately available for use. Uploading an image automatically sets it as the current screen's background.

### Via the API

You can also upload backgrounds programmatically:

```bash
curl -X POST http://your-display:3000/api/backgrounds \
  -F "file=@/path/to/photo.jpg"
```

The response includes the serve path:

```json
{ "path": "/api/backgrounds/serve?file=photo.jpg" }
```

To upload multiple files in one request:

```bash
curl -X POST http://your-display:3000/api/backgrounds \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg"
```

The multi-file response returns an array of paths:

```json
{ "paths": ["/api/backgrounds/serve?file=photo1.jpg", "/api/backgrounds/serve?file=photo2.jpg"] }
```

### Constraints

- **Maximum file size:** 10 MB per image, 200 MB per video
- **Allowed types:** JPEG, PNG, WebP, GIF, AVIF images; MP4, WebM, MOV videos (used by the Video module and mixed-media slideshows)
- Filenames are sanitized on upload — special characters are replaced with underscores

---

## Organizing backgrounds in directories

Backgrounds support subdirectories within `public/backgrounds/`. You can use directories to organize images by theme, season, or source.

### Uploading to a directory

Pass the `directory` parameter when uploading via the API:

```bash
curl -X POST http://your-display:3000/api/backgrounds \
  -F "file=@christmas-tree.jpg" \
  -F "directory=holidays/christmas"
```

The directory is created automatically if it does not exist. The resulting serve path includes the directory:

```
/api/backgrounds/serve?file=holidays/christmas/christmas-tree.jpg
```

### Listing a directory

```bash
# List root backgrounds
curl http://your-display:3000/api/backgrounds

# List a subdirectory
curl http://your-display:3000/api/backgrounds?directory=holidays/christmas
```

Both return a JSON array of serve URLs for the images in that directory.

### Deleting from a directory

```bash
curl -X DELETE http://your-display:3000/api/backgrounds \
  -H "Content-Type: application/json" \
  -d '{"file": "christmas-tree.jpg", "directory": "holidays/christmas"}'
```

In the editor's Local tab, hover over any thumbnail and click the delete button to remove it.

---

## Unsplash integration

Unsplash provides access to a library of high-quality, freely usable photographs. A free API key is required.

### Setup

1. Create a free account at [unsplash.com/developers](https://unsplash.com/developers)
2. Create a new application to get an **Access Key**
3. In the editor, go to **Settings > API keys** and enter the key as **Unsplash Access Key**

### Browsing and selecting

1. Open the **Background** section in the right sidebar
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

1. Open the **Background** section in the right sidebar
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

- **As a rotation source** — in the **Background** section, enable auto-rotation, choose **iCloud Shared Album** as the source, and paste the link. The display loads photos straight from Apple's servers.
- **Importing into your library** — in the media library browser, use **Import from an iCloud link** to download everything a link contains into the selected folder. This also works with one-off "Copy iCloud Link" photo links, which expire after about 30 days — importing keeps the photos even after the link dies.

---

## Background rotation

Auto-rotation periodically replaces the screen background with a new image from Unsplash, NASA APOD, Immich, or an iCloud shared album.

### Enabling rotation

1. Open the **Background** section in the right sidebar
2. Toggle **Auto-rotate background** on
3. Choose a **Source**: Unsplash, NASA Picture of the Day, Immich, or iCloud Shared Album
4. For Unsplash, enter a **Search query** (default: "nature landscape")
5. For Immich, optionally filter by **Album**, **Person**, or **Favorites only**
6. For iCloud, paste the shared album link
7. Set the **Rotate every** interval

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
- **iCloud rotation** fetches a random photo from the shared album. Album contents are cached briefly, so new photos added to the album show up within a few minutes.

If a fetch fails (network error, API limit), the previous background is kept until the next successful rotation.

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

Backgrounds are configured per-screen in `data/config.json`. Here is the relevant portion of the `Screen` object:

```json
{
  "id": "screen-1",
  "name": "Main",
  "backgroundImage": "/api/backgrounds/serve?file=unsplash-abc123.jpg",
  "backgroundRotation": {
    "enabled": true,
    "source": "unsplash",
    "query": "nature landscape",
    "intervalMinutes": 60
  },
  "modules": []
}
```

### BackgroundRotation fields

| Field | Type | Description |
|---|---|---|
| `enabled` | `boolean` | Whether auto-rotation is active |
| `source` | `'unsplash' \| 'nasa-apod' \| 'immich'` | Image source for rotation |
| `query` | `string` | Search query (Unsplash only; ignored for other sources) |
| `intervalMinutes` | `number` | Minutes between background changes |
| `immichAlbumId` | `string` | Immich album filter (optional) |
| `immichPersonId` | `string` | Immich person (face) filter (optional) |
| `immichFavoritesOnly` | `boolean` | Only use photos marked as favorites in Immich (optional) |

### Static background only

To use a static background without rotation, set `backgroundImage` and either omit `backgroundRotation` or set `enabled` to `false`:

```json
{
  "id": "screen-1",
  "name": "Main",
  "backgroundImage": "/api/backgrounds/serve?file=my-photo.jpg",
  "modules": []
}
```

### No background

To use no background (transparent/black), set `backgroundImage` to an empty string:

```json
{
  "backgroundImage": ""
}
```

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/backgrounds` | List uploaded background images |
| `GET` | `/api/backgrounds?directory=subdir` | List images in a subdirectory |
| `POST` | `/api/backgrounds` | Upload one or more images (multipart form) |
| `DELETE` | `/api/backgrounds` | Delete an uploaded image |
| `GET` | `/api/backgrounds/serve?file=name.jpg` | Serve a background image |
| `GET` | `/api/backgrounds/rotate?screenId=X` | Get the current rotated background for a screen |
| `GET` | `/api/unsplash?query=...` | Search Unsplash photos |
| `POST` | `/api/unsplash` | Download an Unsplash photo to local storage |
| `GET` | `/api/nasa?type=apod&count=12` | Fetch random APOD images |
| `GET` | `/api/nasa?type=search&query=...` | Search NASA Image Library |
| `POST` | `/api/nasa` | Download a NASA image to local storage |

Served background images are cached by the browser for 24 hours (`Cache-Control: public, max-age=86400`).
