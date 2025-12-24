import * as pty from 'node-pty';
import { logger } from './logger.js';
import { PtyManager } from './pty-manager.js';
import type { TmuxWindow } from './types.js';

export class TmuxHelper {
  private ptyManager: PtyManager;
  // A map to store session-specific PTYs for command execution that expects a response.
  // This is simplified; a more robust solution might use a single control PTY per client session.
  private controlPties: Map<string, pty.IPty> = new Map();

  constructor(ptyManager: PtyManager) {
    this.ptyManager = ptyManager;
  }

  // Executes a tmux command in the context of a given PTY session
  async executeCommand(sessionId: string, command: string, args: string[] = []): Promise<void> {
    const session = this.ptyManager.getSession(sessionId);
    if (!session) {
      logger.warn(`TmuxHelper: Session ${sessionId} not found.`);
      throw new Error(`Session ${sessionId} not found.`);
    }

    // Prepend 'tmux' to the command and add a carriage return
    // Note: Since the PTY is already attached to a tmux session, we might not need 'tmux' prefix 
    // for all commands if we are sending keys, but for direct commands we use 'tmux'.
    const fullCommand = `tmux ${command} ${args.join(' ')}\r`;
    logger.info(`TmuxHelper: Executing command in session ${sessionId}: ${fullCommand.trim()}`);
    session.write(fullCommand);
  }

  // Lists tmux windows for a given PTY session
  async listWindows(sessionId: string): Promise<TmuxWindow[]> {
    const session = this.ptyManager.getSession(sessionId);
    if (!session) {
      logger.warn(`TmuxHelper: Session ${sessionId} not found for listing windows.`);
      return [];
    }

    // Determine the tmux session name
    const tmuxSessionName = (process.env.TERMINAL_TMUX_SESSION || `its-${sessionId}`).replace(/[^a-zA-Z0-9_-]/g, '-');
    const sshTarget = process.env.TERMINAL_SSH_TARGET;

    return new Promise((resolve, reject) => {
      let output = '';

      let cmd = 'tmux';
      let args = ['list-windows', '-t', tmuxSessionName, '-F', '#{window_id}:#{window_name}:#{pane_active}:#{window_panes}'];

      // SSHモードの場合、SSH経由でリモートのtmuxを実行する
      if (sshTarget) {
        const sshArgs = [
          '-o', 'BatchMode=yes',
          '-o', 'StrictHostKeyChecking=no',
          sshTarget,
          `tmux list-windows -t ${tmuxSessionName} -F '#{window_id}:#{window_name}:#{pane_active}:#{window_panes}'`
        ];
        if (process.env.TERMINAL_SSH_KEY) {
          sshArgs.unshift('-i', process.env.TERMINAL_SSH_KEY);
        }
        cmd = 'ssh';
        args = sshArgs;
      }

      const tempPty = pty.spawn(cmd, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || process.cwd(),
        env: process.env as { [key: string]: string }
      });

      const timeout = setTimeout(() => {
        tempPty.kill();
        reject(new Error('tmux list-windows command timed out.'));
      }, 5000); // 接続待ちを考慮して少し長めに設定

      tempPty.onData((data) => {
        output += data.toString();
      });

      tempPty.onExit((exitInfo) => {
        clearTimeout(timeout);
        if (exitInfo.exitCode === 0) {
          resolve(this.parseTmuxWindows(output));
        } else {
          // セッション未確立や接続拒否、ホスト未到達などは正常な「未準備」状態として扱う
          const lowerOutput = output.toLowerCase();
          const isExpectedError =
            lowerOutput.includes('can\'t find session') ||
            lowerOutput.includes('failed to connect to server') ||
            lowerOutput.includes('connection refused') ||
            lowerOutput.includes('permission denied') ||
            lowerOutput.includes('no such file or directory') ||
            lowerOutput.includes('error connecting to') ||
            lowerOutput.includes('no server running on');

          if (isExpectedError) {
            logger.debug(`Tmux session ${tmuxSessionName} not ready or target unreachable. Output: ${output.trim()}`);
            resolve([]);
          } else {
            logger.error(`Tmux list-windows command failed with code ${exitInfo.exitCode}. Output: ${output}`);
            reject(new Error(`tmux list-windows failed.`));
          }
        }
      });
    });
  }

  private parseTmuxWindows(output: string): TmuxWindow[] {
    const lines = output.trim().split('\n');
    return lines.map(line => {
      const parts = line.split(':');
      if (parts.length === 4 && parts[0] && parts[1] && parts[2] && parts[3]) {
        return {
          id: parts[0],
          name: parts[1],
          active: parts[2] === '1', // pane_active is '1' if active
          panes: parseInt(parts[3], 10),
        };
      }
      return null;
    }).filter((w): w is TmuxWindow => w !== null);
  }
}
