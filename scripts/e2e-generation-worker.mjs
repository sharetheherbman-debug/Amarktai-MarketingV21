import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.E2E_GENERATION_WORKER_HEALTH_PORT || 4101);
const worker = spawn(process.execPath, ['apps/api/dist/workers/generation-worker.js'], {
  env: process.env,
  stdio: 'inherit',
});

let shuttingDown = false;
const healthServer = createServer((_request, response) => {
  if (worker.exitCode !== null) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'failed', exitCode: worker.exitCode }));
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status: 'ready', pid: worker.pid }));
});

healthServer.listen(port, host, () => {
  process.stdout.write(`E2E generation worker health endpoint listening on http://${host}:${port}\n`);
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  healthServer.close(() => {
    if (worker.exitCode === null) worker.kill(signal);
  });
  setTimeout(() => {
    if (worker.exitCode === null) worker.kill('SIGKILL');
  }, 5_000).unref();
}

worker.on('exit', (code, signal) => {
  healthServer.close(() => process.exit(code ?? (signal ? 1 : 0)));
});

worker.on('error', (error) => {
  process.stderr.write(`E2E generation worker failed to start: ${error.message}\n`);
  healthServer.close(() => process.exit(1));
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
