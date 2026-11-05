---
title: Photos and backgrounds
nextjs:
  metadata:
    title: Photos and backgrounds
    description: Put your own photos on the wall and behind every screen. Upload, import from Google Photos or an iCloud shared album, and rotate backgrounds on a schedule.
    alternates:
      canonical: /docs/backgrounds
---

Each screen can have its own background, and your photos can fill a whole screen as a slideshow. Upload your own pictures to the media library, import them from Google Photos or an iCloud shared album, or let the background change on its own every few hours. {% .lead %}

Photos and backgrounds share one library on the Pi. Photos uploaded or imported to the library can be used by photo modules and local-folder background rotation; bundled walls can be picked as static backgrounds. From a phone, the family remote's **Photos** tab uploads into the same library.

{% callout type="note" title="Finding the Background section" %}
The **Background** section appears in the editor's right sidebar only when no module is selected. If you can't find it, click an empty part of the canvas first to deselect whatever module you were editing. Every procedure on this page assumes you've done that.
{% /callout %}

---

## Backgrounds that come with Home Screens

The **Sources** card in the Background section starts with three rotation checkboxes for walls that need no key and no upload. They are tiny drawings rather than photos, so they look sharp on any display, portrait or landscape. Check a group to rotate through its walls; its settings then expand:

- **Match a full-screen theme**: one wall for each of the twelve full-screen themes, painted from the same colors the theme uses. Give a regular screen this wall and it sits next to a full-screen calendar or weather screen without a visible change of color. The theme your display uses (from **Settings > Screen**, or the display's own override) is listed first and marked "in use".
- **Colors**: eighteen gradients, from deep and moody (Midnight, Ember, Ink) to soft and light (Cloud, Sand, Sage, Blush).
- **Patterns**: four quiet textures (Dots, Grid, Diagonal, and a light Paper) for a wall with a little texture behind your modules.

Each group initially includes all its walls. Uncheck an individual wall inside the expanded group to exclude it from rotation; the count shows included/total. At least one wall stays included in a checked group. The theme group rotates through **all** theme walls, not just the current display theme. Use the tile itself to set that wall as a **fixed background** instead: this turns off rotation, and the highlighted tile indicates the fixed choice, not rotation membership. **None** under Colors clears the picture, leaves a solid background, and turns off rotation. A fixed theme wall is a static snapshot: changing the display theme later does not change it. Groups remember their open/closed state in this browser. **Refresh now** and **Rotate every** apply to these groups and other checked sources alike.

---

## Setting a static background

To set a background in the editor:

1. Select the screen you want to customize using the **Screen Tabs** at the top
2. Click an empty part of the canvas to deselect any module
3. Open the **Background** section in the right sidebar
4. In **Sources**, check **Match a full-screen theme**, **Colors**, or **Patterns** to expand its tiles
5. Click a tile to apply it, or click **None** under Colors to remove the background

The picture fills the whole screen without being stretched; a landscape photo on a portrait wall is cropped at the sides.

---

## Shading a background

A bright photo can make light text hard to read. Under the background picker, switch on **Shade background** to lay a soft shade over the picture:

- **Style**: **Even** puts the same shade over the whole picture. **Top and bottom** shades a band along the top and the bottom and leaves the middle clear. **Edges** fades in toward every edge, like an old photo. **Both** combines the top and bottom bands with the edges.
- **Strength**: how strong the shade is, 40% to start with
- **Color**: black to start with; any color works, for a warm or tinted shade

Each screen has its own shade, and the editor shows it exactly as the wall will.

---

## Uploading custom images

Open **Settings > Pictures & videos** and use its upload panel to add images to your shared library. The Background section no longer has an upload button or a separate uploaded-picture picker. The media library, photo modules, imports, and background-serving API still work as before.

### Constraints

- **Maximum file size:** 10 MB per image, 200 MB per video
- **Allowed types:** JPEG, PNG, WebP, GIF, AVIF, SVG images; MP4, WebM, MOV videos (used by the Video module and mixed-media slideshows)
- Filenames are sanitized on upload, special characters are replaced with underscores

---

## Folders

Photo modules can point at any folder in the media library. For background rotation, the **Local library folder** source inside **Sources** can select a folder of images.

---

## Managing your library

Every picture and video you upload lands in one shared library, and **Settings > Pictures & videos** shows all of it: thumbnails with each picture's resolution and every file's size, a type tag (JPG, SVG, MP4), folder filters, and a switch between images and videos. Videos show their first frame. The grid loads small copies of each picture (kept under `data/thumbnails`, rebuilt on demand, never backed up), so a big library opens quickly; opening a picture shows the original. Click any tile to see it full size, or to play a video, and use the arrow keys to step through the rest.

Files a screen depends on can't be deleted. If a screen background, a calendar day picture or a single-photo module points at a file, it wears an **In use** badge (hover the badge, or open the file, to see where it's used), and delete leaves it alone. Pictures a slideshow plays wear a green **Slideshow** badge instead: they can be deleted or moved like any other file, and the slideshow carries on with the rest. Only its last picture is kept, so cleaning up can never leave a screen blank.

To add files, open the upload panel and drop in as many pictures or videos as you like, choosing which folder they land in. The built-in starter pictures for calendar day looks are not part of this library: they ship with Home Screens and refresh on upgrades. Backgrounds that rotate on their own (Unsplash, NASA, Immich, iCloud) are managed by the rotation and are not listed here; their file names start with `rotation-`, and an upload with such a name is turned away so it cannot be mistaken for one.

If something on a screen points at a file that is no longer in the library, the page says so at the top, with a link that opens the editor on that screen. The where-used lines under an **In use** badge open the editor the same way. The **Unused only** chip shows just the files nothing uses, and the line under the folder chips shows how much space the library takes and how much is free on the hub.

A file that is in use cannot be deleted, but it can be **replaced**: the swap button on its tile (or Replace in the viewer) takes a new file of the same type and puts it in place under the same name, so every screen and module that shows it keeps working and picks up the new picture on its next paint.

Folders are managed here too: **New folder** makes one (inside the folder you are looking at, or at the top level), and a folder you have opened offers **Rename** and **Delete folder**. Only an empty folder can be deleted. Tick files and pick **Move to** to move them into another folder. Renaming a folder or moving files updates every screen, day rule, module and slideshow that pointed at them, so nothing on the wall goes blank. Use the search box to find a file by name, the sort menu to order by name, newest or largest, **Select all** to tick everything in view, and shift-click to tick a range.

Deleting happens here, one file at a time from the trash button on its tile, or many at once by ticking their boxes. The library page manages files; the Background section has no separate image browser or upload control. A module's media browser and the phone's Photos tab answer to the same rule: files a screen depends on stay put, and so does a slideshow's last picture, and they say why.

---

## Unsplash integration

Unsplash provides access to a library of high-quality, freely usable photographs. A free API key is required.

### Setup

1. Create a free account at [unsplash.com/developers](https://unsplash.com/developers)
2. Create a new application to get an **Access Key**
3. In the editor, go to **Settings > API keys** and paste the key into **Access Key** on the Unsplash card

### Rotation

Unsplash is one of the eight checkboxes inside the Background section's **Sources** card. Save an access key before enabling it; set a search query or collection there. Direct Unsplash/NASA/Immich browsing and one-off picks are no longer part of this Background section.

## NASA Astronomy Picture of the Day

NASA Picture of the Day is a rotation source in the **Sources** card. The old NASA image-search and APOD one-off browser is no longer in the Background section.

### Setup

1. Get a free API key at [api.nasa.gov](https://api.nasa.gov)
2. In the editor, go to **Settings > API keys** and paste it into **API Key** on the NASA card
3. Check **NASA Picture of the Day** in **Sources** and set the interval

NASA publishes a new image daily, so shorter rotation intervals check for updates but cannot produce a new APOD picture more often.

---

## Immich integration

[Immich](https://immich.app) is a self-hosted Google Photos alternative. When configured, you can use Immich as a source for background rotation.

### Setup

1. Install and configure an Immich server on your network
2. In Immich, go to **Account Settings → API Keys** and generate a new key
3. In the editor, go to **Settings > API keys** and fill in **Server URL** (e.g. `http://192.168.1.50:2283`) and **API Key** on the Immich card

### Rotation

Check **Immich** inside **Sources**, then optionally filter by album, person, or favorites. The former one-off browser is no longer in the Background section.

---

## iCloud shared albums

iCloud shared albums work without an Apple account or API key, all you need is the album's public link.

### Getting a shared album link

1. In Apple Photos, open (or create) a shared album
2. In the album's settings, turn on **Public Website**
3. Copy the link (it looks like `https://www.icloud.com/sharedalbum/#B0abc...`)

### Using it

- **As a rotation source**: deselect any module, open the **Background** section, check **iCloud Shared Album** in **Sources**, and paste the link. The display loads photos straight from Apple's servers. Only still photos are used; any videos in the album are skipped.
- **Importing into your library**: use **Import from an iCloud link** to download everything a link contains into the selected folder. That button lives in the media library browser, which opens from the settings of an Image, Video, Photo slideshow, or Full-screen photo module, not from the Background section. This also works with one-off "Copy iCloud Link" photo links, which expire after about 30 days; importing keeps the photos even after the link dies.

---

## Google Photos

Google no longer lets apps read your photo library directly, but it does let you hand-pick photos to share, so Home Screens brings them in as an import. You choose photos in Google Photos itself, and they download into your library's `google-photos` folder as ordinary local files. After that, no Google connection is needed to display them: they keep working even if you disconnect. Re-running an import only downloads photos you haven't imported before.

### Importing photos

Nothing to set up first: Home Screens brings its own Google app.

1. Select a Photo Slideshow, or a Full-Screen Photo Viewer in slideshow mode, with its source set to **Local Photos**. Under the folder picker, click **Sign in with Google**
2. A Google tab opens. Pick your account and approve; the tab comes straight back to your hub, says Google Photos is connected, and the editor moves on by itself. If your hub lives on a public web address, you land on a Home Screens page with a code instead: click **Didn't come back? Paste a code** in the editor, paste it, and click **Finish sign-in**
3. Click **Choose photos**: Google Photos opens with its own photo picker
4. Pick the photos you want and confirm; the import starts on its own and shows progress as it saves

Home Screens only ever sees the photos you pick; the permission it asks for cannot read the rest of your library. The sign-in passes through Home Screens' helper at auth.homescreens.dev, which adds the app's password on the way and keeps nothing; the photos themselves download straight from Google to your hub. The [privacy policy](/privacy) has the details.

When it finishes, the module automatically points at the `google-photos` folder. To add more photos later, run the import again and pick more, existing photos are skipped, new ones are added.

Photos are saved as high-quality display-sized copies (up to 4096 pixels on the long edge), which keeps imports fast and light on the SD card. Imports are capped at 2000 photos at a time.

### Use your own Google app

If you would rather run your own Google Cloud project, open **Settings > API keys**, expand **Use your own Google app** on the Google card, and fill in the **Photos Import** fields with a credential made like this. It is a different type from the Google Calendar one, so you need both if you use your own app for both:

1. In [Google Cloud console](https://console.cloud.google.com/apis/credentials) (the same project you may already use for Google Calendar), go to **APIs & Services > Credentials** and create an **OAuth client ID** with the type **Web application**
2. Under **Authorized redirect URIs**, add exactly `https://homescreens.dev/connect/google` (leave **Authorized JavaScript origins** empty)
3. In the **API Library**, search for **Google Photos Picker API** and enable it
4. If you have not done so for the calendar, open **Google Auth Platform > Audience** and click **Publish app**. Until you do, only accounts you list there as test users can sign in, and Google ends every sign-in after 7 days. When you sign in afterwards, Google may say it hasn't verified the app. It is your own app, so choose **Advanced** and carry on.
5. Paste the new client ID and secret into those fields

With your own app the steps are the same, except that you click **Import from Google Photos** first and then **Sign in with Google**. After you approve, Google sends you to a page at homescreens.dev, which passes you straight back to your hub, or shows a code to paste if your hub lives on a public web address. That page is just a message board: it never sees your password, your secret, or your photos.

To go back to Home Screens' app later, flip the switch next to **Use your own Google app** off on the API keys page. Your details stay saved, and the next import signs in with Google again. The switch covers Google Calendar too, so sign in again on **Settings > Calendar** if your calendar used your own app.

---

## Background rotation

Auto-rotation periodically replaces the screen background with a bundled theme, color, or pattern wall, or an image from Unsplash, NASA APOD, Immich, an iCloud shared album, or a local library folder.

### Enabling rotation

1. Click an empty part of the canvas to deselect any module
2. Open the **Background** section in the right sidebar
3. In **Sources**, check any combination of **Match a full-screen theme**, **Colors**, **Patterns**, **Unsplash**, **NASA Picture of the Day**, **Immich**, **iCloud Shared Album**, and **Local library folder**
4. Configure each checked source (included bundled walls, query or collections, album/person filters, shared album link, or local folder) as needed
5. Set **Rotate every** and optionally use **Refresh now**

Unsplash, NASA, and Immich require credentials from **Settings > API keys**; their checkboxes are disabled until those keys are set. The three bundled groups, iCloud, and Local library folder need no key. **Shade** applies to both static walls and rotating photos.

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

Every minute the wall asks the Pi whether it is time for a new background. When the interval has passed, the Pi chooses one from the selected sources and the wall switches to it. Remote images are saved into the library; bundled walls are served from the installed catalog.

- **Bundled wall rotation** chooses a wall from each checked group. The theme group includes every full-screen theme wall unless you exclude individual tiles; it does not follow the currently selected theme.
- **Unsplash rotation** fetches a random portrait photo matching the configured query. Download tracking is triggered per the Unsplash API terms.
- **NASA APOD rotation** fetches the current Astronomy Picture of the Day. Since NASA publishes one new image per day, the display checks for updates at the chosen interval but the image only changes once daily.
- **Immich rotation** fetches a random photo from your Immich library, optionally filtered by album, person, or favorites. The server caches Immich filter parameters so changing your album or person selection immediately busts the cache and fetches a fresh photo.
- **Local library folder rotation** cycles through images in the selected folder.
- **iCloud rotation** fetches a random photo from the shared album. Only still photos are used, so any videos in the album are skipped and an album that's mostly video will cycle through a much smaller pool than you'd expect. Album contents are cached briefly, so new photos added to the album show up within a few minutes.

If a fetch fails (network error, API limit), the previous background is kept until the next successful rotation.

### Housekeeping

Rotated images are tidied up on their own: only the ones screens are currently using, plus the eight most recent, are kept. Your own uploads and imports are never touched.

### Rotation and manual backgrounds

While rotation is on it replaces whatever fixed background the screen had. Picking a bundled static wall or None in Sources switches rotation off for that screen so your choice stays.

---

## Supported formats and recommended dimensions

### Supported image formats

| Format | Extension | MIME Type |
|---|---|---|
| JPEG | `.jpg`, `.jpeg`, `.jfif`, `.pjpeg`, `.pjp` | `image/jpeg` |
| PNG | `.png` | `image/png` |
| WebP | `.webp` | `image/webp` |
| GIF | `.gif` | `image/gif` |
| AVIF | `.avif` | `image/avif` |
| SVG | `.svg` (needs a `viewBox`, or a width and height) | `image/svg+xml` |

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
- For developers: the per-screen fields are in the [Configuration reference](/docs/configuration#screen) and the endpoints under [All endpoints](/docs/api#all-endpoints) in the API reference
