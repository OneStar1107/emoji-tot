# Task Plan: Tot Motion Runtime And UI Upgrade

## Goal
Upgrade EmojiTot with an original stateful character runtime, polygon-eye morphing, spring motion, a clearer product structure, and a coordinated console / gallery / scene / docs redesign, then verify every visible control and both colour themes.

## Next Step
Commit the release source, rebuild from that commit with the self-signed certificate, install it locally, then publish `main`, `gh-pages` and the GitHub Release.

## Current Phase
Phase 12 in_progress

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints
- [x] Document in findings.md
- **Status:** complete

### Phase 2: Core Motion Engine
- [x] Add spring integrator and deterministic stepping
- [x] Add original Tot polygon-eye vocabulary and morphing
- [x] Add state transitions, pose profiles, gaze, blink and one-shot actions
- [x] Add browser runtime with cleanup and reduced-motion behaviour
- [x] Unit-test the pure engine pieces
- **Status:** complete

### Phase 3: Console And Interactive Identity
- [x] Mount the runtime on the console stage
- [x] Replace one-shot CSS-only effects with runtime actions
- [x] Add live state/eye/spring readout and a pause control
- [x] Preserve copy, size, finish, drawer, island and route behaviour
- **Status:** complete

### Phase 4: Gallery, Scene And Docs
- [x] Add live specimens and stronger state taxonomy to the gallery
- [x] Show the arbiter as a readable transition system and animate its face
- [x] Add an engine anatomy section and update project documentation
- [x] Unify visual tokens and motion language without copying the reference
- **Status:** complete

### Phase 5: Accessibility And Theme QA
- [x] Audit text/background contrast in dark and light modes
- [x] Check focus, target sizes, reduced motion and forced-colors fallbacks
- [x] Fix every unreadable or clipped text state
- **Status:** complete

### Phase 6: Full Control Interaction QA
- [x] Re-query controls after each rerender and click every console control
- [x] Exercise gallery tabs, filters, tiles, dialog navigation, copy and keyboard
- [x] Exercise every scene report, pause, reset, crowd action and actor
- [x] Exercise every docs TOC, protocol group and copy row
- [x] Fix unimplemented or silently failing controls
- **Status:** complete

### Phase 7: Verification And Delivery
- [x] Run typecheck, tests, build, docs, browser and desktop checks
- [x] Capture final desktop/mobile dark/light evidence
- [x] Refresh GraphFlow index when the host tool is available
- [x] Summarise changes, tests, removed/recoverable items and remaining risk
- **Status:** complete

### Phase 8: Desktop Runtime Integration
- [x] Add an opt-in live mode to `<emojitot-ball>` with idempotent lifecycle and cleanup
- [x] Enable live motion on the desktop ball, island faces and settings live preview
- [x] Preserve the static thumbnail path so large expression grids do not start dozens of RAF loops
- [x] Connect the in-app reduce-motion preference to live runtime pause
- [x] Add desktop and browser regression checks for the live runtime
- **Status:** complete

### Phase 9: Complete Chinese Expression Names
- [x] Audit all 61 drawable states against the protocol and FACE_META Chinese names
- [x] Expose every state with a Chinese label in the desktop expression picker
- [x] Prevent unnamed fallbacks from leaking an English state id into the Chinese UI
- [x] Add a regression test for the complete label set
- **Status:** complete

### Phase 10: Build And Runtime Verification
- [x] Build and vendor the updated core into the desktop app
- [x] Run typecheck, unit tests, Gallery contracts and desktop smoke
- [x] Launch the real desktop renderer and confirm live runtime plus all 61 Chinese names
- [x] Capture visual evidence for the updated program
- **Status:** complete

### Phase 11: Publication State
- [x] Compare local HEAD, remote main and deployed gh-pages
- [x] Document that publishing requires an explicit push/deploy action
- [x] Do not claim the web app is live before gh-pages is updated
- **Status:** complete

### Phase 12: Self-Signed Publication
- [x] Add an idempotent local self-signing build command
- [x] Sign the main executable, uninstaller, installer and final portable launcher
- [ ] Rebuild from the release commit and verify all signatures
- [ ] Install `0.8.19.3` over the current installation without losing user data
- [ ] Push `main`, deploy `gh-pages` and create the GitHub Release
- **Status:** in_progress

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep the pure SVG renderer for still export and thumbnails | Preserves deterministic snapshots and avoids 61 always-on animation loops. |
| Add a separate browser runtime for the stage, arbiter and live specimens | The stateful layer can use RAF, springs and pointer input without contaminating Node-safe rendering. |
| Use original polygon point sets in Tot's `100×100` coordinate system | Captures the useful morphing technique without copying the reference's geometry or identity. |
| Encode state families with violet, coral, green and amber | State meaning becomes legible without relying on text alone. |
| Keep the existing precise editorial identity and add an "instrument panel" layer | The repository already has a strong voice; the enhancement should deepen it rather than replace it with another product's skin. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| `agent-reach` is not installed in this environment | Used GitHub's official clone/API path and documented the fallback. |
| GraphFlow `gf_read` returned an empty result and the `graphflow_context/plan/index` tools were not exposed by this host | Used the existing graph files plus targeted file reads; refresh when the host exposes the tools. |
| First all-control browser evaluation exceeded ego-browser's 15s page-evaluation limit | Split the audit into shorter evaluations and reloaded after the stopped evaluation. |
| `git diff --check` flagged CRLF as whitespace in three edited files | Normalized those files to LF and re-ran diff check, typecheck and the full suite. |
