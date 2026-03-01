#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  'i18n',
  'scripts',
]);

const argv = new Set(process.argv.slice(2));
const shouldWriteBaseline = argv.has('--write-baseline');
const strictCheck = argv.has('--check');
const cwd = process.cwd();
const srcRoot = cwd;
const baselinePath = path.resolve(srcRoot, 'i18n/hardcoded-baseline.json');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }

    const ext = path.extname(entry.name);
    if (!SOURCE_EXT.has(ext)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function hasI18nCallAncestor(node) {
  let cursor = node.parent;
  while (cursor) {
    if (ts.isCallExpression(cursor)) {
      const callee = cursor.expression;
      if (ts.isIdentifier(callee) && callee.text === 't') return true;
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 't') return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function isTypeContext(node) {
  let cursor = node.parent;
  while (cursor) {
    if (
      ts.isTypeNode(cursor) ||
      ts.isTypeAliasDeclaration(cursor) ||
      ts.isInterfaceDeclaration(cursor)
    ) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function createFingerprint(file, kind, text) {
  const digest = crypto.createHash('sha1').update(`${file}|${kind}|${text}`, 'utf8').digest('hex');
  return digest;
}

function addFinding(findings, sf, fileRel, kind, node, rawText) {
  const text = normalizeText(rawText);
  if (!text) return;
  if (!CJK_RE.test(text)) return;
  if (hasI18nCallAncestor(node)) return;
  if (isTypeContext(node)) return;

  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  findings.push({
    file: fileRel,
    line: line + 1,
    col: character + 1,
    kind,
    text,
    fp: createFingerprint(fileRel, kind, text),
  });
}

function scanFile(absPath) {
  const code = fs.readFileSync(absPath, 'utf8');
  const rel = path.relative(srcRoot, absPath).replace(/\\/g, '/');
  const ext = path.extname(absPath).toLowerCase();
  const scriptKind =
    ext === '.tsx'
      ? ts.ScriptKind.TSX
      : ext === '.jsx'
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, scriptKind);
  const findings = [];

  function visit(node) {
    if (ts.isJsxText(node)) {
      addFinding(findings, sf, rel, 'jsxText', node, node.getText(sf));
    } else if (ts.isStringLiteral(node)) {
      addFinding(findings, sf, rel, 'stringLiteral', node, node.text);
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      addFinding(findings, sf, rel, 'templateLiteral', node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      const joined = normalizeText(node.getText(sf).replace(/`/g, ''));
      addFinding(findings, sf, rel, 'templateExpr', node, joined);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return findings;
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) return { entries: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (!raw || typeof raw !== 'object' || typeof raw.entries !== 'object') {
      return { entries: {} };
    }
    return raw;
  } catch {
    return { entries: {} };
  }
}

function toCounter(findings) {
  const counter = {};
  for (const f of findings) {
    const key = f.fp;
    counter[key] = (counter[key] || 0) + 1;
  }
  return counter;
}

function makeSampleMap(findings) {
  const sample = {};
  for (const f of findings) {
    if (sample[f.fp]) continue;
    sample[f.fp] = {
      file: f.file,
      line: f.line,
      col: f.col,
      kind: f.kind,
      text: f.text,
    };
  }
  return sample;
}

function printTopFiles(findings) {
  const fileCount = new Map();
  for (const f of findings) {
    fileCount.set(f.file, (fileCount.get(f.file) || 0) + 1);
  }
  const top = [...fileCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  if (!top.length) return;
  console.log('\nTop files by hardcoded strings:');
  for (const [file, count] of top) {
    console.log(`  ${count.toString().padStart(4, ' ')}  ${file}`);
  }
}

const files = walk(srcRoot).filter((f) => {
  const rel = path.relative(srcRoot, f).replace(/\\/g, '/');
  return !rel.startsWith('i18n/locales/');
});

const findings = files.flatMap((file) => scanFile(file));
const currentCounter = toCounter(findings);
const currentSample = makeSampleMap(findings);
const uniqueCurrent = Object.keys(currentCounter).length;

console.log(`Scanned files: ${files.length}`);
console.log(`Hardcoded CJK strings: ${findings.length} (unique: ${uniqueCurrent})`);
printTopFiles(findings);

if (shouldWriteBaseline) {
  const payload = {
    generated_at: new Date().toISOString(),
    total: findings.length,
    unique: uniqueCurrent,
    entries: currentCounter,
    samples: currentSample,
  };
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`\nBaseline updated: ${path.relative(srcRoot, baselinePath)}`);
  process.exit(0);
}

if (!strictCheck) {
  console.log('\nRun `npm run i18n:baseline` to freeze current baseline.');
  console.log('Run `npm run i18n:check` to block newly introduced hardcoded strings.');
  process.exit(0);
}

const baseline = loadBaseline();
const baselineCounter = baseline.entries || {};
const newItems = [];

for (const [fp, count] of Object.entries(currentCounter)) {
  const baseCount = Number(baselineCounter[fp] || 0);
  if (count > baseCount) {
    const over = count - baseCount;
    const sample = currentSample[fp];
    for (let i = 0; i < over; i += 1) {
      newItems.push(sample);
    }
  }
}

if (!newItems.length) {
  console.log('\nNo newly introduced hardcoded CJK strings compared with baseline.');
  process.exit(0);
}

console.error(`\nFound ${newItems.length} newly introduced hardcoded CJK strings:`);
for (const item of newItems.slice(0, 50)) {
  console.error(`  ${item.file}:${item.line}:${item.col} [${item.kind}] ${item.text}`);
}
if (newItems.length > 50) {
  console.error(`  ... and ${newItems.length - 50} more`);
}
process.exit(1);
