import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const CODE = [
  "import { db } from './db';",
  '',
  'export async function charge(amount: number) {',
  '  try {',
  '    await db.insert(amount);',
  '  } catch (error) {}',
  '  return amount;',
  '}',
  '',
  ...Array.from({ length: 30 }, (_, i) => `export const rate${i} = ${i};`),
  '',
].join('\n');

const FIX = { old: '  } catch (error) {}', new: "  } catch (error) {\n    console.error('charge failed', error);\n    throw error;\n  }" };

/** Stubs the OpenAI-compatible provider with one reply per call and records the prompts. */
function stubModel(...replies: unknown[]) {
  const prompts: string[] = [];
  vi.stubEnv('OPENCODE_BASE_URL', '');
  vi.stubEnv('OPENCODE_CHAT_COMPLETIONS_URL', '');
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  vi.stubGlobal('fetch', (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: string }> };
    prompts.push(`${sent.model}\n${sent.messages[0].content}`);
    return Response.json({ choices: [{ message: { content: JSON.stringify(replies[prompts.length - 1] ?? replies[replies.length - 1]) } }] });
  }) as typeof fetch);
  return prompts;
}

const patch = async (body: unknown) => {
  const response = await POST(new Request('http://localhost/api/patch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: response.status, data: await response.json() as { summary: string; patchedCode: string; provider: string; fixed: string[]; remaining: string[] } };
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/patch', () => {
  it('applies an edit only after the second scan confirms the finding is gone', async () => {
    vi.stubEnv('PATCH_MODEL', 'strong-model');
    const prompts = stubModel({ summary: 'Logs and rethrows the insert failure.', edits: [FIX] });
    const { data } = await patch({ path: 'src/charge.ts', code: CODE, dependencies: ['zod'], importedBy: ['src/server.ts'] });

    expect(data.provider).toBe('ai');
    expect(data.patchedCode).toBe(CODE.replace(FIX.old, FIX.new));
    expect(data.fixed).toEqual(['Line 6: Empty catch block swallows exceptions silently.']);
    expect(data.remaining).toEqual([]);
    // The model gets the scanner's own finding plus repository context, on the patch model.
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/^strong-model\n/);
    expect(prompts[0]).toContain('[empty-catch] line 6: `} catch (error) {}`');
    expect(prompts[0]).toContain('src/server.ts');
    expect(prompts[0]).toContain('zod');
  });

  it('does not call a finding fixed while one of its occurrences is still there', async () => {
    const code = ['export function sync() {', '  try { push(); } catch (error) {}', '  return 1;', '}', '', 'export function load() {', '  try { pull(); } catch (error) {}', '  return 2;', '}', ''].join('\n');
    stubModel({ summary: 'Rethrows the push failure.', edits: [{ old: '  try { push(); } catch (error) {}', new: '  try { push(); } catch (error) { throw error; }' }] });
    const { data } = await patch({ path: 'src/sync.ts', code });

    expect(data.provider).toBe('ai');
    expect(data.patchedCode).toContain('catch (error) { throw error; }');
    expect(data.fixed).toEqual([]);
    expect(data.remaining).toEqual(['Line 7: Empty catch block swallows exceptions silently.']);
  });

  it('accepts an import added at the top for a fix deep in the file', async () => {
    const code = ["import { db } from './db';", ...Array.from({ length: 40 }, (_, i) => `export const rate${i} = ${i};`), 'export async function charge(amount: number) {', '  try {', '    await db.insert(amount);', '  } catch (error) {}', '  return amount;', '}', ''].join('\n');
    stubModel({ summary: 'Logs and rethrows.', edits: [
      { old: "import { db } from './db';", new: "import { db } from './db';\nimport { logger } from './logger';" },
      { old: '  } catch (error) {}', new: "  } catch (error) {\n    logger.error('charge failed', error);\n    throw error;\n  }" },
    ] });
    const { data } = await patch({ path: 'src/charge.ts', code });

    expect(data.provider).toBe('ai');
    expect(data.patchedCode).toContain("import { logger } from './logger';");
    expect(data.fixed).toEqual(['Line 45: Empty catch block swallows exceptions silently.']);
  });

  it('never calls the model for a file whose findings are only structural', async () => {
    const prompts = stubModel({ summary: 'x', edits: [] });
    const code = ['// TODO split this module', 'export const a = 1;', ''].join('\n');
    const { data } = await patch({ path: 'src/a.ts', code });

    expect(prompts).toHaveLength(0);
    expect(data.provider).toBe('static-fallback');
    expect(data.patchedCode).toBe(code);
    expect(data.summary).toMatch(/structural/);
  });

  it('retries once with the rejection reason, then accepts the corrected answer', async () => {
    // First answer hides the catch behind a comment; the scanner sees a documented ignore instead of a fix.
    const prompts = stubModel(
      { summary: 'Documents the ignore.', edits: [{ old: FIX.old, new: '  } catch (error) { /* ignored on purpose */ }' }] },
      { summary: 'Logs and rethrows.', edits: [FIX] },
    );
    const { data } = await patch({ path: 'src/charge.ts', code: CODE });

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Your previous answer was rejected');
    expect(data.provider).toBe('ai');
    expect(data.fixed).toHaveLength(1);
  });

  it.each([
    ['an edit whose text is not in the file', [{ old: '  } catch (err) {}', new: FIX.new }], /was not found/],
    ['an ambiguous edit', [{ old: 'export const rate1', new: 'export const price1' }], /more than once|not near/],
    ['an edit far from every finding', [FIX, { old: 'export const rate29 = 29;', new: 'export const rate29 = 30;' }], /not near any listed finding/],
    ['code riding along on an added import line', [FIX, { old: 'export const rate29 = 29;', new: "import { log } from './log'; log(1);\nexport const rate29 = 29;" }], /not near any listed finding/],
    ['reordered statements next to an added import', [FIX, { old: 'export const rate28 = 28;\nexport const rate29 = 29;', new: "import { log } from './log';\nexport const rate29 = 29;\nexport const rate28 = 28;" }], /not near any listed finding/],
    ['a rewrite much larger than the finding needs', [{ old: FIX.old, new: `${FIX.new}\n${Array.from({ length: 40 }, (_, i) => `  // step ${i}`).join('\n')}` }], /more than these findings need/],
    ['a patch that breaks the syntax', [{ old: FIX.old, new: '  } catch (error) { throw error;' }], /syntax error/],
  ])('rejects %s and leaves the file unchanged', async (_name, edits, reason) => {
    const prompts = stubModel({ summary: 'x', edits });
    const { data } = await patch({ path: 'src/charge.ts', code: CODE });

    expect(prompts).toHaveLength(2); // one retry, then an honest failure
    expect(data.provider).toBe('static-fallback');
    expect(data.patchedCode).toBe(CODE);
    expect(data.summary).toMatch(reason);
    expect(data.remaining).toEqual(['Line 6: Empty catch block swallows exceptions silently.']);
  });

  it('keeps CRLF line endings when the model answers with LF', async () => {
    stubModel({ summary: 'Logs and rethrows.', edits: [FIX] });
    const crlf = CODE.replace(/\n/g, '\r\n');
    const { data } = await patch({ path: 'src/charge.ts', code: crlf });

    expect(data.provider).toBe('ai');
    expect(data.patchedCode).toBe(crlf.replace(FIX.old, FIX.new.replace(/\n/g, '\r\n')));
  });

  it('validates the request body', async () => {
    expect((await patch({ path: 'src/a.ts' })).status).toBe(400);
    expect((await patch({ path: 'src/a.ts', code: 'x'.repeat(100_001) })).status).toBe(413);
  });
});
