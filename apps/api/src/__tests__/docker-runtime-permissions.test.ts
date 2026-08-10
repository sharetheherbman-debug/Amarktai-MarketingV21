import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');
}

describe('production Docker runtime permissions', () => {
  test('API image creates and owns the Winston log directory before dropping privileges', () => {
    const dockerfile = read('apps/api/Dockerfile');

    expect(dockerfile).toContain('/app/logs');
    expect(dockerfile).toContain('chown -R apiuser:nodejs /app/logs /app/uploads');
    expect(dockerfile.indexOf('/app/logs')).toBeLessThan(dockerfile.indexOf('USER apiuser'));
  });

  test('render worker image creates and owns the Winston log directory before dropping privileges', () => {
    const dockerfile = read('apps/api/Dockerfile.render');

    expect(dockerfile).toContain('/app/logs');
    expect(dockerfile).toContain('chown -R renderuser:nodejs /app/logs /app/uploads');
    expect(dockerfile.indexOf('/app/logs')).toBeLessThan(dockerfile.indexOf('USER renderuser'));
  });

  test('logger still uses the expected /app/logs-relative location', () => {
    const logger = read('apps/api/src/utils/logger.ts');
    expect(logger).toContain("path.resolve(__dirname, '../../logs')");
  });
});
