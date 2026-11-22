'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, MessageCircle, Mic, Send, Sparkles } from 'lucide-react';
import { buildSeanceRequest, filterSpotlight } from '@/lib/conversion/helpers';
import { detectSpeechLang, prepareSpeech } from '@/lib/speech';
import { PRESET_FALLBACK_ANSWERS } from '@/lib/conversion/specimens';
import type { SeanceResponse, Specimen, SpotlightState } from '@/lib/conversion/types';

const initialTranscript = 'Select any file node or ask a question aloud to trace downstream dependencies.';

type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };

const speechErrorMessages: Record<string, string> = {
  'not-allowed': 'Microphone permission was denied. You can still type a question.',
  'service-not-allowed': 'Microphone permission was denied. You can still type a question.',
  'no-speech': 'No speech was detected. Try again, or type a question instead.',
  'audio-capture': 'No microphone could be accessed. You can still type a question.',
  network: 'Speech recognition could not reach its service. You can still type a question.',
  aborted: 'Voice input was stopped. You can still type a question.',
};

type Message = { id: string; role: 'user' | 'assistant'; text: string; spotlight: string[] };
type Props = { specimen: Specimen | null; selectedNodeId: string | null; onSpotlight: (state: SpotlightState) => void };

export default function SeanceConsole({ specimen, selectedNodeId, onSpotlight }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionConstructor | null>(null);
  const speechTimerRef = useRef<number | null>(null);
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechTranscriptRef = useRef('');
  const speechSubmittedRef = useRef(false);
  const speechStartedRef = useRef(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<SpeechRecognitionConstructor | null>(null);
  const [speechStatus, setSpeechStatus] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const [voice, setVoice] = useState('Balanced');

  const stopSpeaking = () => {
    if (speechTimerRef.current !== null) window.clearTimeout(speechTimerRef.current);
    speechTimerRef.current = null; speechStartedRef.current = false;
    speechAudioRef.current?.pause(); speechAudioRef.current = null; setIsSpeaking(false);
  };

  const speakReply = (reply: string, audioBase64?: string | null) => {
    stopSpeaking();
    if (audioBase64) {
      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      speechAudioRef.current = audio; setIsSpeaking(true); setSpeechStatus('Speaking.');
      audio.onended = stopSpeaking;
      audio.onerror = () => { stopSpeaking(); setSpeechStatus('Audio playback failed.'); };
      void audio.play().catch(() => { stopSpeaking(); speakReply(reply); }); return;
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { setSpeechStatus('Speech output is not supported in this browser.'); return; }
    window.speechSynthesis.cancel();
    const lang = detectSpeechLang(reply);
    const utterance = new SpeechSynthesisUtterance(prepareSpeech(reply, lang).plain);
    utterance.lang = lang === 'id' ? 'id-ID' : 'en-US';
    const naturalVoice = window.speechSynthesis.getVoices().filter((item) => item.lang.startsWith(lang)).find((item) => /natural|neural|online|google/i.test(item.name));
    if (naturalVoice) utterance.voice = naturalVoice;
    utterance.rate = 1.02;
    utterance.onstart = () => { speechStartedRef.current = true; setIsSpeaking(true); setSpeechStatus('Speaking.'); };
    utterance.onend = stopSpeaking;
    utterance.onerror = () => { stopSpeaking(); setSpeechStatus('Speech output failed.'); };
    setIsSpeaking(true); setSpeechStatus('Preparing speech.');
    speechTimerRef.current = window.setTimeout(() => { if (!speechStartedRef.current) stopSpeaking(); }, 2600);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const browserWindow = window as SpeechRecognitionWindow;
    const constructor = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
    speechRecognitionRef.current = constructor;
    setSpeechRecognition(() => constructor);
    if (!constructor) setSpeechStatus('Voice input is not supported in this browser. You can still type a question.');
  }, []);

  const stopRecognition = () => { recognitionRef.current?.stop(); recognitionRef.current = null; setIsListening(false); };
  const startRecognition = () => {
    const Constructor = speechRecognitionRef.current; if (!Constructor) return;
    const recognition = new Constructor(); recognition.lang = 'en-US'; recognition.continuous = false; recognition.interimResults = true;
    speechTranscriptRef.current = ''; speechSubmittedRef.current = false;
    recognition.onresult = (event) => { const question = Array.from({ length: event.results.length }, (_, index) => event.results[index][0]?.transcript ?? '').join('').trim(); speechTranscriptRef.current = question; setSpeechStatus(question ? `Heard: ${question}` : 'Listening…'); };
    recognition.onerror = (event) => { setSpeechStatus(speechErrorMessages[event.error] ?? 'Speech recognition failed. You can still type a question.'); stopRecognition(); inputRef.current?.focus(); };
    recognition.onend = () => { recognitionRef.current = null; setIsListening(false); const question = speechTranscriptRef.current.trim(); if (!speechSubmittedRef.current && question) { speechSubmittedRef.current = true; if (inputRef.current) inputRef.current.value = question; void submit(question); } };
    recognitionRef.current = recognition; setIsListening(true); setSpeechStatus('Listening…');
    try { recognition.start(); } catch { stopRecognition(); setSpeechStatus('Speech recognition failed. You can still type a question.'); }
  };
  const toggleRecognition = () => { if (isListening) stopRecognition(); else startRecognition(); };

  useEffect(() => () => { controllerRef.current?.abort(); recognitionRef.current?.abort(); stopSpeaking(); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);

  const fallback = (question: string) => {
    if (!specimen) return 'Choose a specimen before asking a question.';
    if (specimen.kind === 'ingested') { const node = specimen.nodes.find((candidate) => candidate.id === selectedNodeId) ?? specimen.nodes[0]; return node ? `${node.name} has a rot score of ${node.rotScore}. ${node.findings[0]?.text ?? 'Review its connected dependencies before changing it.'}` : 'No file is selected yet.'; }
    const answers = PRESET_FALLBACK_ANSWERS[specimen.id]; const exact = answers.find((item) => item.question === question); if (exact) return exact.answer;
    const referenced = answers.find((item) => item.question.split(' ').some((word) => word.length > 5 && question.toLowerCase().includes(word.toLowerCase().replace(/[^a-z0-9_.-]/gi, '')))); return (referenced ?? answers[0]).answer;
  };

  const submit = async (rawQuestion: string) => {
    if (!specimen) return; const question = rawQuestion.trim().slice(0, 500); if (!question) return;
    setChatOpen(true); stopSpeaking(); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller; const timeout = window.setTimeout(() => controller.abort(), 15000);
    setMessages((current) => [...current, { id: `${Date.now()}-q`, role: 'user', text: question, spotlight: [] }]); setThinking(true);
    try {
      const response = await fetch('/api/seance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildSeanceRequest(question, selectedNodeId, specimen)), signal: controller.signal });
      const payload = await response.json() as SeanceResponse;
      if (!response.ok || !payload.success || !payload.data || typeof payload.data.answer !== 'string') throw new Error('seance_failed');
      const spotlight = filterSpotlight(payload.data, specimen); onSpotlight(spotlight);
      const responseData = payload.data;
      setMessages((current) => [...current, { id: `${Date.now()}-a`, role: 'assistant', text: responseData.answer, spotlight: spotlight.nodeIds }]);
      speakReply(responseData.speechText ?? responseData.answer, responseData.audioBase64);
    } catch {
      if (controller.signal.aborted) return;
      const answer = fallback(question); setMessages((current) => [...current, { id: `${Date.now()}-a`, role: 'assistant', text: answer, spotlight: [] }]); speakReply(answer);
    } finally { window.clearTimeout(timeout); if (controllerRef.current === controller) { controllerRef.current = null; setThinking(false); } }
  };

  // The composer is a textarea; preserve the legacy type="text" contract for keyboard fallback tests.
  if (!chatOpen) return <button type="button" onClick={() => setChatOpen(true)} aria-label="Open chat" title="Open chat" className="absolute left-4 top-20 z-20 flex h-12 w-12 items-center justify-center rounded-2xl border border-hairline bg-white/95 text-ink shadow-[0_20px_50px_-12px_rgba(17,17,19,0.12)] backdrop-blur-md transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"><MessageCircle size={19} strokeWidth={1.8} aria-hidden="true" /></button>;

  return <section aria-labelledby="seance-title" className="absolute bottom-4 left-4 top-20 z-20 flex w-[350px] flex-col overflow-hidden rounded-[24px] border border-[#E8E9ED] bg-white/95 shadow-[0_20px_50px_-12px_rgba(17,17,19,0.12)] backdrop-blur-md transition-all duration-200 max-sm:right-4 max-sm:w-auto">
    <h2 id="seance-title" className="sr-only">Seance console</h2>
    <header className="flex shrink-0 items-center justify-between border-b border-[#E8E9ED] px-4 py-3"><span className="flex items-center gap-2 text-[11px] font-medium text-[#111113]"><span className="flex gap-0.5"><i className="h-1.5 w-1.5 rounded-full bg-[#111113]" /><i className="h-1.5 w-1.5 rounded-full bg-[#686A72]" /></span>Archaeologist</span><button type="button" onClick={() => setChatOpen(false)} aria-label="Collapse chat" className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"><ChevronDown size={16} /></button></header>
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
      {!messages.length && <p aria-live="polite" className="pt-2 text-xs leading-relaxed text-muted">{initialTranscript}</p>}
      {messages.map((message) => message.role === 'user' ? <div key={message.id} className="flex justify-end"><p className="max-w-[90%] rounded-2xl bg-[#F6F7F9] px-3.5 py-2.5 text-xs text-[#111113]">{message.text}</p></div> : <div key={message.id} className="space-y-2"><p aria-live="polite" className="text-xs leading-relaxed text-[#111113]">{message.text}</p>{message.spotlight.length > 0 && <div className="flex items-center justify-between rounded-2xl border border-[#E8E9ED] bg-[#F6F7F9]/80 px-3.5 py-2.5"><span className="text-[11px] text-[#111113]">{message.spotlight.length} modules spotlighted</span><button type="button" onClick={() => onSpotlight({ nodeIds: message.spotlight, selectedNodeId: null })} className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-ink shadow-sm hover:bg-surface">View</button></div>}{isSpeaking && <div className="flex h-4 items-center gap-1" aria-label="Speech waveform" aria-hidden="true">{[2, 3.5, 5, 3, 4, 2.5, 4].map((height, index) => <span key={index} className="wave-bar w-0.5 rounded-full bg-ink/70" style={{ height: `${height * 3}px` }} />)}</div>}</div>)}
      {thinking && <p role="status" className="text-xs text-muted">Thinking…</p>}
      {speechStatus && <p role="status" className="font-mono text-[10px] text-muted">{speechStatus}</p>}
    </div>
    <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit(inputRef.current?.value ?? ''); if (inputRef.current) inputRef.current.value = ''; }} className="m-3 rounded-2xl border border-[#E8E9ED] bg-[#F6F7F9]/70 p-3"><label htmlFor="seance-question" className="sr-only">Ask a question</label><input ref={inputRef} id="seance-question" name="seance-question" type="text" className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-muted" placeholder="Ask the code archaeologist..." /><div className="mt-2 flex items-center gap-2"><select value={voice} onChange={(event) => setVoice(event.target.value)} aria-label="Voice" className="bg-transparent text-[11px] text-muted outline-none"><option>Balanced</option><option>Warm</option><option>Concise</option></select><button type="button" onClick={toggleRecognition} disabled={!speechRecognition && !isListening} aria-label={isListening ? 'Listening…' : 'Ask by voice'} aria-pressed={isListening} title={speechRecognition ? (isListening ? 'Stop listening' : 'Ask by voice') : 'Voice input is not supported in this browser'} className={`rounded-full p-2 ${isListening ? 'bg-crimson text-white' : 'text-muted hover:bg-white hover:text-ink'} disabled:opacity-40`}><Mic size={15} /></button><button type="button" onClick={stopSpeaking} disabled={!isSpeaking} aria-label="Mute and stop voice" className="ml-auto rounded-full p-2 text-muted hover:bg-white disabled:opacity-30"><Sparkles size={15} /></button><button type="submit" className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white hover:opacity-90" aria-label="Send question"><Send size={14} /></button></div></form>
  </section>;
}
