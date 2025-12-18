"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const server_1 = require("../server");
describe('Express Server', () => {
    it('should respond to health check', async () => {
        const response = await (0, supertest_1.default)(server_1.app).get('/health');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'ok' });
    });
    it('should handle 404 for unknown routes', async () => {
        const response = await (0, supertest_1.default)(server_1.app).get('/unknown-route');
        expect(response.status).toBe(404);
    });
});
//# sourceMappingURL=server.test.js.map