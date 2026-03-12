import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const distAssetsDir = path.resolve(process.cwd(), 'dist/assets');

const budgets = [
  { name: 'main shared chunk', pattern: /^index-.*\.js$/, maxBytes: 380_000 },
  { name: 'Ant Design vendor chunk', pattern: /^vendor-antd-.*\.js$/, maxBytes: 1_150_000 },
  { name: 'charts vendor chunk', pattern: /^vendor-charts-.*\.js$/, maxBytes: 370_000 },
  { name: 'markdown vendor chunk', pattern: /^vendor-markdown-.*\.js$/, maxBytes: 170_000 },
  { name: 'React vendor chunk', pattern: /^vendor-react-.*\.js$/, maxBytes: 210_000 },
  { name: 'i18n vendor chunk', pattern: /^vendor-i18n-.*\.js$/, maxBytes: 70_000 },
];

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function readChunkStats() {
  if (!fs.existsSync(distAssetsDir)) {
    throw new Error(`dist assets directory not found: ${distAssetsDir}`);
  }

  return fs
    .readdirSync(distAssetsDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => {
      const fullPath = path.join(distAssetsDir, file);
      const sizeBytes = fs.statSync(fullPath).size;
      return { file, sizeBytes };
    })
    .sort((left, right) => right.sizeBytes - left.sizeBytes);
}

function findBudgetViolations(chunks) {
  return budgets.flatMap((budget) =>
    chunks
      .filter((chunk) => budget.pattern.test(chunk.file))
      .filter((chunk) => chunk.sizeBytes > budget.maxBytes)
      .map((chunk) => ({ budget, chunk })),
  );
}

const chunks = readChunkStats();
const violations = findBudgetViolations(chunks);

if (args.has('--json')) {
  const payload = {
    chunks,
    violations: violations.map(({ budget, chunk }) => ({
      name: budget.name,
      file: chunk.file,
      sizeBytes: chunk.sizeBytes,
      maxBytes: budget.maxBytes,
    })),
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(violations.length > 0 ? 1 : 0);
}

console.log('Top JavaScript chunks');
for (const chunk of chunks.slice(0, 12)) {
  console.log(`- ${chunk.file}: ${formatKiB(chunk.sizeBytes)}`);
}

console.log('\nBundle budgets');
for (const budget of budgets) {
  const matched = chunks.filter((chunk) => budget.pattern.test(chunk.file));
  if (matched.length === 0) {
    console.log(`- ${budget.name}: no matching chunk`);
    continue;
  }

  for (const chunk of matched) {
    const status = chunk.sizeBytes > budget.maxBytes ? 'OVER' : 'OK';
    console.log(
      `- ${budget.name}: ${chunk.file} ${formatKiB(chunk.sizeBytes)} / budget ${formatKiB(budget.maxBytes)} [${status}]`,
    );
  }
}

if (violations.length > 0) {
  console.error('\nBundle budget violations detected.');
  process.exit(1);
}

console.log('\nBundle budgets satisfied.');
