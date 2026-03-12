import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const attributionFile = path.join(distDir, 'chunk-attribution.json');
const assetsDir = path.join(distDir, 'assets');

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function readAttribution() {
  if (!fs.existsSync(attributionFile)) {
    throw new Error(`chunk attribution file not found: ${attributionFile}`);
  }
  return JSON.parse(fs.readFileSync(attributionFile, 'utf8'));
}

function readChunkSizes() {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`dist assets directory not found: ${assetsDir}`);
  }
  return new Map(
    fs.readdirSync(assetsDir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => [file, fs.statSync(path.join(assetsDir, file)).size]),
  );
}

const payload = readAttribution();
const chunkSizes = readChunkSizes();

const sortedChunks = payload.chunks
  .map((chunk) => ({
    ...chunk,
    sizeBytes: chunkSizes.get(chunk.file.replace(/^assets\//, '')) || 0,
  }))
  .sort((left, right) => right.sizeBytes - left.sizeBytes);

console.log('Chunk attribution');
for (const chunk of sortedChunks.slice(0, 5)) {
  console.log(`\n${chunk.file} (${formatKiB(chunk.sizeBytes)})`);
  for (const module of chunk.modules.slice(0, 10)) {
    console.log(`- ${module.id}: ${formatKiB(module.renderedLength)}`);
  }
}
