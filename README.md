# VideoGrabber

A Chrome extension that pops any video on the current page into a native, always-on-top
Picture-in-Picture window — on any site, not just YouTube.

## What it does

- Scans the current page (including embedded iframes) for `<video>` elements.
- Lets you toggle Picture-in-Picture on any of them with one click.
- Uses the browser's built-in [Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API)
  — the same mechanism Chrome's own right-click "Picture in Picture" menu item uses. Nothing is
  downloaded, extracted, or decrypted; it just floats the video element that's already playing in
  your browser.

Because it doesn't touch the underlying video stream at all, this works the same regardless of
whether the video is DRM-protected or not — PiP operates on the rendered `<video>` element, not
the source data.

## Installation (Developer Mode)

1. Open `chrome://extensions/` (works the same in any Chromium browser — Brave, Edge, etc.)
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `VideoGrabber` folder.
4. Pin the extension for easy access.

## Usage

1. Open a page with video and start it playing.
2. Click the VideoGrabber icon.
3. Click **Pop into Picture-in-Picture** on the video you want floated. Click the refresh icon if
   a video you expect isn't listed (some players load lazily).
4. The video keeps playing in its floating window while you browse other tabs or apps. Click
   **Exit Picture-in-Picture** in the popup, or use the floating window's own close button, to end
   it.

## Volume control

Each video in the popup has a volume slider, so you can adjust it without needing to find the
player's own controls. Note this only reaches the extension's popup — the browser's native PiP
window itself doesn't expose a volume control, so you'll need to reopen the popup to adjust it
after the video is already floating.

## Keeping video playing when you switch tabs

Some sites (Instagram is a notable example) deliberately pause video when the tab loses focus, to
save bandwidth — regardless of Picture-in-Picture, since that's a separate mechanism from tab
visibility. Rather than trying to prevent the site's pause logic (which varies a lot between
sites — visibility API, scroll-based IntersectionObserver, focus events, etc.), VideoGrabber takes
the more reliable approach of fighting the outcome: while a video is floating, if the site pauses
it while the tab is hidden, VideoGrabber immediately resumes it. This works regardless of which
mechanism the site used to decide to pause.

## Why some videos say "Picture-in-Picture unavailable"

A site can opt a video out of Picture-in-Picture (the `disablePictureInPicture` attribute), or PiP
can be disabled system-wide by an enterprise policy. VideoGrabber respects that rather than trying
to force it.

## Permissions

- `<all_urls>` (host permission) + `scripting` — needed to detect and trigger Picture-in-Picture
  on any site. The trigger runs via `chrome.scripting.executeScript` invoked directly from the
  popup button click, since Picture-in-Picture requires a live user gesture that a background
  message alone wouldn't carry.
- `activeTab` — to know which tab to act on.

No `downloads`, `webRequest`, or `storage` permissions are used — the extension doesn't persist or
transmit anything.
