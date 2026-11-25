# Necro-Docs Current Architecture

**Status:** Current project guidance. Prefer this file over older examples in the original steering documents when they conflict.

## Product

Necro-Docs turns an unfamiliar GitHub repository into an explainable engineering workflow:

```text
GitHub URL
→ repository analysis
→ key-file graph and forensic findings
→ Voice Séance / blast-radius investigation
→ Surgical Patch
→ GitHub branch and Pull Request
```

The product is a codebase archaeologist, not just a chatbot. Every important claim should point to source evidence, dependency context, or a clearly labeled heuristic.

## Current stack

- Next.js 16.4.6 App Router with `cacheComponents: true`
- React 19.3.0 and TypeScript strict mode
- Tailwind CSS 4.3.3 with a clean, light, modern visual system
- Zustand 5.1.0 where shared client state is needed
- Lucide React icons and shadcn/ui primitives
- Vitest and fast-check for tests
- TypeScript compiler API for context-aware server-side scanning
- GitHub REST API without cloning repositories to disk
- Gemini/OpenAI-compatible explanation providers, Google Cloud TTS, browser speech fallback

## Codebase analysis architecture

### Ingestion

`POST /api/ingest`:

1. Parses and validates a GitHub URL.
2. Reads the default branch and recursive GitHub tree.
3. Excludes tests, config, generated/build/vendor directories, dot-folders, declaration files, and files larger than 250 KB.
4. Fetches up to 400 eligible source files within a 3.5 MB source budget, with bounded concurrency.
5. Computes static metrics, dependency edges, findings, rot score, and source evidence for every successfully fetched file.
6. Marks approximately 30 featured files from hotspots, dependency hubs, entry points, and deterministic risk ranking.
7. Sends featured files only to the AI explanation provider. AI failure never removes static analysis.
8. Returns coverage metadata and provenance for each node.

The response contract is defined in `src/lib/repoAnalyzer.ts` and converted for the workspace in `src/lib/conversion/helpers.ts`.

### Static and AST scanner

`src/lib/repoAnalyzer.ts` owns repository orchestration and heuristic scoring. `src/lib/astScan.ts` adds syntax-aware context for JavaScript/TypeScript:

- template/string contents are data, not duplicate code;
- copied `interface`/`type` text inside prompts becomes Prompt Schema Drift Risk;
- empty catches are distinguished from multi-stage fallback chains;
- `dangerouslySetInnerHTML` checks sanitizer calls, static strings, and i18n sources;
- monolithic files receive domain-based split advice;
- deep nesting receives guard-clause or extraction advice.

The scanner is syntax-aware but not a full type-checked compiler analysis. Findings are heuristic evidence. Do not call them proven vulnerabilities unless the source evidence supports that claim.

### Rot score

Rot is a bounded 0–100 heuristic, not a bug count. Current components include:

- file volume,
- control-flow nesting,
- branching density,
- silent/weak error handling,
- executable-file coupling,
- secrets and unsafe HTML,
- duplicate blocks,
- typing and technical-debt findings.

Every displayed finding should include a line number where possible. Recommendations should be actionable: guard clauses, extracted helpers, domain splits, shared modules, sanitization, test additions, or secret rotation.

## Graph UX

The workspace separates analysis coverage from graph visibility:

- **Key files:** featured files shown initially.
- **Revealed files:** non-featured files opened by search, dependency navigation, blast radius, or Voice Séance.
- **All files:** every successfully analyzed file.

Search searches every analyzed file but must not flood the canvas with every match. Debounce search input, reveal a bounded result set, and reveal a specific file when the user selects it. Large graphs wrap into multiple columns and fit the currently drawn set to the viewport.

Coverage must be stated honestly, for example:

```text
Key files 30 · Revealed 2 · All files 344
344 source files analyzed · 32 skipped
```

Do not label revealed files as key files.

## Workspace features

### Floating UI

- Full-bleed canvas under the header.
- Floating Seance chat/voice panel on the left.
- Floating Autopsy inspector on the right, shown only after a node is selected.
- Inspector has `Overview` and `Source Code` tabs. Source code must scroll inside the card.
- Empty canvas click closes the inspector without changing blast-radius labels.

### Voice Séance

- User and assistant messages are separate history entries.
- Spotlight cards reveal/focus relevant nodes.
- Speech uses normalized `speechText`, so file names such as `movie.controller.js` are spoken as “movie controller J S”.
- Google TTS is server-side; browser speech is fallback.

### Surgical Patch and Pull Request

- Patch generation produces a complete patched file and real diff.
- The PR route verifies the GitHub file matches the analyzed snapshot before creating a branch.
- It creates `necro/fix-*`, commits the file, and opens a PR against the default branch.
- It cleans a newly created branch if commit/PR creation fails.
- PATs are server-side or supplied once through the fallback dialog. Never log or commit tokens.
- Git CLI fallback downloads a `.patch` file and uses portable commands. Do not use a Bash heredoc in the UI because PowerShell and CMD do not support it.

## Development rules

- Read the real code path and all callers before editing.
- Prefer existing helpers and installed dependencies.
- Keep changes focused; no unrelated refactors.
- Validate trust boundaries, GitHub paths, tokens, and source sizes.
- Add one small test for non-trivial branches, parsers, security rules, or scoring changes.
- Run the narrowest relevant tests, then `npx tsc --noEmit` and `npm run build` for cross-cutting changes.
- Preserve accessibility: semantic controls, focus rings, labels, keyboard fallbacks, and `aria-live` for async voice status.

## Canonical locations

- Repository analyzer: `src/lib/repoAnalyzer.ts`
- AST context scanner: `src/lib/astScan.ts`
- Graph layout: `src/lib/graphLayout.ts`
- Graph display scope/camera: `src/app/workspace/graphDisplay.ts`
- Workspace UI: `src/app/workspace/page.tsx`
- Voice panel: `src/app/workspace/SeanceConsole.tsx`
- Patch and PR UI: `src/app/workspace/SurgicalPatch.tsx`
- PR backend: `src/app/api/pr/route.ts`, `src/lib/githubPr.ts`
- Analyzer SDD: `.kiro/specs/github-ingest-coderot/current-implementation.md`

_Last updated for the current analyzer, graph scope, AST context pass, TTS, and GitHub PR workflow._
