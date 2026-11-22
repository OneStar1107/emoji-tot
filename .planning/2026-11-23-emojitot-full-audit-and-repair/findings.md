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
- `electron-builder --dir` initially stalled while trying to fetch an Electron distribution; pointing `build.electronDist` at the installed workspace Electron reduced normal packing to about six seconds.
- Full `electron-builder` distribution succeeded with the same local Electron path, producing the NSIS installer, block map and portable executable for `0.8.18`.
- The UI audit's initial Windows cleanup retry window was too short; after extending it, a fresh default audit closed cleanly and removed its ASCII runtime copy.
- README English, NOTICE, gallery structured data/footer, device-battery notes, and package manifests all had stale MIT or old license wording. They now agree on the EmojiTot Noncommercial License.
- The README portable download filename was missing the `.portable` suffix used by the actual generated artifact.

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
| Packaging waits on a redundant Electron download | Use the installed Electron distribution and test the config |
| English README, gallery, NOTICE and package metadata said MIT | Align all current user-facing and package metadata with the root noncommercial license |
| Temp profile/runtime cleanup was intermittent on Windows | Extend retries until the OS releases handles |

## Remaining Gaps
- The plugin settings page remains an explicitly reserved empty state; opening a sandboxed plugin runtime is a substantial future project.
- Installers remain unsigned, as documented in `docs/SIGNING.md`; this audit did not add a certificate.
- The island cannot use DWM acrylic: the material fills the window's rectangular transparent padding, while its rounded silhouette is authored in CSS. The delivered `frost` skin uses a five-layer CSS surface and never captures the screen.

## Glass Reference Analysis
- The three reference images are dark frosted-glass capsules rather than strongly refractive liquid glass.
- Shared visual traits: approximately 20–28px backdrop blur, 62–74% dark tint, slight saturation lift, 1px translucent border, inner top highlight, darker bottom edge, soft shadow and 1–3% noise.
- Image 1 takes on the purple/cyan backdrop; image 2 is a neutral charcoal hover bar; image 3 has the largest blur radius and darkest tint over foliage.
- Tot currently has no live desktop blur. `frost` paints a flat/noise gradient because screenshot glass was removed in 0.8.18.
- The renderer already has an unused `data-material="acrylic"` path, but the panel and pill still end their background stacks with `var(--card-solid)`, so enabling the flag alone cannot reveal a real backdrop.
- Electron 45 exposes `backgroundMaterial: 'acrylic'` and `setBackgroundMaterial('acrylic')` on Windows 11 22H2+, plus experimental `setShape`.
- Before this pass, the island window did not request a background material or set an acrylic-specific region; the ball window asks for `systemMaterial()`, which still returns `none` because only the island was in scope.
- The first native implementation leaked the acrylic client rectangle around the pill and passed DIP measurements into `setShape`, which Windows interpreted as physical pixels. At 150% scaling the region extended past the window, clipping the left side and the expanded panel's bottom-left corner.
- The final fix removes `backgroundMaterial`, `roundedCorners`, `activeMaterial`, `applyMaterialShape` and `setShape` from the island. The window reports `{"bridge":"none","body":"none"}`, and the smoke test measures equal 999px pill corners and equal 22px panel corners.
- CSS Liquid Glass is a visual simulation, not a live desktop refraction. `frost` combines a translucent tint, specular highlight, angled sheen, violet/cyan refractions, a darkened lower edge and fine grain; `backdrop-filter` is deliberately off because a transparent Electron window cannot sample the desktop behind it.

## Launcher Findings
- Electron 45 must be launched from an ASCII-only path; it exits before app JavaScript runs under the Chinese repository path.
- A native Windows wrapper can run from any path, stage `EmojiTotRuntime.exe` and its adjacent distribution into an ASCII cache, then launch it.
- The launcher must forward command-line arguments and expose its own path so login-at-startup points back to the wrapper rather than the cached runtime.
- `electron-builder` has `executableName`, but using it for the runtime would also change shortcut targets. A post-pack rename of the packed executable to `EmojiTotRuntime.exe` and injection of the launcher as `EmojiTot.exe` preserves existing shortcuts and installer expectations.
- The NSIS portable wrapper is itself path-sensitive: it succeeds from an ASCII path and exits `0x80000003` from the Chinese workspace even though it extracts the app to `%TEMP%`. The public portable artifact therefore carries its own native bootstrap and extracts the NSIS payload into an ASCII cache before execution.
- Cache keys must follow the launcher build identity, not only the Electron binary. The exact same Electron runtime accompanies every app build, so a runtime-only key can reuse stale application files.
- Low-integrity build folders can prevent writes to `%LOCALAPPDATA%`. Generated trees are raised to Medium integrity, and both launchers try `%TEMP%\Low` as a safe fallback.

## Build Version Findings
- Electron-builder already understands `config.buildVersion` and can derive it from `buildNumber`/CI environment variables.
- Before this pass, Tot documentation specified a fourth build segment but the desktop/root package metadata did not provide it.
- For frequent local installs, the public three-part version should remain stable while a deterministic fourth segment increments for every build.
- The build wrapper now generates `.build-number` locally, accepts `EMOJITOT_BUILD_NUMBER` / `BUILD_NUMBER`, writes `build-info.json`, synchronizes gallery/core/protocol versions, and supplies `${buildVersion}` to installer and portable artifact names.

## Resources
- `README.md`, `docs/ARCHITECTURE.md`, `docs/UI-AUDIT.md`, `docs/SETTINGS-AUDIT.md`
- `docs/superpowers/specs/2026-11-19-audit-fixes-design.md`
- `docs/superpowers/specs/2026-11-19-ui-product-polish-design.md`
- Root `package.json` validation scripts
- `scripts/settings-audit.mjs`, `scripts/scan-sensitive.mjs`
