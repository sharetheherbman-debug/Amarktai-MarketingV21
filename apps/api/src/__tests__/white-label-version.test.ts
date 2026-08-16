import fs from 'fs';
import path from 'path';

const apiRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(apiRoot, '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('EquiProfile public version identity', () => {
  test('public version metadata cannot expose the generic engine brand', () => {
    const version = JSON.parse(read('version.json')) as { name?: string };
    const healthRoute = read('apps/api/src/routes/health.ts');

    expect(version.name).toBe('EquiProfile Marketing');
    expect(JSON.stringify(version)).not.toContain('AmarktAI Marketing');
    expect(healthRoute).toContain("name: 'EquiProfile Marketing'");
  });
});
