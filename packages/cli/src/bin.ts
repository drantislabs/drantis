#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createLaunchProofVerificationResult,
  generateLaunchProofSigningKey,
  parseSentenAssuranceExchange,
  signLaunchProofVerificationResult,
} from '@launchproof/integrations';
import { launchProofCapabilities } from '@launchproof/core';
import { analyzeRepository, formatReport, toSarif } from './index.js';

const args = process.argv.slice(2);
const command = args.shift() ?? 'analyze';

function values(flag: string) {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++)
    if (args[i] === flag && args[i + 1]) result.push(args[i + 1]!);
  return result;
}
function value(flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
function has(flag: string) {
  return args.includes(flag);
}
function positional(defaultValue = '.') {
  return !args[0]?.startsWith('--') ? (args.shift() ?? defaultValue) : defaultValue;
}

async function writeStructured(file: string, data: unknown) {
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function readBounded(file: string, maxBytes = 10_000_000) {
  const resolved = path.resolve(file);
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error(`Input is not a regular file: ${file}`);
  if (info.size > maxBytes) throw new Error(`Input exceeds safe size limit (${maxBytes} bytes): ${file}`);
  return readFile(resolved, 'utf8');
}

function scannerResults() {
  return values('--scanner').map((spec) => {
    const split = spec.indexOf(':');
    if (split < 1) throw new Error('--scanner expects format:path');
    return { format: spec.slice(0, split), path: spec.slice(split + 1) };
  });
}

async function sentenCommand() {
  const operation = args.shift() ?? 'inspect';

  if (operation === 'keygen') {
    const directory = positional('.launchproof/keys');
    const publisher = value('--publisher') ?? 'launchproof';
    const keys = await generateLaunchProofSigningKey(directory, publisher);
    console.log(
      [
        'LaunchProof signing key generated',
        `Key ID:     ${keys.keyId}`,
        `Private:    ${keys.privateKeyPath}`,
        `Public:     ${keys.publicKeyPath}`,
        '',
        'Trust this public key in the Senten project with:',
        `  senten trust add "${keys.publicKeyPath}" --publisher ${publisher}`,
      ].join('\n'),
    );
    return;
  }

  const bundleFile = positional();
  if (bundleFile === '.')
    throw new Error(
      'Usage: launchproof senten inspect <senten-assurance.json> | senten verify <senten-assurance.json> [--repo path --output result.json --sign-key key.pem] | senten keygen [directory]',
    );
  const bundle = parseSentenAssuranceExchange(await readBounded(bundleFile));

  if (operation === 'inspect') {
    console.log(
      [
        `Senten assurance exchange ${bundle.id}`,
        `Senten:      ${bundle.sentenVersion}`,
        `Application: ${bundle.application.name}`,
        `Claims:      ${bundle.claims.length}`,
        `Evidence:    ${bundle.evidence.length}`,
        `StateTruss:  ${bundle.stateTrussDigest.slice(0, 20)}…`,
        `Digest:      ${bundle.digest}`,
        `Environment: ${bundle.provenance.environment ?? 'unspecified'}`,
      ].join('\n'),
    );
    return;
  }

  if (operation !== 'verify')
    throw new Error('Usage: launchproof senten <inspect|verify|keygen> ...');

  const repository = value('--repo') ?? '.';
  const report = await analyzeRepository(repository, {
    scannerResults: scannerResults(),
    sentenAssuranceExchanges: [bundle],
    authorizeDynamicVerification: has('--allow-execution'),
    allowedRunnerImages: values('--runner-image'),
    requirePinnedRunnerImage: true,
  });

  let result = createLaunchProofVerificationResult(bundle, report);
  const signingKey = value('--sign-key');
  if (signingKey) {
    result = signLaunchProofVerificationResult(
      result,
      await readBounded(signingKey, 100_000),
      value('--publisher') ?? 'launchproof',
    );
  }

  const output = value('--output') ?? 'launchproof-result.json';
  await writeStructured(output, result);
  const reportFile = value('--report');
  if (reportFile) await writeStructured(reportFile, report);

  const counts = result.results.reduce(
    (acc, item) => {
      acc[item.outcome] += 1;
      return acc;
    },
    { verified: 0, failed: 0, unknown: 0, inconclusive: 0 },
  );
  console.log(
    [
      formatReport(report),
      '',
      `Senten exchange: ${bundle.id}`,
      `Result bundle:   ${result.id}`,
      `Verified:        ${counts.verified}`,
      `Failed:          ${counts.failed}`,
      `Inconclusive:    ${counts.inconclusive}`,
      `Unknown:         ${counts.unknown}`,
      `Signed:          ${result.signature ? `yes (${result.signature.keyId})` : 'no'}`,
      `Output:          ${path.resolve(output)}`,
      '',
      `Import with: senten launchproof import "${path.resolve(output)}" --source "${path.resolve(bundleFile)}"`,
    ].join('\n'),
  );
  if (counts.failed > 0) process.exitCode = 2;
  else if (counts.unknown > 0 || counts.inconclusive > 0) process.exitCode = 1;
}

async function main() {
  if (command === 'capabilities') {
    console.log(JSON.stringify(launchProofCapabilities(), null, 2));
    return;
  }

  if (command === 'senten') {
    await sentenCommand();
    return;
  }

  const target = positional();
  if (command === 'report') {
    const file = target === '.' ? '.launchproof/report.json' : target;
    const report = JSON.parse(await readFile(file, 'utf8'));
    const format = value('--format') ?? 'summary';
    console.log(
      format === 'json'
        ? JSON.stringify(report, null, 2)
        : format === 'sarif'
          ? JSON.stringify(toSarif(report), null, 2)
          : formatReport(report),
    );
    return;
  }
  if (!['analyze', 'verify'].includes(command))
    throw new Error(
      'Usage: launchproof analyze [path] [--json file] [--sarif file] [--scanner format:file] | verify [path] [--allow-execution --runner-image sha256:<id>] | report [file] [--format summary|json|sarif] | senten <inspect|verify|keygen> ... | capabilities',
    );

  const report = await analyzeRepository(target, {
    scannerResults: scannerResults(),
    authorizeDynamicVerification: command === 'verify' && has('--allow-execution'),
    allowedRunnerImages: values('--runner-image'),
    requirePinnedRunnerImage: true,
  });
  const jsonFile = value('--json');
  if (jsonFile) await writeStructured(jsonFile, report);
  const sarifFile = value('--sarif');
  if (sarifFile) await writeStructured(sarifFile, toSarif(report));
  console.log(formatReport(report));
  if (command === 'verify') {
    if (report.release.status === 'BLOCKED' || report.release.status === 'INCOMPLETE')
      process.exitCode = 2;
    else if (
      report.release.status === 'REVIEW_REQUIRED' ||
      report.release.status === 'READY_WITH_CONDITIONS'
    )
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`LaunchProof error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 3;
});
