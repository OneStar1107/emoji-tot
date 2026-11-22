# Task Plan: EmojiTot Full Audit and Repair

## Goal
Read the current documentation and codebase, exercise every documented build/test/runtime check, identify reproducible bugs and meaningful feature gaps, then fix the confirmed issues and verify the complete project again.

## Next Step
Deliver the verified build and summarize the remaining external limitation (unsigned artifacts).

## Current Phase
Complete

## Phases

### Phase 1: Documentation and Code Discovery
- [x] Capture the user's intent and completion criteria
- [x] Establish a clean baseline and initialize persistent planning
- [x] Read architecture, product specs, release/security guidance, and known-gap documents
- [x] Map source, test, browser-check, desktop-smoke, and packaging entry points
- [x] Record the candidate risk areas to investigate
- **Status:** complete

### Phase 2: Baseline Validation
- [x] Run install/prerequisite checks
- [x] Run typecheck, build, unit/integration tests, docs checks, settings audit, dependency audit, and secret scan
- [x] Run gallery browser validation and desktop Electron smoke/runtime checks
- [x] Run UI layout audits where the environment supports them
- [x] Record exact failures and warnings in findings/progress
- **Status:** complete

### Phase 3: Root-Cause Triage
- [x] Reproduce each confirmed defect consistently
- [x] Trace the failing data flow to its origin
- [x] Separate real defects from environment-only limitations
- [x] Rank fixes by user impact and verification cost
- **Status:** complete

### Phase 4: Implementation and Completion
- [x] Add regression coverage for each confirmed defect
- [x] Fix confirmed bugs at their root cause
- [x] Complete bounded high-value gaps supported by the existing product direction
- [x] Update generated docs or user-facing guidance affected by the changes
- **Status:** complete

### Phase 5: Full Regression and Delivery
- [x] Re-run every available validation from a clean state
- [x] Verify the original failures are gone and no new failures appeared
- [x] Review the final diff and confirm generated artifacts are coherent
- [x] Refresh GraphFlow if available
- [x] Report fixes, remaining limitations, and evidence
- **Status:** complete

### Phase 6: Native Launcher and Build Identity
- [x] Define launcher behavior for ASCII and non-ASCII install paths
- [x] Add failing tests for packaged naming, login-item handoff and build-version output
- [x] Implement and compile the native launcher
- [x] Add the electron-builder after-pack integration
- [x] Add automatic fourth-segment buildVersion generation and package-version synchronization
- **Status:** complete

### Phase 7: Liquid Glass Replacement
- [x] Add failing tests for Windows 11 material selection and frost fallback
- [x] Reproduce the native acrylic rectangle and high-DPI `setShape` corner clipping
- [x] Remove native material and window regions from the transparent island
- [x] Replace the flat frost fill with a five-layer CSS Liquid Glass surface
- [x] Preserve light-theme contrast, layout budgets, click-through and morph behavior
- **Status:** complete

### Phase 8: Packaging and Runtime Verification
- [x] Build the launcher and full NSIS/portable artifacts
- [x] Launch the packaged app from a real non-ASCII path
- [x] Verify the ASCII runtime cache and second-launch reuse
- [x] Verify four-part build identity in the app and artifact names
- **Status:** complete

### Phase 9: Full Regression
- [x] Run all unit/integration tests, typecheck, documentation and settings gates
- [x] Run gallery browser acceptance and desktop window smoke
- [x] Run default and stressed UI audits across all skins
- [x] Review the final diff and report remaining platform limits
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Preserve the existing Windows/Electron/Vite architecture | The user asked to improve this program, not replace it |
| Treat the repository documentation as the product contract | It defines 11 island pages, 15 settings pages, five skins, a protocol, and a desktop runtime |
| Use reproducible command output as the gate for fixes | Avoid speculative changes that cannot be tied to observed behavior |
| Allow only the explicitly published project contact in the sensitive scanner | The contact address is already part of the license support flow; generic addresses must still fail |
| Stage packed Electron output into an ASCII temp path when auditing | Electron 45 exits before CDP when the executable lives under a non-ASCII path |
| Keep the plugin runtime as a documented future gap | It is explicitly planned, but implementing an extension sandbox is outside a bounded audit-and-repair pass |
| Replace `frost` instead of adding a sixth skin | The user chose the direct replacement so the existing skin list and settings surface stay stable |
| Use a native launcher for non-ASCII installs | Electron crashes before JavaScript can run, so a synchronous wrapper outside Electron is the only transparent fix |
| Generate build identity at build time | Public versions stay stable while each local install gets a unique fourth segment |
| Wrap the portable NSIS artifact in a native ASCII bootstrap | The NSIS wrapper is path-sensitive even though it extracts to an ASCII temp directory; the outer bootstrap makes the public `.portable.exe` path-independent |
| Key runtime caches by build identity and prune old versions | A full runtime cache is about 362 MB; unbounded versioning would consume gigabytes after a few installs |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| GraphFlow context/brief returned `ok` with no summary or anchors | Indexed context is unavailable; fall back to targeted repository inspection and refresh the index after changes |
| Normal electron-builder packaging stalled while trying to download an Electron distribution | Point `build.electronDist` at the already installed workspace Electron package and cover it with a test |
| UI audit intermittently reported locked temp profiles and one staged runtime remained | Extend Windows cleanup retries; the next default audit completed with no warning and removed its staged runtime |
| Electron's native acrylic cannot follow a rounded transparent window | Remove native material and `setShape`; paint the complete silhouette with layered CSS and verify all four corners at 150% scaling |
| Portable NSIS artifact still crashed with `0x80000003` when the public `.portable.exe` lived under a non-ASCII path | Add a native ASCII bootstrap around the portable payload; the unpacked and portable launchers now both survive the real Chinese workspace path |
| Low-integrity build folders prevented the portable bootstrap from creating `%LOCALAPPDATA%` caches | Raise generated portable/installer trees to Medium integrity and add the Windows `%TEMP%\Low` fallback |
| Runtime caches accumulated one full 362 MB copy per build | Key by build identity and move/delete obsolete caches after the current build is ready; verified 1.4 GB collapsed to one current cache |
