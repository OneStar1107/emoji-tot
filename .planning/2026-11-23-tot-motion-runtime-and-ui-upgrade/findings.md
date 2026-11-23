# Findings & Decisions

## Requirements
- Study `blessonism/grok-icon-study` and adapt its engineering ideas without copying geometry, art, copy or brand.
- Improve Tot's expressions and character acting with a state machine, spring animation and polygon eyes.
- Apply the design language to Console, Gallery, Scene and Docs.
- Click every control, identify missing behaviour, and repair it.
- Verify text readability in both dark and light themes.

## Research Findings
- Reference repository inspected at commit `b7e6cd48db4eeba13271c653c38e1ad0f48037b4` (2026-08-16).
- Its useful architecture is layered: state tables → pose profiles → eye morph/blink playlist → spring integrator → overlay/FX; the character class only orchestrates those layers.
- Its springs are semi-implicit Euler steps with substepping (`1/120s`), separate stiffness/damping per body part, and target changes rather than direct rendering jumps.
- Its eyes are point polygons of equal vertex count, so two eye expressions can be interpolated and drawn as one changing path. Blink is a fast target sequence through that spring.
- Its web page is a practical control-room layout: a sticky visual specimen, compact telemetry, direct state/shape/colour controls, and explanatory notes. That layout pattern is useful; its actual skin and character geometry are not.
- Current Tot already has 61 expressive faces, a strong editorial visual system, grouped gallery filters and a protocol arbiter.
- Current Tot's live motion is mostly CSS: breathing and blinking live inside the SVG, while spin/bounce/burst are page-specific CSS classes.
- Current Tot's face eyes are discrete SVG primitives (`circle`, `rect`, `path`), so state changes swap drawings rather than morph a shared topology.
- Current Tot's public state vocabulary is strong enough to drive a richer motion profile table without adding new protocol ids.
- Baseline desktop and mobile screenshots are stored under `C:\Users\hyx11\AppData\Local\Temp\emojitot-ui-baseline-20261123`.
- Initial control audit found the visible console behaviours present, but the automation clicked stale drawer nodes after each innerHTML repaint. The final audit must re-query after every change.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Put pure motion data and math in `packages/core/src/motion/` | Lets Node tests validate springs, polygons and transitions without a DOM. |
| Keep the runtime DOM-specific and exported from `@emojitot/core/element` or a new motion entry | Avoids making the package's root import depend on `window`, `HTMLElement` or RAF. |
| Morph only equal-vertex polygons and derive brows/mouths as separate layers | Stable topology is what prevents eye flicker during rapid state changes. |
| Use `linear()` spring easing for DOM chrome and real spring integration for the character | Buttons can feel responsive with compositor-friendly CSS while the character keeps continuous physical state. |
| Add a visible pause/play control to the console stage | Persistent autoplay needs a user-accessible stop mechanism independent of reduced-motion preferences. |
| Use theme tokens and computed contrast checks rather than hard-coded per-page patches | Keeps Dark and Light consistent and catches future regressions. |

## Delivered Architecture
- `packages/core/src/motion/spring.ts` contains deterministic semi-implicit spring stepping and progress helpers.
- `packages/core/src/motion/eyes.ts` defines Tot's original equal-vertex polygon vocabulary and morphing.
- `packages/core/src/motion/state-machine.ts` owns state transitions, interruptions, gaze, blinking and one-shot actions.
- `packages/core/src/motion/profiles.ts` maps the existing 61 public expressions to posture, eye, mouth and spring profiles without adding protocol ids.
- `packages/core/src/runtime.ts` is the DOM-only browser layer with RAF control, pointer gaze, cleanup and reduced-motion handling.
- Console uses one live runtime; Gallery and Scene mount only visible specimens or the active lightbox/arbiter, keeping the 61-still-grid path lightweight.
- Console, Gallery, Scene and Docs share the same semantic state colours, editorial typography, surface tokens and motion language.

## Final Verification
- `pnpm check` passed all gates, including 415 desktop tests, 34 protocol tests, 27 core tests, 32/32 Gallery browser contracts and 24/24 desktop smoke checks.
- Dark/light, plain/paper/night, 375px mobile, reduced-motion and forced-colours audits found no blocking readability or overflow issue after fixes.
- Full interaction audit covered every visible Console control, all Gallery families and 61 lightbox states, all Scene actors/actions and all Docs copy rows.
- The only sensitive-scan findings are 23 pre-existing large-image warnings requiring image review, not publish-blocking text.
- GraphFlow's compatibility host returned only `{ok:true}` and exposed no context/index tools, so the graph could not be refreshed from this session; targeted repository context and fresh command evidence were used instead.

## Desktop And Deployment Follow-up
- `origin` is `ssh://git@ssh.github.com:443/OneStar1107/emoji-tot.git`.
- Local `main`, `origin/main` and the checked-out HEAD are all `64d45f6`; the upgrade is not committed or pushed.
- GitHub Pages is built from `gh-pages`, currently `77e3eba`, not from `main`.
- CI only verifies pushes to `main`; it does not publish the Gallery.
- The desktop element is still static CSS motion. The new `runtime.ts` exists in the vendored core but is not imported by `element.ts`.
- `FACE_META` covers all 61 drawable states with Chinese names. The desktop picker currently exposes only the 51 protocol states because `main.js` builds `demos` from `EMOTIONS`.

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `agent-reach` command unavailable | Followed the skill fallback and used GitHub CLI/API-compatible git access. |
| GraphFlow context returned only `{ok:true}` with no summary/anchors | Continued with scoped reads and the GraphFlow index files already in the repository; retry after changes. |
| Ego-browser page evaluation timed out at 15 seconds | Split core and drawer interaction audits; use requerying loops rather than stale detached buttons. |
| Three files contained CRLF and failed `git diff --check` | Converted exactly those files to LF and re-ran the complete check suite. |

## Resources
- Reference: https://github.com/blessonism/grok-icon-study
- Local reference clone: `C:\Users\hyx11\AppData\Local\Temp\grok-icon-study-0c83c5c78fe240c8a70abdfbd5cb79b2`
- Core still renderer: `packages/core/src/render.ts`
- State vocabulary: `packages/core/src/face.ts`, `packages/protocol/src/emotions.ts`
- Gallery surfaces: `apps/gallery/src/{console,wall,scene,docs}.ts`
- Global styling: `apps/gallery/src/style.css`
- Browser acceptance: `apps/gallery/scripts/browser-check.mjs`
