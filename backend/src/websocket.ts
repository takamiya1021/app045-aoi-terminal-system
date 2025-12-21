import { WebSocket, WebSocketServer } from 'ws'; // Correct import for ESM
import http from 'http';
import { logger } from './logger.js';
import type { ClientMessage, ServerMessage } from './types.js';
import { getSessionIdFromCookie, isSessionValid } from './auth.js';
import { PtyManager } from './pty-manager.js';
import { TmuxHelper } from './tmux-helper.js';
import { config } from './config.js';

export function createWebSocketServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server });

  // Instantiate PtyManager and TmuxHelper
  const ptyManager = new PtyManager();
  const tmuxHelper = new TmuxHelper(ptyManager);

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

    // Create a new session for this client
    const ptySessionId = 'client-' + Math.random().toString(36).substring(2, 15);
    let tmuxDetached = false;

    const getTmuxSessionName = () => {
      const raw = process.env.TERMINAL_TMUX_SESSION || `its-${ptySessionId}`;
      return raw.replace(/[^a-zA-Z0-9_-]/g, '-');
    };
    const tmuxSessionName = getTmuxSessionName();

    const tmuxKeyForCommand = (command: string): string | null => {
      switch (command) {
        case 'new-window':
          return 'c';
        case 'next-window':
          return 'n';
        case 'previous-window':
          return 'p';
        case 'detach':
          return 'd';
        case 'split-window -v':
          return '%';
        case 'split-window -h':
          return '"';
        case 'select-pane -t:.+':
          return 'o';
        case 'zoom-pane':
          return 'z';
        case 'resize-pane -Z':
          return 'z';
        case 'copy-mode':
          return '[';
        default:
          return null;
      }
    };

    ptyManager.createSession(ptySessionId, (data: string) => {
      try {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'output', data } as ServerMessage));
      } catch (error) {
        logger.warn(`Failed to send PTY output to client ${ptySessionId}`, error);
      }
    });

    // Send connected message with session ID
    ws.send(JSON.stringify({ type: 'connected', sessionId: ptySessionId, tmuxSession: tmuxSessionName } as ServerMessage));

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
          case 'tmux-command': {
            if (parsedMessage.command === 'detach') {
              tmuxDetached = true;
            }

            // Detach後は、まずattachしてからキー操作で実行（1タップで戻れる）
            if (tmuxDetached && parsedMessage.command !== 'detach') {
              const key = tmuxKeyForCommand(parsedMessage.command);
              if (key) {
                ptyManager.write(ptySessionId, `tmux attach -t ${tmuxSessionName}\r`);
                setTimeout(() => {
                  ptyManager.write(ptySessionId, `\x02${key}`);
                }, 120);
                tmuxDetached = false;
                break;
              }
            }

            try {
              await tmuxHelper.executeCommand(ptySessionId, parsedMessage.command, parsedMessage.args);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              ws.send(JSON.stringify({ type: 'output', data: `\r\n[tmux-error] ${message}\r\n` } as ServerMessage));
            }
            break;
          }
          case 'session-info-request':
            try {
              const windows = await tmuxHelper.listWindows(ptySessionId);
              ws.send(JSON.stringify({ type: 'session-info-response', windows } as ServerMessage));
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              ws.send(JSON.stringify({ type: 'output', data: `\r\n[tmux-error] ${message}\r\n` } as ServerMessage));
            }
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
