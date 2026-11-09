import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  retries: 0,
  use: {
    baseURL: 'http://localhost:3007',
    launchOptions: { executablePath: process.env.CHROME_PATH || undefined },
  },
  webServer: {
    command: 'node src/server.js',
    env: { PORT: '3007' },
    url: 'http://localhost:3007',
    reuseExistingServer: false,
  },
});
