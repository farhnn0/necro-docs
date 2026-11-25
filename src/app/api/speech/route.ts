import { NextResponse } from 'next/server';
import { detectSpeechLang, prepareSpeech } from '@/lib/speech';
import { synthesizeAudio } from '@/lib/tts';

const MAX_TEXT = 600;

/** Voices short UI text (the Repo Brief) with the same configured TTS voice as Séance. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_TEXT) return NextResponse.json({ success: false, error: `Text must be 1-${MAX_TEXT} characters.` }, { status: 400 });
  const lang = detectSpeechLang(text);
  const audioBase64 = await synthesizeAudio(prepareSpeech(text, lang), lang);
  return NextResponse.json({ success: true, data: { audioBase64 } });
}
