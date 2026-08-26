#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'apps', 'web', '.next');
const variants = [
  { name: 'AmarktAI Marketing', logo: '/logo.svg', host: 'AmarktAI', primary: '#0A1B3F', accent: '#5AA469' },
  { name: 'EquiProfile Marketing', logo: '/favicon.svg', host: 'EquiProfile', primary: '#2456A6', accent: '#D4A72C' },
  { name: 'Northstar Growth', logo: '/logo.svg', host: 'Northstar Suite', primary: '#6B2D5C', accent: '#2AA198' },
];

function corpus(directory) {
  const chunks = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:js|json|html|txt|rsc)$/i.test(entry.name)) chunks.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(directory);
  return chunks.join('\n');
}

for (const variant of variants) {
  fs.rmSync(output, { recursive: true, force: true });
  const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm run build --workspace=@amarktai/web']
    : ['run', 'build', '--workspace=@amarktai/web'];
  execFileSync(executable, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: '/api',
      NEXT_PUBLIC_MARKETING_BRAND_NAME: variant.name,
      NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION: `${variant.name} build-level acceptance`,
      NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL: 'support@example.test',
      NEXT_PUBLIC_MARKETING_BRAND_LOGO_URL: variant.logo,
      NEXT_PUBLIC_MARKETING_HOST_APPLICATION_NAME: variant.host,
      NEXT_PUBLIC_MARKETING_BRAND_PRIMARY_COLOR: variant.primary,
      NEXT_PUBLIC_MARKETING_BRAND_ACCENT_COLOR: variant.accent,
    },
  });
  const built = corpus(output);
  for (const expected of Object.values(variant)) {
    if (!built.includes(expected)) throw new Error(`Built output omitted white-label value: ${expected}`);
  }
  console.log(`PASS white-label build: ${variant.name}`);
}
