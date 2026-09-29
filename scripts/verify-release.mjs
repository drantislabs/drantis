import { mkdirSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const bootstrap = args.has('--bootstrap');
const withE2E = args.has('--e2e');
const withDocker = args.has('--docker');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const logRoot = join(root, '.launchproof', 'verification', stamp);
mkdirSync(logRoot, { recursive: true });

const status = (message) => console.log(`[LaunchProof 1.0 RC] ${message}`);
const windowsCommandWrappers = new Set(['npm', 'npx']);

function resolveInvocation(command, commandArgs) {
  if (process.platform === 'win32' && windowsCommandWrappers.has(command)) {
    return {
      executable: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `${command}.cmd`, ...commandArgs],
    };
  }
  return { executable: command, args: commandArgs };
}

function runGate(name, command, commandArgs = []) {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '-');
  const logPath = join(logRoot, `${safe}.log`);
  const display = `${command} ${commandArgs.join(' ')}`.trim();
  status(`RUN  ${name}`);
  writeFileSync(logPath, `# ${display}\n`, 'utf8');
  const invocation = resolveInvocation(command, commandArgs);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (combined) {
    process.stdout.write(combined);
    appendFileSync(logPath, combined, 'utf8');
  }
  if (result.error) {
    appendFileSync(logPath, `\n${result.error.stack ?? result.error.message}\n`, 'utf8');
    throw result.error;
  }
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`[LaunchProof 1.0 RC] FAIL ${name} (exit ${code})`);
    console.error(`Log: ${logPath}`);
    process.exit(code);
  }
  status(`PASS ${name}`);
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: code };
}

const major = Number(process.versions.node.split('.')[0]);
if (![24, 26].includes(major)) {
  console.error(
    `LaunchProof 1.0 RC verification supports Node 24.x (LTS baseline) or Node 26.x (forward-compatibility lane); found v${process.versions.node}.`,
  );
  process.exit(3);
}
const lane = major === 24 ? 'LTS baseline' : 'forward compatibility';
status(`Repository: ${root}`);
status(`Logs: ${logRoot}`);
status(`Node runtime: v${process.versions.node} (${lane} lane)`);

if (existsSync(join(root, '.git'))) {
  runGate('git-status', 'git', ['status', '--short']);
} else {
  const archiveLog = join(logRoot, 'git-status.log');
  const message =
    'Source archive mode: .git metadata is not present; live Git status/provenance checks are unavailable for this artifact. Build/test/security gates remain mandatory.\n';
  writeFileSync(archiveLog, message, 'utf8');
  status('SKIP git-status (.git metadata not present; source archive mode)');
}
runGate('npm-version', 'npm', ['--version']);

if (bootstrap) {
  runGate('npm-install-bootstrap', 'npm', ['install', '--ignore-scripts']);
  if (!existsSync(join(root, 'package-lock.json'))) {
    console.error(
      'npm install completed without creating package-lock.json; refusing to continue.',
    );
    process.exit(3);
  }
} else {
  if (!existsSync(join(root, 'package-lock.json'))) {
    console.error(
      'package-lock.json is missing. Re-run with --bootstrap once to create the genuine lockfile.',
    );
    process.exit(3);
  }
  runGate('npm-ci', 'npm', ['ci', '--ignore-scripts']);
}

runGate('format-check', 'npm', ['run', 'format:check']);
runGate('lint', 'npm', ['run', 'lint']);
runGate('typecheck', 'npm', ['run', 'typecheck']);
runGate('unit-integration-tests', 'npm', ['test']);
runGate('web-production-build', 'npm', ['run', 'build', '-w', '@launchproof/web']);
runGate('cli-production-build', 'npm', ['run', 'build', '-w', '@launchproof/cli']);
runGate('cli-package-dry-run', 'npm', ['pack', '-w', '@launchproof/cli', '--dry-run']);

const referenceReport = join(logRoot, 'production-reference.json');
const regressionReport = join(logRoot, 'missing-tenant-authorization.json');
const sentenReport = join(logRoot, 'senten-reference.json');
const scannerReport = join(logRoot, 'scanner-fixtures.json');
const selfReport = join(logRoot, 'self-report.json');
runGate('cli-production-reference', 'npm', [
  'run',
  'cli',
  '--',
  'analyze',
  'scenarios/production-reference',
  '--json',
  referenceReport,
]);
runGate('cli-tenant-regression', 'npm', [
  'run',
  'cli',
  '--',
  'analyze',
  'scenarios/missing-tenant-authorization',
  '--json',
  regressionReport,
]);
runGate('cli-senten-reference', 'npm', [
  'run',
  'cli',
  '--',
  'analyze',
  'scenarios/senten-reference',
  '--json',
  sentenReport,
]);
runGate('release-scenario-assertions', 'npm', [
  'run',
  'verify:scenarios',
  '--',
  referenceReport,
  regressionReport,
  sentenReport,
]);
runGate('scanner-fixture-analysis', 'npm', [
  'run',
  'cli',
  '--',
  'analyze',
  'scenarios/production-reference',
  '--scanner',
  'semgrep-json:tests/fixtures/scanners/semgrep.json',
  '--scanner',
  'gitleaks-json:tests/fixtures/scanners/gitleaks.json',
  '--scanner',
  'osv-json:tests/fixtures/scanners/osv.json',
  '--scanner',
  'trivy-json:tests/fixtures/scanners/trivy.json',
  '--json',
  scannerReport,
]);
runGate('scanner-fixture-assertions', 'npm', ['run', 'verify:scanners', '--', scannerReport]);
const sentenNativeResult = join(logRoot, 'senten-native-result.json');
runGate('senten-native-assurance', 'npm', [
  'run',
  'cli',
  '--',
  'senten',
  'verify',
  'tests/fixtures/senten/assurance-exchange.json',
  '--repo',
  'scenarios/production-reference',
  '--output',
  sentenNativeResult,
]);
runGate('senten-native-assurance-assertions', 'npm', [
  'run',
  'verify:senten-interop',
  '--',
  'tests/fixtures/senten/assurance-exchange.json',
  sentenNativeResult,
]);
runGate('cli-self-analysis', 'npm', ['run', 'cli', '--', 'analyze', '.', '--json', selfReport]);

if (withE2E) {
  runGate('playwright-browser-install', 'npx', ['playwright', 'install', 'chromium']);
  runGate('playwright-e2e', 'npm', ['run', 'test:e2e']);
}
if (withDocker) {
  runGate('docker-version', 'docker', ['--version']);
  runGate('docker-compose-version', 'docker', ['compose', 'version']);
  runGate('docker-build', 'docker', ['build', '-t', 'launchproof:1.0.0-rc.1', '.']);
  runGate('docker-compose-config', 'docker', ['compose', 'config', '--quiet']);
  runGate('isolated-runner-image-build', 'docker', [
    'build',
    '-f',
    'tests/fixtures/runner/Dockerfile',
    '-t',
    'launchproof-runner:rc',
    'tests/fixtures/runner',
  ]);
  const inspect = runGate('isolated-runner-image-id', 'docker', [
    'image',
    'inspect',
    'launchproof-runner:rc',
    '--format',
    '{{.Id}}',
  ]);
  const runnerImage = inspect.stdout.trim();
  runGate('authorized-isolated-runner', 'npm', [
    'run',
    'verify:isolated-runner',
    '--',
    runnerImage,
  ]);
}

console.log('');
status('V1 BASELINE CHECKPOINT PASSED');
status(`Evidence directory: ${logRoot}`);
status(
  'Next checkpoint: scanner ingestion, isolated-runner, desktop, Senten, and release-artifact verification.',
);
