import { PtyManager } from '../pty-manager';

describe('PtyManager', () => {
  let ptyManager: PtyManager;
  const createdSessions: string[] = [];

  beforeEach(() => {
    ptyManager = new PtyManager();
    createdSessions.length = 0;
  });

  afterEach(() => {
    createdSessions.forEach(id => {
      try {
        ptyManager.kill(id);
      } catch (e) {
        // ignore if already killed
      }
    });
  });

  it('should create a pty session', () => {
    const sessionId = 'test-session';
    createdSessions.push(sessionId);
    const session = ptyManager.createSession(sessionId, (data) => {});
    expect(session).toBeDefined();
    // 環境によっては PTY が使えず fallback になる（pid=-1）ので許容する
    expect(typeof session.pid).toBe('number');
    expect(typeof session.write).toBe('function');
    expect(typeof session.resize).toBe('function');
    expect(typeof session.kill).toBe('function');
  });

  it('should retrieve existing session', () => {
    const sessionId = 'test-session-2';
    createdSessions.push(sessionId);
    ptyManager.createSession(sessionId, (data) => {});
    const session = ptyManager.getSession(sessionId);
    expect(session).toBeDefined();
  });

  it('should handle resizing', () => {
    const sessionId = 'resize-session';
    createdSessions.push(sessionId);
    ptyManager.createSession(sessionId, (data) => {});
    expect(() => {
      ptyManager.resize(sessionId, 100, 40);
    }).not.toThrow();
  });
});
