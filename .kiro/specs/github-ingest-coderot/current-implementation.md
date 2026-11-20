# Current Implementation Contract

This document supersedes conflicting MVP limits and scoring details in the original requirements/design sections. The implementation is intentionally broader than the first 25-file prototype.

## Analysis coverage

- The analyzer retrieves the recursive GitHub tree without cloning the repository.
- It considers TypeScript, TSX, JavaScript, JSX, Python, and Go source files.
- Tests, configuration files, generated/build/vendor directories, dot-folders, declaration files, and files larger than 250 KB are excluded from source analysis.
- It analyzes up to **400 eligible files** and up to **3.5 MB of source content** per request. These are safety budgets, not a claim that the repository contains only that many files.
- File retrieval uses bounded concurrency of 12.
- The response includes coverage metadata:
  - `totalFiles`: supported code-like files found before selection limits
  - `analyzed`: files successfully fetched and scanned
  - `featured`: files selected for the initial graph and AI explanation
  - `skipped.tests`, `config`, `generated`, `tooLarge`, `overLimit`, `unreadable`
  - `treeTruncated`: whether GitHub truncated the recursive tree
  - `fileLimit`: current maximum eligible files

## Static analysis and AI analysis

Every analyzed file receives deterministic static analysis. The analyzer calculates its rot score, findings, code, metrics, and dependency relationships even when no AI provider is configured.

Only approximately 30 `featured` files are sent to the AI explanation provider. Featured files are selected from:

- high rot-score hotspots,
- dependency hubs with many importers,
- entry points such as routes, pages, controllers, routers, `main`, `server`, and `app` files,
- remaining files ranked by risk and dependency impact.

Each node exposes:

- `featured: boolean`
- `explainedBy: 'ai' | 'static'`

Static-only files remain searchable, selectable, exportable, and usable by blast-radius and Voice Séance flows.

## Graph presentation

The analyzer stores every successfully analyzed node and valid edge. The workspace initially renders featured/key files only. It can reveal additional analyzed files when the user:

- selects a search result,
- follows a dependency from the inspector,
- analyzes a downstream blast radius,
- receives a Voice Séance spotlight,
- switches to the `All files` scope.

The workspace distinguishes:

- `Key files`: featured files selected by the analyzer
- `Revealed files`: non-featured files added by user action
- `All files`: every analyzed file

Search searches all analyzed files but must not flood the canvas with every match. It reveals a bounded number of matches and provides a way to switch to the full scope.

## Rot score model

The rot score is a deterministic heuristic from 0 to 100. It is not a bug count and must be presented with concrete findings.

The current components are:

- file volume, capped at 25 points,
- control-flow nesting beyond the free depth, capped at 15 points,
- branching density, capped at 15 points,
- silent or weak error handling, capped at 30 points,
- dependency coupling, capped at 15 points for files containing executable logic,
- security and maintainability findings such as hard-coded credentials, unsafe HTML, `eval`, `any`, TODO debt, and duplicate blocks.

The static scanner reports evidence with line numbers where possible. It distinguishes:

- empty catches with no explanation,
- catches that return a placeholder,
- documented intentional ignores,
- catches that perform a fallback or otherwise handle the error.

The parser is heuristic and regex-based. It must not claim AST-level certainty. Future AST/tree-sitter work can replace individual detectors without changing the API contract.

## Parser limitations

Known limitations include dynamic imports, unusual TypeScript syntax, complex template expressions, macro-generated code, language-specific semantics, and incomplete path-alias resolution. Findings are evidence-based heuristics and may have false positives. The UI should expose the source evidence and whether an explanation came from static analysis or AI.

## API compatibility

The `RepoAnalysis` response includes `coverage`, `featured`, and `explainedBy` fields. Consumers that read older session data must tolerate missing coverage and treat legacy nodes as featured/static-compatible data. New responses should always include these fields.
