'use client';

import * as React from 'react';
import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/ui';

export const toast = ToastPrimitive.createToastManager();

export interface ToastItemProps {
  toast: ToastPrimitive.Root.ToastObject<any>;
}

function ToastItem({ toast: item }: ToastItemProps) {
  const type = item.type;

  const icon = type === 'success' ? (
    <CheckCircle2 size={16} className="shrink-0 text-emerald mt-0.5" aria-hidden="true" />
  ) : type === 'warning' ? (
    <AlertTriangle size={16} className="shrink-0 text-amber mt-0.5" aria-hidden="true" />
  ) : type === 'error' ? (
    <AlertCircle size={16} className="shrink-0 text-crimson mt-0.5" aria-hidden="true" />
  ) : type === 'info' ? (
    <Info size={16} className="shrink-0 text-skyAccent mt-0.5" aria-hidden="true" />
  ) : null;

  return (
    <ToastPrimitive.Root
      toast={item}
      className={cn(
        'toast-root pointer-events-auto relative flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-[#18181b] p-3.5 sm:p-4 text-zinc-100 shadow-2xl shadow-black/60 backdrop-blur-xl transition-all select-none',
        'data-[ending-style]:opacity-0 data-[ending-style]:-translate-y-3'
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        {icon}
        <div className="flex-1 min-w-0 pr-1">
          {item.title && (
            <ToastPrimitive.Title className="text-[13px] font-semibold text-white tracking-tight leading-snug">
              {item.title}
            </ToastPrimitive.Title>
          )}
          {item.description && (
            <ToastPrimitive.Description className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              {item.description}
            </ToastPrimitive.Description>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {item.actionProps && (
          <button
            type="button"
            {...item.actionProps}
            className="inline-flex h-7 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/90 px-2.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
          />
        )}
        <ToastPrimitive.Close
          aria-label="Close notification"
          className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
        >
          <X size={14} />
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  );
}

function ToastQueue() {
  const manager = ToastPrimitive.useToastManager();

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex max-h-screen w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5 pointer-events-none p-2 sm:p-0">
        {manager.toasts.map((item) => (
          <ToastItem key={item.id} toast={item} />
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

export function Toaster({ timeout = 4500 }: { timeout?: number }) {
  return (
    <ToastPrimitive.Provider toastManager={toast} timeout={timeout}>
      <ToastQueue />
    </ToastPrimitive.Provider>
  );
}
