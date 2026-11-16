# Implementation Plan: Necro-Docs UI Conversion

## Overview

Implement the prototype in `public/necro_docs_interactive_ui_prototype.html` as a Next.js App Router experience while preserving the existing ingest backend and ingest test suite. The implementation is organized so pure specimen, layout, scrolling, error-mapping, and seance-response logic is testable independently from React rendering. The plan intentionally does not implement `/api/seance`; the workspace consumes the contract defined by Requirements 13.1–13.10.

The implementation uses TypeScript and the existing dependencies only. Tasks are ordered so shared data and pure logic exist before the landing and workspace pages, then integration, accessibility, and validation are added.

## Tasks

- [x] 1. Establish the conversion data and shared logic boundaries
  - [x] 1.1 Inspect the prototype and existing ingest types/contracts, then record the implementation mapping in the conversion modules without modifying `src/app/api/ingest/`, `src/lib/ingest/`, `.kiro/specs/github-ingest-coderot/`, or the prototype HTML.
    - Identify the exact landing sections, workspace states, preset copy, node data, graph edges, and interaction behavior that must be represented.
    - Confirm the existing `IngestResult`, `ApiResponse`, and ingest error shapes used by the client.
    - _Requirements: 5.8, 15.1, 15.3_
  - [x] 1.2 Create the shared conversion type definitions for preset specimens, ingested specimens, workspace nodes, edges, loading/error state, seance requests/responses, and spotlight state in the appropriate `src/lib` module.
    - Keep the types compatible with existing shared types rather than duplicating incompatible API types.
    - Model preset and ingested data as distinguishable variants so detail-panel behavior and seance payloads can branch safely.
    - _Requirements: 7.3–7.4, 8.5–8.7, 11.1–11.9, 13.1–13.2_
  - [x] 1.3 Add the three server/client-safe preset specimen datasets and fallback answers.
    - Include the exact `payment`, `scraper`, and `realtime` node ids, edges, titles, summaries, metadata, positions, findings, modified text, excerpts, and quick-question answers from the prototype.
    - Export lookup helpers that never access `window` or `document` and validate preset ids and edge references.
    - _Requirements: 11.1–11.9_
  - [x] 1.4 Add pure conversion and policy helpers.
    - Implement `Scrolly_Progress` to `Scrolly_Step`, rot-score color tier selection, `IngestResult` to `Ingested_Specimen`, repository title/summary derivation, node layout, ingest error-code message mapping, quick-question generation, seance payload construction, and seance response spotlight filtering.
    - Ensure invalid graph edges are skipped, ingested node positions do not overlap, acyclic edges flow left-to-right, and fallback diagnosis text is available from metrics.
    - _Requirements: 6.3, 7.5, 7.12–7.13, 8.7, 9.5, 10.6–10.9, 12.17–12.18, 13.1, 13.3–13.7, 15.7–15.9_
  - [ ]* 1.5 Write focused unit tests for the shared helpers and preset invariants.
    - Cover preset ids and exact prototype datasets, unique node ids, valid edge references, rot range/integer constraints, progress thresholds and monotonicity, ingest mapping preservation, invalid-edge filtering, layout non-overlap/ordering, error-code messages, quick-question rules, payload exclusion of `rawContent`, and spotlight filtering.
    - Use deterministic examples and boundary cases; do not add a new testing dependency.
    - _Requirements: 6.3, 7.12–7.13, 10.6–10.9, 11.2–11.9, 13.1, 13.3–13.9, 15.7–15.9_

- [x] 2. Convert the root layout and global design system
  - [x] 2.1 Update `src/app/layout.tsx` as a Server Component.
    - Load Plus Jakarta Sans weights 400/500/600/700 and JetBrains Mono weights 400/500/600 through `next/font/google` with fallback stacks.
    - Map the generated variables to `font-sans`, `font-display`, and `font-mono`; remove Geist imports; set `lang="en"`; update metadata title and non-empty description.
    - _Requirements: 2.1–2.6, 14.9, 15.6_
  - [x] 2.2 Replace the starter global styling in `src/app/globals.css` with the prototype design tokens and base rules.
    - Define the approved palette names and values, explicitly mark unresolved pending tokens with `/* PENDING */`, and avoid unapproved color literals elsewhere in the stylesheet.
    - Set white page background, ink foreground, font smoothing, fallback stacks, focus-ring utilities, `.acctual-window`, `.paper-grid`, truncation helpers, and responsive overflow rules.
    - Do not add a dark-mode override or a conflicting Tailwind configuration.
    - _Requirements: 1.1–1.7, 2.2–2.6, 3.1–3.2, 14.3, 14.8, 14.11, 15.2_
  - [x] 2.3 Add the shared reduced-motion rules and visual animation primitives to `globals.css`.
    - Cover stage transitions, stagger delays, wire drawing, product-window lift, waveform animation, and no-transition behavior under one `prefers-reduced-motion: reduce` block.
    - Ensure no animation relies on colored dots or badge classes.
    - _Requirements: 4.1–4.6, 6.9–6.10, 12.15, 14.6, 14.11_
  - [ ]* 2.4 Add stylesheet-focused checks or static assertions for palette values, prohibited CDN/script references, required effect classes, absence of dark-mode overrides, and presence of the single reduced-motion block.
    - _Requirements: 1.1–1.7, 2.2, 3.1–3.2, 14.11, 15.2_

- [x] 3. Implement the landing page and scrollytelling
  - [x] 3.1 Replace `src/app/page.tsx` with the semantic landing-page structure and prototype copy.
    - Render header navigation, hero form, feature pillars, specimen report, tilted decorative code sheets, quote, walkthrough shell, capabilities, stages, preset directory, and closing banner in the required order.
    - Use `lucide-react` icons, native links/buttons/forms, approved styling, plain-text status labels, and no badges or colored dots.
    - Keep decorative code sheets hidden below `lg`, rotated -6/6 degrees, and `aria-hidden`.
    - _Requirements: 4.1–4.6, 5.1–5.9, 14.1–14.8_
  - [x] 3.2 Wire landing-page navigation and repository form behavior.
    - Navigate launch/open actions to `/workspace?specimen=payment`.
    - Navigate valid presets to `/workspace?specimen=<id>`.
    - Trim non-empty repository input and navigate to `/workspace?repo=<encoded-value>`; use the payment preset for empty input.
    - Preserve the required placeholder and accessible form name.
    - _Requirements: 5.2–5.4, 9.1–9.3_
  - [x] 3.3 Implement the sticky `#live-walkthrough` scrollytelling controller.
    - Render the four narrative steps as an ordered list and four stage panels with step-one server-rendered active fallback.
    - Compute clamped progress safely, apply exact 0.25/0.50/0.75 thresholds, update the `0<step> / 04` counter and progress width, and recompute on load/resize.
    - Use a passive scroll listener with at most one computation per animation frame; clean up listeners and animation frames.
    - Set inactive panels to `pointer-events: none` and `aria-hidden="true"`; preserve reduced-motion behavior and step-two wire drawing.
    - _Requirements: 3.3, 6.1–6.14, 14.11, 15.7–15.9_
  - [ ]* 3.4 Write landing-page and scrollytelling tests.
    - Verify required section order, links, form navigation, mobile stacking/no horizontal overflow, decorative accessibility, active-step thresholds, fallback step one, passive/frame-throttled lifecycle behavior, exactly one active narrative/panel, progress width, and reduced-motion semantics.
    - _Requirements: 5.1–5.9, 6.1–6.14, 9.1–9.3, 14.1–14.8_

- [x] 4. Implement workspace loading, preset selection, and ingest lifecycle
  - [x] 4.1 Create the client workspace page at `src/app/workspace/page.tsx` with viewport-filling semantic layout.
    - Read `repo` and `specimen` query parameters; render choices when neither is supplied or the specimen is invalid.
    - Render the top bar, graph area, detail panel, and seance console slots without page-level scrolling.
    - Keep browser-only state/effects inside client components and keep shared data modules server-safe.
    - _Requirements: 7.1–7.2, 9.6–9.8, 11.1, 14.1–14.2, 15.6_
  - [x] 4.2 Implement preset loading and initial selection.
    - Render valid presets without calling `/api/ingest`.
    - Select the highest rot-score node, using first-list order for ties, after each specimen load.
    - Show the preset choices and repository form for empty/invalid source states.
    - _Requirements: 8.1, 9.6–9.8, 11.1–11.8_
  - [x] 4.3 Implement the repository ingest request lifecycle.
    - Send exactly one same-origin `POST /api/ingest` request per repo value with JSON content type and normalized `https://` URL.
    - Use `AbortController` on unmount, retry, cancel, and repo changes; prevent stale responses from replacing the current specimen.
    - Build the ingested specimen, title, infection summary, partial-result note, and metrics from successful responses.
    - Never expose credentials or raw source content in client request code.
    - _Requirements: 9.4–9.11, 10.13–10.14, 15.1, 15.6–15.8_
  - [x] 4.4 Implement loading, slow, cancel, error, retry, and fallback states.
    - Expose loading with `role="status"`, `aria-live="polite"`, repository text, `Analyzing repository…`, and `Cancel`.
    - Show the 8-second slow message and preset choices without auto-switching.
    - Map all listed error codes and malformed/network failures to safe messages; show only the code, never details, stack traces, or raw bodies.
    - Use `role="alert"`, preserve retry behavior, switch to presets within one frame, and show `Showing sample data` after fallback.
    - Move focus to the heading whenever loading, error, or graph state changes.
    - _Requirements: 10.1–10.14, 14.10_
  - [ ]* 4.5 Write workspace source/lifecycle tests.
    - Mock fetch and timers to verify request count, normalized payload, abort behavior, stale-response protection, 8-second slow state, cancel/retry, malformed responses, all error mappings, fallback timing, loading/error roles, and focus movement.
    - Verify valid presets never call ingest and invalid/empty source states show choices.
    - _Requirements: 9.4–9.11, 10.1–10.14, 15.4–15.5_

- [x] 5. Implement graph canvas, node interaction, edges, and detail panel
  - [x] 5.1 Render workspace graph nodes and curved edges from the active specimen.
    - Render one accessible Workspace_Node per valid node and skip edges with missing endpoints.
    - Draw source-right to target-left curved edges; use spotlight, selected, and neutral states with required widths/colors.
    - Apply `.paper-grid`, node truncation, rot-score styling, and hotspot isolation without badges or colored dots.
    - _Requirements: 3.4, 4.1–4.5, 7.3–7.5, 7.8–7.10, 7.12, 8.4, 14.4, 14.8_
  - [x] 5.2 Implement pointer and keyboard pan plus reset behavior.
    - Pan only when dragging empty canvas space; prevent node clicks from starting a pan.
    - Support 40px arrow-key panning when the canvas is focused; reset to pan `(0, 20)` and scale `0.92`.
    - Honor reduced motion for pan/scale changes and keep the viewport free of page-level scroll.
    - _Requirements: 7.1, 7.6–7.7, 7.11, 8.3, 14.5, 14.11_
  - [x] 5.3 Implement selection, spotlight centering, and node accessibility.
    - Support click, Enter, and Space selection; set `aria-pressed`, selected border, selected detail content, and focus-safe event propagation.
    - Center spotlight nodes at scale 1 and style their nodes/terminating edges; preserve selection when no spotlight ids are valid.
    - Cancel speech synthesis on unmount.
    - _Requirements: 7.9–7.10, 7.14, 8.1–8.3, 13.3–13.4, 14.2, 14.4–14.7_
  - [x] 5.4 Implement the responsive Detail_Panel.
    - Show path, heading, rot score, structural diagnosis, telemetry, and source excerpt as escaped text.
    - Render preset findings/modified text/excerpt; render ingested metrics, raw content, truncation marker, and derived diagnosis while omitting last modified.
    - Use a full-width closable overlay below 640px and a 384px right column at 640px and above.
    - _Requirements: 8.4–8.9, 14.1–14.2, 14.6, 14.8_
  - [ ]* 5.5 Write graph and detail-panel tests.
    - Cover highest-score selection/tie order, click/keyboard activation, no pan on node click, invalid-edge omission, isolation opacity, edge highlighting, spotlight centering/filtering, reset/pan keyboard behavior, responsive panel content, text-only rendering, and speech cancellation.
    - _Requirements: 7.3–7.14, 8.1–8.9, 13.3–13.5, 14.4–14.7_

- [x] 6. Implement the Seance console and API fallback behavior
  - [x] 6.1 Render the Seance_Console UI and keyboard-first controls.
    - Include transcript, quick questions, text input, send button, microphone control, and seven decorative waveform bars.
    - Keep text entry available regardless of microphone/speech support; use `aria-live="polite"`, accessible names, and no status badges/dots.
    - Generate preset quick questions from data and ingested questions from highest/second-highest rot nodes.
    - _Requirements: 4.1–4.5, 12.1–12.3, 12.7, 12.11–12.12, 12.17–12.18, 14.1–14.7_
  - [x] 6.2 Implement speech recognition lifecycle and error handling.
    - Detect standard and webkit recognition, configure `en-US`, run one session, toggle `Listening…`/`Ask by voice`, and expose `aria-pressed`.
    - Submit final transcripts through the same query path; stop on repeated activation; disable unsupported microphone input with an explanatory transcript message.
    - Handle permission, no-speech, audio-capture, network, and aborted errors without silently submitting fallback questions; restore focus to text input where required.
    - _Requirements: 12.4–12.10, 12.18, 14.6–14.7_
  - [x] 6.3 Implement Seance_API requests, response handling, and fallback answers.
    - Trim and cap questions at 500 characters; abort the previous query when a new query starts; send the exact request shape without `rawContent`.
    - Handle success, invalid spotlight ids, optional selected node, plain-text answer rendering, `Thinking…`, 15-second timeout, malformed/error responses, preset fallback matching, and ingested unavailable messaging.
    - Preserve spotlight/selection on ingested failures and cancel/safely end speech synthesis before new utterances.
    - _Requirements: 12.11–12.18, 13.1–13.10, 7.14_
  - [x] 6.4 Implement speech synthesis and waveform behavior.
    - Use rate `1.02`, cancel current utterances, animate until end/error, stop after 2.6 seconds without synthesis, and use fixed heights under reduced motion.
    - Ensure unmount cleanup cancels recognition, timers, animation, and speech synthesis.
    - _Requirements: 12.13–12.16, 14.11_
  - [x] 6.5 Write Seance console and API contract tests.
    - Mock recognition, synthesis, timers, and fetch to verify exact request payloads, query trimming/capping, abort/latest-response behavior, fallback matching, spotlight filtering, error messages, unsupported browser behavior, recognition errors, speech rate, waveform timing, and reduced-motion behavior.
    - _Requirements: 12.1–12.18, 13.1–13.10, 14.6–14.7_

- [ ] 7. Wire the complete application and validate the conversion
  - [x] 7.1 Wire the landing page, workspace route, shared specimens/helpers, graph, detail panel, ingest lifecycle, and Seance console into the final user flows.
    - Confirm launch actions, preset directory, repository submit, retry/cancel, graph selection, detail inspection, quick questions, keyboard input, and voice input are connected without orphan components.
    - _Requirements: 5.1–5.9, 7.1–7.14, 8.1–8.9, 9.1–9.11, 10.1–10.14, 11.1–11.9, 12.1–12.18, 13.1–13.10_
  - [x] 7.2 Add final accessibility and static-boundary checks.
    - Verify landmarks, headings, native controls, focus rings, text contrast decisions, `aria-hidden` decorations, no badges/dots, no inline scripts/string handlers, no CDN references, and no forbidden file modifications.
    - Verify the prototype remains unchanged and client code contains no credentials.
    - _Requirements: 1.2, 4.1–4.6, 5.9, 14.1–14.11, 15.1–15.3, 15.6_
  - [-] 7.3 Run the focused conversion test suite and the existing ingest test suite; fix regressions without changing the frozen ingest implementation.
    - Confirm all conversion unit/component tests pass and `src/lib/ingest/__tests__/` remains green at its pre-conversion state.
    - _Requirements: 15.4–15.5, 15.7–15.9_
  - [ ]* 7.4 Run lint and production build, then resolve all TypeScript and ESLint errors in files changed by this spec.
    - Use the repository's existing `npm run lint`, `npm run build`, and `npm test` commands; do not start a watch server as part of the task.
    - _Requirements: 15.4–15.5_

- [~] 8. Checkpoint - Ensure all tests pass, lint is clean, the production build succeeds, and ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test/validation tasks and can be skipped for a faster MVP; core implementation tasks are unmarked.
- `/api/seance` is intentionally not implemented in this plan because Requirement A3 treats it as a consumed contract. A later spec may add the route without changing the request/response shape.
- `src/app/api/ingest/`, `src/lib/ingest/`, `.kiro/specs/github-ingest-coderot/`, and `public/necro_docs_interactive_ui_prototype.html` are frozen boundaries.
- The existing design.md is empty in the workspace at task-generation time. This plan therefore uses the approved requirements and prototype as the source of truth and keeps implementation decisions explicit in task descriptions.
- No property-based testing sub-tasks are included because the design document has no Correctness Properties section. The focused unit tests still cover the required invariants and monotonicity from Requirements 15.7–15.9.
- Task dependencies are encoded by waves below. Within a wave, leaf tasks are independent; later waves depend on all earlier waves.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2"] },
    { "id": 2, "tasks": ["1.4", "2.3", "3.1"] },
    { "id": 3, "tasks": ["1.5", "2.4", "3.2", "3.3"] },
    { "id": 4, "tasks": ["3.4", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 6, "tasks": ["4.4", "5.2", "5.3"] },
    { "id": 7, "tasks": ["4.5", "5.4", "6.1"] },
    { "id": 8, "tasks": ["5.5", "6.2", "6.3"] },
    { "id": 9, "tasks": ["6.4"] },
    { "id": 10, "tasks": ["6.5", "7.1"] },
    { "id": 11, "tasks": ["7.2"] },
    { "id": 12, "tasks": ["7.3", "7.4"] }
  ]
}
```
