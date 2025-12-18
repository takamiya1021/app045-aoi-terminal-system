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

    return new Promise((resolve, reject) => {
      let output = '';
      const command = 'list-windows -F "#{window_id}:#{window_name}:#{pane_active}:#{window_panes}"';
      
      // Create a temporary PTY for command execution that expects a response
      // This is a simplified approach, a more robust solution might use a dedicated control PTY
      // to avoid interfering with the main session's output.
      const tempPty = pty.spawn('tmux', ['-S', '/tmp/tmux-' + sessionId, 'list-windows', '-F', '#{window_id}:#{window_name}:#{pane_active}:#{window_panes}'], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || process.cwd(),
        env: process.env as { [key: string]: string }
      });

      const timeout = setTimeout(() => {
        tempPty.kill();
        reject(new Error('tmux list-windows command timed out.'));
      }, 2000); // 2 seconds timeout for the command to respond

      tempPty.onData((data) => {
        output += data.toString();
      });

      tempPty.onExit((exitInfo) => {
        clearTimeout(timeout);
        if (exitInfo.exitCode === 0) {
          resolve(this.parseTmuxWindows(output));
        } else {
          logger.error(`Tmux list-windows command failed with code ${exitInfo.exitCode}. Output: ${output}`);
          reject(new Error(`tmux list-windows failed.`));
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
