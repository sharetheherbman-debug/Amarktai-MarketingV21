import { access, cp, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'apps', 'web');
const standaloneWebRoot = path.join(webRoot, '.next', 'standalone', 'apps', 'web');
const standaloneServer = path.join(standaloneWebRoot, 'server.js');
const sourceStatic = path.join(webRoot, '.next', 'static');
const targetStatic = path.join(standaloneWebRoot, '.next', 'static');
const sourcePublic = path.join(webRoot, 'public');
const targetPublic = path.join(standaloneWebRoot, 'public');

await access(standaloneServer);
await access(sourceStatic);
await access(sourcePublic);

await rm(targetStatic, { recursive: true, force: true });
await mkdir(path.dirname(targetStatic), { recursive: true });
await cp(sourceStatic, targetStatic, { recursive: true });

await rm(targetPublic, { recursive: true, force: true });
await cp(sourcePublic, targetPublic, { recursive: true });

const child = spawn(process.execPath, [standaloneServer], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
