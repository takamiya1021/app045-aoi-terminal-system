'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ClientMessage, ServerMessage } from '@/lib/types';

interface UseWebSocketOptions {
  onMessage?: (message: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (event: Event) => void;
}

interface UseWebSocketReturn {
  ws: WebSocket | null;
  isConnected: boolean;
  error: Event | null;
  sendMessage: (message: ClientMessage) => void;
}

export const useWebSocket = (url: string, options?: UseWebSocketOptions): UseWebSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  // 最新のコールバックを常に参照できるようにrefを使用
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not open. Message not sent:', message);
    }
  }, []);

  useEffect(() => {
    if (!url) return; // URLが空の場合は接続しない

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      optionsRef.current?.onOpen?.();
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const parsedMessage: ServerMessage = JSON.parse(event.data);
        optionsRef.current?.onMessage?.(parsedMessage);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e, event.data);
      }
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      optionsRef.current?.onClose?.();
      console.log('WebSocket disconnected', event);
    };

    ws.onerror = (event) => {
      setError(event);
      optionsRef.current?.onError?.(event);
      console.error('WebSocket error', event);
    };

    return () => {
      ws.close();
    };
  }, [url]); // urlが変わったときだけ再接続

  return { ws: wsRef.current, isConnected, error, sendMessage };
};
