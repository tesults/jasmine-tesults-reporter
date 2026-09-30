const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tesults = require('tesults');
const reporter = require('./jasmine-tesults-reporter');
const packageVersion = require('./package.json').version;

const originalResults = tesults.results;
const originalArgv = process.argv;
const originalOutputFileEnv = process.env.TESULTS_OUTPUT_FILE;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jasmine-tesults-reporter-'));
const uploads = [];
let uploadError;

tesults.results = (data, callback) => {
  uploads.push(JSON.parse(JSON.stringify(data)));
  callback(uploadError, {
    success: true,
    message: 'ok',
    warnings: [],
    errors: []
  });
};

function makeSpec(id, description, status, options = {}) {
  return {
    id,
    description,
    fullName: `${options.suite || 'Checkout'} ${description}`,
    status,
    duration: options.duration === undefined ? 12 : options.duration,
    passedExpectations: options.passedExpectations || [],
    failedExpectations: options.failedExpectations || [],
    deprecationWarnings: options.deprecationWarnings || [],
    debugLogs: options.debugLogs || [],
    properties: options.properties,
    pendingReason: options.pendingReason
  };
}

function runReporter({ argv = [], specs = [], enhance } = {}) {
  process.argv = [originalArgv[0], originalArgv[1], ...argv];
  reporter.jasmineStarted({});
  for (const spec of specs) {
    reporter.specStarted(spec);
    if (enhance) enhance(spec);
    reporter.specDone(spec);
  }
  let doneCalls = 0;
  reporter.jasmineDone({}, () => {
    doneCalls += 1;
  });
  return doneCalls;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

try {
  delete process.env.TESULTS_OUTPUT_FILE;

  const filesRoot = path.join(tempDir, 'captured');
  const caseFilesDir = path.join(filesRoot, 'Checkout', 'passes');
  const configuredFile = path.join(caseFilesDir, 'runner.log');
  const supplementalFile = path.join(tempDir, 'screenshot.png');
  fs.mkdirSync(caseFilesDir, { recursive: true });
  fs.writeFileSync(configuredFile, 'log');
  fs.writeFileSync(supplementalFile, 'image');

  const pass = makeSpec('spec-pass', 'passes', 'passed', {
    properties: { Runtime: 'node' },
    debugLogs: [{ message: 'debug' }]
  });
  const fail = makeSpec('spec-fail', 'fails', 'failed', {
    failedExpectations: [{
      message: 'Expected true to be false',
      stack: 'Error: Expected true to be false\n    at spec.js:10:2'
    }]
  });
  const pending = makeSpec('spec-pending', 'is pending', 'pending', {
    suite: 'Other',
    pendingReason: 'Temporarily disabled'
  });

  const targetDoneCalls = runReporter({
    argv: [
      'tesults-target=target-token',
      `tesults-files=${filesRoot}`,
      'tesults-build-name=build',
      'tesults-build-desc=build description',
      'tesults-build-result=PASS',
      'tesults-build-reason=build reason'
    ],
    specs: [pass, fail, pending],
    enhance(spec) {
      if (spec !== pass) return;
      reporter.file(supplementalFile);
      reporter.file(supplementalFile);
      reporter.description('checkout description');
      reporter.step({ name: 'open cart', result: 'pass', description: 'opened' });
      reporter.step({ name: 'open cart', result: 'pass' });
      reporter.custom('Browser', 'chromium');
    }
  });

  assert.strictEqual(targetDoneCalls, 1);
  assert.strictEqual(uploads.length, 1);
  const targetPayload = uploads[0];
  assert.strictEqual(targetPayload.target, 'target-token');
  assert.deepStrictEqual(targetPayload.metadata, {
    integration_name: 'jasmine-tesults-reporter',
    integration_version: packageVersion,
    test_framework: 'jasmine'
  });
  assert.strictEqual(targetPayload.results.cases.length, 4);
  const passed = targetPayload.results.cases[0];
  assert.strictEqual(passed.name, 'passes');
  assert.strictEqual(passed.suite, 'Checkout');
  assert.strictEqual(passed.result, 'pass');
  assert.strictEqual(passed.rawResult, 'passed');
  assert.strictEqual(passed.duration, 12);
  assert.ok(Number.isInteger(passed.start));
  assert.ok(Number.isInteger(passed.end));
  assert.deepStrictEqual(passed.files, [configuredFile, supplementalFile]);
  assert.strictEqual(passed.desc, 'checkout description');
  assert.deepStrictEqual(passed.steps, [{ name: 'open cart', result: 'pass', desc: 'opened' }]);
  assert.strictEqual(passed._Browser, 'chromium');
  assert.strictEqual(passed._Runtime, 'node');
  assert.strictEqual(targetPayload.results.cases[1].result, 'fail');
  assert.ok(targetPayload.results.cases[1].reason.includes('Expected true to be false'));
  assert.strictEqual(targetPayload.results.cases[2].result, 'unknown');
  assert.strictEqual(targetPayload.results.cases[2]['_Pending reason'], 'Temporarily disabled');
  assert.deepStrictEqual(targetPayload.results.cases[3], {
    suite: '[build]',
    name: 'build',
    desc: 'build description',
    reason: 'build reason',
    result: 'pass'
  });

  const fileOnlyPath = path.join(tempDir, 'file-only', 'tesults-results.json');
  const fileDoneCalls = runReporter({
    argv: [`tesults-output-file=${fileOnlyPath}`],
    specs: [makeSpec('file-only', 'file only', 'passed')]
  });
  assert.strictEqual(fileDoneCalls, 1);
  assert.strictEqual(uploads.length, 1);
  assert.strictEqual(readJson(fileOnlyPath).target, '');
  assert.strictEqual(readJson(fileOnlyPath).results.cases[0].name, 'file only');

  const bothPath = path.join(tempDir, 'both', 'tesults-results.json');
  runReporter({
    argv: ['tesults-target=target-token-both', `tesults-output-file=${bothPath}`],
    specs: [makeSpec('both', 'both', 'passed')]
  });
  assert.strictEqual(uploads.length, 2);
  assert.strictEqual(uploads[1].target, 'target-token-both');
  assert.strictEqual(readJson(bothPath).target, '');
  assert.deepStrictEqual(readJson(bothPath).results, uploads[1].results);
  assert.deepStrictEqual(readJson(bothPath).metadata, uploads[1].metadata);

  const envOnlyPath = path.join(tempDir, 'env-only', 'tesults-results.json');
  process.env.TESULTS_OUTPUT_FILE = envOnlyPath;
  runReporter({ specs: [makeSpec('env-only', 'environment', 'passed')] });
  assert.ok(fs.existsSync(envOnlyPath));
  assert.strictEqual(uploads.length, 2);

  const cliPath = path.join(tempDir, 'env-wins', 'cli.json');
  const envPath = path.join(tempDir, 'env-wins', 'environment.json');
  process.env.TESULTS_OUTPUT_FILE = envPath;
  runReporter({
    argv: [`tesults-output-file=${cliPath}`],
    specs: [makeSpec('override', 'override', 'passed')]
  });
  assert.ok(fs.existsSync(envPath));
  assert.ok(!fs.existsSync(cliPath));

  process.env.TESULTS_OUTPUT_FILE = '';
  const emptyEnvFallbackPath = path.join(tempDir, 'empty-env', 'configured.json');
  runReporter({
    argv: [`tesults-output-file=${emptyEnvFallbackPath}`],
    specs: [makeSpec('fallback', 'fallback', 'passed')]
  });
  assert.ok(fs.existsSync(emptyEnvFallbackPath));

  delete process.env.TESULTS_OUTPUT_FILE;
  const disabledDoneCalls = runReporter({ specs: [makeSpec('disabled', 'disabled', 'passed')] });
  assert.strictEqual(disabledDoneCalls, 1);
  assert.strictEqual(uploads.length, 2);

  uploadError = new Error('upload failed');
  runReporter({
    argv: ['tesults-target=upload-error-target'],
    specs: [makeSpec('upload-error', 'upload error', 'passed')]
  });
  assert.strictEqual(uploads.length, 3);
  uploadError = undefined;

  assert.throws(() => runReporter({
    argv: [`tesults-output-file=${tempDir}`],
    specs: [makeSpec('write-error', 'write error', 'passed')]
  }), (err) => err && (err.code === 'EISDIR' || /directory/i.test(err.message)));

  assert.throws(() => runReporter({
    argv: ['tesults-target=target-despite-write-error', `tesults-output-file=${tempDir}`],
    specs: [makeSpec('write-upload-error', 'write and upload error', 'passed')]
  }), (err) => err && (err.code === 'EISDIR' || /directory/i.test(err.message)));
  assert.strictEqual(uploads.length, 4);
  assert.strictEqual(uploads[3].target, 'target-despite-write-error');

  const integrationDir = path.join(tempDir, 'integration');
  const specDir = path.join(integrationDir, 'spec');
  const helperDir = path.join(specDir, 'helpers');
  const supportDir = path.join(specDir, 'support');
  const integrationOutput = path.join(integrationDir, 'results', 'tesults-results.json');
  const integrationAttachment = path.join(integrationDir, 'attachment.txt');
  fs.mkdirSync(helperDir, { recursive: true });
  fs.mkdirSync(supportDir, { recursive: true });
  fs.writeFileSync(integrationAttachment, 'attachment');
  fs.writeFileSync(path.join(helperDir, 'tesults.js'), `
const reporter = require(${JSON.stringify(path.join(__dirname, 'jasmine-tesults-reporter.js'))});
jasmine.getEnv().addReporter(reporter);
`);
  fs.writeFileSync(path.join(specDir, 'liveSpec.js'), `
const reporter = require(${JSON.stringify(path.join(__dirname, 'jasmine-tesults-reporter.js'))});

describe('real jasmine', function () {
  it('passes with a file', function () {
    reporter.file(${JSON.stringify(integrationAttachment)});
    expect(2 + 2).toBe(4);
  });

  it('fails as expected', function () {
    expect(true).toBe(false);
  });

  xit('is pending', function () {});
});
`);
  fs.writeFileSync(path.join(supportDir, 'jasmine.json'), JSON.stringify({
    spec_dir: 'spec',
    spec_files: ['**/*[sS]pec.?(m)js'],
    helpers: ['helpers/**/*.?(m)js'],
    random: false
  }, null, 2));

  const jasmineRoot = path.resolve(path.dirname(require.resolve('jasmine')), '..');
  const jasmineBin = ['bin/jasmine.js', 'bin/jasmine']
    .map((candidate) => path.join(jasmineRoot, candidate))
    .find((candidate) => fs.existsSync(candidate));
  assert.ok(jasmineBin, 'Unable to locate the Jasmine CLI executable.');
  const integration = spawnSync(process.execPath, [
    jasmineBin,
    '--config=spec/support/jasmine.json',
    '--random=false'
  ], {
    cwd: integrationDir,
    env: { ...process.env, TESULTS_OUTPUT_FILE: integrationOutput },
    encoding: 'utf8'
  });
  assert.notStrictEqual(integration.status, 0, integration.stdout + integration.stderr);
  const integrationPayload = readJson(integrationOutput);
  assert.strictEqual(integrationPayload.target, '');
  assert.deepStrictEqual(integrationPayload.metadata, {
    integration_name: 'jasmine-tesults-reporter',
    integration_version: packageVersion,
    test_framework: 'jasmine'
  });
  assert.strictEqual(integrationPayload.results.cases.length, 3);
  const integrationPass = integrationPayload.results.cases.find((testCase) => testCase.name === 'passes with a file');
  const integrationFail = integrationPayload.results.cases.find((testCase) => testCase.name === 'fails as expected');
  const integrationPending = integrationPayload.results.cases.find((testCase) => testCase.name === 'is pending');
  assert.strictEqual(integrationPass.result, 'pass');
  assert.deepStrictEqual(integrationPass.files, [integrationAttachment]);
  assert.strictEqual(integrationFail.result, 'fail');
  assert.strictEqual(integrationPending.result, 'unknown');

  const cliOutput = path.join(integrationDir, 'results', 'tesults-results-cli.json');
  const cliEnv = { ...process.env };
  delete cliEnv.TESULTS_OUTPUT_FILE;
  const cliIntegration = spawnSync(process.execPath, [
    jasmineBin,
    '--config=spec/support/jasmine.json',
    '--random=false',
    '--',
    `tesults-output-file=${cliOutput}`
  ], {
    cwd: integrationDir,
    env: cliEnv,
    encoding: 'utf8'
  });
  assert.notStrictEqual(cliIntegration.status, 0, cliIntegration.stdout + cliIntegration.stderr);
  const cliPayload = readJson(cliOutput);
  assert.strictEqual(cliPayload.target, '');
  assert.strictEqual(cliPayload.results.cases.length, 3);

  console.log('All tests passed.');
} finally {
  tesults.results = originalResults;
  process.argv = originalArgv;
  if (originalOutputFileEnv === undefined) {
    delete process.env.TESULTS_OUTPUT_FILE;
  } else {
    process.env.TESULTS_OUTPUT_FILE = originalOutputFileEnv;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
