# Current Implementation Tasks

These tasks track the post-MVP analyzer and graph contract. They complement the original task list and should be checked against the current code before future changes.

- [x] Analyze eligible source files within a 400-file / 3.5 MB budget.
- [x] Fetch files with bounded concurrency of 12.
- [x] Return coverage and skip-reason metadata.
- [x] Select featured files from hotspots, hubs, and entry points.
- [x] Restrict AI explanations to featured files and preserve static fallback results.
- [x] Add `featured` and `explainedBy` to analyzed nodes.
- [x] Add key-files versus all-files graph scope.
- [x] Reveal non-featured files through search context, dependencies, blast radius, and Voice Séance.
- [x] Add large-graph layout wrapping and viewport fitting.
- [x] Add static findings for secrets, raw HTML injection, duplicate blocks, placeholder catches, and documented catches.
- [x] Replace indentation-only nesting with control-flow nesting for supported brace languages and Python control blocks.
- [x] Add analyzer, graph layout, graph display, and Seance boundary tests.

- [ ] Add explicit re-analysis cache invalidation and show analysis timestamp/commit in the workspace.
- [ ] Add a commit SHA to `RepoAnalysis` and use it for PR snapshot verification.
- [ ] Replace regex scanning with AST/tree-sitter parsing for TypeScript/JavaScript when parser precision becomes a requirement.
- [ ] Add per-finding confidence/evidence metadata to the public node schema.
- [ ] Add a server-side on-demand endpoint for static explanation/source of a non-featured file if sessionStorage becomes too large.
- [ ] Add a performance test for the `All files` view with 400 nodes and several thousand edges.
