import express from 'express';
import http from 'http';
import { config } from './config.js';
import { logger } from './logger.js';
import { createWebSocketServer } from './websocket.js';
import { SESSION_COOKIE_NAME, createOneTimeLoginToken, createSession, getSessionIdFromCookie, getSessionTtlMs, isSessionValid, revokeSession, verifyLoginToken } from './auth.js';

export const app = express();

// Middleware
app.use(express.json());

// CORS (frontend:3101 -> backend:3102 のため)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  logger.info(`[CORS] ${req.method} ${req.path}`, {
    origin,
    allowedOrigins: config.allowedOrigins,
    isAllowed: origin && config.allowedOrigins.includes(origin),
  });

  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Request logging (for debugging)
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    origin: req.headers.origin,
    allowedOrigins: config.allowedOrigins,
    corsHeaderSet: res.getHeader('Access-Control-Allow-Origin') || 'not set',
  });
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/session', (req, res) => {
  const sessionId = getSessionIdFromCookie(req.headers.cookie);
  if (!isSessionValid(sessionId)) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.status(200).json({ authenticated: true });
});

app.post('/auth', (req, res) => {
  const token = (req.body as any)?.token;
  const result = verifyLoginToken(token);
  if (!result.valid) {
    res.status(401).json({ ok: false, message: 'Invalid token' });
    return;
  }

  const sessionId = createSession(result.isShare);
  const sessionTtl = result.isShare ? 1000 * 60 * 60 * 6 : getSessionTtlMs(); // シェア用: 6h, 通常: 24h
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: (() => {
      const raw = process.env.TERMINAL_COOKIE_SECURE;
      if (raw === undefined) return process.env.NODE_ENV === 'production';
      const v = raw.trim().toLowerCase();
      return v === '1' || v === 'true' || v === 'yes';
    })(),
    maxAge: sessionTtl,
    path: '/',
  });
  res.status(200).json({ ok: true });
});

app.post('/logout', (req, res) => {
  const sessionId = getSessionIdFromCookie(req.headers.cookie);
  revokeSession(sessionId);
  res.cookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
  res.status(200).json({ ok: true });
});

// 認証済みユーザー向け: "1回だけ使える" ログイン用トークンを発行（QR/共有リンク用）
app.post('/link-token', (req, res) => {
  const sessionId = getSessionIdFromCookie(req.headers.cookie);
  if (!isSessionValid(sessionId)) {
    res.status(401).json({ ok: false, message: 'Authentication required' });
    return;
  }

  // リクエストボディからisShareパラメータを取得（デフォルト: false = 自分用24h）
  const isShare = (req.body as any)?.isShare === true;
  const { token, expiresAt } = createOneTimeLoginToken(isShare);
  res.status(200).json({ ok: true, token, expiresAt });
});

// 404 Handler
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).send('Not Found');
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled Error', err);
  res.status(500).send('Internal Server Error');
});

import { fileURLToPath } from 'url';

// Server startup
const server = http.createServer(app);

// ESM equivalent of if (require.main === module)
console.log('Script path:', fileURLToPath(import.meta.url));
console.log('Executed path:', process.argv[1]);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createWebSocketServer(server); // WebSocketサーバーを起動！
  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`Server running on 0.0.0.0:${config.port}`);
  });
} else {
    console.log('Not running as main module, skipping listen()');
}

export { server };
