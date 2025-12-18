import { randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'its_session';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const sessions = new Map<string, number>(); // sessionId -> expiresAt(ms)

const DEFAULT_LINK_TOKEN_TTL_MS = 1000 * 60 * 5; // 5 min
const linkTokens = new Map<string, number>(); // token -> expiresAt(ms)

function getLinkTokenTtlMs(): number {
  const raw = process.env.TERMINAL_LINK_TOKEN_TTL_SECONDS;
  if (!raw) return DEFAULT_LINK_TOKEN_TTL_MS;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_LINK_TOKEN_TTL_MS;
  return Math.floor(seconds * 1000);
}

function cleanupExpiredLinkTokens(): void {
  const now = Date.now();
  for (const [token, expiresAt] of linkTokens.entries()) {
    if (expiresAt <= now) linkTokens.delete(token);
  }
}

export function getExpectedLoginToken(): string | null {
  // 本番は必ず環境変数で渡す（リポジトリに固定トークンを置かない）
  if (process.env.TERMINAL_TOKEN && process.env.TERMINAL_TOKEN.trim() !== '') {
    return process.env.TERMINAL_TOKEN.trim();
  }

  // 開発用デフォルト（Playwright等のローカル検証を簡単にする）
  if (process.env.NODE_ENV !== 'production') return 'valid_token';

  return null;
}

export function createOneTimeLoginToken(): { token: string; expiresAt: number } {
  cleanupExpiredLinkTokens();
  const token = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + getLinkTokenTtlMs();
  linkTokens.set(token, expiresAt);
  return { token, expiresAt };
}

export function consumeOneTimeLoginToken(token: unknown): boolean {
  if (typeof token !== 'string' || token.trim() === '') return false;
  cleanupExpiredLinkTokens();
  const expiresAt = linkTokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    linkTokens.delete(token);
    return false;
  }
  linkTokens.delete(token); // one-time
  return true;
}

export function verifyLoginToken(token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const expected = getExpectedLoginToken();
  if (expected && token === expected) return true;
  return consumeOneTimeLoginToken(token);
}

export function createSession(): string {
  const sessionId = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(sessionId, expiresAt);
  return sessionId;
}

export function revokeSession(sessionId: string | undefined): void {
  if (!sessionId) return;
  sessions.delete(sessionId);
}

export function isSessionValid(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  const expiresAt = sessions.get(sessionId);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function getSessionIdFromCookie(cookieHeader: string | undefined): string | undefined {
  const cookies = parseCookies(cookieHeader);
  return cookies[SESSION_COOKIE_NAME];
}

export function getSessionTtlMs(): number {
  return SESSION_TTL_MS;
}
