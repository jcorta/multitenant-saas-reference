import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env'), quiet: true });

const root = resolve(__dirname, '..');
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// Reuses a running stack (for example `docker compose up`); otherwise starts the API and the web
// app in development mode against the compose database.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run dev:api',
      cwd: root,
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:web',
      cwd: root,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
