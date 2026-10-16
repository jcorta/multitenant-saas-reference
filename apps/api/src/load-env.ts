import { config } from 'dotenv';
import { resolve } from 'node:path';
import { REPO_ROOT } from './repo-root';

// The repository-level .env is optional: containers receive their configuration as environment
// variables, and values already set in the environment take precedence.
config({ path: resolve(REPO_ROOT, '.env'), quiet: true });
