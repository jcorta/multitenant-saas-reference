import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load the repository-level .env and run relative to the repository root so key paths resolve
// the same way for scripts, tests and the API process.
const root = resolve(__dirname, '../../..');
config({ path: resolve(root, '.env') });
process.chdir(root);
