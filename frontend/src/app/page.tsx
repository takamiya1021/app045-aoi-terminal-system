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
  const lastInputRef = useRef<{ data: string; timestamp: number } | null>(null);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const baselineViewportRef = useRef<number | null>(null);

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
      console.log('[DEBUG] Backend URL:', backendHttpBase);
      console.log('[DEBUG] Attempting to connect to:', `${backendHttpBase}/auth`);
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

        // cookie が確実に反映されるか /session で確認
        try {
          const sessionRes = await fetch(`${backendHttpBase}/session`, { credentials: 'include' });
          if (!sessionRes.ok) {
            setIsAuthenticated(false);
            setAuthError('認証は通ったけど、セッションが確立できへんかった。Cookie設定を確認してな。');
            return;
          }
        } catch (err) {
          setIsAuthenticated(false);
          const errorMsg = err instanceof Error ? err.message : String(err);
          setAuthError(`セッション確認に失敗したで: ${errorMsg}`);
          return;
        }

        setIsAuthenticated(true);

        if (opts?.clearUrlToken && typeof window !== 'undefined') {
          // URLにトークンを残さない（/??token=... の互換だけ残す）
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (err) {
        setIsAuthenticated(false);
        console.error('[DEBUG] Login error:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setAuthError(`認証サーバに繋がらへんかった: ${errorMsg} (URL: ${backendHttpBase}/auth)`);
      } finally {
        setIsAuthBusy(false);
      }
    },
    [backendHttpBase]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const threshold = 120;
    const updateKeyboardState = () => {
      const viewport = window.visualViewport;
      const layoutHeight = document.documentElement.clientHeight;
      const keyboardHeight = viewport ? Math.max(0, layoutHeight - viewport.height - viewport.offsetTop) : 0;
      setIsKeyboardOpen(keyboardHeight > threshold);
    };

    updateKeyboardState();
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updateKeyboardState);
    viewport?.addEventListener('scroll', updateKeyboardState);
    window.addEventListener('resize', updateKeyboardState);

    return () => {
      viewport?.removeEventListener('resize', updateKeyboardState);
      viewport?.removeEventListener('scroll', updateKeyboardState);
      window.removeEventListener('resize', updateKeyboardState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const threshold = 120;
    const updateKeyboardState = () => {
      const viewport = window.visualViewport;
      const currentViewportHeight = viewport?.height ?? window.innerHeight;
      if (baselineViewportRef.current === null) {
        baselineViewportRef.current = currentViewportHeight;
      }
      const baseline = baselineViewportRef.current ?? currentViewportHeight;
      const keyboardHeight = Math.max(0, baseline - currentViewportHeight);
      const nextOpen = keyboardHeight > threshold;
      setIsKeyboardOpen(nextOpen);
    };

    updateKeyboardState();
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updateKeyboardState);
    viewport?.addEventListener('scroll', updateKeyboardState);
    window.addEventListener('resize', updateKeyboardState);

    return () => {
      viewport?.removeEventListener('resize', updateKeyboardState);
      viewport?.removeEventListener('scroll', updateKeyboardState);
      window.removeEventListener('resize', updateKeyboardState);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouchAction = body.style.touchAction;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevHtmlOverflow = html.style.overflow;

    if (isKeyboardOpen) {
      body.style.overflow = 'hidden';
      body.style.touchAction = 'none';
      html.style.overscrollBehavior = 'none';
      html.style.overflow = 'hidden';
      window.scrollTo(0, 0);
    } else {
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouchAction;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      html.style.overflow = prevHtmlOverflow;
    }

    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouchAction;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      html.style.overflow = prevHtmlOverflow;
    };
  }, [isKeyboardOpen]);

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
          console.log('[DEBUG] Auto-login: Backend URL:', backendHttpBase);
          console.log('[DEBUG] Auto-login: Attempting to connect to:', `${backendHttpBase}/auth`);
          console.log('[DEBUG] Auto-login: URL token:', urlToken);
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

            // /auth 成功後はまず URL から token を消す（ワンタイムなので残さない）
            window.history.replaceState(null, '', window.location.pathname);
            setAuthError(null);
          } catch (err) {
            setIsAuthenticated(false);
            console.error('[DEBUG] Auto-login error:', err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            setAuthError(`認証サーバに繋がらへんかった: ${errorMsg} (URL: ${backendHttpBase}/auth)`);
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
      if (message.type === 'error') {
        // バックエンド側が認証エラー等でcloseする前に送ってくるやつ
        setWsErrorMessage(message.message || 'WebSocket error');
        void checkSession();
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
    // スマホのブラウザで二重にイベントが発火する問題を回避
    // 同じデータが50ms以内に来た場合はスキップ
    const now = Date.now();
    const last = lastInputRef.current;
    if (last && last.data === data && now - last.timestamp < 50) {
      console.log('[DEBUG] Duplicate input detected, skipping:', data);
      return;
    }

    lastInputRef.current = { data, timestamp: now };
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isShare: true }), // シェア用QR（6時間セッション）
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

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => {
        console.error('Failed to enter fullscreen:', e);
      });
    } else {
      document.exitFullscreen().catch((e) => {
        console.error('Failed to exit fullscreen:', e);
      });
    }
  }, []);

  return (
    <Layout
      headerRight={
        isAuthenticated ? (
          <div className="flex gap-2">
            <button
              onClick={toggleFullscreen}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-md shadow"
              title="Toggle Fullscreen"
            >
              [ ]
            </button>
            <button
              onClick={() => setIsShareOpen(true)}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-md shadow"
            >
              Share (QR)
            </button>
          </div>
        ) : null
      }
    >
      <div className="flex flex-col h-full bg-slate-900 min-h-0">
        <div className="flex-grow w-full p-2 md:p-4 flex overflow-hidden" data-testid="terminal-container">
          <div className="w-full h-full rounded-lg border border-slate-700 shadow-2xl relative overflow-hidden">
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
                <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 animate-gradient bg-[length:200%_200%]">
                  {/* グリッドパターン */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />

                  {/* グロー効果 */}
                  <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-glow-pulse" />
                  <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: '1s' }} />

                  {/* メインコンテンツ */}
                  <div className="relative z-10 flex flex-col items-center justify-center min-h-full p-6">
                    <div className="w-full max-w-md animate-float">
                      {/* ロゴ・タイトルエリア */}
                      <div className="text-center mb-8">
                        <div className="flex justify-center mb-4">
                          <img
                            src="/terminal-logo.svg"
                            alt="Terminal Logo"
                            className="w-32 h-32 md:w-40 md:h-40 drop-shadow-[0_0_20px_rgba(6,182,212,0.5)]"
                          />
                        </div>
                        <div className="h-1 w-24 mx-auto bg-gradient-to-r from-transparent via-cyan-500 to-transparent rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
                        <p className="mt-4 text-cyan-300/60 text-sm tracking-wide">
                          接続するにはトークンが必要やで
                        </p>
                      </div>

                      {/* 入力エリア */}
                      <div className="backdrop-blur-md bg-slate-900/30 border border-cyan-500/20 rounded-2xl p-6 shadow-[0_0_50px_rgba(6,182,212,0.1)] hover:shadow-[0_0_80px_rgba(6,182,212,0.2)] transition-all duration-500">
                        <div className="space-y-4">
                          <input
                            data-testid="auth-token-input"
                            className="w-full bg-slate-950/80 border-2 border-cyan-500/30 rounded-lg px-4 py-3 text-cyan-100 placeholder-cyan-500/30 outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all duration-300 font-mono tracking-wider"
                            placeholder="ACCESS TOKEN"
                            value={authTokenInput}
                            onChange={(e) => setAuthTokenInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && authTokenInput.trim() !== '' && !isAuthBusy) {
                                void login(authTokenInput);
                              }
                            }}
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            disabled={isAuthBusy}
                          />
                          <button
                            data-testid="auth-submit"
                            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] disabled:shadow-none transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 tracking-wider"
                            onClick={() => void login(authTokenInput)}
                            disabled={isAuthBusy || authTokenInput.trim() === ''}
                          >
                            {isAuthBusy ? 'CONNECTING...' : 'CONNECT'}
                          </button>
                        </div>

                        {authError ? (
                          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 backdrop-blur-sm">
                            {authError}
                          </div>
                        ) : null}
                      </div>

                      {/* デコレーション */}
                      <div className="mt-6 flex justify-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-pulse" />
                        <div className="w-2 h-2 rounded-full bg-blue-500/50 animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 rounded-full bg-purple-500/50 animate-pulse" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hidden" data-testid="xterm-terminal" />
              </>
            )}
          </div>
        </div>
        {isAuthenticated && !isKeyboardOpen && (
          <div className="flex flex-col border-t border-slate-700 bg-slate-800">
            <TmuxPanel onSendCommand={handleTmuxCommand} />
            <div data-testid="control-panel">
              <ControlPanel onSendKey={handleControlPanelKey} onOpenTextInput={openTextInput} />
            </div>
          </div>
        )}
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
