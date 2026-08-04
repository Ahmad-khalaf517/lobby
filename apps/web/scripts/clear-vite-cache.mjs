import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Vite (via @angular/build's dev server) pre-bundles dependencies into a
 * cached folder keyed by package.json hashes — NOT by the file contents of
 * workspace packages. So when `packages/shared` changes and its `dist` is
 * rebuilt, a running `ng serve` keeps serving the stale pre-bundle (the
 * "reaction schema is undefined at click time" bug). Deleting this cache
 * forces vite to re-optimize from the current sources on every `ng serve`.
 */
const cacheRoot = join(globalThis.process.cwd(), '.angular', 'cache');

function findViteCacheDirs(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.name === 'vite') {
      results.push(full);
    } else {
      results.push(...findViteCacheDirs(full));
    }
  }
  return results;
}

for (const viteDir of findViteCacheDirs(cacheRoot)) {
  rmSync(viteDir, { recursive: true, force: true });
  globalThis.process.stdout.write(`[clear-vite-cache] removed ${viteDir}\n`);
}
