'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

type IncomingChunk = {
  seq: number;
  data: string;
};

interface TerminalComponentProps {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  // NOTE:
  // - WebSocketの出力は短時間に大量のチャンクが来る（ls等）。
  // - React stateで「最後の1チャンクだけ」渡すと、バッチ処理で中間チャンクが落ちることがある。
  // - なので “tick + drain” 方式でまとめて書き込む。
  incomingData?: IncomingChunk | null; // backward compat
  incomingTick?: number;
  drainIncoming?: () => string[];
}

const TerminalComponent: React.FC<TerminalComponentProps> = ({ onData, onResize, incomingData, incomingTick, drainIncoming }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const pendingData = useRef<string[]>([]);
  const isComposingRef = useRef(false);
  const onDataRef = useRef<TerminalComponentProps['onData']>(onData);
  const onResizeRef = useRef<TerminalComponentProps['onResize']>(onResize);
  const lastReportedSize = useRef<{ cols: number; rows: number } | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    if (incomingData?.data) {
      if (xtermInstance.current) {
        xtermInstance.current.write(incomingData.data);
      } else {
        pendingData.current.push(incomingData.data);
      }
    }
  }, [incomingData]);

  useEffect(() => {
    if (!incomingTick) return;
    const chunks = drainIncoming?.() ?? [];
    if (chunks.length === 0) return;

    if (xtermInstance.current) {
      for (const chunk of chunks) xtermInstance.current.write(chunk);
    } else {
      pendingData.current.push(...chunks);
    }
  }, [incomingTick, drainIncoming]);

  useLayoutEffect(() => {
    const container = terminalRef.current;
    if (!container || xtermInstance.current) return;

    let disposed = false;
    let rafId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const safeFitAndReportSize = () => {
      const term = xtermInstance.current;
      const fit = fitAddonInstance.current;
      const el = terminalRef.current;
      if (!term || !fit || !el || disposed) return;
      if (!el.isConnected) return;

      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;

      try {
        fit.fit();
      } catch (error) {
        console.warn('xterm.js fit skipped due to container/renderer state:', error);
        return;
      }

      const nextSize = { cols: term.cols, rows: term.rows };
      const lastSize = lastReportedSize.current;
      if (!lastSize || lastSize.cols !== nextSize.cols || lastSize.rows !== nextSize.rows) {
        lastReportedSize.current = nextSize;
        onResizeRef.current?.(nextSize.cols, nextSize.rows);
      }
    };

    console.log('Initializing xterm.js...');
    const terminal = new Terminal({
      cursorBlink: true,
      theme: { background: '#0F172A', foreground: '#F3F4F6' },
      convertEol: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(container);

    xtermInstance.current = terminal;
    fitAddonInstance.current = fitAddon;

    const dataDisposable = terminal.onData((data) => onDataRef.current?.(data));

    // 初回表示のタイミングを安定させる（レイアウト確定後にfit/focus）
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(() => {
        safeFitAndReportSize();
        terminal.focus();
      });
    } else {
      timeoutId = setTimeout(() => {
        safeFitAndReportSize();
        terminal.focus();
      }, 0);
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => safeFitAndReportSize());
      observer.observe(container);
      resizeObserverRef.current = observer;
    }

    // バッファ放出（open後にまとめて書く）
    if (pendingData.current.length > 0) {
      for (const data of pendingData.current) terminal.write(data);
      pendingData.current = [];
    }

    console.log('xterm.js initialized and open.');

    return () => {
      disposed = true;
      dataDisposable.dispose();
      if (rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      if (timeoutId !== null) clearTimeout(timeoutId);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      terminal.dispose();
      xtermInstance.current = null;
      fitAddonInstance.current = null;
      lastReportedSize.current = null;
    };
  }, []);

  return (
    <div
      ref={terminalRef}
      className="w-full h-full min-h-[300px]"
      data-testid="xterm-terminal"
      onCompositionStart={() => {
        // IME: xterm内部のtextareaからcompositionイベントがbubbleすることがある
        isComposingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        // NOTE: IME入力が xterm の onData に流れない環境があるため、保険で拾う
        if (!isComposingRef.current) return;
        isComposingRef.current = false;
        const text = (e as unknown as CompositionEvent).data;
        if (typeof text === 'string' && text.length > 0) onDataRef.current?.(text);
      }}
    />
  );
};

export default TerminalComponent;
