import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Settings page', () => {
  test('renders without crash', async ({ page }) => {
    await page.goto('/settings');
    // page has multiple sections — at least one section title is visible
    await expect(page.locator('.set-card__title').first()).toBeVisible();
  });

  test('Gemini health check shows ok and latency after API responds', async ({ page }) => {
    await page.route('**/health/gemini', (route) =>
      route.fulfill({
        json: { ok: true, configured: true, ms: 145, response: 'ok' },
      }),
    );

    await page.goto('/settings');

    // find the Gemini model card and click its test button
    const geminiCard = page.locator('.model').filter({ hasText: 'Gemini' }).first();
    await geminiCard.getByRole('button', { name: /בדוק/ }).click();

    await expect(geminiCard.getByText('145ms')).toBeVisible({ timeout: 5_000 });
  });

  test('Claude health check shows error state when API returns not ok', async ({ page }) => {
    await page.route('**/health/claude', (route) =>
      route.fulfill({
        json: { ok: false, configured: true, error: 'Invalid API key' },
      }),
    );

    await page.goto('/settings');

    const claudeCard = page.locator('.model').filter({ hasText: 'Claude' }).first();
    await claudeCard.getByRole('button', { name: /בדוק/ }).click();

    await expect(claudeCard.getByText('Invalid API key')).toBeVisible({ timeout: 5_000 });
  });

  test('default summarize picker: unconfigured providers disabled, recommended tagged, saves choice', async ({ page }) => {
    await page.route('**/api/config/status', (route) =>
      route.fulfill({ json: { localMode: true, opal: true, groq: true, gemini: true, claude: true, openai: false } }),
    );
    await page.route('**/api/settings/summarize', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ json: { default: route.request().postDataJSON() } })
        : route.fulfill({ json: { default: { backend: 'claude', model: null } } }),
    );
    await page.route('**/api/models/claude', (route) =>
      route.fulfill({
        json: {
          models: [
            { id: 'claude-haiku-x', name: 'Claude Haiku X', recommended: true },
            { id: 'claude-opus-x', name: 'Claude Opus X', recommended: false },
          ],
        },
      }),
    );

    await page.goto('/settings');
    const box = page.getByTestId('summarize-default');
    // No saved model: the top (recommended) one is preselected.
    await expect(box.getByTestId('model-select')).toHaveText('Claude Haiku X');

    await box.getByTestId('provider-select').click();
    await expect(page.getByRole('option', { name: /OpenAI/ })).toHaveAttribute('data-disabled', '');
    await page.keyboard.press('Escape');

    await box.getByTestId('model-select').click();
    await expect(page.getByRole('option', { name: /Claude Haiku X/ })).toContainText('מומלץ');
    await page.getByRole('option', { name: /Claude Opus X/ }).click();

    const put = page.waitForRequest((r) => r.url().endsWith('/api/settings/summarize') && r.method() === 'PUT');
    await page.getByTestId('save-summarize-default').click();
    expect((await put).postDataJSON()).toEqual({ backend: 'claude', model: 'claude-opus-x' });
    await expect(box.getByText('נשמר')).toBeVisible();
  });

  test('key checklist shows each credential state and the key names from the API', async ({ page }) => {
    await page.route('**/api/config/status', (route) =>
      route.fulfill({
        json: {
          localMode: true, opal: true, groq: false, gemini: false, claude: false, openai: false,
          envKeys: { opal: 'OPENU_X', groq: 'GROQ_X', gemini: 'GEMINI_X', claude: 'CLAUDE_X', openai: 'OPENAI_X' },
          missing: { transcribe: ['GROQ_X'], summarize: ['GEMINI_X', 'CLAUDE_X', 'OPENAI_X'] },
        },
      }),
    );
    await page.goto('/settings');
    await expect(page.getByTestId('cred-opal').getByTestId('cred-state')).toHaveText('✅');
    await expect(page.getByTestId('cred-groq').getByTestId('cred-state')).toHaveText('❌');
    await expect(page.getByTestId('cred-groq')).toContainText('GROQ_X');
  });
});
