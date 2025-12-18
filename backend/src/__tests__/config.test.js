"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../config");
describe('Config', () => {
    it('should load server configuration', () => {
        expect(config_1.config).toBeDefined();
        expect(config_1.config.port).toBeDefined();
        expect(typeof config_1.config.port).toBe('number');
        expect(config_1.config.allowedOrigins).toBeDefined();
        expect(Array.isArray(config_1.config.allowedOrigins)).toBe(true);
    });
});
//# sourceMappingURL=config.test.js.map