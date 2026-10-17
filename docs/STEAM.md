# Steam wrapper spike: Tauri 2 (go/no-go notes)

Status: research only, 2026-10-18 (overnight run #3, B4). No toolchain was installed and none was found (`cargo` and
`rustc` are not on this machine), so there is no scaffold. Nothing here is a decision; the three questions at the end
are Edward's. Anything marked UNVERIFIED was not confirmed by a source or a test.

## What the game needs from a wrapper

No Wukkas Café is a static Vite build (`dist/`: about 1.1 MB of JS before gzip, fonts; release builds carry no audio
until licensed clips exist): Three.js/WebGL, one Web Audio `AudioContext` resumed in the first gesture
(`src/audio/manager.ts`), browser speech as the voice fallback (`src/audio/voice.ts`), keyboard + mouse + touch input
(`src/app/input.ts`), and two localStorage keys: the save `nwc.save.v2` and the playtest log `nwc.telemetry.v1`. No
backend; the only fetches are its own static assets.

## Tauri 2 in one paragraph

Tauri wraps the web build in the operating system's own web view: WebView2 (Chromium) on Windows, WKWebView on macOS,
WebKitGTK on Linux (a native Linux build is what a Steam Deck would run). The app is a small Rust binary with no
bundled browser, so downloads are small, but the page runs on a different engine per platform.

## Findings

| Topic | Windows (WebView2) | Linux / Steam Deck (WebKitGTK) | Risk for this game |
|---|---|---|---|
| Build requirements | Microsoft C++ Build Tools (VS 2022 Build Tools: "C++ build tools" + Windows SDK), the WebView2 runtime (already on Windows 10 1803+ and 11), Rust; MSI bundles need the VBSCRIPT feature [1][2] | WebKitGTK 4.1 (Tauri 2 moved to it, partly for Flatpak) [3] | Low: a Windows build needs a Windows machine or CI runner |
| Web Audio unlock | Chromium's rule: an `AudioContext` made without a gesture stays suspended until `resume()` in a click [4]. The game already resumes it in the Start click. Wry has an autoplay switch, on by default [5], and Tauri's runtime exposes a permission handler that covers autoplay [6]; how both map to WebView2 is UNVERIFIED | WebKit's rules; UNVERIFIED in WebKitGTK | Low: the gesture unlock shipped for iOS Safari is what every engine needs |
| Browser speech fallback | voices available to WebView2: UNVERIFIED | `speechSynthesis` in WebKitGTK: UNVERIFIED (may be absent) | Medium until licensed clips ship: the fallback may be silent. `npm run release:check` already refuses placeholder voices |
| Save path | localStorage lives in the WebView2 user-data folder (`EBWebView` by default) [7]; one Tauri app moved off web-view localStorage after cache purges and a 5 MB quota [8] | WebKitGTK's data directory: UNVERIFIED | Medium: Steam Cloud needs a known file. The official store plugin writes a file in the app's data directory [9] |
| WebGL | Chromium's WebGL, as in Chrome | Tauri's docs: WebKitGTK problems mostly on NVIDIA (the DMABUF renderer); WebGL can fall back silently to a slow software path whose renderer string is masked [10]. Anecdote: WebGL in Chrome on a Deck much slower than on an M1 Mac mini [11] | High for the Deck: AGENTS.md §7 wants ≥ 30 fps on a mid-range phone, and the Deck's web view is untested |
| Controller | Gamepad API in Chromium (standard Xbox mapping) [12]; in WebView2 UNVERIFIED | WebKitGTK gained Linux gamepad support, later proposed on by default through libmanette (2020) [13][14]; today's state UNVERIFIED | Medium: the game has no gamepad code. Steam Input can map the Deck to keys and mouse without any (below) |
| Steamworks (achievements, overlay, Cloud) | not built in: a Rust plugin or FFI to the Steamworks SDK, exposed through Tauri commands [15]; Electron games use steamworks.js [16] | same | Medium: Rust work, not web work |

Electron is the comparison point: it bundles its own Chromium, so WebGL and audio behave alike on every platform [17],
at the cost of a much larger download.

## A Steam Deck input map (Steam Input layout, no game code)

The game is keyboard and mouse first; every binding below exists today (`src/app/input.ts`, `src/app/rushWiring.ts`).

| Deck control | Sends | In the game |
|---|---|---|
| Right trackpad | mouse movement | aim the cup, steam depth, pour |
| R2 | left mouse button (held) | grind, steam, pour, hot water |
| A | Space | the station's main action |
| R1 | Enter | next step / ring up / take the order |
| Y | T | take the order |
| X | R | replay the last line |
| L1 | F | make the oldest ticket |
| D-pad up / down | W / S | jug height |
| D-pad left | B | bin the drink |
| D-pad right | I | shoo the bin chicken |
| Back buttons | 1 / 2 | serve the first / second ticket (1–6 on the keyboard) |
| Start | Escape | pause |
| Touchscreen | touch | the HUD buttons (the phone layout works at 390 px) |

## Questions for Edward

1. Is Steam a target for the first release, or a later port? (If later: ship the web build first and revisit after
   the Phase 5 playtest.)
2. Which wrapper risk is acceptable: Tauri (small download, a different engine per platform, WebGL on the Deck
   unproven) or Electron (one engine everywhere, a download of 100 MB or more)? A day on a real Steam Deck with the
   current build in its desktop browser would settle the WebGL question before either.
3. Steam features for v1: none, achievements only, or Steam Cloud saves too? (Cloud saves need the save moved from
   localStorage to a file, e.g. the store plugin, read through the same `migrate()` as today's save:
   version 3 under the `nwc.save.v2` key.)

## Sources

1. Tauri 2 prerequisites: https://v2.tauri.app/start/prerequisites/
2. Tauri 1 prerequisites (Build Tools workloads): https://v1.tauri.app/v1/guides/getting-started/prerequisites
3. Tauri 2.0 alpha 3 (webkit2gtk-4.1): https://v2.tauri.app/blog/tauri-2-0-0-alpha-3/
4. Chromium autoplay policy: https://www.chromium.org/audio-video/autoplay
5. Wry 0.27.2 release notes (autoplay attribute): https://v2.tauri.app/release/wry/v0.27.2/
6. tauri-runtime 2.12.0 release notes (permission handler): https://v2.tauri.app/release/tauri-runtime/v2.12.0/
7. WebView2Feedback #2023 (the EBWebView user-data folder): https://github.com/MicrosoftEdge/WebView2Feedback/issues/2023
8. Migrating from localStorage to native fs in Tauri: https://dev.to/rakkunn/migrating-from-localstorage-to-native-fs-in-tauri-repo-rter-v041-technical-deep-dive-5hja
9. Tauri 2 store plugin: https://v2.tauri.app/plugin/store/
10. Tauri 2, Linux graphics issues: https://v2.tauri.app/develop/debug/linux-graphics/
11. Babylon.js forum, Steam Deck (Linux) and Chrome performance: https://forum.babylonjs.com/t/steam-deck-linux-and-chrome-performance/47555
12. web.dev, the Gamepad API: https://web.dev/articles/gamepad
13. webkit-gtk list (2017), gamepad support: https://lists.webkit.org/pipermail/webkit-gtk/2017-October/003160.html
14. webkit-gtk list (2020), enabling gamepad support by default: https://lists.webkit.org/pipermail/webkit-gtk/2020-October/003641.html
15. GDevelop forum, Steam achievements with Tauri: https://forum.gdevelop.io/t/implementing-steam-achievements-with-tauri/73202
16. A three.js game on Steam (steamworks.js): https://www.summerengine.com/make-great-games/threejs-game-on-steam
17. Tauri vs Capacitor and Electron for games: https://www.abratabia.com/native-wrappers/tauri-vs-capacitor.php
