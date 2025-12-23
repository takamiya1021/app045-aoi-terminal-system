// メッセージタイプ
export type MessageType =
  | 'input'
  | 'resize'
  | 'tmux-command'
  | 'session-info-request'
  | 'output'
  | 'connected'
  | 'session-info-response'
  | 'error';

// クライアント -> サーバー
export interface BaseClientMessage {
  type: MessageType;
}

export interface InputMessage extends BaseClientMessage {
  type: 'input';
  data: string;
}

export interface ResizeMessage extends BaseClientMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface TmuxCommandMessage extends BaseClientMessage {
  type: 'tmux-command';
  command: string; // 'new-window', 'split-window', etc.
  args?: string[];
}

export interface SessionInfoRequest extends BaseClientMessage {
  type: 'session-info-request';
}

export type ClientMessage = InputMessage | ResizeMessage | TmuxCommandMessage | SessionInfoRequest;

// サーバー -> クライアント
export interface BaseServerMessage {
  type: MessageType;
}

export interface OutputMessage extends BaseServerMessage {
  type: 'output';
  data: string; // base64 encoded or raw string
}

export interface ConnectedMessage extends BaseServerMessage {
  type: 'connected';
  sessionId: string;
  tmuxSession: string;
  isDetached?: boolean;
}

export interface TmuxWindow {
  id: string;
  name: string;
  active: boolean;
  panes: number;
}

export interface SessionInfoResponse extends BaseServerMessage {
  type: 'session-info-response';
  windows: TmuxWindow[];
  isDetached?: boolean;
}

export interface ErrorMessage extends BaseServerMessage {
  type: 'error';
  message: string;
}

export type ServerMessage = OutputMessage | ConnectedMessage | SessionInfoResponse | ErrorMessage;
