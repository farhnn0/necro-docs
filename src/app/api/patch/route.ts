import { NextResponse } from 'next/server';
import ts from 'typescript';
import { scanSource } from '@/lib/repoAnalyzer';
import { isPatchable, PATCHABLE_KINDS, type RepoFinding } from '@/lib/types';

/**
 * POST /api/patch
 * Body: { path: string, code: string, dependencies?: string[], importedBy?: string[] }
 * Returns { summary, patchedCode, provider, fixed, remaining }.
 *
 * The findings are not taken from the client: the file is scanned here, and only findings a local edit can
 * resolve (PATCHABLE_KINDS) are sent to the model. The model answers with search/replace edits, which are
 * applied here and accepted only when a second scan confirms a finding is gone and nothing new appeared.
 * `provider` is 'ai' when an accepted patch (or a deliberate "no safe fix") came from a model, otherwise
 * 'static-fallback' with the code unchanged.
 */

interface PatchRequest {
  path?: unknown;
  code?: unknown;
  dependencies?: unknown;
  importedBy?: unknown;
}

interface PatchResponse {
  summary: string;
  patchedCode: string;
  provider: 'ai' | 'static-fallback';
  /** Findings the accepted patch resolved, and patchable findings still present afterwards. */
  fixed: string[];
  remaining: string[];
}

interface Edit {
  old: string;
  new: string;
}

const MAX_CODE_CHARS = 100_000;
const AI_TIMEOUT_MS = 60_000;
/** An edit must sit this close to a finding it fixes; anything further away is unrelated churn. */
const EDIT_REACH_LINES = 15;
const MAX_CHANGED_LINES_PER_FINDING = 30;
/** Kinds a "fix" could create while hiding the original problem (a comment in the catch, a TODO). */
const MUST_NOT_GROW: readonly string[] = [...PATCHABLE_KINDS, 'ignored-catch', 'debt'];

const strings = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length <= 200).slice(0, max) : [];

const lineCount = (text: string) => text.split('\n').length;

function promptFor(path: string, code: string, targets: RepoFinding[], dependencies: string[], importedBy: string[], feedback: string | null): string {
  const lines = code.split(/\r?\n/);
  const findings = targets.flatMap((finding) => finding.lines.slice(0, 8).map((line) =>
    `- [${finding.kind}] line ${line}: \`${(lines[line - 1] ?? '').trim().slice(0, 160)}\`\n  Problem: ${finding.text}\n  Expected fix: ${finding.suggestion}`));
  return `You are fixing specific findings in one file of an existing repository. Make the smallest edit that resolves each finding and nothing else.
File: ${path}
Files that import this file (they rely on its current exports): ${importedBy.length ? importedBy.join(', ') : 'none known'}
Packages installed in this repository: ${dependencies.length ? dependencies.join(', ') : 'unknown'}

Findings to fix:
${findings.join('\n')}
${feedback ? `\nYour previous answer was rejected: ${feedback} Answer again and avoid that problem.\n` : ''}
File content:
<<<FILE
${code}
FILE

Return JSON only: {"summary":"1-2 sentences: what you changed and why, and which findings you left alone and why","edits":[{"old":"text copied from the file","new":"replacement text"}]}.
Rules:
- "old" must be copied character for character from the file, indentation included, and must occur exactly once in it. Keep it short: only the lines you change, plus a neighbouring line when needed to make it unique.
- Fix only the listed findings. Do not refactor, rename, reorder, reformat, or touch code that is not part of a finding.
- Do not add functions, helpers, classes, options, parameters, or abstractions. Do not add comments that describe your change.
- Do not add packages. Import only from the installed packages above or from modules this file already imports.
- Do not change exported names, signatures, or return shapes; other files depend on them.
- Follow what the file already does for error handling, logging, and naming.
- Never hide a finding: no comment-only catch body, no lint or type suppression, no cast through unknown, no TODO.
- If a finding cannot be fixed safely from what you can see, leave it out and say so in the summary. An empty "edits" list is a valid answer.`;
}

// shortcut: single-line imports only; a multi-line `import {…}` or a Go import block still has to be near a finding. Upgrade with the AST if that blocks real fixes.
// Each form ends at its closing quote or name list, so nothing executable can ride along on the same line.
const IMPORT_LINE = new RegExp([
  String.raw`^\s*import\s+(?:type\s+)?(?:[\w{}$*\s,]+\s+from\s+)?(['"])[^'"]+\1;?\s*$`,
  String.raw`^\s*(?:const|let|var)\s+[\w{}$\s,:]+=\s*require\((['"])[^'"]+\2\);?\s*$`,
  String.raw`^\s*from\s+[\w.]+\s+import\s+[\w*,\s]+$`,
  String.raw`^\s*import\s+[\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*\s*$`,
].join('|'));

/** An edit that leaves every non-import line as it was, in the same order: a fix may need an import at the top of the file, far from its finding. */
function importsOnly(oldText: string, newText: string): boolean {
  const rest = (text: string) => text.split(/\r?\n/).filter((line) => !IMPORT_LINE.test(line)).join('\n');
  return oldText !== newText && rest(oldText) === rest(newText);
}

/** Applies search/replace edits to the original text. Returns the reason when an edit is not safe to apply. */
function applyEdits(code: string, edits: Edit[], targetLines: number[]): { patched: string } | { reason: string } {
  const eol = code.includes('\r\n') ? '\r\n' : '\n';
  const placed: Array<{ start: number; end: number; text: string }> = [];
  let changed = 0;
  for (const [i, edit] of edits.entries()) {
    const old = edit.old.replace(/\r?\n/g, eol);
    const start = code.indexOf(old);
    if (!old.trim() || start === -1) return { reason: `edit ${i + 1}: "old" was not found in the file; copy it exactly, including indentation.` };
    if (code.indexOf(old, start + 1) !== -1) return { reason: `edit ${i + 1}: "old" occurs more than once; include a neighbouring line to make it unique.` };
    const first = lineCount(code.slice(0, start));
    const last = first + lineCount(old) - 1;
    if (!importsOnly(old, edit.new) && !targetLines.some((line) => line >= first - EDIT_REACH_LINES && line <= last + EDIT_REACH_LINES)) {
      return { reason: `edit ${i + 1} changes lines ${first}-${last}, which are not near any listed finding; fix only the listed findings.` };
    }
    changed += Math.max(lineCount(old), lineCount(edit.new));
    placed.push({ start, end: start + old.length, text: edit.new.replace(/\r?\n/g, eol) });
  }
  if (changed > MAX_CHANGED_LINES_PER_FINDING * targetLines.length) return { reason: `the edits change ${changed} lines, which is more than these findings need; make the smallest fix.` };
  placed.sort((a, b) => b.start - a.start);
  if (placed.some((edit, i) => i > 0 && edit.end > placed[i - 1].start)) return { reason: 'two edits overlap; merge them into one.' };
  return { patched: placed.reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), code) };
}

const syntaxErrors = (path: string, code: string): number =>
  /\.(?:[cm]?js|jsx|tsx?)$/i.test(path) ? ts.transpileModule(code, { fileName: path, reportDiagnostics: true }).diagnostics?.length ?? 0 : 0;

const countByKind = (findings: RepoFinding[]): Map<string, number> =>
  new Map(findings.map((finding) => [finding.kind, Math.max(1, finding.lines.length)]));

/** Second scan of the patched file: the patch must resolve something and must not introduce anything. */
function verify(path: string, code: string, patched: string, before: RepoFinding[], targets: RepoFinding[]): { fixed: string[]; remaining: string[] } | { reason: string } {
  // shortcut: syntax check covers TypeScript/JavaScript only; Python and Go patches rely on the second scan. Upgrade with a parser per language.
  if (syntaxErrors(path, patched) > syntaxErrors(path, code)) return { reason: 'the patched file has a syntax error.' };
  const after = scanSource(path, patched);
  const was = countByKind(before);
  const now = countByKind(after);
  const grown = MUST_NOT_GROW.find((kind) => (now.get(kind) ?? 0) > (was.get(kind) ?? 0));
  if (grown) return { reason: `the patch introduces a new "${grown}" finding instead of fixing the problem.` };
  if (!targets.some((finding) => (now.get(finding.kind) ?? 0) < (was.get(finding.kind) ?? 0))) return { reason: 'the scanner still reports every listed finding after the patch.' };
  // A kind with several occurrences is fixed only when all are gone; what is left shows up in `remaining` with its new lines.
  return { fixed: targets.filter((finding) => !now.has(finding.kind)).map((finding) => finding.text), remaining: after.filter(isPatchable).map((finding) => finding.text) };
}

type Ask = (prompt: string, signal: AbortSignal) => Promise<string | null>;

function chatProvider(url: string, model: string, key: string | undefined): Ask {
  return async (prompt, signal) => {
    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, temperature: 0.1, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  };
}

function geminiProvider(key: string, model: string): Ask {
  return async (prompt, signal) => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          // Edits are short, so the model keeps its default thinking budget: reasoning is what makes a patch correct.
          maxOutputTokens: 32_768,
        },
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    const text = (data.candidates?.[0]?.content?.parts ?? []).filter((part) => !part.thought && part.text).map((part) => part.text).join('');
    return text || null;
  };
}

/**
 * First configured provider: OpenCode-compatible endpoint, then Gemini, then OpenAI.
 * PATCH_MODEL overrides that provider's model, because editing code needs a stronger model than summarizing it.
 */
function configuredProvider(): Ask | null {
  const env = (name: string) => process.env[name]?.trim() || undefined;
  const patchModel = env('PATCH_MODEL');
  const opencodeModel = patchModel ?? env('OPENCODE_MODEL');
  const opencodeBase = env('OPENCODE_BASE_URL');
  const opencodeUrl = env('OPENCODE_CHAT_COMPLETIONS_URL') ?? (opencodeBase ? `${opencodeBase.replace(/\/+$/, '')}/chat/completions` : undefined);
  if (opencodeUrl && opencodeModel) return chatProvider(opencodeUrl, opencodeModel, env('OPENCODE_API_KEY'));
  const geminiKey = env('GEMINI_API_KEY');
  if (geminiKey) return geminiProvider(geminiKey, patchModel ?? env('GEMINI_MODEL') ?? 'gemini-2.5-flash');
  const openAiKey = env('OPENAI_API_KEY');
  if (openAiKey) return chatProvider('https://api.openai.com/v1/chat/completions', patchModel ?? env('OPENAI_MODEL') ?? 'gpt-4o-mini', openAiKey);
  return null;
}

function parsePatch(content: string): { summary: string; edits: Edit[] } | null {
  try {
    const parsed = JSON.parse(content.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '')) as Record<string, unknown>;
    if (typeof parsed.summary === 'string' && Array.isArray(parsed.edits)) {
      const edits = parsed.edits.filter((edit): edit is Edit => edit !== null && typeof edit === 'object'
        && typeof (edit as Edit).old === 'string' && typeof (edit as Edit).new === 'string' && (edit as Edit).old !== (edit as Edit).new);
      return { summary: parsed.summary.trim().slice(0, 600), edits };
    }
  } catch {
    /* malformed or truncated reply */
  }
  return null;
}

export async function POST(request: Request) {
  let body: PatchRequest;
  try {
    body = (await request.json()) as PatchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const path = typeof body.path === 'string' ? body.path.slice(0, 500) : '';
  const code = typeof body.code === 'string' ? body.code : '';
  if (!path || !code) return NextResponse.json({ error: 'path and code are required.' }, { status: 400 });
  if (code.length > MAX_CODE_CHARS) return NextResponse.json({ error: `File is too large to patch (over ${MAX_CODE_CHARS} characters).` }, { status: 413 });

  const unchanged = (summary: string, remaining: string[] = []) =>
    NextResponse.json<PatchResponse>({ summary, patchedCode: code, provider: 'static-fallback', fixed: [], remaining });

  const before = scanSource(path, code);
  const targets = before.filter(isPatchable);
  const targetTexts = targets.map((finding) => finding.text);
  if (targets.length === 0) {
    return unchanged(before.length
      ? 'The findings in this file are structural (size, nesting, duplication, debt). They need a planned refactor, not an automatic patch, so nothing was changed.'
      : 'The scanner found nothing to fix in this file.');
  }
  const ask = configuredProvider();
  if (!ask) return unchanged('No AI provider is configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or an OpenCode endpoint to synthesize patches.', targetTexts);

  const targetLines = targets.flatMap((finding) => finding.lines);
  let feedback: string | null = null;
  try {
    // One retry: the model sees why its first answer was rejected, which fixes most near misses.
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await ask(promptFor(path, code, targets, strings(body.dependencies, 200), strings(body.importedBy, 20), feedback), AbortSignal.timeout(AI_TIMEOUT_MS));
      const patch = text ? parsePatch(text) : null;
      if (!patch) {
        feedback = 'the reply was not the requested JSON.';
        continue;
      }
      if (patch.edits.length === 0) {
        return NextResponse.json<PatchResponse>({ summary: patch.summary || 'The AI found no safe fix.', patchedCode: code, provider: 'ai', fixed: [], remaining: targetTexts });
      }
      const applied = applyEdits(code, patch.edits, targetLines);
      const checked = 'patched' in applied ? verify(path, code, applied.patched, before, targets) : applied;
      if ('patched' in applied && 'fixed' in checked) {
        return NextResponse.json<PatchResponse>({ summary: patch.summary, patchedCode: applied.patched, provider: 'ai', ...checked });
      }
      feedback = 'reason' in checked ? checked.reason : null;
    }
  } catch (error) {
    console.warn(`[patch] AI request failed for ${path}: ${error instanceof Error ? error.message : String(error)}`);
    feedback = null;
  }
  return unchanged(feedback
    ? `No patch was accepted, so nothing was changed. The last attempt was rejected because ${feedback}`
    : 'The AI provider did not return a usable patch. Try again, or fix the findings manually.', targetTexts);
}
