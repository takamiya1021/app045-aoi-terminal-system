"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
describe('Project Structure', () => {
    const rootDir = path_1.default.resolve(__dirname, '../../../');
    const requiredDirs = [
        'frontend/src/app',
        'frontend/src/components',
        'frontend/src/hooks',
        'frontend/src/lib',
        'backend/src',
        'backend/config',
        'scripts',
        'doc'
    ];
    requiredDirs.forEach(dir => {
        test(`directory exists: ${dir}`, () => {
            const fullPath = path_1.default.join(rootDir, dir);
            expect(fs_1.default.existsSync(fullPath)).toBe(true);
        });
    });
});
//# sourceMappingURL=project-structure.test.js.map
