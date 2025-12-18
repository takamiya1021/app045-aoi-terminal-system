import type { ClientMessage, ServerMessage } from '../types.js';

describe('Type Definitions (Backend)', () => {
  it('should compile and types should be importable', () => {
    const clientMsg: Partial<ClientMessage> = {};
    const serverMsg: Partial<ServerMessage> = {};
    
    expect(clientMsg).toBeDefined();
    expect(serverMsg).toBeDefined();
  });
});
