---
title: Photos and backgrounds
nextjs:
  metadata:
    title: Photos and backgrounds
    description: Put your own photos on the wall and behind every screen. Upload, import from Google Photos or an iCloud shared album, pick from Immich, Unsplash and NASA, and rotate backgrounds on a schedule.
    alternates:
      canonical: /docs/backgrounds
---

Each screen can have its own background, and your photos can fill a whole screen as a slideshow. Upload your own pictures, import them from Google Photos or an iCloud shared album, pick from Immich, Unsplash and NASA in the editor, or let the background change on its own every few hours. {% .lead %}

Photos and backgrounds share one library on the Pi. Anything you upload or import from a photo module is available as a background, and anything you set as a background can be shown by the **Photo Slideshow** and **Full-Screen Photo Viewer** modules. From a phone, the family remote's **Photos** tab uploads into the same library.

{% callout type="note" title="Finding the Background section" %}
The **Background** section appears in the editor's right sidebar only when no module is selected. If you can't find it, click an empty part of the canvas first to deselect whatever module you were editing. Every procedure on this page assumes you've done that.
{% /callout %}

---

## Choosing a picture: the Image Library {% #image-library %}

Every place that takes one picture opens the same window, the **Image Library**: a screen's background, the Image module, a Countdown event's picture, the Full-Screen Photo Viewer's single photo, and a calendar day rule's picture. Its tabs are the places a picture can come from:

- **Built-in**: the pictures that ship with Home Screens. Only a screen background and a day rule have this tab, and it comes first.
- **Local**: your own library on the Pi, folder by folder, with **Upload Photos**, **Add from an iCloud link** and **Add from Google Photos**.
- **Immich**, **Unsplash** and **NASA**: browse them right here.

Each tab works the same way: collections down the side (folders, albums, ideas), pictures in the middle, and you click one to choose it, then **Select Image**. A tab whose service isn't set up yet still shows, with a small lock and a line pointing to **Settings > API keys**.

A picture from Immich, Unsplash or NASA is copied into your library, into a folder named after where it came from (`immich`, `unsplash`, `nasa`), so the wall never needs that service to be up to show it. Picking the same picture again uses the copy you already have.

---

## Backgrounds that come with Home Screens

The **Built-in** tab, when you choose a screen's background, holds a set of walls that need no key and no upload. They are tiny drawings rather than photos, so they look sharp on any display, portrait or landscape. They come in three groups down the side:

- **Theme walls**: one wall for each of the twelve full-screen themes, painted from the same colors the theme uses. Give a regular screen this wall and it sits next to a full-screen calendar or weather screen without a visible change of color. The theme your display uses (from **Settings > Screen**, or the display's own override) is listed first and marked "in use".
- **Colors**: eighteen gradients, from deep and moody (Midnight, Ember, Ink) to soft and light (Cloud, Sand, Sage, Blush).
- **Patterns**: four quiet textures (Dots, Grid, Diagonal, and a light Paper) for a wall with a little texture behind your modules.

Pick one and click **Select Image** to use it. If auto-rotation was on for the screen, it is switched off so your choice stays.

---

## Setting a static background

To set a background in the editor:

1. Select the screen you want to customize using the **Screen Tabs** at the top
2. Click an empty part of the canvas to deselect any module
3. Open the **Background** section in the right sidebar. **Picture** shows the screen's background now and where it lives
4. Click **Choose a picture**, find one on any tab, and click **Select Image**
5. Click **None** to remove the background

The picture fills the whole screen without being stretched; a landscape photo on a portrait wall is cropped at the sides.

---

## Shading a background

A bright photo can make light text hard to read. In the **Background** section, switch on **Shade background** to lay a soft shade over the picture:

- **Style**: **Even** puts the same shade over the whole picture. **Top and bottom** shades a band along the top and the bottom and leaves the middle clear. **Edges** fades in toward every edge, like an old photo. **Both** combines the top and bottom bands with the edges.
- **Strength**: how strong the shade is, 40% to start with
- **Color**: black to start with; any color works, for a warm or tinted shade

Each screen has its own shade, and the editor shows it exactly as the wall will.

## Adjusting the picture

Next to the shade, under **Background effects**, four sliders adjust the picture itself: **Brightness**, **Contrast**, **Saturation** and **Warmth**. Brightness, contrast and saturation run from 0 to 200%, with 100% leaving the picture as it is; warmth runs from cool to warm, with 0 adding no tint. **Reset** beside a slider puts that one back. The adjustments touch only the picture, never the modules over it, and the editor shows them exactly as the wall will.

---

## Uploading custom images

1. Click **Choose a picture** in the **Background** section (or open the Image Library from any module that takes a picture)
2. Switch to the **Local** tab and pick the folder to upload into
3. Click **Upload Photos** and select one or more files from your computer
4. Click the new picture, then **Select Image**

To upload many pictures at once, or drag files in, use **Settings > Pictures & videos** (see [Managing your library](#managing-your-library)). Videos go into the same library and are used by the Video module and slideshows; a screen background is always a still picture.

### Constraints

- **Maximum file size:** 10 MB per image, 200 MB per video
- **Allowed types:** JPEG, PNG, WebP, GIF, AVIF, SVG images; MP4, WebM, MOV videos (used by the Video module and mixed-media slideshows)
- Filenames are sanitized on upload, special characters are replaced with underscores

---

## Folders

The Image Library's **Local** tab lists every folder in your library, and its imports (an iCloud link, Google Photos) and uploads go into the folder you have selected. Pictures copied from Immich, Unsplash and NASA land in their own `immich`, `unsplash` and `nasa` folders, next to `google-photos` and `icloud-imports`.

---

## Managing your library

Every picture and video you upload lands in one shared library, and **Settings > Pictures & videos** shows all of it: thumbnails with each picture's resolution and every file's size, a type tag (JPG, SVG, MP4), folder filters, and a switch between images and videos. Videos show their first frame. The grid loads small copies of each picture (kept under `data/thumbnails`, rebuilt on demand, never backed up), so a big library opens quickly; opening a picture shows the original. Click any tile to see it full size, or to play a video, and use the arrow keys to step through the rest.

Files a screen depends on can't be deleted. If a screen background, a calendar day picture or a single-photo module points at a file, it wears an **In use** badge (hover the badge, or open the file, to see where it's used), and delete leaves it alone. Pictures a slideshow plays, or a rotating background picks from, wear a green **Slideshow** badge instead: they can be deleted or moved like any other file, and the slideshow carries on with the rest. Only its last picture is kept, so cleaning up can never leave a screen blank.

To add files, open the upload panel and drop in as many pictures or videos as you like, choosing which folder they land in. **Add from an iCloud link** and **Add from Google Photos** sit next to it and work the same way: each opens a panel with a **Save into** folder, which starts at the folder you are looking at. The built-in starter pictures for backgrounds and calendar day looks are not part of this library: they ship with Home Screens and refresh on upgrades. Backgrounds that rotate on their own and are downloaded for it (from Immich, iCloud, OneDrive, Unsplash or NASA) are managed by the rotation and are not listed here; their file names start with `rotation-`, and an upload with such a name is turned away so it cannot be mistaken for one.

If something on a screen points at a file that is no longer in the library, the page says so at the top, with a link that opens the editor on that screen. The where-used lines under an **In use** badge open the editor the same way. The **Unused only** chip shows just the files nothing uses, and the line under the folder chips shows how much space the library takes and how much is free on the hub.

A file that is in use cannot be deleted, but it can be **replaced**: the swap button on its tile (or Replace in the viewer) takes a new file of the same type and puts it in place under the same name, so every screen and module that shows it keeps working and picks up the new picture on its next paint.

Folders are managed here too: **New folder** makes one (inside the folder you are looking at, or at the top level), and a folder you have opened offers **Rename** and **Delete folder**. Only an empty folder can be deleted. Tick files and pick **Move to** to move them into another folder. Renaming a folder or moving files updates every screen, day rule, module and slideshow that pointed at them, so nothing on the wall goes blank. Use the search box to find a file by name, the sort menu to order by name, newest or largest, **Select all** to tick everything in view, and shift-click to tick a range.

Deleting happens here, one file at a time from the trash button on its tile, or many at once by ticking their boxes. The Image Library's Local tab and the phone's Photos tab answer to the same rule: files a screen depends on stay put, and so does a slideshow's last picture, and they say why.

---

## Unsplash integration

Unsplash provides access to a library of high-quality, freely usable photographs. A free API key is required.

### Setup

1. Create a free account at [unsplash.com/developers](https://unsplash.com/developers)
2. Create a new application to get an **Access Key**
3. In the editor, go to **Settings > API keys** and paste the key into **Access Key** on the Unsplash card

### Choosing a photo

1. Open the Image Library (for a background: **Choose a picture** in the **Background** section) and switch to the **Unsplash** tab
2. Click an idea on the left (Nature, Mountains, Ocean, Forest, Sky, Space, City, Flowers, Seasons, Holidays, Birthday, Abstract), or type your own words in the search box
3. Click a photo, check the photographer's name at the bottom, and click **Select Image**. **Show more** loads the next 30

The photo is saved into your library's `unsplash` folder, up to 2560 pixels wide, and the wall shows that copy, so Unsplash is never contacted again for it. When you are choosing a screen's background, searches ask for photos shaped like your display.

Unsplash can also feed a Photo Slideshow or Full-Screen Photo Viewer directly, and a rotating background: choose **Unsplash** as the **Photo Source** and type the search words. A slideshow shows Unsplash's own photos with each photographer's name in a corner, as Unsplash asks, and takes up to 30 fresh photos an hour.

---

## NASA pictures

NASA offers two image sources, both on the **NASA** tab of the Image Library. Neither needs a key or any setup.

### Picture of the day

**Picture of the day**, at the top of the NASA tab, shows the Astronomy Picture of the Day from [science.nasa.gov](https://science.nasa.gov/apod/), 30 days at a time, newest first; **Show more** goes back another 30. On a day that is a video, its still picture is used. If NASA isn't sending pictures right now, the tab says so; the library search keeps working.

### NASA's library

Under **Search NASA's library**, pick an idea (Nebula, Galaxy, Earth, Mars, Moon, Saturn, Jupiter, Sun, Aurora, Space station) or type your own words.

The picture you select is saved into your library's `nasa` folder. Some archive pictures only come as TIFF files, which a display can't show; those are turned away with a message so you can pick another.

{% callout type="note" title="Image quality" %}
Some NASA images include embedded timestamps, watermarks, or overlay text that cannot be removed. Preview the thumbnail before selecting.
{% /callout %}

As a **Photo Source**, NASA shows the newest pictures of the day in a slideshow, or the newest one as a rotating background.

---

## Immich integration

[Immich](https://immich.app) is a self-hosted Google Photos alternative. When configured, you can pick photos from your Immich library in the Image Library, and use Immich as the photo source for slideshows and rotating backgrounds.

### Setup

1. Install and configure an Immich server on your network
2. In Immich, go to **Account Settings > API Keys** and create a new key (see [which boxes to tick](#immich-key) below)
3. In the editor, go to **Settings > API keys** and fill in **Server URL** (e.g. `http://192.168.1.50:2283`) and **API Key** on the Immich card

### Which boxes to tick on the key {% #immich-key %}

A key with every permission works. If you would rather give Home Screens only what it uses, tick these:

| Permission | What it is for |
|---|---|
| `asset.read` | Finding your photos |
| `asset.view` | Showing pictures and playing videos |
| `album.read` | Choosing an album |
| `person.read` | Choosing a person |
| `server.about` | Optional. Shows your Immich version in the editor |

A key with only `asset.read` and `asset.view` still puts photos on the wall. Where the album or person list would be, the editor says which box is missing.

### Choosing a photo

1. Open the Image Library (for a background: **Choose a picture** in the **Background** section) and switch to the **Immich** tab
2. Pick **All photos**, **Favorites**, an album, or a person on the left. Only people you have named in Immich are listed
3. Photos show newest first, 60 at a time; **Show more** loads the next 60. Only still pictures are shown
4. Click a photo and then **Select Image**

The photo is copied into your library's `immich` folder, so it keeps showing even if Immich is off. If your key can't see albums or people, a note sits where that list would be and says which box to tick. If Immich can't be reached, the tab says so and offers **Try again**.

---

## iCloud shared albums

iCloud shared albums work without an Apple account or API key, all you need is the album's public link.

### Getting a shared album link

1. In Apple Photos, open (or create) a shared album
2. In the album's settings, turn on **Public Website**
3. Copy the link (it looks like `https://www.icloud.com/sharedalbum/#B0abc...`)

### Using it

- **As a photo source**: in a Photo Slideshow, a Full-Screen Photo Viewer or a screen's rotating background, choose **iCloud shared album** as the **Photo Source** and paste the link. The display loads photos straight from Apple's servers. A rotating background only uses still photos; any videos in the album are skipped.
- **Importing into your library**: **Add from an iCloud link** downloads everything a link contains into a folder. It is on the Image Library's **Local** tab (into the selected folder) and on **Settings > Pictures & videos**. This also works with one-off "Copy iCloud Link" photo links, which expire after about 30 days; importing keeps the photos even after the link dies.

---

## Google Photos

Google no longer lets apps read your photo library directly, but it does let you hand-pick photos to share, so Home Screens brings them in as an import. You choose photos in Google Photos itself, and they download into your library's `google-photos` folder as ordinary local files. After that, no Google connection is needed to display them: they keep working even if you disconnect. Re-running an import only downloads photos you haven't imported before.

### Importing photos

Nothing to set up first: Home Screens brings its own Google app.

1. Select a Photo Slideshow, or a Full-Screen Photo Viewer in slideshow mode, with its **Photo Source** set to **Library folder**. Under the folder, click **Sign in with Google**
2. A Google tab opens. Pick your account and approve; the tab comes straight back to your hub, says Google Photos is connected, and the editor moves on by itself. If your hub lives on a public web address, you land on a Home Screens page with a code instead: click **Didn't come back? Paste a code** in the editor, paste it, and click **Finish sign-in**
3. Click **Choose photos**: Google Photos opens with its own photo picker
4. Pick the photos you want and confirm; the import starts on its own and shows progress as it saves

Home Screens only ever sees the photos you pick; the permission it asks for cannot read the rest of your library. The sign-in passes through Home Screens' helper at auth.homescreens.dev, which adds the app's password on the way and keeps nothing; the photos themselves download straight from Google to your hub. The [privacy policy](/privacy) has the details.

When it finishes, the module automatically points at the `google-photos` folder. To add more photos later, run the import again and pick more, existing photos are skipped, new ones are added.

**Add from Google Photos** does the same from the Image Library's **Local** tab and from **Settings > Pictures & videos**, into the folder you choose there. If you haven't signed in yet, both offer **Sign in to add from Google Photos** right where the button would be.

Photos are saved as high-quality display-sized copies (up to 4096 pixels on the long edge), which keeps imports fast and light on the SD card. Imports are capped at 2000 photos at a time.

### Use your own Google app

If you would rather run your own Google Cloud project, open **Settings > API keys**, expand **Use your own Google app** on the Google card, and fill in the **Photos Import** fields with a credential made like this. It is a different type from the Google Calendar one, so you need both if you use your own app for both:

1. In [Google Cloud console](https://console.cloud.google.com/apis/credentials) (the same project you may already use for Google Calendar), go to **APIs & Services > Credentials** and create an **OAuth client ID** with the type **Web application**
2. Under **Authorized redirect URIs**, add exactly `https://homescreens.dev/connect/google` (leave **Authorized JavaScript origins** empty)
3. In the **API Library**, search for **Google Photos Picker API** and enable it
4. If you have not done so for the calendar, open **Google Auth Platform > Audience** and click **Publish app**. Until you do, only accounts you list there as test users can sign in, and Google ends every sign-in after 7 days. When you sign in afterwards, Google may say it hasn't verified the app. It is your own app, so choose **Advanced** and carry on.
5. Paste the new client ID and secret into those fields

With your own app the steps are the same, except that in a slideshow's settings you click **Import from Google Photos** first and then **Sign in with Google**. After you approve, Google sends you to a page at homescreens.dev, which passes you straight back to your hub, or shows a code to paste if your hub lives on a public web address. That page is just a message board: it never sees your password, your secret, or your photos.

To go back to Home Screens' app later, flip the switch next to **Use your own Google app** off on the API keys page. Your details stay saved, and the next import signs in with Google again. The switch covers Google Calendar too, so sign in again on **Settings > Calendar** if your calendar used your own app.

---

## Background rotation

A rotating background changes the picture behind a screen every so often, drawn from any of the sources you tick under **Sources**: the walls that come with Home Screens, a folder or a few chosen pictures from your library, Immich, an iCloud shared album, a OneDrive folder, Unsplash, or NASA's picture of the day. Tick as many as you like; each change picks one of them.

### Turning it on

1. Click an empty part of the canvas to deselect any module
2. Open the **Background** section in the right sidebar and find **Sources**
3. Tick a source. Its settings open underneath; the chevron on the right hides or shows them
4. Fill in what that source needs. **Colors** and **Patterns** show their walls as tiles: click the ones you want in the rotation. **Library** takes a **Folder**, or switch it to **Pictures** and click the pictures you want. **Immich** takes **Filters** (any of your albums and people, people to leave out, favorites only) or **Pictures** you pick one by one. **iCloud shared album** takes the album's link. **OneDrive** takes a folder. **Unsplash** takes **Search words**, **Collections** or **Pictures** you pick. **NASA picture of the day** needs nothing
5. Set **Rotate every** at the bottom

A source that still needs its key stays greyed out and says where to add it. Until something you ticked can give a picture, the line at the top reads **Fixed background** and **Refresh now** stays off; with exactly one picture picked it reads **Showing one picture** and there is no interval to set.

These are the same source settings the Photo Slideshow and Full-Screen Photo Viewer use, so whatever you can show in a slideshow you can rotate behind a screen. A background is always a still picture, so videos are skipped.

### Interval options

| Interval | Best for |
|---|---|
| 15 minutes | Frequent variety |
| 30 minutes | Moderate rotation |
| 1 hour | Default |
| 2 hours | Balanced |
| 4 hours | Set for you when you tick NASA |
| 8 hours | Minimal changes |

### How it works

Every minute the wall asks the Pi whether it is time for a new background. When the interval has passed, the Pi picks one of the ticked sources at random, fetches a picture from it, and the wall switches to it. A source that answers nothing (an empty folder, a search with no results, a service that is away) passes its turn to the next one; when none can answer, the screen keeps what it has and the sources are left alone for five minutes before they are asked again. **Refresh now** in the editor fetches a new picture straight away, a few seconds apart at most.

- **Colors** and **Patterns** show one of the walls you picked. They are files the wall already has, so nothing is downloaded.
- **Library** picks a different picture from the folder, or from the pictures you chose, each time. It is shown straight from the library, with no copy, and a folder's last picture can't be deleted while a rotation uses it.
- **Unsplash** fetches a random photo matching the search words or from the collections you named, shaped like your display, or one of the photos you picked. Download tracking is triggered per the Unsplash API terms.
- **NASA** fetches the newest Astronomy Picture of the Day. Since NASA publishes one new picture per day, the display checks at the chosen interval but the picture only changes once daily.
- **Immich** fetches a random photo matching the filters (any of the albums ticked, any of the people ticked, none of the people left out, favorites only), or one of the photos you picked. Changing a filter fetches a fresh photo straight away.
- **iCloud** fetches a random photo from the shared album. Only still photos are used, so any videos in the album are skipped and an album that's mostly video will cycle through a much smaller pool than you'd expect. Album contents are cached briefly, so new photos added to the album show up within a few minutes.
- **OneDrive** fetches a random photo from the folder and everything inside it.

### Housekeeping

Downloaded rotation pictures are tidied up on their own: only the ones screens are currently using, plus the eight most recent, are kept. Your own uploads and imports are never touched.

### Rotation and a fixed picture

While a rotation is on it replaces whatever fixed picture the screen had; that picture shows until the first rotating one arrives. Choosing a picture with **Choose a picture** unticks every source for that screen so your choice stays.

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

Portrait-oriented images work best for the default portrait display layout. When you choose a screen's background, Unsplash searches ask for photos shaped like your display for this reason.

---

## Next steps

- [Modules](/docs/modules#media-and-display): the Photo Slideshow and Full-Screen Photo Viewer
- [On your phone](/docs/remote-control): uploading photos from the family remote
- For developers: the per-screen fields are in the [Configuration reference](/docs/configuration#screen) and the endpoints under [All endpoints](/docs/api#all-endpoints) in the API reference
