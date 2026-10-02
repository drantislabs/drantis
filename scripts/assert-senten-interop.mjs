import { readFileSync } from 'node:fs';

const [bundlePath, resultPath] = process.argv.slice(2);
if (!bundlePath || !resultPath) {
  console.error('Usage: node scripts/assert-senten-interop.mjs <bundle.json> <result.json>');
  process.exit(3);
}
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
const result = JSON.parse(readFileSync(resultPath, 'utf8'));
const failures = [];
if (result.schemaVersion !== '0.1') failures.push('unexpected Drantis-compatible result schema');
if (result.kind !== 'launchproof-verification-result') failures.push('unexpected Drantis-compatible result kind');
if (result.sourceBundleId !== bundle.id) failures.push('source bundle id mismatch');
if (result.sourceBundleDigest !== bundle.digest) failures.push('source bundle digest mismatch');
if (result.verifier?.name !== 'LaunchProof') failures.push('verifier name is not LaunchProof');
if (!Array.isArray(result.results) || result.results.length !== bundle.claims.length)
  failures.push('claim result count does not match Senten bundle');
if (result.results?.some((item) => item.outcome === 'verified'))
  failures.push('static fixture unexpectedly produced independent verified assurance');
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(2);
}
console.log(
  `PASS: Senten ${bundle.sentenVersion} exchange → Drantis result ${result.id}; claims=${result.results.length}`,
);
