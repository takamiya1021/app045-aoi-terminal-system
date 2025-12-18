import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

describe('Project Structure', () => {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');

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
      const fullPath = path.join(rootDir, dir);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });
});
