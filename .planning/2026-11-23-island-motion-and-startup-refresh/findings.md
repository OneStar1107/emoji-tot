# Findings & Decisions

## Requirements

- Island compact/expanded sizes are 126×36 and 300×132 with radii 18 and 38.
- Width, height, and radius must share one spring and support velocity-preserving reversal.
- The character must not drift during shell scaling; no ghost shell or asymmetric corners.
- Liquid Glass should be quieter and closer to Apple system glass.
- Devices and weather should be useful immediately on launch.
- Weather auto-location must default on and the visible 香港 fallback removed.
- User-facing installer naming should not expose `Setup.0.8.18.exe`.
- About must link to GitHub, show current/latest state, and prompt only optionally.
- The island must not vanish for about two seconds during screenshots or app switches.

## Research Findings

- Published baseline is tag `v0.8.18.13` at commit `6916ae6e8ffac064e84186b065af9828378b1172`.
- GraphFlow call succeeded structurally but returned no summary or anchors, so targeted source reads are required.
- Screenshot evidence confirms an initially empty device list that later populates, plus a visible `香港` weather value.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| One analytic damped-spring state | It keeps width, height, and radius synchronized and can inherit current velocity on target reversal. |
| Anchor the character to compact geometry | Shell bounds animation must not perturb the character’s transform origin. |
| Warm service data before first settings render | Startup users should not see a transient false-empty state. |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| GraphFlow payload absent | Proceeding with direct targeted reads. |
| Initial planning files landed in repository root | Deleted only newly created files, then initialized a named plan. |

## Resources

- Repository: https://github.com/OneStar1107/emoji-tot
- Current Release: https://github.com/OneStar1107/emoji-tot/releases/tag/v0.8.18.13
- `apps/desktop/src/renderer/island.js`
- `apps/desktop/src/renderer/island.css`
- `apps/desktop/src/main/island.js`
- `apps/desktop/src/main/services/devices.js`
- `apps/desktop/src/main/services/weather.js`
- `apps/desktop/src/renderer/settings.js`

## Visual/Browser Findings

- The ghost is an additional visible outline around the resizing shell, not merely subpixel antialiasing.
- Left-side corners and the lower-left corner deviate from the right side, indicating asymmetric geometry or stale layer compositing.
- Device warm-up took minutes in the captured session, so a simple first-paint delay is insufficient.

## Current Implementation Evidence

- `island.js` currently uses `MORPH_OPEN` / `MORPH_CLOSE` with separate width and height durations plus delays, a separate `cornerMs`, a separate opacity track, and a normalized spring stretched to `SPRING_SETTLE_MS = 420`.
- `paintMorph()` applies a non-uniform `scale(scaleX, scaleY)` to `.panel`, then counter-scales and horizontally shifts `.panel-body`; this transform stack is the direct cause of character drift.
- The same function calls `reportHit()` during the morph but does not resize the native Electron window until `settleMorph()`. The window is too small while the panel expands, which clips composited layers and can leave the observed gray shadow/ghost and malformed corners.
- `.panel` has a layered translucent surface plus a comparatively broad outer shadow. Scaling that layer during an ongoing window resize creates unstable compositor edges.
- Device discovery is a resident PowerShell probe. Its first full `Get-CimInstance Win32_PnPEntity` enumeration can stall for about a minute on a cold WMI service; the resident child has no first-output watchdog, so the settings page can remain falsely empty.
- Weather already defaults `autoLocate` to `true`, but the visible `weather.city` value is `香港`, the first request starts late in boot, and cold-cache callers can issue duplicate probes.
- Fullscreen avoidance reacts to the first `1` sample. A screenshot/snipping overlay can therefore hide the island for one two-second sample.
- The About page already exposes a GitHub link, but its dependency rows still label `@emojitot/core` and `@emojitot/protocol` as MIT; the update prompt has no release checker.

## Final Root Causes

- The open handler installed the morph CSS before measuring the resting panel. That made `.panel-body` absolute, removed it from flow, and collapsed the measured panel height to about 32px. The native window therefore widened without growing tall enough, clipping the lower card and making every compositing edge more visible.
- The old transform stack disagreed with window movement: the OS window changes local coordinates while it grows around the screen centre. Measuring viewport-local character positions produced false drift; screen-absolute measurements show drift of only 0.02px after the fix.
- The reduced-motion path called the morph settle routine even though no spring existed. `settleMorph()` read `morph = null` as "was closed" and hid the panel while `data-open` remained true.
- The UI audit treated content below an intentional `overflow-y:auto` viewport as clipped by its parent card. Scroll containers are now an explicit audit boundary.

## Verified Runtime Evidence

- Packaged smoke: 12/12 checks passed; screen-space character drift 0.02px / 0px, corner spread 0px, first spring frame already had the final 484x374 native window.
- Default UI audit: 26/26 pages, 0 violations.
- Five-skin 140% stress audit: 55 island pages and 15 settings pages, 0 violations.
- Device probe measured on this machine: list phase 0.5s, battery phase 3.7s, 19 raw rows; no WMI minute-long stall.
