'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/ui';

interface CodeBlockProps {
  code: string;
  title?: string;
  highlightRange?: { start: number; end: number } | null;
  startLine?: number;
  className?: string;
}

/** Compact code-block primitive with line numbers, copy, scrolling, and highlighted range. */
export function CodeBlock({ code, title, highlightRange, startLine = 1, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const lines = React.useMemo(() => code.split(/\r\n|\r|\n/), [code]);
  const copy = async () => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-surface', className)}>
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-hairline bg-surface px-3">
        <span className="truncate font-mono text-[10px] text-muted">{title ?? 'Source code'}</span>
        <button type="button" onClick={copy} aria-label="Copy code" className="rounded p-1 text-muted hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre tabIndex={0} className="flex-1 overflow-auto py-2 font-mono text-[11px] leading-5" dir="ltr">
        <code>{lines.map((line, index) => {
          const lineNumber = startLine + index;
          const isHighlighted = Boolean(highlightRange && lineNumber >= highlightRange.start && lineNumber <= highlightRange.end);
          return (
            <span
              key={lineNumber}
              data-line={lineNumber}
              className={cn(
                'flex min-w-max px-3 transition-colors',
                isHighlighted && 'bg-amber/20 font-medium text-amber-950 border-l-2 border-amber pl-[10px]'
              )}
            >
              <span aria-hidden="true" className={cn('mr-4 w-9 select-none text-right font-mono text-[10px]', isHighlighted ? 'font-semibold text-amber' : 'text-muted/60')}>
                {lineNumber}
              </span>
              <span className="text-ink">{line || ' '}</span>
            </span>
          );
        })}</code>
      </pre>
    </div>
  );
}
