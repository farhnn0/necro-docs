'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, Mic } from 'lucide-react';
import { buildSeanceRequest, filterSpotlight, quickQuestions } from '@/lib/conversion/helpers';
import { PRESET_FALLBACK_ANSWERS } from '@/lib/conversion/specimens';
import type { SeanceResponse, Specimen, SpotlightState } from '@/lib/conversion/types';

const initialTranscript = 'Select any file node or ask a question aloud to trace downstream dependencies.';

type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
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
  const [transcript, setTranscript] = useState(initialTranscript);
  const [, setThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<SpeechRecognitionConstructor | null>(null);
  const [speechStatus, setSpeechStatus] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

  const stopSpeaking = () => {
    if (speechTimerRef.current !== null) window.clearTimeout(speechTimerRef.current);
    speechTimerRef.current = null;
    speechStartedRef.current = false;
    speechAudioRef.current?.pause();
    speechAudioRef.current = null;
    setIsSpeaking(false);
  };

  const speakReply = (reply: string, audioBase64?: string | null) => {
    stopSpeaking();
    if (audioBase64) {
      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      speechAudioRef.current = audio;
      setIsSpeaking(true);
      setSpeechStatus('Speaking.');
      audio.onended = stopSpeaking;
      audio.onerror = () => { stopSpeaking(); setSpeechStatus('Audio playback failed.'); };
      void audio.play().catch(() => { stopSpeaking(); speakReply(reply); });
      return;
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeechStatus('Speech output is not supported in this browser.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(reply);
    utterance.rate = 1.02;
    utterance.onstart = () => {
      speechStartedRef.current = true;
      setIsSpeaking(true);
      setSpeechStatus('Speaking.');
    };
    utterance.onend = stopSpeaking;
    utterance.onerror = () => {
      stopSpeaking();
      setSpeechStatus('Speech output failed.');
    };
    setIsSpeaking(true);
    setSpeechStatus('Preparing speech.');
    speechTimerRef.current = window.setTimeout(() => {
      if (!speechStartedRef.current) stopSpeaking();
    }, 2600);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const browserWindow = window as SpeechRecognitionWindow;
    const constructor = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
    speechRecognitionRef.current = constructor;
    // Browser feature detection must happen after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    // Wrapped in a function: React calls any function passed to a state setter.
    setSpeechRecognition(() => constructor);
    if (!constructor) setSpeechStatus('Voice input is not supported in this browser. You can still type a question.');
  }, []);

  const stopRecognition = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  };

  const startRecognition = () => {
    const Constructor = speechRecognitionRef.current;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    speechTranscriptRef.current = '';
    speechSubmittedRef.current = false;
    recognition.onresult = (event) => {
      const question = Array.from({ length: event.results.length }, (_, index) => event.results[index][0]?.transcript ?? '').join('').trim();
      speechTranscriptRef.current = question;
      setSpeechStatus(question ? `Heard: ${question}` : 'Listening…');
    };
    recognition.onerror = (event) => {
      setSpeechStatus(speechErrorMessages[event.error] ?? 'Speech recognition failed. You can still type a question.');
      stopRecognition();
      inputRef.current?.focus();
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
      const question = speechTranscriptRef.current.trim();
      if (!speechSubmittedRef.current && question) {
        speechSubmittedRef.current = true;
        if (inputRef.current) inputRef.current.value = question;
        void submit(question);
      }
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    setSpeechStatus('Listeningâ€¦');
    try { recognition.start(); } catch { stopRecognition(); setSpeechStatus('Speech recognition failed. You can still type a question.'); }
  };

  const toggleRecognition = () => {
    if (isListening) stopRecognition();
    else startRecognition();
  };
  useEffect(() => () => {
    controllerRef.current?.abort();
    recognitionRef.current?.abort();
    stopSpeaking();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const fallback = (question: string) => {
    if (!specimen) return 'Choose a specimen before asking a question.';
    if (specimen.kind === 'ingested') {
      const node = specimen.nodes.find((candidate) => candidate.id === selectedNodeId) ?? specimen.nodes[0];
      return node ? `${node.name} has a rot score of ${node.rotScore}. ${node.findings[0] ?? 'Review its connected dependencies before changing it.'}` : 'No file is selected yet.';
    }
    const answers = PRESET_FALLBACK_ANSWERS[specimen.id];
    const exact = answers.find((item) => item.question === question);
    if (exact) return exact.answer;
    const referenced = answers.find((item) => item.question.split(' ').some((word) => word.length > 5 && question.toLowerCase().includes(word.toLowerCase().replace(/[^a-z0-9_.-]/gi, ''))));
    return (referenced ?? answers[0]).answer;
  };

  const submit = async (rawQuestion: string) => {
    if (!specimen) return;
    const question = rawQuestion.trim().slice(0, 500);
    if (!question) return;
    setChatOpen(true);
    stopSpeaking();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setTranscript(`${question}\n\nThinkingâ€¦`);
    setThinking(true);
    try {
      const response = await fetch('/api/seance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildSeanceRequest(question, selectedNodeId, specimen)), signal: controller.signal });
      const payload = await response.json() as SeanceResponse;
      if (!response.ok || !payload.success || !payload.data || typeof payload.data.answer !== 'string') throw new Error('seance_failed');
      const spotlight = filterSpotlight(payload.data, specimen);
      onSpotlight(spotlight);
      setTranscript(`${question}\n\n${payload.data.answer}`);
      speakReply(payload.data.answer, payload.data.audioBase64);
    } catch {
      if (controller.signal.aborted) return;
      const answer = fallback(question);
      setTranscript(`${question}\n\n${answer}`);
      speakReply(answer);
    } finally {
      window.clearTimeout(timeout);
      if (controllerRef.current === controller) { controllerRef.current = null; setThinking(false); }
    }
  };

  return <section aria-labelledby="seance-title" className={`absolute bottom-4 left-1/2 z-10 w-[min(580px,calc(100%-24px))] -translate-x-1/2 ${chatOpen ? 'max-h-[min(520px,calc(100%-24px))]' : ''}`}>
    <div className="acctual-window rounded-2xl border border-hairline bg-white/95 shadow-[0_12px_30px_rgba(17,17,19,0.10)] backdrop-blur-md">
      <h2 id="seance-title" className="sr-only">Seance console</h2>
      {chatOpen && <div className="flex items-center justify-between border-b border-hairline px-4 py-2"><span className="font-mono text-[10px] text-muted">CODE ARCHAEOLOGIST</span><button type="button" onClick={() => setChatOpen(false)} aria-label="Collapse chat" className="rounded-full p-1 text-muted hover:bg-surface hover:text-ink"><ChevronDown size={15} /></button></div>}
      {chatOpen && <div className="max-h-52 overflow-y-auto px-4 pt-3"><p aria-live="polite" className="whitespace-pre-line text-[13px] leading-relaxed text-ink">{transcript}</p>{speechStatus && <p role="status" className="mt-1 font-mono text-[10px] text-muted">{speechStatus}</p>}</div>}
      {chatOpen && <div className="flex flex-wrap gap-1.5 px-4 pt-3" aria-label="Quick questions">{(specimen ? quickQuestions(specimen) : []).map(({ question }) => <button key={question} type="button" onClick={() => { if (inputRef.current) inputRef.current.value = question; void submit(question); }} className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[10px] font-medium text-ink hover:bg-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">{question}</button>)}</div>}
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit(inputRef.current?.value ?? ''); }} onFocus={() => setChatOpen(true)} className={`flex h-16 items-center gap-2 px-3 ${chatOpen ? 'border-t border-hairline' : ''}`}>
        <label htmlFor="seance-question" className="sr-only">Ask a question</label><input ref={inputRef} id="seance-question" name="seance-question" type="text" className="min-w-0 flex-1 bg-transparent px-2 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-skyAccent" placeholder="Ask the code archaeologist…" />
        <button type="submit" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-[11px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent" aria-label="Send question">↵</button><button type="button" onClick={toggleRecognition} disabled={!speechRecognition && !isListening} aria-label={isListening ? 'Listening…' : 'Ask by voice'} aria-pressed={isListening} title={speechRecognition ? (isListening ? 'Stop listening' : 'Ask by voice') : 'Voice input is not supported in this browser'} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-hairline text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"><Mic size={15} aria-hidden="true" /></button><button type="button" onClick={stopSpeaking} disabled={!isSpeaking} aria-label="Mute and stop voice" className="flex h-9 shrink-0 items-center justify-center rounded-xl border border-hairline px-2 text-[10px] text-muted disabled:opacity-40">{isSpeaking ? 'Mute' : 'Voice'}</button><div className={`flex items-center gap-1 px-1 ${isSpeaking ? 'is-speaking' : ''}`} aria-label="Speech waveform" aria-hidden="true">{[2, 3.5, 5, 3, 4, 2.5, 4].map((height, index) => <span key={index} className="wave-bar w-0.5 bg-ink" style={{ height: `${height * 3}px` }} />)}</div>
      </form>
    </div>
  </section>;
}

