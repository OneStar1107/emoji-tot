# Progress Log

## Session: 2026-11-23

### Current Status
- **Phase:** 5 - Full Regression and Delivery
- **Started:** 2026-11-23

### Actions Taken
- Read the project instructions and selected planning, systematic-debugging, verification, and brainstorming skills.
- Attempted GraphFlow context and brief; both returned no usable payload.
- Confirmed a clean starting worktree and initialized a persistent audit plan.
- Read root/workspace package manifests and the main README.
- Read the UI audit, design backlog, and generated settings audit.
- Verified the runtime versions and began the documented baseline validation.
- Added focused regression tests for scanner allowlisting and ASCII runtime staging.
- Regenerated the stale settings audit and corrected page counts, download names, privacy copy, changelog headings, and noncommercial license references.
- Made `ui:audit` fall back from the installed app to `release/win-unpacked`, stage non-ASCII app paths into an ASCII temp directory, and clean up created runtime/profile files with longer Windows retries.
- Made electron-builder use the installed Electron distribution so normal unpacked packaging does not wait on a redundant download.
- Ran the packed app through default and five-skin stress UI audits, then re-ran the complete check suite.

### Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Baseline worktree | Clean | Clean before planning files | PASS |
| GraphFlow context | Indexed summary/anchors | Empty `ok` response | ENVIRONMENT LIMITATION |
| Runtime versions | Documented floors | Node 24.22.1, pnpm 12.9.1 | PASS |
| `pnpm test` | All suites pass | 332 + 33 + 18 tests passed | PASS |
| `pnpm typecheck` | No type errors | Core and protocol passed | PASS |
| `pnpm settings:check` | Generated audit is current | Stale generated file | FAIL |
| `pnpm scan` | No publish blocker | Two public-email findings | FAIL |
| `pnpm build` | Core/protocol compile | Passed | PASS |
| `pnpm docs:check` | Facts/generated docs consistent | Passed, 28 markers | PASS |
| `pnpm audit:ci` | No moderate+ vulnerabilities | None found | PASS |
| `pnpm preview` | Every protocol id and face renders | 51/51 ids, 61/61 faces | PASS |
| `pnpm check:gallery` | Site browser acceptance | 20/20 checks | PASS |
| `pnpm smoke:desktop` | Real Electron window smoke | 7/7 checks | PASS |
| `pnpm ui:audit -- --json` before fix | Run against installed app | Installed app missing | ENVIRONMENT LIMITATION |
| `ui:audit --exe release/win-unpacked/EmojiTot.exe` before fix | Run against packed app | Process exited `0x80000003` before CDP | FAIL / FIXED |
| `ui:audit --exe <ASCII temp copy>` | Default 11 island + 15 settings pages | 0 violations | PASS |
| `ui:audit --skins all --stress` on ASCII copy | Five-skin pressure matrix | 0 violations; one temp-profile cleanup warning | PASS WITH WARNING |
| `pnpm version:check` | Current version newer than last tag | Already tagged `v0.8.18` | EXPECTED RELEASE-GATE FAILURE |
| `pnpm ui:audit -- --json` after fix | Auto-stage packed app and audit it | 11/11 + 15/15 pages, 0 violations, clean temp cleanup | PASS |
| Five-skin `--stress` matrix after repack | 55 island + 15 settings measurements | 0 layout violations | PASS |
| `pnpm --filter @emojitot/desktop run pack` | Build unpacked app reliably | Completed in about 6s | PASS |
| `pnpm --filter @emojitot/desktop run dist` | Build NSIS installer, block map and portable app | All three artifacts rebuilt | PASS |
| Final `pnpm check` | Entire documented gate | 336 desktop + 33 protocol + 18 core tests; 20/20 gallery; 7/7 window; audit/scan pass | PASS |

### Errors
| Error | Resolution |
|-------|------------|

## Session Extension: Glass, Launcher and Build Identity

### Requirements
- Replace the existing `frost` skin with the dark acrylic/liquid-glass treatment shown in the three references.
- Implement the native launcher approach for arbitrary non-ASCII install paths.
- Adopt three-part public versions plus an automatically generated fourth build segment.
- Align internal package versions with the desktop app while they ship as one product.

### Status
- **Phase:** complete
- **Started:** 2026-11-23

### Actions Taken
- Added a native Windows launcher that forwards command-line arguments, keeps launch-at-login pointed at the public executable, stages non-ASCII installs into an ASCII cache and prunes obsolete runtime builds.
- Added native Acrylic for Windows 11 22H2+, a shaped region for the transparent island, and the translucent layered fallback everywhere else.
- Added automatic four-part build identity generation, synchronized shipping package versions, and build-time metadata inside the packaged app.
- Added a second native bootstrap around the portable NSIS payload after reproducing its own non-ASCII path failure.
- Raised packaged trees to Medium integrity and added the Windows `%TEMP%\Low` fallback for low-integrity download/build folders.
- Updated README, changelog and release-version documentation to match the shipped behavior.

### Final Verification
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Targeted launcher/version/material tests | All pass | All focused tests passed | PASS |
| Desktop suite | All pass | 350 tests passed | PASS |
| `pnpm check` | Full documented gate | Types, build, tests, docs, settings, 51/51 ids, 61/61 faces, gallery 20/20, window 8/8, audit and scan all passed | PASS |
| Unpacked app from `E:\项目\EmojiTot` | Starts without manual ASCII staging | 8/8 window checks passed | PASS |
| Portable artifact from `E:\项目\EmojiTot` | Starts through the native bootstrap | 8/8 window checks passed; portable and app caches reused on a second launch | PASS |
| Five-skin stress UI audit | 55 island + 15 settings pages, no violations | 0 violations | PASS |
| NSIS build | Four-part artifact identity | `EmojiTot.Setup.0.8.18.11.exe`, FileVersion `0.8.18.11` | PASS |
| Portable build | Four-part artifact identity | `EmojiTot.0.8.18.11.portable.exe`, FileVersion/ProductVersion `0.8.18.11` | PASS |
| Packaged metadata | App-visible build identity | `build-info.json` reports `0.8.18.11` and commit `da17cac` | PASS |
| Cache maintenance | One current cache, no build bloat | 1.4 GB / 6 app caches collapsed to 362 MB / 1 app cache; portable cache stayed at 1 | PASS |

## Session Extension: Native Acrylic Regression

### Actions Taken
- Reproduced the user's packaged screenshot: Windows Acrylic painted the entire padded window rectangle, and the native region clipped the left side at 150% scaling.
- Added failing runtime checks for a native-material-free island, multiple CSS material layers, equal collapsed corners and equal expanded corners.
- Removed the island's native material, shape region and material resolver.
- Reworked `frost` into a five-layer CSS Liquid Glass surface with no backdrop capture.
- Captured collapsed and expanded states from the running app at 150% scaling and visually confirmed the grey rectangle and square lower-left corner were gone.

### Final Verification
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Focused glass tests | No native material; layered corners | 3/3 passed | PASS |
| Desktop suite | All regression tests pass | 347/347 passed | PASS |
| Window smoke | CSS-only material and equal corners | 10/10 passed | PASS |
| Default UI audit | 11 island + 15 settings pages | 0 violations | PASS |
| Five-skin stress matrix | 55 island + 15 settings pages | 0 violations | PASS |
| `pnpm check` | Full documented gate | Tests, docs, gallery, smoke, audit and scan passed | PASS |
| Packaged 150% visual check | Collapsed pill and expanded panel have symmetric corners | No grey rectangle; equal left/right corners in both states | PASS |
| Release artifacts | Installer and portable for the fix build | `EmojiTot.Setup.0.8.18.13.exe` and `EmojiTot.0.8.18.13.portable.exe` | PASS |
| Installed build | Launch from the user install location | FileVersion `0.8.18.13`; app running; desktop shortcut created | PASS |
