<div align="center">

# EmojiBot

**An expressive character for the desktop and the web — one two-digit number drives 71 cast members, 3 drawing styles, 16 variants and 7 themes. Visible in a page, livable on a desktop.**

[Console](https://onestar1107.github.io/emojibot-studio/#/console) · [Faces](https://onestar1107.github.io/emojibot-studio/#/gallery) · [Scene](https://onestar1107.github.io/emojibot-studio/#/scene) · [Themes](https://onestar1107.github.io/emojibot-studio/#/themes) · [Docs](https://onestar1107.github.io/emojibot-studio/#/docs) · [中文](README.md)

![Cast](docs/screenshots/hero.png)

</div>

---

## What this is

**The character is drawn, not shipped as an image.** No spritesheets, no Lottie files: every body is a contour in code (with ears, leaves or antennae as separate parts), every expression is a short curve described by a few numbers, spring-interpolated, written into SVG attributes each frame by one `requestAnimationFrame` loop.

Three upstreams, each doing what it is best at:

| Upstream | Contribution | Here |
| --- | --- | --- |
| [Emotion Ball](https://github.com/Aithena/emotion-ball) | The two-digit emotion id protocol, decade semantics, forgiving intake | `packages/protocol` |
| [Aora Bot](https://github.com/sam70361/aora-bot) | The engine: 71 cast members, 3 style series, 16 variants, 7 themes, HUD, particles | npm `@aora-bot/*` |
| [球球桌宠](https://github.com/dreamcall520/emotion-ball-desktop-pet) | Desktop product behaviour: edge docking, click-through, agent linkage | `apps/desktop` |

## One two-digit number

The agent sends an id; the host turns it into a face. Ids are grouped by decade, and an unknown one falls back inside its decade instead of blanking the face.

| Segment | Ids | Meaning |
| --- | --- | --- |
| Lifecycle | `00`–`09` | asleep, waking, idle, spacing out, dragging |
| Feeling | `10`–`29` | happy, puzzled, down, surprised, shy, angry… |
| Agent work | `30`–`49` | thinking, busy, done, error, searching, writing… |
| Signalling | `50`–`59` | notify, scan, message |

```js
feed('34');                    // error: red bang + a shake
feed('{"emotionId":"33"}');    // done: confetti
feed('thinking');              // a bare state name works too
```

## The site

![Console](docs/screenshots/console.png)

| Page | What is there |
| --- | --- |
| **Console** | 71 cast · 71 shapes · 11 colours · 3 style series with 16 variants · 51 states · 5 stage backgrounds. The parameter panel lists only what the current variant actually reads, and the snippet follows every change |
| **Faces** | All 51 ids on one screen, filtered by decade, click to copy the snippet |
| **Scene** | Nine agents report; one face shows what the arbiter decided — the "urgent event interrupts the dwell" rule made visible |
| **Themes** | Seven seasonal sets, loaded on click (code-split), drawing their own shapes |
| **Docs** | Install, protocol, imperative actions, desktop — Chinese and English |

![Scene](docs/screenshots/scene.png)

## The desktop pet

![Faces](docs/screenshots/faces.png)

The same ball can live on any desktop (Windows / macOS):

- **Edge docking** — drag it to a left or right edge and it tucks away, leaving 30% on screen; hover the sliver and it slides back out. The drop happens with the cursor on the edge, so it only opens after the pointer has left once.
- **Click-through** — the window never eats a click meant for the desktop behind it; input is taken back only when the pointer is on the ball.
- **Agent linkage** — DeepSeek Harness, Claude Code and Codex can each drive the face from their own status file.
- **One file is the whole interface** — `%APPDATA%/EmojiBot/state.json` on Windows, `~/Library/Application Support/EmojiBot/` on macOS. A bare id, a JSON string or a JSON object all work; malformed writes keep the current face.

```bash
echo '{"emotionId":"34","tips":"build failed"}' > "$APPDATA/EmojiBot/state.json"
```

## Quick start

```bash
pnpm install     # builds the protocol package automatically (postinstall)
pnpm dev         # site at http://localhost:5173
pnpm desktop     # the desktop pet
pnpm test        # 27 protocol tests, including a row-by-row comparison with upstream
```

Package the app:

```bash
pnpm --filter @emojibot-studio/desktop dist   # Windows installer lands in release/
```

## Layout

```
packages/protocol    zero runtime dependencies: 51 ids, parsing, arbitration, event bridge (ESM + CJS)
apps/gallery         the site: console / faces / scene / themes / docs
apps/desktop         the pet: docking, click-through, agent linkage, tray
```

## Verification

Not "it should run" — it was run:

| Check | Evidence |
| --- | --- |
| Protocol table | 27 tests, 4 of them comparing id / state / event flags / segment bounds against `@aora-bot/engine` row by row — upstream changes turn them red |
| 51 states render | `node apps/gallery/scripts/preview.mjs` — 51/51, 0 failures, in Node with no browser |
| Desktop window behaviour | `node apps/desktop/scripts/ui-check.mjs <port>` — drives the real cursor, 7/7 (dock, open, tuck, click-through) |
| Desktop protocol | write `34` → `alerting`, `33` → `celebrate`, malformed JSON → keeps the current face |

## Deliberate trade-offs

- **Urgent events interrupt.** Upstream always queues events until the dwell ends; here an event that outranks what is on screen interrupts it — a failure must be seen immediately — while lesser ones still queue, so bursts do not flicker.
- **Static colours are rewritten, not inverted.** The static renderer writes its ink as a `prefers-color-scheme` media query; pinning a page colour means rewriting that query. A CSS invert would flip the blush and the bang too.
- **Click-through polls the cursor.** `setIgnoreMouseEvents(forward)` did not forward mousemove on the test machine, so the page never learned the pointer was on the ball and the ball could neither be clicked nor dragged. Polling the cursor every 60 ms behaves the same on both platforms.

## Licence

Non-commercial share-alike. Each upstream licence continues to apply; commercial use requires contacting each author:

- Aora Bot — Aora Bot License 1.1, commercial licensing via 1251579308@qq.com
- Emotion Ball — dual licence, same contact for commercial use
- 球球桌宠 — learning and research only; **never** commercially licensed

See [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) and [CREDITS.md](CREDITS.md).

---

Powered by [Aora Bot](https://github.com/sam70361/aora-bot) · Expression semantics from [Emotion Ball](https://github.com/Aithena/emotion-ball) · Desktop design informed by [球球桌宠](https://github.com/dreamcall520/emotion-ball-desktop-pet)
