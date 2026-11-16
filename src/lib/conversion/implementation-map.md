# Necro-Docs UI Conversion Implementation Map

Task 1.1 records the prototype-to-Next.js boundary. This file is an implementation map, not runtime data. Preset data and conversion helpers should be added in adjacent conversion modules in later tasks.

## Frozen boundaries and contracts

- Do not modify `public/necro_docs_interactive_ui_prototype.html`.
- Do not modify `src/app/api/ingest/`, `src/lib/ingest/`, or `.kiro/specs/github-ingest-coderot/`.
- The client consumes `POST /api/ingest` as `ApiResponse<IngestResult>` from `src/lib/types.ts`.
- A successful ingest result has `data.nodes`, `data.edges`, and `data.metadata`; the response envelope is `{ success, data?, error?, meta? }`.
- Ingest node fields available to the UI: `id`, `path`, `name`, `language`, `rotScore`, `linesOfCode`, `summaryMetrics` (`nestingDepth`, `commentRatio`, `fileSize`), `rawContent`, `isTruncated`, `importCount`, `exportCount`, and `analyzedAt`.
- Ingest edge fields available to the UI: `id`, `source`, `target`, `type` (`import | require | export`), `label`, and `metadata.importCount`.
- Ingest metadata fields available to the UI: canonical `repositoryUrl`, `defaultBranch`, `analyzedAt`, `fileCount`, `averageRotScore`, `processingDurationMs`, `treeTruncated`, `skippedFiles`, `selection`, and `rateLimit`.
- Client error handling reads only `error.code` and `error.message`; it must not display `error.details` or raw response bodies.

## Landing page mapping (`src/app/page.tsx`)

Render in this order:

1. Header: `Necro-Docs`, anchors `#live-walkthrough`, `#capabilities`, `#stages`, and `Launch canvas`.
2. Hero: eyebrow `Automated codebase archaeology`, heading `Dissect legacy codebases in minutes`, description, repository form, and three pillars: `Zero-clone GitHub tree scan`, `File-level code-rot scoring`, `Voice blast-radius queries`.
3. Hero specimen report: two decorative code sheets (`src/middleware/authGuard.ts`, `src/storage/dbLedger.ts`) visible at `lg` and above, plus the payment hotspot and downstream blast-radius cards.
4. Pull quote: `Instead of spending three days tracing tangled imports by hand, we heard the exact blast radius of our billing service in twenty seconds.`
5. Sticky `#live-walkthrough`: four ordered narrative steps and four stage panels.
6. Capabilities grid `#capabilities`: import/coupling graph, automated decay scoring, spoken architecture queries, and camera-linked blast radius.
7. Three-stage section `#stages`: tree ingestion, decay autopsy, and voice interrogation.
8. Preset specimen directory: payment, scraper, and realtime cards.
9. Closing banner: `Ready to inspect your codebase?` and `Open workspace`.

All prototype inline handlers become React handlers. Navigation targets are `/workspace?specimen=payment`, `/workspace?specimen=<id>`, or `/workspace?repo=<encoded trimmed input>`. Empty repository input uses the payment preset. Icons come from `lucide-react`; no CDN scripts, inline scripts, badges, or colored status dots are carried over.

### Scrollytelling behavior

- Section height is `380vh`; inner stage is sticky at `top: 0` with `min-height: 100vh`.
- Initial server-rendered state is step 1. Progress is clamped to `[0, 1]` using `(section height - viewport height)` and retains the previous step when that distance is non-positive.
- Step thresholds are `< .25 => 1`, `< .50 => 2`, `< .75 => 3`, otherwise `4`. Exactly one narrative step and one panel are active; counter is `0<step> / 04`.
- Progress bar width is `max(6, progress * 100)%`. Scroll updates are passive and requestAnimationFrame-throttled; load and resize recompute state.
- Prototype motion to preserve: panel opacity/translateY(28px)/scale(.965)/blur(4px), 0.6–0.75s cubic-bezier transitions, 0.08s stagger increments, step-2 wire dash drawing, and window lift `sin(localStepProgress * PI) * -5px`.
- Reduced motion removes transitions, transforms, blur, stagger, wire animation, and lift; wires render fully drawn. Inactive panels are pointer-inert and `aria-hidden`.

## Workspace mapping (`src/app/workspace/page.tsx`)

The prototype's `#view-workspace` becomes the `/workspace` route, filling `100vw` by `100vh` with page overflow hidden:

- Top bar: `Back`, repository/specimen title, infection summary, `Isolate hotspots`, and `Reset view`.
- Graph canvas: `.paper-grid`, an SVG edge layer, positioned node cards, and the floating Seance console.
- Detail drawer: path, file name, score, structural diagnosis, telemetry, and source excerpt.
- Responsive drawer: full-width closable overlay below 640px; 384px right column at 640px and above.

### Graph interaction policy

- Preset coordinates are retained; ingested nodes receive deterministic non-overlapping layout positions with acyclic edges left-to-right.
- Draw each valid edge as a cubic curve from source right side to target left side. Skip edges whose endpoint IDs are absent.
- Select highest rot score after load, using first-list order for ties. Node click, Enter, and Space update selection without starting canvas pan.
- Selected/spotlight edges use ink/sky accent styling; neutral edges use the grid color. `Isolate hotspots` dims nodes below 70 unless selected or spotlighted. Rot scores at or above 75 use crimson; lower scores use ink for this conversion.
- Empty-canvas pointer dragging pans. Keyboard arrows pan by 40px. Reset sets pan `(0, 20)` and scale `0.92`; spotlight centers the average highlighted node at scale `1`.
- Cancel speech synthesis on unmount. Keep all node text as escaped React text, never HTML.

### Workspace source lifecycle

- `repo` query values are trimmed, prefixed with `https://` when no scheme exists, and sent exactly once per value as same-origin `POST /api/ingest` with JSON `{ repositoryUrl }`.
- Valid `specimen` values (`payment`, `scraper`, `realtime`) are local and never call ingest. Empty or invalid source states show the repository form and three preset choices.
- In-flight requests use `AbortController`; abort on unmount, cancel, retry replacement, or query change. Stale responses cannot replace current state.
- Loading exposes `Analyzing repository…`, source text, and `Cancel` through `role=status`/`aria-live=polite`. At 8 seconds it adds `This is taking longer than usual.` and preset choices without stopping the request.
- Error states use `role=alert`, safe error-code mapping, the code in monospace, and preset choices. Network failures say the server could not be reached. Fallback presets show `Showing sample data`; partial ingest results note tree truncation or skipped files.

## Preset specimen inventory

The later preset module must preserve these exact prototype datasets and graph relationships. Coordinates are in the prototype's 1200x800 canvas; `rot` maps to `rotScore`, `loc` to `linesOfCode`, `lastCommit` and `code` remain preset-only detail fields.

### `payment`

- Title: `acme-corp/legacy-payment-monolith`; summary: `74% infected`.
- Nodes: `server` (`server.ts`, `src/server.ts`, 112 LOC, rot 22, 110/240, `3 weeks ago`); `auth` (`authGuard.ts`, `src/middleware/authGuard.ts`, 289, 78, 380/120, `9 months ago`); `router` (`payRouter.ts`, `src/routes/payRouter.ts`, 164, 48, 380/360, `4 months ago`); `charge` (`chargeEngine.ts`, `src/billing/chargeEngine.ts`, 482, 94, 670/240, `14 months ago`); `ledger` (`dbLedger.ts`, `src/storage/dbLedger.ts`, 340, 64, 940/130, `8 months ago`); `webhook` (`webhookDispatcher.ts`, `src/events/webhookDispatcher.ts`, 198, 59, 940/350, `6 months ago`).
- Edges: `server→auth`, `server→router`, `auth→charge`, `router→charge`, `charge→ledger`, `charge→webhook`.
- Findings/excerpts are the exact prototype values: server has bounded body-parser/auth delegation; auth has `x-legacy` JWT bypass and no fallback rate limit; router lacks schema validation and passes raw floating-point amounts; charge swallows conversion errors and lacks rollback; ledger lacks idempotency and is coupled to charge schema; webhook can fire after conversion failure and has a synchronous retry loop.

### `scraper`

- Title: `data-ops/async-crawler-worker`; summary: `58% infected`.
- Nodes: `main` (`worker.py`, `crawler/worker.py`, 210, 35, 150/240, `2 weeks ago`); `fetcher` (`sessionPool.py`, `crawler/sessionPool.py`, 390, 82, 470/240, `11 months ago`); `parser` (`domExtractor.py`, `crawler/domExtractor.py`, 275, 52, 800/240, `5 months ago`).
- Edges: `main→fetcher`, `fetcher→parser`.
- Findings: standard asyncio entrypoint; shared mutable cookie jar and unbounded 429 recursion; regex HTML fallback can catastrophically backtrack.

### `realtime`

- Title: `infra/edge-socket-relay`; summary: `26% infected`.
- Nodes: `gateway` (`gateway.ts`, `src/gateway.ts`, 145, 18, 180/240, `4 days ago`); `broker` (`topicBroker.ts`, `src/topicBroker.ts`, 220, 34, 540/240, `1 week ago`).
- Edge: `gateway→broker`.
- Findings: strict origin checks and clean pub/sub map with a max-subscribers follow-up.

## Seance mapping

- Initial transcript: `Select any file node or ask a question aloud to trace downstream dependencies.`
- Payment quick questions: `What breaks if I edit chargeEngine.ts?` and `Explain the authGuard bypass risk`.
- Prototype fallback answers spotlight `charge, ledger, webhook` for the charge question and `auth, charge` for the auth question, selecting the primary node and focusing the graph.
- Later conversion code must use the shared `/api/seance` contract, trim/cap questions at 500 characters, exclude `rawContent` from requests, filter invalid spotlight IDs, and retain safe fallback answers when the endpoint is unavailable.
- Console always includes transcript, text input, send control, microphone control, and exactly seven waveform bars. Speech recognition is optional; keyboard text input remains available.

## Focused task 1.1 check

This mapping was derived from the complete prototype HTML, including both views, all inline behavior functions (`handleCustomRepo`, `loadPreset`, `backToLanding`, `getRotColorClass`, `renderGraph`, `selectNode`, `toggleIsolateCursed`, `applyTransform`, `resetCamera`, `focusOnNodes`, `speakReply`, `triggerPresetQuestion`, `toggleVoiceRecognition`, `setScrollyStep`, and `handleScrollyProgress`) and the existing ingest contracts. It intentionally contains no runtime imports or changes to frozen boundaries.
