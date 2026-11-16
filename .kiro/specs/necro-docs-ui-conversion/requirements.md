# Requirements Document

## Introduction

This feature converts the static HTML prototype `public/necro_docs_interactive_ui_prototype.html` (the final UI reference) into the Next.js App Router application. The prototype is a single file with two views: a landing view and a workspace view. It uses the Tailwind CDN, `lucide` from unpkg, and inline JavaScript (`loadPreset`, `handleCustomRepo`, `toggleVoiceRecognition`, `triggerPresetQuestion`, and a scroll controller).

The conversion produces three deliverables:

- `src/app/page.tsx`: the landing page, including the sticky scrollytelling section `#live-walkthrough`.
- `src/app/workspace/page.tsx` (new): the interactive graph workspace.
- `src/app/globals.css`: design tokens, fonts wiring, the `.acctual-window` and `.paper-grid` effects, and the scrollytelling and voice animations.

The workspace is connected to the existing `POST /api/ingest` endpoint (contract in `.kiro/specs/github-ingest-coderot/` and `src/app/api/ingest/route.ts`) and to a voice endpoint `POST /api/seance` that does not exist yet. Three built-in specimen presets (`payment`, `scraper`, `realtime`) work offline as an instant fallback.

### Assumptions

- **A1. Light theme wins.** The workspace steering files describe a dark cyber-gothic theme (neon cyan/green/purple, blueprint navy). That conflicts with the light prototype. For this spec the prototype is authoritative. The steering color and component patterns do not apply to this feature.
- **A2. Prototype is the visual source of truth.** Layout, spacing, copy, and motion values (for example the 380vh section height and the 0.25/0.50/0.75 step thresholds) are taken from the prototype.
- **A3. `/api/seance` is consumed, not built.** This spec defines the request/response contract that the UI calls (Requirement 13). Building the route handler is out of scope. Until the route exists, the UI behaves as if the call failed and uses the specimen fallback answers. See Open Question 3.
- **A4. Existing backend is frozen.** `src/app/api/ingest/route.ts`, `src/lib/ingest/**`, and the `github-ingest-coderot` spec (tasks 10.3, 10.4, 10.5, 12.2, 13.2 still open) are not modified by this spec.
- **A5. Workspace data source is chosen by URL.** The landing form and the preset buttons navigate to `/workspace` with a query parameter, and the workspace performs the loading. This keeps loading, error, and fallback handling in one place.
- **A6. Ingest results lack some prototype fields.** `IngestNode` has no `findings`, `lastCommit`, or x/y position. The workspace computes layout and shows ingest metrics instead of findings and last-modified for ingested repositories (Requirement 8).
- **A7. Backend demo ids differ from UI presets.** `useDemo`/`demoId` (`demo1`, `demo2`) resolve to real GitHub repositories (`pmndrs/zustand`, `pallets/flask` by default). The three UI presets (`payment`, `scraper`, `realtime`) are static local data and never call `/api/ingest`.

## Glossary

- **Landing_Page**: The route `/` rendered by `src/app/page.tsx`.
- **Workspace_Page**: The route `/workspace` rendered by `src/app/workspace/page.tsx`.
- **Design_Tokens**: The named colors, fonts, and effect classes declared in `src/app/globals.css`.
- **Approved_Palette**: The six colors `#FFFFFF` (canvas), `#F6F7F9` (surface), `#111113` (ink), `#E8E9ED` (hairline), `#0284C7` (sky accent), `#E11D48` (crimson).
- **Pending_Tokens**: Prototype values outside the Approved_Palette: `muted #686A72`, `amber #D97706`, `emerald #059669`, grid dot `#D4D4D8`, the pastel stage-card backgrounds (`sky-100`, `pink-100`, `violet-100`), the closing banner (`sky-50`/`sky-100`), and the `Instrument Serif` font. Their use awaits Open Question 1 and 2.
- **Acctual_Window**: The CSS class `.acctual-window`: a 1px `#E8E9ED` border with the two-layer soft shadow from the prototype.
- **Paper_Grid**: The CSS class `.paper-grid`: a white background with a 22px radial-dot pattern.
- **Scrolly_Section**: The element `#live-walkthrough` on the Landing_Page.
- **Scrolly_Progress**: A number from 0 to 1 equal to the scrolled distance inside the Scrolly_Section divided by (section height minus viewport height), clamped to [0, 1].
- **Scrolly_Step**: An integer from 1 to 4 derived from Scrolly_Progress.
- **Reduced_Motion**: The browser media preference `prefers-reduced-motion: reduce`.
- **Ingest_API**: The existing endpoint `POST /api/ingest`.
- **Seance_API**: The endpoint `POST /api/seance` defined in Requirement 13.
- **Specimen**: A graph dataset shown in the Workspace_Page. Either a Preset_Specimen or an Ingested_Specimen.
- **Preset_Specimen**: One of three built-in datasets with ids `payment`, `scraper`, `realtime`, bundled with the application.
- **Ingested_Specimen**: A Specimen built from an `IngestResult` returned by the Ingest_API.
- **Workspace_Node**: A file card in the graph with name, path, lines of code, rot score, and position.
- **Rot_Score**: An integer 0 to 100 describing structural decay of a file (`rotScore` in ingest data, `rot` in presets).
- **Hotspot**: A Workspace_Node whose Rot_Score is 75 or higher.
- **Detail_Panel**: The right-hand drawer in the Workspace_Page showing the selected Workspace_Node.
- **Seance_Console**: The floating panel at the bottom of the graph canvas holding the transcript, quick questions, text input, and microphone button.
- **Spotlight_Set**: The set of Workspace_Node ids highlighted as the answer to a voice question.
- **Colored_Dot**: Any element whose purpose is a small filled circle or square used as a status indicator.
- **Badge**: A pill, chip, or tag element with its own background or border used to label status, category, or count (as opposed to a button or a plain text label).
- **Ingest_Error_Code**: The `error.code` string returned by the Ingest_API (for example `INVALID_URL_FORMAT`, `GITHUB_RATE_LIMIT`).

## Requirements

### Requirement 1: Design tokens and global stylesheet

**User Story:** As a developer, I want the prototype's color tokens and global styles declared once in `globals.css`, so that every page uses the same design system without a CDN.

#### Acceptance Criteria

1. THE Design_Tokens SHALL define the six Approved_Palette colors as Tailwind theme colors named `canvas`, `surface`, `ink`, `hairline`, `skyAccent`, and `crimson` with the exact hex values `#FFFFFF`, `#F6F7F9`, `#111113`, `#E8E9ED`, `#0284C7`, and `#E11D48`.
2. THE Application SHALL load Tailwind CSS through the installed `tailwindcss` 4.3.3 package and SHALL NOT reference `cdn.tailwindcss.com`, `unpkg.com`, or any other third-party script URL in `src/app/layout.tsx`, `src/app/page.tsx`, or `src/app/workspace/page.tsx`.
3. THE `globals.css` file SHALL set the page background to `#FFFFFF` and the body text color to `#111113`.
4. THE `globals.css` file SHALL NOT contain a `prefers-color-scheme: dark` rule that changes the background or foreground colors.
5. THE `globals.css` file SHALL remove the starter-template `Arial, Helvetica, sans-serif` body font declaration.
6. WHERE a Pending_Token is needed before Open Question 1 is resolved, THE Design_Tokens SHALL declare it under a `/* PENDING */` comment so that the set of unapproved tokens can be found with a text search.
7. THE Design_Tokens SHALL contain no color value other than the Approved_Palette and the Pending_Tokens.

### Requirement 2: Typography

**User Story:** As a visitor, I want text rendered in Plus Jakarta Sans and JetBrains Mono, so that the application matches the reference design.

#### Acceptance Criteria

1. THE Application SHALL load Plus Jakarta Sans at weights 400, 500, 600, and 700 and JetBrains Mono at weights 400, 500, and 600 through `next/font/google` in `src/app/layout.tsx`.
2. THE Design_Tokens SHALL map the Tailwind `font-sans` and `font-display` families to Plus Jakarta Sans and `font-mono` to JetBrains Mono.
3. THE Application SHALL render body text, headings, and buttons in `font-sans`, and file paths, scores, code excerpts, counters, and metric labels in `font-mono`.
4. THE `src/app/layout.tsx` file SHALL remove the Geist font imports and SHALL update `metadata.title` to `Necro-Docs — Codebase Autopsy & Voice Interrogation` and set `metadata.description` to a non-empty product description.
5. THE Application SHALL enable `-webkit-font-smoothing: antialiased` on the body.
6. IF a web font fails to load, THEN THE Application SHALL render text in the fallback stack (`-apple-system, BlinkMacSystemFont, sans-serif` for sans and `monospace` for mono) without layout overflow.

### Requirement 3: Visual effects

**User Story:** As a visitor, I want the elevated product window and dotted paper grid from the prototype, so that the interface has the intended depth and texture.

#### Acceptance Criteria

1. THE `globals.css` file SHALL define `.acctual-window` with `border: 1px solid #E8E9ED` and `box-shadow: 0 24px 60px -15px rgba(17, 17, 19, 0.08), 0 4px 16px -2px rgba(17, 17, 19, 0.03)`.
2. THE `globals.css` file SHALL define `.paper-grid` with a `#FFFFFF` background color, `radial-gradient(<dot color> 1px, transparent 1px)` as background image, and `background-size: 22px 22px`.
3. THE Landing_Page SHALL apply `.acctual-window` to the hero Specimen Report window and to each of the four panels in the Scrolly_Section.
4. THE Workspace_Page SHALL apply `.paper-grid` to the graph canvas and `.acctual-window` to the Seance_Console.
5. THE Landing_Page SHALL apply `.paper-grid` to the dependency-graph illustration in Scrolly_Section step 2.

### Requirement 4: No badges and no colored dots

**User Story:** As a product owner, I want the interface to stay free of badges and colored dots, so that the visual style stays as the reference design.

#### Acceptance Criteria

1. THE Landing_Page and THE Workspace_Page SHALL NOT render any Badge.
2. THE Landing_Page and THE Workspace_Page SHALL NOT render any Colored_Dot, including status indicators, legend markers, list bullets, and loading indicators in the form of a filled circle.
3. THE Application SHALL render status information (rot scores, "Indexed", "Ready", language, infection percentage, error text) as plain text in `font-mono`, optionally colored with an approved token.
4. THE Application SHALL render buttons, the repository input, quick-question controls, and the microphone control as interactive controls only, and SHALL NOT use them to display status.
5. THE Application SHALL NOT introduce a new component, library, or CSS class whose purpose is to render a Badge or Colored_Dot.
6. WHEN the prototype contains a pill-shaped non-interactive label (for example the "Indexed" pill in Scrolly_Section step 1), THE Landing_Page SHALL render the same text as plain text without background or border.

### Requirement 5: Landing page

**User Story:** As a visitor, I want a landing page that explains Necro-Docs and lets me start an audit, so that I understand the product and can try it immediately.

#### Acceptance Criteria

1. THE Landing_Page SHALL render, in this order: header navigation, hero with repository form, three feature pillars, the Specimen Report window with two tilted code sheets, the pull-quote block, the Scrolly_Section, the capabilities grid (`#capabilities`, four cards), the three-stage section (`#stages`), the preset specimen directory (three cards), and the closing banner.
2. THE Landing_Page header SHALL contain a brand link `Necro-Docs`, three anchor links with `href` values `#live-walkthrough`, `#capabilities`, and `#stages`, and a `Launch canvas` button.
3. WHEN the visitor activates `Launch canvas`, `Open interactive graph`, `Try in full canvas`, or `Open workspace`, THE Landing_Page SHALL navigate to `/workspace?specimen=payment`.
4. WHEN the visitor activates a preset specimen card, THE Landing_Page SHALL navigate to `/workspace?specimen=<id>` where `<id>` is `payment`, `scraper`, or `realtime` matching the card.
5. THE Landing_Page SHALL render icons from the installed `lucide-react` package and SHALL NOT use the `lucide` UMD script.
6. THE Landing_Page SHALL render the two tilted code sheets only at the `lg` breakpoint and above, with a rotation of -6 degrees (left) and 6 degrees (right), and SHALL mark them `aria-hidden="true"`.
7. WHEN the viewport width is below 640px, THE Landing_Page SHALL stack the repository input and its submit button vertically and SHALL NOT produce horizontal page scroll.
8. THE Landing_Page SHALL keep the copy of the prototype for headings, paragraphs, pillars, cards, quote, and banner unchanged, except for the removal required by Requirement 4.
9. THE `src/app/page.tsx` file SHALL contain no inline `<script>` element and no `onclick`/`onsubmit` string attributes.

### Requirement 6: Sticky scrollytelling in `#live-walkthrough`

**User Story:** As a visitor, I want the walkthrough to stay pinned while I scroll and move through four steps, so that I can follow the product flow without clicking.

#### Acceptance Criteria

1. THE Scrolly_Section SHALL have `id="live-walkthrough"`, a height of `380vh`, and an inner container that is `position: sticky` at `top: 0` with a minimum height of `100vh`.
2. THE Scrolly_Section SHALL contain four narrative steps in the left column (`01 · Repository input`, `02 · Dependency analysis`, `03 · Weakness isolation`, `04 · Voice & AI explanation`) and one product window with four stage panels in the right column.
3. THE Scrolly_Step SHALL equal 1 WHEN Scrolly_Progress is below 0.25, 2 WHEN Scrolly_Progress is at least 0.25 and below 0.50, 3 WHEN Scrolly_Progress is at least 0.50 and below 0.75, and 4 WHEN Scrolly_Progress is at least 0.75.
4. WHEN the Scrolly_Step changes, THE Scrolly_Section SHALL mark exactly one narrative step and exactly one stage panel as active, remove the active state from the other three of each, and update the counter text to `0<step> / 04`.
5. WHILE the Scrolly_Section is on screen, THE Scrolly_Section SHALL set the progress bar width to `max(6, Scrolly_Progress × 100)` percent.
6. WHEN the page loads or the viewport is resized, THE Scrolly_Section SHALL recompute Scrolly_Progress and Scrolly_Step.
7. IF the section height minus the viewport height is zero or negative, THEN THE Scrolly_Section SHALL keep the previous Scrolly_Step and SHALL NOT divide by zero.
8. THE Scrolly_Section SHALL update on scroll through a passive listener throttled to at most one computation per animation frame.
9. WHILE Reduced_Motion is not set, THE Scrolly_Section SHALL animate stage panels with opacity, a 28px vertical translate, a 0.965 scale, and a 4px blur over 0.6 to 0.75 seconds using `cubic-bezier(0.22, 1, 0.36, 1)`, stagger child elements with 0.08-second increments, draw the step 2 wires with `stroke-dashoffset`, and lift the product window by up to 5px using `sin(local step progress × π)`.
10. WHILE Reduced_Motion is set, THE Scrolly_Section SHALL switch stage panels without transition, translate, scale, blur, stagger delay, wire drawing animation, or product-window lift, and SHALL render the step 2 wires fully drawn.
11. WHEN a stage panel is not active, THE Scrolly_Section SHALL set `pointer-events: none` on it and `aria-hidden="true"` so that only the active panel is reachable by pointer and assistive technology.
12. THE Scrolly_Section SHALL expose the four narrative steps in the DOM as an ordered list so that a screen reader can read all four steps regardless of scroll position.
13. WHEN JavaScript has not yet run, THE Scrolly_Section SHALL render step 1 as active.
14. THE Scrolly_Section SHALL use the colors `crimson` and `skyAccent` from the Approved_Palette for emphasized text in the panels, and SHALL use a Pending_Token for any other emphasis only as allowed by Requirement 1.6.

### Requirement 7: Workspace route and graph

**User Story:** As an engineer, I want an interactive graph of files and their imports, so that I can see coupling and decay at a glance.

#### Acceptance Criteria

1. THE Workspace_Page SHALL exist at route `/workspace` in `src/app/workspace/page.tsx` and SHALL fill the viewport (`100vw` × `100vh`) with no page-level scroll.
2. THE Workspace_Page SHALL render a top bar with a `Back` control linking to `/`, the Specimen title in `font-mono`, the infection summary text, an `Isolate hotspots` toggle, and a `Reset view` button.
3. THE Workspace_Page SHALL render the graph canvas with Paper_Grid, one Workspace_Node card per Specimen node, and one curved edge per Specimen edge running from the right side of the source card to the left side of the target card.
4. THE Workspace_Node card SHALL show the lines of code, the Rot_Score as `<n> rot`, the file name, and the file path, with the name and path truncated by ellipsis when they overflow.
5. THE Workspace_Page SHALL color a Rot_Score text with `crimson` WHEN the Rot_Score is 75 or higher, and with `ink` WHEN the Rot_Score is below 75, until Open Question 1 is resolved.
6. WHEN the visitor drags an empty area of the canvas with the pointer, THE Workspace_Page SHALL pan the graph by the pointer displacement.
7. WHEN the visitor activates `Reset view`, THE Workspace_Page SHALL set the pan to (0, 20) and the scale to 0.92.
8. WHILE `Isolate hotspots` is on, THE Workspace_Page SHALL dim every Workspace_Node that has a Rot_Score below 70 and is neither selected nor in the Spotlight_Set to 22% opacity, and SHALL render the toggle with an `ink` background and white text.
9. WHEN the Spotlight_Set is not empty, THE Workspace_Page SHALL outline Spotlight_Set nodes with `skyAccent`, draw edges that end in a Spotlight_Set node in `skyAccent`, and pan to center the average position of those nodes at scale 1.
10. WHEN the selected node or the Spotlight_Set changes, THE Workspace_Page SHALL draw edges touching the selected node in `ink` at 1.8px and all other edges in the neutral grid color at 1.2px.
11. WHERE Reduced_Motion is set, THE Workspace_Page SHALL apply pan and scale changes without a transition.
12. IF the Specimen contains an edge whose source or target id is not a node id, THEN THE Workspace_Page SHALL skip that edge and SHALL continue rendering the remaining edges.
13. WHEN the Specimen is an Ingested_Specimen, THE Workspace_Page SHALL compute node positions so that no two Workspace_Node cards overlap and every edge source is placed to the left of its target for acyclic edges.
14. WHEN the Workspace_Page unmounts, THE Workspace_Page SHALL cancel any speech synthesis in progress.

### Requirement 8: Node selection and Detail_Panel

**User Story:** As an engineer, I want to select a file and read its diagnosis, so that I can judge how risky it is to change.

#### Acceptance Criteria

1. WHEN a Specimen finishes loading, THE Workspace_Page SHALL select the Workspace_Node with the highest Rot_Score, and WHEN two nodes have the same highest score, THE Workspace_Page SHALL select the one that appears first in the Specimen node list.
2. WHEN the visitor clicks a Workspace_Node card, or presses Enter or Space while the card has keyboard focus, THE Workspace_Page SHALL select that node, update the Detail_Panel, and mark the card selected with an `ink` border.
3. WHEN the visitor clicks a Workspace_Node card, THE Workspace_Page SHALL NOT start a canvas pan.
4. THE Detail_Panel SHALL show the node path, the node name as a heading, the Rot_Score as `<n> / 100`, a `Structural diagnosis` list, a `Module telemetry` grid, and a `Source excerpt` code block.
5. WHEN the Specimen is a Preset_Specimen, THE Detail_Panel SHALL show the node's findings list, lines of code, last-modified text, and code excerpt from the preset data.
6. WHEN the Specimen is an Ingested_Specimen, THE Detail_Panel SHALL show lines of code, nesting depth, comment ratio, import count, export count, file size, and language in the telemetry grid, SHALL show `rawContent` in the source excerpt, and SHALL append `(truncated)` to the excerpt title WHEN `isTruncated` is true.
7. WHEN the Specimen is an Ingested_Specimen, THE Detail_Panel SHALL omit the `Last modified` item and SHALL derive the diagnosis list from available metrics (Rot_Score, nesting depth, comment ratio, number of incoming edges) with at least one line per node.
8. THE Detail_Panel SHALL render all node text (path, name, findings, source excerpt) as text content and SHALL NOT interpret it as HTML.
9. WHILE the viewport width is below 640px, THE Workspace_Page SHALL show the Detail_Panel as a full-width overlay that the visitor can close, and WHILE the viewport width is 640px or above, THE Workspace_Page SHALL show it as a 384px column at the right.

### Requirement 9: Repository form to Ingest_API

**User Story:** As an engineer, I want to paste a GitHub URL and audit the repository, so that I can see my own codebase in the workspace.

#### Acceptance Criteria

1. THE Landing_Page hero SHALL contain a form with a single text input (placeholder `github.com/acme-corp/legacy-payment-monolith`) and a submit button labelled `Audit repository`, and the input SHALL have an accessible name.
2. WHEN the visitor submits the form with a non-empty value, THE Landing_Page SHALL navigate to `/workspace?repo=<url-encoded trimmed value>`.
3. WHEN the visitor submits the form with an empty or whitespace-only value, THE Landing_Page SHALL navigate to `/workspace?specimen=payment`.
4. WHEN the Workspace_Page opens with a `repo` query parameter, THE Workspace_Page SHALL send exactly one `POST /api/ingest` request with header `Content-Type: application/json` and body `{"repositoryUrl": "<value>"}`, where a value without a scheme is prefixed with `https://`.
5. WHEN the Ingest_API responds with HTTP 200 and `success: true`, THE Workspace_Page SHALL build an Ingested_Specimen from `data.nodes` and `data.edges`, set the title to `owner/repo` parsed from `data.metadata.repositoryUrl`, and set the infection summary to `<round(averageRotScore)>% infected`.
6. WHEN the Workspace_Page opens with `specimen` set to a valid preset id, THE Workspace_Page SHALL render that Preset_Specimen without sending any request to the Ingest_API.
7. IF the Workspace_Page opens with a `specimen` value that is not `payment`, `scraper`, or `realtime`, and without a `repo` value, THEN THE Workspace_Page SHALL show the three preset choices and no graph.
8. IF the Workspace_Page opens with neither `repo` nor `specimen`, THEN THE Workspace_Page SHALL show the three preset choices and the repository form.
9. WHEN the visitor navigates away from the Workspace_Page while an ingest request is in flight, THE Workspace_Page SHALL abort that request.
10. WHEN the `repo` query parameter changes, THE Workspace_Page SHALL abort any ingest request in flight and start a new one for the new value, and a response from an aborted request SHALL NOT replace the displayed Specimen.
11. THE Workspace_Page SHALL send requests to the Ingest_API with a same-origin relative URL and SHALL NOT include `GITHUB_TOKEN` or any credential in client code.

### Requirement 10: Ingest loading, error, and instant fallback

**User Story:** As an engineer, I want clear feedback while a repository loads and instant sample data when it fails or is slow, so that I am never stuck on an empty screen.

#### Acceptance Criteria

1. WHILE an ingest request is in flight, THE Workspace_Page SHALL show a loading state containing the text `Analyzing repository…`, the repository `owner/repo` or entered value, and a `Cancel` button, and SHALL NOT show a Colored_Dot or Badge.
2. WHILE the loading state is shown, THE Workspace_Page SHALL expose it to assistive technology with `role="status"` and `aria-live="polite"`.
3. WHEN an ingest request has been in flight for 8 seconds, THE Workspace_Page SHALL additionally show the text `This is taking longer than usual.` and the three Preset_Specimen choices, and SHALL keep the request running.
4. WHEN the visitor activates `Cancel` or chooses a Preset_Specimen during loading, THE Workspace_Page SHALL abort the request and show the chosen Preset_Specimen, or the preset choices when `Cancel` was activated.
5. IF the Ingest_API responds with `success: false`, THEN THE Workspace_Page SHALL show an error state with a message mapped from the Ingest_Error_Code and the three Preset_Specimen choices.
6. THE Workspace_Page SHALL map Ingest_Error_Code values to messages as follows: `INVALID_URL_FORMAT` and `MISSING_REPOSITORY_URL` to a message asking for a URL like `github.com/owner/repo`; `NON_GITHUB_REPOSITORY` to a message that only github.com repositories are supported; `REPOSITORY_NOT_FOUND` to a message that the repository does not exist or is private; `NO_CODE_FILES_FOUND` to a message that no TypeScript, JavaScript, or Python files were found; `GITHUB_RATE_LIMIT` to a message that GitHub's rate limit was reached and to try again later; `REQUEST_TIMEOUT` to a message that the analysis timed out; `GITHUB_API_ERROR` and `GITHUB_SERVICE_UNAVAILABLE` to a message that GitHub is unavailable; `INVALID_GITHUB_TOKEN` and `ANALYSIS_FAILED` and `INVALID_REQUEST` and `GITHUB_REQUEST_ERROR` and `INVALID_DEMO_ID` to a generic failure message.
7. IF the Ingest_API responds with an `error.code` not listed in criterion 6, or with a body that is not valid JSON, or with a 200 response whose `data` is missing, THEN THE Workspace_Page SHALL show the generic failure message and the three Preset_Specimen choices.
8. IF the network request fails without a response, THEN THE Workspace_Page SHALL show a message that the server could not be reached and the three Preset_Specimen choices.
9. THE Workspace_Page SHALL show the Ingest_Error_Code as `font-mono` text under the message so that the visitor can report it, and SHALL NOT show `error.details`, stack traces, or raw response bodies.
10. WHEN the visitor chooses a Preset_Specimen from the error or slow state, THE Workspace_Page SHALL render it within one animation frame of the click without any network request.
11. THE error state SHALL be exposed with `role="alert"`.
12. WHEN the visitor activates a `Try again` button in the error state, THE Workspace_Page SHALL repeat the ingest request for the same `repo` value.
13. THE Workspace_Page SHALL show a `Showing sample data` text line in the top bar WHILE a Preset_Specimen is displayed after an error or slow state, so that the visitor can tell sample data from the requested repository.
14. WHEN `data.metadata.treeTruncated` is true or `data.metadata.skippedFiles` is not empty, THE Workspace_Page SHALL show a plain text note in the top bar that the result is partial.

### Requirement 11: Preset specimens

**User Story:** As a visitor, I want three ready-made specimens that open instantly, so that I can explore the product without waiting or entering a URL.

#### Acceptance Criteria

1. THE Application SHALL bundle three Preset_Specimens with ids `payment`, `scraper`, and `realtime` in a TypeScript module, and SHALL NOT fetch them over the network.
2. THE `payment` Preset_Specimen SHALL contain the six nodes (`server`, `auth`, `router`, `charge`, `ledger`, `webhook`) and six edges of the prototype, title `acme-corp/legacy-payment-monolith`, and summary `74% infected`.
3. THE `scraper` Preset_Specimen SHALL contain the three nodes (`main`, `fetcher`, `parser`) and two edges of the prototype, title `data-ops/async-crawler-worker`, and summary `58% infected`.
4. THE `realtime` Preset_Specimen SHALL contain the two nodes (`gateway`, `broker`) and one edge of the prototype, title `infra/edge-socket-relay`, and summary `26% infected`.
5. THE Preset_Specimen data SHALL keep for every node the id, name, path, lines of code, Rot_Score, last-modified text, x and y position, findings, and code excerpt as in the prototype.
6. FOR ALL Preset_Specimens, every edge SHALL reference node ids that exist in the same Preset_Specimen, node ids SHALL be unique, and every Rot_Score SHALL be an integer between 0 and 100.
7. FOR ALL Preset_Specimens, the Preset_Specimen module SHALL be importable on both server and client without referencing `window` or `document`.
8. THE Landing_Page preset directory SHALL show, for each preset, an infection percentage and primary language as plain text, the repository name, and the description from the prototype.
9. THE Preset_Specimens SHALL provide a fallback answer for each of the two quick questions per specimen for use under Requirement 13.6.

### Requirement 12: Voice interrogation console

**User Story:** As an engineer, I want to ask questions about the selected file by voice or keyboard, so that I can hear the blast radius without leaving the graph.

#### Acceptance Criteria

1. THE Seance_Console SHALL show a transcript area (initial text `Select any file node or ask a question aloud to trace downstream dependencies.`), quick-question buttons, a text input with a send button, a microphone button labelled `Ask by voice`, and a waveform of seven bars.
2. THE Seance_Console transcript SHALL be exposed with `aria-live="polite"`.
3. THE Seance_Console SHALL always render the text input and send button, regardless of microphone and speech support, so that every function is available by keyboard.
4. WHEN the visitor activates the microphone button and the browser exposes `SpeechRecognition` or `webkitSpeechRecognition`, THE Seance_Console SHALL start one recognition session, set the button label to `Listening…`, and set `aria-pressed="true"`.
5. WHEN a recognition session returns a final transcript, THE Seance_Console SHALL show the transcript as the query, restore the label to `Ask by voice`, and submit the query as in Requirement 13.
6. WHEN the visitor activates the microphone button during a recognition session, THE Seance_Console SHALL stop the session.
7. IF the browser exposes neither `SpeechRecognition` nor `webkitSpeechRecognition`, THEN THE Seance_Console SHALL disable the microphone button, set its accessible description to a message that voice input is not supported in this browser, and show that message in the transcript area, and SHALL keep the text input enabled.
8. IF recognition ends with error `not-allowed` or `service-not-allowed`, THEN THE Seance_Console SHALL show a message that microphone permission was denied and how to enable it in browser settings, SHALL restore the button label, and SHALL focus the text input.
9. IF recognition ends with error `no-speech`, `audio-capture`, `network`, or `aborted`, THEN THE Seance_Console SHALL show a message matching the error, restore the button label, and SHALL NOT submit any query.
10. THE Seance_Console SHALL NOT silently replace a failed recognition with a preset question as the prototype does.
11. WHEN the visitor activates a quick-question button, THE Seance_Console SHALL submit that question as in Requirement 13 and SHALL NOT start recognition.
12. WHEN the visitor submits the text input with a non-empty trimmed value, THE Seance_Console SHALL submit that value as the query and clear the input, and WHEN the value is empty or whitespace-only, THE Seance_Console SHALL NOT submit.
13. WHEN an answer is received and the browser exposes `speechSynthesis`, THE Seance_Console SHALL cancel any current utterance, speak the answer at rate 1.02, and animate the waveform bars until the utterance ends or errors.
14. IF the browser does not expose `speechSynthesis`, THEN THE Seance_Console SHALL show the answer as text and SHALL stop animating the waveform after 2.6 seconds.
15. WHILE Reduced_Motion is set, THE Seance_Console SHALL NOT animate the waveform bars and SHALL render them at fixed heights.
16. WHEN the visitor submits a query while a previous query is still pending, THE Seance_Console SHALL abort the previous request and use only the response to the latest query.
17. THE Seance_Console SHALL provide quick questions generated from the Specimen: for a Preset_Specimen the two prototype questions of that specimen, and for an Ingested_Specimen `What breaks if I edit <name of highest Rot_Score node>?` and `Explain the risk in <name of second highest Rot_Score node>` (omitting the second when the Specimen has fewer than two nodes).
18. THE Seance_Console recognition language SHALL be `en-US` until Open Question 5 is resolved.

### Requirement 13: Seance_API contract and fallback

**User Story:** As a developer, I want a defined request and response shape for the voice endpoint, so that the UI can be built and tested before the endpoint exists.

#### Acceptance Criteria

1. WHEN a query is submitted, THE Seance_Console SHALL send `POST /api/seance` with `Content-Type: application/json` and body `{ "question": string, "selectedNodeId": string | null, "specimenId": string | null, "repositoryUrl": string | null, "nodes": [{ "id": string, "path": string, "rotScore": number }], "edges": [{ "source": string, "target": string }] }`, where `question` is the trimmed query limited to 500 characters, `specimenId` is the preset id for a Preset_Specimen and null otherwise, and `repositoryUrl` is `metadata.repositoryUrl` for an Ingested_Specimen and null otherwise.
2. THE Seance_API response on success SHALL be HTTP 200 with `{ "success": true, "data": { "answer": string, "spotlightNodeIds": string[], "selectNodeId"?: string } }`, and on failure SHALL be `{ "success": false, "error": { "code": string, "message": string } }`, both conforming to the `ApiResponse<T>` type in `src/lib/types.ts`.
3. WHEN the Seance_API responds with success, THE Workspace_Page SHALL set the Spotlight_Set to `spotlightNodeIds` filtered to ids that exist in the Specimen, select `selectNodeId` when it exists in the Specimen, pan to the Spotlight_Set as in Requirement 7.9, and show the query and the answer in the transcript.
4. WHEN `spotlightNodeIds` contains no id that exists in the Specimen, THE Workspace_Page SHALL clear the Spotlight_Set, keep the current selection, and still show the answer.
5. THE Workspace_Page SHALL render the answer from the Seance_API as plain text and SHALL NOT interpret it as HTML.
6. IF the Specimen is a Preset_Specimen and the Seance_API call fails, returns a non-JSON body, returns `success: false`, or does not respond within 15 seconds, THEN THE Workspace_Page SHALL answer from the fallback answers of the Preset_Specimen: the stored answer when the question equals a quick question, and otherwise the stored answer for the quick question whose referenced file name occurs in the query, or else the stored answer of the highest Rot_Score node.
7. IF the Specimen is an Ingested_Specimen and the Seance_API call fails, returns a non-JSON body, returns `success: false`, or does not respond within 15 seconds, THEN THE Workspace_Page SHALL show a message that the voice answer is unavailable and SHALL keep the Spotlight_Set and selection unchanged.
8. WHILE the Seance_API request is pending, THE Seance_Console SHALL show `Thinking…` in the transcript and keep the text input enabled.
9. THE Seance_API request body SHALL NOT include `rawContent` or any file source text.
10. WHERE the Seance_API route is added in a later spec, THE UI SHALL work with it without any change to the request and response shapes in criteria 1 and 2.

### Requirement 14: Accessibility

**User Story:** As a keyboard or screen-reader user, I want every control reachable and announced, so that I can use Necro-Docs without a mouse.

#### Acceptance Criteria

1. THE Application SHALL use semantic landmarks: `header`, `nav`, `main`, `section` with headings, `aside` for the Detail_Panel, and `form` for the repository form.
2. THE Application SHALL render every interactive element as a native `a`, `button`, `input`, or an element with an equivalent role, tabindex, and keyboard handlers.
3. THE Application SHALL show a visible focus ring of at least 2px in `ink` or `skyAccent` on every focusable element, and SHALL NOT remove outlines without a replacement.
4. THE Workspace_Node card SHALL have `role="button"`, `tabindex="0"`, an `aria-pressed` value reflecting selection, and an accessible name containing the file name, the Rot_Score, and the lines of code.
5. THE Workspace_Page SHALL provide a keyboard alternative to pan: WHILE the canvas has focus, THE Workspace_Page SHALL pan by 40px per press of an arrow key, and `Reset view` SHALL be reachable by keyboard.
6. THE Application SHALL set `aria-hidden="true"` on purely decorative elements (tilted code sheets, icons next to text, the waveform).
7. THE Application SHALL provide an accessible name for the icon-only or icon-led controls (microphone button, Back).
8. THE Application SHALL keep text contrast against its background at 4.5:1 or higher for text smaller than 18px, using the Approved_Palette and Pending_Tokens, except where Open Question 4 is resolved otherwise.
9. THE Application SHALL set `lang="en"` on the `html` element.
10. WHEN the Workspace_Page changes between loading, error, and graph states, THE Workspace_Page SHALL move focus to the heading of the new state.
11. THE Application SHALL honor Reduced_Motion for every transition and animation defined in this document through a single `@media (prefers-reduced-motion: reduce)` block in `globals.css` or the equivalent component logic.

### Requirement 15: Integration constraints

**User Story:** As a maintainer, I want the conversion to stay inside its boundaries, so that the running ingest spec and existing tests are not disturbed.

#### Acceptance Criteria

1. THE conversion SHALL NOT modify files under `src/app/api/ingest/`, `src/lib/ingest/`, or `.kiro/specs/github-ingest-coderot/`.
2. THE conversion SHALL add no runtime dependency beyond those in `package.json` (`next` 16.4.6, `react` 19.3.0, `zustand`, `reactflow`, `lucide-react`), and SHALL NOT add a Tailwind configuration that conflicts with Tailwind CSS 4 CSS-first configuration in `globals.css`.
3. THE `public/necro_docs_interactive_ui_prototype.html` file SHALL remain unchanged as a reference.
4. WHEN `npm run build` runs, THE Application SHALL compile with no TypeScript errors and no ESLint errors in the files added or changed by this spec.
5. WHEN `npm test` runs, THE existing test suites under `src/lib/ingest/__tests__/` SHALL keep passing at the same state as before the conversion.
6. THE client components SHALL declare `'use client'` only where state, effects, or browser APIs are required, and `src/app/layout.tsx` SHALL remain a Server Component.
7. THE pure logic of the conversion SHALL live in functions separate from React components: Scrolly_Step from Scrolly_Progress, rot color tier from Rot_Score, `IngestResult` to Specimen mapping, Ingest_Error_Code to message mapping, node layout, and Seance_API response to Spotlight_Set, so that each can be tested without rendering.
8. FOR ALL valid `IngestResult` values, mapping to an Ingested_Specimen SHALL preserve node count, edge count, node ids, and Rot_Scores (invariant).
9. FOR ALL Scrolly_Progress values in [0, 1], the function mapping progress to Scrolly_Step SHALL return an integer from 1 to 4 and SHALL be non-decreasing in progress (monotonicity).

## Open Questions

1. **Colors outside the Approved_Palette.** The prototype uses `muted #686A72` (secondary text), `amber #D97706` and `emerald #059669` (medium and low rot scores, the `58% infected` and `26% infected` preset labels), and `#D4D4D8` (grid dots and neutral edges). Should these be added to the palette? Until answered, Requirement 7.5 renders rot below 75 in `ink`, which loses the three-tier distinction (low, medium, high). The Approved_Palette has no secondary-text color; `muted` is used across the whole prototype for small text.
2. **Instrument Serif and pastel cards.** The prototype loads `Instrument Serif` (declared as `font-serif`, but no element in the converted views uses it) and renders the `#stages` cards and closing banner with `sky-100`, `pink-100`, `violet-100`, `sky-50`. These colors are not in the palette. Should the font be dropped and the cards recolored with `surface`/`hairline`, or should the colors be approved? The `pink` and `violet` eyebrow text colors in `#stages` also fall outside the palette.
3. **`/api/seance` ownership.** This spec assumes the UI consumes the contract in Requirement 13 and does not build the route (A3). Should this spec also add a minimal route handler (for example a rule-based answer from node and edge data, or an LLM call that requires a new server environment variable and provider decision)? If yes, a new requirement and a decision on provider, key handling, and rate limiting are needed.
4. **Contrast of `skyAccent #0284C7`.** Against white it gives about 4.1:1, below the 4.5:1 target of Requirement 14.8 for the `text-xs` eyebrow and counter text it is used for in the prototype. Should the text use `ink` instead, should a darker shade be allowed for text, or is 4.1:1 accepted?
5. **Voice language.** The prototype recognizes `en-US` and the interface copy is English. Should voice input also support Indonesian (`id-ID`), and should the interface language be selectable?
6. **Pan and zoom implementation and zoom controls.** The prototype implements pan with custom mouse handlers and has no wheel zoom, although the stage keeps a `scale`. `reactflow` is installed. Should the workspace use React Flow (adds zoom, touch pan, keyboard handling) or keep the prototype's custom stage? The requirements stay neutral; wheel zoom and touch gestures are not required.
7. **Slow-ingest policy.** Requirement 10.3 offers presets after 8 seconds but keeps the request running, and never switches automatically. Should the UI instead switch to a preset automatically after a timeout? Automatic switching would show unrelated data under a different title.
8. **Landing form navigation.** The form navigates to `/workspace?repo=...` (A5), so the URL is shareable and refresh re-runs the ingest. Is the repository URL in the address bar acceptable, or should it be kept in client state only?
9. **Backend demo ids.** `demoId` `demo1`/`demo2` point to `pmndrs/zustand` and `pallets/flask` and are unused by the UI (A7). Should either replace one of the three presets or be exposed as a "live demo" action?
10. **Ingest findings.** Ingested nodes have no findings text or last-modified date (A6). Is a metrics-derived diagnosis (Requirement 8.7) enough, or should the ingest result be extended later with real findings?
