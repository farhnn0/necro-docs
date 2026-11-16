import { describe, expect, it } from 'vitest';
import { POST } from './route';

const request = (body: unknown) => new Request('http://localhost/api/seance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/seance contract', () => {
  it('returns an answer and only valid spotlight node ids', async () => {
    const response = await POST(request({
      question: 'What breaks if I change auth?',
      selectedNodeId: 'auth',
      specimenId: 'payment',
      nodes: [
        { id: 'server', path: 'src/server.ts', rotScore: 20 },
        { id: 'auth', path: 'src/auth.ts', rotScore: 80 },
      ],
      edges: [{ source: 'auth', target: 'server' }, { source: 'auth', target: 'ghost' }],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.answer).toContain('src/auth.ts');
    expect(payload.data.spotlightNodeIds).toEqual(['auth', 'server']);
    expect(payload.data.selectNodeId).toBe('auth');
  });

  it('trims and caps questions and never accepts raw source content', async () => {
    const longQuestion = `  ${'x'.repeat(600)}  `;
    const response = await POST(request({
      question: longQuestion,
      rawContent: 'secret source',
      nodes: [],
      edges: [],
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.message).toContain('Source content is not accepted');
  });

  it('rejects invalid JSON and oversized graphs safely', async () => {
    const malformed = await POST(new Request('http://localhost/api/seance', { method: 'POST', body: '{' }));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.message).toContain('valid JSON');

    const oversized = await POST(request({ question: 'inspect', nodes: Array.from({ length: 201 }, (_, i) => ({ id: String(i), path: `${i}.ts`, rotScore: 1 })), edges: [] }));
    expect(oversized.status).toBe(400);
  });
});
