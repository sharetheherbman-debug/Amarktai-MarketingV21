#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHECKS = [
  { name: 'verify-types', label: 'TypeScript' },
  { name: 'verify-build', label: 'Build' },
  { name: 'verify-docs', label: 'Documentation' },
  { name: 'verify-routes', label: 'Routes' },
  { name: 'verify-database', label: 'Database' },
  { name: 'verify-security', label: 'Security' },
  { name: 'verify-branding', label: 'Branding' },
  { name: 'verify-version', label: 'Version' },
];

const results = [];

function runCheck(name, label) {
  process.stdout.write(`\n  ${label}... `);
  try {
    execSync(`node scripts/${name}.js`, { stdio: 'pipe', cwd: path.join(__dirname, '..') });
    console.log('\x1b[32mPASS\x1b[0m');
    results.push({ label, status: 'PASS' });
    return true;
  } catch (err) {
    console.log('\x1b[31mFAIL\x1b[0m');
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.log(err.stderr.toString());
    results.push({ label, status: 'FAIL' });
    return false;
  }
}

console.log('\n\x1b[1mAmarktAI Marketing - Verification Suite\x1b[0m');
console.log('─'.repeat(40));

let allPassed = true;
for (const check of CHECKS) {
  const passed = runCheck(check.name, check.label);
  if (!passed) allPassed = false;
}

console.log('\n' + '─'.repeat(40));
console.log('\x1b[1mSummary:\x1b[0m');
for (const r of results) {
  const color = r.status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${r.label}: ${color}${r.status}\x1b[0m`);
}

console.log('\n' + '─'.repeat(40));
if (allPassed) {
  console.log('\x1b[32m\x1b[1mAll checks passed.\x1b[0m');
  process.exit(0);
} else {
  console.log('\x1b[31m\x1b[1mSome checks failed.\x1b[0m');
  process.exit(1);
}
