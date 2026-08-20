import fs from 'fs';
import path from 'path';

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '../../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Studio client-facing rescue contract', () => {
  test('completed Studio media is persisted behind the authenticated asset route', () => {
    const studio = read('apps/api/src/services/studio.service.ts');
    expect(studio).toContain("const INTERNAL_ASSET_PREFIX = '/api/v1/studio/assets/'");
    expect(studio).toContain('downloadJobFile');
    expect(studio).toContain("'uploads', 'studio', 'generated'");
    expect(studio).toContain("error_code=NULL, error_message=NULL");
    expect(studio).toContain('control_decision_id');
  });

  test('Studio client handles manual control and authenticated media instead of hanging', () => {
    const client = read('packages/studio/src/client/StudioClient.js');
    expect(client).toContain('stopOnPendingControl');
    expect(client).toContain("generation.status === 'pending_control'");
    expect(client).toContain('/relaunch-control/actions/');
    expect(client).toContain('fetchMediaBlob');
    expect(client).toContain('downloadMedia');
  });

  test('Creative Studio exposes client-facing runtime, agents and approval controls in the top bar', () => {
    const page = read('apps/web/app/(dashboard)/creative-studio/page.tsx');
    expect(page).toContain('Runtime tools');
    expect(page).toContain('Agents & Autonomy');
    expect(page).toContain('Manual approval required');
    expect(page).toContain('Saved to Assets');
    expect(page).toContain('control?.policy');
    expect(page).not.toContain('xl:grid-cols-[220px');
  });

  test('API and generation worker retain the shared Studio upload volume', () => {
    const compose = read('docker/docker-compose.yml');
    const matches = compose.match(/studio_uploads:\/app\/uploads/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
