'use client';

import React, { useEffect, useState } from 'react';
import OfflineIndicator from './OfflineIndicator';

interface LayoutProps {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}

type RuntimeErrorEntry = {
  id: number;
  message: string;
  stack?: string;
  source?: string;
  time: string;
};

const Layout: React.FC<LayoutProps> = ({ children, headerRight }) => {
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeErrorEntry[]>([]);
  const [isErrorOpen, setIsErrorOpen] = useState(false);
  const lastErrorSignatureRef = React.useRef<string | null>(null);
  const lastErrorTimeRef = React.useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateHeight = () => {
      const vv = window.visualViewport;
      const next = Math.round(vv?.height ?? window.innerHeight);
      if (Number.isFinite(next) && next > 0) {
        setViewportHeight(next);
      }
    };

    updateHeight();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateHeight);
    vv?.addEventListener('scroll', updateHeight);
    window.addEventListener('resize', updateHeight);

    return () => {
      vv?.removeEventListener('resize', updateHeight);
      vv?.removeEventListener('scroll', updateHeight);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nowId = () => Math.floor(Math.random() * 1_000_000_000);

    const addError = (entry: RuntimeErrorEntry) => {
      // 同一エラーが短時間に連発するのを抑制
      const signature = `${entry.message}|${entry.source || ''}|${entry.stack || ''}`;
      const now = Date.now();
      if (lastErrorSignatureRef.current === signature && now - lastErrorTimeRef.current < 1500) {
        return;
      }
      lastErrorSignatureRef.current = signature;
      lastErrorTimeRef.current = now;
      setRuntimeErrors((prev) => [...prev, entry]);
    };

    const onError = (event: ErrorEvent) => {
      const message = event.message || 'Unknown runtime error';
      addError({
        id: nowId(),
        message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
        time: new Date().toLocaleTimeString(),
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection';
      addError({
        id: nowId(),
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        time: new Date().toLocaleTimeString(),
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <div
      className="flex flex-col h-[100dvh] bg-gray-900 text-gray-100"
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
      <OfflineIndicator />
      <header className="flex-none p-4 bg-gray-800 border-b border-gray-700 flex flex-nowrap items-center justify-between gap-3 min-w-0">
        <h1 className="text-xl font-bold text-orange-400 whitespace-nowrap flex-shrink-0">Aoi-Terminals</h1>
        {headerRight ? <div className="flex items-center gap-2 flex-shrink-0">{headerRight}</div> : null}
      </header>

      <main className="flex-grow overflow-hidden relative">
        {children}
      </main>

      <footer className="flex-none p-2 bg-gray-800 border-t border-gray-700 text-xs text-center text-gray-500">
        &copy; 2025 Aoi-Terminals
      </footer>

      {runtimeErrors.length > 0 && (
        <div className="fixed bottom-3 left-3 z-50 flex flex-col items-start">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md bg-red-600 text-white text-xs font-bold px-2.5 py-1 shadow-lg"
            onClick={() => setIsErrorOpen((prev) => !prev)}
          >
            <span>!</span>
            <span>{runtimeErrors.length} error</span>
          </button>
          {isErrorOpen && (
            <div className="mt-2 w-80 max-h-64 overflow-auto rounded-md border border-red-500/40 bg-slate-950/95 text-slate-100 text-xs shadow-xl">
              <div className="flex items-center justify-between px-2 py-2 border-b border-red-500/30">
                <div className="font-bold text-red-200">Runtime Errors</div>
                <button
                  type="button"
                  className="text-red-200 hover:text-white"
                  onClick={() => setRuntimeErrors([])}
                >
                  Clear
                </button>
              </div>
              <ul className="space-y-2 p-2">
                {runtimeErrors.map((err) => (
                  <li key={err.id} className="rounded bg-red-500/10 border border-red-500/20 p-2">
                    <div className="text-red-200 font-bold">{err.message}</div>
                    {err.source ? <div className="text-red-300">{err.source}</div> : null}
                    {err.stack ? <pre className="mt-1 whitespace-pre-wrap text-[10px] text-red-100/80">{err.stack}</pre> : null}
                    <div className="mt-1 text-[10px] text-red-200/70">{err.time}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Layout;
