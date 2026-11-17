import { NextResponse } from 'next/server';

/**
 * POST /api/patch
 * Body: { path: string, code: string, findings: string[] }
 * Returns { summary, patchedCode, provider } where `patchedCode` is the complete patched file.
 * `provider` is 'ai' when a model produced the patch, otherwise 'static-fallback' (code unchanged).
 */

interface PatchRequest {
  path?: unknown;
  code?: unknown;
  findings?: unknown;
}

interface PatchResponse {
  summary: string;
  patchedCode: string;
  provider: 'ai' | 'static-fallback';
}

const MAX_CODE_CHARS = 100_000;
const AI_TIMEOUT_MS = 60_000;

const promptFor = (path: string, code: string, findings: string[]) => `You are a senior engineer making a surgical, minimal-risk patch.
File: ${path}
Findings to fix (line numbers refer to the original file):
${findings.map((finding) => `- ${finding}`).join('\n')}

Original file:
${code}

Return JSON only: {"summary":"1-2 sentences describing what you changed and why","patchedCode":"the COMPLETE patched file"}.
Rules:
- patchedCode must contain every line of the file, changed or not. Never use placeholders such as "...", "// rest unchanged", or "// existing code".
- Change only what the findings require. Keep unrelated code, imports, formatting, and line endings exactly as they are.
- Do not add new dependencies or imports that are not already available.
- If a finding cannot be fixed safely, leave that code unchanged and say so in the summary.`;

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
          // A full patched file is long; thinking tokens would eat the output budget and truncate the JSON.
          maxOutputTokens: 32_768,
          ...(/gemini-2\.5-flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    const text = (data.candidates?.[0]?.content?.parts ?? []).filter((part) => !part.thought && part.text).map((part) => part.text).join('');
    return text || null;
  };
}

/** First configured provider: OpenCode-compatible endpoint, then Gemini, then OpenAI. */
function configuredProvider(): Ask | null {
  const env = (name: string) => process.env[name]?.trim() || undefined;
  const opencodeModel = env('OPENCODE_MODEL');
  const opencodeBase = env('OPENCODE_BASE_URL');
  const opencodeUrl = env('OPENCODE_CHAT_COMPLETIONS_URL') ?? (opencodeBase ? `${opencodeBase.replace(/\/+$/, '')}/chat/completions` : undefined);
  if (opencodeUrl && opencodeModel) return chatProvider(opencodeUrl, opencodeModel, env('OPENCODE_API_KEY'));
  const geminiKey = env('GEMINI_API_KEY');
  if (geminiKey) return geminiProvider(geminiKey, env('GEMINI_MODEL') ?? 'gemini-2.5-flash');
  const openAiKey = env('OPENAI_API_KEY');
  if (openAiKey) return chatProvider('https://api.openai.com/v1/chat/completions', env('OPENAI_MODEL') ?? 'gpt-4o-mini', openAiKey);
  return null;
}

function parsePatch(content: string): { summary: string; patchedCode: string } | null {
  try {
    const parsed = JSON.parse(content.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '')) as Record<string, unknown>;
    if (typeof parsed.summary === 'string' && typeof parsed.patchedCode === 'string' && parsed.patchedCode.trim()) {
      return { summary: parsed.summary.trim(), patchedCode: parsed.patchedCode };
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
  const findings = Array.isArray(body.findings) ? body.findings.filter((item): item is string => typeof item === 'string').slice(0, 8) : [];
  if (!path || !code || findings.length === 0) return NextResponse.json({ error: 'path, code, and findings are required.' }, { status: 400 });
  // Truncating would make the "complete patched file" silently lose the tail of the original.
  if (code.length > MAX_CODE_CHARS) return NextResponse.json({ error: `File is too large to patch (over ${MAX_CODE_CHARS} characters).` }, { status: 413 });

  const ask = configuredProvider();
  if (!ask) {
    return NextResponse.json<PatchResponse>({ summary: 'No AI provider is configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or an OpenCode endpoint to synthesize patches.', patchedCode: code, provider: 'static-fallback' });
  }
  try {
    const text = await ask(promptFor(path, code, findings), AbortSignal.timeout(AI_TIMEOUT_MS));
    const patch = text ? parsePatch(text) : null;
    if (patch) return NextResponse.json<PatchResponse>({ ...patch, provider: 'ai' });
  } catch (error) {
    console.warn(`[patch] AI request failed for ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return NextResponse.json<PatchResponse>({ summary: 'The AI provider did not return a usable patch. Try again, or fix the findings manually.', patchedCode: code, provider: 'static-fallback' });
}
