import { config } from '../config';

describe('Config', () => {
  it('should load server configuration', () => {
    expect(config).toBeDefined();
    expect(config.port).toBeDefined();
    expect(typeof config.port).toBe('number');
    expect(config.allowedOrigins).toBeDefined();
    expect(Array.isArray(config.allowedOrigins)).toBe(true);
  });
});
