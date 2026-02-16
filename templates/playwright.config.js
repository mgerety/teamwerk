// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Teamwerk — Playwright Configuration Template
 *
 * Copy this to your project root as playwright.config.js
 * and customize the settings below.
 */

module.exports = defineConfig({
  // Test directory — adjust to match your project structure
  testDir: './tests',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on test.only in CI
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Limit workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporters — JSON for evidence report generation
  reporter: [
    ['list'],
    ['json', { outputFile: 'tests/report/test-results.json' }],
  ],

  use: {
    // Base URL for your application
    baseURL: 'http://localhost:3000',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        // API tests don't need a browser
        // but Playwright's test runner is still useful for organization
      },
    },
  ],

  // Web server — start your app before tests
  // Uncomment and adjust for your project:
  // webServer: {
  //   command: 'npm start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
