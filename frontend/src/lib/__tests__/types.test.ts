import { 
  ClientMessage, 
  ServerMessage
} from '../types';

describe('Type Definitions', () => {
  it('should compile and types should be importable', () => {
    // This test mainly verifies that types can be imported without error.
    // Since interfaces/types are erased at runtime, we can't really check their values
    // unless we have some runtime constants or enums.
    
    // Just verifying that the compiler doesn't complain about these variables
    const clientMsg: Partial<ClientMessage> = {};
    const serverMsg: Partial<ServerMessage> = {};
    
    expect(clientMsg).toBeDefined();
    expect(serverMsg).toBeDefined();
  });
});
