# Task Plan: Island Motion and Startup Refresh

## Goal

Ship a new EmojiTot build that removes island animation drift and ghosting, unifies width, height, and radius under an interruptible spring, polishes the glass surface, warms device and weather data at startup, and adds trustworthy About/update behavior without regressing island visibility.

## Next Step

Commit and publish v0.8.18.14, then install the verified build after the required Windows installation confirmation.

## Current Phase

Phase 5: Verification and Delivery

## Phases

### Phase 1: Reproduction and Root Cause

- [x] Inspect final v0.8.18.13 implementation and recent commits
- [x] Capture island geometry, character position, opacity, and shell layering per frame
- [x] Trace startup device/weather timing and transient island hide/show events
- [x] Record root causes and exact hypotheses in findings.md
- **Status:** complete

### Phase 2: Tests and Motion/Glass Design

- [x] Add failing regression tests for spring reversal and geometry continuity
- [x] Define the refined glass token set and self-critique against the current effect stack
- [x] Validate Apple spring conversion and 60/120 Hz timing numerically
- **Status:** complete

### Phase 3: Island and Glass Implementation

- [x] Replace split morph timing with one analytic, velocity-preserving spring
- [x] Anchor the character independently from shell bounds to eliminate one-frame drift
- [x] Remove ghost/old-shell composites and correct every asymmetric corner
- [x] Apply the restrained Apple-inspired glass hierarchy
- **Status:** complete

### Phase 4: Startup and Settings Implementation

- [x] Warm devices and weather immediately and retry transient failures
- [x] Default weather to automatic location; remove the visible 香港 fallback
- [x] Clean installer display name and About metadata
- [x] Add cached, optional GitHub latest-version check and repository link
- [x] Fix transient island disappearance during capture/app switching
- **Status:** complete

### Phase 5: Verification and Delivery

- [x] Run regression, integration, build, and visual checks
- [ ] Install and launch the new local build for user testing
- [ ] If all checks pass, tag, publish release notes, and upload GitHub Release
- **Status:** in_progress

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Preserve published v0.8.18.13 | It is already public; the new work must be a new version and tag. |
| Treat non-blocking update notice as optional in-product guidance | The user asked that updating remain optional. |
| Interpret “remove Setup.0.8.18.exe text” as a clean user-facing app artifact name | The screenshot shows the installer filename in search; the executable identity should remain recognizable as EmojiTot. |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| GraphFlow `gf_read` returned no context payload | 1 | Continue with targeted repository inspection; log the tool limitation. |
| Planning initializer first created legacy root files | 1 | Removed only the three newly created files and initialized a named plan. |
