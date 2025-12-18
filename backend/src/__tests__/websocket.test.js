"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const websocket_1 = require("../websocket");
const http_1 = __importDefault(require("http"));
const net_1 = require("net");
const auth_1 = require("../auth"); // Import for mocking
// Mock the authentication function to control its behavior in tests
jest.mock('../auth', () => ({
    getSessionIdFromCookie: jest.fn((cookieHeader) => {
        if (!cookieHeader)
            return undefined;
        return cookieHeader.includes('its_session=valid_session') ? 'valid_session' : undefined;
    }),
    isSessionValid: jest.fn((sessionId) => sessionId === 'valid_session'),
}));
xdescribe('WebSocket Server', () => {
    let server;
    let wss;
    let ws;
    let port;
    const validCookie = 'its_session=valid_session';
    beforeAll((done) => {
        server = http_1.default.createServer();
        wss = (0, websocket_1.createWebSocketServer)(server);
        server.listen(0, () => {
            port = server.address().port;
            done();
        });
    });
    afterAll((done) => {
        wss.close();
        server.close(done);
    });
    afterEach(() => {
        // Ensure any open websocket is closed after each test
        if (ws && ws.readyState === ws_1.default.OPEN || ws.readyState === ws_1.default.CONNECTING) {
            ws.close();
        }
    });
    it('should accept connection with a valid token', (done) => {
        ws = new ws_1.default(`ws://localhost:${port}`, {
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
        ws = new ws_1.default(`ws://localhost:${port}`);
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
        ws = new ws_1.default(`ws://localhost:${port}`, {
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
//# sourceMappingURL=websocket.test.js.map
