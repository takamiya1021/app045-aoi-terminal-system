import { jest } from '@jest/globals';
import WebSocket from 'ws';
import { createWebSocketServer } from '../websocket';
import http from 'http';
import type { AddressInfo } from 'net';
import { getSessionIdFromCookie, isSessionValid } from '../auth'; // Import for mocking

// Mock the authentication function to control its behavior in tests
jest.mock('../auth', () => ({
  getSessionIdFromCookie: jest.fn((cookieHeader: string | undefined) => {
    if (!cookieHeader) return undefined;
    return cookieHeader.includes('its_session=valid_session') ? 'valid_session' : undefined;
  }),
  isSessionValid: jest.fn((sessionId: string | undefined) => sessionId === 'valid_session'),
}));

xdescribe('WebSocket Server', () => {
  let server: http.Server;
  let wss: WebSocket.Server;
  let ws: WebSocket;
  let port: number;
  const validCookie = 'its_session=valid_session';

  beforeAll((done) => {
    server = http.createServer();
    wss = createWebSocketServer(server);
    server.listen(0, () => {
      port = (server.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    wss.close();
    server.close(done);
  });

  afterEach(() => {
    // Ensure any open websocket is closed after each test
    if (ws && ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  });

  it('should accept connection with a valid token', (done) => {
    ws = new WebSocket(`ws://localhost:${port}`, {
      headers: { Cookie: validCookie },
    });
    ws.on('open', () => {
      ws.close();
      done();
    });
    ws.on('error', (err) => {
      done(err); // Fail test if connection errors
    });
  });

  it('should reject connection without a token', (done) => {
    ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('close', (code, reason) => {
      expect(code).toBe(1008); // Policy Violation
      expect(reason.toString()).toBe('Authentication Required');
      done();
    });
    ws.on('open', () => {
      done(new Error('Connection unexpectedly opened without token'));
    });
    ws.on('error', (err) => {
      // JSDOM's WebSocket can sometimes emit an 'error' event before 'close' for rejected connections.
      // We expect the close event with specific code/reason.
      // If the error is not due to a rejected connection, this might be a problem.
      // For now, we tolerate an error event if a close event with code 1008 is also received.
    });
  });

  it('should respond to ping', (done) => {
    ws = new WebSocket(`ws://localhost:${port}`, {
      headers: { Cookie: validCookie },
    });
    ws.on('open', () => {
      ws.ping();
    });
    ws.on('pong', () => {
      ws.close();
      done();
    });
    ws.on('error', (err) => {
      done(err);
    });
  });
});
