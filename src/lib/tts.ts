import type { SpeechLang } from '@/lib/speech';

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
    console.warn('[tts] Google TTS failed', response.status, err?.error?.message);
    return { audio: null, status: response.status };
  };
  try {
    if (!NO_SSML.test(voiceName)) {
      const r = await call({ ssml: speech.ssml });
      if (r.audio || r.status !== 400) return r.audio;
    }
    return (await call({ text: speech.plain })).audio;
  } catch (error) {
    console.warn('[tts] Google TTS error', error instanceof Error ? error.message : error);
    return null;
  }
}

/** MP3 (base64) from Google Cloud TTS, then ElevenLabs; null means the browser voice should be used. */
export async function synthesizeAudio(speech: { plain: string; ssml: string }, lang: SpeechLang): Promise<string | null> {
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
