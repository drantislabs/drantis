import { readFileSync } from 'node:fs';

const expected = process.argv[2];
if (!expected) {
  console.error('Usage: node scripts/assert-release-version.mjs <version>');
  process.exit(3);
}

const manifests = [
  'package.json',
  'apps/web/package.json',
  'apps/desktop/package.json',
  'packages/analyzers/package.json',
  'packages/assurance/package.json',
  'packages/cli/package.json',
  'packages/contracts/package.json',
  'packages/core/package.json',
  'packages/evidence/package.json',
  'packages/graph/package.json',
  'packages/integrations/package.json',
  'packages/intelligence/package.json',
  'packages/policies/package.json',
  'packages/scoring/package.json',
  'packages/standards/package.json',
  'packages/ui/package.json',
];

const failures = [];
for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.version !== expected) {
    failures.push(`${path}: expected ${expected}, found ${manifest.version ?? 'missing'}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(2);
}
console.log(`PASS: all Drantis workspace manifests are version ${expected}`);
