import { defineConfig, devices } from '@playwright/test'

// Runs against the production build (service worker included). Set BASE_URL to
// test a deployed copy instead, e.g. a version preview URL:
//   BASE_URL=https://<version>-ben-gen.<subdomain>.workers.dev/ npm run test:e2e
const remote = process.env.BASE_URL

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: remote ?? 'http://localhost:4173/',
    ...devices['Pixel 7'],
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: remote
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: 'http://localhost:4173/',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
