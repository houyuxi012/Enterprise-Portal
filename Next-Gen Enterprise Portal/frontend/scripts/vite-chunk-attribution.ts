import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import type { NormalizedOutputOptions, OutputBundle, OutputChunk } from 'rollup';

function normalizeModuleId(rootDir: string, moduleId: string): string {
  const normalized = moduleId.replace(/\\/g, '/');
  const normalizedRoot = rootDir.replace(/\\/g, '/');
  if (normalized.startsWith(normalizedRoot)) {
    return path.relative(rootDir, moduleId).replace(/\\/g, '/');
  }
  const nodeModulesIndex = normalized.lastIndexOf('/node_modules/');
  if (nodeModulesIndex >= 0) {
    return normalized.slice(nodeModulesIndex + 1);
  }
  return normalized;
}

export function chunkAttributionPlugin(): Plugin {
  let rootDir = process.cwd();
  let outDir = path.resolve(rootDir, 'dist');

  return {
    name: 'chunk-attribution-report',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      rootDir = config.root;
      outDir = path.resolve(config.root, config.build.outDir || 'dist');
    },
    generateBundle(_outputOptions: NormalizedOutputOptions, bundle: OutputBundle) {
      const chunks = Object.values(bundle)
        .filter((asset): asset is OutputChunk => asset.type === 'chunk')
        .map((chunk) => {
          const modules = Object.entries(chunk.modules || {})
            .map(([moduleId, moduleInfo]) => ({
              id: normalizeModuleId(rootDir, moduleId),
              originalId: moduleId,
              renderedLength: moduleInfo.renderedLength || 0,
              removedExports: moduleInfo.removedExports || [],
              renderedExports: moduleInfo.renderedExports || [],
            }))
            .sort((left, right) => right.renderedLength - left.renderedLength);

          return {
            file: chunk.fileName,
            name: chunk.name,
            isEntry: chunk.isEntry,
            isDynamicEntry: chunk.isDynamicEntry,
            imports: chunk.imports,
            dynamicImports: chunk.dynamicImports,
            modules,
          };
        })
        .sort((left, right) => left.file.localeCompare(right.file));

      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'chunk-attribution.json'),
        `${JSON.stringify({ generatedAt: new Date().toISOString(), chunks }, null, 2)}\n`,
        'utf8',
      );
    },
  };
}
