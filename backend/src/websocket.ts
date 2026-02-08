import { WebSocket, WebSocketServer } from 'ws'; // Correct import for ESM
import http from 'http';
import { logger } from './logger.js';
import type { ClientMessage, ServerMessage } from './types.js';
import { getSessionIdFromCookie, isSessionValid } from './auth.js';
import { PtyManager } from './pty-manager.js';
import { config } from './config.js';

export function createWebSocketServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server });

  // PtyManagerのインスタンス生成
  const ptyManager = new PtyManager();

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    // Origin 制限（ブラウザからの接続のみ許可したい場合の最低限）
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      logger.warn(`Rejected WebSocket connection due to invalid origin: ${origin}`);
      ws.close(1008, 'Origin Not Allowed');
      return;
    }

    // Cookie セッション認証
    const authSessionId = getSessionIdFromCookie(req.headers.cookie);
    if (!isSessionValid(authSessionId)) {
      logger.warn('Unauthenticated WebSocket connection attempt. Closing connection.');
      ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' } as ServerMessage));
      ws.close(1008, 'Authentication Required'); // 1008 is Policy Violation
      return;
    }

    logger.info('Client connected and authenticated');

    // Keepalive setup
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    // クライアントセッションの作成
    const ptySessionId = 'client-' + Math.random().toString(36).substring(2, 15);

    const getTmuxSessionName = () => {
      const raw = process.env.TERMINAL_TMUX_SESSION || `its-${ptySessionId}`;
      return raw.replace(/[^a-zA-Z0-9_-]/g, '-');
    };
    const tmuxSessionName = getTmuxSessionName();

    ptyManager.createSession(ptySessionId, (data: string) => {
      try {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'output', data } as ServerMessage));
      } catch (error) {
        logger.warn(`Failed to send PTY output to client ${ptySessionId}`, error);
      }
    });

    // 接続完了メッセージの送信
    ws.send(JSON.stringify({
      type: 'connected',
      sessionId: ptySessionId,
      tmuxSession: tmuxSessionName
    } as ServerMessage));

    ws.on('message', async (message: WebSocket.Data) => {
      try {
        const rawMessage = message.toString();

        // Handle Ping (some clients might send explicit ping messages, though WS protocol handles it)
        if (rawMessage === 'ping') {
          ws.send('pong');
          return;
        }

        const parsedMessage = JSON.parse(rawMessage) as ClientMessage;

        // Basic validation
        if (!parsedMessage.type) {
          logger.warn('Received message without type');
          return;
        }

        switch (parsedMessage.type) {
          case 'input':
            ptyManager.write(ptySessionId, parsedMessage.data);
            break;
          case 'resize':
            ptyManager.resize(ptySessionId, parsedMessage.cols, parsedMessage.rows);
            break;
          default:
            logger.warn(`Unknown message type: ${(parsedMessage as any).type}`);
            break;
        }
        logger.info('Received message', parsedMessage);
      } catch (error) {
        logger.error('Failed to parse or handle message', error);
      }
    });

    ws.on('close', () => {
      logger.info('Client disconnected');
      ptyManager.kill(ptySessionId); // Kill PTY session on client disconnect
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', error);
      ptyManager.kill(ptySessionId); // Kill PTY session on error
    });
  });

  // Set up an interval to check for inactive connections and terminate them
  const interval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      if (!(ws as any).isAlive) {
        logger.warn('Terminating inactive WebSocket connection.');
        return ws.terminate();
      }
      (ws as any).isAlive = false;
      ws.ping();
    });
  }, 30000); // Check every 30 seconds

  wss.on('close', () => {
    clearInterval(interval);
  });


  return wss;
}
