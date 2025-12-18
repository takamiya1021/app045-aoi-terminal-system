'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  initialCols?: number;
  initialRows?: number;
}

interface UseTerminalReturn {
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
  terminalRef: (node: HTMLDivElement | null) => void; // Callback ref
}

export const useTerminal = (options?: UseTerminalOptions): UseTerminalReturn => {
  const [terminalContainer, setTerminalContainer] = useState<HTMLDivElement | null>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);

  const { onData, onResize, initialCols = 80, initialRows = 24 } = options || {};

  const terminalRef = useCallback((node: HTMLDivElement | null) => {
    setTerminalContainer(node);
  }, []);

  useEffect(() => {
    if (terminalContainer && !xtermInstance.current) { // Check terminalContainer instead of terminalRef.current
      const terminal = new Terminal({
        fontFamily: '"Cascadia Code PL", Consolas, "Courier New", monospace',
        fontSize: 14,
        cursorBlink: true,
        cols: initialCols,
        rows: initialRows,
        theme: {
          background: '#0D0D0D', // 濃い背景色
          foreground: '#F0F0F0', // 明るい文字色
          cursor: '#F0F0F0',
          selectionBackground: '#666666',
          black: '#000000',
          red: '#E06C75',
          green: '#98C379',
          yellow: '#E5C07B',
          blue: '#61AFEF',
          magenta: '#C678DD',
          cyan: '#56B6C2',
          white: '#ABB2BF',
          brightBlack: '#636D83',
          brightRed: '#E06C75',
          brightGreen: '#98C379',
          brightYellow: '#E5C07B',
          brightBlue: '#61AFEF',
          brightMagenta: '#C678DD',
          brightCyan: '#56B6C2',
          brightWhite: '#FFFFFF',
        },
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.open(terminalContainer); // Use terminalContainer here
      fitAddon.fit();

      terminal.onData((data) => {
        onData?.(data);
      });

      terminal.onResize((size) => {
        onResize?.(size.cols, size.rows);
      });

      xtermInstance.current = terminal;
      fitAddonInstance.current = fitAddon;

      const handleResize = () => {
        fitAddon.fit();
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        terminal.dispose();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalContainer, initialCols, initialRows]); 

  return {
    terminal: xtermInstance.current,
    fitAddon: fitAddonInstance.current,
    terminalRef,
  };
};