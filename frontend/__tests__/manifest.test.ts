import fs from 'fs';
import path from 'path';

describe('manifest.json', () => {
  const manifestPath = path.join(process.cwd(), 'public', 'manifest.json');

  it('should exist', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('should contain required fields', () => {
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.name).toBeDefined();
      expect(manifest.short_name).toBeDefined();
      expect(manifest.start_url).toBeDefined();
      expect(manifest.display).toBeDefined();
      expect(manifest.icons).toBeDefined();
      expect(Array.isArray(manifest.icons)).toBe(true);
    }
  });
});
