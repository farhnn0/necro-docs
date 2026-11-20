# Requirements Addendum: Current Analyzer and Graph Experience

This addendum is normative for the current implementation. Where the original MVP requirements say 25 files or describe the old rot formula, this addendum takes precedence.

## Requirement A: Analyze the eligible codebase within a safe budget

**User Story:** As a developer, I want the repository score to reflect the whole eligible codebase, not an arbitrary sample.

### Acceptance criteria

1. The analyzer SHALL inspect all eligible TypeScript, TSX, JavaScript, JSX, Python, and Go files within the configured budget.
2. The analyzer SHALL support up to 400 eligible files and 3.5 MB total source content per request.
3. The analyzer SHALL use bounded file-fetch concurrency of 12.
4. The analyzer SHALL exclude tests, config files, generated/build/vendor directories, dot-folders, declaration files, and files larger than 250 KB.
5. The response SHALL report `totalFiles`, `analyzed`, `featured`, `fileLimit`, `treeTruncated`, and each skip reason.
6. A skipped file SHALL never be silently counted as analyzed.

## Requirement B: Separate static coverage from AI explanation coverage

**User Story:** As a developer, I want every analyzed file scored while keeping AI requests affordable and reliable.

### Acceptance criteria

1. Every successfully fetched file SHALL receive static metrics, a rot score, findings, and dependency participation.
2. The analyzer SHALL select approximately 30 featured files from hotspots, dependency hubs, entry points, and a deterministic risk ranking.
3. Only featured files SHOULD be sent to the AI explanation provider.
4. Every node SHALL expose `featured` and `explainedBy` fields.
5. If AI is unavailable, all files SHALL remain usable with `explainedBy: 'static'`.
6. AI explanation failure for one batch SHALL not remove or invalidate static results for any file.

## Requirement C: Present large graphs progressively

**User Story:** As a developer, I want a readable initial graph without losing access to the full analysis.

### Acceptance criteria

1. The workspace SHALL initially show featured/key files rather than every analyzed node.
2. The workspace SHALL distinguish `Key files`, `Revealed files`, and `All files` in its scope control.
3. Search SHALL search every analyzed file.
4. Search SHALL not add every match to the canvas automatically; it SHALL reveal a bounded set or reveal a selected result.
5. Dependency navigation, blast-radius analysis, and Voice Séance spotlight SHALL be allowed to reveal non-featured files.
6. The graph layout SHALL avoid node overlap and SHALL fit the currently drawn nodes to the viewport.
7. Switching to `All files` SHALL show every successfully analyzed file, subject to the same rendering safety budget.

## Requirement D: Explain heuristic scores honestly

**User Story:** As a developer, I want to understand why a file has a high rot score and how certain the result is.

### Acceptance criteria

1. The rot score SHALL remain a bounded integer from 0 to 100.
2. The score SHALL combine capped file volume, control-flow nesting, branching density, silent error handling, executable-file coupling, and security/maintainability findings.
3. Findings SHALL cite a source line where possible and SHALL not be generated solely from a raw score.
4. The scanner SHALL distinguish documented intentional catches, fallback handling, placeholder returns, and genuinely empty catches.
5. The system SHALL label AI explanations separately from static explanations.
6. The UI SHALL make clear that the score is a heuristic, not a defect count or proof of a bug.

## Requirement E: Preserve analysis identity and cache honesty

**User Story:** As a developer, I want to know which repository snapshot produced a report.

### Acceptance criteria

1. The analysis response SHOULD expose the default branch and analysis timestamp.
2. Cached analysis data SHALL be invalidated or refreshed when the user explicitly re-analyzes a repository.
3. The workspace SHALL tolerate older cached responses that lack coverage and explanation provenance.
4. A future implementation MAY add the analyzed commit SHA; PR verification SHOULD use a commit-specific snapshot when available.
