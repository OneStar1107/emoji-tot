# EmojiTot Audit Fixes Design

**Date:** 2026-11-19

**Intent:** Close the confirmed runtime, configuration, data-integrity and
documentation gaps found in the current `v0.3.32` audit without redesigning the
engine or replacing the existing Electron architecture.

## Goals

1. Make email provider selection persist and make add/subscribe failures
   visible to the user.
2. Give every status component a real enable/disable control.
3. Make click-through and display-selection preferences behave as labelled.
4. Make page switches stop their services, re-arm weather/quota correctly, and
   make focus and agent-file behavior match their copy.
5. Correct recurring monthly calendar expansion and bound reminder memory.
6. Correct Gallery filters, action labels, localization and social metadata.
7. Harden IPC payload accounting and make JSON persistence atomic.
8. Exercise the complete build/package validation chain and remove stale docs
   or release links.

## Non-goals

- Auto-update, code signing, telemetry, cloud sync or a plugin runtime.
- A wholesale refactor of the large desktop renderer/main files.
- macOS support.
- Expanding the protocol vocabulary.

## Constraints

- The product remains Windows 10/11 only.
- No new runtime dependency unless the standard library cannot solve the issue.
- Existing prefs, state files and user data must remain readable.
- No behaviour change without a failing regression test first.

## Required Behavior

### Email and form errors

- `mailProvider` is a persisted preference with default `163`.
- The provider chosen in settings reaches `mail.add`.
- `mail:do`, `quota:do` and `calendar:do` return their action result so the
  settings UI can show an inline error instead of silently repainting.
- A failed add/subscribe leaves the user's form values visible.

### Status components

- Battery, clock, weather and quota each have an on/off switch.
- Turning an item off removes its key from `statusItems`.
- Turning it on appends it to `statusItems`.
- Dragging only changes order and does not implicitly enable disabled items.

### Window behavior

- `clickThrough: false` disables dynamic pass-through until re-enabled.
- Runtime pointer state is never written back as the user's preference.
- Display IDs compare consistently whether Electron returns a number or the
  settings page returns a string.

### Service behavior

- Disabled pages do not perform startup, preference-change or delayed network
  work.
- Weather interval changes reschedule the active weather timer immediately.
- Focus cannot be started while `focus.enabled` is false.
- Skipping a work phase does not increment completed cycles.
- An agent file that parses as invalid is retried without waiting for a new
  mtime.

### Calendar data

- Monthly/yearly recurrence does not roll 29-31 dates into the next month.
- Reminder keys are bounded or pruned when events are replaced/removed.

### Gallery

- Character filters filter by cast family.
- Scene action labels describe their actual actions.
- English mode localizes drawer labels and names.
- Social metadata and the Open Graph image declaration match the repository.

### Security and persistence

- IPC size accounting cannot be bypassed with deep object nesting.
- Empty sender frames are rejected.
- JSON writes use a temporary sibling, flush and rename.

### Delivery

- CI runs Gallery build, browser acceptance where available, dependency audit,
  and a desktop smoke test that fails clearly when Electron is unavailable.
- README, docs and release links match actual code and artifacts.

## Acceptance

- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm docs:check`,
  `pnpm settings:check`, `pnpm preview`, Gallery build and Gallery browser
  acceptance pass.
- `pnpm audit --registry=https://registry.npmjs.org` reports no known
  vulnerabilities.
- `pnpm scan` reports no text FAIL.
- The final diff contains a regression test for every runtime bug fixed.
