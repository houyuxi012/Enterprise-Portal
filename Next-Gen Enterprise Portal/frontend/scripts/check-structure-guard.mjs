#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CONFIG_FILE = 'scripts/structure-guard.config.json';
const DEFAULT_MODE = 'normal';
const DEFAULT_OUTPUT = 'plain';

function nowIso() {
  return new Date().toISOString();
}

function writeReportIfNeeded(reportPath, payload) {
  if (!reportPath) return;
  const abs = path.resolve(process.cwd(), reportPath);
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function emit(payload, output, reportPath) {
  writeReportIfNeeded(reportPath, payload);
  if (output === 'json') {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (payload.status === 'pass') {
    console.log(`Frontend structure guard passed (mode=${payload.mode}).`);
    return;
  }
  console.error(`Frontend structure guard failed (mode=${payload.mode}, config=${payload.configPath}):`);
  if (payload.error) {
    console.error(`  - ${payload.error}`);
  }
  for (const item of payload.violations || []) {
    console.error(`  - ${item}`);
  }
}

function parseCliArgs(argv) {
  let config = DEFAULT_CONFIG_FILE;
  let mode = null;
  let output = DEFAULT_OUTPUT;
  let reportFile = '';

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--config') {
      const value = argv[i + 1];
      if (!value) throw new Error('--config requires a value');
      config = value;
      i += 1;
      continue;
    }
    if (key === '--mode') {
      const value = argv[i + 1];
      if (!value) throw new Error('--mode requires a value');
      mode = value;
      i += 1;
      continue;
    }
    if (key === '--output') {
      const value = argv[i + 1];
      if (!value) throw new Error('--output requires a value');
      output = value;
      i += 1;
      continue;
    }
    if (key === '--report-file') {
      const value = argv[i + 1];
      if (!value) throw new Error('--report-file requires a value');
      reportFile = value;
      i += 1;
      continue;
    }
    throw new Error(`unknown argument: ${key}`);
  }

  if (!['plain', 'json'].includes(output)) {
    throw new Error('--output must be one of: plain, json');
  }
  return { config, mode, output, reportFile };
}

function resolveMode(requestedMode, rawConfig) {
  return (
    requestedMode ||
    process.env.FRONTEND_STRUCTURE_GUARD_MODE ||
    process.env.STRUCTURE_GUARD_MODE ||
    rawConfig?.defaultMode ||
    DEFAULT_MODE
  );
}

function loadRawConfig(root, configRelativePath) {
  const configPath = path.resolve(root, configRelativePath);
  if (!fs.existsSync(configPath)) {
    throw new Error(`missing config ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid config ${configPath}: root must be a JSON object`);
  }
  return { configPath, rawConfig: parsed };
}

function pickModeConfig(rawConfig, requestedMode) {
  const mode = resolveMode(requestedMode, rawConfig);
  if (rawConfig.modes !== undefined) {
    if (!rawConfig.modes || typeof rawConfig.modes !== 'object' || Array.isArray(rawConfig.modes)) {
      throw new Error('invalid config: "modes" must be an object');
    }
    const modeConfig = rawConfig.modes[mode];
    if (!modeConfig) {
      const availableModes = Object.keys(rawConfig.modes).join(', ') || '(none)';
      throw new Error(`mode "${mode}" not found in config. Available modes: ${availableModes}`);
    }
    return { mode, modeConfig };
  }
  return { mode, modeConfig: rawConfig };
}

function validatePositiveInt(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid config: "${fieldName}" must be a positive integer`);
  }
}

function validateModeConfig(modeConfig) {
  if (!modeConfig || typeof modeConfig !== 'object' || Array.isArray(modeConfig)) {
    throw new Error('invalid config: mode config must be a JSON object');
  }
  if (typeof modeConfig.appFile !== 'string' || modeConfig.appFile.trim() === '') {
    throw new Error('invalid config: "appFile" must be a non-empty string');
  }
  validatePositiveInt(modeConfig.maxAppLines, 'maxAppLines');
  validatePositiveInt(modeConfig.maxAppImports, 'maxAppImports');

  if (!Array.isArray(modeConfig.forbiddenPatterns)) {
    throw new Error('invalid config: "forbiddenPatterns" must be an array');
  }
  for (const rule of modeConfig.forbiddenPatterns) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new Error('invalid config: each forbiddenPatterns item must be an object');
    }
    if (typeof rule.pattern !== 'string' || rule.pattern.trim() === '') {
      throw new Error('invalid config: each forbiddenPatterns item needs non-empty "pattern"');
    }
    if (typeof rule.message !== 'string' || rule.message.trim() === '') {
      throw new Error('invalid config: each forbiddenPatterns item needs non-empty "message"');
    }
    if (rule.flags !== undefined && typeof rule.flags !== 'string') {
      throw new Error('invalid config: forbiddenPatterns "flags" must be a string when provided');
    }
    new RegExp(rule.pattern, rule.flags ?? '');
  }
}

function runGuard() {
  const root = process.cwd();
  const cli = parseCliArgs(process.argv.slice(2));
  const { configPath, rawConfig } = loadRawConfig(root, cli.config);
  const { mode, modeConfig } = pickModeConfig(rawConfig, cli.mode);
  validateModeConfig(modeConfig);

  const appFile = modeConfig.appFile;
  const appPath = path.resolve(root, appFile);
  if (!fs.existsSync(appPath)) {
    throw new Error(`missing app file "${appPath}" (mode=${mode}, config=${configPath})`);
  }

  const source = fs.readFileSync(appPath, 'utf8');
  const lines = source.split(/\r?\n/);
  const lineCount = lines.length;
  const importLines = lines.filter((line) => /^\s*import\s+/.test(line)).length;

  const violations = [];
  if (lineCount > modeConfig.maxAppLines) {
    violations.push(
      `${appFile} is too large (${lineCount} lines > ${modeConfig.maxAppLines}). Move page orchestration into router/hooks managers.`,
    );
  }
  if (importLines > modeConfig.maxAppImports) {
    violations.push(
      `${appFile} has too many imports (${importLines} > ${modeConfig.maxAppImports}). Keep App as thin entry shell.`,
    );
  }
  for (const rule of modeConfig.forbiddenPatterns) {
    const re = new RegExp(rule.pattern, rule.flags ?? '');
    if (re.test(source)) {
      violations.push(rule.message);
    }
  }

  const payload = {
    tool: 'frontend-structure-guard',
    status: violations.length > 0 ? 'fail' : 'pass',
    mode,
    configPath,
    checkedAt: nowIso(),
    appFile,
    metrics: {
      lineCount,
      importCount: importLines,
      maxAppLines: modeConfig.maxAppLines,
      maxAppImports: modeConfig.maxAppImports,
    },
    violations,
  };
  emit(payload, cli.output, cli.reportFile);
  return payload.status === 'pass' ? 0 : 1;
}

function main() {
  try {
    return runGuard();
  } catch (error) {
    let cli = { output: DEFAULT_OUTPUT, reportFile: '', mode: DEFAULT_MODE, config: DEFAULT_CONFIG_FILE };
    try {
      cli = { ...cli, ...parseCliArgs(process.argv.slice(2)) };
    } catch (_) {
      // ignore parse errors here; we still return a structured failure
    }
    const payload = {
      tool: 'frontend-structure-guard',
      status: 'fail',
      mode: cli.mode || DEFAULT_MODE,
      configPath: path.resolve(process.cwd(), cli.config || DEFAULT_CONFIG_FILE),
      checkedAt: nowIso(),
      appFile: null,
      metrics: null,
      violations: [],
      error: error instanceof Error ? error.message : String(error),
    };
    emit(payload, cli.output, cli.reportFile);
    return 1;
  }
}

process.exit(main());
