"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pty_manager_1 = require("../pty-manager");
describe('PtyManager', () => {
    let ptyManager;
    const createdSessions = [];
    beforeEach(() => {
        ptyManager = new pty_manager_1.PtyManager();
        createdSessions.length = 0;
    });
    afterEach(() => {
        createdSessions.forEach(id => {
            try {
                ptyManager.kill(id);
            }
            catch (e) {
                // ignore if already killed
            }
        });
    });
    it('should create a pty session', () => {
        const sessionId = 'test-session';
        createdSessions.push(sessionId);
        const session = ptyManager.createSession(sessionId, (data) => { });
        expect(session).toBeDefined();
        expect(session.pid).toBeGreaterThan(0);
    });
    it('should retrieve existing session', () => {
        const sessionId = 'test-session-2';
        createdSessions.push(sessionId);
        ptyManager.createSession(sessionId, (data) => { });
        const session = ptyManager.getSession(sessionId);
        expect(session).toBeDefined();
    });
    it('should handle resizing', () => {
        const sessionId = 'resize-session';
        createdSessions.push(sessionId);
        ptyManager.createSession(sessionId, (data) => { });
        expect(() => {
            ptyManager.resize(sessionId, 100, 40);
        }).not.toThrow();
    });
});
//# sourceMappingURL=pty-manager.test.js.map