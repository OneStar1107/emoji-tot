<div align="center">

# EmojiTot

**A character engine for the desktop and the web — 15 characters from 15 bodies × hand-written outlines × 12 colours, 44 expressions driven by one two-digit number. Visible in a page, livable on a desktop.**

[Console](https://onestar1107.github.io/emoji-tot/#/console) · [Faces](https://onestar1107.github.io/emoji-tot/#/gallery) · [Scene](https://onestar1107.github.io/emoji-tot/#/scene) · [Docs](https://onestar1107.github.io/emoji-tot/#/docs) · [中文](README.md)

![Cast](docs/screenshots/hero.png)

> **About**
> A character engine drawn from formulas: 15 characters from 15 hand-written outlines × 12 colours, and 44 expressions driven by one two-digit number. The desktop pet, the console and the site share one engine, with zero image assets.
>
> 一个用 SVG 画出来的角色引擎：15 个角色各有自己手写的闭合轮廓，44 个表情分生命周期 / 情绪 / 代理工作三组，默认模切白边画风。桌宠、控制台、站点共用同一套引擎，零图片资源。

</div>

---

## Download

| File | For |
| --- | --- |
| [EmojiTot Setup 0.2.0.exe](https://github.com/OneStar1107/emoji-tot/releases/download/v0.2.0/EmojiTot-Setup-0.2.0.exe) | Installer — starts from the Start menu |
| [EmojiTot Portable 0.2.0.exe](https://github.com/OneStar1107/emoji-tot/releases/download/v0.2.0/EmojiTot-Portable-0.2.0.exe) | Portable — double-click, writes nothing to the registry |

Windows x64 · unsigned (SmartScreen may ask you to run it anyway) · [all releases](https://github.com/OneStar1107/emoji-tot/releases)

## What this is

**A character is a genome, not an image.** No spritesheets, no Lottie files, and not one hand-drawn character: a character is `{ body, color, face }` — the body is a hand-written closed Bezier outline, the colour picks the ink for the face, and the expression is a small vocabulary of eyes and mouths. Add a row and there is a new character.

| Axis | Count | How |
| --- | --- | --- |
| Bodies | 15 | circle, egg, squircle, drop, star, gem, petal, cloud, heart, ghost, tot… all sampled from `r(t)` or a short parametric curve |
| Finish | 2 | 6 ears, 8 things on top, 5 on the sides, 6 surface markings; each anchors to the body's height and pointiness |
| Colours | 12 | flat hexes; the face ink inverts by luminance |
| Expressions | 44 | 9 eye styles × 10 mouth styles plus lean, indexed by the protocol's state names |
| Characters | 15 | One per body, each with its own expression and motion |
| Offspring | unbounded | `breed(a, b, seed)` crosses two genomes; nothing is stored |

Three parts, all written from scratch in this repository:

| Part | Where | What it does |
| --- | --- | --- |
| Character engine | `packages/core` | Parametric bodies, trait anchoring, an expression vocabulary, four-layer composition, SVG out |
| Two-digit protocol | `packages/protocol` | Turns two digits into a state, with arbitration, an event bridge and forgiving parsing |
| Desktop & site | `apps/desktop` · `apps/gallery` | A pet that docks to the screen edge; console, cast wall, scene, docs |

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
| **Console** | Pick one of 15 characters, then adjust body, colour, traits and expression; the component snippet and the JSON genome follow every change |
| **Faces** | Two walls: the 15-member cast wall (filter by family) and the 44-expression wall; clicking a character jumps to the console |
| **Scene** | Fourteen characters on one stage, each changing expression on its own timer; click one and it answers; party / sleep / reshuffle |
| **Docs** | How the engine draws, how a genome is composed, what each digit means, how to call it — generated from code, so it cannot go stale |

![Scene](docs/screenshots/scene.png)

## The desktop pet

![Faces](docs/screenshots/faces.png)

The same ball can live on any desktop (Windows / macOS):

- **Edge docking** — drag it to a left or right edge and it tucks away, leaving 30% on screen; hover the sliver and it slides back out. The drop happens with the cursor on the edge, so it only opens after the pointer has left once.
- **Click-through** — the window never eats a click meant for the desktop behind it; input is taken back only when the pointer is on the ball.
- **Agent linkage** — DeepSeek Harness, Claude Code and Codex can each drive the face from their own status file.
- **One file is the whole interface** — `%APPDATA%/EmojiTot/state.json` on Windows, `~/Library/Application Support/EmojiTot/` on macOS. A bare id, a JSON string or a JSON object all work; malformed writes keep the current face.

```bash
echo '{"emotionId":"34","tips":"build failed"}' > "$APPDATA/EmojiTot/state.json"
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
pnpm --filter @emojitot/desktop dist   # Windows installer lands in release/
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
| Protocol table | 23 tests covering id validity, state mapping, event flags and segment bounds |
| 51 states render | `node apps/gallery/scripts/preview.mjs` — 51/51, 0 failures, in Node with no browser |
| Desktop window behaviour | `node apps/desktop/scripts/ui-check.mjs <port>` — drives the real cursor, 7/7 (dock, open, tuck, click-through) |
| Desktop protocol | write `34` → `alerting`, `33` → `celebrate`, malformed JSON → keeps the current face |

## Deliberate trade-offs

- **Urgent events interrupt.** Upstream always queues events until the dwell ends; here an event that outranks what is on screen interrupts it — a failure must be seen immediately — while lesser ones still queue, so bursts do not flicker.
- **Static colours are rewritten, not inverted.** The static renderer writes its ink as a `prefers-color-scheme` media query; pinning a page colour means rewriting that query. A CSS invert would flip the blush and the bang too.
- **Click-through polls the cursor.** `setIgnoreMouseEvents(forward)` did not forward mousemove on the test machine, so the page never learned the pointer was on the ball and the ball could neither be clicked nor dragged. Polling the cursor every 60 ms behaves the same on both platforms.

## Licence

**MIT.** The engine, the protocol, the pages and every character were implemented from scratch in this repository: use it commercially, close-source it, redistribute it — keep the copyright notice.

No third-party character engine's code or art is included.

---

Made by [OneStar1107](https://github.com/OneStar1107) · [MIT](LICENSE)