# Implementation Plan: MCP Server Proxy

## Overview

Implement the `mcp/server.ts` stdio adapter and `.kiro/settings/mcp.json` registration described by the requirements and design. The work stays as a thin proxy over `/api/ingest`, `/api/patch`, and `scanSource`, with pure projection/cache/verification helpers kept testable through Vitest. No local repository mutation, patch application, branch creation, commit, pull request, `autoApprove`, HTTP/SSE MCP transport, durable cache, or new scanner rule is included.

## Tasks

- [x] 1. Prepare MCP server prerequisites and test seams
  - [x] 1.1 Verify the installed MCP SDK and Zod APIs, then add only the required runtime/dev dependencies or project test configuration needed to import `@modelcontextprotocol/sdk`, `zod`, and Vitest from `mcp/server.ts` and its tests.
    - Keep the existing Next/Vitest conventions and do not change application source files.
    - _Requirements: 1.1, 4.1, 11.5_
  - [x] 1.2 Define the server-local TypeScript interfaces and bounded constants for tool names, cache entries, compact analysis/findings, patch responses, and derived verification results.
    - Reuse `RepoAnalysis`, `RepoNode`, `RepoFinding`, `scanSource`, and `isPatchable` instead of duplicating analyzer contracts.
    - _Requirements: 3.4, 5.2, 6.1, 7.2, 8.4_

- [x] 2. Implement and test Zod tool schemas
  - [x] 2.1 Implement strict schemas for `analyze_repo`, `get_findings`, `scan_code`, and `synthesize_patch`, including trimming, bounded lengths, optional dependency/importer arrays, and rejection of unknown keys.
    - Do not add `autoApprove`, findings supplied by clients, patch application options, or mutation options.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 8.7_
  - [x] 2.2 Write Vitest schema validation tests covering valid inputs, empty and malformed strings, oversized URL/path/code/list values, unknown keys, and optional array bounds.
    - Assert invalid input names the offending argument and reaches no proxy, scanner, or cache side effect through the handler seam.
    - _Requirements: 4.6, 4.7, 10.1_

- [x] 3. Implement pure analysis, finding, and cache helpers
  - [x] 3.1 Implement compact analysis summarization and deterministic file ranking.
    - Return title, default branch, rot summary, overall rot, coverage, and at most 10 `{ path, score, findingCount }` entries sorted by descending rot and path.
    - Exclude edges, code, complete nodes, notes, recommendations, and repository contents.
    - _Requirements: 5.2, 5.3, 5.4, 5.7_
  - [x] 3.2 Implement finding projection for static and AI-derived material.
    - Project only `line`, `kind`, `text`, `suggestion`, and `source`; retain `static` as authoritative and map AI-derived material to `ai-unverified`.
    - _Requirements: 6.1, 6.2, 6.6, 7.2, 7.3_
  - [x] 3.3 Implement exact-string cache helpers for successful replacement, failed-refresh preservation, exact URL isolation, node lookup, and missing URL/path errors.
    - Keep the cache process-local in a `Map`; never persist it or merge entries across URLs.
    - _Requirements: 5.1, 5.5, 6.3, 6.4, 6.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 3.4 Write Vitest tests for summarization, finding projection, and cache transitions.
    - Cover compact-field exclusion and ten-file bound, static versus AI authority labels, replacement, failed refresh preservation, exact-key isolation, missing cache, and missing path.
    - _Requirements: 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 9.2, 9.3, 9.6_

- [x] 4. Implement scanner and patch-verification adapters
  - [x] 4.1 Implement `scan_code` as a thin adapter over the shared `scanSource(path, code)` function.
    - Preserve finding kinds, lines, texts, suggestions, static authority, and explicit empty results without adding scanner rules.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [x] 4.2 Implement patch response shape validation and pure derivation of `edits` and `verification`.
    - Set `changed` from `patchedCode !== originalCode`; derive counts/status only from `fixed` and `remaining`; report unchanged code as `no-change`.
    - Never return or imply auto-approval, local application, branch creation, commit, or pull request.
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  - [x] 4.3 Write Vitest scanner-parity tests against representative TypeScript, JavaScript, Python, and Go inputs.
    - Compare the MCP projection with `scanSource` for finding kind, line, text, suggestion, source, and no-finding cases.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 4.4 Write Vitest patch-derivation tests for accepted changes, changed code with remaining findings, unchanged fallback, empty fixed/remaining arrays, and malformed endpoint responses.
    - Assert no derived result exposes an `autoApprove` field or claims that a file was applied.
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

- [x] 5. Implement safe Next application proxy and error mapping
  - [x] 5.1 Implement base URL resolution and bounded JSON POST helpers for `/api/ingest` and `/api/patch`.
    - Use trimmed `NECRO_API_URL` or `http://localhost:3000`; parse ingest as direct `RepoAnalysis`; validate endpoint response shapes before caching or reporting success.
    - Forward only `{ repoUrl }` to ingest and `{ path, code, dependencies?, importedBy? }` to patch.
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 8.1, 8.2, 8.9_
  - [x] 5.2 Implement actionable error classification for validation, invalid/non-GitHub URL, unavailable Next application, timeout/network failure, GitHub rate limit, repository access failure, and unexpected ingest/patch shapes.
    - Redact credentials and do not include full source, patch contents, request bodies, or tokens in errors.
    - _Requirements: 3.5, 5.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [x] 5.3 Write Vitest proxy tests with mocked `fetch` for direct ingest success, cache-after-validation, failed refresh preservation, patch forwarding, malformed responses, HTTP failures, rate limiting, and unavailable Next.
    - Assert optional patch context is forwarded only when supplied and client findings/`autoApprove` are never forwarded.
    - _Requirements: 3.2, 3.3, 3.5, 5.1, 5.6, 8.1, 8.2, 8.9, 10.2, 10.3_

- [x] 6. Implement the four MCP tools and stdio server entry point
  - [x] 6.1 Create `mcp/server.ts` with the SDK `Server`, exactly four registered tools, strict schemas, concise structured/text results, and handlers wired to the helpers and proxy boundaries.
    - Register only `analyze_repo`, `get_findings`, `scan_code`, and `synthesize_patch`.
    - Cache only successful validated analyses; read findings only from the exact latest cache entry; never write repository files.
    - _Requirements: 1.1, 1.3, 1.4, 3.4, 5.1, 6.3, 6.4, 7.5, 8.7, 9.1, 11.1, 11.2, 11.3, 11.4_
  - [x] 6.2 Connect the server through `StdioServerTransport` from the `npx tsx mcp/server.ts` entry point without creating an HTTP, SSE, or other listener.
    - Keep stdout exclusively for SDK protocol traffic; route operational diagnostics and startup failures to stderr only.
    - _Requirements: 1.2, 1.5, 1.6, 10.5, 10.6, 11.3_
  - [x] 6.3 Write Vitest handler tests for the exact tool set, validation-before-side-effects, cache behavior, scanner delegation, proxy forwarding, compact output, and patch no-mutation guarantees.
    - Use fakes for network and scanner boundaries; assert invalid input performs zero proxy/scanner/cache work.
    - _Requirements: 1.3, 3.5, 4.6, 5.2, 6.1, 7.1, 8.1, 8.7, 9.2, 9.3_

- [x] 7. Register MCP settings and verify the integration boundary
  - [x] 7.1 Create `.kiro/settings/mcp.json` registering `necro-docs` with command `npx`, args `tsx mcp/server.ts`, repository-root working context, and optional `NECRO_API_URL`.
    - Do not register an HTTP/SSE service, database, persistent cache, patch hook, auto-approval, or mutation command.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 11.1, 11.3, 11.4_
  - [x] 7.2 Add an MCP Inspector smoke script or test fixture that starts `npx tsx mcp/server.ts` from the repository root and checks registration of exactly four tools.
    - Confirm the server establishes stdio, opens no HTTP/SSE listener, and accepts representative valid/invalid schemas.
    - _Requirements: 1.2, 1.3, 2.2, 2.3, 11.3_
  - [x] 7.3 Run the MCP Inspector smoke check with a running Next application and verify `analyze_repo` then `get_findings`, `scan_code`, and `synthesize_patch` against fixtures.
    - Confirm stdout contains only MCP protocol traffic, diagnostics are stderr-only, and no token/source/full patch content is logged.
    - Confirm synthesize_patch returns a proposal only and does not autoApprove, modify a local file, create a branch, commit, or open a pull request.
    - _Requirements: 1.5, 1.6, 5.2, 6.1, 7.4, 8.5, 8.7, 8.8, 10.5, 10.6_

- [x] 9. Implement requested MCP contract corrections
  - [x] 9.1 Update `PatchResult`, `derivePatchResult`, the MCP server handler, and tests so `patchedCode` is included only when `verification.changed` is true and omitted for unchanged results; preserve proposal-only behavior and no file, branch, commit, or pull-request mutation.
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_
  - [x] 9.2 Normalize analysis cache keys to lowercase `owner/repo` using the existing `parseGitHubUrl()` helper in `analyze_repo` and `get_findings`; preserve the invalid-URL error and update cache and property tests for equivalent URLs, replacement, failure preservation, isolation, and missing entries.
    - _Requirements: 5.1, 6.3, 6.4, 6.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1_
  - [x] 9.3 Update `.kiro/settings/mcp.json` so `autoApprove` contains exactly `analyze_repo`, `get_findings`, and `scan_code`; add or update a configuration test if one exists, without approving `synthesize_patch`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.7_

- [x] 10. Fixability, file context, and cache-based patching
  - [x] 10.1 Add `patchable` to get_findings and scan_code findings and `patchableCount` to analyze_repo file entries, using `isPatchable()` from `src/lib/types.ts`; add tests for the flag and the count.
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [x] 10.2 Add `fileContext` deriving `importedBy` and `imports` (max 20 each) from cached edges, return them from get_findings, never return `node.code`; add derivation and direction tests.
    - _Requirements: 13.1, 13.2, 13.3_
  - [x] 10.3 Make the synthesize_patch schema accept exactly one of `code` or `repoUrl`, implement the cache branch with edge-derived `importedBy` and `RepoAnalysis.dependencies`, and short-circuit when nothing is patchable; add schema, repoUrl-branch, and short-circuit tests. Keep it out of `autoApprove`.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
  - [x] 10.4 Add `.kiro/steering/necro-surgeon.md`, one `PostFileSave` agent hook, and the README section "Use Necro-Docs from Kiro (MCP)".
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - [x] 10.5 Run `npx vitest --run` and `npx tsc --noEmit`.
    - _Requirements: 12.1, 13.1, 14.1_

## Notes

- Tasks marked with `*` are optional and may be skipped for a faster MVP; the required implementation remains testable through the other focused tests and smoke checks.
- `synthesize_patch` is proposal-only. The MCP server must not expose `autoApprove`, apply patches to local files, create branches, commit, open pull requests, or add mutation hooks.
- Kiro-side patch application or hook wiring after explicit user approval is outside the MCP server implementation scope. If desired later, document it as a separate post-approval Kiro integration rather than adding it to the server tools.
- The MCP server must reuse `/api/ingest`, `/api/patch`, `scanSource`, and existing patch guards; no duplicate analyzer, scanner, or patch engine is planned.
- The dependency graph lists every decimal leaf task exactly once. Checkpoints and parent tasks are intentionally omitted.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["3.3"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["2.2", "3.4", "4.3", "4.4"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2"] },
    { "id": 9, "tasks": ["5.3"] },
    { "id": 10, "tasks": ["6.1"] },
    { "id": 11, "tasks": ["7.1"] },
    { "id": 12, "tasks": ["6.2", "6.3", "7.2"] },
    { "id": 13, "tasks": ["7.3"] },
    { "id": 14, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 15, "tasks": ["10.1", "10.2"] },
    { "id": 16, "tasks": ["10.3"] },
    { "id": 17, "tasks": ["10.4", "10.5"] }
  ]
}
```
