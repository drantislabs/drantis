import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: node scripts/set-release-version.mjs <semver>');
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

function updateDependencies(manifest) {
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const dependencies = manifest[field];
    if (!dependencies) continue;
    for (const name of Object.keys(dependencies)) {
      if (name.startsWith('@launchproof/')) dependencies[name] = version;
    }
  }
}

for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.version = version;
  updateDependencies(manifest);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

console.log(
  `Updated ${manifests.length} Drantis workspace manifests to ${version}. Run npm install --package-lock-only --ignore-scripts, format-check, and the full release verifier before committing.`,
);
