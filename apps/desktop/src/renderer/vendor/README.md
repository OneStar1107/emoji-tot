# renderer/vendor

Two folders, both generated — do not edit them by hand:

- `core/` — the built output of `packages/core` (this repository, MIT).
  The page imports `element.js`, which registers `<emojibot-ball>`.
- (the protocol lives in `../../vendor/protocol`, because only the main process
  needs it)

Regenerate with:

```bash
node apps/desktop/scripts/copy-vendor.mjs
```

Nothing from any upstream engine is vendored here any more: the character is
drawn by `@emojibot/core`.
