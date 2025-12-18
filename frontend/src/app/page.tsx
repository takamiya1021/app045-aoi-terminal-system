'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Layout from '../components/Layout';
import ControlPanel from '../components/ControlPanel';
import TmuxPanel from '../components/TmuxPanel';
import { useWebSocket } from '../hooks/useWebSocket';
import TextInputModal from '../components/TextInputModal'; // For mobile IME or special inputs
import ShareLinkModal from '../components/ShareLinkModal';

// Dynamically import TerminalComponent with ssr: false
const TerminalComponent = dynamic(() => import('../components/Terminal'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-950 flex items-center justify-center text-gray-500">Loading Terminal...</div>,
});

export default function Home() {
  const [showTextInputModal, setShowTextInputModal] = useState(false);
  const [initialTextInputValue, setInitialTextInputValue] = useState('');
  const incomingBufferRef = useRef<string[]>([]);
  const [incomingTick, setIncomingTick] = useState(0);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authTokenInput, setAuthTokenInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [wsErrorMessage, setWsErrorMessage] = useState<string | null>(null);

  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareQrDataUrl, setShareQrDataUrl] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<number | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // ブラウザから直接バックエンド(3102)へ接続
  const [wsUrl, setWsUrl] = useState('');

  const backendHttpBase = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `http://${window.location.hostname}:3102`;
  }, []);

  const backendWsUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${window.location.hostname}:3102`;
  }, []);

  const checkSession = useCallback(async () => {
    if (!backendHttpBase) return;
    try {
      const res = await fetch(`${backendHttpBase}/session`, { credentials: 'include' });
      setIsAuthenticated(res.ok);
    } catch {
      setIsAuthenticated(false);
    }
  }, [backendHttpBase]);

  const login = useCallback(
    async (token: string, opts?: { clearUrlToken?: boolean }) => {
      if (!backendHttpBase) return;
      setIsAuthBusy(true);
      setAuthError(null);
      try {
        const res = await fetch(`${backendHttpBase}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          setIsAuthenticated(false);
          setAuthError('トークンが違うで。もう一回確認してな。');
          return;
        }

        setIsAuthenticated(true);

        if (opts?.clearUrlToken && typeof window !== 'undefined') {
          // URLにトークンを残さない（/??token=... の互換だけ残す）
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch {
        setIsAuthenticated(false);
        setAuthError('認証サーバに繋がらへんかった（バックエンド起動してる？）');
      } finally {
        setIsAuthBusy(false);
      }
    },
    [backendHttpBase]
  );

  useEffect(() => {
    // 互換: 旧URL（/?token=...）
    // - one-time token をURLに載せるので、成功したら即URLから消す
    // - Next dev (StrictMode) は mount/unmount を挟むことがあるため、
    //   “/auth を多重実行しない + /session を短時間ポーリング” で二重実行に耐える
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken && urlToken.trim() !== '') {
      setAuthTokenInput(urlToken);

      void (async () => {
        if (!backendHttpBase) return;

        const pollSession = async (timeoutMs: number) => {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            try {
              const res = await fetch(`${backendHttpBase}/session`, { credentials: 'include' });
              if (res.ok) return true;
            } catch {
              // ignore and retry
            }
            await new Promise((r) => setTimeout(r, 250));
          }
          return false;
        };

        // まず既存セッションがあればそれでOK（token再消費しない）
        if (await pollSession(250)) {
          setIsAuthenticated(true);
          window.history.replaceState(null, '', window.location.pathname);
          return;
        }

        // StrictMode remount対策: 同じtokenで /auth を多重発火しない
        const attemptKey = `its:url-token-attempted:${urlToken}`;
        const alreadyAttempted = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(attemptKey) === '1';
        if (!alreadyAttempted) {
          try {
            sessionStorage.setItem(attemptKey, '1');
          } catch {
            // ignore
          }

          // /auth を投げる（結果で cookie がセットされる）
          try {
            const res = await fetch(`${backendHttpBase}/auth`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ token: urlToken }),
            });

            if (!res.ok) {
              setIsAuthenticated(false);
              setAuthError('トークンが違うか、期限切れやで。');
              return;
            }

            // ここまで来たら cookie セットが成功している前提で、UX優先で先に通す。
            // もし cookie が反映されてへんかったら、後段の /session 確認 or WS 側で弾かれて気付ける。
            setIsAuthenticated(true);
            setAuthError(null);
            window.history.replaceState(null, '', window.location.pathname);
          } catch {
            setIsAuthenticated(false);
            setAuthError('認証サーバに繋がらへんかった（バックエンド起動してる？）');
            return;
          }
        }

        // cookie が反映されるまで少し待ってから最終確定する（失敗時はログイン画面へ戻す）
        const ok = await pollSession(10000);
        if (!ok) {
          setIsAuthenticated(false);
          setAuthError('認証に失敗したで（もう一回リンクを作り直してみてな）');
          return;
        }

        setIsAuthenticated(true);
        setAuthError(null);
        window.history.replaceState(null, '', window.location.pathname);
        try {
          sessionStorage.removeItem(attemptKey);
        } catch {
          // ignore
        }
      })();

      return;
    }

    void checkSession();
  }, [checkSession, login]);

  useEffect(() => {
    setWsUrl(isAuthenticated ? backendWsUrl : '');
  }, [backendWsUrl, isAuthenticated]);

  const { sendMessage } = useWebSocket(wsUrl, {
    onMessage: (message) => {
      if (message.type === 'output') {
        incomingBufferRef.current.push(message.data);
        setIncomingTick((t) => t + 1);
      }
      if ((message as any).type === 'error') {
        // バックエンド側が認証エラー等でcloseする前に送ってくるやつ
        setWsErrorMessage((message as any).message || 'WebSocket error');
      }
      console.log('Received from WS:', message);
    },
    onOpen: () => {
      setWsErrorMessage(null);
      console.log('WebSocket connection opened');
    },
    onClose: () => console.log('WebSocket connection closed'),
    onError: (event) => console.error('WebSocket error:', event),
  });

  const drainIncoming = useCallback(() => {
    const chunks = incomingBufferRef.current;
    incomingBufferRef.current = [];
    return chunks;
  }, []);

  const handleTerminalData = useCallback((data: string) => {
    sendMessage({ type: 'input', data: data });
  }, [sendMessage]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    sendMessage({ type: 'resize', cols: cols, rows: rows });
  }, [sendMessage]);

  const handleControlPanelKey = useCallback((key: string) => {
    sendMessage({ type: 'input', data: key });
  }, [sendMessage]);

  const handleTmuxCommand = useCallback((command: string, args?: string[]) => {
    sendMessage({ type: 'tmux-command', command, args });
  }, [sendMessage]);

  const handleTextInputModalSubmit = useCallback((value: string) => {
    sendMessage({ type: 'input', data: value });
    setShowTextInputModal(false);
  }, [sendMessage]);

  const generateShareLink = useCallback(async () => {
    if (!backendHttpBase) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const res = await fetch(`${backendHttpBase}/link-token`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setShareError(json?.message || 'リンク発行に失敗したで');
        return;
      }

      const token = String(json.token || '');
      const expiresAt = Number(json.expiresAt || 0);
      if (!token) {
        setShareError('トークンが空やった…');
        return;
      }

      const url = `${window.location.origin}/?token=${encodeURIComponent(token)}`;
      setShareUrl(url);
      setShareExpiresAt(Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null);

      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      setShareQrDataUrl(dataUrl);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e));
    } finally {
      setShareBusy(false);
    }
  }, [backendHttpBase]);

  const openTextInput = useCallback(() => {
    setInitialTextInputValue('');
    setShowTextInputModal(true);
  }, []);

  return (
    <Layout
      headerRight={
        isAuthenticated ? (
          <button
            onClick={() => setIsShareOpen(true)}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-md shadow"
          >
            Share (QR)
          </button>
        ) : null
      }
    >
      <div className="flex flex-col h-full bg-slate-900 min-h-0">
        <div className="flex-grow w-full p-2 md:p-4 flex" data-testid="terminal-container">
          <div className="w-full h-full min-h-0 rounded-lg overflow-hidden border border-slate-700 shadow-2xl relative">
            {isAuthenticated ? (
              <>
                {wsErrorMessage ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-slate-100 p-6 z-10">
                    <div className="text-sm text-red-300">WebSocket が切断されたで。</div>
                    <div className="text-xs text-slate-300 break-all">{wsErrorMessage}</div>
                    <div className="text-xs text-slate-400">
                      たとえば `NODE_ENV=production` で http のままやと、Secure Cookie が効かんくて認証できへんことがあるで。
                    </div>
                    <button
                      className="mt-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded-md"
                      onClick={() => void checkSession()}
                    >
                      Re-check Session
                    </button>
                  </div>
                ) : null}
                <TerminalComponent
                  onData={handleTerminalData}
                  onResize={handleTerminalResize}
                  incomingTick={incomingTick}
                  drainIncoming={drainIncoming}
                />
              </>
            ) : (
              <>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-200 p-6">
                  <div className="text-sm text-slate-300">接続するにはトークンが必要やで。</div>
                  <div className="w-full max-w-sm flex gap-2">
                    <input
                      data-testid="auth-token-input"
                      className="flex-1 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Access token"
                      value={authTokenInput}
                      onChange={(e) => setAuthTokenInput(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      disabled={isAuthBusy}
                    />
                    <button
                      data-testid="auth-submit"
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-bold rounded-md"
                      onClick={() => void login(authTokenInput)}
                      disabled={isAuthBusy || authTokenInput.trim() === ''}
                    >
                      Connect
                    </button>
                  </div>
                  {authError ? <div className="text-xs text-red-300">{authError}</div> : null}
                </div>
                <div className="hidden" data-testid="xterm-terminal" />
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col border-t border-slate-700">
          <TmuxPanel onSendCommand={handleTmuxCommand} />
          <div data-testid="control-panel">
            <ControlPanel onSendKey={handleControlPanelKey} onOpenTextInput={openTextInput} />
          </div>
        </div>
      </div>
      <TextInputModal
        isOpen={showTextInputModal}
        onClose={() => setShowTextInputModal(false)}
        onSubmit={handleTextInputModalSubmit}
        initialValue={initialTextInputValue}
      />
      <ShareLinkModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        url={shareUrl}
        qrDataUrl={shareQrDataUrl}
        expiresAt={shareExpiresAt}
        error={shareError}
        busy={shareBusy}
        onGenerate={() => void generateShareLink()}
      />
    </Layout>
  );
}
