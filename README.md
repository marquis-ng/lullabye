# lullabye

Keeps your screen awake. Open [lullabye.pages.dev](https://lullabye.pages.dev) and leave the tab open. The page is just black, with no sounds or notifications.

- Uses the [Screen Wake Lock API](https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API) and requests the lock again whenever the browser releases it.
- Also plays a tiny muted video, for browsers without the Wake Lock API such as Safari before iOS 16.4.
- If the screen is not being kept awake, the page says so. Click or tap anywhere to retry. No text means it's working.
- Double-click to toggle fullscreen.
- The cursor is hidden.

## Activity log

lullabye logs input while you're away: every stretch of mouse movement, clicks, key presses and scrolling, plus every time the page is opened. Long-press anywhere for a second to show or hide the log. It's kept in your browser's local storage and can't be cleared from the page.

The log tells you if someone used your computer. It doesn't stop them. Lock your computer if that matters.

## Development

There is no build step. `index.html` is the whole site.

`blank.mp4` is the fallback video: one second of black at 176×144, written byte by byte by `node gen.js`.
