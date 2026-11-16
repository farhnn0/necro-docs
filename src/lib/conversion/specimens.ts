import type { PresetId, PresetQuickQuestion, PresetSpecimen } from './types';

export const PRESET_IDS: readonly PresetId[] = ['payment', 'scraper', 'realtime'];

export const PRESET_SPECIMENS: Record<PresetId, PresetSpecimen> = {
  payment: {
    kind: 'preset',
    id: 'payment',
    title: 'acme-corp/legacy-payment-monolith',
    summary: '74% infected',
    primaryLanguage: 'TypeScript',
    description: 'Multi-currency billing service with unguarded SQL writes and swallowed conversion exceptions.',
    nodes: [
      { kind: 'preset', id: 'server', name: 'server.ts', path: 'src/server.ts', linesOfCode: 112, rotScore: 22, lastModified: '3 weeks ago', position: { x: 110, y: 240 }, findings: ['Clean Express bootstrap with bounded body parser limits.', 'Delegates authentication directly to authGuard middleware.'], codeExcerpt: `import express from 'express';\nimport { verifySession } from './middleware/authGuard';\nimport { payRouter } from './routes/payRouter';\n\nconst app = express();\napp.use('/api/pay', verifySession, payRouter);` },
      { kind: 'preset', id: 'auth', name: 'authGuard.ts', path: 'src/middleware/authGuard.ts', linesOfCode: 289, rotScore: 78, lastModified: '9 months ago', position: { x: 380, y: 120 }, findings: ['Legacy x-legacy header bypasses JWT signature validation.', 'No rate limiting on fallback guest token decoding.'], codeExcerpt: `export async function verifySession(req, res, next) {\n  const raw = req.headers['x-legacy'];\n  if (raw) {\n    // TODO: remove bypass before v2\n    req.user = decodeUnsafe(raw);\n    return next();\n  }\n  return validateBearer(req, res, next);\n}` },
      { kind: 'preset', id: 'router', name: 'payRouter.ts', path: 'src/routes/payRouter.ts', linesOfCode: 164, rotScore: 48, lastModified: '4 months ago', position: { x: 380, y: 360 }, findings: ['Missing request schema validation before invoking chargeEngine.', 'Passes raw floating-point amounts directly downstream.'], codeExcerpt: `payRouter.post('/charge', async (req, res) => {\n  const { uid, amt, curr } = req.body;\n  const receipt = await executeCharge(uid, amt, curr);\n  res.json({ ok: true, receipt });\n});` },
      { kind: 'preset', id: 'charge', name: 'chargeEngine.ts', path: 'src/billing/chargeEngine.ts', linesOfCode: 482, rotScore: 94, lastModified: '14 months ago', position: { x: 670, y: 240 }, findings: ['Empty catch block swallows currency conversion failures.', 'Commits ledger rows without transactional rollback guard.'], codeExcerpt: `export async function executeCharge(uid, amt, curr) {\n  try {\n    amt = await convertRateUnsafe(amt, curr);\n  } catch (e) {\n    /* silent fail — swallowed error */\n  }\n  const row = await dbLedger.forceInsert({ uid, amt });\n  await dispatchWebhook('charge.settled', row);\n  return row;\n}` },
      { kind: 'preset', id: 'ledger', name: 'dbLedger.ts', path: 'src/storage/dbLedger.ts', linesOfCode: 340, rotScore: 64, lastModified: '8 months ago', position: { x: 940, y: 130 }, findings: ['Lacks idempotency key constraint on ledger inserts.', 'Directly coupled to chargeEngine write schema.'], codeExcerpt: `export const dbLedger = {\n  async forceInsert(payload) {\n    return pool.query(\n      'INSERT INTO ledger_entries(uid, amount) VALUES($1, $2)',\n      [payload.uid, payload.amt]\n    );\n  }\n};` },
      { kind: 'preset', id: 'webhook', name: 'webhookDispatcher.ts', path: 'src/events/webhookDispatcher.ts', linesOfCode: 198, rotScore: 59, lastModified: '6 months ago', position: { x: 940, y: 350 }, findings: ['Fires external merchant callbacks even when upstream rate conversion failed.', 'Synchronous retry loop can stall worker event loop.'], codeExcerpt: `export async function dispatchWebhook(event, data) {\n  return fetch(MERCHANT_HOOK_URL, {\n    method: 'POST',\n    body: JSON.stringify({ event, data })\n  });\n}` },
    ],
    quickQuestions: [
      { question: 'What breaks if I refactor chargeEngine.ts?', answer: 'chargeEngine.ts currently swallows currency conversion errors. Throwing an explicit exception will halt dbLedger inserts and prevent webhookDispatcher from sending false receipts.' },
      { question: 'Explain the authGuard bypass risk', answer: 'authGuard.ts accepts an unverified x-legacy header that bypasses JWT checks and forwards unvalidated sessions straight into chargeEngine.ts.' },
    ],
    edges: [{ id: 'server→auth', source: 'server', target: 'auth' }, { id: 'server→router', source: 'server', target: 'router' }, { id: 'auth→charge', source: 'auth', target: 'charge' }, { id: 'router→charge', source: 'router', target: 'charge' }, { id: 'charge→ledger', source: 'charge', target: 'ledger' }, { id: 'charge→webhook', source: 'charge', target: 'webhook' }],
  },
  scraper: {
    kind: 'preset',
    id: 'scraper',
    title: 'data-ops/async-crawler-worker', summary: '58% infected', primaryLanguage: 'Python', description: 'Distributed queue consumer with shared mutable session state and unbounded retry loops.',
    nodes: [
      { kind: 'preset', id: 'main', name: 'worker.py', path: 'crawler/worker.py', linesOfCode: 210, rotScore: 35, lastModified: '2 weeks ago', position: { x: 150, y: 240 }, findings: ['Standard asyncio event loop entrypoint.'], codeExcerpt: `async def run_worker():\n    while True:\n        job = await queue.pop()\n        await fetch_page(job.url)` },
      { kind: 'preset', id: 'fetcher', name: 'sessionPool.py', path: 'crawler/sessionPool.py', linesOfCode: 390, rotScore: 82, lastModified: '11 months ago', position: { x: 470, y: 240 }, findings: ['Global mutable cookie jar shared across concurrent tenants.', 'Unbounded recursion on HTTP 429 backoff.'], codeExcerpt: `SHARED_COOKIES = {}\n\nasync def fetch_page(url):\n    async with aiohttp.ClientSession(cookies=SHARED_COOKIES) as s:\n        return await s.get(url)` },
      { kind: 'preset', id: 'parser', name: 'domExtractor.py', path: 'crawler/domExtractor.py', linesOfCode: 275, rotScore: 52, lastModified: '5 months ago', position: { x: 800, y: 240 }, findings: ['Regex HTML fallback triggers catastrophic backtracking on malformed tags.'], codeExcerpt: `def extract_prices(html: str):\n    return re.findall(r'<span class="price">(.*?)</span>', html)` },
    ],
    quickQuestions: [
      { question: 'What breaks if I change sessionPool.py?', answer: 'sessionPool.py shares a mutable cookie jar across concurrent tenants and recursively retries HTTP 429 responses, so changes can leak sessions or exhaust the worker.' },
      { question: 'Explain the crawler retry risk', answer: 'The crawler can recurse without a bound while backing off from HTTP 429 responses, which can exhaust the worker before the queue drains.' },
    ],
    edges: [{ id: 'main→fetcher', source: 'main', target: 'fetcher' }, { id: 'fetcher→parser', source: 'fetcher', target: 'parser' }],
  },
  realtime: {
    kind: 'preset',
    id: 'realtime',
    title: 'infra/edge-socket-relay', summary: '26% infected', primaryLanguage: 'Node.js', description: 'Clean WebSocket pub/sub broker with isolated heartbeat cleanup and well-typed payloads.',
    nodes: [
      { kind: 'preset', id: 'gateway', name: 'gateway.ts', path: 'src/gateway.ts', linesOfCode: 145, rotScore: 18, lastModified: '4 days ago', position: { x: 180, y: 240 }, findings: ['Well-structured WebSocket upgrade handler with strict origin checks.'], codeExcerpt: `wss.on('connection', (ws, req) => {\n  if (!isAllowedOrigin(req.headers.origin)) return ws.close();\n  registerClient(ws);\n});` },
      { kind: 'preset', id: 'broker', name: 'topicBroker.ts', path: 'src/topicBroker.ts', linesOfCode: 220, rotScore: 34, lastModified: '1 week ago', position: { x: 540, y: 240 }, findings: ['Clean pub/sub channel map; consider adding max subscribers per room.'], codeExcerpt: `export function publish(topic: string, payload: Uint8Array) {\n  const subs = channels.get(topic);\n  subs?.forEach((client) => client.send(payload));\n}` },
    ],
    quickQuestions: [
      { question: 'What breaks if I edit topicBroker.ts?', answer: 'topicBroker.ts owns the channel map and forwards payloads to every subscriber; changing its publish path can affect every connected room.' },
      { question: 'Explain the relay heartbeat risk', answer: 'The relay keeps gateway connection handling separate from the broker, so heartbeat cleanup changes should remain isolated if the channel map contract stays intact.' },
    ],
    edges: [{ id: 'gateway→broker', source: 'gateway', target: 'broker' }],
  },
};

export const PRESET_FALLBACK_ANSWERS: Record<PresetId, readonly PresetQuickQuestion[]> = {
  payment: [
    { question: 'What breaks if I refactor chargeEngine.ts?', answer: 'chargeEngine.ts currently swallows currency conversion errors. Throwing an explicit exception will halt dbLedger inserts and prevent webhookDispatcher from sending false receipts.' },
    { question: 'Explain the authGuard bypass risk', answer: 'authGuard.ts accepts an unverified x-legacy header that bypasses JWT checks and forwards unvalidated sessions straight into chargeEngine.ts.' },
  ],
  scraper: [
    { question: 'What breaks if I change sessionPool.py?', answer: 'sessionPool.py shares a mutable cookie jar across concurrent tenants and recursively retries HTTP 429 responses, so changes can leak sessions or exhaust the worker.' },
    { question: 'Explain the crawler retry risk', answer: 'The crawler can recurse without a bound while backing off from HTTP 429 responses, which can exhaust the worker before the queue drains.' },
  ],
  realtime: [
    { question: 'What breaks if I edit topicBroker.ts?', answer: 'topicBroker.ts owns the channel map and forwards payloads to every subscriber; changing its publish path can affect every connected room.' },
    { question: 'Explain the relay heartbeat risk', answer: 'The relay keeps gateway connection handling separate from the broker, so heartbeat cleanup changes should remain isolated if the channel map contract stays intact.' },
  ],
};

export function isPresetId(value: string | null | undefined): value is PresetId {
  return value != null && (PRESET_IDS as readonly string[]).includes(value);
}

export function getPresetSpecimen(id: PresetId): PresetSpecimen {
  return PRESET_SPECIMENS[id];
}

export function getPresetFallbackAnswers(id: PresetId): readonly PresetQuickQuestion[] {
  return PRESET_FALLBACK_ANSWERS[id];
}

export function hasValidPresetGraph(specimen: PresetSpecimen): boolean {
  const nodeIds = new Set(specimen.nodes.map((node) => node.id));
  return new Set(specimen.nodes.map((node) => node.id)).size === specimen.nodes.length
    && specimen.nodes.every((node) => Number.isInteger(node.rotScore) && node.rotScore >= 0 && node.rotScore <= 100)
    && specimen.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
}
