import fs from 'fs';
import path from 'path';

describe('Cinema Studio local static assets', () => {
  test('never references a missing file from the production web public tree', () => {
    const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const source = fs.readFileSync(
      path.join(repositoryRoot, 'packages/studio/src/components/CinemaStudio.jsx'),
      'utf8'
    );
    const publicRoot = path.join(repositoryRoot, 'apps/web/public');
    const references = [...source.matchAll(/["'`]\/(?!api\/)([^"'`?#]+\.(?:png|jpe?g|gif|webp|svg|ico))["'`]/gi)]
      .map((match) => match[1]);
    for (const reference of references) {
      expect(fs.existsSync(path.join(publicRoot, reference))).toBe(true);
    }
    expect(source).not.toContain('/assets/cinema/');
  });
});
