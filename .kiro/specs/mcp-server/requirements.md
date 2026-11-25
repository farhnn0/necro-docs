# Requirements Document

## Introduction

The MCP Server feature adds a stdio Model Context Protocol server at `mcp/server.ts`. The server exposes exactly four tools for repository analysis, cached finding retrieval, local code scanning, and guarded patch synthesis. The server is a thin proxy over the running Next application and reuses the existing `/api/ingest`, `/api/patch`, and scanner behavior instead of duplicating analysis or patch logic.

The server uses `NECRO_API_URL` as the Next application base URL, defaulting to `http://localhost:3000`. The server keeps the latest analysis for each repository URL in an in-memory cache keyed by the normalized lowercase owner/repo returned by the existing `parseGitHubUrl()` helper. The feature does not add persistence, a database, a new transport, authentication changes, UI changes, pull-request creation, or new analysis rules.

## Glossary

- **MCP_Server**: The stdio Model Context Protocol process implemented by `mcp/server.ts`.
- **MCP_Client**: An MCP-compatible client that starts or connects to the MCP_Server through stdio.
- **Tool**: One of the four MCP operations exposed by the MCP_Server: `analyze_repo`, `get_findings`, `scan_code`, or `synthesize_patch`.
- **Next_Application**: The running Next.js application addressed by `NECRO_API_URL`.
- **Ingest_Endpoint**: `POST /api/ingest`, which accepts `{ repoUrl }` and returns a `RepoAnalysis` object directly.
- **Patch_Endpoint**: `POST /api/patch`, which accepts `{ path, code, dependencies?, importedBy? }` and returns `{ summary, patchedCode, provider, fixed, remaining }`.
- **RepoAnalysis**: The current analysis response containing `title`, `defaultBranch`, `rotSummary`, `overallRot`, `nodes`, `edges`, `coverage`, and `dependencies`.
- **RepoNode**: A current analysis node containing file metadata, `findings`, `notes`, `summary`, `recommendation`, `code`, `featured`, and `explainedBy`.
- **RepoFinding**: A finding with `kind`, `line`, `lines`, `text`, `suggestion`, and `source`.
- **Static_Finding**: A finding with `source: "static"`; the authoritative scanner result.
- **AI_Note**: An AI-generated summary, recommendation, or observation that is not scanner-confirmed and is labeled as unverified when exposed by the MCP_Server.
- **Analysis_Cache**: An in-memory `Map` keyed by the normalized lowercase `owner/repo` returned by the existing `parseGitHubUrl()` helper, containing the latest `RepoAnalysis` for that repository.
- **Normalized_Repo_Key**: The lowercase `owner/repo` string produced by `parseGitHubUrl()` from an accepted repository URL.
- **Patchable_Kind**: A finding kind included by the existing `PATCHABLE_KINDS` contract and eligible for the existing patch model flow.
- **Auto_Approve**: An MCP configuration setting that permits a listed tool to run without an additional approval prompt.
- **Verification_Status**: A compact MCP result derived from the Patch_Endpoint response and its `fixed` and `remaining` arrays; it is not a new patch engine.
- **Zod_Validation**: Runtime validation of tool inputs using the installed `zod` package before a tool performs network or scanner work.

## Requirements

### Requirement 1: Start a stdio MCP server

**User Story:** As an MCP client user, I want to start the server with the documented command, so that I can use Necro-Docs tools from an MCP-compatible client.

#### Acceptance Criteria

1. THE MCP_Server SHALL be implemented at `mcp/server.ts` and SHALL use `@modelcontextprotocol/sdk` for the stdio MCP transport and `zod` for tool input schemas.
2. WHEN an MCP_Client starts `npx tsx mcp/server.ts`, THE MCP_Server SHALL establish an MCP stdio session without opening an HTTP, SSE, or other network listener.
3. THE MCP_Server SHALL register exactly four tools named `analyze_repo`, `get_findings`, `scan_code`, and `synthesize_patch`.
4. THE MCP_Server SHALL register the four tools with descriptions and schemas that identify required and optional inputs.
5. THE MCP_Server SHALL write operational logs only to stderr and SHALL reserve stdout for MCP protocol messages.
6. WHEN the MCP_Server exits or encounters an unrecoverable startup error, THE MCP_Server SHALL avoid writing secrets, source contents, or MCP-incompatible log text to stdout.

### Requirement 2: Register the MCP server configuration

**User Story:** As a project maintainer, I want the MCP server registered in the project settings, so that supported MCP clients can discover the server command.

#### Acceptance Criteria

1. THE MCP_Configuration SHALL be stored at `.kiro/settings/mcp.json`.
2. THE MCP_Configuration SHALL register the server command as `npx` with arguments `tsx` and `mcp/server.ts`.
3. THE MCP_Configuration SHALL identify the working directory or command context needed to run from the repository root.
4. THE MCP_Configuration SHALL define `NECRO_API_URL` as an optional environment variable for the MCP_Server.
5. THE MCP_Configuration SHALL set `autoApprove` to exactly `analyze_repo`, `get_findings`, and `scan_code`.
6. THE MCP_Configuration SHALL explicitly exclude `synthesize_patch` from `autoApprove`.
7. THE MCP_Configuration SHALL not register an HTTP, SSE, or persistent database service for this feature.

### Requirement 3: Proxy requests through the running Next application

**User Story:** As an engineer, I want MCP tools to reuse the running Next application, so that MCP results match the product’s existing analysis and patch behavior.

#### Acceptance Criteria

1. THE MCP_Server SHALL resolve the Next_Application base URL from `NECRO_API_URL`, or use `http://localhost:3000` when `NECRO_API_URL` is absent or empty.
2. WHEN `analyze_repo` receives a valid request, THE MCP_Server SHALL send `{ "repoUrl": repoUrl }` to `POST /api/ingest` and SHALL interpret the successful body as a direct RepoAnalysis object rather than an ApiResponse envelope.
3. WHEN `synthesize_patch` receives a valid request, THE MCP_Server SHALL send `{ "path": path, "code": code, "dependencies": dependencies?, "importedBy": importedBy? }` to `POST /api/patch`.
4. THE MCP_Server SHALL reuse the Ingest_Endpoint, Patch_Endpoint, and existing scanner behavior rather than implementing a second repository analyzer, patch engine, or finding rule set.
5. WHEN a proxied response is not successful or does not match the expected endpoint response shape, THE MCP_Server SHALL return a clear tool error without presenting the response as a successful analysis or patch.
6. THE MCP_Server SHALL not clone repositories, write repository files, or persist analysis results outside the process memory.

### Requirement 4: Validate tool inputs with Zod

**User Story:** As an MCP client user, I want invalid tool arguments rejected clearly, so that I can correct requests without triggering unnecessary network or scanner work.

#### Acceptance Criteria

1. THE MCP_Server SHALL validate every tool input with a Zod_Validation schema before executing the tool handler.
2. THE `analyze_repo` Tool SHALL accept exactly a required non-empty string `repoUrl` and SHALL reject malformed or empty values with a clear validation error.
3. THE `get_findings` Tool SHALL accept exactly required non-empty strings `repoUrl` and `path`.
4. THE `scan_code` Tool SHALL accept exactly required non-empty strings `path` and `code`.
5. THE `synthesize_patch` Tool SHALL accept required non-empty strings `path` and `code`, plus optional arrays of strings `dependencies` and `importedBy`.
6. WHEN Zod_Validation fails, THE MCP_Server SHALL return a tool error naming the invalid argument and SHALL not call the Next_Application or scanner.
7. THE MCP_Server SHALL apply bounded input lengths sufficient to protect the stdio process from unbounded repository URLs, paths, dependency lists, imported-by lists, and code payloads.

### Requirement 5: Analyze repositories with a compact result

**User Story:** As an engineer, I want to analyze a repository through MCP, so that I can identify the highest-rot files without receiving an unreadable full graph.

#### Acceptance Criteria

1. WHEN `analyze_repo` receives a valid `repoUrl`, THE analyze_repo Tool SHALL proxy the request to the Ingest_Endpoint and SHALL cache the returned RepoAnalysis under the Normalized_Repo_Key produced by `parseGitHubUrl()`.
2. WHEN the Ingest_Endpoint succeeds, THE analyze_repo Tool SHALL return a compact summary containing the repository title, overall rot information, coverage information, and at most 10 files ranked by descending rot score.
3. EACH compact file entry SHALL contain only the file `path`, rot `score`, and `findingCount` needed for triage.
4. THE analyze_repo Tool SHALL not return the complete `edges` graph, full file `code`, or complete repository contents in the compact summary.
5. THE analyze_repo Tool SHALL retain the full RepoAnalysis only in the process-local Analysis_Cache for later `get_findings` lookups.
6. WHEN the Ingest_Endpoint reports an invalid URL, unavailable Next_Application, GitHub rate limit, or another mapped ingestion error, THE analyze_repo Tool SHALL return a clear error that preserves the actionable condition without exposing credentials.
7. THE analyze_repo Tool SHALL identify Static_Findings as authoritative and SHALL label AI-generated notes, summaries, and recommendations as unverified when those fields are exposed in any MCP result.

### Requirement 6: Retrieve findings from the latest cached analysis

**User Story:** As an engineer, I want to inspect one analyzed file after repository analysis, so that I can investigate findings without re-running ingestion.

#### Acceptance Criteria

1. WHEN `get_findings` receives a `repoUrl` present in the Analysis_Cache and a `path` matching a cached RepoNode, THE get_findings Tool SHALL return that node’s findings as entries containing `line`, `kind`, `text`, and `suggestion`.
2. THE get_findings Tool SHALL return Static_Findings as authoritative and SHALL label any AI-derived note or observation as unverified rather than presenting it as a static finding.
3. WHEN `repoUrl` is absent from the Analysis_Cache, THE get_findings Tool SHALL return an error instructing the user to call `analyze_repo` first.
4. WHEN `path` is not present in the cached RepoAnalysis, THE get_findings Tool SHALL return a clear file-not-cached error and SHALL not call the Next_Application.
5. THE get_findings Tool SHALL read only the latest cached RepoAnalysis for the requested `repoUrl` and SHALL not merge nodes from another repository URL.
6. THE get_findings Tool SHALL not return the file’s full `code`, unrelated graph edges, or the entire cached analysis.

### Requirement 7: Scan local or unpushed code with the existing scanner

**User Story:** As an engineer, I want to scan code that is not yet pushed, so that I can inspect findings before repository ingestion.

#### Acceptance Criteria

1. WHEN `scan_code` receives a valid `path` and `code`, THE scan_code Tool SHALL use the same scanner behavior as the server-side `/api/patch` rescan path.
2. THE scan_code Tool SHALL return compact finding entries with `line`, `kind`, `text`, and `suggestion`, while preserving the scanner’s current static and AST-context finding kinds.
3. THE scan_code Tool SHALL mark Static_Findings as authoritative.
4. WHEN the scanner returns no findings, THE scan_code Tool SHALL return an explicit empty findings result rather than an error.
5. THE scan_code Tool SHALL not require a cached repository analysis or call the Ingest_Endpoint.
6. THE scan_code Tool SHALL not add new analysis rules, alter current severity behavior, or duplicate the scanner implementation in `mcp/server.ts`.

### Requirement 8: Synthesize a guarded patch and derive verification

**User Story:** As an engineer, I want a proposed patch for a local file, so that I can review a safe server-validated change before applying it manually.

#### Acceptance Criteria

1. WHEN `synthesize_patch` receives valid patch inputs, THE synthesize_patch Tool SHALL proxy the request to the Patch_Endpoint and SHALL use the existing server-side scan, patchable-kind filtering, edit validation, and rescan verification.
2. THE MCP_Server SHALL send only the optional dependency and importer context supplied by the caller and SHALL not independently select non-patchable findings for the model.
3. THE synthesize_patch Tool SHALL derive a compact `edits` result by comparing the original `code` with the returned `patchedCode`, without implementing a second patch engine.
4. THE synthesize_patch Tool SHALL derive `verification` from the Patch_Endpoint `fixed` and `remaining` arrays and SHALL identify whether the returned code changed, whether findings were fixed, and whether patchable findings remain.
5. THE synthesize_patch Tool SHALL return the Patch_Endpoint `summary`, `provider`, derived `edits`, derived `verification`, `fixed`, and `remaining` fields in a compact result.
6. WHEN `verification.changed` is true, THE synthesize_patch Tool SHALL include `patchedCode` in the result; WHEN `verification.changed` is false, THE synthesize_patch Tool SHALL omit `patchedCode` from the result.
7. THE synthesize_patch Tool SHALL expose AI patch output as unverified until the existing Patch_Endpoint rescan confirms the result through `fixed` and `remaining`.
8. THE synthesize_patch Tool SHALL not expose an `autoApprove` option, SHALL remain proposal-only, and SHALL never write files, create branches or commits, or create pull requests.
9. WHEN the Patch_Endpoint returns unchanged code or no accepted patch, THE synthesize_patch Tool SHALL report an explicit no-change verification status rather than implying that a patch was applied.
10. WHEN the Patch_Endpoint is unavailable, rejects the request, or returns an unexpected shape, THE synthesize_patch Tool SHALL return a clear tool error without fabricating edits or verification.

### Requirement 9: Cache behavior and process boundaries

**User Story:** As a maintainer, I want predictable cache behavior, so that MCP findings reflect the latest analysis without introducing persistence or cross-request state leaks.

#### Acceptance Criteria

1. THE MCP_Server SHALL store analysis results in an in-memory Map keyed by the Normalized_Repo_Key produced by `parseGitHubUrl()`.
2. WHEN later `analyze_repo` calls use equivalent inputs `owner/repo`, `github.com/owner/repo`, and `https://github.com/owner/repo`, THE MCP_Server SHALL use the same Analysis_Cache entry and SHALL replace the previous cached RepoAnalysis after a successful call.
3. WHEN a later `analyze_repo` call fails, THE MCP_Server SHALL preserve the last successful cached RepoAnalysis for that Normalized_Repo_Key.
4. WHEN a repository URL is invalid, THE MCP_Server SHALL return the existing invalid-URL tool error from `parseGitHubUrl()` and SHALL not read or write the Analysis_Cache.
5. THE MCP_Server SHALL not persist the Analysis_Cache to a database, filesystem, session store, or external service.
6. WHEN the MCP_Server process exits, THE MCP_Server SHALL discard the Analysis_Cache.
7. THE MCP_Server SHALL prevent a cached result for one Normalized_Repo_Key from satisfying a `get_findings` request for a different Normalized_Repo_Key.

### Requirement 10: Clear operational errors and safe logging

**User Story:** As an MCP client user, I want actionable errors, so that I know whether to correct input, start the Next app, wait for GitHub, or analyze a repository first.

#### Acceptance Criteria

1. WHEN a repository URL is invalid, THE MCP_Server SHALL return the existing invalid-URL tool error from `parseGitHubUrl()`; WHEN the Ingest_Endpoint rejects a validly parsed URL, THE MCP_Server SHALL identify the URL validation problem in the tool error.
2. WHEN the Next_Application cannot be reached, THE MCP_Server SHALL return an error instructing the user to start the Next application or check `NECRO_API_URL`.
3. WHEN the Ingest_Endpoint reports a GitHub rate limit, THE MCP_Server SHALL identify GitHub rate limiting and SHALL not retry indefinitely.
4. WHEN a requested file is not in the Analysis_Cache, THE MCP_Server SHALL instruct the user to call `analyze_repo` first or provide a path from the latest analysis.
5. THE MCP_Server SHALL never log GitHub tokens, API keys, full source code, full patch contents, or unredacted request credentials.
6. THE MCP_Server SHALL write diagnostics only to stderr and SHALL keep tool error payloads suitable for MCP clients.

### Requirement 11: Scope and non-goals

**User Story:** As a project owner, I want the MCP feature constrained to its intended proxy role, so that implementation remains small and consistent with Necro-Docs.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose exactly four tools and SHALL not expose tools for pull requests, branch creation, commits, authentication changes, UI operations, persistence, or repository mutation.
2. THE MCP_Server SHALL not add new repository-analysis rules, scanner rules, or patch-generation rules.
3. THE MCP_Server SHALL not implement HTTP or SSE transport for MCP clients.
4. THE MCP_Server SHALL not introduce a database or durable cache.
5. THE MCP_Server SHALL keep all source changes for this feature inside the MCP server and MCP settings specification defined by this feature; this requirement is a scope constraint for implementation planning.

### Requirement 12: Mark which findings are auto-fixable

**User Story:** As an engineer, I want to know which findings a patch can resolve, so that I only ask for patches where one can work.

#### Acceptance Criteria

1. THE get_findings Tool and THE scan_code Tool SHALL add a boolean `patchable` to every finding they return.
2. THE `patchable` value SHALL be computed with the existing `isPatchable()` from `src/lib/types.ts`; THE MCP_Server SHALL NOT copy or redefine `PATCHABLE_KINDS`.
3. THE analyze_repo Tool SHALL add `patchableCount`, the number of the node's findings for which `isPatchable()` is true, to each file entry in the top-10 list. This extends the field list in Requirement 5.3.
4. FINDINGS with `source` other than `static` SHALL have `patchable: false`.

### Requirement 13: File context in get_findings

**User Story:** As an engineer, I want to know what a file imports and what imports it, so that I can judge the impact of a change before patching.

#### Acceptance Criteria

1. THE get_findings Tool SHALL return `importedBy` and `imports`, each an array of repository file paths with at most 20 entries, derived from the cached RepoAnalysis `edges`.
2. AN edge `{ from, to }` SHALL mean that the node with id `from` imports the node with id `to`, matching how the web workspace builds its `importedBy` (callers are edges whose target is the file). THE `importedBy` of a file SHALL be the paths of the `from` nodes of edges whose `to` is the file; THE `imports` SHALL be the paths of the `to` nodes of edges whose `from` is the file. Edge endpoints that match no cached node SHALL be ignored.
3. THE get_findings Tool SHALL NOT return `node.code`. This keeps Requirement 6.6.

### Requirement 14: Patch a cached repository file

**User Story:** As an engineer, I want a verified fix for any analyzed GitHub file, so that I do not need the file open locally.

#### Acceptance Criteria

1. THE synthesize_patch Tool SHALL accept either `{ path, code, dependencies?, importedBy? }` or `{ repoUrl, path }`. This extends Requirement 4.5.
2. THE synthesize_patch schema SHALL require exactly one of `code` or `repoUrl`; supplying both or neither SHALL be a validation error naming the arguments. `dependencies` and `importedBy` SHALL NOT be accepted together with `repoUrl`.
3. WHEN `repoUrl` is supplied, THE synthesize_patch Tool SHALL read the node from the Analysis_Cache by Normalized_Repo_Key and `path`, use that node's `code` as the file content, derive `importedBy` from `edges` by the rule in Requirement 13.2 (at most 20), and use `RepoAnalysis.dependencies` as `dependencies` (at most 200), which is the same context the web workspace sends to the Patch_Endpoint.
4. WHEN the cache has no entry for `repoUrl` or no node for `path`, THE synthesize_patch Tool SHALL return the existing "call analyze_repo first" or "file is not present" errors without calling the Patch_Endpoint.
5. WHEN `repoUrl` is supplied and the cached file content has no finding for which `isPatchable()` is true according to `scanSource(path, code)`, THE synthesize_patch Tool SHALL return a clear successful message that nothing is patchable and SHALL NOT call the Patch_Endpoint.
6. THE synthesize_patch Tool SHALL remain proposal-only and SHALL NOT be added to `autoApprove`. Requirements 8.5 to 8.8 continue to apply.

### Requirement 15: Kiro usage layer

**User Story:** As a Kiro user, I want a documented workflow and a save hook, so that Kiro uses the tools safely and consistently.

#### Acceptance Criteria

1. THE project SHALL provide `.kiro/steering/necro-surgeon.md` describing the workflow analyze_repo, get_findings, synthesize_patch, user approval, apply, scan_code to confirm the finding is gone, and run the related Vitest tests.
2. THE steering file SHALL state that only patchable findings are patched, that structural findings (long-function, duplicate, nesting, branch, coupling) are explained with a proposed plan and not refactored unless the user asks, and that exported names are never changed.
3. THE project SHALL provide one Kiro agent hook that, on save of `src/**/*.{ts,tsx}`, calls scan_code on the saved file and reports only new patchable findings in one short message.
4. THE README SHALL contain a short section "Use Necro-Docs from Kiro (MCP)" covering `npm ci`, `.env.local` (GITHUB_TOKEN recommended, AI key optional because synthesize_patch falls back to static fixes), `npm run dev`, enabling MCP, and three example prompts.
5. THIS requirement adds no code under `src/`.

## Correctness Properties and Testing Strategy

The following properties define testable behavior for the four tools and the cache/proxy boundary. Pure helper behavior should use Vitest examples and property-based tests where input variation is meaningful. Next API availability, GitHub responses, and MCP inspector wiring should use representative integration or smoke checks with fakes and a running local application.

1. **Tool-set exactness:** For every server startup, the registered tool-name set equals `{analyze_repo, get_findings, scan_code, synthesize_patch}`.
2. **Validation-before-side-effects:** For every invalid Zod input, the tool returns a validation error and performs zero proxy requests, scanner calls, or cache writes.
3. **Compact summary bound:** For every successful RepoAnalysis, `analyze_repo` returns no more than 10 file summaries, each with only `path`, `score`, and `findingCount` among file-level details, and excludes full graph edges and code.
4. **Cache replacement:** For every normalized repository key and two successful analyses A then B, a subsequent `get_findings` reads B and never A.
5. **Cache failure preservation:** For every normalized repository key with successful cached analysis A followed by failed analysis, `get_findings` continues to read A.
6. **Cache key normalization and invalid URL behavior:** For every valid repository, the inputs `owner/repo`, `github.com/owner/repo`, and `https://github.com/owner/repo` share one cache entry; every invalid URL returns the existing invalid-URL tool error and does not access that entry.
7. **Finding projection:** For every cached RepoNode, `get_findings` projects the scanner finding fields exactly as `line`, `kind`, `text`, and `suggestion`, without returning code or unrelated nodes.
8. **Scanner parity:** For every supported path and code input, `scan_code` returns the same finding kinds, lines, texts, and suggestions as the existing scanner path used by `/api/patch` before model patching.
9. **Patchable forwarding boundary:** For every patch request, the MCP layer forwards only endpoint-supported patch context and delegates patchable-kind selection to `/api/patch`; it does not send structural or non-patchable findings as model targets.
10. **Patch derivation consistency:** For every Patch_Endpoint response, derived `verification.changed` equals whether `patchedCode` differs from the original code, `patchedCode` is present exactly when `verification.changed` is true, and derived fixed/remaining status reflects the response arrays without inventing a successful patch.
11. **No stdout diagnostics:** For every invalid input, proxy failure, and scanner error, diagnostics are emitted on stderr and stdout remains reserved for MCP protocol traffic.
12. **Error classification:** Representative malformed URL, unavailable Next application, GitHub rate-limit, missing cache, and unexpected response cases each produce a distinct actionable tool error without secrets.

### Test Scenarios

- Start the server with `npx tsx mcp/server.ts` and inspect the registered tools with `npx @modelcontextprotocol/inspector`.
- Validate each of the four tool schemas with valid inputs and representative invalid inputs.
- Use a fake Next API for ingest success, ingest errors, patch success, unchanged patch, and malformed responses.
- Test cache replacement, failed-refresh preservation, normalized-key equivalence, invalid-URL errors, and missing-file errors with Vitest.
- Compare `scan_code` output with the current scanner used by `/api/patch` for representative TypeScript, JavaScript, Python, and Go paths supported by the analyzer.
- Confirm compact output does not contain the complete `edges` array, full node code, or complete repository contents.
- Confirm stderr-only diagnostics and absence of token/source logging.

## Non-Goals

- Opening GitHub pull requests, creating branches, or committing changes.
- Authentication changes or token management.
- New analysis, AST, finding, severity, or patch-generation rules.
- UI changes in the Next application.
- HTTP or SSE MCP transport.
- Database, filesystem, or other durable persistence for the analysis cache.

## Acceptance and Sign-Off

**Feature**: MCP server proxy with four tools  
**Spec name**: `mcp-server`  
**Workflow**: Requirements-first  
**Status**: Ready for review  
**Source of truth**: Current endpoint and analyzer contracts in `src/app/api/ingest/route.ts`, `src/app/api/patch/route.ts`, `src/lib/repoAnalyzer.ts`, `src/lib/astScan.ts`, and `src/lib/types.ts`.
