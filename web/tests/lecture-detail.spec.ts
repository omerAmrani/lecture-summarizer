import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';
const CLASS_ID = 'e2e-class';
const LECTURE_ID = 'e2e-lecture';

// Host-agnostic globs: a reused dev server may call 127.0.0.1 instead of localhost.
const STATUS_URL = `**/api/classes/${CLASS_ID}/lectures/${LECTURE_ID}/status`;
const SUMMARIES_URL = `**/api/classes/${CLASS_ID}/lectures/${LECTURE_ID}/summaries`;
const TRANSCRIPT_URL = `**/api/classes/${CLASS_ID}/lectures/${LECTURE_ID}/transcript`;

test.describe('Lecture detail page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(STATUS_URL, (route) =>
      route.fulfill({
        json: { id: LECTURE_ID, name: 'E2E Test Lecture', status: 'pending' },
      }),
    );
    await page.route(SUMMARIES_URL, (route) =>
      route.fulfill({ json: { versions: [], currentSummary: null } }),
    );
    await page.route(TRANSCRIPT_URL, (route) => route.fulfill({ status: 404 }));
  });

  test('header status shows the % of a transcription started elsewhere', async ({ page }) => {
    await page.route(STATUS_URL, (route) =>
      route.fulfill({
        json: { id: LECTURE_ID, name: 'E2E Test Lecture', status: 'transcribing', progress: { message: 'x', pct: 42 } },
      }),
    );
    await page.goto(`/classes/${CLASS_ID}/lectures/${LECTURE_ID}`);
    await expect(page.locator('.lec-h').getByTestId('status-pct')).toHaveText(/42%/);
  });

  test('shows lecture name and no-summary state for a pending lecture', async ({ page }) => {
    await page.goto(`/classes/${CLASS_ID}/lectures/${LECTURE_ID}`);
    await expect(page.locator('h1')).toContainText('E2E Test Lecture');
    await expect(page.getByText('אין סיכום עדיין')).toBeVisible();
    await expect(page.getByTestId('summarize-btn')).toBeVisible();
  });

  test('clicking summarize triggers SSE flow and renders the summary', async ({ page }) => {
    // Pin creds as configured: otherwise the buttons follow whatever .env the reused API has.
    await page.route('**/api/config/status', (route) =>
      route.fulfill({ json: { localMode: true, opal: true, groq: true, gemini: true, claude: true } }),
    );
    await page.route(`**/${LECTURE_ID}/transcribe`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: 'data: {"type":"done","status":"transcribed"}\n\n',
      }),
    );
    await page.route(`**/${LECTURE_ID}/summarize`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: 'data: {"type":"token","token":"Test "}\n\ndata: {"type":"token","token":"summary"}\n\ndata: {"type":"done","summary":"Test summary","status":"summarized"}\n\n',
      }),
    );

    await page.goto(`/classes/${CLASS_ID}/lectures/${LECTURE_ID}`);
    await page.getByTestId('summarize-btn').click();

    await expect(page.getByTestId('summary-body')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('הסיכום הושלם!')).toBeVisible();
  });
});
