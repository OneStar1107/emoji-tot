# Progress Log

## Session: 2026-11-23

### Current Status
- **Phase:** 3 - Root-Cause Triage
- **Started:** 2026-11-23

### Actions Taken
- Read the project instructions and selected planning, systematic-debugging, verification, and brainstorming skills.
- Attempted GraphFlow context and brief; both returned no usable payload.
- Confirmed a clean starting worktree and initialized a persistent audit plan.
- Read root/workspace package manifests and the main README.
- Read the UI audit, design backlog, and generated settings audit.
- Verified the runtime versions and began the documented baseline validation.

### Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Baseline worktree | Clean | Clean before planning files | PASS |
| GraphFlow context | Indexed summary/anchors | Empty `ok` response | ENVIRONMENT LIMITATION |
| Runtime versions | Documented floors | Node 24.22.1, pnpm 12.9.1 | PASS |
| `pnpm test` | All suites pass | 332 + 33 + 18 tests passed | PASS |
| `pnpm typecheck` | No type errors | Core and protocol passed | PASS |
| `pnpm settings:check` | Generated audit is current | Stale generated file | FAIL |
| `pnpm scan` | No publish blocker | Two public-email findings | FAIL |
| `pnpm build` | Core/protocol compile | Passed | PASS |
| `pnpm docs:check` | Facts/generated docs consistent | Passed, 28 markers | PASS |
| `pnpm audit:ci` | No moderate+ vulnerabilities | None found | PASS |
| `pnpm preview` | Every protocol id and face renders | 51/51 ids, 61/61 faces | PASS |
| `pnpm check:gallery` | Site browser acceptance | 20/20 checks | PASS |
| `pnpm smoke:desktop` | Real Electron window smoke | 7/7 checks | PASS |
| `pnpm ui:audit -- --json` | Run against installed app | Installed app missing | ENVIRONMENT LIMITATION |
| `ui:audit --exe release/win-unpacked/EmojiTot.exe` | Run against packed app | Process exited `0x80000003` before CDP | FAIL / INVESTIGATE |
| `ui:audit --exe <ASCII temp copy>` | Default 11 island + 15 settings pages | 0 violations | PASS |
| `ui:audit --skins all --stress` on ASCII copy | Five-skin pressure matrix | 0 violations; one temp-profile cleanup warning | PASS WITH WARNING |
| `pnpm version:check` | Current version newer than last tag | Already tagged `v0.8.18` | EXPECTED RELEASE-GATE FAILURE |

### Errors
| Error | Resolution |
|-------|------------|
