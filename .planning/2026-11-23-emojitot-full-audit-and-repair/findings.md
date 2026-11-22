# Findings & Decisions

## Requirements
- Inspect the current documentation and relevant files.
- Run the program's complete available test and validation surface.
- Identify bugs, functional shortcomings, and incomplete capabilities.
- Fix confirmed bugs and make justified, bounded improvements.
- Re-test the result and report remaining constraints honestly.

## Research Findings
- Repository is a pnpm workspace with `@emojitot/core`, `@emojitot/protocol`, `@emojitot/gallery`, and `@emojitot/desktop`.
- Root version is `0.8.18`; gallery/core/protocol package versions are `0.8.11`, which needs consistency checking.
- The documented `pnpm check` pipeline includes typecheck, build, all tests, docs consistency, settings audit, preview, gallery browser check, desktop Electron smoke, dependency audit, and secret scan.
- The README documents 11 island pages, 15 settings pages, five island skins, desktop double-mode behavior, local-only data, and a two-digit state-file protocol.
- The current worktree was clean before the audit plan was created.
- GraphFlow's available `gf_read` and `gf_macro brief` calls returned only `{"tool":...,"ok":true}` with no context payload.
- Environment: Node `24.22.1`, pnpm `12.9.1`; package engines require Node >= 22.12 and pnpm >= 12.
- Baseline unit/integration result: 332 desktop tests, 33 protocol tests, and 18 core tests all pass.
- Baseline typecheck passes for core and protocol.
- `pnpm settings:check` fails because `docs/SETTINGS-AUDIT.md` is stale.
- `pnpm scan` fails because it treats the intentionally published support email in `README.md` and historical `docs/RELEASE-NOTES.md` as sensitive.
- Root-level `pnpm exec electron` does not resolve the desktop workspace's Electron binary; this is a command-scope issue, not yet proof that the launcher/smoke path is broken.
- `pnpm build`, `pnpm docs:check`, `pnpm audit:ci`, `pnpm preview` (51/51 ids, 61/61 faces), `pnpm check:gallery` (20/20), and `pnpm smoke:desktop` (7/7) pass.
- The packed app exists in `release/win-unpacked/EmojiTot.exe`, but `ui:audit --exe` exits immediately with process code `2147483651` (`0x80000003`) from the repository's non-ASCII path.
- Development Electron smoke succeeds because `electron-runtime.mjs` copies Electron to an ASCII cache before launch; the packed executable has no equivalent relocation.
- `release` contains `EmojiTot.Setup.0.8.18.exe`, `EmojiTot.0.8.18.portable.exe`, and unpacked app output from the current version.
- Copying the same `release/win-unpacked` tree to an ASCII-only temp path makes it launch successfully, confirming the failure is path-sensitive rather than a corrupt package.
- Packed-app default UI audit passes: 11/11 island pages, 15/15 settings pages, 0 layout violations.
- Packed-app skin × stress matrix passes: 55 island page measurements, 15 settings page measurements, 0 violations. The audit emitted a warning that one temporary browser profile could not be removed immediately.
- `docs/UI-AUDIT.md` and the UI audit help still describe the old 10 island / 14 settings page counts.
- `README.md` still says the app captures the screen to draw glass; release 0.8.18 explicitly removed capture-based glass.
- `docs/CHANGELOG.md` has an unlabeled top section and omits headings for 0.8.15 through 0.8.18.
- `pnpm version:check` reports the current `0.8.18` is not newer than tag `v0.8.18`. This is expected on an already released tree and is a release-only gate, not a runtime failure.
- The Plugins settings page intentionally remains an empty reserved state; implementing a sandboxed plugin runtime is a larger future feature, not a defect to patch inside this pass.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Start with documented validation commands before changing source | Gives objective baseline evidence and avoids fixing imaginary issues |
| Treat known backlog/spec documents as direction, not automatic scope approval | The user requested meaningful completion, but changes still need to fit the product and verification budget |
| Reproduce the full documented check per stage | The aggregate `pnpm check` stops at the first failure and hides later runtime failures |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| GraphFlow returned no context | Proceed with targeted `rg`, docs, and entry-point inspection |
| Settings audit is stale | Regenerate it, then diff against schema and expectations |
| Sensitive scan rejects a public contact address | Determine whether the scanner should whitelist this specific documented contact or the docs should stop publishing it |
| Packed app exits before CDP under a non-ASCII repository path | Test the same packed app from an ASCII-only temp directory and make the audit stage it automatically |
| UI audit docs say 10/14 pages | Update both help text and documentation to current 11/15 counts or remove hard-coded counts |
| README claims screen capture glass | Correct the privacy description to match the current solid-surface implementation |
| Changelog headings missing | Restore explicit 0.8.15–0.8.18 sections without rewriting historical behavior |

## Resources
- `README.md`, `docs/ARCHITECTURE.md`, `docs/UI-AUDIT.md`, `docs/SETTINGS-AUDIT.md`
- `docs/superpowers/specs/2026-11-19-audit-fixes-design.md`
- `docs/superpowers/specs/2026-11-19-ui-product-polish-design.md`
- Root `package.json` validation scripts
- `scripts/settings-audit.mjs`, `scripts/scan-sensitive.mjs`
