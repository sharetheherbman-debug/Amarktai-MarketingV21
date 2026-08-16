import fs from 'fs';
import path from 'path';

describe('Docker HTTP healthchecks', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');

  it('uses explicit IPv4 loopback for local HTTP health probes', () => {
    const compose = fs.readFileSync(path.join(repoRoot, 'docker/docker-compose.yml'), 'utf8');
    const apiDockerfile = fs.readFileSync(path.join(repoRoot, 'apps/api/Dockerfile'), 'utf8');
    const webDockerfile = fs.readFileSync(path.join(repoRoot, 'apps/web/Dockerfile'), 'utf8');

    expect(compose).toContain('http://127.0.0.1:4000/api/v1/health/ready');
    expect(compose).toContain('http://127.0.0.1:3000');
    expect(compose).toContain('http://127.0.0.1/ready');
    expect(compose).not.toContain('http://localhost:4000/api/v1/health/ready');
    expect(compose).not.toContain('http://localhost:3000');
    expect(compose).not.toContain('http://localhost/ready');

    expect(apiDockerfile).toContain('http://127.0.0.1:4000/health');
    expect(apiDockerfile).not.toContain('http://localhost:4000/health');

    expect(webDockerfile).toContain('http://127.0.0.1:3000');
    expect(webDockerfile).not.toContain('http://localhost:3000');
  });
});
