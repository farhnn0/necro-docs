'use client';

import { FormEvent, type CSSProperties, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Focus,
  Gauge,
  GitBranch,
  GitFork,
  Mic,
  Network,
} from 'lucide-react';
import { scrollyStep, workspaceTargetHref } from '@/lib/conversion/helpers';

const walkthroughSteps = [
  ['01 · Repository input', 'Paste any GitHub repository URL', 'Drop a public repository link. Necro-Docs fetches the file tree via REST API in milliseconds without cloning to disk.'],
  ['02 · Dependency analysis', 'Map imports & calculate code-rot', 'Every import and database call is wired into a directional graph while each file receives a 0–100 structural decay score.'],
  ['03 · Weakness isolation', 'Spot brittle logic & silent failures', 'High-risk hotspots surface immediately with exact line diagnostics—exposing swallowed exceptions and unguarded writes.'],
  ['04 · Voice & AI explanation', 'Ask aloud, hear the blast radius', 'Interrogate the fragile module by voice while the AI Archaeologist explains downstream impact in plain language.'],
] as const;

const presets = [
  ['payment', '74% infected · TypeScript', 'legacy-payment-monolith', 'Multi-currency billing service with unguarded SQL writes and swallowed conversion exceptions.', 'text-crimson'],
  ['scraper', '58% infected · Python', 'async-crawler-worker', 'Distributed queue consumer with shared mutable session state and unbounded retry loops.', 'text-amber'],
  ['realtime', '26% infected · Node.js', 'edge-socket-relay', 'Clean WebSocket pub/sub broker with isolated heartbeat cleanup and well-typed payloads.', 'text-emerald'],
] as const;

function WorkspaceLink({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <a href={workspaceTargetHref({ kind: 'preset', id: 'payment' })} className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent`}>{children}</a>;
}

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      frame.current = null;
      const section = document.getElementById('live-walkthrough');
      if (!section) return;
      const range = section.offsetHeight - window.innerHeight;
      if (range <= 0) return;
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const nextProgress = Math.max(0, Math.min(1, (window.scrollY - sectionTop) / range));
      setProgress(nextProgress);
      setStep(scrollyStep(nextProgress));
    };
    const onScroll = () => {
      if (frame.current === null) frame.current = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  function submitRepo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('repository')?.toString().trim();
    window.location.href = workspaceTargetHref(value
      ? { kind: 'repository', repository: value }
      : { kind: 'preset', id: 'payment' });
  }

  return (
    <main className="min-h-screen bg-canvas font-sans text-ink">
      <header className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6">
        <a href="#top" className="font-display text-lg font-bold tracking-tight">Necro-Docs</a>
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex" aria-label="Primary navigation">
          <a href="#live-walkthrough" className="hover:text-ink">Workflow</a><a href="#capabilities" className="hover:text-ink">Capabilities</a><a href="#stages" className="hover:text-ink">Architecture</a>
        </nav>
        <WorkspaceLink className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-white hover:opacity-90">Launch canvas</WorkspaceLink>
      </header>

      <section id="top" className="relative overflow-hidden px-6 pb-24 pt-10">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-3 text-xs font-semibold text-skyAccent">Automated codebase archaeology</p>
          <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">Dissect legacy codebases<br />in minutes</h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">Map hidden module dependencies, surface structural decay scores, and interrogate fragile logic by voice before refactoring a single line.</p>
          <form onSubmit={submitRepo} aria-label="Audit a GitHub repository" className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-2 rounded-full border border-hairline bg-surface p-1.5 sm:flex-row">
            <label htmlFor="repository" className="sr-only">GitHub repository URL</label><input id="repository" name="repository" type="text" placeholder="github.com/acme-corp/legacy-payment-monolith" className="w-full flex-1 bg-transparent px-4 py-2 text-sm font-mono text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent" />
            <button type="submit" className="w-full shrink-0 rounded-full bg-ink px-6 py-2.5 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent sm:w-auto">Audit repository</button>
          </form>
          <div className="mt-7 flex flex-wrap justify-center gap-6 text-xs font-medium text-muted sm:gap-10"><span className="flex items-center gap-2"><GitFork size={14} className="text-ink" />Zero-clone GitHub tree scan</span><span className="flex items-center gap-2"><Activity size={14} className="text-ink" />File-level code-rot scoring</span><span className="flex items-center gap-2"><Mic size={14} className="text-ink" />Voice blast-radius queries</span></div>
        </div>
        <div className="relative mx-auto mt-14 max-w-5xl">
          <div aria-hidden="true" className="pointer-events-none absolute -left-14 top-10 hidden w-64 -rotate-6 rounded-2xl border border-hairline bg-surface p-5 font-mono text-[10px] leading-relaxed text-muted opacity-80 lg:block"><div className="mb-2 font-semibold text-ink">src/middleware/authGuard.ts</div><div>{"export async function verifySession(req) {"}</div><div className="pl-3">const raw = req.headers[&apos;x-legacy&apos;];</div><div className="pl-3">if (!raw) return fallbackGuest();</div><div className="pl-3 text-crimson">{'// TODO: remove bypass before v2'}</div><div className="pl-3">return decodeUnsafe(raw);</div><div>{'}'}</div></div>
          <div aria-hidden="true" className="pointer-events-none absolute -right-14 top-12 hidden w-64 rotate-6 rounded-2xl border border-hairline bg-surface p-5 font-mono text-[10px] leading-relaxed text-muted opacity-80 lg:block"><div className="mb-2 font-semibold text-ink">src/storage/dbLedger.ts</div><div>{"export async function forceInsert(tx) {"}</div><div className="pl-3">await pool.query(&apos;BEGIN&apos;);</div><div className="pl-3 text-crimson">{'// No idempotency check'}</div><div className="pl-3">return pool.query(SQL_WRITE, [tx]);</div><div>{'}'}</div></div>
          <div className="acctual-window relative z-10 mx-auto max-w-3xl rounded-3xl bg-white p-6 sm:p-8"><div className="flex items-center justify-between border-b border-hairline pb-5"><div><div className="font-mono text-xs text-muted">Specimen Report</div><div className="mt-0.5 font-display text-base font-bold">acme-corp / legacy-payment-monolith</div></div><WorkspaceLink className="rounded-full bg-surface px-4 py-2 text-xs font-medium hover:bg-hairline">Open interactive graph</WorkspaceLink></div><div className="grid grid-cols-1 gap-6 pt-6 sm:grid-cols-2"><div className="rounded-2xl border border-hairline bg-surface/70 p-5"><div className="mb-3 flex justify-between font-mono text-xs text-muted"><span>Primary Hotspot</span><span className="font-semibold text-crimson">94 / 100 rot</span></div><div className="font-mono text-sm font-semibold">src/billing/chargeEngine.ts</div><p className="mt-2 text-xs leading-relaxed text-muted">482 lines · Swallows currency conversion exceptions inside an empty catch block before committing ledger rows.</p><div className="mt-4 flex justify-between border-t border-hairline pt-3 font-mono text-[11px] text-muted"><span>Coupled modules</span><span className="font-medium text-ink">4 files</span></div></div><div className="rounded-2xl border border-hairline bg-surface/70 p-5"><div className="mb-3 flex justify-between font-mono text-xs text-muted"><span>Downstream Blast Radius</span><span className="font-semibold text-skyAccent">2 critical sinks</span></div><div className="space-y-2.5 font-mono text-xs"><div className="flex justify-between rounded-xl border border-hairline bg-white p-2.5"><span>src/storage/dbLedger.ts</span><span className="text-crimson">64 rot</span></div><div className="flex justify-between rounded-xl border border-hairline bg-white p-2.5"><span>src/events/webhookDispatcher.ts</span><span className="text-crimson">59 rot</span></div></div></div></div></div>
        </div>
      </section>

      <section className="px-6 py-12"><div className="mx-auto max-w-4xl rounded-3xl bg-surface p-8 text-center sm:p-12"><blockquote className="mx-auto max-w-2xl font-display text-xl font-semibold leading-snug sm:text-2xl">“Instead of spending three days tracing tangled imports by hand, we heard the exact blast radius of our billing service in twenty seconds.”</blockquote><div className="mt-4 font-mono text-xs text-muted">Staff Infrastructure Engineer · Legacy Migration Audit</div></div></section>

      <section id="live-walkthrough" className="relative h-[380vh] border-y border-hairline bg-surface/40"><div className="sticky top-0 flex min-h-screen items-center overflow-hidden px-6 py-8"><div className="mx-auto w-full max-w-5xl"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1.5 text-xs font-semibold text-skyAccent">Scroll to dissect</p><h2 className="font-display text-2xl font-bold leading-tight sm:text-4xl">From GitHub link to spoken clarity</h2></div><div className="flex items-center gap-3 font-mono text-xs text-muted"><span>{`0${step} / 04`}</span><div className="h-1 w-32 overflow-hidden rounded-full bg-hairline"><div className="h-full bg-ink transition-[width] duration-150 ease-out" style={{ width: `${Math.max(6, progress * 100)}%` }} /></div></div></div><div className="grid grid-cols-1 items-center gap-6 md:grid-cols-12 lg:gap-10"><ol className="space-y-4 md:col-span-5">{walkthroughSteps.map(([label, title, copy], index) => <li key={label} className={`scrolly-nav-item border-l-2 py-1 pl-4 ${step === index + 1 ? 'is-active border-ink' : 'border-hairline'}`} aria-current={step === index + 1 ? 'step' : undefined}><div className={`font-mono text-[11px] font-medium ${step === index + 1 ? 'text-skyAccent' : 'text-muted'}`}>{label}</div><h3 className="mt-0.5 font-display text-base font-bold sm:text-lg">{title}</h3><p className="mt-1 text-xs leading-relaxed text-muted">{copy}</p></li>)}</ol><div className="md:col-span-7"><div className="scrolly-window-wrapper" style={{ '--scrolly-lift': `${Math.sin(Math.min(1, Math.max(0, (progress * 4) % 1)) * Math.PI) * 5}px` } as CSSProperties}><div className="acctual-window relative h-[380px] overflow-hidden rounded-3xl bg-white sm:h-[405px]"><StagePanel step={step} /></div></div></div></div></div></div></section>

      <section id="capabilities" className="px-6 py-20"><div className="mx-auto max-w-5xl"><div className="mx-auto mb-14 max-w-xl text-center"><p className="mb-2 text-xs font-semibold text-skyAccent">Forensic capabilities</p><h2 className="font-display text-3xl font-bold sm:text-4xl">Built for engineers inheriting complex systems</h2></div><div className="grid grid-cols-1 gap-5 md:grid-cols-2">{[[Network,'Import & coupling graph','Parses ES modules, CommonJS, and Python imports into an interactive spatial blueprint without running untrusted code.'],[Gauge,'Automated decay scoring','Combines cyclomatic nesting depth, line volume, and comment density into a single 0–100 structural risk index.'],[Mic,'Spoken architecture queries','Ask questions out loud while inspecting a file. Answers are grounded strictly in the active module and its immediate neighbors.'],[Focus,'Camera-linked blast radius','When the AI identifies affected downstream files, the workspace automatically highlights and pans to every impacted node.']].map(([Icon,title,copy]) => <div key={String(title)} className="rounded-2xl border border-hairline bg-surface/70 p-6"><Icon size={20} className="mb-4" /><h3 className="font-display font-bold">{String(title)}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted">{String(copy)}</p></div>)}</div></div></section>

      <section id="stages" className="px-6 py-16"><div className="mx-auto max-w-5xl"><h2 className="mb-12 max-w-lg font-display text-3xl font-bold leading-tight sm:text-4xl">Three stages from raw URL to architectural certainty</h2><div className="grid grid-cols-1 gap-6 md:grid-cols-3">{[['01 · Tree ingestion','Fetch repository structure','Pulls core source files via the GitHub Git Trees endpoint with automatic branch detection.','GET /git/trees/main?recursive=1','24 source files indexed in 380ms'],['02 · Decay autopsy','Isolate fragile hotspots','Ranks every module by technical debt so you immediately know which files carry silent failure risk.','chargeEngine.ts · 94/100','Swallowed exception on line 142'],['03 · Voice interrogation','Converse with the codebase','Speak naturally to trace edge cases, database writes, and regression risks across connected modules.','“What breaks if I edit verifySession?”','2 downstream callers highlighted']].map(([label,title,copy,line,sub]) => <div key={label} className="flex flex-col justify-between"><div><div className="mb-2 font-mono text-xs font-semibold text-skyAccent">{label}</div><h3 className="font-display text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{copy}</p></div><div className="mt-6 flex h-36 flex-col justify-end rounded-2xl bg-surface p-4 font-mono text-[11px]"><div>{line}</div><div className="mt-1 text-muted">{sub}</div></div></div>)}</div></div></section>

      <section className="px-6 py-16"><div className="mx-auto max-w-5xl"><h2 className="font-display text-2xl font-bold sm:text-3xl">Load a sample specimen</h2><p className="mt-1 text-sm text-muted">Explore pre-indexed repositories directly in the interactive canvas.</p><div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">{presets.map(([id, meta, name, copy, color]) => <a key={id} href={workspaceTargetHref({ kind: 'preset', id })} className="rounded-2xl border border-hairline bg-surface p-6 text-left hover:bg-hairline/70"><div className={`font-mono text-xs font-semibold ${color}`}>{meta}</div><div className="mt-1.5 font-display font-bold">{name}</div><p className="mt-2 text-xs leading-relaxed text-muted">{copy}</p></a>)}</div></div></section>

      <section className="mt-auto px-6 py-14"><div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 rounded-3xl border border-hairline bg-surface p-8 sm:flex-row sm:items-center sm:p-12"><div><h2 className="font-display text-2xl font-bold sm:text-3xl">Ready to inspect your codebase?</h2><p className="mt-1 text-sm text-muted">Open the interactive graph workspace and test live voice interrogation.</p></div><WorkspaceLink className="shrink-0 rounded-full bg-ink px-6 py-3 text-xs font-semibold text-white">Open workspace</WorkspaceLink></div></section>
    </main>
  );
}

function StagePanel({ step }: { step: number }) {
  const panels = [
    <><PanelHeader left="Step 01 · GitHub Tree Ingestion" right="REST API · Ready" /><div className="my-auto space-y-4"><div className="scrolly-stagger scrolly-delay-1 flex items-center justify-between gap-3 rounded-2xl border border-ink/20 bg-surface p-3.5"><div className="flex min-w-0 items-center gap-2.5"><GitBranch size={16} /><span className="truncate font-mono text-xs">github.com/acme-corp/legacy-payment-monolith</span></div><span className="shrink-0 font-mono text-[11px] text-ink">Indexed</span></div><div className="grid grid-cols-2 gap-2.5 font-mono text-[11px]">{['src/server.ts · 112 LOC','src/authGuard.ts · 289 LOC','src/chargeEngine.ts · 482 LOC','src/dbLedger.ts · 340 LOC'].map((file, index) => <div key={file} className={`scrolly-stagger scrolly-delay-${Math.min(index + 2, 4)} rounded-xl border border-hairline bg-white p-3`}>{file}</div>)}</div></div><PanelFooter left="Branch: main" right="6 core files extracted in 0.4s" /></>,
    <><PanelHeader left="Step 02 · AST Dependency Graph" right="4 edges resolved" /><div className="scrolly-stagger scrolly-delay-1 paper-grid my-auto rounded-2xl border border-hairline p-4"><svg viewBox="0 0 460 175" className="h-44 w-full" aria-label="Dependency graph illustration"><path className="draw-wire" d="M 132 45 C 175 45, 175 88, 212 88" fill="none" stroke="currentColor" strokeWidth="1.5" /><path className="draw-wire" d="M 132 130 C 175 130, 175 88, 212 88" fill="none" stroke="currentColor" strokeWidth="1.5" /><path className="draw-wire" d="M 336 88 C 365 88, 365 45, 388 45" fill="none" stroke="#E11D48" strokeWidth="1.8" /><path className="draw-wire" d="M 336 88 C 365 88, 365 130, 388 130" fill="none" stroke="#D97706" strokeWidth="1.8" /><rect x="8" y="26" width="124" height="38" rx="10" fill="white" stroke="#E8E9ED" /><text x="20" y="49" fontFamily="monospace" fontSize="10" fill="#111113">authGuard.ts · 78</text><rect x="8" y="111" width="124" height="38" rx="10" fill="white" stroke="#E8E9ED" /><text x="20" y="134" fontFamily="monospace" fontSize="10" fill="#111113">payRouter.ts · 48</text><rect x="212" y="64" width="124" height="48" rx="12" fill="white" stroke="#E11D48" strokeWidth="1.5" /><text x="224" y="85" fontFamily="monospace" fontSize="10" fontWeight="600" fill="#111113">chargeEngine.ts</text><text x="224" y="100" fontFamily="monospace" fontSize="9" fill="#E11D48">94 rot score</text><rect x="388" y="26" width="64" height="38" rx="10" fill="white" stroke="#E8E9ED" /><text x="396" y="49" fontFamily="monospace" fontSize="9" fill="#111113">dbLedger</text><rect x="388" y="111" width="64" height="38" rx="10" fill="white" stroke="#E8E9ED" /><text x="396" y="134" fontFamily="monospace" fontSize="9" fill="#111113">webhook</text></svg></div><PanelFooter left="Central coupling hub detected" right="chargeEngine.ts (94/100)" /></>,
    <><PanelHeader left="src/billing/chargeEngine.ts" right="94 / 100 · Critical Decay" /><div className="my-auto space-y-3.5"><div className="scrolly-stagger scrolly-delay-1 rounded-2xl border border-hairline bg-surface p-3.5 font-mono text-[11px] leading-relaxed"><div className="text-muted">try {'{'}</div><div className="pl-3">amt = await convertRateUnsafe(amt, curr);</div><div className="text-crimson">{' } catch (e) {'}{' /* silent fail — swallowed error */'}</div><div className="pl-3">return await dbLedger.forceInsert({'{ uid, amt }'});</div></div><div className="scrolly-stagger scrolly-delay-2 border-l-2 border-crimson pl-3 text-xs"><span className="font-medium">Flaw 01:</span> Empty catch block masks failed currency conversion before SQL write.</div><div className="scrolly-stagger scrolly-delay-3 border-l-2 border-hairline pl-3 text-xs text-muted"><span className="font-medium text-ink">Flaw 02:</span> Zero rollback guard between dbLedger and webhookDispatcher.</div></div><PanelFooter left="2 structural weaknesses isolated" right="Ready for voice query" /></>,
    <><PanelHeader left="Step 04 · Live Voice Séance" right="Voice synthesis synced" /><div className="my-auto space-y-4"><div className="scrolly-stagger scrolly-delay-1 rounded-2xl border border-hairline bg-surface p-3.5"><div className="mb-1 font-mono text-[10px] text-muted">Developer Voice Prompt</div><p className="text-xs font-medium">“What breaks if I refactor the error handling inside chargeEngine.ts?”</p></div><div className="scrolly-stagger scrolly-delay-2 rounded-2xl border border-ink/25 bg-white p-4"><div className="mb-1.5 flex justify-between font-mono text-[10px] text-skyAccent"><span>Code Archaeologist · Grounded AI</span><span>2 downstream files spotlighted</span></div><p className="text-xs leading-relaxed">Because <span className="font-mono font-medium">chargeEngine.ts</span> currently swallows conversion errors, throwing an explicit exception will halt <span className="font-mono font-medium">dbLedger.ts</span> and prevent <span className="font-mono font-medium">webhookDispatcher.ts</span> from firing duplicate receipts.</p></div></div><PanelFooter left="Camera synced to blast radius" right="Try in full canvas" /></>,
  ];
  return <>{panels.map((panel, index) => <div key={index} className={`scrolly-stage-layer acctual-window flex h-full flex-col justify-between p-6 sm:p-8 ${step === index + 1 ? 'is-active' : ''}`} aria-hidden={step !== index + 1}>{panel}</div>)}</>;
}

function PanelHeader({ left, right }: { left: string; right: string }) { return <div className="flex justify-between border-b border-hairline pb-3.5 font-mono text-xs text-muted"><span>{left}</span><span className="text-ink">{right}</span></div>; }
function PanelFooter({ left, right }: { left: string; right: string }) { return <div className="flex justify-between border-t border-hairline pt-3 font-mono text-xs text-muted"><span>{left}</span><span className="text-ink">{right}</span></div>; }
