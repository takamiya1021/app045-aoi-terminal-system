// メッセージタイプ
export type MessageType =
  | 'input'
  | 'resize'
  | 'output'
  | 'connected'
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

export type ClientMessage = InputMessage | ResizeMessage;

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
}

export interface ErrorMessage extends BaseServerMessage {
  type: 'error';
  message: string;
}

export type ServerMessage = OutputMessage | ConnectedMessage | ErrorMessage;
