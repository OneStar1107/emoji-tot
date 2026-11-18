# EmojiTot Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed `v0.3.32` runtime, data, UI and release gaps in independently testable steps.

**Architecture:** Keep the existing shared-schema and IPC-guard architecture. Add observable action results at service boundaries, keep preference changes flowing through one schema, and add focused helpers only where current modules are too coupled to test directly.

**Tech Stack:** Electron 45, Node 22 test runner, Vitest 5, Vite 8, TypeScript 5, pnpm 12, plain JS renderer/main modules.

**Spec:** `docs/superpowers/specs/2026-11-19-audit-fixes-design.md`

## Global Constraints

- Windows 10/11 only.
- Preserve old prefs/data files.
- No production change without a test that was watched failing first.
- No new runtime dependency unless unavoidable.
- Run the full suite after every task.

## Review Focus

- A valid provider selected in settings must survive a disk round trip and reach `mail.add`.
- A disabled page/status must not trigger background timers or network calls.
- A pointer outside the ball must not override an explicit click-through preference.
- A 31st-of-month recurring event must not produce March 3rd.
- Malicious deep IPC payloads must not be counted as 8 bytes.

---

### Task 1: Data Forms and Provider Persistence

**Files:**
- Modify: `apps/desktop/src/shared/schema.js`
- Modify: `apps/desktop/src/main.js`
- Modify: `apps/desktop/src/renderer/settings.js`
- Modify: `apps/desktop/src/main/services/mail.js`
- Modify: `apps/desktop/src/main/services/quota.js`
- Modify: `apps/desktop/src/main/services/calendar.js`
- Test: `apps/desktop/test/schema.test.mjs`
- Test: `apps/desktop/test/services.test.mjs`

**Interfaces:**
- Consumes: existing `writePrefs`, `mail.add`, `quota.add`, `calendar.addSubscription`.
- Produces: `mailProvider: '163'|'qq'|'gmail'|'outlook'|'custom'` prefs key; service action results `{ok:boolean,error?:string}`; settings state `formError`.

- [x] **Step 1: Write the failing test**

Add schema tests asserting `mailProvider` is a known path and survives `filterPatch({mailProvider:'gmail'})`. Add service tests for `mail.add` provider selection and rejected input metadata.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @emojitot/desktop test`

Expected: FAIL because `mailProvider` is rejected and the UI/provider fix is absent.

- [x] **Step 3: Implement provider persistence and visible action errors**

Add `mailProvider` to `DEFAULTS` and `CONSUMERS`. Make mail/quota/calendar IPC handlers return `actionResult`. In settings, read the select value directly, keep form values after failure, and render `formError`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @emojitot/desktop test`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/schema.js apps/desktop/src/main.js apps/desktop/src/renderer/settings.js apps/desktop/src/main/services/mail.js apps/desktop/src/main/services/quota.js apps/desktop/src/main/services/calendar.js apps/desktop/test/schema.test.mjs apps/desktop/test/services.test.mjs
git commit -m "fix: persist mail providers and surface form errors"
```

### Task 2: Status Component Toggles

**Files:**
- Modify: `apps/desktop/src/renderer/settings.js`
- Test: `apps/desktop/test/schema.test.mjs`

**Interfaces:**
- Consumes: `enabledStatusKeys`, `orderedStatusKeys`, `STATUS_MANIFEST`.
- Produces: `toggleStatusItem(key, enabled): string[]`, preserving order and excluding disabled keys.

- [x] **Step 1: Write the failing test**

Add a pure test for a status-order helper that starts with `['battery','clock','weather']`, enables `quota`, then disables `clock`, and expects `['battery','weather','quota']`.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @emojitot/desktop test`

Expected: FAIL because the helper/UI switch does not exist.

- [x] **Step 3: Implement status toggles**

Export the helper from schema, pass an enabled predicate to the status `orderList`, and make drag-end write only currently enabled keys.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @emojitot/desktop test`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/schema.js apps/desktop/src/renderer/settings.js apps/desktop/test/schema.test.mjs
git commit -m "fix: add real status component toggles"
```

### Task 3: Window Preferences

**Files:**
- Modify: `apps/desktop/src/main.js`
- Modify: `apps/desktop/src/main/island.js`
- Test: `apps/desktop/test/platform.test.mjs`

**Interfaces:**
- Consumes: `prefs.clickThrough`, `prefs.displayId`.
- Produces: dynamic click-through only when preference is true; consistent string display-ID matching.

- [x] **Step 1: Write the failing tests**

Test a pure display matcher with numeric and string IDs. Test a click-through decision helper with `(preference:false, inside:false)` returning `false`.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @emojitot/desktop test`

Expected: FAIL because helpers do not exist and current click-through always follows the pointer.

- [x] **Step 3: Implement preference-aware window behavior**

Use `String(display.id) === String(wanted)`. Gate pointer-driven pass-through on the preference and stop `savePrefs()` from persisting runtime pointer state.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @emojitot/desktop test`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/main.js apps/desktop/src/main/island.js apps/desktop/test/platform.test.mjs
git commit -m "fix: honor click-through and display preferences"
```

### Task 4: Service, Focus and Agent Semantics

**Files:**
- Modify: `apps/desktop/src/main.js`
- Modify: `apps/desktop/src/main/services/focus.js`
- Modify: `apps/desktop/src/main/services/quota.js`
- Modify: `apps/desktop/src/main/services/mail.js`
- Test: `apps/desktop/test/services.test.mjs`
- Test: `apps/desktop/test/agents.test.mjs`

**Interfaces:**
- Consumes: `enabledServices`, `scheduleWeather`, `focus.enabled`, agent mtime polling.
- Produces: `focus.start()` returns `false` when disabled; separate `skip()` from `finish()`; cancellable deferred start timers; parse-success mtime update.

- [x] **Step 1: Write failing tests**

Add tests for focus-disabled start, skip without cycle increment, disabled-service weather refresh, and agent file retry after invalid JSON.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @emojitot/desktop test`

Expected: FAIL on each current behavior.

- [x] **Step 3: Implement service and timing fixes**

Gate startup/onPrefs work by service plan, reschedule weather when the interval changes, store/cancel initial timeout handles, and separate focus skip from completion.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @emojitot/desktop test`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/main.js apps/desktop/src/main/services/focus.js apps/desktop/src/main/services/quota.js apps/desktop/src/main/services/mail.js apps/desktop/test/services.test.mjs apps/desktop/test/agents.test.mjs
git commit -m "fix: align service and focus lifecycle behavior"
```

### Task 5: Calendar Recurrence and Reminder Bounds

**Files:**
- Modify: `apps/desktop/src/main/ics.js`
- Modify: `apps/desktop/src/main/services/calendar.js`
- Test: `apps/desktop/test/ics.test.mjs`
- Test: `apps/desktop/test/services.test.mjs`

**Interfaces:**
- Consumes: `expandRecurrence`, `reminded`.
- Produces: monthly/yearly recurrence skips invalid dates; reminder keys are pruned when source events disappear.

- [x] **Step 1: Write failing tests**

Add a monthly event on Jan 31 expecting Feb 28/29 handling and no March 3. Add a reminder-prune test.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @emojitot/desktop test`

Expected: FAIL with rolled dates and stale keys.

- [x] **Step 3: Implement recurrence and pruning**

Use explicit month/year arithmetic that rejects invalid days, and remove reminder keys for deleted/replaced events.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @emojitot/desktop test`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ics.js apps/desktop/src/main/services/calendar.js apps/desktop/test/ics.test.mjs apps/desktop/test/services.test.mjs
git commit -m "fix: harden recurring calendar events"
```

### Task 6: Gallery Filters, Labels and Localization

**Files:**
- Modify: `apps/gallery/src/wall.ts`
- Modify: `apps/gallery/src/scene.ts`
- Modify: `apps/gallery/src/drawer.ts`
- Modify: `apps/gallery/src/i18n.ts`
- Modify: `apps/gallery/src/docs.ts`
- Modify: `apps/gallery/index.html`
- Modify: `apps/gallery/scripts/browser-check.mjs`

**Interfaces:**
- Consumes: `FAMILIES`, `EMOTIONS`, `getLang`.
- Produces: cast-family filter; distinct scene actions; English drawer names.

- [x] **Step 1: Write failing browser checks**

Add checks that each cast family returns non-empty tiles and that scene action labels match action keys.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @emojitot/gallery build && node apps/gallery/scripts/browser-check.mjs`

Expected: FAIL on empty family filters/wrong labels.

- [x] **Step 3: Implement Gallery corrections**

Use `FAMILIES` for character filters, add scene action keys, localize drawer and docs strings, and update meta/OG declarations.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @emojitot/gallery build && node apps/gallery/scripts/browser-check.mjs`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/gallery/src apps/gallery/index.html apps/gallery/scripts/browser-check.mjs
git commit -m "fix: correct gallery filters and localization"
```

### Task 7: IPC and Persistence Hardening

**Files:**
- Modify: `apps/desktop/src/main/ipc-shape.js`
- Modify: `apps/desktop/src/main/ipc-guard.js`
- Modify: `apps/desktop/src/main/paths.js`
- Test: `apps/desktop/test/security.test.mjs`
- Test: `apps/desktop/test/services.test.mjs`

**Interfaces:**
- Consumes: `byteSize`, `frameOf`, `writeJson`.
- Produces: conservative deep payload sizing; empty frame rejection; atomic write helper.

- [ ] **Step 1: Write failing tests**

Test a six-level payload with a 1 MB leaf is over limit, empty sender frame is invalid, and atomic write survives a pre-existing target.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @emojitot/desktop test`

Expected: FAIL.

- [ ] **Step 3: Implement hardening**

Add iterative/depth-safe accounting, reject empty frames, and write to a sibling temp file before rename.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @emojitot/desktop test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main apps/desktop/test/security.test.mjs apps/desktop/test/services.test.mjs
git commit -m "fix: harden IPC sizing and local writes"
```

### Task 8: Delivery Chain and Documentation

**Files:**
- Modify: `package.json`
- Modify: `apps/desktop/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/desktop/scripts/window-smoke.mjs`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/PROTOCOL.md`
- Modify: `docs/SETTINGS.md`
- Modify: `docs/PRIVACY.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/ISLAND.md`

**Interfaces:**
- Consumes: existing root scripts and test harnesses.
- Produces: one verification command for gallery/browser/audit/smoke; accurate docs and artifact links.

- [ ] **Step 1: Write failing validation checks**

Extend browser/CI checks for artifact names, stale counts, and missing `og.png`; make window-smoke fail with a clear diagnostic.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm docs:check && pnpm settings:check && pnpm --filter @emojitot/gallery build`

Expected: checks fail on stale prose/links or smoke harness.

- [ ] **Step 3: Implement delivery fixes**

Add `check`/`ci` scripts, build Gallery in CI, wire smoke gracefully, update docs, and add a real `og.png` or remove the declaration.

- [ ] **Step 4: Run final verification**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm docs:check && pnpm settings:check && pnpm preview && pnpm --filter @emojitot/gallery build && node apps/gallery/scripts/browser-check.mjs && pnpm audit --registry=https://registry.npmjs.org && pnpm scan`

Expected: all pass, with the documented screenshot WARN count only.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/desktop/package.json .github/workflows/ci.yml apps/desktop/scripts/window-smoke.mjs README.md README.en.md docs apps/gallery
git commit -m "chore: finish delivery checks and docs sync"
```
