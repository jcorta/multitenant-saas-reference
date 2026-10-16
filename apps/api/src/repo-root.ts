import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Relative paths (the .env file, JWT keys, migrations) are anchored to the repository root rather
// than the working directory, so the API, scripts and tests resolve them identically whether they
// run from source, from the compiled output, or from a workspace directory.
function findRepoRoot(start: string): string {
  let dir = start;
  while (!existsSync(join(dir, 'package-lock.json'))) {
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
  return dir;
}

export const REPO_ROOT = findRepoRoot(__dirname);
