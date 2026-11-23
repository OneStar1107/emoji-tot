# Progress Log

## Session: 2026-11-23

### Current Status
- **Phase:** 7 - Verification And Delivery
- **Status:** complete
- **Started:** 2026-11-23

### Actions Taken
- Read the repository instructions and relevant skills.
- Read the reference repository's `character.js`, `pose.js`, `eyes.js`, `math.js`, `tables.js` and UI notes.
- Captured baseline full-page screenshots for all four routes in dark mode, Console/Docs in light mode, and Console at 390px.
- Ran an initial all-console control audit and confirmed 51 face controls, 15 casts, 12 colours, 51 select options, copy, island, effects, finish and size controls all produced state changes.
- Identified and documented the GraphFlow/agent-reach host limitations and the ego evaluation timeout.
- Added the pure spring integrator, 16-vertex eye vocabulary, state machine, motion profiles and browser runtime.
- Integrated the live rig into Console, Gallery, Scene and Docs, with theme-aware state colours, transition telemetry and project-structure documentation.
- Replaced stale-node automation with requerying loops and repaired the discovered hit-area, dialog cleanup, focus return, scene exclusivity, theme contrast, mobile overflow and reduced-motion issues.
- Captured final desktop dark/light screenshots for all four routes plus 390px mobile evidence in `C:\Users\hyx11\AppData\Local\Temp\emojitot-final-20261123`.

### Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Existing route render | Four routes render without horizontal overflow | All four routes rendered, 0 desktop overflow in baseline capture | pass |
| Console face strip | Every expression updates store and selected state | 51/51 passed | pass |
| Console effects/finish/size/island/copy | Every control changes or toggles the expected state | All passed in the first short audit | pass |
| Drawer controls | Every cast/colour/background updates store | Re-queried after each repaint: 15 casts, 12 colours and 5 backgrounds passed | pass |
| Console extras | Search, island, pause/resume, copy and runtime actions work | 8 quick faces, 2 copy buttons and spin/bounce/burst passed | pass |
| Gallery | Tabs, families, 61 tiles, lightbox, copy, keyboard and Escape cleanup work | 15 characters; filters 3/2/2/4/1/3; emotions 11/23/27; 61/61 lightbox states passed | pass |
| Scene | All actors, reports and crowd actions work exclusively | 12 actors, 9 sessions; report/error/done/reset/shuffle/party/sleep/poke/toggle passed | pass |
| Docs | TOC, protocol groups, copy rows and live rig work | 9 sections, 9 TOC links, 3 groups, 61/61 copy rows, 3 rig states passed | pass |
| Theme contrast | No unreadable text in dark or light themes | 12 page/theme/stage combinations audited; 0 low-contrast findings | pass |
| Mobile layout | No horizontal overflow at 375px | 0px overflow on all four routes in both themes | pass |
| Reduced motion | Persistent actions stop and controls communicate why | Runtime reports reduced mode and one-shot buttons are disabled | pass |
| Forced colours | Canvas, text and highlights remain visible | All four routes retained Canvas/CanvasText/Highlight readability | pass |
| Typecheck | All package types compile | `pnpm typecheck` exited 0 | pass |
| Diff hygiene | No whitespace errors | `git diff --check` exited 0 after LF normalization | pass |
| Full suite | Every project gate passes | `pnpm check` exited 0 | pass |
| Unit and smoke counts | No failures or skipped checks | 415 desktop, 34 protocol, 27 core, 24/24 desktop smoke | pass |
| Gallery contract | All browser checks pass | 32/32 | pass |
| Docs and settings | Generated data and documentation stay consistent | 51 ids/61 faces, 30 facts, 80 settings paths | pass |
| Dependency audit | No moderate-or-higher known vulnerabilities | No known vulnerabilities found | pass |
| Sensitive scan | No publish-blocking text | 306 tracked files; 0 must-remove, 23 existing large-image warnings | pass with warnings |

### Errors
| Error | Resolution |
|-------|------------|
| CRLF appeared as trailing whitespace in three edited files | Normalized the exact files to LF and re-ran all checks. |
| Browser automation initially clicked detached drawer nodes | Re-query controls after every render and repeat the interaction. |
| Scene crowd classes could overlap | Made party and sleep mutually exclusive before applying the new state. |

### Delivery Notes
- No installer, executable or published release was created in this task, so Windows release cleanup did not apply.
- No install directories or user data were deleted.

## Session: 2026-11-23 - Desktop Integration Follow-up

### Current Status
- **Phase:** 8 - Desktop Runtime Integration
- **Started:** 2026-11-23

### Findings
- Local `main` and `origin/main` both point at `64d45f6`; all motion/UI work is still an uncommitted working-tree change.
- GitHub Pages deploys from the separate `gh-pages` branch (`77e3eba`), so the public site cannot contain the local changes yet.
- The desktop app vendors the new core files, but `<emojitot-ball>` still renders static SVG plus CSS and does not mount `createCharacterRuntime()`.
- All 61 `FACES` currently have a `FACE_META` entry and a non-empty Chinese name, but the desktop picker is built from the 51 protocol EMOTIONS and omits the ten engine-only states.

### Next Step
Add opt-in live runtime lifecycle to the custom element, then wire the sustained desktop faces and reduced-motion preference.

## Session: 2026-11-23 - Desktop Release Follow-up

### Current Status
- **Phase:** 8-11 - Complete
- **Status:** complete

### Actions Taken
- Added opt-in live runtime mounting to `<emojitot-ball>`, with state updates that preserve spring velocity and teardown in `disconnectedCallback`.
- Enabled live motion for sustained desktop faces while keeping the 61-expression grid static.
- Connected the in-app reduce-motion preference to runtime pause.
- Expanded the desktop expression picker from 51 protocol entries to all 61 drawable states with Chinese labels.
- Found and fixed a release-tool defect: `apps/desktop/package.json` was missing from the version-sync allowlist, which produced a `0.8.18.1` executable from a `0.8.19.1` build identity.
- Built and installed `0.8.19.2` into `D:\EmojiTot`, preserving all user data.

### Test Results
| Test | Actual | Status |
|------|--------|--------|
| Full repository gate | Script tests, typecheck, unit tests, docs, settings, preview, Gallery, desktop smoke, audit and scan all passed | pass |
| Gallery contracts | 32/32 passed | pass |
| Packaged desktop smoke | 29/29 passed | pass |
| Installed desktop smoke | 29/29 passed | pass |
| Desktop layout stress | 3 skins, 33 island views + 15 settings pages, 0 violations | pass |
| Expression labels | 61 entries, 0 unnamed, 0 English fallback ids | pass |
| Version consistency | `0.8.19.2` reported by installed exe, setup, portable and unpacked exe | pass |
| Final version/docs/diff checks | All passed | pass |

### Release And Data Safety
- Current install: `D:\EmojiTot\EmojiTot.exe`, FileVersion `0.8.19.2`.
- Preserved `%APPDATA%\EmojiTot\prefs.json`, `state.json`, `avoidance.json` and `shelf`.
- Recycled 69 obsolete build/test/cache targets totalling 622,566,263 bytes.
- Cleanup is recoverable through the Windows Recycle Bin.
- `origin/main` remains `64d45f6`; `gh-pages` remains `77e3eba`. Nothing was committed, pushed or deployed by this follow-up.

## Session: 2026-11-24 - Self-Signed Publication

### Current Status
- **Phase:** 12 - Self-Signed Publication
- **Status:** in_progress

### Actions Taken
- Reused the existing local EmojiTot code-signing certificate with Subject `CN=OneStar1107, O=EmojiTot, C=CN`.
- Trusted that certificate only in the current user's Root store so local Authenticode verification can report `Valid`.
- Added `pnpm dist:selfsigned`, which creates or reuses the certificate, exports a random-password PFX to the temp directory, signs the Windows build, verifies it, and recycles the temporary PFX.
- Added post-assembly signing for the public portable launcher, which electron-builder cannot sign before its payload is appended.

### Verification
- Main executable, setup, and portable signatures: `Valid`.
- Signer thumbprint: `5F04740EF301EE713463B3E58119DCD9C2732E77`.
- DigiCert timestamp present on all three public artifacts.
- Full `pnpm check`: passed with 418 desktop tests, 34 protocol tests, 27 core tests, 32/32 Gallery checks and 29/29 desktop smoke checks.
