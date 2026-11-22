# Task Plan: EmojiTot Full Audit and Repair

## Goal
Read the current documentation and codebase, exercise every documented build/test/runtime check, identify reproducible bugs and meaningful feature gaps, then fix the confirmed issues and verify the complete project again.

## Next Step
Add regression coverage for the sensitive scanner, then fix the scanner, UI-audit launcher, stale generated settings audit, and user documentation.

## Current Phase
Phase 3

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
- **Status:** in_progress

### Phase 4: Implementation and Completion
- [ ] Add regression coverage for each confirmed defect
- [ ] Fix confirmed bugs at their root cause
- [ ] Complete bounded high-value gaps supported by the existing product direction
- [ ] Update generated docs or user-facing guidance affected by the changes
- **Status:** pending

### Phase 5: Full Regression and Delivery
- [ ] Re-run every available validation from a clean state
- [ ] Verify the original failures are gone and no new failures appeared
- [ ] Review the final diff and confirm generated artifacts are coherent
- [ ] Refresh GraphFlow if available
- [ ] Report fixes, remaining limitations, and evidence
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Preserve the existing Windows/Electron/Vite architecture | The user asked to improve this program, not replace it |
| Treat the repository documentation as the product contract | It defines 11 island pages, 15 settings pages, five skins, a protocol, and a desktop runtime |
| Use reproducible command output as the gate for fixes | Avoid speculative changes that cannot be tied to observed behavior |
| Allow only the explicitly published project contact in the sensitive scanner | The contact address is already part of the license support flow; generic addresses must still fail |
| Stage packed Electron output into an ASCII temp path when auditing | Electron 45 exits before CDP when the executable lives under a non-ASCII path |
| Keep the plugin runtime as a documented future gap | It is explicitly planned, but implementing an extension sandbox is outside a bounded audit-and-repair pass |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| GraphFlow context/brief returned `ok` with no summary or anchors | Indexed context is unavailable; fall back to targeted repository inspection and refresh the index after changes |
