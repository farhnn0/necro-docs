

---

## Addendum: Current Production Design

The original design describes the first MVP. The following decisions are authoritative for the current implementation and are documented in detail in `current-implementation.md`.

### Coverage budget

The pipeline analyzes all eligible source files within a configurable safety budget of 400 files and 3.5 MB of source content. It does not stop at 25 files. It excludes tests, config files, generated output, dot-folders, declaration files, and files larger than 250 KB. File retrieval uses bounded concurrency of 12.

The pipeline returns `coverage` metadata so the client can distinguish repository coverage from graph presentation. A repository can have 344 analyzed files while the initial graph shows only 30 key files.

### Featured files and AI budget

Static analysis runs for every successfully fetched file. The analyzer then selects approximately 30 featured files using rot score, importer count, entry-point patterns, and a deterministic fallback ranking. Only featured files are sent to the AI explanation provider. This prevents AI request size and cost from growing linearly with repository size while preserving complete static coverage.

`RepoNode` now includes:

```ts
featured: boolean;
explainedBy: 'ai' | 'static';
```

`RepoAnalysis` now includes coverage counts and skip reasons. Older cached results remain readable through backward-compatible conversion.

### Graph UX

The workspace initially renders featured files. Non-featured files remain in the specimen and can be revealed through search selection, dependency navigation, blast-radius analysis, Voice Séance spotlight, or an explicit `All files` scope. The scope bar must label these categories separately as `Key files`, `Revealed files`, and `All files`.

Search must search all analyzed nodes but must not add every matching node to the canvas at once. Large graph layouts wrap into multiple columns and fit the current drawn node set to the viewport.

### Current rot model

The initial requirements formula is superseded by the current heuristic model. The score combines capped volume, control-flow nesting, branching density, silent error handling, executable-file coupling, and security/maintainability findings. It remains a bounded 0–100 heuristic, not a defect count.

The scanner is intentionally regex-based for the current release. It performs string/comment masking, control-flow depth detection, catch classification, secret-pattern detection, raw HTML detection, duplicate-block detection, and dependency relationship extraction. Findings must include source evidence and the AI prompt must verify static findings before presenting them.

### Design trade-off

This design favors complete static coverage plus focused visual/AI presentation over a graph containing every file by default. Showing every file at first makes large repositories unreadable; analyzing only a small sample makes the overall rot score and search incomplete. Separating analysis coverage from graph visibility solves both problems.
