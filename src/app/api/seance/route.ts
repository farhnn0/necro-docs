import { NextResponse } from 'next/server';
import { detectSpeechLang, prepareSpeech, type SpeechLang } from '@/lib/speech';

interface InputNode { id: string; path: string; name?: string; rotScore: number; code?: string; }
interface InputEdge { source: string; target: string; }
interface SeanceBody { question?: unknown; selectedNodeId?: unknown; nodes?: unknown; edges?: unknown; repoTitle?: unknown; }
interface SeanceData { answer: string; spotlightNodeIds: string[]; riskLevel: 'low' | 'medium' | 'high'; selectNodeId?: string; audioBase64: string | null; speechText?: string; }

// Same file budget as the analyzer (MAX_FILES in repoAnalyzer.ts), so a full analysis can always be asked about.
const MAX_NODES = 400;
const MAX_EDGES = 4000;

const responseError = (message: string, status = 400) => NextResponse.json({ success: false, error: { code: 'INVALID_REQUEST', message } }, { status });

function safeGraph(body: SeanceBody) {
  const rawNodes = Array.isArray(body.nodes) ? body.nodes : [];
  const rawEdges = Array.isArray(body.edges) ? body.edges : [];
  const nodes: InputNode[] = rawNodes.filter((item): item is InputNode => {
    if (!item || typeof item !== 'object') return false;
    const n = item as Record<string, unknown>;
    return typeof n.id === 'string' && typeof n.path === 'string' && typeof n.rotScore === 'number' && Number.isFinite(n.rotScore);
  }).slice(0, MAX_NODES).map((n) => ({ id: n.id, path: n.path.slice(0, 500), name: typeof n.name === 'string' ? n.name : n.path.split('/').pop(), rotScore: Math.max(0, Math.min(100, n.rotScore)), code: typeof n.code === 'string' ? n.code.slice(0, 12_000) : undefined }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges: InputEdge[] = rawEdges.filter((item): item is InputEdge => {
    if (!item || typeof item !== 'object') return false;
    const e = item as Record<string, unknown>;
    return typeof e.source === 'string' && typeof e.target === 'string' && ids.has(e.source) && ids.has(e.target);
  }).slice(0, MAX_EDGES).map((edge) => ({ source: edge.source, target: edge.target }));
  return { nodes, edges, ids };
}

function fallback(question: string, selectedNodeId: string | null, nodes: InputNode[], edges: InputEdge[]): SeanceData {
  const normalized = question.toLowerCase();
  const focus = nodes.find((node) => normalized.includes(node.id.toLowerCase()) || normalized.includes(node.path.toLowerCase()))
    ?? nodes.find((node) => node.id === selectedNodeId)
    ?? [...nodes].sort((a, b) => b.rotScore - a.rotScore)[0];
  if (!focus) return { answer: 'No analyzed file is available to inspect yet.', spotlightNodeIds: [], riskLevel: 'low', audioBase64: null };
  const upstream = edges.filter((edge) => edge.target === focus.id).map((edge) => nodes.find((node) => node.id === edge.source)?.name ?? edge.source);
  const downstreamIds = edges.filter((edge) => edge.source === focus.id).map((edge) => edge.target);
  const downstream = downstreamIds.map((id) => nodes.find((node) => node.id === id)?.name ?? id);
  const answer = `${focus.path} has a rot score of ${focus.rotScore}. ${upstream.length ? `${upstream.join(', ')} depend on it upstream, and ` : ''}${downstream.length ? `a change can reach ${downstream.join(', ')} downstream.` : 'no downstream dependency was found in the analyzed graph.'}`;
  return { answer, spotlightNodeIds: [focus.id, ...upstream.map((name) => nodes.find((node) => node.name === name)?.id).filter((id): id is string => Boolean(id)), ...downstreamIds], riskLevel: focus.rotScore >= 70 ? 'high' : focus.rotScore >= 40 ? 'medium' : 'low', selectNodeId: focus.id, audioBase64: null };
}

function promptFor(question: string, repoTitle: string, focus: InputNode | undefined, neighbors: InputNode[], highRisk: InputNode[], edges: InputEdge[]) {
  return `You are Senior Code Archaeologist for ${repoTitle}. Answer the developer's question using only this graph and code evidence.
Question: ${question}
Focused file: ${JSON.stringify(focus)}
Direct neighbors: ${JSON.stringify(neighbors)}
Highest-risk files: ${JSON.stringify(highRisk)}
Relevant edges: ${JSON.stringify(edges)}
Return JSON only: {"answer":"2-3 short conversational sentences, spoken style, max ~20 words each","spotlightNodeIds":["valid node ids"],"riskLevel":"low|medium|high"}.
Answer in the same language as the question. The answer must name concrete files normally (e.g. use-auth.ts), contain no markdown, bullets, backticks, or asterisks. Spotlight only IDs from the supplied nodes.`;
}

function parseAi(text: string, ids: Set<string>): Omit<SeanceData, 'audioBase64'> | null {
  try {
    const raw = JSON.parse(text.replace(/^\s*```json\s*/i, '').replace(/```\s*$/, '')) as Record<string, unknown>;
    if (typeof raw.answer !== 'string') return null;
    const spotlightNodeIds = Array.isArray(raw.spotlightNodeIds) ? raw.spotlightNodeIds.filter((id): id is string => typeof id === 'string' && ids.has(id)).slice(0, 30) : [];
    const riskLevel = raw.riskLevel === 'high' || raw.riskLevel === 'medium' ? raw.riskLevel : 'low';
    return { answer: raw.answer.replace(/[*`#•]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, 900), spotlightNodeIds, riskLevel };
  } catch { return null; }
}

async function askAi(prompt: string, signal: AbortSignal): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 900, ...(model.includes('2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }) });
    if (!response.ok) return null;
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    return (data.candidates?.[0]?.content?.parts ?? []).filter((part) => !part.thought && part.text).map((part) => part.text).join('') || null;
  }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Return only valid JSON.' }, { role: 'user', content: prompt }] }) });
    if (!response.ok) return null;
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  }
  return null;
}

const NO_SSML = /Chirp|Journey|Studio/i;

async function googleTts(speech: { plain: string; ssml: string }, lang: SpeechLang): Promise<string | null> {
  const key = process.env.GOOGLE_CLOUD_TTS_API_KEY?.trim();
  if (!key) return null;
  const configured = process.env.GOOGLE_CLOUD_TTS_VOICE_NAME?.trim();
  const prefix = lang === 'id' ? 'id-ID' : 'en-US';
  const voiceName = (lang === 'id' ? process.env.GOOGLE_CLOUD_TTS_VOICE_ID : process.env.GOOGLE_CLOUD_TTS_VOICE_EN)?.trim()
    || (configured?.startsWith(prefix) ? configured : undefined)
    || (lang === 'id' ? 'id-ID-Wavenet-A' : 'en-US-Neural2-F');
  const languageCode = voiceName.split('-').slice(0, 2).join('-');
  const rate = Math.min(1.5, Math.max(0.5, Number(process.env.GOOGLE_CLOUD_TTS_SPEAKING_RATE) || 1.05));
  const call = async (input: { text: string } | { ssml: string }) => {
    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, voice: { languageCode, name: voiceName }, audioConfig: { audioEncoding: 'MP3', speakingRate: rate } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      const data = await response.json() as { audioContent?: string };
      return { audio: data.audioContent || null, status: 200 };
    }
    const err = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    console.warn('[seance] Google TTS failed', response.status, err?.error?.message);
    return { audio: null, status: response.status };
  };
  try {
    if (!NO_SSML.test(voiceName)) {
      const r = await call({ ssml: speech.ssml });
      if (r.audio || r.status !== 400) return r.audio;
    }
    return (await call({ text: speech.plain })).audio;
  } catch (error) {
    console.warn('[seance] Google TTS error', error instanceof Error ? error.message : error);
    return null;
  }
}

async function synthesizeAudio(speech: { plain: string; ssml: string }, lang: SpeechLang): Promise<string | null> {
  const google = await googleTts(speech, lang);
  if (google) return google;

  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (key) {
    const voice = process.env.ELEVENLABS_VOICE_ID?.trim() || '21m00Tcm4TlvDq8ikWAM';
    const configuredModel = process.env.ELEVENLABS_MODEL_ID?.trim();
    const model = configuredModel && /^[a-z0-9_-]+$/i.test(configuredModel) ? configuredModel : 'eleven_multilingual_v2';
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text: speech.plain, model_id: model, output_format: 'mp3_44100_128' }), signal: AbortSignal.timeout(15_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer()).toString('base64');
    } catch { /* fallback to browser speech */ }
  }
  return null;
}
export async function POST(request: Request) {
  let body: SeanceBody;
  try { body = await request.json() as SeanceBody; } catch { return responseError('Request body must be valid JSON.'); }
  if ('rawContent' in body) return responseError('Source content is not accepted.');
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
  if (!question) return responseError('A question is required.');
  if (Array.isArray(body.nodes) && body.nodes.length > MAX_NODES) return responseError('Question or graph exceeds the request limits.');
  if (Array.isArray(body.edges) && body.edges.length > MAX_EDGES) return responseError('Question or graph exceeds the request limits.');
  const { nodes, edges, ids } = safeGraph(body);
  if (nodes.length > MAX_NODES || edges.length > MAX_EDGES) return responseError('Question or graph exceeds the request limits.');
  const selectedNodeId = typeof body.selectedNodeId === 'string' && ids.has(body.selectedNodeId) ? body.selectedNodeId : null;
  const focus = nodes.find((node) => node.id === selectedNodeId);
  const neighborIds = new Set(edges.filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId).flatMap((edge) => [edge.source, edge.target]));
  const neighbors = nodes.filter((node) => neighborIds.has(node.id) && node.id !== selectedNodeId);
  const highRisk = [...nodes].sort((a, b) => b.rotScore - a.rotScore).slice(0, 5);
  let data = fallback(question, selectedNodeId, nodes, edges);
  try {
    const ai = await askAi(promptFor(question, typeof body.repoTitle === 'string' ? body.repoTitle : 'this repository', focus, neighbors, highRisk, edges.filter((edge) => neighborIds.has(edge.source) || neighborIds.has(edge.target))), AbortSignal.timeout(30_000));
    const parsed = ai ? parseAi(ai, ids) : null;
    if (parsed) data = { ...parsed, selectNodeId: data.selectNodeId, audioBase64: null };
  } catch { /* graph fallback remains successful */ }
  const lang = detectSpeechLang(data.answer);
  const speech = prepareSpeech(data.answer, lang);
  data.speechText = speech.plain;
  data.audioBase64 = await synthesizeAudio(speech, lang);
  return NextResponse.json({ success: true, data });
}
