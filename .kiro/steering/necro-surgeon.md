---
inclusion: fileMatch
fileMatchPattern: 'mcp/**'
---

# Necro Surgeon: fixing findings with the necro-docs MCP tools

Tools: `analyze_repo`, `get_findings`, `scan_code` (auto-approved, read-only) and `synthesize_patch` (proposal only, never auto-approved). The Next app must be running (`npm run dev`).

## Workflow

1. `analyze_repo { repoUrl }`: pick files from the top-10 list, preferring a high `patchableCount`.
2. `get_findings { repoUrl, path }`: read findings, the `patchable` flag, and `importedBy` / `imports` to judge impact.
3. `synthesize_patch { repoUrl, path }` (for a GitHub file) or `{ path, code }` (for local or unpushed code). Show the user `summary`, `verification`, `fixed`, `remaining`, and the diff of `patchedCode`.
4. Wait for the user to approve. Apply the change only after approval.
5. `scan_code` on the applied file to confirm the finding is gone and nothing new appeared.
6. Run the related Vitest file(s), for example `npx vitest --run <file>.test.ts`.

## Rules

- Patch only findings with `patchable: true` (secret, eval, empty-catch, default-catch, unsafe-html, ts-ignore, any).
- Structural findings (long-function, duplicate, nesting, branch, coupling): explain the cause and propose a plan. Do not refactor unless the user asks.
- Never change exported names, signatures, or module paths; callers in `importedBy` rely on them.
- `verification.aiOutputUnverified: true` means the change is not confirmed by the rescan; say so.
- A `patchedCode` from `synthesize_patch` is a proposal. Never write it without user approval.
- Never log or commit tokens (`GITHUB_TOKEN`, AI keys).
