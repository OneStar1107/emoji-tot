# EmojiTot UI and Product Polish

## Intent

EmojiTot already has more features than a new user can absorb. The next pass
makes the existing experience trustworthy and easier to enter before adding
more modules.

## Goals

- Repair the Gallery character wall's broken desktop layout.
- Give the desktop app one canonical display-mode control instead of three
  overlapping controls.
- Keep the current page name as the island's primary heading while media is
  playing, and expose now-playing as secondary information.
- Make compact island controls and settings controls usable by keyboard and
  pointer without changing the established visual language.
- Offer clear page/status presets so a fresh profile does not start with every
  feature enabled.

## Non-goals

- Command palette, agent history, configuration import/export, scheduled quiet
  hours, per-display profiles, and a public plugin API are follow-up work.
- No new visual theme, icon family, framework, or external runtime dependency.

## Decisions

### Gallery wall

The view markup owns `wall-tabs`, `wall-filters`, and `wall-grid`. CSS must use
those exact classes. Browser acceptance must assert computed layout, not only
tile counts.

### Display mode

Preferences store one `displayMode` value: `island`, `ball`, or `both`.
Legacy `form`/`formBoth` values are migrated when preferences are read. Settings
exposes one three-state control; launch and current visibility cannot diverge.

### Island hierarchy

The header title always names the current page. When media is active, its title
appears in the secondary media slot and in the collapsed pill according to the
existing lyric/status preference. A one-page island does not render pager
controls.

### Accessibility floor

- Compact page dots receive at least a 24px pointer area; pager buttons are at
  least 32px.
- Settings search has an accessible name and searches setting labels within
  pages, not only the rail labels.
- Reordering offers keyboard-operable move-up/move-down controls in addition to
  drag and drop.
- Dark-theme faint text raises from 34% to 50% ink opacity so 11px secondary
  text is not rendered below a readable contrast.

### Presets

Presets are pure schema data and produce one preference patch:

- Minimal: island, battery/time status, weather only.
- Work: island, music/quota/todo/focus/calendar, quota status.
- Life: island, weather/todo/health/shelf/calendar/devices, weather status.
- Full: all pages and the existing default status items.

Presets never enable clipboard history.

## Acceptance

- Gallery desktop wall has multiple columns and a computed `display: grid`.
- Legacy prefs migrate to one display mode; changing any other preference does
  not resurrect a hidden surface.
- Island header remains page-oriented with media active.
- Settings can be searched and reordered without a pointer.
- `pnpm check` passes.
