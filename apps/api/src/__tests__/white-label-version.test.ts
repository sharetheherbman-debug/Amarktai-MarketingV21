import fs from 'fs';
import path from 'path';

const apiRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(apiRoot, '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('white-label engine version identity', () => {
  test('public version metadata identifies the reusable engine, not one tenant', () => {
    const version = JSON.parse(read('version.json')) as { name?: string };
    const healthRoute = read('apps/api/src/routes/health.ts');

    expect(version.name).toBe('AmarktAI Marketing Engine');
    expect(JSON.stringify(version)).not.toContain('EquiProfile Marketing');
    expect(healthRoute).toContain("name: 'AmarktAI Marketing Engine'");
  });
});
