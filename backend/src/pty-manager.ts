import * as pty from 'node-pty';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { logger } from './logger.js';

export interface TerminalSession {
  pid: number;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

class FallbackSession implements TerminalSession {
  pid: number;
  private cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly onData: (data: string) => void;
  private buffer = '';
  private running: ChildProcessWithoutNullStreams | null = null;

  constructor(sessionId: string, onData: (data: string) => void) {
    this.pid = -1;
    this.cwd = process.env.HOME || process.cwd();
    this.env = { ...process.env };
    this.onData = onData;

    this.onData(`(fallback) PTYが利用できへん環境やから、簡易シェルで動いとるで。\r\n`);
    this.onData(`${this.cwd}$ `);
    logger.warn(`Session ${sessionId} running in fallback (no PTY) mode.`);
  }

  resize(_cols: number, _rows: number): void {
    // no-op (no PTY)
  }

  kill(): void {
    if (this.running) {
      this.running.kill('SIGKILL');
      this.running = null;
    }
  }

  write(data: string): void {
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        const command = this.buffer.trim();
        this.buffer = '';
        this.onData('\r\n');
        if (command.length === 0) {
          this.onData(`${this.cwd}$ `);
          continue;
        }

        // built-in: cd
        if (command === 'cd' || command.startsWith('cd ')) {
          const target = command === 'cd' ? (process.env.HOME || this.cwd) : command.slice(3).trim();
          const nextCwd = target.startsWith('/') ? target : `${this.cwd}/${target}`;
          this.cwd = nextCwd.replace(/\/+$/, '') || '/';
          this.onData(`${this.cwd}$ `);
          continue;
        }

        this.runCommand(command);
        continue;
      }

      if (ch === '\u007f') {
        if (this.buffer.length > 0) {
          this.buffer = this.buffer.slice(0, -1);
          this.onData('\b \b');
        }
        continue;
      }

      // ignore escape sequences (arrows etc) for now
      if (ch === '\u001b') continue;

      this.buffer += ch;
      this.onData(ch);
    }
  }

  private runCommand(command: string): void {
    if (this.running) {
      this.onData(`\r\n(実行中のコマンドがあるで。終わるまで待ってな)\r\n${this.cwd}$ `);
      return;
    }

    const child = spawn('bash', ['-lc', command], {
      cwd: this.cwd,
      env: this.env,
      stdio: 'pipe',
    });
    this.running = child;
    this.pid = child.pid ?? -1;

    child.stdout.on('data', (chunk) => this.onData(chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => this.onData(chunk.toString('utf8')));
    child.on('close', () => {
      this.running = null;
      this.onData(`\r\n${this.cwd}$ `);
    });
  }
}

export class PtyManager {
  private sessions: Map<string, TerminalSession> = new Map();
  private ptyAvailable: boolean | null = null;

  isPtyAvailable(): boolean {
    return this.ptyAvailable === true;
  }

  createSession(sessionId: string, onData: (data: string) => void): TerminalSession {
    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      logger.warn(`Session ${sessionId} already exists, killing old session`);
      this.sessions.get(sessionId)?.kill();
    }

    const shell = process.env.SHELL || 'bash';
    const useTmux = !['0', 'false', 'no'].includes(String(process.env.TERMINAL_USE_TMUX || 'true').toLowerCase());
    const tmuxSessionName = (process.env.TERMINAL_TMUX_SESSION || 'aoi-terminals').replace(/[^a-zA-Z0-9_-]/g, '-');

    try {
      let buildShell = shell;
      let shellArgs: string[] = [];

      // SSH踏み台モード: TERMINAL_SSH_TARGET（例: user@host.docker.internal）があればSSHを起動
      const sshTarget = process.env.TERMINAL_SSH_TARGET;
      if (sshTarget) {
        logger.info(`SSH Gateway Mode enabled. Target: ${sshTarget}`);
        buildShell = 'ssh';

        // 基本的なSSHオプション（バッチモード、厳密なホストチェック無効化、仮想ターミナル強制割り当て）
        shellArgs = [
          '-o', 'BatchMode=yes',
          '-o', 'StrictHostKeyChecking=no',
          '-t', // Force pseudo-terminal usage
          sshTarget
        ];

        // 秘密鍵の指定があれば追加
        if (process.env.TERMINAL_SSH_KEY) {
          shellArgs.unshift('-i', process.env.TERMINAL_SSH_KEY);
        }

        // tmuxを使用する場合は、SSH先のホスト側でtmuxを起動させる
        // ステータスバーはモバイル画面幅でも崩れないようコンパクト化
        if (useTmux) {
          shellArgs.push(
            `tmux new-session -A -s ${tmuxSessionName}`
            + ` \\; set -g status-right '%H:%M'`
            + ` \\; set -g status-left-length 20`
          );
        }
      }

      // 初期サイズをモバイル寄りに設定（80列だとスマホで初期表示が崩れる）
      // PC/タブレットはWebSocket接続後すぐにリサイズが来るので影響なし
      const ptyProcess = pty.spawn(buildShell, shellArgs, {
        name: 'xterm-color',
        cols: 38,
        rows: 20,
        cwd: process.env.HOME || process.cwd(),
        env: process.env as { [key: string]: string },
      });

      ptyProcess.onData((data) => {
        onData(data);
      });

      ptyProcess.onExit((res) => {
        logger.info(`Session ${sessionId} exited with code ${res.exitCode}`);
        this.sessions.delete(sessionId);
      });

      this.ptyAvailable = true;
      this.sessions.set(sessionId, ptyProcess as unknown as TerminalSession);
      logger.info(`Created PTY session ${sessionId} (PID: ${ptyProcess.pid}, Mode: ${sshTarget ? 'SSH' : 'Local'})`);

      if (useTmux && !sshTarget) {
        // ローカルモードの時だけ、こちら側からtmuxを送り込む（SSHモードは引数で指定済み）
        // ステータスバーはモバイル画面幅でも崩れないようコンパクト化
        ptyProcess.write(`tmux new-session -A -s ${tmuxSessionName} \\; set -g status-right ' %H:%M ' \\; set -g status-left-length 20\r`);
      }

      return ptyProcess as unknown as TerminalSession;
    } catch (error) {
      this.ptyAvailable = false;
      logger.warn(`PTY spawn failed for session ${sessionId}. Falling back to non-PTY mode.`, error);
      const fallback = new FallbackSession(sessionId, onData);
      this.sessions.set(sessionId, fallback);
      return fallback;
    }
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) {
      logger.warn(`Invalid resize dimensions for session ${sessionId}: ${cols}x${rows}`);
      return;
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.resize(cols, rows);
        logger.info(`Resized session ${sessionId} to ${cols}x${rows}`);
      } catch (error) {
        logger.error(`Failed to resize session ${sessionId}`, error);
      }
    } else {
      logger.warn(`Attempted to resize non-existent session ${sessionId}`);
    }
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.write(data);
      } catch (error) {
        logger.error(`Failed to write to session ${sessionId}`, error);
      }
    } else {
      logger.warn(`Attempted to write to non-existent session ${sessionId}`);
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.kill();
        this.sessions.delete(sessionId);
        logger.info(`Killed session ${sessionId}`);
      } catch (error) {
        logger.error(`Failed to kill session ${sessionId}`, error);
      }
    }
  }
}
