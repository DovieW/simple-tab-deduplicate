# Simple Tab Deduplicate

A zero-build Chrome (MV3) extension that highlights duplicate tabs, lets you decide how to handle them, and closes the extras with confidence. The popup reflects real-time stats so you always know how many duplicates exist per set and how many tabs can be reclaimed.

## Highlights

- 🧮 **Live transparency** – total tabs scanned, duplicate set counts, and potential closures update instantly.
- 🎯 **Granular control** – choose between all windows or just the current window, decide whether to keep the oldest or newest instance, and optionally include pinned tabs or ignore query strings.
- 👀 **Clear previews** – every duplicate set shows the exact tabs involved, which one will be kept based on your strategy, and quick actions to close a single set without affecting the rest.
- ⚡ **No build step** – pure HTML/CSS/JS with Manifest V3 service worker. Just load the folder into Chrome and go.
- ⌨️ **Keyboard shortcut ready** – `Ctrl+Shift+Y` (customisable in Chrome) runs your saved dedupe preferences without opening the popup.

## Getting started

1. Clone or download this repository.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**.
3. Select the project folder. The extension icon should appear in your toolbar.

### Using the popup

1. Click the extension icon to open the popup.
2. Adjust the controls:
	- **Scope** – all windows vs. only the current one.
	- **Keeper** – keep the oldest (least recently focused) or the most recent duplicate.
	- **Include pinned / Ignore query strings** – optional toggles.
3. Review the duplicate sets. Each card displays:
	- Hostname + total tabs in the set.
	- The tab that will be kept (highlighted) given your strategy.
	- Window/index metadata, last active times, and handy badges (Active, Pinned, Audio, Sleeping).
4. Close everything at once with **Close duplicates** or handle a single set via its **Close extras** button.

### Keyboard shortcut

The command `Ctrl+Shift+Y` (or your custom binding) runs deduplication in the background using your saved settings and briefly shows how many tabs were closed on the extension badge.

## Project structure

```
manifest.json        # MV3 configuration + permissions + commands
popup.html/css/js    # UI for scanning and acting on duplicates
scripts/tabTools.js  # Shared logic for querying tabs, grouping, and closing duplicates
background.js        # Service worker that powers the keyboard shortcut
icons/               # Minimal PNG icons used by Chrome
```

No bundlers, build tools, or dependencies are required at runtime. Icons were generated via a temporary Python virtual environment solely for asset creation.

## Development tips

- The popup and service worker share the same helper functions, so updates to dedupe logic should happen in `scripts/tabTools.js`.
- If you add new permissions or host permissions, remember to reload the extension from `chrome://extensions`.
- Chrome groups tabs by normalized URL (scheme + host + path + optional query). Hash fragments are ignored.

Have fun reclaiming your focus, one tidy tab strip at a time!
