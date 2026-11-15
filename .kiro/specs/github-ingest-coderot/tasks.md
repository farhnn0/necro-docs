# Implementation Plan: GitHub Repository Ingestion & Code-Rot Analyzer

## Overview

Implementation language: **TypeScript** (strict mode), as used in `design.md`.

Build `POST /api/ingest` bottom-up: test tooling first, then shared types/constants/utilities, then the small modules under `src/lib/ingest/` (errors, URL/request parsing, GitHub client, file selection, analysis, relations, graph), then the pipeline, and last the thin route handler. Each module is wired into the next step, so no code is left orphaned. No new runtime dependencies. `vitest` and `fast-check` are added as `devDependencies` only.

Conventions that apply to every task:

- Shared types go in `src/lib/types.ts`, constants in `src/lib/constants.ts`, utilities in `src/lib/utils.ts`. None of these files exist yet, so create them with only what this feature needs.
- Ingest modules live in `src/lib/ingest/`. Tests live in `src/lib/ingest/__tests__/` (including the route test, so no test files sit under `src/app`).
- Only `github.ts` performs network I/O. Nothing under `src/lib/ingest/` may import `fs`, `node:fs`, or `child_process`.
- `AGENTS.md` states this Next.js version has breaking changes. Before writing `route.ts`, read the bundled docs in `node_modules/next/dist/docs/01-app/`: `01-getting-started/15-route-handlers.md`, `03-api-reference/03-file-conventions/route.md`, `03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`, `03-api-reference/05-config/01-next-config-js/cacheComponents.md`, and `02-guides/migrating-to-cache-components.md`. `next.config.ts` has `cacheComponents: true`.
- Each property-based test is one `fc.assert(fc.property(...))` with at least 100 runs, tagged with the comment `Feature: github-ingest-coderot, Property {n}: {property text}`. Each test task uses its own test file, so test tasks never write to the same file.

## Tasks

- [x] 1. Set up test tooling
  - [x] 1.1 Add vitest and fast-check as devDependencies and configure the test runner
    - Run `npm install -D vitest fast-check` so both appear under `devDependencies` in `package.json`
    - Add the script `"test": "vitest --run"` to `package.json`
    - Create `vitest.config.ts` with `environment: 'node'`, `include: ['src/**/*.test.ts']`, and the alias `@` → `./src` to match `tsconfig.json`
    - _Requirements: Testing Strategy (Property-Based Tests)_

- [x] 2. Shared types, constants, and utilities
  - [x] 2.1 Create `src/lib/types.ts` with the API envelope and ingest types
    - Add `ApiResponse<T>`, `ApiError`, `ResponseMeta` (steering shape)
    - Add `IngestLanguage`, `IngestEdgeType`, `IngestRequestBody`, `IngestNode`, `IngestEdge` (with `metadata: { importCount }`), `SelectionCriteria`, `IngestMetadata`, `IngestResult` exactly as in the design's Data Models section
    - _Requirements: 8.2, 9.2, 10.1, 10.2, 13.1, 13.2_

  - [x] 2.2 Create `src/lib/constants.ts` with ingest configuration, demo presets, and error codes
    - Add `INGEST_CONFIG` (API base and version, user agent, 60 s timeout, 10,000-char body cap, concurrency 5, max 25 files, supported extensions, excluded dirs and name patterns, 1 MiB full-fetch limit, 50 KiB truncated fetch, 4000-char raw content, small-file lines/score, `ROT` weights)
    - Add `DEMO_REPOSITORIES` with `demo1` and `demo2`, overridable by `DEMO1_REPO_URL` / `DEMO2_REPO_URL`; defaults `https://github.com/pmndrs/zustand` and `https://github.com/pallets/flask`
    - Add `ERROR_CODES` (steering) and `INGEST_ERROR_STATUS` mapping every ingest error code to its HTTP status, plus `export type IngestErrorCode = keyof typeof INGEST_ERROR_STATUS`
    - _Requirements: 4.1, 4.2, 4.3, 5.2, 5.4, 7.5, 7.6, 8.2, 11.2, 11.5, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 2.3 Create `src/lib/utils.ts` with `mapWithConcurrency`
    - Implement a worker pool of `min(limit, items.length)` loops sharing one cursor, results kept in input order
    - After the first rejection, start no new items and reject with that error
    - No `p-limit` or other library
    - _Requirements: 5.2_

  - [x] 2.4 Write property test for bounded concurrency
    - File: `src/lib/ingest/__tests__/concurrency.property.test.ts`
    - **Property 8: Bounded concurrency preserves order and completeness**
    - **Validates: Requirements 5.2**

- [x] 3. Error model
  - [x] 3.1 Create `src/lib/ingest/errors.ts`
    - Implement `IngestError(code, message, details = {})` with `status` derived from `INGEST_ERROR_STATUS`
    - Implement `toIngestError(e, signal?)`: `IngestError` unchanged, aborted timeout signal → `REQUEST_TIMEOUT`, anything else → `ANALYSIS_FAILED` with `details.error`
    - Implement `toErrorResponse(e, { token, startedAt })` returning a `NextResponse` with body `{ success: false, error: { code, message, details }, meta }`; serialize the body, replace every occurrence of the token with `[REDACTED]`, and log only `code`, `status`, and the redacted message with `console.error`
    - _Requirements: 10.5, 12.5, 12.6, 14.5_

  - [x] 3.2 Write property test for error responses and token redaction
    - File: `src/lib/ingest/__tests__/errors.property.test.ts`
    - **Property 5: Error responses are well-formed and never leak the token**
    - **Validates: Requirements 10.5, 12.6, 14.5**

- [x] 4. Repository URL and request parsing
  - [x] 4.1 Add `parseRepositoryUrl` to `src/lib/ingest/github.ts`
    - Reject unparseable URLs, non-`http(s)` protocols, and fewer than two path segments with `INVALID_URL_FORMAT`
    - Reject hosts other than `github.com` / `www.github.com` (case-insensitive) with `NON_GITHUB_REPOSITORY`
    - Require owner and repo to match `/^[A-Za-z0-9_.-]+$/`, strip a `.git` suffix, reject dot-only names, and ignore extra segments, trailing slash, query, and fragment
    - Export the `TreeEntry` type here so later modules can import it
    - _Requirements: 1.4, 1.5, 1.6_

  - [x] 4.2 Write property test for the URL round trip
    - File: `src/lib/ingest/__tests__/github-url-roundtrip.property.test.ts`
    - **Property 1: Repository URL round trip**
    - **Validates: Requirements 1.6**

  - [x] 4.3 Write property test for unsafe identifiers and rejection codes
    - File: `src/lib/ingest/__tests__/github-url-safety.property.test.ts`
    - **Property 2: URL parsing never yields unsafe identifiers and classifies every rejection**
    - **Validates: Requirements 1.4, 1.5**

  - [x] 4.4 Create `src/lib/ingest/request.ts` with `parseIngestRequest`
    - Export `IngestTarget { owner, repo, repositoryUrl }` (canonical URL)
    - Check in order: body is a non-null, non-array object (else `INVALID_REQUEST`); `useDemo === true` looks up `demoId` in `DEMO_REPOSITORIES` (hit substitutes the preset, miss → `INVALID_DEMO_ID`, `repositoryUrl` ignored); absent or `null` `repositoryUrl` → `MISSING_REPOSITORY_URL`; non-string → `INVALID_URL_FORMAT`; then `parseRepositoryUrl`
    - _Requirements: 1.1, 1.2, 1.3, 11.1, 11.3, 11.4_

  - [x] 4.5 Write property test for demo resolution
    - File: `src/lib/ingest/__tests__/request-demo.property.test.ts`
    - **Property 3: Demo resolution**
    - **Validates: Requirements 11.1, 11.3, 11.4**

- [x] 5. GitHub client
  - [x] 5.1 Extend `src/lib/ingest/github.ts` with the client, error mapping, and capped reader
    - Implement `readCapped(body, maxBytes)` returning the exact byte prefix and a `truncated` flag
    - Implement `mapGitHubError({ status, headers, message }, ctx)` following the design's ordered mapping table (401, 429 or 403 with remaining 0 or `retry-after`, 404 in `repository` context, other 4xx, 5xx, anything else)
    - Implement `createGitHubClient({ token, signal, fetchImpl? })` with `getDefaultBranch`, `getTree` (`recursive=1`, surfaces `truncated`), `getFileContent` (raw media type, `ref` query, path and branch encoded per segment, 404 → `null`, bodies over 1 MiB read through `readCapped` at 50 KiB, streaming UTF-8 decode), and `getRateLimit`
    - Always use the fixed base `https://api.github.com`; send `Accept`, `X-GitHub-Api-Version`, `User-Agent`, and `Authorization: token <token>` only when a token is set
    - Map thrown network errors to `GITHUB_API_ERROR`, aborted signal to `REQUEST_TIMEOUT`, and unparseable JSON to `GITHUB_API_ERROR`; record rate-limit headers after every response, including errors
    - Pass no `next` caching options to `fetch`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.1, 5.3, 5.4, 5.5, 5.6, 12.1, 12.2, 12.3, 12.4, 12.5, 14.1, 14.2, 14.4, 14.6_

  - [x] 5.2 Write property test for GitHub error mapping
    - File: `src/lib/ingest/__tests__/github-error-map.property.test.ts`
    - **Property 4: GitHub error mapping is total and consistent**
    - **Validates: Requirements 2.4, 2.5, 3.5, 12.1, 12.2, 12.3, 12.4, 14.6**

  - [x] 5.3 Write property test for the capped reader
    - File: `src/lib/ingest/__tests__/read-capped.property.test.ts`
    - **Property 9: Capped read returns an exact prefix**
    - **Validates: Requirements 5.4, 5.6**

  - [x] 5.4 Write unit tests for the GitHub client with a fake `fetchImpl`
    - File: `src/lib/ingest/__tests__/github-client.test.ts`
    - Check request URLs (repo metadata, tree with `recursive=1`, contents with `ref`), the raw `Accept` header, `default_branch` extraction, and `Authorization: token <value>` present only when a token is set
    - Check rate-limit header capture, 404 → `null` for files, a pre-aborted signal with `TimeoutError` → `REQUEST_TIMEOUT`, and that a file larger than 1 MiB yields a 50 KiB truncated result
    - _Requirements: 2.1, 2.2, 2.6, 3.1, 3.2, 3.6, 5.1, 5.3, 5.4, 5.5, 12.5, 14.1, 14.2, 14.4_

- [x] 6. Checkpoint - Request parsing and GitHub client
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. File selection
  - [x] 7.1 Create `src/lib/ingest/select-files.ts` with `selectCodeFiles`
    - Eligible entries: `type === 'blob'`, `mode !== '120000'`, `size > 0`, supported extension (case-insensitive), no path segment in `EXCLUDED_DIRS`, name matching none of the excluded patterns
    - Sort by `(size ascending, path ascending)` and slice to 25
    - Return `{ files, criteria }` with `eligibleCount`, `selectedCount`, `sortBy: 'size-asc'`; throw `NO_CODE_FILES_FOUND` with `details: { treeEntries, criteria }` when nothing is eligible
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 7.2 Write property test for selection order and size
    - File: `src/lib/ingest/__tests__/select-files-order.property.test.ts`
    - **Property 6: File selection takes the smallest eligible files, in order**
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.6**

  - [x] 7.3 Write property test for excluded paths
    - File: `src/lib/ingest/__tests__/select-files-exclusions.property.test.ts`
    - **Property 7: Excluded paths are never selected**
    - **Validates: Requirements 4.2**

  - [x] 7.4 Write unit tests for selection examples
    - File: `src/lib/ingest/__tests__/select-files.test.ts`
    - Check the `NO_CODE_FILES_FOUND` error and its `details`, and that the returned criteria contain extensions, exclusions, sort method, and limit
    - _Requirements: 4.5, 4.6_

- [x] 8. Code analysis and rot score
  - [x] 8.1 Create `src/lib/ingest/analyze.ts`
    - Implement `languageOf(path)` mapping extensions to language and family (`js` / `py`)
    - Implement `classifyLines(content, family)`: split on `\r\n|\r|\n`, drop one trailing empty element, classify blank, comment (`//`, `/* */` blocks, `#`), and code lines, compute `nestingDepth` from code lines using the clamped indent unit, and return `codeText` with comment-only lines removed
    - Implement `computeMetrics` (`linesOfCode`, `commentRatio` rounded to 2 decimals, `nestingDepth`, `totalLines`) and `computeRotScore` (10 when `totalLines < 5`, otherwise the Req 7.5 formula with `INGEST_CONFIG.ROT`, rounded and clamped to `[0, 100]`)
    - Implement surrogate-safe `truncateChars(s, max)`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.2, 13.3, 13.5_

  - [x] 8.2 Write property test for character truncation
    - File: `src/lib/ingest/__tests__/truncate-chars.property.test.ts`
    - **Property 10: Character truncation is bounded, prefix-preserving, and well-formed**
    - **Validates: Requirements 8.2, 13.4**

  - [x] 8.3 Write property test for line classification and metrics
    - File: `src/lib/ingest/__tests__/classify-lines.property.test.ts`
    - **Property 11: Line classification partitions the file and metrics stay in range**
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [x] 8.4 Write property test for score range and small files
    - File: `src/lib/ingest/__tests__/rot-score-range.property.test.ts`
    - **Property 12: Rot score is a bounded integer, and small files score 10**
    - **Validates: Requirements 7.1, 7.6, 13.5**

  - [x] 8.5 Write property test for score monotonicity
    - File: `src/lib/ingest/__tests__/rot-score-monotonic.property.test.ts`
    - **Property 13: Rot score is monotonic in each metric**
    - **Validates: Requirements 7.5**

  - [x] 8.6 Write unit tests for score examples and empty input
    - File: `src/lib/ingest/__tests__/rot-score.test.ts`
    - Check LOC 200 / depth 4 / comment ratio 20 → 49, a 4-line file → 10, empty content → 0 lines, score 10, no `NaN`, and `\r\n` and lone `\r` line endings
    - _Requirements: 7.5, 7.6_

- [x] 9. Import and export relations
  - [x] 9.1 Create `src/lib/ingest/relations.ts`
    - Implement `detectRelations(codeText, family)` with the design's JS patterns (`import … from`, side-effect `import`, `import()`, `require()`, `export … from`) and Python patterns (`import a.b, c`, `from a.b import x`, `from .a import x`, `from . import x, y`), returning `imports` and `exportCount` (Python `exportCount = 0`)
    - Implement `resolveImport(imp, sourcePath, family, selected)`: JS relative specifiers only with extension, `/index`, and `.js`→`.ts` candidates; Python relative and absolute resolution with `__init__.py` and shortest-suffix matching; normalize backslashes and use `node:path/posix`; return `null` for specifiers that escape the repository root, bare specifiers, and aliases
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 9.2 Write property test for relative import resolution
    - File: `src/lib/ingest/__tests__/resolve-import.property.test.ts`
    - **Property 14: Relative import resolution round trip**
    - **Validates: Requirements 6.6**

  - [x] 9.3 Write property test for import detection
    - File: `src/lib/ingest/__tests__/detect-relations.property.test.ts`
    - **Property 15: Import detection round trip**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 9.1, 9.5**

- [x] 10. Graph building and validation
  - [x] 10.1 Create `src/lib/ingest/graph.ts`
    - Implement `buildNodes(files, analyzedAt)` returning nodes (ordered by path) and the relations map; `rawContent` from `truncateChars(content, 4000)`, `isTruncated = fetchTruncated || content.length > 4000`, `fileSize` from the tree entry, `importCount` counting non-`export` imports
    - Implement `buildEdges(nodes, relations)`: resolve only against node ids, drop self-loops, group by `{source}→{target}`, keep first `type` and `label`, set `metadata.importCount`, order by id; isolated nodes stay
    - Implement `summarize(nodes)` (`fileCount`, `averageRotScore` to 2 decimals) and `validateIngestResult(result)` checking every Req 13 rule and throwing `ANALYSIS_FAILED` with up to 20 `details.violations`
    - _Requirements: 6.7, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 10.2, 10.5, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 10.2 Write property test for graph consistency
    - File: `src/lib/ingest/__tests__/graph-structure.property.test.ts`
    - **Property 16: Graph structure is internally consistent**
    - **Validates: Requirements 6.7, 8.1, 9.1, 9.2, 9.3, 9.4, 13.2**

  - [-] 10.3 Write property test for node schema
    - File: `src/lib/ingest/__tests__/graph-node-schema.property.test.ts`
    - **Property 17: Nodes satisfy the required schema for any file content**
    - **Validates: Requirements 8.2, 8.3, 8.4, 13.1**

  - [ ] 10.4 Write property test for the result validator
    - File: `src/lib/ingest/__tests__/validate-result.property.test.ts`
    - **Property 18: The validator rejects any corrupted result**
    - **Validates: Requirements 10.5, 13.3, 13.5**

  - [ ] 10.5 Write property test for summary and JSON round trip
    - File: `src/lib/ingest/__tests__/graph-summary.property.test.ts`
    - **Property 19: Result summary and JSON round trip**
    - **Validates: Requirements 10.2, 10.3, 10.4**

- [x] 11. Checkpoint - Pure modules complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Ingestion pipeline
  - [x] 12.1 Create `src/lib/ingest/pipeline.ts` with `ingestRepository`
    - Steps: `getDefaultBranch` → `getTree` → `selectCodeFiles` → `mapWithConcurrency(files, INGEST_CONFIG.FETCH_CONCURRENCY, getFileContent)` → drop `null` results into `metadata.skippedFiles` → throw `NO_CODE_FILES_FOUND` if none remain → `classifyLines` per file → `buildNodes` → `buildEdges` → `summarize` → assemble `IngestMetadata` (`treeTruncated`, `selection`, `rateLimit`, `processingDurationMs = Math.round(performance.now() - startedAt)`) → `validateIngestResult`
    - Take `{ client, now, startedAt }` as injected dependencies; no file system access or process spawning
    - _Requirements: 2.3, 3.3, 3.4, 4.5, 5.2, 5.5, 5.6, 6.7, 10.2, 10.3, 10.4, 10.5_

  - [ ] 12.2 Write property test for pipeline determinism and skipped files
    - File: `src/lib/ingest/__tests__/pipeline.property.test.ts`
    - **Property 20: Pipeline is deterministic, skips missing files, and does not lose data**
    - Use a fake `GitHubClient` backed by generated mock repositories
    - **Validates: Requirements 3.3, 5.5, 5.6**

- [x] 13. API route
  - [x] 13.1 Create `src/app/api/ingest/route.ts`
    - First read the Next.js route handler docs listed in the Overview and follow them: file is `route.ts` with no `page.tsx` at the same segment, export only `POST(request: NextRequest)`, and export `maxDuration = 60`
    - Do not export `dynamic`, `revalidate`, `fetchCache`, or `runtime` (`cacheComponents: true`)
    - Read the body with `request.text()`, reject over `MAX_BODY_CHARS` and invalid JSON with `INVALID_REQUEST`, call `parseIngestRequest`, create `AbortSignal.timeout(INGEST_CONFIG.TIMEOUT_MS)` and the client with `process.env.GITHUB_TOKEN?.trim() || undefined`, call `ingestRepository`, and return `ApiResponse<IngestResult>` with `meta.duration` equal to `data.metadata.processingDurationMs`
    - Catch everything and return `toErrorResponse(e, { token, startedAt })`
    - Add a JSDoc block at the top with the request formats, the success response, every error code with its HTTP status, and example `curl` and `fetch` commands
    - _Requirements: 1.1, 10.1, 10.2, 10.3, 10.4, 10.5, 12.5, 12.6, 14.1, 14.2, 14.4, 14.5, 15.1, 15.2, 15.3, 15.4_

  - [ ] 13.2 Write route example tests and smoke checks
    - File: `src/lib/ingest/__tests__/route.test.ts`
    - Call `POST` with a stubbed `fetch` (`vi.stubGlobal`): valid body → 200 with the `ApiResponse` envelope and `meta.duration === data.metadata.processingDurationMs`; missing, `null`, and non-string `repositoryUrl`; invalid JSON body; body over 10,000 characters
    - Smoke checks: `Object.keys(DEMO_REPOSITORIES)` equals `['demo1', 'demo2']`; no file in `src/lib/ingest/` imports `fs`, `node:fs`, or `child_process`; every key of `INGEST_ERROR_STATUS` appears in the JSDoc of `route.ts`; `route.ts` does not export `dynamic`, `revalidate`, `fetchCache`, or `runtime`
    - _Requirements: 1.1, 1.2, 1.3, 3.4, 10.1, 11.2, 11.5, 15.3_

- [x] 14. Final checkpoint - Tests, lint, and build
  - Ensure all tests pass with `npm test`, then run `npm run lint` and `npm run build` (the build must succeed with `cacheComponents: true`). Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- The live GitHub integration check against `demo1` and `demo2` (Req 11.6, 14.3) needs a real `GITHUB_TOKEN` and network access, so it is not a task here. Run it manually after the route is in place.
- Design conflicts C1–C18 are already resolved in `design.md` (for example, the rate-limit code is `GITHUB_RATE_LIMIT`). Follow the design where it differs from `requirements.md`.
- Each property test references its property number from `design.md` and the requirement clauses it validates.
- Start tasks by opening this file and clicking "Start task" next to a task item.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "2.3"] },
    { "id": 1, "tasks": ["2.4", "3.1", "8.1"] },
    { "id": 2, "tasks": ["3.2", "4.1", "8.2", "8.3", "8.4", "8.5", "8.6", "9.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "5.1", "9.2", "9.3"] },
    { "id": 4, "tasks": ["4.5", "5.2", "5.3", "5.4", "7.1", "10.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "10.2", "10.3", "10.4", "10.5", "12.1"] },
    { "id": 6, "tasks": ["12.2", "13.1"] },
    { "id": 7, "tasks": ["13.2"] }
  ]
}
```
