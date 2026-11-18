# EmojiTot UI and Product Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the two confirmed UI defects, consolidate display state, and improve first-run and accessibility behavior without adding new subsystems.

**Architecture:** Keep the shared schema as the single preference authority. Fix Gallery styling at the selector boundary and strengthen computed-layout acceptance. Move island presentation concerns into the existing renderer. Add pure preset helpers to the schema and render them in General settings.

**Tech Stack:** Electron 45, vanilla ES modules, Node test runner, Vite/TypeScript, Playwright-style CDP acceptance.

**Spec:** `docs/superpowers/specs/2026-11-19-ui-product-polish-design.md`

## Global Constraints

- Windows x64 remains the supported desktop target.
- Do not add runtime dependencies.
- No additional island page is introduced in this pass.
- Clipboard history remains off in every preset.
- Keep the existing palette, typography, and rounded-card visual language.
- Every behavior change starts with a failing test.

## Review Focus

- A legacy `prefs.json` containing `formBoth: true` must reopen in both mode.
- A new `displayMode` value must beat stale legacy keys.
- With media active, changing pages must keep the new page title in the header.
- A one-page island must not expose unusable arrows or dots.
- Preset application must preserve unrelated preferences and clipboard privacy.

---

### Task 1: Repair and Test the Gallery Wall

**Files:**
- Modify: `apps/gallery/src/style.css`
- Modify: `apps/gallery/scripts/browser-check.mjs`

**Interfaces:**
- Consumes: existing `#wallGrid`, `#wallFilters`, `.wall-tabs` DOM.
- Produces: computed grid layout with at least two desktop columns.

- [ ] **Step 1: Add failing computed-layout browser checks**

Assert `getComputedStyle(wallGrid).display === 'grid'`, the first two cast tiles
share a row, and the tabs container has a non-transparent background.

- [ ] **Step 2: Run browser acceptance and verify failure**

Run: `pnpm --filter @emojitot/gallery build && node apps/gallery/scripts/browser-check.mjs`

Expected: FAIL because `#wallGrid` computes to `display: block`.

- [ ] **Step 3: Align CSS selectors with the view markup**

Use `.wall-tabs`, `.wall-filters`, and `.wall-grid`; retain the responsive
override for narrow screens.

- [ ] **Step 4: Run browser acceptance**

Run the same command. Expected: PASS with the new layout checks.

- [ ] **Step 5: Commit**

```bash
git add apps/gallery/src/style.css apps/gallery/scripts/browser-check.mjs
git commit -m "fix: restore gallery wall grid layout"
```

### Task 2: Consolidate Display Mode

**Files:**
- Modify: `apps/desktop/src/shared/schema.js`
- Modify: `apps/desktop/src/main.js`
- Modify: `apps/desktop/src/main/settings.js`
- Modify: `apps/desktop/src/renderer/settings.js`
- Test: `apps/desktop/test/schema.test.mjs`
- Test: `apps/desktop/test/security.test.mjs`

**Interfaces:**
- Consumes: raw prefs that may contain legacy `form` and `formBoth`.
- Produces: `displayMode: 'island' | 'ball' | 'both'`; main reads and writes
  only this value.

- [ ] **Step 1: Add failing migration and source-shape tests**

Test legacy migration, new-value precedence, patch acceptance, and absence of
duplicate mode controls in settings.

- [ ] **Step 2: Run desktop tests and verify failure**

Run: `pnpm --filter @emojitot/desktop test`

Expected: FAIL because `displayMode` is not in the schema.

- [ ] **Step 3: Implement canonical display mode**

Add schema migration, update `applyForm`, remove form/both writes, render one
segmented control, and remove stale visibility actions.

- [ ] **Step 4: Run desktop tests**

Run: `pnpm --filter @emojitot/desktop test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/schema.js apps/desktop/src/main.js apps/desktop/src/main/settings.js apps/desktop/src/renderer/settings.js apps/desktop/test/schema.test.mjs apps/desktop/test/security.test.mjs
git commit -m "refactor: unify desktop display mode"
```

### Task 3: Restore Island Hierarchy and Accessible Paging

**Files:**
- Modify: `apps/desktop/src/renderer/island.js`
- Modify: `apps/desktop/src/renderer/island.css`
- Modify: `apps/desktop/scripts/window-smoke.mjs`

**Interfaces:**
- Consumes: existing `#page-title`, `.top-media`, `media`, and `enabledPages()`.
- Produces: stable page title, secondary media title, hidden pager for one page,
  and larger pointer targets.

- [ ] **Step 1: Add failing desktop smoke checks**

With synthetic media active, assert the page title stays equal to the page name
and `.top-media` contains the media title. With one page, assert dots and pagers
are hidden. Assert dot/pager hit boxes meet the spec.

- [ ] **Step 2: Run desktop smoke and verify failure**

Run: `pnpm smoke:desktop`

Expected: FAIL on title/media or target-size checks.

- [ ] **Step 3: Implement presentation changes**

Render media into the existing secondary slot, keep page title page-oriented,
hide all paging affordances for one page, and enlarge transparent hit areas.

- [ ] **Step 4: Run desktop smoke**

Run: `pnpm smoke:desktop`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/island.js apps/desktop/src/renderer/island.css apps/desktop/scripts/window-smoke.mjs
git commit -m "fix: clarify island hierarchy and paging targets"
```

### Task 4: Improve Settings Search, Reordering, and Contrast

**Files:**
- Modify: `apps/desktop/src/renderer/settings.js`
- Modify: `apps/desktop/src/renderer/settings.css`
- Test: `apps/desktop/test/schema.test.mjs`

**Interfaces:**
- Consumes: `SETTINGS_NAV`, page renderers, `data-order-list`.
- Produces: accessible search across page/control labels, move-up/down buttons,
  keyboard reordering, and readable faint text.

- [ ] **Step 1: Add failing source-shape tests**

Assert an accessible search label, page-content search helper, move buttons in
order rows, keyboard handling, and dark faint opacity of at least 0.5.

- [ ] **Step 2: Run desktop tests and verify failure**

Run: `pnpm --filter @emojitot/desktop test`

Expected: FAIL on missing search/reorder/accessibility markers.

- [ ] **Step 3: Implement settings usability changes**

Build a memoized search index from page render output, preserve the filter while
typing, add search-result context, render move controls, and support arrow-key
reordering from the order row.

- [ ] **Step 4: Run desktop tests**

Run: `pnpm --filter @emojitot/desktop test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/settings.js apps/desktop/src/renderer/settings.css apps/desktop/test/schema.test.mjs
git commit -m "feat: improve settings search and keyboard ordering"
```

### Task 5: Add Page Presets

**Files:**
- Modify: `apps/desktop/src/shared/schema.js`
- Modify: `apps/desktop/src/renderer/settings.js`
- Test: `apps/desktop/test/schema.test.mjs`
- Modify: `docs/SETTINGS.md`

**Interfaces:**
- Consumes: `PAGE_MANIFEST`, `STATUS_MANIFEST`, `DEFAULTS`.
- Produces: `PRESET_MANIFEST` and `presetPatch(key)`.

- [ ] **Step 1: Add failing preset tests**

Assert each preset sets the documented pages/status/features, `full` restores the
default surface set, and every preset keeps clipboard history off.

- [ ] **Step 2: Run desktop tests and verify failure**

Run: `pnpm --filter @emojitot/desktop test`

Expected: FAIL because preset exports do not exist.

- [ ] **Step 3: Implement pure presets and render them**

Add schema data/helper and a General-settings card with four plain-language
choices that apply one patch.

- [ ] **Step 4: Run desktop tests and settings/docs checks**

Run: `pnpm --filter @emojitot/desktop test && pnpm settings:check && pnpm docs:check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/schema.js apps/desktop/src/renderer/settings.js apps/desktop/test/schema.test.mjs docs/SETTINGS.md docs/SETTINGS-AUDIT.md
git commit -m "feat: add page and status presets"
```
